import {
  applyAdaptiveProbePolicy,
  detectAdaptiveProbeLanguage,
  validateAdaptiveProbeQuestion,
  type AdaptiveProbeAnalysis,
  type AdaptiveProbeDecisionContext,
} from "./adaptive-probe-engine.ts";

const assert = (condition: unknown, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

const assertEquals = (actual: unknown, expected: unknown, message: string) => {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}`);
  }
};

const baseContext: AdaptiveProbeDecisionContext = {
  brief: {
    objective: "Katılımcıların dijital başvuru deneyimini anlamak",
    audience: "Mobil bankacılık kullanıcıları",
    decisionScope: "Başvuru akışını iyileştirmek",
    constraints: "Hassas bilgi istenmeyecek",
    mustCover: ["güven", "anlaşılırlık"],
  },
  currentAnchor: {
    id: "anchor-1",
    themeId: "theme-1",
    text: "Başvuru adımında size en net gelen nokta ne oldu?",
  },
  currentAnchorQuestionId: "question-1",
  currentAnchorIndex: 0,
  totalAnchors: 5,
  themeTitle: "Başvuru Deneyimi",
  participantAnswer: "Başvuru adımında ücret bilgisinin net yazılması güven verdi.",
  priorTurns: [],
  previousFollowUps: [],
  recentQuestionTexts: ["Başvuru adımında size en net gelen nokta ne oldu?"],
  currentAnchorFollowUpCount: 0,
  totalFollowUpCount: 0,
  sessionMetadata: {},
};

const baseAnalysis: AdaptiveProbeAnalysis = {
  decision: "ask_follow_up",
  should_probe: true,
  answer_summary: "Ücret bilgisinin netliği güven oluşturmuş.",
  claim_detected: "Ücret bilgisinin net yazılması güven verdi.",
  reason_present: false,
  example_present: false,
  impact_present: true,
  expectation_present: false,
  decision_logic_present: false,
  gap_type: "missing_reasoning",
  probe_type: "reasoning_probe",
  decision_reason: "Yanıt ilgili ve değerli ancak nedeni eksik.",
  relevance_score: 0.8,
  answer_sufficiency_score: 0.5,
  research_value_score: 0.8,
  risk_score: 0.1,
  confidence_score: 0.8,
  follow_up_question: null,
  validator: {
    one_question_only: true,
    neutral: true,
    non_leading: true,
    not_repetitive: true,
    not_too_broad: true,
    not_sensitive: true,
    under_word_limit: true,
    directly_related: true,
    relevant_to_anchor: true,
    no_unmentioned_assumptions: true,
    no_emotional_escalation: true,
    single_focus: true,
    passes: true,
    validator_notes: "ok",
  },
  metadata: {
    anchor_id: "anchor-1",
    anchor_index: 0,
    recommended_next_state: "FOLLOW_UP_ASKED",
    prompt_version: "adaptive_probe_engine_v1",
  },
};

Deno.test("policy allows one targeted follow-up at threshold conditions", () => {
  const result = applyAdaptiveProbePolicy(baseContext, baseAnalysis);

  assertEquals(result.decision, "ask_follow_up", "Policy should allow follow-up");
  assertEquals(result.shouldGenerateFollowUp, true, "Policy should request generation");
});

Deno.test("policy blocks low relevance", () => {
  const result = applyAdaptiveProbePolicy(baseContext, {
    ...baseAnalysis,
    relevance_score: 0.59,
  });

  assertEquals(result.decision, "move_to_next_anchor", "Low relevance should move forward");
  assert(result.blockedReasons.includes("low_relevance"), "Blocked reason should include low relevance");
});

Deno.test("policy blocks sufficient answers", () => {
  const result = applyAdaptiveProbePolicy(baseContext, {
    ...baseAnalysis,
    answer_sufficiency_score: 0.66,
  });

  assertEquals(result.decision, "move_to_next_anchor", "Sufficient answer should move forward");
  assert(result.blockedReasons.includes("answer_already_sufficient"), "Blocked reason should include sufficiency");
});

Deno.test("policy blocks high risk and low confidence", () => {
  const result = applyAdaptiveProbePolicy(baseContext, {
    ...baseAnalysis,
    risk_score: 0.36,
    confidence_score: 0.54,
  });

  assertEquals(result.decision, "move_to_next_anchor", "Risky uncertain answer should move forward");
  assert(result.blockedReasons.includes("high_risk"), "Blocked reason should include high risk");
  assert(result.blockedReasons.includes("low_confidence"), "Blocked reason should include low confidence");
});

Deno.test("policy respects anchor and session follow-up limits", () => {
  const anchorLimit = applyAdaptiveProbePolicy({
    ...baseContext,
    currentAnchorFollowUpCount: 1,
  }, baseAnalysis);
  const sessionLimit = applyAdaptiveProbePolicy({
    ...baseContext,
    totalFollowUpCount: 5,
  }, baseAnalysis);

  assertEquals(anchorLimit.decision, "move_to_next_anchor", "Anchor limit should block");
  assertEquals(sessionLimit.decision, "move_to_next_anchor", "Session limit should block");
});

Deno.test("validator accepts short neutral Turkish follow-up", () => {
  const result = validateAdaptiveProbeQuestion({
    question: "Ücret bilgisinde güven veren şey tam olarak neydi?",
    participantAnswer: baseContext.participantAnswer,
    anchorQuestion: baseContext.currentAnchor.text,
    recentQuestionTexts: baseContext.recentQuestionTexts,
    language: "tr",
  });

  assertEquals(result.passes, true, "Neutral Turkish follow-up should pass");
});

Deno.test("validator accepts short neutral English follow-up", () => {
  const result = validateAdaptiveProbeQuestion({
    question: "What specifically made the fee information feel clear?",
    participantAnswer: "The fee information felt clear and helped me trust the application step.",
    anchorQuestion: "What felt clearest during the application step?",
    recentQuestionTexts: [],
    language: "en",
  });

  assertEquals(result.passes, true, "Neutral English follow-up should pass");
});

Deno.test("validator rejects multi-part leading sensitive broad questions", () => {
  const result = validateAdaptiveProbeQuestion({
    question: "Şifrenizi paylaşır mısınız ve neden bu sorun sizi rahatsız etti?",
    participantAnswer: "Ücret bilgisi netti.",
    anchorQuestion: baseContext.currentAnchor.text,
    recentQuestionTexts: [],
    language: "tr",
  });

  assertEquals(result.passes, false, "Unsafe follow-up should fail");
  assertEquals(result.not_sensitive, false, "Sensitive information request should fail");
  assertEquals(result.single_focus, false, "Multi-part question should fail");
  assertEquals(result.non_leading, false, "Leading question should fail");
});

Deno.test("validator rejects repetitive and over-limit questions", () => {
  const result = validateAdaptiveProbeQuestion({
    question: "Ücret bilgisinde güven veren şey tam olarak neydi ve bunu başvuru kararınıza etkisiyle birlikte hangi detaylar üzerinden değerlendirdiniz?",
    participantAnswer: baseContext.participantAnswer,
    anchorQuestion: baseContext.currentAnchor.text,
    previousFollowUps: ["Ücret bilgisinde güven veren şey tam olarak neydi?"],
    recentQuestionTexts: [],
    language: "tr",
  });

  assertEquals(result.passes, false, "Long repeated question should fail");
  assertEquals(result.under_word_limit, false, "Question should exceed word limit");
  assertEquals(result.single_focus, false, "Question should be multi-part");
});

Deno.test("language detection matches answer when explicit language is unknown", () => {
  assertEquals(
    detectAdaptiveProbeLanguage("Ücret bilgisinin açık olması güven verdi.", "unknown"),
    "tr",
    "Turkish answer should select Turkish",
  );
  assertEquals(
    detectAdaptiveProbeLanguage("The fee detail felt clear because it was visible early.", "unknown"),
    "en",
    "English answer should select English",
  );
});
