import { supabase } from '@/integrations/supabase/client';

export interface StudyParticipant {
  id?: string;
  project_id: string;
  email: string;
  name?: string;
  status: 'invited' | 'joined' | 'completed' | 'declined';
  invited_at?: string;
  joined_at?: string;
  completed_at?: string;
  invitation_token: string;
  token_expires_at?: string;
  metadata?: any;
  created_at?: string;
  updated_at?: string;
}

export interface StudySession {
  id?: string;
  project_id: string;
  participant_id?: string;
  session_token: string;
  status: 'scheduled' | 'active' | 'completed' | 'cancelled';
  scheduled_at?: string;
  started_at?: string;
  ended_at?: string;
  notes?: string;
  metadata?: any;
  created_at?: string;
  updated_at?: string;
}

export const participantService = {
  async createParticipant(participant: Omit<StudyParticipant, 'id' | 'created_at' | 'updated_at'>): Promise<StudyParticipant> {
    const { data, error } = await supabase
      .from('study_participants')
      .insert(participant)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create participant: ${error.message}`);
    }

    return data as StudyParticipant;
  },

  async getProjectParticipants(projectId: string): Promise<StudyParticipant[]> {
    const { data, error } = await supabase
      .from('study_participants')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch participants: ${error.message}`);
    }

    return (data || []) as StudyParticipant[];
  },

  async updateParticipantStatus(id: string, status: StudyParticipant['status']): Promise<StudyParticipant> {
    const updates: any = { status };
    
    if (status === 'joined') {
      updates.joined_at = new Date().toISOString();
    } else if (status === 'completed') {
      updates.completed_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('study_participants')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update participant: ${error.message}`);
    }

    return data as StudyParticipant;
  },

  async deleteParticipant(id: string): Promise<void> {
    const { error } = await supabase
      .from('study_participants')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete participant: ${error.message}`);
    }
  },

  async getParticipantByToken(token: string): Promise<StudyParticipant | null> {
    console.log('Looking for participant with token:', token);
    console.log('Current time:', new Date().toISOString());
    
    // Use the secure function instead of direct table access
    const { data, error } = await supabase
      .rpc('validate_participant_token', { token_input: token })
      .maybeSingle();

    if (error) {
      console.error('Error fetching participant by token:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      return null;
    }

    console.log('Found participant:', data);
    return data as StudyParticipant | null;
  },

  generateInvitationToken(): string {
    const prefix = 'user-study';
    const randomPart = Math.random().toString(36).substring(2, 10); // shorter, more readable
    return `${prefix}-${randomPart}`;
  },

  generateSessionToken(): string {
    return `session_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
  },

  // Token-based status update using RPC function
  async updateParticipantStatusByToken(token: string, status: StudyParticipant['status']): Promise<StudyParticipant> {
    const { data, error } = await supabase
      .rpc('update_participant_status_by_token', { 
        token_input: token, 
        new_status: status 
      })
      .maybeSingle();

    if (error) {
      console.error('Error updating participant status by token:', error);
      throw new Error(`Failed to update participant status: ${error.message}`);
    }

    if (!data || !data.success) {
      console.error('RPC function returned error:', data?.message || 'Unknown error');
      throw new Error(data?.message || 'Failed to update participant status');
    }

    return data.participant_data as any as StudyParticipant;
  },

  // Session management
  async createSession(session: Omit<StudySession, 'id' | 'created_at' | 'updated_at'>): Promise<StudySession> {
    const { data, error } = await supabase
      .from('study_sessions')
      .insert(session)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create session: ${error.message}`);
    }

    return data as StudySession;
  },

  async getProjectSessions(projectId: string): Promise<StudySession[]> {
    const { data, error } = await supabase
      .from('study_sessions')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch sessions: ${error.message}`);
    }

    return (data || []) as StudySession[];
  }
};