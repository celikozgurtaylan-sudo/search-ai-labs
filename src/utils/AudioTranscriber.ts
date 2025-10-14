import { supabase } from "@/integrations/supabase/client";

export class AudioTranscriber {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private silenceTimer: NodeJS.Timeout | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private isRecording = false;

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

      // If volume is below threshold, start silence timer
      if (average < 10) {
        if (!this.silenceTimer) {
          this.silenceTimer = setTimeout(() => {
            this.stop();
          }, 1500); // 1.5 seconds of silence
        }
      } else {
        // Cancel silence timer if sound detected
        if (this.silenceTimer) {
          clearTimeout(this.silenceTimer);
          this.silenceTimer = null;
        }
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
      this.onError('No audio recorded');
      return;
    }

    try {
      // Combine chunks into single blob
      const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
      
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

      if (data?.text) {
        this.onComplete(data.text);
      } else {
        this.onError('No transcription received');
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
