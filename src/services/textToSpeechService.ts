import { supabase } from "@/integrations/supabase/client";

export interface TTSChunk {
  text: string;
  index: number;
}

export interface TTSQuotaInfo {
  remainingCredits?: number;
  requiredCredits?: number;
}

type FunctionErrorPayload = {
  error?: string;
  code?: string;
  provider?: string;
  providerStatus?: number;
  quota?: TTSQuotaInfo;
};

const MAX_CACHE_ENTRIES = 16;
const MAX_CHUNK_LENGTH = 180;
const audioCache = new Map<string, ArrayBuffer>();
const inFlightRequests = new Map<string, Promise<ArrayBuffer>>();
let quotaCircuitError: TTSRequestError | null = null;

export class TTSRequestError extends Error {
  status?: number;
  code: string;
  provider?: string;
  providerStatus?: number;
  quota?: TTSQuotaInfo;

  constructor(
    message: string,
    options: {
      status?: number;
      code?: string;
      provider?: string;
      providerStatus?: number;
      quota?: TTSQuotaInfo;
    } = {},
  ) {
    super(message);
    this.name = "TTSRequestError";
    this.status = options.status;
    this.code = options.code ?? "tts_error";
    this.provider = options.provider;
    this.providerStatus = options.providerStatus;
    this.quota = options.quota;
  }
}

const cloneBuffer = (buffer: ArrayBuffer) => buffer.slice(0);

const cloneTTSRequestError = (error: TTSRequestError) =>
  new TTSRequestError(error.message, {
    status: error.status,
    code: error.code,
    provider: error.provider,
    providerStatus: error.providerStatus,
    quota: error.quota ? { ...error.quota } : undefined,
  });

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

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const parseQuotaInfo = (value: unknown): TTSQuotaInfo | undefined => {
  if (!isObjectRecord(value)) {
    return undefined;
  }

  const remainingCredits = typeof value.remainingCredits === "number" ? value.remainingCredits : undefined;
  const requiredCredits = typeof value.requiredCredits === "number" ? value.requiredCredits : undefined;

  if (remainingCredits === undefined && requiredCredits === undefined) {
    return undefined;
  }

  return { remainingCredits, requiredCredits };
};

const normalizeText = (text: string) => text.trim().replace(/\s+/g, " ");

const readFunctionErrorPayload = async (response?: Response): Promise<FunctionErrorPayload | null> => {
  if (!response) return null;

  try {
    const responseClone = response.clone();
    const contentType = responseClone.headers.get("Content-Type")?.split(";")[0].trim();

    if (contentType === "application/json") {
      const payload = await responseClone.json();
      if (!isObjectRecord(payload)) {
        return null;
      }

      return {
        error: typeof payload.error === "string" ? payload.error : undefined,
        code: typeof payload.code === "string" ? payload.code : undefined,
        provider: typeof payload.provider === "string" ? payload.provider : undefined,
        providerStatus: typeof payload.providerStatus === "number" ? payload.providerStatus : undefined,
        quota: parseQuotaInfo(payload.quota),
      };
    }

    const responseText = (await responseClone.text()).trim();
    return responseText ? { error: responseText } : null;
  } catch {
    return null;
  }
};

const buildTTSRequestError = async (error: unknown, response?: Response) => {
  const payload = await readFunctionErrorPayload(response);
  const fallbackMessage = error instanceof Error ? error.message : "Unknown TTS error";
  const message = payload?.error?.trim() || fallbackMessage;

  return new TTSRequestError(message, {
    status: response?.status,
    code: payload?.code || (error instanceof Error ? error.name : "tts_error"),
    provider: payload?.provider,
    providerStatus: payload?.providerStatus,
    quota: payload?.quota,
  });
};

const throwIfQuotaCircuitOpen = () => {
  if (quotaCircuitError) {
    throw cloneTTSRequestError(quotaCircuitError);
  }
};

const splitByBoundary = (segment: string, splitter: RegExp) => {
  const parts = segment
    .split(splitter)
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.length > 1 ? parts : [segment.trim()];
};

const mergePartsWithinLimit = (parts: string[], maxLength: number) => {
  const merged: string[] = [];
  let current = "";

  for (const part of parts) {
    const candidate = current ? `${current} ${part}` : part;
    if (current && candidate.length > maxLength) {
      merged.push(current);
      current = part;
      continue;
    }

    current = candidate;
  }

  if (current) {
    merged.push(current);
  }

  return merged;
};

const splitByWords = (segment: string, maxLength: number) => {
  if (segment.length <= maxLength) {
    return [segment];
  }

  const chunks: string[] = [];
  const words = segment.split(/\s+/).filter(Boolean);
  let current = "";

  for (const word of words) {
    if (word.length > maxLength) {
      if (current) {
        chunks.push(current);
        current = "";
      }

      for (let offset = 0; offset < word.length; offset += maxLength) {
        chunks.push(word.slice(offset, offset + maxLength));
      }
      continue;
    }

    const candidate = current ? `${current} ${word}` : word;
    if (current && candidate.length > maxLength) {
      chunks.push(current);
      current = word;
      continue;
    }

    current = candidate;
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
};

const splitLongSegment = (segment: string, maxLength: number) => {
  let segments = [segment.trim()];
  const splitters = [/(?<=[.!?])\s+/u, /(?<=[,;:])\s+/u];

  for (const splitter of splitters) {
    segments = segments.flatMap((part) => {
      if (part.length <= maxLength) {
        return [part];
      }

      const splitParts = splitByBoundary(part, splitter);
      if (splitParts.length === 1) {
        return [part];
      }

      return mergePartsWithinLimit(splitParts, maxLength);
    });
  }

  return segments.flatMap((part) => splitByWords(part, maxLength));
};

const getFirstChunkText = (text: string) => splitIntoSentences(text)[0]?.text;

const loadTextToSpeech = async (text: string): Promise<ArrayBuffer> => {
  const normalizedText = normalizeText(text);
  if (!normalizedText) {
    throw new TTSRequestError("Cannot synthesize empty text", { code: "empty_text" });
  }

  throwIfQuotaCircuitOpen();

  const cachedAudio = audioCache.get(normalizedText);
  if (cachedAudio) {
    return cloneBuffer(cachedAudio);
  }

  const existingRequest = inFlightRequests.get(normalizedText);
  if (existingRequest) {
    return cloneBuffer(await existingRequest);
  }

  const request = (async () => {
    const { data, error, response } = await supabase.functions.invoke("turkish-tts", {
      body: { text: normalizedText },
    });

    if (error) {
      const ttsError = await buildTTSRequestError(error, response);
      if (isQuotaExceededTTSError(ttsError)) {
        quotaCircuitError = cloneTTSRequestError(ttsError);
      }
      throw ttsError;
    }

    if (!data?.audioContent) {
      throw new TTSRequestError("No audio content received", { code: "missing_audio_content" });
    }

    if (data?.source && data.source !== "elevenlabs") {
      throw new TTSRequestError(`Unexpected TTS provider: ${data.source}`, {
        code: "unexpected_tts_provider",
      });
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

export const splitIntoSentences = (text: string): TTSChunk[] => {
  const normalizedText = normalizeText(text);
  if (!normalizedText) {
    return [];
  }

  return splitLongSegment(normalizedText, MAX_CHUNK_LENGTH).map((segment, index) => ({
    text: segment,
    index,
  }));
};

export const isQuotaExceededTTSError = (error: unknown): error is TTSRequestError =>
  error instanceof TTSRequestError && error.code === "quota_exceeded";

export const shouldRetryTTSError = (error: unknown) => {
  if (!(error instanceof TTSRequestError)) {
    return true;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const e = error as any;

  if (isQuotaExceededTTSError(error) || e.code === "missing_elevenlabs_key") {
    return false;
  }

  if (typeof e.status === "number" && e.status >= 500) {
    return true;
  }

  if (typeof e.providerStatus === "number" && e.providerStatus >= 500) {
    return true;
  }

  return e.code === "FunctionsFetchError" || e.code === "elevenlabs_timeout";
};

export const getTTSErrorMessage = (error: unknown) => {
  if (
    isQuotaExceededTTSError(error) &&
    typeof error.quota?.remainingCredits === "number" &&
    typeof error.quota?.requiredCredits === "number"
  ) {
    return `Ses kotasi doldu. ${error.quota.remainingCredits} kredi kaldi, bu soru icin ${error.quota.requiredCredits} kredi gerekiyor. Soru yazili olarak devam ediyor.`;
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "ElevenLabs sesi su anda baglanamiyor.";
};

export const textToSpeech = async (text: string): Promise<ArrayBuffer> => {
  return await loadTextToSpeech(text);
};

export const prefetchTextToSpeech = async (text: string) => {
  const firstChunk = getFirstChunkText(text);
  if (!firstChunk || quotaCircuitError) {
    return;
  }

  try {
    await loadTextToSpeech(firstChunk);
  } catch (error) {
    if (!isQuotaExceededTTSError(error)) {
      console.warn("Failed to prefetch ElevenLabs audio:", error);
    }
  }
};

export const clearTextToSpeechCache = () => {
  audioCache.clear();
  inFlightRequests.clear();
};

export const resetTextToSpeechSessionState = () => {
  clearTextToSpeechCache();
  quotaCircuitError = null;
};

export const playAudio = async (
  audioBuffer: ArrayBuffer,
  audioContext: AudioContext,
  onPlaybackStart?: () => void,
): Promise<void> => {
  const decodedData = await audioContext.decodeAudioData(cloneBuffer(audioBuffer));

  return await new Promise((resolve, reject) => {
    try {
      const source = audioContext.createBufferSource();
      source.buffer = decodedData;
      source.connect(audioContext.destination);
      source.onended = () => resolve();
      source.start(0);
      onPlaybackStart?.();
    } catch (error) {
      reject(error);
    }
  });
};

export class SequentialTTS {
  private sentences: TTSChunk[] = [];
  private currentIndex = 0;
  private audioContext: AudioContext | null = null;
  private isPlaying = false;
  private isPaused = false;
  private activeSource: AudioBufferSourceNode | null = null;

  onSentenceStart?: (sentence: TTSChunk) => void;
  onSentencePlaybackStart?: (sentence: TTSChunk) => void;
  onSentenceEnd?: (sentence: TTSChunk) => void;
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

    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }

    await this.playNextSentence();
  }

  private async playBufferedSentence(audioBuffer: ArrayBuffer, sentence: TTSChunk) {
    const decodedData = await this.audioContext!.decodeAudioData(cloneBuffer(audioBuffer));

    await new Promise<void>((resolve, reject) => {
      try {
        const source = this.audioContext!.createBufferSource();
        this.activeSource = source;
        source.buffer = decodedData;
        source.connect(this.audioContext!.destination);
        source.onended = () => {
          if (this.activeSource === source) {
            this.activeSource = null;
          }
          resolve();
        };
        source.start(0);
        this.onSentencePlaybackStart?.(sentence);
      } catch (error) {
        reject(error);
      }
    });
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

      await this.playBufferedSentence(audioBuffer, sentence);

      if (this.isPaused || !this.isPlaying) return;

      this.onSentenceEnd?.(sentence);
      this.currentIndex += 1;
      await this.playNextSentence();
    } catch (error) {
      console.error("Error playing sentence:", error);
      this.onError?.(error as Error);
      this.stop();
    }
  }

  pause() {
    if (!this.isPlaying) return;
    this.isPaused = true;
    this.activeSource?.stop();
  }

  resume() {
    if (!this.isPaused) return;
    this.isPaused = false;
    void this.resumePlayback();
  }

  private async resumePlayback() {
    if (!this.audioContext) return;

    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }

    await this.playNextSentence();
  }

  stop() {
    this.isPlaying = false;
    this.isPaused = false;
    this.currentIndex = 0;
    this.activeSource?.stop();
    this.activeSource = null;
  }

  getCurrentSentence(): TTSChunk | null {
    return this.sentences[this.currentIndex] || null;
  }

  getSentences(): TTSChunk[] {
    return this.sentences;
  }

  getTotalSentences(): number {
    return this.sentences.length;
  }

  getCurrentIndex(): number {
    return this.currentIndex;
  }
}
