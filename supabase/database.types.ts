export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      abuse_rate_limit_events: {
        Row: {
          action_key: string
          actor_user_id: string
          created_at: string
          id: string
          metadata: Json
          target_key: string
        }
        Insert: {
          action_key: string
          actor_user_id: string
          created_at?: string
          id?: string
          metadata?: Json
          target_key: string
        }
        Update: {
          action_key?: string
          actor_user_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          target_key?: string
        }
        Relationships: []
      }
      access_grants: {
        Row: {
          audit_id: string | null
          created_at: string
          environment: string
          expires_at: string | null
          grant_type: string
          id: string
          metadata: Json
          product_id: string | null
          provider: string | null
          provider_event_id: string | null
          refunded_at: string | null
          revoke_reason: string | null
          revoked_at: string | null
          source_id: string | null
          source_type: string
          starts_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          audit_id?: string | null
          created_at?: string
          environment?: string
          expires_at?: string | null
          grant_type: string
          id?: string
          metadata?: Json
          product_id?: string | null
          provider?: string | null
          provider_event_id?: string | null
          refunded_at?: string | null
          revoke_reason?: string | null
          revoked_at?: string | null
          source_id?: string | null
          source_type: string
          starts_at?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          audit_id?: string | null
          created_at?: string
          environment?: string
          expires_at?: string | null
          grant_type?: string
          id?: string
          metadata?: Json
          product_id?: string | null
          provider?: string | null
          provider_event_id?: string | null
          refunded_at?: string | null
          revoke_reason?: string | null
          revoked_at?: string | null
          source_id?: string | null
          source_type?: string
          starts_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_grants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "monetization_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_grants_provider_event_id_fkey"
            columns: ["provider_event_id"]
            isOneToOne: false
            referencedRelation: "provider_events"
            referencedColumns: ["id"]
          },
        ]
      }
      account_deletion_requests: {
        Row: {
          delete_after: string | null
          details: string | null
          id: string
          metadata: Json
          processed_at: string | null
          reason: string | null
          requested_at: string
          requester_email: string | null
          restore_deadline: string | null
          restored_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          delete_after?: string | null
          details?: string | null
          id?: string
          metadata?: Json
          processed_at?: string | null
          reason?: string | null
          requested_at?: string
          requester_email?: string | null
          restore_deadline?: string | null
          restored_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          delete_after?: string | null
          details?: string | null
          id?: string
          metadata?: Json
          processed_at?: string | null
          reason?: string | null
          requested_at?: string
          requester_email?: string | null
          restore_deadline?: string | null
          restored_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      account_fixture_health_findings: {
        Row: {
          account_label: string
          account_role: string
          actual_state: string
          app_version: string | null
          blocker_classification: string
          bundle_identifier: string | null
          channel: string | null
          created_at: string
          data_source: string | null
          discovered_by: string
          distribution_source: string | null
          expected_state: string
          fake_proof: boolean
          finding_status: string
          high_risk_executed: boolean
          id: string
          metadata: Json
          money_moved: boolean
          native_build: string | null
          next_safe_action: string
          owner_command_request_id: string | null
          platform: string
          private_evidence_stored: boolean
          provider_backed: boolean
          provider_environment: string | null
          readback_complete: boolean
          result: string
          runtime_version: string | null
          secrets_logged: boolean
          source: string
          system_id: string
          update_id: string | null
          updated_at: string
          user_rights_changed: boolean
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          account_label: string
          account_role: string
          actual_state: string
          app_version?: string | null
          blocker_classification: string
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          discovered_by?: string
          distribution_source?: string | null
          expected_state: string
          fake_proof?: boolean
          finding_status?: string
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          next_safe_action: string
          owner_command_request_id?: string | null
          platform?: string
          private_evidence_stored?: boolean
          provider_backed?: boolean
          provider_environment?: string | null
          readback_complete?: boolean
          result?: string
          runtime_version?: string | null
          secrets_logged?: boolean
          source: string
          system_id?: string
          update_id?: string | null
          updated_at?: string
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          account_label?: string
          account_role?: string
          actual_state?: string
          app_version?: string | null
          blocker_classification?: string
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          discovered_by?: string
          distribution_source?: string | null
          expected_state?: string
          fake_proof?: boolean
          finding_status?: string
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          next_safe_action?: string
          owner_command_request_id?: string | null
          platform?: string
          private_evidence_stored?: boolean
          provider_backed?: boolean
          provider_environment?: string | null
          readback_complete?: boolean
          result?: string
          runtime_version?: string | null
          secrets_logged?: boolean
          source?: string
          system_id?: string
          update_id?: string | null
          updated_at?: string
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "account_fixture_health_findings_owner_command_request_id_fkey"
            columns: ["owner_command_request_id"]
            isOneToOne: false
            referencedRelation: "owner_command_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      account_purge_batch_runs: {
        Row: {
          actor_user_id: string | null
          completed_at: string | null
          eligible_count: number
          failed_count: number
          failure_reason: string | null
          id: string
          manual_review_count: number
          max_batch_size: number
          metadata: Json
          mode: string
          processed_count: number
          result_summary: Json
          skipped_count: number
          started_at: string
          status: string
        }
        Insert: {
          actor_user_id?: string | null
          completed_at?: string | null
          eligible_count?: number
          failed_count?: number
          failure_reason?: string | null
          id?: string
          manual_review_count?: number
          max_batch_size?: number
          metadata?: Json
          mode: string
          processed_count?: number
          result_summary?: Json
          skipped_count?: number
          started_at?: string
          status?: string
        }
        Update: {
          actor_user_id?: string | null
          completed_at?: string | null
          eligible_count?: number
          failed_count?: number
          failure_reason?: string | null
          id?: string
          manual_review_count?: number
          max_batch_size?: number
          metadata?: Json
          mode?: string
          processed_count?: number
          result_summary?: Json
          skipped_count?: number
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      account_purge_manual_review_items: {
        Row: {
          audit_log_id: string | null
          batch_run_id: string | null
          category: string
          created_at: string
          id: string
          metadata: Json
          reason: string
          resolution: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source_id: string | null
          source_type: string
          status: string
          target_user_id: string
        }
        Insert: {
          audit_log_id?: string | null
          batch_run_id?: string | null
          category: string
          created_at?: string
          id?: string
          metadata?: Json
          reason: string
          resolution?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_id?: string | null
          source_type: string
          status?: string
          target_user_id: string
        }
        Update: {
          audit_log_id?: string | null
          batch_run_id?: string | null
          category?: string
          created_at?: string
          id?: string
          metadata?: Json
          reason?: string
          resolution?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_id?: string | null
          source_type?: string
          status?: string
          target_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_purge_manual_review_items_batch_run_id_fkey"
            columns: ["batch_run_id"]
            isOneToOne: false
            referencedRelation: "account_purge_batch_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      account_purge_runtime_config: {
        Row: {
          batch_enabled: boolean
          emergency_stop: boolean
          id: boolean
          max_batch_size: number
          note: string | null
          proof_batch_enabled: boolean
          single_user_enabled: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          batch_enabled?: boolean
          emergency_stop?: boolean
          id?: boolean
          max_batch_size?: number
          note?: string | null
          proof_batch_enabled?: boolean
          single_user_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          batch_enabled?: boolean
          emergency_stop?: boolean
          id?: boolean
          max_batch_size?: number
          note?: string | null
          proof_batch_enabled?: boolean
          single_user_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
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
      analytics_delivery_findings: {
        Row: {
          app_version: string | null
          bundle_identifier: string | null
          capability: string | null
          channel: string | null
          created_at: string
          data_source: string | null
          distribution_source: string | null
          environment_mode: string
          flag_type: string
          id: string
          metadata: Json
          money_moved: boolean
          native_build: string | null
          pii_stored: boolean
          platform: string
          provider: string | null
          provider_environment: string | null
          readback_complete: boolean
          release_action_executed: boolean
          review_status: string
          runtime_version: string | null
          secrets_logged: boolean
          severity: string
          system_id: string
          target_id: string | null
          target_type: string | null
          update_id: string | null
          updated_at: string
          user_rights_changed: boolean
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          app_version?: string | null
          bundle_identifier?: string | null
          capability?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          distribution_source?: string | null
          environment_mode?: string
          flag_type: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          pii_stored?: boolean
          platform?: string
          provider?: string | null
          provider_environment?: string | null
          readback_complete?: boolean
          release_action_executed?: boolean
          review_status?: string
          runtime_version?: string | null
          secrets_logged?: boolean
          severity?: string
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          update_id?: string | null
          updated_at?: string
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          app_version?: string | null
          bundle_identifier?: string | null
          capability?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          distribution_source?: string | null
          environment_mode?: string
          flag_type?: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          pii_stored?: boolean
          platform?: string
          provider?: string | null
          provider_environment?: string | null
          readback_complete?: boolean
          release_action_executed?: boolean
          review_status?: string
          runtime_version?: string | null
          secrets_logged?: boolean
          severity?: string
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          update_id?: string | null
          updated_at?: string
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
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
      approval_integrity_findings: {
        Row: {
          created_at: string
          environment_mode: string
          finding_type: string
          id: string
          metadata: Json
          money_moved: boolean
          review_status: string
          severity: string
          system_id: string
          user_rights_changed: boolean
        }
        Insert: {
          created_at?: string
          environment_mode?: string
          finding_type: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          review_status?: string
          severity?: string
          system_id?: string
          user_rights_changed?: boolean
        }
        Update: {
          created_at?: string
          environment_mode?: string
          finding_type?: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          review_status?: string
          severity?: string
          system_id?: string
          user_rights_changed?: boolean
        }
        Relationships: []
      }
      autonomous_approval_request_events: {
        Row: {
          actor_id: string | null
          actor_type: string
          created_at: string
          event_summary: string
          event_type: string
          id: string
          metadata: Json
          platform: string
          request_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_type: string
          created_at?: string
          event_summary: string
          event_type: string
          id?: string
          metadata?: Json
          platform?: string
          request_id: string
        }
        Update: {
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          event_summary?: string
          event_type?: string
          id?: string
          metadata?: Json
          platform?: string
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "autonomous_approval_request_events_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "autonomous_approval_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      autonomous_approval_requests: {
        Row: {
          action_id: string
          allowed_write_scope: Json
          approval_level: number
          approved_at: string | null
          approved_by: string | null
          created_at: string
          denial_reason: string | null
          denied_at: string | null
          denied_by: string | null
          execution_result: string | null
          expires_at: string
          forbidden_scope: Json
          id: string
          kill_switch_plan: string
          metadata: Json
          platform: string
          proof_plan: string
          proposed_action: string
          reason: string
          requested_by_actor_id: string | null
          requested_by_actor_type: string
          risk_summary: string
          rollback_plan: string
          status: string
          system_id: string
          title: string
          updated_at: string
          validation_plan: string
        }
        Insert: {
          action_id: string
          allowed_write_scope?: Json
          approval_level: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          denial_reason?: string | null
          denied_at?: string | null
          denied_by?: string | null
          execution_result?: string | null
          expires_at: string
          forbidden_scope?: Json
          id?: string
          kill_switch_plan: string
          metadata?: Json
          platform?: string
          proof_plan: string
          proposed_action: string
          reason: string
          requested_by_actor_id?: string | null
          requested_by_actor_type: string
          risk_summary: string
          rollback_plan: string
          status?: string
          system_id: string
          title: string
          updated_at?: string
          validation_plan: string
        }
        Update: {
          action_id?: string
          allowed_write_scope?: Json
          approval_level?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          denial_reason?: string | null
          denied_at?: string | null
          denied_by?: string | null
          execution_result?: string | null
          expires_at?: string
          forbidden_scope?: Json
          id?: string
          kill_switch_plan?: string
          metadata?: Json
          platform?: string
          proof_plan?: string
          proposed_action?: string
          reason?: string
          requested_by_actor_id?: string | null
          requested_by_actor_type?: string
          risk_summary?: string
          rollback_plan?: string
          status?: string
          system_id?: string
          title?: string
          updated_at?: string
          validation_plan?: string
        }
        Relationships: []
      }
      autonomous_current_findings: {
        Row: {
          created_at: string
          current_status: string
          finding_key: string
          finding_type: string
          first_seen_at: string
          high_risk_executed: boolean
          id: string
          last_seen_at: string
          metadata: Json
          money_moved: boolean
          occurrence_count: number
          platform: string
          provider: string
          resolved_at: string | null
          severity: string
          system_id: string
          target_surface: string
          updated_at: string
          user_rights_changed: boolean
        }
        Insert: {
          created_at?: string
          current_status?: string
          finding_key: string
          finding_type: string
          first_seen_at?: string
          high_risk_executed?: boolean
          id?: string
          last_seen_at?: string
          metadata?: Json
          money_moved?: boolean
          occurrence_count?: number
          platform: string
          provider?: string
          resolved_at?: string | null
          severity?: string
          system_id: string
          target_surface?: string
          updated_at?: string
          user_rights_changed?: boolean
        }
        Update: {
          created_at?: string
          current_status?: string
          finding_key?: string
          finding_type?: string
          first_seen_at?: string
          high_risk_executed?: boolean
          id?: string
          last_seen_at?: string
          metadata?: Json
          money_moved?: boolean
          occurrence_count?: number
          platform?: string
          provider?: string
          resolved_at?: string | null
          severity?: string
          system_id?: string
          target_surface?: string
          updated_at?: string
          user_rights_changed?: boolean
        }
        Relationships: []
      }
      autonomous_finding_lifecycle_events: {
        Row: {
          created_at: string
          event_summary: string
          event_type: string
          finding_key: string
          id: string
          metadata: Json
          platform: string
          system_id: string
        }
        Insert: {
          created_at?: string
          event_summary: string
          event_type: string
          finding_key: string
          id?: string
          metadata?: Json
          platform: string
          system_id: string
        }
        Update: {
          created_at?: string
          event_summary?: string
          event_type?: string
          finding_key?: string
          id?: string
          metadata?: Json
          platform?: string
          system_id?: string
        }
        Relationships: []
      }
      autonomous_provider_readback_capabilities: {
        Row: {
          app_version: string | null
          bundle_identifier: string | null
          capability: string
          capability_state: string
          channel: string | null
          created_at: string
          data_source: string
          distribution_source: string | null
          high_risk_executed: boolean
          id: string
          metadata: Json
          missing_capability: string | null
          money_moved: boolean
          native_build: string | null
          platform: string
          provider: string
          provider_environment: string | null
          readback_complete: boolean
          runtime_version: string | null
          system_id: string
          update_id: string | null
          user_rights_changed: boolean
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          app_version?: string | null
          bundle_identifier?: string | null
          capability: string
          capability_state: string
          channel?: string | null
          created_at?: string
          data_source: string
          distribution_source?: string | null
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          missing_capability?: string | null
          money_moved?: boolean
          native_build?: string | null
          platform?: string
          provider: string
          provider_environment?: string | null
          readback_complete?: boolean
          runtime_version?: string | null
          system_id: string
          update_id?: string | null
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          app_version?: string | null
          bundle_identifier?: string | null
          capability?: string
          capability_state?: string
          channel?: string | null
          created_at?: string
          data_source?: string
          distribution_source?: string | null
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          missing_capability?: string | null
          money_moved?: boolean
          native_build?: string | null
          platform?: string
          provider?: string
          provider_environment?: string | null
          readback_complete?: boolean
          runtime_version?: string | null
          system_id?: string
          update_id?: string | null
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Relationships: []
      }
      autonomous_provider_readback_current: {
        Row: {
          app_version: string | null
          bundle_identifier: string | null
          capability: string
          capability_state: string
          channel: string | null
          current_status: string
          data_source: string
          distribution_source: string | null
          first_seen_at: string
          high_risk_executed: boolean
          id: string
          last_seen_at: string
          metadata: Json
          missing_capability: string | null
          money_moved: boolean
          native_build: string | null
          occurrence_count: number
          platform: string
          provider: string
          provider_environment: string | null
          readback_complete: boolean
          resolved_at: string | null
          runtime_version: string | null
          system_id: string
          update_id: string | null
          user_rights_changed: boolean
        }
        Insert: {
          app_version?: string | null
          bundle_identifier?: string | null
          capability: string
          capability_state: string
          channel?: string | null
          current_status: string
          data_source: string
          distribution_source?: string | null
          first_seen_at?: string
          high_risk_executed?: boolean
          id?: string
          last_seen_at?: string
          metadata?: Json
          missing_capability?: string | null
          money_moved?: boolean
          native_build?: string | null
          occurrence_count?: number
          platform: string
          provider: string
          provider_environment?: string | null
          readback_complete?: boolean
          resolved_at?: string | null
          runtime_version?: string | null
          system_id: string
          update_id?: string | null
          user_rights_changed?: boolean
        }
        Update: {
          app_version?: string | null
          bundle_identifier?: string | null
          capability?: string
          capability_state?: string
          channel?: string | null
          current_status?: string
          data_source?: string
          distribution_source?: string | null
          first_seen_at?: string
          high_risk_executed?: boolean
          id?: string
          last_seen_at?: string
          metadata?: Json
          missing_capability?: string | null
          money_moved?: boolean
          native_build?: string | null
          occurrence_count?: number
          platform?: string
          provider?: string
          provider_environment?: string | null
          readback_complete?: boolean
          resolved_at?: string | null
          runtime_version?: string | null
          system_id?: string
          update_id?: string | null
          user_rights_changed?: boolean
        }
        Relationships: []
      }
      autonomous_scheduler_health_snapshots: {
        Row: {
          capped_attempt_count: number
          created_at: string
          data_source: string
          enabled: boolean | null
          failed_attempt_count: number
          health_state: string
          high_risk_executed: boolean
          id: string
          last_run_at: string | null
          metadata: Json
          money_moved: boolean
          platform: string
          readback_complete: boolean
          retry_backlog: number
          schedule: string | null
          scheduler: string
          surface_id: string
          system_id: string
          user_rights_changed: boolean
        }
        Insert: {
          capped_attempt_count?: number
          created_at?: string
          data_source: string
          enabled?: boolean | null
          failed_attempt_count?: number
          health_state: string
          high_risk_executed?: boolean
          id?: string
          last_run_at?: string | null
          metadata?: Json
          money_moved?: boolean
          platform?: string
          readback_complete?: boolean
          retry_backlog?: number
          schedule?: string | null
          scheduler: string
          surface_id: string
          system_id: string
          user_rights_changed?: boolean
        }
        Update: {
          capped_attempt_count?: number
          created_at?: string
          data_source?: string
          enabled?: boolean | null
          failed_attempt_count?: number
          health_state?: string
          high_risk_executed?: boolean
          id?: string
          last_run_at?: string | null
          metadata?: Json
          money_moved?: boolean
          platform?: string
          readback_complete?: boolean
          retry_backlog?: number
          schedule?: string | null
          scheduler?: string
          surface_id?: string
          system_id?: string
          user_rights_changed?: boolean
        }
        Relationships: []
      }
      autonomous_system_control_events: {
        Row: {
          actor_id: string | null
          actor_role: string
          created_at: string
          event_summary: string
          event_type: string
          id: string
          metadata: Json
          system_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_role?: string
          created_at?: string
          event_summary: string
          event_type: string
          id?: string
          metadata?: Json
          system_id: string
        }
        Update: {
          actor_id?: string | null
          actor_role?: string
          created_at?: string
          event_summary?: string
          event_type?: string
          id?: string
          metadata?: Json
          system_id?: string
        }
        Relationships: []
      }
      autonomous_system_emergency_states: {
        Row: {
          metadata: Json
          reason: string | null
          status: string
          system_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          metadata?: Json
          reason?: string | null
          status?: string
          system_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          metadata?: Json
          reason?: string | null
          status?: string
          system_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      backend_error_rate_findings: {
        Row: {
          app_version: string | null
          backend_surface: string | null
          bundle_identifier: string | null
          channel: string | null
          created_at: string
          data_source: string | null
          distribution_source: string | null
          environment_mode: string
          error_rate_percent: number | null
          flag_type: string
          id: string
          metadata: Json
          money_moved: boolean
          native_build: string | null
          pii_stored: boolean
          platform: string
          provider_environment: string | null
          readback_complete: boolean
          release_action_executed: boolean
          review_status: string
          runtime_version: string | null
          secrets_logged: boolean
          severity: string
          system_id: string
          target_id: string | null
          target_type: string | null
          update_id: string | null
          updated_at: string
          user_rights_changed: boolean
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          app_version?: string | null
          backend_surface?: string | null
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          distribution_source?: string | null
          environment_mode?: string
          error_rate_percent?: number | null
          flag_type: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          pii_stored?: boolean
          platform?: string
          provider_environment?: string | null
          readback_complete?: boolean
          release_action_executed?: boolean
          review_status?: string
          runtime_version?: string | null
          secrets_logged?: boolean
          severity?: string
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          update_id?: string | null
          updated_at?: string
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          app_version?: string | null
          backend_surface?: string | null
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          distribution_source?: string | null
          environment_mode?: string
          error_rate_percent?: number | null
          flag_type?: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          pii_stored?: boolean
          platform?: string
          provider_environment?: string | null
          readback_complete?: boolean
          release_action_executed?: boolean
          review_status?: string
          runtime_version?: string | null
          secrets_logged?: boolean
          severity?: string
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          update_id?: string | null
          updated_at?: string
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Relationships: []
      }
      backup_health_snapshots: {
        Row: {
          app_version: string | null
          bundle_identifier: string | null
          channel: string | null
          created_at: string
          data_source: string | null
          distribution_source: string | null
          environment_mode: string
          fake_proof: boolean
          flag_type: string
          health_state: string
          high_risk_executed: boolean
          id: string
          metadata: Json
          money_moved: boolean
          native_build: string | null
          platform: string
          provider_environment: string | null
          readback_complete: boolean
          runtime_version: string | null
          severity: string
          system_id: string
          target_id: string | null
          target_type: string | null
          update_id: string | null
          user_rights_changed: boolean
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          app_version?: string | null
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          distribution_source?: string | null
          environment_mode?: string
          fake_proof?: boolean
          flag_type?: string
          health_state?: string
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          platform?: string
          provider_environment?: string | null
          readback_complete?: boolean
          runtime_version?: string | null
          severity?: string
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          update_id?: string | null
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          app_version?: string | null
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          distribution_source?: string | null
          environment_mode?: string
          fake_proof?: boolean
          flag_type?: string
          health_state?: string
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          platform?: string
          provider_environment?: string | null
          readback_complete?: boolean
          runtime_version?: string | null
          severity?: string
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          update_id?: string | null
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
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
      chat_call_events: {
        Row: {
          actor_user_id: string
          call_invite_id: string | null
          call_type: string
          created_at: string
          duration_seconds: number | null
          event_type: string
          id: string
          thread_id: string
        }
        Insert: {
          actor_user_id: string
          call_invite_id?: string | null
          call_type: string
          created_at?: string
          duration_seconds?: number | null
          event_type: string
          id?: string
          thread_id: string
        }
        Update: {
          actor_user_id?: string
          call_invite_id?: string | null
          call_type?: string
          created_at?: string
          duration_seconds?: number | null
          event_type?: string
          id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_call_events_call_invite_id_fkey"
            columns: ["call_invite_id"]
            isOneToOne: false
            referencedRelation: "chat_call_invites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_call_events_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_call_invites: {
        Row: {
          accepted_at: string | null
          call_type: string
          callee_user_id: string
          chat_call_media_provider: string
          caller_user_id: string
          communication_room_id: string | null
          created_at: string
          ended_at: string | null
          expires_at: string
          id: string
          status: string
          thread_id: string
        }
        Insert: {
          accepted_at?: string | null
          call_type: string
          callee_user_id: string
          chat_call_media_provider?: string
          caller_user_id: string
          communication_room_id?: string | null
          created_at?: string
          ended_at?: string | null
          expires_at?: string
          id?: string
          status?: string
          thread_id: string
        }
        Update: {
          accepted_at?: string | null
          call_type?: string
          callee_user_id?: string
          chat_call_media_provider?: string
          caller_user_id?: string
          communication_room_id?: string | null
          created_at?: string
          ended_at?: string | null
          expires_at?: string
          id?: string
          status?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_call_invites_communication_room_id_fkey"
            columns: ["communication_room_id"]
            isOneToOne: false
            referencedRelation: "communication_rooms"
            referencedColumns: ["room_id"]
          },
          {
            foreignKeyName: "chat_call_invites_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_call_transition_deliveries: {
        Row: {
          actor_user_id: string
          attempt_count: number
          call_invite_id: string
          completed_at: string | null
          created_at: string
          delivery_result: Json
          delivery_status: string
          dispatch_action: string | null
          id: string
          last_attempt_at: string | null
          target_status: string
          transition_key: string
          updated_at: string
        }
        Insert: {
          actor_user_id: string
          attempt_count?: number
          call_invite_id: string
          completed_at?: string | null
          created_at?: string
          delivery_result?: Json
          delivery_status?: string
          dispatch_action?: string | null
          id?: string
          last_attempt_at?: string | null
          target_status: string
          transition_key: string
          updated_at?: string
        }
        Update: {
          actor_user_id?: string
          attempt_count?: number
          call_invite_id?: string
          completed_at?: string | null
          created_at?: string
          delivery_result?: Json
          delivery_status?: string
          dispatch_action?: string | null
          id?: string
          last_attempt_at?: string | null
          target_status?: string
          transition_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_call_transition_deliveries_call_invite_id_fkey"
            columns: ["call_invite_id"]
            isOneToOne: false
            referencedRelation: "chat_call_invites"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_call_transition_delivery_failures: {
        Row: {
          attempt_count: number
          call_invite_id: string
          delivery_id: string
          dispatch_action: string
          first_reported_at: string
          last_reason: string
          last_reported_at: string
          resolved_at: string | null
          severity: string
        }
        Insert: {
          attempt_count: number
          call_invite_id: string
          delivery_id: string
          dispatch_action: string
          first_reported_at?: string
          last_reason: string
          last_reported_at?: string
          resolved_at?: string | null
          severity?: string
        }
        Update: {
          attempt_count?: number
          call_invite_id?: string
          delivery_id?: string
          dispatch_action?: string
          first_reported_at?: string
          last_reason?: string
          last_reported_at?: string
          resolved_at?: string | null
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_call_transition_delivery_failures_call_invite_id_fkey"
            columns: ["call_invite_id"]
            isOneToOne: false
            referencedRelation: "chat_call_invites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_call_transition_delivery_failures_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: true
            referencedRelation: "chat_call_transition_deliveries"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_call_transition_retry_config: {
        Row: {
          configured_at: string
          enabled: boolean
          singleton: boolean
          token_sha256: string
          updated_at: string
          worker_url: string | null
        }
        Insert: {
          configured_at?: string
          enabled?: boolean
          singleton?: boolean
          token_sha256: string
          updated_at?: string
          worker_url?: string | null
        }
        Update: {
          configured_at?: string
          enabled?: boolean
          singleton?: boolean
          token_sha256?: string
          updated_at?: string
          worker_url?: string | null
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          message_type: string
          moderation_actioned_at: string | null
          moderation_actioned_by: string | null
          moderation_reason: string | null
          moderation_report_id: number | null
          moderation_status: string
          sender_user_id: string
          thread_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          message_type?: string
          moderation_actioned_at?: string | null
          moderation_actioned_by?: string | null
          moderation_reason?: string | null
          moderation_report_id?: number | null
          moderation_status?: string
          sender_user_id: string
          thread_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          message_type?: string
          moderation_actioned_at?: string | null
          moderation_actioned_by?: string | null
          moderation_reason?: string | null
          moderation_report_id?: number | null
          moderation_status?: string
          sender_user_id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_moderation_report_id_fkey"
            columns: ["moderation_report_id"]
            isOneToOne: false
            referencedRelation: "safety_reports"
            referencedColumns: ["id"]
          },
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
          hidden_at: string | null
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
          hidden_at?: string | null
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
          hidden_at?: string | null
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
      circle_spectator_feed_items: {
        Row: {
          access_type: string
          allow_live_reaction_rooms: boolean
          allow_replay_watch_party: boolean
          allow_spectator_view: boolean
          allow_watch_party_from_spectator: boolean
          broadcast_session_id: string | null
          category_key: string | null
          channel_user_id: string | null
          created_at: string
          creator_user_id: string
          ended_at: string | null
          event_id: string | null
          host_user_id: string | null
          id: string
          is_spectator_enabled: boolean
          is_spectator_playback_enabled: boolean
          item_type: string
          live_state: string
          metadata: Json
          moderation_status: string
          playback_record_id: string | null
          published_at: string
          ranking_reason: string | null
          ranking_score: number
          requires_premium_to_join: boolean
          requires_subscription_to_watch: boolean
          requires_ticket_to_watch: boolean
          rights_status: string
          room_id: string | null
          source_id: string | null
          source_room_id: string | null
          source_type: string
          starts_at: string | null
          status: string
          subtitle: string | null
          thumbnail_url: string | null
          title: string | null
          updated_at: string
          visibility: string
        }
        Insert: {
          access_type?: string
          allow_live_reaction_rooms?: boolean
          allow_replay_watch_party?: boolean
          allow_spectator_view?: boolean
          allow_watch_party_from_spectator?: boolean
          broadcast_session_id?: string | null
          category_key?: string | null
          channel_user_id?: string | null
          created_at?: string
          creator_user_id: string
          ended_at?: string | null
          event_id?: string | null
          host_user_id?: string | null
          id?: string
          is_spectator_enabled?: boolean
          is_spectator_playback_enabled?: boolean
          item_type: string
          live_state?: string
          metadata?: Json
          moderation_status?: string
          playback_record_id?: string | null
          published_at?: string
          ranking_reason?: string | null
          ranking_score?: number
          requires_premium_to_join?: boolean
          requires_subscription_to_watch?: boolean
          requires_ticket_to_watch?: boolean
          rights_status?: string
          room_id?: string | null
          source_id?: string | null
          source_room_id?: string | null
          source_type: string
          starts_at?: string | null
          status?: string
          subtitle?: string | null
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string
          visibility?: string
        }
        Update: {
          access_type?: string
          allow_live_reaction_rooms?: boolean
          allow_replay_watch_party?: boolean
          allow_spectator_view?: boolean
          allow_watch_party_from_spectator?: boolean
          broadcast_session_id?: string | null
          category_key?: string | null
          channel_user_id?: string | null
          created_at?: string
          creator_user_id?: string
          ended_at?: string | null
          event_id?: string | null
          host_user_id?: string | null
          id?: string
          is_spectator_enabled?: boolean
          is_spectator_playback_enabled?: boolean
          item_type?: string
          live_state?: string
          metadata?: Json
          moderation_status?: string
          playback_record_id?: string | null
          published_at?: string
          ranking_reason?: string | null
          ranking_score?: number
          requires_premium_to_join?: boolean
          requires_subscription_to_watch?: boolean
          requires_ticket_to_watch?: boolean
          rights_status?: string
          room_id?: string | null
          source_id?: string | null
          source_room_id?: string | null
          source_type?: string
          starts_at?: string | null
          status?: string
          subtitle?: string | null
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "circle_spectator_feed_items_broadcast_session_fkey"
            columns: ["broadcast_session_id"]
            isOneToOne: false
            referencedRelation: "room_broadcast_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circle_spectator_feed_items_playback_record_fkey"
            columns: ["playback_record_id"]
            isOneToOne: false
            referencedRelation: "spectator_hls_playback_records"
            referencedColumns: ["id"]
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
      content_rights_disclosures: {
        Row: {
          acknowledged_at: string
          actor_user_id: string
          cleared_at: string | null
          contains_third_party_content: boolean
          contains_third_party_music: boolean
          created_at: string
          disclosure_note: string | null
          id: string
          policy_version: string | null
          security_context_id: string | null
          source_context: Json
          surface: string
          target_id: string
          target_type: string
        }
        Insert: {
          acknowledged_at?: string
          actor_user_id: string
          cleared_at?: string | null
          contains_third_party_content?: boolean
          contains_third_party_music?: boolean
          created_at?: string
          disclosure_note?: string | null
          id?: string
          policy_version?: string | null
          security_context_id?: string | null
          source_context?: Json
          surface: string
          target_id: string
          target_type: string
        }
        Update: {
          acknowledged_at?: string
          actor_user_id?: string
          cleared_at?: string | null
          contains_third_party_content?: boolean
          contains_third_party_music?: boolean
          created_at?: string
          disclosure_note?: string | null
          id?: string
          policy_version?: string | null
          security_context_id?: string | null
          source_context?: Json
          surface?: string
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_rights_disclosures_security_context_id_fkey"
            columns: ["security_context_id"]
            isOneToOne: false
            referencedRelation: "security_request_context"
            referencedColumns: ["id"]
          },
        ]
      }
      crash_cluster_findings: {
        Row: {
          app_version: string | null
          bundle_identifier: string | null
          channel: string | null
          created_at: string
          data_source: string | null
          distribution_source: string | null
          environment_mode: string
          flag_type: string
          id: string
          metadata: Json
          money_moved: boolean
          native_build: string | null
          pii_stored: boolean
          platform: string
          provider_environment: string | null
          readback_complete: boolean
          release_action_executed: boolean
          review_status: string
          runtime_version: string | null
          secrets_logged: boolean
          severity: string
          signature_hash: string | null
          system_id: string
          target_id: string | null
          target_type: string | null
          update_id: string | null
          updated_at: string
          user_rights_changed: boolean
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          app_version?: string | null
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          distribution_source?: string | null
          environment_mode?: string
          flag_type: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          pii_stored?: boolean
          platform?: string
          provider_environment?: string | null
          readback_complete?: boolean
          release_action_executed?: boolean
          review_status?: string
          runtime_version?: string | null
          secrets_logged?: boolean
          severity?: string
          signature_hash?: string | null
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          update_id?: string | null
          updated_at?: string
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          app_version?: string | null
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          distribution_source?: string | null
          environment_mode?: string
          flag_type?: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          pii_stored?: boolean
          platform?: string
          provider_environment?: string | null
          readback_complete?: boolean
          release_action_executed?: boolean
          review_status?: string
          runtime_version?: string | null
          secrets_logged?: boolean
          severity?: string
          signature_hash?: string | null
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          update_id?: string | null
          updated_at?: string
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Relationships: []
      }
      creator_channel_subscription_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          id: string
          metadata: Json
          offer_id: string | null
          subscription_id: string | null
          transaction_id: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
          offer_id?: string | null
          subscription_id?: string | null
          transaction_id?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          offer_id?: string | null
          subscription_id?: string | null
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "creator_channel_subscription_events_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "creator_channel_subscription_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_channel_subscription_events_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "creator_channel_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_channel_subscription_events_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "creator_channel_subscription_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_channel_subscription_offers: {
        Row: {
          created_at: string
          creator_id: string
          currency: string
          description: string | null
          id: string
          interval: string
          metadata: Json
          price_cents: number
          provider: string
          provider_entitlement_id: string | null
          provider_product_id: string | null
          provider_product_key: string | null
          status: string
          subscriber_count: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          creator_id: string
          currency?: string
          description?: string | null
          id?: string
          interval?: string
          metadata?: Json
          price_cents?: number
          provider?: string
          provider_entitlement_id?: string | null
          provider_product_id?: string | null
          provider_product_key?: string | null
          status?: string
          subscriber_count?: number
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          creator_id?: string
          currency?: string
          description?: string | null
          id?: string
          interval?: string
          metadata?: Json
          price_cents?: number
          provider?: string
          provider_entitlement_id?: string | null
          provider_product_id?: string | null
          provider_product_key?: string | null
          status?: string
          subscriber_count?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      creator_channel_subscription_transactions: {
        Row: {
          amount_cents: number
          created_at: string
          creator_id: string
          creator_net_cents: number | null
          currency: string
          id: string
          ledger_event_id: string | null
          metadata: Json
          offer_id: string
          paid_at: string | null
          payout_status: string
          platform_fee_cents: number
          provider: string
          provider_event_id: string | null
          provider_fee_cents: number | null
          provider_original_transaction_id: string | null
          provider_product_id: string | null
          provider_transaction_id: string | null
          status: string
          subscriber_id: string
          subscription_id: string | null
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          creator_id: string
          creator_net_cents?: number | null
          currency?: string
          id?: string
          ledger_event_id?: string | null
          metadata?: Json
          offer_id: string
          paid_at?: string | null
          payout_status?: string
          platform_fee_cents?: number
          provider?: string
          provider_event_id?: string | null
          provider_fee_cents?: number | null
          provider_original_transaction_id?: string | null
          provider_product_id?: string | null
          provider_transaction_id?: string | null
          status?: string
          subscriber_id: string
          subscription_id?: string | null
        }
        Update: {
          amount_cents?: number
          created_at?: string
          creator_id?: string
          creator_net_cents?: number | null
          currency?: string
          id?: string
          ledger_event_id?: string | null
          metadata?: Json
          offer_id?: string
          paid_at?: string | null
          payout_status?: string
          platform_fee_cents?: number
          provider?: string
          provider_event_id?: string | null
          provider_fee_cents?: number | null
          provider_original_transaction_id?: string | null
          provider_product_id?: string | null
          provider_transaction_id?: string | null
          status?: string
          subscriber_id?: string
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "creator_channel_subscription_transaction_provider_event_id_fkey"
            columns: ["provider_event_id"]
            isOneToOne: false
            referencedRelation: "provider_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_channel_subscription_transactions_ledger_event_id_fkey"
            columns: ["ledger_event_id"]
            isOneToOne: false
            referencedRelation: "money_access_ledger_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_channel_subscription_transactions_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "creator_channel_subscription_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_channel_subscription_transactions_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "creator_channel_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_channel_subscriptions: {
        Row: {
          access_grant_id: string | null
          canceled_at: string | null
          created_at: string
          creator_id: string
          current_period_end: string | null
          current_period_start: string | null
          expired_at: string | null
          id: string
          metadata: Json
          offer_id: string
          provider: string
          provider_customer_id: string | null
          provider_latest_transaction_id: string | null
          provider_original_transaction_id: string | null
          revoked_at: string | null
          status: string
          subscriber_id: string
          updated_at: string
        }
        Insert: {
          access_grant_id?: string | null
          canceled_at?: string | null
          created_at?: string
          creator_id: string
          current_period_end?: string | null
          current_period_start?: string | null
          expired_at?: string | null
          id?: string
          metadata?: Json
          offer_id: string
          provider?: string
          provider_customer_id?: string | null
          provider_latest_transaction_id?: string | null
          provider_original_transaction_id?: string | null
          revoked_at?: string | null
          status?: string
          subscriber_id: string
          updated_at?: string
        }
        Update: {
          access_grant_id?: string | null
          canceled_at?: string | null
          created_at?: string
          creator_id?: string
          current_period_end?: string | null
          current_period_start?: string | null
          expired_at?: string | null
          id?: string
          metadata?: Json
          offer_id?: string
          provider?: string
          provider_customer_id?: string | null
          provider_latest_transaction_id?: string | null
          provider_original_transaction_id?: string | null
          revoked_at?: string | null
          status?: string
          subscriber_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_channel_subscriptions_access_grant_id_fkey"
            columns: ["access_grant_id"]
            isOneToOne: false
            referencedRelation: "access_grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_channel_subscriptions_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "creator_channel_subscription_offers"
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
          metadata: Json
          price_cents: number
          provider: string
          provider_product_id: string | null
          provider_product_key: string | null
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
          metadata?: Json
          price_cents?: number
          provider?: string
          provider_product_id?: string | null
          provider_product_key?: string | null
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
          metadata?: Json
          price_cents?: number
          provider?: string
          provider_product_id?: string | null
          provider_product_key?: string | null
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
      creator_event_transactions: {
        Row: {
          amount_cents: number
          buyer_id: string
          created_at: string
          creator_event_id: string
          creator_id: string
          creator_net_cents: number | null
          currency: string
          event_id: string
          id: string
          ledger_event_id: string | null
          metadata: Json
          paid_at: string | null
          payout_status: string
          platform_fee_cents: number
          provider: string
          provider_event_id: string | null
          provider_fee_cents: number | null
          provider_product_id: string | null
          provider_transaction_id: string | null
          refunded_at: string | null
          status: string
        }
        Insert: {
          amount_cents?: number
          buyer_id: string
          created_at?: string
          creator_event_id: string
          creator_id: string
          creator_net_cents?: number | null
          currency?: string
          event_id: string
          id?: string
          ledger_event_id?: string | null
          metadata?: Json
          paid_at?: string | null
          payout_status?: string
          platform_fee_cents?: number
          provider?: string
          provider_event_id?: string | null
          provider_fee_cents?: number | null
          provider_product_id?: string | null
          provider_transaction_id?: string | null
          refunded_at?: string | null
          status?: string
        }
        Update: {
          amount_cents?: number
          buyer_id?: string
          created_at?: string
          creator_event_id?: string
          creator_id?: string
          creator_net_cents?: number | null
          currency?: string
          event_id?: string
          id?: string
          ledger_event_id?: string | null
          metadata?: Json
          paid_at?: string | null
          payout_status?: string
          platform_fee_cents?: number
          provider?: string
          provider_event_id?: string | null
          provider_fee_cents?: number | null
          provider_product_id?: string | null
          provider_transaction_id?: string | null
          refunded_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_event_transactions_creator_event_id_fkey"
            columns: ["creator_event_id"]
            isOneToOne: false
            referencedRelation: "creator_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_event_transactions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "paid_creator_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_event_transactions_ledger_event_id_fkey"
            columns: ["ledger_event_id"]
            isOneToOne: false
            referencedRelation: "money_access_ledger_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_event_transactions_provider_event_id_fkey"
            columns: ["provider_event_id"]
            isOneToOne: false
            referencedRelation: "provider_events"
            referencedColumns: ["id"]
          },
        ]
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
      creator_feed_items: {
        Row: {
          created_at: string
          creator_user_id: string
          id: string
          metadata: Json
          published_at: string
          ranking_score: number
          source_id: string
          source_type: string
          status: string
          target_scope: string
          updated_at: string
          visibility: string
        }
        Insert: {
          created_at?: string
          creator_user_id: string
          id?: string
          metadata?: Json
          published_at?: string
          ranking_score?: number
          source_id: string
          source_type: string
          status?: string
          target_scope: string
          updated_at?: string
          visibility: string
        }
        Update: {
          created_at?: string
          creator_user_id?: string
          id?: string
          metadata?: Json
          published_at?: string
          ranking_score?: number
          source_id?: string
          source_type?: string
          status?: string
          target_scope?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: []
      }
      creator_monetization_configs: {
        Row: {
          created_at: string
          creates_digital_access: boolean
          creator_id: string
          display_name: string
          environment: string
          grants_host_authority: boolean
          grants_livekit_publish: boolean
          id: string
          metadata: Json
          payable_state: string
          payout_enabled: boolean
          price_label: string
          product_id: string
          product_key: string
          product_type: string
          production_enabled: boolean
          provider: string
          provider_product_id: string
          requires_host_approval: boolean
          source_id: string
          source_type: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          creates_digital_access?: boolean
          creator_id: string
          display_name: string
          environment?: string
          grants_host_authority?: boolean
          grants_livekit_publish?: boolean
          id?: string
          metadata?: Json
          payable_state?: string
          payout_enabled?: boolean
          price_label?: string
          product_id: string
          product_key: string
          product_type: string
          production_enabled?: boolean
          provider?: string
          provider_product_id: string
          requires_host_approval?: boolean
          source_id: string
          source_type: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          creates_digital_access?: boolean
          creator_id?: string
          display_name?: string
          environment?: string
          grants_host_authority?: boolean
          grants_livekit_publish?: boolean
          id?: string
          metadata?: Json
          payable_state?: string
          payout_enabled?: boolean
          price_label?: string
          product_id?: string
          product_key?: string
          product_type?: string
          production_enabled?: boolean
          provider?: string
          provider_product_id?: string
          requires_host_approval?: boolean
          source_id?: string
          source_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_monetization_configs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "monetization_products"
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
      creator_obligation_review_records: {
        Row: {
          buyer_user_id: string | null
          created_at: string
          creator_user_id: string
          environment: string
          id: string
          metadata: Json
          obligation_state: string
          policy_key: string
          refund_review_id: string | null
          review_reason: string
          safe_admin_summary: string
          safe_creator_summary: string
          source_id: string | null
          source_type: string | null
          updated_at: string
        }
        Insert: {
          buyer_user_id?: string | null
          created_at?: string
          creator_user_id: string
          environment?: string
          id?: string
          metadata?: Json
          obligation_state?: string
          policy_key: string
          refund_review_id?: string | null
          review_reason?: string
          safe_admin_summary?: string
          safe_creator_summary?: string
          source_id?: string | null
          source_type?: string | null
          updated_at?: string
        }
        Update: {
          buyer_user_id?: string | null
          created_at?: string
          creator_user_id?: string
          environment?: string
          id?: string
          metadata?: Json
          obligation_state?: string
          policy_key?: string
          refund_review_id?: string | null
          review_reason?: string
          safe_admin_summary?: string
          safe_creator_summary?: string
          source_id?: string | null
          source_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_obligation_review_records_refund_review_id_fkey"
            columns: ["refund_review_id"]
            isOneToOne: false
            referencedRelation: "money_refund_review_records"
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
      creator_payout_hold_records: {
        Row: {
          created_at: string
          creator_user_id: string
          environment: string
          existing_creator_payout_hold_id: string | null
          held_until: string | null
          hold_reason: string
          hold_state: string
          id: string
          live_money_enabled_at_release: boolean
          metadata: Json
          obligation_review_id: string | null
          payouts_enabled_at_release: boolean
          policy_key: string
          provider_release_evidence_id: string | null
          refund_review_id: string | null
          safe_admin_summary: string
          safe_creator_summary: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          creator_user_id: string
          environment?: string
          existing_creator_payout_hold_id?: string | null
          held_until?: string | null
          hold_reason?: string
          hold_state?: string
          id?: string
          live_money_enabled_at_release?: boolean
          metadata?: Json
          obligation_review_id?: string | null
          payouts_enabled_at_release?: boolean
          policy_key: string
          provider_release_evidence_id?: string | null
          refund_review_id?: string | null
          safe_admin_summary?: string
          safe_creator_summary?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          creator_user_id?: string
          environment?: string
          existing_creator_payout_hold_id?: string | null
          held_until?: string | null
          hold_reason?: string
          hold_state?: string
          id?: string
          live_money_enabled_at_release?: boolean
          metadata?: Json
          obligation_review_id?: string | null
          payouts_enabled_at_release?: boolean
          policy_key?: string
          provider_release_evidence_id?: string | null
          refund_review_id?: string | null
          safe_admin_summary?: string
          safe_creator_summary?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_payout_hold_records_obligation_review_id_fkey"
            columns: ["obligation_review_id"]
            isOneToOne: false
            referencedRelation: "creator_obligation_review_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_payout_hold_records_refund_review_id_fkey"
            columns: ["refund_review_id"]
            isOneToOne: false
            referencedRelation: "money_refund_review_records"
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
      creator_replay_library_items: {
        Row: {
          broadcast_session_id: string | null
          created_at: string
          description: string | null
          duration_seconds: number | null
          error_code: string | null
          id: string
          metadata: Json
          moderation_status: string
          money_status: string
          owner_user_id: string
          party_id: string | null
          playback_record_id: string | null
          rights_status: string
          save_status: string
          source_room_id: string | null
          source_type: string
          thumbnail_url: string | null
          title: string
          updated_at: string
          visibility: string
        }
        Insert: {
          broadcast_session_id?: string | null
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          error_code?: string | null
          id?: string
          metadata?: Json
          moderation_status?: string
          money_status?: string
          owner_user_id: string
          party_id?: string | null
          playback_record_id?: string | null
          rights_status?: string
          save_status?: string
          source_room_id?: string | null
          source_type: string
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          broadcast_session_id?: string | null
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          error_code?: string | null
          id?: string
          metadata?: Json
          moderation_status?: string
          money_status?: string
          owner_user_id?: string
          party_id?: string | null
          playback_record_id?: string | null
          rights_status?: string
          save_status?: string
          source_room_id?: string | null
          source_type?: string
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_replay_library_items_broadcast_session_fkey"
            columns: ["broadcast_session_id"]
            isOneToOne: false
            referencedRelation: "room_broadcast_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_replay_library_items_playback_record_fkey"
            columns: ["playback_record_id"]
            isOneToOne: false
            referencedRelation: "spectator_hls_playback_records"
            referencedColumns: ["id"]
          },
        ]
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
      creator_room_ticket_transactions: {
        Row: {
          amount_cents: number
          buyer_id: string
          created_at: string
          creator_id: string
          creator_net_cents: number | null
          currency: string
          host_id: string
          id: string
          ledger_event_id: string | null
          metadata: Json
          offer_id: string
          paid_at: string | null
          party_id: string | null
          payout_status: string
          platform_fee_cents: number
          provider: string
          provider_event_id: string | null
          provider_fee_cents: number | null
          provider_product_id: string | null
          provider_transaction_id: string | null
          refunded_at: string | null
          status: string
        }
        Insert: {
          amount_cents?: number
          buyer_id: string
          created_at?: string
          creator_id: string
          creator_net_cents?: number | null
          currency?: string
          host_id: string
          id?: string
          ledger_event_id?: string | null
          metadata?: Json
          offer_id: string
          paid_at?: string | null
          party_id?: string | null
          payout_status?: string
          platform_fee_cents?: number
          provider?: string
          provider_event_id?: string | null
          provider_fee_cents?: number | null
          provider_product_id?: string | null
          provider_transaction_id?: string | null
          refunded_at?: string | null
          status?: string
        }
        Update: {
          amount_cents?: number
          buyer_id?: string
          created_at?: string
          creator_id?: string
          creator_net_cents?: number | null
          currency?: string
          host_id?: string
          id?: string
          ledger_event_id?: string | null
          metadata?: Json
          offer_id?: string
          paid_at?: string | null
          party_id?: string | null
          payout_status?: string
          platform_fee_cents?: number
          provider?: string
          provider_event_id?: string | null
          provider_fee_cents?: number | null
          provider_product_id?: string | null
          provider_transaction_id?: string | null
          refunded_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_room_ticket_transactions_ledger_event_id_fkey"
            columns: ["ledger_event_id"]
            isOneToOne: false
            referencedRelation: "money_access_ledger_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_room_ticket_transactions_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "paid_watch_party_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_room_ticket_transactions_provider_event_id_fkey"
            columns: ["provider_event_id"]
            isOneToOne: false
            referencedRelation: "provider_events"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_tip_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          id: string
          metadata: Json
          provider: string
          provider_environment: string
          provider_event_id: string | null
          tip_transaction_id: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
          provider?: string
          provider_environment?: string
          provider_event_id?: string | null
          tip_transaction_id?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          provider?: string
          provider_environment?: string
          provider_event_id?: string | null
          tip_transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "creator_tip_events_tip_transaction_id_fkey"
            columns: ["tip_transaction_id"]
            isOneToOne: false
            referencedRelation: "creator_tip_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_tip_settings: {
        Row: {
          created_at: string
          creator_id: string
          currency: string
          default_amount_cents: number | null
          id: string
          last_provider_sync_at: string | null
          max_amount_cents: number
          metadata: Json
          min_amount_cents: number
          provider: string
          provider_account_id: string | null
          provider_charges_enabled: boolean
          provider_environment: string
          provider_onboarding_status: string
          provider_payouts_enabled: boolean
          status: string
          suggested_amounts_cents: number[]
          tips_enabled: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          creator_id: string
          currency?: string
          default_amount_cents?: number | null
          id?: string
          last_provider_sync_at?: string | null
          max_amount_cents?: number
          metadata?: Json
          min_amount_cents?: number
          provider?: string
          provider_account_id?: string | null
          provider_charges_enabled?: boolean
          provider_environment?: string
          provider_onboarding_status?: string
          provider_payouts_enabled?: boolean
          status?: string
          suggested_amounts_cents?: number[]
          tips_enabled?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          creator_id?: string
          currency?: string
          default_amount_cents?: number | null
          id?: string
          last_provider_sync_at?: string | null
          max_amount_cents?: number
          metadata?: Json
          min_amount_cents?: number
          provider?: string
          provider_account_id?: string | null
          provider_charges_enabled?: boolean
          provider_environment?: string
          provider_onboarding_status?: string
          provider_payouts_enabled?: boolean
          status?: string
          suggested_amounts_cents?: number[]
          tips_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      creator_tip_transactions: {
        Row: {
          checkout_started_at: string | null
          created_at: string
          creator_id: string
          creator_net_cents: number | null
          currency: string
          disputed_at: string | null
          failed_at: string | null
          id: string
          idempotency_key: string | null
          message_private: string | null
          metadata: Json
          paid_at: string | null
          payment_status: string
          payout_status: string
          platform_fee_cents: number
          provider: string
          provider_account_id: string | null
          provider_checkout_session_id: string | null
          provider_environment: string
          provider_fee_cents: number
          provider_payment_id: string | null
          provider_payment_intent_id: string | null
          refunded_at: string | null
          sender_id: string
          service_fee_cents: number
          status: string
          tip_amount_cents: number
          total_paid_cents: number
          updated_at: string
        }
        Insert: {
          checkout_started_at?: string | null
          created_at?: string
          creator_id: string
          creator_net_cents?: number | null
          currency?: string
          disputed_at?: string | null
          failed_at?: string | null
          id?: string
          idempotency_key?: string | null
          message_private?: string | null
          metadata?: Json
          paid_at?: string | null
          payment_status?: string
          payout_status?: string
          platform_fee_cents?: number
          provider?: string
          provider_account_id?: string | null
          provider_checkout_session_id?: string | null
          provider_environment?: string
          provider_fee_cents?: number
          provider_payment_id?: string | null
          provider_payment_intent_id?: string | null
          refunded_at?: string | null
          sender_id: string
          service_fee_cents?: number
          status?: string
          tip_amount_cents: number
          total_paid_cents: number
          updated_at?: string
        }
        Update: {
          checkout_started_at?: string | null
          created_at?: string
          creator_id?: string
          creator_net_cents?: number | null
          currency?: string
          disputed_at?: string | null
          failed_at?: string | null
          id?: string
          idempotency_key?: string | null
          message_private?: string | null
          metadata?: Json
          paid_at?: string | null
          payment_status?: string
          payout_status?: string
          platform_fee_cents?: number
          provider?: string
          provider_account_id?: string | null
          provider_checkout_session_id?: string | null
          provider_environment?: string
          provider_fee_cents?: number
          provider_payment_id?: string | null
          provider_payment_intent_id?: string | null
          refunded_at?: string | null
          sender_id?: string
          service_fee_cents?: number
          status?: string
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
      creator_vip_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          id: string
          metadata: Json
          offer_id: string | null
          transaction_id: string | null
          vip_pass_id: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
          offer_id?: string | null
          transaction_id?: string | null
          vip_pass_id?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          offer_id?: string | null
          transaction_id?: string | null
          vip_pass_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "creator_vip_events_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "creator_vip_pass_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_vip_events_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "creator_vip_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_vip_events_vip_pass_id_fkey"
            columns: ["vip_pass_id"]
            isOneToOne: false
            referencedRelation: "creator_vip_passes"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_vip_pass_offers: {
        Row: {
          created_at: string
          creator_id: string
          currency: string
          description: string | null
          id: string
          metadata: Json
          pass_type: string
          price_cents: number
          provider: string
          provider_product_id: string | null
          provider_product_key: string | null
          status: string
          title: string
          updated_at: string
          vip_count: number
        }
        Insert: {
          created_at?: string
          creator_id: string
          currency?: string
          description?: string | null
          id?: string
          metadata?: Json
          pass_type?: string
          price_cents?: number
          provider?: string
          provider_product_id?: string | null
          provider_product_key?: string | null
          status?: string
          title?: string
          updated_at?: string
          vip_count?: number
        }
        Update: {
          created_at?: string
          creator_id?: string
          currency?: string
          description?: string | null
          id?: string
          metadata?: Json
          pass_type?: string
          price_cents?: number
          provider?: string
          provider_product_id?: string | null
          provider_product_key?: string | null
          status?: string
          title?: string
          updated_at?: string
          vip_count?: number
        }
        Relationships: []
      }
      creator_vip_passes: {
        Row: {
          access_grant_id: string | null
          activated_at: string | null
          created_at: string
          creator_id: string
          expires_at: string | null
          fan_id: string
          id: string
          metadata: Json
          offer_id: string
          provider: string
          provider_transaction_id: string | null
          refunded_at: string | null
          revoked_at: string | null
          source_transaction_id: string | null
          status: string
        }
        Insert: {
          access_grant_id?: string | null
          activated_at?: string | null
          created_at?: string
          creator_id: string
          expires_at?: string | null
          fan_id: string
          id?: string
          metadata?: Json
          offer_id: string
          provider?: string
          provider_transaction_id?: string | null
          refunded_at?: string | null
          revoked_at?: string | null
          source_transaction_id?: string | null
          status?: string
        }
        Update: {
          access_grant_id?: string | null
          activated_at?: string | null
          created_at?: string
          creator_id?: string
          expires_at?: string | null
          fan_id?: string
          id?: string
          metadata?: Json
          offer_id?: string
          provider?: string
          provider_transaction_id?: string | null
          refunded_at?: string | null
          revoked_at?: string | null
          source_transaction_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_vip_passes_access_grant_id_fkey"
            columns: ["access_grant_id"]
            isOneToOne: false
            referencedRelation: "access_grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_vip_passes_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "creator_vip_pass_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_vip_transactions: {
        Row: {
          amount_cents: number
          created_at: string
          creator_id: string
          creator_net_cents: number | null
          currency: string
          fan_id: string
          id: string
          ledger_event_id: string | null
          metadata: Json
          offer_id: string
          paid_at: string | null
          payout_status: string
          platform_fee_cents: number
          provider: string
          provider_event_id: string | null
          provider_fee_cents: number | null
          provider_product_id: string | null
          provider_transaction_id: string | null
          refunded_at: string | null
          status: string
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          creator_id: string
          creator_net_cents?: number | null
          currency?: string
          fan_id: string
          id?: string
          ledger_event_id?: string | null
          metadata?: Json
          offer_id: string
          paid_at?: string | null
          payout_status?: string
          platform_fee_cents?: number
          provider?: string
          provider_event_id?: string | null
          provider_fee_cents?: number | null
          provider_product_id?: string | null
          provider_transaction_id?: string | null
          refunded_at?: string | null
          status?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          creator_id?: string
          creator_net_cents?: number | null
          currency?: string
          fan_id?: string
          id?: string
          ledger_event_id?: string | null
          metadata?: Json
          offer_id?: string
          paid_at?: string | null
          payout_status?: string
          platform_fee_cents?: number
          provider?: string
          provider_event_id?: string | null
          provider_fee_cents?: number | null
          provider_product_id?: string | null
          provider_transaction_id?: string | null
          refunded_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_vip_transactions_ledger_event_id_fkey"
            columns: ["ledger_event_id"]
            isOneToOne: false
            referencedRelation: "money_access_ledger_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_vip_transactions_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "creator_vip_pass_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_vip_transactions_provider_event_id_fkey"
            columns: ["provider_event_id"]
            isOneToOne: false
            referencedRelation: "provider_events"
            referencedColumns: ["id"]
          },
        ]
      }
      device_availability_findings: {
        Row: {
          account_role: string | null
          apns_proof_available: boolean
          app_version: string | null
          available_device_count: number
          blocker_classification: string
          bundle_identifier: string | null
          channel: string | null
          created_at: string
          data_source: string | null
          device_lab_configured: boolean
          device_requirement: string
          discovered_by: string
          distribution_source: string | null
          fake_proof: boolean
          finding_status: string
          high_risk_executed: boolean
          id: string
          ios_physical_device_count: number
          ios_second_device_available: boolean
          ios_simulator_available: boolean
          metadata: Json
          money_moved: boolean
          native_build: string | null
          next_safe_action: string
          owner_command_request_id: string | null
          physical_proof_available: boolean
          platform: string
          play_installed_device_available: boolean
          private_evidence_stored: boolean
          provider_environment: string | null
          readback_complete: boolean
          required_device_count: number
          result: string
          runtime_version: string | null
          secrets_logged: boolean
          signed_ios_build_available: boolean
          source: string
          storekit_proof_available: boolean
          system_id: string
          testflight_internal_build_available: boolean
          universal_link_proof_available: boolean
          update_id: string | null
          updated_at: string
          user_rights_changed: boolean
          voip_proof_available: boolean
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          account_role?: string | null
          apns_proof_available?: boolean
          app_version?: string | null
          available_device_count?: number
          blocker_classification: string
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          device_lab_configured?: boolean
          device_requirement: string
          discovered_by?: string
          distribution_source?: string | null
          fake_proof?: boolean
          finding_status?: string
          high_risk_executed?: boolean
          id?: string
          ios_physical_device_count?: number
          ios_second_device_available?: boolean
          ios_simulator_available?: boolean
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          next_safe_action: string
          owner_command_request_id?: string | null
          physical_proof_available?: boolean
          platform?: string
          play_installed_device_available?: boolean
          private_evidence_stored?: boolean
          provider_environment?: string | null
          readback_complete?: boolean
          required_device_count?: number
          result?: string
          runtime_version?: string | null
          secrets_logged?: boolean
          signed_ios_build_available?: boolean
          source: string
          storekit_proof_available?: boolean
          system_id?: string
          testflight_internal_build_available?: boolean
          universal_link_proof_available?: boolean
          update_id?: string | null
          updated_at?: string
          user_rights_changed?: boolean
          voip_proof_available?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          account_role?: string | null
          apns_proof_available?: boolean
          app_version?: string | null
          available_device_count?: number
          blocker_classification?: string
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          device_lab_configured?: boolean
          device_requirement?: string
          discovered_by?: string
          distribution_source?: string | null
          fake_proof?: boolean
          finding_status?: string
          high_risk_executed?: boolean
          id?: string
          ios_physical_device_count?: number
          ios_second_device_available?: boolean
          ios_simulator_available?: boolean
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          next_safe_action?: string
          owner_command_request_id?: string | null
          physical_proof_available?: boolean
          platform?: string
          play_installed_device_available?: boolean
          private_evidence_stored?: boolean
          provider_environment?: string | null
          readback_complete?: boolean
          required_device_count?: number
          result?: string
          runtime_version?: string | null
          secrets_logged?: boolean
          signed_ios_build_available?: boolean
          source?: string
          storekit_proof_available?: boolean
          system_id?: string
          testflight_internal_build_available?: boolean
          universal_link_proof_available?: boolean
          update_id?: string | null
          updated_at?: string
          user_rights_changed?: boolean
          voip_proof_available?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "device_availability_findings_owner_command_request_id_fkey"
            columns: ["owner_command_request_id"]
            isOneToOne: false
            referencedRelation: "owner_command_requests"
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
      function_deployment_drift_findings: {
        Row: {
          app_version: string | null
          bundle_identifier: string | null
          channel: string | null
          created_at: string
          data_source: string | null
          distribution_source: string | null
          environment_mode: string
          fake_proof: boolean
          flag_type: string
          high_risk_executed: boolean
          id: string
          metadata: Json
          money_moved: boolean
          native_build: string | null
          platform: string
          provider_environment: string | null
          readback_complete: boolean
          runtime_version: string | null
          severity: string
          system_id: string
          target_id: string | null
          target_type: string | null
          update_id: string | null
          user_rights_changed: boolean
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          app_version?: string | null
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          distribution_source?: string | null
          environment_mode?: string
          fake_proof?: boolean
          flag_type?: string
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          platform?: string
          provider_environment?: string | null
          readback_complete?: boolean
          runtime_version?: string | null
          severity?: string
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          update_id?: string | null
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          app_version?: string | null
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          distribution_source?: string | null
          environment_mode?: string
          fake_proof?: boolean
          flag_type?: string
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          platform?: string
          provider_environment?: string | null
          readback_complete?: boolean
          runtime_version?: string | null
          severity?: string
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          update_id?: string | null
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Relationships: []
      }
      installed_qa_operator_events: {
        Row: {
          account_role: string | null
          action_id: string
          app_version: string | null
          blocker_classification: string | null
          bundle_identifier: string | null
          channel: string | null
          created_at: string
          data_source: string | null
          discovered_by: string
          distribution_source: string | null
          fake_proof: boolean
          high_risk_executed: boolean
          id: string
          metadata: Json
          money_moved: boolean
          native_build: string | null
          platform: string
          private_evidence_stored: boolean
          provider_environment: string | null
          readback_complete: boolean
          result: string
          runtime_version: string | null
          secrets_logged: boolean
          source: string
          system_id: string
          update_id: string | null
          user_rights_changed: boolean
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          account_role?: string | null
          action_id: string
          app_version?: string | null
          blocker_classification?: string | null
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          discovered_by?: string
          distribution_source?: string | null
          fake_proof?: boolean
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          platform?: string
          private_evidence_stored?: boolean
          provider_environment?: string | null
          readback_complete?: boolean
          result: string
          runtime_version?: string | null
          secrets_logged?: boolean
          source?: string
          system_id?: string
          update_id?: string | null
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          account_role?: string | null
          action_id?: string
          app_version?: string | null
          blocker_classification?: string | null
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          discovered_by?: string
          distribution_source?: string | null
          fake_proof?: boolean
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          platform?: string
          private_evidence_stored?: boolean
          provider_environment?: string | null
          readback_complete?: boolean
          result?: string
          runtime_version?: string | null
          secrets_logged?: boolean
          source?: string
          system_id?: string
          update_id?: string | null
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Relationships: []
      }
      installed_traversal_runs: {
        Row: {
          app_version: string | null
          blocked_count: number
          blocker_classification: string | null
          bundle_identifier: string | null
          channel: string | null
          created_at: string
          data_source: string | null
          device_count: number
          discovered_by: string
          distribution_source: string | null
          failure_count: number
          fake_proof: boolean
          high_risk_executed: boolean
          human_review_count: number
          id: string
          installed_package: string | null
          installer_package: string | null
          metadata: Json
          money_moved: boolean
          native_build: string | null
          native_version: string | null
          pass_count: number
          platform: string
          private_evidence_stored: boolean
          provider_environment: string | null
          readback_complete: boolean
          result: string
          run_label: string
          runtime_version: string | null
          secrets_logged: boolean
          source: string
          system_id: string
          two_device_required_count: number
          update_id: string | null
          user_rights_changed: boolean
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          app_version?: string | null
          blocked_count?: number
          blocker_classification?: string | null
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          device_count?: number
          discovered_by?: string
          distribution_source?: string | null
          failure_count?: number
          fake_proof?: boolean
          high_risk_executed?: boolean
          human_review_count?: number
          id?: string
          installed_package?: string | null
          installer_package?: string | null
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          native_version?: string | null
          pass_count?: number
          platform?: string
          private_evidence_stored?: boolean
          provider_environment?: string | null
          readback_complete?: boolean
          result: string
          run_label: string
          runtime_version?: string | null
          secrets_logged?: boolean
          source: string
          system_id?: string
          two_device_required_count?: number
          update_id?: string | null
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          app_version?: string | null
          blocked_count?: number
          blocker_classification?: string | null
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          device_count?: number
          discovered_by?: string
          distribution_source?: string | null
          failure_count?: number
          fake_proof?: boolean
          high_risk_executed?: boolean
          human_review_count?: number
          id?: string
          installed_package?: string | null
          installer_package?: string | null
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          native_version?: string | null
          pass_count?: number
          platform?: string
          private_evidence_stored?: boolean
          provider_environment?: string | null
          readback_complete?: boolean
          result?: string
          run_label?: string
          runtime_version?: string | null
          secrets_logged?: boolean
          source?: string
          system_id?: string
          two_device_required_count?: number
          update_id?: string | null
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Relationships: []
      }
      js_error_findings: {
        Row: {
          app_version: string | null
          bundle_identifier: string | null
          channel: string | null
          created_at: string
          data_source: string | null
          distribution_source: string | null
          environment_mode: string
          flag_type: string
          id: string
          metadata: Json
          money_moved: boolean
          native_build: string | null
          pii_stored: boolean
          platform: string
          provider_environment: string | null
          readback_complete: boolean
          release_action_executed: boolean
          review_status: string
          runtime_version: string | null
          secrets_logged: boolean
          severity: string
          signature_hash: string | null
          system_id: string
          target_id: string | null
          target_type: string | null
          update_id: string | null
          updated_at: string
          user_rights_changed: boolean
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          app_version?: string | null
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          distribution_source?: string | null
          environment_mode?: string
          flag_type: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          pii_stored?: boolean
          platform?: string
          provider_environment?: string | null
          readback_complete?: boolean
          release_action_executed?: boolean
          review_status?: string
          runtime_version?: string | null
          secrets_logged?: boolean
          severity?: string
          signature_hash?: string | null
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          update_id?: string | null
          updated_at?: string
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          app_version?: string | null
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          distribution_source?: string | null
          environment_mode?: string
          flag_type?: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          pii_stored?: boolean
          platform?: string
          provider_environment?: string | null
          readback_complete?: boolean
          release_action_executed?: boolean
          review_status?: string
          runtime_version?: string | null
          secrets_logged?: boolean
          severity?: string
          signature_hash?: string | null
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          update_id?: string | null
          updated_at?: string
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Relationships: []
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
      livekit_operator_events: {
        Row: {
          action_planned: string | null
          action_taken: string | null
          after_health: Json
          app_version: string | null
          before_health: Json
          bundle_identifier: string | null
          channel: string | null
          confidence: number
          created_at: string
          data_source: string | null
          distribution_source: string | null
          first_seen_at: string
          health_state: string
          id: string
          last_seen_at: string
          metadata: Json
          native_build: string | null
          occurrence_count: number
          platform: string
          provider_environment: string | null
          readback_complete: boolean
          reason: string
          recovery_duration_ms: number | null
          result: string | null
          rollback_available: boolean
          runtime_version: string | null
          severity: string
          surface: string
          update_id: string | null
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          action_planned?: string | null
          action_taken?: string | null
          after_health?: Json
          app_version?: string | null
          before_health?: Json
          bundle_identifier?: string | null
          channel?: string | null
          confidence?: number
          created_at?: string
          data_source?: string | null
          distribution_source?: string | null
          first_seen_at?: string
          health_state: string
          id?: string
          last_seen_at?: string
          metadata?: Json
          native_build?: string | null
          occurrence_count?: number
          platform?: string
          provider_environment?: string | null
          readback_complete?: boolean
          reason: string
          recovery_duration_ms?: number | null
          result?: string | null
          rollback_available?: boolean
          runtime_version?: string | null
          severity?: string
          surface: string
          update_id?: string | null
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          action_planned?: string | null
          action_taken?: string | null
          after_health?: Json
          app_version?: string | null
          before_health?: Json
          bundle_identifier?: string | null
          channel?: string | null
          confidence?: number
          created_at?: string
          data_source?: string | null
          distribution_source?: string | null
          first_seen_at?: string
          health_state?: string
          id?: string
          last_seen_at?: string
          metadata?: Json
          native_build?: string | null
          occurrence_count?: number
          platform?: string
          provider_environment?: string | null
          readback_complete?: boolean
          reason?: string
          recovery_duration_ms?: number | null
          result?: string | null
          rollback_available?: boolean
          runtime_version?: string | null
          severity?: string
          surface?: string
          update_id?: string | null
          window_end?: string | null
          window_start?: string | null
        }
        Relationships: []
      }
      livekit_operator_learning_state: {
        Row: {
          confidence: number
          failure_count: number
          health_state: string
          id: string
          last_recovery_duration_ms: number | null
          last_result: string | null
          metadata: Json
          occurrence_count: number
          preferred_action: string
          reason: string
          success_count: number
          surface: string
          updated_at: string
        }
        Insert: {
          confidence?: number
          failure_count?: number
          health_state: string
          id?: string
          last_recovery_duration_ms?: number | null
          last_result?: string | null
          metadata?: Json
          occurrence_count?: number
          preferred_action: string
          reason: string
          success_count?: number
          surface: string
          updated_at?: string
        }
        Update: {
          confidence?: number
          failure_count?: number
          health_state?: string
          id?: string
          last_recovery_duration_ms?: number | null
          last_result?: string | null
          metadata?: Json
          occurrence_count?: number
          preferred_action?: string
          reason?: string
          success_count?: number
          surface?: string
          updated_at?: string
        }
        Relationships: []
      }
      livekit_operator_recovery_actions: {
        Row: {
          action_planned: string
          action_taken: string | null
          after_health: Json
          auto_executable: boolean
          before_health: Json
          created_at: string
          health_state: string
          id: string
          metadata: Json
          owner_approval_required: boolean
          platform: string
          reason: string
          recovery_duration_ms: number | null
          recovery_level: number
          result: string
          rollback_available: boolean
          severity: string
          surface: string
        }
        Insert: {
          action_planned: string
          action_taken?: string | null
          after_health?: Json
          auto_executable?: boolean
          before_health?: Json
          created_at?: string
          health_state: string
          id?: string
          metadata?: Json
          owner_approval_required?: boolean
          platform?: string
          reason: string
          recovery_duration_ms?: number | null
          recovery_level?: number
          result?: string
          rollback_available?: boolean
          severity?: string
          surface: string
        }
        Update: {
          action_planned?: string
          action_taken?: string | null
          after_health?: Json
          auto_executable?: boolean
          before_health?: Json
          created_at?: string
          health_state?: string
          id?: string
          metadata?: Json
          owner_approval_required?: boolean
          platform?: string
          reason?: string
          recovery_duration_ms?: number | null
          recovery_level?: number
          result?: string
          rollback_available?: boolean
          severity?: string
          surface?: string
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
          disk_usage_percent: number | null
          heartbeat_at: string
          id: string
          livekit_node_status: string | null
          memory_total_mb: number | null
          memory_used_mb: number | null
          metrics_collected_at: string | null
          metrics_source: string | null
          network_rx_bps: number | null
          network_tx_bps: number | null
          packet_loss_percent: number | null
          ram_percent: number | null
          server_id: string
          turn_status: string | null
        }
        Insert: {
          active_participants?: number
          active_publishers?: number
          active_rooms?: number
          bandwidth_in_mbps?: number | null
          bandwidth_out_mbps?: number | null
          cpu_percent?: number | null
          disconnect_rate?: number | null
          disk_usage_percent?: number | null
          heartbeat_at?: string
          id?: string
          livekit_node_status?: string | null
          memory_total_mb?: number | null
          memory_used_mb?: number | null
          metrics_collected_at?: string | null
          metrics_source?: string | null
          network_rx_bps?: number | null
          network_tx_bps?: number | null
          packet_loss_percent?: number | null
          ram_percent?: number | null
          server_id: string
          turn_status?: string | null
        }
        Update: {
          active_participants?: number
          active_publishers?: number
          active_rooms?: number
          bandwidth_in_mbps?: number | null
          bandwidth_out_mbps?: number | null
          cpu_percent?: number | null
          disconnect_rate?: number | null
          disk_usage_percent?: number | null
          heartbeat_at?: string
          id?: string
          livekit_node_status?: string | null
          memory_total_mb?: number | null
          memory_used_mb?: number | null
          metrics_collected_at?: string | null
          metrics_source?: string | null
          network_rx_bps?: number | null
          network_tx_bps?: number | null
          packet_loss_percent?: number | null
          ram_percent?: number | null
          server_id?: string
          turn_status?: string | null
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
          disk_usage_percent: number | null
          display_name: string
          drain_reason: string | null
          drain_started_at: string | null
          id: string
          internal_api_url: string | null
          last_assignment_at: string | null
          last_heartbeat_at: string | null
          livekit_node_status: string | null
          max_egress_mbps: number | null
          max_participants: number
          max_publishers: number | null
          max_rooms: number
          memory_total_mb: number | null
          memory_used_mb: number | null
          metadata: Json
          metrics_collected_at: string | null
          metrics_source: string | null
          network_rx_bps: number | null
          network_tx_bps: number | null
          packet_loss_percent: number | null
          provider: string
          public_ws_url: string
          ram_percent: number | null
          region: string
          server_id: string
          status: string
          turn_status: string | null
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
          disk_usage_percent?: number | null
          display_name: string
          drain_reason?: string | null
          drain_started_at?: string | null
          id?: string
          internal_api_url?: string | null
          last_assignment_at?: string | null
          last_heartbeat_at?: string | null
          livekit_node_status?: string | null
          max_egress_mbps?: number | null
          max_participants?: number
          max_publishers?: number | null
          max_rooms?: number
          memory_total_mb?: number | null
          memory_used_mb?: number | null
          metadata?: Json
          metrics_collected_at?: string | null
          metrics_source?: string | null
          network_rx_bps?: number | null
          network_tx_bps?: number | null
          packet_loss_percent?: number | null
          provider?: string
          public_ws_url: string
          ram_percent?: number | null
          region: string
          server_id: string
          status?: string
          turn_status?: string | null
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
          disk_usage_percent?: number | null
          display_name?: string
          drain_reason?: string | null
          drain_started_at?: string | null
          id?: string
          internal_api_url?: string | null
          last_assignment_at?: string | null
          last_heartbeat_at?: string | null
          livekit_node_status?: string | null
          max_egress_mbps?: number | null
          max_participants?: number
          max_publishers?: number | null
          max_rooms?: number
          memory_total_mb?: number | null
          memory_used_mb?: number | null
          metadata?: Json
          metrics_collected_at?: string | null
          metrics_source?: string | null
          network_rx_bps?: number | null
          network_tx_bps?: number | null
          packet_loss_percent?: number | null
          provider?: string
          public_ws_url?: string
          ram_percent?: number | null
          region?: string
          server_id?: string
          status?: string
          turn_status?: string | null
          updated_at?: string
          weight?: number
        }
        Relationships: []
      }
      livekit_surface_health_snapshots: {
        Row: {
          app_version: string | null
          bundle_identifier: string | null
          channel: string | null
          created_at: string
          data_source: string | null
          distribution_source: string | null
          eligible_server_count: number | null
          health_state: string
          heartbeat_age_seconds: number | null
          id: string
          metadata: Json
          native_build: string | null
          platform: string
          provider_environment: string | null
          readback_complete: boolean
          reason: string
          render_health: Json
          router_health: Json
          runtime_version: string | null
          severity: string
          surface: string
          token_probe_status: string | null
          update_id: string | null
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          app_version?: string | null
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          distribution_source?: string | null
          eligible_server_count?: number | null
          health_state: string
          heartbeat_age_seconds?: number | null
          id?: string
          metadata?: Json
          native_build?: string | null
          platform?: string
          provider_environment?: string | null
          readback_complete?: boolean
          reason: string
          render_health?: Json
          router_health?: Json
          runtime_version?: string | null
          severity?: string
          surface: string
          token_probe_status?: string | null
          update_id?: string | null
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          app_version?: string | null
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          distribution_source?: string | null
          eligible_server_count?: number | null
          health_state?: string
          heartbeat_age_seconds?: number | null
          id?: string
          metadata?: Json
          native_build?: string | null
          platform?: string
          provider_environment?: string | null
          readback_complete?: boolean
          reason?: string
          render_health?: Json
          router_health?: Json
          runtime_version?: string | null
          severity?: string
          surface?: string
          token_probe_status?: string | null
          update_id?: string | null
          window_end?: string | null
          window_start?: string | null
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
      media_renditions: {
        Row: {
          bitrate: number | null
          bucket_role: string
          cache_policy: string | null
          codec: string | null
          created_at: string
          creator_id: string | null
          delivery_format: string
          delivery_provider: string
          duration_ms: number | null
          file_size_bytes: number | null
          height: number | null
          id: string
          is_original: boolean
          is_protected_playback_safe: boolean
          is_public_playback_safe: boolean
          is_ready: boolean
          job_id: string | null
          manifest_path: string | null
          media_id: string
          moderation_status: string
          protected_playback_path: string | null
          public_playback_path: string | null
          rendition_label: string
          scan_status: string
          source_hash: string | null
          source_id: string
          source_type: string
          storage_bucket: string | null
          storage_path: string | null
          storage_provider: string
          updated_at: string
          variant_playlist_path: string | null
          video_id: string | null
          visibility: string
          width: number | null
          worker_version: string | null
        }
        Insert: {
          bitrate?: number | null
          bucket_role: string
          cache_policy?: string | null
          codec?: string | null
          created_at?: string
          creator_id?: string | null
          delivery_format: string
          delivery_provider: string
          duration_ms?: number | null
          file_size_bytes?: number | null
          height?: number | null
          id?: string
          is_original?: boolean
          is_protected_playback_safe?: boolean
          is_public_playback_safe?: boolean
          is_ready?: boolean
          job_id?: string | null
          manifest_path?: string | null
          media_id: string
          moderation_status?: string
          protected_playback_path?: string | null
          public_playback_path?: string | null
          rendition_label: string
          scan_status?: string
          source_hash?: string | null
          source_id: string
          source_type: string
          storage_bucket?: string | null
          storage_path?: string | null
          storage_provider: string
          updated_at?: string
          variant_playlist_path?: string | null
          video_id?: string | null
          visibility?: string
          width?: number | null
          worker_version?: string | null
        }
        Update: {
          bitrate?: number | null
          bucket_role?: string
          cache_policy?: string | null
          codec?: string | null
          created_at?: string
          creator_id?: string | null
          delivery_format?: string
          delivery_provider?: string
          duration_ms?: number | null
          file_size_bytes?: number | null
          height?: number | null
          id?: string
          is_original?: boolean
          is_protected_playback_safe?: boolean
          is_public_playback_safe?: boolean
          is_ready?: boolean
          job_id?: string | null
          manifest_path?: string | null
          media_id?: string
          moderation_status?: string
          protected_playback_path?: string | null
          public_playback_path?: string | null
          rendition_label?: string
          scan_status?: string
          source_hash?: string | null
          source_id?: string
          source_type?: string
          storage_bucket?: string | null
          storage_path?: string | null
          storage_provider?: string
          updated_at?: string
          variant_playlist_path?: string | null
          video_id?: string | null
          visibility?: string
          width?: number | null
          worker_version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "media_renditions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "media_transcode_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_renditions_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      media_scan_jobs: {
        Row: {
          attempt_count: number
          claimed_at: string | null
          claimed_by: string | null
          completed_at: string | null
          created_at: string
          error_message: string | null
          finding_name: string | null
          id: string
          max_attempts: number
          metadata: Json
          mime_type: string | null
          owner_user_id: string | null
          priority: number
          scanner_provider: string | null
          scanner_version: string | null
          signature_version: string | null
          size_bytes: number
          status: string
          storage_bucket: string
          storage_object_key: string
          storage_provider: string
          target_column: string
          target_id: string
          target_table: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          claimed_at?: string | null
          claimed_by?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          finding_name?: string | null
          id?: string
          max_attempts?: number
          metadata?: Json
          mime_type?: string | null
          owner_user_id?: string | null
          priority?: number
          scanner_provider?: string | null
          scanner_version?: string | null
          signature_version?: string | null
          size_bytes?: number
          status?: string
          storage_bucket: string
          storage_object_key: string
          storage_provider?: string
          target_column: string
          target_id: string
          target_table: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          claimed_at?: string | null
          claimed_by?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          finding_name?: string | null
          id?: string
          max_attempts?: number
          metadata?: Json
          mime_type?: string | null
          owner_user_id?: string | null
          priority?: number
          scanner_provider?: string | null
          scanner_version?: string | null
          signature_version?: string | null
          size_bytes?: number
          status?: string
          storage_bucket?: string
          storage_object_key?: string
          storage_provider?: string
          target_column?: string
          target_id?: string
          target_table?: string
          updated_at?: string
        }
        Relationships: []
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
      media_transcode_jobs: {
        Row: {
          completed_at: string | null
          completed_renditions: Json
          created_at: string
          creator_id: string | null
          duration_ms: number | null
          error_code: string | null
          error_message: string | null
          id: string
          input_bucket: string | null
          input_bucket_role: string
          input_path: string
          input_provider: string
          output_bucket: string | null
          output_bucket_role: string
          output_prefix: string
          output_provider: string
          proof_mode: boolean
          requested_by: string | null
          requested_renditions: Json
          source_codec: string | null
          source_hash: string | null
          source_height: number | null
          source_id: string
          source_type: string
          source_width: number | null
          started_at: string | null
          status: string
          updated_at: string
          worker_version: string | null
        }
        Insert: {
          completed_at?: string | null
          completed_renditions?: Json
          created_at?: string
          creator_id?: string | null
          duration_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          input_bucket?: string | null
          input_bucket_role?: string
          input_path: string
          input_provider: string
          output_bucket?: string | null
          output_bucket_role?: string
          output_prefix: string
          output_provider: string
          proof_mode?: boolean
          requested_by?: string | null
          requested_renditions?: Json
          source_codec?: string | null
          source_hash?: string | null
          source_height?: number | null
          source_id: string
          source_type: string
          source_width?: number | null
          started_at?: string | null
          status?: string
          updated_at?: string
          worker_version?: string | null
        }
        Update: {
          completed_at?: string | null
          completed_renditions?: Json
          created_at?: string
          creator_id?: string | null
          duration_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          input_bucket?: string | null
          input_bucket_role?: string
          input_path?: string
          input_provider?: string
          output_bucket?: string | null
          output_bucket_role?: string
          output_prefix?: string
          output_provider?: string
          proof_mode?: boolean
          requested_by?: string | null
          requested_renditions?: Json
          source_codec?: string | null
          source_hash?: string | null
          source_height?: number | null
          source_id?: string
          source_type?: string
          source_width?: number | null
          started_at?: string | null
          status?: string
          updated_at?: string
          worker_version?: string | null
        }
        Relationships: []
      }
      merch_order_items: {
        Row: {
          created_at: string
          currency: string
          id: string
          order_id: string
          product_id: string | null
          quantity: number
          unit_amount_minor: number
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          order_id: string
          product_id?: string | null
          quantity: number
          unit_amount_minor: number
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          order_id?: string
          product_id?: string | null
          quantity?: number
          unit_amount_minor?: number
        }
        Relationships: [
          {
            foreignKeyName: "merch_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "merch_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merch_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "merch_products"
            referencedColumns: ["id"]
          },
        ]
      }
      merch_orders: {
        Row: {
          amount_subtotal_minor: number | null
          amount_total_minor: number | null
          buyer_id: string | null
          canceled_at: string | null
          created_at: string
          creator_id: string | null
          currency: string | null
          digital_access_grant_id: string | null
          environment: string
          fulfillment_status: string
          id: string
          metadata: Json
          order_status: string
          paid_at: string | null
          payment_status: string
          product_id: string | null
          provider: string
          provider_order_id: string | null
          refunded_at: string | null
          shipping_address: Json | null
          shipping_name: string | null
          shipping_required: boolean
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          updated_at: string
        }
        Insert: {
          amount_subtotal_minor?: number | null
          amount_total_minor?: number | null
          buyer_id?: string | null
          canceled_at?: string | null
          created_at?: string
          creator_id?: string | null
          currency?: string | null
          digital_access_grant_id?: string | null
          environment?: string
          fulfillment_status?: string
          id?: string
          metadata?: Json
          order_status?: string
          paid_at?: string | null
          payment_status?: string
          product_id?: string | null
          provider?: string
          provider_order_id?: string | null
          refunded_at?: string | null
          shipping_address?: Json | null
          shipping_name?: string | null
          shipping_required?: boolean
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_subtotal_minor?: number | null
          amount_total_minor?: number | null
          buyer_id?: string | null
          canceled_at?: string | null
          created_at?: string
          creator_id?: string | null
          currency?: string | null
          digital_access_grant_id?: string | null
          environment?: string
          fulfillment_status?: string
          id?: string
          metadata?: Json
          order_status?: string
          paid_at?: string | null
          payment_status?: string
          product_id?: string | null
          provider?: string
          provider_order_id?: string | null
          refunded_at?: string | null
          shipping_address?: Json | null
          shipping_name?: string | null
          shipping_required?: boolean
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "merch_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "merch_products"
            referencedColumns: ["id"]
          },
        ]
      }
      merch_products: {
        Row: {
          created_at: string
          creates_digital_access: boolean
          creator_id: string | null
          currency: string
          description: string | null
          display_name: string
          environment: string
          fulfillment_model: string
          id: string
          image_url: string | null
          inventory_status: string
          is_physical_good: boolean
          metadata: Json
          price_minor: number | null
          product_id: string | null
          product_key: string | null
          provider: string
          status: string
          stripe_price_id: string | null
          stripe_product_id: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          creates_digital_access?: boolean
          creator_id?: string | null
          currency?: string
          description?: string | null
          display_name: string
          environment?: string
          fulfillment_model?: string
          id?: string
          image_url?: string | null
          inventory_status?: string
          is_physical_good?: boolean
          metadata?: Json
          price_minor?: number | null
          product_id?: string | null
          product_key?: string | null
          provider?: string
          status?: string
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          creates_digital_access?: boolean
          creator_id?: string | null
          currency?: string
          description?: string | null
          display_name?: string
          environment?: string
          fulfillment_model?: string
          id?: string
          image_url?: string | null
          inventory_status?: string
          is_physical_good?: boolean
          metadata?: Json
          price_minor?: number | null
          product_id?: string | null
          product_key?: string | null
          provider?: string
          status?: string
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "merch_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "monetization_products"
            referencedColumns: ["id"]
          },
        ]
      }
      migration_drift_findings: {
        Row: {
          app_version: string | null
          bundle_identifier: string | null
          channel: string | null
          created_at: string
          data_source: string | null
          distribution_source: string | null
          environment_mode: string
          fake_proof: boolean
          flag_type: string
          high_risk_executed: boolean
          id: string
          metadata: Json
          money_moved: boolean
          native_build: string | null
          platform: string
          provider_environment: string | null
          readback_complete: boolean
          runtime_version: string | null
          severity: string
          system_id: string
          target_id: string | null
          target_type: string | null
          update_id: string | null
          user_rights_changed: boolean
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          app_version?: string | null
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          distribution_source?: string | null
          environment_mode?: string
          fake_proof?: boolean
          flag_type?: string
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          platform?: string
          provider_environment?: string | null
          readback_complete?: boolean
          runtime_version?: string | null
          severity?: string
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          update_id?: string | null
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          app_version?: string | null
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          distribution_source?: string | null
          environment_mode?: string
          fake_proof?: boolean
          flag_type?: string
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          platform?: string
          provider_environment?: string | null
          readback_complete?: boolean
          runtime_version?: string | null
          severity?: string
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          update_id?: string | null
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Relationships: []
      }
      moderation_case_priority_flags: {
        Row: {
          created_at: string
          environment_mode: string
          flag_type: string
          id: string
          metadata: Json
          money_moved: boolean
          priority: string
          review_status: string
          system_id: string
          user_rights_changed: boolean
        }
        Insert: {
          created_at?: string
          environment_mode?: string
          flag_type: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          priority?: string
          review_status?: string
          system_id?: string
          user_rights_changed?: boolean
        }
        Update: {
          created_at?: string
          environment_mode?: string
          flag_type?: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          priority?: string
          review_status?: string
          system_id?: string
          user_rights_changed?: boolean
        }
        Relationships: []
      }
      moderation_duplicate_report_detections: {
        Row: {
          created_at: string
          dedupe_key: string
          environment_mode: string
          id: string
          metadata: Json
          money_moved: boolean
          report_count: number
          review_status: string
          system_id: string
          user_rights_changed: boolean
        }
        Insert: {
          created_at?: string
          dedupe_key: string
          environment_mode?: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          report_count?: number
          review_status?: string
          system_id?: string
          user_rights_changed?: boolean
        }
        Update: {
          created_at?: string
          dedupe_key?: string
          environment_mode?: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          report_count?: number
          review_status?: string
          system_id?: string
          user_rights_changed?: boolean
        }
        Relationships: []
      }
      moderation_health_snapshots: {
        Row: {
          created_at: string
          environment_mode: string
          health_state: string
          id: string
          metadata: Json
          money_moved: boolean
          platform: string
          stale_case_count: number
          system_id: string
          urgent_review_count: number
          user_rights_changed: boolean
        }
        Insert: {
          created_at?: string
          environment_mode?: string
          health_state: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          platform?: string
          stale_case_count?: number
          system_id?: string
          urgent_review_count?: number
          user_rights_changed?: boolean
        }
        Update: {
          created_at?: string
          environment_mode?: string
          health_state?: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          platform?: string
          stale_case_count?: number
          system_id?: string
          urgent_review_count?: number
          user_rights_changed?: boolean
        }
        Relationships: []
      }
      moderation_operator_events: {
        Row: {
          action_id: string
          actor_id: string | null
          actor_type: string
          created_at: string
          environment_mode: string
          id: string
          metadata: Json
          money_moved: boolean
          platform: string
          result: string
          system_id: string
          user_rights_changed: boolean
        }
        Insert: {
          action_id: string
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          environment_mode?: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          platform?: string
          result: string
          system_id?: string
          user_rights_changed?: boolean
        }
        Update: {
          action_id?: string
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          environment_mode?: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          platform?: string
          result?: string
          system_id?: string
          user_rights_changed?: boolean
        }
        Relationships: []
      }
      moderation_operator_learning_state: {
        Row: {
          confidence: number
          first_seen_at: string
          id: string
          incident_key: string
          last_recommended_action: string | null
          last_seen_at: string
          metadata: Json
          money_moved: boolean
          occurrence_count: number
          system_id: string
          user_rights_changed: boolean
        }
        Insert: {
          confidence?: number
          first_seen_at?: string
          id?: string
          incident_key: string
          last_recommended_action?: string | null
          last_seen_at?: string
          metadata?: Json
          money_moved?: boolean
          occurrence_count?: number
          system_id?: string
          user_rights_changed?: boolean
        }
        Update: {
          confidence?: number
          first_seen_at?: string
          id?: string
          incident_key?: string
          last_recommended_action?: string | null
          last_seen_at?: string
          metadata?: Json
          money_moved?: boolean
          occurrence_count?: number
          system_id?: string
          user_rights_changed?: boolean
        }
        Relationships: []
      }
      moderation_required_review_flags: {
        Row: {
          created_at: string
          environment_mode: string
          flag_type: string
          id: string
          metadata: Json
          money_moved: boolean
          review_status: string
          severity: string
          system_id: string
          updated_at: string
          user_rights_changed: boolean
        }
        Insert: {
          created_at?: string
          environment_mode?: string
          flag_type: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          review_status?: string
          severity?: string
          system_id?: string
          updated_at?: string
          user_rights_changed?: boolean
        }
        Update: {
          created_at?: string
          environment_mode?: string
          flag_type?: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          review_status?: string
          severity?: string
          system_id?: string
          updated_at?: string
          user_rights_changed?: boolean
        }
        Relationships: []
      }
      moderation_stale_case_findings: {
        Row: {
          case_type: string
          created_at: string
          environment_mode: string
          id: string
          metadata: Json
          money_moved: boolean
          review_status: string
          stale_age_seconds: number
          system_id: string
          user_rights_changed: boolean
        }
        Insert: {
          case_type: string
          created_at?: string
          environment_mode?: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          review_status?: string
          stale_age_seconds?: number
          system_id?: string
          user_rights_changed?: boolean
        }
        Update: {
          case_type?: string
          created_at?: string
          environment_mode?: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          review_status?: string
          stale_age_seconds?: number
          system_id?: string
          user_rights_changed?: boolean
        }
        Relationships: []
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
      monetization_product_store_mappings: {
        Row: {
          apple_subscription_group: string | null
          concept: string
          created_at: string
          creates_payable_balance: boolean
          environment: string
          grants_livekit_authority: boolean
          id: string
          metadata: Json
          platform: string
          product_id: string
          provider: string
          provider_base_plan_id: string | null
          provider_product_id: string
          reference_currency: string
          reference_price_minor: number
          revenuecat_entitlement: string | null
          revenuecat_offering: string | null
          revenuecat_package: string | null
          status: string
          store: string
          store_product_type: string
          tier: string
          unlocks_digital_access: boolean
          updated_at: string
        }
        Insert: {
          apple_subscription_group?: string | null
          concept: string
          created_at?: string
          creates_payable_balance?: boolean
          environment?: string
          grants_livekit_authority?: boolean
          id?: string
          metadata?: Json
          platform: string
          product_id: string
          provider: string
          provider_base_plan_id?: string | null
          provider_product_id: string
          reference_currency?: string
          reference_price_minor: number
          revenuecat_entitlement?: string | null
          revenuecat_offering?: string | null
          revenuecat_package?: string | null
          status?: string
          store: string
          store_product_type: string
          tier: string
          unlocks_digital_access?: boolean
          updated_at?: string
        }
        Update: {
          apple_subscription_group?: string | null
          concept?: string
          created_at?: string
          creates_payable_balance?: boolean
          environment?: string
          grants_livekit_authority?: boolean
          id?: string
          metadata?: Json
          platform?: string
          product_id?: string
          provider?: string
          provider_base_plan_id?: string | null
          provider_product_id?: string
          reference_currency?: string
          reference_price_minor?: number
          revenuecat_entitlement?: string | null
          revenuecat_offering?: string | null
          revenuecat_package?: string | null
          status?: string
          store?: string
          store_product_type?: string
          tier?: string
          unlocks_digital_access?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "monetization_product_store_mappings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "monetization_products"
            referencedColumns: ["id"]
          },
        ]
      }
      monetization_products: {
        Row: {
          applies_to_id: string | null
          applies_to_type: string | null
          created_at: string
          created_by: string | null
          description: string | null
          display_name: string
          environment: string
          id: string
          is_android_digital: boolean
          is_physical_good: boolean
          metadata: Json
          product_key: string
          product_type: string
          provider: string
          provider_base_plan_id: string | null
          provider_product_id: string | null
          revenuecat_entitlement: string | null
          status: string
          updated_at: string
        }
        Insert: {
          applies_to_id?: string | null
          applies_to_type?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_name: string
          environment?: string
          id?: string
          is_android_digital?: boolean
          is_physical_good?: boolean
          metadata?: Json
          product_key: string
          product_type: string
          provider: string
          provider_base_plan_id?: string | null
          provider_product_id?: string | null
          revenuecat_entitlement?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          applies_to_id?: string | null
          applies_to_type?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_name?: string
          environment?: string
          id?: string
          is_android_digital?: boolean
          is_physical_good?: boolean
          metadata?: Json
          product_key?: string
          product_type?: string
          provider?: string
          provider_base_plan_id?: string | null
          provider_product_id?: string | null
          revenuecat_entitlement?: string | null
          status?: string
          updated_at?: string
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
      money_access_ledger_events: {
        Row: {
          amount_minor: number
          created_at: string
          creator_id: string | null
          currency: string
          environment: string
          event_type: string
          id: string
          metadata: Json
          payable_state: string
          platform_id: string | null
          product_id: string | null
          provider_event_id: string | null
          source_id: string | null
          source_type: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          amount_minor?: number
          created_at?: string
          creator_id?: string | null
          currency?: string
          environment?: string
          event_type: string
          id?: string
          metadata?: Json
          payable_state?: string
          platform_id?: string | null
          product_id?: string | null
          provider_event_id?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          amount_minor?: number
          created_at?: string
          creator_id?: string | null
          currency?: string
          environment?: string
          event_type?: string
          id?: string
          metadata?: Json
          payable_state?: string
          platform_id?: string | null
          product_id?: string | null
          provider_event_id?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "money_access_ledger_events_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "monetization_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "money_access_ledger_events_provider_event_id_fkey"
            columns: ["provider_event_id"]
            isOneToOne: false
            referencedRelation: "provider_events"
            referencedColumns: ["id"]
          },
        ]
      }
      money_credit_ledger_entries: {
        Row: {
          amount_cents: number
          cash_equivalent: boolean
          created_at: string
          credit_status: string
          credit_type: string
          currency: string
          environment: string
          id: string
          live_money_enabled_at_approval: boolean
          metadata: Json
          payable: boolean
          policy_key: string
          provider_refund_evidence_id: string | null
          refund_review_id: string | null
          safe_user_summary: string
          spendable: boolean
          transferable: boolean
          updated_at: string
          user_id: string
          withdrawable: boolean
        }
        Insert: {
          amount_cents?: number
          cash_equivalent?: boolean
          created_at?: string
          credit_status?: string
          credit_type?: string
          currency?: string
          environment?: string
          id?: string
          live_money_enabled_at_approval?: boolean
          metadata?: Json
          payable?: boolean
          policy_key: string
          provider_refund_evidence_id?: string | null
          refund_review_id?: string | null
          safe_user_summary?: string
          spendable?: boolean
          transferable?: boolean
          updated_at?: string
          user_id: string
          withdrawable?: boolean
        }
        Update: {
          amount_cents?: number
          cash_equivalent?: boolean
          created_at?: string
          credit_status?: string
          credit_type?: string
          currency?: string
          environment?: string
          id?: string
          live_money_enabled_at_approval?: boolean
          metadata?: Json
          payable?: boolean
          policy_key?: string
          provider_refund_evidence_id?: string | null
          refund_review_id?: string | null
          safe_user_summary?: string
          spendable?: boolean
          transferable?: boolean
          updated_at?: string
          user_id?: string
          withdrawable?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "money_credit_ledger_entries_refund_review_id_fkey"
            columns: ["refund_review_id"]
            isOneToOne: false
            referencedRelation: "money_refund_review_records"
            referencedColumns: ["id"]
          },
        ]
      }
      money_duplicate_event_detections: {
        Row: {
          created_at: string
          created_by: string
          detection_status: string
          environment_mode: string
          event_id_hash: string
          id: string
          metadata: Json
          money_moved: boolean
          provider: string
          source_row_id: string | null
          source_table: string | null
          system_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          detection_status?: string
          environment_mode?: string
          event_id_hash: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          provider: string
          source_row_id?: string | null
          source_table?: string | null
          system_id?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          detection_status?: string
          environment_mode?: string
          event_id_hash?: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          provider?: string
          source_row_id?: string | null
          source_table?: string | null
          system_id?: string
        }
        Relationships: []
      }
      money_flow_health_snapshots: {
        Row: {
          app_version: string | null
          bundle_identifier: string | null
          channel: string | null
          created_at: string
          created_by: string
          data_source: string | null
          distribution_source: string | null
          eligible_for_safe_writes: boolean
          environment_mode: string
          health_state: string
          id: string
          latest_operator_action: string | null
          metadata: Json
          money_moved: boolean
          native_build: string | null
          platform: string
          provider_environment: string | null
          readback_complete: boolean
          runtime_version: string | null
          system_id: string
          update_id: string | null
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          app_version?: string | null
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          created_by?: string
          data_source?: string | null
          distribution_source?: string | null
          eligible_for_safe_writes?: boolean
          environment_mode?: string
          health_state: string
          id?: string
          latest_operator_action?: string | null
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          platform?: string
          provider_environment?: string | null
          readback_complete?: boolean
          runtime_version?: string | null
          system_id?: string
          update_id?: string | null
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          app_version?: string | null
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          created_by?: string
          data_source?: string | null
          distribution_source?: string | null
          eligible_for_safe_writes?: boolean
          environment_mode?: string
          health_state?: string
          id?: string
          latest_operator_action?: string | null
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          platform?: string
          provider_environment?: string | null
          readback_complete?: boolean
          runtime_version?: string | null
          system_id?: string
          update_id?: string | null
          window_end?: string | null
          window_start?: string | null
        }
        Relationships: []
      }
      money_operator_events: {
        Row: {
          action_id: string | null
          blocked_reason: string | null
          created_at: string
          created_by: string
          environment_mode: string
          event_type: string
          external_confirmation_required: boolean
          external_confirmation_status: string
          id: string
          metadata: Json
          money_moved: boolean
          platform: string
          result: string
          severity: string
          surface: string | null
          system_id: string
        }
        Insert: {
          action_id?: string | null
          blocked_reason?: string | null
          created_at?: string
          created_by?: string
          environment_mode?: string
          event_type: string
          external_confirmation_required?: boolean
          external_confirmation_status?: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          platform?: string
          result?: string
          severity?: string
          surface?: string | null
          system_id?: string
        }
        Update: {
          action_id?: string | null
          blocked_reason?: string | null
          created_at?: string
          created_by?: string
          environment_mode?: string
          event_type?: string
          external_confirmation_required?: boolean
          external_confirmation_status?: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          platform?: string
          result?: string
          severity?: string
          surface?: string | null
          system_id?: string
        }
        Relationships: []
      }
      money_operator_learning_state: {
        Row: {
          confidence: number
          environment_mode: string
          first_seen_at: string
          id: string
          incident_key: string
          last_recovery_action: string | null
          last_recovery_result: string | null
          last_seen_at: string
          metadata: Json
          money_moved: boolean
          occurrence_count: number
          reason: string
          recommended_next_action: string | null
          surface: string | null
          system_id: string
        }
        Insert: {
          confidence?: number
          environment_mode?: string
          first_seen_at?: string
          id?: string
          incident_key: string
          last_recovery_action?: string | null
          last_recovery_result?: string | null
          last_seen_at?: string
          metadata?: Json
          money_moved?: boolean
          occurrence_count?: number
          reason: string
          recommended_next_action?: string | null
          surface?: string | null
          system_id?: string
        }
        Update: {
          confidence?: number
          environment_mode?: string
          first_seen_at?: string
          id?: string
          incident_key?: string
          last_recovery_action?: string | null
          last_recovery_result?: string | null
          last_seen_at?: string
          metadata?: Json
          money_moved?: boolean
          occurrence_count?: number
          reason?: string
          recommended_next_action?: string | null
          surface?: string | null
          system_id?: string
        }
        Relationships: []
      }
      money_provider_sync_status: {
        Row: {
          app_version: string | null
          bundle_identifier: string | null
          capability: string
          channel: string | null
          created_at: string
          created_by: string
          data_source: string | null
          distribution_source: string | null
          environment_mode: string
          failure_reason: string | null
          id: string
          last_checked_at: string
          last_success_at: string | null
          metadata: Json
          money_moved: boolean
          native_build: string | null
          platform: string
          provider: string
          provider_environment: string | null
          readback_complete: boolean
          runtime_version: string | null
          sync_status: string
          system_id: string
          update_id: string | null
          updated_at: string
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          app_version?: string | null
          bundle_identifier?: string | null
          capability: string
          channel?: string | null
          created_at?: string
          created_by?: string
          data_source?: string | null
          distribution_source?: string | null
          environment_mode?: string
          failure_reason?: string | null
          id?: string
          last_checked_at?: string
          last_success_at?: string | null
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          platform?: string
          provider: string
          provider_environment?: string | null
          readback_complete?: boolean
          runtime_version?: string | null
          sync_status: string
          system_id?: string
          update_id?: string | null
          updated_at?: string
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          app_version?: string | null
          bundle_identifier?: string | null
          capability?: string
          channel?: string | null
          created_at?: string
          created_by?: string
          data_source?: string | null
          distribution_source?: string | null
          environment_mode?: string
          failure_reason?: string | null
          id?: string
          last_checked_at?: string
          last_success_at?: string | null
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          platform?: string
          provider?: string
          provider_environment?: string | null
          readback_complete?: boolean
          runtime_version?: string | null
          sync_status?: string
          system_id?: string
          update_id?: string | null
          updated_at?: string
          window_end?: string | null
          window_start?: string | null
        }
        Relationships: []
      }
      money_purchase_intents: {
        Row: {
          amount_minor: number | null
          consumed_at: string | null
          created_at: string
          creator_id: string | null
          currency: string | null
          environment: string
          expires_at: string
          id: string
          idempotency_key: string
          metadata: Json
          platform_id: string | null
          product_id: string
          product_key: string
          product_type: string
          provider: string
          provider_product_id: string
          revoked_at: string | null
          source_id: string | null
          source_type: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_minor?: number | null
          consumed_at?: string | null
          created_at?: string
          creator_id?: string | null
          currency?: string | null
          environment?: string
          expires_at: string
          id?: string
          idempotency_key: string
          metadata?: Json
          platform_id?: string | null
          product_id: string
          product_key: string
          product_type: string
          provider: string
          provider_product_id: string
          revoked_at?: string | null
          source_id?: string | null
          source_type: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_minor?: number | null
          consumed_at?: string | null
          created_at?: string
          creator_id?: string | null
          currency?: string | null
          environment?: string
          expires_at?: string
          id?: string
          idempotency_key?: string
          metadata?: Json
          platform_id?: string | null
          product_id?: string
          product_key?: string
          product_type?: string
          provider?: string
          provider_product_id?: string
          revoked_at?: string | null
          source_id?: string | null
          source_type?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "money_purchase_intents_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "monetization_products"
            referencedColumns: ["id"]
          },
        ]
      }
      money_reconciliation_findings: {
        Row: {
          created_at: string
          created_by: string
          entity_id: string | null
          entity_table: string | null
          environment_mode: string
          external_confirmation_required: boolean
          external_confirmation_status: string
          finding_type: string
          id: string
          metadata: Json
          money_moved: boolean
          platform: string
          run_id: string | null
          severity: string
          status: string
          surface: string | null
          system_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          entity_id?: string | null
          entity_table?: string | null
          environment_mode?: string
          external_confirmation_required?: boolean
          external_confirmation_status?: string
          finding_type: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          platform?: string
          run_id?: string | null
          severity?: string
          status?: string
          surface?: string | null
          system_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          entity_id?: string | null
          entity_table?: string | null
          environment_mode?: string
          external_confirmation_required?: boolean
          external_confirmation_status?: string
          finding_type?: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          platform?: string
          run_id?: string | null
          severity?: string
          status?: string
          surface?: string | null
          system_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "money_reconciliation_findings_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "money_reconciliation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      money_reconciliation_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string
          environment_mode: string
          id: string
          money_moved: boolean
          platform: string
          run_type: string
          started_at: string
          status: string
          summary: Json
          system_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string
          environment_mode?: string
          id?: string
          money_moved?: boolean
          platform?: string
          run_type?: string
          started_at?: string
          status?: string
          summary?: Json
          system_id?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string
          environment_mode?: string
          id?: string
          money_moved?: boolean
          platform?: string
          run_type?: string
          started_at?: string
          status?: string
          summary?: Json
          system_id?: string
        }
        Relationships: []
      }
      money_refund_policy_rules: {
        Row: {
          cash_refund_allowed_later: boolean
          created_at: string
          creator_obligation_required: boolean
          credit_allowed_later: boolean
          default_remedy: string
          display_name: string
          eligible_consumption_states: string[]
          foundation_only: boolean
          id: string
          ineligible_consumption_states: string[]
          metadata: Json
          payout_hold_required: boolean
          policy_key: string
          provider_action_required: boolean
          standard_refund_policy: string
          updated_at: string
        }
        Insert: {
          cash_refund_allowed_later?: boolean
          created_at?: string
          creator_obligation_required?: boolean
          credit_allowed_later?: boolean
          default_remedy?: string
          display_name: string
          eligible_consumption_states?: string[]
          foundation_only?: boolean
          id?: string
          ineligible_consumption_states?: string[]
          metadata?: Json
          payout_hold_required?: boolean
          policy_key: string
          provider_action_required?: boolean
          standard_refund_policy: string
          updated_at?: string
        }
        Update: {
          cash_refund_allowed_later?: boolean
          created_at?: string
          creator_obligation_required?: boolean
          credit_allowed_later?: boolean
          default_remedy?: string
          display_name?: string
          eligible_consumption_states?: string[]
          foundation_only?: boolean
          id?: string
          ineligible_consumption_states?: string[]
          metadata?: Json
          payout_hold_required?: boolean
          policy_key?: string
          provider_action_required?: boolean
          standard_refund_policy?: string
          updated_at?: string
        }
        Relationships: []
      }
      money_refund_review_records: {
        Row: {
          access_grant_id: string | null
          amount_cents: number
          buyer_user_id: string | null
          consumption_state: string
          created_at: string
          creator_obligation_state: string
          creator_user_id: string | null
          credit_review_record_id: string | null
          currency: string
          environment: string
          id: string
          metadata: Json
          payout_hold_record_id: string | null
          policy_key: string
          provider: string | null
          provider_event_id: string | null
          provider_refund_evidence_id: string | null
          provider_refund_status: string
          purchase_intent_id: string | null
          refund_remedy: string
          requester_user_id: string | null
          review_status: string
          safe_admin_summary: string
          safe_creator_summary: string
          safe_reason_code: string
          safe_user_summary: string
          source_id: string | null
          source_type: string | null
          updated_at: string
        }
        Insert: {
          access_grant_id?: string | null
          amount_cents?: number
          buyer_user_id?: string | null
          consumption_state?: string
          created_at?: string
          creator_obligation_state?: string
          creator_user_id?: string | null
          credit_review_record_id?: string | null
          currency?: string
          environment?: string
          id?: string
          metadata?: Json
          payout_hold_record_id?: string | null
          policy_key: string
          provider?: string | null
          provider_event_id?: string | null
          provider_refund_evidence_id?: string | null
          provider_refund_status?: string
          purchase_intent_id?: string | null
          refund_remedy?: string
          requester_user_id?: string | null
          review_status?: string
          safe_admin_summary?: string
          safe_creator_summary?: string
          safe_reason_code?: string
          safe_user_summary?: string
          source_id?: string | null
          source_type?: string | null
          updated_at?: string
        }
        Update: {
          access_grant_id?: string | null
          amount_cents?: number
          buyer_user_id?: string | null
          consumption_state?: string
          created_at?: string
          creator_obligation_state?: string
          creator_user_id?: string | null
          credit_review_record_id?: string | null
          currency?: string
          environment?: string
          id?: string
          metadata?: Json
          payout_hold_record_id?: string | null
          policy_key?: string
          provider?: string | null
          provider_event_id?: string | null
          provider_refund_evidence_id?: string | null
          provider_refund_status?: string
          purchase_intent_id?: string | null
          refund_remedy?: string
          requester_user_id?: string | null
          review_status?: string
          safe_admin_summary?: string
          safe_creator_summary?: string
          safe_reason_code?: string
          safe_user_summary?: string
          source_id?: string | null
          source_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "money_refund_review_records_access_grant_id_fkey"
            columns: ["access_grant_id"]
            isOneToOne: false
            referencedRelation: "access_grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "money_refund_review_records_provider_event_id_fkey"
            columns: ["provider_event_id"]
            isOneToOne: false
            referencedRelation: "provider_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "money_refund_review_records_purchase_intent_id_fkey"
            columns: ["purchase_intent_id"]
            isOneToOne: false
            referencedRelation: "money_purchase_intents"
            referencedColumns: ["id"]
          },
        ]
      }
      money_required_review_flags: {
        Row: {
          created_at: string
          created_by: string
          environment_mode: string
          id: string
          metadata: Json
          money_moved: boolean
          platform: string
          review_reason: string
          severity: string
          status: string
          subject_id: string
          subject_type: string
          system_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          environment_mode?: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          platform?: string
          review_reason: string
          severity?: string
          status?: string
          subject_id: string
          subject_type: string
          system_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          environment_mode?: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          platform?: string
          review_reason?: string
          severity?: string
          status?: string
          subject_id?: string
          subject_type?: string
          system_id?: string
          updated_at?: string
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
      notification_delivery_health_snapshots: {
        Row: {
          app_version: string | null
          bundle_identifier: string | null
          channel: string | null
          created_at: string
          data_source: string | null
          distribution_source: string | null
          environment_mode: string
          failed_attempt_count: number
          health_state: string
          id: string
          invalid_token_count: number
          metadata: Json
          money_moved: boolean
          native_build: string | null
          platform: string
          provider: string | null
          provider_environment: string | null
          provider_response_class: string | null
          readback_complete: boolean
          retry_backlog: number
          runtime_version: string | null
          system_id: string
          update_id: string | null
          user_rights_changed: boolean
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          app_version?: string | null
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          distribution_source?: string | null
          environment_mode?: string
          failed_attempt_count?: number
          health_state: string
          id?: string
          invalid_token_count?: number
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          platform?: string
          provider?: string | null
          provider_environment?: string | null
          provider_response_class?: string | null
          readback_complete?: boolean
          retry_backlog?: number
          runtime_version?: string | null
          system_id?: string
          update_id?: string | null
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          app_version?: string | null
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          distribution_source?: string | null
          environment_mode?: string
          failed_attempt_count?: number
          health_state?: string
          id?: string
          invalid_token_count?: number
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          platform?: string
          provider?: string | null
          provider_environment?: string | null
          provider_response_class?: string | null
          readback_complete?: boolean
          retry_backlog?: number
          runtime_version?: string | null
          system_id?: string
          update_id?: string | null
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Relationships: []
      }
      notification_duplicate_dedupe_records: {
        Row: {
          created_at: string
          dedupe_key: string
          duplicate_count: number
          environment_mode: string
          id: string
          metadata: Json
          money_moved: boolean
          system_id: string
          user_rights_changed: boolean
        }
        Insert: {
          created_at?: string
          dedupe_key: string
          duplicate_count?: number
          environment_mode?: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          system_id?: string
          user_rights_changed?: boolean
        }
        Update: {
          created_at?: string
          dedupe_key?: string
          duplicate_count?: number
          environment_mode?: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          system_id?: string
          user_rights_changed?: boolean
        }
        Relationships: []
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
      notification_operator_events: {
        Row: {
          action_id: string
          actor_id: string | null
          actor_type: string
          created_at: string
          environment_mode: string
          id: string
          metadata: Json
          money_moved: boolean
          platform: string
          result: string
          system_id: string
          user_rights_changed: boolean
        }
        Insert: {
          action_id: string
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          environment_mode?: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          platform?: string
          result: string
          system_id?: string
          user_rights_changed?: boolean
        }
        Update: {
          action_id?: string
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          environment_mode?: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          platform?: string
          result?: string
          system_id?: string
          user_rights_changed?: boolean
        }
        Relationships: []
      }
      notification_operator_learning_state: {
        Row: {
          confidence: number
          first_seen_at: string
          id: string
          incident_key: string
          last_recommended_action: string | null
          last_seen_at: string
          metadata: Json
          money_moved: boolean
          occurrence_count: number
          system_id: string
          user_rights_changed: boolean
        }
        Insert: {
          confidence?: number
          first_seen_at?: string
          id?: string
          incident_key: string
          last_recommended_action?: string | null
          last_seen_at?: string
          metadata?: Json
          money_moved?: boolean
          occurrence_count?: number
          system_id?: string
          user_rights_changed?: boolean
        }
        Update: {
          confidence?: number
          first_seen_at?: string
          id?: string
          incident_key?: string
          last_recommended_action?: string | null
          last_seen_at?: string
          metadata?: Json
          money_moved?: boolean
          occurrence_count?: number
          system_id?: string
          user_rights_changed?: boolean
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          chilly_chat_call_custom_in_app_sound_uri: string | null
          chilly_chat_call_sound_key: string
          chilly_chat_call_vibrate_enabled: boolean
          chilly_chat_calls_enabled: boolean
          circle_friend_live_enabled: boolean
          created_at: string
          creator_money_purchases_enabled: boolean
          creator_money_sales_enabled: boolean
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
          chilly_chat_call_custom_in_app_sound_uri?: string | null
          chilly_chat_call_sound_key?: string
          chilly_chat_call_vibrate_enabled?: boolean
          chilly_chat_calls_enabled?: boolean
          circle_friend_live_enabled?: boolean
          created_at?: string
          creator_money_purchases_enabled?: boolean
          creator_money_sales_enabled?: boolean
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
          chilly_chat_call_custom_in_app_sound_uri?: string | null
          chilly_chat_call_sound_key?: string
          chilly_chat_call_vibrate_enabled?: boolean
          chilly_chat_calls_enabled?: boolean
          circle_friend_live_enabled?: boolean
          created_at?: string
          creator_money_purchases_enabled?: boolean
          creator_money_sales_enabled?: boolean
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
      notification_provider_sync_status: {
        Row: {
          capability: string
          created_at: string
          environment_mode: string
          id: string
          last_checked_at: string
          metadata: Json
          money_moved: boolean
          platform: string
          provider: string
          sync_status: string
          system_id: string
          user_rights_changed: boolean
        }
        Insert: {
          capability: string
          created_at?: string
          environment_mode?: string
          id?: string
          last_checked_at?: string
          metadata?: Json
          money_moved?: boolean
          platform?: string
          provider: string
          sync_status: string
          system_id?: string
          user_rights_changed?: boolean
        }
        Update: {
          capability?: string
          created_at?: string
          environment_mode?: string
          id?: string
          last_checked_at?: string
          metadata?: Json
          money_moved?: boolean
          platform?: string
          provider?: string
          sync_status?: string
          system_id?: string
          user_rights_changed?: boolean
        }
        Relationships: []
      }
      notification_required_review_flags: {
        Row: {
          created_at: string
          environment_mode: string
          flag_type: string
          id: string
          metadata: Json
          money_moved: boolean
          platform: string
          review_status: string
          severity: string
          system_id: string
          target_id: string | null
          target_type: string | null
          updated_at: string
          user_rights_changed: boolean
        }
        Insert: {
          created_at?: string
          environment_mode?: string
          flag_type: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          platform?: string
          review_status?: string
          severity?: string
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          updated_at?: string
          user_rights_changed?: boolean
        }
        Update: {
          created_at?: string
          environment_mode?: string
          flag_type?: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          platform?: string
          review_status?: string
          severity?: string
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          updated_at?: string
          user_rights_changed?: boolean
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
      observability_operator_events: {
        Row: {
          action_id: string
          actor_id: string | null
          actor_type: string
          channel: string | null
          created_at: string
          environment_mode: string
          id: string
          metadata: Json
          money_moved: boolean
          pii_stored: boolean
          platform: string
          release_action_executed: boolean
          result: string
          runtime_version: string | null
          secrets_logged: boolean
          system_id: string
          update_id: string | null
          user_rights_changed: boolean
        }
        Insert: {
          action_id: string
          actor_id?: string | null
          actor_type?: string
          channel?: string | null
          created_at?: string
          environment_mode?: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          pii_stored?: boolean
          platform?: string
          release_action_executed?: boolean
          result: string
          runtime_version?: string | null
          secrets_logged?: boolean
          system_id?: string
          update_id?: string | null
          user_rights_changed?: boolean
        }
        Update: {
          action_id?: string
          actor_id?: string | null
          actor_type?: string
          channel?: string | null
          created_at?: string
          environment_mode?: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          pii_stored?: boolean
          platform?: string
          release_action_executed?: boolean
          result?: string
          runtime_version?: string | null
          secrets_logged?: boolean
          system_id?: string
          update_id?: string | null
          user_rights_changed?: boolean
        }
        Relationships: []
      }
      observability_operator_learning_state: {
        Row: {
          confidence: number
          first_seen_at: string
          id: string
          incident_key: string
          last_recommended_action: string | null
          last_seen_at: string
          metadata: Json
          money_moved: boolean
          occurrence_count: number
          pii_stored: boolean
          release_action_executed: boolean
          secrets_logged: boolean
          system_id: string
          user_rights_changed: boolean
        }
        Insert: {
          confidence?: number
          first_seen_at?: string
          id?: string
          incident_key: string
          last_recommended_action?: string | null
          last_seen_at?: string
          metadata?: Json
          money_moved?: boolean
          occurrence_count?: number
          pii_stored?: boolean
          release_action_executed?: boolean
          secrets_logged?: boolean
          system_id?: string
          user_rights_changed?: boolean
        }
        Update: {
          confidence?: number
          first_seen_at?: string
          id?: string
          incident_key?: string
          last_recommended_action?: string | null
          last_seen_at?: string
          metadata?: Json
          money_moved?: boolean
          occurrence_count?: number
          pii_stored?: boolean
          release_action_executed?: boolean
          secrets_logged?: boolean
          system_id?: string
          user_rights_changed?: boolean
        }
        Relationships: []
      }
      observability_required_review_flags: {
        Row: {
          app_version: string | null
          bundle_identifier: string | null
          channel: string | null
          created_at: string
          data_source: string | null
          distribution_source: string | null
          environment_mode: string
          flag_type: string
          id: string
          metadata: Json
          money_moved: boolean
          native_build: string | null
          pii_stored: boolean
          platform: string
          provider_environment: string | null
          readback_complete: boolean
          release_action_executed: boolean
          review_status: string
          runtime_version: string | null
          secrets_logged: boolean
          severity: string
          system_id: string
          target_id: string | null
          target_type: string | null
          update_id: string | null
          updated_at: string
          user_rights_changed: boolean
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          app_version?: string | null
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          distribution_source?: string | null
          environment_mode?: string
          flag_type: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          pii_stored?: boolean
          platform?: string
          provider_environment?: string | null
          readback_complete?: boolean
          release_action_executed?: boolean
          review_status?: string
          runtime_version?: string | null
          secrets_logged?: boolean
          severity?: string
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          update_id?: string | null
          updated_at?: string
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          app_version?: string | null
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          distribution_source?: string | null
          environment_mode?: string
          flag_type?: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          pii_stored?: boolean
          platform?: string
          provider_environment?: string | null
          readback_complete?: boolean
          release_action_executed?: boolean
          review_status?: string
          runtime_version?: string | null
          secrets_logged?: boolean
          severity?: string
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          update_id?: string | null
          updated_at?: string
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Relationships: []
      }
      official_rachi_original_videos: {
        Row: {
          created_at: string
          created_by_user_id: string | null
          official_account_id: string
          proof_scope: string | null
          source_attribution: string | null
          status: string
          updated_at: string
          video_id: string
        }
        Insert: {
          created_at?: string
          created_by_user_id?: string | null
          official_account_id?: string
          proof_scope?: string | null
          source_attribution?: string | null
          status?: string
          updated_at?: string
          video_id: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string | null
          official_account_id?: string
          proof_scope?: string | null
          source_attribution?: string | null
          status?: string
          updated_at?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "official_rachi_original_videos_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: true
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      ota_diagnostics_readback_records: {
        Row: {
          app_version: string | null
          bundle_identifier: string | null
          channel: string | null
          created_at: string
          data_source: string | null
          distribution_source: string | null
          embedded_launch: boolean | null
          emergency_launch: boolean | null
          environment_mode: string
          id: string
          metadata: Json
          money_moved: boolean
          native_build: string | null
          platform: string
          provider_environment: string | null
          readback_complete: boolean
          runtime_version: string | null
          system_id: string
          update_id: string | null
          user_rights_changed: boolean
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          app_version?: string | null
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          distribution_source?: string | null
          embedded_launch?: boolean | null
          emergency_launch?: boolean | null
          environment_mode?: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          platform?: string
          provider_environment?: string | null
          readback_complete?: boolean
          runtime_version?: string | null
          system_id?: string
          update_id?: string | null
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          app_version?: string | null
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          distribution_source?: string | null
          embedded_launch?: boolean | null
          emergency_launch?: boolean | null
          environment_mode?: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          platform?: string
          provider_environment?: string | null
          readback_complete?: boolean
          runtime_version?: string | null
          system_id?: string
          update_id?: string | null
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Relationships: []
      }
      owner_authority_integrity_findings: {
        Row: {
          created_at: string
          environment_mode: string
          finding_type: string
          id: string
          metadata: Json
          money_moved: boolean
          review_status: string
          severity: string
          system_id: string
          user_rights_changed: boolean
        }
        Insert: {
          created_at?: string
          environment_mode?: string
          finding_type: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          review_status?: string
          severity?: string
          system_id?: string
          user_rights_changed?: boolean
        }
        Update: {
          created_at?: string
          environment_mode?: string
          finding_type?: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          review_status?: string
          severity?: string
          system_id?: string
          user_rights_changed?: boolean
        }
        Relationships: []
      }
      owner_command_blockers: {
        Row: {
          blocker_code: string
          blocker_summary: string
          command_id: string
          created_at: string
          id: string
          metadata: Json
          next_action: string
          platform: string
          resolved_at: string | null
        }
        Insert: {
          blocker_code: string
          blocker_summary: string
          command_id: string
          created_at?: string
          id?: string
          metadata?: Json
          next_action: string
          platform?: string
          resolved_at?: string | null
        }
        Update: {
          blocker_code?: string
          blocker_summary?: string
          command_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          next_action?: string
          platform?: string
          resolved_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "owner_command_blockers_command_id_fkey"
            columns: ["command_id"]
            isOneToOne: false
            referencedRelation: "owner_command_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_command_events: {
        Row: {
          actor_id: string | null
          actor_type: string
          command_id: string
          created_at: string
          event_summary: string
          event_type: string
          id: string
          metadata: Json
          platform: string
          status: string
        }
        Insert: {
          actor_id?: string | null
          actor_type: string
          command_id: string
          created_at?: string
          event_summary: string
          event_type: string
          id?: string
          metadata?: Json
          platform?: string
          status: string
        }
        Update: {
          actor_id?: string | null
          actor_type?: string
          command_id?: string
          created_at?: string
          event_summary?: string
          event_type?: string
          id?: string
          metadata?: Json
          platform?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "owner_command_events_command_id_fkey"
            columns: ["command_id"]
            isOneToOne: false
            referencedRelation: "owner_command_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_command_execution_steps: {
        Row: {
          action_id: string
          allowed_scope: Json
          approval_level: number
          command_id: string
          created_at: string
          execution_status: string
          id: string
          metadata: Json
          platform: string
          preflight_status: string
          proof: Json
          result_summary: string | null
          status: string
          step_index: number
          target_system: string
          updated_at: string
        }
        Insert: {
          action_id: string
          allowed_scope?: Json
          approval_level: number
          command_id: string
          created_at?: string
          execution_status?: string
          id?: string
          metadata?: Json
          platform?: string
          preflight_status?: string
          proof?: Json
          result_summary?: string | null
          status?: string
          step_index: number
          target_system: string
          updated_at?: string
        }
        Update: {
          action_id?: string
          allowed_scope?: Json
          approval_level?: number
          command_id?: string
          created_at?: string
          execution_status?: string
          id?: string
          metadata?: Json
          platform?: string
          preflight_status?: string
          proof?: Json
          result_summary?: string | null
          status?: string
          step_index?: number
          target_system?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "owner_command_execution_steps_command_id_fkey"
            columns: ["command_id"]
            isOneToOne: false
            referencedRelation: "owner_command_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_command_requests: {
        Row: {
          allowed_scope: Json
          approval_level: number
          approval_request_id: string | null
          command_text: string
          created_at: string
          execution_plan: Json
          external_confirmation_required: boolean
          external_confirmation_status: string
          forbidden_scope: Json
          id: string
          metadata: Json
          normalized_intent: string
          owner_user_id: string | null
          platform: string
          preflight_plan: Json
          proof_plan: Json
          result_summary: string | null
          rollback_plan: Json
          status: string
          target_systems: string[]
          updated_at: string
          validation_plan: Json
        }
        Insert: {
          allowed_scope?: Json
          approval_level: number
          approval_request_id?: string | null
          command_text: string
          created_at?: string
          execution_plan?: Json
          external_confirmation_required?: boolean
          external_confirmation_status?: string
          forbidden_scope?: Json
          id?: string
          metadata?: Json
          normalized_intent: string
          owner_user_id?: string | null
          platform?: string
          preflight_plan?: Json
          proof_plan?: Json
          result_summary?: string | null
          rollback_plan?: Json
          status?: string
          target_systems?: string[]
          updated_at?: string
          validation_plan?: Json
        }
        Update: {
          allowed_scope?: Json
          approval_level?: number
          approval_request_id?: string | null
          command_text?: string
          created_at?: string
          execution_plan?: Json
          external_confirmation_required?: boolean
          external_confirmation_status?: string
          forbidden_scope?: Json
          id?: string
          metadata?: Json
          normalized_intent?: string
          owner_user_id?: string | null
          platform?: string
          preflight_plan?: Json
          proof_plan?: Json
          result_summary?: string | null
          rollback_plan?: Json
          status?: string
          target_systems?: string[]
          updated_at?: string
          validation_plan?: Json
        }
        Relationships: [
          {
            foreignKeyName: "owner_command_requests_approval_request_id_fkey"
            columns: ["approval_request_id"]
            isOneToOne: false
            referencedRelation: "autonomous_approval_requests"
            referencedColumns: ["id"]
          },
        ]
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
      paid_creator_event_passes: {
        Row: {
          access_grant_id: string | null
          buyer_id: string
          created_at: string
          creator_event_id: string
          creator_id: string
          event_id: string
          expires_at: string | null
          id: string
          metadata: Json
          provider: string
          provider_transaction_id: string | null
          refunded_at: string | null
          revoked_at: string | null
          source_transaction_id: string | null
          status: string
          used_at: string | null
        }
        Insert: {
          access_grant_id?: string | null
          buyer_id: string
          created_at?: string
          creator_event_id: string
          creator_id: string
          event_id: string
          expires_at?: string | null
          id?: string
          metadata?: Json
          provider?: string
          provider_transaction_id?: string | null
          refunded_at?: string | null
          revoked_at?: string | null
          source_transaction_id?: string | null
          status?: string
          used_at?: string | null
        }
        Update: {
          access_grant_id?: string | null
          buyer_id?: string
          created_at?: string
          creator_event_id?: string
          creator_id?: string
          event_id?: string
          expires_at?: string | null
          id?: string
          metadata?: Json
          provider?: string
          provider_transaction_id?: string | null
          refunded_at?: string | null
          revoked_at?: string | null
          source_transaction_id?: string | null
          status?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "paid_creator_event_passes_access_grant_id_fkey"
            columns: ["access_grant_id"]
            isOneToOne: false
            referencedRelation: "access_grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paid_creator_event_passes_creator_event_id_fkey"
            columns: ["creator_event_id"]
            isOneToOne: false
            referencedRelation: "creator_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paid_creator_event_passes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "paid_creator_events"
            referencedColumns: ["id"]
          },
        ]
      }
      paid_creator_events: {
        Row: {
          capacity_limit: number | null
          created_at: string
          creator_event_id: string
          creator_id: string
          currency: string
          description: string | null
          ends_at: string | null
          event_type: string
          id: string
          metadata: Json
          passes_sold: number
          price_cents: number
          provider: string
          provider_product_id: string | null
          provider_product_key: string | null
          starts_at: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          capacity_limit?: number | null
          created_at?: string
          creator_event_id: string
          creator_id: string
          currency?: string
          description?: string | null
          ends_at?: string | null
          event_type: string
          id?: string
          metadata?: Json
          passes_sold?: number
          price_cents?: number
          provider?: string
          provider_product_id?: string | null
          provider_product_key?: string | null
          starts_at?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          capacity_limit?: number | null
          created_at?: string
          creator_event_id?: string
          creator_id?: string
          currency?: string
          description?: string | null
          ends_at?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          passes_sold?: number
          price_cents?: number
          provider?: string
          provider_product_id?: string | null
          provider_product_key?: string | null
          starts_at?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "paid_creator_events_creator_event_id_fkey"
            columns: ["creator_event_id"]
            isOneToOne: false
            referencedRelation: "creator_events"
            referencedColumns: ["id"]
          },
        ]
      }
      paid_event_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_id: string | null
          event_type: string
          id: string
          metadata: Json
          pass_id: string | null
          transaction_id: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_id?: string | null
          event_type: string
          id?: string
          metadata?: Json
          pass_id?: string | null
          transaction_id?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_id?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          pass_id?: string | null
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "paid_event_events_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "paid_creator_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paid_event_events_pass_id_fkey"
            columns: ["pass_id"]
            isOneToOne: false
            referencedRelation: "paid_creator_event_passes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paid_event_events_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "creator_event_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      paid_watch_party_offers: {
        Row: {
          created_at: string
          creator_id: string
          currency: string
          description: string | null
          ends_at: string | null
          host_id: string
          id: string
          metadata: Json
          party_id: string | null
          price_cents: number
          provider: string
          provider_product_id: string | null
          provider_product_key: string | null
          seat_limit: number | null
          seats_sold: number
          starts_at: string | null
          status: string
          title: string
          title_id: string | null
          updated_at: string
          video_id: string | null
        }
        Insert: {
          created_at?: string
          creator_id: string
          currency?: string
          description?: string | null
          ends_at?: string | null
          host_id: string
          id?: string
          metadata?: Json
          party_id?: string | null
          price_cents?: number
          provider?: string
          provider_product_id?: string | null
          provider_product_key?: string | null
          seat_limit?: number | null
          seats_sold?: number
          starts_at?: string | null
          status?: string
          title?: string
          title_id?: string | null
          updated_at?: string
          video_id?: string | null
        }
        Update: {
          created_at?: string
          creator_id?: string
          currency?: string
          description?: string | null
          ends_at?: string | null
          host_id?: string
          id?: string
          metadata?: Json
          party_id?: string | null
          price_cents?: number
          provider?: string
          provider_product_id?: string | null
          provider_product_key?: string | null
          seat_limit?: number | null
          seats_sold?: number
          starts_at?: string | null
          status?: string
          title?: string
          title_id?: string | null
          updated_at?: string
          video_id?: string | null
        }
        Relationships: []
      }
      paid_watch_party_tickets: {
        Row: {
          access_grant_id: string | null
          buyer_id: string
          created_at: string
          creator_id: string
          expires_at: string | null
          host_id: string
          id: string
          metadata: Json
          offer_id: string
          party_id: string | null
          provider: string
          provider_transaction_id: string | null
          refunded_at: string | null
          revoked_at: string | null
          source_transaction_id: string | null
          status: string
          used_at: string | null
        }
        Insert: {
          access_grant_id?: string | null
          buyer_id: string
          created_at?: string
          creator_id: string
          expires_at?: string | null
          host_id: string
          id?: string
          metadata?: Json
          offer_id: string
          party_id?: string | null
          provider?: string
          provider_transaction_id?: string | null
          refunded_at?: string | null
          revoked_at?: string | null
          source_transaction_id?: string | null
          status?: string
          used_at?: string | null
        }
        Update: {
          access_grant_id?: string | null
          buyer_id?: string
          created_at?: string
          creator_id?: string
          expires_at?: string | null
          host_id?: string
          id?: string
          metadata?: Json
          offer_id?: string
          party_id?: string | null
          provider?: string
          provider_transaction_id?: string | null
          refunded_at?: string | null
          revoked_at?: string | null
          source_transaction_id?: string | null
          status?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "paid_watch_party_tickets_access_grant_id_fkey"
            columns: ["access_grant_id"]
            isOneToOne: false
            referencedRelation: "access_grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paid_watch_party_tickets_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "paid_watch_party_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_regression_findings: {
        Row: {
          app_version: string | null
          bundle_identifier: string | null
          channel: string | null
          created_at: string
          data_source: string | null
          distribution_source: string | null
          environment_mode: string
          flag_type: string
          id: string
          metadata: Json
          metric_name: string | null
          metric_value: number | null
          money_moved: boolean
          native_build: string | null
          pii_stored: boolean
          platform: string
          provider_environment: string | null
          readback_complete: boolean
          release_action_executed: boolean
          review_status: string
          runtime_version: string | null
          secrets_logged: boolean
          severity: string
          system_id: string
          target_id: string | null
          target_type: string | null
          update_id: string | null
          updated_at: string
          user_rights_changed: boolean
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          app_version?: string | null
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          distribution_source?: string | null
          environment_mode?: string
          flag_type: string
          id?: string
          metadata?: Json
          metric_name?: string | null
          metric_value?: number | null
          money_moved?: boolean
          native_build?: string | null
          pii_stored?: boolean
          platform?: string
          provider_environment?: string | null
          readback_complete?: boolean
          release_action_executed?: boolean
          review_status?: string
          runtime_version?: string | null
          secrets_logged?: boolean
          severity?: string
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          update_id?: string | null
          updated_at?: string
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          app_version?: string | null
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          distribution_source?: string | null
          environment_mode?: string
          flag_type?: string
          id?: string
          metadata?: Json
          metric_name?: string | null
          metric_value?: number | null
          money_moved?: boolean
          native_build?: string | null
          pii_stored?: boolean
          platform?: string
          provider_environment?: string | null
          readback_complete?: boolean
          release_action_executed?: boolean
          review_status?: string
          runtime_version?: string | null
          secrets_logged?: boolean
          severity?: string
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          update_id?: string | null
          updated_at?: string
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Relationships: []
      }
      pii_exposure_findings: {
        Row: {
          created_at: string
          environment_mode: string
          fake_proof: boolean
          flag_type: string
          health_state: string
          high_risk_executed: boolean
          id: string
          metadata: Json
          money_moved: boolean
          platform: string
          severity: string
          system_id: string
          target_id: string | null
          target_type: string | null
          user_rights_changed: boolean
        }
        Insert: {
          created_at?: string
          environment_mode?: string
          fake_proof?: boolean
          flag_type?: string
          health_state?: string
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          platform?: string
          severity?: string
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          user_rights_changed?: boolean
        }
        Update: {
          created_at?: string
          environment_mode?: string
          fake_proof?: boolean
          flag_type?: string
          health_state?: string
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          platform?: string
          severity?: string
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          user_rights_changed?: boolean
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
          quarantined_at: string | null
          scan_error: string | null
          scan_provider: string | null
          scan_result: string | null
          scan_status: string
          scanned_at: string | null
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
          quarantined_at?: string | null
          scan_error?: string | null
          scan_provider?: string | null
          scan_result?: string | null
          scan_status?: string
          scanned_at?: string | null
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
          quarantined_at?: string | null
          scan_error?: string | null
          scan_provider?: string | null
          scan_result?: string | null
          scan_status?: string
          scanned_at?: string | null
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
      platform_first_owner_authority: {
        Row: {
          established_at: string
          established_by: string
          established_reason: string
          id: string
          is_active: boolean
          metadata: Json
          owner_email: string | null
          owner_membership_id: number
          owner_user_id: string | null
          retired_at: string | null
          retired_by: string | null
          retired_reason: string | null
        }
        Insert: {
          established_at?: string
          established_by?: string
          established_reason: string
          id?: string
          is_active?: boolean
          metadata?: Json
          owner_email?: string | null
          owner_membership_id: number
          owner_user_id?: string | null
          retired_at?: string | null
          retired_by?: string | null
          retired_reason?: string | null
        }
        Update: {
          established_at?: string
          established_by?: string
          established_reason?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          owner_email?: string | null
          owner_membership_id?: number
          owner_user_id?: string | null
          retired_at?: string | null
          retired_by?: string | null
          retired_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_first_owner_authority_owner_membership_id_fkey"
            columns: ["owner_membership_id"]
            isOneToOne: false
            referencedRelation: "platform_role_memberships"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_first_owner_authority_audit: {
        Row: {
          action: string
          actor_email: string | null
          actor_role: string
          actor_user_id: string | null
          created_at: string
          id: string
          metadata: Json
          reason: string | null
          result: string
          target_email: string | null
          target_membership_id: number | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_role?: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          reason?: string | null
          result: string
          target_email?: string | null
          target_membership_id?: number | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_role?: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          reason?: string | null
          result?: string
          target_email?: string | null
          target_membership_id?: number | null
          target_user_id?: string | null
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
      platform_money_kill_switch_audit: {
        Row: {
          actor_user_id: string | null
          created_at: string
          id: string
          metadata: Json
          new_state: string
          old_state: string | null
          reason: string
          security_context_id: string | null
          switch_key: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          new_state: string
          old_state?: string | null
          reason: string
          security_context_id?: string | null
          switch_key: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          new_state?: string
          old_state?: string | null
          reason?: string
          security_context_id?: string | null
          switch_key?: string
        }
        Relationships: []
      }
      platform_money_kill_switches: {
        Row: {
          created_at: string
          description: string | null
          display_label: string
          id: string
          key: string
          owner_only_reason: string | null
          reason: string | null
          state: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_label: string
          id?: string
          key: string
          owner_only_reason?: string | null
          reason?: string | null
          state: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          display_label?: string
          id?: string
          key?: string
          owner_only_reason?: string | null
          reason?: string | null
          state?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      platform_owner_succession_challenges: {
        Row: {
          action: string
          actor_email: string | null
          actor_user_id: string
          attempt_count: number
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          last_attempt_at: string | null
          max_attempts: number
          metadata: Json
          passcode_hash: string
          passcode_salt: string
          reason: string
          status: string
          successor_email: string | null
          successor_owner_membership_id: number
          successor_user_id: string | null
          target_owner_membership_id: number
          typed_confirmation_required: string
        }
        Insert: {
          action?: string
          actor_email?: string | null
          actor_user_id: string
          attempt_count?: number
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          last_attempt_at?: string | null
          max_attempts?: number
          metadata?: Json
          passcode_hash: string
          passcode_salt: string
          reason: string
          status?: string
          successor_email?: string | null
          successor_owner_membership_id: number
          successor_user_id?: string | null
          target_owner_membership_id: number
          typed_confirmation_required?: string
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_user_id?: string
          attempt_count?: number
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          last_attempt_at?: string | null
          max_attempts?: number
          metadata?: Json
          passcode_hash?: string
          passcode_salt?: string
          reason?: string
          status?: string
          successor_email?: string | null
          successor_owner_membership_id?: number
          successor_user_id?: string | null
          target_owner_membership_id?: number
          typed_confirmation_required?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_owner_succession_cha_successor_owner_membership_i_fkey"
            columns: ["successor_owner_membership_id"]
            isOneToOne: false
            referencedRelation: "platform_role_memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_owner_succession_chall_target_owner_membership_id_fkey"
            columns: ["target_owner_membership_id"]
            isOneToOne: false
            referencedRelation: "platform_role_memberships"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_recovery_operator_events: {
        Row: {
          action_id: string
          actor_id: string | null
          actor_type: string
          created_at: string
          environment_mode: string
          fake_proof: boolean
          high_risk_executed: boolean
          id: string
          metadata: Json
          money_moved: boolean
          platform: string
          result: string
          system_id: string
          user_rights_changed: boolean
        }
        Insert: {
          action_id: string
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          environment_mode?: string
          fake_proof?: boolean
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          platform?: string
          result: string
          system_id?: string
          user_rights_changed?: boolean
        }
        Update: {
          action_id?: string
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          environment_mode?: string
          fake_proof?: boolean
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          platform?: string
          result?: string
          system_id?: string
          user_rights_changed?: boolean
        }
        Relationships: []
      }
      platform_role_memberships: {
        Row: {
          email: string | null
          expires_at: string | null
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
          expires_at?: string | null
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
          expires_at?: string | null
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
      privacy_deletion_plans: {
        Row: {
          created_at: string
          environment_mode: string
          fake_proof: boolean
          flag_type: string
          health_state: string
          high_risk_executed: boolean
          id: string
          metadata: Json
          money_moved: boolean
          severity: string
          system_id: string
          target_id: string | null
          target_type: string | null
          user_rights_changed: boolean
        }
        Insert: {
          created_at?: string
          environment_mode?: string
          fake_proof?: boolean
          flag_type?: string
          health_state?: string
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          severity?: string
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          user_rights_changed?: boolean
        }
        Update: {
          created_at?: string
          environment_mode?: string
          fake_proof?: boolean
          flag_type?: string
          health_state?: string
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          severity?: string
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          user_rights_changed?: boolean
        }
        Relationships: []
      }
      privacy_export_plans: {
        Row: {
          created_at: string
          environment_mode: string
          fake_proof: boolean
          flag_type: string
          health_state: string
          high_risk_executed: boolean
          id: string
          metadata: Json
          money_moved: boolean
          severity: string
          system_id: string
          target_id: string | null
          target_type: string | null
          user_rights_changed: boolean
        }
        Insert: {
          created_at?: string
          environment_mode?: string
          fake_proof?: boolean
          flag_type?: string
          health_state?: string
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          severity?: string
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          user_rights_changed?: boolean
        }
        Update: {
          created_at?: string
          environment_mode?: string
          fake_proof?: boolean
          flag_type?: string
          health_state?: string
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          severity?: string
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          user_rights_changed?: boolean
        }
        Relationships: []
      }
      privacy_operator_events: {
        Row: {
          action_id: string
          actor_id: string | null
          actor_type: string
          created_at: string
          environment_mode: string
          fake_proof: boolean
          high_risk_executed: boolean
          id: string
          metadata: Json
          money_moved: boolean
          platform: string
          result: string
          system_id: string
          user_rights_changed: boolean
        }
        Insert: {
          action_id: string
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          environment_mode?: string
          fake_proof?: boolean
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          platform?: string
          result: string
          system_id?: string
          user_rights_changed?: boolean
        }
        Update: {
          action_id?: string
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          environment_mode?: string
          fake_proof?: boolean
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          platform?: string
          result?: string
          system_id?: string
          user_rights_changed?: boolean
        }
        Relationships: []
      }
      privacy_operator_learning_state: {
        Row: {
          confidence: number
          fake_proof: boolean
          finding_key: string
          first_seen_at: string
          high_risk_executed: boolean
          id: string
          last_result: string
          last_seen_at: string
          metadata: Json
          money_moved: boolean
          occurrence_count: number
          system_id: string
          user_rights_changed: boolean
        }
        Insert: {
          confidence?: number
          fake_proof?: boolean
          finding_key: string
          first_seen_at?: string
          high_risk_executed?: boolean
          id?: string
          last_result?: string
          last_seen_at?: string
          metadata?: Json
          money_moved?: boolean
          occurrence_count?: number
          system_id?: string
          user_rights_changed?: boolean
        }
        Update: {
          confidence?: number
          fake_proof?: boolean
          finding_key?: string
          first_seen_at?: string
          high_risk_executed?: boolean
          id?: string
          last_result?: string
          last_seen_at?: string
          metadata?: Json
          money_moved?: boolean
          occurrence_count?: number
          system_id?: string
          user_rights_changed?: boolean
        }
        Relationships: []
      }
      privacy_request_findings: {
        Row: {
          app_version: string | null
          bundle_identifier: string | null
          channel: string | null
          created_at: string
          data_source: string | null
          distribution_source: string | null
          environment_mode: string
          fake_proof: boolean
          flag_type: string
          health_state: string
          high_risk_executed: boolean
          id: string
          metadata: Json
          money_moved: boolean
          native_build: string | null
          platform: string
          provider_environment: string | null
          readback_complete: boolean
          runtime_version: string | null
          severity: string
          system_id: string
          target_id: string | null
          target_type: string | null
          update_id: string | null
          user_rights_changed: boolean
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          app_version?: string | null
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          distribution_source?: string | null
          environment_mode?: string
          fake_proof?: boolean
          flag_type?: string
          health_state?: string
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          platform?: string
          provider_environment?: string | null
          readback_complete?: boolean
          runtime_version?: string | null
          severity?: string
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          update_id?: string | null
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          app_version?: string | null
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          distribution_source?: string | null
          environment_mode?: string
          fake_proof?: boolean
          flag_type?: string
          health_state?: string
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          platform?: string
          provider_environment?: string | null
          readback_complete?: boolean
          runtime_version?: string | null
          severity?: string
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          update_id?: string | null
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Relationships: []
      }
      privacy_required_review_flags: {
        Row: {
          app_version: string | null
          bundle_identifier: string | null
          channel: string | null
          created_at: string
          data_source: string | null
          distribution_source: string | null
          environment_mode: string
          fake_proof: boolean
          flag_type: string
          health_state: string
          high_risk_executed: boolean
          id: string
          metadata: Json
          money_moved: boolean
          native_build: string | null
          platform: string
          provider_environment: string | null
          readback_complete: boolean
          runtime_version: string | null
          severity: string
          system_id: string
          target_id: string | null
          target_type: string | null
          update_id: string | null
          user_rights_changed: boolean
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          app_version?: string | null
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          distribution_source?: string | null
          environment_mode?: string
          fake_proof?: boolean
          flag_type?: string
          health_state?: string
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          platform?: string
          provider_environment?: string | null
          readback_complete?: boolean
          runtime_version?: string | null
          severity?: string
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          update_id?: string | null
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          app_version?: string | null
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          distribution_source?: string | null
          environment_mode?: string
          fake_proof?: boolean
          flag_type?: string
          health_state?: string
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          platform?: string
          provider_environment?: string | null
          readback_complete?: boolean
          runtime_version?: string | null
          severity?: string
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          update_id?: string | null
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
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
      provider_access_audit_events: {
        Row: {
          access_mode: string
          approval_request_id: string | null
          capability: string
          created_at: string
          environment_mode: string
          event_type: string
          id: string
          metadata: Json
          money_moved: boolean
          provider: string
          provider_dashboard_mutated: boolean
          result: string
          system_id: string
        }
        Insert: {
          access_mode?: string
          approval_request_id?: string | null
          capability: string
          created_at?: string
          environment_mode?: string
          event_type: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          provider: string
          provider_dashboard_mutated?: boolean
          result?: string
          system_id?: string
        }
        Update: {
          access_mode?: string
          approval_request_id?: string | null
          capability?: string
          created_at?: string
          environment_mode?: string
          event_type?: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          provider?: string
          provider_dashboard_mutated?: boolean
          result?: string
          system_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_access_audit_events_approval_request_id_fkey"
            columns: ["approval_request_id"]
            isOneToOne: false
            referencedRelation: "autonomous_approval_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_access_capabilities: {
        Row: {
          access_mode: string
          approval_request_id: string | null
          available: boolean
          capability: string
          created_at: string
          forbidden_scope: Json
          id: string
          last_checked_at: string
          metadata: Json
          provider: string
          required_secret_names: string[]
          requires_owner_approval: boolean
          status: string
          system_id: string
          updated_at: string
        }
        Insert: {
          access_mode?: string
          approval_request_id?: string | null
          available?: boolean
          capability: string
          created_at?: string
          forbidden_scope?: Json
          id?: string
          last_checked_at?: string
          metadata?: Json
          provider: string
          required_secret_names?: string[]
          requires_owner_approval?: boolean
          status?: string
          system_id?: string
          updated_at?: string
        }
        Update: {
          access_mode?: string
          approval_request_id?: string | null
          available?: boolean
          capability?: string
          created_at?: string
          forbidden_scope?: Json
          id?: string
          last_checked_at?: string
          metadata?: Json
          provider?: string
          required_secret_names?: string[]
          requires_owner_approval?: boolean
          status?: string
          system_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_access_capabilities_approval_request_id_fkey"
            columns: ["approval_request_id"]
            isOneToOne: false
            referencedRelation: "autonomous_approval_requests"
            referencedColumns: ["id"]
          },
        ]
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
      provider_dashboard_repair_requests: {
        Row: {
          approval_level: number
          approval_request_id: string | null
          capability: string
          created_at: string
          id: string
          metadata: Json
          money_moved: boolean
          old_value_redacted: string | null
          platform: string
          proof_plan: string
          proposed_value_redacted: string | null
          provider: string
          provider_dashboard_mutated: boolean
          repair_status: string
          risk_summary: string
          rollback_plan: string
          system_id: string
          updated_at: string
        }
        Insert: {
          approval_level?: number
          approval_request_id?: string | null
          capability: string
          created_at?: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          old_value_redacted?: string | null
          platform?: string
          proof_plan: string
          proposed_value_redacted?: string | null
          provider: string
          provider_dashboard_mutated?: boolean
          repair_status?: string
          risk_summary: string
          rollback_plan: string
          system_id?: string
          updated_at?: string
        }
        Update: {
          approval_level?: number
          approval_request_id?: string | null
          capability?: string
          created_at?: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          old_value_redacted?: string | null
          platform?: string
          proof_plan?: string
          proposed_value_redacted?: string | null
          provider?: string
          provider_dashboard_mutated?: boolean
          repair_status?: string
          risk_summary?: string
          rollback_plan?: string
          system_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_dashboard_repair_requests_approval_request_id_fkey"
            columns: ["approval_request_id"]
            isOneToOne: false
            referencedRelation: "autonomous_approval_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_events: {
        Row: {
          app_user_id: string | null
          created_at: string
          environment: string
          event_type: string
          id: string
          idempotency_key: string
          metadata: Json
          occurred_at: string
          product_id: string | null
          product_key: string | null
          provider: string
          provider_event_id: string
          raw_payload_hash: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          app_user_id?: string | null
          created_at?: string
          environment?: string
          event_type: string
          id?: string
          idempotency_key: string
          metadata?: Json
          occurred_at?: string
          product_id?: string | null
          product_key?: string | null
          provider: string
          provider_event_id: string
          raw_payload_hash?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          app_user_id?: string | null
          created_at?: string
          environment?: string
          event_type?: string
          id?: string
          idempotency_key?: string
          metadata?: Json
          occurred_at?: string
          product_id?: string | null
          product_key?: string | null
          provider?: string
          provider_event_id?: string
          raw_payload_hash?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_events_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "monetization_products"
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
      qa_operator_learning_state: {
        Row: {
          confidence: number
          fake_proof: boolean
          finding_key: string
          first_seen_at: string
          high_risk_executed: boolean
          id: string
          last_blocker_classification: string
          last_recommended_action: string | null
          last_result: string
          last_seen_at: string
          metadata: Json
          money_moved: boolean
          occurrence_count: number
          private_evidence_stored: boolean
          secrets_logged: boolean
          system_id: string
          user_rights_changed: boolean
        }
        Insert: {
          confidence?: number
          fake_proof?: boolean
          finding_key: string
          first_seen_at?: string
          high_risk_executed?: boolean
          id?: string
          last_blocker_classification: string
          last_recommended_action?: string | null
          last_result: string
          last_seen_at?: string
          metadata?: Json
          money_moved?: boolean
          occurrence_count?: number
          private_evidence_stored?: boolean
          secrets_logged?: boolean
          system_id?: string
          user_rights_changed?: boolean
        }
        Update: {
          confidence?: number
          fake_proof?: boolean
          finding_key?: string
          first_seen_at?: string
          high_risk_executed?: boolean
          id?: string
          last_blocker_classification?: string
          last_recommended_action?: string | null
          last_result?: string
          last_seen_at?: string
          metadata?: Json
          money_moved?: boolean
          occurrence_count?: number
          private_evidence_stored?: boolean
          secrets_logged?: boolean
          system_id?: string
          user_rights_changed?: boolean
        }
        Relationships: []
      }
      qa_required_review_flags: {
        Row: {
          account_role: string | null
          app_version: string | null
          blocker_classification: string
          bundle_identifier: string | null
          channel: string | null
          created_at: string
          data_source: string | null
          discovered_by: string
          distribution_source: string | null
          fake_proof: boolean
          flag_type: string
          high_risk_executed: boolean
          id: string
          metadata: Json
          money_moved: boolean
          native_build: string | null
          next_safe_action: string
          owner_command_request_id: string | null
          platform: string
          private_evidence_stored: boolean
          provider_environment: string | null
          readback_complete: boolean
          result: string
          review_status: string
          runtime_version: string | null
          secrets_logged: boolean
          severity: string
          source: string
          system_id: string
          target_id: string | null
          target_type: string | null
          update_id: string | null
          updated_at: string
          user_rights_changed: boolean
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          account_role?: string | null
          app_version?: string | null
          blocker_classification: string
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          discovered_by?: string
          distribution_source?: string | null
          fake_proof?: boolean
          flag_type: string
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          next_safe_action: string
          owner_command_request_id?: string | null
          platform?: string
          private_evidence_stored?: boolean
          provider_environment?: string | null
          readback_complete?: boolean
          result?: string
          review_status?: string
          runtime_version?: string | null
          secrets_logged?: boolean
          severity?: string
          source: string
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          update_id?: string | null
          updated_at?: string
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          account_role?: string | null
          app_version?: string | null
          blocker_classification?: string
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          discovered_by?: string
          distribution_source?: string | null
          fake_proof?: boolean
          flag_type?: string
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          next_safe_action?: string
          owner_command_request_id?: string | null
          platform?: string
          private_evidence_stored?: boolean
          provider_environment?: string | null
          readback_complete?: boolean
          result?: string
          review_status?: string
          runtime_version?: string | null
          secrets_logged?: boolean
          severity?: string
          source?: string
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          update_id?: string | null
          updated_at?: string
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qa_required_review_flags_owner_command_request_id_fkey"
            columns: ["owner_command_request_id"]
            isOneToOne: false
            referencedRelation: "owner_command_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      ranking_integrity_findings: {
        Row: {
          created_at: string
          environment_mode: string
          fake_proof: boolean
          flag_type: string
          high_risk_executed: boolean
          id: string
          metadata: Json
          money_moved: boolean
          severity: string
          system_id: string
          target_id: string | null
          target_type: string | null
          user_rights_changed: boolean
        }
        Insert: {
          created_at?: string
          environment_mode?: string
          fake_proof?: boolean
          flag_type?: string
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          severity?: string
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          user_rights_changed?: boolean
        }
        Update: {
          created_at?: string
          environment_mode?: string
          fake_proof?: boolean
          flag_type?: string
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          severity?: string
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          user_rights_changed?: boolean
        }
        Relationships: []
      }
      recommendation_quality_findings: {
        Row: {
          created_at: string
          environment_mode: string
          fake_proof: boolean
          flag_type: string
          high_risk_executed: boolean
          id: string
          metadata: Json
          money_moved: boolean
          severity: string
          system_id: string
          target_id: string | null
          target_type: string | null
          user_rights_changed: boolean
        }
        Insert: {
          created_at?: string
          environment_mode?: string
          fake_proof?: boolean
          flag_type?: string
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          severity?: string
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          user_rights_changed?: boolean
        }
        Update: {
          created_at?: string
          environment_mode?: string
          fake_proof?: boolean
          flag_type?: string
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          severity?: string
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          user_rights_changed?: boolean
        }
        Relationships: []
      }
      recovery_operator_learning_state: {
        Row: {
          confidence: number
          fake_proof: boolean
          finding_key: string
          first_seen_at: string
          high_risk_executed: boolean
          id: string
          last_result: string
          last_seen_at: string
          metadata: Json
          money_moved: boolean
          occurrence_count: number
          system_id: string
          user_rights_changed: boolean
        }
        Insert: {
          confidence?: number
          fake_proof?: boolean
          finding_key: string
          first_seen_at?: string
          high_risk_executed?: boolean
          id?: string
          last_result?: string
          last_seen_at?: string
          metadata?: Json
          money_moved?: boolean
          occurrence_count?: number
          system_id?: string
          user_rights_changed?: boolean
        }
        Update: {
          confidence?: number
          fake_proof?: boolean
          finding_key?: string
          first_seen_at?: string
          high_risk_executed?: boolean
          id?: string
          last_result?: string
          last_seen_at?: string
          metadata?: Json
          money_moved?: boolean
          occurrence_count?: number
          system_id?: string
          user_rights_changed?: boolean
        }
        Relationships: []
      }
      recovery_required_review_flags: {
        Row: {
          app_version: string | null
          bundle_identifier: string | null
          channel: string | null
          created_at: string
          data_source: string | null
          distribution_source: string | null
          environment_mode: string
          fake_proof: boolean
          flag_type: string
          high_risk_executed: boolean
          id: string
          metadata: Json
          money_moved: boolean
          native_build: string | null
          platform: string
          provider_environment: string | null
          readback_complete: boolean
          runtime_version: string | null
          severity: string
          system_id: string
          target_id: string | null
          target_type: string | null
          update_id: string | null
          user_rights_changed: boolean
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          app_version?: string | null
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          distribution_source?: string | null
          environment_mode?: string
          fake_proof?: boolean
          flag_type?: string
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          platform?: string
          provider_environment?: string | null
          readback_complete?: boolean
          runtime_version?: string | null
          severity?: string
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          update_id?: string | null
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          app_version?: string | null
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          distribution_source?: string | null
          environment_mode?: string
          fake_proof?: boolean
          flag_type?: string
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          platform?: string
          provider_environment?: string | null
          readback_complete?: boolean
          runtime_version?: string | null
          severity?: string
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          update_id?: string | null
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Relationships: []
      }
      release_binary_attestations: {
        Row: {
          app_store_connect_build_id: string | null
          app_version: string
          attestation_status: string
          binary_sha256: string
          bundle_identifier: string
          channel: string | null
          created_at: string
          distribution_source: string
          id: string
          metadata: Json
          money_moved: boolean
          native_build: string
          platform: string
          play_build_identifier: string | null
          release_action_executed: boolean
          runtime_version: string | null
          signing_identity_summary: string | null
          source_commit: string
          submission_identifier_hash: string | null
          updated_at: string
          verification_source: string
          verified_at: string | null
        }
        Insert: {
          app_store_connect_build_id?: string | null
          app_version: string
          attestation_status?: string
          binary_sha256: string
          bundle_identifier: string
          channel?: string | null
          created_at?: string
          distribution_source: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          native_build: string
          platform: string
          play_build_identifier?: string | null
          release_action_executed?: boolean
          runtime_version?: string | null
          signing_identity_summary?: string | null
          source_commit: string
          submission_identifier_hash?: string | null
          updated_at?: string
          verification_source: string
          verified_at?: string | null
        }
        Update: {
          app_store_connect_build_id?: string | null
          app_version?: string
          attestation_status?: string
          binary_sha256?: string
          bundle_identifier?: string
          channel?: string | null
          created_at?: string
          distribution_source?: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          native_build?: string
          platform?: string
          play_build_identifier?: string | null
          release_action_executed?: boolean
          runtime_version?: string | null
          signing_identity_summary?: string | null
          source_commit?: string
          submission_identifier_hash?: string | null
          updated_at?: string
          verification_source?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      release_health_findings: {
        Row: {
          app_version: string | null
          bundle_identifier: string | null
          channel: string | null
          created_at: string
          data_source: string | null
          distribution_source: string | null
          embedded_launch: boolean | null
          emergency_launch: boolean | null
          environment_mode: string
          flag_type: string
          id: string
          metadata: Json
          money_moved: boolean
          native_build: string | null
          pii_stored: boolean
          platform: string
          provider_environment: string | null
          readback_complete: boolean
          release_action_executed: boolean
          review_status: string
          runtime_version: string | null
          secrets_logged: boolean
          severity: string
          system_id: string
          target_id: string | null
          target_type: string | null
          update_id: string | null
          updated_at: string
          user_rights_changed: boolean
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          app_version?: string | null
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          distribution_source?: string | null
          embedded_launch?: boolean | null
          emergency_launch?: boolean | null
          environment_mode?: string
          flag_type: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          pii_stored?: boolean
          platform?: string
          provider_environment?: string | null
          readback_complete?: boolean
          release_action_executed?: boolean
          review_status?: string
          runtime_version?: string | null
          secrets_logged?: boolean
          severity?: string
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          update_id?: string | null
          updated_at?: string
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          app_version?: string | null
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          distribution_source?: string | null
          embedded_launch?: boolean | null
          emergency_launch?: boolean | null
          environment_mode?: string
          flag_type?: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          pii_stored?: boolean
          platform?: string
          provider_environment?: string | null
          readback_complete?: boolean
          release_action_executed?: boolean
          review_status?: string
          runtime_version?: string | null
          secrets_logged?: boolean
          severity?: string
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          update_id?: string | null
          updated_at?: string
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Relationships: []
      }
      release_health_snapshots: {
        Row: {
          app_version: string | null
          bundle_identifier: string | null
          channel: string | null
          created_at: string
          data_source: string | null
          distribution_source: string | null
          embedded_launch: boolean | null
          emergency_launch: boolean | null
          environment_mode: string
          health_state: string
          id: string
          metadata: Json
          money_moved: boolean
          native_build: string | null
          platform: string
          provider_environment: string | null
          readback_complete: boolean
          runtime_version: string | null
          system_id: string
          update_id: string | null
          user_rights_changed: boolean
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          app_version?: string | null
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          distribution_source?: string | null
          embedded_launch?: boolean | null
          emergency_launch?: boolean | null
          environment_mode?: string
          health_state: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          platform?: string
          provider_environment?: string | null
          readback_complete?: boolean
          runtime_version?: string | null
          system_id?: string
          update_id?: string | null
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          app_version?: string | null
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          distribution_source?: string | null
          embedded_launch?: boolean | null
          emergency_launch?: boolean | null
          environment_mode?: string
          health_state?: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          platform?: string
          provider_environment?: string | null
          readback_complete?: boolean
          runtime_version?: string | null
          system_id?: string
          update_id?: string | null
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Relationships: []
      }
      release_operator_events: {
        Row: {
          action_id: string
          actor_id: string | null
          actor_type: string
          created_at: string
          environment_mode: string
          id: string
          metadata: Json
          money_moved: boolean
          platform: string
          result: string
          system_id: string
          user_rights_changed: boolean
        }
        Insert: {
          action_id: string
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          environment_mode?: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          platform?: string
          result: string
          system_id?: string
          user_rights_changed?: boolean
        }
        Update: {
          action_id?: string
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          environment_mode?: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          platform?: string
          result?: string
          system_id?: string
          user_rights_changed?: boolean
        }
        Relationships: []
      }
      release_operator_learning_state: {
        Row: {
          confidence: number
          first_seen_at: string
          id: string
          incident_key: string
          last_recommended_action: string | null
          last_seen_at: string
          metadata: Json
          money_moved: boolean
          occurrence_count: number
          system_id: string
          user_rights_changed: boolean
        }
        Insert: {
          confidence?: number
          first_seen_at?: string
          id?: string
          incident_key: string
          last_recommended_action?: string | null
          last_seen_at?: string
          metadata?: Json
          money_moved?: boolean
          occurrence_count?: number
          system_id?: string
          user_rights_changed?: boolean
        }
        Update: {
          confidence?: number
          first_seen_at?: string
          id?: string
          incident_key?: string
          last_recommended_action?: string | null
          last_seen_at?: string
          metadata?: Json
          money_moved?: boolean
          occurrence_count?: number
          system_id?: string
          user_rights_changed?: boolean
        }
        Relationships: []
      }
      release_required_review_flags: {
        Row: {
          created_at: string
          environment_mode: string
          flag_type: string
          id: string
          metadata: Json
          money_moved: boolean
          platform: string
          review_status: string
          severity: string
          system_id: string
          updated_at: string
          user_rights_changed: boolean
        }
        Insert: {
          created_at?: string
          environment_mode?: string
          flag_type: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          platform?: string
          review_status?: string
          severity?: string
          system_id?: string
          updated_at?: string
          user_rights_changed?: boolean
        }
        Update: {
          created_at?: string
          environment_mode?: string
          flag_type?: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          platform?: string
          review_status?: string
          severity?: string
          system_id?: string
          updated_at?: string
          user_rights_changed?: boolean
        }
        Relationships: []
      }
      restore_drill_findings: {
        Row: {
          created_at: string
          environment_mode: string
          fake_proof: boolean
          flag_type: string
          high_risk_executed: boolean
          id: string
          metadata: Json
          money_moved: boolean
          severity: string
          system_id: string
          target_id: string | null
          target_type: string | null
          user_rights_changed: boolean
        }
        Insert: {
          created_at?: string
          environment_mode?: string
          fake_proof?: boolean
          flag_type?: string
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          severity?: string
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          user_rights_changed?: boolean
        }
        Update: {
          created_at?: string
          environment_mode?: string
          fake_proof?: boolean
          flag_type?: string
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          severity?: string
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          user_rights_changed?: boolean
        }
        Relationships: []
      }
      retention_hold_findings: {
        Row: {
          created_at: string
          environment_mode: string
          fake_proof: boolean
          flag_type: string
          health_state: string
          high_risk_executed: boolean
          id: string
          metadata: Json
          money_moved: boolean
          severity: string
          system_id: string
          target_id: string | null
          target_type: string | null
          user_rights_changed: boolean
        }
        Insert: {
          created_at?: string
          environment_mode?: string
          fake_proof?: boolean
          flag_type?: string
          health_state?: string
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          severity?: string
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          user_rights_changed?: boolean
        }
        Update: {
          created_at?: string
          environment_mode?: string
          fake_proof?: boolean
          flag_type?: string
          health_state?: string
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          severity?: string
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          user_rights_changed?: boolean
        }
        Relationships: []
      }
      revenuecat_consumable_transaction_intents: {
        Row: {
          created_at: string
          original_transaction_id: string
          product_id: string
          provider: string
          provider_event_id: string
          purchase_intent_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          original_transaction_id: string
          product_id: string
          provider?: string
          provider_event_id: string
          purchase_intent_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          original_transaction_id?: string
          product_id?: string
          provider?: string
          provider_event_id?: string
          purchase_intent_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "revenuecat_consumable_transaction_inten_purchase_intent_id_fkey"
            columns: ["purchase_intent_id"]
            isOneToOne: false
            referencedRelation: "money_purchase_intents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenuecat_consumable_transaction_intent_provider_event_id_fkey"
            columns: ["provider_event_id"]
            isOneToOne: false
            referencedRelation: "provider_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenuecat_consumable_transaction_intents_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "monetization_products"
            referencedColumns: ["id"]
          },
        ]
      }
      role_behavior_findings: {
        Row: {
          account_role: string
          actual_behavior: string
          app_version: string | null
          blocker_classification: string
          bundle_identifier: string | null
          channel: string | null
          created_at: string
          data_source: string | null
          discovered_by: string
          distribution_source: string | null
          expected_behavior: string
          fake_proof: boolean
          finding_status: string
          high_risk_executed: boolean
          id: string
          metadata: Json
          money_moved: boolean
          native_build: string | null
          next_safe_action: string
          owner_command_request_id: string | null
          platform: string
          private_evidence_stored: boolean
          provider_environment: string | null
          readback_complete: boolean
          result: string
          route_path: string | null
          runtime_version: string | null
          secrets_logged: boolean
          source: string
          system_id: string
          update_id: string | null
          updated_at: string
          user_rights_changed: boolean
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          account_role: string
          actual_behavior: string
          app_version?: string | null
          blocker_classification: string
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          discovered_by?: string
          distribution_source?: string | null
          expected_behavior: string
          fake_proof?: boolean
          finding_status?: string
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          next_safe_action: string
          owner_command_request_id?: string | null
          platform?: string
          private_evidence_stored?: boolean
          provider_environment?: string | null
          readback_complete?: boolean
          result?: string
          route_path?: string | null
          runtime_version?: string | null
          secrets_logged?: boolean
          source: string
          system_id?: string
          update_id?: string | null
          updated_at?: string
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          account_role?: string
          actual_behavior?: string
          app_version?: string | null
          blocker_classification?: string
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          discovered_by?: string
          distribution_source?: string | null
          expected_behavior?: string
          fake_proof?: boolean
          finding_status?: string
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          next_safe_action?: string
          owner_command_request_id?: string | null
          platform?: string
          private_evidence_stored?: boolean
          provider_environment?: string | null
          readback_complete?: boolean
          result?: string
          route_path?: string | null
          runtime_version?: string | null
          secrets_logged?: boolean
          source?: string
          system_id?: string
          update_id?: string | null
          updated_at?: string
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "role_behavior_findings_owner_command_request_id_fkey"
            columns: ["owner_command_request_id"]
            isOneToOne: false
            referencedRelation: "owner_command_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      rollback_readiness_records: {
        Row: {
          app_version: string | null
          bundle_identifier: string | null
          channel: string | null
          created_at: string
          data_source: string | null
          distribution_source: string | null
          environment_mode: string
          id: string
          metadata: Json
          money_moved: boolean
          native_build: string | null
          platform: string
          provider_environment: string | null
          readback_complete: boolean
          readiness_state: string
          rollback_available: boolean
          runtime_version: string | null
          system_id: string
          update_id: string | null
          user_rights_changed: boolean
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          app_version?: string | null
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          distribution_source?: string | null
          environment_mode?: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          platform?: string
          provider_environment?: string | null
          readback_complete?: boolean
          readiness_state?: string
          rollback_available?: boolean
          runtime_version?: string | null
          system_id?: string
          update_id?: string | null
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          app_version?: string | null
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          distribution_source?: string | null
          environment_mode?: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          platform?: string
          provider_environment?: string | null
          readback_complete?: boolean
          readiness_state?: string
          rollback_available?: boolean
          runtime_version?: string | null
          system_id?: string
          update_id?: string | null
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Relationships: []
      }
      rollout_anomaly_findings: {
        Row: {
          anomaly_type: string
          app_version: string | null
          bundle_identifier: string | null
          channel: string | null
          created_at: string
          data_source: string | null
          distribution_source: string | null
          environment_mode: string
          id: string
          metadata: Json
          money_moved: boolean
          native_build: string | null
          platform: string
          provider_environment: string | null
          readback_complete: boolean
          review_status: string
          runtime_version: string | null
          severity: string
          system_id: string
          update_id: string | null
          user_rights_changed: boolean
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          anomaly_type: string
          app_version?: string | null
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          distribution_source?: string | null
          environment_mode?: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          platform?: string
          provider_environment?: string | null
          readback_complete?: boolean
          review_status?: string
          runtime_version?: string | null
          severity?: string
          system_id?: string
          update_id?: string | null
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          anomaly_type?: string
          app_version?: string | null
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          distribution_source?: string | null
          environment_mode?: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          platform?: string
          provider_environment?: string | null
          readback_complete?: boolean
          review_status?: string
          runtime_version?: string | null
          severity?: string
          system_id?: string
          update_id?: string | null
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
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
      room_ticket_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          id: string
          metadata: Json
          offer_id: string | null
          ticket_id: string | null
          transaction_id: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
          offer_id?: string | null
          ticket_id?: string | null
          transaction_id?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          offer_id?: string | null
          ticket_id?: string | null
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "room_ticket_events_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "paid_watch_party_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_ticket_events_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "paid_watch_party_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_ticket_events_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "creator_room_ticket_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      route_behavior_findings: {
        Row: {
          account_role: string | null
          actual_behavior: string | null
          actual_marker: string | null
          app_version: string | null
          blocker_classification: string
          bundle_identifier: string | null
          channel: string | null
          created_at: string
          data_source: string | null
          discovered_by: string
          distribution_source: string | null
          expected_behavior: string | null
          expected_marker: string | null
          fake_proof: boolean
          finding_status: string
          high_risk_executed: boolean
          id: string
          metadata: Json
          money_moved: boolean
          native_build: string | null
          next_safe_action: string
          owner_command_request_id: string | null
          platform: string
          private_evidence_stored: boolean
          provider_environment: string | null
          readback_complete: boolean
          result: string
          route_path: string
          runtime_version: string | null
          secrets_logged: boolean
          source: string
          system_id: string
          update_id: string | null
          updated_at: string
          user_rights_changed: boolean
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          account_role?: string | null
          actual_behavior?: string | null
          actual_marker?: string | null
          app_version?: string | null
          blocker_classification: string
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          discovered_by?: string
          distribution_source?: string | null
          expected_behavior?: string | null
          expected_marker?: string | null
          fake_proof?: boolean
          finding_status?: string
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          next_safe_action: string
          owner_command_request_id?: string | null
          platform?: string
          private_evidence_stored?: boolean
          provider_environment?: string | null
          readback_complete?: boolean
          result?: string
          route_path: string
          runtime_version?: string | null
          secrets_logged?: boolean
          source: string
          system_id?: string
          update_id?: string | null
          updated_at?: string
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          account_role?: string | null
          actual_behavior?: string | null
          actual_marker?: string | null
          app_version?: string | null
          blocker_classification?: string
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          discovered_by?: string
          distribution_source?: string | null
          expected_behavior?: string | null
          expected_marker?: string | null
          fake_proof?: boolean
          finding_status?: string
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          next_safe_action?: string
          owner_command_request_id?: string | null
          platform?: string
          private_evidence_stored?: boolean
          provider_environment?: string | null
          readback_complete?: boolean
          result?: string
          route_path?: string
          runtime_version?: string | null
          secrets_logged?: boolean
          source?: string
          system_id?: string
          update_id?: string | null
          updated_at?: string
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "route_behavior_findings_owner_command_request_id_fkey"
            columns: ["owner_command_request_id"]
            isOneToOne: false
            referencedRelation: "owner_command_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      runtime_health_snapshots: {
        Row: {
          app_version: string | null
          backend_error_rate_percent: number | null
          bundle_identifier: string | null
          channel: string | null
          crash_cluster_count: number
          created_at: string
          data_source: string | null
          distribution_source: string | null
          embedded_launch: boolean | null
          emergency_launch: boolean | null
          environment_mode: string
          health_state: string
          id: string
          js_error_count: number
          metadata: Json
          money_moved: boolean
          native_build: string | null
          performance_regression_count: number
          pii_stored: boolean
          platform: string
          provider_environment: string | null
          readback_complete: boolean
          release_action_executed: boolean
          runtime_version: string | null
          secrets_logged: boolean
          system_id: string
          update_id: string | null
          user_rights_changed: boolean
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          app_version?: string | null
          backend_error_rate_percent?: number | null
          bundle_identifier?: string | null
          channel?: string | null
          crash_cluster_count?: number
          created_at?: string
          data_source?: string | null
          distribution_source?: string | null
          embedded_launch?: boolean | null
          emergency_launch?: boolean | null
          environment_mode?: string
          health_state: string
          id?: string
          js_error_count?: number
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          performance_regression_count?: number
          pii_stored?: boolean
          platform?: string
          provider_environment?: string | null
          readback_complete?: boolean
          release_action_executed?: boolean
          runtime_version?: string | null
          secrets_logged?: boolean
          system_id?: string
          update_id?: string | null
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          app_version?: string | null
          backend_error_rate_percent?: number | null
          bundle_identifier?: string | null
          channel?: string | null
          crash_cluster_count?: number
          created_at?: string
          data_source?: string | null
          distribution_source?: string | null
          embedded_launch?: boolean | null
          emergency_launch?: boolean | null
          environment_mode?: string
          health_state?: string
          id?: string
          js_error_count?: number
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          performance_regression_count?: number
          pii_stored?: boolean
          platform?: string
          provider_environment?: string | null
          readback_complete?: boolean
          release_action_executed?: boolean
          runtime_version?: string | null
          secrets_logged?: boolean
          system_id?: string
          update_id?: string | null
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
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
      safety_review_recommendations: {
        Row: {
          created_at: string
          environment_mode: string
          id: string
          metadata: Json
          money_moved: boolean
          recommendation_type: string
          review_status: string
          severity: string
          system_id: string
          user_rights_changed: boolean
        }
        Insert: {
          created_at?: string
          environment_mode?: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          recommendation_type: string
          review_status?: string
          severity?: string
          system_id?: string
          user_rights_changed?: boolean
        }
        Update: {
          created_at?: string
          environment_mode?: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          recommendation_type?: string
          review_status?: string
          severity?: string
          system_id?: string
          user_rights_changed?: boolean
        }
        Relationships: []
      }
      sandbox_monetization_testers: {
        Row: {
          created_at: string
          created_by: string | null
          email: string | null
          expires_at: string | null
          id: string
          note: string | null
          revoked_at: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          expires_at?: string | null
          id?: string
          note?: string | null
          revoked_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          expires_at?: string | null
          id?: string
          note?: string | null
          revoked_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      scheduled_timer_health_findings: {
        Row: {
          app_version: string | null
          bundle_identifier: string | null
          channel: string | null
          created_at: string
          data_source: string | null
          distribution_source: string | null
          environment_mode: string
          fake_proof: boolean
          flag_type: string
          high_risk_executed: boolean
          id: string
          metadata: Json
          money_moved: boolean
          native_build: string | null
          platform: string
          provider_environment: string | null
          readback_complete: boolean
          runtime_version: string | null
          severity: string
          system_id: string
          target_id: string | null
          target_type: string | null
          update_id: string | null
          user_rights_changed: boolean
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          app_version?: string | null
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          distribution_source?: string | null
          environment_mode?: string
          fake_proof?: boolean
          flag_type?: string
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          platform?: string
          provider_environment?: string | null
          readback_complete?: boolean
          runtime_version?: string | null
          severity?: string
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          update_id?: string | null
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          app_version?: string | null
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          distribution_source?: string | null
          environment_mode?: string
          fake_proof?: boolean
          flag_type?: string
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          platform?: string
          provider_environment?: string | null
          readback_complete?: boolean
          runtime_version?: string | null
          severity?: string
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          update_id?: string | null
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Relationships: []
      }
      search_health_snapshots: {
        Row: {
          created_at: string
          environment_mode: string
          fake_proof: boolean
          flag_type: string
          health_state: string
          high_risk_executed: boolean
          id: string
          metadata: Json
          money_moved: boolean
          platform: string
          severity: string
          system_id: string
          target_id: string | null
          target_type: string | null
          user_rights_changed: boolean
        }
        Insert: {
          created_at?: string
          environment_mode?: string
          fake_proof?: boolean
          flag_type?: string
          health_state?: string
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          platform?: string
          severity?: string
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          user_rights_changed?: boolean
        }
        Update: {
          created_at?: string
          environment_mode?: string
          fake_proof?: boolean
          flag_type?: string
          health_state?: string
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          platform?: string
          severity?: string
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          user_rights_changed?: boolean
        }
        Relationships: []
      }
      search_operator_events: {
        Row: {
          action_id: string
          actor_id: string | null
          actor_type: string
          created_at: string
          environment_mode: string
          fake_proof: boolean
          high_risk_executed: boolean
          id: string
          metadata: Json
          money_moved: boolean
          platform: string
          result: string
          system_id: string
          user_rights_changed: boolean
        }
        Insert: {
          action_id: string
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          environment_mode?: string
          fake_proof?: boolean
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          platform?: string
          result: string
          system_id?: string
          user_rights_changed?: boolean
        }
        Update: {
          action_id?: string
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          environment_mode?: string
          fake_proof?: boolean
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          platform?: string
          result?: string
          system_id?: string
          user_rights_changed?: boolean
        }
        Relationships: []
      }
      search_operator_learning_state: {
        Row: {
          confidence: number
          fake_proof: boolean
          finding_key: string
          first_seen_at: string
          high_risk_executed: boolean
          id: string
          last_result: string
          last_seen_at: string
          metadata: Json
          money_moved: boolean
          occurrence_count: number
          system_id: string
          user_rights_changed: boolean
        }
        Insert: {
          confidence?: number
          fake_proof?: boolean
          finding_key: string
          first_seen_at?: string
          high_risk_executed?: boolean
          id?: string
          last_result?: string
          last_seen_at?: string
          metadata?: Json
          money_moved?: boolean
          occurrence_count?: number
          system_id?: string
          user_rights_changed?: boolean
        }
        Update: {
          confidence?: number
          fake_proof?: boolean
          finding_key?: string
          first_seen_at?: string
          high_risk_executed?: boolean
          id?: string
          last_result?: string
          last_seen_at?: string
          metadata?: Json
          money_moved?: boolean
          occurrence_count?: number
          system_id?: string
          user_rights_changed?: boolean
        }
        Relationships: []
      }
      search_required_review_flags: {
        Row: {
          created_at: string
          environment_mode: string
          fake_proof: boolean
          flag_type: string
          high_risk_executed: boolean
          id: string
          metadata: Json
          money_moved: boolean
          severity: string
          system_id: string
          target_id: string | null
          target_type: string | null
          user_rights_changed: boolean
        }
        Insert: {
          created_at?: string
          environment_mode?: string
          fake_proof?: boolean
          flag_type?: string
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          severity?: string
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          user_rights_changed?: boolean
        }
        Update: {
          created_at?: string
          environment_mode?: string
          fake_proof?: boolean
          flag_type?: string
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          severity?: string
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          user_rights_changed?: boolean
        }
        Relationships: []
      }
      secret_scan_findings: {
        Row: {
          created_at: string
          environment_mode: string
          finding_type: string
          id: string
          metadata: Json
          money_moved: boolean
          review_status: string
          severity: string
          system_id: string
          user_rights_changed: boolean
        }
        Insert: {
          created_at?: string
          environment_mode?: string
          finding_type: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          review_status?: string
          severity?: string
          system_id?: string
          user_rights_changed?: boolean
        }
        Update: {
          created_at?: string
          environment_mode?: string
          finding_type?: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          review_status?: string
          severity?: string
          system_id?: string
          user_rights_changed?: boolean
        }
        Relationships: []
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
      security_health_snapshots: {
        Row: {
          app_version: string | null
          bundle_identifier: string | null
          channel: string | null
          created_at: string
          critical_finding_count: number
          data_source: string | null
          distribution_source: string | null
          environment_mode: string
          health_state: string
          id: string
          metadata: Json
          money_moved: boolean
          native_build: string | null
          platform: string
          provider_environment: string | null
          readback_complete: boolean
          runtime_version: string | null
          system_id: string
          update_id: string | null
          user_rights_changed: boolean
          warning_count: number
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          app_version?: string | null
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          critical_finding_count?: number
          data_source?: string | null
          distribution_source?: string | null
          environment_mode?: string
          health_state: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          platform?: string
          provider_environment?: string | null
          readback_complete?: boolean
          runtime_version?: string | null
          system_id?: string
          update_id?: string | null
          user_rights_changed?: boolean
          warning_count?: number
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          app_version?: string | null
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          critical_finding_count?: number
          data_source?: string | null
          distribution_source?: string | null
          environment_mode?: string
          health_state?: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          platform?: string
          provider_environment?: string | null
          readback_complete?: boolean
          runtime_version?: string | null
          system_id?: string
          update_id?: string | null
          user_rights_changed?: boolean
          warning_count?: number
          window_end?: string | null
          window_start?: string | null
        }
        Relationships: []
      }
      security_operator_events: {
        Row: {
          action_id: string
          actor_id: string | null
          actor_type: string
          created_at: string
          environment_mode: string
          id: string
          metadata: Json
          money_moved: boolean
          platform: string
          result: string
          system_id: string
          user_rights_changed: boolean
        }
        Insert: {
          action_id: string
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          environment_mode?: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          platform?: string
          result: string
          system_id?: string
          user_rights_changed?: boolean
        }
        Update: {
          action_id?: string
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          environment_mode?: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          platform?: string
          result?: string
          system_id?: string
          user_rights_changed?: boolean
        }
        Relationships: []
      }
      security_operator_learning_state: {
        Row: {
          confidence: number
          first_seen_at: string
          id: string
          incident_key: string
          last_recommended_action: string | null
          last_seen_at: string
          metadata: Json
          money_moved: boolean
          occurrence_count: number
          system_id: string
          user_rights_changed: boolean
        }
        Insert: {
          confidence?: number
          first_seen_at?: string
          id?: string
          incident_key: string
          last_recommended_action?: string | null
          last_seen_at?: string
          metadata?: Json
          money_moved?: boolean
          occurrence_count?: number
          system_id?: string
          user_rights_changed?: boolean
        }
        Update: {
          confidence?: number
          first_seen_at?: string
          id?: string
          incident_key?: string
          last_recommended_action?: string | null
          last_seen_at?: string
          metadata?: Json
          money_moved?: boolean
          occurrence_count?: number
          system_id?: string
          user_rights_changed?: boolean
        }
        Relationships: []
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
      security_required_review_flags: {
        Row: {
          app_version: string | null
          bundle_identifier: string | null
          channel: string | null
          created_at: string
          data_source: string | null
          distribution_source: string | null
          environment_mode: string
          flag_type: string
          id: string
          metadata: Json
          money_moved: boolean
          native_build: string | null
          platform: string
          provider_environment: string | null
          readback_complete: boolean
          review_status: string
          runtime_version: string | null
          severity: string
          system_id: string
          update_id: string | null
          updated_at: string
          user_rights_changed: boolean
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          app_version?: string | null
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          distribution_source?: string | null
          environment_mode?: string
          flag_type: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          platform?: string
          provider_environment?: string | null
          readback_complete?: boolean
          review_status?: string
          runtime_version?: string | null
          severity?: string
          system_id?: string
          update_id?: string | null
          updated_at?: string
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          app_version?: string | null
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          distribution_source?: string | null
          environment_mode?: string
          flag_type?: string
          id?: string
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          platform?: string
          provider_environment?: string | null
          readback_complete?: boolean
          review_status?: string
          runtime_version?: string | null
          severity?: string
          system_id?: string
          update_id?: string | null
          updated_at?: string
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
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
          quarantined_at: string | null
          scan_error: string | null
          scan_provider: string | null
          scan_result: string | null
          scan_status: string
          scanned_at: string | null
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
          quarantined_at?: string | null
          scan_error?: string | null
          scan_provider?: string | null
          scan_result?: string | null
          scan_status?: string
          scanned_at?: string | null
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
          quarantined_at?: string | null
          scan_error?: string | null
          scan_provider?: string | null
          scan_result?: string | null
          scan_status?: string
          scanned_at?: string | null
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
            foreignKeyName: "spectator_child_room_audit_log_security_context_id_fkey"
            columns: ["security_context_id"]
            isOneToOne: false
            referencedRelation: "security_request_context"
            referencedColumns: ["id"]
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
      stripe_merch_events: {
        Row: {
          created_at: string
          environment: string
          event_type: string
          id: string
          linked_order_id: string | null
          metadata: Json
          object_id: string | null
          processed_at: string | null
          provider: string
          status: string
          stripe_event_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          environment?: string
          event_type: string
          id?: string
          linked_order_id?: string | null
          metadata?: Json
          object_id?: string | null
          processed_at?: string | null
          provider?: string
          status?: string
          stripe_event_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          environment?: string
          event_type?: string
          id?: string
          linked_order_id?: string | null
          metadata?: Json
          object_id?: string | null
          processed_at?: string | null
          provider?: string
          status?: string
          stripe_event_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stripe_merch_events_linked_order_id_fkey"
            columns: ["linked_order_id"]
            isOneToOne: false
            referencedRelation: "merch_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      support_escalation_records: {
        Row: {
          created_at: string
          environment_mode: string
          fake_proof: boolean
          flag_type: string
          high_risk_executed: boolean
          id: string
          metadata: Json
          money_moved: boolean
          severity: string
          system_id: string
          target_id: string | null
          target_type: string | null
          user_rights_changed: boolean
        }
        Insert: {
          created_at?: string
          environment_mode?: string
          fake_proof?: boolean
          flag_type?: string
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          severity?: string
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          user_rights_changed?: boolean
        }
        Update: {
          created_at?: string
          environment_mode?: string
          fake_proof?: boolean
          flag_type?: string
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          severity?: string
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          user_rights_changed?: boolean
        }
        Relationships: []
      }
      support_health_snapshots: {
        Row: {
          app_version: string | null
          bundle_identifier: string | null
          channel: string | null
          created_at: string
          data_source: string | null
          distribution_source: string | null
          environment_mode: string
          fake_proof: boolean
          flag_type: string
          health_state: string
          high_risk_executed: boolean
          id: string
          metadata: Json
          money_moved: boolean
          native_build: string | null
          platform: string
          provider_environment: string | null
          readback_complete: boolean
          runtime_version: string | null
          severity: string
          system_id: string
          target_id: string | null
          target_type: string | null
          update_id: string | null
          user_rights_changed: boolean
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          app_version?: string | null
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          distribution_source?: string | null
          environment_mode?: string
          fake_proof?: boolean
          flag_type?: string
          health_state?: string
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          platform?: string
          provider_environment?: string | null
          readback_complete?: boolean
          runtime_version?: string | null
          severity?: string
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          update_id?: string | null
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          app_version?: string | null
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          distribution_source?: string | null
          environment_mode?: string
          fake_proof?: boolean
          flag_type?: string
          health_state?: string
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          platform?: string
          provider_environment?: string | null
          readback_complete?: boolean
          runtime_version?: string | null
          severity?: string
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          update_id?: string | null
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Relationships: []
      }
      support_operator_events: {
        Row: {
          action_id: string
          actor_id: string | null
          actor_type: string
          created_at: string
          environment_mode: string
          fake_proof: boolean
          high_risk_executed: boolean
          id: string
          metadata: Json
          money_moved: boolean
          platform: string
          result: string
          system_id: string
          user_rights_changed: boolean
        }
        Insert: {
          action_id: string
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          environment_mode?: string
          fake_proof?: boolean
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          platform?: string
          result: string
          system_id?: string
          user_rights_changed?: boolean
        }
        Update: {
          action_id?: string
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          environment_mode?: string
          fake_proof?: boolean
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          platform?: string
          result?: string
          system_id?: string
          user_rights_changed?: boolean
        }
        Relationships: []
      }
      support_operator_learning_state: {
        Row: {
          confidence: number
          fake_proof: boolean
          finding_key: string
          first_seen_at: string
          high_risk_executed: boolean
          id: string
          last_result: string
          last_seen_at: string
          metadata: Json
          money_moved: boolean
          occurrence_count: number
          system_id: string
          user_rights_changed: boolean
        }
        Insert: {
          confidence?: number
          fake_proof?: boolean
          finding_key: string
          first_seen_at?: string
          high_risk_executed?: boolean
          id?: string
          last_result?: string
          last_seen_at?: string
          metadata?: Json
          money_moved?: boolean
          occurrence_count?: number
          system_id?: string
          user_rights_changed?: boolean
        }
        Update: {
          confidence?: number
          fake_proof?: boolean
          finding_key?: string
          first_seen_at?: string
          high_risk_executed?: boolean
          id?: string
          last_result?: string
          last_seen_at?: string
          metadata?: Json
          money_moved?: boolean
          occurrence_count?: number
          system_id?: string
          user_rights_changed?: boolean
        }
        Relationships: []
      }
      support_required_review_flags: {
        Row: {
          app_version: string | null
          bundle_identifier: string | null
          channel: string | null
          created_at: string
          data_source: string | null
          distribution_source: string | null
          environment_mode: string
          fake_proof: boolean
          flag_type: string
          high_risk_executed: boolean
          id: string
          metadata: Json
          money_moved: boolean
          native_build: string | null
          platform: string
          provider_environment: string | null
          readback_complete: boolean
          runtime_version: string | null
          severity: string
          system_id: string
          target_id: string | null
          target_type: string | null
          update_id: string | null
          user_rights_changed: boolean
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          app_version?: string | null
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          distribution_source?: string | null
          environment_mode?: string
          fake_proof?: boolean
          flag_type?: string
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          platform?: string
          provider_environment?: string | null
          readback_complete?: boolean
          runtime_version?: string | null
          severity?: string
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          update_id?: string | null
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          app_version?: string | null
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          distribution_source?: string | null
          environment_mode?: string
          fake_proof?: boolean
          flag_type?: string
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          platform?: string
          provider_environment?: string | null
          readback_complete?: boolean
          runtime_version?: string | null
          severity?: string
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          update_id?: string | null
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Relationships: []
      }
      support_response_drafts: {
        Row: {
          created_at: string
          environment_mode: string
          fake_proof: boolean
          flag_type: string
          high_risk_executed: boolean
          id: string
          metadata: Json
          money_moved: boolean
          severity: string
          system_id: string
          target_id: string | null
          target_type: string | null
          user_rights_changed: boolean
        }
        Insert: {
          created_at?: string
          environment_mode?: string
          fake_proof?: boolean
          flag_type?: string
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          severity?: string
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          user_rights_changed?: boolean
        }
        Update: {
          created_at?: string
          environment_mode?: string
          fake_proof?: boolean
          flag_type?: string
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          severity?: string
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          user_rights_changed?: boolean
        }
        Relationships: []
      }
      support_ticket_findings: {
        Row: {
          app_version: string | null
          bundle_identifier: string | null
          channel: string | null
          created_at: string
          data_source: string | null
          distribution_source: string | null
          environment_mode: string
          fake_proof: boolean
          flag_type: string
          high_risk_executed: boolean
          id: string
          metadata: Json
          money_moved: boolean
          native_build: string | null
          platform: string
          provider_environment: string | null
          readback_complete: boolean
          runtime_version: string | null
          severity: string
          system_id: string
          target_id: string | null
          target_type: string | null
          update_id: string | null
          user_rights_changed: boolean
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          app_version?: string | null
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          distribution_source?: string | null
          environment_mode?: string
          fake_proof?: boolean
          flag_type?: string
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          platform?: string
          provider_environment?: string | null
          readback_complete?: boolean
          runtime_version?: string | null
          severity?: string
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          update_id?: string | null
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          app_version?: string | null
          bundle_identifier?: string | null
          channel?: string | null
          created_at?: string
          data_source?: string | null
          distribution_source?: string | null
          environment_mode?: string
          fake_proof?: boolean
          flag_type?: string
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          platform?: string
          provider_environment?: string | null
          readback_complete?: boolean
          runtime_version?: string | null
          severity?: string
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          update_id?: string | null
          user_rights_changed?: boolean
          window_end?: string | null
          window_start?: string | null
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
          platform_access_visibility: string
          profile_access_visibility: string
          profile_avatar_fit_mode: string
          profile_avatar_focal_x: number
          profile_avatar_focal_y: number
          profile_avatar_media_flagged_at: string | null
          profile_avatar_media_status: string
          profile_avatar_scan_error: string | null
          profile_avatar_scan_provider: string | null
          profile_avatar_scan_result: string | null
          profile_avatar_scan_status: string
          profile_avatar_scanned_at: string | null
          profile_background_fit_mode: string
          profile_background_focal_x: number
          profile_background_focal_y: number
          profile_background_media_flagged_at: string | null
          profile_background_media_status: string
          profile_background_overlay_strength: number
          profile_background_scan_error: string | null
          profile_background_scan_provider: string | null
          profile_background_scan_result: string | null
          profile_background_scan_status: string
          profile_background_scanned_at: string | null
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
          platform_access_visibility?: string
          profile_access_visibility?: string
          profile_avatar_fit_mode?: string
          profile_avatar_focal_x?: number
          profile_avatar_focal_y?: number
          profile_avatar_media_flagged_at?: string | null
          profile_avatar_media_status?: string
          profile_avatar_scan_error?: string | null
          profile_avatar_scan_provider?: string | null
          profile_avatar_scan_result?: string | null
          profile_avatar_scan_status?: string
          profile_avatar_scanned_at?: string | null
          profile_background_fit_mode?: string
          profile_background_focal_x?: number
          profile_background_focal_y?: number
          profile_background_media_flagged_at?: string | null
          profile_background_media_status?: string
          profile_background_overlay_strength?: number
          profile_background_scan_error?: string | null
          profile_background_scan_provider?: string | null
          profile_background_scan_result?: string | null
          profile_background_scan_status?: string
          profile_background_scanned_at?: string | null
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
          platform_access_visibility?: string
          profile_access_visibility?: string
          profile_avatar_fit_mode?: string
          profile_avatar_focal_x?: number
          profile_avatar_focal_y?: number
          profile_avatar_media_flagged_at?: string | null
          profile_avatar_media_status?: string
          profile_avatar_scan_error?: string | null
          profile_avatar_scan_provider?: string | null
          profile_avatar_scan_result?: string | null
          profile_avatar_scan_status?: string
          profile_avatar_scanned_at?: string | null
          profile_background_fit_mode?: string
          profile_background_focal_x?: number
          profile_background_focal_y?: number
          profile_background_media_flagged_at?: string | null
          profile_background_media_status?: string
          profile_background_overlay_strength?: number
          profile_background_scan_error?: string | null
          profile_background_scan_provider?: string | null
          profile_background_scan_result?: string | null
          profile_background_scan_status?: string
          profile_background_scanned_at?: string | null
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
          ownership_operation_key: string | null
          ownership_state: string
          session_generation: string | null
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
          ownership_operation_key?: string | null
          ownership_state?: string
          session_generation?: string | null
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
          ownership_operation_key?: string | null
          ownership_state?: string
          session_generation?: string | null
          token?: string
          token_fingerprint?: string
          token_hash?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_report_classifications: {
        Row: {
          blocker_classification: string | null
          category: string
          confidence: number
          created_at: string
          escalation_policy: string
          high_risk_executed: boolean
          id: string
          metadata: Json
          money_moved: boolean
          platform: string
          prompt_injection_flag: boolean
          report_id: string
          report_type: string
          routed_system_id: string
          severity: string
          spam_flag: boolean
          user_rights_changed: boolean
        }
        Insert: {
          blocker_classification?: string | null
          category: string
          confidence?: number
          created_at?: string
          escalation_policy?: string
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          platform?: string
          prompt_injection_flag?: boolean
          report_id: string
          report_type: string
          routed_system_id: string
          severity: string
          spam_flag?: boolean
          user_rights_changed?: boolean
        }
        Update: {
          blocker_classification?: string | null
          category?: string
          confidence?: number
          created_at?: string
          escalation_policy?: string
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          platform?: string
          prompt_injection_flag?: boolean
          report_id?: string
          report_type?: string
          routed_system_id?: string
          severity?: string
          spam_flag?: boolean
          user_rights_changed?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "user_report_classifications_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "user_report_intake_events"
            referencedColumns: ["id"]
          },
        ]
      }
      user_report_cluster_members: {
        Row: {
          cluster_id: string
          duplicate_flag: boolean
          first_seen_at: string
          id: string
          last_seen_at: string
          metadata: Json
          report_count: number
          report_id: string
          reporter_hash: string
          reporter_user_id: string | null
        }
        Insert: {
          cluster_id: string
          duplicate_flag?: boolean
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          metadata?: Json
          report_count?: number
          report_id: string
          reporter_hash: string
          reporter_user_id?: string | null
        }
        Update: {
          cluster_id?: string
          duplicate_flag?: boolean
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          metadata?: Json
          report_count?: number
          report_id?: string
          reporter_hash?: string
          reporter_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_report_cluster_members_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "user_report_clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_report_cluster_members_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "user_report_intake_events"
            referencedColumns: ["id"]
          },
        ]
      }
      user_report_clusters: {
        Row: {
          action_status: string
          approval_request_id: string | null
          category: string
          cluster_status: string
          created_at: string
          false_positive: boolean
          finding_key: string | null
          first_seen_at: string
          high_risk_executed: boolean
          id: string
          last_seen_at: string
          metadata: Json
          money_moved: boolean
          normalized_fingerprint: string
          occurrence_count: number
          owner_command_id: string | null
          platform: string
          report_count: number
          report_type: string
          resolved_at: string | null
          route: string | null
          routed_system_id: string
          severity: string
          spam_flag: boolean
          surface: string | null
          target_id_hash: string | null
          target_type: string | null
          text_summary_redacted: string
          threshold_unique_reporters: number
          unique_reporter_count: number
          updated_at: string
          user_rights_changed: boolean
        }
        Insert: {
          action_status?: string
          approval_request_id?: string | null
          category: string
          cluster_status?: string
          created_at?: string
          false_positive?: boolean
          finding_key?: string | null
          first_seen_at?: string
          high_risk_executed?: boolean
          id?: string
          last_seen_at?: string
          metadata?: Json
          money_moved?: boolean
          normalized_fingerprint: string
          occurrence_count?: number
          owner_command_id?: string | null
          platform?: string
          report_count?: number
          report_type: string
          resolved_at?: string | null
          route?: string | null
          routed_system_id: string
          severity: string
          spam_flag?: boolean
          surface?: string | null
          target_id_hash?: string | null
          target_type?: string | null
          text_summary_redacted?: string
          threshold_unique_reporters?: number
          unique_reporter_count?: number
          updated_at?: string
          user_rights_changed?: boolean
        }
        Update: {
          action_status?: string
          approval_request_id?: string | null
          category?: string
          cluster_status?: string
          created_at?: string
          false_positive?: boolean
          finding_key?: string | null
          first_seen_at?: string
          high_risk_executed?: boolean
          id?: string
          last_seen_at?: string
          metadata?: Json
          money_moved?: boolean
          normalized_fingerprint?: string
          occurrence_count?: number
          owner_command_id?: string | null
          platform?: string
          report_count?: number
          report_type?: string
          resolved_at?: string | null
          route?: string | null
          routed_system_id?: string
          severity?: string
          spam_flag?: boolean
          surface?: string | null
          target_id_hash?: string | null
          target_type?: string | null
          text_summary_redacted?: string
          threshold_unique_reporters?: number
          unique_reporter_count?: number
          updated_at?: string
          user_rights_changed?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "user_report_clusters_approval_request_id_fkey"
            columns: ["approval_request_id"]
            isOneToOne: false
            referencedRelation: "autonomous_approval_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_report_clusters_owner_command_id_fkey"
            columns: ["owner_command_id"]
            isOneToOne: false
            referencedRelation: "owner_command_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      user_report_intake_events: {
        Row: {
          app_version: string | null
          category: string
          channel: string | null
          created_at: string
          duplicate_flag: boolean
          false_positive: boolean
          high_risk_executed: boolean
          id: string
          metadata: Json
          money_moved: boolean
          native_build: string | null
          normalized_fingerprint: string
          platform: string
          raw_text_redacted: string | null
          report_status: string
          report_type: string
          reporter_user_id: string | null
          route: string | null
          runtime_version: string | null
          severity: string
          source: string
          spam_flag: boolean
          surface: string | null
          target_id_hash: string | null
          target_type: string | null
          text_summary_redacted: string
          update_id: string | null
          user_rights_changed: boolean
        }
        Insert: {
          app_version?: string | null
          category: string
          channel?: string | null
          created_at?: string
          duplicate_flag?: boolean
          false_positive?: boolean
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          normalized_fingerprint: string
          platform?: string
          raw_text_redacted?: string | null
          report_status?: string
          report_type: string
          reporter_user_id?: string | null
          route?: string | null
          runtime_version?: string | null
          severity?: string
          source?: string
          spam_flag?: boolean
          surface?: string | null
          target_id_hash?: string | null
          target_type?: string | null
          text_summary_redacted?: string
          update_id?: string | null
          user_rights_changed?: boolean
        }
        Update: {
          app_version?: string | null
          category?: string
          channel?: string | null
          created_at?: string
          duplicate_flag?: boolean
          false_positive?: boolean
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          native_build?: string | null
          normalized_fingerprint?: string
          platform?: string
          raw_text_redacted?: string | null
          report_status?: string
          report_type?: string
          reporter_user_id?: string | null
          route?: string | null
          runtime_version?: string | null
          severity?: string
          source?: string
          spam_flag?: boolean
          surface?: string | null
          target_id_hash?: string | null
          target_type?: string | null
          text_summary_redacted?: string
          update_id?: string | null
          user_rights_changed?: boolean
        }
        Relationships: []
      }
      user_report_operator_findings: {
        Row: {
          approval_request_id: string | null
          cluster_id: string
          created_at: string
          finding_key: string | null
          finding_status: string
          finding_type: string
          first_seen_at: string
          high_risk_executed: boolean
          id: string
          last_seen_at: string
          metadata: Json
          money_moved: boolean
          occurrence_count: number
          owner_command_id: string | null
          platform: string
          report_count: number
          resolved_at: string | null
          routed_system_id: string
          severity: string
          system_id: string
          text_summary_redacted: string
          unique_reporter_count: number
          user_rights_changed: boolean
        }
        Insert: {
          approval_request_id?: string | null
          cluster_id: string
          created_at?: string
          finding_key?: string | null
          finding_status?: string
          finding_type: string
          first_seen_at?: string
          high_risk_executed?: boolean
          id?: string
          last_seen_at?: string
          metadata?: Json
          money_moved?: boolean
          occurrence_count?: number
          owner_command_id?: string | null
          platform?: string
          report_count?: number
          resolved_at?: string | null
          routed_system_id: string
          severity: string
          system_id: string
          text_summary_redacted?: string
          unique_reporter_count?: number
          user_rights_changed?: boolean
        }
        Update: {
          approval_request_id?: string | null
          cluster_id?: string
          created_at?: string
          finding_key?: string | null
          finding_status?: string
          finding_type?: string
          first_seen_at?: string
          high_risk_executed?: boolean
          id?: string
          last_seen_at?: string
          metadata?: Json
          money_moved?: boolean
          occurrence_count?: number
          owner_command_id?: string | null
          platform?: string
          report_count?: number
          resolved_at?: string | null
          routed_system_id?: string
          severity?: string
          system_id?: string
          text_summary_redacted?: string
          unique_reporter_count?: number
          user_rights_changed?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "user_report_operator_findings_approval_request_id_fkey"
            columns: ["approval_request_id"]
            isOneToOne: false
            referencedRelation: "autonomous_approval_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_report_operator_findings_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "user_report_clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_report_operator_findings_owner_command_id_fkey"
            columns: ["owner_command_id"]
            isOneToOne: false
            referencedRelation: "owner_command_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      user_report_router_learning_state: {
        Row: {
          created_at: string
          high_risk_executed: boolean
          id: string
          learning_key: string
          learning_state: string
          metadata: Json
          money_moved: boolean
          platform: string
          system_id: string
          updated_at: string
          user_rights_changed: boolean
        }
        Insert: {
          created_at?: string
          high_risk_executed?: boolean
          id?: string
          learning_key: string
          learning_state?: string
          metadata?: Json
          money_moved?: boolean
          platform?: string
          system_id?: string
          updated_at?: string
          user_rights_changed?: boolean
        }
        Update: {
          created_at?: string
          high_risk_executed?: boolean
          id?: string
          learning_key?: string
          learning_state?: string
          metadata?: Json
          money_moved?: boolean
          platform?: string
          system_id?: string
          updated_at?: string
          user_rights_changed?: boolean
        }
        Relationships: []
      }
      user_report_routing_actions: {
        Row: {
          action_status: string
          action_type: string
          approval_request_id: string | null
          cluster_id: string
          created_at: string
          high_risk_executed: boolean
          id: string
          metadata: Json
          money_moved: boolean
          owner_command_id: string | null
          platform: string
          reason: string
          report_count: number
          routed_system_id: string
          unique_reporter_count: number
          user_rights_changed: boolean
        }
        Insert: {
          action_status?: string
          action_type: string
          approval_request_id?: string | null
          cluster_id: string
          created_at?: string
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          owner_command_id?: string | null
          platform?: string
          reason: string
          report_count?: number
          routed_system_id: string
          unique_reporter_count?: number
          user_rights_changed?: boolean
        }
        Update: {
          action_status?: string
          action_type?: string
          approval_request_id?: string | null
          cluster_id?: string
          created_at?: string
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          owner_command_id?: string | null
          platform?: string
          reason?: string
          report_count?: number
          routed_system_id?: string
          unique_reporter_count?: number
          user_rights_changed?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "user_report_routing_actions_approval_request_id_fkey"
            columns: ["approval_request_id"]
            isOneToOne: false
            referencedRelation: "autonomous_approval_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_report_routing_actions_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "user_report_clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_report_routing_actions_owner_command_id_fkey"
            columns: ["owner_command_id"]
            isOneToOne: false
            referencedRelation: "owner_command_requests"
            referencedColumns: ["id"]
          },
        ]
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
      user_voip_push_tokens: {
        Row: {
          apns_environment: string
          app_version: string | null
          build_version: string | null
          created_at: string
          enabled: boolean
          id: string
          install_id: string
          last_seen_at: string
          revoked_at: string | null
          token: string
          token_fingerprint: string
          token_hash: string
          updated_at: string
          user_id: string
        }
        Insert: {
          apns_environment: string
          app_version?: string | null
          build_version?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          install_id: string
          last_seen_at?: string
          revoked_at?: string | null
          token: string
          token_fingerprint: string
          token_hash: string
          updated_at?: string
          user_id: string
        }
        Update: {
          apns_environment?: string
          app_version?: string | null
          build_version?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          install_id?: string
          last_seen_at?: string
          revoked_at?: string | null
          token?: string
          token_fingerprint?: string
          token_hash?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      username_change_audit: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          id: string
          new_username: string | null
          old_username: string | null
          reason: string | null
          target_user_id: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          new_username?: string | null
          old_username?: string | null
          reason?: string | null
          target_user_id: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          new_username?: string | null
          old_username?: string | null
          reason?: string | null
          target_user_id?: string
        }
        Relationships: []
      }
      username_reserved_names: {
        Row: {
          created_at: string
          created_by: string | null
          is_official_only: boolean
          reason: string
          username: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          is_official_only?: boolean
          reason?: string
          username: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          is_official_only?: boolean
          reason?: string
          username?: string
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
          quarantined_at: string | null
          scan_error: string | null
          scan_provider: string | null
          scan_result: string | null
          scan_status: string
          scanned_at: string | null
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
          quarantined_at?: string | null
          scan_error?: string | null
          scan_provider?: string | null
          scan_result?: string | null
          scan_status?: string
          scanned_at?: string | null
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
          quarantined_at?: string | null
          scan_error?: string | null
          scan_provider?: string | null
          scan_result?: string | null
          scan_status?: string
          scanned_at?: string | null
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
          quarantined_at: string | null
          scan_error: string | null
          scan_provider: string | null
          scan_result: string | null
          scan_status: string
          scanned_at: string | null
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
          quarantined_at?: string | null
          scan_error?: string | null
          scan_provider?: string | null
          scan_result?: string | null
          scan_status?: string
          scanned_at?: string | null
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
          quarantined_at?: string | null
          scan_error?: string | null
          scan_provider?: string | null
          scan_result?: string | null
          scan_status?: string
          scanned_at?: string | null
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
      visibility_anomaly_findings: {
        Row: {
          created_at: string
          environment_mode: string
          fake_proof: boolean
          flag_type: string
          high_risk_executed: boolean
          id: string
          metadata: Json
          money_moved: boolean
          severity: string
          system_id: string
          target_id: string | null
          target_type: string | null
          user_rights_changed: boolean
        }
        Insert: {
          created_at?: string
          environment_mode?: string
          fake_proof?: boolean
          flag_type?: string
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          severity?: string
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          user_rights_changed?: boolean
        }
        Update: {
          created_at?: string
          environment_mode?: string
          fake_proof?: boolean
          flag_type?: string
          high_risk_executed?: boolean
          id?: string
          metadata?: Json
          money_moved?: boolean
          severity?: string
          system_id?: string
          target_id?: string | null
          target_type?: string | null
          user_rights_changed?: boolean
        }
        Relationships: []
      }
      voip_push_delivery_attempts: {
        Row: {
          apns_environment: string
          attempt_count: number
          call_invite_id: string
          created_at: string
          dispatch_key: string
          error_code: string | null
          id: string
          provider_message_id: string | null
          provider_status_code: number | null
          recipient_user_id: string
          status: string
          updated_at: string
          voip_push_token_id: string | null
        }
        Insert: {
          apns_environment: string
          attempt_count?: number
          call_invite_id: string
          created_at?: string
          dispatch_key: string
          error_code?: string | null
          id?: string
          provider_message_id?: string | null
          provider_status_code?: number | null
          recipient_user_id: string
          status: string
          updated_at?: string
          voip_push_token_id?: string | null
        }
        Update: {
          apns_environment?: string
          attempt_count?: number
          call_invite_id?: string
          created_at?: string
          dispatch_key?: string
          error_code?: string | null
          id?: string
          provider_message_id?: string | null
          provider_status_code?: number | null
          recipient_user_id?: string
          status?: string
          updated_at?: string
          voip_push_token_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voip_push_delivery_attempts_call_invite_id_fkey"
            columns: ["call_invite_id"]
            isOneToOne: false
            referencedRelation: "chat_call_invites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voip_push_delivery_attempts_voip_push_token_id_fkey"
            columns: ["voip_push_token_id"]
            isOneToOne: false
            referencedRelation: "user_voip_push_tokens"
            referencedColumns: ["id"]
          },
        ]
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
      wave1_accept_legal_documents: {
        Args: { p_acceptances: Json; p_expected_account_id: string; p_expected_user_id: string; p_market: string; p_session_generation: string; p_capability?: string }
        Returns: Json
      }
      wave1_creator_eligibility_readback: { Args: never; Returns: Json }
      wave1_entitlement_authority_readback: { Args: { p_entitlement_key: string }; Returns: Json }
      wave1_legal_requirements_readback: { Args: { p_capability?: string }; Returns: Json }
      wave1_push_ownership_readback: {
        Args: { p_install_id: string; p_platform: string; p_provider: string }
        Returns: Json
      }
      wave1_register_push_token: {
        Args: { p_app_version: string; p_build_version: string; p_expected_account_id: string; p_expected_user_id: string; p_install_id: string; p_metadata: Json; p_operation_key: string; p_permission_status: string; p_platform: string; p_provider: string; p_revocation_credential_hash: string; p_session_generation: string; p_token: string }
        Returns: Json
      }
      wave1_revoke_push_ownership: {
        Args: { p_expected_account_id: string; p_expected_user_id: string; p_install_id: string; p_operation_key: string; p_platform: string; p_reason: string; p_revocation_credential_hash: string; p_session_generation: string }
        Returns: Json
      }
      wave1_session_authority_readback: { Args: never; Returns: Json }
      account_access_status_readback: {
        Args: { p_user_id: string }
        Returns: Json
      }
      account_deletion_public_hidden_reason: {
        Args: { p_user_id: string }
        Returns: string
      }
      account_purge_deidentification_counts: {
        Args: { p_target_user_id: string }
        Returns: Json
      }
      account_purge_is_proof_account: {
        Args: { p_target_user_id: string }
        Returns: boolean
      }
      acknowledge_beta_onboarding: { Args: never; Returns: Json }
      activate_beta_membership: { Args: never; Returns: Json }
      admin_account_purge_runtime_status: { Args: never; Returns: Json }
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
        Args: { p_body: string; p_reason?: string; p_visibility?: string }
        Returns: Json
      }
      admin_deidentify_deleted_account: {
        Args: {
          p_dry_run?: boolean
          p_reason?: string
          p_target_user_id: string
        }
        Returns: Json
      }
      admin_deidentify_deleted_account_for_proof: {
        Args: {
          p_dry_run?: boolean
          p_proof_override?: boolean
          p_reason?: string
          p_target_user_id: string
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
      admin_force_update_username: {
        Args: {
          p_reason?: string
          p_target_user_id: string
          p_username: string
        }
        Returns: Json
      }
      admin_get_money_purchase_intent: {
        Args: { p_intent_id: string }
        Returns: Json
      }
      admin_get_refund_readiness_summary: { Args: never; Returns: Json }
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
      admin_list_creator_sandbox_monetization_configs: {
        Args: never
        Returns: Json
      }
      admin_list_money_purchase_intents: {
        Args: never
        Returns: {
          consumed_at: string
          created_at: string
          environment: string
          expires_at: string
          id: string
          product_key: string
          product_type: string
          provider: string
          provider_product_id: string
          source_id: string
          source_type: string
          status: string
          user_id: string
        }[]
      }
      admin_read_model_jsonb_object_key_count: {
        Args: { p_value: Json }
        Returns: number
      }
      admin_read_models_can_read_ops: { Args: never; Returns: boolean }
      admin_read_models_can_read_users: { Args: never; Returns: boolean }
      admin_reports_actor_can_review: { Args: never; Returns: boolean }
      admin_reports_actor_can_target_action: { Args: never; Returns: boolean }
      admin_reports_actor_can_target_action_scope: {
        Args: { p_action_type: string }
        Returns: boolean
      }
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
      admin_restore_account_for_support: {
        Args: { p_reason?: string; p_target_user_id: string }
        Returns: Json
      }
      admin_revoke_money_access_grant_for_proof: {
        Args: { p_grant_id: string; p_reason?: string }
        Returns: Json
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
      admin_run_account_purge_batch: {
        Args: { p_dry_run?: boolean; p_enable?: boolean; p_limit?: number }
        Returns: Json
      }
      admin_search_mask_query: { Args: { p_query: string }; Returns: string }
      admin_search_query_type: { Args: { p_query: string }; Returns: string }
      admin_suspend_account_for_support: {
        Args: {
          p_duration_minutes?: number
          p_reason?: string
          p_target_user_id: string
        }
        Returns: Json
      }
      admin_update_account_purge_manual_review_item_status: {
        Args: { p_item_id: string; p_resolution?: string; p_status: string }
        Returns: Json
      }
      admin_update_official_rachi_profile_image: {
        Args: { p_avatar_url?: string; p_reason?: string }
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
      approve_autonomous_approval_request: {
        Args: { p_metadata?: Json; p_request_id: string }
        Returns: {
          action_id: string
          allowed_write_scope: Json
          approval_level: number
          approved_at: string | null
          approved_by: string | null
          created_at: string
          denial_reason: string | null
          denied_at: string | null
          denied_by: string | null
          execution_result: string | null
          expires_at: string
          forbidden_scope: Json
          id: string
          kill_switch_plan: string
          metadata: Json
          platform: string
          proof_plan: string
          proposed_action: string
          reason: string
          requested_by_actor_id: string | null
          requested_by_actor_type: string
          risk_summary: string
          rollback_plan: string
          status: string
          system_id: string
          title: string
          updated_at: string
          validation_plan: string
        }
        SetofOptions: {
          from: "*"
          to: "autonomous_approval_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      assert_account_private_feature_allowed: {
        Args: { p_feature?: string; p_user_id: string }
        Returns: undefined
      }
      assert_autonomous_approval_platform_scope: {
        Args: {
          p_action_id: string
          p_platform: string
          p_request_id: string
          p_system_id: string
        }
        Returns: boolean
      }
      assert_money_feature_allowed: {
        Args: { p_key: string; p_require_live_money?: boolean }
        Returns: undefined
      }
      authorize_chilly_chat_call_transition_retry: {
        Args: { p_token: string }
        Returns: boolean
      }
      autonomous_actor_authority_role: {
        Args: { p_actor_email?: string; p_actor_user_id: string }
        Returns: string
      }
      autonomous_actor_has_owner_authority: {
        Args: { p_actor_email?: string; p_actor_user_id: string }
        Returns: boolean
      }
      autonomous_approval_payload_has_secret: {
        Args: { p_value: Json }
        Returns: boolean
      }
      autonomous_write_request_event: {
        Args: {
          p_actor_id: string
          p_actor_type: string
          p_event_summary: string
          p_event_type: string
          p_metadata?: Json
          p_request_id: string
        }
        Returns: string
      }
      build_safe_username_seed: {
        Args: { p_user_id: string; p_username: string }
        Returns: string
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
      can_read_circle_spectator_feed_item: {
        Args: { p_item_id: string; p_viewer_user_id?: string }
        Returns: boolean
      }
      can_read_circle_spectator_playback_record: {
        Args: { p_record_id: string; p_viewer_user_id?: string }
        Returns: boolean
      }
      can_read_creator_feed_item: {
        Args: {
          p_creator_user_id: string
          p_source_id: string
          p_source_type: string
          p_status: string
          p_target_scope: string
          p_viewer_user_id?: string
          p_visibility: string
        }
        Returns: boolean
      }
      can_read_creator_replay_library_item: {
        Args: { p_replay_id: string; p_viewer_user_id?: string }
        Returns: boolean
      }
      can_read_creator_video_row:
        | {
            Args: {
              p_moderation_status: string
              p_owner_user_id: string
              p_playback_url: string
              p_scan_status: string
              p_storage_object_key: string
              p_storage_path: string
              p_viewer_user_id?: string
              p_visibility: string
            }
            Returns: boolean
          }
        | {
            Args: {
              p_moderation_status: string
              p_owner_user_id: string
              p_playback_url: string
              p_storage_object_key: string
              p_storage_path: string
              p_viewer_user_id?: string
              p_visibility: string
            }
            Returns: boolean
          }
      can_view_profile_content: {
        Args: { profile_user_id: string }
        Returns: boolean
      }
      cancel_autonomous_approval_request: {
        Args: { p_reason?: string; p_request_id: string }
        Returns: {
          action_id: string
          allowed_write_scope: Json
          approval_level: number
          approved_at: string | null
          approved_by: string | null
          created_at: string
          denial_reason: string | null
          denied_at: string | null
          denied_by: string | null
          execution_result: string | null
          expires_at: string
          forbidden_scope: Json
          id: string
          kill_switch_plan: string
          metadata: Json
          platform: string
          proof_plan: string
          proposed_action: string
          reason: string
          requested_by_actor_id: string | null
          requested_by_actor_type: string
          risk_summary: string
          rollback_plan: string
          status: string
          system_id: string
          title: string
          updated_at: string
          validation_plan: string
        }
        SetofOptions: {
          from: "*"
          to: "autonomous_approval_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      channel_subscription_offer_safe_row: {
        Args: {
          offer_row: Database["public"]["Tables"]["creator_channel_subscription_offers"]["Row"]
        }
        Returns: Json
      }
      chat_thread_has_platform_owner: {
        Args: { target_thread_id: string }
        Returns: boolean
      }
      check_username_availability: {
        Args: { p_username: string }
        Returns: Json
      }
      claim_chilly_chat_call_transition_delivery: {
        Args: { p_delivery_id: string }
        Returns: Json
      }
      claim_chilly_chat_call_transition_delivery_batch: {
        Args: { p_limit?: number }
        Returns: Json[]
      }
      claim_media_scan_jobs: {
        Args: { p_max_jobs?: number; p_worker_id?: string }
        Returns: {
          attempt_count: number
          id: string
          metadata: Json
          mime_type: string
          owner_user_id: string
          size_bytes: number
          storage_bucket: string
          storage_object_key: string
          storage_provider: string
          target_column: string
          target_id: string
          target_table: string
        }[]
      }
      communication_room_join_allowed: {
        Args: { joining_user_id: string; target_room_id: string }
        Returns: boolean
      }
      complete_chilly_chat_call_transition_delivery: {
        Args: { p_delivery_id: string; p_result: Json; p_status: string }
        Returns: Json
      }
      complete_media_scan_job: {
        Args: {
          p_duration_ms?: number
          p_error_message?: string
          p_finding_name?: string
          p_job_id: string
          p_scanner_provider?: string
          p_scanner_version?: string
          p_signature_version?: string
          p_status: string
        }
        Returns: Json
      }
      configure_chilly_chat_call_transition_retry: {
        Args: { p_project_url: string }
        Returns: Json
      }
      create_account_purge_manual_review_items: {
        Args: {
          p_batch_run_id: string
          p_counts: Json
          p_target_user_id: string
        }
        Returns: Json
      }
      create_creator_channel_subscription_purchase_intent: {
        Args: { p_offer_id: string }
        Returns: Json
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
      create_creator_vip_pass_purchase_intent: {
        Args: { p_offer_id: string }
        Returns: Json
      }
      create_ios_app_store_purchase_intent: {
        Args: {
          p_metadata?: Json
          p_provider_product_id: string
          p_source_id: string
          p_source_type: string
        }
        Returns: Json
      }
      create_money_purchase_intent: {
        Args: {
          p_metadata?: Json
          p_product_key: string
          p_source_id?: string
          p_source_type: string
        }
        Returns: Json
      }
      create_paid_creator_event_pass_purchase_intent: {
        Args: { p_event_id: string }
        Returns: Json
      }
      create_paid_watch_party_ticket_purchase_intent: {
        Args: { p_offer_id: string }
        Returns: Json
      }
      create_refund_review_dry_run: {
        Args: {
          amount_cents?: number
          consumption_state?: string
          creator_obligation_state?: string
          creator_user_id?: string
          currency?: string
          policy_key: string
          source_id?: string
          source_type?: string
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
      creator_monetization_config_safe_row: {
        Args: {
          config_row: Database["public"]["Tables"]["creator_monetization_configs"]["Row"]
        }
        Returns: Json
      }
      creator_monetization_expected_source_type: {
        Args: { p_product_type: string }
        Returns: string
      }
      creator_vip_pass_offer_safe_row: {
        Args: {
          offer_row: Database["public"]["Tables"]["creator_vip_pass_offers"]["Row"]
        }
        Returns: Json
      }
      deny_autonomous_approval_request: {
        Args: { p_denial_reason: string; p_request_id: string }
        Returns: {
          action_id: string
          allowed_write_scope: Json
          approval_level: number
          approved_at: string | null
          approved_by: string | null
          created_at: string
          denial_reason: string | null
          denied_at: string | null
          denied_by: string | null
          execution_result: string | null
          expires_at: string
          forbidden_scope: Json
          id: string
          kill_switch_plan: string
          metadata: Json
          platform: string
          proof_plan: string
          proposed_action: string
          reason: string
          requested_by_actor_id: string | null
          requested_by_actor_type: string
          risk_summary: string
          rollback_plan: string
          status: string
          system_id: string
          title: string
          updated_at: string
          validation_plan: string
        }
        SetofOptions: {
          from: "*"
          to: "autonomous_approval_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      disable_chilly_chat_call_transition_retry: {
        Args: never
        Returns: boolean
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
      enforce_abuse_rate_limit: {
        Args: {
          p_action_key: string
          p_actor_user_id: string
          p_limit: number
          p_metadata?: Json
          p_target_key: string
          p_window_seconds: number
        }
        Returns: undefined
      }
      enqueue_media_scan_job: {
        Args: {
          p_metadata?: Json
          p_mime_type?: string
          p_owner_user_id: string
          p_priority?: number
          p_size_bytes?: number
          p_storage_bucket: string
          p_storage_object_key: string
          p_storage_provider: string
          p_target_column: string
          p_target_id: string
          p_target_table: string
        }
        Returns: string
      }
      expire_autonomous_approval_requests: { Args: never; Returns: number }
      expire_money_purchase_intents: { Args: never; Returns: number }
      first_owner_active_marker: {
        Args: never
        Returns: {
          established_at: string
          id: string
          owner_email: string
          owner_membership_id: number
          owner_user_id: string
        }[]
      }
      first_owner_authority_status: { Args: never; Returns: Json }
      first_owner_complete_self_step_down: {
        Args: {
          p_challenge_id: string
          p_passcode_hash: string
          p_reason: string
          p_typed_confirmation: string
        }
        Returns: Json
      }
      first_owner_create_self_step_down_challenge: {
        Args: {
          p_expires_at?: string
          p_passcode_hash: string
          p_passcode_salt: string
          p_reason: string
          p_successor_owner_email: string
        }
        Returns: Json
      }
      first_owner_grant_owner_by_email: {
        Args: { p_reason: string; p_target_email: string }
        Returns: Json
      }
      first_owner_hash_passcode: {
        Args: {
          p_action: string
          p_actor_user_id: string
          p_passcode: string
          p_salt: string
          p_successor_owner_membership_id: number
          p_target_owner_membership_id: number
        }
        Returns: string
      }
      first_owner_revoke_owner_by_email: {
        Args: { p_reason: string; p_target_email: string }
        Returns: Json
      }
      get_admin_content_config: { Args: never; Returns: Json }
      get_admin_media_scan_read_model: {
        Args: { p_limit?: number; p_status?: string }
        Returns: Json
      }
      get_admin_money_access_readout: { Args: never; Returns: Json }
      get_admin_report_detail: { Args: { p_report_id: number }; Returns: Json }
      get_admin_reports_overview: { Args: never; Returns: Json }
      get_admin_system_history_read_model: {
        Args: { p_limit?: number; p_source?: string }
        Returns: Json
      }
      get_admin_usage_detail_read_model: {
        Args: { p_limit?: number; p_section?: string }
        Returns: Json
      }
      get_admin_users_read_model: {
        Args: { p_limit?: number; p_query?: string }
        Returns: Json
      }
      get_autonomous_approval_request: {
        Args: { p_request_id: string }
        Returns: {
          action_id: string
          allowed_write_scope: Json
          approval_level: number
          approved_at: string | null
          approved_by: string | null
          created_at: string
          denial_reason: string | null
          denied_at: string | null
          denied_by: string | null
          execution_result: string | null
          expires_at: string
          forbidden_scope: Json
          id: string
          kill_switch_plan: string
          metadata: Json
          platform: string
          proof_plan: string
          proposed_action: string
          reason: string
          requested_by_actor_id: string | null
          requested_by_actor_type: string
          risk_summary: string
          rollback_plan: string
          status: string
          system_id: string
          title: string
          updated_at: string
          validation_plan: string
        }
        SetofOptions: {
          from: "*"
          to: "autonomous_approval_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_creator_tip_public_status: {
        Args: { p_creator_id: string }
        Returns: Json
      }
      get_ios_autonomous_call_retry_readback: { Args: never; Returns: Json }
      get_ios_autonomous_recovery_readback: { Args: never; Returns: Json }
      get_money_feature_flags_summary: {
        Args: never
        Returns: {
          display_label: string
          display_summary: string
          key: string
          public_safe: boolean
          state: string
          updated_at: string
        }[]
      }
      get_my_account_deletion_status: { Args: never; Returns: Json }
      get_my_creator_tip_settings: {
        Args: never
        Returns: {
          created_at: string
          creator_id: string
          currency: string
          default_amount_cents: number | null
          id: string
          last_provider_sync_at: string | null
          max_amount_cents: number
          metadata: Json
          min_amount_cents: number
          provider: string
          provider_account_id: string | null
          provider_charges_enabled: boolean
          provider_environment: string
          provider_onboarding_status: string
          provider_payouts_enabled: boolean
          status: string
          suggested_amounts_cents: number[]
          tips_enabled: boolean
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "creator_tip_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_my_money_purchase_intent: {
        Args: { p_intent_id: string }
        Returns: Json
      }
      get_my_refund_credit_summary: { Args: never; Returns: Json }
      get_my_tip_transaction_status: {
        Args: { p_tip_transaction_id: string }
        Returns: Json
      }
      get_or_create_direct_chat_thread: {
        Args: {
          p_target_avatar_url?: string
          p_target_display_name?: string
          p_target_tagline?: string
          p_target_user_id: string
        }
        Returns: {
          thread_id: string
        }[]
      }
      get_platform_money_kill_switches: {
        Args: never
        Returns: {
          created_at: string
          description: string
          display_label: string
          key: string
          latest_audit_at: string
          latest_audit_reason: string
          owner_only_reason: string
          reason: string
          state: string
          updated_at: string
          updated_by: string
        }[]
      }
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
      grant_sandbox_monetization_tester: {
        Args: {
          p_email?: string
          p_expires_at?: string
          p_note?: string
          p_user_id?: string
        }
        Returns: Json
      }
      has_access_grant: {
        Args: { p_grant_type: string; p_source_id: string; p_user_id?: string }
        Returns: Json
      }
      has_active_beta_access: { Args: never; Returns: boolean }
      has_active_premium_creator_tool_access: {
        Args: { target_user_id?: string }
        Returns: boolean
      }
      has_channel_audience_block_between: {
        Args: { p_user_a: string; p_user_b: string }
        Returns: boolean
      }
      has_event_pass_access: {
        Args: { p_event_id: string; p_user_id: string }
        Returns: Json
      }
      has_live_watch_party_access: {
        Args: { p_party_id: string; p_user_id: string }
        Returns: Json
      }
      has_live_watch_party_seat_eligibility: {
        Args: { p_party_id: string; p_user_id: string }
        Returns: Json
      }
      has_paid_content_access: {
        Args: { p_content_id: string; p_user_id: string }
        Returns: Json
      }
      has_platform_permission: {
        Args: { p_permission_key: string }
        Returns: boolean
      }
      has_platform_role: {
        Args: { required_roles: string[] }
        Returns: boolean
      }
      has_premium_access: { Args: { p_user_id?: string }; Returns: boolean }
      has_watch_party_live_ticket: {
        Args: { p_party_id: string; p_user_id: string }
        Returns: Json
      }
      hide_chat_thread_from_inbox: {
        Args: { p_thread_id: string }
        Returns: Json
      }
      is_account_access_restricted: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      is_account_deletion_publicly_hidden: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      is_account_deletion_scheduled: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      is_active_chilly_circle_member: {
        Args: { p_creator_user_id: string; p_member_user_id?: string }
        Returns: boolean
      }
      is_circle_spectator_viewer_blocked: {
        Args: { p_creator_user_id: string; p_viewer_user_id: string }
        Returns: boolean
      }
      is_creator_feed_viewer_blocked: {
        Args: { p_creator_user_id: string; p_viewer_user_id?: string }
        Returns: boolean
      }
      is_creator_replay_viewer_blocked: {
        Args: { p_owner_user_id: string; p_viewer_user_id?: string }
        Returns: boolean
      }
      is_creator_video_playable_source: {
        Args: {
          p_playback_url: string
          p_storage_object_key: string
          p_storage_path: string
        }
        Returns: boolean
      }
      is_creator_video_viewer_blocked: {
        Args: { p_owner_user_id: string; p_viewer_user_id?: string }
        Returns: boolean
      }
      is_current_platform_owner: { Args: never; Returns: boolean }
      is_first_owner: {
        Args: { p_actor_email?: string; p_actor_user_id?: string }
        Returns: boolean
      }
      is_money_feature_allowed: {
        Args: { p_key: string; p_require_live_money?: boolean }
        Returns: boolean
      }
      is_platform_owner_user: {
        Args: { target_user_id: string }
        Returns: boolean
      }
      is_username_available_for_user: {
        Args: { p_user_id?: string; p_username: string }
        Returns: boolean
      }
      is_username_blocked_word: {
        Args: { p_username: string }
        Returns: boolean
      }
      is_username_format_valid: {
        Args: { p_username: string }
        Returns: boolean
      }
      is_username_handle_format_valid: {
        Args: { p_username: string }
        Returns: boolean
      }
      is_username_reserved: { Args: { p_username: string }; Returns: boolean }
      list_account_purge_action_audit: {
        Args: { p_limit?: number; p_target_user_id: string }
        Returns: Json
      }
      list_account_purge_manual_review_items: {
        Args: { p_limit?: number; p_target_user_id?: string }
        Returns: Json
      }
      list_account_support_action_audit: {
        Args: { p_limit?: number; p_target_user_id: string }
        Returns: Json
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
      list_autonomous_approval_requests: {
        Args: { p_status?: string }
        Returns: {
          action_id: string
          allowed_write_scope: Json
          approval_level: number
          approved_at: string
          approved_by: string
          created_at: string
          denial_reason: string
          denied_at: string
          denied_by: string
          execution_result: string
          expires_at: string
          forbidden_scope: Json
          id: string
          kill_switch_plan: string
          metadata: Json
          proof_plan: string
          proposed_action: string
          reason: string
          requested_by_actor_id: string
          requested_by_actor_type: string
          risk_summary: string
          rollback_plan: string
          status: string
          system_id: string
          title: string
          updated_at: string
          validation_plan: string
        }[]
      }
      list_my_creator_channel_subscription_offers: {
        Args: never
        Returns: Json
      }
      list_my_creator_channel_subscription_transactions: {
        Args: { p_limit?: number }
        Returns: Json
      }
      list_my_creator_sandbox_monetization_configs: {
        Args: never
        Returns: Json
      }
      list_my_creator_tip_transactions: {
        Args: { p_limit?: number }
        Returns: {
          created_at: string
          creator_id: string
          creator_net_cents: number
          currency: string
          failed_at: string
          id: string
          message_private: string
          paid_at: string
          payment_status: string
          payout_status: string
          platform_fee_cents: number
          provider: string
          provider_checkout_session_id: string
          provider_environment: string
          provider_fee_cents: number
          provider_payment_intent_id: string
          refunded_at: string
          sender_id: string
          status: string
          tip_amount_cents: number
        }[]
      }
      list_my_creator_vip_pass_offers: { Args: never; Returns: Json }
      list_my_creator_vip_transactions: {
        Args: { p_limit?: number }
        Returns: Json
      }
      list_my_paid_creator_event_offers: { Args: never; Returns: Json }
      list_my_paid_creator_event_transactions: {
        Args: { p_limit?: number }
        Returns: Json
      }
      list_my_paid_video_offers: { Args: never; Returns: Json }
      list_my_paid_video_transactions: {
        Args: { p_limit?: number }
        Returns: Json
      }
      list_my_paid_watch_party_offers: { Args: never; Returns: Json }
      list_my_paid_watch_party_transactions: {
        Args: { p_limit?: number }
        Returns: Json
      }
      list_platform_money_kill_switch_audit: {
        Args: { p_limit?: number }
        Returns: {
          actor_user_id: string
          created_at: string
          id: string
          new_state: string
          old_state: string
          reason: string
          security_context_id: string
          switch_key: string
        }[]
      }
      list_sandbox_monetization_testers: {
        Args: never
        Returns: {
          createdAt: string
          createdBy: string
          email: string
          expiresAt: string
          id: string
          note: string
          revokedAt: string
          status: string
          updatedAt: string
          userId: string
        }[]
      }
      list_staff_scoped_permissions_by_email: {
        Args: { p_target_email: string }
        Returns: string[]
      }
      mark_autonomous_approval_preflight_result: {
        Args: {
          p_metadata?: Json
          p_passed: boolean
          p_request_id: string
          p_summary: string
        }
        Returns: {
          action_id: string
          allowed_write_scope: Json
          approval_level: number
          approved_at: string | null
          approved_by: string | null
          created_at: string
          denial_reason: string | null
          denied_at: string | null
          denied_by: string | null
          execution_result: string | null
          expires_at: string
          forbidden_scope: Json
          id: string
          kill_switch_plan: string
          metadata: Json
          platform: string
          proof_plan: string
          proposed_action: string
          reason: string
          requested_by_actor_id: string | null
          requested_by_actor_type: string
          risk_summary: string
          rollback_plan: string
          status: string
          system_id: string
          title: string
          updated_at: string
          validation_plan: string
        }
        SetofOptions: {
          from: "*"
          to: "autonomous_approval_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mark_autonomous_approval_request_executed: {
        Args: {
          p_action_id: string
          p_execution_result: string
          p_metadata?: Json
          p_request_id: string
          p_system_id: string
        }
        Returns: {
          action_id: string
          allowed_write_scope: Json
          approval_level: number
          approved_at: string | null
          approved_by: string | null
          created_at: string
          denial_reason: string | null
          denied_at: string | null
          denied_by: string | null
          execution_result: string | null
          expires_at: string
          forbidden_scope: Json
          id: string
          kill_switch_plan: string
          metadata: Json
          platform: string
          proof_plan: string
          proposed_action: string
          reason: string
          requested_by_actor_id: string | null
          requested_by_actor_type: string
          risk_summary: string
          rollback_plan: string
          status: string
          system_id: string
          title: string
          updated_at: string
          validation_plan: string
        }
        SetofOptions: {
          from: "*"
          to: "autonomous_approval_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      media_object_storage_migrate_verified_rows: {
        Args: { p_batch_id: string; p_updates: Json }
        Returns: Json
      }
      media_object_storage_reference_resolution_summary: {
        Args: never
        Returns: Json
      }
      media_object_storage_reference_resolutions_backup: {
        Args: never
        Returns: Json
      }
      media_object_storage_resolve_scan_job_refs: {
        Args: { p_batch_id: string; p_resolutions: Json }
        Returns: Json
      }
      media_scan_object_key_from_public_url: {
        Args: { bucket_name: string; media_url: string }
        Returns: string
      }
      media_scan_public_safe: {
        Args: { scan_status: string }
        Returns: boolean
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
      money_kill_switch_public_summary: {
        Args: { p_state: string }
        Returns: string
      }
      money_kill_switch_state_label: {
        Args: { p_state: string }
        Returns: string
      }
      money_purchase_intent_safe_row: {
        Args: {
          intent_row: Database["public"]["Tables"]["money_purchase_intents"]["Row"]
        }
        Returns: Json
      }
      normalize_tip_settings_status: {
        Args: {
          p_charges_enabled: boolean
          p_onboarding_status: string
          p_payouts_enabled: boolean
          p_tips_enabled: boolean
        }
        Returns: string
      }
      normalize_username_handle: {
        Args: { p_username: string }
        Returns: string
      }
      owner_security_center_table_status: { Args: never; Returns: Json }
      paid_creator_event_safe_row: {
        Args: {
          event_row: Database["public"]["Tables"]["paid_creator_events"]["Row"]
        }
        Returns: Json
      }
      paid_watch_party_offer_safe_row: {
        Args: {
          offer_row: Database["public"]["Tables"]["paid_watch_party_offers"]["Row"]
        }
        Returns: Json
      }
      platform_actor_should_write_app_audit: {
        Args: {
          p_actor_email: string
          p_actor_role: string
          p_actor_user_id: string
        }
        Returns: boolean
      }
      platform_admin_scope_legacy_aliases: {
        Args: { p_permission_key: string }
        Returns: string[]
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
      platform_first_owner_only_break_glass: {
        Args: { p_actor_email?: string; p_actor_user_id?: string }
        Returns: boolean
      }
      platform_first_owner_write_audit: {
        Args: {
          p_action: string
          p_actor_email: string
          p_actor_role: string
          p_actor_user_id: string
          p_metadata?: Json
          p_reason: string
          p_result: string
          p_target_email: string
          p_target_membership_id: number
          p_target_user_id: string
        }
        Returns: undefined
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
      process_revenuecat_consumable_event_atomic: {
        Args: {
          p_amount_minor: number
          p_currency: string
          p_environment: string
          p_event_type: string
          p_expires_at: string
          p_occurred_at: string
          p_original_transaction_id: string
          p_provider_event_id: string
          p_provider_product_id: string
          p_raw_payload_hash: string
          p_user_id: string
        }
        Returns: Json
      }
      process_revenuecat_consumable_event_atomic_internal: {
        Args: {
          p_amount_minor: number
          p_currency: string
          p_environment: string
          p_event_type: string
          p_expires_at: string
          p_failpoint?: string
          p_occurred_at: string
          p_original_transaction_id: string
          p_provider_event_id: string
          p_provider_product_id: string
          p_raw_payload_hash: string
          p_user_id: string
        }
        Returns: Json
      }
      process_revenuecat_premium_event_atomic: {
        Args: {
          p_amount_minor: number
          p_currency: string
          p_entitlement_status: string
          p_environment: string
          p_event_type: string
          p_expires_at: string
          p_occurred_at: string
          p_period_type: string
          p_platform: string
          p_product_id: string
          p_provider: string
          p_provider_base_plan_id: string
          p_provider_event_id: string
          p_provider_product_id: string
          p_raw_payload_hash: string
          p_starts_at: string
          p_store: string
          p_store_mapping_id: string
          p_user_id: string
        }
        Returns: Json
      }
      process_revenuecat_premium_event_atomic_internal: {
        Args: {
          p_amount_minor: number
          p_currency: string
          p_entitlement_status: string
          p_environment: string
          p_event_type: string
          p_expires_at: string
          p_failpoint?: string
          p_occurred_at: string
          p_period_type: string
          p_platform: string
          p_product_id: string
          p_provider: string
          p_provider_base_plan_id: string
          p_provider_event_id: string
          p_provider_product_id: string
          p_raw_payload_hash: string
          p_starts_at: string
          p_store: string
          p_store_mapping_id: string
          p_user_id: string
        }
        Returns: Json
      }
      public_people_search_is_internal_account_candidate: {
        Args: { p_display_name: string; p_user_id: string; p_username: string }
        Returns: boolean
      }
      publish_platform_brand_profile_assets: {
        Args: { p_asset_ids: string[]; p_reason?: string }
        Returns: Json
      }
      read_autonomous_system_emergency_states: {
        Args: never
        Returns: {
          metadata: Json
          reason: string | null
          status: string
          system_id: string
          updated_at: string
          updated_by: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "autonomous_system_emergency_states"
          isOneToOne: false
          isSetofReturn: true
        }
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
      reconcile_revenuecat_partial_provider_events: {
        Args: { p_limit?: number }
        Returns: {
          event_type: string
          missing_access_grant: boolean
          missing_billing_event: boolean
          missing_entitlement: boolean
          missing_ledger_event: boolean
          missing_purchase_intent_link: boolean
          product_key: string
          provider: string
          provider_event_id: string
          status: string
        }[]
      }
      record_autonomous_finding: {
        Args: {
          p_finding_type: string
          p_metadata?: Json
          p_platform: string
          p_provider?: string
          p_severity?: string
          p_system_id: string
          p_target_surface: string
        }
        Returns: string
      }
      record_content_rights_disclosure: {
        Args: {
          p_contains_third_party_content?: boolean
          p_contains_third_party_music?: boolean
          p_disclosure_note?: string
          p_policy_version?: string
          p_security_context_id?: string
          p_source_context?: Json
          p_surface: string
          p_target_id: string
          p_target_type: string
        }
        Returns: Json
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
      resolve_autonomous_findings: {
        Args: {
          p_active_finding_keys?: string[]
          p_platform: string
          p_system_id: string
        }
        Returns: number
      }
      resolve_creator_channel_subscription_access: {
        Args: { p_creator_id: string }
        Returns: Json
      }
      resolve_creator_content_access: {
        Args: { p_content_id: string; p_content_type: string }
        Returns: Json
      }
      resolve_creator_payout_hold_policy: {
        Args: {
          chargeback_window_cleared?: boolean
          creator_obligation_state?: string
          live_money_enabled?: boolean
          payouts_enabled?: boolean
          policy_key: string
          refund_window_cleared?: boolean
        }
        Returns: Json
      }
      resolve_creator_video_visibility_access: {
        Args: { p_video_id: string; p_viewer_user_id?: string }
        Returns: Json
      }
      resolve_creator_vip_pass_access: {
        Args: { p_creator_id: string }
        Returns: Json
      }
      resolve_money_access_room_entry: {
        Args: {
          p_party_id: string
          p_required_grant_type?: string
          p_user_id: string
        }
        Returns: Json
      }
      resolve_money_refund_policy: {
        Args: {
          consumption_state?: string
          creator_obligation_state?: string
          platform_fault?: boolean
          policy_key: string
          provider_or_legal_required?: boolean
        }
        Returns: Json
      }
      resolve_paid_creator_event_pass_access: {
        Args: { p_creator_event_id: string }
        Returns: Json
      }
      resolve_paid_watch_party_ticket_access: {
        Args: { p_party_id: string }
        Returns: Json
      }
      resolve_platform_visibility_access: {
        Args: { platform_owner_id: string; viewer_id?: string }
        Returns: Json
      }
      resolve_profile_platform_visibility_access: {
        Args: {
          p_owner_user_id: string
          p_surface: string
          p_viewer_user_id?: string
        }
        Returns: Json
      }
      resolve_profile_visibility_access: {
        Args: { profile_owner_id: string; viewer_id?: string }
        Returns: Json
      }
      resolve_sandbox_monetization_tester: {
        Args: { p_email?: string; p_user_id?: string }
        Returns: boolean
      }
      resolve_signup_profile_username: {
        Args: { p_metadata: Json; p_user_id: string }
        Returns: string
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
      restore_scheduled_account_deletion: { Args: never; Returns: Json }
      review_platform_brand_asset: {
        Args: { p_action: string; p_asset_id: string; p_reason?: string }
        Returns: Json
      }
      revoke_sandbox_monetization_tester: {
        Args: { p_email?: string; p_id?: string; p_user_id?: string }
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
      save_creator_sandbox_monetization_config: {
        Args: {
          p_display_name?: string
          p_metadata?: Json
          p_product_key: string
          p_source_id: string
          p_source_type: string
        }
        Returns: Json
      }
      schedule_account_deletion: {
        Args: { p_details?: string; p_reason?: string }
        Returns: Json
      }
      search_public_people: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          avatar_url: string
          display_name: string
          has_public_platform: boolean
          is_official: boolean
          official_label: string
          public_platform_id: string
          short_bio: string
          user_id: string
          username: string
        }[]
      }
      security_context_id_from_metadata: {
        Args: { p_metadata: Json }
        Returns: string
      }
      set_autonomous_system_emergency_state: {
        Args: {
          p_metadata?: Json
          p_reason: string
          p_status: string
          p_system_id: string
        }
        Returns: {
          metadata: Json
          reason: string | null
          status: string
          system_id: string
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "autonomous_system_emergency_states"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_creator_channel_subscription_offer: {
        Args: { p_description?: string; p_status?: string; p_title?: string }
        Returns: Json
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
      set_creator_vip_pass_offer: {
        Args: { p_description?: string; p_status?: string; p_title?: string }
        Returns: Json
      }
      set_paid_creator_event_offer: {
        Args: {
          p_capacity_limit?: number
          p_creator_event_id: string
          p_description?: string
          p_price_cents?: number
          p_status?: string
        }
        Returns: Json
      }
      set_paid_watch_party_offer: {
        Args: {
          p_party_id: string
          p_price_cents?: number
          p_seat_limit?: number
          p_status?: string
          p_title?: string
        }
        Returns: Json
      }
      set_platform_money_kill_switch_state: {
        Args: {
          p_key: string
          p_metadata?: Json
          p_owner_only_reason?: string
          p_reason: string
          p_state: string
        }
        Returns: Json
      }
      submit_account_deletion_request: {
        Args: { p_details?: string; p_reason?: string }
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
      sync_creator_video_feed_items: {
        Args: { p_video_id: string }
        Returns: Json
      }
      transition_chilly_chat_call_invite: {
        Args: {
          p_actor_user_id: string
          p_duration_seconds?: number
          p_invite_id: string
          p_target_status: string
        }
        Returns: Json
      }
      begin_chilly_chat_call: {
        Args: {
          p_call_type: string
          p_communication_room_id: string
          p_thread_id: string
        }
        Returns: Json
      }
      unhide_chat_thread_for_me: {
        Args: { p_thread_id: string }
        Returns: Json
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
      update_my_username: { Args: { p_username: string }; Returns: Json }
      upsert_my_creator_tip_settings: {
        Args: {
          p_currency?: string
          p_default_amount_cents?: number
          p_max_amount_cents?: number
          p_min_amount_cents?: number
          p_suggested_amounts_cents?: number[]
          p_tips_enabled: boolean
        }
        Returns: {
          created_at: string
          creator_id: string
          currency: string
          default_amount_cents: number | null
          id: string
          last_provider_sync_at: string | null
          max_amount_cents: number
          metadata: Json
          min_amount_cents: number
          provider: string
          provider_account_id: string | null
          provider_charges_enabled: boolean
          provider_environment: string
          provider_onboarding_status: string
          provider_payouts_enabled: boolean
          status: string
          suggested_amounts_cents: number[]
          tips_enabled: boolean
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "creator_tip_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      user_has_active_entitlement: {
        Args: { required_entitlement_keys: string[]; target_user_id: string }
        Returns: boolean
      }
      watch_party_room_actor_blocked_by_host: {
        Args: { p_actor_user_id: string; p_party_id: string }
        Returns: boolean
      }
      write_admin_search_audit: {
        Args: {
          p_event_name?: string
          p_metadata?: Json
          p_query: string
          p_reason?: string
          p_result_count?: number
          p_result_ref?: string
          p_search_scope: string
          p_status?: string
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
