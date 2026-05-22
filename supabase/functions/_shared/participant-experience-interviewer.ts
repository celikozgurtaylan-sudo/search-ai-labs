import "https://deno.land/x/xhr@0.1.0/mod.ts";
import {
  assessLiveFollowUpQuality,
  cleanQuestion,
  normalizeForMatch,
  type GeneratedQuestionQualityResult,
} from "./question-quality.ts";
import {
  restoreTurkishCharacters,
  TURKISH_ORTHOGRAPHY_PROMPT,
} from "./turkish-text.ts";
import {
  getParticipantExperienceQuestionBySignal,
  type NextQuestionDecision,
  type ParticipantExperienceSignal,
} from "./participant-experience-question-bank.ts";

const MODEL = Deno.env.get("ORCHESTRATOR_MODEL") || "gpt-4.1";
const MAX_ANCHOR_FOLLOW_UPS = 1;
const MAX_CONSECUTIVE_FOLLOW_UPS = 1;
const MAX_SESSION_FOLLOW_UPS = 3;

type AnswerSpecificity = "empty" | "vague" | "specific";
type EmotionalSignal = "none" | "positive" | "negative" | "mixed";

export interface ParticipantExperienceMaxFollowUpState {
  anchorFollowUpCount: number;
  consecutiveFollowUpCount: number;
  sessionFollowUpCount: number;
  maxAnchorFollowUps?: number;
  maxConsecutiveFollowUps?: number;
  maxSessionFollowUps?: number;
}

export interface ParticipantExperienceTurnAnalysis {
  detectedSignals: ParticipantExperienceSignal[];
  primarySignal: ParticipantExperienceSignal;
  followUpDecision: NextQuestionDecision;
  followUpReason: string;
  answerSpecificity: AnswerSpecificity;
  emotionalSignal: EmotionalSignal;
  privacyConcern: boolean;
  contradiction: boolean;
  repeatedTopic: boolean;
  unansweredAnchorObjective: boolean;
  maxFollowUpState: Required<ParticipantExperienceMaxFollowUpState>;
  transcriptConfidence?: number | null;
  generatedBy: "participant_experience_intelligence";
}

export interface ParticipantExperienceFollowUpResult {
  action: NextQuestionDecision;
  questionText: string | null;
  analysis: ParticipantExperienceTurnAnalysis;
  questionQualityResult?: GeneratedQuestionQualityResult;
  fallbackUsed: boolean;
  source: "llm" | "fallback" | "none";
  generationReason: string;
}

export interface BuildParticipantExperienceFollowUpInput {
  researchObjective?: string;
  audience?: string;
  decisionScope?: string;
  themeTitle?: string;
  anchorQuestionText: string;
  participantAnswer: string;
  previousFollowUps?: string[];
  recentQuestionTexts?: string[];
  transcriptConfidence?: number | null;
  wasSkipped?: boolean;
  remainingAnchorCount?: number;
  previouslyFollowedSignals?: ParticipantExperienceSignal[];
  maxFollowUpState: ParticipantExperienceMaxFollowUpState;
  allowLLM?: boolean;
}

const RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "participant_experience_follow_up",
    strict: true,
    schema: {
      type: "object",
      properties: {
        question: { type: "string" },
        reason: { type: "string" },
      },
      required: ["question", "reason"],
      additionalProperties: false,
    },
  },
};

const SIGNAL_PATTERNS: Array<{
  signal: ParticipantExperienceSignal;
  patterns: string[];
}> = [
  {
    signal: "permission_trust",
    patterns: ["kamera izni", "mikrofon izni", "izin iste", "izin ver", "kamera", "mikrofon"],
  },
  {
    signal: "privacy_concern",
    patterns: ["gizlilik", "veri", "kayded", "kayıt", "güvenemedim", "güvensiz", "mahrem", "paylaşılacak"],
  },
  {
    signal: "ai_voice_quality",
    patterns: ["ses", "robotik", "yapay", "ton", "tonlama", "tempo", "hızlı", "yavaş", "telaffuz", "doğal gelmedi"],
  },
  {
    signal: "turkish_language_quality",
    patterns: ["türkçe", "telaffuz", "aksan", "kelime", "cümle", "karakter", "dil"],
  },
  {
    signal: "warmup_experience",
    patterns: ["ısınma", "ilk soru", "başlangıç sorusu", "rahatladım", "konuşmaya alış"],
  },
  {
    signal: "interview_flow",
    patterns: ["akış", "sıra", "bölüm", "ilerledi", "görüşme", "takip etmesi", "tempo"],
  },
  {
    signal: "question_clarity",
    patterns: ["soru", "anlaşılır", "net", "karışık", "uzun", "ne sorduğunu", "ifade"],
  },
  {
    signal: "follow_up_relevance",
    patterns: ["sonraki soru", "takip sorusu", "alakasız", "cevabımla", "bağlantılı", "ilgili"],
  },
  {
    signal: "feeling_understood",
    patterns: ["anladı", "anlamadı", "beni dinledi", "yanlış anladı", "tam anlamadı", "ilgili değildi"],
  },
  {
    signal: "transcription_quality",
    patterns: ["yazıya", "transkript", "yanlış yaz", "metne", "kelimemi", "dök", "algılamadı"],
  },
  {
    signal: "first_impression",
    patterns: ["ilk", "başta", "başlangıçta", "ilk izlenim", "ilk anda"],
  },
  {
    signal: "expectation_clarity",
    patterns: ["ne beklen", "beklenti", "amaç", "ne yapacağım", "ne olacağını", "açıklama"],
  },
  {
    signal: "entry_flow",
    patterns: ["giriş", "link", "ekran", "başla", "katıl", "ilk sayfa"],
  },
  {
    signal: "control_and_safety",
    patterns: ["kontrol", "rahat değildim", "rahatsız", "durdur", "atla", "kapat", "çekindim"],
  },
  {
    signal: "completion_clarity",
    patterns: ["bitti", "tamamlandı", "son", "kapanış", "çıkış"],
  },
  {
    signal: "improvement_suggestion",
    patterns: ["değiştir", "farklı olsa", "öneri", "geliştir", "iyileştir", "daha iyi"],
  },
  {
    signal: "overall_value",
    patterns: ["iyiydi", "güzeldi", "faydalı", "değerli", "genel olarak", "başarılı", "kötüydü"],
  },
];

const VAGUE_PATTERNS = [
  "garip",
  "iyiydi",
  "güzeldi",
  "normal",
  "fena değildi",
  "kötüydü",
  "bilmiyorum",
  "emin değilim",
  "biraz",
  "gayet",
];

const POSITIVE_PATTERNS = ["iyi", "güzel", "net", "rahat", "doğal", "başarılı", "faydalı", "anlaşılır"];
const NEGATIVE_PATTERNS = ["garip", "kötü", "güvensiz", "rahatsız", "yapay", "robotik", "karışık", "anlamadı", "zor"];
const CONTRADICTION_PATTERNS = [
  "ama",
  "fakat",
  "bir yandan",
  "öte yandan",
  "aslında",
  "yine de",
];

const normalizeMaxFollowUpState = (
  state: ParticipantExperienceMaxFollowUpState,
): Required<ParticipantExperienceMaxFollowUpState> => ({
  anchorFollowUpCount: Math.max(0, state.anchorFollowUpCount || 0),
  consecutiveFollowUpCount: Math.max(0, state.consecutiveFollowUpCount || 0),
  sessionFollowUpCount: Math.max(0, state.sessionFollowUpCount || 0),
  maxAnchorFollowUps: state.maxAnchorFollowUps ?? MAX_ANCHOR_FOLLOW_UPS,
  maxConsecutiveFollowUps: state.maxConsecutiveFollowUps ?? MAX_CONSECUTIVE_FOLLOW_UPS,
  maxSessionFollowUps: state.maxSessionFollowUps ?? MAX_SESSION_FOLLOW_UPS,
});

const countWords = (value: string) =>
  cleanQuestion(value).split(/\s+/).filter(Boolean).length;

const matchAny = (normalized: string, patterns: string[]) =>
  patterns.some((pattern) => normalized.includes(normalizeForMatch(pattern)));

const uniqueSignals = (signals: ParticipantExperienceSignal[]) =>
  Array.from(new Set(signals));

export const classifyParticipantExperienceSignals = (answerText: string): ParticipantExperienceSignal[] => {
  const cleaned = cleanQuestion(restoreTurkishCharacters(answerText));
  const normalized = normalizeForMatch(cleaned);
  const wordCount = countWords(cleaned);
  const signals = SIGNAL_PATTERNS
    .filter((entry) => matchAny(normalized, entry.patterns))
    .map((entry) => entry.signal);

  if (wordCount <= 5 || signals.length === 0 || matchAny(normalized, VAGUE_PATTERNS)) {
    signals.push("unclear_or_vague");
  }

  return uniqueSignals(signals);
};

const getAnswerSpecificity = (answerText: string, detectedSignals: ParticipantExperienceSignal[]): AnswerSpecificity => {
  const cleaned = cleanQuestion(answerText);
  const wordCount = countWords(cleaned);
  const normalized = normalizeForMatch(cleaned);

  if (wordCount === 0) {
    return "empty";
  }

  const vagueOnly = matchAny(normalized, VAGUE_PATTERNS) && wordCount <= 8;
  if (wordCount <= 5 || vagueOnly || (detectedSignals.includes("unclear_or_vague") && wordCount <= 9)) {
    return "vague";
  }

  return "specific";
};

const getEmotionalSignal = (answerText: string): EmotionalSignal => {
  const normalized = normalizeForMatch(answerText);
  const positive = matchAny(normalized, POSITIVE_PATTERNS);
  const negative = matchAny(normalized, NEGATIVE_PATTERNS);

  if (positive && negative) {
    return "mixed";
  }

  if (positive) {
    return "positive";
  }

  if (negative) {
    return "negative";
  }

  return "none";
};

const getPrimarySignal = (signals: ParticipantExperienceSignal[]) => {
  const priority: ParticipantExperienceSignal[] = [
    "permission_trust",
    "privacy_concern",
    "control_and_safety",
    "feeling_understood",
    "transcription_quality",
    "ai_voice_quality",
    "turkish_language_quality",
    "follow_up_relevance",
    "question_clarity",
    "warmup_experience",
    "interview_flow",
    "expectation_clarity",
    "entry_flow",
    "first_impression",
    "improvement_suggestion",
    "completion_clarity",
    "overall_value",
    "unclear_or_vague",
  ];

  return priority.find((signal) => signals.includes(signal)) ?? "unclear_or_vague";
};

const inferDecision = ({
  wasSkipped,
  specificity,
  primarySignal,
  detectedSignals,
  repeatedTopic,
  maxFollowUpState,
  remainingAnchorCount,
}: {
  wasSkipped?: boolean;
  specificity: AnswerSpecificity;
  primarySignal: ParticipantExperienceSignal;
  detectedSignals: ParticipantExperienceSignal[];
  repeatedTopic: boolean;
  maxFollowUpState: Required<ParticipantExperienceMaxFollowUpState>;
  remainingAnchorCount?: number;
}) => {
  if (wasSkipped || specificity === "empty") {
    return {
      decision: "move_to_next_anchor" as NextQuestionDecision,
      reason: "Yanıt boş veya soru atlanmış; görüşme akışını ilerlet.",
    };
  }

  if (
    maxFollowUpState.anchorFollowUpCount >= maxFollowUpState.maxAnchorFollowUps ||
    maxFollowUpState.consecutiveFollowUpCount >= maxFollowUpState.maxConsecutiveFollowUps ||
    maxFollowUpState.sessionFollowUpCount >= maxFollowUpState.maxSessionFollowUps
  ) {
    return {
      decision: "move_to_next_anchor" as NextQuestionDecision,
      reason: "Follow-up sınırına ulaşıldı; state-machine bir sonraki anchor'a geçmeli.",
    };
  }

  if (repeatedTopic) {
    return {
      decision: "move_to_next_anchor" as NextQuestionDecision,
      reason: "Bu sinyal daha önce derinleştirilmiş; tekrar döngüsünden kaçın.",
    };
  }

  if (
    remainingAnchorCount === 0 &&
    specificity === "specific" &&
    !["privacy_concern", "permission_trust", "control_and_safety"].includes(primarySignal)
  ) {
    return {
      decision: "end_section" as NextQuestionDecision,
      reason: "Son anchor yeterince yanıtlandı; ekstra soru ile görüşmeyi uzatma.",
    };
  }

  if (specificity === "vague" && ["unclear_or_vague", "overall_value"].includes(primarySignal)) {
    return {
      decision: "ask_clarification" as NextQuestionDecision,
      reason: "Yanıt kısa veya yoruma açık kaldı; tek somutlaştırma sorusu sor.",
    };
  }

  if (
    ["privacy_concern", "permission_trust", "control_and_safety"].includes(primarySignal) &&
    maxFollowUpState.sessionFollowUpCount > 0
  ) {
    return {
      decision: "skip_sensitive_topic" as NextQuestionDecision,
      reason: "Hassas güvenlik/gizlilik konusu daha önce açılmış; katılımcıyı zorlamadan ilerle.",
    };
  }

  if (
    [
      "privacy_concern",
      "permission_trust",
      "control_and_safety",
      "ai_voice_quality",
      "turkish_language_quality",
      "follow_up_relevance",
      "feeling_understood",
      "transcription_quality",
      "question_clarity",
      "warmup_experience",
      "interview_flow",
      "expectation_clarity",
      "entry_flow",
      "first_impression",
      "improvement_suggestion",
    ].includes(primarySignal)
  ) {
    return {
      decision: "ask_follow_up" as NextQuestionDecision,
      reason: "Yanıtta araştırma açısından anlamlı bir deneyim sinyali var.",
    };
  }

  return {
    decision: "move_to_next_anchor" as NextQuestionDecision,
    reason: "Yanıt anchor amacını yeterince karşılıyor; sıradaki anchor'a geç.",
  };
};

export const analyzeParticipantExperienceTurn = (
  input: Omit<BuildParticipantExperienceFollowUpInput, "allowLLM">,
): ParticipantExperienceTurnAnalysis => {
  const answer = restoreTurkishCharacters(input.participantAnswer || "");
  const detectedSignals = classifyParticipantExperienceSignals(answer);
  const primarySignal = getPrimarySignal(detectedSignals);
  const specificity = getAnswerSpecificity(answer, detectedSignals);
  const emotionalSignal = getEmotionalSignal(answer);
  const normalizedAnswer = normalizeForMatch(answer);
  const maxFollowUpState = normalizeMaxFollowUpState(input.maxFollowUpState);
  const repeatedTopic = input.previouslyFollowedSignals?.includes(primarySignal) ?? false;
  const privacyConcern = detectedSignals.some((signal) =>
    ["privacy_concern", "permission_trust", "control_and_safety"].includes(signal)
  );
  const contradiction = matchAny(normalizedAnswer, CONTRADICTION_PATTERNS);
  const unansweredAnchorObjective = specificity !== "specific";
  const decision = inferDecision({
    wasSkipped: input.wasSkipped,
    specificity,
    primarySignal,
    detectedSignals,
    repeatedTopic,
    maxFollowUpState,
    remainingAnchorCount: input.remainingAnchorCount,
  });

  return {
    detectedSignals,
    primarySignal,
    followUpDecision: decision.decision,
    followUpReason: decision.reason,
    answerSpecificity: specificity,
    emotionalSignal,
    privacyConcern,
    contradiction,
    repeatedTopic,
    unansweredAnchorObjective,
    maxFollowUpState,
    transcriptConfidence: input.transcriptConfidence ?? null,
    generatedBy: "participant_experience_intelligence",
  };
};

const normalizeGeneratedQuestion = (value: unknown) => {
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

  return cleaned.endsWith("?") ? cleaned : `${cleaned.replace(/[.!]+$/g, "")}?`;
};

const requestLLMFollowUp = async (
  input: BuildParticipantExperienceFollowUpInput,
  analysis: ParticipantExperienceTurnAnalysis,
) => {
  const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiApiKey) {
    return null;
  }

  const prompt = `Araştırma amacı: ${input.researchObjective || "Belirtilmedi"}
Hedef kitle: ${input.audience || "Belirtilmedi"}
Karar alanı: ${input.decisionScope || "Belirtilmedi"}
Tema: ${input.themeTitle || "Belirtilmedi"}
Anchor soru: ${input.anchorQuestionText}
Katılımcı cevabı: ${input.participantAnswer || "[boş]"}
Tespit edilen sinyaller: ${analysis.detectedSignals.join(", ")}
Karar: ${analysis.followUpDecision}
Bu anchor için önceki follow-up'lar: ${input.previousFollowUps?.join(" | ") || "Yok"}

Tek bir doğal Türkçe follow-up üret.
Kurallar:
- Tek cümle, tek odak.
- 4-18 kelime arası hedefle.
- Katılımcının cevabından doğsun.
- Yönlendirici veya varsayımlı olmasın.
- "Peki", "az önce", "buna göre" kullanma.
- Seçenekli ayrıştırma gerekiyorsa en fazla 3 kısa seçenek kullan; ikinci bir soru gömme.
- Hassas konularda baskı kurma.
- ${TURKISH_ORTHOGRAPHY_PROMPT}

Yalnızca JSON döndür.`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: "Sen deneyimli bir Türkçe UX araştırmacısısın. Katılımcıyı yönlendirmeden tek bir kısa follow-up sorusu üretirsin.",
        },
        { role: "user", content: prompt },
      ],
      response_format: RESPONSE_FORMAT,
    }),
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    return null;
  }

  const parsed = JSON.parse(content);
  return {
    question: normalizeGeneratedQuestion(parsed.question),
    reason: typeof parsed.reason === "string" ? restoreTurkishCharacters(parsed.reason).trim() : "llm",
  };
};

const buildFallbackFollowUp = (
  analysis: ParticipantExperienceTurnAnalysis,
  recentQuestionTexts: string[],
) => {
  const fallback = getParticipantExperienceQuestionBySignal(
    analysis.followUpDecision === "ask_clarification" ? "unclear_or_vague" : analysis.primarySignal,
    recentQuestionTexts,
  );

  return fallback.textTr;
};

export const buildParticipantExperienceFollowUp = async (
  input: BuildParticipantExperienceFollowUpInput,
): Promise<ParticipantExperienceFollowUpResult> => {
  const analysis = analyzeParticipantExperienceTurn(input);
  const recentQuestionTexts = input.recentQuestionTexts ?? [];
  const fallbackQuestion = buildFallbackFollowUp(analysis, recentQuestionTexts);

  if (!["ask_follow_up", "ask_clarification"].includes(analysis.followUpDecision)) {
    return {
      action: analysis.followUpDecision,
      questionText: null,
      analysis,
      fallbackUsed: false,
      source: "none",
      generationReason: analysis.followUpReason,
    };
  }

  let candidate: { question: string; reason: string } | null = null;
  if (input.allowLLM !== false) {
    try {
      candidate = await requestLLMFollowUp(input, analysis);
    } catch (error) {
      console.warn("Participant experience follow-up LLM failed:", error);
    }
  }

  if (candidate?.question) {
    const quality = assessLiveFollowUpQuality({
      question: candidate.question,
      previousAnswer: input.participantAnswer,
      recentQuestions: recentQuestionTexts,
      expectedSignals: analysis.detectedSignals,
      fallbackQuestion,
    });

    if (quality.passed) {
      return {
        action: analysis.followUpDecision,
        questionText: candidate.question,
        analysis,
        questionQualityResult: quality,
        fallbackUsed: false,
        source: "llm",
        generationReason: candidate.reason || analysis.followUpReason,
      };
    }

    if (quality.revisedQuestion) {
      const revisedQuality = assessLiveFollowUpQuality({
        question: quality.revisedQuestion,
        previousAnswer: input.participantAnswer,
        recentQuestions: recentQuestionTexts,
        expectedSignals: analysis.detectedSignals,
      });

      if (revisedQuality.passed || revisedQuality.riskLevel !== "high") {
        return {
          action: analysis.followUpDecision,
          questionText: quality.revisedQuestion,
          analysis,
          questionQualityResult: revisedQuality,
          fallbackUsed: true,
          source: "fallback",
          generationReason: "LLM sorusu kalite kontrolünden geçmedi; güvenli fallback kullanıldı.",
        };
      }
    }

    return {
      action: analysis.followUpDecision,
      questionText: fallbackQuestion,
      analysis,
      questionQualityResult: quality,
      fallbackUsed: true,
      source: "fallback",
      generationReason: "LLM sorusu kalite kontrolünden geçmedi; fallback kullanıldı.",
    };
  }

  const fallbackQuality = assessLiveFollowUpQuality({
    question: fallbackQuestion,
    previousAnswer: input.participantAnswer,
    recentQuestions: recentQuestionTexts,
    expectedSignals: analysis.detectedSignals,
  });

  return {
    action: analysis.followUpDecision,
    questionText: fallbackQuestion,
    analysis,
    questionQualityResult: fallbackQuality,
    fallbackUsed: true,
    source: "fallback",
    generationReason: "LLM kullanılmadı veya yanıt üretmedi; deterministic fallback kullanıldı.",
  };
};

export const getParticipantExperienceLimits = () => ({
  maxAnchorFollowUps: MAX_ANCHOR_FOLLOW_UPS,
  maxConsecutiveFollowUps: MAX_CONSECUTIVE_FOLLOW_UPS,
  maxSessionFollowUps: MAX_SESSION_FOLLOW_UPS,
});
