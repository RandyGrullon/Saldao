// Generado desde supabase/migrations con `npm run db:types`: no se edita a mano (las pruebas fallan si no coincide).
// Solo trae lo que la app puede usar con su sesión: lo cerrado en la base no existe aquí.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      activity: {
        Row: {
          actor: string
          created_at: string
          expense_id: string | null
          group_id: string
          id: number
          payload: Json
          verb: "grupo_creado" | "miembro_agregado" | "se_unio" | "gasto_creado" | "gasto_editado" | "gasto_borrado" | "gasto_restaurado" | "pago_registrado" | "pago_confirmado" | "comentario" | "grupo_editado" | "salio" | "fondo_creado" | "miembro_quitado"
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: "activity_actor_fkey"
            columns: ["actor"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          body: string
          created_at: string
          deleted_at: string | null
          expense_id: string
          id: string
          profile_id: string
        }
        Insert: {
          body: string
          expense_id: string
          profile_id: string
        }
        Update: {
          body?: string
          deleted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comments_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_payers: {
        Row: {
          amount: number
          expense_id: string
          profile_id: string
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: "expense_payers_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_payers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_shares: {
        Row: {
          amount: number
          expense_id: string
          profile_id: string
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: "expense_shares_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_shares_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          created_by: string
          currency: string
          date: string
          deleted_at: string | null
          deleted_by: string | null
          description: string
          fx_rate: number
          group_id: string
          id: string
          is_payment: boolean
          items: Json | null
          note: string | null
          payment_status: "pendiente" | "confirmado" | null
          photo_path: string | null
          repeat: "semanal" | "quincenal" | "mensual" | "anual" | null
          repeat_from: string | null
          split_mode: "equal" | "exact" | "percent" | "shares" | "adjust" | "items" | "payment"
          split_params: Json
          tax: number
          tip: number
          updated_at: string | null
          updated_by: string | null
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: "expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_repeat_from_fkey"
            columns: ["repeat_from"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_items: {
        Row: {
          added_by: string
          created_at: string
          done_at: string | null
          done_by: string | null
          group_id: string
          id: string
          name: string
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: "group_items_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_items_done_by_fkey"
            columns: ["done_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_items_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          group_id: string
          joined_at: string
          profile_id: string
          role: "admin" | "miembro"
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          archived_at: string | null
          budget: number | null
          created_at: string
          created_by: string
          currency: string
          ends_on: string | null
          id: string
          invite_token: string
          kind: "casa" | "viaje" | "pareja" | "otro" | "directo"
          name: string
          photo_path: string | null
          simplify: boolean
          starts_on: string | null
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: "groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_acceptances: {
        Row: {
          accepted_at: string
          user_agent: string | null
          user_id: string
          version: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          created_by: string | null
          default_currency: string
          deleted_at: string | null
          fund_of: string | null
          id: string
          name: string
          payout: string | null
          user_id: string | null
          username: string | null
        }
        Insert: never
        Update: {
          name?: string
          payout?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_fund_of_fkey"
            columns: ["fund_of"]
            isOneToOne: true
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      accept_legal: {
        Args: {
          p_version: string
        }
        Returns: undefined
      }
      add_item: {
        Args: {
          p_group: string
          p_name: string
        }
        Returns: string
      }
      add_member: {
        Args: {
          p_group: string
          p_profile: string
        }
        Returns: undefined
      }
      add_placeholder: {
        Args: {
          p_email?: string
          p_group: string
          p_name: string
        }
        Returns: string
      }
      apply_op: {
        Args: {
          p_args: Json
          p_kind: string
          p_op: string
        }
        Returns: Json
      }
      can_edit: {
        Args: {
          p_expense: string
        }
        Returns: boolean
      }
      catch_up_recurring: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      confirm_payment: {
        Args: {
          p_id: string
        }
        Returns: undefined
      }
      create_fund: {
        Args: {
          p_group: string
        }
        Returns: string
      }
      create_group: {
        Args: {
          p_currency?: string
          p_kind?: string
          p_name: string
        }
        Returns: string
      }
      current_profile_id: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      delete_account: {
        Args: {
          p_confirm: string
        }
        Returns: undefined
      }
      delete_expense: {
        Args: {
          p_id: string
        }
        Returns: undefined
      }
      delete_item: {
        Args: {
          p_id: string
        }
        Returns: undefined
      }
      delete_push_token: {
        Args: {
          p_token: string
        }
        Returns: undefined
      }
      direct_group: {
        Args: {
          p_other: string
        }
        Returns: string
      }
      invite_preview: {
        Args: {
          p_token: string
        }
        Returns: Json
      }
      is_admin: {
        Args: {
          g: string
        }
        Returns: boolean
      }
      is_member: {
        Args: {
          g: string
        }
        Returns: boolean
      }
      join_group: {
        Args: {
          p_as?: string
          p_token: string
        }
        Returns: string
      }
      leave_group: {
        Args: {
          p_group: string
        }
        Returns: undefined
      }
      login_email: {
        Args: {
          p_password: string
          p_username: string
        }
        Returns: string
      }
      regenerate_invite: {
        Args: {
          p_group: string
        }
        Returns: string
      }
      remove_member: {
        Args: {
          p_group: string
          p_profile: string
        }
        Returns: undefined
      }
      rename_placeholder: {
        Args: {
          p_group: string
          p_name: string
          p_profile: string
        }
        Returns: undefined
      }
      restore_expense: {
        Args: {
          p_id: string
        }
        Returns: undefined
      }
      save_expense: {
        Args: {
          p: Json
        }
        Returns: string
      }
      save_push_token: {
        Args: {
          p_kind: string
          p_token: string
        }
        Returns: undefined
      }
      scan_quota: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      set_expense_photo: {
        Args: {
          p_id: string
          p_path: string
        }
        Returns: undefined
      }
      set_member_role: {
        Args: {
          p_group: string
          p_profile: string
          p_role: string
        }
        Returns: undefined
      }
      shares_group: {
        Args: {
          p: string
        }
        Returns: boolean
      }
      toggle_item: {
        Args: {
          p_id: string
        }
        Returns: undefined
      }
      update_group: {
        Args: {
          p_group: string
          p: Json
        }
        Returns: undefined
      }
      username_available: {
        Args: {
          p_username: string
        }
        Returns: boolean
      }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
};

type Public = Database['public'];
export type Tables<T extends keyof Public['Tables']> = Public['Tables'][T]['Row'];
export type Rpc<F extends keyof Public['Functions']> = Public['Functions'][F];
