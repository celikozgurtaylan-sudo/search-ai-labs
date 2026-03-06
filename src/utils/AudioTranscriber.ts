import { supabase } from "@/integrations/supabase/client";

const MIN_SPEECH_LEVEL = 14;
const MIN_SPEECH_FRAMES = 4;
const MAX_WAIT_FOR_SPEECH_MS = 5000;
const SILENCE_AFTER_SPEECH_MS = 1800;
const MIN_RECORDING_MS = 1200;
const MIN_AUDIO_BLOB_SIZE = 12000;
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

export class AudioTranscriber {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private silenceTimer: NodeJS.Timeout | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private isRecording = false;
  private recordingStartedAt = 0;
  private speechDetected = false;
  private speechFrameCount = 0;
  private peakLevel = 0;
  private totalLevel = 0;
  private levelSampleCount = 0;
  private stopReason: 'manual' | 'speech-ended' | 'no-speech' = 'manual';

  onTranscriptionUpdate: (text: string) => void = () => {};
  onComplete: (text: string) => void = () => {};
  onError: (error: string) => void = () => {};

  async start() {
    try {
      // Get microphone access
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      // Set up audio analysis for silence detection
      this.audioContext = new AudioContext();
      const source = this.audioContext.createMediaStreamSource(this.stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;
      source.connect(this.analyser);

      // Start recording
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: 'audio/webm'
      });

      this.audioChunks = [];
      this.recordingStartedAt = performance.now();
      this.speechDetected = false;
      this.speechFrameCount = 0;
      this.peakLevel = 0;
      this.totalLevel = 0;
      this.levelSampleCount = 0;
      this.stopReason = 'manual';

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        await this.processAudio();
      };

      this.mediaRecorder.start(100); // Collect data every 100ms
      this.isRecording = true;

      // Start silence detection
      this.detectSilence();
    } catch (error) {
      console.error('Error starting transcriber:', error);
      this.onError(error instanceof Error ? error.message : 'Failed to start recording');
    }
  }

  private detectSilence() {
    if (!this.analyser || !this.isRecording) return;

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    const checkAudioLevel = () => {
      if (!this.analyser || !this.isRecording) return;

      this.analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / bufferLength;
      const elapsed = performance.now() - this.recordingStartedAt;

      this.totalLevel += average;
      this.levelSampleCount += 1;
      this.peakLevel = Math.max(this.peakLevel, average);

      if (average >= MIN_SPEECH_LEVEL) {
        this.speechFrameCount += 1;
      } else {
        this.speechFrameCount = Math.max(0, this.speechFrameCount - 1);
      }

      if (!this.speechDetected && this.speechFrameCount >= MIN_SPEECH_FRAMES) {
        this.speechDetected = true;
      }

      // If volume is below threshold after speech has started, start silence timer.
      if (this.speechDetected && average < MIN_SPEECH_LEVEL) {
        if (!this.silenceTimer) {
          this.silenceTimer = setTimeout(() => {
            this.stopReason = 'speech-ended';
            this.stop();
          }, SILENCE_AFTER_SPEECH_MS);
        }
      } else {
        // Cancel silence timer if sound detected
        if (this.silenceTimer) {
          clearTimeout(this.silenceTimer);
          this.silenceTimer = null;
        }
      }

      if (!this.speechDetected && elapsed >= MAX_WAIT_FOR_SPEECH_MS) {
        this.stopReason = 'no-speech';
        this.stop();
        return;
      }

      // Continue checking
      if (this.isRecording) {
        requestAnimationFrame(checkAudioLevel);
      }
    };

    checkAudioLevel();
  }

  stop() {
    this.isRecording = false;

    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
    }

    if (this.audioContext) {
      this.audioContext.close();
    }
  }

  private async processAudio() {
    if (this.audioChunks.length === 0) {
      this.onError('NO_SPEECH_DETECTED');
      return;
    }

    try {
      // Combine chunks into single blob
      const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
      const recordingDuration = performance.now() - this.recordingStartedAt;
      const averageLevel = this.levelSampleCount > 0 ? this.totalLevel / this.levelSampleCount : 0;

      if (
        this.stopReason === 'no-speech' ||
        !this.speechDetected ||
        recordingDuration < MIN_RECORDING_MS ||
        audioBlob.size < MIN_AUDIO_BLOB_SIZE ||
        this.peakLevel < MIN_SPEECH_LEVEL ||
        averageLevel < 4
      ) {
        this.onError('NO_SPEECH_DETECTED');
        return;
      }
      
      // Convert to base64
      const base64Audio = await this.blobToBase64(audioBlob);

      // Send to speech-to-text edge function
      const { data, error } = await supabase.functions.invoke('speech-to-text', {
        body: {
          audio: base64Audio,
          language: 'tr'
        }
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

      if (transcript) {
        this.onComplete(transcript);
      } else {
        this.onError('NO_SPEECH_DETECTED');
      }
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
