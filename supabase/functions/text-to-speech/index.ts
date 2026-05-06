import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { restoreTurkishCharacters } from "../_shared/turkish-text.ts";

const PRIMARY_TURKISH_VOICE = Deno.env.get('ELEVENLABS_TURKISH_VOICE_ID') || 'Hvrobr8BhLPfiaSv2cHi'; // Gamze Özdemir - Turkish Female Narrator
const FALLBACK_VOICE = Deno.env.get('ELEVENLABS_FALLBACK_VOICE_ID') || '9BWtsMINqrJLrRacOk9x';
const ELEVENLABS_MODEL = Deno.env.get('ELEVENLABS_TTS_MODEL') || 'eleven_multilingual_v2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text } = await req.json();

    if (!text) {
      throw new Error('Text is required');
    }

    const elevenLabsApiKey = Deno.env.get('ELEVENLABS_API_KEY');
    if (!elevenLabsApiKey) {
      throw new Error('ElevenLabs API key not configured');
    }

    const normalizedText = restoreTurkishCharacters(String(text)).replace(/\s+/g, ' ').trim();
    if (!normalizedText) {
      throw new Error('Text is required');
    }

    console.log('Converting text to speech:', normalizedText.substring(0, 50) + '...');

    let voiceId = PRIMARY_TURKISH_VOICE;
    let response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': elevenLabsApiKey,
        },
        body: JSON.stringify({
          text: normalizedText,
          model_id: ELEVENLABS_MODEL,
          voice_settings: {
            stability: 0.68,
            similarity_boost: 0.72,
            style: 0.04,
            use_speaker_boost: false,
          },
        }),
      }
    );

    if (!response.ok && voiceId !== FALLBACK_VOICE && [400, 403, 404].includes(response.status)) {
      console.warn('Primary Turkish ElevenLabs voice unavailable, falling back to Aria:', {
        voiceId,
        providerStatus: response.status,
      });
      voiceId = FALLBACK_VOICE;
      response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        {
          method: 'POST',
          headers: {
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
            'xi-api-key': elevenLabsApiKey,
          },
          body: JSON.stringify({
            text: normalizedText,
            model_id: ELEVENLABS_MODEL,
            voice_settings: {
              stability: 0.68,
              similarity_boost: 0.72,
              style: 0.04,
              use_speaker_boost: false,
            },
          }),
        }
      );
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ElevenLabs API error:', response.status, errorText);
      throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
    }

    // Convert audio to base64
    const audioBuffer = await response.arrayBuffer();
    const base64Audio = btoa(
      String.fromCharCode(...new Uint8Array(audioBuffer))
    );

    console.log('Successfully generated audio, size:', audioBuffer.byteLength);

    return new Response(
      JSON.stringify({ audioContent: base64Audio, voiceId, modelId: ELEVENLABS_MODEL }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in text-to-speech function:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
