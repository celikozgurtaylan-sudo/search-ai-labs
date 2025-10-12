import { supabase } from "@/integrations/supabase/client";

export interface TTSSentence {
  text: string;
  index: number;
  audioData?: string;
}

/**
 * Split text into sentences for sequential TTS playback
 */
export const splitIntoSentences = (text: string): TTSSentence[] => {
  // Split by periods, question marks, and exclamation points, keeping punctuation
  const parts = text.split(/([.!?]+)/);
  const sentences: TTSSentence[] = [];
  
  for (let i = 0; i < parts.length; i += 2) {
    const sentence = parts[i]?.trim();
    const punctuation = parts[i + 1] || '';
    
    if (sentence && sentence.length > 0) {
      sentences.push({
        text: sentence + punctuation,
        index: sentences.length,
      });
    }
  }
  
  return sentences;
};

/**
 * Convert text to speech using ElevenLabs via edge function
 */
export const textToSpeech = async (text: string): Promise<ArrayBuffer> => {
  try {
    const { data, error } = await supabase.functions.invoke('text-to-speech', {
      body: { text },
    });

    if (error) throw error;
    
    if (!data?.audioContent) {
      throw new Error('No audio content received');
    }

    // Convert base64 to ArrayBuffer
    const binaryString = atob(data.audioContent);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    return bytes.buffer;
  } catch (error) {
    console.error('TTS error:', error);
    throw error;
  }
};

/**
 * Play audio from ArrayBuffer
 */
export const playAudio = async (
  audioBuffer: ArrayBuffer,
  audioContext: AudioContext
): Promise<void> => {
  return new Promise(async (resolve, reject) => {
    try {
      const decodedData = await audioContext.decodeAudioData(audioBuffer);
      const source = audioContext.createBufferSource();
      source.buffer = decodedData;
      source.connect(audioContext.destination);
      
      source.onended = () => resolve();
      source.start(0);
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Speak sentences sequentially with auto-advance
 */
export class SequentialTTS {
  private sentences: TTSSentence[] = [];
  private currentIndex: number = 0;
  private audioContext: AudioContext | null = null;
  private isPlaying: boolean = false;
  private isPaused: boolean = false;
  
  onSentenceStart?: (sentence: TTSSentence) => void;
  onSentenceEnd?: (sentence: TTSSentence) => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;

  constructor(text: string) {
    this.sentences = splitIntoSentences(text);
  }

  async start() {
    if (this.isPlaying) return;
    
    this.isPlaying = true;
    this.isPaused = false;
    this.currentIndex = 0;
    
    // Initialize AudioContext
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    
    // Resume if suspended
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
    
    await this.playNextSentence();
  }

  private async playNextSentence() {
    if (this.isPaused || !this.isPlaying) return;
    
    if (this.currentIndex >= this.sentences.length) {
      this.isPlaying = false;
      this.onComplete?.();
      return;
    }

    const sentence = this.sentences[this.currentIndex];
    this.onSentenceStart?.(sentence);

    try {
      const audioBuffer = await textToSpeech(sentence.text);
      
      if (this.isPaused || !this.isPlaying) return;
      
      await playAudio(audioBuffer, this.audioContext!);
      
      this.onSentenceEnd?.(sentence);
      this.currentIndex++;
      
      // Auto-advance to next sentence
      await this.playNextSentence();
    } catch (error) {
      console.error('Error playing sentence:', error);
      this.onError?.(error as Error);
      this.stop();
    }
  }

  pause() {
    this.isPaused = true;
  }

  resume() {
    if (!this.isPaused) return;
    this.isPaused = false;
    this.playNextSentence();
  }

  stop() {
    this.isPlaying = false;
    this.isPaused = false;
    this.currentIndex = 0;
  }

  getCurrentSentence(): TTSSentence | null {
    return this.sentences[this.currentIndex] || null;
  }

  getSentences(): TTSSentence[] {
    return this.sentences;
  }

  getTotalSentences(): number {
    return this.sentences.length;
  }

  getCurrentIndex(): number {
    return this.currentIndex;
  }
}
