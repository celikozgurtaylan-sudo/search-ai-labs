import { supabase } from "@/integrations/supabase/client";

export interface TTSSentence {
  text: string;
  index: number;
  audioData?: string;
}

const MAX_CACHE_ENTRIES = 16;
const audioCache = new Map<string, ArrayBuffer>();
const inFlightRequests = new Map<string, Promise<ArrayBuffer>>();

const cloneBuffer = (buffer: ArrayBuffer) => buffer.slice(0);

const rememberAudio = (text: string, audioBuffer: ArrayBuffer) => {
  if (audioCache.has(text)) {
    audioCache.delete(text);
  }

  audioCache.set(text, audioBuffer);

  while (audioCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = audioCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    audioCache.delete(oldestKey);
  }
};

const decodeAudio = (audioContent: string) => {
  const binaryString = atob(audioContent);
  const bytes = new Uint8Array(binaryString.length);

  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return bytes.buffer;
};

const readFunctionErrorMessage = async (response?: Response) => {
  if (!response) return null;

  try {
    const contentType = response.headers.get("Content-Type")?.split(";")[0].trim();
    const responseClone = response.clone();

    if (contentType === "application/json") {
      const payload = await responseClone.json();
      if (typeof payload?.error === "string" && payload.error.trim()) {
        const codeSuffix = typeof payload?.code === "string" ? ` [${payload.code}]` : "";
        return `${payload.error}${codeSuffix}`;
      }
    }

    const responseText = await responseClone.text();
    return responseText.trim() || null;
  } catch {
    return null;
  }
};

const formatFunctionError = async (error: unknown, response?: Response) => {
  const fallbackMessage = error instanceof Error ? error.message : "Unknown TTS error";
  const detailedMessage = await readFunctionErrorMessage(response);

  if (detailedMessage) {
    return `Turkish TTS request failed (${response?.status ?? "unknown"}): ${detailedMessage}`;
  }

  if (response?.status) {
    return `Turkish TTS request failed (${response.status}): ${fallbackMessage}`;
  }

  return `Turkish TTS request failed: ${fallbackMessage}`;
};

const loadTextToSpeech = async (text: string): Promise<ArrayBuffer> => {
  const normalizedText = text.trim();
  if (!normalizedText) {
    throw new Error('Cannot synthesize empty text');
  }

  const cachedAudio = audioCache.get(normalizedText);
  if (cachedAudio) {
    return cloneBuffer(cachedAudio);
  }

  const existingRequest = inFlightRequests.get(normalizedText);
  if (existingRequest) {
    return cloneBuffer(await existingRequest);
  }

  const request = (async () => {
    const { data, error, response } = await supabase.functions.invoke('turkish-tts', {
      body: { text: normalizedText },
    });

    if (error) {
      throw new Error(await formatFunctionError(error, response));
    }

    if (!data?.audioContent) {
      throw new Error('No audio content received');
    }

    if (data?.source && data.source !== 'elevenlabs') {
      throw new Error(`Unexpected TTS provider: ${data.source}`);
    }

    const audioBuffer = decodeAudio(data.audioContent);
    rememberAudio(normalizedText, audioBuffer);
    return audioBuffer;
  })();

  inFlightRequests.set(normalizedText, request);

  try {
    return cloneBuffer(await request);
  } finally {
    inFlightRequests.delete(normalizedText);
  }
};

export const splitIntoSentences = (text: string): TTSSentence[] => {
  const parts = text.split(/([.!?]+)/);
  const sentences: TTSSentence[] = [];

  for (let i = 0; i < parts.length; i += 2) {
    const sentence = parts[i]?.trim();
    const punctuation = parts[i + 1] || '';

    if (sentence) {
      sentences.push({
        text: sentence + punctuation,
        index: sentences.length,
      });
    }
  }

  return sentences;
};

export const textToSpeech = async (text: string): Promise<ArrayBuffer> => {
  return await loadTextToSpeech(text);
};

export const prefetchTextToSpeech = async (text: string) => {
  try {
    await loadTextToSpeech(text);
  } catch (error) {
    console.warn('Failed to prefetch ElevenLabs audio:', error);
  }
};

export const clearTextToSpeechCache = () => {
  audioCache.clear();
  inFlightRequests.clear();
};

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

export class SequentialTTS {
  private sentences: TTSSentence[] = [];
  private currentIndex = 0;
  private audioContext: AudioContext | null = null;
  private isPlaying = false;
  private isPaused = false;

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

    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }

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
      this.currentIndex += 1;
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
    void this.playNextSentence();
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
