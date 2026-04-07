import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const elevenlabsApiKey = Deno.env.get('ELEVENLABS_API_KEY');
const DEFAULT_VOICE = '9BWtsMINqrJLrRacOk9x';
const ELEVENLABS_MODEL = 'eleven_multilingual_v2';
const ELEVENLABS_TIMEOUT_MS = 12000;

class TTSError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 500, code = 'tts_error') {
    super(message);
    this.name = 'TTSError';
    this.status = status;
    this.code = code;
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const toBase64Audio = (arrayBuffer: ArrayBuffer) => {
  const uint8Array = new Uint8Array(arrayBuffer);
  let binary = '';
  const chunkSize = 0x8000;

  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }

  return btoa(binary);
};

async function generateWithElevenLabs(text: string) {
  if (!elevenlabsApiKey) {
    throw new TTSError('ElevenLabs API key not configured', 500, 'missing_elevenlabs_key');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ELEVENLABS_TIMEOUT_MS);

  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${DEFAULT_VOICE}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': elevenlabsApiKey,
      },
      body: JSON.stringify({
        text,
        model_id: ELEVENLABS_MODEL,
        voice_settings: {
          stability: 0.42,
          similarity_boost: 0.78,
          style: 0.1,
          use_speaker_boost: true,
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      const upstreamStatus = response.status >= 500 ? 502 : response.status;
      throw new TTSError(
        `ElevenLabs error ${response.status}: ${errorText}`,
        upstreamStatus,
        'elevenlabs_request_failed',
      );
    }

    return toBase64Audio(await response.arrayBuffer());
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new TTSError(
        `ElevenLabs request timed out after ${ELEVENLABS_TIMEOUT_MS}ms`,
        504,
        'elevenlabs_timeout',
      );
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text } = await req.json();

    if (!text) {
      throw new Error('Text is required for TTS generation');
    }

    console.log('Generating Turkish TTS for text:', text.substring(0, 50) + '...');
    console.log('Using fixed ElevenLabs voice:', DEFAULT_VOICE);

    const audioContent = await generateWithElevenLabs(text);

    return new Response(
      JSON.stringify({
        audioContent,
        text,
        source: 'elevenlabs',
        voiceId: DEFAULT_VOICE,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    console.error('Turkish TTS error:', error);
    const status = error instanceof TTSError ? error.status : 500;
    const code = error instanceof TTSError ? error.code : 'unknown_tts_error';

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
        code,
        provider: 'elevenlabs',
      }),
      {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
