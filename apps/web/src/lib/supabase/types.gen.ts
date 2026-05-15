/**
 * Maxytest Supabase generated types
 *
 * GENERATED — DO NOT EDIT BY HAND.
 *
 * Regenerate via:
 *   pnpm gen-types   (root) → `supabase gen types typescript --linked > apps/web/src/lib/supabase/types.gen.ts`
 *
 * This file is the strict source of truth for `Database` typing in
 *   - apps/web/src/lib/supabase/auth.ts
 *   - apps/web/src/lib/supabase/anon.ts
 *   - apps/web/src/lib/queries/*.ts
 *
 * Initial author note (Plan 01-02 Task 2): this file was hand-authored to match
 * `supabase/migrations/00001_init.sql` because the GSD parallel-executor agent
 * runs without Supabase credentials. After Task 1 (human provides Supabase
 * project ref + .env.local), regenerate via `pnpm gen-types` — the resulting
 * file should be byte-equivalent to this hand-authored version modulo formatting.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          display_name: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      workspaces: {
        Row: {
          id: string;
          name: string;
          slug: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      memberships: {
        Row: {
          workspace_id: string;
          user_id: string;
          role: 'owner' | 'editor' | 'viewer';
          created_at: string;
        };
        Insert: {
          workspace_id: string;
          user_id: string;
          role: 'owner' | 'editor' | 'viewer';
          created_at?: string;
        };
        Update: {
          workspace_id?: string;
          user_id?: string;
          role?: 'owner' | 'editor' | 'viewer';
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'memberships_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'memberships_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      studies: {
        Row: {
          id: string;
          workspace_id: string;
          title: string;
          status: 'draft' | 'published' | 'archived';
          run_token: string | null;
          published_at: string | null;
          archived_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          title?: string;
          status?: 'draft' | 'published' | 'archived';
          run_token?: string | null;
          published_at?: string | null;
          archived_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          title?: string;
          status?: 'draft' | 'published' | 'archived';
          run_token?: string | null;
          published_at?: string | null;
          archived_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'studies_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      blocks: {
        Row: {
          id: string;
          study_id: string;
          position: number;
          type: 'welcome' | 'thanks' | 'open_question';
          pinned: boolean;
          content: Json;
          version: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          study_id: string;
          position: number;
          type: 'welcome' | 'thanks' | 'open_question';
          pinned?: boolean;
          content?: Json;
          version?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          study_id?: string;
          position?: number;
          type?: 'welcome' | 'thanks' | 'open_question';
          pinned?: boolean;
          content?: Json;
          version?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'blocks_study_id_fkey';
            columns: ['study_id'];
            isOneToOne: false;
            referencedRelation: 'studies';
            referencedColumns: ['id'];
          },
        ];
      };
      block_changes: {
        Row: {
          id: number;
          block_id: string;
          actor_id: string | null;
          idempotency_key: string;
          change_type: string;
          payload: Json | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          block_id: string;
          actor_id?: string | null;
          idempotency_key: string;
          change_type: string;
          payload?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          block_id?: string;
          actor_id?: string | null;
          idempotency_key?: string;
          change_type?: string;
          payload?: Json | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'block_changes_block_id_fkey';
            columns: ['block_id'];
            isOneToOne: false;
            referencedRelation: 'blocks';
            referencedColumns: ['id'];
          },
        ];
      };
      sessions: {
        Row: {
          id: string;
          study_id: string;
          run_token: string;
          respondent_id: string | null;
          session_token: string;
          status: 'in_progress' | 'completed' | 'abandoned';
          device_type: string | null;
          user_agent: string | null;
          started_at: string;
          completed_at: string | null;
          last_seen_at: string;
        };
        Insert: {
          id?: string;
          study_id: string;
          run_token: string;
          respondent_id?: string | null;
          session_token: string;
          status?: 'in_progress' | 'completed' | 'abandoned';
          device_type?: string | null;
          user_agent?: string | null;
          started_at?: string;
          completed_at?: string | null;
          last_seen_at?: string;
        };
        Update: {
          id?: string;
          study_id?: string;
          run_token?: string;
          respondent_id?: string | null;
          session_token?: string;
          status?: 'in_progress' | 'completed' | 'abandoned';
          device_type?: string | null;
          user_agent?: string | null;
          started_at?: string;
          completed_at?: string | null;
          last_seen_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'sessions_study_id_fkey';
            columns: ['study_id'];
            isOneToOne: false;
            referencedRelation: 'studies';
            referencedColumns: ['id'];
          },
        ];
      };
      responses: {
        Row: {
          id: string;
          session_id: string;
          block_id: string;
          answer: Json;
          time_ms: number | null;
          submitted_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          block_id: string;
          answer: Json;
          time_ms?: number | null;
          submitted_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          block_id?: string;
          answer?: Json;
          time_ms?: number | null;
          submitted_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'responses_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'sessions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'responses_block_id_fkey';
            columns: ['block_id'];
            isOneToOne: false;
            referencedRelation: 'blocks';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      current_workspace_role: {
        Args: { ws: string };
        Returns: string | null;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
