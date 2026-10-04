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
      brand_dna: {
        Row: {
          audience: string | null
          brand_name: string | null
          colors: Json
          competitors: string | null
          created_at: string
          extra_guidelines: string | null
          fonts: Json
          id: string
          logo_url: string | null
          mission: string | null
          tagline: string | null
          updated_at: string
          user_id: string
          value_props: string[]
          voice_tone: string | null
          voice_words_avoid: string[]
          voice_words_use: string[]
          website_url: string | null
        }
        Insert: {
          audience?: string | null
          brand_name?: string | null
          colors?: Json
          competitors?: string | null
          created_at?: string
          extra_guidelines?: string | null
          fonts?: Json
          id?: string
          logo_url?: string | null
          mission?: string | null
          tagline?: string | null
          updated_at?: string
          user_id: string
          value_props?: string[]
          voice_tone?: string | null
          voice_words_avoid?: string[]
          voice_words_use?: string[]
          website_url?: string | null
        }
        Update: {
          audience?: string | null
          brand_name?: string | null
          colors?: Json
          competitors?: string | null
          created_at?: string
          extra_guidelines?: string | null
          fonts?: Json
          id?: string
          logo_url?: string | null
          mission?: string | null
          tagline?: string | null
          updated_at?: string
          user_id?: string
          value_props?: string[]
          voice_tone?: string | null
          voice_words_avoid?: string[]
          voice_words_use?: string[]
          website_url?: string | null
        }
        Relationships: []
      }
      brand_dna_template_versions: {
        Row: {
          created_at: string
          data: Json
          id: string
          name: string
          template_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data?: Json
          id?: string
          name: string
          template_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          name?: string
          template_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_dna_template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "brand_dna_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_dna_templates: {
        Row: {
          created_at: string
          data: Json
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data?: Json
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      brand_profiles: {
        Row: {
          audience: Json
          brand_name: string | null
          colors: Json
          content_pillars: Json
          created_at: string
          domain: string
          id: string
          logo_url: string | null
          source_brief: Json | null
          tone: Json
          updated_at: string
          user_id: string
          visual_style: Json
        }
        Insert: {
          audience?: Json
          brand_name?: string | null
          colors?: Json
          content_pillars?: Json
          created_at?: string
          domain: string
          id?: string
          logo_url?: string | null
          source_brief?: Json | null
          tone?: Json
          updated_at?: string
          user_id: string
          visual_style?: Json
        }
        Update: {
          audience?: Json
          brand_name?: string | null
          colors?: Json
          content_pillars?: Json
          created_at?: string
          domain?: string
          id?: string
          logo_url?: string | null
          source_brief?: Json | null
          tone?: Json
          updated_at?: string
          user_id?: string
          visual_style?: Json
        }
        Relationships: []
      }
      client_error_logs: {
        Row: {
          colno: number | null
          context: Json
          created_at: string
          fingerprint: string | null
          id: string
          lineno: number | null
          message: string
          route: string | null
          severity: string
          source: string | null
          stack: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          colno?: number | null
          context?: Json
          created_at?: string
          fingerprint?: string | null
          id?: string
          lineno?: number | null
          message: string
          route?: string | null
          severity?: string
          source?: string | null
          stack?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          colno?: number | null
          context?: Json
          created_at?: string
          fingerprint?: string | null
          id?: string
          lineno?: number | null
          message?: string
          route?: string | null
          severity?: string
          source?: string | null
          stack?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      edge_function_logs: {
        Row: {
          context: Json
          created_at: string
          duration_ms: number | null
          fn: string
          id: string
          level: string
          message: string
          request_id: string | null
          user_id: string | null
        }
        Insert: {
          context?: Json
          created_at?: string
          duration_ms?: number | null
          fn: string
          id?: string
          level?: string
          message: string
          request_id?: string | null
          user_id?: string | null
        }
        Update: {
          context?: Json
          created_at?: string
          duration_ms?: number | null
          fn?: string
          id?: string
          level?: string
          message?: string
          request_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      library_items: {
        Row: {
          aspect_ratio: string | null
          brief: Json | null
          content_type: string | null
          created_at: string
          id: string
          kind: string
          label: string | null
          public_url: string | null
          storage_path: string
          user_id: string
        }
        Insert: {
          aspect_ratio?: string | null
          brief?: Json | null
          content_type?: string | null
          created_at?: string
          id?: string
          kind: string
          label?: string | null
          public_url?: string | null
          storage_path: string
          user_id: string
        }
        Update: {
          aspect_ratio?: string | null
          brief?: Json | null
          content_type?: string | null
          created_at?: string
          id?: string
          kind?: string
          label?: string | null
          public_url?: string | null
          storage_path?: string
          user_id?: string
        }
        Relationships: []
      }
      moodboard_images: {
        Row: {
          created_at: string
          id: string
          image_url: string
          moodboard_id: string
          position: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url: string
          moodboard_id: string
          position?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string
          moodboard_id?: string
          position?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "moodboard_images_moodboard_id_fkey"
            columns: ["moodboard_id"]
            isOneToOne: false
            referencedRelation: "moodboards"
            referencedColumns: ["id"]
          },
        ]
      }
      moodboards: {
        Row: {
          analysis: Json
          analyzed_at: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          analysis?: Json
          analyzed_at?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          analysis?: Json
          analyzed_at?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      performance_audits: {
        Row: {
          cls: number | null
          fcp_ms: number | null
          id: string
          inp_ms: number | null
          lcp_ms: number | null
          note: string | null
          performance_score: number | null
          raw: Json | null
          run_at: string
          speed_index_ms: number | null
          strategy: string
          tbt_ms: number | null
          ttfb_ms: number | null
          url: string
        }
        Insert: {
          cls?: number | null
          fcp_ms?: number | null
          id?: string
          inp_ms?: number | null
          lcp_ms?: number | null
          note?: string | null
          performance_score?: number | null
          raw?: Json | null
          run_at?: string
          speed_index_ms?: number | null
          strategy?: string
          tbt_ms?: number | null
          ttfb_ms?: number | null
          url: string
        }
        Update: {
          cls?: number | null
          fcp_ms?: number | null
          id?: string
          inp_ms?: number | null
          lcp_ms?: number | null
          note?: string | null
          performance_score?: number | null
          raw?: Json | null
          run_at?: string
          speed_index_ms?: number | null
          strategy?: string
          tbt_ms?: number | null
          ttfb_ms?: number | null
          url?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          extra_images: string[]
          hero_image_url: string | null
          id: string
          key_features: string[]
          last_imported_at: string | null
          name: string
          price_display: string | null
          source_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          extra_images?: string[]
          hero_image_url?: string | null
          id?: string
          key_features?: string[]
          last_imported_at?: string | null
          name: string
          price_display?: string | null
          source_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          extra_images?: string[]
          hero_image_url?: string | null
          id?: string
          key_features?: string[]
          last_imported_at?: string | null
          name?: string
          price_display?: string | null
          source_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          last_sign_in_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          last_sign_in_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          last_sign_in_at?: string | null
        }
        Relationships: []
      }
      scrape_domain_failures: {
        Row: {
          domain: string
          failure_count: number
          last_error: string | null
          last_failure_at: string
          updated_at: string
        }
        Insert: {
          domain: string
          failure_count?: number
          last_error?: string | null
          last_failure_at?: string
          updated_at?: string
        }
        Update: {
          domain?: string
          failure_count?: number
          last_error?: string | null
          last_failure_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      scrape_timings: {
        Row: {
          confidence_score: number | null
          created_at: string
          deep_pass_ms: number | null
          deep_pass_skipped: boolean | null
          domain: string
          emergency_pass_ms: number | null
          error_message: string | null
          fast_pass_ms: number | null
          had_error: boolean | null
          id: string
          total_ms: number
          url: string | null
          user_id: string | null
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string
          deep_pass_ms?: number | null
          deep_pass_skipped?: boolean | null
          domain: string
          emergency_pass_ms?: number | null
          error_message?: string | null
          fast_pass_ms?: number | null
          had_error?: boolean | null
          id?: string
          total_ms: number
          url?: string | null
          user_id?: string | null
        }
        Update: {
          confidence_score?: number | null
          created_at?: string
          deep_pass_ms?: number | null
          deep_pass_skipped?: boolean | null
          domain?: string
          emergency_pass_ms?: number | null
          error_message?: string | null
          fast_pass_ms?: number | null
          had_error?: boolean | null
          id?: string
          total_ms?: number
          url?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      seo_audits: {
        Row: {
          base_url: string
          error: string | null
          finished_at: string | null
          id: string
          run_at: string
          status: string
          total_findings: number
          totals_by_level: Json
        }
        Insert: {
          base_url: string
          error?: string | null
          finished_at?: string | null
          id?: string
          run_at?: string
          status?: string
          total_findings?: number
          totals_by_level?: Json
        }
        Update: {
          base_url?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          run_at?: string
          status?: string
          total_findings?: number
          totals_by_level?: Json
        }
        Relationships: []
      }
      seo_findings: {
        Row: {
          audit_id: string
          category: string
          created_at: string
          fix_hint: string | null
          id: string
          level: string
          message: string
          rule: string
          url: string | null
        }
        Insert: {
          audit_id: string
          category: string
          created_at?: string
          fix_hint?: string | null
          id?: string
          level: string
          message: string
          rule: string
          url?: string | null
        }
        Update: {
          audit_id?: string
          category?: string
          created_at?: string
          fix_hint?: string | null
          id?: string
          level?: string
          message?: string
          rule?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seo_findings_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "seo_audits"
            referencedColumns: ["id"]
          },
        ]
      }
      source_extracts: {
        Row: {
          confidence_score: number | null
          created_at: string
          id: string
          normalized_url: string
          raw_markdown: string | null
          screenshot_url: string | null
          source_brief: Json
          updated_at: string
          url: string
          url_hash: string
          user_id: string
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string
          id?: string
          normalized_url: string
          raw_markdown?: string | null
          screenshot_url?: string | null
          source_brief: Json
          updated_at?: string
          url: string
          url_hash: string
          user_id: string
        }
        Update: {
          confidence_score?: number | null
          created_at?: string
          id?: string
          normalized_url?: string
          raw_markdown?: string | null
          screenshot_url?: string | null
          source_brief?: Json
          updated_at?: string
          url?: string
          url_hash?: string
          user_id?: string
        }
        Relationships: []
      }
      speaker_aliases: {
        Row: {
          canonical: string
          created_at: string
          fingerprint: string
          first_key: string
          id: string
          last_seen_at: string
          seen_count: number
          user_id: string
        }
        Insert: {
          canonical: string
          created_at?: string
          fingerprint: string
          first_key?: string
          id?: string
          last_seen_at?: string
          seen_count?: number
          user_id: string
        }
        Update: {
          canonical?: string
          created_at?: string
          fingerprint?: string
          first_key?: string
          id?: string
          last_seen_at?: string
          seen_count?: number
          user_id?: string
        }
        Relationships: []
      }
      studio_projects: {
        Row: {
          created_at: string
          data: Json
          id: string
          is_autosave: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data?: Json
          id?: string
          is_autosave?: boolean
          name?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          is_autosave?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      diagnose_scrape_setup: { Args: never; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      pg_stat_statements_top: {
        Args: { limit_count?: number }
        Returns: {
          calls: number
          max_ms: number
          mean_ms: number
          query: string
          rows_avg: number
          total_ms: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
