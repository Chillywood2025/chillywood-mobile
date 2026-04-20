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
          id: string
          owner_id: string
          playback_url: string | null
          thumb_url: string | null
          title: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          owner_id: string
          playback_url?: string | null
          thumb_url?: string | null
          title?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          owner_id?: string
          playback_url?: string | null
          thumb_url?: string | null
          title?: string | null
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
      communication_room_join_allowed: {
        Args: { joining_user_id: string; target_room_id: string }
        Returns: boolean
      }
      has_active_beta_access: { Args: never; Returns: boolean }
      has_platform_role: {
        Args: { required_roles: string[] }
        Returns: boolean
      }
      sanitize_app_configuration: {
        Args: { input_config: Json }
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
