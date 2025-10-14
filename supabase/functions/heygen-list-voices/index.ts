import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const HEYGEN_API_KEY = Deno.env.get('HEYGEN_API_KEY');
    
    if (!HEYGEN_API_KEY) {
      throw new Error('HEYGEN_API_KEY is not configured');
    }

    console.log('Fetching available HeyGen voices...');
    
    // Fetch available voices from HeyGen API
    const response = await fetch('https://api.heygen.com/v2/voices', {
      method: 'GET',
      headers: {
        'X-Api-Key': HEYGEN_API_KEY,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('HeyGen API error:', response.status, errorText);
      throw new Error(`HeyGen API error: ${response.status}`);
    }

    const data = await response.json();
    console.log('Voices fetched successfully');
    
    // Filter for Turkish voices if requested
    const { filterLanguage } = await req.json().catch(() => ({}));
    
    let voices = data.data?.voices || data.voices || [];
    
    if (filterLanguage) {
      voices = voices.filter((voice: any) => 
        voice.language?.toLowerCase().includes(filterLanguage.toLowerCase()) ||
        voice.language_code?.toLowerCase().includes(filterLanguage.toLowerCase())
      );
      console.log(`Filtered ${voices.length} voices for language: ${filterLanguage}`);
    }
    
    return new Response(JSON.stringify({ 
      voices,
      count: voices.length 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in heygen-list-voices:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
