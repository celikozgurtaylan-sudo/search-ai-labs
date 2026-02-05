import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// CORTEX - Fine-tuned UX Researcher model
const CORTEX_MODEL = 'ft:gpt-4o-mini-2024-07-18:searcho::D5ataqIv';
const CORTEX_SYSTEM_PROMPT = `Sen Searcho AI araştırma planlaması asistanısın. Kullanıcının araştırma talebini analiz et ve yapılandırılmış bir araştırma planı oluştur.

ÖNEMLİ: chatResponse alanında bağlama uygun, spesifik bir yanıt ver. Kullanıcının araştırma konusuna özel bir giriş yap.
- Kullanıcının bahsettiği ürün/hizmet/problemi tekrarla
- Araştırmanın neyi ortaya çıkaracağını kısaca belirt
- Genel kalıp cümleler KULLANMA

KÖTÜ ÖRNEK: "Araştırma planı hazırlandı. Soruları sağ panelde düzenleyebilirsiniz."
İYİ ÖRNEK: "Mobil bankacılık deneyimini derinlemesine anlayacak bir plan hazırladım. Özellikle kullanıcıların para transferi ve güvenlik algısına odaklandım."

SADECE JSON formatında yanıt ver.`;

// Socratic questioning prompt for initial discovery
const SOCRATIC_DISCOVERY_PROMPT = `Sen deneyimli bir UX araştırmacısısın ve Sokratik yöntemle çalışıyorsun. Amacın kullanıcının araştırma ihtiyacını derinlemesine anlamak.

YAKLAŞIMIN:
1. Önce düşün: Kullanıcı ne söyledi? Hangi bilgiler eksik?
2. Merak et: Bu araştırmanın arkasındaki gerçek ihtiyaç ne olabilir?
3. Sorgula: Doğru soruları sorarak asıl problemi ortaya çıkar

SORU SORMA TEKNİĞİN:
- Açık uçlu sorular sor (evet/hayır değil)
- Her soru bir öncekinin üzerine inşa etsin
- Kullanıcının cevabını yansıt ve derinleştir
- 2-3 odaklı soru sor, fazla değil

ÖRNEK DİYALOG:
Kullanıcı: "Mobil uygulamamız için araştırma yapmak istiyoruz"
Sen: "Mobil uygulamanız hakkında daha iyi anlayabilmem için birkaç soru sormak istiyorum:

1. Uygulamanızın hangi özelliği veya akışı üzerinde yoğunlaşmamızı istersiniz?
2. Şu anda kullanıcılardan aldığınız geri bildirimler veya gözlemlediğiniz sorunlar var mı?"

ÖNEMLİ:
- Liste halinde adımlar verme, tavsiye verme
- Hemen plan oluşturma, önce anla
- Samimi ve meraklı bir ton kullan
- Türkçe yanıt ver`;

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY is not set');
    }

    const { message, conversationHistory = [] } = await req.json();
    
    // Track conversation depth (each full exchange = 2 messages)
    const conversationDepth = Math.floor(conversationHistory.length / 2);
    console.log('Conversation depth:', conversationDepth);

    // Check if this is a template-based message
    const isNPSTemplate = message.includes('NPS tabanlı araştırma metodolojisi') || message.includes('müşteri memnuniyeti ve sadakat düzeyini ölçmeye');
    const isAdTestingTemplate = message.includes('Reklam kampanyası performansını') || message.includes('hedef kitle tepkilerini değerlendirmek');
    const isLandingPageTemplate = message.includes('Web sitesi açılış sayfasının') || message.includes('dönüşüm optimizasyonu');
    const isFoundationalTemplate = message.includes('Kullanıcı ihtiyaçları ve pazar dinamiklerini') || message.includes('temel araştırma metodolojisi');
    
    const isTemplateMessage = isNPSTemplate || isAdTestingTemplate || isLandingPageTemplate || isFoundationalTemplate;

    // First, analyze if the message is research-related
    const analysisResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
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
      const specificityResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lovableApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { 
              role: 'system', 
            content: `Sen araştırma taleplerinin netliğini analiz ediyorsun. Kullanıcının araştırma mesajını analiz et:

NET TALEPLER (hemen plan oluşturulabilir):
- Belirli bir ürün/hizmet adı var: "Mobil uygulamamın kullanılabilirlik testi"
- Araştırma türü belirli: "checkout sürecinin kullanıcı testi", "müşteri memnuniyet anketi"
- Hedef kitle belirtilmiş: "e-ticaret müşterileri için araştırma"
- Spesifik özellik/süreç: "ödeme sayfasının testi", "kayıt formunun analizi"
- Somut bir problem var: "kullanıcılar sepeti terk ediyor", "form doldurma oranı düşük"

BELIRSIZ TALEPLER (keşif konuşması gerekli):
- Genel ifadeler: "araştırma yapmam lazım", "bir şeyler test etmek istiyorum"
- Ürün/hizmet belirsiz: "uygulamamla ilgili", "websitem için"
- Hedef belirsiz: "kullanıcılar için", "müşteriler için" (hangi kullanıcılar?)
- Amaç belirsiz: "analiz yapmak istiyorum", "veri toplamak istiyorum"
- Problem tanımlanmamış: sadece "test etmek" ifadeleri

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
      
      // Generate plan ONLY after Socratic dialogue (3+ exchanges) OR for templates
      // Even specific requests need clarifying questions first
      if (isTemplateMessage || conversationDepth >= 3) {
        // Clear request or template - generate structured plan immediately
        shouldGenerateResearchPlan = true;
        
        let templateSpecificPrompt = '';
        if (isNPSTemplate) {
          templateSpecificPrompt = `Sen bir NPS (Net Promoter Score) araştırma uzmanısın. Müşteri memnuniyeti ve sadakat ölçümü için kapsamlı bir görüşme planı oluştur.

ÖNEMLI: Bu NPS araştırması için KATILIMCILARA SORULACAK sorular oluştur:
- NPS skorunu etkileyen faktörleri keşfet
- Müşteri sadakat düzeyini anlayacak sorular
- Memnuniyet ve memnuniyetsizlik nedenlerini ortaya çıkaracak sorular
- Referans verme eğilimini anlamaya yönelik sorular

PLANIN ÖZELLİKLERİ:
- NPS metodolojisine uygun soru yapısı
- Müşteri deneyimini derinlemesine analiz
- Sadakat faktörlerini keşfeden sorular
- Somut geri bildirim toplayacak yaklaşım`;
        } else if (isAdTestingTemplate) {
          templateSpecificPrompt = `Sen bir reklam testi uzmanısın. Reklam kampanyası performansını ve hedef kitle tepkilerini değerlendirmek için görüşme planı hazırla.

REKLAM TESTİ İÇİN KATILIMCILARA SORULACAK SORULAR:
- Reklam içeriğine ilk tepkileri
- Marka algısına etkisi
- Satın alma niyeti değişimi
- Duygusal tepki analizi`;
        } else if (isLandingPageTemplate) {
          templateSpecificPrompt = `Sen bir web sitesi kullanılabilirlik uzmanısın. Açılış sayfasının optimizasyonu için kullanıcı test planı oluştur.

AÇILIŞ SAYFASI TESTİ İÇİN KATILIMCILARA SORULACAK SORULAR:
- İlk izlenim ve anlaşılırlık
- Navigasyon ve kullanım kolaylığı
- Dönüşüm engellerini tespit
- Görsel tasarım ve içerik değerlendirmesi`;
        } else if (isFoundationalTemplate) {
          templateSpecificPrompt = `Sen bir temel kullanıcı araştırması uzmanısın. Kullanıcı ihtiyaçları ve pazar fırsatlarını keşfetmek için kapsamlı araştırma planı oluştur.

TEMEL ARAŞTIRMA İÇİN KATILIMCILARA SORULACAK SORULAR:
- Kullanıcı davranış kalıpları
- İhtiyaç ve motivasyon faktörleri
- Mevcut çözümlerin eksiklikleri
- Gelecekteki beklenti ve trendler`;
        }
        
        // Add conversation context if we've had clarifying exchanges
        let conversationContext = '';
        if (conversationDepth >= 2) {
          const userMessages = conversationHistory
            .filter(msg => msg.role === 'user')
            .map(msg => msg.content)
            .join(' | ');
          
          conversationContext = `\n\nKULLANICI KONUŞMA BAĞLAMI (önceki yanıtlar): ${userMessages}
Bu bilgileri kullanarak kullanıcının ihtiyaçlarına uygun, spesifik ve hedef odaklı sorular oluştur.`;
        }
        
        systemPrompt = `${templateSpecificPrompt}${conversationContext}

YANIT FORMATI:
{
  "chatResponse": "Araştırma planı hazırlandı. Soruları sağ panelde düzenleyebilirsin.",
  "researchPlan": {
    "title": "[Araştırma türüne uygun başlık]",
    "sections": [
      {
        "id": "background",
        "title": "Deneyim ve Geçmiş", 
        "questions": ["[Konuya uygun 3 soru]"]
      },
      {
        "id": "methodology",
        "title": "Davranış ve Tercihler",
        "questions": ["[Konuya uygun 3 soru]"]
      },
      {
        "id": "analysis", 
        "title": "Değerlendirme ve Öneriler",
        "questions": ["[Konuya uygun 3 soru]"]
      }
    ]
  }
}`;
      } else {
        // Socratic discovery phase - ask clarifying questions before generating plan
        // Build context from conversation history
        let contextSummary = '';
        if (conversationHistory.length > 0) {
          const previousExchanges = conversationHistory
            .map((msg, i) => `${msg.role === 'user' ? 'Kullanıcı' : 'Sen'}: ${msg.content}`)
            .join('\n');
          contextSummary = `\n\nÖNCEKİ KONUŞMA:\n${previousExchanges}\n\nBu bağlamı dikkate alarak, henüz netleşmemiş noktaları sorgula.`;
        }

        systemPrompt = SOCRATIC_DISCOVERY_PROMPT + contextSummary;
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

    let response;
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

    // Use CORTEX for all research-related conversations (both Socratic and plan generation)
    if (isResearchRelated && openaiApiKey) {
      if (shouldGenerateResearchPlan) {
        console.log('Using CORTEX model for research plan generation');
        // Include conversation context for better plan generation
        const contextMessage = conversationHistory.length > 0
          ? `Önceki konuşma bağlamı:\n${conversationHistory.map(m => `${m.role}: ${m.content}`).join('\n')}\n\nMevcut talep: ${message}`
          : message;

        response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: CORTEX_MODEL,
            messages: [
              { role: 'system', content: CORTEX_SYSTEM_PROMPT },
              { role: 'user', content: contextMessage }
            ],
            temperature: 0.7,
            max_tokens: 1000,
          }),
        });
      } else {
        console.log('Using CORTEX model for Socratic discovery');
        response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: CORTEX_MODEL,
            messages: messages,
            temperature: 0.8,
            max_tokens: 500,
          }),
        });
      }
    } else {
      // Use Lovable Gateway for non-research conversations
      response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lovableApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: messages,
          temperature: 0.7,
          max_tokens: 1000,
        }),
      });
    }

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
        // Strip markdown code block wrapper if present (```json ... ```)
        let jsonString = reply;
        if (jsonString.includes('```json')) {
          jsonString = jsonString.replace(/```json\s*/g, '').replace(/```\s*/g, '');
        } else if (jsonString.includes('```')) {
          jsonString = jsonString.replace(/```\s*/g, '');
        }
        jsonString = jsonString.trim();

        const parsed = JSON.parse(jsonString);
        researchPlan = parsed.researchPlan;

        // Generate contextual response based on the research plan
        // Don't use the generic chatResponse from CORTEX
        const planTitle = researchPlan?.title || 'araştırma';
        const firstSection = researchPlan?.sections?.[0]?.title || '';
        const questionCount = researchPlan?.sections?.reduce((acc: number, s: any) => acc + (s.questions?.length || 0), 0) || 9;

        // Create a contextual response based on the plan content
        reply = `${planTitle} için ${questionCount} soruluk bir görüşme planı hazırladım. ${firstSection} ile başlayıp kullanıcı deneyimini derinlemesine keşfedeceğiz.`;

      } catch (e) {
        console.log('Failed to parse JSON, using original response:', e);
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
      error: error instanceof Error ? error.message : 'Internal server error',
      reply: 'Üzgünüm, şu anda bir hata oluştu. Lütfen tekrar deneyin.'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});