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
      bot_config: {
        Row: {
          created_at: string
          enabled: boolean
          enabled_categories: string[]
          exit_before_resolution_hours: number
          id: string
          max_bet_percent: number
          max_markets_to_scan: number
          min_edge: number
          simulation_mode: boolean
          stop_loss_percent: number
          take_profit_percent: number
          updated_at: string
          user_address: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          enabled_categories?: string[]
          exit_before_resolution_hours?: number
          id?: string
          max_bet_percent?: number
          max_markets_to_scan?: number
          min_edge?: number
          simulation_mode?: boolean
          stop_loss_percent?: number
          take_profit_percent?: number
          updated_at?: string
          user_address: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          enabled_categories?: string[]
          exit_before_resolution_hours?: number
          id?: string
          max_bet_percent?: number
          max_markets_to_scan?: number
          min_edge?: number
          simulation_mode?: boolean
          stop_loss_percent?: number
          take_profit_percent?: number
          updated_at?: string
          user_address?: string
        }
        Relationships: []
      }
      bot_external_data_cache: {
        Row: {
          data: Json
          fetched_at: string
          market_id: string
        }
        Insert: {
          data?: Json
          fetched_at?: string
          market_id: string
        }
        Update: {
          data?: Json
          fetched_at?: string
          market_id?: string
        }
        Relationships: []
      }
      bot_opportunities: {
        Row: {
          ai_probability: number
          ai_reasoning: string | null
          category: string | null
          condition_id: string
          created_at: string
          edge: number
          event_slug: string | null
          executed: boolean
          expires_at: string
          external_data: Json | null
          external_url: string | null
          id: string
          market_id: string
          market_price: number
          outcome: string
          question: string
          status: string
          suggested_action: string | null
          suggested_entry: number | null
          suggested_stop_loss: number | null
          suggested_take_profit: number | null
          token_id: string | null
          user_address: string
        }
        Insert: {
          ai_probability: number
          ai_reasoning?: string | null
          category?: string | null
          condition_id: string
          created_at?: string
          edge: number
          event_slug?: string | null
          executed?: boolean
          expires_at?: string
          external_data?: Json | null
          external_url?: string | null
          id?: string
          market_id: string
          market_price: number
          outcome?: string
          question: string
          status?: string
          suggested_action?: string | null
          suggested_entry?: number | null
          suggested_stop_loss?: number | null
          suggested_take_profit?: number | null
          token_id?: string | null
          user_address: string
        }
        Update: {
          ai_probability?: number
          ai_reasoning?: string | null
          category?: string | null
          condition_id?: string
          created_at?: string
          edge?: number
          event_slug?: string | null
          executed?: boolean
          expires_at?: string
          external_data?: Json | null
          external_url?: string | null
          id?: string
          market_id?: string
          market_price?: number
          outcome?: string
          question?: string
          status?: string
          suggested_action?: string | null
          suggested_entry?: number | null
          suggested_stop_loss?: number | null
          suggested_take_profit?: number | null
          token_id?: string | null
          user_address?: string
        }
        Relationships: []
      }
      bot_trades: {
        Row: {
          condition_id: string
          created_at: string
          current_price: number | null
          entry_price: number
          error_message: string | null
          exit_price: number | null
          exit_reason: string | null
          exited: boolean
          id: string
          market_id: string
          opportunity_id: string | null
          order_id: string | null
          outcome: string
          pnl: number | null
          question: string
          side: string
          simulation: boolean
          size: number
          status: string
          token_id: string | null
          updated_at: string
          user_address: string
        }
        Insert: {
          condition_id: string
          created_at?: string
          current_price?: number | null
          entry_price: number
          error_message?: string | null
          exit_price?: number | null
          exit_reason?: string | null
          exited?: boolean
          id?: string
          market_id: string
          opportunity_id?: string | null
          order_id?: string | null
          outcome?: string
          pnl?: number | null
          question: string
          side?: string
          simulation?: boolean
          size: number
          status?: string
          token_id?: string | null
          updated_at?: string
          user_address: string
        }
        Update: {
          condition_id?: string
          created_at?: string
          current_price?: number | null
          entry_price?: number
          error_message?: string | null
          exit_price?: number | null
          exit_reason?: string | null
          exited?: boolean
          id?: string
          market_id?: string
          opportunity_id?: string | null
          order_id?: string | null
          outcome?: string
          pnl?: number | null
          question?: string
          side?: string
          simulation?: boolean
          size?: number
          status?: string
          token_id?: string | null
          updated_at?: string
          user_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_trades_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "bot_opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      market_comments: {
        Row: {
          body: string
          condition_id: string
          created_at: string
          display_name: string | null
          id: string
          user_address: string
        }
        Insert: {
          body: string
          condition_id: string
          created_at?: string
          display_name?: string | null
          id?: string
          user_address: string
        }
        Update: {
          body?: string
          condition_id?: string
          created_at?: string
          display_name?: string | null
          id?: string
          user_address?: string
        }
        Relationships: []
      }
      platform_fees: {
        Row: {
          created_at: string | null
          fee_amount: number
          fee_bps: number
          id: string
          order_condition_id: string | null
          token_address: string
          tx_hash: string | null
          user_address: string
        }
        Insert: {
          created_at?: string | null
          fee_amount: number
          fee_bps?: number
          id?: string
          order_condition_id?: string | null
          token_address?: string
          tx_hash?: string | null
          user_address: string
        }
        Update: {
          created_at?: string | null
          fee_amount?: number
          fee_bps?: number
          id?: string
          order_condition_id?: string | null
          token_address?: string
          tx_hash?: string | null
          user_address?: string
        }
        Relationships: []
      }
      polymarket_secrets: {
        Row: {
          auth_tag: string
          created_at: string
          id: string
          iv: string
          name: string
          updated_at: string
          value_encrypted: string
        }
        Insert: {
          auth_tag: string
          created_at?: string
          id?: string
          iv: string
          name: string
          updated_at?: string
          value_encrypted: string
        }
        Update: {
          auth_tag?: string
          created_at?: string
          id?: string
          iv?: string
          name?: string
          updated_at?: string
          value_encrypted?: string
        }
        Relationships: []
      }
      polymarket_user_creds: {
        Row: {
          address: string
          auth_tag: string
          created_at: string
          iv: string
          updated_at: string
          user_id: string
          value_encrypted: string
        }
        Insert: {
          address: string
          auth_tag: string
          created_at?: string
          iv: string
          updated_at?: string
          user_id: string
          value_encrypted: string
        }
        Update: {
          address?: string
          auth_tag?: string
          created_at?: string
          iv?: string
          updated_at?: string
          user_id?: string
          value_encrypted?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          onboarding_completed: boolean
          updated_at: string
          user_id: string
          username: string | null
          wallet_address: string | null
          welcome_signed: boolean
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          onboarding_completed?: boolean
          updated_at?: string
          user_id: string
          username?: string | null
          wallet_address?: string | null
          welcome_signed?: boolean
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          onboarding_completed?: boolean
          updated_at?: string
          user_id?: string
          username?: string | null
          wallet_address?: string | null
          welcome_signed?: boolean
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
