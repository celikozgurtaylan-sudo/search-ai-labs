import { supabase } from '@/integrations/supabase/client'

export interface InterviewQuestion {
  id: string
  project_id: string
  session_id: string
  question_text: string
  question_order: number
  section: string
  question_type: string
  is_follow_up: boolean
  parent_question_id?: string
  created_at: string
  updated_at: string
}

export interface InterviewResponse {
  id: string
  session_id: string
  question_id: string
  participant_id?: string
  response_text?: string
  transcription?: string
  audio_duration_ms?: number
  confidence_score?: number
  is_complete: boolean
  analyzed: boolean
  metadata: any
  created_at: string
  updated_at: string
}

export interface InterviewProgress {
  completed: number
  total: number
  isComplete: boolean
  percentage: number
}

// Mock state for design mode (in-memory, not database)
let mockQuestions: InterviewQuestion[] = [];
let mockCurrentQuestionIndex = 0;

const isDesignMode = (id: string) => {
  return id.includes('mock') || id.includes('design') || id.includes('test');
};

const createMockQuestions = (discussionGuide: any, projectId: string, sessionId: string): InterviewQuestion[] => {
  const questions: InterviewQuestion[] = [];
  let order = 0;
  
  discussionGuide.sections.forEach((section: any) => {
    section.questions.forEach((questionText: string) => {
      questions.push({
        id: `mock-question-${order}`,
        project_id: projectId,
        session_id: sessionId,
        question_text: questionText,
        question_order: order,
        section: section.title,
        question_type: 'open_ended',
        is_follow_up: false,
        parent_question_id: undefined,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      order++;
    });
  });
  
  return questions;
};

// Store session token for authenticated edge function calls
let _sessionToken: string | null = null;

export const setInterviewSessionToken = (token: string) => {
  _sessionToken = token;
};

export const getInterviewSessionToken = () => _sessionToken;

const invokeWithSessionToken = async (functionName: string, body: any) => {
  const headers: Record<string, string> = {};
  if (_sessionToken) {
    headers['x-session-token'] = _sessionToken;
  }
  
  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
    headers,
  });

  if (error) {
    throw new Error(`Failed to invoke ${functionName}: ${error.message}`);
  }

  return data;
};

export const interviewService = {
  async initializeQuestions(projectId: string, sessionId: string, discussionGuide: any) {
    // Design mode: Create mock questions in memory
    if (isDesignMode(projectId) || isDesignMode(sessionId)) {
      console.log('🎨 Design mode: Creating mock questions locally', discussionGuide);
      mockQuestions = createMockQuestions(discussionGuide, projectId, sessionId);
      mockCurrentQuestionIndex = 0;
      return { success: true, count: mockQuestions.length };
    }
    
    return await invokeWithSessionToken('interview-manager', {
      action: 'initialize_questions',
      projectId,
      sessionId,
      questionData: discussionGuide
    });
  },

  async getNextQuestion(sessionId: string) {
    // Design mode: Return next mock question
    if (isDesignMode(sessionId)) {
      console.log('🎨 Design mode: Getting mock question', mockCurrentQuestionIndex, '/', mockQuestions.length);
      
      const nextQuestion = mockQuestions[mockCurrentQuestionIndex] || null;
      const progress: InterviewProgress = {
        completed: mockCurrentQuestionIndex,
        total: mockQuestions.length,
        isComplete: mockCurrentQuestionIndex >= mockQuestions.length,
        percentage: mockQuestions.length > 0 
          ? Math.round((mockCurrentQuestionIndex / mockQuestions.length) * 100)
          : 0
      };
      
      return { nextQuestion, progress };
    }
    
    return await invokeWithSessionToken('interview-manager', {
      action: 'get_next_question',
      sessionId
    });
  },

  async saveResponse(sessionId: string, responseData: {
    questionId: string
    participantId?: string
    transcription?: string
    responseText?: string
    videoUrl?: string
    videoDuration?: number
    audioDuration?: number
    confidenceScore?: number
    isComplete?: boolean
    metadata?: any
  }) {
    // Design mode: Just log to console
    if (isDesignMode(sessionId)) {
      console.log('🎨 Design mode: Saving mock response', responseData);
      return { success: true };
    }
    
    return await invokeWithSessionToken('interview-manager', {
      action: 'save_response',
      sessionId,
      responseData
    });
  },

  async completeQuestion(sessionId: string, questionId: string) {
    // Design mode: Just increment index
    if (isDesignMode(sessionId)) {
      console.log('🎨 Design mode: Completing mock question', questionId);
      mockCurrentQuestionIndex++;
      return { success: true };
    }
    
    return await invokeWithSessionToken('interview-manager', {
      action: 'complete_question',
      sessionId,
      responseData: { questionId }
    });
  },

  async getInterviewProgress(sessionId: string): Promise<{ questions: InterviewQuestion[], progress: InterviewProgress }> {
    // Design mode: Return mock progress
    if (isDesignMode(sessionId)) {
      console.log('🎨 Design mode: Getting mock progress', mockCurrentQuestionIndex, '/', mockQuestions.length);
      
      const progress: InterviewProgress = {
        completed: mockCurrentQuestionIndex,
        total: mockQuestions.length,
        isComplete: mockCurrentQuestionIndex >= mockQuestions.length,
        percentage: mockQuestions.length > 0 
          ? Math.round((mockCurrentQuestionIndex / mockQuestions.length) * 100)
          : 0
      };
      
      return { questions: mockQuestions, progress };
    }
    
    return await invokeWithSessionToken('interview-manager', {
      action: 'get_interview_progress',
      sessionId
    });
  },

  async analyzeInterview(sessionId: string, projectId: string) {
    // Design mode: Just log to console
    if (isDesignMode(sessionId) || isDesignMode(projectId)) {
      console.log('🎨 Design mode: Skipping interview analysis');
      return { success: true, message: 'Design mode - analysis skipped' };
    }
    
    return await invokeWithSessionToken('interview-analysis', {
      sessionId,
      projectId
    });
  }
}
