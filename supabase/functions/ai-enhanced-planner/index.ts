import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = Deno.env.get("ORCHESTRATOR_MODEL") || "gpt-4.1";
const MAX_RECENT_TURNS = 6;
const MAX_SUMMARY_ITEMS = 8;
const MAX_SUMMARY_CHARS = 160;

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

const truncateText = (value: string, maxLength: number) =>
  value.length > maxLength ? `${value.slice(0, maxLength - 1).trimEnd()}...` : value;

const normalizeConversationHistory = (history: Array<Record<string, unknown>>) =>
  asArray<Record<string, unknown>>(history)
    .map((entry) => ({
      role: entry.role === "assistant" ? "assistant" : "user",
      content: asString(entry.content),
    }))
    .filter((entry) => entry.content.length > 0);

const buildConversationWindow = (history: Array<Record<string, unknown>>, existingSummary = "") => {
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
    summary: [asString(existingSummary), derivedSummary].filter(Boolean).join("\n").trim(),
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

const requestStructuredPlannerResponse = async (openaiApiKey: string, messages: Array<{ role: "system" | "user" | "assistant"; content: string }>) => {
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
  return payload?.choices?.[0]?.message?.content;
};

const requestStructuredPlannerResponseStream = async (
  openaiApiKey: string,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  onJsonDelta?: (rawText: string) => void,
) => {
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
      stream: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI error: ${response.status}`);
  }

  if (!response.body) {
    throw new Error("Planner streaming body is missing");
  }

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = "";
  let rawText = "";

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

    let lineBreakIndex = buffer.indexOf("\n");
    while (lineBreakIndex !== -1) {
      const line = buffer.slice(0, lineBreakIndex).trim();
      buffer = buffer.slice(lineBreakIndex + 1);

      if (line.startsWith("data:")) {
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") {
          break;
        }

        const parsed = JSON.parse(payload);
        const delta = parsed?.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta.length > 0) {
          rawText += delta;
          onJsonDelta?.(rawText);
        }
      }

      lineBreakIndex = buffer.indexOf("\n");
    }

    if (done) {
      break;
    }
  }

  return rawText;
};

const buildBriefContextPrompt = (brief: Record<string, unknown>) => {
  const objective = asString(brief.objective) || "Belirtilmedi";
  const audience = asString(brief.audience) || "Belirtilmedi";
  const decisionScope = asString(brief.decisionScope) || "Belirtilmedi";
  const constraints = asString(brief.constraints) || "Belirtilmedi";
  const mustCover = asArray<string>(brief.mustCover).map((item) => asString(item)).filter(Boolean).join(", ") || "Belirtilmedi";
  const themes = asArray<Record<string, unknown>>(brief.themes)
    .map((theme) => `${asString(theme.title)}: ${asString(theme.goal)}`)
    .filter(Boolean)
    .join("\n") || "Yok";
  const anchorQuestions = asArray<Record<string, unknown>>(brief.anchorQuestions)
    .map((question) => asString(question.text))
    .filter(Boolean)
    .join("\n") || "Yok";

  return `Mevcut brief durumu:
Objective: ${objective}
Audience: ${audience}
Decision scope: ${decisionScope}
Constraints: ${constraints}
Must cover: ${mustCover}
Themes:
${themes}
Anchor sorular:
${anchorQuestions}

Bu brief'i guncelle ve eksik kisimlari tamamla.`;
};

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

  let requestedStream = false;

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
      conversationSummary = "",
      existingBrief = null,
      stream = false,
    } = await req.json();
    requestedStream = stream === true;

    const normalizedMessage = asString(message);
    const { recentHistory, summary } = buildConversationWindow(conversationHistory, conversationSummary);

    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Proje basligi: ${projectTitle || "Belirtilmedi"}
Ilk proje aciklamasi: ${projectDescription || "Belirtilmedi"}`,
      },
    ];

    if (summary) {
      messages.push({
        role: "system",
        content: `Konusmanin onceki ozeti:\n${summary}`,
      });
    }

    if (isRecord(existingBrief)) {
      messages.push({
        role: "system",
        content: buildBriefContextPrompt(existingBrief),
      });
    }

    for (const entry of recentHistory) {
      messages.push({
        role: entry.role === "assistant" ? "assistant" : "user",
        content: entry.content,
      });
    }

    messages.push({ role: "user", content: normalizedMessage });

    const resolveFinalPayload = async (sendDelta?: (delta: string) => void) => {
      let streamedReply = "";
      const content = sendDelta
        ? await requestStructuredPlannerResponseStream(openaiApiKey, messages, (rawText) => {
            const nextReply = extractPartialJsonStringField(rawText, "reply");
            if (!nextReply || nextReply.length <= streamedReply.length) {
              return;
            }

            const delta = nextReply.slice(streamedReply.length);
            streamedReply = nextReply;
            sendDelta(delta);
          })
        : await requestStructuredPlannerResponse(openaiApiKey, messages);

      if (typeof content !== "string") {
        throw new Error("Planner returned an invalid payload");
      }

      const parsed = normalizePlannerOutput(JSON.parse(content));
      const nextConversationHistory = [
        ...normalizeConversationHistory(conversationHistory),
        { role: "user", content: normalizedMessage },
        { role: "assistant", content: parsed.reply },
      ];

      const brief = {
        mode: "ai_enhanced",
        ...parsed.brief,
        plannerTranscript: nextConversationHistory,
        updatedAt: new Date().toISOString(),
        readyAt: parsed.isReady ? new Date().toISOString() : null,
      };

      return {
        reply: parsed.reply,
        contextReadiness: parsed.contextReadiness,
        isReady: parsed.isReady,
        brief,
        conversationHistory: nextConversationHistory,
        conversationSummary: buildConversationWindow(nextConversationHistory, "").summary,
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
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-cache",
        },
      });
    }

    return new Response(
      JSON.stringify(await resolveFinalPayload()),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("[ai-enhanced-planner] Error:", error);

    if (requestedStream) {
      const encoder = new TextEncoder();
      const streamBody = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              `${JSON.stringify({
                event: "error",
                error: error instanceof Error ? error.message : "Internal server error",
              })}\n`,
            ),
          );
          controller.close();
        },
      });

      return new Response(streamBody, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-cache",
        },
      });
    }

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
