import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  assessQuestionQuality,
  buildFallbackRewrite,
  cleanQuestion,
  type QuestionReviewResult,
} from "../_shared/question-quality.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const parseJsonObject = (value: string) => {
  try {
    return JSON.parse(value);
  } catch (_) {
    const match = value.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  }
};

const requestSuggestionRewrite = async ({
  lovableApiKey,
  question,
  sectionTitle,
  sectionIndex,
  projectDescription,
  issues,
}: {
  lovableApiKey: string;
  question: string;
  sectionTitle: string;
  sectionIndex?: number;
  projectDescription?: string;
  issues: QuestionReviewResult["issues"];
}) => {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/gpt-5.2",
      temperature: 0.2,
      max_tokens: 250,
      messages: [
        {
          role: "system",
          content: `Sen deneyimli bir UX arastirma metodologusun.
- Verilen soruyu tarafsiz, acik uclu, tek odakli ve dogal Turkce olacak sekilde yeniden yaz.
- Katilimciya problem, duygu veya yargi empoze etme.
- Eger ilk bolumse, soru hafif bir isinma tonu tasiyabilir.
- Sadece JSON dondur.`,
        },
        {
          role: "user",
          content: `Proje baglami: ${projectDescription || "Belirtilmedi"}
Bölüm: ${sectionTitle || "Belirtilmedi"}${typeof sectionIndex === "number" ? ` (Sıra ${sectionIndex + 1})` : ""}
Mevcut soru: ${question}
Sorundaki bulgular:
${issues.map((issue, index) => `${index + 1}. ${issue.label}: ${issue.detail}`).join("\n")}

Su formatta cevap ver:
{"suggestedRewrite":"...","reason":"kisa aciklama"}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Rewrite request failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content || "";
  const parsed = parseJsonObject(content);

  if (!parsed || typeof parsed.suggestedRewrite !== "string") {
    throw new Error("Rewrite response was not valid JSON");
  }

  return {
    suggestedRewrite: cleanQuestion(parsed.suggestedRewrite),
    reason: typeof parsed.reason === "string" ? parsed.reason.trim() : "",
  };
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    const {
      question,
      sectionTitle = "",
      sectionIndex,
      projectDescription = "",
    } = await req.json();

    const cleanedQuestion = cleanQuestion(question);

    if (!cleanedQuestion) {
      return new Response(JSON.stringify({ error: "Question is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const review = assessQuestionQuality({
      question: cleanedQuestion,
      sectionTitle,
      sectionIndex,
    });

    let suggestedRewrite: string | null = null;
    let suggestionReason = "";

    if (review.status !== "strong") {
      suggestedRewrite = buildFallbackRewrite({
        question: cleanedQuestion,
        sectionTitle,
        sectionIndex,
      });

      if (lovableApiKey) {
        try {
          const rewrite = await requestSuggestionRewrite({
            lovableApiKey,
            question: cleanedQuestion,
            sectionTitle,
            sectionIndex,
            projectDescription,
            issues: review.issues,
          });

          if (rewrite.suggestedRewrite) {
            suggestedRewrite = rewrite.suggestedRewrite;
            suggestionReason = rewrite.reason;
          }
        } catch (error) {
          console.error("Question rewrite generation failed:", error);
        }
      }
    }

    return new Response(JSON.stringify({
      reviewedQuestion: cleanedQuestion,
      ...review,
      suggestedRewrite,
      suggestionReason,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in review-question-quality function:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Internal server error",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
