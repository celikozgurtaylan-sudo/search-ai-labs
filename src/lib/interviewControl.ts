export type InterviewLinkAccess = "active" | "paused";

export interface InterviewControlState {
  linkAccess: InterviewLinkAccess;
  pausedAt: string | null;
  resumedAt: string | null;
  pausedByUserId: string | null;
  lastChangedAt: string | null;
}

const DEFAULT_INTERVIEW_CONTROL_STATE: InterviewControlState = {
  linkAccess: "active",
  pausedAt: null,
  resumedAt: null,
  pausedByUserId: null,
  lastChangedAt: null,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const getInterviewControlState = (analysis: unknown): InterviewControlState => {
  if (!isRecord(analysis) || !isRecord(analysis.interviewControl)) {
    return DEFAULT_INTERVIEW_CONTROL_STATE;
  }

  const interviewControl = analysis.interviewControl;

  return {
    linkAccess: interviewControl.linkAccess === "paused" ? "paused" : "active",
    pausedAt: typeof interviewControl.pausedAt === "string" ? interviewControl.pausedAt : null,
    resumedAt: typeof interviewControl.resumedAt === "string" ? interviewControl.resumedAt : null,
    pausedByUserId: typeof interviewControl.pausedByUserId === "string" ? interviewControl.pausedByUserId : null,
    lastChangedAt: typeof interviewControl.lastChangedAt === "string" ? interviewControl.lastChangedAt : null,
  };
};

export const applyInterviewLinkAccess = (
  analysis: unknown,
  linkAccess: InterviewLinkAccess,
  userId?: string | null,
  changedAt = new Date().toISOString(),
) => {
  const nextAnalysis = isRecord(analysis) ? { ...analysis } : {};
  const currentState = getInterviewControlState(analysis);

  nextAnalysis.interviewControl = {
    ...currentState,
    linkAccess,
    pausedAt: linkAccess === "paused" ? changedAt : currentState.pausedAt,
    resumedAt: linkAccess === "active" ? changedAt : currentState.resumedAt,
    pausedByUserId: linkAccess === "paused" ? userId ?? currentState.pausedByUserId : currentState.pausedByUserId,
    lastChangedAt: changedAt,
  };

  return nextAnalysis;
};
