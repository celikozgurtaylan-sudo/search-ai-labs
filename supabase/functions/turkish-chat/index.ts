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

ARAŞTIRMA İLGİLİ DURUMLAR:
- "araştırma", "research", "analiz", "test", "plan" kelimelerini içeriyorsa
- Kullanıcı araştırması, ürün testi, UX araştırması, kullanılabilirlik testi hakkında konuşuyorsa
- "nasıl araştırabilirim", "plan yapabilir misin", "araştırma planı" gibi ifadeler varsa
- Müşteri geri bildirimi, anket, görüşme, pazar araştırması hakkında konuşuyorsa
- Veri toplama, kullanıcı davranışı, persona oluşturma konularında soruyorsa
- Bir ürün/hizmet/konsept hakkında araştırma yapmak istiyorsa

ÖRNEKLER:
- "Mobil uygulama için kullanıcı araştırması nasıl yapabilirim?" → ARAŞTIRMA_İLGİLİ
- "Ürün testinde hangi soruları sormalıyım?" → ARAŞTIRMA_İLGİLİ
- "Müşteri memnuniyeti için anket hazırlayabilir misin?" → ARAŞTIRMA_İLGİLİ
- "Nasılsın?" → GENEL_SOHBET
- "Bugün hava nasıl?" → GENEL_SOHBET

Sadece "ARAŞTIRMA_İLGİLİ" veya "GENEL_SOHBET" yanıtı ver, başka hiçbir şey yazma.`
          },
          { role: 'user', content: message }
        ],
        temperature: 0.1,
        max_tokens: 15
      }),
    });

    const analysisData = await analysisResponse.json();
    console.log('Analysis response:', analysisData.choices[0].message.content);
    
    // Primary AI detection
    let isResearchRelated = analysisData.choices[0].message.content.includes('ARAŞTIRMA_İLGİLİ');
    
    // Fallback keyword detection for Turkish research terms
    if (!isResearchRelated) {
      const researchKeywords = ['araştırma', 'research', 'analiz', 'test', 'plan', 'anket', 'görüşme', 'kullanıcı', 'müşteri', 'veri', 'davranış', 'persona', 'ürün test', 'ux', 'ui'];
      const messageText = message.toLowerCase();
      isResearchRelated = researchKeywords.some(keyword => messageText.includes(keyword));
      
      if (isResearchRelated) {
        console.log('Research detected via fallback keywords');
      }
    }
    
    console.log('Final research detection result:', isResearchRelated);

    let systemPrompt, shouldGenerateResearchPlan = false;
    
    if (isResearchRelated) {
      // Second analysis: Check if research request is clear or vague
      const specificityResponse = await fetch('https://api.openai.com/v1/chat/completions', {
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
              content: `Sen araştırma taleplerinin netliğini analiz ediyorsun. Kullanıcının araştırma mesajını analiz et:

NET TALEPLER (hemen plan oluşturulabilir):
- Belirli bir ürün/hizmet adı var: "Mobil uygulamamın kullanılabilirlik testi"
- Araştırma türü belirli: "checkout sürecinin kullanıcı testi", "müşteri memnuniyet anketi"
- Hedef kitle belirtilmiş: "e-ticaret müşterileri için araştırma"
- Spesifik özellik/süreç: "ödeme sayfasının testi", "kayıt formunun analizi"

BELIRSIZ TALEPLER (keşif konuşması gerekli):
- Genel ifadeler: "araştırma yapmam lazım", "bir şeyler test etmek istiyorum"
- Ürün/hizmet belirsiz: "uygulamamla ilgili", "websitem için"
- Hedef belirsiz: "kullanıcılar için", "müşteriler için" (hangi kullanıcılar?)
- Amaç belirsiz: "analiz yapmak istiyorum", "veri toplamak istiyorum"

SADECE "NET" veya "BELIRSIZ" yanıtı ver, başka hiçbir şey yazma.`
            },
            { role: 'user', content: message }
          ],
          temperature: 0.1,
          max_tokens: 10
        }),
      });

      const specificityData = await specificityResponse.json();
      const isSpecific = specificityData.choices[0].message.content.includes('NET');
      console.log('Specificity analysis:', specificityData.choices[0].message.content);
      console.log('Is request specific:', isSpecific);
      
      if (isSpecific) {
        // Clear request - generate structured plan immediately
        shouldGenerateResearchPlan = true;
        systemPrompt = `Sen bir araştırma planı uzmanısın. Kullanıcının net araştırma talebine göre derhal yapılandırılmış bir plan oluştur.

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
        // Vague request - start discovery conversation
        systemPrompt = `Sen araştırma keşif uzmanısın. Kullanıcının belirsiz araştırma talebini netleştirmek için rehberlik edeceksin.

Aşağıdaki keşif sorularından uygun olanları sor:
- "Hangi ürün/hizmet hakkında araştırma yapmak istiyorsun?"
- "Bu araştırmanın amacı nedir? (Kullanılabilirlik testi, müşteri memnuniyeti, yeni özellik analizi vs.)"
- "Hedef kitlen kimler? (Yaş, demografik, davranış özellikleri)"
- "Hangi özellikleri/süreçleri test etmek istiyorsun?"
- "Bu araştırmadan hangi sonuçları elde etmeyi umuyorsun?"
- "Daha önce benzer bir araştırma yaptın mı?"

Kullanıcının durumuna uygun 1-2 soru sor ve araştırma konusunu netleştirmeye odaklan. Türkçe yanıt ver.`;
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

    // Only show research panel when we have a structured plan ready
    const showResearchPanel = isResearchRelated && shouldGenerateResearchPlan;

    return new Response(JSON.stringify({ 
      reply,
      isResearchRelated: showResearchPanel,
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