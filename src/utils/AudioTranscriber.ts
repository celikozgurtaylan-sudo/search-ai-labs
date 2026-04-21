import { supabase } from "@/integrations/supabase/client";
import {
  getTranscriberEnterThreshold,
  getTranscriberStayThreshold,
} from "@/utils/microphoneHealth";

const CALIBRATION_WINDOW_MS = 450;
const MAX_WAIT_FOR_SPEECH_MS = 10000;
const MIN_RECORDING_MS = 750;
const MIN_AUDIO_BLOB_SIZE = 6000;
const MIN_SPEECH_FRAMES = 2;
const SOFT_STAY_THRESHOLD_RATIO = 0.72;
const CHUNK_STALL_AFTER_SPEECH_MS = 2500;
const HALLUCINATION_PATTERNS = [
  /abone ol/i,
  /yorum yap/i,
  /begen buton/i,
  /beğen buton/i,
  /altyazi/i,
  /altyazı/i,
  /altyaz[iı] by/i,
  /kanal[iı]m[ıi]za/i,
  /bildirim zil/i,
];

type SpeechToTextErrorPayload = {
  error?: string;
  code?: string;
};

const readSpeechToTextErrorPayload = async (response?: Response): Promise<SpeechToTextErrorPayload | null> => {
  if (!response) {
    return null;
  }

  try {
    const contentType = response.headers.get('Content-Type')?.split(';')[0].trim();
    if (contentType !== 'application/json') {
      return null;
    }

    const payload = await response.clone().json();
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    return {
      error: typeof payload.error === 'string' ? payload.error : undefined,
      code: typeof payload.code === 'string' ? payload.code : undefined,
    };
  } catch {
    return null;
  }
};

export interface AudioTranscriberMetrics {
  averageLevel: number;
  calibrationLevel: number;
  peakLevel: number;
  recordingDurationMs: number;
  speechDetected: boolean;
  stopReason: 'manual' | 'no-speech' | 'cancelled' | 'health-failure';
}

export class AudioTranscriber {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private isRecording = false;
  private ownsStream = false;
  private discardRecording = false;
  private recordingStartedAt = 0;
  private speechDetected = false;
  private speechFrameCount = 0;
  private peakLevel = 0;
  private totalLevel = 0;
  private levelSampleCount = 0;
  private calibrationTotal = 0;
  private calibrationSamples = 0;
  private lastCalibrationLevel = 0;
  private lastVoiceActivityAt = 0;
  private lastChunkAt = 0;
  private analysisFrameId: number | null = null;
  private stopReason: 'manual' | 'no-speech' | 'cancelled' | 'health-failure' = 'manual';
  private forcedErrorCode: string | null = null;

  onTranscriptionUpdate: (text: string) => void = () => {};
  onSpeechDetected: () => void = () => {};
  onComplete: (text: string) => void = () => {};
  onError: (error: string) => void = () => {};
  onDebugMetrics: (metrics: AudioTranscriberMetrics) => void = () => {};

  async start(stream?: MediaStream) {
    try {
      if (stream) {
        this.stream = stream;
        this.ownsStream = false;
      } else {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        this.ownsStream = true;
      }

      this.audioContext = new AudioContext();
      const source = this.audioContext.createMediaStreamSource(this.stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.15;
      source.connect(this.analyser);

      const preferredMimeType = typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      this.mediaRecorder = new MediaRecorder(this.stream, { mimeType: preferredMimeType });
      this.audioChunks = [];
      this.recordingStartedAt = performance.now();
      this.speechDetected = false;
      this.speechFrameCount = 0;
      this.peakLevel = 0;
      this.totalLevel = 0;
      this.levelSampleCount = 0;
      this.calibrationTotal = 0;
      this.calibrationSamples = 0;
      this.lastCalibrationLevel = 0;
      this.lastVoiceActivityAt = this.recordingStartedAt;
      this.lastChunkAt = this.recordingStartedAt;
      this.stopReason = 'manual';
      this.discardRecording = false;
      this.forcedErrorCode = null;

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
          this.lastChunkAt = performance.now();
        }
      };

      this.mediaRecorder.onstop = async () => {
        await this.processAudio();
      };

      this.mediaRecorder.start(120);
      this.isRecording = true;
      this.detectSpeech();
    } catch (error) {
      console.error('Error starting transcriber:', error);
      this.onError(error instanceof Error ? error.message : 'Failed to start recording');
    }
  }

  stop() {
    this.finish('manual');
  }

  cancel() {
    this.discardRecording = true;
    this.finish('cancelled');
  }

  reportHealthIssue(errorCode = 'RECORDING_HEALTH_FAILURE') {
    if (!this.isRecording) {
      return;
    }

    this.forcedErrorCode = errorCode;
    this.finish('health-failure');
  }

  private finish(reason: 'manual' | 'no-speech' | 'cancelled' | 'health-failure') {
    if (!this.isRecording) {
      return;
    }

    this.isRecording = false;
    this.stopReason = reason;

    if (this.analysisFrameId !== null) {
      window.cancelAnimationFrame(this.analysisFrameId);
      this.analysisFrameId = null;
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }

    if (this.audioContext) {
      void this.audioContext.close();
      this.audioContext = null;
    }

    if (this.ownsStream && this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
  }

  private detectSpeech() {
    if (!this.analyser || !this.isRecording) return;

    const bufferLength = this.analyser.fftSize;
    const dataArray = new Uint8Array(bufferLength);

    const sample = () => {
      if (!this.analyser || !this.isRecording) return;

      this.analyser.getByteTimeDomainData(dataArray);
      const now = performance.now();
      const elapsed = now - this.recordingStartedAt;
      const hasLiveAudioTrack = this.stream?.getAudioTracks().some((track) => track.readyState === 'live' && track.enabled !== false) ?? false;
      const level = this.calculateRmsLevel(dataArray);

      if (!hasLiveAudioTrack) {
        this.reportHealthIssue('MICROPHONE_DISCONNECTED');
        return;
      }

      this.totalLevel += level;
      this.levelSampleCount += 1;
      this.peakLevel = Math.max(this.peakLevel, level);

      if (elapsed <= CALIBRATION_WINDOW_MS) {
        this.calibrationTotal += level;
        this.calibrationSamples += 1;
      }

      const calibrationLevel = this.calibrationSamples > 0
        ? this.calibrationTotal / this.calibrationSamples
        : 0;
      const enterThreshold = getTranscriberEnterThreshold(calibrationLevel);
      const stayThreshold = getTranscriberStayThreshold(calibrationLevel);
      this.lastCalibrationLevel = calibrationLevel;

      if (level >= enterThreshold) {
        this.speechFrameCount += 1;
      } else {
        this.speechFrameCount = Math.max(0, this.speechFrameCount - 1);
      }

      if (!this.speechDetected && this.speechFrameCount >= MIN_SPEECH_FRAMES) {
        this.speechDetected = true;
        this.lastVoiceActivityAt = now;
        this.onSpeechDetected();
      }

      if (this.speechDetected && level >= stayThreshold) {
        this.lastVoiceActivityAt = now;
      } else if (this.speechDetected && level >= stayThreshold * SOFT_STAY_THRESHOLD_RATIO) {
        // Treat near-threshold speech as active so short reflective pauses do not cut the user off.
        this.lastVoiceActivityAt = now;
      }

      if (!this.speechDetected && elapsed >= MAX_WAIT_FOR_SPEECH_MS) {
        const averageLevel = this.levelSampleCount > 0 ? this.totalLevel / this.levelSampleCount : 0;
        const trackLooksSilent =
          this.peakLevel < Math.max(1.8, enterThreshold * 0.8) &&
          averageLevel < Math.max(1.1, calibrationLevel + 0.45);

        this.forcedErrorCode = trackLooksSilent ? 'MICROPHONE_SILENT' : null;
        this.finish('no-speech');
        return;
      }

      if (this.speechDetected && now - this.lastChunkAt >= CHUNK_STALL_AFTER_SPEECH_MS) {
        this.reportHealthIssue('RECORDING_HEALTH_FAILURE');
        return;
      }

      if (this.isRecording) {
        this.analysisFrameId = window.requestAnimationFrame(sample);
      }
    };

    this.analysisFrameId = window.requestAnimationFrame(sample);
  }

  private calculateRmsLevel(dataArray: Uint8Array) {
    let sumSquares = 0;

    for (let i = 0; i < dataArray.length; i++) {
      const normalizedSample = (dataArray[i] - 128) / 128;
      sumSquares += normalizedSample * normalizedSample;
    }

    return Math.sqrt(sumSquares / dataArray.length) * 100;
  }

  private emitMetrics(recordingDuration: number) {
    this.onDebugMetrics({
      averageLevel: this.levelSampleCount > 0 ? this.totalLevel / this.levelSampleCount : 0,
      calibrationLevel: this.calibrationSamples > 0 ? this.calibrationTotal / this.calibrationSamples : 0,
      peakLevel: this.peakLevel,
      recordingDurationMs: recordingDuration,
      speechDetected: this.speechDetected,
      stopReason: this.stopReason,
    });
  }

  private async processAudio() {
    const recordingDuration = performance.now() - this.recordingStartedAt;
    this.emitMetrics(recordingDuration);

    if (this.discardRecording || this.stopReason === 'cancelled') {
      return;
    }

    if (this.stopReason === 'health-failure') {
      this.onError(this.forcedErrorCode ?? 'RECORDING_HEALTH_FAILURE');
      return;
    }

    if (this.stopReason === 'no-speech') {
      this.onError(this.forcedErrorCode ?? 'PREP_TIMEOUT');
      return;
    }

    if (this.audioChunks.length === 0) {
      this.onError('NO_SPEECH_DETECTED');
      return;
    }

    try {
      const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
      const averageLevel = this.levelSampleCount > 0 ? this.totalLevel / this.levelSampleCount : 0;

      if (
        !this.speechDetected ||
        recordingDuration < MIN_RECORDING_MS ||
        audioBlob.size < MIN_AUDIO_BLOB_SIZE ||
        this.peakLevel < Math.max(2.2, getTranscriberEnterThreshold(this.lastCalibrationLevel) * 0.8) ||
        averageLevel < Math.max(1.1, this.lastCalibrationLevel + 0.35)
      ) {
        this.onError('NO_SPEECH_DETECTED');
        return;
      }

      const base64Audio = await this.blobToBase64(audioBlob);
      const { data, error, response } = await supabase.functions.invoke('speech-to-text', {
        body: {
          audio: base64Audio,
          language: 'tr',
        },
      });

      const errorPayload = await readSpeechToTextErrorPayload(response);
      const errorCode = errorPayload?.code || (typeof data?.code === 'string' ? data.code : null);

      if (error || errorCode === 'transcription_timeout') {
        console.error('Transcription error:', error || errorPayload);
        this.onError(errorCode === 'transcription_timeout' ? 'TRANSCRIPTION_TIMEOUT' : 'TRANSCRIPTION_FAILED');
        return;
      }

      const transcript = typeof data?.text === 'string' ? data.text.trim() : '';

      if (!transcript) {
        this.onError(errorCode === 'empty_transcript' ? 'TRANSCRIPTION_EMPTY' : 'TRANSCRIPTION_FAILED');
        return;
      }

      const isHallucination = HALLUCINATION_PATTERNS.some((pattern) => pattern.test(transcript));
      if (isHallucination) {
        console.warn('Ignoring likely hallucinated transcription:', transcript);
        this.onError('TRANSCRIPTION_FAILED');
        return;
      }

      this.onComplete(transcript);
    } catch (error) {
      console.error('Error processing audio:', error);
      this.onError(error instanceof Error ? error.message : 'Failed to process audio');
    }
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}
