import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildFallbackQuestions,
  ensureWarmupSection,
  repairGeneratedQuestions,
  resolveQuestionMode,
  sanitizeGeneratedQuestions,
  WARMUP_SECTION_TITLE,
  type ResearchQuestionMode,
} from "../_shared/question-quality.ts";
import {
  formatQuestionLearningHints,
  loadQuestionLearningHints,
} from "../_shared/question-learning.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

// ============================================================
// MODEL CONFIGURATION
// One model to rule them all — o4-mini handles everything:
// intent detection, Socratic questioning, and plan generation.
// ============================================================
const MODEL = Deno.env.get('ORCHESTRATOR_MODEL') || 'gpt-4.1';
const MAX_RECENT_TURNS = 6;
const MAX_SUMMARY_ITEMS = 8;
const MAX_SUMMARY_CHARS = 160;

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
- Ilk mesajda dogrudan plan dokmeye acele etme; kritik bir bosluk varsa once tek kisa netlestirme yap

**action: "CHAT"** — Dogrudan yanit ver:
- Arastirma talebi belirsiz veya genel oldugunda → Sokratik sorular sor
- Daha fazla baglam gerektiginde → en fazla 1 kisa netlestirici soru sor
- Genel sohbet oldugunda → Kisa ve yardimci yanit ver
- researchPlan alani null olmali
- Ilk turda konu net olsa bile eksik baglami once kisa bir soruyla topla

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
- Merakli ol ama kullaniciyi bunaltma
- Gereksiz yere plani erken acma; once en kritik eksigi kapat

# SORU METODOLOJISI
- Her researchPlan ilk bolum olarak mutlaka "${WARMUP_SECTION_TITLE}" bolumunu icermeli
- Bu ilk bolum 2-3 kisa isınma / rapport sorusundan olusmali
- Ilk soru mutlaka kullanicinin gunune veya o ana kadar ne yaptigina degmeli
- Sonraki bolumler genisten ozele ilerlemeli: baglam/davranis -> ana deneyim/gorev -> degerlendirme/iyilestirme
- Sorular tek odakli olmali; ayni soruda iki farkli seyi sorma
- Sorular kullanicinin bir problem yasadigini varsaymamali
- Mümkünse soru metninde "ve" kullanma; iki farkli odagi ayri sorulara bol
- "Kendi cumlelerinizle" gibi zorlayici paraphrase kaliplari kullanma
- "Nasil anliyorsunuz" gibi yorum yonlendiren kaliplari kullanma
- Ozellikle usability baglaminda UI ogesini once sen isimlendirip sonra anlamini sorma

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
          "Kredili mevduat hesabinizi en cok hangi durumlarda kullaniyorsunuz?",
          "KMH limitini kullanmaya karar verdiginiz anlari biraz anlatir misiniz?",
          "KMH'nin nasil calistigina dair sizde nasil bir anlayis olustu?"
        ]
      },
      {
        "id": "awareness",
        "title": "Farkindalik ve Bilgi Duzeyi",
        "questions": [
          "KMH faiz oranlariyla ilgili ilk baktiginiz bilgiler size ne anlatiyor?",
          "KMH limitinizle ilgili en cok hangi bilgi aklinizda kaliyor?",
          "KMH kullandiktan sonraki geri odeme surecini siz nasil tarif edersiniz?"
        ]
      },
      {
        "id": "improvements",
        "title": "Sorunlar ve Iyilestirmeler",
        "questions": [
          "KMH kullaniminda yasadiginiz sorunlar nelerdir?",
          "KMH bildirimlerini nasil degerlendiriyorsunuz?",
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
          "Gunluk faiz hesabinin nasil calistigina dair sizde nasil bir anlayis olusuyor?",
          "Gunluk faiz hesabini vadeli mevduattan ayiran temel nokta size ne ifade ediyor?",
          "Paranizi baglamadan gunluk faiz kazanma konseptini ilk nasil ogrendiniz?"
        ]
      },
      {
        "id": "usage_motivation",
        "title": "Kullanim Motivasyonu",
        "questions": [
          "Gunluk faiz hesabini neden tercih ettiniz?",
          "Paranizi istediginiz zaman cekebilme esnekligi sizin icin ne kadar onemli?",
          "Gunluk faiz hesabini diger birikim araclariyla nasil birlikte kullaniyorsunuz?"
        ]
      },
      {
        "id": "satisfaction",
        "title": "Deneyim ve Memnuniyet",
        "questions": [
          "Gunluk faiz hesabi getiri oranlarini gordugunuzde sizde nasil bir beklenti olusuyor?",
          "Faiz hesaplamasini ne kadar seffaf buluyorsunuz?",
          "Hesaptan para cekerken getiri tarafinda aklinizdan neler geciyor?"
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
          "Sepete urun ekleyip satin almadan ayrildiginiz anlarda genelde neler oluyor?",
          "Satin alma kararinizi etkileyen en onemli faktorler nelerdir?"
        ]
      },
      {
        "id": "barriers",
        "title": "Satin Alma Engelleri",
        "questions": [
          "Sepetinizdeki urunleri satin almaktan vazgectiginizde genellikle nedeni nedir?",
          "Odeme sayfasinda sizi durup yeniden dusunmeye iten seyler neler oluyor?",
          "Kargo ucreti veya teslimat suresi kararinizda nasil bir rol oynuyor?"
        ]
      },
      {
        "id": "improvements",
        "title": "Iyilestirme Onerileri",
        "questions": [
          "Satin alma surecinde nelerin degismesini istersiniz?",
          "Sepet hatirlatma bildirimlerini gordugunuzde sizde nasil bir etki olusuyor?",
          "Diger sitelerde gordugunuz hangi satin alma yaklasimlari size daha iyi geliyor?"
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
- Arastirma sorularinda mümkünse "ve" kullanma; tek odakli soru kur
- "Kendi cumlelerinizle" yazma
- "(...) nasil anliyorsunuz" gibi framing yapma
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

const normalizeResearchPlan = (plan: any, mode: ResearchQuestionMode = "interview") => {
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
        mode,
      });

      let { valid: questions } = sanitizeGeneratedQuestions(repairedQuestions, {
        sectionTitle: rawTitle,
        sectionIndex: index,
        mode,
      });

      if (questions.length < 2) {
        questions = [...questions, ...buildFallbackQuestions(rawTitle, index, mode)]
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

const describeGuideContext = (guide: any, mode: ResearchQuestionMode = "interview") => {
  const normalizedGuide = normalizeResearchPlan(guide, mode);

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

const mergeAdditiveGuideUpdate = (currentGuide: any, nextGuide: any, mode: ResearchQuestionMode = "interview") => {
  const normalizedCurrentGuide = normalizeResearchPlan(currentGuide, mode);
  const normalizedNextGuide = normalizeResearchPlan(nextGuide, mode);

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

const truncateText = (value: string, maxLength: number) =>
  value.length > maxLength ? `${value.slice(0, maxLength - 1).trimEnd()}...` : value;

const normalizeConversationHistory = (history: Array<{ role: string; content: string }>) =>
  (Array.isArray(history) ? history : [])
    .map((entry) => ({
      role: entry?.role === "assistant" ? "assistant" : "user",
      content: cleanText(entry?.content || ""),
    }))
    .filter((entry) => entry.content.length > 0);

const buildConversationWindow = (
  history: Array<{ role: string; content: string }>,
  existingSummary = "",
) => {
  const normalizedHistory = normalizeConversationHistory(history);
  const recentHistory = normalizedHistory.slice(-MAX_RECENT_TURNS);
  const olderHistory = normalizedHistory.slice(0, -MAX_RECENT_TURNS);
  const derivedSummary = olderHistory
    .slice(-MAX_SUMMARY_ITEMS)
    .map((entry) =>
      `${entry.role === "assistant" ? "Asistan" : "Kullanici"}: ${truncateText(entry.content, MAX_SUMMARY_CHARS)}`,
    )
    .join("\n");

  return {
    recentHistory,
    summary: cleanText([cleanText(existingSummary), derivedSummary].filter(Boolean).join("\n"), ""),
  };
};

const decodeEscapedCharacter = (nextChar: string) => {
  switch (nextChar) {
    case "n":
      return "\n";
    case "r":
      return "";
    case "t":
      return "\t";
    case '"':
      return '"';
    case "\\":
      return "\\";
    default:
      return nextChar;
  }
};

const extractPartialJsonStringField = (rawText: string, fieldName: string) => {
  const marker = `"${fieldName}"`;
  const markerIndex = rawText.indexOf(marker);
  if (markerIndex === -1) return "";

  const colonIndex = rawText.indexOf(":", markerIndex + marker.length);
  if (colonIndex === -1) return "";

  let cursor = colonIndex + 1;
  while (cursor < rawText.length && /\s/.test(rawText[cursor])) {
    cursor += 1;
  }

  if (rawText[cursor] !== '"') return "";
  cursor += 1;

  let value = "";
  let escaping = false;

  while (cursor < rawText.length) {
    const currentChar = rawText[cursor];

    if (escaping) {
      value += decodeEscapedCharacter(currentChar);
      escaping = false;
      cursor += 1;
      continue;
    }

    if (currentChar === "\\") {
      escaping = true;
      cursor += 1;
      continue;
    }

    if (currentChar === '"') {
      break;
    }

    value += currentChar;
    cursor += 1;
  }

  return value;
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

const requestStructuredResponseStream = async (
  openaiApiKey: string,
  messages: any[],
  onJsonDelta?: (rawText: string) => void,
) => {
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
      stream: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Searcho] Streaming API error:', errorText);
    throw new Error(`API error: ${response.status}`);
  }

  if (!response.body) {
    throw new Error('Streaming response body is missing');
  }

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = '';
  let rawText = '';

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

    let lineBreakIndex = buffer.indexOf('\n');
    while (lineBreakIndex !== -1) {
      const line = buffer.slice(0, lineBreakIndex).trim();
      buffer = buffer.slice(lineBreakIndex + 1);

      if (line.startsWith('data:')) {
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') {
          break;
        }

        const parsed = JSON.parse(payload);
        const delta = parsed?.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta.length > 0) {
          rawText += delta;
          onJsonDelta?.(rawText);
        }
      }

      lineBreakIndex = buffer.indexOf('\n');
    }

    if (done) {
      break;
    }
  }

  return rawText;
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
        `${screenNames} ekranlarina baktiginizda ilk olarak ne yapmaniz gerektigini size hangi isaretler anlatiyor?`,
        `${primaryTask} gorevini tamamlarken aklinizdan nasil bir ilerleme akisi geciyor?`,
        `Bu akista ilerlerken size neyin net, neyin daha fazla aciklama gerektirdigini anlatir misiniz?`,
      ],
    },
    {
      id: slugifySectionId("clarity_and_trust"),
      title: "Karar Verme ve Ekran Netligi",
      questions: [
        `Bu ekranlarda karar vermenize en cok hangi bilgi yardimci oluyor?`,
        `Karar vermeden once biraz daha aciklama gormek isteyeceginiz bir nokta var mi, varsa neresi?`,
        `Bu deneyim sizde nasil bir izlenim birakiyor?`,
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

  let requestedStream = false;

  try {
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY is not set');
    }

    const {
      message,
      conversationHistory = [],
      conversationSummary = "",
      researchContext = null,
      guideContext = null,
      researchMode = null,
      forcePlan = false,
      forceGuideEditPlan = false,
      stream = false,
    } = await req.json();
    requestedStream = stream === true;
    const normalizedMessage = cleanText(message || "");
    const { recentHistory, summary } = buildConversationWindow(conversationHistory, conversationSummary);
    console.log(`[Searcho] Message: "${normalizedMessage.substring(0, 80)}..."`);
    console.log(`[Searcho] Conversation depth: ${Math.floor(recentHistory.length / 2)}`);

    const questionMode = resolveQuestionMode({
      researchMode: typeof researchMode === "string" ? researchMode : null,
      hasUsabilityContext: Boolean(researchContext?.usabilityTesting),
    });
    const normalizedGuideContext = normalizeResearchPlan(guideContext, questionMode);
    const shouldLoadLearningHints =
      forcePlan ||
      forceGuideEditPlan ||
      Boolean(normalizedGuideContext?.sections?.length) ||
      Boolean(researchContext?.usabilityTesting) ||
      normalizeForMatch(normalizedMessage).includes('arastirma') ||
      normalizeForMatch(normalizedMessage).includes('test') ||
      normalizeForMatch(normalizedMessage).includes('soru');
    const learningHints = shouldLoadLearningHints
      ? await loadQuestionLearningHints(supabase, {
          mode: questionMode,
          sectionIndex: 0,
          limit: 4,
        })
      : [];
    const learningHintsPrompt = formatQuestionLearningHints(learningHints);

    const messages: any[] = [
      { role: 'system', content: SYSTEM_PROMPT },
    ];

    if (learningHintsPrompt) {
      messages.push({ role: "system", content: learningHintsPrompt });
    }

    if (summary) {
      messages.push({
        role: "system",
        content: `Konusmanin onceki ozeti:\n${summary}`,
      });
    }

    if (researchContext?.usabilityTesting) {
      const usableScreens = Array.isArray(researchContext.designScreens)
        ? researchContext.designScreens.map((s: any, index: number) => describeScreenForPrompt(s, index)).join('\n')
        : '';

      const usabilityContextPrompt = `USABILITY_TESTING_CONTEXT:
Bu proje ekran tabanli kullanilabilirlik testidir. Konusma boyunca su prensipleri uygula:
- Belirsiz noktalarda kullaniciya netlestirici sorular sor.
- Sorulari gorev tamamlama, anlasilirlik, guven, karar verme ve surtunme noktalarina odakla.
- PLAN olustururken bolum ve sorulari ekran kullanilabilirligi odakli kur.
- Elindeki gizli baglami kullan ama kullaniciya teknik readiness, skor veya sistem bilgisi gostermeden ilerle.
- Ilk turda dogrudan plan dokmek yerine gerekiyorsa once tek kritik boslugu netlestir.

Arastirma amaci: ${researchContext.usabilityTesting.objective || 'Belirtilmedi'}
Ana kullanici gorevi: ${researchContext.usabilityTesting.primaryTask || 'Belirtilmedi'}
Hedef kullanicilar: ${researchContext.usabilityTesting.targetUsers || 'Belirtilmedi'}
Basari kriterleri: ${researchContext.usabilityTesting.successSignals || 'Belirtilmedi'}
Riskli alanlar: ${researchContext.usabilityTesting.riskAreas || 'Belirtilmedi'}
Ek yonlendirme: ${researchContext.usabilityTesting.guidancePrompt || 'Yok'}
Screen listesi:
${usableScreens || 'Screen bilgisi yok'}`;

      messages.push({ role: 'system', content: usabilityContextPrompt });

      if (forcePlan) {
        messages.push({
          role: 'system',
          content: `Bu ilk degerlendirme turu. Netlestirme sorulari sormadan dogrudan action=PLAN ile kullanilabilirlik odakli arastirma plani uret. researchPlan null olamaz.`,
        });
      }
    }

    if (normalizedGuideContext?.sections?.length) {
      messages.push({
        role: 'system',
        content: forceGuideEditPlan
          ? `${describeGuideContext(normalizedGuideContext, questionMode)}

Kurallar:
- Eger kullanici mevcut arastirma plani, bolumleri veya sorulari uzerinde bir degisiklik istiyorsa action=PLAN don.
- PLAN donerken sadece degisen parcayi degil, TAM ve GUNCEL researchPlan don.
- Kullanici acikca sil, kaldir veya cikar demedikce mevcut bolumleri ve sorulari koru.
- Mevcut section id'lerini korumaya calis.
- Kullanici sadece belirli bir bolumu tweak etmek istiyorsa diger bolumleri aynen koru.`
          : `Mevcut bir arastirma plani zaten var.
Baslik: ${cleanText(normalizedGuideContext.title, "Arastirma Plani")}
Bolum sayisi: ${normalizedGuideContext.sections.length}
Bu plan uzerinde degisiklik acikca istenmedikce action=CHAT tercih et.`,
      });
    }

    if (forceGuideEditPlan && normalizedGuideContext?.sections?.length) {
      messages.push({
        role: 'system',
        content: 'Kullanici mevcut arastirma planini guncellemek istiyor. action=PLAN ile yanit ver. researchPlan null olamaz. Tam guncellenmis plani dondur.',
      });
    }

    for (const msg of recentHistory) {
      messages.push({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      });
    }

    messages.push({ role: 'user', content: normalizedMessage });

    console.log(`[Searcho] Calling ${MODEL} with ${messages.length} messages`);
    const resolveFinalPayload = async (sendDelta?: (delta: string) => void) => {
      let streamedReply = "";
      const content = sendDelta
        ? await requestStructuredResponseStream(openaiApiKey, messages, (rawText) => {
            const nextReply = extractPartialJsonStringField(rawText, "chatResponse");
            if (!nextReply || nextReply.length <= streamedReply.length) {
              return;
            }

            const delta = nextReply.slice(streamedReply.length);
            streamedReply = nextReply;
            sendDelta(delta);
          })
        : await requestStructuredResponse(openaiApiKey, messages);

      console.log(`[Searcho] Raw response: ${content.substring(0, 200)}...`);

      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch (error) {
        console.error('[Searcho] JSON parse failed:', error);
        throw new Error('Model yaniti gecersiz JSON dondu');
      }

      if (forcePlan && (parsed.action !== 'PLAN' || parsed.researchPlan === null)) {
        console.log('[Searcho] Model returned CHAT while PLAN was required, using fallback usability plan');
        parsed = buildUsabilityFallbackPlan(normalizedMessage, researchContext);
      }

      const isResearchPlan = parsed.action === 'PLAN' && parsed.researchPlan !== null;

      if (isResearchPlan) {
        parsed.researchPlan = normalizeResearchPlan(parsed.researchPlan, questionMode);

        if (forceGuideEditPlan && isAdditiveGuideEditRequest(normalizedMessage) && normalizedGuideContext?.sections?.length) {
          parsed.researchPlan = mergeAdditiveGuideUpdate(normalizedGuideContext, parsed.researchPlan, questionMode);
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

      const nextConversationHistory = [
        ...normalizeConversationHistory(conversationHistory),
        { role: 'user', content: normalizedMessage },
        { role: 'assistant', content: parsed.chatResponse }
      ];
      const nextConversationSummary = buildConversationWindow(nextConversationHistory, "").summary;

      return {
        reply: parsed.chatResponse,
        isResearchRelated: isResearchPlan,
        researchPlan: isResearchPlan ? parsed.researchPlan : null,
        conversationHistory: nextConversationHistory,
        conversationSummary: nextConversationSummary,
      };
    };

    if (requestedStream) {
      const encoder = new TextEncoder();
      const streamBody = new ReadableStream({
        async start(controller) {
          const sendEvent = (payload: Record<string, unknown>) =>
            controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));

          try {
            const finalPayload = await resolveFinalPayload((delta) => {
              if (delta) {
                sendEvent({ event: "assistant_delta", delta });
              }
            });

            sendEvent({ event: "final", data: finalPayload });
          } catch (error) {
            sendEvent({
              event: "error",
              error: error instanceof Error ? error.message : "Internal server error",
            });
          } finally {
            controller.close();
          }
        },
      });

      return new Response(streamBody, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Cache-Control': 'no-cache',
        },
      });
    }

    const finalPayload = await resolveFinalPayload();
    return new Response(JSON.stringify(finalPayload), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[Searcho] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';

    if (requestedStream) {
      const encoder = new TextEncoder();
      const streamBody = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`${JSON.stringify({ event: "error", error: errorMessage })}\n`));
          controller.close();
        },
      });

      return new Response(streamBody, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Cache-Control': 'no-cache',
        },
      });
    }

    return new Response(JSON.stringify({
      error: errorMessage,
      reply: 'Üzgünüm, şu anda bir hata oluştu. Lütfen tekrar deneyin.'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
