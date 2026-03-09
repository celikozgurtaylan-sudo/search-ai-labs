import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const elevenlabsApiKey = Deno.env.get('ELEVENLABS_API_KEY');
const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
const DEFAULT_VOICE = '9BWtsMINqrJLrRacOk9x';
const ELEVENLABS_MODEL = 'eleven_multilingual_v2';
const ELEVENLABS_TIMEOUT_MS = 6500;

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

const shouldFallbackToOpenAI = (status?: number, errorText = '', error?: unknown) => {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }

  if (error instanceof TypeError) {
    return true;
  }

  if (!status) {
    return false;
  }

  if (status >= 500 || status === 408 || status === 409 || status === 429) {
    return true;
  }

  if (status >= 401 && status <= 403) {
    return true;
  }

  const normalizedError = errorText.toLowerCase();
  return [
    'quota_exceeded',
    'sign_in_required',
    'authentication_error',
    'too_many_requests',
    'rate limit',
    'credit',
    'insufficient',
  ].some((pattern) => normalizedError.includes(pattern));
};

// Fallback function using OpenAI TTS
async function generateWithOpenAI(text: string, corsHeaders: Record<string, string>) {
  console.log('Using OpenAI TTS fallback...');
  
  if (!openAIApiKey) {
    throw new Error('OpenAI API key not configured for fallback');
  }

  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openAIApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'tts-1',
      input: text,
      voice: 'nova', // Good voice for Turkish
      response_format: 'mp3',
      speed: 1.0
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI TTS fallback failed: ${response.status} - ${errorText}`);
  }

  console.log('OpenAI TTS fallback successful');

  const base64Audio = toBase64Audio(await response.arrayBuffer());
  
  return new Response(
    JSON.stringify({ 
      audioContent: base64Audio,
      text: text,
      source: 'openai',
    }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    },
  );
}

async function generateWithElevenLabs(text: string, voice: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ELEVENLABS_TIMEOUT_MS);

  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': elevenlabsApiKey!,
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
      return {
        ok: false as const,
        status: response.status,
        errorText,
      };
    }

    return {
      ok: true as const,
      base64Audio: toBase64Audio(await response.arrayBuffer()),
    };
  } catch (error) {
    return {
      ok: false as const,
      error,
      errorText: error instanceof Error ? error.message : 'Unknown ElevenLabs error',
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, voice = DEFAULT_VOICE } = await req.json();

    if (!text) {
      throw new Error('Text is required for TTS generation');
    }

    console.log('Generating Turkish TTS for text:', text.substring(0, 50) + '...');
    console.log('Using voice:', voice);
    console.log('ElevenLabs API key present:', !!elevenlabsApiKey);

    if (!elevenlabsApiKey) {
      console.warn('ElevenLabs API key not found, using OpenAI fallback immediately');
      return await generateWithOpenAI(text, corsHeaders);
    }

    const elevenlabsResult = await generateWithElevenLabs(text, voice);

    if (!elevenlabsResult.ok) {
      console.error('ElevenLabs TTS failed:', elevenlabsResult.errorText);
      console.error('ElevenLabs status:', elevenlabsResult.status ?? 'request_error');

      if (shouldFallbackToOpenAI(elevenlabsResult.status, elevenlabsResult.errorText, elevenlabsResult.error)) {
        console.log('Falling back to OpenAI TTS after ElevenLabs failure');
        return await generateWithOpenAI(text, corsHeaders);
      }

      throw new Error(`TTS generation failed: ${elevenlabsResult.status ?? 'request_error'} - ${elevenlabsResult.errorText}`);
    }

    console.log('ElevenLabs TTS response successful');
    console.log('Successfully generated base64 audio, length:', elevenlabsResult.base64Audio.length);

    return new Response(
      JSON.stringify({ 
        audioContent: elevenlabsResult.base64Audio,
        text,
        source: 'elevenlabs',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    console.error('Turkish TTS error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
