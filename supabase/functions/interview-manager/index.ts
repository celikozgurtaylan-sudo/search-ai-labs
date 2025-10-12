import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, sessionId, projectId, questionData, responseData } = await req.json();

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
      
      default:
        throw new Error('Invalid action');
    }
  } catch (error) {
    console.error('Interview manager error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

async function initializeQuestions(projectId: string, sessionId: string, discussionGuide: any) {
  console.log('Initializing questions for session:', sessionId);
  
  // Parse discussion guide and create question records
  const questions: any[] = [];
  let order = 1;
  
  if (discussionGuide.sections) {
    for (const section of discussionGuide.sections) {
      if (section.questions) {
        for (const question of section.questions) {
          questions.push({
            project_id: projectId,
            session_id: sessionId,
            question_text: question,
            question_order: order++,
            section: section.title,
            question_type: 'open_ended'
          });
        }
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
  
  // Get the next unanswered question
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

  // Find first question without a complete response
  const nextQuestion = questions?.find(q => 
    !q.interview_responses || 
    q.interview_responses.length === 0 || 
    !q.interview_responses.some((r: any) => r.is_complete)
  );

  const totalQuestions = questions?.length || 0;
  const completedQuestions = questions?.filter(q => 
    q.interview_responses && 
    q.interview_responses.length > 0 && 
    q.interview_responses.some((r: any) => r.is_complete)
  ).length || 0;

  return new Response(
    JSON.stringify({ 
      nextQuestion,
      progress: {
        completed: completedQuestions,
        total: totalQuestions,
        isComplete: completedQuestions === totalQuestions
      }
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function saveResponse(sessionId: string, responseData: any) {
  console.log('Saving response for session:', sessionId);
  
  const { data, error } = await supabase
    .from('interview_responses')
    .insert({
      session_id: sessionId,
      question_id: responseData.questionId,
      participant_id: responseData.participantId,
      transcription: responseData.transcription,
      response_text: responseData.responseText,
      video_url: responseData.videoUrl,
      video_duration_ms: responseData.videoDuration,
      audio_duration_ms: responseData.audioDuration,
      confidence_score: responseData.confidenceScore,
      is_complete: responseData.isComplete || false,
      metadata: responseData.metadata || {}
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to save response: ${error.message}`);
  }

  return new Response(
    JSON.stringify({ success: true, response: data }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function completeQuestion(sessionId: string, questionId: string) {
  console.log('Completing question:', questionId);
  
  const { data, error } = await supabase
    .from('interview_responses')
    .update({ is_complete: true })
    .eq('session_id', sessionId)
    .eq('question_id', questionId)
    .select();

  if (error) {
    throw new Error(`Failed to complete question: ${error.message}`);
  }

  return new Response(
    JSON.stringify({ success: true, data }),
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
  const completedQuestions = questions?.filter(q => 
    q.interview_responses && 
    q.interview_responses.length > 0 && 
    q.interview_responses.some((r: any) => r.is_complete)
  ).length || 0;

  return new Response(
    JSON.stringify({ 
      questions,
      progress: {
        completed: completedQuestions,
        total: totalQuestions,
        isComplete: completedQuestions === totalQuestions,
        percentage: totalQuestions > 0 ? (completedQuestions / totalQuestions) * 100 : 0
      }
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}