import {
  assessQuestionQuality,
  cleanQuestion,
  extractLearningPhrases,
  inferQuestionSectionKind,
  normalizeForMatch,
  type QuestionReviewResult,
  type ResearchQuestionMode,
} from "./question-quality.ts";

export interface QuestionLearningMemoryRow {
  pattern_key: string;
  pattern_type: string;
  applies_to_mode: string;
  section_kind: string;
  trigger_phrases: string[];
  avoid_phrases: string[];
  preferred_phrases: string[];
  bad_example: string | null;
  better_example: string | null;
  confidence_score: number;
  usage_count: number;
  last_seen_at: string;
}

interface BuildLearningArtifactsInput {
  mode: ResearchQuestionMode;
  sectionTitle?: string;
  sectionIndex?: number;
  originalQuestionText: string;
  editedQuestionText: string;
}

const issuePriority = [
  "forced_paraphrase",
  "participant_framing",
  "interpretation_prompting",
  "labelled_construct",
  "leading",
  "assumptive",
  "contains_ve",
  "double_barreled",
  "yes_no",
  "clarity",
];

const toStatusScore = (status: QuestionReviewResult["status"]) => {
  switch (status) {
    case "strong":
      return 3;
    case "caution":
      return 2;
    default:
      return 0;
  }
};

const getReviewStrength = (review: QuestionReviewResult) =>
  toStatusScore(review.status) * 10 -
  review.issues.filter((issue) => issue.severity === "problematic").length * 4 -
  review.issues.filter((issue) => issue.severity === "caution").length * 2;

const generalizeLearningExample = (question: string) =>
  cleanQuestion(question)
    .replace(/\(([^)]+)\)/g, "(...)")
    .replace(/"[^"]+"/g, "\"...\"")
    .replace(/\b\d+\b/g, "X")
    .replace(/https?:\/\/\S+/g, "<url>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);

const summarizeQuestionEdit = (originalQuestion: string, editedQuestion: string) => {
  const original = cleanQuestion(originalQuestion);
  const edited = cleanQuestion(editedQuestion);
  if (!original || !edited) {
    return "";
  }

  const originalNormalized = normalizeForMatch(original);
  const editedNormalized = normalizeForMatch(edited);

  if (originalNormalized === editedNormalized) {
    return "Soru yalnızca küçük yazım düzenlemesi aldı.";
  }

  const originalPhrases = extractLearningPhrases(original);
  const editedPhrases = extractLearningPhrases(edited);
  const removedPhrases = originalPhrases.filter((phrase) => !editedPhrases.includes(phrase));

  if (removedPhrases.length > 0) {
    return `Problemli ifade temizlendi: ${removedPhrases.join(", ")}`;
  }

  return "Soru daha nötr ve daha net hale getirildi.";
};

const inferPatternType = (removedIssueCodes: string[]) => {
  for (const issueCode of issuePriority) {
    if (removedIssueCodes.includes(issueCode)) {
      return `removed_${issueCode}`;
    }
  }

  return "improved_question";
};

const buildPreferredPhrases = (patternType: string, editedQuestionText: string) => {
  switch (patternType) {
    case "removed_forced_paraphrase":
      return ["nasıl tarif edersiniz", "biraz anlatır mısınız"];
    case "removed_interpretation_prompting":
    case "removed_participant_framing":
      return ["size ne anlatıyor", "sizde nasıl bir anlam oluşuyor"];
    case "removed_contains_ve":
    case "removed_double_barreled":
      return ["tek soruda tek odak", "bir soruda tek amaç"];
    default:
      return [generalizeLearningExample(editedQuestionText)];
  }
};

const buildPatternKey = ({
  mode,
  sectionKind,
  patternType,
  triggerPhrases,
}: {
  mode: ResearchQuestionMode;
  sectionKind: string;
  patternType: string;
  triggerPhrases: string[];
}) => {
  const raw = `${mode}::${sectionKind}::${patternType}::${triggerPhrases.join("|")}`.slice(0, 240);
  return normalizeForMatch(raw).replace(/[^a-z0-9:|]+/g, "_");
};

export const buildQuestionLearningArtifacts = ({
  mode,
  sectionTitle = "",
  sectionIndex,
  originalQuestionText,
  editedQuestionText,
}: BuildLearningArtifactsInput) => {
  const originalQuestion = cleanQuestion(originalQuestionText);
  const editedQuestion = cleanQuestion(editedQuestionText);
  const sectionKind = inferQuestionSectionKind(sectionTitle, sectionIndex);
  const originalReview = assessQuestionQuality({
    question: originalQuestion,
    sectionTitle,
    sectionIndex,
    mode,
  });
  const editedReview = assessQuestionQuality({
    question: editedQuestion,
    sectionTitle,
    sectionIndex,
    mode,
  });
  const removedIssueCodes = originalReview.issues
    .map((issue) => issue.code)
    .filter((code) => !editedReview.issues.some((editedIssue) => editedIssue.code === code));
  const meaningfulChange = normalizeForMatch(originalQuestion) !== normalizeForMatch(editedQuestion);
  const improved = getReviewStrength(editedReview) > getReviewStrength(originalReview);
  const promotable =
    meaningfulChange &&
    improved &&
    editedReview.status !== "problematic" &&
    editedReview.violatedMustRules.length === 0 &&
    removedIssueCodes.length > 0;
  const triggerPhrases = extractLearningPhrases(originalQuestion);
  const patternType = inferPatternType(removedIssueCodes);
  const badExample = generalizeLearningExample(originalQuestion);
  const betterExample = generalizeLearningExample(editedQuestion);
  const preferredPhrases = buildPreferredPhrases(patternType, editedQuestion);

  return {
    sectionKind,
    originalReview,
    editedReview,
    diffSummary: summarizeQuestionEdit(originalQuestion, editedQuestion),
    meaningfulChange,
    improved,
    promotable,
    memoryCandidate: promotable
      ? {
          patternKey: buildPatternKey({
            mode,
            sectionKind,
            patternType,
            triggerPhrases: triggerPhrases.length > 0 ? triggerPhrases : [badExample],
          }),
          patternType,
          appliesToMode: mode,
          sectionKind,
          triggerPhrases,
          avoidPhrases: triggerPhrases.length > 0 ? triggerPhrases : [badExample],
          preferredPhrases,
          badExample,
          betterExample,
        }
      : null,
  };
};

export const loadQuestionLearningHints = async (
  supabase: any,
  {
    mode,
    sectionTitle = "",
    sectionIndex,
    limit = 6,
  }: {
    mode: ResearchQuestionMode;
    sectionTitle?: string;
    sectionIndex?: number;
    limit?: number;
  },
) => {
  const sectionKind = inferQuestionSectionKind(sectionTitle, sectionIndex);

  const { data, error } = await supabase
    .from("question_learning_memory")
    .select("*")
    .in("applies_to_mode", [mode, "all"])
    .in("section_kind", [sectionKind, "any"])
    .order("confidence_score", { ascending: false })
    .order("usage_count", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Failed to load question learning hints:", error);
    return [] as QuestionLearningMemoryRow[];
  }

  return (data ?? []).map((row: any) => ({
    pattern_key: String(row.pattern_key ?? ""),
    pattern_type: String(row.pattern_type ?? ""),
    applies_to_mode: String(row.applies_to_mode ?? mode),
    section_kind: String(row.section_kind ?? sectionKind),
    trigger_phrases: Array.isArray(row.trigger_phrases) ? row.trigger_phrases.map(String) : [],
    avoid_phrases: Array.isArray(row.avoid_phrases) ? row.avoid_phrases.map(String) : [],
    preferred_phrases: Array.isArray(row.preferred_phrases) ? row.preferred_phrases.map(String) : [],
    bad_example: typeof row.bad_example === "string" ? row.bad_example : null,
    better_example: typeof row.better_example === "string" ? row.better_example : null,
    confidence_score: Number(row.confidence_score ?? 0),
    usage_count: Number(row.usage_count ?? 0),
    last_seen_at: typeof row.last_seen_at === "string" ? row.last_seen_at : "",
  }));
};

export const formatQuestionLearningHints = (hints: QuestionLearningMemoryRow[]) => {
  if (!Array.isArray(hints) || hints.length === 0) {
    return "";
  }

  const avoidPhrases = Array.from(
    new Set(hints.flatMap((hint) => hint.avoid_phrases).filter(Boolean)),
  ).slice(0, 6);
  const preferredPhrases = Array.from(
    new Set(hints.flatMap((hint) => hint.preferred_phrases).filter(Boolean)),
  ).slice(0, 6);
  const exampleLines = hints
    .filter((hint) => hint.bad_example && hint.better_example)
    .slice(0, 3)
    .map((hint) => `- Kötü: "${hint.bad_example}" → Daha iyi: "${hint.better_example}"`);

  const sections = [
    "QUESTION_LEARNING_HINTS:",
    avoidPhrases.length > 0 ? `Kaçın: ${avoidPhrases.join(", ")}` : "",
    preferredPhrases.length > 0 ? `Tercih et: ${preferredPhrases.join(", ")}` : "",
    exampleLines.length > 0 ? `Örnekler:\n${exampleLines.join("\n")}` : "",
  ].filter(Boolean);

  return sections.join("\n");
};
