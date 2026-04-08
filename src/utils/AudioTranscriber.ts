import { supabase } from "@/integrations/supabase/client";

const CALIBRATION_WINDOW_MS = 450;
const MAX_WAIT_FOR_SPEECH_MS = 5000;
const SILENCE_AFTER_SPEECH_MS = 2200;
const MIN_RECORDING_MS = 750;
const MIN_AUDIO_BLOB_SIZE = 6000;
const MIN_SPEECH_FRAMES = 2;
const ABSOLUTE_ENTER_THRESHOLD = 4.2;
const ABSOLUTE_STAY_THRESHOLD = 2.2;
const SOFT_STAY_THRESHOLD_RATIO = 0.72;
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

export interface AudioTranscriberMetrics {
  averageLevel: number;
  calibrationLevel: number;
  peakLevel: number;
  recordingDurationMs: number;
  speechDetected: boolean;
  stopReason: 'manual' | 'speech-ended' | 'no-speech' | 'cancelled';
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
  private lastVoiceActivityAt = 0;
  private analysisFrameId: number | null = null;
  private stopReason: 'manual' | 'speech-ended' | 'no-speech' | 'cancelled' = 'manual';

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
      this.lastVoiceActivityAt = this.recordingStartedAt;
      this.stopReason = 'manual';
      this.discardRecording = false;

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
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

  private finish(reason: 'manual' | 'speech-ended' | 'no-speech' | 'cancelled') {
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
      const level = this.calculateRmsLevel(dataArray);

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
      const enterThreshold = Math.max(ABSOLUTE_ENTER_THRESHOLD, calibrationLevel * 2.6 + 1.2);
      const stayThreshold = Math.max(ABSOLUTE_STAY_THRESHOLD, calibrationLevel * 1.9 + 0.7);

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

      if (this.speechDetected && now - this.lastVoiceActivityAt >= SILENCE_AFTER_SPEECH_MS) {
        this.finish('speech-ended');
        return;
      }

      if (!this.speechDetected && elapsed >= MAX_WAIT_FOR_SPEECH_MS) {
        this.finish('no-speech');
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

    if (this.audioChunks.length === 0) {
      this.onError('NO_SPEECH_DETECTED');
      return;
    }

    try {
      const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
      const averageLevel = this.levelSampleCount > 0 ? this.totalLevel / this.levelSampleCount : 0;

      if (
        this.stopReason === 'no-speech' ||
        !this.speechDetected ||
        recordingDuration < MIN_RECORDING_MS ||
        audioBlob.size < MIN_AUDIO_BLOB_SIZE ||
        this.peakLevel < ABSOLUTE_ENTER_THRESHOLD ||
        averageLevel < 1.6
      ) {
        this.onError('NO_SPEECH_DETECTED');
        return;
      }

      const base64Audio = await this.blobToBase64(audioBlob);
      const { data, error } = await supabase.functions.invoke('speech-to-text', {
        body: {
          audio: base64Audio,
          language: 'tr',
        },
      });

      if (error) {
        console.error('Transcription error:', error);
        this.onError('Transcription failed');
        return;
      }

      const transcript = typeof data?.text === 'string' ? data.text.trim() : '';

      if (!transcript) {
        this.onError('NO_SPEECH_DETECTED');
        return;
      }

      const isHallucination = HALLUCINATION_PATTERNS.some((pattern) => pattern.test(transcript));
      if (isHallucination) {
        console.warn('Ignoring likely hallucinated transcription:', transcript);
        this.onError('NO_SPEECH_DETECTED');
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
