import "https://deno.land/x/xhr@0.1.0/mod.ts";
import {
  restoreTurkishCharacters,
  TURKISH_ORTHOGRAPHY_PROMPT,
} from "./turkish-text.ts";

const MODEL = Deno.env.get("ORCHESTRATOR_MODEL") || "o4-mini-2025-04-16";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asString = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const asArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

const sanitizeId = (value: string, fallback: string) =>
  value
    .toLocaleLowerCase("tr-TR")
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ş/g, "s")
    .replace(/ü/g, "u")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || fallback;

export type AIEnhancedTheme = {
  id: string;
  title: string;
  goal: string;
};

export type AIEnhancedAnchorQuestion = {
  id: string;
  themeId: string;
  text: string;
};

export type AIEnhancedBrief = {
  mode: "ai_enhanced";
  status: "collecting" | "ready";
  contextReadiness: number;
  objective: string;
  audience: string;
  decisionScope: string;
  constraints: string;
  mustCover: string[];
  themes: AIEnhancedTheme[];
  anchorQuestions: AIEnhancedAnchorQuestion[];
  plannerTranscript: Array<{ role: "user" | "assistant"; content: string }>;
  updatedAt: string;
  readyAt: string | null;
};

export const getResearchModeFromAnalysis = (analysis: unknown) =>
  isRecord(analysis) && analysis.researchMode === "ai_enhanced" ? "ai_enhanced" : "structured";

export const normalizeAIEnhancedBrief = (value: unknown): AIEnhancedBrief | null => {
  if (!isRecord(value)) return null;

  const themes = asArray<Record<string, unknown>>(value.themes)
    .map((theme, index) => ({
      id: sanitizeId(asString(theme.id) || asString(theme.title), `theme-${index + 1}`),
      title: restoreTurkishCharacters(asString(theme.title)) || `Tema ${index + 1}`,
      goal: restoreTurkishCharacters(asString(theme.goal)),
    }))
    .filter((theme) => theme.title.length > 0);

  const anchorQuestions = asArray<Record<string, unknown>>(value.anchorQuestions)
    .map((question, index) => ({
      id: sanitizeId(asString(question.id) || asString(question.text), `anchor-${index + 1}`),
      themeId: sanitizeId(asString(question.themeId), themes[0]?.id || `theme-${(index % Math.max(themes.length, 1)) + 1}`),
      text: restoreTurkishCharacters(asString(question.text)),
    }))
    .filter((question) => question.text.length > 0);

  return {
    mode: "ai_enhanced",
    status: value.status === "ready" ? "ready" : "collecting",
    contextReadiness: typeof value.contextReadiness === "number" ? Math.max(0, Math.min(100, Math.round(value.contextReadiness))) : 0,
    objective: restoreTurkishCharacters(asString(value.objective)),
    audience: restoreTurkishCharacters(asString(value.audience)),
    decisionScope: restoreTurkishCharacters(asString(value.decisionScope)),
    constraints: restoreTurkishCharacters(asString(value.constraints)),
    mustCover: asArray<string>(value.mustCover).map((item) => restoreTurkishCharacters(asString(item))).filter(Boolean),
    themes,
    anchorQuestions,
    plannerTranscript: asArray<Record<string, unknown>>(value.plannerTranscript)
      .map((entry) => ({
        role: (entry.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
        content: asString(entry.content),
      }))
      .filter((entry) => entry.content.length > 0),
    updatedAt: asString(value.updatedAt) || new Date().toISOString(),
    readyAt: asString(value.readyAt) || null,
  };
};

export const findThemeById = (brief: AIEnhancedBrief | null, themeId?: string | null) =>
  brief?.themes.find((theme) => theme.id === themeId) ?? null;

const RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "ai_enhanced_interview_turn",
    strict: true,
    schema: {
      type: "object",
      properties: {
        decision: { type: "string" },
        followUpQuestion: { type: ["string", "null"] },
      },
      required: ["decision", "followUpQuestion"],
      additionalProperties: false,
    },
  },
};

export async function generateAIEnhancedFollowUp(input: {
  brief: AIEnhancedBrief;
  anchorQuestion: AIEnhancedAnchorQuestion;
  themeTitle: string;
  participantAnswer: string;
  previousFollowUps: string[];
}) {
  const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiApiKey) {
    return {
      decision: "next_anchor",
      followUpQuestion: null,
    };
  }

  const systemPrompt = `Sen Searcho'nun AI enhanced görüşme moderasyon motorusun.

Amaç:
- Tüm katılımcılarda aynı anchor omurgayı koru
- Cevaba göre en fazla 1 tarafsız derinleştirme sorusu üret
- Gereksiz tekrar yapma

Kurallar:
- Follow-up tek odaklı olsun
- Mümkünse soru metninde "ve" kullanma
- Yönlendirici, varsayım içeren veya cevabı ima eden soru sorma
- Katılımcı zaten detaylı yanıt verdiyse decision=next_anchor dön
- Yeni soru gerekliyse decision=follow_up dön ve followUpQuestion doldur
- Cevap boşa yakın veya skip ise decision=next_anchor dön
- ${TURKISH_ORTHOGRAPHY_PROMPT}`;

  const userPrompt = `Araştırma amacı: ${input.brief.objective}
Hedef kitle: ${input.brief.audience}
Karar alanı: ${input.brief.decisionScope}
Tema: ${input.themeTitle}
Anchor soru: ${input.anchorQuestion.text}
Katılımcı cevabı: ${input.participantAnswer || "[boş]"}
Bu anchor için daha önce sorulan follow-up'lar: ${input.previousFollowUps.join(" | ") || "Yok"}

Yalnızca geçerli JSON dön.`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: RESPONSE_FORMAT,
    }),
  });

  if (!response.ok) {
    return {
      decision: "next_anchor",
      followUpQuestion: null,
    };
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    return {
      decision: "next_anchor",
      followUpQuestion: null,
    };
  }

  try {
    const parsed = JSON.parse(content);
    const decision = parsed.decision === "follow_up" ? "follow_up" : "next_anchor";
    const followUpQuestion = restoreTurkishCharacters(asString(parsed.followUpQuestion)) || null;
    return {
      decision: decision === "follow_up" && followUpQuestion ? "follow_up" : "next_anchor",
      followUpQuestion: decision === "follow_up" && followUpQuestion ? followUpQuestion : null,
    };
  } catch {
    return {
      decision: "next_anchor",
      followUpQuestion: null,
    };
  }
}
