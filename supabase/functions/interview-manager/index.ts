import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  generateAndPersistProjectReport,
  setProjectReportStatus,
} from "../_shared/project-report.ts";
import {
  findThemeById,
  getResearchModeFromAnalysis,
  normalizeAIEnhancedBrief,
} from "../_shared/ai-enhanced.ts";
import {
  ADAPTIVE_PROBE_PROMPT_VERSION,
  decideAdaptiveProbe,
  type AdaptiveProbeDecisionResult,
  type AdaptiveProbeLanguage,
  type AdaptiveProbeTurn,
} from "../_shared/adaptive-probe-engine.ts";
import {
  CONVERSATIONAL_WARMUP_TURN_COUNT,
  buildConversationalWarmupFallbacks,
  generateConversationalWarmupQuestion,
  isConversationalWarmupSectionTitle,
} from "../_shared/conversational-warmup.ts";
import type {
  ConversationalWarmupContext,
  ConversationalWarmupInterviewMode,
} from "../_shared/conversational-warmup.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-token',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

type ResponsePayload = {
  questionId: string;
  participantId?: string;
  transcription?: string;
  responseText?: string;
  videoUrl?: string;
  videoBase64?: string;
  videoMimeType?: string;
  videoDuration?: number;
  audioBase64?: string;
  audioMimeType?: string;
  audioPrivacyTransform?: Record<string, unknown>;
  audioDuration?: number;
  confidenceScore?: number;
  isComplete?: boolean;
  metadata?: Record<string, unknown>;
  transcriptSegments?: unknown[];
};

const AUDIO_BUCKET = 'interview-audio';
const SCREEN_RECORDINGS_BUCKET = 'interview-screen-recordings';
const VIDEO_UPLOAD_DISABLED_CODE = 'video_upload_disabled';
const OPTIONAL_RESPONSE_COLUMN_ERROR_PATTERN =
  /audio_mime_type|audio_privacy_transform|transcript_segments|schema cache|column .* does not exist|could not find .* column/i;

const decodeBase64 = (value: string) => {
  const normalized = value.trim();
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
};

const getAudioFileExtension = (mimeType?: string) => {
  switch (mimeType?.toLowerCase()) {
    case 'audio/wav':
    case 'audio/wave':
    case 'audio/x-wav':
      return 'wav';
    case 'audio/webm':
    case 'audio/webm;codecs=opus':
      return 'webm';
    default:
      return 'wav';
  }
};

const getScreenRecordingFileExtension = (mimeType?: string) => {
  switch (mimeType?.toLowerCase()) {
    case 'video/mp4':
      return 'mp4';
    case 'video/webm':
    case 'video/webm;codecs=vp8':
    case 'video/webm;codecs=vp9':
      return 'webm';
    default:
      return 'webm';
  }
};

async function resolveSessionProject(sessionId: string) {
  const { data, error } = await supabase
    .from('study_sessions')
    .select('id, project_id, metadata')
    .eq('id', sessionId)
    .maybeSingle();

  if (error || !data?.project_id) {
    throw new Error(`Failed to resolve session project: ${error?.message ?? 'missing project_id'}`);
  }

  return data;
}

async function validateSessionToken(sessionId: string, sessionToken: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('study_sessions')
    .select(`
      id,
      status,
      projects:project_id (
        analysis
      )
    `)
    .eq('id', sessionId)
    .eq('session_token', sessionToken)
    .maybeSingle();

  if (error || !data) {
    return false;
  }

  if (data.status === 'cancelled') {
    return false;
  }

  const analysis = isRecord(data.projects) && isRecord(data.projects.analysis)
    ? data.projects.analysis
    : {};
  const interviewControl = isRecord(analysis.interviewControl)
    ? analysis.interviewControl
    : {};
  const linkAccess = interviewControl.linkAccess === 'paused' ? 'paused' : 'active';

  if (linkAccess === 'paused' && !['active', 'completed'].includes(data.status)) {
    return false;
  }

  return true;
}

async function findLatestResponse(sessionId: string, questionId: string) {
  const { data, error } = await supabase
    .from('interview_responses')
    .select('*')
    .eq('session_id', sessionId)
    .eq('question_id', questionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to find existing response: ${error.message}`);
  }

  return data;
}

const isOptionalResponseColumnError = (error: unknown) => {
  const message = error instanceof Error
    ? error.message
    : isRecord(error) && typeof error.message === 'string'
      ? error.message
      : String(error ?? '');

  return OPTIONAL_RESPONSE_COLUMN_ERROR_PATTERN.test(message);
};

async function saveOrUpdateResponse(sessionId: string, responseData: ResponsePayload) {
  const existingResponse = await findLatestResponse(sessionId, responseData.questionId);
  const basePayload = {
    session_id: sessionId,
    question_id: responseData.questionId,
    participant_id: responseData.participantId ?? existingResponse?.participant_id ?? null,
    transcription: responseData.transcription ?? existingResponse?.transcription ?? null,
    response_text: responseData.responseText ?? existingResponse?.response_text ?? null,
    video_url: null,
    video_duration_ms: null,
    audio_duration_ms: responseData.audioDuration ?? existingResponse?.audio_duration_ms ?? null,
    confidence_score: responseData.confidenceScore ?? existingResponse?.confidence_score ?? null,
    is_complete: responseData.isComplete ?? existingResponse?.is_complete ?? false,
    metadata: {
      ...(existingResponse?.metadata ?? {}),
      ...(responseData.metadata ?? {}),
    },
  };
  const payload = {
    ...basePayload,
    audio_url: existingResponse?.audio_url ?? null,
    audio_mime_type: existingResponse?.audio_mime_type ?? null,
    audio_privacy_transform: existingResponse?.audio_privacy_transform ?? null,
    transcript_segments: existingResponse?.transcript_segments ?? null,
  };

  const writeResponse = async (nextPayload: Record<string, unknown>) => {
    if (existingResponse?.id) {
      const { data, error } = await supabase
        .from('interview_responses')
        .update(nextPayload)
        .eq('id', existingResponse.id)
        .eq('session_id', sessionId)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to update response: ${error.message}`);
      }

      return data;
    }

    const { data, error } = await supabase
      .from('interview_responses')
      .insert(nextPayload)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to save response: ${error.message}`);
    }

    return data;
  };

  try {
    return await writeResponse(payload);
  } catch (error) {
    if (!isOptionalResponseColumnError(error)) {
      throw error;
    }

    console.warn('Response save retried without optional audio evidence columns.');
    return await writeResponse(basePayload);
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asArray = <T>(value: unknown): T[] => (Array.isArray(value) ? value as T[] : []);

const asString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

async function resolveDiscussionGuideForSession(projectId: string, sessionId: string, fallbackDiscussionGuide: unknown) {
  const { data: session, error: sessionError } = await supabase
    .from('study_sessions')
    .select('id, participant_id, status, started_at, metadata')
    .eq('id', sessionId)
    .maybeSingle();

  if (sessionError) {
    throw new Error(`Failed to load session: ${sessionError.message}`);
  }

  if (!session) {
    throw new Error('Session not found');
  }

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('title, description, analysis')
    .eq('id', projectId)
    .maybeSingle();

  if (projectError) {
    throw new Error(`Failed to load project analysis: ${projectError.message}`);
  }

  const sessionMetadata = isRecord(session.metadata) ? session.metadata : {};
  let participantMetadata: Record<string, unknown> = {};

  if (session.participant_id) {
    const { data: participant, error: participantError } = await supabase
      .from('study_participants')
      .select('metadata')
      .eq('id', session.participant_id)
      .maybeSingle();

    if (participantError) {
      throw new Error(`Failed to load participant metadata: ${participantError.message}`);
    }

    participantMetadata = isRecord(participant?.metadata) ? participant.metadata : {};
  }

  const analysis = isRecord(project?.analysis) ? project.analysis : {};
  const questionSet = isRecord(analysis.questionSet) ? analysis.questionSet : {};
  const questionSetVersions = Array.isArray(questionSet.versions) ? questionSet.versions : [];

  const assignedVersionId =
    typeof sessionMetadata.questionSetVersionId === 'string'
      ? sessionMetadata.questionSetVersionId
      : typeof participantMetadata.questionSetVersionId === 'string'
        ? participantMetadata.questionSetVersionId
        : isRecord(questionSetVersions[0]) && typeof questionSetVersions[0].id === 'string'
          ? questionSetVersions[0].id
          : null;

  const assignedVersionNumber =
    typeof sessionMetadata.questionSetVersionNumber === 'number'
      ? sessionMetadata.questionSetVersionNumber
      : typeof participantMetadata.questionSetVersionNumber === 'number'
        ? participantMetadata.questionSetVersionNumber
        : isRecord(questionSetVersions[0]) && typeof questionSetVersions[0].number === 'number'
          ? questionSetVersions[0].number
          : null;

  const assignedAt =
    typeof sessionMetadata.questionSetAssignedAt === 'string'
      ? sessionMetadata.questionSetAssignedAt
      : typeof participantMetadata.questionSetAssignedAt === 'string'
        ? participantMetadata.questionSetAssignedAt
        : new Date().toISOString();

  const matchingVersion = questionSetVersions.find((version) =>
    isRecord(version) && version.id === assignedVersionId
  );

  const versionSnapshot = isRecord(matchingVersion?.discussionGuideSnapshot)
    ? matchingVersion.discussionGuideSnapshot
    : null;

  const discussionGuide =
    versionSnapshot ??
    (isRecord(analysis.discussionGuide) ? analysis.discussionGuide : null) ??
    fallbackDiscussionGuide;

  return {
    session,
    project,
    analysis,
    discussionGuide,
    assignmentMetadata: {
      questionSetVersionId: assignedVersionId,
      questionSetVersionNumber: assignedVersionNumber,
      questionSetAssignedAt: assignedAt,
    },
  };
}

const AI_ENHANCED_MAX_FOLLOW_UPS_PER_ANCHOR = 1;
const AI_ENHANCED_MAX_TOTAL_FOLLOW_UPS_PER_SESSION = 5;

type AIEnhancedFollowUpState = Record<string, {
  count: number;
  lastProbeType: string | null;
}>;

type AIEnhancedSessionState = {
  currentAnchorIndex: number;
  turnIndex: number;
  coveredAnchorIds: string[];
  anchorsCompleted: string[];
  followUpState: AIEnhancedFollowUpState;
  maxFollowUpsPerAnchor: number;
  maxTotalFollowUpsPerSession: number;
  promptVersion: typeof ADAPTIVE_PROBE_PROMPT_VERSION;
  briefSnapshotId: string | null;
};

const normalizeAIEnhancedFollowUpState = (value: unknown): AIEnhancedFollowUpState => {
  if (!isRecord(value)) return {};

  return Object.entries(value).reduce<AIEnhancedFollowUpState>((accumulator, [anchorId, entry]) => {
    if (!isRecord(entry)) return accumulator;
    accumulator[anchorId] = {
      count: Math.max(0, Math.floor(typeof entry.count === "number" ? entry.count : 0)),
      lastProbeType: asString(entry.lastProbeType) || null,
    };
    return accumulator;
  }, {});
};

const getAIEnhancedSessionState = (sessionMetadata: Record<string, unknown>): AIEnhancedSessionState => {
  const state = isRecord(sessionMetadata.aiEnhancedState) ? sessionMetadata.aiEnhancedState : {};

  return {
    currentAnchorIndex: typeof state.currentAnchorIndex === "number" ? state.currentAnchorIndex : 0,
    turnIndex: typeof state.turnIndex === "number" ? state.turnIndex : 0,
    coveredAnchorIds: asArray<string>(state.coveredAnchorIds).filter((value) => typeof value === "string"),
    anchorsCompleted: asArray<string>(state.anchorsCompleted).filter((value) => typeof value === "string"),
    followUpState: normalizeAIEnhancedFollowUpState(state.followUpState),
    maxFollowUpsPerAnchor: typeof state.maxFollowUpsPerAnchor === "number"
      ? Math.max(0, Math.floor(state.maxFollowUpsPerAnchor))
      : AI_ENHANCED_MAX_FOLLOW_UPS_PER_ANCHOR,
    maxTotalFollowUpsPerSession: typeof state.maxTotalFollowUpsPerSession === "number"
      ? Math.max(0, Math.floor(state.maxTotalFollowUpsPerSession))
      : AI_ENHANCED_MAX_TOTAL_FOLLOW_UPS_PER_SESSION,
    promptVersion: ADAPTIVE_PROBE_PROMPT_VERSION,
    briefSnapshotId: asString(state.briefSnapshotId) || null,
  };
};

const withAIEnhancedSessionState = (
  sessionMetadata: Record<string, unknown>,
  nextState: Partial<AIEnhancedSessionState>,
) => {
  const previousState = getAIEnhancedSessionState(sessionMetadata);
  const mergedState = {
    ...previousState,
    ...nextState,
  };

  return {
    ...sessionMetadata,
    interviewMode: "ai_enhanced",
    aiEnhancedState: {
      currentAnchorIndex: mergedState.currentAnchorIndex,
      turnIndex: mergedState.turnIndex,
      coveredAnchorIds: Array.from(new Set(mergedState.coveredAnchorIds)),
      anchorsCompleted: Array.from(new Set(mergedState.anchorsCompleted)),
      followUpState: mergedState.followUpState,
      maxFollowUpsPerAnchor: mergedState.maxFollowUpsPerAnchor,
      maxTotalFollowUpsPerSession: mergedState.maxTotalFollowUpsPerSession,
      promptVersion: ADAPTIVE_PROBE_PROMPT_VERSION,
      briefSnapshotId: mergedState.briefSnapshotId,
    },
  };
};

const buildAIEnhancedWarmupContext = (
  brief: ReturnType<typeof normalizeAIEnhancedBrief>,
): ConversationalWarmupContext | undefined => {
  if (!brief) {
    return undefined;
  }

  return {
    objective: brief.objective,
    audience: brief.audience,
    decisionScope: brief.decisionScope,
    themes: brief.themes.map((theme) => theme.title).filter(Boolean),
    mustCover: brief.mustCover,
  };
};

async function getQuestionRecord(questionId: string) {
  const { data, error } = await supabase
    .from("interview_questions")
    .select("*")
    .eq("id", questionId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load interview question: ${error.message}`);
  }

  return data;
}

async function getSessionQuestionRows(sessionId: string) {
  const { data, error } = await supabase
    .from("interview_questions")
    .select("*")
    .eq("session_id", sessionId)
    .order("question_order", { ascending: true });

  if (error) {
    throw new Error(`Failed to load session questions: ${error.message}`);
  }

  return data ?? [];
}

async function updateSessionMetadata(sessionId: string, metadata: Record<string, unknown>) {
  const { error } = await supabase
    .from("study_sessions")
    .update({ metadata })
    .eq("id", sessionId);

  if (error) {
    throw new Error(`Failed to update session metadata: ${error.message}`);
  }
}

async function insertAIEnhancedQuestion(input: {
  projectId: string;
  sessionId: string;
  questionText: string;
  questionOrder: number;
  section: string;
  questionType: string;
  isFollowUp: boolean;
  parentQuestionId?: string | null;
  metadata: Record<string, unknown>;
}) {
  const { data, error } = await supabase
    .from("interview_questions")
    .insert({
      project_id: input.projectId,
      session_id: input.sessionId,
      question_text: input.questionText,
      question_order: input.questionOrder,
      section: input.section,
      question_type: input.questionType,
      is_follow_up: input.isFollowUp,
      parent_question_id: input.parentQuestionId ?? null,
      metadata: input.metadata,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to insert AI enhanced question: ${error.message}`);
  }

  return data;
}

const createWarmupGroupId = (sectionIndex: number) => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `warmup-${sectionIndex + 1}-${crypto.randomUUID()}`;
  }

  return `warmup-${sectionIndex + 1}-${Date.now()}`;
};

const getQuestionMetadata = (question: Record<string, unknown> | null | undefined) =>
  isRecord(question?.metadata) ? question.metadata as Record<string, unknown> : {};

const getResponseMetadata = (response: Record<string, unknown> | null | undefined) =>
  isRecord(response?.metadata) ? response.metadata as Record<string, unknown> : {};

const getWarmupTurnIndex = (metadata: Record<string, unknown>) =>
  typeof metadata.warmupTurnIndex === "number" ? metadata.warmupTurnIndex : 1;

const getWarmupTotalTurns = (metadata: Record<string, unknown>) =>
  typeof metadata.warmupTotalTurns === "number"
    ? metadata.warmupTotalTurns
    : CONVERSATIONAL_WARMUP_TURN_COUNT;

const isConversationalWarmupQuestion = (question: Record<string, unknown> | null | undefined) => {
  if (!question) return false;

  const metadata = getQuestionMetadata(question);
  return (
    question.question_type === "warmup_conversational" ||
    (metadata.sectionKind === "warmup" && metadata.warmupDynamic === true) ||
    isConversationalWarmupSectionTitle(asString(question.section))
  );
};

const buildConversationalWarmupQuestionRows = async ({
  projectId,
  sessionId,
  section,
  sectionIndex,
  startOrder,
  project,
  interviewMode = "structured",
  warmupContext,
}: {
  projectId: string;
  sessionId: string;
  section: Record<string, unknown>;
  sectionIndex: number;
  startOrder: number;
  project?: Record<string, unknown> | null;
  interviewMode?: ConversationalWarmupInterviewMode;
  warmupContext?: ConversationalWarmupContext;
}) => {
  const sectionTitle = asString(section.title) || "Isınma";
  const plannedQuestions = asArray<unknown>(section.questions)
    .map((question) => asString(question))
    .filter(Boolean);
  const fallbackQuestions = buildConversationalWarmupFallbacks(plannedQuestions);
  const warmupGroupId = createWarmupGroupId(sectionIndex);
  const firstTurn = await generateConversationalWarmupQuestion({
    interviewMode,
    projectTitle: asString(project?.title),
    projectDescription: asString(project?.description),
    sectionTitle,
    warmupContext,
    turnIndex: 1,
    existingWarmupQuestions: fallbackQuestions,
    previousTurns: [],
  });

  return Array.from({ length: CONVERSATIONAL_WARMUP_TURN_COUNT }, (_, index) => {
    const turnIndex = index + 1;
    const isFirstTurn = turnIndex === 1;

    return {
      project_id: projectId,
      session_id: sessionId,
      question_text: isFirstTurn
        ? firstTurn.questionText
        : (fallbackQuestions[index] || fallbackQuestions[0]),
      question_order: startOrder + index,
      section: sectionTitle,
      question_type: "warmup_conversational",
      is_follow_up: turnIndex > 1,
      metadata: {
        interviewMode,
        sectionKind: "warmup",
        source: isFirstTurn ? "warmup_llm_initial" : "warmup_placeholder",
        warmupDynamic: true,
        warmupGroupId,
        warmupTurnIndex: turnIndex,
        warmupTotalTurns: CONVERSATIONAL_WARMUP_TURN_COUNT,
        fallbackQuestions,
        warmupGeneration: isFirstTurn
          ? {
              source: firstTurn.source,
              fallbackUsed: firstTurn.fallbackUsed,
              spokenLeadIn: firstTurn.spokenLeadIn,
              answerSummary: firstTurn.answerSummary,
              readinessSignal: firstTurn.readinessSignal,
              bridgeReason: firstTurn.bridgeReason,
              generatedAt: new Date().toISOString(),
            }
          : {
              source: "placeholder",
              status: "pending_previous_answer",
            },
      },
    };
  });
};

async function getLatestResponsesByQuestion(sessionId: string, questionIds: string[]) {
  if (questionIds.length === 0) {
    return new Map<string, Record<string, unknown>>();
  }

  const { data, error } = await supabase
    .from("interview_responses")
    .select("*")
    .eq("session_id", sessionId)
    .in("question_id", questionIds)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load warm-up responses: ${error.message}`);
  }

  const responsesByQuestion = new Map<string, Record<string, unknown>>();
  asArray<Record<string, unknown>>(data).forEach((response) => {
    const questionId = asString(response.question_id);
    if (questionId) {
      responsesByQuestion.set(questionId, response);
    }
  });

  return responsesByQuestion;
}

async function updateWarmupResponseAnalysis(
  response: Record<string, unknown>,
  warmupAnalysis: Record<string, unknown>,
) {
  const responseId = asString(response.id);
  if (!responseId) {
    return response;
  }

  const { data, error } = await supabase
    .from("interview_responses")
    .update({
      metadata: {
        ...getResponseMetadata(response),
        warmupAnalysis,
      },
    })
    .eq("id", responseId)
    .select()
    .maybeSingle();

  if (error) {
    console.warn("Failed to persist warm-up response analysis:", error);
    return response;
  }

  return data ?? response;
}

const getProbeValidatorStatus = (decision: AdaptiveProbeDecisionResult) => {
  if (decision.decision === "ask_follow_up" && decision.validator.passes) {
    return "accepted";
  }

  if (decision.rejectedQuestion) {
    return "rejected";
  }

  if (decision.error) {
    return decision.error;
  }

  return "not_applicable";
};

async function insertProbeDecision(input: {
  sessionId: string;
  participantId: string | null;
  anchorQuestionId: string | null;
  responseId: string | null;
  decision: AdaptiveProbeDecisionResult;
}) {
  if (!input.participantId || !input.responseId) {
    return null;
  }

  const { data, error } = await supabase
    .from("probe_decisions")
    .insert({
      session_id: input.sessionId,
      participant_id: input.participantId,
      anchor_question_id: input.anchorQuestionId,
      response_id: input.responseId,
      decision: input.decision.decision,
      gap_type: input.decision.gap_type,
      probe_type: input.decision.probe_type,
      decision_reason: input.decision.decision_reason,
      relevance_score: input.decision.relevance_score,
      research_value_score: input.decision.research_value_score,
      answer_sufficiency_score: input.decision.answer_sufficiency_score,
      risk_score: input.decision.risk_score,
      confidence_score: input.decision.confidence_score,
      generated_question: input.decision.generatedQuestion,
      validator_status: getProbeValidatorStatus(input.decision),
      validator_notes: input.decision.validator.validator_notes,
      prompt_version: input.decision.prompt_version,
      model: input.decision.model,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    console.warn("Failed to persist adaptive probe decision:", error.code ?? "unknown_error");
    return null;
  }

  return asString(data?.id) || null;
}

async function updateResponseAdaptiveProbeMetadata(
  response: Record<string, unknown>,
  decision: AdaptiveProbeDecisionResult,
  probeDecisionId: string | null,
) {
  const responseId = asString(response.id);
  if (!responseId) {
    return response;
  }

  const { data, error } = await supabase
    .from("interview_responses")
    .update({
      metadata: {
        ...getResponseMetadata(response),
        adaptiveProbe: {
          decision: decision.decision,
          gapType: decision.gap_type,
          probeType: decision.probe_type,
          decisionReason: decision.decision_reason,
          validatorStatus: getProbeValidatorStatus(decision),
          validatorNotes: decision.validator.validator_notes,
          policyReason: decision.policy.reason,
          blockedReasons: decision.policy.blockedReasons,
          promptVersion: decision.prompt_version,
          model: decision.model,
          probeDecisionId,
          analyzedAt: new Date().toISOString(),
          error: decision.error,
        },
      },
    })
    .eq("id", responseId)
    .select()
    .maybeSingle();

  if (error) {
    console.warn("Failed to persist adaptive probe response metadata:", error.code ?? "unknown_error");
    return response;
  }

  return data ?? response;
}

async function advanceConversationalWarmup(
  sessionId: string,
  response: Record<string, unknown>,
) {
  const questionId = asString(response.question_id);
  if (!questionId) {
    return response;
  }

  const currentQuestion = await getQuestionRecord(questionId);
  if (!isConversationalWarmupQuestion(currentQuestion)) {
    return response;
  }

  const currentMetadata = getQuestionMetadata(currentQuestion);
  const warmupGroupId = asString(currentMetadata.warmupGroupId);
  const turnIndex = getWarmupTurnIndex(currentMetadata);
  const totalTurns = getWarmupTotalTurns(currentMetadata);
  const fallbackQuestions = asArray<string>(currentMetadata.fallbackQuestions)
    .map((question) => asString(question))
    .filter(Boolean);
  const analyzedAt = new Date().toISOString();

  const baseAnalysis = {
    sectionKind: "warmup",
    warmupDynamic: true,
    warmupGroupId,
    warmupTurnIndex: turnIndex,
    warmupTotalTurns: totalTurns,
    analyzedAt,
  };

  if (!warmupGroupId || turnIndex >= totalTurns) {
    return await updateWarmupResponseAnalysis(response, {
      ...baseAnalysis,
      warmupCompleted: true,
    });
  }

  const allQuestions = await getSessionQuestionRows(sessionId);
  const groupQuestions = allQuestions
    .filter((question) => {
      const metadata = getQuestionMetadata(question);
      return metadata.warmupGroupId === warmupGroupId;
    })
    .sort((left, right) => Number(left.question_order) - Number(right.question_order));

  const nextQuestion = groupQuestions.find((question) =>
    getWarmupTurnIndex(getQuestionMetadata(question)) === turnIndex + 1
  );

  if (!nextQuestion) {
    return await updateWarmupResponseAnalysis(response, {
      ...baseAnalysis,
      warmupCompleted: true,
      warning: "Next conversational warm-up question was not found.",
    });
  }

  const responsesByQuestion = await getLatestResponsesByQuestion(
    sessionId,
    groupQuestions.map((question) => asString(question.id)).filter(Boolean),
  );
  responsesByQuestion.set(questionId, response);

  const previousTurns = groupQuestions
    .filter((question) => getWarmupTurnIndex(getQuestionMetadata(question)) <= turnIndex)
    .map((question) => {
      const questionResponse = responsesByQuestion.get(asString(question.id));
      const responseMetadata = getResponseMetadata(questionResponse);

      return {
        turnIndex: getWarmupTurnIndex(getQuestionMetadata(question)),
        questionText: asString(question.question_text),
        answerText: asString(questionResponse?.transcription) || asString(questionResponse?.response_text),
        skipped: Boolean(responseMetadata.skipped),
      };
    });

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("title, description, analysis")
    .eq("id", currentQuestion.project_id)
    .maybeSingle();

  if (projectError) {
    throw new Error(`Failed to load project for warm-up generation: ${projectError.message}`);
  }

  const projectAnalysis = isRecord(project?.analysis) ? project.analysis : {};
  const warmupInterviewMode = currentMetadata.interviewMode === "ai_enhanced" ? "ai_enhanced" : "structured";
  const warmupBrief = warmupInterviewMode === "ai_enhanced"
    ? normalizeAIEnhancedBrief(projectAnalysis.aiEnhancedBrief)
    : null;

  const generation = await generateConversationalWarmupQuestion({
    interviewMode: warmupInterviewMode,
    projectTitle: asString(project?.title),
    projectDescription: asString(project?.description),
    sectionTitle: asString(currentQuestion.section) || "Isınma",
    warmupContext: buildAIEnhancedWarmupContext(warmupBrief),
    turnIndex: turnIndex + 1,
    existingWarmupQuestions: fallbackQuestions,
    previousTurns,
  });

  const nextQuestionMetadata = getQuestionMetadata(nextQuestion);
  const { error: updateQuestionError } = await supabase
    .from("interview_questions")
    .update({
      question_text: generation.questionText,
      metadata: {
        ...nextQuestionMetadata,
        source: "warmup_llm_followup",
        warmupGeneration: {
          source: generation.source,
          fallbackUsed: generation.fallbackUsed,
          spokenLeadIn: generation.spokenLeadIn,
          answerSummary: generation.answerSummary,
          readinessSignal: generation.readinessSignal,
          bridgeReason: generation.bridgeReason,
          generatedFromQuestionId: questionId,
          generatedAt: analyzedAt,
        },
      },
    })
    .eq("id", nextQuestion.id);

  if (updateQuestionError) {
    throw new Error(`Failed to update conversational warm-up question: ${updateQuestionError.message}`);
  }

  return await updateWarmupResponseAnalysis(response, {
    ...baseAnalysis,
    answerSummary: generation.answerSummary,
    readinessSignal: generation.readinessSignal,
    bridgeReason: generation.bridgeReason,
    spokenLeadIn: generation.spokenLeadIn,
    nextQuestionId: nextQuestion.id,
    nextQuestionText: generation.questionText,
    nextQuestionSource: generation.source,
    fallbackUsed: generation.fallbackUsed,
  });
}

async function initializeAIEnhancedQuestions(
  projectId: string,
  sessionId: string,
  analysis: Record<string, unknown>,
  session: Record<string, unknown>,
  project?: Record<string, unknown> | null,
) {
  const brief = normalizeAIEnhancedBrief(analysis.aiEnhancedBrief);
  if (!brief || brief.anchorQuestions.length === 0) {
    throw new Error("AI enhanced brief is not ready for interview orchestration");
  }

  const existingQuestions = await getSessionQuestionRows(sessionId);
  if (existingQuestions.length > 0) {
    return new Response(
      JSON.stringify({ success: true, questions: existingQuestions, skipped: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const firstAnchor = brief.anchorQuestions[0];
  const firstTheme = findThemeById(brief, firstAnchor.themeId);
  const sessionMetadata = isRecord(session.metadata) ? session.metadata : {};
  const nextMetadata = withAIEnhancedSessionState(sessionMetadata, {
    currentAnchorIndex: 0,
    turnIndex: 1,
    coveredAnchorIds: [],
    anchorsCompleted: [],
    followUpState: {},
    maxFollowUpsPerAnchor: AI_ENHANCED_MAX_FOLLOW_UPS_PER_ANCHOR,
    maxTotalFollowUpsPerSession: AI_ENHANCED_MAX_TOTAL_FOLLOW_UPS_PER_SESSION,
    briefSnapshotId: brief.readyAt || brief.updatedAt || null,
  });

  const startedAt = typeof session.started_at === "string" ? session.started_at : new Date().toISOString();
  const { error: updateSessionError } = await supabase
    .from("study_sessions")
    .update({
      status: "active",
      started_at: startedAt,
      metadata: nextMetadata,
    })
    .eq("id", sessionId);

  if (updateSessionError) {
    throw new Error(`Failed to mark AI enhanced session active: ${updateSessionError.message}`);
  }

  const warmupRows = await buildConversationalWarmupQuestionRows({
    projectId,
    sessionId,
    section: {
      id: "agentic-warmup",
      title: "Isınma",
      questions: [],
    },
    sectionIndex: 0,
    startOrder: 1,
    project: {
      title: asString(project?.title),
      description: asString(project?.description) || brief.objective,
    },
    interviewMode: "ai_enhanced",
    warmupContext: buildAIEnhancedWarmupContext(brief),
  });

  const questionRows = [
    ...warmupRows,
    {
      project_id: projectId,
      session_id: sessionId,
      question_text: firstAnchor.text,
      question_order: CONVERSATIONAL_WARMUP_TURN_COUNT + 1,
      section: firstTheme?.title || "AI Enhanced",
      question_type: "anchor",
      is_follow_up: false,
      metadata: {
        interviewMode: "ai_enhanced",
        source: "anchor",
        anchorId: firstAnchor.id,
        anchorIndex: 0,
        themeId: firstAnchor.themeId,
        turnIndex: 1,
        prompt_version: ADAPTIVE_PROBE_PROMPT_VERSION,
      },
    },
  ];

  const { data, error } = await supabase
    .from("interview_questions")
    .insert(questionRows)
    .select();

  if (error) {
    throw new Error(`Failed to initialize AI enhanced questions: ${error.message}`);
  }

  const orderedQuestions = (data ?? []).sort((left, right) =>
    Number(left.question_order) - Number(right.question_order)
  );

  return new Response(
    JSON.stringify({ success: true, questions: orderedQuestions }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

async function advanceAIEnhancedInterview(
  sessionId: string,
  response: Record<string, unknown>,
) {
  const questionId = asString(response.question_id);
  const currentQuestion = await getQuestionRecord(questionId);
  if (!currentQuestion || isConversationalWarmupQuestion(currentQuestion)) {
    return;
  }

  const { data: session, error: sessionError } = await supabase
    .from("study_sessions")
    .select("id, project_id, participant_id, metadata")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError) {
    throw new Error(`Failed to load session during AI enhanced advance: ${sessionError.message}`);
  }

  if (!session) {
    throw new Error("Session not found during AI enhanced advance");
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("analysis")
    .eq("id", session.project_id)
    .maybeSingle();

  if (projectError) {
    throw new Error(`Failed to load project analysis during AI enhanced advance: ${projectError.message}`);
  }

  const analysis = isRecord(project?.analysis) ? project.analysis : {};
  const brief = normalizeAIEnhancedBrief(analysis.aiEnhancedBrief);
  if (!brief || brief.anchorQuestions.length === 0) {
    return;
  }

  const currentMetadata = isRecord(currentQuestion.metadata) ? currentQuestion.metadata : {};
  const sessionMetadata = isRecord(session.metadata) ? session.metadata : {};
  const aiState = getAIEnhancedSessionState(sessionMetadata);
  const allQuestions = await getSessionQuestionRows(sessionId);
  if (allQuestions.some((question) => Number(question.question_order) > Number(currentQuestion.question_order))) {
    return;
  }
  const nextQuestionOrder = allQuestions.length + 1;
  const currentAnchorId = asString(currentMetadata.anchorId);
  const currentAnchorIndex = typeof currentMetadata.anchorIndex === "number"
    ? currentMetadata.anchorIndex
    : brief.anchorQuestions.findIndex((anchor) => anchor.id === currentAnchorId);
  const currentAnchor = brief.anchorQuestions[currentAnchorIndex] ?? null;

  if (!currentAnchor) {
    return;
  }

  const updatedCoveredAnchorIds = aiState.coveredAnchorIds.includes(currentAnchor.id)
    ? aiState.coveredAnchorIds
    : [...aiState.coveredAnchorIds, currentAnchor.id];

  let updatedResponse = response;

  if (currentMetadata.source === "anchor" && !currentQuestion.is_follow_up) {
    const responseMetadata = isRecord(response.metadata) ? response.metadata : {};
    const wasSkipped = Boolean(responseMetadata.skipped);
    const participantAnswer = asString(response.transcription) || asString(response.response_text);
    const anchorFollowUpQuestions = allQuestions.filter((question) => {
        const metadata = isRecord(question.metadata) ? question.metadata : {};
        return metadata.source === "follow_up" && metadata.anchorId === currentAnchor.id;
      });
    const sessionFollowUpQuestions = allQuestions.filter((question) => {
      const metadata = isRecord(question.metadata) ? question.metadata : {};
      return metadata.source === "follow_up" && metadata.interviewMode === "ai_enhanced";
    });
    const previousFollowUps = anchorFollowUpQuestions
      .map((question) => asString(question.question_text))
      .filter(Boolean);
    const themeTitle = findThemeById(brief, currentAnchor.themeId)?.title || "AI Enhanced";
    const questionIds = allQuestions.map((question) => asString(question.id)).filter(Boolean);
    const responsesByQuestion = await getLatestResponsesByQuestion(sessionId, questionIds);
    responsesByQuestion.set(questionId, response);
    const priorTurns = allQuestions
      .filter((question) => Number(question.question_order) <= Number(currentQuestion.question_order))
      .map((question) => {
        const metadata = getQuestionMetadata(question);
        const source = ["warmup", "anchor", "follow_up"].includes(asString(metadata.source))
          ? asString(metadata.source) as AdaptiveProbeTurn["source"]
          : isConversationalWarmupQuestion(question)
            ? "warmup"
            : "unknown";
        const turnResponse = responsesByQuestion.get(asString(question.id));

        return {
          questionId: asString(question.id),
          questionText: asString(question.question_text),
          answerText: asString(turnResponse?.transcription) || asString(turnResponse?.response_text),
          source,
          anchorId: asString(metadata.anchorId) || null,
          anchorIndex: typeof metadata.anchorIndex === "number" ? metadata.anchorIndex : null,
        };
      })
      .filter((turn) => turn.questionId && turn.questionText) as AdaptiveProbeTurn[];
    const participantLanguageRaw = (
      asString(sessionMetadata.participantLanguage) ||
      asString(sessionMetadata.language) ||
      asString(sessionMetadata.locale)
    ).toLowerCase();
    const participantLanguage: AdaptiveProbeLanguage = participantLanguageRaw.startsWith("en")
      ? "en"
      : participantLanguageRaw.startsWith("tr")
        ? "tr"
        : "unknown";
    const decision = await decideAdaptiveProbe({
      brief,
      currentAnchor,
      currentAnchorQuestionId: asString(currentQuestion.id),
      currentAnchorIndex,
      totalAnchors: brief.anchorQuestions.length,
      themeTitle,
      participantAnswer,
      priorTurns,
      previousFollowUps,
      recentQuestionTexts: allQuestions.map((question) => asString(question.question_text)).filter(Boolean),
      currentAnchorFollowUpCount: anchorFollowUpQuestions.length,
      totalFollowUpCount: sessionFollowUpQuestions.length,
      sessionMetadata,
      participantLanguage,
      transcriptConfidence: typeof response.confidence_score === "number" ? response.confidence_score : null,
      wasSkipped,
      limits: {
        maxFollowUpsPerAnchor: aiState.maxFollowUpsPerAnchor,
        maxTotalFollowUpsPerSession: aiState.maxTotalFollowUpsPerSession,
      },
    });
    const probeDecisionId = await insertProbeDecision({
      sessionId,
      participantId: asString(session.participant_id) || asString(response.participant_id) || null,
      anchorQuestionId: asString(currentQuestion.id) || null,
      responseId: asString(response.id) || null,
      decision,
    });
    updatedResponse = await updateResponseAdaptiveProbeMetadata(response, decision, probeDecisionId);

    if (decision.decision === "ask_follow_up" && decision.follow_up_question) {
      await insertAIEnhancedQuestion({
        projectId: session.project_id,
        sessionId,
        questionText: decision.follow_up_question,
        questionOrder: nextQuestionOrder,
        section: themeTitle,
        questionType: "follow_up",
        isFollowUp: true,
        parentQuestionId: currentQuestion.id,
        metadata: {
          interviewMode: "ai_enhanced",
          source: "follow_up",
          generatedBy: "adaptive_probe_engine",
          anchorId: currentAnchor.id,
          anchorQuestionId: currentAnchor.id,
          anchorIndex: currentAnchorIndex,
          themeId: currentAnchor.themeId,
          turnIndex: aiState.turnIndex + 1,
          parentQuestionId: currentQuestion.id,
          generation_reason: decision.decision_reason,
          gap_type: decision.gap_type,
          probe_type: decision.probe_type,
          llm_model: decision.model,
          prompt_version: decision.prompt_version,
          validation_status: "accepted",
          validator_notes: decision.validator.validator_notes,
          probeDecisionId,
        },
      });

      const nextFollowUpState = {
        ...aiState.followUpState,
        [currentAnchor.id]: {
          count: (aiState.followUpState[currentAnchor.id]?.count ?? 0) + 1,
          lastProbeType: decision.probe_type,
        },
      };

      await updateSessionMetadata(sessionId, withAIEnhancedSessionState(sessionMetadata, {
        currentAnchorIndex,
        turnIndex: aiState.turnIndex + 1,
        coveredAnchorIds: updatedCoveredAnchorIds,
        followUpState: nextFollowUpState,
        maxFollowUpsPerAnchor: aiState.maxFollowUpsPerAnchor,
        maxTotalFollowUpsPerSession: aiState.maxTotalFollowUpsPerSession,
        briefSnapshotId: brief.readyAt || brief.updatedAt || aiState.briefSnapshotId,
      }));
      return updatedResponse;
    }
  }

  const nextAnchorIndex = currentAnchorIndex + 1;
  const nextAnchor = brief.anchorQuestions[nextAnchorIndex] ?? null;

  if (nextAnchor) {
    await insertAIEnhancedQuestion({
      projectId: session.project_id,
      sessionId,
      questionText: nextAnchor.text,
      questionOrder: nextQuestionOrder,
      section: findThemeById(brief, nextAnchor.themeId)?.title || "AI Enhanced",
      questionType: "anchor",
      isFollowUp: false,
      metadata: {
        interviewMode: "ai_enhanced",
        source: "anchor",
        anchorId: nextAnchor.id,
        anchorIndex: nextAnchorIndex,
        themeId: nextAnchor.themeId,
        turnIndex: aiState.turnIndex + 1,
        prompt_version: ADAPTIVE_PROBE_PROMPT_VERSION,
      },
    });
  }

  const updatedAnchorsCompleted = aiState.anchorsCompleted.includes(currentAnchor.id)
    ? aiState.anchorsCompleted
    : [...aiState.anchorsCompleted, currentAnchor.id];

  await updateSessionMetadata(sessionId, withAIEnhancedSessionState(sessionMetadata, {
    currentAnchorIndex: nextAnchor ? nextAnchorIndex : currentAnchorIndex,
    turnIndex: aiState.turnIndex + 1,
    coveredAnchorIds: updatedCoveredAnchorIds,
    anchorsCompleted: updatedAnchorsCompleted,
    maxFollowUpsPerAnchor: aiState.maxFollowUpsPerAnchor,
    maxTotalFollowUpsPerSession: aiState.maxTotalFollowUpsPerSession,
    briefSnapshotId: brief.readyAt || brief.updatedAt || aiState.briefSnapshotId,
  }));

  return updatedResponse;
}

async function advanceAIEnhancedInterviewFallback(
  sessionId: string,
  response: Record<string, unknown>,
) {
  const questionId = asString(response.question_id);
  const currentQuestion = await getQuestionRecord(questionId);
  if (!currentQuestion || isConversationalWarmupQuestion(currentQuestion)) {
    return;
  }

  const { data: session, error: sessionError } = await supabase
    .from("study_sessions")
    .select("id, project_id, metadata")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError || !session) {
    console.warn("AI enhanced fallback skipped because session could not be loaded.");
    return;
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("analysis")
    .eq("id", session.project_id)
    .maybeSingle();

  if (projectError) {
    console.warn("AI enhanced fallback skipped because project analysis could not be loaded.");
    return;
  }

  const analysis = isRecord(project?.analysis) ? project.analysis : {};
  const brief = normalizeAIEnhancedBrief(analysis.aiEnhancedBrief);
  if (!brief || brief.anchorQuestions.length === 0) {
    return;
  }

  const currentMetadata = getQuestionMetadata(currentQuestion);
  const source = asString(currentMetadata.source);
  if (source !== "anchor" && source !== "follow_up") {
    return;
  }

  const allQuestions = await getSessionQuestionRows(sessionId);
  if (allQuestions.some((question) => Number(question.question_order) > Number(currentQuestion.question_order))) {
    return;
  }

  const sessionMetadata = isRecord(session.metadata) ? session.metadata : {};
  const aiState = getAIEnhancedSessionState(sessionMetadata);
  const currentAnchorId = asString(currentMetadata.anchorId);
  const currentAnchorIndex = typeof currentMetadata.anchorIndex === "number"
    ? currentMetadata.anchorIndex
    : brief.anchorQuestions.findIndex((anchor) => anchor.id === currentAnchorId);
  const currentAnchor = brief.anchorQuestions[currentAnchorIndex] ?? null;

  if (!currentAnchor) {
    return;
  }

  const nextAnchorIndex = currentAnchorIndex + 1;
  const nextAnchor = brief.anchorQuestions[nextAnchorIndex] ?? null;

  if (nextAnchor) {
    const alreadyInserted = allQuestions.some((question) => {
      const metadata = getQuestionMetadata(question);
      return metadata.source === "anchor" && metadata.anchorId === nextAnchor.id;
    });

    if (!alreadyInserted) {
      await insertAIEnhancedQuestion({
        projectId: session.project_id,
        sessionId,
        questionText: nextAnchor.text,
        questionOrder: allQuestions.length + 1,
        section: findThemeById(brief, nextAnchor.themeId)?.title || "AI Enhanced",
        questionType: "anchor",
        isFollowUp: false,
        metadata: {
          interviewMode: "ai_enhanced",
          source: "anchor",
          anchorId: nextAnchor.id,
          anchorIndex: nextAnchorIndex,
          themeId: nextAnchor.themeId,
          turnIndex: aiState.turnIndex + 1,
          prompt_version: ADAPTIVE_PROBE_PROMPT_VERSION,
          fallbackReason: "adaptive_probe_advance_failed",
        },
      });
    }
  }

  const coveredAnchorIds = aiState.coveredAnchorIds.includes(currentAnchor.id)
    ? aiState.coveredAnchorIds
    : [...aiState.coveredAnchorIds, currentAnchor.id];
  const anchorsCompleted = aiState.anchorsCompleted.includes(currentAnchor.id)
    ? aiState.anchorsCompleted
    : [...aiState.anchorsCompleted, currentAnchor.id];

  await updateSessionMetadata(sessionId, withAIEnhancedSessionState(sessionMetadata, {
    currentAnchorIndex: nextAnchor ? nextAnchorIndex : currentAnchorIndex,
    turnIndex: aiState.turnIndex + 1,
    coveredAnchorIds,
    anchorsCompleted,
    maxFollowUpsPerAnchor: aiState.maxFollowUpsPerAnchor,
    maxTotalFollowUpsPerSession: aiState.maxTotalFollowUpsPerSession,
    briefSnapshotId: brief.readyAt || brief.updatedAt || aiState.briefSnapshotId,
  }));
}

async function buildInterviewState(sessionId: string) {
  const { data: questions, error } = await supabase
    .from('interview_questions')
    .select(`
      *,
      interview_responses!left(id, is_complete)
    `)
    .eq('session_id', sessionId)
    .order('question_order', { ascending: true });

  if (error) {
    throw new Error(`Failed to get questions: ${error.message}`);
  }

  const nextQuestion = questions?.find((question) =>
    !question.interview_responses ||
    question.interview_responses.length === 0 ||
    !question.interview_responses.some((response: { is_complete?: boolean | null }) => response.is_complete)
  ) ?? null;

  const totalQuestions = questions?.length || 0;
  const completedQuestions = questions?.filter((question) =>
    question.interview_responses &&
    question.interview_responses.length > 0 &&
    question.interview_responses.some((response: { is_complete?: boolean | null }) => response.is_complete)
  ).length || 0;

  return {
    nextQuestion,
    progress: {
      completed: completedQuestions,
      total: totalQuestions,
      isComplete: totalQuestions > 0 && completedQuestions === totalQuestions,
      percentage: totalQuestions > 0 ? (completedQuestions / totalQuestions) * 100 : 0,
    },
  };
}

async function finalizeCompletedSession(sessionId: string, state: Awaited<ReturnType<typeof buildInterviewState>>) {
  if (!state.progress.isComplete) return;

  const { data: session, error: sessionError } = await supabase
    .from('study_sessions')
    .select('id, project_id, participant_id, status, ended_at, metadata')
    .eq('id', sessionId)
    .maybeSingle();

  if (sessionError) {
    throw new Error(`Failed to finalize session: ${sessionError.message}`);
  }

  if (!session) return;

  const endedAt = session.ended_at ?? new Date().toISOString();

  if (session.status !== 'completed' || !session.ended_at) {
    const { error: updateSessionError } = await supabase
      .from('study_sessions')
      .update({
        status: 'completed',
        ended_at: endedAt,
        metadata: {
          ...(session.metadata ?? {}),
          completedAt: endedAt,
        },
      })
      .eq('id', sessionId);

    if (updateSessionError) {
      throw new Error(`Failed to update session completion: ${updateSessionError.message}`);
    }
  }

  if (session.participant_id) {
    const { error: participantError } = await supabase
      .from('study_participants')
      .update({
        status: 'completed',
        completed_at: endedAt,
      })
      .eq('id', session.participant_id)
      .neq('status', 'declined');

    if (participantError) {
      throw new Error(`Failed to update participant completion: ${participantError.message}`);
    }
  }

  await setProjectReportStatus(supabase, session.project_id, 'generating', {
    trigger: 'session-completed',
    triggerSessionId: sessionId,
  });

  const backgroundTask = generateAndPersistProjectReport(supabase, session.project_id, {
    trigger: 'session-completed',
    triggerSessionId: sessionId,
  }).catch(async (error) => {
    console.error('Background report generation failed:', error);
    try {
      await setProjectReportStatus(supabase, session.project_id, 'failed', {
        trigger: 'session-completed',
        triggerSessionId: sessionId,
        failureMessage: error instanceof Error ? error.message : 'Unknown error',
      });
    } catch (statusError) {
      console.error('Failed to persist report failure state:', statusError);
    }
  });

  const edgeRuntime = (globalThis as { EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void } }).EdgeRuntime;
  if (edgeRuntime?.waitUntil) {
    edgeRuntime.waitUntil(backgroundTask);
    return;
  }

  await backgroundTask;
}

async function endSessionEarly(sessionId: string) {
  const endedAt = new Date().toISOString();

  const { data: session, error: sessionError } = await supabase
    .from('study_sessions')
    .select('id, status, metadata')
    .eq('id', sessionId)
    .maybeSingle();

  if (sessionError) {
    throw new Error(`Failed to load session for early end: ${sessionError.message}`);
  }

  if (!session) {
    throw new Error('Session not found');
  }

  if (session.status === 'completed' || session.status === 'cancelled') {
    return new Response(
      JSON.stringify({ success: true, status: session.status }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const metadata = isRecord(session.metadata) ? session.metadata : {};

  const { error: updateError } = await supabase
    .from('study_sessions')
    .update({
      status: 'cancelled',
      ended_at: endedAt,
      metadata: {
        ...metadata,
        endedEarlyAt: endedAt,
        endedEarlyReason: 'participant_ended_early',
      },
    })
    .eq('id', sessionId);

  if (updateError) {
    throw new Error(`Failed to end session early: ${updateError.message}`);
  }

  return new Response(
    JSON.stringify({ success: true, status: 'cancelled' }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, sessionId, projectId, questionData, responseData } = await req.json();
    const sessionToken = req.headers.get('x-session-token');

    if (!sessionToken) {
      return new Response(
        JSON.stringify({ error: 'Missing session token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!sessionId) {
      return new Response(
        JSON.stringify({ error: 'Missing sessionId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const isValid = await validateSessionToken(sessionId, sessionToken);
    if (!isValid) {
      return new Response(
        JSON.stringify({ error: 'Invalid or mismatched session token' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    switch (action) {
      case 'initialize_questions':
        return await initializeQuestions(projectId, sessionId, questionData);
      case 'get_next_question':
        return await getNextQuestion(sessionId);
      case 'save_response':
        return await saveResponse(sessionId, responseData);
      case 'complete_question':
        return await completeQuestion(sessionId, responseData.questionId);
      case 'get_interview_progress':
        return await getInterviewProgress(sessionId);
      case 'submit_response':
        return await submitResponse(sessionId, responseData);
      case 'skip_question':
        return await skipQuestion(sessionId, responseData.questionId, responseData.metadata ?? {});
      case 'attach_response_media':
        return await attachResponseMedia(sessionId, responseData.responseId, responseData);
      case 'prepare_screen_recording_upload':
        return await prepareScreenRecordingUpload(sessionId, responseData ?? {});
      case 'finalize_screen_recording':
        return await finalizeScreenRecording(sessionId, responseData ?? {});
      case 'end_session_early':
        return await endSessionEarly(sessionId);
      default:
        throw new Error('Invalid action');
    }
  } catch (error) {
    console.error('Interview manager error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

async function initializeQuestions(projectId: string, sessionId: string, discussionGuide: unknown) {
  console.log('Initializing questions for session:', sessionId);

  const resolved = await resolveDiscussionGuideForSession(projectId, sessionId, discussionGuide);
  if (getResearchModeFromAnalysis(resolved.analysis) === "ai_enhanced") {
    return await initializeAIEnhancedQuestions(projectId, sessionId, resolved.analysis, resolved.session, resolved.project);
  }

  const resolvedGuide = resolved.discussionGuide;

  if (!resolvedGuide?.sections?.length) {
    throw new Error('No discussion guide available for session');
  }

  const startedAt = resolved.session.started_at ?? new Date().toISOString();
  const nextSessionMetadata = {
    ...(isRecord(resolved.session.metadata) ? resolved.session.metadata : {}),
    ...resolved.assignmentMetadata,
  };

  if (
    resolved.session.status !== 'active' ||
    !resolved.session.started_at ||
    JSON.stringify(resolved.session.metadata ?? {}) !== JSON.stringify(nextSessionMetadata)
  ) {
    const { error: sessionUpdateError } = await supabase
      .from('study_sessions')
      .update({
        status: 'active',
        started_at: startedAt,
        metadata: nextSessionMetadata,
      })
      .eq('id', sessionId);

    if (sessionUpdateError) {
      throw new Error(`Failed to mark session active: ${sessionUpdateError.message}`);
    }
  }

  const { data: existingQuestions, error: checkError } = await supabase
    .from('interview_questions')
    .select('id')
    .eq('session_id', sessionId)
    .limit(1);

  if (checkError) {
    console.error('Error checking existing questions:', checkError);
  }

  if (existingQuestions && existingQuestions.length > 0) {
    const { data: allQuestions } = await supabase
      .from('interview_questions')
      .select('*')
      .eq('session_id', sessionId)
      .order('question_order');

    return new Response(
      JSON.stringify({ success: true, questions: allQuestions, skipped: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const questions: Array<Record<string, unknown>> = [];
  let order = 1;

  if (resolvedGuide?.sections) {
    for (const [sectionIndex, section] of asArray<Record<string, unknown>>(resolvedGuide.sections).entries()) {
      if (!isRecord(section)) continue;

      const sectionTitle = asString(section.title) || `Bölüm ${sectionIndex + 1}`;

      if (isConversationalWarmupSectionTitle(sectionTitle)) {
        const warmupRows = await buildConversationalWarmupQuestionRows({
          projectId,
          sessionId,
          section: {
            ...section,
            title: sectionTitle,
          },
          sectionIndex,
          startOrder: order,
          project: resolved.project,
        });
        questions.push(...warmupRows);
        order += CONVERSATIONAL_WARMUP_TURN_COUNT;
        continue;
      }

      const sectionQuestions = asArray<unknown>(section.questions)
        .map((question) => asString(question))
        .filter(Boolean);

      for (const question of sectionQuestions) {
        questions.push({
          project_id: projectId,
          session_id: sessionId,
          question_text: question,
          question_order: order++,
          section: sectionTitle,
          question_type: 'open_ended',
        });
      }
    }
  }

  const { data, error } = await supabase
    .from('interview_questions')
    .insert(questions)
    .select();

  if (error) {
    throw new Error(`Failed to initialize questions: ${error.message}`);
  }

  return new Response(
    JSON.stringify({ success: true, questions: data }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function getNextQuestion(sessionId: string) {
  console.log('Getting next question for session:', sessionId);
  const state = await buildInterviewState(sessionId);

  return new Response(
    JSON.stringify(state),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function saveResponse(sessionId: string, responseData: ResponsePayload) {
  console.log('Saving response for session:', sessionId);
  const response = await saveOrUpdateResponse(sessionId, responseData);

  return new Response(
    JSON.stringify({ success: true, response }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function completeQuestion(sessionId: string, questionId: string) {
  console.log('Completing question:', questionId);
  let response = await saveOrUpdateResponse(sessionId, {
    questionId,
    isComplete: true,
    metadata: {
      completedAt: new Date().toISOString(),
    },
  });
  response = await advanceConversationalWarmup(sessionId, response);
  const state = await buildInterviewState(sessionId);
  await finalizeCompletedSession(sessionId, state);

  return new Response(
    JSON.stringify({ success: true, response, ...state }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function submitResponse(sessionId: string, responseData: ResponsePayload) {
  console.log('Submitting response for session:', sessionId, 'question:', responseData.questionId);
  let response = await saveOrUpdateResponse(sessionId, {
    ...responseData,
    isComplete: true,
    metadata: {
      submittedAt: new Date().toISOString(),
      ...(responseData.metadata ?? {}),
    },
  });

  try {
    response = await advanceConversationalWarmup(sessionId, response);
  } catch (error) {
    console.warn('Conversational warmup advance failed after response save:', error instanceof Error ? error.message : 'unknown_error');
  }

  try {
    response = await advanceAIEnhancedInterview(sessionId, response) ?? response;
  } catch (error) {
    console.warn('AI enhanced advance failed after response save:', error instanceof Error ? error.message : 'unknown_error');
    try {
      await advanceAIEnhancedInterviewFallback(sessionId, response);
    } catch (fallbackError) {
      console.warn('AI enhanced deterministic fallback failed:', fallbackError instanceof Error ? fallbackError.message : 'unknown_error');
    }
  }

  const state = await buildInterviewState(sessionId);
  try {
    await finalizeCompletedSession(sessionId, state);
  } catch (error) {
    console.warn('Session finalization failed after response save:', error instanceof Error ? error.message : 'unknown_error');
  }

  return new Response(
    JSON.stringify({ success: true, response, ...state }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function skipQuestion(sessionId: string, questionId: string, metadata: Record<string, unknown>) {
  console.log('Skipping question:', questionId);
  let response = await saveOrUpdateResponse(sessionId, {
    questionId,
    transcription: '',
    responseText: '',
    isComplete: true,
    metadata: {
      skipped: true,
      skippedAt: new Date().toISOString(),
      ...metadata,
    },
  });

  try {
    response = await advanceConversationalWarmup(sessionId, response);
  } catch (error) {
    console.warn('Conversational warmup advance failed after skip save:', error instanceof Error ? error.message : 'unknown_error');
  }

  try {
    response = await advanceAIEnhancedInterview(sessionId, response) ?? response;
  } catch (error) {
    console.warn('AI enhanced advance failed after skip save:', error instanceof Error ? error.message : 'unknown_error');
    try {
      await advanceAIEnhancedInterviewFallback(sessionId, response);
    } catch (fallbackError) {
      console.warn('AI enhanced deterministic fallback failed after skip:', fallbackError instanceof Error ? fallbackError.message : 'unknown_error');
    }
  }

  const state = await buildInterviewState(sessionId);
  try {
    await finalizeCompletedSession(sessionId, state);
  } catch (error) {
    console.warn('Session finalization failed after skip save:', error instanceof Error ? error.message : 'unknown_error');
  }

  return new Response(
    JSON.stringify({ success: true, response, ...state }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function attachResponseMedia(sessionId: string, responseId: string, responseData: ResponsePayload & { responseId?: string }) {
  if (!responseId) {
    throw new Error('Missing responseId');
  }

  if (responseData.videoBase64 || responseData.videoUrl || responseData.videoDuration) {
    return new Response(
      JSON.stringify({ error: VIDEO_UPLOAD_DISABLED_CODE, code: VIDEO_UPLOAD_DISABLED_CODE }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const existingResponse = await supabase
    .from('interview_responses')
    .select('metadata, question_id')
    .eq('id', responseId)
    .eq('session_id', sessionId)
    .maybeSingle();

  if (existingResponse.error) {
    throw new Error(`Failed to load response metadata: ${existingResponse.error.message}`);
  }

  const { data: session, error: sessionError } = await supabase
    .from('study_sessions')
    .select('project_id')
    .eq('id', sessionId)
    .maybeSingle();

  if (sessionError || !session?.project_id) {
    throw new Error(`Failed to resolve response project: ${sessionError?.message ?? 'missing project_id'}`);
  }

  let storedAudioPath: string | null = null;
  const audioMimeType = responseData.audioMimeType || 'audio/wav';

  if (responseData.audioBase64) {
    const extension = getAudioFileExtension(audioMimeType);
    const questionId = responseData.questionId || existingResponse.data?.question_id || 'response';
    const filePath = `${session.project_id}/${sessionId}/${questionId}_${responseId}_${Date.now()}.${extension}`;
    const audioBytes = decodeBase64(responseData.audioBase64);
    const { error: uploadError } = await supabase.storage
      .from(AUDIO_BUCKET)
      .upload(filePath, audioBytes, {
        contentType: audioMimeType,
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Failed to upload response audio evidence: ${uploadError.message}`);
    }

    storedAudioPath = filePath;
  }

  const { data, error } = await supabase
    .from('interview_responses')
    .update({
      audio_url: storedAudioPath,
      audio_mime_type: storedAudioPath ? audioMimeType : null,
      audio_privacy_transform: responseData.audioPrivacyTransform ?? null,
      transcript_segments: responseData.transcriptSegments ?? null,
      audio_duration_ms: responseData.audioDuration ?? null,
      video_url: null,
      video_duration_ms: null,
      metadata: {
        ...(existingResponse.data?.metadata ?? {}),
        mediaAttachedAt: new Date().toISOString(),
        audioStoredPrivately: Boolean(storedAudioPath),
        videoStoredPrivately: false,
        audioPrivacyTransform: responseData.audioPrivacyTransform ?? null,
        ...(responseData.metadata ?? {}),
      },
    })
    .eq('id', responseId)
    .eq('session_id', sessionId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to attach response media: ${error.message}`);
  }

  return new Response(
    JSON.stringify({ success: true, response: data }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function prepareScreenRecordingUpload(
  sessionId: string,
  responseData: {
    mimeType?: string;
  } = {},
) {
  const session = await resolveSessionProject(sessionId);
  const mimeType = responseData.mimeType || 'video/webm';
  const extension = getScreenRecordingFileExtension(mimeType);
  const filePath = `${session.project_id}/${sessionId}/screen-recording-${Date.now()}.${extension}`;
  const { data, error } = await supabase.storage
    .from(SCREEN_RECORDINGS_BUCKET)
    .createSignedUploadUrl(filePath);

  if (error || !data) {
    throw new Error(`Failed to prepare screen recording upload: ${error?.message ?? 'missing signed upload data'}`);
  }

  const metadata = isRecord(session.metadata) ? session.metadata : {};
  await supabase
    .from('study_sessions')
    .update({
      metadata: {
        ...metadata,
        screenRecording: {
          ...(isRecord(metadata.screenRecording) ? metadata.screenRecording : {}),
          uploadPreparedAt: new Date().toISOString(),
          required: true,
          audioCaptured: false,
        },
      },
    })
    .eq('id', sessionId);

  return new Response(
    JSON.stringify({
      success: true,
      bucket: SCREEN_RECORDINGS_BUCKET,
      path: data.path ?? filePath,
      token: data.token,
      signedUrl: data.signedUrl,
      mimeType,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function finalizeScreenRecording(
  sessionId: string,
  responseData: {
    path?: string;
    mimeType?: string;
    durationMs?: number;
    sizeBytes?: number;
    metadata?: Record<string, unknown>;
  } = {},
) {
  if (!responseData.path) {
    throw new Error('Missing screen recording path');
  }

  const session = await resolveSessionProject(sessionId);
  const expectedPrefix = `${session.project_id}/${sessionId}/`;
  if (!responseData.path.startsWith(expectedPrefix)) {
    throw new Error('Screen recording path does not match session');
  }

  const metadata = isRecord(session.metadata) ? session.metadata : {};
  const screenRecordingMetadata = {
    ...(isRecord(metadata.screenRecording) ? metadata.screenRecording : {}),
    ...(responseData.metadata ?? {}),
    finalizedAt: new Date().toISOString(),
    required: true,
    audioCaptured: false,
    privateBucket: SCREEN_RECORDINGS_BUCKET,
    sizeBytes: typeof responseData.sizeBytes === 'number' ? responseData.sizeBytes : null,
  };

  const { data, error } = await supabase
    .from('study_sessions')
    .update({
      screen_recording_url: responseData.path,
      screen_recording_mime_type: responseData.mimeType || 'video/webm',
      screen_recording_duration_ms: typeof responseData.durationMs === 'number'
        ? Math.max(0, Math.round(responseData.durationMs))
        : null,
      screen_recording_metadata: screenRecordingMetadata,
      metadata: {
        ...metadata,
        screenRecording: screenRecordingMetadata,
      },
    })
    .eq('id', sessionId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to finalize screen recording: ${error.message}`);
  }

  return new Response(
    JSON.stringify({ success: true, session: data }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function getInterviewProgress(sessionId: string) {
  console.log('Getting interview progress for session:', sessionId);

  const { data: questions, error } = await supabase
    .from('interview_questions')
    .select(`
      *,
      interview_responses!left(id, is_complete, transcription)
    `)
    .eq('session_id', sessionId)
    .order('question_order', { ascending: true });

  if (error) {
    throw new Error(`Failed to get progress: ${error.message}`);
  }

  const totalQuestions = questions?.length || 0;
  const completedQuestions = questions?.filter((question) =>
    question.interview_responses &&
    question.interview_responses.length > 0 &&
    question.interview_responses.some((response: { is_complete?: boolean | null }) => response.is_complete)
  ).length || 0;

  return new Response(
    JSON.stringify({
      questions,
      progress: {
        completed: completedQuestions,
        total: totalQuestions,
        isComplete: totalQuestions > 0 && completedQuestions === totalQuestions,
        percentage: totalQuestions > 0 ? (completedQuestions / totalQuestions) * 100 : 0,
      },
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
