export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      interview_questions: {
        Row: {
          created_at: string
          id: string
          is_follow_up: boolean | null
          metadata: Json | null
          parent_question_id: string | null
          project_id: string
          question_order: number
          question_text: string
          question_type: string | null
          section: string | null
          session_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_follow_up?: boolean | null
          metadata?: Json | null
          parent_question_id?: string | null
          project_id: string
          question_order?: number
          question_text: string
          question_type?: string | null
          section?: string | null
          session_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_follow_up?: boolean | null
          metadata?: Json | null
          parent_question_id?: string | null
          project_id?: string
          question_order?: number
          question_text?: string
          question_type?: string | null
          section?: string | null
          session_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_questions_parent_question_id_fkey"
            columns: ["parent_question_id"]
            isOneToOne: false
            referencedRelation: "interview_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_questions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_questions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "study_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_responses: {
        Row: {
          created_at: string
          id: string
          metadata: Json | null
          participant_id: string | null
          question_id: string | null
          response_text: string | null
          sentiment_score: number | null
          session_id: string
          transcription: string | null
          updated_at: string
          video_duration_ms: number | null
          video_url: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json | null
          participant_id?: string | null
          question_id?: string | null
          response_text?: string | null
          sentiment_score?: number | null
          session_id: string
          transcription?: string | null
          updated_at?: string
          video_duration_ms?: number | null
          video_url?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json | null
          participant_id?: string | null
          question_id?: string | null
          response_text?: string | null
          sentiment_score?: number | null
          session_id?: string
          transcription?: string | null
          updated_at?: string
          video_duration_ms?: number | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "interview_responses_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "study_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_responses_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "interview_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_responses_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "study_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          analysis: Json | null
          archived: boolean
          archived_at: string | null
          created_at: string
          description: string | null
          id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          analysis?: Json | null
          archived?: boolean
          archived_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          analysis?: Json | null
          archived?: boolean
          archived_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      study_participants: {
        Row: {
          completed_at: string | null
          created_at: string
          email: string
          id: string
          invitation_token: string | null
          invited_at: string | null
          joined_at: string | null
          metadata: Json | null
          name: string | null
          project_id: string
          status: string
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          email: string
          id?: string
          invitation_token?: string | null
          invited_at?: string | null
          joined_at?: string | null
          metadata?: Json | null
          name?: string | null
          project_id: string
          status?: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          email?: string
          id?: string
          invitation_token?: string | null
          invited_at?: string | null
          joined_at?: string | null
          metadata?: Json | null
          name?: string | null
          project_id?: string
          status?: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_participants_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      study_sessions: {
        Row: {
          created_at: string
          ended_at: string | null
          id: string
          metadata: Json | null
          notes: string | null
          participant_id: string | null
          project_id: string
          scheduled_at: string | null
          session_token: string | null
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          id?: string
          metadata?: Json | null
          notes?: string | null
          participant_id?: string | null
          project_id: string
          scheduled_at?: string | null
          session_token?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          id?: string
          metadata?: Json | null
          notes?: string | null
          participant_id?: string | null
          project_id?: string
          scheduled_at?: string | null
          session_token?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_sessions_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "study_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_sessions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_project_for_session: {
        Args: { session_token_input: string }
        Returns: {
          analysis: Json
          archived: boolean
          archived_at: string
          created_at: string
          description: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }[]
      }
      is_valid_participant_token: {
        Args: { token_input: string }
        Returns: boolean
      }
      update_participant_status_by_token: {
        Args: { new_status: string; token_input: string }
        Returns: Json
      }
      validate_participant_token: {
        Args: { token_input: string }
        Returns: {
          completed_at: string
          created_at: string
          email: string
          id: string
          invitation_token: string
          invited_at: string
          joined_at: string
          metadata: Json
          name: string
          project_id: string
          status: string
          token_expires_at: string
          updated_at: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
