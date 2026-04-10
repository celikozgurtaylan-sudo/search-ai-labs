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
  metadata?: any
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
  video_url?: string | null
  video_duration_ms?: number | null
}

export interface InterviewProgress {
  completed: number
  total: number
  isComplete: boolean
  percentage: number
}

interface SubmitInterviewResponseResult {
  success: boolean
  response: InterviewResponse
  nextQuestion: InterviewQuestion | null
  progress: InterviewProgress
}

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

const getMockInterviewState = () => {
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
};

const advanceMockInterview = (): SubmitInterviewResponseResult => {
  mockCurrentQuestionIndex += 1;
  const state = getMockInterviewState();

  return {
    success: true,
    response: {
      id: `mock-response-${mockCurrentQuestionIndex}`,
      session_id: 'mock-session-id',
      question_id: `mock-question-${Math.max(0, mockCurrentQuestionIndex - 1)}`,
      is_complete: true,
      analyzed: false,
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    ...state
  };
};

let _sessionToken: string | null = null;

export const setInterviewSessionToken = (token: string | null) => {
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
    if (isDesignMode(projectId) || isDesignMode(sessionId)) {
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
    if (isDesignMode(sessionId)) {
      return getMockInterviewState();
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
    if (isDesignMode(sessionId)) {
      return { success: true };
    }

    return await invokeWithSessionToken('interview-manager', {
      action: 'save_response',
      sessionId,
      responseData
    });
  },

  async submitResponse(sessionId: string, responseData: {
    questionId: string
    participantId?: string
    transcription?: string
    responseText?: string
    audioDuration?: number
    confidenceScore?: number
    metadata?: any
  }): Promise<SubmitInterviewResponseResult> {
    if (isDesignMode(sessionId)) {
      return advanceMockInterview();
    }

    return await invokeWithSessionToken('interview-manager', {
      action: 'submit_response',
      sessionId,
      responseData
    });
  },

  async skipQuestion(sessionId: string, questionId: string, metadata?: any): Promise<SubmitInterviewResponseResult> {
    if (isDesignMode(sessionId)) {
      return advanceMockInterview();
    }

    return await invokeWithSessionToken('interview-manager', {
      action: 'skip_question',
      sessionId,
      responseData: {
        questionId,
        metadata,
      }
    });
  },

  async attachResponseMedia(sessionId: string, responseId: string, responseData: {
    videoUrl?: string
    videoDuration?: number
    audioDuration?: number
    metadata?: any
    videoBase64?: string
    videoMimeType?: string
    questionId?: string
  }) {
    if (isDesignMode(sessionId)) {
      return { success: true };
    }

    return await invokeWithSessionToken('interview-manager', {
      action: 'attach_response_media',
      sessionId,
      responseData: {
        responseId,
        ...responseData,
      }
    });
  },

  async completeQuestion(sessionId: string, questionId: string) {
    if (isDesignMode(sessionId)) {
      return { success: true };
    }

    return await invokeWithSessionToken('interview-manager', {
      action: 'complete_question',
      sessionId,
      responseData: { questionId }
    });
  },

  async getInterviewProgress(sessionId: string): Promise<{ questions: InterviewQuestion[], progress: InterviewProgress }> {
    if (isDesignMode(sessionId)) {
      return { questions: mockQuestions, progress: getMockInterviewState().progress };
    }

    return await invokeWithSessionToken('interview-manager', {
      action: 'get_interview_progress',
      sessionId
    });
  },

  async analyzeInterview(sessionId: string, projectId: string) {
    if (isDesignMode(sessionId) || isDesignMode(projectId)) {
      return { success: true, message: 'Design mode - analysis skipped' };
    }

    return await invokeWithSessionToken('interview-analysis', {
      sessionId,
      projectId
    });
  }
}
