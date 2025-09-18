import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const elevenlabsApiKey = Deno.env.get('ELEVENLABS_API_KEY');

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
    if (!elevenlabsApiKey) {
      console.error('ElevenLabs API key not found in environment variables');
      throw new Error('ElevenLabs API key not configured');
    }

    // Default to a Turkish-sounding voice
    const { text, voice = 'cgSgspJ2msm6clMCkdW9' } = await req.json(); // Jessica voice

    if (!text) {
      throw new Error('Text is required for TTS generation');
    }

    console.log('Generating Turkish TTS for text:', text.substring(0, 50) + '...');
    console.log('Using voice:', voice);
    console.log('ElevenLabs API key present:', !!elevenlabsApiKey);

    // Generate speech using ElevenLabs TTS
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': elevenlabsApiKey,
      },
      body: JSON.stringify({
        text: text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.5,
          style: 0.0,
          use_speaker_boost: true
        }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ElevenLabs TTS API error:', errorText);
      console.error('Response status:', response.status);
      console.error('Response headers:', Object.fromEntries(response.headers.entries()));
      throw new Error(`TTS generation failed: ${response.status} - ${errorText}`);
    }

    console.log('ElevenLabs TTS response successful');

    // Convert to base64 safely to avoid stack overflow
    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    let binary = '';
    const chunkSize = 0x8000; // 32KB chunks to avoid stack overflow
    
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    
    const base64Audio = btoa(binary);
    
    console.log('Successfully generated base64 audio, length:', base64Audio.length);

    return new Response(
      JSON.stringify({ 
        audioContent: base64Audio,
        text: text
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    console.error('Turkish TTS error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});