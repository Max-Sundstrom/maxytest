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
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      block_changes: {
        Row: {
          actor_id: string | null
          block_id: string
          change_type: string
          created_at: string
          id: number
          idempotency_key: string
          payload: Json | null
        }
        Insert: {
          actor_id?: string | null
          block_id: string
          change_type: string
          created_at?: string
          id?: number
          idempotency_key: string
          payload?: Json | null
        }
        Update: {
          actor_id?: string | null
          block_id?: string
          change_type?: string
          created_at?: string
          id?: number
          idempotency_key?: string
          payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "block_changes_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "block_changes_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      blocks: {
        Row: {
          content: Json
          created_at: string
          id: string
          pinned: boolean
          position: number
          study_id: string
          type: 'welcome' | 'open_question' | 'thanks' | 'prototype'
          updated_at: string
          version: number
        }
        Insert: {
          content?: Json
          created_at?: string
          id?: string
          pinned?: boolean
          position: number
          study_id: string
          type: 'welcome' | 'open_question' | 'thanks' | 'prototype'
          updated_at?: string
          version?: number
        }
        Update: {
          content?: Json
          created_at?: string
          id?: string
          pinned?: boolean
          position?: number
          study_id?: string
          type?: 'welcome' | 'open_question' | 'thanks' | 'prototype'
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "blocks_study_id_fkey"
            columns: ["study_id"]
            isOneToOne: false
            referencedRelation: "studies"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          block_id: string
          client_ts: string
          event_type: 'tap' | 'frame_enter' | 'frame_exit' | 'task_finish'
          frame_id: string
          hit_target_id: string | null
          hotspot_id: string | null
          id: string
          prototype_version_id: string
          seq: number
          server_ts: string
          session_id: string
          study_id: string
          x: number | null
          y: number | null
        }
        Insert: {
          block_id: string
          client_ts: string
          event_type: 'tap' | 'frame_enter' | 'frame_exit' | 'task_finish'
          frame_id: string
          hit_target_id?: string | null
          hotspot_id?: string | null
          id: string
          prototype_version_id: string
          seq: number
          server_ts?: string
          session_id: string
          study_id: string
          x?: number | null
          y?: number | null
        }
        Update: {
          block_id?: string
          client_ts?: string
          event_type?: 'tap' | 'frame_enter' | 'frame_exit' | 'task_finish'
          frame_id?: string
          hit_target_id?: string | null
          hotspot_id?: string | null
          id?: string
          prototype_version_id?: string
          seq?: number
          server_ts?: string
          session_id?: string
          study_id?: string
          x?: number | null
          y?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "events_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_prototype_version_id_fkey"
            columns: ["prototype_version_id"]
            isOneToOne: false
            referencedRelation: "prototype_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_study_id_fkey"
            columns: ["study_id"]
            isOneToOne: false
            referencedRelation: "studies"
            referencedColumns: ["id"]
          },
        ]
      }
      frames: {
        Row: {
          frame_id: string
          height: number
          id: string
          name: string
          position: number
          prototype_version_id: string
          render_path_1x: string
          render_path_2x: string
          width: number
        }
        Insert: {
          frame_id: string
          height: number
          id?: string
          name: string
          position?: number
          prototype_version_id: string
          render_path_1x: string
          render_path_2x: string
          width: number
        }
        Update: {
          frame_id?: string
          height?: number
          id?: string
          name?: string
          position?: number
          prototype_version_id?: string
          render_path_1x?: string
          render_path_2x?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "frames_prototype_version_id_fkey"
            columns: ["prototype_version_id"]
            isOneToOne: false
            referencedRelation: "prototype_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      hotspots: {
        Row: {
          bbox_h: number
          bbox_w: number
          bbox_x: number
          bbox_y: number
          figma_raw: Json
          frame_id: string
          hotspot_id: string
          id: string
          prototype_version_id: string
          source_layer: string | null
          target_frame_id: string | null
          transition_kind: string
          z_index: number
        }
        Insert: {
          bbox_h: number
          bbox_w: number
          bbox_x: number
          bbox_y: number
          figma_raw?: Json
          frame_id: string
          hotspot_id: string
          id?: string
          prototype_version_id: string
          source_layer?: string | null
          target_frame_id?: string | null
          transition_kind?: string
          z_index?: number
        }
        Update: {
          bbox_h?: number
          bbox_w?: number
          bbox_x?: number
          bbox_y?: number
          figma_raw?: Json
          frame_id?: string
          hotspot_id?: string
          id?: string
          prototype_version_id?: string
          source_layer?: string | null
          target_frame_id?: string | null
          transition_kind?: string
          z_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "hotspots_frame_id_fkey"
            columns: ["frame_id"]
            isOneToOne: false
            referencedRelation: "frames"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hotspots_prototype_version_id_fkey"
            columns: ["prototype_version_id"]
            isOneToOne: false
            referencedRelation: "prototype_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          role: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          role: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          role?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      prototype_imports: {
        Row: {
          actor_id: string | null
          created_at: string
          error_code: string | null
          error_message: string | null
          figma_file_key: string
          frames_done: number
          frames_total: number
          id: string
          idempotency_key: string
          prototype_version_id: string | null
          status: string
          study_id: string
          updated_at: string
          warnings: Json
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          figma_file_key: string
          frames_done?: number
          frames_total?: number
          id?: string
          idempotency_key: string
          prototype_version_id?: string | null
          status?: string
          study_id: string
          updated_at?: string
          warnings?: Json
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          figma_file_key?: string
          frames_done?: number
          frames_total?: number
          id?: string
          idempotency_key?: string
          prototype_version_id?: string | null
          status?: string
          study_id?: string
          updated_at?: string
          warnings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "prototype_imports_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prototype_imports_prototype_version_id_fkey"
            columns: ["prototype_version_id"]
            isOneToOne: false
            referencedRelation: "prototype_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prototype_imports_study_id_fkey"
            columns: ["study_id"]
            isOneToOne: false
            referencedRelation: "studies"
            referencedColumns: ["id"]
          },
        ]
      }
      prototype_versions: {
        Row: {
          created_at: string
          figma_file_key: string
          figma_file_name: string | null
          figma_node_tree: Json | null
          figma_source_last_modified: string | null
          id: string
          snapshot_taken_at: string
          starting_frame_id: string | null
          status: string
          study_id: string
        }
        Insert: {
          created_at?: string
          figma_file_key: string
          figma_file_name?: string | null
          figma_node_tree?: Json | null
          figma_source_last_modified?: string | null
          id?: string
          snapshot_taken_at?: string
          starting_frame_id?: string | null
          status?: string
          study_id: string
        }
        Update: {
          created_at?: string
          figma_file_key?: string
          figma_file_name?: string | null
          figma_node_tree?: Json | null
          figma_source_last_modified?: string | null
          id?: string
          snapshot_taken_at?: string
          starting_frame_id?: string | null
          status?: string
          study_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prototype_versions_study_id_fkey"
            columns: ["study_id"]
            isOneToOne: false
            referencedRelation: "studies"
            referencedColumns: ["id"]
          },
        ]
      }
      responses: {
        Row: {
          answer: Json
          block_id: string
          id: string
          session_id: string
          submitted_at: string
          time_ms: number | null
        }
        Insert: {
          answer: Json
          block_id: string
          id?: string
          session_id: string
          submitted_at?: string
          time_ms?: number | null
        }
        Update: {
          answer?: Json
          block_id?: string
          id?: string
          session_id?: string
          submitted_at?: string
          time_ms?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "responses_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "responses_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          completed_at: string | null
          device_type: string | null
          id: string
          last_seen_at: string
          prototype_version_pin: string | null
          respondent_id: string | null
          run_token: string
          session_token: string
          started_at: string
          status: string
          study_id: string
          user_agent: string | null
        }
        Insert: {
          completed_at?: string | null
          device_type?: string | null
          id?: string
          last_seen_at?: string
          prototype_version_pin?: string | null
          respondent_id?: string | null
          run_token: string
          session_token: string
          started_at?: string
          status?: string
          study_id: string
          user_agent?: string | null
        }
        Update: {
          completed_at?: string | null
          device_type?: string | null
          id?: string
          last_seen_at?: string
          prototype_version_pin?: string | null
          respondent_id?: string | null
          run_token?: string
          session_token?: string
          started_at?: string
          status?: string
          study_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_prototype_version_pin_fkey"
            columns: ["prototype_version_pin"]
            isOneToOne: false
            referencedRelation: "prototype_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_study_id_fkey"
            columns: ["study_id"]
            isOneToOne: false
            referencedRelation: "studies"
            referencedColumns: ["id"]
          },
        ]
      }
      studies: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          id: string
          published_at: string | null
          run_token: string | null
          status: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          published_at?: string | null
          run_token?: string | null
          status?: string
          title?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          published_at?: string | null
          run_token?: string | null
          status?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "studies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studies_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
        }
        Relationships: []
      }
      workspaces: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      archive_study: { Args: { study_uuid: string }; Returns: undefined }
      complete_session: { Args: { p_session_id: string }; Returns: undefined }
      create_session: {
        Args: {
          p_device_type: string
          p_run_token: string
          p_user_agent: string
        }
        Returns: string
      }
      create_study: {
        Args: { study_title?: string; ws_id: string }
        Returns: string
      }
      current_workspace_role: { Args: { ws: string }; Returns: string }
      delete_block: {
        Args: { p_block_id: string; p_idempotency_key: string }
        Returns: undefined
      }
      duplicate_block: {
        Args: { p_block_id: string; p_idempotency_key: string }
        Returns: {
          content: Json
          created_at: string
          id: string
          pinned: boolean
          position: number
          study_id: string
          type: string
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "blocks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      force_update_block: {
        Args: { p_block_id: string; p_content: Json; p_idempotency_key: string }
        Returns: {
          content: Json
          created_at: string
          id: string
          pinned: boolean
          position: number
          study_id: string
          type: string
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "blocks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      gen_run_token: { Args: never; Returns: string }
      hard_delete_archived_studies: { Args: never; Returns: number }
      insert_block_at: {
        Args: {
          p_content: Json
          p_idempotency_key: string
          p_position: number
          p_study_id: string
          p_type: string
        }
        Returns: {
          content: Json
          created_at: string
          id: string
          pinned: boolean
          position: number
          study_id: string
          type: string
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "blocks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      move_study_to_draft: { Args: { study_uuid: string }; Returns: undefined }
      publish_study: {
        Args: { study_uuid: string }
        Returns: {
          run_token: string
          status: string
        }[]
      }
      reorder_blocks: {
        Args: {
          p_idempotency_key: string
          p_ordered_block_ids: string[]
          p_study_id: string
        }
        Returns: undefined
      }
      restore_study: { Args: { study_uuid: string }; Returns: undefined }
      set_session_prototype_pin: {
        Args: { p_pv_id: string; p_session_id: string }
        Returns: undefined
      }
      submit_events: {
        Args: { p_block_id: string; p_events: Json; p_session_id: string }
        Returns: number
      }
      submit_response: {
        Args: {
          p_answer: Json
          p_block_id: string
          p_session_id: string
          p_time_ms: number
        }
        Returns: undefined
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
