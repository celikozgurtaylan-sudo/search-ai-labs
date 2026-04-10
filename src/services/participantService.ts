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

export type ParticipantInvitationAccessState =
  | 'active'
  | 'paused'
  | 'invalid_or_expired'
  | 'declined_or_completed';

export interface ParticipantInvitationAccessResult {
  access_state: ParticipantInvitationAccessState;
  message: string | null;
  participant_data: StudyParticipant | null;
  project_link_access: 'active' | 'paused';
}

export type SessionAccessState = 'active' | 'paused' | 'invalid_or_expired';

export interface SessionAccessResult {
  access_state: SessionAccessState;
  message: string | null;
  session_data: StudySession | null;
  participant_data: StudyParticipant | null;
  project_data: any | null;
}

const buildServiceError = (message: string, code?: string) =>
  Object.assign(new Error(message), code ? { code } : {});

export const participantService = {
  async createParticipant(participant: Omit<StudyParticipant, 'id' | 'created_at' | 'updated_at'>): Promise<StudyParticipant> {
    const { data, error } = await supabase
      .from('study_participants')
      .insert(participant)
      .select()
      .single();

    if (error) throw new Error(`Failed to create participant: ${error.message}`);
    return data as StudyParticipant;
  },

  async getProjectParticipants(projectId: string): Promise<StudyParticipant[]> {
    const { data, error } = await supabase
      .from('study_participants')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to fetch participants: ${error.message}`);
    return (data || []) as StudyParticipant[];
  },

  async updateParticipantStatus(id: string, status: StudyParticipant['status']): Promise<StudyParticipant> {
    const updates: any = { status };
    if (status === 'joined') updates.joined_at = new Date().toISOString();
    else if (status === 'completed') updates.completed_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('study_participants')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update participant: ${error.message}`);
    return data as StudyParticipant;
  },

  async deleteParticipant(id: string): Promise<void> {
    const { error } = await supabase
      .from('study_participants')
      .delete()
      .eq('id', id);

    if (error) throw new Error(`Failed to delete participant: ${error.message}`);
  },

  async getParticipantByToken(token: string): Promise<StudyParticipant | null> {
    const { data, error } = await supabase
      .rpc('validate_participant_token', { token_input: token })
      .maybeSingle();

    if (error) {
      console.error('Error fetching participant by token:', error);
      return null;
    }

    return data as StudyParticipant | null;
  },

  async getParticipantInvitationAccess(token: string): Promise<ParticipantInvitationAccessResult | null> {
    const { data, error } = await supabase
      .rpc('resolve_participant_invitation_access', { token_input: token })
      .maybeSingle();

    if (error) {
      console.error('Error resolving participant invitation access:', error);
      return null;
    }

    return data as unknown as ParticipantInvitationAccessResult | null;
  },

  generateInvitationToken(): string {
    return `user-study-${crypto.randomUUID()}`;
  },

  generateSessionToken(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const token = btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, '');
    return `session_${token}`;
  },

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

    const result = data as { success?: boolean; message?: string; participant_data?: unknown } | null;
    if (!result || !result.success) {
      throw buildServiceError(result?.message || 'Failed to update participant status');
    }

    return result.participant_data as StudyParticipant;
  },

  async createSession(session: Omit<StudySession, 'id' | 'created_at' | 'updated_at'>): Promise<StudySession> {
    const { data, error } = await supabase
      .from('study_sessions')
      .insert(session)
      .select()
      .single();

    if (error) throw new Error(`Failed to create session: ${error.message}`);
    return data as StudySession;
  },

  async createSessionForParticipant(projectId: string, participantId: string, invitationToken: string): Promise<StudySession> {
    const sessionToken = this.generateSessionToken();

    const { data, error } = await supabase
      .rpc('create_session_for_participant', {
        token_input: invitationToken,
        session_token_input: sessionToken
      })
      .maybeSingle();

    if (error) {
      console.error('Error creating session for participant:', error);
      throw new Error(`Failed to create session: ${error.message}`);
    }

    const result = data as { success?: boolean; message?: string; code?: string; session_data?: unknown } | null;
    if (!result || !result.success) {
      throw buildServiceError(result?.message || 'Failed to create session', result?.code);
    }

    return result.session_data as StudySession;
  },

  async getSessionAccessByToken(token: string): Promise<SessionAccessResult | null> {
    const { data, error } = await supabase
      .rpc('resolve_session_access', { session_token_input: token })
      .maybeSingle();

    if (error) {
      console.error('Error resolving session access:', error);
      return null;
    }

    return data as unknown as SessionAccessResult | null;
  },

  async getSessionByToken(token: string): Promise<StudySession | null> {
    const { data, error } = await supabase
      .from('study_sessions')
      .select('*')
      .eq('session_token', token)
      .maybeSingle();

    if (error) {
      console.error('Error fetching session by token:', error);
      return null;
    }

    return data as StudySession | null;
  },

  async getProjectSessions(projectId: string): Promise<StudySession[]> {
    const { data, error } = await supabase
      .from('study_sessions')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to fetch sessions: ${error.message}`);
    return (data || []) as StudySession[];
  },

  async updateSession(id: string, updates: Partial<Omit<StudySession, 'id' | 'created_at' | 'updated_at'>>): Promise<StudySession> {
    const { data, error } = await supabase
      .from('study_sessions')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update session: ${error.message}`);
    return data as StudySession;
  },

  async deleteSession(id: string): Promise<void> {
    const { error } = await supabase
      .from('study_sessions')
      .delete()
      .eq('id', id);

    if (error) throw new Error(`Failed to delete session: ${error.message}`);
  },

  async getSession(id: string): Promise<StudySession | null> {
    const { data, error } = await supabase
      .from('study_sessions')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(`Failed to fetch session: ${error.message}`);
    return data as StudySession | null;
  }
};
