import { supabase } from '@/integrations/supabase/client';

export interface Project {
  id?: string;
  user_id?: string;
  title: string;
  description: string;
  analysis?: any;
  created_at?: string;
  updated_at?: string;
  archived?: boolean;
  archived_at?: string;
}

export const projectService = {
  async createProject(project: Omit<Project, 'id' | 'user_id' | 'created_at' | 'updated_at'>): Promise<Project> {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User must be authenticated to create projects');
    }

    const { data, error } = await supabase
      .from('projects')
      .insert({
        user_id: user.id,
        title: project.title,
        description: project.description,
        analysis: project.analysis
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create project: ${error.message}`);
    }

    return data;
  },

  async getUserProjects(includeArchived: boolean = false): Promise<Project[]> {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User must be authenticated to view projects');
    }

    let query = supabase
      .from('projects')
      .select('*')
      .eq('user_id', user.id);

    if (!includeArchived) {
      query = query.eq('archived', false);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch projects: ${error.message}`);
    }

    return data || [];
  },

  async getArchivedProjects(): Promise<Project[]> {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User must be authenticated to view projects');
    }

    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', user.id)
      .eq('archived', true)
      .order('archived_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch archived projects: ${error.message}`);
    }

    return data || [];
  },

  async getProject(id: string): Promise<Project | null> {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User must be authenticated to view project');
    }

    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch project: ${error.message}`);
    }

    return data;
  },

  async updateProject(id: string, updates: Partial<Omit<Project, 'id' | 'user_id' | 'created_at' | 'updated_at'>>): Promise<Project> {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User must be authenticated to update projects');
    }

    const { data, error } = await supabase
      .from('projects')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update project: ${error.message}`);
    }

    return data;
  },

  async archiveProject(id: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User must be authenticated to archive projects');
    }

    const { error } = await supabase
      .from('projects')
      .update({ 
        archived: true, 
        archived_at: new Date().toISOString() 
      })
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      throw new Error(`Failed to archive project: ${error.message}`);
    }
  },

  async unarchiveProject(id: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User must be authenticated to unarchive projects');
    }

    const { error } = await supabase
      .from('projects')
      .update({ 
        archived: false, 
        archived_at: null 
      })
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      throw new Error(`Failed to unarchive project: ${error.message}`);
    }
  },

  async deleteProject(id: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User must be authenticated to delete projects');
    }

    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      throw new Error(`Failed to delete project: ${error.message}`);
    }
  },

  async getProjectBySessionToken(sessionToken: string): Promise<Project | null> {
    const { data, error } = await supabase
      .rpc('get_project_for_session', { session_token_input: sessionToken })
      .maybeSingle();

    if (error) {
      console.error('Error fetching project by session token:', error);
      return null;
    }

    return data as Project | null;
  }
};