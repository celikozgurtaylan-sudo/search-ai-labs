import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = Deno.env.get("ORCHESTRATOR_MODEL") || "o4-mini-2025-04-16";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asString = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const asArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

const RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "ai_enhanced_briefing",
    strict: true,
    schema: {
      type: "object",
      properties: {
        reply: { type: "string" },
        contextReadiness: { type: "number" },
        isReady: { type: "boolean" },
        brief: {
          type: "object",
          properties: {
            status: { type: "string" },
            objective: { type: "string" },
            audience: { type: "string" },
            decisionScope: { type: "string" },
            constraints: { type: "string" },
            mustCover: {
              type: "array",
              items: { type: "string" },
            },
            themes: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  title: { type: "string" },
                  goal: { type: "string" },
                },
                required: ["id", "title", "goal"],
                additionalProperties: false,
              },
            },
            anchorQuestions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  themeId: { type: "string" },
                  text: { type: "string" },
                },
                required: ["id", "themeId", "text"],
                additionalProperties: false,
              },
            },
          },
          required: [
            "status",
            "objective",
            "audience",
            "decisionScope",
            "constraints",
            "mustCover",
            "themes",
            "anchorQuestions",
          ],
          additionalProperties: false,
        },
      },
      required: ["reply", "contextReadiness", "isReady", "brief"],
      additionalProperties: false,
    },
  },
};

const SYSTEM_PROMPT = `Sen Searcho'nun AI enhanced arastirma planlama asistanisin.

Gorevin sabit soru listesi gostermek degil, once arastirma baglamini yuzde yuz anlamak.

Kurallar:
- Kullaniciya tek seferde en fazla 1 netlestirici soru sor.
- Robotik, kurumsal ve yapay nezaket kullanma.
- Kisa yaz, net yaz.
- Baglam tam degilse isReady=false don.
- Baglam tam ise isReady=true don ve yarı yapılandırılmış gorusme icin ortak anchor planini hazirla.
- Anchor plan tum katilimcilarda ayni omurgayi korumali.
- Follow-up sorular interview sirasinda dinamik olacagi icin brief icinde yalnizca ortak theme ve anchor sorularini tut.
- Anchor sorular tek odakli, tarafsiz ve acik uclu olmali.
- Anchor soru metninde mumkunse "ve" kullanma.

Readiness kriteri:
- objective net
- audience net
- decisionScope net
- mustCover basliklari yeterince acik

Readiness 100 degilse anchor plani eksik birakabilirsin veya bos donebilirsin.
Readiness 100 ise:
- 3 ila 5 theme uret
- 5 ila 7 anchor soru uret
- isReady=true
- brief.status="ready"

Tum cevaplar Turkce olacak.
Yalnizca gecerli JSON dondur.`;

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

const normalizePlannerOutput = (raw: Record<string, unknown>) => {
  const rawBrief = isRecord(raw.brief) ? raw.brief : {};
  const normalizedThemes = asArray<Record<string, unknown>>(rawBrief.themes)
    .map((theme, index) => ({
      id: sanitizeId(asString(theme.id) || asString(theme.title), `theme-${index + 1}`),
      title: asString(theme.title) || `Tema ${index + 1}`,
      goal: asString(theme.goal),
    }))
    .filter((theme) => theme.title.length > 0);

  const normalizedAnchors = asArray<Record<string, unknown>>(rawBrief.anchorQuestions)
    .map((question, index) => ({
      id: sanitizeId(asString(question.id) || asString(question.text), `anchor-${index + 1}`),
      themeId: sanitizeId(
        asString(question.themeId) || normalizedThemes[index % Math.max(normalizedThemes.length, 1)]?.id || "theme-1",
        `theme-${(index % Math.max(normalizedThemes.length, 1)) + 1}`,
      ),
      text: asString(question.text),
    }))
    .filter((question) => question.text.length > 0);

  const objective = asString(rawBrief.objective);
  const audience = asString(rawBrief.audience);
  const decisionScope = asString(rawBrief.decisionScope);
  const constraints = asString(rawBrief.constraints);
  const mustCover = asArray<string>(rawBrief.mustCover).map((item) => asString(item)).filter(Boolean);

  const hasReadyCore =
    objective.length > 0 &&
    audience.length > 0 &&
    decisionScope.length > 0 &&
    mustCover.length > 0 &&
    normalizedThemes.length >= 3 &&
    normalizedAnchors.length >= 5;

  const readiness = Math.max(0, Math.min(100, Math.round(Number(raw.contextReadiness) || 0)));
  const isReady = Boolean(raw.isReady) && readiness >= 100 && hasReadyCore;

  return {
    reply: asString(raw.reply) || "Bağlamı biraz daha netleştirelim.",
    contextReadiness: isReady ? 100 : Math.min(readiness, 95),
    isReady,
    brief: {
      status: isReady ? "ready" : "collecting",
      objective,
      audience,
      decisionScope,
      constraints,
      mustCover,
      themes: isReady ? normalizedThemes.slice(0, 5) : normalizedThemes.slice(0, 5),
      anchorQuestions: isReady ? normalizedAnchors.slice(0, 7) : normalizedAnchors.slice(0, 7),
    },
  };
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
      throw new Error("OPENAI_API_KEY is not set");
    }

    const {
      message,
      projectTitle = "",
      projectDescription = "",
      conversationHistory = [],
      existingBrief = null,
    } = await req.json();

    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Proje basligi: ${projectTitle || "Belirtilmedi"}
Ilk proje aciklamasi: ${projectDescription || "Belirtilmedi"}`,
      },
    ];

    if (isRecord(existingBrief)) {
      messages.push({
        role: "user",
        content: `Mevcut brief durumu:
${JSON.stringify(existingBrief, null, 2)}

Yanit verirken bu brief'i guncelle ve eksik kisimlari tamamla.`,
      });
    }

    for (const entry of asArray<Record<string, unknown>>(conversationHistory)) {
      const role = entry.role === "assistant" ? "assistant" : "user";
      const content = asString(entry.content);
      if (!content) continue;
      messages.push({ role, content });
    }

    messages.push({ role: "user", content: asString(message) });

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        response_format: RESPONSE_FORMAT,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI error: ${response.status}`);
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;

    if (typeof content !== "string") {
      throw new Error("Planner returned an invalid payload");
    }

    const parsed = normalizePlannerOutput(JSON.parse(content));
    const nextConversationHistory = [
      ...asArray<Record<string, unknown>>(conversationHistory)
        .map((entry) => ({
          role: entry.role === "assistant" ? "assistant" : "user",
          content: asString(entry.content),
        }))
        .filter((entry) => entry.content.length > 0),
      { role: "user", content: asString(message) },
      { role: "assistant", content: parsed.reply },
    ];

    const brief = {
      mode: "ai_enhanced",
      ...parsed.brief,
      plannerTranscript: nextConversationHistory,
      updatedAt: new Date().toISOString(),
      readyAt: parsed.isReady ? new Date().toISOString() : null,
    };

    return new Response(
      JSON.stringify({
        reply: parsed.reply,
        contextReadiness: parsed.contextReadiness,
        isReady: parsed.isReady,
        brief,
        conversationHistory: nextConversationHistory,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("[ai-enhanced-planner] Error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal server error",
        reply: "Bağlamı işlerken bir sorun oluştu. Tekrar deneyin.",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
