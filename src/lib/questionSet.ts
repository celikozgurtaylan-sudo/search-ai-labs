export interface DiscussionGuideSection {
  id: string;
  title: string;
  questions: string[];
}

export interface DiscussionGuideSnapshot {
  title: string;
  sections: DiscussionGuideSection[];
}

export interface QuestionSetVersion {
  id: string;
  number: number;
  createdAt: string;
  source: string;
  discussionGuideSnapshot: DiscussionGuideSnapshot;
}

export interface QuestionSetState {
  currentVersionId: string;
  currentVersionNumber: number;
  updatedAt: string;
  versions: QuestionSetVersion[];
}

const buildVersionId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `question-set-${crypto.randomUUID()}`;
  }

  return `question-set-${Date.now()}`;
};

export const sanitizeDiscussionGuide = (guide: any): DiscussionGuideSnapshot | null => {
  if (!guide || !Array.isArray(guide.sections) || guide.sections.length === 0) {
    return null;
  }

  return {
    title: typeof guide.title === "string" && guide.title.trim()
      ? guide.title.trim()
      : "Adsız Araştırma Kılavuzu",
    sections: guide.sections.map((section: any, sectionIndex: number) => ({
      id: typeof section?.id === "string" && section.id.trim()
        ? section.id
        : `section-${sectionIndex + 1}`,
      title: typeof section?.title === "string" && section.title.trim()
        ? section.title.trim()
        : `Bölüm ${sectionIndex + 1}`,
      questions: Array.isArray(section?.questions)
        ? section.questions
            .map((question: unknown) => typeof question === "string" ? question.trim() : "")
            .filter(Boolean)
        : [],
    })),
  };
};

export const serializeDiscussionGuide = (guide: any) => {
  const sanitizedGuide = sanitizeDiscussionGuide(guide);
  return sanitizedGuide ? JSON.stringify(sanitizedGuide) : "";
};

export const ensureQuestionSetState = (
  existingQuestionSet: any,
  discussionGuide: any,
): QuestionSetState | null => {
  const sanitizedGuide = sanitizeDiscussionGuide(discussionGuide);
  if (!sanitizedGuide) {
    return null;
  }

  if (
    existingQuestionSet &&
    typeof existingQuestionSet === "object" &&
    Array.isArray(existingQuestionSet.versions) &&
    existingQuestionSet.versions.length > 0 &&
    existingQuestionSet.currentVersionId &&
    existingQuestionSet.currentVersionNumber
  ) {
    return existingQuestionSet as QuestionSetState;
  }

  const createdAt = new Date().toISOString();
  const versionId = buildVersionId();

  return {
    currentVersionId: versionId,
    currentVersionNumber: 1,
    updatedAt: createdAt,
    versions: [
      {
        id: versionId,
        number: 1,
        createdAt,
        source: "initial",
        discussionGuideSnapshot: sanitizedGuide,
      },
    ],
  };
};

export const createNextQuestionSetState = (
  currentQuestionSet: QuestionSetState | null,
  nextGuide: any,
  source: string,
): QuestionSetState | null => {
  const sanitizedGuide = sanitizeDiscussionGuide(nextGuide);
  if (!sanitizedGuide) {
    return currentQuestionSet;
  }

  const ensuredCurrentState = ensureQuestionSetState(currentQuestionSet, sanitizedGuide);
  if (!ensuredCurrentState) {
    return null;
  }

  const currentVersion = ensuredCurrentState.versions.find(
    (version) => version.id === ensuredCurrentState.currentVersionId,
  );

  if (
    currentVersion &&
    serializeDiscussionGuide(currentVersion.discussionGuideSnapshot) === serializeDiscussionGuide(sanitizedGuide)
  ) {
    return ensuredCurrentState;
  }

  const createdAt = new Date().toISOString();
  const nextVersionNumber = ensuredCurrentState.currentVersionNumber + 1;
  const nextVersionId = buildVersionId();

  return {
    currentVersionId: nextVersionId,
    currentVersionNumber: nextVersionNumber,
    updatedAt: createdAt,
    versions: [
      ...ensuredCurrentState.versions,
      {
        id: nextVersionId,
        number: nextVersionNumber,
        createdAt,
        source,
        discussionGuideSnapshot: sanitizedGuide,
      },
    ],
  };
};

export const findQuestionSetVersionSnapshot = (questionSet: any, versionId?: string | null) => {
  if (!questionSet || typeof questionSet !== "object" || !Array.isArray(questionSet.versions)) {
    return null;
  }

  if (!versionId) {
    return null;
  }

  const version = questionSet.versions.find((item: any) => item?.id === versionId);
  return version?.discussionGuideSnapshot ?? null;
};
