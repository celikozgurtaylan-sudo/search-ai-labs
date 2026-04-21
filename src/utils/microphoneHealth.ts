export type DeviceCheckState =
  | 'idle'
  | 'requesting_permission'
  | 'verifying_camera'
  | 'verifying_microphone'
  | 'ready'
  | 'failed';

export type MicFailureCode =
  | 'permission_denied'
  | 'insecure_context'
  | 'device_not_found'
  | 'device_busy'
  | 'track_silent'
  | 'track_ended'
  | 'browser_unsupported'
  | 'unknown';

export interface MicrophoneLevelSample {
  level: number;
  baselineLevel: number;
  threshold: number;
  activeSpeechMs: number;
  elapsedMs: number;
}

export interface MicrophoneHealthResult {
  ok: boolean;
  failureCode: MicFailureCode | null;
  message: string;
  baselineLevel: number;
  peakLevel: number;
  averageLevel: number;
  threshold: number;
  activeSpeechMs: number;
  elapsedMs: number;
}

type MicrophoneHealthProbeOptions = {
  calibrationWindowMs?: number;
  timeoutMs?: number;
  minSpeechMs?: number;
  fftSize?: number;
  smoothingTimeConstant?: number;
  onLevelSample?: (sample: MicrophoneLevelSample) => void;
};

const DEFAULT_GATE_CALIBRATION_MS = 700;
const DEFAULT_GATE_TIMEOUT_MS = 5_000;
const DEFAULT_GATE_MIN_SPEECH_MS = 250;

const calculateRmsLevel = (dataArray: Uint8Array) => {
  let sumSquares = 0;

  for (let index = 0; index < dataArray.length; index += 1) {
    const normalizedSample = (dataArray[index] - 128) / 128;
    sumSquares += normalizedSample * normalizedSample;
  }

  return Math.sqrt(sumSquares / dataArray.length) * 100;
};

export const getGateSpeechThreshold = (baselineLevel: number) =>
  Math.max(2.0, baselineLevel * 1.8 + 0.5);

export const getTranscriberEnterThreshold = (baselineLevel: number) =>
  Math.max(3.0, baselineLevel * 2.2 + 0.8);

export const getTranscriberStayThreshold = (baselineLevel: number) =>
  Math.max(1.6, baselineLevel * 1.5 + 0.4);

export const mapMediaAccessErrorToFailureCode = (error: unknown): MicFailureCode => {
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return 'insecure_context';
  }

  const errorName = error instanceof DOMException ? error.name : '';

  if (['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(errorName)) {
    return 'permission_denied';
  }

  if (['NotFoundError', 'DevicesNotFoundError', 'OverconstrainedError'].includes(errorName)) {
    return 'device_not_found';
  }

  if (['NotReadableError', 'TrackStartError', 'AbortError'].includes(errorName)) {
    return 'device_busy';
  }

  return 'unknown';
};

export const getMicrophoneFailureMessage = (code: MicFailureCode) => {
  switch (code) {
    case 'permission_denied':
      return 'Tarayici kamera veya mikrofon iznini vermedi. Arastirmaya girebilmek icin bu izinleri acmaniz gerekiyor.';
    case 'insecure_context':
      return 'Bu sayfa guvenli baglamda acilmadi. Kamera ve mikrofon yalnizca HTTPS veya localhost uzerinde acilabilir.';
    case 'device_not_found':
      return 'Kamera veya mikrofon bulunamadi. Cihazinizi baglayip tekrar deneyin.';
    case 'device_busy':
      return 'Kamera veya mikrofon baska bir uygulama tarafindan kullaniliyor olabilir. Diger uygulamalari kapatip tekrar deneyin.';
    case 'track_silent':
      return 'Mikrofon acildi ama ses sinyali algilanmadi. Mikrofon seciminizi kontrol edin ve kisa bir cumle soyleyerek tekrar deneyin.';
    case 'track_ended':
      return 'Mikrofon baglantisi kesildi. Cihazinizi yeniden baglayip tekrar deneyin.';
    case 'browser_unsupported':
      return 'Bu tarayici kamera veya mikrofon akisini desteklemiyor. Guncel Chrome, Edge veya Safari kullanin.';
    default:
      return 'Kamera ve mikrofon dogrulanamadi. Lutfen tekrar deneyin.';
  }
};

export const probeMicrophoneHealth = async (
  stream: MediaStream,
  options: MicrophoneHealthProbeOptions = {},
): Promise<MicrophoneHealthResult> => {
  const audioTrack = stream.getAudioTracks()[0];
  if (!audioTrack || audioTrack.readyState !== 'live' || audioTrack.enabled === false) {
    return {
      ok: false,
      failureCode: 'track_ended',
      message: getMicrophoneFailureMessage('track_ended'),
      baselineLevel: 0,
      peakLevel: 0,
      averageLevel: 0,
      threshold: getGateSpeechThreshold(0),
      activeSpeechMs: 0,
      elapsedMs: 0,
    };
  }

  const calibrationWindowMs = options.calibrationWindowMs ?? DEFAULT_GATE_CALIBRATION_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_GATE_TIMEOUT_MS;
  const minSpeechMs = options.minSpeechMs ?? DEFAULT_GATE_MIN_SPEECH_MS;
  const fftSize = options.fftSize ?? 1024;
  const smoothingTimeConstant = options.smoothingTimeConstant ?? 0.2;
  const scopedStream = new MediaStream([audioTrack]);
  const audioContext = new AudioContext();
  let animationFrameId: number | null = null;

  try {
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    const source = audioContext.createMediaStreamSource(scopedStream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = fftSize;
    analyser.smoothingTimeConstant = smoothingTimeConstant;
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.fftSize);

    return await new Promise<MicrophoneHealthResult>((resolve) => {
      const startedAt = performance.now();
      let peakLevel = 0;
      let totalLevel = 0;
      let levelSampleCount = 0;
      let calibrationTotal = 0;
      let calibrationSamples = 0;
      let activeSpeechMs = 0;
      let lastTimestamp = startedAt;

      const finish = (ok: boolean, failureCode: MicFailureCode | null, elapsedMs: number) => {
        if (animationFrameId !== null) {
          window.cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
        }

        const baselineLevel = calibrationSamples > 0 ? calibrationTotal / calibrationSamples : 0;
        const threshold = getGateSpeechThreshold(baselineLevel);
        const averageLevel = levelSampleCount > 0 ? totalLevel / levelSampleCount : 0;

        resolve({
          ok,
          failureCode,
          message: ok ? 'Mikrofon sinyali dogrulandi.' : getMicrophoneFailureMessage(failureCode ?? 'unknown'),
          baselineLevel,
          peakLevel,
          averageLevel,
          threshold,
          activeSpeechMs,
          elapsedMs,
        });
      };

      const sample = (now: number) => {
        const elapsedMs = now - startedAt;
        const liveTrack = stream.getAudioTracks()[0];

        if (!liveTrack || liveTrack.readyState !== 'live' || liveTrack.enabled === false) {
          finish(false, 'track_ended', elapsedMs);
          return;
        }

        analyser.getByteTimeDomainData(dataArray);
        const level = calculateRmsLevel(dataArray);
        const deltaMs = Math.max(16, Math.min(160, now - lastTimestamp));
        lastTimestamp = now;

        peakLevel = Math.max(peakLevel, level);
        totalLevel += level;
        levelSampleCount += 1;

        if (elapsedMs <= calibrationWindowMs) {
          calibrationTotal += level;
          calibrationSamples += 1;
        }

        const baselineLevel = calibrationSamples > 0 ? calibrationTotal / calibrationSamples : level;
        const threshold = getGateSpeechThreshold(baselineLevel);

        if (elapsedMs > calibrationWindowMs && level >= threshold) {
          activeSpeechMs += deltaMs;
        }

        options.onLevelSample?.({
          level,
          baselineLevel,
          threshold,
          activeSpeechMs,
          elapsedMs,
        });

        if (activeSpeechMs >= minSpeechMs) {
          finish(true, null, elapsedMs);
          return;
        }

        if (elapsedMs >= timeoutMs) {
          finish(false, 'track_silent', elapsedMs);
          return;
        }

        animationFrameId = window.requestAnimationFrame(sample);
      };

      animationFrameId = window.requestAnimationFrame(sample);
    });
  } finally {
    await audioContext.close().catch(() => undefined);
  }
};
