import {
  buildParticipantExperienceFollowUp,
  classifyParticipantExperienceSignals,
} from "./participant-experience-interviewer.ts";
import { assessLiveFollowUpQuality } from "./question-quality.ts";

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

const baseInput = {
  researchObjective: "Searcho katılımcı görüşme deneyimini anlamak",
  audience: "Araştırma görüşmesine katılan kullanıcılar",
  decisionScope: "Katılımcı deneyimini iyileştirmek",
  themeTitle: "Katılımcı Deneyimi",
  anchorQuestionText: "Görüşme deneyimini genel olarak nasıl tarif edersiniz?",
  previousFollowUps: [],
  recentQuestionTexts: ["Görüşme deneyimini genel olarak nasıl tarif edersiniz?"],
  remainingAnchorCount: 3,
  allowLLM: false,
  maxFollowUpState: {
    anchorFollowUpCount: 0,
    consecutiveFollowUpCount: 0,
    sessionFollowUpCount: 0,
  },
};

Deno.test("classifies vague participant answer", () => {
  const signals = classifyParticipantExperienceSignals("Biraz garipti.");

  assert(signals.includes("unclear_or_vague"), "Vague answer should be marked unclear_or_vague");
});

Deno.test("asks clarification for vague answer", async () => {
  const result = await buildParticipantExperienceFollowUp({
    ...baseInput,
    participantAnswer: "Biraz garipti.",
  });

  assertEquals(result.action, "ask_clarification", "Vague answer should ask clarification");
  assert(result.questionText?.includes("somutlaştırabilir"), "Clarification should ask for a concrete explanation");
  assert(result.questionQualityResult?.riskLevel !== "high", "Fallback clarification should be safe");
});

Deno.test("probes permission trust respectfully", async () => {
  const result = await buildParticipantExperienceFollowUp({
    ...baseInput,
    participantAnswer: "Kamera izni isteyince biraz güvensiz hissettim.",
  });

  assertEquals(result.action, "ask_follow_up", "Trust answer should ask follow-up");
  assert(result.analysis.detectedSignals.includes("permission_trust"), "Permission trust signal should be detected");
  assert(result.questionText?.includes("İzin"), "Follow-up should stay connected to permissions");
});

Deno.test("probes AI voice quality", async () => {
  const result = await buildParticipantExperienceFollowUp({
    ...baseInput,
    participantAnswer: "Ses çok robotikti.",
  });

  assertEquals(result.action, "ask_follow_up", "Voice quality answer should ask follow-up");
  assert(result.analysis.detectedSignals.includes("ai_voice_quality"), "AI voice signal should be detected");
  assert(result.questionText?.includes("Ses"), "Follow-up should stay connected to voice");
});

Deno.test("probes misunderstood or transcription answers", async () => {
  const result = await buildParticipantExperienceFollowUp({
    ...baseInput,
    participantAnswer: "Beni yanlış anladı gibi geldi.",
  });

  assertEquals(result.action, "ask_follow_up", "Misunderstood answer should ask follow-up");
  assert(
    result.analysis.detectedSignals.includes("feeling_understood") ||
      result.analysis.detectedSignals.includes("transcription_quality"),
    "Understanding or transcription signal should be detected",
  );
});

Deno.test("asks clarification for positive vague answer", async () => {
  const result = await buildParticipantExperienceFollowUp({
    ...baseInput,
    participantAnswer: "Gayet iyiydi.",
  });

  assertEquals(result.action, "ask_clarification", "Positive vague answer should ask clarification");
});

Deno.test("respects max follow-up limit", async () => {
  const result = await buildParticipantExperienceFollowUp({
    ...baseInput,
    participantAnswer: "Ses çok robotikti.",
    maxFollowUpState: {
      anchorFollowUpCount: 1,
      consecutiveFollowUpCount: 0,
      sessionFollowUpCount: 1,
    },
  });

  assertEquals(result.action, "move_to_next_anchor", "Anchor follow-up limit should move to next anchor");
});

Deno.test("avoids repeated signal topics", async () => {
  const result = await buildParticipantExperienceFollowUp({
    ...baseInput,
    participantAnswer: "Ses çok robotikti.",
    previouslyFollowedSignals: ["ai_voice_quality"],
  });

  assertEquals(result.action, "move_to_next_anchor", "Repeated signal should not create another follow-up");
});

Deno.test("flags double-barreled live follow-up", () => {
  const quality = assessLiveFollowUpQuality({
    question: "Bu deneyim sizi nasıl etkiledi ve bunun sebepleri nelerdi?",
    previousAnswer: "Biraz garipti.",
    recentQuestions: [],
    expectedSignals: ["unclear_or_vague"],
  });

  assert(!quality.passed, "Double-barreled question should fail");
  assert(quality.issues.some((issue) => issue.type === "double_barreled"), "Issue should be double_barreled");
});

Deno.test("accepts short option probe when single-purpose", () => {
  const quality = assessLiveFollowUpQuality({
    question: "Garip hissettiren şey daha çok ses tonu, izin ekranı ya da yapay zekâ mıydı?",
    previousAnswer: "Biraz garipti.",
    recentQuestions: [],
    expectedSignals: ["unclear_or_vague"],
  });

  assert(quality.riskLevel !== "high", "Short option probe should not be high risk");
});

Deno.test("fallback questions keep Turkish wording basics", async () => {
  const result = await buildParticipantExperienceFollowUp({
    ...baseInput,
    participantAnswer: "Ses çok robotikti.",
  });
  const question = result.questionText ?? "";

  assert(/[çğıöşüİ]/.test(question), "Question should contain Turkish characters when needed");
  assert(!/\b(nasil|gorusme|turkce|guven)\b/i.test(question), "Question should avoid ASCII Turkish");
  assert(question.length < 140, "Question should stay short");
});

Deno.test("structured compatibility is caller-controlled", async () => {
  const result = await buildParticipantExperienceFollowUp({
    ...baseInput,
    participantAnswer: "Ses çok robotikti.",
  });

  assertEquals(result.action, "ask_follow_up", "Module can decide follow-up");
  assertEquals(result.source, "fallback", "Without LLM it uses deterministic fallback");
});

Deno.test("AI enhanced compatible result includes persistence metadata", async () => {
  const result = await buildParticipantExperienceFollowUp({
    ...baseInput,
    participantAnswer: "Beni yanlış anladı gibi geldi.",
  });

  assertEquals(result.analysis.generatedBy, "participant_experience_intelligence", "Metadata should name generator");
  assert(Array.isArray(result.analysis.detectedSignals), "Metadata should include detected signals");
  assert(result.analysis.maxFollowUpState.maxAnchorFollowUps === 1, "Metadata should include follow-up limits");
});
