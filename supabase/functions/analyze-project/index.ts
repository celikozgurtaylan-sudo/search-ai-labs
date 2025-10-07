import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import "https://deno.land/x/xhr@0.1.0/mod.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { description } = await req.json()

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('LOVABLE_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `Sen kullanıcı araştırması konusunda uzman bir AI asistanısın. Proje açıklamalarını analiz edip detaylı araştırma planları oluşturuyorsun. Yanıtlarını SADECE geçerli JSON formatında ver. Türkçe yanıtla.

JSON formatı:
{
  "summary": "Proje özetinin kısa açıklaması",
  "researchMethods": ["Yöntem1", "Yöntem2"],
  "targetAudience": "Hedef kitle açıklaması",
  "keyQuestions": ["Soru1", "Soru2", "Soru3"],
  "timeline": "Tahmini süre",
  "insights": "Araştırma konusunda önemli içgörüler"
}`
          },
          {
            role: 'user',
            content: `Bu proje açıklamasını analiz et ve araştırma planı oluştur: "${description}"`
          }
        ],
        temperature: 0.7,
        max_tokens: 1000,
      }),
    })

    const data = await response.json()
    
    if (!response.ok) {
      throw new Error(data.error?.message || 'OpenAI API error')
    }

    let analysisResult
    try {
      analysisResult = JSON.parse(data.choices[0].message.content)
    } catch (parseError) {
      // Fallback if JSON parsing fails
      analysisResult = {
        summary: "Proje analizi tamamlandı",
        researchMethods: ["Kullanıcı görüşmeleri", "Anket çalışması"],
        targetAudience: "Hedef kullanıcılar",
        keyQuestions: ["Kullanıcı ihtiyaçları nelerdir?", "Ana sorun noktaları nelerdir?"],
        timeline: "2-3 hafta",
        insights: "Detaylı araştırma planı oluşturuldu"
      }
    }

    return new Response(
      JSON.stringify({ analysis: analysisResult }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      },
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        },
        status: 500,
      },
    )
  }
})