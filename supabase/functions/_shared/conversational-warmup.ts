import {
  buildWarmupQuestions,
  cleanQuestion,
  normalizeForMatch,
} from "./question-quality.ts";

const MODEL = Deno.env.get("ORCHESTRATOR_MODEL") || "gpt-4.1";

export const CONVERSATIONAL_WARMUP_TURN_COUNT = 3;

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
        questionText: { type: "string" },
      },
      required: ["answerSummary", "readinessSignal", "bridgeReason", "questionText"],
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

type GenerateConversationalWarmupQuestionInput = {
  projectTitle?: string;
  projectDescription?: string;
  sectionTitle?: string;
  turnIndex: number;
  existingWarmupQuestions?: string[];
  previousTurns?: WarmupPreviousTurn[];
};

export type ConversationalWarmupGeneration = {
  questionText: string;
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
  const cleaned = cleanQuestion(firstLine)
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .replace(/^\d+[.)]\s*/, "")
    .replace(/^[-*]\s*/, "");

  if (!cleaned) {
    return "";
  }

  const question = cleaned.endsWith("?") ? cleaned : `${cleaned.replace(/[.!]+$/g, "")}?`;
  return question.slice(0, 180).trim();
};

const hasUnsafeWarmupLanguage = (question: string) => {
  const normalized = normalizeForMatch(question);

  return [
    "peki",
    "az once",
    "az önce",
    "soylediginiz",
    "söylediğiniz",
    "buna gore",
    "buna göre",
    "bu konu",
    "bu konuyla",
    "bununla ilgili",
    "buraya gelmeden once",
    "buraya gelmeden önce",
    "nasil hissettiniz",
    "nasıl hissettiniz",
    "size ne hissettirdi",
    "arastirma",
    "araştırma",
    "urun",
    "ürün",
    "ekran",
    "gorusme",
    "görüşme",
  ].some((pattern) => normalized.includes(normalizeForMatch(pattern)));
};

const isUsableWarmupQuestion = (question: string) => {
  const wordCount = countWords(question);
  const questionMarkCount = (question.match(/\?/g) || []).length;

  return (
    question.endsWith("?") &&
    questionMarkCount === 1 &&
    wordCount >= 4 &&
    wordCount <= 18 &&
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
      return `${turn.turnIndex}. Soru: ${turn.questionText}\nYanıt: ${answer}`;
    })
    .join("\n\n");
};

const buildPrompt = (input: GenerateConversationalWarmupQuestionInput) => {
  const existingQuestions = buildConversationalWarmupFallbacks(input.existingWarmupQuestions)
    .map((question, index) => `${index + 1}. ${question}`)
    .join("\n");

  return `Proje başlığı: ${input.projectTitle || "Belirtilmedi"}
Proje açıklaması: ${input.projectDescription || "Belirtilmedi"}
Bölüm: ${input.sectionTitle || "Isınma"}
Isınma turu: ${input.turnIndex} / ${CONVERSATIONAL_WARMUP_TURN_COUNT}

Planlanan güvenli ısınma soruları:
${existingQuestions || "Yok"}

Önceki ısınma konuşması:
${stringifyPreviousTurns(input.previousTurns)}

Bir sonraki ısınma sorusunu üret.`;
};

const SYSTEM_PROMPT = `Sen Searcho'nun görüşme başındaki Isınma moderatörüsün.

Amaç:
- Katılımcıyı araştırmaya girmeden önce rahatlat.
- Tam olarak 3 turluk kısa bir sohbet akışı kur.
- Her turda yalnızca 1 soru üret.
- 2. ve 3. turda önceki yanıttan doğal bir sonraki soru çıkar; ama önceki yanıtı alıntılama.

Kurallar:
- Türkçe karakterleri eksiksiz kullan.
- Soru gündelik, düşük baskılı ve konuşma dilinde olsun.
- Soru tek cümle, tek odak ve kısa olsun.
- İlk soru güne, o ana veya günlük ritme hafifçe dokunsun.
- Ürün, ekran, araştırma konusu veya görüşmenin ana konusuna girme.
- Duyguyu doğrudan sorma.
- "Peki", "az önce söylediğiniz", "buna göre", "bu konu", "buraya gelmeden önce", "nasıl hissettiniz", "size ne hissettirdi" gibi kalıpları kullanma.
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
      answerSummary: "",
      readinessSignal: "OpenAI anahtarı olmadığı için güvenli fallback kullanıldı.",
      bridgeReason: "fallback",
      fallbackUsed: true,
      source: "fallback",
    };
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
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
    if (!isUsableWarmupQuestion(questionText)) {
      return {
        questionText: fallbackQuestion,
        answerSummary: typeof parsed.answerSummary === "string" ? parsed.answerSummary.trim() : "",
        readinessSignal: typeof parsed.readinessSignal === "string" ? parsed.readinessSignal.trim() : "",
        bridgeReason: "LLM sorusu güvenli ısınma kurallarını geçemedi.",
        fallbackUsed: true,
        source: "fallback",
      };
    }

    return {
      questionText,
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
      answerSummary: "",
      readinessSignal: error instanceof Error ? error.message : "Bilinmeyen LLM hatası",
      bridgeReason: "fallback",
      fallbackUsed: true,
      source: "fallback",
    };
  }
}
