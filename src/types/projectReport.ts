export type ProjectReportStatus = "empty" | "generating" | "ready" | "failed";
export type ProjectInterviewMode = "structured" | "ai_enhanced";

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
  source?: "anchor" | "follow_up" | "transition" | "closing" | null;
  anchorId?: string | null;
  anchorLabel?: string | null;
  turnIndex?: number | null;
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

export interface ProjectReportAnchorCoverage {
  anchorId: string;
  anchorLabel: string;
  themeTitle: string;
  answeredSessionCount: number;
  skippedSessionCount: number;
  coverageRate: number;
  averageResponseDurationMs: number | null;
  quoteIds: string[];
  summary: string;
}

export interface ProjectReportFollowUpPath {
  id: string;
  anchorId: string | null;
  anchorLabel: string;
  questionText: string;
  count: number;
  sessionCount: number;
  quoteIds: string[];
}

export interface ProjectReportParticipantJourney {
  sessionId: string;
  sessionRef: string;
  participantId: string | null;
  participantLabel: string;
  anchorCoverageCount: number;
  followUpCount: number;
  sessionDurationMs: number | null;
  summary: string;
  quoteIds: string[];
}

export interface ProjectReportTurn {
  questionId: string;
  responseId: string | null;
  sessionId: string;
  sessionRef: string;
  participantLabel: string;
  questionText: string;
  responseText: string;
  source: "anchor" | "follow_up" | "transition" | "closing";
  anchorId: string | null;
  anchorLabel: string | null;
  turnIndex: number | null;
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
  interviewMode: ProjectInterviewMode;
  status: ProjectReportStatus;
  version: number;
  generatedAt: string | null;
  generatedFrom: "transcript-only" | "ai-enhanced-transcript";
  sourceStats: ProjectReportSourceStats;
  overview: ProjectReportOverview;
  executiveSummary: string;
  findings: ProjectReportFinding[];
  themes: ProjectReportTheme[];
  recommendations: ProjectReportRecommendation[];
  questionBreakdown: ProjectReportQuestionBreakdown[];
  participantBreakdown: ProjectReportParticipantBreakdown[];
  anchorCoverage: ProjectReportAnchorCoverage[];
  followUpPaths: ProjectReportFollowUpPath[];
  participantJourneys: ProjectReportParticipantJourney[];
  turnCatalog: ProjectReportTurn[];
  quoteCatalog: ProjectReportQuote[];
  generationMeta: ProjectReportGenerationMeta;
}

export interface ProjectReportSnapshot {
  projectTitle: string;
  projectDescription: string;
  report: ProjectInterviewReport | null;
}
