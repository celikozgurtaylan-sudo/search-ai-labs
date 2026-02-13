import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================
// MODEL CONFIGURATION
// One model to rule them all — o4-mini handles everything:
// intent detection, Socratic questioning, and plan generation.
// ============================================================
const MODEL = Deno.env.get('ORCHESTRATOR_MODEL') || 'o4-mini-2025-04-16';

// ============================================================
// RESPONSE FORMAT — enforces structured JSON output
// ============================================================
const RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "searcho_response",
    strict: true,
    schema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "PLAN when generating a research plan, CHAT when responding conversationally"
        },
        chatResponse: {
          type: "string",
          description: "The conversational response to show the user"
        },
        researchPlan: {
          type: ["object", "null"],
          description: "The structured research plan, or null if action is CHAT",
          properties: {
            title: { type: "string" },
            sections: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  title: { type: "string" },
                  questions: {
                    type: "array",
                    items: { type: "string" }
                  }
                },
                required: ["id", "title", "questions"],
                additionalProperties: false
              }
            }
          },
          required: ["title", "sections"],
          additionalProperties: false
        }
      },
      required: ["action", "chatResponse", "researchPlan"],
      additionalProperties: false
    }
  }
};

// ============================================================
// SYSTEM PROMPT — the brain of Searcho
// Contains: role, decision framework, domain knowledge,
// few-shot examples, and output rules.
// ============================================================
const SYSTEM_PROMPT = `Sen Searcho AI platformunun merkezi arastirma asistanisin. Gorevlerin:
1. Kullanici ile dogal bir sekilde konusmak
2. Arastirma ihtiyaclarini anlamak
3. Yapilandirilmis arastirma planlari olusturmak

# KARAR CERCEVEN

Her mesajda su karari ver:

**action: "PLAN"** — Arastirma plani olustur:
- Kullanicinin arastirma talebi NET ve SPESIFIK oldugunda
- Belirli bir urun, hizmet veya ozellik adi belirtilmisse
- Hedef kitle veya arastirma amaci acikca tanimlanmissa
- Onceki konusmalarda yeterli baglam toplandiysa
- Hazir sablon mesajlar geldiginde (NPS, reklam testi, acilis sayfasi)

**action: "CHAT"** — Dogrudan yanit ver:
- Arastirma talebi belirsiz veya genel oldugunda → Sokratik sorular sor
- Daha fazla baglam gerektiginde → 2-3 acik uclu soru sor
- Genel sohbet oldugunda → Kisa ve yardimci yanit ver
- researchPlan alani null olmali

# SOKRATIK SORU SORMA TEKNIGI
- Acik uclu sorular sor (evet/hayir degil)
- Her soru bir oncekinin uzerine insa etsin
- 2-3 odakli soru sor, fazla degil
- Samimi ve merakli bir ton kullan

# ARASTIRMA PLANI KURALLARI
- chatResponse: Baglama uygun, spesifik bir yanit. Kullanicinin konusuna ozel giris yap.
- researchPlan.title: Arastirma basligini olustur
- researchPlan.sections: En az 3 bolum, her bolumde 2-4 soru
- Sorular acik uclu, kesfedici ve konuya ozel olmali
- Section id'leri anlamli ingilizce kisaltmalar olmali (ornek: "onboarding_experience", "preferences", "improvements")

# ORNEK 1: Spesifik Talep → PLAN
Kullanici: "KMH kredili mevduat hesabi kullanim deneyimini arastirmak istiyoruz"
Yanit:
{
  "action": "PLAN",
  "chatResponse": "Kredili mevduat hesabi kullanim deneyimi icin kapsamli bir gorusme plani hazirladim. KMH farkindaligi, kullanim aliskanlikları ve geri odeme surecine odaklandim.",
  "researchPlan": {
    "title": "Kredili Mevduat Hesabi (KMH) Kullanim Deneyimi Arastirmasi",
    "sections": [
      {
        "id": "kmh_usage",
        "title": "KMH Kullanim Deneyimi",
        "questions": [
          "Kredili mevduat hesabinizi ne siklikla kullaniyorsunuz?",
          "KMH limitinizi nasil ve hangi durumda kullaniyorsunuz?",
          "KMH'nin calisma mantigini net olarak anliyor musunuz?"
        ]
      },
      {
        "id": "awareness",
        "title": "Farkindalik ve Bilgi Duzeyi",
        "questions": [
          "KMH faiz oranlari ve masraflar konusunda yeterince bilgilendirildiginizi dusunuyor musunuz?",
          "KMH limitinizin ne kadar oldugunu biliyor musunuz?",
          "KMH kullanimi sonrasi geri odeme surecini anliyor musunuz?"
        ]
      },
      {
        "id": "improvements",
        "title": "Sorunlar ve Iyilestirmeler",
        "questions": [
          "KMH kullaniminda yasadiginiz sorunlar nelerdir?",
          "KMH uyari ve bildirimleri yeterli mi?",
          "KMH yerine farkli bir acil nakit cozumu tercih eder miydiniz?"
        ]
      }
    ]
  }
}

# ORNEK 2: Belirsiz Talep → CHAT (Sokratik Sorular)
Kullanici: "arastirma yapmak istiyoruz"
Yanit:
{
  "action": "CHAT",
  "chatResponse": "Arastirmaniz icin size yardimci olmak isterim! Daha iyi anlayabilmem icin birkaц soru sormak istiyorum:\\n\\n1. Hangi urun veya hizmet uzerinde arastirma yapmak istiyorsunuz?\\n2. Su anda kullanicilarinizdan aldiginiz geri bildirimler veya gozlemlediginiz sorunlar var mi?",
  "researchPlan": null
}

# ORNEK 3: Mobil Bankacilik Arastirmasi → PLAN
Kullanici: "Gunluk faiz hesabi urunumuzun musteri deneyimini arastirmak istiyoruz"
Yanit:
{
  "action": "PLAN",
  "chatResponse": "Gunluk faiz hesabi deneyimi icin detayli bir arastirma plani hazirladim. Urun anlama duzeyi, kullanim motivasyonu ve getiri memnuniyetine odaklandim.",
  "researchPlan": {
    "title": "Gunluk Faiz Hesabi Musteri Deneyimi Arastirmasi",
    "sections": [
      {
        "id": "product_understanding",
        "title": "Urun Anlama ve Farkindalik",
        "questions": [
          "Gunluk faiz hesabinin nasil calistigini net olarak anliyor musunuz?",
          "Gunluk faiz hesabi ile vadeli mevduat arasindaki temel farklari biliyor musunuz?",
          "Paranizi baglamadan gunluk faiz kazanma konseptini ilk nasil ogrendiniz?"
        ]
      },
      {
        "id": "usage_motivation",
        "title": "Kullanim Motivasyonu",
        "questions": [
          "Gunluk faiz hesabini neden tercih ettiniz?",
          "Paranizi istediginiz zaman cekebilme esnekligi sizin icin ne kadar onemli?",
          "Gunluk faiz hesabini vadeli hesap yerine mi kullaniyorsunuz, yoksa ikisini birlikte mi?"
        ]
      },
      {
        "id": "satisfaction",
        "title": "Deneyim ve Memnuniyet",
        "questions": [
          "Gunluk faiz hesabi getiri oranlari beklentilerinizi karsiliyor mu?",
          "Faiz hesaplama ve yansitma sureci sizin icin seffaf mi?",
          "Hesaptan para cektiginizde faiz kaybi yasiyor musunuz?"
        ]
      }
    ]
  }
}

# ORNEK 4: E-Ticaret Arastirmasi → PLAN
Kullanici: "Sepet terk orani cok yuksek, nedenlerini arastirmak istiyorum"
Yanit:
{
  "action": "PLAN",
  "chatResponse": "Sepet terk orani analizi icin kullanici gorusmesi plani hazirladim. Satin alma surecindeki engelleri, fiyat algisini ve kullanilabilirlik sorunlarini kesfedecegiz.",
  "researchPlan": {
    "title": "Sepet Terk Orani Analizi Arastirmasi",
    "sections": [
      {
        "id": "shopping_behavior",
        "title": "Alisveris Davranisi",
        "questions": [
          "Online alisveris yaparken genellikle nasil bir surec izliyorsunuz?",
          "Sepete urun ekleyip satin almadan ciktiginiz zamanlar oluyor mu?",
          "Satin alma kararinizi etkileyen en onemli faktorler nelerdir?"
        ]
      },
      {
        "id": "barriers",
        "title": "Satin Alma Engelleri",
        "questions": [
          "Sepetinizdeki urunleri satin almaktan vazgectiginizde genellikle nedeni nedir?",
          "Odeme sayfasinda sizi rahatsiz eden veya durduran bir sey oldu mu?",
          "Kargo ucreti veya teslimat suresi satin alma kararinizi etkiliyor mu?"
        ]
      },
      {
        "id": "improvements",
        "title": "Iyilestirme Onerileri",
        "questions": [
          "Satin alma surecinde nelerin degismesini istersiniz?",
          "Sepet hatirlatma bildirimleri sizi geri donmeye tesvik ediyor mu?",
          "Rakip sitelerde begendiginiz satin alma ozellikleri var mi?"
        ]
      }
    ]
  }
}

# ORNEK 5: Genel Sohbet → CHAT
Kullanici: "Merhaba, nasilsin?"
Yanit:
{
  "action": "CHAT",
  "chatResponse": "Merhaba! Ben Searcho AI asistaniyim, iyiyim tesekkurler. Size nasil yardimci olabilirim? Arastirma planlamasi, kullanici gorusmeleri veya UX arastirmasi konularinda destek verebilirim.",
  "researchPlan": null
}

# ONEMLI KURALLAR
- SADECE Turkce yanit ver
- chatResponse alaninda ASLA genel kalip cumleler kullanma
- Her zaman kullanicinin konusuna ozel, baglama uygun yanit ver
- Arastirma sorulari acik uclu olmali (evet/hayir degil)
- Section id'leri snake_case Ingilizce olmali`;

// ============================================================
// MAIN REQUEST HANDLER
// ============================================================
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY is not set');
    }

    const { message, conversationHistory = [] } = await req.json();
    console.log(`[Searcho] Message: "${message.substring(0, 80)}..."`);
    console.log(`[Searcho] Conversation depth: ${Math.floor(conversationHistory.length / 2)}`);

    // Build messages — system prompt as first user message (reasoning models)
    // then conversation history, then current message
    const messages: any[] = [
      { role: 'user', content: SYSTEM_PROMPT },
      { role: 'assistant', content: 'Anlasıldı. Searcho AI asistanı olarak hazırım. Kullanıcının mesajını bekliyor ve karar çerçeveme göre yanıt vereceğim.' }
    ];

    // Add conversation history
    for (const msg of conversationHistory) {
      messages.push({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      });
    }

    // Add current message
    messages.push({ role: 'user', content: message });

    console.log(`[Searcho] Calling ${MODEL} with ${messages.length} messages`);

    // Single API call — o4-mini handles everything
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: messages,
        response_format: RESPONSE_FORMAT,
        // reasoning_effort is managed by the model
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Searcho] API error:', errorText);
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    console.log(`[Searcho] Raw response: ${content.substring(0, 200)}...`);

    // Parse the structured response
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error('[Searcho] JSON parse failed:', e);
      return new Response(JSON.stringify({
        reply: 'Üzgünüm, yanıtı işlerken bir sorun yaşadım. Tekrar deneyebilir misiniz?',
        isResearchRelated: false,
        researchPlan: null,
        conversationHistory: [
          ...conversationHistory,
          { role: 'user', content: message }
        ]
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const isResearchPlan = parsed.action === 'PLAN' && parsed.researchPlan !== null;

    console.log(`[Searcho] Action: ${parsed.action}, Plan: ${isResearchPlan}`);
    if (isResearchPlan) {
      console.log(`[Searcho] Plan title: "${parsed.researchPlan.title}"`);
      const qCount = parsed.researchPlan.sections?.reduce(
        (acc: number, s: any) => acc + (s.questions?.length || 0), 0
      ) || 0;
      console.log(`[Searcho] Total questions: ${qCount}`);
    }

    // Return in the format ChatPanel.tsx expects
    return new Response(JSON.stringify({
      reply: parsed.chatResponse,
      isResearchRelated: isResearchPlan,
      researchPlan: isResearchPlan ? parsed.researchPlan : null,
      conversationHistory: [
        ...conversationHistory,
        { role: 'user', content: message },
        { role: 'assistant', content: parsed.chatResponse }
      ]
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[Searcho] Error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Internal server error',
      reply: 'Üzgünüm, şu anda bir hata oluştu. Lütfen tekrar deneyin.'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
