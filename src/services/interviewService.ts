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

export const interviewService = {
  async initializeQuestions(projectId: string, sessionId: string, discussionGuide: any) {
    // Design mode: Create mock questions in memory
    if (isDesignMode(projectId) || isDesignMode(sessionId)) {
      console.log('🎨 Design mode: Creating mock questions locally', discussionGuide);
      mockQuestions = createMockQuestions(discussionGuide, projectId, sessionId);
      mockCurrentQuestionIndex = 0;
      return { success: true, count: mockQuestions.length };
    }
    
    // Production mode: Use database
    const { data, error } = await supabase.functions.invoke('interview-manager', {
      body: {
        action: 'initialize_questions',
        projectId,
        sessionId,
        questionData: discussionGuide
      }
    })

    if (error) {
      throw new Error(`Failed to initialize questions: ${error.message}`)
    }

    return data
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
    
    // Production mode: Use database
    const { data, error } = await supabase.functions.invoke('interview-manager', {
      body: {
        action: 'get_next_question',
        sessionId
      }
    })

    if (error) {
      throw new Error(`Failed to get next question: ${error.message}`)
    }

    return data
  },

  async saveResponse(sessionId: string, responseData: {
    questionId: string
    participantId?: string
    transcription?: string
    responseText?: string
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
    
    // Production mode: Use database
    const { data, error } = await supabase.functions.invoke('interview-manager', {
      body: {
        action: 'save_response',
        sessionId,
        responseData
      }
    })

    if (error) {
      throw new Error(`Failed to save response: ${error.message}`)
    }

    return data
  },

  async completeQuestion(sessionId: string, questionId: string) {
    // Design mode: Just increment index
    if (isDesignMode(sessionId)) {
      console.log('🎨 Design mode: Completing mock question', questionId);
      mockCurrentQuestionIndex++;
      return { success: true };
    }
    
    // Production mode: Use database
    const { data, error } = await supabase.functions.invoke('interview-manager', {
      body: {
        action: 'complete_question',
        sessionId,
        responseData: { questionId }
      }
    })

    if (error) {
      throw new Error(`Failed to complete question: ${error.message}`)
    }

    return data
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
    
    // Production mode: Use database
    const { data, error } = await supabase.functions.invoke('interview-manager', {
      body: {
        action: 'get_interview_progress',
        sessionId
      }
    })

    if (error) {
      throw new Error(`Failed to get interview progress: ${error.message}`)
    }

    return data
  },

  async analyzeInterview(sessionId: string, projectId: string) {
    // Design mode: Just log to console
    if (isDesignMode(sessionId) || isDesignMode(projectId)) {
      console.log('🎨 Design mode: Skipping interview analysis');
      return { success: true, message: 'Design mode - analysis skipped' };
    }
    
    // Production mode: Use database
    const { data, error } = await supabase.functions.invoke('interview-analysis', {
      body: {
        sessionId,
        projectId
      }
    })

    if (error) {
      throw new Error(`Failed to analyze interview: ${error.message}`)
    }

    return data
  }
}
