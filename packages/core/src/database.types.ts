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
          verb: "grupo_creado" | "miembro_agregado" | "se_unio" | "gasto_creado" | "gasto_editado" | "gasto_borrado" | "gasto_restaurado" | "pago_registrado" | "pago_confirmado" | "comentario"
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
          repeat: "semanal" | "quincenal" | "mensual" | "anual" | null
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
            foreignKeyName: "expenses_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          created_at: string
          created_by: string
          currency: string
          id: string
          invite_token: string
          kind: "casa" | "viaje" | "pareja" | "otro" | "directo"
          name: string
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
      can_edit: {
        Args: {
          p_expense: string
        }
        Returns: boolean
      }
      confirm_payment: {
        Args: {
          p_id: string
        }
        Returns: undefined
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
      shares_group: {
        Args: {
          p: string
        }
        Returns: boolean
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
