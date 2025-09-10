import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      throw new Error('OPENAI_API_KEY is not set');
    }

    const { message, conversationHistory = [] } = await req.json();

    // First, analyze if the message is research-related
    const analysisResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { 
            role: 'system', 
            content: `Sen bir araştırma konusu analiz edicisisin. Kullanıcının mesajını analiz et ve SADECE şu durumlardan birinde "ARAŞTIRMA_İLGİLİ" yanıtı ver:
            - Kullanıcı araştırması, ürün testi, kullanıcı araştırması, anket, görüşme, UX araştırması hakkında konuşuyorsa
            - Müşteri geri bildirimi toplama, pazar araştırması, davranış analizi hakkında konuşuyorsa  
            - Belirli bir ürün, hizmet veya konsept üzerinde araştırma yapmak istiyorsa
            
            Diğer tüm durumlarda "GENEL_SOHBET" yanıtı ver. Sadece bu iki kelimeden birini yanıtla, başka hiçbir şey yazma.`
          },
          { role: 'user', content: message }
        ],
        temperature: 0.3,
        max_tokens: 10
      }),
    });

    const analysisData = await analysisResponse.json();
    const isResearchRelated = analysisData.choices[0].message.content.includes('ARAŞTIRMA_İLGİLİ');

    let systemPrompt, shouldGenerateResearchPlan = false;
    
    if (isResearchRelated) {
      // Check if user is asking for a research plan specifically
      const isPlanRequest = message.toLowerCase().includes('plan') || 
                           message.toLowerCase().includes('araştırma') ||
                           message.toLowerCase().includes('nasıl');
      
      if (isPlanRequest) {
        shouldGenerateResearchPlan = true;
        systemPrompt = `Sen bir araştırma planı uzmanısın. Kullanıcının araştırma konusuna göre yapılandırılmış bir plan oluştur.

ÖNEMLI: Yanıtını JSON formatında ver:
{
  "chatResponse": "Araştırma planını sağ panelde hazırladım. Kategorileri inceleyerek başlayabilirsin.",
  "researchPlan": {
    "title": "[Araştırma konusuna uygun başlık]",
    "sections": [
      {
        "id": "background",
        "title": "Arka Plan ve Hedefler", 
        "questions": ["Soru 1", "Soru 2", "Soru 3"]
      },
      {
        "id": "methodology",
        "title": "Metodoloji",
        "questions": ["Soru 1", "Soru 2", "Soru 3"]
      },
      {
        "id": "analysis", 
        "title": "Analiz",
        "questions": ["Soru 1", "Soru 2", "Soru 3"]
      }
    ]
  }
}`;
      } else {
        systemPrompt = `Sen Türkçe konuşan yardımcı bir asistansın. Kullanıcı araştırma konusu hakkında konuşuyor. Kısa ve öz yanıtlar ver, araştırma konularında rehberlik et.`;
      }
    } else {
      systemPrompt = `Sen Türkçe konuşan yardımcı bir asistansın. Genel sorulara yardımcı ol, kısa ve öz yanıtlar ver.`;
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: message }
    ];

    console.log('Processing Turkish chat message:', message);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: messages,
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('OpenAI API error:', errorData);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    let reply = data.choices[0].message.content;
    let researchPlan = null;
    
    // Parse JSON response if it's a research plan
    if (shouldGenerateResearchPlan) {
      try {
        const parsed = JSON.parse(reply);
        reply = parsed.chatResponse;
        researchPlan = parsed.researchPlan;
      } catch (e) {
        console.log('Failed to parse JSON, using original response');
      }
    }
    
    console.log('Generated Turkish response:', reply);

    return new Response(JSON.stringify({ 
      reply,
      isResearchRelated,
      researchPlan,
      conversationHistory: [...conversationHistory, 
        { role: 'user', content: message },
        { role: 'assistant', content: reply }
      ]
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in turkish-chat function:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Internal server error',
      reply: 'Üzgünüm, şu anda bir hata oluştu. Lütfen tekrar deneyin.'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});