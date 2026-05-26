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
      admin_canary_runs: {
        Row: {
          created_at: string
          id: string
          requested_by_email: string | null
          requested_by_role: string | null
          requested_by_user_id: string | null
          results: Json
          status: string
          summary: Json
        }
        Insert: {
          created_at?: string
          id?: string
          requested_by_email?: string | null
          requested_by_role?: string | null
          requested_by_user_id?: string | null
          results?: Json
          status?: string
          summary?: Json
        }
        Update: {
          created_at?: string
          id?: string
          requested_by_email?: string | null
          requested_by_role?: string | null
          requested_by_user_id?: string | null
          results?: Json
          status?: string
          summary?: Json
        }
        Relationships: []
      }
      admin_live_cost_guard_actions: {
        Row: {
          action_type: string
          actor_id: string | null
          actor_type: string
          after_json: Json
          before_json: Json
          created_at: string | null
          error_message: string | null
          id: string
          participant_identity: string | null
          reason: string
          room_name: string | null
          security_context_id: string | null
          success: boolean
        }
        Insert: {
          action_type: string
          actor_id?: string | null
          actor_type: string
          after_json?: Json
          before_json?: Json
          created_at?: string | null
          error_message?: string | null
          id?: string
          participant_identity?: string | null
          reason: string
          room_name?: string | null
          security_context_id?: string | null
          success?: boolean
        }
        Update: {
          action_type?: string
          actor_id?: string | null
          actor_type?: string
          after_json?: Json
          before_json?: Json
          created_at?: string | null
          error_message?: string | null
          id?: string
          participant_identity?: string | null
          reason?: string
          room_name?: string | null
          security_context_id?: string | null
          success?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "admin_live_cost_guard_actions_security_context_id_fkey"
            columns: ["security_context_id"]
            isOneToOne: false
            referencedRelation: "security_request_context"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_live_cost_guard_events: {
        Row: {
          action_status: string
          action_taken: string | null
          admin_actor_id: string | null
          created_at: string | null
          estimated_usd_per_hour: number | null
          id: string
          metric_snapshot_json: Json
          participant_identity: string | null
          recommended_action: string | null
          room_name: string | null
          security_context_id: string | null
          severity: string
          source: string
        }
        Insert: {
          action_status?: string
          action_taken?: string | null
          admin_actor_id?: string | null
          created_at?: string | null
          estimated_usd_per_hour?: number | null
          id?: string
          metric_snapshot_json?: Json
          participant_identity?: string | null
          recommended_action?: string | null
          room_name?: string | null
          security_context_id?: string | null
          severity: string
          source: string
        }
        Update: {
          action_status?: string
          action_taken?: string | null
          admin_actor_id?: string | null
          created_at?: string | null
          estimated_usd_per_hour?: number | null
          id?: string
          metric_snapshot_json?: Json
          participant_identity?: string | null
          recommended_action?: string | null
          room_name?: string | null
          security_context_id?: string | null
          severity?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_live_cost_guard_events_security_context_id_fkey"
            columns: ["security_context_id"]
            isOneToOne: false
            referencedRelation: "security_request_context"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_live_cost_guard_settings: {
        Row: {
          cooldown_seconds: number | null
          created_at: string | null
          critical_threshold_mbps: number | null
          emergency_threshold_mbps: number | null
          enabled: boolean
          id: string
          max_estimated_usd_per_hour: number | null
          mode: string
          token_ttl_critical_seconds: number | null
          token_ttl_warning_seconds: number | null
          updated_at: string | null
          updated_by: string | null
          warning_threshold_mbps: number | null
        }
        Insert: {
          cooldown_seconds?: number | null
          created_at?: string | null
          critical_threshold_mbps?: number | null
          emergency_threshold_mbps?: number | null
          enabled?: boolean
          id?: string
          max_estimated_usd_per_hour?: number | null
          mode?: string
          token_ttl_critical_seconds?: number | null
          token_ttl_warning_seconds?: number | null
          updated_at?: string | null
          updated_by?: string | null
          warning_threshold_mbps?: number | null
        }
        Update: {
          cooldown_seconds?: number | null
          created_at?: string | null
          critical_threshold_mbps?: number | null
          emergency_threshold_mbps?: number | null
          enabled?: boolean
          id?: string
          max_estimated_usd_per_hour?: number | null
          mode?: string
          token_ttl_critical_seconds?: number | null
          token_ttl_warning_seconds?: number | null
          updated_at?: string | null
          updated_by?: string | null
          warning_threshold_mbps?: number | null
        }
        Relationships: []
      }
      admin_live_ops_action_audit: {
        Row: {
          action_type: string
          actor_email: string | null
          actor_role: string | null
          actor_user_id: string | null
          created_at: string
          dry_run: boolean
          error_message: string | null
          event_type: string
          id: string
          idempotency_key: string
          incident_id: string | null
          ops_job_id: string | null
          result: Json
          risk_level: string
          rollback_note: string | null
          security_context_id: string | null
          success: boolean
          target: Json
        }
        Insert: {
          action_type: string
          actor_email?: string | null
          actor_role?: string | null
          actor_user_id?: string | null
          created_at?: string
          dry_run?: boolean
          error_message?: string | null
          event_type: string
          id?: string
          idempotency_key: string
          incident_id?: string | null
          ops_job_id?: string | null
          result?: Json
          risk_level?: string
          rollback_note?: string | null
          security_context_id?: string | null
          success?: boolean
          target?: Json
        }
        Update: {
          action_type?: string
          actor_email?: string | null
          actor_role?: string | null
          actor_user_id?: string | null
          created_at?: string
          dry_run?: boolean
          error_message?: string | null
          event_type?: string
          id?: string
          idempotency_key?: string
          incident_id?: string | null
          ops_job_id?: string | null
          result?: Json
          risk_level?: string
          rollback_note?: string | null
          security_context_id?: string | null
          success?: boolean
          target?: Json
        }
        Relationships: [
          {
            foreignKeyName: "admin_live_ops_action_audit_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "admin_live_ops_incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_live_ops_action_audit_security_context_id_fkey"
            columns: ["security_context_id"]
            isOneToOne: false
            referencedRelation: "security_request_context"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_live_ops_incidents: {
        Row: {
          affected_call_id: string | null
          affected_platform: string
          affected_purpose: string
          affected_rooms: string[]
          affected_route: string
          affected_server_id: string | null
          affected_thread_id: string | null
          call_mode: string | null
          confidence: string
          created_at: string
          detected_symptoms: string[]
          dry_run_result: Json | null
          id: string
          idempotency_key: string
          last_action_at: string | null
          likely_cause: string
          metadata: Json
          ops_job_id: string | null
          recommended_action: string
          risk_level: string
          rollback_note: string
          runbook_path: string
          runbook_url: string | null
          status: string
          suggested_fix: string
          title: string
          updated_at: string
        }
        Insert: {
          affected_call_id?: string | null
          affected_platform?: string
          affected_purpose?: string
          affected_rooms?: string[]
          affected_route: string
          affected_server_id?: string | null
          affected_thread_id?: string | null
          call_mode?: string | null
          confidence?: string
          created_at?: string
          detected_symptoms?: string[]
          dry_run_result?: Json | null
          id?: string
          idempotency_key: string
          last_action_at?: string | null
          likely_cause: string
          metadata?: Json
          ops_job_id?: string | null
          recommended_action?: string
          risk_level?: string
          rollback_note: string
          runbook_path?: string
          runbook_url?: string | null
          status?: string
          suggested_fix: string
          title: string
          updated_at?: string
        }
        Update: {
          affected_call_id?: string | null
          affected_platform?: string
          affected_purpose?: string
          affected_rooms?: string[]
          affected_route?: string
          affected_server_id?: string | null
          affected_thread_id?: string | null
          call_mode?: string | null
          confidence?: string
          created_at?: string
          detected_symptoms?: string[]
          dry_run_result?: Json | null
          id?: string
          idempotency_key?: string
          last_action_at?: string | null
          likely_cause?: string
          metadata?: Json
          ops_job_id?: string | null
          recommended_action?: string
          risk_level?: string
          rollback_note?: string
          runbook_path?: string
          runbook_url?: string | null
          status?: string
          suggested_fix?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      app_configurations: {
        Row: {
          config: Json
          config_key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          config?: Json
          config_key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          config?: Json
          config_key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      beta_access_memberships: {
        Row: {
          access_status: string
          activated_at: string | null
          cohort: string | null
          email: string | null
          id: number
          invited_at: string
          invited_by: string | null
          last_seen_at: string | null
          notes: string | null
          onboarding_ack_at: string | null
          user_id: string | null
        }
        Insert: {
          access_status?: string
          activated_at?: string | null
          cohort?: string | null
          email?: string | null
          id?: number
          invited_at?: string
          invited_by?: string | null
          last_seen_at?: string | null
          notes?: string | null
          onboarding_ack_at?: string | null
          user_id?: string | null
        }
        Update: {
          access_status?: string
          activated_at?: string | null
          cohort?: string | null
          email?: string | null
          id?: number
          invited_at?: string
          invited_by?: string | null
          last_seen_at?: string | null
          notes?: string | null
          onboarding_ack_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      beta_feedback_items: {
        Row: {
          category: string
          context: Json
          created_at: string
          details: string | null
          feedback_type: string
          fix_window: string
          id: number
          reporter_display_name: string | null
          reporter_email: string | null
          reporter_user_id: string
          room_id: string | null
          route_path: string | null
          severity: string
          source_surface: string | null
          status: string
          summary: string
          title_id: string | null
        }
        Insert: {
          category: string
          context?: Json
          created_at?: string
          details?: string | null
          feedback_type: string
          fix_window?: string
          id?: number
          reporter_display_name?: string | null
          reporter_email?: string | null
          reporter_user_id: string
          room_id?: string | null
          route_path?: string | null
          severity: string
          source_surface?: string | null
          status?: string
          summary: string
          title_id?: string | null
        }
        Update: {
          category?: string
          context?: Json
          created_at?: string
          details?: string | null
          feedback_type?: string
          fix_window?: string
          id?: number
          reporter_display_name?: string | null
          reporter_email?: string | null
          reporter_user_id?: string
          room_id?: string | null
          route_path?: string | null
          severity?: string
          source_surface?: string | null
          status?: string
          summary?: string
          title_id?: string | null
        }
        Relationships: []
      }
      billing_events: {
        Row: {
          entitlement_key: string | null
          event_type: string
          id: number
          metadata: Json
          occurred_at: string
          provider: string
          status: string | null
          user_id: string | null
        }
        Insert: {
          entitlement_key?: string | null
          event_type: string
          id?: number
          metadata?: Json
          occurred_at?: string
          provider?: string
          status?: string | null
          user_id?: string | null
        }
        Update: {
          entitlement_key?: string | null
          event_type?: string
          id?: number
          metadata?: Json
          occurred_at?: string
          provider?: string
          status?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      channel_audience_blocks: {
        Row: {
          blocked_at: string
          blocked_by_user_id: string
          blocked_user_id: string
          channel_user_id: string
          reason: string | null
          updated_at: string
        }
        Insert: {
          blocked_at?: string
          blocked_by_user_id: string
          blocked_user_id: string
          channel_user_id: string
          reason?: string | null
          updated_at?: string
        }
        Update: {
          blocked_at?: string
          blocked_by_user_id?: string
          blocked_user_id?: string
          channel_user_id?: string
          reason?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      channel_audience_requests: {
        Row: {
          channel_user_id: string
          created_at: string
          id: number
          note: string | null
          request_kind: string
          requester_user_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          channel_user_id: string
          created_at?: string
          id?: number
          note?: string | null
          request_kind?: string
          requester_user_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          channel_user_id?: string
          created_at?: string
          id?: number
          note?: string | null
          request_kind?: string
          requester_user_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      channel_followers: {
        Row: {
          channel_user_id: string
          followed_at: string
          follower_user_id: string
          updated_at: string
        }
        Insert: {
          channel_user_id: string
          followed_at?: string
          follower_user_id: string
          updated_at?: string
        }
        Update: {
          channel_user_id?: string
          followed_at?: string
          follower_user_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      channel_subscribers: {
        Row: {
          channel_user_id: string
          expires_at: string | null
          source: string
          started_at: string
          status: string
          subscriber_user_id: string
          updated_at: string
        }
        Insert: {
          channel_user_id: string
          expires_at?: string | null
          source?: string
          started_at?: string
          status?: string
          subscriber_user_id: string
          updated_at?: string
        }
        Update: {
          channel_user_id?: string
          expires_at?: string | null
          source?: string
          started_at?: string
          status?: string
          subscriber_user_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          message_type: string
          sender_user_id: string
          thread_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          message_type?: string
          sender_user_id: string
          thread_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          message_type?: string
          sender_user_id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_thread_members: {
        Row: {
          avatar_url: string | null
          display_name: string | null
          joined_at: string
          last_read_at: string | null
          tagline: string | null
          thread_id: string
          unread_count: number
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          display_name?: string | null
          joined_at?: string
          last_read_at?: string | null
          tagline?: string | null
          thread_id: string
          unread_count?: number
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          display_name?: string | null
          joined_at?: string
          last_read_at?: string | null
          tagline?: string | null
          thread_id?: string
          unread_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_thread_members_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_threads: {
        Row: {
          active_call_type: string | null
          active_communication_room_id: string | null
          created_at: string
          created_by: string
          id: string
          last_message_at: string | null
          last_message_preview: string | null
          participant_pair_key: string
          thread_kind: string
          updated_at: string
        }
        Insert: {
          active_call_type?: string | null
          active_communication_room_id?: string | null
          created_at?: string
          created_by: string
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          participant_pair_key: string
          thread_kind?: string
          updated_at?: string
        }
        Update: {
          active_call_type?: string | null
          active_communication_room_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          participant_pair_key?: string
          thread_kind?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_threads_active_communication_room_id_fkey"
            columns: ["active_communication_room_id"]
            isOneToOne: false
            referencedRelation: "communication_rooms"
            referencedColumns: ["room_id"]
          },
        ]
      }
      communication_room_memberships: {
        Row: {
          avatar_url: string | null
          camera_enabled: boolean
          display_name: string | null
          joined_at: string
          last_seen_at: string
          left_at: string | null
          membership_state: string
          mic_enabled: boolean
          role: string
          room_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          camera_enabled?: boolean
          display_name?: string | null
          joined_at?: string
          last_seen_at?: string
          left_at?: string | null
          membership_state?: string
          mic_enabled?: boolean
          role?: string
          room_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          camera_enabled?: boolean
          display_name?: string | null
          joined_at?: string
          last_seen_at?: string
          left_at?: string | null
          membership_state?: string
          mic_enabled?: boolean
          role?: string
          room_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "communication_room_memberships_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "communication_rooms"
            referencedColumns: ["room_id"]
          },
        ]
      }
      communication_rooms: {
        Row: {
          capture_policy: string
          content_access_rule: string
          created_at: string
          host_user_id: string
          last_activity_at: string
          linked_party_id: string | null
          linked_room_code: string | null
          linked_room_mode: string | null
          room_code: string
          room_id: string
          status: string
          updated_at: string
        }
        Insert: {
          capture_policy?: string
          content_access_rule?: string
          created_at?: string
          host_user_id: string
          last_activity_at?: string
          linked_party_id?: string | null
          linked_room_code?: string | null
          linked_room_mode?: string | null
          room_code: string
          room_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          capture_policy?: string
          content_access_rule?: string
          created_at?: string
          host_user_id?: string
          last_activity_at?: string
          linked_party_id?: string | null
          linked_room_code?: string | null
          linked_room_mode?: string | null
          room_code?: string
          room_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      content_access_grants: {
        Row: {
          active: boolean
          content_id: string
          content_type: string
          created_at: string
          id: string
          purchase_id: string | null
          revoked_at: string | null
          source: string
          user_id: string
        }
        Insert: {
          active?: boolean
          content_id: string
          content_type: string
          created_at?: string
          id?: string
          purchase_id?: string | null
          revoked_at?: string | null
          source: string
          user_id: string
        }
        Update: {
          active?: boolean
          content_id?: string
          content_type?: string
          created_at?: string
          id?: string
          purchase_id?: string | null
          revoked_at?: string | null
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_access_grants_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "paid_content_purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_clip_edits: {
        Row: {
          brand_asset_id: string | null
          brand_mark_enabled: boolean
          clip_format: string
          cover_file_size_bytes: number | null
          cover_mime_type: string | null
          cover_storage_path: string | null
          created_at: string
          fit_mode: string
          owner_user_id: string
          template_preset: string
          title_overlay_position: string
          title_overlay_style: string
          title_overlay_subtitle: string | null
          title_overlay_text: string | null
          trim_end_ms: number | null
          trim_start_ms: number | null
          updated_at: string
          video_id: string
        }
        Insert: {
          brand_asset_id?: string | null
          brand_mark_enabled?: boolean
          clip_format?: string
          cover_file_size_bytes?: number | null
          cover_mime_type?: string | null
          cover_storage_path?: string | null
          created_at?: string
          fit_mode?: string
          owner_user_id: string
          template_preset?: string
          title_overlay_position?: string
          title_overlay_style?: string
          title_overlay_subtitle?: string | null
          title_overlay_text?: string | null
          trim_end_ms?: number | null
          trim_start_ms?: number | null
          updated_at?: string
          video_id: string
        }
        Update: {
          brand_asset_id?: string | null
          brand_mark_enabled?: boolean
          clip_format?: string
          cover_file_size_bytes?: number | null
          cover_mime_type?: string | null
          cover_storage_path?: string | null
          created_at?: string
          fit_mode?: string
          owner_user_id?: string
          template_preset?: string
          title_overlay_position?: string
          title_overlay_style?: string
          title_overlay_subtitle?: string | null
          title_overlay_text?: string | null
          trim_end_ms?: number | null
          trim_start_ms?: number | null
          updated_at?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_clip_edits_brand_asset_id_fkey"
            columns: ["brand_asset_id"]
            isOneToOne: false
            referencedRelation: "platform_brand_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_clip_edits_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: true
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_content_prices: {
        Row: {
          content_id: string
          content_type: string
          created_at: string
          creator_id: string
          currency: string
          id: string
          is_paid: boolean
          price_cents: number
          status: string
          updated_at: string
        }
        Insert: {
          content_id: string
          content_type: string
          created_at?: string
          creator_id: string
          currency?: string
          id?: string
          is_paid?: boolean
          price_cents?: number
          status?: string
          updated_at?: string
        }
        Update: {
          content_id?: string
          content_type?: string
          created_at?: string
          creator_id?: string
          currency?: string
          id?: string
          is_paid?: boolean
          price_cents?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      creator_earnings_ledger: {
        Row: {
          created_at: string
          creator_id: string
          currency: string
          gross_amount_cents: number
          hold_until: string | null
          id: string
          ledger_status: string
          metadata: Json
          net_creator_amount_cents: number
          platform_fee_cents: number
          provider_fee_cents: number
          source_id: string | null
          source_type: string
          tax_cents: number
        }
        Insert: {
          created_at?: string
          creator_id: string
          currency?: string
          gross_amount_cents: number
          hold_until?: string | null
          id?: string
          ledger_status?: string
          metadata?: Json
          net_creator_amount_cents: number
          platform_fee_cents?: number
          provider_fee_cents?: number
          source_id?: string | null
          source_type: string
          tax_cents?: number
        }
        Update: {
          created_at?: string
          creator_id?: string
          currency?: string
          gross_amount_cents?: number
          hold_until?: string | null
          id?: string
          ledger_status?: string
          metadata?: Json
          net_creator_amount_cents?: number
          platform_fee_cents?: number
          provider_fee_cents?: number
          source_id?: string | null
          source_type?: string
          tax_cents?: number
        }
        Relationships: []
      }
      creator_events: {
        Row: {
          created_at: string
          ends_at: string | null
          event_title: string
          event_type: string
          host_user_id: string
          id: string
          linked_title_id: string | null
          reminder_ready: boolean
          replay_available_at: string | null
          replay_expires_at: string | null
          replay_policy: string
          starts_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          ends_at?: string | null
          event_title: string
          event_type: string
          host_user_id: string
          id?: string
          linked_title_id?: string | null
          reminder_ready?: boolean
          replay_available_at?: string | null
          replay_expires_at?: string | null
          replay_policy?: string
          starts_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          ends_at?: string | null
          event_title?: string
          event_type?: string
          host_user_id?: string
          id?: string
          linked_title_id?: string | null
          reminder_ready?: boolean
          replay_available_at?: string | null
          replay_expires_at?: string | null
          replay_policy?: string
          starts_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_events_linked_title_id_fkey"
            columns: ["linked_title_id"]
            isOneToOne: false
            referencedRelation: "titles"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_monetization_profiles: {
        Row: {
          age_verified: boolean
          connect_account_id: string | null
          connect_status: string
          created_at: string
          creator_id: string
          eligibility_status: string
          is_premium_creator: boolean
          monetization_enabled: boolean
          payout_status: string
          public_channel: boolean
          strikes_count: number
          updated_at: string
        }
        Insert: {
          age_verified?: boolean
          connect_account_id?: string | null
          connect_status?: string
          created_at?: string
          creator_id: string
          eligibility_status?: string
          is_premium_creator?: boolean
          monetization_enabled?: boolean
          payout_status?: string
          public_channel?: boolean
          strikes_count?: number
          updated_at?: string
        }
        Update: {
          age_verified?: boolean
          connect_account_id?: string | null
          connect_status?: string
          created_at?: string
          creator_id?: string
          eligibility_status?: string
          is_premium_creator?: boolean
          monetization_enabled?: boolean
          payout_status?: string
          public_channel?: boolean
          strikes_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_monetization_profiles_connect_account_id_fkey"
            columns: ["connect_account_id"]
            isOneToOne: false
            referencedRelation: "creator_payout_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_payout_accounts: {
        Row: {
          card_payments_capability_status: string
          charges_enabled: boolean
          country: string | null
          created_at: string
          creator_user_id: string
          default_currency: string
          details_submitted: boolean
          disabled_reason: string | null
          id: string
          kyc_status: string
          last_platform_admin_audit_log_id: string | null
          last_provider_sync_at: string | null
          metadata: Json
          onboarding_completed_at: string | null
          onboarding_started_at: string | null
          onboarding_status: string
          payouts_enabled: boolean
          provider: string
          provider_account_id: string | null
          provider_account_type: string
          provider_configuration_key: string | null
          provider_dashboard_type: string
          provider_environment: string
          provider_fees_payer: string
          provider_losses_collector: string
          provider_requirements_collection: string
          requirements_currently_due: Json
          requirements_eventually_due: Json
          requirements_past_due: Json
          status: string
          tax_status: string
          transfers_capability_status: string
          updated_at: string
        }
        Insert: {
          card_payments_capability_status?: string
          charges_enabled?: boolean
          country?: string | null
          created_at?: string
          creator_user_id: string
          default_currency?: string
          details_submitted?: boolean
          disabled_reason?: string | null
          id?: string
          kyc_status?: string
          last_platform_admin_audit_log_id?: string | null
          last_provider_sync_at?: string | null
          metadata?: Json
          onboarding_completed_at?: string | null
          onboarding_started_at?: string | null
          onboarding_status?: string
          payouts_enabled?: boolean
          provider?: string
          provider_account_id?: string | null
          provider_account_type?: string
          provider_configuration_key?: string | null
          provider_dashboard_type?: string
          provider_environment?: string
          provider_fees_payer?: string
          provider_losses_collector?: string
          provider_requirements_collection?: string
          requirements_currently_due?: Json
          requirements_eventually_due?: Json
          requirements_past_due?: Json
          status?: string
          tax_status?: string
          transfers_capability_status?: string
          updated_at?: string
        }
        Update: {
          card_payments_capability_status?: string
          charges_enabled?: boolean
          country?: string | null
          created_at?: string
          creator_user_id?: string
          default_currency?: string
          details_submitted?: boolean
          disabled_reason?: string | null
          id?: string
          kyc_status?: string
          last_platform_admin_audit_log_id?: string | null
          last_provider_sync_at?: string | null
          metadata?: Json
          onboarding_completed_at?: string | null
          onboarding_started_at?: string | null
          onboarding_status?: string
          payouts_enabled?: boolean
          provider?: string
          provider_account_id?: string | null
          provider_account_type?: string
          provider_configuration_key?: string | null
          provider_dashboard_type?: string
          provider_environment?: string
          provider_fees_payer?: string
          provider_losses_collector?: string
          provider_requirements_collection?: string
          requirements_currently_due?: Json
          requirements_eventually_due?: Json
          requirements_past_due?: Json
          status?: string
          tax_status?: string
          transfers_capability_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_payout_accounts_last_platform_admin_audit_log_id_fkey"
            columns: ["last_platform_admin_audit_log_id"]
            isOneToOne: false
            referencedRelation: "platform_admin_audit_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_payout_audit_log: {
        Row: {
          action: string
          actor_role: string | null
          actor_user_id: string | null
          created_at: string
          creator_user_id: string | null
          id: string
          metadata: Json
          next_status: string | null
          platform_admin_audit_log_id: string | null
          previous_status: string | null
          reason: string | null
          security_context_id: string | null
          target_id: string
          target_table: string
        }
        Insert: {
          action: string
          actor_role?: string | null
          actor_user_id?: string | null
          created_at?: string
          creator_user_id?: string | null
          id?: string
          metadata?: Json
          next_status?: string | null
          platform_admin_audit_log_id?: string | null
          previous_status?: string | null
          reason?: string | null
          security_context_id?: string | null
          target_id: string
          target_table: string
        }
        Update: {
          action?: string
          actor_role?: string | null
          actor_user_id?: string | null
          created_at?: string
          creator_user_id?: string | null
          id?: string
          metadata?: Json
          next_status?: string | null
          platform_admin_audit_log_id?: string | null
          previous_status?: string | null
          reason?: string | null
          security_context_id?: string | null
          target_id?: string
          target_table?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_payout_audit_log_platform_admin_audit_log_id_fkey"
            columns: ["platform_admin_audit_log_id"]
            isOneToOne: false
            referencedRelation: "platform_admin_audit_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_payout_audit_log_security_context_id_fkey"
            columns: ["security_context_id"]
            isOneToOne: false
            referencedRelation: "security_request_context"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_payout_batch_items: {
        Row: {
          amount_cents: number
          batch_id: string
          created_at: string
          creator_user_id: string | null
          currency: string
          id: string
          metadata: Json
          payout_ledger_entry_id: number | null
          status: string
        }
        Insert: {
          amount_cents?: number
          batch_id: string
          created_at?: string
          creator_user_id?: string | null
          currency?: string
          id?: string
          metadata?: Json
          payout_ledger_entry_id?: number | null
          status?: string
        }
        Update: {
          amount_cents?: number
          batch_id?: string
          created_at?: string
          creator_user_id?: string | null
          currency?: string
          id?: string
          metadata?: Json
          payout_ledger_entry_id?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_payout_batch_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "creator_payout_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_payout_batch_items_payout_ledger_entry_id_fkey"
            columns: ["payout_ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "creator_payout_ledger_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_payout_batches: {
        Row: {
          approved_at: string | null
          approved_by_user_id: string | null
          batch_reference: string | null
          batch_status: string
          batch_type: string
          created_at: string
          currency: string
          entry_count: number
          id: string
          metadata: Json
          period_end: string | null
          period_start: string | null
          platform_admin_audit_log_id: string | null
          processed_at: string | null
          status: string
          total_amount_cents: number
          total_amount_minor: number
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by_user_id?: string | null
          batch_reference?: string | null
          batch_status?: string
          batch_type?: string
          created_at?: string
          currency?: string
          entry_count?: number
          id?: string
          metadata?: Json
          period_end?: string | null
          period_start?: string | null
          platform_admin_audit_log_id?: string | null
          processed_at?: string | null
          status?: string
          total_amount_cents?: number
          total_amount_minor?: number
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by_user_id?: string | null
          batch_reference?: string | null
          batch_status?: string
          batch_type?: string
          created_at?: string
          currency?: string
          entry_count?: number
          id?: string
          metadata?: Json
          period_end?: string | null
          period_start?: string | null
          platform_admin_audit_log_id?: string | null
          processed_at?: string | null
          status?: string
          total_amount_cents?: number
          total_amount_minor?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_payout_batches_platform_admin_audit_log_id_fkey"
            columns: ["platform_admin_audit_log_id"]
            isOneToOne: false
            referencedRelation: "platform_admin_audit_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_payout_eligibility_records: {
        Row: {
          admin_review_status: string
          created_at: string
          creator_user_id: string
          eligibility_reason: string | null
          eligibility_status: string
          eligible_for_payouts: boolean
          fraud_hold_active: boolean
          hold_period_cleared: boolean
          id: string
          kyc_ready: boolean
          last_evaluated_at: string | null
          metadata: Json
          minimum_payout_met: boolean
          payout_account_id: string | null
          payout_account_ready: boolean
          platform_admin_audit_log_id: string | null
          provider_ready: boolean
          tax_ready: boolean
          updated_at: string
        }
        Insert: {
          admin_review_status?: string
          created_at?: string
          creator_user_id: string
          eligibility_reason?: string | null
          eligibility_status?: string
          eligible_for_payouts?: boolean
          fraud_hold_active?: boolean
          hold_period_cleared?: boolean
          id?: string
          kyc_ready?: boolean
          last_evaluated_at?: string | null
          metadata?: Json
          minimum_payout_met?: boolean
          payout_account_id?: string | null
          payout_account_ready?: boolean
          platform_admin_audit_log_id?: string | null
          provider_ready?: boolean
          tax_ready?: boolean
          updated_at?: string
        }
        Update: {
          admin_review_status?: string
          created_at?: string
          creator_user_id?: string
          eligibility_reason?: string | null
          eligibility_status?: string
          eligible_for_payouts?: boolean
          fraud_hold_active?: boolean
          hold_period_cleared?: boolean
          id?: string
          kyc_ready?: boolean
          last_evaluated_at?: string | null
          metadata?: Json
          minimum_payout_met?: boolean
          payout_account_id?: string | null
          payout_account_ready?: boolean
          platform_admin_audit_log_id?: string | null
          provider_ready?: boolean
          tax_ready?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_payout_eligibility_rec_platform_admin_audit_log_id_fkey"
            columns: ["platform_admin_audit_log_id"]
            isOneToOne: false
            referencedRelation: "platform_admin_audit_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_payout_eligibility_records_payout_account_id_fkey"
            columns: ["payout_account_id"]
            isOneToOne: false
            referencedRelation: "creator_payout_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_payout_holds: {
        Row: {
          admin_note: string | null
          batch_id: string | null
          created_at: string
          created_by_user_id: string | null
          creator_user_id: string
          hold_started_at: string
          hold_until: string | null
          id: string
          metadata: Json
          payout_entry_id: number | null
          platform_admin_audit_log_id: string | null
          reason: string
          released_at: string | null
          released_by_user_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          admin_note?: string | null
          batch_id?: string | null
          created_at?: string
          created_by_user_id?: string | null
          creator_user_id: string
          hold_started_at?: string
          hold_until?: string | null
          id?: string
          metadata?: Json
          payout_entry_id?: number | null
          platform_admin_audit_log_id?: string | null
          reason: string
          released_at?: string | null
          released_by_user_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          admin_note?: string | null
          batch_id?: string | null
          created_at?: string
          created_by_user_id?: string | null
          creator_user_id?: string
          hold_started_at?: string
          hold_until?: string | null
          id?: string
          metadata?: Json
          payout_entry_id?: number | null
          platform_admin_audit_log_id?: string | null
          reason?: string
          released_at?: string | null
          released_by_user_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_payout_holds_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "creator_payout_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_payout_holds_payout_entry_id_fkey"
            columns: ["payout_entry_id"]
            isOneToOne: false
            referencedRelation: "creator_payout_ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_payout_holds_platform_admin_audit_log_id_fkey"
            columns: ["platform_admin_audit_log_id"]
            isOneToOne: false
            referencedRelation: "platform_admin_audit_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_payout_ledger_entries: {
        Row: {
          amount_minor: number
          created_at: string
          creator_user_id: string
          currency: string
          entry_type: string
          hold_reason: string | null
          hold_until: string | null
          id: number
          metadata: Json
          payout_provider: string | null
          payout_provider_reference: string | null
          source_ledger_event_id: number | null
          status: string
          updated_at: string
        }
        Insert: {
          amount_minor?: number
          created_at?: string
          creator_user_id: string
          currency?: string
          entry_type?: string
          hold_reason?: string | null
          hold_until?: string | null
          id?: number
          metadata?: Json
          payout_provider?: string | null
          payout_provider_reference?: string | null
          source_ledger_event_id?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount_minor?: number
          created_at?: string
          creator_user_id?: string
          currency?: string
          entry_type?: string
          hold_reason?: string | null
          hold_until?: string | null
          id?: number
          metadata?: Json
          payout_provider?: string | null
          payout_provider_reference?: string | null
          source_ledger_event_id?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_payout_ledger_entries_source_event_fkey"
            columns: ["source_ledger_event_id"]
            isOneToOne: false
            referencedRelation: "platform_finance_ledger_events"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_payout_onboarding_sessions: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by_user_id: string | null
          creator_user_id: string
          expires_at: string | null
          id: string
          metadata: Json
          onboarding_url_created_at: string | null
          payout_account_id: string | null
          platform_admin_audit_log_id: string | null
          provider: string
          provider_account_id: string | null
          provider_environment: string
          refresh_url: string | null
          return_url: string | null
          status: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by_user_id?: string | null
          creator_user_id: string
          expires_at?: string | null
          id?: string
          metadata?: Json
          onboarding_url_created_at?: string | null
          payout_account_id?: string | null
          platform_admin_audit_log_id?: string | null
          provider?: string
          provider_account_id?: string | null
          provider_environment?: string
          refresh_url?: string | null
          return_url?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by_user_id?: string | null
          creator_user_id?: string
          expires_at?: string | null
          id?: string
          metadata?: Json
          onboarding_url_created_at?: string | null
          payout_account_id?: string | null
          platform_admin_audit_log_id?: string | null
          provider?: string
          provider_account_id?: string | null
          provider_environment?: string
          refresh_url?: string | null
          return_url?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_payout_onboarding_sess_platform_admin_audit_log_id_fkey"
            columns: ["platform_admin_audit_log_id"]
            isOneToOne: false
            referencedRelation: "platform_admin_audit_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_payout_onboarding_sessions_payout_account_id_fkey"
            columns: ["payout_account_id"]
            isOneToOne: false
            referencedRelation: "creator_payout_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_payout_provider_transfers: {
        Row: {
          amount_minor: number
          batch_id: string | null
          created_at: string
          creator_user_id: string
          currency: string
          estimated_arrival_at: string | null
          failure_code: string | null
          failure_message: string | null
          id: string
          idempotency_key: string | null
          last_provider_sync_at: string | null
          metadata: Json
          payout_account_id: string | null
          payout_entry_id: number | null
          platform_admin_audit_log_id: string | null
          provider: string
          provider_created_at: string | null
          provider_environment: string
          provider_payout_id: string | null
          provider_status: string | null
          provider_transfer_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount_minor?: number
          batch_id?: string | null
          created_at?: string
          creator_user_id: string
          currency?: string
          estimated_arrival_at?: string | null
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          idempotency_key?: string | null
          last_provider_sync_at?: string | null
          metadata?: Json
          payout_account_id?: string | null
          payout_entry_id?: number | null
          platform_admin_audit_log_id?: string | null
          provider?: string
          provider_created_at?: string | null
          provider_environment?: string
          provider_payout_id?: string | null
          provider_status?: string | null
          provider_transfer_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount_minor?: number
          batch_id?: string | null
          created_at?: string
          creator_user_id?: string
          currency?: string
          estimated_arrival_at?: string | null
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          idempotency_key?: string | null
          last_provider_sync_at?: string | null
          metadata?: Json
          payout_account_id?: string | null
          payout_entry_id?: number | null
          platform_admin_audit_log_id?: string | null
          provider?: string
          provider_created_at?: string | null
          provider_environment?: string
          provider_payout_id?: string | null
          provider_status?: string | null
          provider_transfer_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_payout_provider_transf_platform_admin_audit_log_id_fkey"
            columns: ["platform_admin_audit_log_id"]
            isOneToOne: false
            referencedRelation: "platform_admin_audit_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_payout_provider_transfers_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "creator_payout_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_payout_provider_transfers_payout_account_id_fkey"
            columns: ["payout_account_id"]
            isOneToOne: false
            referencedRelation: "creator_payout_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_payout_provider_transfers_payout_entry_id_fkey"
            columns: ["payout_entry_id"]
            isOneToOne: false
            referencedRelation: "creator_payout_ledger_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_payout_provider_webhook_events: {
        Row: {
          connected_account_id: string | null
          created_at: string
          event_id: string
          event_type: string
          failure_reason: string | null
          id: string
          idempotency_key: string | null
          livemode: boolean
          metadata: Json
          platform_admin_audit_log_id: string | null
          processed_at: string | null
          provider: string
          provider_account_id: string | null
          provider_environment: string
          retry_count: number
          status: string
          updated_at: string
        }
        Insert: {
          connected_account_id?: string | null
          created_at?: string
          event_id: string
          event_type: string
          failure_reason?: string | null
          id?: string
          idempotency_key?: string | null
          livemode?: boolean
          metadata?: Json
          platform_admin_audit_log_id?: string | null
          processed_at?: string | null
          provider?: string
          provider_account_id?: string | null
          provider_environment?: string
          retry_count?: number
          status?: string
          updated_at?: string
        }
        Update: {
          connected_account_id?: string | null
          created_at?: string
          event_id?: string
          event_type?: string
          failure_reason?: string | null
          id?: string
          idempotency_key?: string | null
          livemode?: boolean
          metadata?: Json
          platform_admin_audit_log_id?: string | null
          processed_at?: string | null
          provider?: string
          provider_account_id?: string | null
          provider_environment?: string
          retry_count?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_payout_provider_webhoo_platform_admin_audit_log_id_fkey"
            columns: ["platform_admin_audit_log_id"]
            isOneToOne: false
            referencedRelation: "platform_admin_audit_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_payout_requests: {
        Row: {
          amount_cents: number
          created_at: string
          creator_id: string
          currency: string
          id: string
          instant_fee_cents: number
          payout_type: string
          provider_payout_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          creator_id: string
          currency?: string
          id?: string
          instant_fee_cents?: number
          payout_type: string
          provider_payout_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          creator_id?: string
          currency?: string
          id?: string
          instant_fee_cents?: number
          payout_type?: string
          provider_payout_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      creator_payout_review_notes: {
        Row: {
          actor_user_id: string | null
          created_at: string
          id: string
          metadata: Json
          note: string
          note_type: string
          review_id: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          note: string
          note_type?: string
          review_id: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          note?: string
          note_type?: string
          review_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_payout_review_notes_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "creator_payout_review_records"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_payout_review_records: {
        Row: {
          amount_cents: number
          created_at: string
          creator_user_id: string | null
          currency: string
          fraud_hold_id: number | null
          id: string
          metadata: Json
          payout_account_id: string | null
          payout_ledger_entry_id: number | null
          review_notes: string | null
          review_reason: string | null
          review_status: string
          risk_status: string
          updated_at: string
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          creator_user_id?: string | null
          currency?: string
          fraud_hold_id?: number | null
          id?: string
          metadata?: Json
          payout_account_id?: string | null
          payout_ledger_entry_id?: number | null
          review_notes?: string | null
          review_reason?: string | null
          review_status?: string
          risk_status?: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          creator_user_id?: string | null
          currency?: string
          fraud_hold_id?: number | null
          id?: string
          metadata?: Json
          payout_account_id?: string | null
          payout_ledger_entry_id?: number | null
          review_notes?: string | null
          review_reason?: string | null
          review_status?: string
          risk_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_payout_review_records_fraud_hold_id_fkey"
            columns: ["fraud_hold_id"]
            isOneToOne: false
            referencedRelation: "platform_fraud_holds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_payout_review_records_payout_account_id_fkey"
            columns: ["payout_account_id"]
            isOneToOne: false
            referencedRelation: "creator_payout_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_payout_review_records_payout_ledger_entry_id_fkey"
            columns: ["payout_ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "creator_payout_ledger_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_permissions: {
        Row: {
          can_publish_premium_titles: boolean
          can_use_party_pass_rooms: boolean
          can_use_player_ads: boolean
          can_use_premium_rooms: boolean
          can_use_sponsor_placements: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          can_publish_premium_titles?: boolean
          can_use_party_pass_rooms?: boolean
          can_use_player_ads?: boolean
          can_use_premium_rooms?: boolean
          can_use_sponsor_placements?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          can_publish_premium_titles?: boolean
          can_use_party_pass_rooms?: boolean
          can_use_player_ads?: boolean
          can_use_premium_rooms?: boolean
          can_use_sponsor_placements?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      creator_product_orders: {
        Row: {
          buyer_id: string
          created_at: string
          creator_id: string
          currency: string
          fulfillment_status: string
          id: string
          order_status: string
          price_cents: number
          product_id: string | null
          provider: string
          provider_payment_id: string | null
          quantity: number
          refund_status: string
          updated_at: string
        }
        Insert: {
          buyer_id: string
          created_at?: string
          creator_id: string
          currency?: string
          fulfillment_status?: string
          id?: string
          order_status?: string
          price_cents: number
          product_id?: string | null
          provider?: string
          provider_payment_id?: string | null
          quantity?: number
          refund_status?: string
          updated_at?: string
        }
        Update: {
          buyer_id?: string
          created_at?: string
          creator_id?: string
          currency?: string
          fulfillment_status?: string
          id?: string
          order_status?: string
          price_cents?: number
          product_id?: string | null
          provider?: string
          provider_payment_id?: string | null
          quantity?: number
          refund_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_product_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "creator_products"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_products: {
        Row: {
          created_at: string
          creator_id: string
          currency: string
          description: string | null
          id: string
          image_path: string | null
          inventory_mode: string
          inventory_quantity: number | null
          price_cents: number
          product_type: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          creator_id: string
          currency?: string
          description?: string | null
          id?: string
          image_path?: string | null
          inventory_mode?: string
          inventory_quantity?: number | null
          price_cents: number
          product_type?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          creator_id?: string
          currency?: string
          description?: string | null
          id?: string
          image_path?: string | null
          inventory_mode?: string
          inventory_quantity?: number | null
          price_cents?: number
          product_type?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      creator_revenue_share_ledger_entries: {
        Row: {
          channel_user_id: string | null
          created_at: string
          creator_share_bps: number | null
          creator_share_cents: number
          creator_user_id: string | null
          currency: string
          gross_amount_cents: number
          id: string
          metadata: Json
          net_amount_cents: number
          payable_status: string
          payout_ledger_entry_id: number | null
          platform_share_bps: number | null
          platform_share_cents: number
          source_id: string | null
          source_provider: string | null
          source_type: string
          sponsor_deal_id: number | null
          sponsor_payment_record_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          channel_user_id?: string | null
          created_at?: string
          creator_share_bps?: number | null
          creator_share_cents?: number
          creator_user_id?: string | null
          currency?: string
          gross_amount_cents?: number
          id?: string
          metadata?: Json
          net_amount_cents?: number
          payable_status?: string
          payout_ledger_entry_id?: number | null
          platform_share_bps?: number | null
          platform_share_cents?: number
          source_id?: string | null
          source_provider?: string | null
          source_type: string
          sponsor_deal_id?: number | null
          sponsor_payment_record_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          channel_user_id?: string | null
          created_at?: string
          creator_share_bps?: number | null
          creator_share_cents?: number
          creator_user_id?: string | null
          currency?: string
          gross_amount_cents?: number
          id?: string
          metadata?: Json
          net_amount_cents?: number
          payable_status?: string
          payout_ledger_entry_id?: number | null
          platform_share_bps?: number | null
          platform_share_cents?: number
          source_id?: string | null
          source_provider?: string | null
          source_type?: string
          sponsor_deal_id?: number | null
          sponsor_payment_record_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_revenue_share_ledger_ent_sponsor_payment_record_id_fkey"
            columns: ["sponsor_payment_record_id"]
            isOneToOne: false
            referencedRelation: "sponsor_payment_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_revenue_share_ledger_entrie_payout_ledger_entry_id_fkey"
            columns: ["payout_ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "creator_payout_ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_revenue_share_ledger_entries_sponsor_deal_id_fkey"
            columns: ["sponsor_deal_id"]
            isOneToOne: false
            referencedRelation: "sponsor_deal_records"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_revenue_share_rules: {
        Row: {
          created_at: string
          creator_share_bps: number
          display_name: string
          id: string
          metadata: Json
          platform_share_bps: number
          rule_key: string
          source_type: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          creator_share_bps: number
          display_name: string
          id?: string
          metadata?: Json
          platform_share_bps: number
          rule_key: string
          source_type: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          creator_share_bps?: number
          display_name?: string
          id?: string
          metadata?: Json
          platform_share_bps?: number
          rule_key?: string
          source_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      creator_revenue_source_import_records: {
        Row: {
          created_at: string
          currency: string
          fee_amount_cents: number
          gross_amount_cents: number
          id: string
          idempotency_key: string | null
          metadata: Json
          net_amount_cents: number
          provider: string
          provider_event_id: string | null
          provider_reference: string | null
          reconciliation_status: string
          source_period_end: string | null
          source_period_start: string | null
          source_type: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          fee_amount_cents?: number
          gross_amount_cents?: number
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          net_amount_cents?: number
          provider?: string
          provider_event_id?: string | null
          provider_reference?: string | null
          reconciliation_status?: string
          source_period_end?: string | null
          source_period_start?: string | null
          source_type?: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          fee_amount_cents?: number
          gross_amount_cents?: number
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          net_amount_cents?: number
          provider?: string
          provider_event_id?: string | null
          provider_reference?: string | null
          reconciliation_status?: string
          source_period_end?: string | null
          source_period_start?: string | null
          source_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      creator_tip_transactions: {
        Row: {
          created_at: string
          creator_id: string
          currency: string
          id: string
          payment_status: string
          payout_status: string
          provider: string
          provider_fee_cents: number
          provider_payment_id: string | null
          sender_id: string
          service_fee_cents: number
          tip_amount_cents: number
          total_paid_cents: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          creator_id: string
          currency?: string
          id?: string
          payment_status?: string
          payout_status?: string
          provider?: string
          provider_fee_cents?: number
          provider_payment_id?: string | null
          sender_id: string
          service_fee_cents?: number
          tip_amount_cents: number
          total_paid_cents: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          creator_id?: string
          currency?: string
          id?: string
          payment_status?: string
          payout_status?: string
          provider?: string
          provider_fee_cents?: number
          provider_payment_id?: string | null
          sender_id?: string
          service_fee_cents?: number
          tip_amount_cents?: number
          total_paid_cents?: number
          updated_at?: string
        }
        Relationships: []
      }
      creator_video_comments: {
        Row: {
          body: string
          created_at: string
          deleted_at: string | null
          id: string
          moderated_at: string | null
          moderated_by: string | null
          moderation_reason: string | null
          moderation_status: string
          parent_comment_id: string | null
          updated_at: string
          user_id: string
          video_id: string
        }
        Insert: {
          body: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_status?: string
          parent_comment_id?: string | null
          updated_at?: string
          user_id: string
          video_id: string
        }
        Update: {
          body?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_status?: string
          parent_comment_id?: string | null
          updated_at?: string
          user_id?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_video_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "creator_video_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_video_comments_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      discovery_feed_item_blocks: {
        Row: {
          blocked_user_id: string
          created_at: string
          feed_item_id: string
          id: string
          metadata: Json
          reason: string
        }
        Insert: {
          blocked_user_id: string
          created_at?: string
          feed_item_id: string
          id?: string
          metadata?: Json
          reason?: string
        }
        Update: {
          blocked_user_id?: string
          created_at?: string
          feed_item_id?: string
          id?: string
          metadata?: Json
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "discovery_feed_item_blocks_feed_item_id_fkey"
            columns: ["feed_item_id"]
            isOneToOne: false
            referencedRelation: "discovery_feed_items"
            referencedColumns: ["id"]
          },
        ]
      }
      discovery_feed_items: {
        Row: {
          access_type: string
          ad_policy: string
          allow_live_reaction_rooms: boolean
          allow_public_share: boolean
          allow_replay_watch_party: boolean
          allow_spectator_view: boolean
          allow_watch_party_from_spectator: boolean
          category_key: string | null
          channel_user_id: string | null
          circle_signal_user_id: string | null
          created_at: string
          discovery_surface: string
          ended_at: string | null
          event_id: string | null
          follow_signal_user_id: string | null
          host_user_id: string | null
          id: string
          is_publicly_discoverable: boolean
          is_spectator_enabled: boolean
          is_spectator_playback_enabled: boolean
          item_type: string
          live_state: string
          media_id: string | null
          metadata: Json
          moderation_status: string
          owner_user_id: string | null
          published_at: string | null
          ranking_reason: string | null
          ranking_score: number
          requires_premium_to_join: boolean
          requires_subscription_to_watch: boolean
          requires_ticket_to_watch: boolean
          rights_status: string
          room_id: string | null
          source_id: string | null
          source_type: string
          starts_at: string | null
          subtitle: string | null
          thumbnail_url: string | null
          title: string | null
          updated_at: string
          visibility: string
        }
        Insert: {
          access_type?: string
          ad_policy?: string
          allow_live_reaction_rooms?: boolean
          allow_public_share?: boolean
          allow_replay_watch_party?: boolean
          allow_spectator_view?: boolean
          allow_watch_party_from_spectator?: boolean
          category_key?: string | null
          channel_user_id?: string | null
          circle_signal_user_id?: string | null
          created_at?: string
          discovery_surface?: string
          ended_at?: string | null
          event_id?: string | null
          follow_signal_user_id?: string | null
          host_user_id?: string | null
          id?: string
          is_publicly_discoverable?: boolean
          is_spectator_enabled?: boolean
          is_spectator_playback_enabled?: boolean
          item_type: string
          live_state?: string
          media_id?: string | null
          metadata?: Json
          moderation_status?: string
          owner_user_id?: string | null
          published_at?: string | null
          ranking_reason?: string | null
          ranking_score?: number
          requires_premium_to_join?: boolean
          requires_subscription_to_watch?: boolean
          requires_ticket_to_watch?: boolean
          rights_status?: string
          room_id?: string | null
          source_id?: string | null
          source_type: string
          starts_at?: string | null
          subtitle?: string | null
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string
          visibility?: string
        }
        Update: {
          access_type?: string
          ad_policy?: string
          allow_live_reaction_rooms?: boolean
          allow_public_share?: boolean
          allow_replay_watch_party?: boolean
          allow_spectator_view?: boolean
          allow_watch_party_from_spectator?: boolean
          category_key?: string | null
          channel_user_id?: string | null
          circle_signal_user_id?: string | null
          created_at?: string
          discovery_surface?: string
          ended_at?: string | null
          event_id?: string | null
          follow_signal_user_id?: string | null
          host_user_id?: string | null
          id?: string
          is_publicly_discoverable?: boolean
          is_spectator_enabled?: boolean
          is_spectator_playback_enabled?: boolean
          item_type?: string
          live_state?: string
          media_id?: string | null
          metadata?: Json
          moderation_status?: string
          owner_user_id?: string | null
          published_at?: string | null
          ranking_reason?: string | null
          ranking_score?: number
          requires_premium_to_join?: boolean
          requires_subscription_to_watch?: boolean
          requires_ticket_to_watch?: boolean
          rights_status?: string
          room_id?: string | null
          source_id?: string | null
          source_type?: string
          starts_at?: string | null
          subtitle?: string | null
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string
          visibility?: string
        }
        Relationships: []
      }
      dmca_attachments: {
        Row: {
          bucket_id: string
          counter_notice_id: string | null
          created_at: string
          dmca_case_id: string
          id: string
          mime_type: string
          object_path: string
          original_filename: string
          preserved_for_evidence: boolean
          retention_status: string
          scan_notes: string
          scan_provider: string
          scan_status: string
          security_context_id: string | null
          size_bytes: number
          source: string
          submitted_by_role: string
          submitted_by_user_id: string | null
          updated_at: string
        }
        Insert: {
          bucket_id?: string
          counter_notice_id?: string | null
          created_at?: string
          dmca_case_id: string
          id?: string
          mime_type: string
          object_path: string
          original_filename: string
          preserved_for_evidence?: boolean
          retention_status?: string
          scan_notes?: string
          scan_provider?: string
          scan_status?: string
          security_context_id?: string | null
          size_bytes: number
          source: string
          submitted_by_role: string
          submitted_by_user_id?: string | null
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          counter_notice_id?: string | null
          created_at?: string
          dmca_case_id?: string
          id?: string
          mime_type?: string
          object_path?: string
          original_filename?: string
          preserved_for_evidence?: boolean
          retention_status?: string
          scan_notes?: string
          scan_provider?: string
          scan_status?: string
          security_context_id?: string | null
          size_bytes?: number
          source?: string
          submitted_by_role?: string
          submitted_by_user_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dmca_attachments_case_fkey"
            columns: ["dmca_case_id"]
            isOneToOne: false
            referencedRelation: "dmca_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dmca_attachments_counter_notice_fkey"
            columns: ["counter_notice_id"]
            isOneToOne: false
            referencedRelation: "dmca_counter_notices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dmca_attachments_security_context_id_fkey"
            columns: ["security_context_id"]
            isOneToOne: false
            referencedRelation: "security_request_context"
            referencedColumns: ["id"]
          },
        ]
      }
      dmca_audit_log: {
        Row: {
          actor_role: string
          actor_user_id: string | null
          created_at: string
          dmca_case_id: string | null
          event_type: string
          id: string
          metadata: Json | null
          reason: string | null
          security_context_id: string | null
        }
        Insert: {
          actor_role: string
          actor_user_id?: string | null
          created_at?: string
          dmca_case_id?: string | null
          event_type: string
          id?: string
          metadata?: Json | null
          reason?: string | null
          security_context_id?: string | null
        }
        Update: {
          actor_role?: string
          actor_user_id?: string | null
          created_at?: string
          dmca_case_id?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
          reason?: string | null
          security_context_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dmca_audit_log_case_fkey"
            columns: ["dmca_case_id"]
            isOneToOne: false
            referencedRelation: "dmca_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dmca_audit_log_security_context_id_fkey"
            columns: ["security_context_id"]
            isOneToOne: false
            referencedRelation: "security_request_context"
            referencedColumns: ["id"]
          },
        ]
      }
      dmca_cases: {
        Row: {
          accuracy_penalty_perjury_statement: boolean
          admin_notes: string | null
          allegedly_infringing_content_id: string | null
          allegedly_infringing_content_type: string
          allegedly_infringing_material_description: string | null
          allegedly_infringing_url: string | null
          assigned_admin_id: string | null
          authorized_agent_name: string | null
          case_number: string
          closed_at: string | null
          copyright_owner_name: string | null
          copyrighted_work_description: string
          copyrighted_work_urls: Json
          created_at: string
          electronic_signature: string
          good_faith_statement: boolean
          id: string
          is_test_case: boolean
          public_attachment_token: string | null
          public_safe_summary: string | null
          received_at: string
          report_type: string
          reporter_address: string | null
          reporter_company: string | null
          reporter_email: string
          reporter_is_owner: boolean
          reporter_name: string
          reporter_phone: string | null
          reporter_user_id: string | null
          security_context_id: string | null
          source: string
          status: string
          submitted_ip_hash: string | null
          submitted_user_agent_hash: string | null
          updated_at: string
          uploader_channel_id: string | null
          uploader_user_id: string | null
        }
        Insert: {
          accuracy_penalty_perjury_statement?: boolean
          admin_notes?: string | null
          allegedly_infringing_content_id?: string | null
          allegedly_infringing_content_type?: string
          allegedly_infringing_material_description?: string | null
          allegedly_infringing_url?: string | null
          assigned_admin_id?: string | null
          authorized_agent_name?: string | null
          case_number: string
          closed_at?: string | null
          copyright_owner_name?: string | null
          copyrighted_work_description: string
          copyrighted_work_urls?: Json
          created_at?: string
          electronic_signature: string
          good_faith_statement?: boolean
          id?: string
          is_test_case?: boolean
          public_attachment_token?: string | null
          public_safe_summary?: string | null
          received_at?: string
          report_type?: string
          reporter_address?: string | null
          reporter_company?: string | null
          reporter_email: string
          reporter_is_owner?: boolean
          reporter_name: string
          reporter_phone?: string | null
          reporter_user_id?: string | null
          security_context_id?: string | null
          source?: string
          status?: string
          submitted_ip_hash?: string | null
          submitted_user_agent_hash?: string | null
          updated_at?: string
          uploader_channel_id?: string | null
          uploader_user_id?: string | null
        }
        Update: {
          accuracy_penalty_perjury_statement?: boolean
          admin_notes?: string | null
          allegedly_infringing_content_id?: string | null
          allegedly_infringing_content_type?: string
          allegedly_infringing_material_description?: string | null
          allegedly_infringing_url?: string | null
          assigned_admin_id?: string | null
          authorized_agent_name?: string | null
          case_number?: string
          closed_at?: string | null
          copyright_owner_name?: string | null
          copyrighted_work_description?: string
          copyrighted_work_urls?: Json
          created_at?: string
          electronic_signature?: string
          good_faith_statement?: boolean
          id?: string
          is_test_case?: boolean
          public_attachment_token?: string | null
          public_safe_summary?: string | null
          received_at?: string
          report_type?: string
          reporter_address?: string | null
          reporter_company?: string | null
          reporter_email?: string
          reporter_is_owner?: boolean
          reporter_name?: string
          reporter_phone?: string | null
          reporter_user_id?: string | null
          security_context_id?: string | null
          source?: string
          status?: string
          submitted_ip_hash?: string | null
          submitted_user_agent_hash?: string | null
          updated_at?: string
          uploader_channel_id?: string | null
          uploader_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dmca_cases_security_context_id_fkey"
            columns: ["security_context_id"]
            isOneToOne: false
            referencedRelation: "security_request_context"
            referencedColumns: ["id"]
          },
        ]
      }
      dmca_content_actions: {
        Row: {
          action: string
          actor_admin_id: string
          content_id: string
          content_type: string
          created_at: string
          dmca_case_id: string
          id: string
          new_state: Json | null
          previous_state: Json | null
          reason: string
        }
        Insert: {
          action: string
          actor_admin_id: string
          content_id: string
          content_type: string
          created_at?: string
          dmca_case_id: string
          id?: string
          new_state?: Json | null
          previous_state?: Json | null
          reason: string
        }
        Update: {
          action?: string
          actor_admin_id?: string
          content_id?: string
          content_type?: string
          created_at?: string
          dmca_case_id?: string
          id?: string
          new_state?: Json | null
          previous_state?: Json | null
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "dmca_content_actions_case_fkey"
            columns: ["dmca_case_id"]
            isOneToOne: false
            referencedRelation: "dmca_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      dmca_counter_notices: {
        Row: {
          court_action_notice_received_at: string | null
          created_at: string
          dmca_case_id: string
          electronic_signature: string
          forwarded_to_claimant_at: string | null
          good_faith_mistake_statement: boolean
          id: string
          jurisdiction_consent_statement: boolean
          received_at: string
          removed_material_description: string
          removed_material_url_or_location: string
          response_deadline_start_at: string | null
          restore_not_after_at: string | null
          restore_not_before_at: string | null
          security_context_id: string | null
          service_acceptance_statement: boolean
          status: string
          submitter_address: string | null
          submitter_email: string
          submitter_name: string
          submitter_phone: string | null
          submitter_user_id: string | null
          updated_at: string
        }
        Insert: {
          court_action_notice_received_at?: string | null
          created_at?: string
          dmca_case_id: string
          electronic_signature: string
          forwarded_to_claimant_at?: string | null
          good_faith_mistake_statement?: boolean
          id?: string
          jurisdiction_consent_statement?: boolean
          received_at?: string
          removed_material_description: string
          removed_material_url_or_location: string
          response_deadline_start_at?: string | null
          restore_not_after_at?: string | null
          restore_not_before_at?: string | null
          security_context_id?: string | null
          service_acceptance_statement?: boolean
          status?: string
          submitter_address?: string | null
          submitter_email: string
          submitter_name: string
          submitter_phone?: string | null
          submitter_user_id?: string | null
          updated_at?: string
        }
        Update: {
          court_action_notice_received_at?: string | null
          created_at?: string
          dmca_case_id?: string
          electronic_signature?: string
          forwarded_to_claimant_at?: string | null
          good_faith_mistake_statement?: boolean
          id?: string
          jurisdiction_consent_statement?: boolean
          received_at?: string
          removed_material_description?: string
          removed_material_url_or_location?: string
          response_deadline_start_at?: string | null
          restore_not_after_at?: string | null
          restore_not_before_at?: string | null
          security_context_id?: string | null
          service_acceptance_statement?: boolean
          status?: string
          submitter_address?: string | null
          submitter_email?: string
          submitter_name?: string
          submitter_phone?: string | null
          submitter_user_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dmca_counter_notices_case_fkey"
            columns: ["dmca_case_id"]
            isOneToOne: false
            referencedRelation: "dmca_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dmca_counter_notices_security_context_id_fkey"
            columns: ["security_context_id"]
            isOneToOne: false
            referencedRelation: "security_request_context"
            referencedColumns: ["id"]
          },
        ]
      }
      dmca_strikes: {
        Row: {
          channel_id: string | null
          content_id: string
          content_type: string
          created_at: string
          dmca_case_id: string
          id: string
          reason: string
          removed_at: string | null
          removed_reason: string | null
          severity: string
          strike_status: string
          user_id: string
        }
        Insert: {
          channel_id?: string | null
          content_id: string
          content_type: string
          created_at?: string
          dmca_case_id: string
          id?: string
          reason: string
          removed_at?: string | null
          removed_reason?: string | null
          severity?: string
          strike_status?: string
          user_id: string
        }
        Update: {
          channel_id?: string | null
          content_id?: string
          content_type?: string
          created_at?: string
          dmca_case_id?: string
          id?: string
          reason?: string
          removed_at?: string | null
          removed_reason?: string | null
          severity?: string
          strike_status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dmca_strikes_case_fkey"
            columns: ["dmca_case_id"]
            isOneToOne: false
            referencedRelation: "dmca_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      event_reminders: {
        Row: {
          created_at: string
          event_id: string
          id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_reminders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "creator_events"
            referencedColumns: ["id"]
          },
        ]
      }
      fraud_action_records: {
        Row: {
          action_type: string
          created_at: string
          enforcement_policy_id: string | null
          executed_at: string | null
          execution_status: string
          fraud_hold_id: number
          id: string
          metadata: Json
          reason: string | null
          status: string
          target_area: string
          updated_at: string
        }
        Insert: {
          action_type: string
          created_at?: string
          enforcement_policy_id?: string | null
          executed_at?: string | null
          execution_status?: string
          fraud_hold_id: number
          id?: string
          metadata?: Json
          reason?: string | null
          status?: string
          target_area?: string
          updated_at?: string
        }
        Update: {
          action_type?: string
          created_at?: string
          enforcement_policy_id?: string | null
          executed_at?: string | null
          execution_status?: string
          fraud_hold_id?: number
          id?: string
          metadata?: Json
          reason?: string | null
          status?: string
          target_area?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fraud_action_records_enforcement_policy_fkey"
            columns: ["enforcement_policy_id"]
            isOneToOne: false
            referencedRelation: "fraud_enforcement_policy_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fraud_action_records_hold_fkey"
            columns: ["fraud_hold_id"]
            isOneToOne: false
            referencedRelation: "platform_fraud_holds"
            referencedColumns: ["id"]
          },
        ]
      }
      fraud_appeal_records: {
        Row: {
          created_at: string
          fraud_hold_id: number
          id: string
          message: string | null
          metadata: Json
          status: string
          submitted_by_user_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          fraud_hold_id: number
          id?: string
          message?: string | null
          metadata?: Json
          status?: string
          submitted_by_user_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          fraud_hold_id?: number
          id?: string
          message?: string | null
          metadata?: Json
          status?: string
          submitted_by_user_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fraud_appeal_records_hold_fkey"
            columns: ["fraud_hold_id"]
            isOneToOne: false
            referencedRelation: "platform_fraud_holds"
            referencedColumns: ["id"]
          },
        ]
      }
      fraud_audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          fraud_hold_id: number | null
          id: string
          metadata: Json
          reason: string | null
          security_context_id: string | null
          target_id: string | null
          target_table: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          fraud_hold_id?: number | null
          id?: string
          metadata?: Json
          reason?: string | null
          security_context_id?: string | null
          target_id?: string | null
          target_table?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          fraud_hold_id?: number | null
          id?: string
          metadata?: Json
          reason?: string | null
          security_context_id?: string | null
          target_id?: string | null
          target_table?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fraud_audit_logs_hold_fkey"
            columns: ["fraud_hold_id"]
            isOneToOne: false
            referencedRelation: "platform_fraud_holds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fraud_audit_logs_security_context_id_fkey"
            columns: ["security_context_id"]
            isOneToOne: false
            referencedRelation: "security_request_context"
            referencedColumns: ["id"]
          },
        ]
      }
      fraud_enforcement_policy_records: {
        Row: {
          action_type: string
          created_at: string
          display_name: string
          id: string
          metadata: Json
          policy_key: string
          requires_admin_reason: boolean
          requires_appeal_path: boolean
          requires_audit_log: boolean
          requires_review: boolean
          status: string
          target_area: string
          updated_at: string
        }
        Insert: {
          action_type: string
          created_at?: string
          display_name: string
          id?: string
          metadata?: Json
          policy_key: string
          requires_admin_reason?: boolean
          requires_appeal_path?: boolean
          requires_audit_log?: boolean
          requires_review?: boolean
          status?: string
          target_area: string
          updated_at?: string
        }
        Update: {
          action_type?: string
          created_at?: string
          display_name?: string
          id?: string
          metadata?: Json
          policy_key?: string
          requires_admin_reason?: boolean
          requires_appeal_path?: boolean
          requires_audit_log?: boolean
          requires_review?: boolean
          status?: string
          target_area?: string
          updated_at?: string
        }
        Relationships: []
      }
      fraud_evidence_records: {
        Row: {
          created_at: string
          description: string | null
          evidence_type: string
          fraud_hold_id: number
          id: string
          metadata: Json
          source_id: string | null
          source_table: string | null
          title: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          evidence_type: string
          fraud_hold_id: number
          id?: string
          metadata?: Json
          source_id?: string | null
          source_table?: string | null
          title?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          evidence_type?: string
          fraud_hold_id?: number
          id?: string
          metadata?: Json
          source_id?: string | null
          source_table?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fraud_evidence_records_hold_fkey"
            columns: ["fraud_hold_id"]
            isOneToOne: false
            referencedRelation: "platform_fraud_holds"
            referencedColumns: ["id"]
          },
        ]
      }
      fraud_reason_records: {
        Row: {
          created_at: string
          description: string | null
          display_name: string
          id: string
          metadata: Json
          reason_key: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_name: string
          id?: string
          metadata?: Json
          reason_key: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_name?: string
          id?: string
          metadata?: Json
          reason_key?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      fraud_review_notes: {
        Row: {
          actor_user_id: string | null
          created_at: string
          fraud_hold_id: number
          id: string
          metadata: Json
          note: string
          review_status: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          fraud_hold_id: number
          id?: string
          metadata?: Json
          note: string
          review_status?: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          fraud_hold_id?: number
          id?: string
          metadata?: Json
          note?: string
          review_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "fraud_review_notes_hold_fkey"
            columns: ["fraud_hold_id"]
            isOneToOne: false
            referencedRelation: "platform_fraud_holds"
            referencedColumns: ["id"]
          },
        ]
      }
      fraud_review_queue_records: {
        Row: {
          assigned_to_user_id: string | null
          created_at: string
          fraud_hold_id: number | null
          id: string
          metadata: Json
          priority: string
          review_notes: string | null
          review_reason: string | null
          review_status: string
          review_type: string
          target_channel_user_id: string | null
          target_user_id: string | null
          updated_at: string
        }
        Insert: {
          assigned_to_user_id?: string | null
          created_at?: string
          fraud_hold_id?: number | null
          id?: string
          metadata?: Json
          priority?: string
          review_notes?: string | null
          review_reason?: string | null
          review_status?: string
          review_type?: string
          target_channel_user_id?: string | null
          target_user_id?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to_user_id?: string | null
          created_at?: string
          fraud_hold_id?: number | null
          id?: string
          metadata?: Json
          priority?: string
          review_notes?: string | null
          review_reason?: string | null
          review_status?: string
          review_type?: string
          target_channel_user_id?: string | null
          target_user_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fraud_review_queue_records_fraud_hold_id_fkey"
            columns: ["fraud_hold_id"]
            isOneToOne: false
            referencedRelation: "platform_fraud_holds"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_evidence_audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_role: string | null
          actor_user_id: string | null
          created_at: string
          id: string
          metadata: Json
          reason: string
          request_id: string | null
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_role?: string | null
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          reason: string
          request_id?: string | null
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_role?: string | null
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          reason?: string
          request_id?: string | null
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      legal_evidence_requests: {
        Row: {
          completed_at: string | null
          created_at: string
          export_hash: string | null
          export_manifest: Json | null
          id: string
          legal_request_id: string | null
          preview: Json
          reason: string
          request_kind: string
          requested_by_email: string | null
          requested_by_user_id: string | null
          search_scope: Json
          status: string
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          export_hash?: string | null
          export_manifest?: Json | null
          id?: string
          legal_request_id?: string | null
          preview?: Json
          reason: string
          request_kind: string
          requested_by_email?: string | null
          requested_by_user_id?: string | null
          search_scope?: Json
          status?: string
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          export_hash?: string | null
          export_manifest?: Json | null
          id?: string
          legal_request_id?: string | null
          preview?: Json
          reason?: string
          request_kind?: string
          requested_by_email?: string | null
          requested_by_user_id?: string | null
          search_scope?: Json
          status?: string
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "legal_evidence_requests_legal_request_id_fkey"
            columns: ["legal_request_id"]
            isOneToOne: false
            referencedRelation: "legal_request_intake"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_holds: {
        Row: {
          id: string
          legal_request_id: string | null
          metadata: Json
          placed_at: string
          placed_by_email: string | null
          placed_by_user_id: string | null
          reason: string
          release_reason: string | null
          released_at: string | null
          released_by_email: string | null
          released_by_user_id: string | null
          status: string
          target_id: string
          target_type: string
        }
        Insert: {
          id?: string
          legal_request_id?: string | null
          metadata?: Json
          placed_at?: string
          placed_by_email?: string | null
          placed_by_user_id?: string | null
          reason: string
          release_reason?: string | null
          released_at?: string | null
          released_by_email?: string | null
          released_by_user_id?: string | null
          status?: string
          target_id: string
          target_type: string
        }
        Update: {
          id?: string
          legal_request_id?: string | null
          metadata?: Json
          placed_at?: string
          placed_by_email?: string | null
          placed_by_user_id?: string | null
          reason?: string
          release_reason?: string | null
          released_at?: string | null
          released_by_email?: string | null
          released_by_user_id?: string | null
          status?: string
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "legal_holds_legal_request_id_fkey"
            columns: ["legal_request_id"]
            isOneToOne: false
            referencedRelation: "legal_request_intake"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_request_events: {
        Row: {
          actor_email: string | null
          actor_role: string | null
          actor_user_id: string | null
          created_at: string
          event_type: string
          id: string
          legal_request_id: string
          message: string | null
          metadata: Json
          reason: string | null
        }
        Insert: {
          actor_email?: string | null
          actor_role?: string | null
          actor_user_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          legal_request_id: string
          message?: string | null
          metadata?: Json
          reason?: string | null
        }
        Update: {
          actor_email?: string | null
          actor_role?: string | null
          actor_user_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          legal_request_id?: string
          message?: string | null
          metadata?: Json
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "legal_request_events_legal_request_id_fkey"
            columns: ["legal_request_id"]
            isOneToOne: false
            referencedRelation: "legal_request_intake"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_request_intake: {
        Row: {
          case_number: string | null
          closed_at: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          date_from: string | null
          date_to: string | null
          due_at: string | null
          exported_summary: string | null
          handled_by_email: string | null
          handled_by_user_id: string | null
          id: string
          legal_hold_status: string
          metadata: Json
          notes: string | null
          reopened_at: string | null
          request_reason: string
          request_type: string
          requesting_agency: string
          reviewed_summary: string | null
          status: string
          target_content_id: string | null
          target_report_id: string | null
          target_room_id: string | null
          target_thread_id: string | null
          target_user_id: string | null
          updated_at: string
        }
        Insert: {
          case_number?: string | null
          closed_at?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          date_from?: string | null
          date_to?: string | null
          due_at?: string | null
          exported_summary?: string | null
          handled_by_email?: string | null
          handled_by_user_id?: string | null
          id?: string
          legal_hold_status?: string
          metadata?: Json
          notes?: string | null
          reopened_at?: string | null
          request_reason: string
          request_type?: string
          requesting_agency: string
          reviewed_summary?: string | null
          status?: string
          target_content_id?: string | null
          target_report_id?: string | null
          target_room_id?: string | null
          target_thread_id?: string | null
          target_user_id?: string | null
          updated_at?: string
        }
        Update: {
          case_number?: string | null
          closed_at?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          date_from?: string | null
          date_to?: string | null
          due_at?: string | null
          exported_summary?: string | null
          handled_by_email?: string | null
          handled_by_user_id?: string | null
          id?: string
          legal_hold_status?: string
          metadata?: Json
          notes?: string | null
          reopened_at?: string | null
          request_reason?: string
          request_type?: string
          requesting_agency?: string
          reviewed_summary?: string | null
          status?: string
          target_content_id?: string | null
          target_report_id?: string | null
          target_room_id?: string | null
          target_thread_id?: string | null
          target_user_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      livekit_room_assignments: {
        Row: {
          app_room_id: string
          assigned_server_id: string
          assignment_reason: string
          assignment_status: string
          created_at: string
          created_by: string | null
          ended_at: string | null
          id: string
          is_publicly_eligible: boolean
          livekit_room_name: string
          metadata: Json
          room_type: string
          updated_at: string
          visibility: string | null
        }
        Insert: {
          app_room_id: string
          assigned_server_id: string
          assignment_reason: string
          assignment_status?: string
          created_at?: string
          created_by?: string | null
          ended_at?: string | null
          id?: string
          is_publicly_eligible?: boolean
          livekit_room_name: string
          metadata?: Json
          room_type: string
          updated_at?: string
          visibility?: string | null
        }
        Update: {
          app_room_id?: string
          assigned_server_id?: string
          assignment_reason?: string
          assignment_status?: string
          created_at?: string
          created_by?: string | null
          ended_at?: string | null
          id?: string
          is_publicly_eligible?: boolean
          livekit_room_name?: string
          metadata?: Json
          room_type?: string
          updated_at?: string
          visibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "livekit_room_assignments_assigned_server_id_fkey"
            columns: ["assigned_server_id"]
            isOneToOne: false
            referencedRelation: "livekit_servers"
            referencedColumns: ["id"]
          },
        ]
      }
      livekit_routing_audit: {
        Row: {
          actor_user_id: string | null
          app_room_id: string | null
          created_at: string
          event_type: string
          id: string
          livekit_room_name: string | null
          metadata: Json
          reason: string
          server_id: string | null
        }
        Insert: {
          actor_user_id?: string | null
          app_room_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          livekit_room_name?: string | null
          metadata?: Json
          reason: string
          server_id?: string | null
        }
        Update: {
          actor_user_id?: string | null
          app_room_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          livekit_room_name?: string | null
          metadata?: Json
          reason?: string
          server_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "livekit_routing_audit_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "livekit_servers"
            referencedColumns: ["id"]
          },
        ]
      }
      livekit_server_heartbeats: {
        Row: {
          active_participants: number
          active_publishers: number
          active_rooms: number
          bandwidth_in_mbps: number | null
          bandwidth_out_mbps: number | null
          cpu_percent: number | null
          disconnect_rate: number | null
          heartbeat_at: string
          id: string
          packet_loss_percent: number | null
          ram_percent: number | null
          server_id: string
        }
        Insert: {
          active_participants?: number
          active_publishers?: number
          active_rooms?: number
          bandwidth_in_mbps?: number | null
          bandwidth_out_mbps?: number | null
          cpu_percent?: number | null
          disconnect_rate?: number | null
          heartbeat_at?: string
          id?: string
          packet_loss_percent?: number | null
          ram_percent?: number | null
          server_id: string
        }
        Update: {
          active_participants?: number
          active_publishers?: number
          active_rooms?: number
          bandwidth_in_mbps?: number | null
          bandwidth_out_mbps?: number | null
          cpu_percent?: number | null
          disconnect_rate?: number | null
          heartbeat_at?: string
          id?: string
          packet_loss_percent?: number | null
          ram_percent?: number | null
          server_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "livekit_server_heartbeats_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "livekit_servers"
            referencedColumns: ["id"]
          },
        ]
      }
      livekit_servers: {
        Row: {
          bandwidth_in_mbps: number | null
          bandwidth_out_mbps: number | null
          cpu_percent: number | null
          created_at: string
          current_participants: number
          current_publishers: number
          current_rooms: number
          disconnect_rate: number | null
          display_name: string
          drain_reason: string | null
          drain_started_at: string | null
          id: string
          internal_api_url: string | null
          last_assignment_at: string | null
          last_heartbeat_at: string | null
          max_egress_mbps: number | null
          max_participants: number
          max_publishers: number | null
          max_rooms: number
          metadata: Json
          packet_loss_percent: number | null
          provider: string
          public_ws_url: string
          ram_percent: number | null
          region: string
          server_id: string
          status: string
          updated_at: string
          weight: number
        }
        Insert: {
          bandwidth_in_mbps?: number | null
          bandwidth_out_mbps?: number | null
          cpu_percent?: number | null
          created_at?: string
          current_participants?: number
          current_publishers?: number
          current_rooms?: number
          disconnect_rate?: number | null
          display_name: string
          drain_reason?: string | null
          drain_started_at?: string | null
          id?: string
          internal_api_url?: string | null
          last_assignment_at?: string | null
          last_heartbeat_at?: string | null
          max_egress_mbps?: number | null
          max_participants?: number
          max_publishers?: number | null
          max_rooms?: number
          metadata?: Json
          packet_loss_percent?: number | null
          provider?: string
          public_ws_url: string
          ram_percent?: number | null
          region: string
          server_id: string
          status?: string
          updated_at?: string
          weight?: number
        }
        Update: {
          bandwidth_in_mbps?: number | null
          bandwidth_out_mbps?: number | null
          cpu_percent?: number | null
          created_at?: string
          current_participants?: number
          current_publishers?: number
          current_rooms?: number
          disconnect_rate?: number | null
          display_name?: string
          drain_reason?: string | null
          drain_started_at?: string | null
          id?: string
          internal_api_url?: string | null
          last_assignment_at?: string | null
          last_heartbeat_at?: string | null
          max_egress_mbps?: number | null
          max_participants?: number
          max_publishers?: number | null
          max_rooms?: number
          metadata?: Json
          packet_loss_percent?: number | null
          provider?: string
          public_ws_url?: string
          ram_percent?: number | null
          region?: string
          server_id?: string
          status?: string
          updated_at?: string
          weight?: number
        }
        Relationships: []
      }
      livekit_token_request_audit: {
        Row: {
          action: string
          actor_user_id: string | null
          app_room_id_hash: string | null
          can_publish: boolean | null
          can_publish_data: boolean | null
          can_subscribe: boolean | null
          created_at: string
          effective_participant_role: string | null
          error_code: string | null
          id: string
          metadata: Json
          outcome: string
          requested_participant_role: string | null
          room_join: boolean | null
          room_kind: string | null
          room_name_hash: string | null
          room_type: string | null
          security_context_id: string | null
          surface: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          app_room_id_hash?: string | null
          can_publish?: boolean | null
          can_publish_data?: boolean | null
          can_subscribe?: boolean | null
          created_at?: string
          effective_participant_role?: string | null
          error_code?: string | null
          id?: string
          metadata?: Json
          outcome: string
          requested_participant_role?: string | null
          room_join?: boolean | null
          room_kind?: string | null
          room_name_hash?: string | null
          room_type?: string | null
          security_context_id?: string | null
          surface?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          app_room_id_hash?: string | null
          can_publish?: boolean | null
          can_publish_data?: boolean | null
          can_subscribe?: boolean | null
          created_at?: string
          effective_participant_role?: string | null
          error_code?: string | null
          id?: string
          metadata?: Json
          outcome?: string
          requested_participant_role?: string | null
          room_join?: boolean | null
          room_kind?: string | null
          room_name_hash?: string | null
          room_type?: string | null
          security_context_id?: string | null
          surface?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "livekit_token_request_audit_security_context_id_fkey"
            columns: ["security_context_id"]
            isOneToOne: false
            referencedRelation: "security_request_context"
            referencedColumns: ["id"]
          },
        ]
      }
      media_security_audit_events: {
        Row: {
          action: string
          actor_email: string | null
          actor_user_id: string | null
          created_at: string
          id: string
          metadata: Json
          object_key_owner: string | null
          reason: string | null
          record_id: string | null
          result: string
          security_context_id: string | null
          surface_type: string
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          object_key_owner?: string | null
          reason?: string | null
          record_id?: string | null
          result?: string
          security_context_id?: string | null
          surface_type: string
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          object_key_owner?: string | null
          reason?: string | null
          record_id?: string | null
          result?: string
          security_context_id?: string | null
          surface_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_security_audit_events_security_context_id_fkey"
            columns: ["security_context_id"]
            isOneToOne: false
            referencedRelation: "security_request_context"
            referencedColumns: ["id"]
          },
        ]
      }
      monetization_audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          id: string
          metadata: Json
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          target_id?: string | null
          target_type?: string
        }
        Relationships: []
      }
      monetization_system_settings: {
        Row: {
          cashout_enabled: boolean
          created_at: string
          creator_pricing_enabled: boolean
          id: boolean
          instant_cashout_fee_bps: number
          instant_cashout_fee_cap_cents: number | null
          live_money_enabled: boolean
          max_price_cents: number
          merch_store_enabled: boolean
          min_price_cents: number
          paid_content_checkout_enabled: boolean
          payout_hold_days_max: number
          payout_hold_days_min: number
          payouts_enabled: boolean
          premium_purchase_enabled: boolean
          scheduled_payout_fee_bps: number
          stripe_connect_production_enabled: boolean
          tips_enabled: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          cashout_enabled?: boolean
          created_at?: string
          creator_pricing_enabled?: boolean
          id?: boolean
          instant_cashout_fee_bps?: number
          instant_cashout_fee_cap_cents?: number | null
          live_money_enabled?: boolean
          max_price_cents?: number
          merch_store_enabled?: boolean
          min_price_cents?: number
          paid_content_checkout_enabled?: boolean
          payout_hold_days_max?: number
          payout_hold_days_min?: number
          payouts_enabled?: boolean
          premium_purchase_enabled?: boolean
          scheduled_payout_fee_bps?: number
          stripe_connect_production_enabled?: boolean
          tips_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          cashout_enabled?: boolean
          created_at?: string
          creator_pricing_enabled?: boolean
          id?: boolean
          instant_cashout_fee_bps?: number
          instant_cashout_fee_cap_cents?: number | null
          live_money_enabled?: boolean
          max_price_cents?: number
          merch_store_enabled?: boolean
          min_price_cents?: number
          paid_content_checkout_enabled?: boolean
          payout_hold_days_max?: number
          payout_hold_days_min?: number
          payouts_enabled?: boolean
          premium_purchase_enabled?: boolean
          scheduled_payout_fee_bps?: number
          stripe_connect_production_enabled?: boolean
          tips_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      monetization_webhook_events: {
        Row: {
          created_at: string
          event_id: string
          event_type: string
          id: string
          idempotency_key: string
          processed_at: string | null
          provider: string
          raw_event_hash: string
          status: string
        }
        Insert: {
          created_at?: string
          event_id: string
          event_type: string
          id?: string
          idempotency_key: string
          processed_at?: string | null
          provider: string
          raw_event_hash: string
          status?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          event_type?: string
          id?: string
          idempotency_key?: string
          processed_at?: string | null
          provider?: string
          raw_event_hash?: string
          status?: string
        }
        Relationships: []
      }
      network_account_plan_assignments: {
        Row: {
          created_at: string
          ends_at: string | null
          id: string
          metadata: Json
          network_account_id: number
          plan_id: string | null
          starts_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          ends_at?: string | null
          id?: string
          metadata?: Json
          network_account_id: number
          plan_id?: string | null
          starts_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          ends_at?: string | null
          id?: string
          metadata?: Json
          network_account_id?: number
          plan_id?: string | null
          starts_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "network_account_plan_assignments_account_fkey"
            columns: ["network_account_id"]
            isOneToOne: false
            referencedRelation: "network_billing_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "network_account_plan_assignments_plan_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "network_plan_records"
            referencedColumns: ["id"]
          },
        ]
      }
      network_billing_accounts: {
        Row: {
          billing_email: string | null
          billing_provider: string | null
          billing_provider_customer_id: string | null
          created_at: string
          display_name: string | null
          external_customer_reference: string | null
          id: number
          metadata: Json
          network_name: string | null
          network_owner_user_id: string | null
          plan_key: string | null
          status: string
          updated_at: string
        }
        Insert: {
          billing_email?: string | null
          billing_provider?: string | null
          billing_provider_customer_id?: string | null
          created_at?: string
          display_name?: string | null
          external_customer_reference?: string | null
          id?: number
          metadata?: Json
          network_name?: string | null
          network_owner_user_id?: string | null
          plan_key?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          billing_email?: string | null
          billing_provider?: string | null
          billing_provider_customer_id?: string | null
          created_at?: string
          display_name?: string | null
          external_customer_reference?: string | null
          id?: number
          metadata?: Json
          network_name?: string | null
          network_owner_user_id?: string | null
          plan_key?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      network_billing_audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          id: string
          metadata: Json
          network_account_id: number | null
          reason: string | null
          security_context_id: string | null
          target_id: string | null
          target_table: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          network_account_id?: number | null
          reason?: string | null
          security_context_id?: string | null
          target_id?: string | null
          target_table?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          network_account_id?: number | null
          reason?: string | null
          security_context_id?: string | null
          target_id?: string | null
          target_table?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "network_billing_audit_logs_account_fkey"
            columns: ["network_account_id"]
            isOneToOne: false
            referencedRelation: "network_billing_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "network_billing_audit_logs_security_context_id_fkey"
            columns: ["security_context_id"]
            isOneToOne: false
            referencedRelation: "security_request_context"
            referencedColumns: ["id"]
          },
        ]
      }
      network_invoice_line_items: {
        Row: {
          amount_cents: number
          created_at: string
          description: string
          id: string
          invoice_id: number
          line_type: string
          metadata: Json
          quantity: number
          status: string
          unit: string
          unit_amount_cents: number | null
          updated_at: string
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          description: string
          id?: string
          invoice_id: number
          line_type: string
          metadata?: Json
          quantity?: number
          status?: string
          unit: string
          unit_amount_cents?: number | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          description?: string
          id?: string
          invoice_id?: number
          line_type?: string
          metadata?: Json
          quantity?: number
          status?: string
          unit?: string
          unit_amount_cents?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "network_invoice_line_items_invoice_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "network_invoice_records"
            referencedColumns: ["id"]
          },
        ]
      }
      network_invoice_records: {
        Row: {
          amount_minor: number
          billing_provider: string | null
          billing_provider_invoice_id: string | null
          created_at: string
          currency: string
          id: number
          invoice_month: string | null
          invoice_number: string | null
          invoice_period_end: string | null
          invoice_period_start: string | null
          metadata: Json
          network_billing_account_id: number | null
          status: string
          subtotal_cents: number
          total_cents: number
          updated_at: string
        }
        Insert: {
          amount_minor?: number
          billing_provider?: string | null
          billing_provider_invoice_id?: string | null
          created_at?: string
          currency?: string
          id?: number
          invoice_month?: string | null
          invoice_number?: string | null
          invoice_period_end?: string | null
          invoice_period_start?: string | null
          metadata?: Json
          network_billing_account_id?: number | null
          status?: string
          subtotal_cents?: number
          total_cents?: number
          updated_at?: string
        }
        Update: {
          amount_minor?: number
          billing_provider?: string | null
          billing_provider_invoice_id?: string | null
          created_at?: string
          currency?: string
          id?: number
          invoice_month?: string | null
          invoice_number?: string | null
          invoice_period_end?: string | null
          invoice_period_start?: string | null
          metadata?: Json
          network_billing_account_id?: number | null
          status?: string
          subtotal_cents?: number
          total_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "network_invoice_records_account_fkey"
            columns: ["network_billing_account_id"]
            isOneToOne: false
            referencedRelation: "network_billing_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      network_overage_events: {
        Row: {
          actual_quantity: number | null
          created_at: string
          estimated_amount_cents: number | null
          id: string
          included_quantity: number | null
          metadata: Json
          network_account_id: number
          overage_quantity: number | null
          rate_cents_per_unit: number | null
          source: string
          status: string
          unit: string
          updated_at: string
          usage_key: string
          usage_period_end: string
          usage_period_start: string
        }
        Insert: {
          actual_quantity?: number | null
          created_at?: string
          estimated_amount_cents?: number | null
          id?: string
          included_quantity?: number | null
          metadata?: Json
          network_account_id: number
          overage_quantity?: number | null
          rate_cents_per_unit?: number | null
          source?: string
          status?: string
          unit: string
          updated_at?: string
          usage_key: string
          usage_period_end: string
          usage_period_start: string
        }
        Update: {
          actual_quantity?: number | null
          created_at?: string
          estimated_amount_cents?: number | null
          id?: string
          included_quantity?: number | null
          metadata?: Json
          network_account_id?: number
          overage_quantity?: number | null
          rate_cents_per_unit?: number | null
          source?: string
          status?: string
          unit?: string
          updated_at?: string
          usage_key?: string
          usage_period_end?: string
          usage_period_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "network_overage_events_account_fkey"
            columns: ["network_account_id"]
            isOneToOne: false
            referencedRelation: "network_billing_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      network_plan_records: {
        Row: {
          created_at: string
          currency: string
          display_name: string
          id: string
          included_bandwidth_tb: number | null
          included_live_participant_minutes: number | null
          included_storage_gb: number | null
          included_team_seats: number | null
          metadata: Json
          monthly_platform_fee_cents: number | null
          overage_bandwidth_cents_per_tb: number | null
          overage_participant_minute_cents: number | null
          overage_storage_cents_per_gb_month: number | null
          plan_key: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          display_name: string
          id?: string
          included_bandwidth_tb?: number | null
          included_live_participant_minutes?: number | null
          included_storage_gb?: number | null
          included_team_seats?: number | null
          metadata?: Json
          monthly_platform_fee_cents?: number | null
          overage_bandwidth_cents_per_tb?: number | null
          overage_participant_minute_cents?: number | null
          overage_storage_cents_per_gb_month?: number | null
          plan_key: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          display_name?: string
          id?: string
          included_bandwidth_tb?: number | null
          included_live_participant_minutes?: number | null
          included_storage_gb?: number | null
          included_team_seats?: number | null
          metadata?: Json
          monthly_platform_fee_cents?: number | null
          overage_bandwidth_cents_per_tb?: number | null
          overage_participant_minute_cents?: number | null
          overage_storage_cents_per_gb_month?: number | null
          plan_key?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      network_quota_records: {
        Row: {
          created_at: string
          id: string
          metadata: Json
          network_account_id: number
          period_end: string | null
          period_start: string | null
          plan_assignment_id: string | null
          quota_key: string
          quota_value: number
          status: string
          unit: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json
          network_account_id: number
          period_end?: string | null
          period_start?: string | null
          plan_assignment_id?: string | null
          quota_key: string
          quota_value?: number
          status?: string
          unit: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json
          network_account_id?: number
          period_end?: string | null
          period_start?: string | null
          plan_assignment_id?: string | null
          quota_key?: string
          quota_value?: number
          status?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "network_quota_records_account_fkey"
            columns: ["network_account_id"]
            isOneToOne: false
            referencedRelation: "network_billing_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "network_quota_records_assignment_fkey"
            columns: ["plan_assignment_id"]
            isOneToOne: false
            referencedRelation: "network_account_plan_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_delivery_attempts: {
        Row: {
          attempt_number: number
          created_at: string
          error_code: string | null
          error_message: string | null
          id: string
          notification_id: string | null
          provider: string
          provider_message_id: string | null
          push_token_id: string | null
          recipient_user_id: string
          status: string
        }
        Insert: {
          attempt_number?: number
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          notification_id?: string | null
          provider: string
          provider_message_id?: string | null
          push_token_id?: string | null
          recipient_user_id: string
          status: string
        }
        Update: {
          attempt_number?: number
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          notification_id?: string | null
          provider?: string
          provider_message_id?: string | null
          push_token_id?: string | null
          recipient_user_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_delivery_attempts_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_delivery_attempts_push_token_id_fkey"
            columns: ["push_token_id"]
            isOneToOne: false
            referencedRelation: "user_push_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_event_dedupes: {
        Row: {
          created_at: string
          dedupe_key: string
          notification_id: string | null
          recipient_user_id: string
          source_id: string
          source_type: string
          timing_key: string
          trigger_type: string
        }
        Insert: {
          created_at?: string
          dedupe_key: string
          notification_id?: string | null
          recipient_user_id: string
          source_id: string
          source_type: string
          timing_key?: string
          trigger_type: string
        }
        Update: {
          created_at?: string
          dedupe_key?: string
          notification_id?: string | null
          recipient_user_id?: string
          source_id?: string
          source_type?: string
          timing_key?: string
          trigger_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_event_dedupes_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          circle_friend_live_enabled: boolean
          created_at: string
          event_starts_soon_enabled: boolean
          followed_creator_live_enabled: boolean
          in_app_enabled: boolean
          public_upload_enabled: boolean
          push_enabled: boolean
          replay_later_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          circle_friend_live_enabled?: boolean
          created_at?: string
          event_starts_soon_enabled?: boolean
          followed_creator_live_enabled?: boolean
          in_app_enabled?: boolean
          public_upload_enabled?: boolean
          push_enabled?: boolean
          replay_later_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          circle_friend_live_enabled?: boolean
          created_at?: string
          event_starts_soon_enabled?: boolean
          followed_creator_live_enabled?: boolean
          in_app_enabled?: boolean
          public_upload_enabled?: boolean
          push_enabled?: boolean
          replay_later_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          actor_user_id: string | null
          blocked_reason: string | null
          body: string | null
          category: string
          created_at: string
          deep_link: string | null
          delivered_at: string | null
          dismissed_at: string | null
          eligibility_reason: string | null
          id: string
          notification_type: string
          priority: number
          read_at: string | null
          source_id: string | null
          source_type: string | null
          status: string
          target_context: Json
          target_entity_id: string | null
          target_route: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          actor_user_id?: string | null
          blocked_reason?: string | null
          body?: string | null
          category: string
          created_at?: string
          deep_link?: string | null
          delivered_at?: string | null
          dismissed_at?: string | null
          eligibility_reason?: string | null
          id?: string
          notification_type: string
          priority?: number
          read_at?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string
          target_context?: Json
          target_entity_id?: string | null
          target_route: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          actor_user_id?: string | null
          blocked_reason?: string | null
          body?: string | null
          category?: string
          created_at?: string
          deep_link?: string | null
          delivered_at?: string | null
          dismissed_at?: string | null
          eligibility_reason?: string | null
          id?: string
          notification_type?: string
          priority?: number
          read_at?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string
          target_context?: Json
          target_entity_id?: string | null
          target_route?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      owner_trusted_devices: {
        Row: {
          app_version: string | null
          build_version: string | null
          created_at: string
          device_fingerprint_hash: string
          device_label: string | null
          id: string
          last_security_context_id: string | null
          last_seen_at: string
          metadata: Json
          owner_user_id: string
          platform: string | null
          revoked_at: string | null
          revoked_by: string | null
          revoked_reason: string | null
          trusted_at: string | null
          trusted_by: string | null
          updated_at: string
        }
        Insert: {
          app_version?: string | null
          build_version?: string | null
          created_at?: string
          device_fingerprint_hash: string
          device_label?: string | null
          id?: string
          last_security_context_id?: string | null
          last_seen_at?: string
          metadata?: Json
          owner_user_id: string
          platform?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          revoked_reason?: string | null
          trusted_at?: string | null
          trusted_by?: string | null
          updated_at?: string
        }
        Update: {
          app_version?: string | null
          build_version?: string | null
          created_at?: string
          device_fingerprint_hash?: string
          device_label?: string | null
          id?: string
          last_security_context_id?: string | null
          last_seen_at?: string
          metadata?: Json
          owner_user_id?: string
          platform?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          revoked_reason?: string | null
          trusted_at?: string | null
          trusted_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "owner_trusted_devices_last_security_context_id_fkey"
            columns: ["last_security_context_id"]
            isOneToOne: false
            referencedRelation: "security_request_context"
            referencedColumns: ["id"]
          },
        ]
      }
      paid_content_purchases: {
        Row: {
          access_status: string
          buyer_id: string
          charged_back_at: string | null
          content_id: string
          content_type: string
          created_at: string
          creator_id: string
          currency: string
          id: string
          payment_status: string
          price_cents: number
          provider: string
          provider_payment_id: string | null
          refunded_at: string | null
          updated_at: string
        }
        Insert: {
          access_status?: string
          buyer_id: string
          charged_back_at?: string | null
          content_id: string
          content_type: string
          created_at?: string
          creator_id: string
          currency?: string
          id?: string
          payment_status?: string
          price_cents: number
          provider?: string
          provider_payment_id?: string | null
          refunded_at?: string | null
          updated_at?: string
        }
        Update: {
          access_status?: string
          buyer_id?: string
          charged_back_at?: string | null
          content_id?: string
          content_type?: string
          created_at?: string
          creator_id?: string
          currency?: string
          id?: string
          payment_status?: string
          price_cents?: number
          provider?: string
          provider_payment_id?: string | null
          refunded_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      platform_admin_audit_logs: {
        Row: {
          action: string
          action_category: string
          actor_email: string | null
          actor_role: string | null
          actor_user_id: string | null
          after_state: Json | null
          before_state: Json | null
          created_at: string
          id: string
          ip_hash: string | null
          metadata: Json
          reason: string | null
          request_id: string | null
          security_context_id: string | null
          severity: string
          target_channel_user_id: string | null
          target_id: string | null
          target_type: string | null
          target_user_id: string | null
          user_agent_hash: string | null
        }
        Insert: {
          action: string
          action_category: string
          actor_email?: string | null
          actor_role?: string | null
          actor_user_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          id?: string
          ip_hash?: string | null
          metadata?: Json
          reason?: string | null
          request_id?: string | null
          security_context_id?: string | null
          severity?: string
          target_channel_user_id?: string | null
          target_id?: string | null
          target_type?: string | null
          target_user_id?: string | null
          user_agent_hash?: string | null
        }
        Update: {
          action?: string
          action_category?: string
          actor_email?: string | null
          actor_role?: string | null
          actor_user_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          id?: string
          ip_hash?: string | null
          metadata?: Json
          reason?: string | null
          request_id?: string | null
          security_context_id?: string | null
          severity?: string
          target_channel_user_id?: string | null
          target_id?: string | null
          target_type?: string | null
          target_user_id?: string | null
          user_agent_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_admin_audit_logs_security_context_id_fkey"
            columns: ["security_context_id"]
            isOneToOne: false
            referencedRelation: "security_request_context"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_brand_asset_review_events: {
        Row: {
          action: string
          actor_email: string | null
          actor_role: string | null
          actor_user_id: string | null
          after_state: Json | null
          asset_id: string
          before_state: Json | null
          created_at: string
          id: string
          owner_user_id: string
          reason: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_role?: string | null
          actor_user_id?: string | null
          after_state?: Json | null
          asset_id: string
          before_state?: Json | null
          created_at?: string
          id?: string
          owner_user_id: string
          reason?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_role?: string | null
          actor_user_id?: string | null
          after_state?: Json | null
          asset_id?: string
          before_state?: Json | null
          created_at?: string
          id?: string
          owner_user_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_brand_asset_review_events_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "platform_brand_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_brand_assets: {
        Row: {
          asset_state: string
          asset_type: string
          created_at: string
          deleted_at: string | null
          duration_ms: number | null
          file_size_bytes: number
          height: number | null
          id: string
          mime_type: string
          moderated_at: string | null
          moderated_by: string | null
          moderation_reason: string | null
          moderation_status: string
          original_file_name: string | null
          owner_user_id: string
          storage_bucket: string
          storage_object_key: string
          storage_path: string
          storage_provider: string
          updated_at: string
          width: number | null
        }
        Insert: {
          asset_state?: string
          asset_type: string
          created_at?: string
          deleted_at?: string | null
          duration_ms?: number | null
          file_size_bytes?: number
          height?: number | null
          id?: string
          mime_type: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_status?: string
          original_file_name?: string | null
          owner_user_id: string
          storage_bucket?: string
          storage_object_key: string
          storage_path: string
          storage_provider?: string
          updated_at?: string
          width?: number | null
        }
        Update: {
          asset_state?: string
          asset_type?: string
          created_at?: string
          deleted_at?: string | null
          duration_ms?: number | null
          file_size_bytes?: number
          height?: number | null
          id?: string
          mime_type?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_status?: string
          original_file_name?: string | null
          owner_user_id?: string
          storage_bucket?: string
          storage_object_key?: string
          storage_path?: string
          storage_provider?: string
          updated_at?: string
          width?: number | null
        }
        Relationships: []
      }
      platform_brand_profiles: {
        Row: {
          accent_color: string
          avatar_asset_id: string | null
          background_fit_mode: string
          background_focal_x: number
          background_focal_y: number
          background_image_asset_id: string | null
          blur_strength: number
          created_at: string
          hero_crop_scale: number
          hero_fit_mode: string
          hero_focal_x: number
          hero_focal_y: number
          hero_image_asset_id: string | null
          hero_poster_asset_id: string | null
          hero_video_asset_id: string | null
          logo_asset_id: string | null
          overlay_strength: number
          owner_user_id: string
          published_at: string | null
          spotlight_video_id: string | null
          theme_preset: string
          updated_at: string
          watermark_asset_id: string | null
        }
        Insert: {
          accent_color?: string
          avatar_asset_id?: string | null
          background_fit_mode?: string
          background_focal_x?: number
          background_focal_y?: number
          background_image_asset_id?: string | null
          blur_strength?: number
          created_at?: string
          hero_crop_scale?: number
          hero_fit_mode?: string
          hero_focal_x?: number
          hero_focal_y?: number
          hero_image_asset_id?: string | null
          hero_poster_asset_id?: string | null
          hero_video_asset_id?: string | null
          logo_asset_id?: string | null
          overlay_strength?: number
          owner_user_id: string
          published_at?: string | null
          spotlight_video_id?: string | null
          theme_preset?: string
          updated_at?: string
          watermark_asset_id?: string | null
        }
        Update: {
          accent_color?: string
          avatar_asset_id?: string | null
          background_fit_mode?: string
          background_focal_x?: number
          background_focal_y?: number
          background_image_asset_id?: string | null
          blur_strength?: number
          created_at?: string
          hero_crop_scale?: number
          hero_fit_mode?: string
          hero_focal_x?: number
          hero_focal_y?: number
          hero_image_asset_id?: string | null
          hero_poster_asset_id?: string | null
          hero_video_asset_id?: string | null
          logo_asset_id?: string | null
          overlay_strength?: number
          owner_user_id?: string
          published_at?: string | null
          spotlight_video_id?: string | null
          theme_preset?: string
          updated_at?: string
          watermark_asset_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_brand_profiles_avatar_asset_id_fkey"
            columns: ["avatar_asset_id"]
            isOneToOne: false
            referencedRelation: "platform_brand_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_brand_profiles_background_image_asset_id_fkey"
            columns: ["background_image_asset_id"]
            isOneToOne: false
            referencedRelation: "platform_brand_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_brand_profiles_hero_image_asset_id_fkey"
            columns: ["hero_image_asset_id"]
            isOneToOne: false
            referencedRelation: "platform_brand_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_brand_profiles_hero_poster_asset_id_fkey"
            columns: ["hero_poster_asset_id"]
            isOneToOne: false
            referencedRelation: "platform_brand_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_brand_profiles_hero_video_asset_id_fkey"
            columns: ["hero_video_asset_id"]
            isOneToOne: false
            referencedRelation: "platform_brand_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_brand_profiles_logo_asset_id_fkey"
            columns: ["logo_asset_id"]
            isOneToOne: false
            referencedRelation: "platform_brand_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_brand_profiles_watermark_asset_id_fkey"
            columns: ["watermark_asset_id"]
            isOneToOne: false
            referencedRelation: "platform_brand_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_break_glass_audit: {
        Row: {
          action: string
          actor_email: string | null
          actor_role: string
          actor_user_id: string | null
          created_at: string
          id: string
          metadata: Json
          reason: string
          session_id: string | null
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_role: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          reason: string
          session_id?: string | null
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_role?: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          reason?: string
          session_id?: string | null
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_break_glass_audit_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "platform_break_glass_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_break_glass_sessions: {
        Row: {
          activated_at: string
          actor_email: string | null
          actor_role: string
          actor_user_id: string | null
          case_id: string | null
          ended_at: string | null
          ended_by_email: string | null
          ended_by_user_id: string | null
          expires_at: string | null
          id: string
          metadata: Json
          reason: string
          report_id: string | null
          status: string
        }
        Insert: {
          activated_at?: string
          actor_email?: string | null
          actor_role: string
          actor_user_id?: string | null
          case_id?: string | null
          ended_at?: string | null
          ended_by_email?: string | null
          ended_by_user_id?: string | null
          expires_at?: string | null
          id?: string
          metadata?: Json
          reason: string
          report_id?: string | null
          status?: string
        }
        Update: {
          activated_at?: string
          actor_email?: string | null
          actor_role?: string
          actor_user_id?: string | null
          case_id?: string | null
          ended_at?: string | null
          ended_by_email?: string | null
          ended_by_user_id?: string | null
          expires_at?: string | null
          id?: string
          metadata?: Json
          reason?: string
          report_id?: string | null
          status?: string
        }
        Relationships: []
      }
      platform_finance_ledger_events: {
        Row: {
          amount_minor: number
          currency: string
          direction: string
          event_type: string
          id: number
          metadata: Json
          occurred_at: string
          owner_user_id: string | null
          recorded_at: string
          source_id: string | null
          source_type: string
          status: string
          updated_at: string
        }
        Insert: {
          amount_minor?: number
          currency?: string
          direction?: string
          event_type: string
          id?: number
          metadata?: Json
          occurred_at?: string
          owner_user_id?: string | null
          recorded_at?: string
          source_id?: string | null
          source_type?: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount_minor?: number
          currency?: string
          direction?: string
          event_type?: string
          id?: number
          metadata?: Json
          occurred_at?: string
          owner_user_id?: string | null
          recorded_at?: string
          source_id?: string | null
          source_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      platform_fraud_holds: {
        Row: {
          created_at: string
          created_by_user_id: string | null
          enforcement_scope: string
          id: number
          metadata: Json
          notes: string | null
          primary_reason: string
          reason: string
          released_at: string | null
          released_by_user_id: string | null
          severity: string
          status: string
          target_channel_user_id: string | null
          target_id: string | null
          target_type: string
          target_user_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          created_by_user_id?: string | null
          enforcement_scope?: string
          id?: number
          metadata?: Json
          notes?: string | null
          primary_reason?: string
          reason: string
          released_at?: string | null
          released_by_user_id?: string | null
          severity?: string
          status?: string
          target_channel_user_id?: string | null
          target_id?: string | null
          target_type?: string
          target_user_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          created_by_user_id?: string | null
          enforcement_scope?: string
          id?: number
          metadata?: Json
          notes?: string | null
          primary_reason?: string
          reason?: string
          released_at?: string | null
          released_by_user_id?: string | null
          severity?: string
          status?: string
          target_channel_user_id?: string | null
          target_id?: string | null
          target_type?: string
          target_user_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      platform_role_memberships: {
        Row: {
          email: string | null
          granted_at: string
          granted_by: string | null
          id: number
          notes: string | null
          revoked_at: string | null
          revoked_by: string | null
          role: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          email?: string | null
          granted_at?: string
          granted_by?: string | null
          id?: number
          notes?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          role: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          email?: string | null
          granted_at?: string
          granted_by?: string | null
          id?: number
          notes?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          role?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      platform_staff_permission_audit: {
        Row: {
          action: string
          actor_email: string | null
          actor_role: string | null
          actor_user_id: string | null
          created_at: string
          id: string
          metadata: Json
          permission_key: string
          reason: string | null
          security_context_id: string | null
          target_email: string | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_role?: string | null
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          permission_key: string
          reason?: string | null
          security_context_id?: string | null
          target_email?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_role?: string | null
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          permission_key?: string
          reason?: string | null
          security_context_id?: string | null
          target_email?: string | null
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_staff_permission_audit_security_context_id_fkey"
            columns: ["security_context_id"]
            isOneToOne: false
            referencedRelation: "security_request_context"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_staff_permission_grants: {
        Row: {
          expires_at: string | null
          granted_at: string
          granted_by: string | null
          id: string
          metadata: Json
          permission_key: string
          reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          status: string
          target_email: string
          target_user_id: string | null
          updated_at: string
        }
        Insert: {
          expires_at?: string | null
          granted_at?: string
          granted_by?: string | null
          id?: string
          metadata?: Json
          permission_key: string
          reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
          target_email: string
          target_user_id?: string | null
          updated_at?: string
        }
        Update: {
          expires_at?: string | null
          granted_at?: string
          granted_by?: string | null
          id?: string
          metadata?: Json
          permission_key?: string
          reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
          target_email?: string
          target_user_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      platform_staff_role_audit: {
        Row: {
          action: string
          actor_email: string | null
          actor_role: string | null
          actor_user_id: string | null
          created_at: string
          id: string
          metadata: Json
          reason: string | null
          role: string
          security_context_id: string | null
          target_email: string | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_role?: string | null
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          reason?: string | null
          role: string
          security_context_id?: string | null
          target_email?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_role?: string | null
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          reason?: string | null
          role?: string
          security_context_id?: string | null
          target_email?: string | null
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_staff_role_audit_security_context_id_fkey"
            columns: ["security_context_id"]
            isOneToOne: false
            referencedRelation: "security_request_context"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_usage_daily_rollups: {
        Row: {
          event_count: number
          generated_at: string
          id: number
          metadata: Json
          metric_key: string
          owner_user_id: string | null
          quantity: number
          rollup_date: string
          source_type: string
          unit: string
          updated_at: string
        }
        Insert: {
          event_count?: number
          generated_at?: string
          id?: number
          metadata?: Json
          metric_key: string
          owner_user_id?: string | null
          quantity?: number
          rollup_date: string
          source_type?: string
          unit: string
          updated_at?: string
        }
        Update: {
          event_count?: number
          generated_at?: string
          id?: number
          metadata?: Json
          metric_key?: string
          owner_user_id?: string | null
          quantity?: number
          rollup_date?: string
          source_type?: string
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      platform_usage_metering_events: {
        Row: {
          id: number
          metadata: Json
          metric_key: string
          occurred_at: string
          owner_user_id: string | null
          quantity: number
          recorded_at: string
          source_id: string | null
          source_type: string
          unit: string
        }
        Insert: {
          id?: number
          metadata?: Json
          metric_key: string
          occurred_at?: string
          owner_user_id?: string | null
          quantity: number
          recorded_at?: string
          source_id?: string | null
          source_type?: string
          unit: string
        }
        Update: {
          id?: number
          metadata?: Json
          metric_key?: string
          occurred_at?: string
          owner_user_id?: string | null
          quantity?: number
          recorded_at?: string
          source_id?: string | null
          source_type?: string
          unit?: string
        }
        Relationships: []
      }
      profile_post_comments: {
        Row: {
          body: string
          created_at: string
          deleted_at: string | null
          id: string
          moderated_at: string | null
          moderated_by: string | null
          moderation_reason: string | null
          moderation_status: string
          parent_comment_id: string | null
          post_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_status?: string
          parent_comment_id?: string | null
          post_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_status?: string
          parent_comment_id?: string | null
          post_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_post_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "profile_post_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "profile_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_post_likes: {
        Row: {
          created_at: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "profile_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_posts: {
        Row: {
          body: string
          created_at: string
          deleted_at: string | null
          id: string
          moderated_at: string | null
          moderated_by: string | null
          moderation_reason: string | null
          moderation_status: string
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          body: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_status?: string
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          body?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_status?: string
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_ur1: string | null
          bio: string | null
          display_name: string
          id: string
        }
        Insert: {
          avatar_ur1?: string | null
          bio?: string | null
          display_name: string
          id?: string
        }
        Update: {
          avatar_ur1?: string | null
          bio?: string | null
          display_name?: string
          id?: string
        }
        Relationships: []
      }
      provider_accounts: {
        Row: {
          account_reference: string | null
          created_at: string
          display_name: string
          id: string
          metadata: Json
          provider: string
          status: string
          updated_at: string
        }
        Insert: {
          account_reference?: string | null
          created_at?: string
          display_name: string
          id?: string
          metadata?: Json
          provider: string
          status?: string
          updated_at?: string
        }
        Update: {
          account_reference?: string | null
          created_at?: string
          display_name?: string
          id?: string
          metadata?: Json
          provider?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      provider_billing_snapshots: {
        Row: {
          amount: number | null
          billing_month: string
          created_at: string
          currency: string
          id: string
          metadata: Json
          provider: string
          provider_account_id: string | null
          source_reference: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number | null
          billing_month: string
          created_at?: string
          currency?: string
          id?: string
          metadata?: Json
          provider: string
          provider_account_id?: string | null
          source_reference?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number | null
          billing_month?: string
          created_at?: string
          currency?: string
          id?: string
          metadata?: Json
          provider?: string
          provider_account_id?: string | null
          source_reference?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_billing_snapshots_provider_account_fkey"
            columns: ["provider_account_id"]
            isOneToOne: false
            referencedRelation: "provider_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_readiness_audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          capability: string | null
          created_at: string
          id: string
          metadata: Json
          proof_source: string | null
          provider: string | null
          reason: string | null
          security_context_id: string | null
          status_after: string | null
          status_before: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          capability?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          proof_source?: string | null
          provider?: string | null
          reason?: string | null
          security_context_id?: string | null
          status_after?: string | null
          status_before?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          capability?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          proof_source?: string | null
          provider?: string | null
          reason?: string | null
          security_context_id?: string | null
          status_after?: string | null
          status_before?: string | null
        }
        Relationships: []
      }
      provider_readiness_status: {
        Row: {
          capability: string
          created_at: string
          environment: string
          id: string
          is_client_visible: boolean
          is_live_money_enabled: boolean
          last_checked_at: string | null
          last_error_code: string | null
          last_error_message: string | null
          proof_source: string | null
          proof_summary: string | null
          provider: string
          status: string
          updated_at: string
        }
        Insert: {
          capability: string
          created_at?: string
          environment?: string
          id?: string
          is_client_visible?: boolean
          is_live_money_enabled?: boolean
          last_checked_at?: string | null
          last_error_code?: string | null
          last_error_message?: string | null
          proof_source?: string | null
          proof_summary?: string | null
          provider: string
          status: string
          updated_at?: string
        }
        Update: {
          capability?: string
          created_at?: string
          environment?: string
          id?: string
          is_client_visible?: boolean
          is_live_money_enabled?: boolean
          last_checked_at?: string | null
          last_error_code?: string | null
          last_error_message?: string | null
          proof_source?: string | null
          proof_summary?: string | null
          provider?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      provider_usage_daily: {
        Row: {
          created_at: string
          id: string
          import_id: string | null
          metadata: Json
          metric_key: string
          provider: string
          provider_account_id: string | null
          quantity: number
          resource_name: string | null
          resource_type: string
          unit: string
          updated_at: string
          usage_date: string
        }
        Insert: {
          created_at?: string
          id?: string
          import_id?: string | null
          metadata?: Json
          metric_key: string
          provider: string
          provider_account_id?: string | null
          quantity?: number
          resource_name?: string | null
          resource_type: string
          unit: string
          updated_at?: string
          usage_date: string
        }
        Update: {
          created_at?: string
          id?: string
          import_id?: string | null
          metadata?: Json
          metric_key?: string
          provider?: string
          provider_account_id?: string | null
          quantity?: number
          resource_name?: string | null
          resource_type?: string
          unit?: string
          updated_at?: string
          usage_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_usage_daily_import_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "provider_usage_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_usage_daily_provider_account_fkey"
            columns: ["provider_account_id"]
            isOneToOne: false
            referencedRelation: "provider_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_usage_imports: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          import_type: string
          metadata: Json
          period_end: string
          period_start: string
          provider: string
          provider_account_id: string | null
          records_imported: number
          source_reference: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          import_type: string
          metadata?: Json
          period_end: string
          period_start: string
          provider: string
          provider_account_id?: string | null
          records_imported?: number
          source_reference?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          import_type?: string
          metadata?: Json
          period_end?: string
          period_start?: string
          provider?: string
          provider_account_id?: string | null
          records_imported?: number
          source_reference?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_usage_imports_provider_account_fkey"
            columns: ["provider_account_id"]
            isOneToOne: false
            referencedRelation: "provider_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_usage_reconciliation: {
        Row: {
          created_at: string
          id: string
          internal_quantity: number | null
          metadata: Json
          notes: string | null
          period_end: string
          period_start: string
          provider: string
          provider_quantity: number | null
          status: string
          unit: string
          updated_at: string
          usage_class: string
          variance_quantity: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          internal_quantity?: number | null
          metadata?: Json
          notes?: string | null
          period_end: string
          period_start: string
          provider: string
          provider_quantity?: number | null
          status?: string
          unit: string
          updated_at?: string
          usage_class: string
          variance_quantity?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          internal_quantity?: number | null
          metadata?: Json
          notes?: string | null
          period_end?: string
          period_start?: string
          provider?: string
          provider_quantity?: number | null
          status?: string
          unit?: string
          updated_at?: string
          usage_class?: string
          variance_quantity?: number | null
        }
        Relationships: []
      }
      room_broadcast_sessions: {
        Row: {
          access_type: string
          ad_policy: string
          broadcast_status: string
          channel_user_id: string | null
          cost_guard_status: string
          created_at: string
          creator_event_id: string | null
          egress_id: string | null
          egress_provider: string
          egress_status: string
          ended_at: string | null
          hls_playback_url: string | null
          host_user_id: string | null
          id: string
          is_publicly_watchable: boolean
          is_spectator_playback_enabled: boolean
          last_health_checked_at: string | null
          max_broadcast_minutes: number | null
          max_concurrent_spectators: number | null
          metadata: Json
          playback_url_status: string
          requires_premium: boolean
          requires_ticket: boolean
          rights_status: string
          source_room_id: string | null
          source_type: string
          started_at: string | null
          thumbnail_url: string | null
          updated_at: string
          watch_party_room_id: string | null
        }
        Insert: {
          access_type?: string
          ad_policy?: string
          broadcast_status?: string
          channel_user_id?: string | null
          cost_guard_status?: string
          created_at?: string
          creator_event_id?: string | null
          egress_id?: string | null
          egress_provider?: string
          egress_status?: string
          ended_at?: string | null
          hls_playback_url?: string | null
          host_user_id?: string | null
          id?: string
          is_publicly_watchable?: boolean
          is_spectator_playback_enabled?: boolean
          last_health_checked_at?: string | null
          max_broadcast_minutes?: number | null
          max_concurrent_spectators?: number | null
          metadata?: Json
          playback_url_status?: string
          requires_premium?: boolean
          requires_ticket?: boolean
          rights_status?: string
          source_room_id?: string | null
          source_type?: string
          started_at?: string | null
          thumbnail_url?: string | null
          updated_at?: string
          watch_party_room_id?: string | null
        }
        Update: {
          access_type?: string
          ad_policy?: string
          broadcast_status?: string
          channel_user_id?: string | null
          cost_guard_status?: string
          created_at?: string
          creator_event_id?: string | null
          egress_id?: string | null
          egress_provider?: string
          egress_status?: string
          ended_at?: string | null
          hls_playback_url?: string | null
          host_user_id?: string | null
          id?: string
          is_publicly_watchable?: boolean
          is_spectator_playback_enabled?: boolean
          last_health_checked_at?: string | null
          max_broadcast_minutes?: number | null
          max_concurrent_spectators?: number | null
          metadata?: Json
          playback_url_status?: string
          requires_premium?: boolean
          requires_ticket?: boolean
          rights_status?: string
          source_room_id?: string | null
          source_type?: string
          started_at?: string | null
          thumbnail_url?: string | null
          updated_at?: string
          watch_party_room_id?: string | null
        }
        Relationships: []
      }
      safety_reports: {
        Row: {
          actioned_at: string | null
          category: string
          context: Json
          created_at: string
          escalated_at: string | null
          id: number
          note: string | null
          reporter_user_id: string
          resolution_reason: string | null
          resolution_type: string | null
          resolved_at: string | null
          resolved_by: string | null
          room_id: string | null
          security_context_id: string | null
          severity: string
          status: string
          target_id: string
          target_type: string
          title_id: string | null
          updated_at: string
        }
        Insert: {
          actioned_at?: string | null
          category: string
          context?: Json
          created_at?: string
          escalated_at?: string | null
          id?: number
          note?: string | null
          reporter_user_id: string
          resolution_reason?: string | null
          resolution_type?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          room_id?: string | null
          security_context_id?: string | null
          severity?: string
          status?: string
          target_id: string
          target_type: string
          title_id?: string | null
          updated_at?: string
        }
        Update: {
          actioned_at?: string | null
          category?: string
          context?: Json
          created_at?: string
          escalated_at?: string | null
          id?: number
          note?: string | null
          reporter_user_id?: string
          resolution_reason?: string | null
          resolution_type?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          room_id?: string | null
          security_context_id?: string | null
          severity?: string
          status?: string
          target_id?: string
          target_type?: string
          title_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "safety_reports_security_context_id_fkey"
            columns: ["security_context_id"]
            isOneToOne: false
            referencedRelation: "security_request_context"
            referencedColumns: ["id"]
          },
        ]
      }
      security_audit_events: {
        Row: {
          actor_email: string | null
          actor_role: string | null
          actor_user_id: string | null
          created_at: string
          event_type: string
          id: string
          metadata: Json
          reason: string | null
          security_context_id: string | null
          severity: string
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          actor_email?: string | null
          actor_role?: string | null
          actor_user_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
          reason?: string | null
          security_context_id?: string | null
          severity?: string
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          actor_email?: string | null
          actor_role?: string | null
          actor_user_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          reason?: string | null
          security_context_id?: string | null
          severity?: string
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "security_audit_events_security_context_id_fkey"
            columns: ["security_context_id"]
            isOneToOne: false
            referencedRelation: "security_request_context"
            referencedColumns: ["id"]
          },
        ]
      }
      security_request_context: {
        Row: {
          asn_or_isp: string | null
          capture_status: string
          city_approx: string | null
          country: string | null
          created_at: string
          device_hash: string | null
          id: string
          ip_hash: string
          ip_prefix_or_masked_ip: string | null
          metadata: Json
          network_proof_error: string | null
          network_proof_source: string | null
          network_proof_timestamp: string | null
          network_proof_verified: boolean
          network_proof_version: string | null
          region: string | null
          request_id: string | null
          retention_expires_at: string | null
          session_id: string | null
          source: string
          trusted_header_source: string | null
          user_agent_hash: string | null
          user_id: string | null
        }
        Insert: {
          asn_or_isp?: string | null
          capture_status?: string
          city_approx?: string | null
          country?: string | null
          created_at?: string
          device_hash?: string | null
          id?: string
          ip_hash: string
          ip_prefix_or_masked_ip?: string | null
          metadata?: Json
          network_proof_error?: string | null
          network_proof_source?: string | null
          network_proof_timestamp?: string | null
          network_proof_verified?: boolean
          network_proof_version?: string | null
          region?: string | null
          request_id?: string | null
          retention_expires_at?: string | null
          session_id?: string | null
          source: string
          trusted_header_source?: string | null
          user_agent_hash?: string | null
          user_id?: string | null
        }
        Update: {
          asn_or_isp?: string | null
          capture_status?: string
          city_approx?: string | null
          country?: string | null
          created_at?: string
          device_hash?: string | null
          id?: string
          ip_hash?: string
          ip_prefix_or_masked_ip?: string | null
          metadata?: Json
          network_proof_error?: string | null
          network_proof_source?: string | null
          network_proof_timestamp?: string | null
          network_proof_verified?: boolean
          network_proof_version?: string | null
          region?: string | null
          request_id?: string | null
          retention_expires_at?: string | null
          session_id?: string | null
          source?: string
          trusted_header_source?: string | null
          user_agent_hash?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      social_attachments: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          mime_type: string
          moderated_at: string | null
          moderated_by: string | null
          moderation_reason: string | null
          moderation_status: string
          original_file_name: string | null
          owner_user_id: string
          size_bytes: number
          storage_bucket: string
          storage_object_key: string | null
          storage_path: string
          storage_provider: string
          surface_id: string
          surface_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          mime_type: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_status?: string
          original_file_name?: string | null
          owner_user_id: string
          size_bytes?: number
          storage_bucket?: string
          storage_object_key?: string | null
          storage_path: string
          storage_provider?: string
          surface_id: string
          surface_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          mime_type?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_status?: string
          original_file_name?: string | null
          owner_user_id?: string
          size_bytes?: number
          storage_bucket?: string
          storage_object_key?: string | null
          storage_path?: string
          storage_provider?: string
          surface_id?: string
          surface_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      spectator_child_room_audit_log: {
        Row: {
          actor_user_id: string | null
          child_room_id: string | null
          created_at: string
          denial_reason: string | null
          event_type: string
          id: string
          metadata: Json
          security_context_id: string | null
          source_item_id: string | null
        }
        Insert: {
          actor_user_id?: string | null
          child_room_id?: string | null
          created_at?: string
          denial_reason?: string | null
          event_type: string
          id?: string
          metadata?: Json
          security_context_id?: string | null
          source_item_id?: string | null
        }
        Update: {
          actor_user_id?: string | null
          child_room_id?: string | null
          created_at?: string
          denial_reason?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          security_context_id?: string | null
          source_item_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "spectator_child_room_audit_log_child_room_id_fkey"
            columns: ["child_room_id"]
            isOneToOne: false
            referencedRelation: "watch_party_rooms"
            referencedColumns: ["party_id"]
          },
          {
            foreignKeyName: "spectator_child_room_audit_log_source_item_id_fkey"
            columns: ["source_item_id"]
            isOneToOne: false
            referencedRelation: "discovery_feed_items"
            referencedColumns: ["id"]
          },
        ]
      }
      spectator_child_room_sources: {
        Row: {
          child_room_id: string
          created_at: string
          created_by_user_id: string
          metadata: Json
          parent_room_id: string | null
          root_source_id: string
          source_item_id: string
          source_owner_user_id: string | null
          source_platform_id: string | null
          source_public_playback_id: string | null
          source_type: string
        }
        Insert: {
          child_room_id: string
          created_at?: string
          created_by_user_id: string
          metadata?: Json
          parent_room_id?: string | null
          root_source_id: string
          source_item_id: string
          source_owner_user_id?: string | null
          source_platform_id?: string | null
          source_public_playback_id?: string | null
          source_type: string
        }
        Update: {
          child_room_id?: string
          created_at?: string
          created_by_user_id?: string
          metadata?: Json
          parent_room_id?: string | null
          root_source_id?: string
          source_item_id?: string
          source_owner_user_id?: string | null
          source_platform_id?: string | null
          source_public_playback_id?: string | null
          source_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "spectator_child_room_sources_child_room_id_fkey"
            columns: ["child_room_id"]
            isOneToOne: true
            referencedRelation: "watch_party_rooms"
            referencedColumns: ["party_id"]
          },
          {
            foreignKeyName: "spectator_child_room_sources_source_item_id_fkey"
            columns: ["source_item_id"]
            isOneToOne: false
            referencedRelation: "discovery_feed_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spectator_child_room_sources_source_public_playback_id_fkey"
            columns: ["source_public_playback_id"]
            isOneToOne: false
            referencedRelation: "spectator_hls_playback_records"
            referencedColumns: ["id"]
          },
        ]
      }
      spectator_hls_playback_records: {
        Row: {
          access_type: string
          broadcast_session_id: string
          channel_user_id: string | null
          created_at: string
          creator_event_id: string | null
          host_user_id: string | null
          id: string
          is_publicly_watchable: boolean
          is_spectator_playback_enabled: boolean
          metadata: Json
          playback_status: string
          playlist_path: string | null
          requires_premium: boolean
          requires_ticket: boolean
          rights_status: string
          source_room_id: string
          updated_at: string
          visibility: string
          watch_party_room_id: string | null
        }
        Insert: {
          access_type?: string
          broadcast_session_id: string
          channel_user_id?: string | null
          created_at?: string
          creator_event_id?: string | null
          host_user_id?: string | null
          id?: string
          is_publicly_watchable?: boolean
          is_spectator_playback_enabled?: boolean
          metadata?: Json
          playback_status?: string
          playlist_path?: string | null
          requires_premium?: boolean
          requires_ticket?: boolean
          rights_status?: string
          source_room_id: string
          updated_at?: string
          visibility?: string
          watch_party_room_id?: string | null
        }
        Update: {
          access_type?: string
          broadcast_session_id?: string
          channel_user_id?: string | null
          created_at?: string
          creator_event_id?: string | null
          host_user_id?: string | null
          id?: string
          is_publicly_watchable?: boolean
          is_spectator_playback_enabled?: boolean
          metadata?: Json
          playback_status?: string
          playlist_path?: string | null
          requires_premium?: boolean
          requires_ticket?: boolean
          rights_status?: string
          source_room_id?: string
          updated_at?: string
          visibility?: string
          watch_party_room_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "spectator_hls_playback_records_broadcast_session_id_fkey"
            columns: ["broadcast_session_id"]
            isOneToOne: true
            referencedRelation: "room_broadcast_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsor_brand_records: {
        Row: {
          contact_email: string | null
          created_at: string
          display_name: string
          external_customer_reference: string | null
          id: string
          metadata: Json
          status: string
          updated_at: string
          website_url: string | null
        }
        Insert: {
          contact_email?: string | null
          created_at?: string
          display_name: string
          external_customer_reference?: string | null
          id?: string
          metadata?: Json
          status?: string
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          contact_email?: string | null
          created_at?: string
          display_name?: string
          external_customer_reference?: string | null
          id?: string
          metadata?: Json
          status?: string
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      sponsor_creative_records: {
        Row: {
          asset_url: string | null
          created_at: string
          creative_type: string
          destination_url: string | null
          id: string
          metadata: Json
          sponsor_deal_id: number
          status: string
          title: string | null
          updated_at: string
        }
        Insert: {
          asset_url?: string | null
          created_at?: string
          creative_type: string
          destination_url?: string | null
          id?: string
          metadata?: Json
          sponsor_deal_id: number
          status?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          asset_url?: string | null
          created_at?: string
          creative_type?: string
          destination_url?: string | null
          id?: string
          metadata?: Json
          sponsor_deal_id?: number
          status?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sponsor_creative_records_sponsor_deal_id_fkey"
            columns: ["sponsor_deal_id"]
            isOneToOne: false
            referencedRelation: "sponsor_deal_records"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsor_deal_records: {
        Row: {
          brand_id: string | null
          brand_name: string | null
          channel_user_id: string | null
          created_at: string
          creator_share_bps: number
          creator_user_id: string | null
          currency: string
          deal_title: string | null
          deal_type: string
          disclosure_required: boolean
          gross_amount_cents: number
          gross_amount_minor: number | null
          id: number
          metadata: Json
          platform_share_bps: number
          status: string
          updated_at: string
        }
        Insert: {
          brand_id?: string | null
          brand_name?: string | null
          channel_user_id?: string | null
          created_at?: string
          creator_share_bps?: number
          creator_user_id?: string | null
          currency?: string
          deal_title?: string | null
          deal_type?: string
          disclosure_required?: boolean
          gross_amount_cents?: number
          gross_amount_minor?: number | null
          id?: number
          metadata?: Json
          platform_share_bps?: number
          status?: string
          updated_at?: string
        }
        Update: {
          brand_id?: string | null
          brand_name?: string | null
          channel_user_id?: string | null
          created_at?: string
          creator_share_bps?: number
          creator_user_id?: string | null
          currency?: string
          deal_title?: string | null
          deal_type?: string
          disclosure_required?: boolean
          gross_amount_cents?: number
          gross_amount_minor?: number | null
          id?: number
          metadata?: Json
          platform_share_bps?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sponsor_deal_records_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "sponsor_brand_records"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsor_disclosure_records: {
        Row: {
          created_at: string
          disclosure_text: string
          id: string
          metadata: Json
          required_before_live: boolean
          sponsor_deal_id: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          disclosure_text: string
          id?: string
          metadata?: Json
          required_before_live?: boolean
          sponsor_deal_id: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          disclosure_text?: string
          id?: string
          metadata?: Json
          required_before_live?: boolean
          sponsor_deal_id?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sponsor_disclosure_records_sponsor_deal_id_fkey"
            columns: ["sponsor_deal_id"]
            isOneToOne: false
            referencedRelation: "sponsor_deal_records"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsor_payment_records: {
        Row: {
          checkout_provider: string | null
          checkout_session_reference: string | null
          created_at: string
          creator_share_cents: number | null
          currency: string
          gross_amount_cents: number
          id: string
          metadata: Json
          net_amount_cents: number | null
          payment_mode: string
          platform_fee_cents: number | null
          provider: string | null
          provider_reference: string | null
          sponsor_deal_id: number
          status: string
          test_mode_enabled: boolean
          updated_at: string
        }
        Insert: {
          checkout_provider?: string | null
          checkout_session_reference?: string | null
          created_at?: string
          creator_share_cents?: number | null
          currency?: string
          gross_amount_cents?: number
          id?: string
          metadata?: Json
          net_amount_cents?: number | null
          payment_mode?: string
          platform_fee_cents?: number | null
          provider?: string | null
          provider_reference?: string | null
          sponsor_deal_id: number
          status?: string
          test_mode_enabled?: boolean
          updated_at?: string
        }
        Update: {
          checkout_provider?: string | null
          checkout_session_reference?: string | null
          created_at?: string
          creator_share_cents?: number | null
          currency?: string
          gross_amount_cents?: number
          id?: string
          metadata?: Json
          net_amount_cents?: number | null
          payment_mode?: string
          platform_fee_cents?: number | null
          provider?: string | null
          provider_reference?: string | null
          sponsor_deal_id?: number
          status?: string
          test_mode_enabled?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sponsor_payment_records_sponsor_deal_id_fkey"
            columns: ["sponsor_deal_id"]
            isOneToOne: false
            referencedRelation: "sponsor_deal_records"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsor_payout_split_records: {
        Row: {
          created_at: string
          creator_share_bps: number
          creator_share_cents: number
          creator_user_id: string | null
          gross_amount_cents: number
          id: string
          metadata: Json
          payment_record_id: string | null
          platform_share_bps: number
          platform_share_cents: number
          sponsor_deal_id: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          creator_share_bps?: number
          creator_share_cents?: number
          creator_user_id?: string | null
          gross_amount_cents?: number
          id?: string
          metadata?: Json
          payment_record_id?: string | null
          platform_share_bps?: number
          platform_share_cents?: number
          sponsor_deal_id: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          creator_share_bps?: number
          creator_share_cents?: number
          creator_user_id?: string | null
          gross_amount_cents?: number
          id?: string
          metadata?: Json
          payment_record_id?: string | null
          platform_share_bps?: number
          platform_share_cents?: number
          sponsor_deal_id?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sponsor_payout_split_records_payment_record_id_fkey"
            columns: ["payment_record_id"]
            isOneToOne: false
            referencedRelation: "sponsor_payment_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsor_payout_split_records_sponsor_deal_id_fkey"
            columns: ["sponsor_deal_id"]
            isOneToOne: false
            referencedRelation: "sponsor_deal_records"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsor_placement_records: {
        Row: {
          created_at: string
          id: string
          metadata: Json
          placement_type: string
          scheduled_end_at: string | null
          scheduled_start_at: string | null
          sponsor_deal_id: number
          status: string
          target_id: string | null
          target_type: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json
          placement_type: string
          scheduled_end_at?: string | null
          scheduled_start_at?: string | null
          sponsor_deal_id: number
          status?: string
          target_id?: string | null
          target_type?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json
          placement_type?: string
          scheduled_end_at?: string | null
          scheduled_start_at?: string | null
          sponsor_deal_id?: number
          status?: string
          target_id?: string | null
          target_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sponsor_placement_records_sponsor_deal_id_fkey"
            columns: ["sponsor_deal_id"]
            isOneToOne: false
            referencedRelation: "sponsor_deal_records"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsor_review_logs: {
        Row: {
          actor_user_id: string | null
          created_at: string
          id: string
          metadata: Json
          reason: string | null
          review_action: string
          sponsor_deal_id: number
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          reason?: string | null
          review_action: string
          sponsor_deal_id: number
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          reason?: string | null
          review_action?: string
          sponsor_deal_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "sponsor_review_logs_sponsor_deal_id_fkey"
            columns: ["sponsor_deal_id"]
            isOneToOne: false
            referencedRelation: "sponsor_deal_records"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsor_review_queue_records: {
        Row: {
          assigned_to_user_id: string | null
          brand_id: string | null
          channel_user_id: string | null
          created_at: string
          creator_user_id: string | null
          id: string
          metadata: Json
          priority: string
          review_notes: string | null
          review_reason: string | null
          review_status: string
          review_type: string
          sponsor_deal_id: number | null
          updated_at: string
        }
        Insert: {
          assigned_to_user_id?: string | null
          brand_id?: string | null
          channel_user_id?: string | null
          created_at?: string
          creator_user_id?: string | null
          id?: string
          metadata?: Json
          priority?: string
          review_notes?: string | null
          review_reason?: string | null
          review_status?: string
          review_type?: string
          sponsor_deal_id?: number | null
          updated_at?: string
        }
        Update: {
          assigned_to_user_id?: string | null
          brand_id?: string | null
          channel_user_id?: string | null
          created_at?: string
          creator_user_id?: string | null
          id?: string
          metadata?: Json
          priority?: string
          review_notes?: string | null
          review_reason?: string | null
          review_status?: string
          review_type?: string
          sponsor_deal_id?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sponsor_review_queue_records_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "sponsor_brand_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsor_review_queue_records_sponsor_deal_id_fkey"
            columns: ["sponsor_deal_id"]
            isOneToOne: false
            referencedRelation: "sponsor_deal_records"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsor_safety_review_records: {
        Row: {
          brand_id: string | null
          created_at: string
          id: string
          metadata: Json
          review_status: string
          review_type: string
          risk_category: string | null
          risk_notes: string | null
          sponsor_deal_id: number | null
          updated_at: string
        }
        Insert: {
          brand_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          review_status?: string
          review_type: string
          risk_category?: string | null
          risk_notes?: string | null
          sponsor_deal_id?: number | null
          updated_at?: string
        }
        Update: {
          brand_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          review_status?: string
          review_type?: string
          risk_category?: string | null
          risk_notes?: string | null
          sponsor_deal_id?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sponsor_safety_review_records_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "sponsor_brand_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsor_safety_review_records_sponsor_deal_id_fkey"
            columns: ["sponsor_deal_id"]
            isOneToOne: false
            referencedRelation: "sponsor_deal_records"
            referencedColumns: ["id"]
          },
        ]
      }
      titles: {
        Row: {
          ads_enabled: boolean
          category: string | null
          content_access_rule: string
          created_at: string
          featured: boolean | null
          hero: boolean | null
          id: string
          is_hero: boolean | null
          is_published: boolean | null
          is_trending: boolean | null
          pin_to_top_row: boolean | null
          poster_url: string | null
          release_at: string | null
          release_date: string | null
          runtime: string | null
          sort_order: number | null
          sponsor_label: string | null
          sponsor_placement: string
          status: string | null
          synopsis: string | null
          title: string | null
          top_row: boolean | null
          trending: boolean | null
          video_url: string | null
          year: number | null
        }
        Insert: {
          ads_enabled?: boolean
          category?: string | null
          content_access_rule?: string
          created_at?: string
          featured?: boolean | null
          hero?: boolean | null
          id?: string
          is_hero?: boolean | null
          is_published?: boolean | null
          is_trending?: boolean | null
          pin_to_top_row?: boolean | null
          poster_url?: string | null
          release_at?: string | null
          release_date?: string | null
          runtime?: string | null
          sort_order?: number | null
          sponsor_label?: string | null
          sponsor_placement?: string
          status?: string | null
          synopsis?: string | null
          title?: string | null
          top_row?: boolean | null
          trending?: boolean | null
          video_url?: string | null
          year?: number | null
        }
        Update: {
          ads_enabled?: boolean
          category?: string | null
          content_access_rule?: string
          created_at?: string
          featured?: boolean | null
          hero?: boolean | null
          id?: string
          is_hero?: boolean | null
          is_published?: boolean | null
          is_trending?: boolean | null
          pin_to_top_row?: boolean | null
          poster_url?: string | null
          release_at?: string | null
          release_date?: string | null
          runtime?: string | null
          sort_order?: number | null
          sponsor_label?: string | null
          sponsor_placement?: string
          status?: string | null
          synopsis?: string | null
          title?: string | null
          top_row?: boolean | null
          trending?: boolean | null
          video_url?: string | null
          year?: number | null
        }
        Relationships: []
      }
      usage_daily_summaries: {
        Row: {
          channel_user_id: string | null
          created_at: string
          id: string
          media_id: string | null
          metadata: Json
          metric_key: string
          quantity: number
          room_id: string | null
          unit: string
          updated_at: string
          usage_class: string
          usage_date: string
          user_id: string | null
        }
        Insert: {
          channel_user_id?: string | null
          created_at?: string
          id?: string
          media_id?: string | null
          metadata?: Json
          metric_key: string
          quantity?: number
          room_id?: string | null
          unit: string
          updated_at?: string
          usage_class: string
          usage_date: string
          user_id?: string | null
        }
        Update: {
          channel_user_id?: string | null
          created_at?: string
          id?: string
          media_id?: string | null
          metadata?: Json
          metric_key?: string
          quantity?: number
          room_id?: string | null
          unit?: string
          updated_at?: string
          usage_class?: string
          usage_date?: string
          user_id?: string | null
        }
        Relationships: []
      }
      usage_meter_events: {
        Row: {
          channel_user_id: string | null
          created_at: string
          event_source: string
          event_type: string
          id: string
          media_id: string | null
          metadata: Json
          provider_account_id: string | null
          quantity: number
          room_id: string | null
          storage_provider: string | null
          unit: string
          usage_class: string
          user_id: string | null
        }
        Insert: {
          channel_user_id?: string | null
          created_at?: string
          event_source?: string
          event_type: string
          id?: string
          media_id?: string | null
          metadata?: Json
          provider_account_id?: string | null
          quantity?: number
          room_id?: string | null
          storage_provider?: string | null
          unit: string
          usage_class: string
          user_id?: string | null
        }
        Update: {
          channel_user_id?: string | null
          created_at?: string
          event_source?: string
          event_type?: string
          id?: string
          media_id?: string | null
          metadata?: Json
          provider_account_id?: string | null
          quantity?: number
          room_id?: string | null
          storage_provider?: string | null
          unit?: string
          usage_class?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "usage_meter_events_provider_account_fkey"
            columns: ["provider_account_id"]
            isOneToOne: false
            referencedRelation: "provider_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_monthly_summaries: {
        Row: {
          channel_user_id: string | null
          created_at: string
          id: string
          media_id: string | null
          metadata: Json
          metric_key: string
          quantity: number
          room_id: string | null
          unit: string
          updated_at: string
          usage_class: string
          usage_month: string
          user_id: string | null
        }
        Insert: {
          channel_user_id?: string | null
          created_at?: string
          id?: string
          media_id?: string | null
          metadata?: Json
          metric_key: string
          quantity?: number
          room_id?: string | null
          unit: string
          updated_at?: string
          usage_class: string
          usage_month: string
          user_id?: string | null
        }
        Update: {
          channel_user_id?: string | null
          created_at?: string
          id?: string
          media_id?: string | null
          metadata?: Json
          metric_key?: string
          quantity?: number
          room_id?: string | null
          unit?: string
          updated_at?: string
          usage_class?: string
          usage_month?: string
          user_id?: string | null
        }
        Relationships: []
      }
      user_account_legal_acceptances: {
        Row: {
          age_confirmed_at: string | null
          age_confirmed_version: string | null
          created_at: string
          privacy_accepted_at: string | null
          privacy_accepted_version: string | null
          terms_accepted_at: string | null
          terms_accepted_version: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          age_confirmed_at?: string | null
          age_confirmed_version?: string | null
          created_at?: string
          privacy_accepted_at?: string | null
          privacy_accepted_version?: string | null
          terms_accepted_at?: string | null
          terms_accepted_version?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          age_confirmed_at?: string | null
          age_confirmed_version?: string | null
          created_at?: string
          privacy_accepted_at?: string | null
          privacy_accepted_version?: string | null
          terms_accepted_at?: string | null
          terms_accepted_version?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_content_relationships: {
        Row: {
          relationship_type: string
          title_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          relationship_type: string
          title_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          relationship_type?: string
          title_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_entitlements: {
        Row: {
          entitlement_key: string
          expires_at: string | null
          metadata: Json
          revoked_at: string | null
          source: string
          starts_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          entitlement_key: string
          expires_at?: string | null
          metadata?: Json
          revoked_at?: string | null
          source?: string
          starts_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          entitlement_key?: string
          expires_at?: string | null
          metadata?: Json
          revoked_at?: string | null
          source?: string
          starts_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_friendships: {
        Row: {
          actioned_by_user_id: string | null
          created_at: string
          requested_by_user_id: string
          responded_at: string | null
          status: string
          updated_at: string
          user_high_id: string
          user_low_id: string
        }
        Insert: {
          actioned_by_user_id?: string | null
          created_at?: string
          requested_by_user_id: string
          responded_at?: string | null
          status?: string
          updated_at?: string
          user_high_id: string
          user_low_id: string
        }
        Update: {
          actioned_by_user_id?: string | null
          created_at?: string
          requested_by_user_id?: string
          responded_at?: string | null
          status?: string
          updated_at?: string
          user_high_id?: string
          user_low_id?: string
        }
        Relationships: []
      }
      user_list: {
        Row: {
          title_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          title_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          title_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          avatar_index: number
          avatar_url: string | null
          channel_layout_preset: string
          channel_role: string | null
          default_communication_capture_policy: string | null
          default_communication_content_access_rule: string | null
          default_watch_party_capture_policy: string | null
          default_watch_party_content_access_rule: string | null
          default_watch_party_join_policy: string | null
          default_watch_party_reactions_policy: string | null
          display_name: string | null
          follower_surface_enabled: boolean
          likes_visibility: string
          profile_avatar_fit_mode: string
          profile_avatar_focal_x: number
          profile_avatar_focal_y: number
          profile_avatar_media_flagged_at: string | null
          profile_avatar_media_status: string
          profile_background_fit_mode: string
          profile_background_focal_x: number
          profile_background_focal_y: number
          profile_background_media_flagged_at: string | null
          profile_background_media_status: string
          profile_background_overlay_strength: number
          profile_background_url: string | null
          profile_media_updated_at: string | null
          profile_visibility: string
          public_activity_visibility: string
          shares_visibility: string
          subscriber_surface_enabled: boolean
          tagline: string | null
          updated_at: string
          user_id: string
          username: string
        }
        Insert: {
          avatar_index?: number
          avatar_url?: string | null
          channel_layout_preset?: string
          channel_role?: string | null
          default_communication_capture_policy?: string | null
          default_communication_content_access_rule?: string | null
          default_watch_party_capture_policy?: string | null
          default_watch_party_content_access_rule?: string | null
          default_watch_party_join_policy?: string | null
          default_watch_party_reactions_policy?: string | null
          display_name?: string | null
          follower_surface_enabled?: boolean
          likes_visibility?: string
          profile_avatar_fit_mode?: string
          profile_avatar_focal_x?: number
          profile_avatar_focal_y?: number
          profile_avatar_media_flagged_at?: string | null
          profile_avatar_media_status?: string
          profile_background_fit_mode?: string
          profile_background_focal_x?: number
          profile_background_focal_y?: number
          profile_background_media_flagged_at?: string | null
          profile_background_media_status?: string
          profile_background_overlay_strength?: number
          profile_background_url?: string | null
          profile_media_updated_at?: string | null
          profile_visibility?: string
          public_activity_visibility?: string
          shares_visibility?: string
          subscriber_surface_enabled?: boolean
          tagline?: string | null
          updated_at?: string
          user_id: string
          username: string
        }
        Update: {
          avatar_index?: number
          avatar_url?: string | null
          channel_layout_preset?: string
          channel_role?: string | null
          default_communication_capture_policy?: string | null
          default_communication_content_access_rule?: string | null
          default_watch_party_capture_policy?: string | null
          default_watch_party_content_access_rule?: string | null
          default_watch_party_join_policy?: string | null
          default_watch_party_reactions_policy?: string | null
          display_name?: string | null
          follower_surface_enabled?: boolean
          likes_visibility?: string
          profile_avatar_fit_mode?: string
          profile_avatar_focal_x?: number
          profile_avatar_focal_y?: number
          profile_avatar_media_flagged_at?: string | null
          profile_avatar_media_status?: string
          profile_background_fit_mode?: string
          profile_background_focal_x?: number
          profile_background_focal_y?: number
          profile_background_media_flagged_at?: string | null
          profile_background_media_status?: string
          profile_background_overlay_strength?: number
          profile_background_url?: string | null
          profile_media_updated_at?: string | null
          profile_visibility?: string
          public_activity_visibility?: string
          shares_visibility?: string
          subscriber_surface_enabled?: boolean
          tagline?: string | null
          updated_at?: string
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      user_push_tokens: {
        Row: {
          app_version: string | null
          build_version: string | null
          created_at: string
          device_id: string | null
          enabled: boolean
          id: string
          install_id: string | null
          last_seen_at: string
          metadata: Json
          platform: string
          provider: string
          revoked_at: string | null
          token: string
          token_fingerprint: string
          token_hash: string
          updated_at: string
          user_id: string
        }
        Insert: {
          app_version?: string | null
          build_version?: string | null
          created_at?: string
          device_id?: string | null
          enabled?: boolean
          id?: string
          install_id?: string | null
          last_seen_at?: string
          metadata?: Json
          platform: string
          provider: string
          revoked_at?: string | null
          token: string
          token_fingerprint: string
          token_hash: string
          updated_at?: string
          user_id: string
        }
        Update: {
          app_version?: string | null
          build_version?: string | null
          created_at?: string
          device_id?: string | null
          enabled?: boolean
          id?: string
          install_id?: string | null
          last_seen_at?: string
          metadata?: Json
          platform?: string
          provider?: string
          revoked_at?: string | null
          token?: string
          token_fingerprint?: string
          token_hash?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_subscriptions: {
        Row: {
          tier: string
          updated_at: string
          user_id: string
        }
        Insert: {
          tier?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          tier?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      video_renditions: {
        Row: {
          access_tier: string
          bitrate_kbps: number | null
          codec: string | null
          container: string | null
          created_at: string
          error_message: string | null
          fps: number | null
          height: number | null
          id: string
          manifest_path: string | null
          owner_id: string
          quality_label: string
          status: string
          storage_bucket: string | null
          storage_path: string | null
          updated_at: string
          video_id: string
          width: number | null
        }
        Insert: {
          access_tier?: string
          bitrate_kbps?: number | null
          codec?: string | null
          container?: string | null
          created_at?: string
          error_message?: string | null
          fps?: number | null
          height?: number | null
          id?: string
          manifest_path?: string | null
          owner_id: string
          quality_label: string
          status?: string
          storage_bucket?: string | null
          storage_path?: string | null
          updated_at?: string
          video_id: string
          width?: number | null
        }
        Update: {
          access_tier?: string
          bitrate_kbps?: number | null
          codec?: string | null
          container?: string | null
          created_at?: string
          error_message?: string | null
          fps?: number | null
          height?: number | null
          id?: string
          manifest_path?: string | null
          owner_id?: string
          quality_label?: string
          status?: string
          storage_bucket?: string | null
          storage_path?: string | null
          updated_at?: string
          video_id?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "video_renditions_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      videos: {
        Row: {
          created_at: string | null
          description: string | null
          file_size_bytes: number | null
          id: string
          mime_type: string | null
          moderated_at: string | null
          moderated_by: string | null
          moderation_reason: string | null
          moderation_status: string
          owner_id: string
          playback_url: string | null
          storage_bucket: string
          storage_object_key: string | null
          storage_path: string | null
          storage_provider: string
          thumb_storage_path: string | null
          thumb_url: string | null
          title: string | null
          updated_at: string
          visibility: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          file_size_bytes?: number | null
          id?: string
          mime_type?: string | null
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_status?: string
          owner_id: string
          playback_url?: string | null
          storage_bucket?: string
          storage_object_key?: string | null
          storage_path?: string | null
          storage_provider?: string
          thumb_storage_path?: string | null
          thumb_url?: string | null
          title?: string | null
          updated_at?: string
          visibility?: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          file_size_bytes?: number | null
          id?: string
          mime_type?: string | null
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          moderation_status?: string
          owner_id?: string
          playback_url?: string | null
          storage_bucket?: string
          storage_object_key?: string | null
          storage_path?: string | null
          storage_provider?: string
          thumb_storage_path?: string | null
          thumb_url?: string | null
          title?: string | null
          updated_at?: string
          visibility?: string
        }
        Relationships: []
      }
      watch_history: {
        Row: {
          completed: boolean
          duration_millis: number | null
          last_position_millis: number
          last_watched_at: string
          play_count: number
          title_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed?: boolean
          duration_millis?: number | null
          last_position_millis?: number
          last_watched_at?: string
          play_count?: number
          title_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed?: boolean
          duration_millis?: number | null
          last_position_millis?: number
          last_watched_at?: string
          play_count?: number
          title_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      watch_party_pass_unlocks: {
        Row: {
          id: number
          room_id: string
          unlocked_at: string
          user_id: string
        }
        Insert: {
          id?: number
          room_id: string
          unlocked_at?: string
          user_id: string
        }
        Update: {
          id?: number
          room_id?: string
          unlocked_at?: string
          user_id?: string
        }
        Relationships: []
      }
      watch_party_room_memberships: {
        Row: {
          avatar_url: string | null
          camera_enabled: boolean
          camera_preview_url: string | null
          can_speak: boolean
          display_name: string | null
          is_muted: boolean
          joined_at: string
          last_seen_at: string
          left_at: string | null
          membership_state: string
          mic_enabled: boolean
          party_id: string
          role: string
          stage_role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          camera_enabled?: boolean
          camera_preview_url?: string | null
          can_speak?: boolean
          display_name?: string | null
          is_muted?: boolean
          joined_at?: string
          last_seen_at?: string
          left_at?: string | null
          membership_state?: string
          mic_enabled?: boolean
          party_id: string
          role?: string
          stage_role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          camera_enabled?: boolean
          camera_preview_url?: string | null
          can_speak?: boolean
          display_name?: string | null
          is_muted?: boolean
          joined_at?: string
          last_seen_at?: string
          left_at?: string | null
          membership_state?: string
          mic_enabled?: boolean
          party_id?: string
          role?: string
          stage_role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watch_party_room_memberships_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "watch_party_rooms"
            referencedColumns: ["party_id"]
          },
        ]
      }
      watch_party_room_messages: {
        Row: {
          created_at: string
          id: string
          party_id: string
          text: string
          user_id: string
          username: string
        }
        Insert: {
          created_at?: string
          id?: string
          party_id: string
          text: string
          user_id: string
          username: string
        }
        Update: {
          created_at?: string
          id?: string
          party_id?: string
          text?: string
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      watch_party_rooms: {
        Row: {
          capture_policy: string
          content_access_rule: string
          created_at: string
          host_user_id: string
          is_active: boolean
          join_policy: string
          last_activity_at: string
          party_id: string
          playback_position_millis: number
          playback_state: string
          reactions_policy: string
          room_type: string
          source_id: string | null
          source_type: string | null
          started_at: string
          title_id: string | null
          updated_at: string
        }
        Insert: {
          capture_policy?: string
          content_access_rule?: string
          created_at?: string
          host_user_id: string
          is_active?: boolean
          join_policy?: string
          last_activity_at?: string
          party_id: string
          playback_position_millis?: number
          playback_state?: string
          reactions_policy?: string
          room_type?: string
          source_id?: string | null
          source_type?: string | null
          started_at?: string
          title_id?: string | null
          updated_at?: string
        }
        Update: {
          capture_policy?: string
          content_access_rule?: string
          created_at?: string
          host_user_id?: string
          is_active?: boolean
          join_policy?: string
          last_activity_at?: string
          party_id?: string
          playback_position_millis?: number
          playback_state?: string
          reactions_policy?: string
          room_type?: string
          source_id?: string | null
          source_type?: string | null
          started_at?: string
          title_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      watch_party_sync_events: {
        Row: {
          created_at: string
          id: string
          kind: string
          party_id: string
          payload: Json
          playback_position_millis: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id: string
          kind: string
          party_id: string
          payload?: Json
          playback_position_millis?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          party_id?: string
          payload?: Json
          playback_position_millis?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watch_party_sync_events_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "watch_party_rooms"
            referencedColumns: ["party_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      acknowledge_beta_onboarding: { Args: never; Returns: Json }
      activate_beta_membership: { Args: never; Returns: Json }
      admin_content_assert_operator: { Args: never; Returns: string }
      admin_content_title_patch_allowed: {
        Args: { p_patch: Json }
        Returns: boolean
      }
      admin_content_write_audit: {
        Args: {
          p_action: string
          p_after_state?: Json
          p_before_state?: Json
          p_metadata?: Json
          p_reason: string
          p_severity?: string
          p_target_id: string
          p_target_type: string
          p_target_user_id?: string
        }
        Returns: string
      }
      admin_create_official_rachi_post: {
        Args: {
          p_body: string
          p_reason?: string
          p_visibility?: string
        }
        Returns: Json
      }
      admin_dmca_add_strike: {
        Args: {
          p_case_id: string
          p_channel_id: string
          p_content_id: string
          p_content_type: string
          p_reason: string
          p_severity: string
          p_user_id: string
        }
        Returns: {
          channel_id: string | null
          content_id: string
          content_type: string
          created_at: string
          dmca_case_id: string
          id: string
          reason: string
          removed_at: string | null
          removed_reason: string | null
          severity: string
          strike_status: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "dmca_strikes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_dmca_create_case: {
        Args: { p_payload: Json; p_source?: string }
        Returns: {
          accuracy_penalty_perjury_statement: boolean
          admin_notes: string | null
          allegedly_infringing_content_id: string | null
          allegedly_infringing_content_type: string
          allegedly_infringing_material_description: string | null
          allegedly_infringing_url: string | null
          assigned_admin_id: string | null
          authorized_agent_name: string | null
          case_number: string
          closed_at: string | null
          copyright_owner_name: string | null
          copyrighted_work_description: string
          copyrighted_work_urls: Json
          created_at: string
          electronic_signature: string
          good_faith_statement: boolean
          id: string
          is_test_case: boolean
          public_attachment_token: string | null
          public_safe_summary: string | null
          received_at: string
          report_type: string
          reporter_address: string | null
          reporter_company: string | null
          reporter_email: string
          reporter_is_owner: boolean
          reporter_name: string
          reporter_phone: string | null
          reporter_user_id: string | null
          security_context_id: string | null
          source: string
          status: string
          submitted_ip_hash: string | null
          submitted_user_agent_hash: string | null
          updated_at: string
          uploader_channel_id: string | null
          uploader_user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "dmca_cases"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_dmca_forward_counter_notice: {
        Args: { p_counter_notice_id: string; p_reason: string }
        Returns: {
          court_action_notice_received_at: string | null
          created_at: string
          dmca_case_id: string
          electronic_signature: string
          forwarded_to_claimant_at: string | null
          good_faith_mistake_statement: boolean
          id: string
          jurisdiction_consent_statement: boolean
          received_at: string
          removed_material_description: string
          removed_material_url_or_location: string
          response_deadline_start_at: string | null
          restore_not_after_at: string | null
          restore_not_before_at: string | null
          security_context_id: string | null
          service_acceptance_statement: boolean
          status: string
          submitter_address: string | null
          submitter_email: string
          submitter_name: string
          submitter_phone: string | null
          submitter_user_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "dmca_counter_notices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_dmca_get_content_state: {
        Args: { p_content_id: string; p_content_type: string }
        Returns: Json
      }
      admin_dmca_mark_restore_eligible: {
        Args: {
          p_case_id: string
          p_counter_notice_id: string
          p_reason: string
        }
        Returns: {
          accuracy_penalty_perjury_statement: boolean
          admin_notes: string | null
          allegedly_infringing_content_id: string | null
          allegedly_infringing_content_type: string
          allegedly_infringing_material_description: string | null
          allegedly_infringing_url: string | null
          assigned_admin_id: string | null
          authorized_agent_name: string | null
          case_number: string
          closed_at: string | null
          copyright_owner_name: string | null
          copyrighted_work_description: string
          copyrighted_work_urls: Json
          created_at: string
          electronic_signature: string
          good_faith_statement: boolean
          id: string
          is_test_case: boolean
          public_attachment_token: string | null
          public_safe_summary: string | null
          received_at: string
          report_type: string
          reporter_address: string | null
          reporter_company: string | null
          reporter_email: string
          reporter_is_owner: boolean
          reporter_name: string
          reporter_phone: string | null
          reporter_user_id: string | null
          security_context_id: string | null
          source: string
          status: string
          submitted_ip_hash: string | null
          submitted_user_agent_hash: string | null
          updated_at: string
          uploader_channel_id: string | null
          uploader_user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "dmca_cases"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_dmca_record_content_action: {
        Args: {
          p_action: string
          p_case_id: string
          p_content_id: string
          p_content_type: string
          p_reason: string
        }
        Returns: {
          action: string
          actor_admin_id: string
          content_id: string
          content_type: string
          created_at: string
          dmca_case_id: string
          id: string
          new_state: Json | null
          previous_state: Json | null
          reason: string
        }
        SetofOptions: {
          from: "*"
          to: "dmca_content_actions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_dmca_record_counter_notice: {
        Args: {
          p_case_id: string
          p_forwarded_to_claimant?: boolean
          p_payload: Json
        }
        Returns: {
          court_action_notice_received_at: string | null
          created_at: string
          dmca_case_id: string
          electronic_signature: string
          forwarded_to_claimant_at: string | null
          good_faith_mistake_statement: boolean
          id: string
          jurisdiction_consent_statement: boolean
          received_at: string
          removed_material_description: string
          removed_material_url_or_location: string
          response_deadline_start_at: string | null
          restore_not_after_at: string | null
          restore_not_before_at: string | null
          security_context_id: string | null
          service_acceptance_statement: boolean
          status: string
          submitter_address: string | null
          submitter_email: string
          submitter_name: string
          submitter_phone: string | null
          submitter_user_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "dmca_counter_notices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_dmca_record_court_action: {
        Args: { p_counter_notice_id: string; p_reason: string }
        Returns: {
          court_action_notice_received_at: string | null
          created_at: string
          dmca_case_id: string
          electronic_signature: string
          forwarded_to_claimant_at: string | null
          good_faith_mistake_statement: boolean
          id: string
          jurisdiction_consent_statement: boolean
          received_at: string
          removed_material_description: string
          removed_material_url_or_location: string
          response_deadline_start_at: string | null
          restore_not_after_at: string | null
          restore_not_before_at: string | null
          security_context_id: string | null
          service_acceptance_statement: boolean
          status: string
          submitter_address: string | null
          submitter_email: string
          submitter_name: string
          submitter_phone: string | null
          submitter_user_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "dmca_counter_notices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_dmca_remove_strike: {
        Args: { p_removed_reason: string; p_strike_id: string }
        Returns: {
          channel_id: string | null
          content_id: string
          content_type: string
          created_at: string
          dmca_case_id: string
          id: string
          reason: string
          removed_at: string | null
          removed_reason: string | null
          severity: string
          strike_status: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "dmca_strikes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_dmca_set_case_status: {
        Args: {
          p_admin_notes?: string
          p_case_id: string
          p_reason: string
          p_status: string
        }
        Returns: {
          accuracy_penalty_perjury_statement: boolean
          admin_notes: string | null
          allegedly_infringing_content_id: string | null
          allegedly_infringing_content_type: string
          allegedly_infringing_material_description: string | null
          allegedly_infringing_url: string | null
          assigned_admin_id: string | null
          authorized_agent_name: string | null
          case_number: string
          closed_at: string | null
          copyright_owner_name: string | null
          copyrighted_work_description: string
          copyrighted_work_urls: Json
          created_at: string
          electronic_signature: string
          good_faith_statement: boolean
          id: string
          is_test_case: boolean
          public_attachment_token: string | null
          public_safe_summary: string | null
          received_at: string
          report_type: string
          reporter_address: string | null
          reporter_company: string | null
          reporter_email: string
          reporter_is_owner: boolean
          reporter_name: string
          reporter_phone: string | null
          reporter_user_id: string | null
          security_context_id: string | null
          source: string
          status: string
          submitted_ip_hash: string | null
          submitted_user_agent_hash: string | null
          updated_at: string
          uploader_channel_id: string | null
          uploader_user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "dmca_cases"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_dmca_update_strike_status: {
        Args: { p_reason: string; p_status: string; p_strike_id: string }
        Returns: {
          channel_id: string | null
          content_id: string
          content_type: string
          created_at: string
          dmca_case_id: string
          id: string
          reason: string
          removed_at: string | null
          removed_reason: string | null
          severity: string
          strike_status: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "dmca_strikes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_grant_platform_role_by_email: {
        Args: { p_reason?: string; p_role: string; p_target_email: string }
        Returns: Json
      }
      admin_grant_platform_staff_permission_by_email: {
        Args: {
          p_expires_at?: string
          p_permission_key: string
          p_reason?: string
          p_target_email: string
        }
        Returns: Json
      }
      admin_reports_actor_can_review: { Args: never; Returns: boolean }
      admin_reports_actor_can_target_action: { Args: never; Returns: boolean }
      admin_reports_assert_reviewer: { Args: never; Returns: undefined }
      admin_reports_assert_target_operator: { Args: never; Returns: undefined }
      admin_reports_classify_severity: {
        Args: { p_category: string; p_context?: Json; p_note: string }
        Returns: string
      }
      admin_reports_safe_uuid: { Args: { p_value: string }; Returns: string }
      admin_reports_target_state: {
        Args: { p_target_id: string; p_target_type: string }
        Returns: Json
      }
      admin_reports_write_audit: {
        Args: {
          p_action_type: string
          p_after_state: Json
          p_before_state: Json
          p_metadata?: Json
          p_new_severity: string
          p_new_status: string
          p_old_severity: string
          p_old_status: string
          p_reason: string
          p_report_id: number
          p_target_id: string
          p_target_type: string
        }
        Returns: string
      }
      admin_revoke_platform_role_by_email: {
        Args: { p_reason?: string; p_role: string; p_target_email: string }
        Returns: Json
      }
      admin_revoke_platform_staff_permission_by_email: {
        Args: {
          p_permission_key: string
          p_reason?: string
          p_target_email: string
        }
        Returns: Json
      }
      admin_update_platform_staff_permissions_by_email: {
        Args: {
          p_expires_at?: string
          p_permission_keys: string[]
          p_reason: string
          p_target_email: string
        }
        Returns: Json
      }
      apply_admin_report_target_action: {
        Args: {
          p_action_type: string
          p_reason: string
          p_report_id: number
          p_target_id: string
          p_target_type: string
        }
        Returns: {
          actioned_at: string | null
          category: string
          context: Json
          created_at: string
          escalated_at: string | null
          id: number
          note: string | null
          reporter_user_id: string
          resolution_reason: string | null
          resolution_type: string | null
          resolved_at: string | null
          resolved_by: string | null
          room_id: string | null
          security_context_id: string | null
          severity: string
          status: string
          target_id: string
          target_type: string
          title_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "safety_reports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      apply_admin_title_programming_action: {
        Args: {
          p_action_type: string
          p_patch?: Json
          p_reason?: string
          p_title_id: string
        }
        Returns: Json
      }
      calculate_creator_instant_cashout_fee: {
        Args: { p_amount_cents: number }
        Returns: number
      }
      calculate_creator_payout_balances: {
        Args: { p_creator_id?: string }
        Returns: Json
      }
      can_access_chat_thread: {
        Args: { target_thread_id: string }
        Returns: boolean
      }
      can_manage_chat_thread_members: {
        Args: { target_thread_id: string }
        Returns: boolean
      }
      can_view_profile_content: {
        Args: { profile_user_id: string }
        Returns: boolean
      }
      chat_thread_has_platform_owner: {
        Args: { target_thread_id: string }
        Returns: boolean
      }
      communication_room_join_allowed: {
        Args: { joining_user_id: string; target_room_id: string }
        Returns: boolean
      }
      create_creator_product_listing: {
        Args: {
          p_currency?: string
          p_description: string
          p_price_cents: number
          p_product_type?: string
          p_title: string
        }
        Returns: Json
      }
      creator_monetization_checkout_preflight: {
        Args: {
          p_amount_cents?: number
          p_checkout_type: string
          p_target_id?: string
        }
        Returns: Json
      }
      discovery_feed_item_blocked_for_current_user: {
        Args: { target_feed_item_id: string }
        Returns: boolean
      }
      dmca_add_business_days: {
        Args: { day_count: number; start_at: string }
        Returns: string
      }
      dmca_assert_owner_operator: { Args: never; Returns: undefined }
      dmca_can_access_admin: { Args: never; Returns: boolean }
      dmca_detect_test_case: {
        Args: {
          p_reporter_email: string
          p_reporter_name: string
          p_source?: string
        }
        Returns: boolean
      }
      dmca_evidence_storage_insert_allowed: {
        Args: { p_name: string }
        Returns: boolean
      }
      dmca_next_case_number: { Args: never; Returns: string }
      dmca_resolve_uploader_user_id: {
        Args: { content_id: string; content_type: string }
        Returns: string
      }
      dmca_safe_uuid: { Args: { value: string }; Returns: string }
      dmca_write_audit: {
        Args: {
          p_actor_role: string
          p_case_id: string
          p_event_type: string
          p_metadata?: Json
          p_reason?: string
        }
        Returns: string
      }
      get_admin_content_config: { Args: never; Returns: Json }
      get_admin_report_detail: { Args: { p_report_id: number }; Returns: Json }
      get_admin_reports_overview: { Args: never; Returns: Json }
      get_provider_readiness_summary: {
        Args: never
        Returns: {
          capability: string
          display_label: string
          display_summary: string
          is_live_money_enabled: boolean
          last_checked_at: string
          next_step: string
          provider: string
          public_safe: boolean
          status: string
        }[]
      }
      get_security_request_context_summary: {
        Args: { p_context_id: string }
        Returns: Json
      }
      has_active_beta_access: { Args: never; Returns: boolean }
      has_platform_permission: {
        Args: { p_permission_key: string }
        Returns: boolean
      }
      has_platform_role: {
        Args: { required_roles: string[] }
        Returns: boolean
      }
      is_current_platform_owner: { Args: never; Returns: boolean }
      is_platform_owner_user: {
        Args: { target_user_id: string }
        Returns: boolean
      }
      list_admin_content_audit_events: {
        Args: { p_limit?: number }
        Returns: {
          action: string
          action_category: string
          actor_email: string | null
          actor_role: string | null
          actor_user_id: string | null
          after_state: Json | null
          before_state: Json | null
          created_at: string
          id: string
          ip_hash: string | null
          metadata: Json
          reason: string | null
          request_id: string | null
          security_context_id: string | null
          severity: string
          target_channel_user_id: string | null
          target_id: string | null
          target_type: string | null
          target_user_id: string | null
          user_agent_hash: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "platform_admin_audit_logs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_admin_report_audit_events: {
        Args: { p_report_id: number }
        Returns: {
          action: string
          action_category: string
          actor_email: string | null
          actor_role: string | null
          actor_user_id: string | null
          after_state: Json | null
          before_state: Json | null
          created_at: string
          id: string
          ip_hash: string | null
          metadata: Json
          reason: string | null
          request_id: string | null
          security_context_id: string | null
          severity: string
          target_channel_user_id: string | null
          target_id: string | null
          target_type: string | null
          target_user_id: string | null
          user_agent_hash: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "platform_admin_audit_logs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_admin_reports: {
        Args: {
          p_cursor?: string
          p_filter?: string
          p_limit?: number
          p_severity?: string
          p_status?: string
          p_target_type?: string
        }
        Returns: {
          actioned_at: string | null
          category: string
          context: Json
          created_at: string
          escalated_at: string | null
          id: number
          note: string | null
          reporter_user_id: string
          resolution_reason: string | null
          resolution_type: string | null
          resolved_at: string | null
          resolved_by: string | null
          room_id: string | null
          security_context_id: string | null
          severity: string
          status: string
          target_id: string
          target_type: string
          title_id: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "safety_reports"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_admin_role_audit_events: {
        Args: { p_filter?: string; p_limit?: number }
        Returns: {
          action: string
          actor_email: string
          actor_role: string
          actor_user_id: string
          audit_kind: string
          created_at: string
          id: string
          metadata: Json
          permission_key: string
          reason: string
          role: string
          target_email: string
          target_user_id: string
        }[]
      }
      list_staff_scoped_permissions_by_email: {
        Args: { p_target_email: string }
        Returns: string[]
      }
      monetization_has_active_premium: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      monetization_settings_json: { Args: never; Returns: Json }
      monetization_write_audit: {
        Args: {
          p_action: string
          p_actor_user_id: string
          p_metadata?: Json
          p_target_id?: string
          p_target_type: string
        }
        Returns: undefined
      }
      owner_security_center_table_status: { Args: never; Returns: Json }
      platform_actor_should_write_app_audit: {
        Args: {
          p_actor_email: string
          p_actor_role: string
          p_actor_user_id: string
        }
        Returns: boolean
      }
      platform_brand_asset_cleanup_candidates: {
        Args: { p_limit?: number; p_retention_days?: number }
        Returns: {
          asset_id: string
          asset_state: string
          asset_type: string
          cleanup_reason: string
          created_at: string
          deleted_at: string
          moderation_status: string
          owner_user_id: string
          storage_bucket: string
          storage_path: string
          updated_at: string
        }[]
      }
      platform_brand_asset_public_safe: {
        Args: { p_asset_id: string; p_owner_user_id?: string }
        Returns: boolean
      }
      platform_break_glass_active_for_actor: {
        Args: { p_actor_email: string; p_actor_user_id: string }
        Returns: boolean
      }
      platform_current_break_glass_session_id: {
        Args: { p_actor_email?: string; p_actor_user_id?: string }
        Returns: string
      }
      platform_staff_actor_role: { Args: never; Returns: string }
      platform_staff_normalize_email: {
        Args: { p_email: string }
        Returns: string
      }
      platform_staff_normalize_permission_key: {
        Args: { p_permission_key: string }
        Returns: string
      }
      platform_staff_normalize_role: {
        Args: { p_role: string }
        Returns: string
      }
      platform_staff_target_has_role: {
        Args: { p_allowed_roles: string[]; p_target_email: string }
        Returns: boolean
      }
      platform_staff_write_audit: {
        Args: {
          p_action: string
          p_actor_email: string
          p_actor_role: string
          p_actor_user_id: string
          p_metadata?: Json
          p_reason: string
          p_role: string
          p_target_email: string
        }
        Returns: undefined
      }
      platform_staff_write_permission_audit: {
        Args: {
          p_action: string
          p_actor_email: string
          p_actor_role: string
          p_actor_user_id: string
          p_metadata?: Json
          p_permission_key: string
          p_reason: string
          p_target_email: string
          p_target_user_id: string
        }
        Returns: undefined
      }
      read_my_dmca_counter_notice_case: {
        Args: { p_case_id: string }
        Returns: {
          case_number: string
          content_id: string
          content_type: string
          content_url: string
          existing_counter_notice_count: number
          id: string
          public_safe_summary: string
          received_at: string
          status: string
        }[]
      }
      read_my_platform_staff_permission_keys: { Args: never; Returns: string[] }
      read_public_channel_profile: {
        Args: { profile_user_id: string }
        Returns: {
          avatar_index: number
          avatar_url: string
          channel_layout_preset: string
          channel_role: string
          default_communication_capture_policy: string
          default_communication_content_access_rule: string
          default_watch_party_capture_policy: string
          default_watch_party_content_access_rule: string
          default_watch_party_join_policy: string
          default_watch_party_reactions_policy: string
          display_name: string
          follower_surface_enabled: boolean
          profile_avatar_fit_mode: string
          profile_avatar_focal_x: number
          profile_avatar_focal_y: number
          profile_avatar_media_flagged_at: string
          profile_avatar_media_status: string
          profile_background_fit_mode: string
          profile_background_focal_x: number
          profile_background_focal_y: number
          profile_background_media_flagged_at: string
          profile_background_media_status: string
          profile_background_overlay_strength: number
          profile_background_url: string
          profile_visibility: string
          public_activity_visibility: string
          subscriber_surface_enabled: boolean
          tagline: string
          user_id: string
          username: string
        }[]
      }
      read_public_platform_brand_profile: {
        Args: { profile_user_id: string }
        Returns: {
          accent_color: string
          avatar_asset_id: string
          background_fit_mode: string
          background_focal_x: number
          background_focal_y: number
          background_image_asset_id: string
          blur_strength: number
          hero_crop_scale: number
          hero_fit_mode: string
          hero_focal_x: number
          hero_focal_y: number
          hero_image_asset_id: string
          hero_poster_asset_id: string
          hero_video_asset_id: string
          logo_asset_id: string
          overlay_strength: number
          owner_user_id: string
          published_at: string
          spotlight_video_id: string
          theme_preset: string
          updated_at: string
          watermark_asset_id: string
        }[]
      }
      record_creator_video_upload_usage: {
        Args: { target_video_id: string }
        Returns: Json
      }
      record_video_original_rendition: {
        Args: { p_video_id: string }
        Returns: Json
      }
      request_creator_payout: {
        Args: { p_amount_cents: number; p_payout_type?: string }
        Returns: Json
      }
      request_friendship: {
        Args: { target_user_id: string }
        Returns: {
          actioned_by_user_id: string | null
          created_at: string
          requested_by_user_id: string
          responded_at: string | null
          status: string
          updated_at: string
          user_high_id: string
          user_low_id: string
        }
        SetofOptions: {
          from: "*"
          to: "user_friendships"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_creator_content_access: {
        Args: { p_content_id: string; p_content_type: string }
        Returns: Json
      }
      resolve_video_playback: {
        Args: { target_video_id: string }
        Returns: Json
      }
      respond_to_friendship: {
        Args: { next_action: string; target_user_id: string }
        Returns: {
          actioned_by_user_id: string | null
          created_at: string
          requested_by_user_id: string
          responded_at: string | null
          status: string
          updated_at: string
          user_high_id: string
          user_low_id: string
        }
        SetofOptions: {
          from: "*"
          to: "user_friendships"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      review_platform_brand_asset: {
        Args: { p_action: string; p_asset_id: string; p_reason?: string }
        Returns: Json
      }
      rollup_creator_video_upload_usage_daily: {
        Args: { target_usage_date?: string }
        Returns: Json
      }
      sanitize_app_configuration: {
        Args: { input_config: Json }
        Returns: Json
      }
      save_admin_content_config: {
        Args: { p_config_patch: Json; p_reason: string }
        Returns: Json
      }
      save_admin_creator_grants: {
        Args: { p_grants: Json; p_reason: string; p_target_user_id: string }
        Returns: Json
      }
      security_context_id_from_metadata: {
        Args: { p_metadata: Json }
        Returns: string
      }
      set_creator_content_price: {
        Args: {
          p_content_id: string
          p_content_type: string
          p_currency?: string
          p_is_paid: boolean
          p_price_cents: number
        }
        Returns: Json
      }
      submit_dmca_attachment_metadata: {
        Args: { p_payload: Json }
        Returns: {
          bucket_id: string
          counter_notice_id: string | null
          created_at: string
          dmca_case_id: string
          id: string
          mime_type: string
          object_path: string
          original_filename: string
          preserved_for_evidence: boolean
          retention_status: string
          scan_notes: string
          scan_provider: string
          scan_status: string
          security_context_id: string | null
          size_bytes: number
          source: string
          submitted_by_role: string
          submitted_by_user_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "dmca_attachments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_dmca_counter_notice: {
        Args: { p_case_id: string; p_payload: Json }
        Returns: {
          court_action_notice_received_at: string | null
          created_at: string
          dmca_case_id: string
          electronic_signature: string
          forwarded_to_claimant_at: string | null
          good_faith_mistake_statement: boolean
          id: string
          jurisdiction_consent_statement: boolean
          received_at: string
          removed_material_description: string
          removed_material_url_or_location: string
          response_deadline_start_at: string | null
          restore_not_after_at: string | null
          restore_not_before_at: string | null
          security_context_id: string | null
          service_acceptance_statement: boolean
          status: string
          submitter_address: string | null
          submitter_email: string
          submitter_name: string
          submitter_phone: string | null
          submitter_user_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "dmca_counter_notices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_dmca_notice: {
        Args: { p_payload: Json }
        Returns: {
          attachment_token: string
          case_number: string
          id: string
          status: string
        }[]
      }
      update_admin_report_status: {
        Args: { p_reason: string; p_report_id: number; p_status_action: string }
        Returns: {
          actioned_at: string | null
          category: string
          context: Json
          created_at: string
          escalated_at: string | null
          id: number
          note: string | null
          reporter_user_id: string
          resolution_reason: string | null
          resolution_type: string | null
          resolved_at: string | null
          resolved_by: string | null
          room_id: string | null
          security_context_id: string | null
          severity: string
          status: string
          target_id: string
          target_type: string
          title_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "safety_reports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      user_has_active_entitlement: {
        Args: { required_entitlement_keys: string[]; target_user_id: string }
        Returns: boolean
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
