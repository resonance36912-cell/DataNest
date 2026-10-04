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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      assembly_configs: {
        Row: {
          audio_enhancement: Json
          created_at: string
          filter: Json
          id: string
          name: string
          project_id: string
          scene_order: Json
          subtitles: Json
          title_cards: Json
          transitions: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          audio_enhancement?: Json
          created_at?: string
          filter?: Json
          id?: string
          name?: string
          project_id: string
          scene_order?: Json
          subtitles?: Json
          title_cards?: Json
          transitions?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          audio_enhancement?: Json
          created_at?: string
          filter?: Json
          id?: string
          name?: string
          project_id?: string
          scene_order?: Json
          subtitles?: Json
          title_cards?: Json
          transitions?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assembly_configs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          created_at: string
          entity_id: string | null
          entity_type: string | null
          event_type: string
          id: string
          payload: Json
          project_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_type: string
          id?: string
          payload?: Json
          project_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_type?: string
          id?: string
          payload?: Json
          project_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      characters: {
        Row: {
          accessories: string | null
          age_range: string | null
          confirmed: boolean
          created_at: string
          ethnicity: string | null
          extra_details: string | null
          facial_features: string | null
          gender: string | null
          hairstyle: string | null
          id: string
          name: string | null
          outfit: string | null
          project_id: string
          reference_image_url: string | null
          updated_at: string
          user_id: string
          vibe: string | null
        }
        Insert: {
          accessories?: string | null
          age_range?: string | null
          confirmed?: boolean
          created_at?: string
          ethnicity?: string | null
          extra_details?: string | null
          facial_features?: string | null
          gender?: string | null
          hairstyle?: string | null
          id?: string
          name?: string | null
          outfit?: string | null
          project_id: string
          reference_image_url?: string | null
          updated_at?: string
          user_id: string
          vibe?: string | null
        }
        Update: {
          accessories?: string | null
          age_range?: string | null
          confirmed?: boolean
          created_at?: string
          ethnicity?: string | null
          extra_details?: string | null
          facial_features?: string | null
          gender?: string | null
          hairstyle?: string | null
          id?: string
          name?: string | null
          outfit?: string | null
          project_id?: string
          reference_image_url?: string | null
          updated_at?: string
          user_id?: string
          vibe?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "characters_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      confidence_reports: {
        Row: {
          created_at: string
          file_name: string
          file_size_bytes: number | null
          format: string
          id: string
          project_id: string | null
          source: string
          storage_path: string
          summary: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_size_bytes?: number | null
          format: string
          id?: string
          project_id?: string | null
          source?: string
          storage_path: string
          summary?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_size_bytes?: number | null
          format?: string
          id?: string
          project_id?: string | null
          source?: string
          storage_path?: string
          summary?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      coupon_redemptions: {
        Row: {
          code: string
          created_at: string
          expires_at: string | null
          hub_response: Json
          id: string
          tier: string | null
          type: string
          user_id: string
          value_numeric: number | null
        }
        Insert: {
          code: string
          created_at?: string
          expires_at?: string | null
          hub_response?: Json
          id?: string
          tier?: string | null
          type: string
          user_id: string
          value_numeric?: number | null
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string | null
          hub_response?: Json
          id?: string
          tier?: string | null
          type?: string
          user_id?: string
          value_numeric?: number | null
        }
        Relationships: []
      }
      coupons: {
        Row: {
          active: boolean
          assigned_email: string | null
          code: string
          created_at: string
          created_by: string | null
          credits_amount: number | null
          discount_currency: string | null
          discount_kind: string | null
          discount_value: number | null
          expires_at: string | null
          id: string
          max_uses: number | null
          notes: string | null
          tier: string | null
          tier_duration_days: number | null
          type: string
          updated_at: string
          uses_count: number
        }
        Insert: {
          active?: boolean
          assigned_email?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          credits_amount?: number | null
          discount_currency?: string | null
          discount_kind?: string | null
          discount_value?: number | null
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          notes?: string | null
          tier?: string | null
          tier_duration_days?: number | null
          type: string
          updated_at?: string
          uses_count?: number
        }
        Update: {
          active?: boolean
          assigned_email?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          credits_amount?: number | null
          discount_currency?: string | null
          discount_kind?: string | null
          discount_value?: number | null
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          notes?: string | null
          tier?: string | null
          tier_duration_days?: number | null
          type?: string
          updated_at?: string
          uses_count?: number
        }
        Relationships: []
      }
      crash_reports: {
        Row: {
          context: Json
          created_at: string
          id: string
          note: string | null
          project_id: string | null
          report: string
          trace_id: string | null
          url: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          context?: Json
          created_at?: string
          id?: string
          note?: string | null
          project_id?: string | null
          report: string
          trace_id?: string | null
          url?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          context?: Json
          created_at?: string
          id?: string
          note?: string | null
          project_id?: string | null
          report?: string
          trace_id?: string | null
          url?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      credit_packs: {
        Row: {
          active: boolean
          created_at: string
          credits: number
          id: string
          label: string
          paddle_price_id: string | null
          play_product_id: string | null
          price_usd: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          credits: number
          id: string
          label: string
          paddle_price_id?: string | null
          play_product_id?: string | null
          price_usd: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          credits?: number
          id?: string
          label?: string
          paddle_price_id?: string | null
          play_product_id?: string | null
          price_usd?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      credit_topups: {
        Row: {
          amount: number
          created_at: string
          currency: string
          description: string | null
          external_id: string | null
          id: string
          pack_id: string | null
          paid_at: string
          raw_payload: Json | null
          source: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          description?: string | null
          external_id?: string | null
          id?: string
          pack_id?: string | null
          paid_at?: string
          raw_payload?: Json | null
          source?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          description?: string | null
          external_id?: string | null
          id?: string
          pack_id?: string | null
          paid_at?: string
          raw_payload?: Json | null
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_topups_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "credit_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      email_webhook_events: {
        Row: {
          created_at: string
          event_type: string | null
          headers: Json
          http_status: number | null
          id: string
          message_id: string | null
          processing_error: string | null
          raw_body: string | null
          raw_payload: Json
          reason: string | null
          recipient_email: string | null
          signature_valid: boolean
          source: string
        }
        Insert: {
          created_at?: string
          event_type?: string | null
          headers?: Json
          http_status?: number | null
          id?: string
          message_id?: string | null
          processing_error?: string | null
          raw_body?: string | null
          raw_payload?: Json
          reason?: string | null
          recipient_email?: string | null
          signature_valid?: boolean
          source?: string
        }
        Update: {
          created_at?: string
          event_type?: string | null
          headers?: Json
          http_status?: number | null
          id?: string
          message_id?: string | null
          processing_error?: string | null
          raw_body?: string | null
          raw_payload?: Json
          reason?: string | null
          recipient_email?: string | null
          signature_valid?: boolean
          source?: string
        }
        Relationships: []
      }
      export_bundles: {
        Row: {
          created_at: string
          file_size_bytes: number | null
          format: string
          id: string
          metadata: Json
          project_id: string
          storage_path: string | null
          transcript_version_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          file_size_bytes?: number | null
          format?: string
          id?: string
          metadata?: Json
          project_id: string
          storage_path?: string | null
          transcript_version_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          file_size_bytes?: number | null
          format?: string
          id?: string
          metadata?: Json
          project_id?: string
          storage_path?: string | null
          transcript_version_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "export_bundles_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "export_bundles_transcript_version_id_fkey"
            columns: ["transcript_version_id"]
            isOneToOne: false
            referencedRelation: "transcript_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      generation_jobs: {
        Row: {
          actual_duration_seconds: number | null
          created_at: string
          error_code: string | null
          error_message: string | null
          estimated_cost_gbp: number | null
          id: string
          idempotency_key: string | null
          input_payload: Json
          output_asset_url: string | null
          output_payload: Json
          progress: number
          project_id: string | null
          provider_model: string | null
          provider_name: string
          provider_operation: string
          provider_task_id: string | null
          response_url: string | null
          scene_number: number
          status: string
          status_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          actual_duration_seconds?: number | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          estimated_cost_gbp?: number | null
          id?: string
          idempotency_key?: string | null
          input_payload?: Json
          output_asset_url?: string | null
          output_payload?: Json
          progress?: number
          project_id?: string | null
          provider_model?: string | null
          provider_name?: string
          provider_operation?: string
          provider_task_id?: string | null
          response_url?: string | null
          scene_number?: number
          status?: string
          status_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          actual_duration_seconds?: number | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          estimated_cost_gbp?: number | null
          id?: string
          idempotency_key?: string | null
          input_payload?: Json
          output_asset_url?: string | null
          output_payload?: Json
          progress?: number
          project_id?: string | null
          provider_model?: string | null
          provider_name?: string
          provider_operation?: string
          provider_task_id?: string | null
          response_url?: string | null
          scene_number?: number
          status?: string
          status_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "generation_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      generation_metrics: {
        Row: {
          created_at: string
          duration_ms: number | null
          error_code: string | null
          estimated_cost_usd: number | null
          id: string
          model: string | null
          payload: Json
          project_id: string | null
          provider: string | null
          retries: number
          scene_number: number | null
          stage: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          error_code?: string | null
          estimated_cost_usd?: number | null
          id?: string
          model?: string | null
          payload?: Json
          project_id?: string | null
          provider?: string | null
          retries?: number
          scene_number?: number | null
          stage: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          error_code?: string | null
          estimated_cost_usd?: number | null
          id?: string
          model?: string | null
          payload?: Json
          project_id?: string | null
          provider?: string | null
          retries?: number
          scene_number?: number | null
          stage?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      lipsync_jobs: {
        Row: {
          actual_duration_seconds: number | null
          created_at: string
          error_message: string | null
          estimated_cost_gbp: number | null
          id: string
          idempotency_key: string | null
          output_url: string | null
          progress: number
          project_id: string | null
          provider: string
          provider_request_id: string | null
          raw_provider_status: Json | null
          response_url: string | null
          scene_number: number
          source_audio_path: string
          source_video_path: string
          status: string
          status_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          actual_duration_seconds?: number | null
          created_at?: string
          error_message?: string | null
          estimated_cost_gbp?: number | null
          id?: string
          idempotency_key?: string | null
          output_url?: string | null
          progress?: number
          project_id?: string | null
          provider?: string
          provider_request_id?: string | null
          raw_provider_status?: Json | null
          response_url?: string | null
          scene_number?: number
          source_audio_path: string
          source_video_path: string
          status?: string
          status_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          actual_duration_seconds?: number | null
          created_at?: string
          error_message?: string | null
          estimated_cost_gbp?: number | null
          id?: string
          idempotency_key?: string | null
          output_url?: string | null
          progress?: number
          project_id?: string | null
          provider?: string
          provider_request_id?: string | null
          raw_provider_status?: Json | null
          response_url?: string | null
          scene_number?: number
          source_audio_path?: string
          source_video_path?: string
          status?: string
          status_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lipsync_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      lyric_lines: {
        Row: {
          created_at: string
          duration_sec: number | null
          end_sec: number | null
          id: string
          line_index: number
          origin_line_id: string | null
          project_id: string
          start_sec: number | null
          text: string
          transcript_version_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_sec?: number | null
          end_sec?: number | null
          id?: string
          line_index?: number
          origin_line_id?: string | null
          project_id: string
          start_sec?: number | null
          text?: string
          transcript_version_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          duration_sec?: number | null
          end_sec?: number | null
          id?: string
          line_index?: number
          origin_line_id?: string | null
          project_id?: string
          start_sec?: number | null
          text?: string
          transcript_version_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lyric_lines_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lyric_lines_transcript_version_id_fkey"
            columns: ["transcript_version_id"]
            isOneToOne: false
            referencedRelation: "transcript_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      optimization_suggestions: {
        Row: {
          applied_at: string | null
          category: string
          created_at: string
          current_value: Json | null
          evidence: Json
          hub_suggestion_id: string | null
          id: string
          proposed_change: Json
          rationale: string
          reverted_at: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source: string
          status: Database["public"]["Enums"]["optimization_status"]
          suggested_value: Json | null
          target_key: string | null
          title: string
          updated_at: string
        }
        Insert: {
          applied_at?: string | null
          category: string
          created_at?: string
          current_value?: Json | null
          evidence?: Json
          hub_suggestion_id?: string | null
          id?: string
          proposed_change?: Json
          rationale: string
          reverted_at?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string
          status?: Database["public"]["Enums"]["optimization_status"]
          suggested_value?: Json | null
          target_key?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          applied_at?: string | null
          category?: string
          created_at?: string
          current_value?: Json | null
          evidence?: Json
          hub_suggestion_id?: string | null
          id?: string
          proposed_change?: Json
          rationale?: string
          reverted_at?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string
          status?: Database["public"]["Enums"]["optimization_status"]
          suggested_value?: Json | null
          target_key?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      perf_events: {
        Row: {
          action: string
          created_at: string
          duration_ms: number
          error_code: string | null
          id: string
          metadata: Json
          project_id: string | null
          provider: string | null
          status: Database["public"]["Enums"]["perf_event_status"]
          step: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          duration_ms: number
          error_code?: string | null
          id?: string
          metadata?: Json
          project_id?: string | null
          provider?: string | null
          status?: Database["public"]["Enums"]["perf_event_status"]
          step: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          duration_ms?: number
          error_code?: string | null
          id?: string
          metadata?: Json
          project_id?: string | null
          provider?: string | null
          status?: Database["public"]["Enums"]["perf_event_status"]
          step?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "perf_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_tunables: {
        Row: {
          created_at: string
          description: string | null
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          created_at?: string
          description?: string | null
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          created_at?: string
          description?: string | null
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          fallback_email: string | null
          fallback_email_verified_at: string | null
          hub_user_id: string | null
          id: string
          primary_identity_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          fallback_email?: string | null
          fallback_email_verified_at?: string | null
          hub_user_id?: string | null
          id?: string
          primary_identity_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          fallback_email?: string | null
          fallback_email_verified_at?: string | null
          hub_user_id?: string | null
          id?: string
          primary_identity_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          alignment_metrics: Json
          bpm: number | null
          created_at: string
          current_step: number
          energy: string | null
          file_path: string | null
          file_type: string | null
          id: string
          instruments: string[] | null
          lyrics: string | null
          mood: string | null
          music_key: string | null
          name: string
          prompt_filter_settings: Json
          reference_transcript: string | null
          segment_count: number
          source_of_truth: string
          status: Database["public"]["Enums"]["project_status"]
          track_details: Json
          transcript_lock_status: string
          transcript_quality_status: string
          updated_at: string
          user_id: string
          waveform_peaks: Json | null
        }
        Insert: {
          alignment_metrics?: Json
          bpm?: number | null
          created_at?: string
          current_step?: number
          energy?: string | null
          file_path?: string | null
          file_type?: string | null
          id?: string
          instruments?: string[] | null
          lyrics?: string | null
          mood?: string | null
          music_key?: string | null
          name: string
          prompt_filter_settings?: Json
          reference_transcript?: string | null
          segment_count?: number
          source_of_truth?: string
          status?: Database["public"]["Enums"]["project_status"]
          track_details?: Json
          transcript_lock_status?: string
          transcript_quality_status?: string
          updated_at?: string
          user_id: string
          waveform_peaks?: Json | null
        }
        Update: {
          alignment_metrics?: Json
          bpm?: number | null
          created_at?: string
          current_step?: number
          energy?: string | null
          file_path?: string | null
          file_type?: string | null
          id?: string
          instruments?: string[] | null
          lyrics?: string | null
          mood?: string | null
          music_key?: string | null
          name?: string
          prompt_filter_settings?: Json
          reference_transcript?: string | null
          segment_count?: number
          source_of_truth?: string
          status?: Database["public"]["Enums"]["project_status"]
          track_details?: Json
          transcript_lock_status?: string
          transcript_quality_status?: string
          updated_at?: string
          user_id?: string
          waveform_peaks?: Json | null
        }
        Relationships: []
      }
      provider_credit_activity: {
        Row: {
          balance_after: number | null
          balance_before: number | null
          created_at: string
          delta: number | null
          event_type: string
          id: string
          note: string | null
          provider_id: string
          provider_name: string
          raw_balance: string | null
          user_id: string
        }
        Insert: {
          balance_after?: number | null
          balance_before?: number | null
          created_at?: string
          delta?: number | null
          event_type: string
          id?: string
          note?: string | null
          provider_id: string
          provider_name: string
          raw_balance?: string | null
          user_id: string
        }
        Update: {
          balance_after?: number | null
          balance_before?: number | null
          created_at?: string
          delta?: number | null
          event_type?: string
          id?: string
          note?: string | null
          provider_id?: string
          provider_name?: string
          raw_balance?: string | null
          user_id?: string
        }
        Relationships: []
      }
      provider_health: {
        Row: {
          created_at: string
          error_rate: number | null
          id: string
          last_check_at: string
          latency_ms: number | null
          metadata: Json
          provider_name: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          error_rate?: number | null
          id?: string
          last_check_at?: string
          latency_ms?: number | null
          metadata?: Json
          provider_name: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          error_rate?: number | null
          id?: string
          last_check_at?: string
          latency_ms?: number | null
          metadata?: Json
          provider_name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      qc_reports: {
        Row: {
          created_at: string
          id: string
          issues: Json
          passed: boolean
          project_id: string
          recommendations: Json
          score: number | null
          transcript_version_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          issues?: Json
          passed?: boolean
          project_id: string
          recommendations?: Json
          score?: number | null
          transcript_version_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          issues?: Json
          passed?: boolean
          project_id?: string
          recommendations?: Json
          score?: number | null
          transcript_version_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "qc_reports_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_reports_transcript_version_id_fkey"
            columns: ["transcript_version_id"]
            isOneToOne: false
            referencedRelation: "transcript_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      render_job_events: {
        Row: {
          created_at: string
          from_value: string | null
          id: string
          kind: string
          payload: Json
          render_job_id: string
          source: string | null
          to_value: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          from_value?: string | null
          id?: string
          kind: string
          payload?: Json
          render_job_id: string
          source?: string | null
          to_value?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          from_value?: string | null
          id?: string
          kind?: string
          payload?: Json
          render_job_id?: string
          source?: string | null
          to_value?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "render_job_events_render_job_id_fkey"
            columns: ["render_job_id"]
            isOneToOne: false
            referencedRelation: "render_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      render_jobs: {
        Row: {
          actual_duration_seconds: number | null
          assembly_profile_used: string | null
          created_at: string
          error: string | null
          estimated_cost_gbp: number | null
          final_output_metadata: Json | null
          final_output_url: string | null
          id: string
          idempotency_key: string | null
          input: Json
          merge_error_log: string | null
          merge_status: string | null
          output: Json
          progress: number
          project_id: string | null
          provider: string
          provider_task_id: string | null
          quality: string
          response_url: string | null
          retry_count: number
          scene_number: number
          status: string
          status_url: string | null
          tracking_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          actual_duration_seconds?: number | null
          assembly_profile_used?: string | null
          created_at?: string
          error?: string | null
          estimated_cost_gbp?: number | null
          final_output_metadata?: Json | null
          final_output_url?: string | null
          id?: string
          idempotency_key?: string | null
          input?: Json
          merge_error_log?: string | null
          merge_status?: string | null
          output?: Json
          progress?: number
          project_id?: string | null
          provider?: string
          provider_task_id?: string | null
          quality?: string
          response_url?: string | null
          retry_count?: number
          scene_number: number
          status?: string
          status_url?: string | null
          tracking_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          actual_duration_seconds?: number | null
          assembly_profile_used?: string | null
          created_at?: string
          error?: string | null
          estimated_cost_gbp?: number | null
          final_output_metadata?: Json | null
          final_output_url?: string | null
          id?: string
          idempotency_key?: string | null
          input?: Json
          merge_error_log?: string | null
          merge_status?: string | null
          output?: Json
          progress?: number
          project_id?: string | null
          provider?: string
          provider_task_id?: string | null
          quality?: string
          response_url?: string | null
          retry_count?: number
          scene_number?: number
          status?: string
          status_url?: string | null
          tracking_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "render_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      render_segments: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          media_metadata: Json
          output_asset_url: string | null
          render_job_id: string
          retry_count: number
          scene_number: number
          segment_index: number
          started_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          media_metadata?: Json
          output_asset_url?: string | null
          render_job_id: string
          retry_count?: number
          scene_number: number
          segment_index?: number
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          media_metadata?: Json
          output_asset_url?: string | null
          render_job_id?: string
          retry_count?: number
          scene_number?: number
          segment_index?: number
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "render_segments_render_job_id_fkey"
            columns: ["render_job_id"]
            isOneToOne: false
            referencedRelation: "render_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      rop_sync_state: {
        Row: {
          last_attempt_at: string | null
          last_cursor: Json | null
          last_error: string | null
          last_synced_at: string | null
          scope: string
          updated_at: string
        }
        Insert: {
          last_attempt_at?: string | null
          last_cursor?: Json | null
          last_error?: string | null
          last_synced_at?: string | null
          scope: string
          updated_at?: string
        }
        Update: {
          last_attempt_at?: string | null
          last_cursor?: Json | null
          last_error?: string | null
          last_synced_at?: string | null
          scope?: string
          updated_at?: string
        }
        Relationships: []
      }
      scene_qa_jobs: {
        Row: {
          attempt: number
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          input: Json | null
          kind: string
          output: Json | null
          progress: number
          project_id: string
          request_id: string | null
          scene_id: string
          started_at: string | null
          status: string
          triggered_by: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          attempt?: number
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          input?: Json | null
          kind: string
          output?: Json | null
          progress?: number
          project_id: string
          request_id?: string | null
          scene_id: string
          started_at?: string | null
          status?: string
          triggered_by?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          attempt?: number
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          input?: Json | null
          kind?: string
          output?: Json | null
          progress?: number
          project_id?: string
          request_id?: string | null
          scene_id?: string
          started_at?: string | null
          status?: string
          triggered_by?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      scenes: {
        Row: {
          action_description: string | null
          base_video_url: string | null
          camera_style: string | null
          character_id: string | null
          created_at: string
          enhanced_video_url: string | null
          id: string
          is_broll: boolean
          last_generation_error: string | null
          lipsync_video_url: string | null
          location: string | null
          lyric_segment: string | null
          mood: string | null
          performance_video_url: string | null
          project_id: string
          provider_model: string | null
          provider_name: string | null
          qa_checked_at: string | null
          qa_report: Json | null
          qa_review_note: string | null
          qa_review_status: string
          qa_reviewed_at: string | null
          qa_reviewed_by: string | null
          qa_status: string
          runway_task_id: string | null
          scene_image_url: string | null
          scene_number: number
          section_index: number | null
          section_type: string | null
          segment_audio_path: string | null
          segment_audio_url: string | null
          segment_lyrics: string | null
          time_end: string | null
          time_start: string | null
          tracking_id: string | null
          updated_at: string
          user_id: string
          video_quality: string | null
          video_url: string | null
          visual_prompt: string | null
        }
        Insert: {
          action_description?: string | null
          base_video_url?: string | null
          camera_style?: string | null
          character_id?: string | null
          created_at?: string
          enhanced_video_url?: string | null
          id?: string
          is_broll?: boolean
          last_generation_error?: string | null
          lipsync_video_url?: string | null
          location?: string | null
          lyric_segment?: string | null
          mood?: string | null
          performance_video_url?: string | null
          project_id: string
          provider_model?: string | null
          provider_name?: string | null
          qa_checked_at?: string | null
          qa_report?: Json | null
          qa_review_note?: string | null
          qa_review_status?: string
          qa_reviewed_at?: string | null
          qa_reviewed_by?: string | null
          qa_status?: string
          runway_task_id?: string | null
          scene_image_url?: string | null
          scene_number: number
          section_index?: number | null
          section_type?: string | null
          segment_audio_path?: string | null
          segment_audio_url?: string | null
          segment_lyrics?: string | null
          time_end?: string | null
          time_start?: string | null
          tracking_id?: string | null
          updated_at?: string
          user_id: string
          video_quality?: string | null
          video_url?: string | null
          visual_prompt?: string | null
        }
        Update: {
          action_description?: string | null
          base_video_url?: string | null
          camera_style?: string | null
          character_id?: string | null
          created_at?: string
          enhanced_video_url?: string | null
          id?: string
          is_broll?: boolean
          last_generation_error?: string | null
          lipsync_video_url?: string | null
          location?: string | null
          lyric_segment?: string | null
          mood?: string | null
          performance_video_url?: string | null
          project_id?: string
          provider_model?: string | null
          provider_name?: string | null
          qa_checked_at?: string | null
          qa_report?: Json | null
          qa_review_note?: string | null
          qa_review_status?: string
          qa_reviewed_at?: string | null
          qa_reviewed_by?: string | null
          qa_status?: string
          runway_task_id?: string | null
          scene_image_url?: string | null
          scene_number?: number
          section_index?: number | null
          section_type?: string | null
          segment_audio_path?: string | null
          segment_audio_url?: string | null
          segment_lyrics?: string | null
          time_end?: string | null
          time_start?: string | null
          tracking_id?: string | null
          updated_at?: string
          user_id?: string
          video_quality?: string | null
          video_url?: string | null
          visual_prompt?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scenes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      security_events: {
        Row: {
          correlation_id: string | null
          created_at: string
          function_name: string | null
          http_status: number | null
          id: string
          kind: string
          metadata: Json
          outcome: string
          reason: string
          target: string | null
          user_id: string | null
        }
        Insert: {
          correlation_id?: string | null
          created_at?: string
          function_name?: string | null
          http_status?: number | null
          id?: string
          kind: string
          metadata?: Json
          outcome?: string
          reason: string
          target?: string | null
          user_id?: string | null
        }
        Update: {
          correlation_id?: string | null
          created_at?: string
          function_name?: string | null
          http_status?: number | null
          id?: string
          kind?: string
          metadata?: Json
          outcome?: string
          reason?: string
          target?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      security_findings: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          external_id: string | null
          id: string
          metadata: Json
          remediation: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: Database["public"]["Enums"]["security_finding_severity"]
          status: Database["public"]["Enums"]["security_finding_status"]
          title: string
          tool: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          external_id?: string | null
          id?: string
          metadata?: Json
          remediation?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: Database["public"]["Enums"]["security_finding_severity"]
          status?: Database["public"]["Enums"]["security_finding_status"]
          title: string
          tool: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          external_id?: string | null
          id?: string
          metadata?: Json
          remediation?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: Database["public"]["Enums"]["security_finding_severity"]
          status?: Database["public"]["Enums"]["security_finding_status"]
          title?: string
          tool?: string
          updated_at?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      system_alerts: {
        Row: {
          acknowledged: boolean
          acknowledged_at: string | null
          acknowledged_by: string | null
          created_at: string
          id: string
          message: string
          metadata: Json
          severity: string
          source: string
          title: string
          updated_at: string
        }
        Insert: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          id?: string
          message: string
          metadata?: Json
          severity?: string
          source: string
          title: string
          updated_at?: string
        }
        Update: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          id?: string
          message?: string
          metadata?: Json
          severity?: string
          source?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      transcript_versions: {
        Row: {
          created_at: string
          full_text: string | null
          id: string
          notes: string | null
          project_id: string
          raw_payload: Json
          source_version_id: string | null
          status: string
          type: string
          updated_at: string
          user_id: string
          version_number: number
        }
        Insert: {
          created_at?: string
          full_text?: string | null
          id?: string
          notes?: string | null
          project_id: string
          raw_payload?: Json
          source_version_id?: string | null
          status?: string
          type?: string
          updated_at?: string
          user_id: string
          version_number?: number
        }
        Update: {
          created_at?: string
          full_text?: string | null
          id?: string
          notes?: string | null
          project_id?: string
          raw_payload?: Json
          source_version_id?: string | null
          status?: string
          type?: string
          updated_at?: string
          user_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "transcript_versions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transcript_versions_source_version_id_fkey"
            columns: ["source_version_id"]
            isOneToOne: false
            referencedRelation: "transcript_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      transcription_cache: {
        Row: {
          created_at: string
          file_hash: string
          hit_count: number
          id: string
          last_used_at: string
          mode: string
          result: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          file_hash: string
          hit_count?: number
          id?: string
          last_used_at?: string
          mode: string
          result: Json
          user_id: string
        }
        Update: {
          created_at?: string
          file_hash?: string
          hit_count?: number
          id?: string
          last_used_at?: string
          mode?: string
          result?: Json
          user_id?: string
        }
        Relationships: []
      }
      user_credits: {
        Row: {
          balance: number
          created_at: string
          currency: string
          id: string
          total_spent: number
          total_topped_up: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          currency?: string
          id?: string
          total_spent?: number
          total_topped_up?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          currency?: string
          id?: string
          total_spent?: number
          total_topped_up?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      verification_cache: {
        Row: {
          content_hash: string
          created_at: string
          hit_count: number
          id: string
          last_used_at: string
          mode: string
          result: Json
          user_id: string
        }
        Insert: {
          content_hash: string
          created_at?: string
          hit_count?: number
          id?: string
          last_used_at?: string
          mode?: string
          result: Json
          user_id: string
        }
        Update: {
          content_hash?: string
          created_at?: string
          hit_count?: number
          id?: string
          last_used_at?: string
          mode?: string
          result?: Json
          user_id?: string
        }
        Relationships: []
      }
      word_tokens: {
        Row: {
          confidence: number | null
          created_at: string
          duration_sec: number | null
          end_sec: number
          gap_after: number | null
          id: string
          lyric_line_id: string
          ordinal_index: number
          origin_word_id: string | null
          start_sec: number
          text: string
          updated_at: string
          user_id: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          duration_sec?: number | null
          end_sec?: number
          gap_after?: number | null
          id?: string
          lyric_line_id: string
          ordinal_index?: number
          origin_word_id?: string | null
          start_sec?: number
          text?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          duration_sec?: number | null
          end_sec?: number
          gap_after?: number | null
          id?: string
          lyric_line_id?: string
          ordinal_index?: number
          origin_word_id?: string | null
          start_sec?: number
          text?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "word_tokens_lyric_line_id_fkey"
            columns: ["lyric_line_id"]
            isOneToOne: false
            referencedRelation: "lyric_lines"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      atomic_switch_active_transcript: {
        Args: { p_new_version_id: string; p_project_id: string }
        Returns: undefined
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      fork_transcript_version: {
        Args: {
          p_edits?: Json
          p_project_id: string
          p_source_version_id: string
        }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_coupon_usage: {
        Args: { p_coupon_id: string }
        Returns: {
          active: boolean
          code: string
          created_at: string
          created_by: string | null
          credits_amount: number | null
          discount_currency: string | null
          discount_kind: string | null
          discount_value: number | null
          expires_at: string | null
          id: string
          max_uses: number | null
          notes: string | null
          tier: string | null
          tier_duration_days: number | null
          type: string
          updated_at: string
          uses_count: number
        }
        SetofOptions: {
          from: "*"
          to: "coupons"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      redeem_local_coupon: {
        Args: {
          p_code: string
          p_user_email: string
          p_user_id: string
          p_validate?: boolean
        }
        Returns: Json
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      transcription_qa_summary: {
        Args: { p_limit?: number }
        Returns: {
          audio_duration_sec: number
          avg_confidence: number
          avg_line_duration_sec: number
          covered_sec: number
          created_at: string
          has_error: boolean
          lines_count: number
          project_id: string
          project_title: string
          status: string
          type: string
          user_id: string
          version_id: string
          version_number: number
          words_count: number
          words_missing_timing: number
        }[]
      }
      trigger_segment_retry: {
        Args: { p_job_id: string; p_project_id: string; p_segment_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      optimization_status:
        | "pending"
        | "approved"
        | "rejected"
        | "applied"
        | "reverted"
      perf_event_status: "ok" | "error" | "timeout"
      project_status: "draft" | "processing" | "completed" | "failed"
      security_finding_severity: "info" | "low" | "medium" | "high" | "critical"
      security_finding_status: "open" | "fixed" | "accepted" | "ignored"
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
    Enums: {
      app_role: ["admin", "moderator", "user"],
      optimization_status: [
        "pending",
        "approved",
        "rejected",
        "applied",
        "reverted",
      ],
      perf_event_status: ["ok", "error", "timeout"],
      project_status: ["draft", "processing", "completed", "failed"],
      security_finding_severity: ["info", "low", "medium", "high", "critical"],
      security_finding_status: ["open", "fixed", "accepted", "ignored"],
    },
  },
} as const
