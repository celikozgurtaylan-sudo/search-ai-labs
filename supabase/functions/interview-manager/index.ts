import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  generateAndPersistProjectReport,
  setProjectReportStatus,
} from "../_shared/project-report.ts";

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
  videoDuration?: number;
  audioDuration?: number;
  confidenceScore?: number;
  isComplete?: boolean;
  metadata?: Record<string, unknown>;
};

async function validateSessionToken(sessionId: string, sessionToken: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('study_sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('session_token', sessionToken)
    .maybeSingle();

  return !error && Boolean(data);
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

async function saveOrUpdateResponse(sessionId: string, responseData: ResponsePayload) {
  const existingResponse = await findLatestResponse(sessionId, responseData.questionId);
  const payload = {
    session_id: sessionId,
    question_id: responseData.questionId,
    participant_id: responseData.participantId ?? existingResponse?.participant_id ?? null,
    transcription: responseData.transcription ?? existingResponse?.transcription ?? null,
    response_text: responseData.responseText ?? existingResponse?.response_text ?? null,
    video_url: responseData.videoUrl ?? existingResponse?.video_url ?? null,
    video_duration_ms: responseData.videoDuration ?? existingResponse?.video_duration_ms ?? null,
    audio_duration_ms: responseData.audioDuration ?? existingResponse?.audio_duration_ms ?? null,
    confidence_score: responseData.confidenceScore ?? existingResponse?.confidence_score ?? null,
    is_complete: responseData.isComplete ?? existingResponse?.is_complete ?? false,
    metadata: {
      ...(existingResponse?.metadata ?? {}),
      ...(responseData.metadata ?? {}),
    },
  };

  if (existingResponse?.id) {
    const { data, error } = await supabase
      .from('interview_responses')
      .update(payload)
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
    .insert(payload)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to save response: ${error.message}`);
  }

  return data;
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

async function initializeQuestions(projectId: string, sessionId: string, discussionGuide: any) {
  console.log('Initializing questions for session:', sessionId);

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

  if (discussionGuide?.sections) {
    for (const section of discussionGuide.sections) {
      if (!section?.questions) continue;

      for (const question of section.questions) {
        questions.push({
          project_id: projectId,
          session_id: sessionId,
          question_text: question,
          question_order: order++,
          section: section.title,
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
  const response = await saveOrUpdateResponse(sessionId, {
    questionId,
    isComplete: true,
    metadata: {
      completedAt: new Date().toISOString(),
    },
  });
  const state = await buildInterviewState(sessionId);
  await finalizeCompletedSession(sessionId, state);

  return new Response(
    JSON.stringify({ success: true, response, ...state }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function submitResponse(sessionId: string, responseData: ResponsePayload) {
  console.log('Submitting response for session:', sessionId, 'question:', responseData.questionId);
  const response = await saveOrUpdateResponse(sessionId, {
    ...responseData,
    isComplete: true,
    metadata: {
      submittedAt: new Date().toISOString(),
      ...(responseData.metadata ?? {}),
    },
  });
  const state = await buildInterviewState(sessionId);
  await finalizeCompletedSession(sessionId, state);

  return new Response(
    JSON.stringify({ success: true, response, ...state }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function skipQuestion(sessionId: string, questionId: string, metadata: Record<string, unknown>) {
  console.log('Skipping question:', questionId);
  const response = await saveOrUpdateResponse(sessionId, {
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
  const state = await buildInterviewState(sessionId);
  await finalizeCompletedSession(sessionId, state);

  return new Response(
    JSON.stringify({ success: true, response, ...state }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function attachResponseMedia(sessionId: string, responseId: string, responseData: ResponsePayload & { responseId?: string }) {
  if (!responseId) {
    throw new Error('Missing responseId');
  }

  const existingResponse = await supabase
    .from('interview_responses')
    .select('metadata')
    .eq('id', responseId)
    .eq('session_id', sessionId)
    .maybeSingle();

  if (existingResponse.error) {
    throw new Error(`Failed to load response metadata: ${existingResponse.error.message}`);
  }

  const { data, error } = await supabase
    .from('interview_responses')
    .update({
      video_url: responseData.videoUrl ?? null,
      video_duration_ms: responseData.videoDuration ?? null,
      audio_duration_ms: responseData.audioDuration ?? null,
      metadata: {
        ...(existingResponse.data?.metadata ?? {}),
        mediaAttachedAt: new Date().toISOString(),
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
