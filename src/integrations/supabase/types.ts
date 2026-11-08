export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type UploadProgress = {
  id: string;
  user_id: string;
  status: "running" | "cancel_requested" | "cancelled" | "completed" | "failed";
  stage: string;
  message: string;
  current: number;
  total: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      upload_progress: {
        Row: UploadProgress;
        Insert: Pick<UploadProgress, "user_id"> & Partial<Omit<UploadProgress, "user_id">>;
        Update: Partial<UploadProgress>;
        Relationships: [];
      };
      chat_messages: {
        Row: {
          source_refs: Json;
          content: string;
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["chat_role"];
          user_id: string;
        };
        Insert: {
          source_refs?: Json;
          content: string;
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["chat_role"];
          user_id: string;
        };
        Update: {
          source_refs?: Json;
          content?: string;
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["chat_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      document_chunks: {
        Row: {
          chunk_index: number;
          content: string;
          created_at: string;
          document_id: string;
          embedding: string | null;
          source_title: string | null;
          source_url: string | null;
          id: string;
          user_id: string;
        };
        Insert: {
          chunk_index: number;
          content: string;
          created_at?: string;
          document_id: string;
          embedding?: string | null;
          source_title?: string | null;
          source_url?: string | null;
          id?: string;
          user_id: string;
        };
        Update: {
          chunk_index?: number;
          content?: string;
          created_at?: string;
          document_id?: string;
          embedding?: string | null;
          source_title?: string | null;
          source_url?: string | null;
          id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "document_chunks_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
        ];
      };
      documents: {
        Row: {
          chunk_count: number;
          created_at: string;
          error_message: string | null;
          id: string;
          name: string;
          status: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          chunk_count?: number;
          created_at?: string;
          error_message?: string | null;
          id?: string;
          name: string;
          status?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          chunk_count?: number;
          created_at?: string;
          error_message?: string | null;
          id?: string;
          name?: string;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      tasks: {
        Row: {
          ai_reason: string | null;
          calendar_event_url: string | null;
          calendar_exported_at: string | null;
          created_at: string;
          created_by: Database["public"]["Enums"]["task_origin"];
          description: string;
          due_date: string | null;
          estimate_minutes: number | null;
          id: string;
          position: number;
          priority: Database["public"]["Enums"]["task_priority"];
          status: Database["public"]["Enums"]["task_status"];
          tags: string[];
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          ai_reason?: string | null;
          calendar_event_url?: string | null;
          calendar_exported_at?: string | null;
          created_at?: string;
          created_by?: Database["public"]["Enums"]["task_origin"];
          description?: string;
          due_date?: string | null;
          estimate_minutes?: number | null;
          id?: string;
          position?: number;
          priority?: Database["public"]["Enums"]["task_priority"];
          status?: Database["public"]["Enums"]["task_status"];
          tags?: string[];
          title: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          ai_reason?: string | null;
          calendar_event_url?: string | null;
          calendar_exported_at?: string | null;
          created_at?: string;
          created_by?: Database["public"]["Enums"]["task_origin"];
          description?: string;
          due_date?: string | null;
          estimate_minutes?: number | null;
          id?: string;
          position?: number;
          priority?: Database["public"]["Enums"]["task_priority"];
          status?: Database["public"]["Enums"]["task_status"];
          tags?: string[];
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      append_suggested_tasks: { Args: { suggestions: Json }; Returns: number };
      search_documents: {
        Args: {
          search_terms: string[];
          search_phrase: string;
          result_limit?: number;
          overview?: boolean;
          source_id?: string;
        };
        Returns: {
          document_id: string;
          name: string;
          chunk_index: number;
          content: string;
          source_title: string | null;
          source_url: string | null;
        }[];
      };
      store_document: {
        Args: {
          document_name: string;
          chunks: string[];
          replace_existing?: boolean;
          progress_id?: string;
          chunk_details?: Json;
        };
        Returns: string;
      };
      match_document_chunks: {
        Args: { match_count?: number; query_embedding: string };
        Returns: {
          content: string;
          document_id: string;
          id: string;
          similarity: number;
        }[];
      };
    };
    Enums: {
      chat_role: "user" | "assistant";
      task_origin: "user" | "ai";
      task_priority: "high" | "medium" | "low";
      task_status: "todo" | "done";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      chat_role: ["user", "assistant"],
      task_origin: ["user", "ai"],
      task_priority: ["high", "medium", "low"],
      task_status: ["todo", "done"],
    },
  },
} as const;
