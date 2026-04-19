import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const HEALTHCHECK_TIMEOUT_MS = 5_000;
const TRANSCRIPTION_TIMEOUT_MS = 20_000;

const jsonResponse = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// Process base64 in chunks to prevent memory issues
function processBase64Chunks(base64String: string, chunkSize = 32768) {
  const chunks: Uint8Array[] = [];
  let position = 0;

  while (position < base64String.length) {
    const chunk = base64String.slice(position, position + chunkSize);
    const binaryChunk = atob(chunk);
    const bytes = new Uint8Array(binaryChunk.length);

    for (let i = 0; i < binaryChunk.length; i++) {
      bytes[i] = binaryChunk.charCodeAt(i);
    }

    chunks.push(bytes);
    position += chunkSize;
  }

  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { audio, language = 'tr', healthcheck = false } = await req.json();
    const openAiApiKey = Deno.env.get('OPENAI_API_KEY');

    if (!openAiApiKey) {
      return jsonResponse({
        error: 'OPENAI_API_KEY is not configured',
        code: 'missing_openai_key',
      }, 500);
    }

    if (healthcheck) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), HEALTHCHECK_TIMEOUT_MS);

      try {
        const response = await fetch('https://api.openai.com/v1/models/whisper-1', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${openAiApiKey}`,
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorText = await response.text();
          return jsonResponse({
            ok: false,
            error: `OpenAI healthcheck error: ${errorText}`,
            code: 'healthcheck_failed',
            provider: 'openai',
            providerStatus: response.status,
          }, 503);
        }

        return jsonResponse({ ok: true, checkedAt: new Date().toISOString() });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return jsonResponse({
            ok: false,
            error: `Healthcheck timed out after ${HEALTHCHECK_TIMEOUT_MS}ms`,
            code: 'healthcheck_timeout',
            provider: 'openai',
          }, 504);
        }

        return jsonResponse({
          ok: false,
          error: error instanceof Error ? error.message : 'Unknown healthcheck error',
          code: 'healthcheck_failed',
          provider: 'openai',
        }, 503);
      } finally {
        clearTimeout(timeoutId);
      }
    }

    if (!audio) {
      return jsonResponse({
        error: 'No audio data provided',
        code: 'missing_audio',
      }, 400);
    }

    console.log('Processing audio transcription request...');

    const binaryAudio = processBase64Chunks(audio);
    const formData = new FormData();
    const blob = new Blob([binaryAudio], { type: 'audio/webm' });
    formData.append('file', blob, 'audio.webm');
    formData.append('model', 'whisper-1');
    formData.append('language', language);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TRANSCRIPTION_TIMEOUT_MS);

    try {
      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAiApiKey}`,
        },
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('OpenAI API error:', response.status, errorText);
        return jsonResponse({
          error: `OpenAI API error: ${errorText}`,
          code: 'openai_transcription_failed',
          provider: 'openai',
          providerStatus: response.status,
        }, response.status >= 500 ? 502 : response.status);
      }

      const result = await response.json();
      const transcript = typeof result?.text === 'string' ? result.text.trim() : '';
      console.log('Transcription successful:', transcript);

      if (!transcript) {
        return jsonResponse({
          error: 'No transcript text returned',
          code: 'empty_transcript',
          provider: 'openai',
        }, 502);
      }

      return jsonResponse({ text: transcript, code: 'ok' });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return jsonResponse({
          error: `Transcription timed out after ${TRANSCRIPTION_TIMEOUT_MS}ms`,
          code: 'transcription_timeout',
          provider: 'openai',
        }, 504);
      }

      console.error('Transcription error:', error);
      return jsonResponse({
        error: error instanceof Error ? error.message : 'Unknown error',
        code: 'transcription_failed',
        provider: 'openai',
      }, 500);
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    console.error('Transcription error:', error);
    return jsonResponse({
      error: error instanceof Error ? error.message : 'Unknown error',
      code: 'request_parse_failed',
    }, 500);
  }
});
