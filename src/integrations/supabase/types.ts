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
      chat_dm_messages: {
        Row: {
          attachment_name: string | null
          attachment_url: string | null
          created_at: string
          from_email: string | null
          from_role: string | null
          id: string
          message_text: string | null
          thread_key: string | null
          to_email: string | null
        }
        Insert: {
          attachment_name?: string | null
          attachment_url?: string | null
          created_at?: string
          from_email?: string | null
          from_role?: string | null
          id?: string
          message_text?: string | null
          thread_key?: string | null
          to_email?: string | null
        }
        Update: {
          attachment_name?: string | null
          attachment_url?: string | null
          created_at?: string
          from_email?: string | null
          from_role?: string | null
          id?: string
          message_text?: string | null
          thread_key?: string | null
          to_email?: string | null
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          attachment_name: string | null
          attachment_url: string | null
          created_at: string
          id: string
          message_text: string | null
          sender_email: string | null
          sender_role: string | null
          thread_email: string | null
        }
        Insert: {
          attachment_name?: string | null
          attachment_url?: string | null
          created_at?: string
          id?: string
          message_text?: string | null
          sender_email?: string | null
          sender_role?: string | null
          thread_email?: string | null
        }
        Update: {
          attachment_name?: string | null
          attachment_url?: string | null
          created_at?: string
          id?: string
          message_text?: string | null
          sender_email?: string | null
          sender_role?: string | null
          thread_email?: string | null
        }
        Relationships: []
      }
      client_prices: {
        Row: {
          city: string
          id: string
          price_gs: number | null
          updated_at: string
        }
        Insert: {
          city: string
          id?: string
          price_gs?: number | null
          updated_at?: string
        }
        Update: {
          city?: string
          id?: string
          price_gs?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      commission_requests: {
        Row: {
          amount_gs: number | null
          approval_note: string | null
          approved_at: string | null
          approved_by: string | null
          id: string
          meta_json: Json | null
          note: string | null
          provider_email: string | null
          range_from: string | null
          range_to: string | null
          rejected_at: string | null
          rejected_by: string | null
          requested_at: string | null
          requested_by: string | null
          status: string | null
          vendor_email: string | null
        }
        Insert: {
          amount_gs?: number | null
          approval_note?: string | null
          approved_at?: string | null
          approved_by?: string | null
          id?: string
          meta_json?: Json | null
          note?: string | null
          provider_email?: string | null
          range_from?: string | null
          range_to?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          requested_at?: string | null
          requested_by?: string | null
          status?: string | null
          vendor_email?: string | null
        }
        Update: {
          amount_gs?: number | null
          approval_note?: string | null
          approved_at?: string | null
          approved_by?: string | null
          id?: string
          meta_json?: Json | null
          note?: string | null
          provider_email?: string | null
          range_from?: string | null
          range_to?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          requested_at?: string | null
          requested_by?: string | null
          status?: string | null
          vendor_email?: string | null
        }
        Relationships: []
      }
      delivery_fees: {
        Row: {
          city: string | null
          delivery_email: string | null
          fee_gs: number | null
          id: string
          updated_at: string
        }
        Insert: {
          city?: string | null
          delivery_email?: string | null
          fee_gs?: number | null
          id?: string
          updated_at?: string
        }
        Update: {
          city?: string | null
          delivery_email?: string | null
          fee_gs?: number | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      delivery_locations: {
        Row: {
          delivery_email: string
          id: string
          lat: number
          lng: number
          updated_at: string
        }
        Insert: {
          delivery_email: string
          id?: string
          lat: number
          lng: number
          updated_at?: string
        }
        Update: {
          delivery_email?: string
          id?: string
          lat?: number
          lng?: number
          updated_at?: string
        }
        Relationships: []
      }
      news: {
        Row: {
          actor_email: string | null
          created_at: string
          id: string
          message: string | null
          order_id: string | null
          role_scope: string | null
          target_email: string | null
        }
        Insert: {
          actor_email?: string | null
          created_at?: string
          id?: string
          message?: string | null
          order_id?: string | null
          role_scope?: string | null
          target_email?: string | null
        }
        Update: {
          actor_email?: string | null
          created_at?: string
          id?: string
          message?: string | null
          order_id?: string | null
          role_scope?: string | null
          target_email?: string | null
        }
        Relationships: []
      }
      order_sequence: {
        Row: {
          counter: number | null
          id: number
          pad: number | null
          prefix: string | null
        }
        Insert: {
          counter?: number | null
          id?: number
          pad?: number | null
          prefix?: string | null
        }
        Update: {
          counter?: number | null
          id?: number
          pad?: number | null
          prefix?: string | null
        }
        Relationships: []
      }
      orders: {
        Row: {
          assigned_at: string | null
          assigned_delivery: string | null
          city: string | null
          commission_credited: boolean | null
          commission_gs: number | null
          commission_paid: boolean | null
          created_at: string
          created_by: string | null
          customer_name: string | null
          delivered_at: string | null
          delivery_fee_credited: boolean | null
          delivery_fee_gs: number | null
          delivery_gs: number | null
          delivery_paid_at: string | null
          delivery_settled: boolean | null
          district: string | null
          email: string | null
          estado_retiro: string | null
          id: string
          items_json: Json | null
          obs: string | null
          order_number: string | null
          pack_amount_gs: number | null
          pack_by: string | null
          pack_count: number | null
          pack_credited: boolean | null
          pack_fee_credited: boolean | null
          pack_fee_gs: number | null
          pack_paid_at: string | null
          pack_qty: number | null
          paid_at: string | null
          phone: string | null
          provider_emails_list: string | null
          provider_stock_applied: boolean | null
          status: string | null
          status2: string | null
          street: string | null
          total_gs: number | null
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_delivery?: string | null
          city?: string | null
          commission_credited?: boolean | null
          commission_gs?: number | null
          commission_paid?: boolean | null
          created_at?: string
          created_by?: string | null
          customer_name?: string | null
          delivered_at?: string | null
          delivery_fee_credited?: boolean | null
          delivery_fee_gs?: number | null
          delivery_gs?: number | null
          delivery_paid_at?: string | null
          delivery_settled?: boolean | null
          district?: string | null
          email?: string | null
          estado_retiro?: string | null
          id?: string
          items_json?: Json | null
          obs?: string | null
          order_number?: string | null
          pack_amount_gs?: number | null
          pack_by?: string | null
          pack_count?: number | null
          pack_credited?: boolean | null
          pack_fee_credited?: boolean | null
          pack_fee_gs?: number | null
          pack_paid_at?: string | null
          pack_qty?: number | null
          paid_at?: string | null
          phone?: string | null
          provider_emails_list?: string | null
          provider_stock_applied?: boolean | null
          status?: string | null
          status2?: string | null
          street?: string | null
          total_gs?: number | null
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_delivery?: string | null
          city?: string | null
          commission_credited?: boolean | null
          commission_gs?: number | null
          commission_paid?: boolean | null
          created_at?: string
          created_by?: string | null
          customer_name?: string | null
          delivered_at?: string | null
          delivery_fee_credited?: boolean | null
          delivery_fee_gs?: number | null
          delivery_gs?: number | null
          delivery_paid_at?: string | null
          delivery_settled?: boolean | null
          district?: string | null
          email?: string | null
          estado_retiro?: string | null
          id?: string
          items_json?: Json | null
          obs?: string | null
          order_number?: string | null
          pack_amount_gs?: number | null
          pack_by?: string | null
          pack_count?: number | null
          pack_credited?: boolean | null
          pack_fee_credited?: boolean | null
          pack_fee_gs?: number | null
          pack_paid_at?: string | null
          pack_qty?: number | null
          paid_at?: string | null
          phone?: string | null
          provider_emails_list?: string | null
          provider_stock_applied?: boolean | null
          status?: string | null
          status2?: string | null
          street?: string | null
          total_gs?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          allowed_emails_json: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          image_url_2: string | null
          image_url_3: string | null
          is_private: boolean | null
          private_to_emails: string | null
          provider_email: string | null
          provider_price_gs: number | null
          real_cost_gs: number | null
          real_stock: number | null
          sku: string | null
          stock: number | null
          title: string
          updated_at: string
        }
        Insert: {
          allowed_emails_json?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          image_url_2?: string | null
          image_url_3?: string | null
          is_private?: boolean | null
          private_to_emails?: string | null
          provider_email?: string | null
          provider_price_gs?: number | null
          real_cost_gs?: number | null
          real_stock?: number | null
          sku?: string | null
          stock?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          allowed_emails_json?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          image_url_2?: string | null
          image_url_3?: string | null
          is_private?: boolean | null
          private_to_emails?: string | null
          provider_email?: string | null
          provider_price_gs?: number | null
          real_cost_gs?: number | null
          real_stock?: number | null
          sku?: string | null
          stock?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          addr: string | null
          bank_holder: string | null
          bank_holder_ci: string | null
          bank_name: string | null
          bank_num: string | null
          bank_type: string | null
          created_at: string
          doc: string | null
          email: string
          id: string
          logo_url: string | null
          name: string | null
          phone: string | null
          sheet_url: string | null
          updated_at: string
          user_id: string
          wallet_holder: string | null
          wallet_number: string | null
          wallet_provider: string | null
        }
        Insert: {
          addr?: string | null
          bank_holder?: string | null
          bank_holder_ci?: string | null
          bank_name?: string | null
          bank_num?: string | null
          bank_type?: string | null
          created_at?: string
          doc?: string | null
          email: string
          id?: string
          logo_url?: string | null
          name?: string | null
          phone?: string | null
          sheet_url?: string | null
          updated_at?: string
          user_id: string
          wallet_holder?: string | null
          wallet_number?: string | null
          wallet_provider?: string | null
        }
        Update: {
          addr?: string | null
          bank_holder?: string | null
          bank_holder_ci?: string | null
          bank_name?: string | null
          bank_num?: string | null
          bank_type?: string | null
          created_at?: string
          doc?: string | null
          email?: string
          id?: string
          logo_url?: string | null
          name?: string | null
          phone?: string | null
          sheet_url?: string | null
          updated_at?: string
          user_id?: string
          wallet_holder?: string | null
          wallet_number?: string | null
          wallet_provider?: string | null
        }
        Relationships: []
      }
      rendiciones_pagadas: {
        Row: {
          delivery_email: string | null
          fecha_rendicion: string | null
          id: string
          marcado_en: string | null
          marcado_por: string | null
          monto_total: number | null
          nota: string | null
          pagado_en: string | null
        }
        Insert: {
          delivery_email?: string | null
          fecha_rendicion?: string | null
          id?: string
          marcado_en?: string | null
          marcado_por?: string | null
          monto_total?: number | null
          nota?: string | null
          pagado_en?: string | null
        }
        Update: {
          delivery_email?: string | null
          fecha_rendicion?: string | null
          id?: string
          marcado_en?: string | null
          marcado_por?: string | null
          monto_total?: number | null
          nota?: string | null
          pagado_en?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          approved: boolean | null
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          approved?: boolean | null
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          approved?: boolean | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wallet_transactions: {
        Row: {
          amount_gs: number | null
          created_at: string
          email: string | null
          id: string
          note: string | null
          order_id: string | null
          type: string | null
        }
        Insert: {
          amount_gs?: number | null
          created_at?: string
          email?: string | null
          id?: string
          note?: string | null
          order_id?: string | null
          type?: string | null
        }
        Update: {
          amount_gs?: number | null
          created_at?: string
          email?: string | null
          id?: string
          note?: string | null
          order_id?: string | null
          type?: string | null
        }
        Relationships: []
      }
      wallets: {
        Row: {
          balance_gs: number | null
          email: string
          id: string
          updated_at: string
        }
        Insert: {
          balance_gs?: number | null
          email: string
          id?: string
          updated_at?: string
        }
        Update: {
          balance_gs?: number | null
          email?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_role: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "ADMIN" | "VENDEDOR" | "DELIVERY" | "DESPACHANTE" | "PROVEEDOR"
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
      app_role: ["ADMIN", "VENDEDOR", "DELIVERY", "DESPACHANTE", "PROVEEDOR"],
    },
  },
} as const
