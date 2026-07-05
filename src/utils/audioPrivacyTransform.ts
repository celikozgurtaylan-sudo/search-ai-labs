export const AUDIO_PRIVACY_TRANSFORM = {
  algorithm: "pitch_shift_v1",
  semitoneShift: 4,
  rawAudioStored: false,
  videoStored: false,
} as const;

export type AudioPrivacyTransform = typeof AUDIO_PRIVACY_TRANSFORM;

const clampSample = (sample: number) => Math.max(-1, Math.min(1, sample));

const encodeWav = (audioBuffer: AudioBuffer) => {
  const channelCount = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const samplesPerChannel = audioBuffer.length;
  const bytesPerSample = 2;
  const blockAlign = channelCount * bytesPerSample;
  const dataSize = samplesPerChannel * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  let offset = 0;

  const writeString = (value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
    offset += value.length;
  };

  writeString("RIFF");
  view.setUint32(offset, 36 + dataSize, true);
  offset += 4;
  writeString("WAVE");
  writeString("fmt ");
  view.setUint32(offset, 16, true);
  offset += 4;
  view.setUint16(offset, 1, true);
  offset += 2;
  view.setUint16(offset, channelCount, true);
  offset += 2;
  view.setUint32(offset, sampleRate, true);
  offset += 4;
  view.setUint32(offset, sampleRate * blockAlign, true);
  offset += 4;
  view.setUint16(offset, blockAlign, true);
  offset += 2;
  view.setUint16(offset, bytesPerSample * 8, true);
  offset += 2;
  writeString("data");
  view.setUint32(offset, dataSize, true);
  offset += 4;

  for (let sampleIndex = 0; sampleIndex < samplesPerChannel; sampleIndex += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const sample = clampSample(audioBuffer.getChannelData(channel)[sampleIndex] ?? 0);
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += bytesPerSample;
    }
  }

  return new Blob([buffer], { type: "audio/wav" });
};

export const pitchShiftAudioForEvidence = async (
  inputBlob: Blob,
  semitoneShift = AUDIO_PRIVACY_TRANSFORM.semitoneShift,
) => {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass || typeof OfflineAudioContext === "undefined") {
    throw new Error("Web Audio pitch shift is not supported in this browser");
  }

  const sourceContext = new AudioContextClass();
  try {
    const inputBuffer = await sourceContext.decodeAudioData(await inputBlob.arrayBuffer());
    const playbackRate = 2 ** (semitoneShift / 12);
    const outputLength = Math.max(1, Math.ceil(inputBuffer.length / playbackRate));
    const offlineContext = new OfflineAudioContext(
      inputBuffer.numberOfChannels,
      outputLength,
      inputBuffer.sampleRate,
    );
    const source = offlineContext.createBufferSource();

    source.buffer = inputBuffer;
    source.playbackRate.value = playbackRate;
    source.connect(offlineContext.destination);
    source.start(0);

    const shiftedBuffer = await offlineContext.startRendering();
    return {
      blob: encodeWav(shiftedBuffer),
      durationMs: (shiftedBuffer.duration || inputBuffer.duration / playbackRate) * 1000,
      mimeType: "audio/wav",
      transform: AUDIO_PRIVACY_TRANSFORM,
    };
  } finally {
    if (sourceContext.state !== "closed") {
      await sourceContext.close();
    }
  }
};

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
