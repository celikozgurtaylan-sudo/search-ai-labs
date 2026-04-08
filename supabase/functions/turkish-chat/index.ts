import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  buildFallbackQuestions,
  ensureWarmupSection,
  repairGeneratedQuestions,
  sanitizeGeneratedQuestions,
  WARMUP_SECTION_TITLE,
} from "../_shared/question-quality.ts";

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
              minItems: 3,
              maxItems: 4,
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  title: { type: "string" },
                  questions: {
                    type: "array",
                    minItems: 2,
                    maxItems: 4,
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
- Daha fazla baglam gerektiginde → en fazla 1 kisa netlestirici soru sor
- Genel sohbet oldugunda → Kisa ve yardimci yanit ver
- researchPlan alani null olmali

# YANIT TONU
- Kisa mesaja kisa yanit ver
- Detayli mesaja yalnizca gerektigi kadar detayli yanit ver
- Dogal, net ve insan gibi yaz
- Asla yapay nezaket veya kurumsal giris kullanma
- "Harika", "memnuniyet duyarim", "size yardimci olmak isterim", "birkac sorum olacak" gibi robotik kaliplardan kacın
- Maddeli listeyi ancak kullanici gercekten birden fazla sey sordugunda veya liste acikca faydaliysa kullan

# NETLESTIRICI SORU TEKNIGI
- Acik uclu ama kisa sor
- Tek mesajda en fazla 1 soru sor
- Kullanici cok kisa yazdiysa tek bir kritik eksigi netlestir
- Gereksiz soru zinciri kurma
- Samimi ama duz bir ton kullan

# SORU METODOLOJISI
- Her researchPlan ilk bolum olarak mutlaka "${WARMUP_SECTION_TITLE}" bolumunu icermeli
- Bu ilk bolum 2-3 kisa isınma / rapport sorusundan olusmali
- Ilk soru mutlaka kullanicinin gunune veya o ana kadar ne yaptigina degmeli
- Sonraki bolumler genisten ozele ilerlemeli: baglam/davranis -> ana deneyim/gorev -> degerlendirme/iyilestirme
- Sorular tek odakli olmali; ayni soruda iki farkli seyi sorma
- Sorular kullanicinin bir problem yasadigini varsaymamali

# ARASTIRMA PLANI KURALLARI
- chatResponse: Baglama uygun, spesifik bir yanit. Kullanicinin konusuna ozel giris yap.
- researchPlan.title: Arastirma basligini olustur
- researchPlan.sections: En az 3 bolum, her bolumde 2-4 soru
- Ilk bolumun title'i mutlaka "${WARMUP_SECTION_TITLE}" olmali
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
  "chatResponse": "Hangi urun ya da akis icin arastirma yapmak istiyorsunuz?",
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
- Section id'leri snake_case Ingilizce olmali
- researchPlan.sections sayisi 3 veya 4 olmali, 5. bolum ASLA uretme
- Section title'lari sabit ve jenerik kaliplar olmasin; her title o bolumun arastirma odagini net anlatsin
- "Giris", "Ana Sorular", "Detayli Kesif", "Son Dusunceler" gibi genel title'lari tekrar etme`;

const slugifySectionId = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "section";

const normalizeForMatch = (value: string) =>
  value
    .toLocaleLowerCase('tr-TR')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u')
    .replace(/\s+/g, ' ')
    .trim();

const cleanText = (value: string, fallback = "") => {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized || fallback;
};

const isGenericSectionTitle = (title: string) => {
  const normalized = normalizeForMatch(title);

  const genericPatterns = [
    /^giris(?: ve isinma)?$/,
    /^isinma$/,
    /^ilk izlenimler$/,
    /^detayli kesif$/,
    /^ana sorular$/,
    /^ana baslik$/,
    /^background$/,
    /^introduction$/,
    /^overview$/,
    /^closing$/,
    /^final thoughts$/,
    /^son dusunceler(?: ve oneriler)?$/,
    /^kapanis$/,
    /^oneriler$/,
    /^summary$/,
    /^wrap up$/,
  ];

  return genericPatterns.some((pattern) => pattern.test(normalized));
};

const inferSectionTitle = (questions: string[], index: number) => {
  const corpus = normalizeForMatch(questions.join(' '));

  if (/(ilk|ilk bakis|izlenim|dikkat|mesaj|ilk gordugunuzde|ilk gordugunde|anlad)/.test(corpus)) {
    return 'Ilk Algi ve Mesaj';
  }

  if (/(gorev|akis|adim|ilerl|tamamla|nasil yap|nasil kullan|yolculuk|is akis)/.test(corpus)) {
    return 'Akis ve Gorev Adimlari';
  }

  if (/(acik|net|anlas|guven|karar|beklenti|tercih)/.test(corpus)) {
    return 'Karar Verme ve Anlasilirlik';
  }

  if (/(deger|fayda|motivasyon|neden tercih|neden kullan|ihtiyac|cozum)/.test(corpus)) {
    return 'Deger ve Motivasyon';
  }

  if (/(karsilast|rakip|alternatif)/.test(corpus)) {
    return 'Karsilastirma ve Tercih';
  }

  if (/(oner|degistir|gelistir|iyilestir|firsat)/.test(corpus)) {
    return 'Iyilestirme Firsatlari';
  }

  const fallbackTitles = [
    'Kullanim Baglami ve Beklentiler',
    'Ilk Algi ve Anlama',
    'Akis ve Karar Verme',
    'Iyilestirme Firsatlari',
  ];

  return fallbackTitles[index] || `Arastirma Odagi ${index + 1}`;
};

const normalizeResearchPlan = (plan: any) => {
  if (!plan || !Array.isArray(plan.sections)) {
    return plan;
  }

  const usedTitles = new Set<string>();
  const normalizedSections = plan.sections
    .filter(Boolean)
    .slice(0, 4)
    .map((section: any, index: number) => {
      const rawQuestions = Array.isArray(section?.questions)
        ? section.questions
            .map((question: string) => cleanText(question))
            .filter(Boolean)
            .slice(0, 4)
        : [];

      const rawTitle = cleanText(section?.title);
      const repairedQuestions = repairGeneratedQuestions(rawQuestions, {
        sectionTitle: rawTitle,
        sectionIndex: index,
      });

      let { valid: questions } = sanitizeGeneratedQuestions(repairedQuestions, {
        sectionTitle: rawTitle,
        sectionIndex: index,
      });

      if (questions.length < 2) {
        questions = [...questions, ...buildFallbackQuestions(rawTitle, index)]
          .slice(0, 4);
      }

      const preferredTitle = rawTitle && !isGenericSectionTitle(rawTitle)
        ? rawTitle
        : inferSectionTitle(questions, index);

      let title = preferredTitle;
      let dedupeIndex = 2;
      while (usedTitles.has(title)) {
        title = `${preferredTitle} ${dedupeIndex}`;
        dedupeIndex += 1;
      }
      usedTitles.add(title);

      return {
        id: slugifySectionId(cleanText(section?.id, title) || title),
        title,
        questions,
      };
    })
    .filter((section: any) => section.questions.length > 0);

  return ensureWarmupSection({
    ...plan,
    title: cleanText(plan.title, 'Kullanici Arastirmasi'),
    sections: normalizedSections,
  });
};

const describeGuideContext = (guide: any) => {
  const normalizedGuide = normalizeResearchPlan(guide);

  if (!normalizedGuide?.sections?.length) {
    return '';
  }

  const sections = normalizedGuide.sections
    .map((section: any, index: number) => {
      const questions = Array.isArray(section.questions)
        ? section.questions.map((question: string, questionIndex: number) => `  ${questionIndex + 1}. ${question}`).join('\n')
        : '  - Soru yok';

      return `${index + 1}. [${section.id}] ${section.title}\n${questions}`;
    })
    .join('\n\n');

  return `CURRENT_RESEARCH_PLAN:
Baslik: ${normalizedGuide.title}

Bolumler:
${sections}`;
};

const normalizeGuideQuestion = (question: string) => normalizeForMatch(cleanText(question));

const isAdditiveGuideEditRequest = (message: string) => {
  const normalized = normalizeForMatch(message);

  const additiveKeywords = [
    'ekle',
    'daha fazla',
    'ek olarak',
    'biraz daha',
    'artir',
    'arttir',
    'cogalt',
    'genislet',
    'yer ver',
    'soru daha',
    'yeni soru',
    'yeni bolum',
  ];

  const subtractiveKeywords = ['sil', 'kaldir', 'cikar', 'azalt'];

  return additiveKeywords.some((keyword) => normalized.includes(keyword)) &&
    !subtractiveKeywords.some((keyword) => normalized.includes(keyword));
};

const mergeAdditiveGuideUpdate = (currentGuide: any, nextGuide: any) => {
  const normalizedCurrentGuide = normalizeResearchPlan(currentGuide);
  const normalizedNextGuide = normalizeResearchPlan(nextGuide);

  if (!normalizedCurrentGuide?.sections?.length || !normalizedNextGuide?.sections?.length) {
    return normalizedNextGuide;
  }

  const mergedSections = normalizedCurrentGuide.sections.map((currentSection: any) => {
    const matchingSection = normalizedNextGuide.sections.find((candidate: any) =>
      candidate.id === currentSection.id ||
      normalizeForMatch(candidate.title) === normalizeForMatch(currentSection.title)
    );

    if (!matchingSection) {
      return currentSection;
    }

    const seenQuestions = new Set(
      (currentSection.questions || []).map((question: string) => normalizeGuideQuestion(question)),
    );

    const appendedQuestions = (matchingSection.questions || []).filter((question: string) => {
      const normalizedQuestion = normalizeGuideQuestion(question);

      if (!normalizedQuestion || seenQuestions.has(normalizedQuestion)) {
        return false;
      }

      seenQuestions.add(normalizedQuestion);
      return true;
    });

    return {
      ...currentSection,
      title: matchingSection.title || currentSection.title,
      questions: [...(currentSection.questions || []), ...appendedQuestions],
    };
  });

  const additionalSections = normalizedNextGuide.sections.filter((nextSection: any) =>
    !normalizedCurrentGuide.sections.some((currentSection: any) =>
      currentSection.id === nextSection.id ||
      normalizeForMatch(currentSection.title) === normalizeForMatch(nextSection.title)
    )
  );

  return {
    ...normalizedCurrentGuide,
    title: normalizedNextGuide.title || normalizedCurrentGuide.title,
    sections: [...mergedSections, ...additionalSections],
  };
};

const requestStructuredResponse = async (openaiApiKey: string, messages: any[]) => {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      response_format: RESPONSE_FORMAT,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Searcho] API error:', errorText);
    throw new Error(`API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
};

const buildUsabilityFallbackPlan = (message: string, researchContext: any) => {
  const usability = researchContext?.usabilityTesting || {};
  const titleBase = usability.objective || message || "Kullanilabilirlik Testi";
  const primaryTask = usability.primaryTask || "Belirtilmedi";
  const targetUsers = usability.targetUsers || "Belirtilmedi";
  const successSignals = usability.successSignals || "Belirtilmedi";
  const riskAreas = usability.riskAreas || "Belirtilmedi";
  const screenNames = Array.isArray(researchContext?.designScreens) && researchContext.designScreens.length > 0
    ? researchContext.designScreens.map((screen: any, index: number) => screen?.name || `Screen ${index + 1}`).join(", ")
    : "Paylasilan ekranlar";

  const sections = [
    {
      id: slugifySectionId("task_flow"),
      title: "Ilk Gorev Algi ve Beklentiler",
      questions: [
        `${screenNames} ekranlarina baktiginizda ilk olarak ne yapmaniz gerektigini nasil anliyorsunuz?`,
        `${primaryTask} gorevini tamamlarken adimlari kendi cümlelerinizle nasil tarif edersiniz?`,
        `Bu akista ilerlerken size neyin net, neyin daha fazla aciklama gerektirdigini anlatir misiniz?`,
      ],
    },
    {
      id: slugifySectionId("clarity_and_trust"),
      title: "Karar Verme ve Ekran Netligi",
      questions: [
        `Bu ekranlarda karar vermenize en cok hangi bilgi yardimci oluyor?`,
        `Karar vermeden once biraz daha aciklama gormek isteyeceginiz bir nokta var mi, varsa neresi?`,
        `Bu deneyimin ${targetUsers} icin nasil bir izlenim biraktigini anlatir misiniz?`,
      ],
    },
    {
      id: slugifySectionId("friction_and_improvements"),
      title: "Surtunme ve Iyilestirme Firsatlari",
      questions: [
        `${riskAreas} basligina baktiginizda dikkatinizi en cok hangi ekran veya adim cekiyor?`,
        `${successSignals} hedefine ulasmak icin bu deneyimde hangi degisiklikler en cok fark yaratir?`,
        `Bu gorevi daha hizli ve daha rahat tamamlayabilmeniz icin ilk neyi degistirirdiniz?`,
      ],
    },
  ];

  return {
    action: "PLAN",
    chatResponse: "Kullanilabilirlik testi baglamina gore arastirma planinizi olusturdum. Sorular gorev akisi, anlasilirlik, guven ve surtunme noktalarina odaklaniyor.",
    researchPlan: ensureWarmupSection({
      title: `${titleBase} Kullanilabilirlik Arastirmasi`,
      sections,
    }),
  };
};

const describeScreenForPrompt = (screen: any, index: number) => {
  const name = screen?.name || `Screen ${index + 1}`;
  const source = screen?.source || 'unknown';
  const rawUrl = typeof screen?.url === 'string' ? screen.url : '';
  const urlDescription = rawUrl.startsWith('data:image/')
    ? '[inline-image-attached]'
    : rawUrl
      ? rawUrl
      : '[no-url]';

  return `${name} (${source}): ${urlDescription}`;
};

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

    const {
      message,
      conversationHistory = [],
      researchContext = null,
      guideContext = null,
      forcePlan = false,
      forceGuideEditPlan = false,
    } = await req.json();
    console.log(`[Searcho] Message: "${message.substring(0, 80)}..."`);
    console.log(`[Searcho] Conversation depth: ${Math.floor(conversationHistory.length / 2)}`);

    const normalizedGuideContext = normalizeResearchPlan(guideContext);

    // Build messages — system prompt as first user message (reasoning models)
    // then conversation history, then current message
    const messages: any[] = [
      { role: 'user', content: SYSTEM_PROMPT },
      { role: 'assistant', content: 'Anlasıldı. Searcho AI asistanı olarak hazırım. Kullanıcının mesajını bekliyor ve karar çerçeveme göre yanıt vereceğim.' }
    ];

    if (researchContext?.usabilityTesting) {
      const usableScreens = Array.isArray(researchContext.designScreens)
        ? researchContext.designScreens.map((s: any, index: number) => describeScreenForPrompt(s, index)).join('\n')
        : '';

      const usabilityContextPrompt = `USABILITY_TESTING_CONTEXT:
Bu proje ekran tabanli kullanilabilirlik testidir. Konusma boyunca su prensipleri uygula:
- Belirsiz noktalarda kullaniciya netlestirici sorular sor.
- Sorulari gorev tamamlama, anlasilirlik, guven, karar verme ve surtunme noktalarina odakla.
- PLAN olustururken bolum ve sorulari ekran kullanilabilirligi odakli kur.

Arastirma amaci: ${researchContext.usabilityTesting.objective || 'Belirtilmedi'}
Ana kullanici gorevi: ${researchContext.usabilityTesting.primaryTask || 'Belirtilmedi'}
Hedef kullanicilar: ${researchContext.usabilityTesting.targetUsers || 'Belirtilmedi'}
Basari kriterleri: ${researchContext.usabilityTesting.successSignals || 'Belirtilmedi'}
Riskli alanlar: ${researchContext.usabilityTesting.riskAreas || 'Belirtilmedi'}
Ek yonlendirme: ${researchContext.usabilityTesting.guidancePrompt || 'Yok'}
Screen listesi:
${usableScreens || 'Screen bilgisi yok'}`;

      messages.push({ role: 'user', content: usabilityContextPrompt });
      messages.push({ role: 'assistant', content: 'Usability test baglamini aldim. Sorularimi ekran kullanilabilirligi ekseninde kuracagim.' });

      if (forcePlan || conversationHistory.length === 0) {
        messages.push({
          role: 'user',
          content: `Bu ilk degerlendirme turu. Netlestirme sorulari sormadan dogrudan action=PLAN ile kullanilabilirlik odakli arastirma plani uret. researchPlan null olamaz.`,
        });
      }
    }

    if (normalizedGuideContext?.sections?.length) {
      messages.push({
        role: 'user',
        content: `${describeGuideContext(normalizedGuideContext)}

Kurallar:
- Eger kullanici mevcut arastirma plani, bolumleri veya sorulari uzerinde bir degisiklik istiyorsa action=PLAN don.
- PLAN donerken sadece degisen parcayi degil, TAM ve GUNCEL researchPlan don.
- Kullanici acikca sil, kaldir veya cikar demedikce mevcut bolumleri ve sorulari koru.
- Mevcut section id'lerini korumaya calis.
- Kullanici sadece belirli bir bolumu tweak etmek istiyorsa diger bolumleri aynen koru.`,
      });
      messages.push({
        role: 'assistant',
        content: 'Mevcut arastirma planini aldim. Plani guncellerken tum plani geri donecek ve belirtilmeyen bolumleri koruyacagim.',
      });
    }

    if (forceGuideEditPlan && normalizedGuideContext?.sections?.length) {
      messages.push({
        role: 'user',
        content: 'Kullanici mevcut arastirma planini guncellemek istiyor. action=PLAN ile yanit ver. researchPlan null olamaz. Tam guncellenmis plani dondur.',
      });
    }

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
    let content = await requestStructuredResponse(openaiApiKey, messages);

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

    if ((forcePlan || (researchContext?.usabilityTesting && conversationHistory.length === 0)) && (parsed.action !== 'PLAN' || parsed.researchPlan === null)) {
      console.log('[Searcho] Model returned CHAT while PLAN was required, using fallback usability plan');
      parsed = buildUsabilityFallbackPlan(message, researchContext);
    }

    if (forceGuideEditPlan && normalizedGuideContext?.sections?.length && (parsed.action !== 'PLAN' || parsed.researchPlan === null)) {
      console.log('[Searcho] Model returned CHAT while guide edit PLAN was required, retrying with stronger instruction');

      content = await requestStructuredResponse(openaiApiKey, [
        ...messages,
        {
          role: 'assistant',
          content: typeof parsed.chatResponse === 'string' ? parsed.chatResponse : 'Plani guncelliyorum.',
        },
        {
          role: 'user',
          content: 'Yaniti yeniden uret. Bu istek mevcut arastirma planini guncelleme istegi. action=PLAN don. researchPlan null olamaz. Mevcut plandaki belirtilmeyen bolumleri ve sorulari koru, sadece gereken yerleri guncelle ve TAM plani dondur.',
        },
      ]);

      parsed = JSON.parse(content);
    }

    const isResearchPlan = parsed.action === 'PLAN' && parsed.researchPlan !== null;

    if (isResearchPlan) {
      parsed.researchPlan = normalizeResearchPlan(parsed.researchPlan);

      if (forceGuideEditPlan && isAdditiveGuideEditRequest(message) && normalizedGuideContext?.sections?.length) {
        parsed.researchPlan = mergeAdditiveGuideUpdate(normalizedGuideContext, parsed.researchPlan);
      }
    }

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
