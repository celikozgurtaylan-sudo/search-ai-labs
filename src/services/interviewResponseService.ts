import { supabase } from '@/integrations/supabase/client';

export interface InterviewResponseRecord {
  id: string;
  session_id: string;
  question_id: string | null;
  participant_id: string | null;
  response_text: string | null;
  transcription: string | null;
  audio_duration_ms: number | null;
  video_url: string | null;
  video_duration_ms: number | null;
  confidence_score: number | null;
  sentiment_score: number | null;
  is_complete: boolean | null;
  metadata: any;
  created_at: string;
  updated_at: string;
}

export const interviewResponseService = {
  async getBySession(sessionId: string): Promise<InterviewResponseRecord[]> {
    const { data, error } = await supabase
      .from('interview_responses')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) throw new Error(`Failed to fetch responses: ${error.message}`);
    return (data || []) as InterviewResponseRecord[];
  },

  async getByQuestion(questionId: string): Promise<InterviewResponseRecord[]> {
    const { data, error } = await supabase
      .from('interview_responses')
      .select('*')
      .eq('question_id', questionId)
      .order('created_at', { ascending: true });

    if (error) throw new Error(`Failed to fetch responses: ${error.message}`);
    return (data || []) as InterviewResponseRecord[];
  },

  async create(response: {
    session_id: string;
    question_id?: string;
    participant_id?: string;
    response_text?: string;
    transcription?: string;
    audio_duration_ms?: number;
    video_url?: string;
    video_duration_ms?: number;
    confidence_score?: number;
    sentiment_score?: number;
    is_complete?: boolean;
    metadata?: any;
  }): Promise<InterviewResponseRecord> {
    const { data, error } = await supabase
      .from('interview_responses')
      .insert(response)
      .select()
      .single();

    if (error) throw new Error(`Failed to create response: ${error.message}`);
    return data as InterviewResponseRecord;
  },

  async update(id: string, updates: {
    response_text?: string;
    transcription?: string;
    audio_duration_ms?: number;
    video_url?: string;
    video_duration_ms?: number;
    confidence_score?: number;
    sentiment_score?: number;
    is_complete?: boolean;
    metadata?: any;
  }): Promise<InterviewResponseRecord> {
    const { data, error } = await supabase
      .from('interview_responses')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update response: ${error.message}`);
    return data as InterviewResponseRecord;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('interview_responses')
      .delete()
      .eq('id', id);

    if (error) throw new Error(`Failed to delete response: ${error.message}`);
  },

  async deleteBySession(sessionId: string): Promise<void> {
    const { error } = await supabase
      .from('interview_responses')
      .delete()
      .eq('session_id', sessionId);

    if (error) throw new Error(`Failed to delete responses: ${error.message}`);
  },
};
