export type ResearchMode = "structured" | "ai_enhanced";

export interface AIEnhancedTheme {
  id: string;
  title: string;
  goal: string;
}

export interface AIEnhancedAnchorQuestion {
  id: string;
  themeId: string;
  text: string;
}

export interface AIEnhancedPlannerTranscriptItem {
  role: "user" | "assistant";
  content: string;
}

export interface AIEnhancedBrief {
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
  plannerTranscript: AIEnhancedPlannerTranscriptItem[];
  updatedAt: string;
  readyAt: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asString = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const asArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

export const getResearchMode = (analysis: unknown): ResearchMode => {
  if (isRecord(analysis) && analysis.researchMode === "ai_enhanced") {
    return "ai_enhanced";
  }

  return "structured";
};

export const normalizeAIEnhancedBrief = (value: unknown): AIEnhancedBrief | null => {
  if (!isRecord(value)) return null;

  const themes = asArray<Record<string, unknown>>(value.themes)
    .map((theme, index) => ({
      id: asString(theme.id) || `theme-${index + 1}`,
      title: asString(theme.title) || `Tema ${index + 1}`,
      goal: asString(theme.goal),
    }))
    .filter((theme) => theme.title.length > 0);

  const anchorQuestions = asArray<Record<string, unknown>>(value.anchorQuestions)
    .map((question, index) => ({
      id: asString(question.id) || `anchor-${index + 1}`,
      themeId: asString(question.themeId) || themes[0]?.id || "theme-1",
      text: asString(question.text),
    }))
    .filter((question) => question.text.length > 0);

  return {
    mode: "ai_enhanced",
    status: value.status === "ready" ? "ready" : "collecting",
    contextReadiness: typeof value.contextReadiness === "number"
      ? Math.max(0, Math.min(100, Math.round(value.contextReadiness)))
      : 0,
    objective: asString(value.objective),
    audience: asString(value.audience),
    decisionScope: asString(value.decisionScope),
    constraints: asString(value.constraints),
    mustCover: asArray<string>(value.mustCover).map((item) => asString(item)).filter(Boolean),
    themes,
    anchorQuestions,
    plannerTranscript: asArray<Record<string, unknown>>(value.plannerTranscript)
      .map((entry) => ({
        role: entry.role === "assistant" ? "assistant" : "user",
        content: asString(entry.content),
      }))
      .filter((entry) => entry.content.length > 0),
    updatedAt: asString(value.updatedAt) || new Date().toISOString(),
    readyAt: asString(value.readyAt) || null,
  };
};

export const isAIEnhancedReady = (brief: AIEnhancedBrief | null | undefined) =>
  Boolean(brief && brief.status === "ready" && brief.contextReadiness >= 100);

export const buildAIEnhancedDisplayGuide = (brief: AIEnhancedBrief | null | undefined) => {
  if (!brief || brief.themes.length === 0 || brief.anchorQuestions.length === 0) {
    return null;
  }

  return {
    title: "Agent Enhanced Görüşme Blueprint'i",
    sections: brief.themes.map((theme) => ({
      id: theme.id,
      title: theme.title,
      questions: brief.anchorQuestions
        .filter((question) => question.themeId === theme.id)
        .map((question) => question.text),
    })).filter((section) => section.questions.length > 0),
  };
};

export const buildAIEnhancedParticipantMetadata = (brief: AIEnhancedBrief | null | undefined) => ({
  interviewMode: "ai_enhanced",
  aiEnhancedAssignedAt: new Date().toISOString(),
  aiEnhancedBriefUpdatedAt: brief?.updatedAt ?? null,
  aiEnhancedAnchorCount: brief?.anchorQuestions.length ?? 0,
  aiEnhancedThemeCount: brief?.themes.length ?? 0,
});
