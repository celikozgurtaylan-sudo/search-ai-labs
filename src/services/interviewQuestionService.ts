import { supabase } from '@/integrations/supabase/client';

export interface InterviewQuestionRecord {
  id: string;
  project_id: string;
  session_id: string | null;
  question_text: string;
  question_order: number;
  section: string | null;
  question_type: string | null;
  is_follow_up: boolean | null;
  parent_question_id: string | null;
  metadata: any;
  created_at: string;
  updated_at: string;
}

export const interviewQuestionService = {
  async getByProject(projectId: string): Promise<InterviewQuestionRecord[]> {
    const { data, error } = await supabase
      .from('interview_questions')
      .select('*')
      .eq('project_id', projectId)
      .order('question_order', { ascending: true });

    if (error) throw new Error(`Failed to fetch questions: ${error.message}`);
    return (data || []) as InterviewQuestionRecord[];
  },

  async getBySession(sessionId: string): Promise<InterviewQuestionRecord[]> {
    const { data, error } = await supabase
      .from('interview_questions')
      .select('*')
      .eq('session_id', sessionId)
      .order('question_order', { ascending: true });

    if (error) throw new Error(`Failed to fetch questions: ${error.message}`);
    return (data || []) as InterviewQuestionRecord[];
  },

  async create(question: {
    project_id: string;
    session_id?: string;
    question_text: string;
    question_order?: number;
    section?: string;
    question_type?: string;
    is_follow_up?: boolean;
    parent_question_id?: string;
    metadata?: any;
  }): Promise<InterviewQuestionRecord> {
    const { data, error } = await supabase
      .from('interview_questions')
      .insert(question)
      .select()
      .single();

    if (error) throw new Error(`Failed to create question: ${error.message}`);
    return data as InterviewQuestionRecord;
  },

  async createBatch(questions: {
    project_id: string;
    session_id?: string;
    question_text: string;
    question_order?: number;
    section?: string;
    question_type?: string;
    is_follow_up?: boolean;
    parent_question_id?: string;
    metadata?: any;
  }[]): Promise<InterviewQuestionRecord[]> {
    const { data, error } = await supabase
      .from('interview_questions')
      .insert(questions)
      .select();

    if (error) throw new Error(`Failed to create questions: ${error.message}`);
    return (data || []) as InterviewQuestionRecord[];
  },

  async update(id: string, updates: {
    question_text?: string;
    question_order?: number;
    section?: string;
    question_type?: string;
    is_follow_up?: boolean;
    metadata?: any;
  }): Promise<InterviewQuestionRecord> {
    const { data, error } = await supabase
      .from('interview_questions')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update question: ${error.message}`);
    return data as InterviewQuestionRecord;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('interview_questions')
      .delete()
      .eq('id', id);

    if (error) throw new Error(`Failed to delete question: ${error.message}`);
  },

  async deleteBySession(sessionId: string): Promise<void> {
    const { error } = await supabase
      .from('interview_questions')
      .delete()
      .eq('session_id', sessionId);

    if (error) throw new Error(`Failed to delete questions: ${error.message}`);
  },
};
