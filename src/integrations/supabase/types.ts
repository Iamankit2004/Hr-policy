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
  public: {
    Tables: {
      document_chunks: {
        Row: {
          chunk_index: number
          chunk_key: string
          content: string
          created_at: string
          document_id: string
          embedding: string | null
          heading_path: string | null
          id: string
          page_number: number | null
          section: string | null
          subsection: string | null
          token_estimate: number
          version: number
        }
        Insert: {
          chunk_index: number
          chunk_key: string
          content: string
          created_at?: string
          document_id: string
          embedding?: string | null
          heading_path?: string | null
          id?: string
          page_number?: number | null
          section?: string | null
          subsection?: string | null
          token_estimate?: number
          version?: number
        }
        Update: {
          chunk_index?: number
          chunk_key?: string
          content?: string
          created_at?: string
          document_id?: string
          embedding?: string | null
          heading_path?: string | null
          id?: string
          page_number?: number | null
          section?: string | null
          subsection?: string | null
          token_estimate?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          byte_size: number
          checksum: string
          chunk_count: number
          created_at: string
          error_message: string | null
          file_type: string
          filename: string
          id: string
          indexed_at: string | null
          raw_text: string
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          byte_size?: number
          checksum: string
          chunk_count?: number
          created_at?: string
          error_message?: string | null
          file_type: string
          filename: string
          id?: string
          indexed_at?: string | null
          raw_text?: string
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          byte_size?: number
          checksum?: string
          chunk_count?: number
          created_at?: string
          error_message?: string | null
          file_type?: string
          filename?: string
          id?: string
          indexed_at?: string | null
          raw_text?: string
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      query_logs: {
        Row: {
          chunks_considered: number
          citations_count: number
          created_at: string
          id: string
          latency_ms: number
          question: string
          status: string
          top_score: number | null
        }
        Insert: {
          chunks_considered?: number
          citations_count?: number
          created_at?: string
          id?: string
          latency_ms?: number
          question: string
          status: string
          top_score?: number | null
        }
        Update: {
          chunks_considered?: number
          citations_count?: number
          created_at?: string
          id?: string
          latency_ms?: number
          question?: string
          status?: string
          top_score?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      keyword_policy_chunks: {
        Args: { match_count?: number; query_text: string }
        Returns: {
          chunk_id: string
          chunk_key: string
          content: string
          document_id: string
          filename: string
          heading_path: string
          page_number: number
          rank: number
          section: string
          subsection: string
          version: number
        }[]
      }
      match_policy_chunks: {
        Args: { match_count?: number; query_embedding: string }
        Returns: {
          chunk_id: string
          chunk_key: string
          content: string
          document_id: string
          filename: string
          heading_path: string
          page_number: number
          section: string
          similarity: number
          subsection: string
          version: number
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
