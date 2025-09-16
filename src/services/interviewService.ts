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

export const interviewService = {
  async initializeQuestions(projectId: string, sessionId: string, discussionGuide: any) {
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