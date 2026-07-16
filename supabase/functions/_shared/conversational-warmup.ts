import {
  buildWarmupQuestions,
  cleanQuestion,
  normalizeForMatch,
} from "./question-quality.ts";
import {
  restoreTurkishCharacters,
  TURKISH_ORTHOGRAPHY_PROMPT,
} from "./turkish-text.ts";

const MODEL = Deno.env.get("ORCHESTRATOR_MODEL") || "gpt-4.1";

export const CONVERSATIONAL_WARMUP_TURN_COUNT = 3;

const OPENAI_WARMUP_TIMEOUT_MS = 8_000; // mirrors adaptive-probe-engine OPENAI_*_TIMEOUT_MS

const RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "conversational_warmup_turn",
    strict: true,
    schema: {
      type: "object",
      properties: {
        answerSummary: { type: "string" },
        readinessSignal: { type: "string" },
        bridgeReason: { type: "string" },
        spokenLeadIn: { type: "string" },
        questionText: { type: "string" },
      },
      required: ["answerSummary", "readinessSignal", "bridgeReason", "spokenLeadIn", "questionText"],
      additionalProperties: false,
    },
  },
};

type WarmupPreviousTurn = {
  turnIndex: number;
  questionText: string;
  answerText: string;
  skipped?: boolean;
};

export type ConversationalWarmupInterviewMode = "structured" | "ai_enhanced";

export type ConversationalWarmupContext = {
  objective?: string;
  audience?: string;
  decisionScope?: string;
  themes?: string[];
  mustCover?: string[];
};

type GenerateConversationalWarmupQuestionInput = {
  interviewMode?: ConversationalWarmupInterviewMode;
  projectTitle?: string;
  projectDescription?: string;
  sectionTitle?: string;
  warmupContext?: ConversationalWarmupContext;
  turnIndex: number;
  existingWarmupQuestions?: string[];
  previousTurns?: WarmupPreviousTurn[];
};

export type ConversationalWarmupGeneration = {
  questionText: string;
  spokenLeadIn: string;
  answerSummary: string;
  readinessSignal: string;
  bridgeReason: string;
  fallbackUsed: boolean;
  source: "llm" | "fallback";
};

const uniqueQuestions = (questions: string[]) => {
  const seen = new Set<string>();
  return questions.filter((question) => {
    const cleaned = cleanQuestion(question);
    const normalized = normalizeForMatch(cleaned);
    if (!normalized || seen.has(normalized)) {
      return false;
    }

    seen.add(normalized);
    return true;
  });
};

const countWords = (value: string) =>
  cleanQuestion(value).split(/\s+/).filter(Boolean).length;

const normalizeQuestion = (value: unknown) => {
  const firstLine = typeof value === "string"
    ? value.split("\n").map((line) => line.trim()).find(Boolean) || ""
    : "";
  const cleaned = cleanQuestion(restoreTurkishCharacters(firstLine))
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .replace(/^\d+[.)]\s*/, "")
    .replace(/^[-*]\s*/, "");

  if (!cleaned) {
    return "";
  }

  const question = cleaned.endsWith("?") ? cleaned : `${cleaned.replace(/[.!]+$/g, "")}?`;
  return question.slice(0, 180).trim();
};

const getFallbackLeadIn = (input: GenerateConversationalWarmupQuestionInput) => {
  if (input.turnIndex <= 1) {
    return "Kısa bir ısınmayla başlayalım.";
  }

  if (input.turnIndex >= CONVERSATIONAL_WARMUP_TURN_COUNT) {
    return "Tamam, son bir ısınma sorusu sorayım.";
  }

  return "Anladım, buradan devam edelim.";
};

const normalizeLeadIn = (value: unknown, input: GenerateConversationalWarmupQuestionInput) => {
  const cleaned = typeof value === "string"
    ? cleanQuestion(restoreTurkishCharacters(value))
      .replace(/[?]+/g, "")
      .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    : "";
  const wordCount = countWords(cleaned);
  const normalized = normalizeForMatch(cleaned);
  const unsafe = [
    "az once soylediginiz",
    "az önce söylediğiniz",
    "soylediginiz",
    "söylediğiniz",
    "buna gore",
    "buna göre",
    "cevabiniz",
    "cevabınız",
  ].some((pattern) => normalized.includes(normalizeForMatch(pattern)));

  if (!cleaned || wordCount < 2 || wordCount > 12 || unsafe) {
    return getFallbackLeadIn(input);
  }

  return cleaned.endsWith(".") ? cleaned.slice(0, 120) : `${cleaned.replace(/[!]+$/g, "")}.`.slice(0, 120);
};

const hasUnsafeWarmupLanguage = (question: string) => {
  const normalized = normalizeForMatch(question);

  return [
    "nasil hissettiniz",
    "nasıl hissettiniz",
    "nasil hissediyorsunuz",
    "nasıl hissediyorsunuz",
    "size ne hissettirdi",
  ].some((pattern) => normalized.includes(normalizeForMatch(pattern)));
};

const isUsableWarmupQuestion = (question: string) => {
  const wordCount = countWords(question);
  const questionMarkCount = (question.match(/\?/g) || []).length;
  const normalized = normalizeForMatch(question);

  return (
    question.endsWith("?") &&
    questionMarkCount === 1 &&
    wordCount >= 4 &&
    wordCount <= 18 &&
    !/\b(ve|veya)\b/.test(normalized) &&
    !/\bhem\b.*\bhem\b/.test(normalized) &&
    !hasUnsafeWarmupLanguage(question)
  );
};

export const isConversationalWarmupSectionTitle = (title: string) => {
  const normalized = normalizeForMatch(title || "");
  return (
    normalized.includes("isinma") ||
    normalized.includes("warmup") ||
    normalized.includes("warm-up") ||
    normalized.includes("warm up")
  );
};

export const buildConversationalWarmupFallbacks = (existingWarmupQuestions: string[] = []) =>
  uniqueQuestions([
    ...buildWarmupQuestions(),
    ...existingWarmupQuestions.map((question) => normalizeQuestion(question)).filter(isUsableWarmupQuestion),
  ]).slice(0, CONVERSATIONAL_WARMUP_TURN_COUNT);

const getFallbackQuestion = (input: GenerateConversationalWarmupQuestionInput) => {
  const themeTitle = input.warmupContext?.themes?.map((theme) => cleanQuestion(restoreTurkishCharacters(theme))).find(Boolean);
  if (themeTitle) {
    const themeFallbacks = [
      `${themeTitle} denince aklınıza ilk ne geliyor?`,
      `${themeTitle} tarafında bugün dikkatinizi ne çekiyor?`,
      `${themeTitle} hakkında konuşmaya nereden başlamak istersiniz?`,
    ];
    const fallback = themeFallbacks[Math.max(0, input.turnIndex - 1)];
    if (isUsableWarmupQuestion(fallback)) {
      return fallback;
    }
  }

  const fallbacks = buildConversationalWarmupFallbacks(input.existingWarmupQuestions);
  return fallbacks[Math.max(0, input.turnIndex - 1)] || buildWarmupQuestions()[0];
};

const stringifyPreviousTurns = (previousTurns: WarmupPreviousTurn[] = []) => {
  if (previousTurns.length === 0) {
    return "Henüz yanıt yok.";
  }

  return previousTurns
    .map((turn) => {
      const answer = turn.skipped
        ? "[katılımcı bu soruyu atladı]"
        : (turn.answerText || "[boş yanıt]");
      return `${turn.turnIndex}. Soru: ${restoreTurkishCharacters(turn.questionText)}\nYanıt: ${restoreTurkishCharacters(answer)}`;
    })
    .join("\n\n");
};

const stringifyWarmupContext = (context?: ConversationalWarmupContext) => {
  if (!context) {
    return "Ek bağlam yok.";
  }

  const lines = [
    `Amaç: ${restoreTurkishCharacters(context.objective || "Belirtilmedi")}`,
    `Hedef kitle: ${restoreTurkishCharacters(context.audience || "Belirtilmedi")}`,
    `Karar alanı: ${restoreTurkishCharacters(context.decisionScope || "Belirtilmedi")}`,
    `Temalar: ${context.themes?.filter(Boolean).map(restoreTurkishCharacters).join(" | ") || "Belirtilmedi"}`,
    `Mutlaka kapsanacak alanlar: ${context.mustCover?.filter(Boolean).map(restoreTurkishCharacters).join(" | ") || "Belirtilmedi"}`,
  ];

  return lines.join("\n");
};

const buildPrompt = (input: GenerateConversationalWarmupQuestionInput) => {
  const existingQuestions = buildConversationalWarmupFallbacks(input.existingWarmupQuestions)
    .map((question, index) => `${index + 1}. ${question}`)
    .join("\n");

  return `Mod: ${input.interviewMode === "ai_enhanced" ? "Agentic / AI Enhanced" : "Structured"}
Proje başlığı: ${restoreTurkishCharacters(input.projectTitle || "Belirtilmedi")}
Proje açıklaması: ${restoreTurkishCharacters(input.projectDescription || "Belirtilmedi")}
Bölüm: ${input.sectionTitle || "Isınma"}
Isınma turu: ${input.turnIndex} / ${CONVERSATIONAL_WARMUP_TURN_COUNT}

Araştırma bağlamı:
${stringifyWarmupContext(input.warmupContext)}

Planlanan güvenli ısınma soruları:
${existingQuestions || "Yok"}

Önceki ısınma konuşması:
${stringifyPreviousTurns(input.previousTurns)}

Bir sonraki ısınma turunu üret:
- spokenLeadIn: Sesli okunacak, 2-8 kelimelik doğal bir geçiş cümlesi.
- questionText: Ayrı ve net soru cümlesi.`;
};

const SYSTEM_PROMPT = `Sen Searcho'nun görüşme başındaki Isınma moderatörüsün.

Amaç:
- Katılımcıyı araştırmaya girmeden önce rahatlat.
- Tam olarak 3 turluk kısa bir sohbet akışı kur.
- Her turda yalnızca 1 soru üret.
- Araştırma temasına yumuşak bir giriş yap; hazırlanmış soru ya da anchor soru sorma.
- Katılımcının enerji, açıklık, çekince ve konuya yaklaşımını dolaylı olarak anlamaya çalış.
- 2. ve 3. turda son yanıttan doğal, anlık bir follow-up çıkar; önceki yanıtı uzun alıntılama.
- Her turda önce kısa ve insani bir geçiş cümlesi üret, sonra soruyu sor.

Kurallar:
- Türkçe karakterleri eksiksiz kullan.
- ${TURKISH_ORTHOGRAPHY_PROMPT}
- Soru gündelik, düşük baskılı ve konuşma dilinde olsun.
- Soru tek cümle, tek odak ve kısa olsun.
- spokenLeadIn soru içermesin; katılımcıyı mekanik şekilde özetlemesin.
- spokenLeadIn "Güzel", "Anladım", "Tamam", "Buradan devam edelim" gibi kısa ve doğal olabilir.
- İlk soru güne, o ana veya günlük ritme hafifçe dokunsun.
- Ana araştırma sorularını erkenden cevaplatma; sadece ısınma seviyesinde kal.
- Duyguyu doğrudan "nasıl hissediyorsunuz" diye sorma.
- "ve", "veya", "hem ... hem ..." kullanma; çift namlulu soru sorma.
- Yanıt yoksa ya da soru atlandıysa güvenli, genel bir ısınma sorusuyla devam et.

Yalnızca geçerli JSON döndür.`;

export async function generateConversationalWarmupQuestion(
  input: GenerateConversationalWarmupQuestionInput,
): Promise<ConversationalWarmupGeneration> {
  const fallbackQuestion = getFallbackQuestion(input);
  const openaiApiKey = Deno.env.get("OPENAI_API_KEY");

  if (!openaiApiKey) {
    return {
      questionText: fallbackQuestion,
      spokenLeadIn: getFallbackLeadIn(input),
      answerSummary: "",
      readinessSignal: "OpenAI anahtarı olmadığı için güvenli fallback kullanıldı.",
      bridgeReason: "fallback",
      fallbackUsed: true,
      source: "fallback",
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OPENAI_WARMUP_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildPrompt(input) },
        ],
        response_format: RESPONSE_FORMAT,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI error: ${response.status}`);
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error("OpenAI response content is missing");
    }

    const parsed = JSON.parse(content);
    const questionText = normalizeQuestion(parsed.questionText);
    const spokenLeadIn = normalizeLeadIn(parsed.spokenLeadIn, input);
    if (!isUsableWarmupQuestion(questionText)) {
      return {
        questionText: fallbackQuestion,
        spokenLeadIn,
        answerSummary: typeof parsed.answerSummary === "string" ? parsed.answerSummary.trim() : "",
        readinessSignal: typeof parsed.readinessSignal === "string" ? parsed.readinessSignal.trim() : "",
        bridgeReason: "LLM sorusu güvenli ısınma kurallarını geçemedi.",
        fallbackUsed: true,
        source: "fallback",
      };
    }

    return {
      questionText,
      spokenLeadIn,
      answerSummary: typeof parsed.answerSummary === "string" ? parsed.answerSummary.trim() : "",
      readinessSignal: typeof parsed.readinessSignal === "string" ? parsed.readinessSignal.trim() : "",
      bridgeReason: typeof parsed.bridgeReason === "string" ? parsed.bridgeReason.trim() : "",
      fallbackUsed: false,
      source: "llm",
    };
  } catch (error) {
    console.error("Conversational warm-up generation failed:", error);
    return {
      questionText: fallbackQuestion,
      spokenLeadIn: getFallbackLeadIn(input),
      answerSummary: "",
      readinessSignal: error instanceof Error ? error.message : "Bilinmeyen LLM hatası",
      bridgeReason: "fallback",
      fallbackUsed: true,
      source: "fallback",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
