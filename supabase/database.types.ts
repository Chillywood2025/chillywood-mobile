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
      creator_payout_accounts: {
        Row: {
          charges_enabled: boolean
          country: string | null
          created_at: string
          creator_user_id: string
          default_currency: string
          details_submitted: boolean
          disabled_reason: string | null
          id: string
          last_provider_sync_at: string | null
          metadata: Json
          onboarding_completed_at: string | null
          onboarding_started_at: string | null
          payouts_enabled: boolean
          provider: string
          provider_account_id: string | null
          requirements_currently_due: Json
          requirements_eventually_due: Json
          requirements_past_due: Json
          status: string
          updated_at: string
        }
        Insert: {
          charges_enabled?: boolean
          country?: string | null
          created_at?: string
          creator_user_id: string
          default_currency?: string
          details_submitted?: boolean
          disabled_reason?: string | null
          id?: string
          last_provider_sync_at?: string | null
          metadata?: Json
          onboarding_completed_at?: string | null
          onboarding_started_at?: string | null
          payouts_enabled?: boolean
          provider?: string
          provider_account_id?: string | null
          requirements_currently_due?: Json
          requirements_eventually_due?: Json
          requirements_past_due?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          charges_enabled?: boolean
          country?: string | null
          created_at?: string
          creator_user_id?: string
          default_currency?: string
          details_submitted?: boolean
          disabled_reason?: string | null
          id?: string
          last_provider_sync_at?: string | null
          metadata?: Json
          onboarding_completed_at?: string | null
          onboarding_started_at?: string | null
          payouts_enabled?: boolean
          provider?: string
          provider_account_id?: string | null
          requirements_currently_due?: Json
          requirements_eventually_due?: Json
          requirements_past_due?: Json
          status?: string
          updated_at?: string
        }
        Relationships: []
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
          previous_status: string | null
          reason: string | null
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
          previous_status?: string | null
          reason?: string | null
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
          previous_status?: string | null
          reason?: string | null
          target_id?: string
          target_table?: string
        }
        Relationships: []
      }
      creator_payout_batches: {
        Row: {
          approved_at: string | null
          approved_by_user_id: string | null
          batch_reference: string | null
          created_at: string
          currency: string
          entry_count: number
          id: string
          metadata: Json
          period_end: string | null
          period_start: string | null
          processed_at: string | null
          status: string
          total_amount_minor: number
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by_user_id?: string | null
          batch_reference?: string | null
          created_at?: string
          currency?: string
          entry_count?: number
          id?: string
          metadata?: Json
          period_end?: string | null
          period_start?: string | null
          processed_at?: string | null
          status?: string
          total_amount_minor?: number
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by_user_id?: string | null
          batch_reference?: string | null
          created_at?: string
          currency?: string
          entry_count?: number
          id?: string
          metadata?: Json
          period_end?: string | null
          period_start?: string | null
          processed_at?: string | null
          status?: string
          total_amount_minor?: number
          updated_at?: string
        }
        Relationships: []
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
          metadata: Json
          payout_account_id: string | null
          payout_entry_id: number | null
          provider: string
          provider_created_at: string | null
          provider_payout_id: string | null
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
          metadata?: Json
          payout_account_id?: string | null
          payout_entry_id?: number | null
          provider?: string
          provider_created_at?: string | null
          provider_payout_id?: string | null
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
          metadata?: Json
          payout_account_id?: string | null
          payout_entry_id?: number | null
          provider?: string
          provider_created_at?: string | null
          provider_payout_id?: string | null
          provider_transfer_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
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
      notifications: {
        Row: {
          body: string | null
          category: string
          created_at: string
          dismissed_at: string | null
          id: string
          read_at: string | null
          target_context: Json
          target_entity_id: string | null
          target_route: string
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          category: string
          created_at?: string
          dismissed_at?: string | null
          id?: string
          read_at?: string | null
          target_context?: Json
          target_entity_id?: string | null
          target_route: string
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          category?: string
          created_at?: string
          dismissed_at?: string | null
          id?: string
          read_at?: string | null
          target_context?: Json
          target_entity_id?: string | null
          target_route?: string
          title?: string
          user_id?: string
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
          reason: string
          released_at: string | null
          released_by_user_id: string | null
          status: string
          target_id: string | null
          target_type: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          created_by_user_id?: string | null
          enforcement_scope?: string
          id?: number
          metadata?: Json
          reason: string
          released_at?: string | null
          released_by_user_id?: string | null
          status?: string
          target_id?: string | null
          target_type?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          created_by_user_id?: string | null
          enforcement_scope?: string
          id?: number
          metadata?: Json
          reason?: string
          released_at?: string | null
          released_by_user_id?: string | null
          status?: string
          target_id?: string | null
          target_type?: string
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
          role: string
          status: string
          user_id: string | null
        }
        Insert: {
          email?: string | null
          granted_at?: string
          granted_by?: string | null
          id?: number
          notes?: string | null
          role: string
          status?: string
          user_id?: string | null
        }
        Update: {
          email?: string | null
          granted_at?: string
          granted_by?: string | null
          id?: number
          notes?: string | null
          role?: string
          status?: string
          user_id?: string | null
        }
        Relationships: []
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
      safety_reports: {
        Row: {
          category: string
          context: Json
          created_at: string
          id: number
          note: string | null
          reporter_user_id: string
          room_id: string | null
          target_id: string
          target_type: string
          title_id: string | null
        }
        Insert: {
          category: string
          context?: Json
          created_at?: string
          id?: number
          note?: string | null
          reporter_user_id: string
          room_id?: string | null
          target_id: string
          target_type: string
          title_id?: string | null
        }
        Update: {
          category?: string
          context?: Json
          created_at?: string
          id?: number
          note?: string | null
          reporter_user_id?: string
          room_id?: string | null
          target_id?: string
          target_type?: string
          title_id?: string | null
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
      sponsor_deal_records: {
        Row: {
          brand_name: string | null
          created_at: string
          creator_user_id: string | null
          currency: string
          deal_title: string | null
          deal_type: string
          disclosure_required: boolean
          gross_amount_minor: number | null
          id: number
          metadata: Json
          status: string
          updated_at: string
        }
        Insert: {
          brand_name?: string | null
          created_at?: string
          creator_user_id?: string | null
          currency?: string
          deal_title?: string | null
          deal_type?: string
          disclosure_required?: boolean
          gross_amount_minor?: number | null
          id?: number
          metadata?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          brand_name?: string | null
          created_at?: string
          creator_user_id?: string | null
          currency?: string
          deal_title?: string | null
          deal_type?: string
          disclosure_required?: boolean
          gross_amount_minor?: number | null
          id?: number
          metadata?: Json
          status?: string
          updated_at?: string
        }
        Relationships: []
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
      communication_room_join_allowed: {
        Args: { joining_user_id: string; target_room_id: string }
        Returns: boolean
      }
      has_active_beta_access: { Args: never; Returns: boolean }
      has_platform_role: {
        Args: { required_roles: string[] }
        Returns: boolean
      }
      record_creator_video_upload_usage: {
        Args: { target_video_id: string }
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
      rollup_creator_video_upload_usage_daily: {
        Args: { target_usage_date?: string }
        Returns: Json
      }
      sanitize_app_configuration: {
        Args: { input_config: Json }
        Returns: Json
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
  public: {
    Enums: {},
  },
} as const
