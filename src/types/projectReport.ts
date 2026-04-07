export type ProjectReportStatus = "empty" | "generating" | "ready" | "failed";

export interface ProjectReportSourceStats {
  invitedParticipantCount: number;
  joinedParticipantCount: number;
  completedParticipantCount: number;
  totalSessionCount: number;
  completedSessionCount: number;
  pendingSessionCount: number;
  questionTemplateCount: number;
  questionInstanceCount: number;
  responsesAnalyzed: number;
  skippedResponseCount: number;
  quoteCount: number;
}

export interface ProjectReportOverview {
  invitedParticipantCount: number;
  joinedParticipantCount: number;
  completedParticipantCount: number;
  joinRate: number;
  completionRate: number;
  skipRate: number;
  averageResponseDurationMs: number | null;
  averageSessionDurationMs: number | null;
  averageResponsesPerCompletedSession: number;
}

export interface ProjectReportQuote {
  quoteId: string;
  responseId: string;
  sessionId: string;
  sessionRef: string;
  participantId: string | null;
  participantLabel: string;
  questionId: string;
  questionRef: string;
  questionText: string;
  section: string;
  text: string;
  videoUrl?: string | null;
  videoDurationMs?: number | null;
  audioDurationMs?: number | null;
}

export interface ProjectReportFinding {
  id: string;
  title: string;
  summary: string;
  evidenceCount: number;
  quoteIds: string[];
  questionRefs: string[];
  sessionRefs: string[];
}

export interface ProjectReportTheme {
  id: string;
  title: string;
  description: string;
  evidenceCount: number;
  quoteIds: string[];
  questionRefs: string[];
}

export interface ProjectReportRecommendation {
  id: string;
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  quoteIds: string[];
  linkedFindingIds: string[];
}

export interface ProjectReportQuestionBreakdown {
  questionRef: string;
  section: string;
  questionText: string;
  sessionCount: number;
  answeredResponseCount: number;
  skippedResponseCount: number;
  coverageRate: number;
  averageResponseDurationMs: number | null;
  summary: string;
  quoteIds: string[];
}

export interface ProjectReportParticipantBreakdown {
  sessionId: string;
  sessionRef: string;
  participantId: string | null;
  participantLabel: string;
  status: string;
  responseCount: number;
  answeredResponseCount: number;
  skippedResponseCount: number;
  averageResponseDurationMs: number | null;
  sessionDurationMs: number | null;
  hasVideoEvidence: boolean;
  summary: string;
  quoteIds: string[];
}

export interface ProjectReportGenerationMeta {
  trigger: string;
  triggerSessionId?: string | null;
  generatedBy: string;
  llmUsed: boolean;
  analyzedSessionIds: string[];
  analyzedResponseIds: string[];
  failureMessage?: string | null;
}

export interface ProjectInterviewReport {
  status: ProjectReportStatus;
  version: number;
  generatedAt: string | null;
  generatedFrom: "transcript-only";
  sourceStats: ProjectReportSourceStats;
  overview: ProjectReportOverview;
  executiveSummary: string;
  findings: ProjectReportFinding[];
  themes: ProjectReportTheme[];
  recommendations: ProjectReportRecommendation[];
  questionBreakdown: ProjectReportQuestionBreakdown[];
  participantBreakdown: ProjectReportParticipantBreakdown[];
  quoteCatalog: ProjectReportQuote[];
  generationMeta: ProjectReportGenerationMeta;
}

export interface ProjectReportSnapshot {
  projectTitle: string;
  projectDescription: string;
  report: ProjectInterviewReport | null;
}
