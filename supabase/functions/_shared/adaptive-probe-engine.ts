import {
  cleanQuestion,
  normalizeForMatch,
} from "./question-quality.ts";
import {
  restoreTurkishCharacters,
  TURKISH_ORTHOGRAPHY_PROMPT,
} from "./turkish-text.ts";

export const ADAPTIVE_PROBE_PROMPT_VERSION = "adaptive_probe_engine_v1";
export const ADAPTIVE_PROBE_MODEL = Deno.env.get("ORCHESTRATOR_MODEL") || "gpt-4.1";

export const GAP_TYPES = [
  "missing_reasoning",
  "missing_example",
  "ambiguous_term",
  "missing_impact",
  "missing_expectation",
  "incomplete_decision",
  "unresolved_tradeoff",
  "unclear_frequency",
  "barrier_unclear",
  "irrelevant_answer",
  "none",
] as const;

export const PROBE_TYPES = [
  "reasoning_probe",
  "example_probe",
  "clarification_probe",
  "impact_probe",
  "expectation_probe",
  "decision_probe",
  "tradeoff_probe",
  "frequency_probe",
  "barrier_probe",
  "none",
] as const;

export type AdaptiveProbeDecision = "ask_follow_up" | "move_to_next_anchor" | "end_session";
export type AdaptiveProbeGapType = typeof GAP_TYPES[number];
export type AdaptiveProbeType = typeof PROBE_TYPES[number];
export type AdaptiveProbeLanguage = "tr" | "en" | "unknown";
export type AdaptiveProbeNextState = "FOLLOW_UP_ASKED" | "ANCHOR_COMPLETE" | "SESSION_COMPLETED";

export interface AdaptiveProbeBrief {
  objective: string;
  audience: string;
  decisionScope: string;
  constraints: string;
  mustCover: string[];
  updatedAt?: string | null;
  readyAt?: string | null;
}

export interface AdaptiveProbeAnchorQuestion {
  id: string;
  themeId: string;
  text: string;
}

export interface AdaptiveProbeTurn {
  questionId: string;
  questionText: string;
  answerText: string;
  source: "warmup" | "anchor" | "follow_up" | "unknown";
  anchorId?: string | null;
  anchorIndex?: number | null;
}

export interface AdaptiveProbeLimits {
  maxFollowUpsPerAnchor: number;
  maxTotalFollowUpsPerSession: number;
  preferredMinWords: number;
  preferredMaxWords: number;
  absoluteMaxWords: number;
}

export interface AdaptiveProbeDecisionContext {
  brief: AdaptiveProbeBrief;
  currentAnchor: AdaptiveProbeAnchorQuestion;
  currentAnchorQuestionId: string;
  currentAnchorIndex: number;
  totalAnchors: number;
  themeTitle: string;
  participantAnswer: string;
  priorTurns: AdaptiveProbeTurn[];
  previousFollowUps: string[];
  recentQuestionTexts: string[];
  currentAnchorFollowUpCount: number;
  totalFollowUpCount: number;
  sessionMetadata: Record<string, unknown>;
  participantLanguage?: AdaptiveProbeLanguage;
  transcriptConfidence?: number | null;
  wasSkipped?: boolean;
  limits?: Partial<AdaptiveProbeLimits>;
}

export interface AdaptiveProbeValidatorResult {
  one_question_only: boolean;
  neutral: boolean;
  non_leading: boolean;
  not_repetitive: boolean;
  not_too_broad: boolean;
  not_sensitive: boolean;
  under_word_limit: boolean;
  directly_related: boolean;
  relevant_to_anchor: boolean;
  no_unmentioned_assumptions: boolean;
  no_emotional_escalation: boolean;
  single_focus: boolean;
  passes: boolean;
  validator_notes: string;
}

export interface AdaptiveProbeAnalysis {
  decision: AdaptiveProbeDecision;
  should_probe: boolean;
  answer_summary: string;
  claim_detected: string | null;
  reason_present: boolean;
  example_present: boolean;
  impact_present: boolean;
  expectation_present: boolean;
  decision_logic_present: boolean;
  gap_type: AdaptiveProbeGapType;
  probe_type: AdaptiveProbeType;
  decision_reason: string;
  relevance_score: number;
  answer_sufficiency_score: number;
  research_value_score: number;
  risk_score: number;
  confidence_score: number;
  follow_up_question: string | null;
  validator: AdaptiveProbeValidatorResult;
  metadata: {
    anchor_id: string;
    anchor_index: number;
    recommended_next_state: AdaptiveProbeNextState;
    prompt_version: typeof ADAPTIVE_PROBE_PROMPT_VERSION;
  };
}

export interface AdaptiveProbePolicyResult {
  decision: AdaptiveProbeDecision;
  shouldGenerateFollowUp: boolean;
  reason: string;
  blockedReasons: string[];
  recommendedNextState: AdaptiveProbeNextState;
}

export interface AdaptiveProbeDecisionResult extends AdaptiveProbeAnalysis {
  policy: AdaptiveProbePolicyResult;
  generatedQuestion: string | null;
  rejectedQuestion: string | null;
  model: string;
  prompt_version: typeof ADAPTIVE_PROBE_PROMPT_VERSION;
  language: Exclude<AdaptiveProbeLanguage, "unknown">;
  error: string | null;
}

const DEFAULT_LIMITS: AdaptiveProbeLimits = {
  maxFollowUpsPerAnchor: 1,
  maxTotalFollowUpsPerSession: 5,
  preferredMinWords: 8,
  preferredMaxWords: 18,
  absoluteMaxWords: 24,
};

const SCORE_THRESHOLDS = {
  relevance: 0.60,
  researchValue: 0.65,
  sufficiencyMax: 0.65,
  riskMax: 0.35,
  confidence: 0.55,
};

const ANALYZER_RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "adaptive_probe_answer_analysis",
    strict: true,
    schema: {
      type: "object",
      properties: {
        decision: { type: "string", enum: ["ask_follow_up", "move_to_next_anchor", "end_session"] },
        should_probe: { type: "boolean" },
        answer_summary: { type: "string" },
        claim_detected: { type: ["string", "null"] },
        reason_present: { type: "boolean" },
        example_present: { type: "boolean" },
        impact_present: { type: "boolean" },
        expectation_present: { type: "boolean" },
        decision_logic_present: { type: "boolean" },
        gap_type: { type: "string", enum: GAP_TYPES },
        probe_type: { type: "string", enum: PROBE_TYPES },
        decision_reason: { type: "string" },
        relevance_score: { type: "number" },
        answer_sufficiency_score: { type: "number" },
        research_value_score: { type: "number" },
        risk_score: { type: "number" },
        confidence_score: { type: "number" },
        follow_up_question: { type: ["string", "null"] },
        validator: {
          type: "object",
          properties: {
            one_question_only: { type: "boolean" },
            neutral: { type: "boolean" },
            non_leading: { type: "boolean" },
            not_repetitive: { type: "boolean" },
            not_too_broad: { type: "boolean" },
            not_sensitive: { type: "boolean" },
            under_word_limit: { type: "boolean" },
            directly_related: { type: "boolean" },
            relevant_to_anchor: { type: "boolean" },
            no_unmentioned_assumptions: { type: "boolean" },
            no_emotional_escalation: { type: "boolean" },
            single_focus: { type: "boolean" },
            passes: { type: "boolean" },
            validator_notes: { type: "string" },
          },
          required: [
            "one_question_only",
            "neutral",
            "non_leading",
            "not_repetitive",
            "not_too_broad",
            "not_sensitive",
            "under_word_limit",
            "directly_related",
            "relevant_to_anchor",
            "no_unmentioned_assumptions",
            "no_emotional_escalation",
            "single_focus",
            "passes",
            "validator_notes",
          ],
          additionalProperties: false,
        },
        metadata: {
          type: "object",
          properties: {
            anchor_id: { type: "string" },
            anchor_index: { type: "number" },
            recommended_next_state: { type: "string", enum: ["FOLLOW_UP_ASKED", "ANCHOR_COMPLETE", "SESSION_COMPLETED"] },
            prompt_version: { type: "string" },
          },
          required: ["anchor_id", "anchor_index", "recommended_next_state", "prompt_version"],
          additionalProperties: false,
        },
      },
      required: [
        "decision",
        "should_probe",
        "answer_summary",
        "claim_detected",
        "reason_present",
        "example_present",
        "impact_present",
        "expectation_present",
        "decision_logic_present",
        "gap_type",
        "probe_type",
        "decision_reason",
        "relevance_score",
        "answer_sufficiency_score",
        "research_value_score",
        "risk_score",
        "confidence_score",
        "follow_up_question",
        "validator",
        "metadata",
      ],
      additionalProperties: false,
    },
  },
};

const GENERATOR_RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "adaptive_probe_follow_up_generation",
    strict: true,
    schema: {
      type: "object",
      properties: {
        follow_up_question: { type: "string" },
        decision_reason: { type: "string" },
      },
      required: ["follow_up_question", "decision_reason"],
      additionalProperties: false,
    },
  },
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asString = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const asBoolean = (value: unknown, fallback = false) =>
  typeof value === "boolean" ? value : fallback;

const asNumber = (value: unknown, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const clampScore = (value: unknown, fallback = 0) =>
  Math.max(0, Math.min(1, asNumber(value, fallback)));

const wordCount = (value: string) =>
  cleanQuestion(value).split(/\s+/).filter(Boolean).length;

const ensureQuestion = (value: string, language: Exclude<AdaptiveProbeLanguage, "unknown">) => {
  const cleaned = cleanQuestion(language === "tr" ? restoreTurkishCharacters(value) : value)
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .replace(/^\d+[.)]\s*/, "")
    .replace(/^[-*]\s*/, "");

  if (!cleaned) return "";
  return cleaned.endsWith("?") ? cleaned : `${cleaned.replace(/[.!]+$/g, "")}?`;
};

const isGapType = (value: unknown): value is AdaptiveProbeGapType =>
  typeof value === "string" && (GAP_TYPES as readonly string[]).includes(value);

const isProbeType = (value: unknown): value is AdaptiveProbeType =>
  typeof value === "string" && (PROBE_TYPES as readonly string[]).includes(value);

const normalizeLimits = (limits?: Partial<AdaptiveProbeLimits>): AdaptiveProbeLimits => ({
  maxFollowUpsPerAnchor: Math.max(0, Math.floor(limits?.maxFollowUpsPerAnchor ?? DEFAULT_LIMITS.maxFollowUpsPerAnchor)),
  maxTotalFollowUpsPerSession: Math.max(0, Math.floor(limits?.maxTotalFollowUpsPerSession ?? DEFAULT_LIMITS.maxTotalFollowUpsPerSession)),
  preferredMinWords: Math.max(1, Math.floor(limits?.preferredMinWords ?? DEFAULT_LIMITS.preferredMinWords)),
  preferredMaxWords: Math.max(1, Math.floor(limits?.preferredMaxWords ?? DEFAULT_LIMITS.preferredMaxWords)),
  absoluteMaxWords: Math.max(1, Math.floor(limits?.absoluteMaxWords ?? DEFAULT_LIMITS.absoluteMaxWords)),
});

export const detectAdaptiveProbeLanguage = (
  answer: string,
  explicitLanguage?: AdaptiveProbeLanguage,
): Exclude<AdaptiveProbeLanguage, "unknown"> => {
  if (explicitLanguage === "tr" || explicitLanguage === "en") {
    return explicitLanguage;
  }

  const normalized = normalizeForMatch(answer);
  const turkishSignals = [
    /[çğıöşüİ]/i.test(answer),
    /\b(ve|bir|çok|değil|gibi|çünkü|ama|fakat|şey|nasıl|benim|bana)\b/i.test(answer),
    normalized.includes("cunku") || normalized.includes("degil") || normalized.includes("gibi"),
  ].filter(Boolean).length;
  const englishSignals = [
    /\b(the|and|because|but|with|when|what|how|feel|felt|think|would)\b/i.test(answer),
    normalized.includes("because") || normalized.includes("experience"),
  ].filter(Boolean).length;

  return englishSignals > turkishSignals ? "en" : "tr";
};

const emptyValidator = (passes: boolean, notes: string): AdaptiveProbeValidatorResult => ({
  one_question_only: passes,
  neutral: passes,
  non_leading: passes,
  not_repetitive: passes,
  not_too_broad: passes,
  not_sensitive: passes,
  under_word_limit: passes,
  directly_related: passes,
  relevant_to_anchor: passes,
  no_unmentioned_assumptions: passes,
  no_emotional_escalation: passes,
  single_focus: passes,
  passes,
  validator_notes: notes,
});

const normalizeValidator = (value: unknown): AdaptiveProbeValidatorResult => {
  if (!isRecord(value)) {
    return emptyValidator(false, "Analyzer did not return validator metadata.");
  }

  const validator = {
    one_question_only: asBoolean(value.one_question_only),
    neutral: asBoolean(value.neutral),
    non_leading: asBoolean(value.non_leading),
    not_repetitive: asBoolean(value.not_repetitive),
    not_too_broad: asBoolean(value.not_too_broad),
    not_sensitive: asBoolean(value.not_sensitive),
    under_word_limit: asBoolean(value.under_word_limit),
    directly_related: asBoolean(value.directly_related),
    relevant_to_anchor: asBoolean(value.relevant_to_anchor),
    no_unmentioned_assumptions: asBoolean(value.no_unmentioned_assumptions),
    no_emotional_escalation: asBoolean(value.no_emotional_escalation),
    single_focus: asBoolean(value.single_focus),
    passes: asBoolean(value.passes),
    validator_notes: asString(value.validator_notes),
  };

  return {
    ...validator,
    passes: Object.entries(validator)
      .filter(([key]) => key !== "passes" && key !== "validator_notes")
      .every(([, passed]) => passed === true),
  };
};

const normalizeAnalysis = (
  raw: unknown,
  context: AdaptiveProbeDecisionContext,
): AdaptiveProbeAnalysis => {
  const parsed = isRecord(raw) ? raw : {};
  const metadata = isRecord(parsed.metadata) ? parsed.metadata : {};
  const decision = parsed.decision === "ask_follow_up" || parsed.decision === "end_session"
    ? parsed.decision
    : "move_to_next_anchor";
  const gapType = isGapType(parsed.gap_type) ? parsed.gap_type : "none";
  const probeType = isProbeType(parsed.probe_type) ? parsed.probe_type : "none";
  const recommendedState = metadata.recommended_next_state === "FOLLOW_UP_ASKED" ||
      metadata.recommended_next_state === "SESSION_COMPLETED"
    ? metadata.recommended_next_state
    : "ANCHOR_COMPLETE";

  return {
    decision,
    should_probe: decision === "ask_follow_up" && asBoolean(parsed.should_probe),
    answer_summary: asString(parsed.answer_summary),
    claim_detected: asString(parsed.claim_detected) || null,
    reason_present: asBoolean(parsed.reason_present),
    example_present: asBoolean(parsed.example_present),
    impact_present: asBoolean(parsed.impact_present),
    expectation_present: asBoolean(parsed.expectation_present),
    decision_logic_present: asBoolean(parsed.decision_logic_present),
    gap_type: gapType,
    probe_type: probeType,
    decision_reason: asString(parsed.decision_reason) || "Analyzer recommended moving forward.",
    relevance_score: clampScore(parsed.relevance_score),
    answer_sufficiency_score: clampScore(parsed.answer_sufficiency_score, 1),
    research_value_score: clampScore(parsed.research_value_score),
    risk_score: clampScore(parsed.risk_score, 1),
    confidence_score: clampScore(parsed.confidence_score),
    follow_up_question: null,
    validator: normalizeValidator(parsed.validator),
    metadata: {
      anchor_id: asString(metadata.anchor_id) || context.currentAnchor.id,
      anchor_index: asNumber(metadata.anchor_index, context.currentAnchorIndex),
      recommended_next_state: recommendedState,
      prompt_version: ADAPTIVE_PROBE_PROMPT_VERSION,
    },
  };
};

const createFallbackAnalysis = (
  context: AdaptiveProbeDecisionContext,
  reason: string,
  error: string | null = null,
): AdaptiveProbeAnalysis => ({
  decision: "move_to_next_anchor",
  should_probe: false,
  answer_summary: context.participantAnswer ? "Analysis unavailable; answer was saved." : "No participant answer was provided.",
  claim_detected: null,
  reason_present: false,
  example_present: false,
  impact_present: false,
  expectation_present: false,
  decision_logic_present: false,
  gap_type: "none",
  probe_type: "none",
  decision_reason: error ? `${reason}: ${error}` : reason,
  relevance_score: 0,
  answer_sufficiency_score: 1,
  research_value_score: 0,
  risk_score: 1,
  confidence_score: 0,
  follow_up_question: null,
  validator: emptyValidator(false, reason),
  metadata: {
    anchor_id: context.currentAnchor.id,
    anchor_index: context.currentAnchorIndex,
    recommended_next_state: "ANCHOR_COMPLETE",
    prompt_version: ADAPTIVE_PROBE_PROMPT_VERSION,
  },
});

const buildFinalResult = ({
  analysis,
  policy,
  generatedQuestion = null,
  rejectedQuestion = null,
  language,
  error = null,
}: {
  analysis: AdaptiveProbeAnalysis;
  policy: AdaptiveProbePolicyResult;
  generatedQuestion?: string | null;
  rejectedQuestion?: string | null;
  language: Exclude<AdaptiveProbeLanguage, "unknown">;
  error?: string | null;
}): AdaptiveProbeDecisionResult => ({
  ...analysis,
  policy,
  generatedQuestion,
  rejectedQuestion,
  model: ADAPTIVE_PROBE_MODEL,
  prompt_version: ADAPTIVE_PROBE_PROMPT_VERSION,
  language,
  error,
});

const includesAny = (normalized: string, patterns: string[]) =>
  patterns.some((pattern) => normalized.includes(normalizeForMatch(pattern)));

const contentWords = (value: string) =>
  normalizeForMatch(value)
    .split(/\s+/)
    .map((word) => word.replace(/[^a-z0-9]/g, ""))
    .filter((word) => word.length >= 4)
    .filter((word) => ![
      "bunu",
      "buna",
      "bunun",
      "that",
      "this",
      "what",
      "which",
      "more",
      "with",
      "your",
      "icin",
      "için",
      "daha",
      "hangi",
      "nasıl",
      "nasil",
      "oldu",
      "oluyor",
      "eder",
      "misiniz",
      "musunuz",
    ].includes(word));

export const validateAdaptiveProbeQuestion = (input: {
  question: string;
  participantAnswer: string;
  anchorQuestion: string;
  previousFollowUps?: string[];
  recentQuestionTexts?: string[];
  language?: Exclude<AdaptiveProbeLanguage, "unknown">;
  limits?: Partial<AdaptiveProbeLimits>;
}): AdaptiveProbeValidatorResult => {
  const limits = normalizeLimits(input.limits);
  const question = ensureQuestion(input.question, input.language ?? "tr");
  const normalized = normalizeForMatch(question);
  const normalizedAnswer = normalizeForMatch(input.participantAnswer);
  const normalizedAnchor = normalizeForMatch(input.anchorQuestion);
  const questionMarkCount = (question.match(/\?/g) || []).length;
  const words = wordCount(question);
  const recentQuestions = [
    ...(input.previousFollowUps ?? []),
    ...(input.recentQuestionTexts ?? []),
  ].map((item) => normalizeForMatch(item)).filter(Boolean);
  const answerWords = new Set(contentWords(input.participantAnswer));
  const anchorWords = new Set(contentWords(input.anchorQuestion));
  const questionWords = contentWords(question);
  const hasContextualOverlap = questionWords.some((word) => answerWords.has(word) || anchorWords.has(word));
  const hasReferentialContext = /\b(bu|bunu|buna|bunun|orada|nerede|ne zaman|hangi anda|that|this|it|there|when)\b/i.test(normalized);

  const oneQuestionOnly = questionMarkCount === 1 && !/(\?\s*\S)|\n/.test(question);
  const underWordLimit = words > 0 && words <= limits.absoluteMaxWords;
  const notRepetitive = !recentQuestions.some((recent) => {
    if (!recent) return false;
    return recent === normalized || recent.includes(normalized) || normalized.includes(recent);
  });
  const notTooBroad = !includesAny(normalized, [
    "biraz daha anlat",
    "biraz daha acar",
    "biraz daha açar",
    "detaylandir",
    "detaylandır",
    "bu konuda ne dusun",
    "bu konuda ne düşün",
    "genel olarak ne",
    "tell me more",
    "can you elaborate",
    "what do you think about this",
  ]);
  const notSensitive = !includesAny(normalized, [
    "sifre",
    "şifre",
    "parola",
    "password",
    "kart numara",
    "card number",
    "kredi kart",
    "cvv",
    "pin",
    "iban",
    "hesap numara",
    "account number",
    "kimlik numara",
    "identity number",
    "tc kimlik",
    "tckn",
    "dogrulama kod",
    "doğrulama kod",
    "authentication code",
    "security code",
    "guvenlik kod",
    "güvenlik kod",
    "login credential",
    "giris bilgi",
    "giriş bilgi",
  ]);
  const nonLeading = !includesAny(normalized, [
    "sizce de",
    "katiliyor musunuz",
    "katılıyor musunuz",
    "dogru mu",
    "doğru mu",
    "problem oldu mu",
    "sorun oldu mu",
    "zorlandiniz mi",
    "zorlandınız mı",
    "endiselendiniz mi",
    "endişelendiniz mi",
    "wouldn't you",
    "don't you think",
    "do you agree",
    "was it a problem",
  ]) && !/^(did|do|does|is|are|was|were|can|could|would|will)\b/i.test(question);
  const neutral = !includesAny(normalized, [
    "neden yapamad",
    "neden anlamad",
    "yanlis",
    "yanlış",
    "hata",
    "suclu",
    "suçlu",
    "basarisiz",
    "başarısız",
    "obviously",
    "clearly",
    "failed",
  ]);
  const noUnmentionedAssumptions = !includesAny(normalized, [
    "sizi rahatsiz eden",
    "sizi rahatsız eden",
    "sizi durduran",
    "kafanizi karistiran",
    "kafanızı karıştıran",
    "guvensiz hissettiren",
    "güvensiz hissettiren",
    "the problem you had",
    "what confused you",
    "what made you uncomfortable",
  ]);
  const noEmotionalEscalation = !includesAny(normalized, [
    "travma",
    "kaygi",
    "kaygı",
    "stres",
    "korku",
    "korkuttu",
    "uzdu",
    "üzdü",
    "ofkelend",
    "öfkelend",
    "anxiety",
    "trauma",
    "afraid",
    "angry",
  ]);
  const singleFocus = !/\b(ve|and)\b/.test(normalized) && !/[;:]/.test(question);
  const hasAnchorOverlap = questionWords.some((word) => anchorWords.has(word));
  const directlyRelated = hasContextualOverlap || (hasReferentialContext && normalizedAnswer.length > 0);
  const relevantToAnchor = hasAnchorOverlap || directlyRelated || normalizedAnchor.length === 0;

  const checks = {
    one_question_only: oneQuestionOnly,
    neutral,
    non_leading: nonLeading,
    not_repetitive: notRepetitive,
    not_too_broad: notTooBroad,
    not_sensitive: notSensitive,
    under_word_limit: underWordLimit,
    directly_related: directlyRelated,
    relevant_to_anchor: relevantToAnchor,
    no_unmentioned_assumptions: noUnmentionedAssumptions,
    no_emotional_escalation: noEmotionalEscalation,
    single_focus: singleFocus,
  };
  const failed = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([key]) => key);

  return {
    ...checks,
    passes: failed.length === 0,
    validator_notes: failed.length === 0
      ? "Follow-up passed deterministic validation."
      : `Rejected by deterministic validation: ${failed.join(", ")}.`,
  };
};

export const applyAdaptiveProbePolicy = (
  context: AdaptiveProbeDecisionContext,
  analysis: AdaptiveProbeAnalysis,
): AdaptiveProbePolicyResult => {
  const limits = normalizeLimits(context.limits);
  const blockedReasons: string[] = [];
  const answer = cleanQuestion(context.participantAnswer);
  const remainingAnchors = Math.max(0, context.totalAnchors - context.currentAnchorIndex - 1);

  if (context.wasSkipped || answer.length === 0) blockedReasons.push("answer_empty_or_skipped");
  if (!analysis.should_probe || analysis.decision !== "ask_follow_up") blockedReasons.push("analysis_did_not_request_probe");
  if (analysis.relevance_score < SCORE_THRESHOLDS.relevance) blockedReasons.push("low_relevance");
  if (analysis.research_value_score < SCORE_THRESHOLDS.researchValue) blockedReasons.push("low_research_value");
  if (analysis.answer_sufficiency_score > SCORE_THRESHOLDS.sufficiencyMax) blockedReasons.push("answer_already_sufficient");
  if (analysis.risk_score > SCORE_THRESHOLDS.riskMax) blockedReasons.push("high_risk");
  if (analysis.confidence_score < SCORE_THRESHOLDS.confidence) blockedReasons.push("low_confidence");
  if (analysis.gap_type === "none" || analysis.gap_type === "irrelevant_answer") blockedReasons.push("no_actionable_gap");
  if (analysis.probe_type === "none") blockedReasons.push("no_probe_type");
  if (context.currentAnchorFollowUpCount >= limits.maxFollowUpsPerAnchor) blockedReasons.push("anchor_follow_up_limit_reached");
  if (context.totalFollowUpCount >= limits.maxTotalFollowUpsPerSession) blockedReasons.push("session_follow_up_limit_reached");

  if (analysis.decision === "end_session" && remainingAnchors === 0) {
    return {
      decision: "end_session",
      shouldGenerateFollowUp: false,
      reason: "Analyzer recommended ending after final anchor.",
      blockedReasons,
      recommendedNextState: "SESSION_COMPLETED",
    };
  }

  if (blockedReasons.length > 0) {
    return {
      decision: "move_to_next_anchor",
      shouldGenerateFollowUp: false,
      reason: `Move forward: ${blockedReasons.join(", ")}.`,
      blockedReasons,
      recommendedNextState: "ANCHOR_COMPLETE",
    };
  }

  return {
    decision: "ask_follow_up",
    shouldGenerateFollowUp: true,
    reason: "Policy allowed one targeted follow-up.",
    blockedReasons: [],
    recommendedNextState: "FOLLOW_UP_ASKED",
  };
};

const callOpenAIJson = async (
  openaiApiKey: string,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  responseFormat: Record<string, unknown>,
) => {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: ADAPTIVE_PROBE_MODEL,
      messages,
      response_format: responseFormat,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI error: ${response.status}`);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("OpenAI returned an invalid response");
  }

  return JSON.parse(content);
};

const compactTurns = (turns: AdaptiveProbeTurn[]) =>
  turns.slice(-8).map((turn, index) => ({
    index: index + 1,
    source: turn.source,
    anchorIndex: turn.anchorIndex ?? null,
    question: turn.questionText,
    answer: turn.answerText,
  }));

const buildAnalyzerMessages = (
  context: AdaptiveProbeDecisionContext,
  language: Exclude<AdaptiveProbeLanguage, "unknown">,
) => [
  {
    role: "system" as const,
    content: `You are Searcho's governed adaptive probe analyzer for semi-structured UX research interviews.

You do not run free chat. The app owns session flow. You only analyze the latest answer.

Return strict JSON only.

Rules:
- Preserve the shared anchor-question backbone.
- Prefer moving to the next anchor when uncertain.
- Do not ask for passwords, card numbers, account numbers, identity numbers, credentials, authentication codes, or confidential banking/security information.
- If the answer is already specific, detailed, and useful, recommend move_to_next_anchor.
- If the answer is irrelevant, skipped, empty, risky, or too sensitive, recommend move_to_next_anchor.
- A probe is allowed only for a relevant but insufficient answer.
- Do not generate a follow-up question in this analyzer step; set follow_up_question to null.
- Language for later follow-up: ${language}.
- ${TURKISH_ORTHOGRAPHY_PROMPT}`,
  },
  {
    role: "user" as const,
    content: JSON.stringify({
      prompt_version: ADAPTIVE_PROBE_PROMPT_VERSION,
      objective: context.brief.objective,
      audience: context.brief.audience,
      decisionScope: context.brief.decisionScope,
      constraints: context.brief.constraints,
      mustCover: context.brief.mustCover,
      themeTitle: context.themeTitle,
      anchor: {
        id: context.currentAnchor.id,
        index: context.currentAnchorIndex,
        text: context.currentAnchor.text,
      },
      answer: context.participantAnswer || "",
      wasSkipped: Boolean(context.wasSkipped),
      transcriptConfidence: context.transcriptConfidence ?? null,
      followUpCounts: {
        currentAnchor: context.currentAnchorFollowUpCount,
        sessionTotal: context.totalFollowUpCount,
      },
      priorTurns: compactTurns(context.priorTurns),
      allowedGapTypes: GAP_TYPES,
      allowedProbeTypes: PROBE_TYPES,
      scoreGuidance: {
        relevance_score: "0 irrelevant, 1 directly answers current anchor",
        answer_sufficiency_score: "0 not useful enough, 1 already specific/detailed/useful",
        research_value_score: "0 low value, 1 high value for study objective",
        risk_score: "0 safe, 1 sensitive or unsafe to probe",
        confidence_score: "0 uncertain analysis, 1 confident analysis",
      },
    }),
  },
];

const buildGeneratorMessages = (
  context: AdaptiveProbeDecisionContext,
  analysis: AdaptiveProbeAnalysis,
  language: Exclude<AdaptiveProbeLanguage, "unknown">,
) => [
  {
    role: "system" as const,
    content: `You are Searcho's governed adaptive probe generator.

Generate exactly one short neutral follow-up question only.

Rules:
- Use ${language === "tr" ? "natural concise Turkish" : "natural concise English"}.
- Preferred length: 8 to 18 words. Absolute max: 24 words.
- One question only.
- Directly relate to the participant's answer and current anchor.
- Do not lead, judge, challenge, broaden, repeat, or emotionally escalate.
- Do not ask for banking/security/password/card/account/identity information.
- Do not ask multiple things at once.
- Avoid "and" / "ve" unless impossible.
- ${TURKISH_ORTHOGRAPHY_PROMPT}`,
  },
  {
    role: "user" as const,
    content: JSON.stringify({
      prompt_version: ADAPTIVE_PROBE_PROMPT_VERSION,
      objective: context.brief.objective,
      anchorQuestion: context.currentAnchor.text,
      participantAnswer: context.participantAnswer,
      answerSummary: analysis.answer_summary,
      claimDetected: analysis.claim_detected,
      gapType: analysis.gap_type,
      probeType: analysis.probe_type,
      decisionReason: analysis.decision_reason,
      previousFollowUps: context.previousFollowUps,
      recentQuestionTexts: context.recentQuestionTexts.slice(-8),
    }),
  },
];

export async function decideAdaptiveProbe(
  context: AdaptiveProbeDecisionContext,
): Promise<AdaptiveProbeDecisionResult> {
  const language = detectAdaptiveProbeLanguage(context.participantAnswer, context.participantLanguage);
  const openaiApiKey = Deno.env.get("OPENAI_API_KEY");

  if (!openaiApiKey) {
    const analysis = createFallbackAnalysis(context, "OPENAI_API_KEY is not configured.");
    return buildFinalResult({
      analysis,
      policy: applyAdaptiveProbePolicy(context, analysis),
      language,
      error: "missing_openai_api_key",
    });
  }

  let analysis: AdaptiveProbeAnalysis;
  try {
    const analyzerPayload = await callOpenAIJson(
      openaiApiKey,
      buildAnalyzerMessages(context, language),
      ANALYZER_RESPONSE_FORMAT,
    );
    analysis = normalizeAnalysis(analyzerPayload, context);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Analyzer failed";
    analysis = createFallbackAnalysis(context, "Analyzer failed; moving to next anchor.", errorMessage);
    return buildFinalResult({
      analysis,
      policy: applyAdaptiveProbePolicy(context, analysis),
      language,
      error: "analysis_failed",
    });
  }

  const policy = applyAdaptiveProbePolicy(context, analysis);
  if (!policy.shouldGenerateFollowUp) {
    return buildFinalResult({
      analysis: {
        ...analysis,
        decision: policy.decision,
        should_probe: false,
        follow_up_question: null,
        metadata: {
          ...analysis.metadata,
          recommended_next_state: policy.recommendedNextState,
          prompt_version: ADAPTIVE_PROBE_PROMPT_VERSION,
        },
      },
      policy,
      language,
    });
  }

  let generatedQuestion = "";
  let generationReason = analysis.decision_reason;
  try {
    const generatorPayload = await callOpenAIJson(
      openaiApiKey,
      buildGeneratorMessages(context, analysis, language),
      GENERATOR_RESPONSE_FORMAT,
    );
    generatedQuestion = ensureQuestion(asString(generatorPayload.follow_up_question), language);
    generationReason = asString(generatorPayload.decision_reason) || generationReason;
  } catch {
    const finalAnalysis: AdaptiveProbeAnalysis = {
      ...analysis,
      decision: "move_to_next_anchor",
      should_probe: false,
      follow_up_question: null,
      decision_reason: "Follow-up generation failed; moving to next anchor.",
      validator: emptyValidator(false, "Follow-up generation failed."),
      metadata: {
        ...analysis.metadata,
        recommended_next_state: "ANCHOR_COMPLETE",
        prompt_version: ADAPTIVE_PROBE_PROMPT_VERSION,
      },
    };
    return buildFinalResult({
      analysis: finalAnalysis,
      policy: {
        decision: "move_to_next_anchor",
        shouldGenerateFollowUp: false,
        reason: finalAnalysis.decision_reason,
        blockedReasons: ["generation_failed"],
        recommendedNextState: "ANCHOR_COMPLETE",
      },
      language,
      error: "generation_failed",
    });
  }

  const validator = validateAdaptiveProbeQuestion({
    question: generatedQuestion,
    participantAnswer: context.participantAnswer,
    anchorQuestion: context.currentAnchor.text,
    previousFollowUps: context.previousFollowUps,
    recentQuestionTexts: context.recentQuestionTexts,
    language,
    limits: context.limits,
  });

  if (!validator.passes) {
    const finalAnalysis: AdaptiveProbeAnalysis = {
      ...analysis,
      decision: "move_to_next_anchor",
      should_probe: false,
      follow_up_question: null,
      decision_reason: `Generated follow-up rejected: ${validator.validator_notes}`,
      validator,
      metadata: {
        ...analysis.metadata,
        recommended_next_state: "ANCHOR_COMPLETE",
        prompt_version: ADAPTIVE_PROBE_PROMPT_VERSION,
      },
    };

    return buildFinalResult({
      analysis: finalAnalysis,
      policy: {
        decision: "move_to_next_anchor",
        shouldGenerateFollowUp: false,
        reason: finalAnalysis.decision_reason,
        blockedReasons: ["validator_rejected"],
        recommendedNextState: "ANCHOR_COMPLETE",
      },
      generatedQuestion,
      rejectedQuestion: generatedQuestion,
      language,
    });
  }

  const finalAnalysis: AdaptiveProbeAnalysis = {
    ...analysis,
    decision: "ask_follow_up",
    should_probe: true,
    follow_up_question: generatedQuestion,
    decision_reason: generationReason,
    validator,
    metadata: {
      ...analysis.metadata,
      recommended_next_state: "FOLLOW_UP_ASKED",
      prompt_version: ADAPTIVE_PROBE_PROMPT_VERSION,
    },
  };

  return buildFinalResult({
    analysis: finalAnalysis,
    policy,
    generatedQuestion,
    language,
  });
}
