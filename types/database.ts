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
      audit_events: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_user_id: string | null
          changes: Json | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          ip_address: unknown
          organization_id: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_user_id?: string | null
          changes?: Json | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          ip_address?: unknown
          organization_id?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["audit_action"]
          actor_user_id?: string | null
          changes?: Json | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          ip_address?: unknown
          organization_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      bootstrap_audit_log: {
        Row: {
          id: string
          notes: string | null
          organization_id: string
          performed_at: string
          role_assigned: string
          user_id: string
        }
        Insert: {
          id?: string
          notes?: string | null
          organization_id: string
          performed_at?: string
          role_assigned: string
          user_id: string
        }
        Update: {
          id?: string
          notes?: string | null
          organization_id?: string
          performed_at?: string
          role_assigned?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bootstrap_audit_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bootstrap_audit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      corrective_actions: {
        Row: {
          closure_evidence: string | null
          completion_notes: string | null
          created_at: string
          created_by: string | null
          description: string
          due_date: string
          id: string
          observation_id: string
          organization_id: string
          priority: Database["public"]["Enums"]["corrective_action_priority"]
          project_id: string
          reopen_reason: string | null
          responsible_person_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["corrective_action_status"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          closure_evidence?: string | null
          completion_notes?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          due_date: string
          id?: string
          observation_id: string
          organization_id: string
          priority?: Database["public"]["Enums"]["corrective_action_priority"]
          project_id: string
          reopen_reason?: string | null
          responsible_person_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["corrective_action_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          closure_evidence?: string | null
          completion_notes?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          due_date?: string
          id?: string
          observation_id?: string
          organization_id?: string
          priority?: Database["public"]["Enums"]["corrective_action_priority"]
          project_id?: string
          reopen_reason?: string | null
          responsible_person_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["corrective_action_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "corrective_actions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corrective_actions_observation_fk"
            columns: ["observation_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "safety_observations"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "corrective_actions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corrective_actions_project_fk"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "corrective_actions_responsible_person_fk"
            columns: ["responsible_person_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "corrective_actions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corrective_actions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_employment_periods: {
        Row: {
          created_at: string
          created_by: string | null
          employee_id: string
          end_date: string | null
          end_note: string | null
          end_reason:
            | Database["public"]["Enums"]["employment_end_reason"]
            | null
          ended_at: string | null
          ended_by: string | null
          id: string
          organization_id: string
          start_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          employee_id: string
          end_date?: string | null
          end_note?: string | null
          end_reason?:
            | Database["public"]["Enums"]["employment_end_reason"]
            | null
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          organization_id: string
          start_date: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          employee_id?: string
          end_date?: string | null
          end_note?: string | null
          end_reason?:
            | Database["public"]["Enums"]["employment_end_reason"]
            | null
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          organization_id?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_employment_periods_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_employment_periods_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_employment_periods_ended_by_fkey"
            columns: ["ended_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_employment_periods_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          account_status: Database["public"]["Enums"]["employee_account_status"]
          archived_at: string | null
          birth_date: string | null
          created_at: string
          created_by: string | null
          employee_number: string
          employment_status: Database["public"]["Enums"]["employment_status"]
          end_date: string | null
          first_name: string
          id: string
          last_name: string
          organization_id: string
          phone: string | null
          position_title: string | null
          profile_id: string | null
          start_date: string | null
          updated_at: string
          updated_by: string | null
          work_email: string | null
        }
        Insert: {
          account_status?: Database["public"]["Enums"]["employee_account_status"]
          archived_at?: string | null
          birth_date?: string | null
          created_at?: string
          created_by?: string | null
          employee_number: string
          employment_status: Database["public"]["Enums"]["employment_status"]
          end_date?: string | null
          first_name: string
          id?: string
          last_name: string
          organization_id: string
          phone?: string | null
          position_title?: string | null
          profile_id?: string | null
          start_date?: string | null
          updated_at?: string
          updated_by?: string | null
          work_email?: string | null
        }
        Update: {
          account_status?: Database["public"]["Enums"]["employee_account_status"]
          archived_at?: string | null
          birth_date?: string | null
          created_at?: string
          created_by?: string | null
          employee_number?: string
          employment_status?: Database["public"]["Enums"]["employment_status"]
          end_date?: string | null
          first_name?: string
          id?: string
          last_name?: string
          organization_id?: string
          phone?: string | null
          position_title?: string | null
          profile_id?: string | null
          start_date?: string | null
          updated_at?: string
          updated_by?: string | null
          work_email?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lmra_assessments: {
        Row: {
          approved_at: string | null
          archived_at: string | null
          archived_by: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          organization_id: string
          project_id: string
          responsible_foreman_id: string
          result: Database["public"]["Enums"]["lmra_result"]
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          shift: string
          status: Database["public"]["Enums"]["lmra_status"]
          stop_work_reason: string | null
          submitted_at: string | null
          submitted_by: string | null
          updated_at: string
          updated_by: string | null
          work_activity: string
          work_area: string
          work_date: string
        }
        Insert: {
          approved_at?: string | null
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          project_id: string
          responsible_foreman_id: string
          result?: Database["public"]["Enums"]["lmra_result"]
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          shift: string
          status?: Database["public"]["Enums"]["lmra_status"]
          stop_work_reason?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string
          updated_by?: string | null
          work_activity: string
          work_area: string
          work_date: string
        }
        Update: {
          approved_at?: string | null
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          project_id?: string
          responsible_foreman_id?: string
          result?: Database["public"]["Enums"]["lmra_result"]
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          shift?: string
          status?: Database["public"]["Enums"]["lmra_status"]
          stop_work_reason?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string
          updated_by?: string | null
          work_activity?: string
          work_area?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "lmra_assessments_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lmra_assessments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lmra_assessments_foreman_fk"
            columns: ["responsible_foreman_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "lmra_assessments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lmra_assessments_project_fk"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "lmra_assessments_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lmra_assessments_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lmra_assessments_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lmra_hazards: {
        Row: {
          controls: string | null
          controls_confirmed: boolean
          created_at: string
          hazard_type: Database["public"]["Enums"]["lmra_hazard_type"]
          id: string
          is_applicable: boolean
          lmra_assessment_id: string
          organization_id: string
          other_description: string | null
          responsible_person_id: string | null
          updated_at: string
        }
        Insert: {
          controls?: string | null
          controls_confirmed?: boolean
          created_at?: string
          hazard_type: Database["public"]["Enums"]["lmra_hazard_type"]
          id?: string
          is_applicable?: boolean
          lmra_assessment_id: string
          organization_id: string
          other_description?: string | null
          responsible_person_id?: string | null
          updated_at?: string
        }
        Update: {
          controls?: string | null
          controls_confirmed?: boolean
          created_at?: string
          hazard_type?: Database["public"]["Enums"]["lmra_hazard_type"]
          id?: string
          is_applicable?: boolean
          lmra_assessment_id?: string
          organization_id?: string
          other_description?: string | null
          responsible_person_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lmra_hazards_lmra_assessment_id_fkey"
            columns: ["lmra_assessment_id"]
            isOneToOne: false
            referencedRelation: "lmra_assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lmra_hazards_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lmra_hazards_responsible_person_fk"
            columns: ["responsible_person_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      lmra_participants: {
        Row: {
          created_at: string
          employee_id: string
          id: string
          lmra_assessment_id: string
          organization_id: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          id?: string
          lmra_assessment_id: string
          organization_id: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          id?: string
          lmra_assessment_id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lmra_participants_employee_fk"
            columns: ["employee_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "lmra_participants_lmra_assessment_id_fkey"
            columns: ["lmra_assessment_id"]
            isOneToOne: false
            referencedRelation: "lmra_assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lmra_participants_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_roles: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          membership_id: string
          organization_id: string
          role_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          membership_id: string
          organization_id: string
          role_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          membership_id?: string
          organization_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_roles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_roles_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "organization_memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_employee_number_counters: {
        Row: {
          next_number: number
          organization_id: string
          updated_at: string
        }
        Insert: {
          next_number?: number
          organization_id: string
          updated_at?: string
        }
        Update: {
          next_number?: number
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_employee_number_counters_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_memberships: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          invited_at: string | null
          joined_at: string | null
          organization_id: string
          status: Database["public"]["Enums"]["membership_status"]
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          invited_at?: string | null
          joined_at?: string | null
          organization_id: string
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          invited_at?: string | null
          joined_at?: string | null
          organization_id?: string
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_memberships_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memberships_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          deleted_at: string | null
          employee_number_prefix: string
          id: string
          name: string
          scaffold_inspection_validity_days: number | null
          slug: string
          status: Database["public"]["Enums"]["organization_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          employee_number_prefix: string
          id?: string
          name: string
          scaffold_inspection_validity_days?: number | null
          slug: string
          status?: Database["public"]["Enums"]["organization_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          employee_number_prefix?: string
          id?: string
          name?: string
          scaffold_inspection_validity_days?: number | null
          slug?: string
          status?: Database["public"]["Enums"]["organization_status"]
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active_organization_id: string | null
          created_at: string
          full_name: string
          id: string
          phone: string | null
          updated_at: string
          user_number: string
        }
        Insert: {
          active_organization_id?: string | null
          created_at?: string
          full_name: string
          id: string
          phone?: string | null
          updated_at?: string
          user_number: string
        }
        Update: {
          active_organization_id?: string | null
          created_at?: string
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
          user_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_active_organization_id_fkey"
            columns: ["active_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      project_assignments: {
        Row: {
          assigned_by: string | null
          assignment_role: Database["public"]["Enums"]["project_assignment_role"]
          created_at: string
          employee_id: string
          end_at: string | null
          ended_at: string | null
          ended_by: string | null
          id: string
          notes: string | null
          organization_id: string
          project_id: string
          start_at: string
        }
        Insert: {
          assigned_by?: string | null
          assignment_role: Database["public"]["Enums"]["project_assignment_role"]
          created_at?: string
          employee_id: string
          end_at?: string | null
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          project_id: string
          start_at?: string
        }
        Update: {
          assigned_by?: string | null
          assignment_role?: Database["public"]["Enums"]["project_assignment_role"]
          created_at?: string
          employee_id?: string
          end_at?: string | null
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          project_id?: string
          start_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_assignments_employee_fk"
            columns: ["employee_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "project_assignments_ended_by_fkey"
            columns: ["ended_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_assignments_project_fk"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      projects: {
        Row: {
          client_name: string | null
          code: string | null
          created_at: string
          created_by: string | null
          description: string | null
          end_date: string | null
          id: string
          location: string | null
          name: string
          organization_id: string
          scaffold_inspection_validity_days: number | null
          start_date: string | null
          status: Database["public"]["Enums"]["project_status"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          client_name?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          location?: string | null
          name: string
          organization_id: string
          scaffold_inspection_validity_days?: number | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          client_name?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          location?: string | null
          name?: string
          organization_id?: string
          scaffold_inspection_validity_days?: number | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          description: string | null
          display_label: string
          id: string
          is_system: boolean
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_label: string
          id?: string
          is_system?: boolean
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_label?: string
          id?: string
          is_system?: boolean
          name?: string
        }
        Relationships: []
      }
      safety_flash_file_replacements: {
        Row: {
          id: string
          new_original_filename: string
          new_storage_bucket: string
          new_storage_object_path: string
          organization_id: string
          previous_original_filename: string
          previous_storage_bucket: string
          previous_storage_object_path: string
          reason: string
          replaced_at: string
          replaced_by: string
          safety_flash_id: string
        }
        Insert: {
          id?: string
          new_original_filename: string
          new_storage_bucket: string
          new_storage_object_path: string
          organization_id: string
          previous_original_filename: string
          previous_storage_bucket: string
          previous_storage_object_path: string
          reason: string
          replaced_at?: string
          replaced_by: string
          safety_flash_id: string
        }
        Update: {
          id?: string
          new_original_filename?: string
          new_storage_bucket?: string
          new_storage_object_path?: string
          organization_id?: string
          previous_original_filename?: string
          previous_storage_bucket?: string
          previous_storage_object_path?: string
          reason?: string
          replaced_at?: string
          replaced_by?: string
          safety_flash_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "safety_flash_file_replacements_flash_fk"
            columns: ["safety_flash_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "safety_flashes"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "safety_flash_file_replacements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_flash_file_replacements_replaced_by_fkey"
            columns: ["replaced_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_flash_number_counters: {
        Row: {
          next_number: number
          organization_id: string
          updated_at: string
        }
        Insert: {
          next_number?: number
          organization_id: string
          updated_at?: string
        }
        Update: {
          next_number?: number
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "safety_flash_number_counters_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_flashes: {
        Row: {
          category: Database["public"]["Enums"]["hseq_document_category"]
          created_at: string
          created_by: string | null
          date_issued: string
          file_checksum_sha256: string | null
          file_size_bytes: number
          flash_number: number
          id: string
          issued_by_employee_id: string
          language: string
          mime_type: string
          organization_id: string
          original_filename: string
          project_id: string | null
          status: Database["public"]["Enums"]["toolbox_document_status"]
          storage_bucket: string
          storage_object_path: string
          summary: string | null
          title: string
          updated_at: string
          updated_by: string | null
          uploaded_at: string
          uploaded_by: string
        }
        Insert: {
          category: Database["public"]["Enums"]["hseq_document_category"]
          created_at?: string
          created_by?: string | null
          date_issued: string
          file_checksum_sha256?: string | null
          file_size_bytes: number
          flash_number?: number
          id?: string
          issued_by_employee_id: string
          language: string
          mime_type: string
          organization_id: string
          original_filename: string
          project_id?: string | null
          status?: Database["public"]["Enums"]["toolbox_document_status"]
          storage_bucket: string
          storage_object_path: string
          summary?: string | null
          title: string
          updated_at?: string
          updated_by?: string | null
          uploaded_at?: string
          uploaded_by: string
        }
        Update: {
          category?: Database["public"]["Enums"]["hseq_document_category"]
          created_at?: string
          created_by?: string | null
          date_issued?: string
          file_checksum_sha256?: string | null
          file_size_bytes?: number
          flash_number?: number
          id?: string
          issued_by_employee_id?: string
          language?: string
          mime_type?: string
          organization_id?: string
          original_filename?: string
          project_id?: string | null
          status?: Database["public"]["Enums"]["toolbox_document_status"]
          storage_bucket?: string
          storage_object_path?: string
          summary?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
          uploaded_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "safety_flashes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_flashes_issued_by_fk"
            columns: ["issued_by_employee_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "safety_flashes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_flashes_project_fk"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "safety_flashes_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_flashes_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_observation_participants: {
        Row: {
          created_at: string
          employee_id: string
          id: string
          observation_id: string
          organization_id: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          id?: string
          observation_id: string
          organization_id: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          id?: string
          observation_id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "safety_observation_participants_employee_fk"
            columns: ["employee_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "safety_observation_participants_observation_id_fkey"
            columns: ["observation_id"]
            isOneToOne: false
            referencedRelation: "safety_observations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_observation_participants_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_observations: {
        Row: {
          category: Database["public"]["Enums"]["observation_category"]
          closed_at: string | null
          closed_by: string | null
          created_at: string
          created_by: string | null
          description: string
          id: string
          immediate_action_taken: string | null
          is_stop_work: boolean
          observed_at: string
          observer_id: string
          organization_id: string
          project_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          risk_level: Database["public"]["Enums"]["observation_risk_level"]
          status: Database["public"]["Enums"]["observation_status"]
          updated_at: string
          updated_by: string | null
          work_area: string
        }
        Insert: {
          category: Database["public"]["Enums"]["observation_category"]
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          immediate_action_taken?: string | null
          is_stop_work?: boolean
          observed_at?: string
          observer_id: string
          organization_id: string
          project_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk_level?: Database["public"]["Enums"]["observation_risk_level"]
          status?: Database["public"]["Enums"]["observation_status"]
          updated_at?: string
          updated_by?: string | null
          work_area: string
        }
        Update: {
          category?: Database["public"]["Enums"]["observation_category"]
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          immediate_action_taken?: string | null
          is_stop_work?: boolean
          observed_at?: string
          observer_id?: string
          organization_id?: string
          project_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk_level?: Database["public"]["Enums"]["observation_risk_level"]
          status?: Database["public"]["Enums"]["observation_status"]
          updated_at?: string
          updated_by?: string | null
          work_area?: string
        }
        Relationships: [
          {
            foreignKeyName: "safety_observations_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_observations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_observations_observer_fk"
            columns: ["observer_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "safety_observations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_observations_project_fk"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "safety_observations_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_observations_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      scaffold_defects: {
        Row: {
          completion_notes: string | null
          created_at: string
          created_by: string | null
          description: string
          due_date: string
          id: string
          immediate_control: string | null
          inspection_item_id: string | null
          organization_id: string
          project_id: string
          reopen_reason: string | null
          responsible_person_id: string
          scaffold_id: string
          scaffold_inspection_id: string
          severity: Database["public"]["Enums"]["scaffold_defect_severity"]
          status: Database["public"]["Enums"]["scaffold_defect_status"]
          updated_at: string
          updated_by: string | null
          verification_notes: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          completion_notes?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          due_date: string
          id?: string
          immediate_control?: string | null
          inspection_item_id?: string | null
          organization_id: string
          project_id: string
          reopen_reason?: string | null
          responsible_person_id: string
          scaffold_id: string
          scaffold_inspection_id: string
          severity?: Database["public"]["Enums"]["scaffold_defect_severity"]
          status?: Database["public"]["Enums"]["scaffold_defect_status"]
          updated_at?: string
          updated_by?: string | null
          verification_notes?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          completion_notes?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          due_date?: string
          id?: string
          immediate_control?: string | null
          inspection_item_id?: string | null
          organization_id?: string
          project_id?: string
          reopen_reason?: string | null
          responsible_person_id?: string
          scaffold_id?: string
          scaffold_inspection_id?: string
          severity?: Database["public"]["Enums"]["scaffold_defect_severity"]
          status?: Database["public"]["Enums"]["scaffold_defect_status"]
          updated_at?: string
          updated_by?: string | null
          verification_notes?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scaffold_defects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scaffold_defects_inspection_fk"
            columns: ["scaffold_inspection_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "scaffold_inspections"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "scaffold_defects_inspection_item_fk"
            columns: ["inspection_item_id"]
            isOneToOne: false
            referencedRelation: "scaffold_inspection_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scaffold_defects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scaffold_defects_project_fk"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "scaffold_defects_responsible_person_fk"
            columns: ["responsible_person_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "scaffold_defects_scaffold_fk"
            columns: ["scaffold_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "scaffolds"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "scaffold_defects_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scaffold_defects_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      scaffold_inspection_items: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          item_type: Database["public"]["Enums"]["scaffold_inspection_item_type"]
          organization_id: string
          required_corrective_action: string | null
          result: Database["public"]["Enums"]["scaffold_inspection_item_result"]
          scaffold_inspection_id: string
          severity:
            | Database["public"]["Enums"]["scaffold_defect_severity"]
            | null
          updated_at: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          item_type: Database["public"]["Enums"]["scaffold_inspection_item_type"]
          organization_id: string
          required_corrective_action?: string | null
          result?: Database["public"]["Enums"]["scaffold_inspection_item_result"]
          scaffold_inspection_id: string
          severity?:
            | Database["public"]["Enums"]["scaffold_defect_severity"]
            | null
          updated_at?: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          item_type?: Database["public"]["Enums"]["scaffold_inspection_item_type"]
          organization_id?: string
          required_corrective_action?: string | null
          result?: Database["public"]["Enums"]["scaffold_inspection_item_result"]
          scaffold_inspection_id?: string
          severity?:
            | Database["public"]["Enums"]["scaffold_defect_severity"]
            | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scaffold_inspection_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scaffold_inspection_items_scaffold_inspection_id_fkey"
            columns: ["scaffold_inspection_id"]
            isOneToOne: false
            referencedRelation: "scaffold_inspections"
            referencedColumns: ["id"]
          },
        ]
      }
      scaffold_inspections: {
        Row: {
          correction_reason: string | null
          corrects_inspection_id: string | null
          created_at: string
          created_by: string | null
          expires_at: string | null
          finalized_at: string | null
          finalized_by: string | null
          id: string
          inspected_at: string
          inspection_reason: Database["public"]["Enums"]["scaffold_inspection_reason"]
          inspector_id: string
          notes: string | null
          organization_id: string
          outcome:
            | Database["public"]["Enums"]["scaffold_inspection_outcome"]
            | null
          previous_inspection_id: string | null
          project_id: string
          restrictions_notes: string | null
          scaffold_id: string
          status: Database["public"]["Enums"]["scaffold_inspection_status"]
          superseded_by_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          correction_reason?: string | null
          corrects_inspection_id?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          inspected_at?: string
          inspection_reason: Database["public"]["Enums"]["scaffold_inspection_reason"]
          inspector_id: string
          notes?: string | null
          organization_id: string
          outcome?:
            | Database["public"]["Enums"]["scaffold_inspection_outcome"]
            | null
          previous_inspection_id?: string | null
          project_id: string
          restrictions_notes?: string | null
          scaffold_id: string
          status?: Database["public"]["Enums"]["scaffold_inspection_status"]
          superseded_by_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          correction_reason?: string | null
          corrects_inspection_id?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          inspected_at?: string
          inspection_reason?: Database["public"]["Enums"]["scaffold_inspection_reason"]
          inspector_id?: string
          notes?: string | null
          organization_id?: string
          outcome?:
            | Database["public"]["Enums"]["scaffold_inspection_outcome"]
            | null
          previous_inspection_id?: string | null
          project_id?: string
          restrictions_notes?: string | null
          scaffold_id?: string
          status?: Database["public"]["Enums"]["scaffold_inspection_status"]
          superseded_by_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scaffold_inspections_corrects_fk"
            columns: ["corrects_inspection_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "scaffold_inspections"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "scaffold_inspections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scaffold_inspections_finalized_by_fkey"
            columns: ["finalized_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scaffold_inspections_inspector_fk"
            columns: ["inspector_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "scaffold_inspections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scaffold_inspections_previous_fk"
            columns: ["previous_inspection_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "scaffold_inspections"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "scaffold_inspections_project_fk"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "scaffold_inspections_scaffold_fk"
            columns: ["scaffold_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "scaffolds"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "scaffold_inspections_superseded_by_fk"
            columns: ["superseded_by_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "scaffold_inspections"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "scaffold_inspections_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      scaffold_team_members: {
        Row: {
          added_at: string
          added_by: string | null
          employee_id: string
          id: string
          organization_id: string
          project_id: string
          removed_at: string | null
          removed_by: string | null
          scaffold_id: string
          team_position: number
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          employee_id: string
          id?: string
          organization_id: string
          project_id: string
          removed_at?: string | null
          removed_by?: string | null
          scaffold_id: string
          team_position: number
        }
        Update: {
          added_at?: string
          added_by?: string | null
          employee_id?: string
          id?: string
          organization_id?: string
          project_id?: string
          removed_at?: string | null
          removed_by?: string | null
          scaffold_id?: string
          team_position?: number
        }
        Relationships: [
          {
            foreignKeyName: "scaffold_team_members_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scaffold_team_members_employee_fk"
            columns: ["employee_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "scaffold_team_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scaffold_team_members_project_fk"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "scaffold_team_members_removed_by_fkey"
            columns: ["removed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scaffold_team_members_scaffold_fk"
            columns: ["scaffold_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "scaffolds"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      scaffolds: {
        Row: {
          created_at: string
          created_by: string | null
          erected_at: string | null
          erected_by: string | null
          height_metres: number | null
          id: string
          intended_use: string
          length_metres: number | null
          max_load_class: string
          notes: string | null
          organization_id: string
          project_id: string
          responsible_foreman_id: string
          scaffold_type: Database["public"]["Enums"]["scaffold_type"]
          status: Database["public"]["Enums"]["scaffold_status"]
          structure_reference: string | null
          tag_number: string
          updated_at: string
          updated_by: string | null
          width_metres: number | null
          work_area: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          erected_at?: string | null
          erected_by?: string | null
          height_metres?: number | null
          id?: string
          intended_use: string
          length_metres?: number | null
          max_load_class: string
          notes?: string | null
          organization_id: string
          project_id: string
          responsible_foreman_id: string
          scaffold_type: Database["public"]["Enums"]["scaffold_type"]
          status?: Database["public"]["Enums"]["scaffold_status"]
          structure_reference?: string | null
          tag_number: string
          updated_at?: string
          updated_by?: string | null
          width_metres?: number | null
          work_area: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          erected_at?: string | null
          erected_by?: string | null
          height_metres?: number | null
          id?: string
          intended_use?: string
          length_metres?: number | null
          max_load_class?: string
          notes?: string | null
          organization_id?: string
          project_id?: string
          responsible_foreman_id?: string
          scaffold_type?: Database["public"]["Enums"]["scaffold_type"]
          status?: Database["public"]["Enums"]["scaffold_status"]
          structure_reference?: string | null
          tag_number?: string
          updated_at?: string
          updated_by?: string | null
          width_metres?: number | null
          work_area?: string
        }
        Relationships: [
          {
            foreignKeyName: "scaffolds_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scaffolds_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scaffolds_project_fk"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "scaffolds_responsible_foreman_fk"
            columns: ["responsible_foreman_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "scaffolds_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      team_assignments: {
        Row: {
          assigned_by: string | null
          assignment_role: Database["public"]["Enums"]["team_assignment_role"]
          created_at: string
          employee_id: string
          end_at: string | null
          ended_at: string | null
          ended_by: string | null
          id: string
          notes: string | null
          organization_id: string
          project_id: string
          start_at: string
          team_id: string
        }
        Insert: {
          assigned_by?: string | null
          assignment_role?: Database["public"]["Enums"]["team_assignment_role"]
          created_at?: string
          employee_id: string
          end_at?: string | null
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          project_id: string
          start_at?: string
          team_id: string
        }
        Update: {
          assigned_by?: string | null
          assignment_role?: Database["public"]["Enums"]["team_assignment_role"]
          created_at?: string
          employee_id?: string
          end_at?: string | null
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          project_id?: string
          start_at?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_assignments_employee_fk"
            columns: ["employee_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "team_assignments_ended_by_fkey"
            columns: ["ended_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_assignments_team_fk"
            columns: ["team_id", "project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id", "project_id", "organization_id"]
          },
        ]
      }
      teams: {
        Row: {
          code: string | null
          color: Database["public"]["Enums"]["team_color"]
          created_at: string
          created_by: string | null
          description: string | null
          display_order: number
          id: string
          name: string
          organization_id: string
          project_id: string
          status: Database["public"]["Enums"]["team_status"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          code?: string | null
          color?: Database["public"]["Enums"]["team_color"]
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_order?: number
          id?: string
          name: string
          organization_id: string
          project_id: string
          status?: Database["public"]["Enums"]["team_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          code?: string | null
          color?: Database["public"]["Enums"]["team_color"]
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_order?: number
          id?: string
          name?: string
          organization_id?: string
          project_id?: string
          status?: Database["public"]["Enums"]["team_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teams_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_project_fk"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "teams_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      toolbox_meeting_file_replacements: {
        Row: {
          id: string
          new_original_filename: string
          new_storage_bucket: string
          new_storage_object_path: string
          organization_id: string
          previous_original_filename: string
          previous_storage_bucket: string
          previous_storage_object_path: string
          reason: string
          replaced_at: string
          replaced_by: string
          toolbox_meeting_id: string
        }
        Insert: {
          id?: string
          new_original_filename: string
          new_storage_bucket: string
          new_storage_object_path: string
          organization_id: string
          previous_original_filename: string
          previous_storage_bucket: string
          previous_storage_object_path: string
          reason: string
          replaced_at?: string
          replaced_by: string
          toolbox_meeting_id: string
        }
        Update: {
          id?: string
          new_original_filename?: string
          new_storage_bucket?: string
          new_storage_object_path?: string
          organization_id?: string
          previous_original_filename?: string
          previous_storage_bucket?: string
          previous_storage_object_path?: string
          reason?: string
          replaced_at?: string
          replaced_by?: string
          toolbox_meeting_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "toolbox_meeting_file_replacements_meeting_fk"
            columns: ["toolbox_meeting_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "toolbox_meetings"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "toolbox_meeting_file_replacements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "toolbox_meeting_file_replacements_replaced_by_fkey"
            columns: ["replaced_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      toolbox_meeting_number_counters: {
        Row: {
          next_number: number
          organization_id: string
          project_id: string
          updated_at: string
        }
        Insert: {
          next_number?: number
          organization_id: string
          project_id: string
          updated_at?: string
        }
        Update: {
          next_number?: number
          organization_id?: string
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "toolbox_meeting_number_counters_project_id_organization_id_fkey"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      toolbox_meetings: {
        Row: {
          created_at: string
          created_by: string | null
          file_checksum_sha256: string | null
          file_size_bytes: number
          held_by_employee_id: string
          id: string
          meeting_date: string
          meeting_number: number
          mime_type: string
          notes: string | null
          organization_id: string
          original_filename: string
          project_id: string
          status: Database["public"]["Enums"]["toolbox_document_status"]
          storage_bucket: string
          storage_object_path: string
          title: string
          updated_at: string
          updated_by: string | null
          uploaded_at: string
          uploaded_by: string
          work_area: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          file_checksum_sha256?: string | null
          file_size_bytes: number
          held_by_employee_id: string
          id?: string
          meeting_date: string
          meeting_number?: number
          mime_type: string
          notes?: string | null
          organization_id: string
          original_filename: string
          project_id: string
          status?: Database["public"]["Enums"]["toolbox_document_status"]
          storage_bucket: string
          storage_object_path: string
          title: string
          updated_at?: string
          updated_by?: string | null
          uploaded_at?: string
          uploaded_by: string
          work_area?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          file_checksum_sha256?: string | null
          file_size_bytes?: number
          held_by_employee_id?: string
          id?: string
          meeting_date?: string
          meeting_number?: number
          mime_type?: string
          notes?: string | null
          organization_id?: string
          original_filename?: string
          project_id?: string
          status?: Database["public"]["Enums"]["toolbox_document_status"]
          storage_bucket?: string
          storage_object_path?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
          uploaded_at?: string
          uploaded_by?: string
          work_area?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "toolbox_meetings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "toolbox_meetings_held_by_fk"
            columns: ["held_by_employee_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "toolbox_meetings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "toolbox_meetings_project_fk"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "toolbox_meetings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "toolbox_meetings_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      toolbox_template_file_replacements: {
        Row: {
          id: string
          new_original_filename: string
          new_storage_bucket: string
          new_storage_object_path: string
          organization_id: string
          previous_original_filename: string
          previous_storage_bucket: string
          previous_storage_object_path: string
          reason: string
          replaced_at: string
          replaced_by: string
          toolbox_template_id: string
        }
        Insert: {
          id?: string
          new_original_filename: string
          new_storage_bucket: string
          new_storage_object_path: string
          organization_id: string
          previous_original_filename: string
          previous_storage_bucket: string
          previous_storage_object_path: string
          reason: string
          replaced_at?: string
          replaced_by: string
          toolbox_template_id: string
        }
        Update: {
          id?: string
          new_original_filename?: string
          new_storage_bucket?: string
          new_storage_object_path?: string
          organization_id?: string
          previous_original_filename?: string
          previous_storage_bucket?: string
          previous_storage_object_path?: string
          reason?: string
          replaced_at?: string
          replaced_by?: string
          toolbox_template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "toolbox_template_file_replacements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "toolbox_template_file_replacements_replaced_by_fkey"
            columns: ["replaced_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "toolbox_template_file_replacements_template_fk"
            columns: ["toolbox_template_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "toolbox_templates"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      toolbox_templates: {
        Row: {
          category: Database["public"]["Enums"]["hseq_document_category"]
          created_at: string
          created_by: string | null
          description: string | null
          file_checksum_sha256: string | null
          file_size_bytes: number
          id: string
          language: string
          mime_type: string
          organization_id: string
          original_filename: string
          status: Database["public"]["Enums"]["toolbox_document_status"]
          storage_bucket: string
          storage_object_path: string
          title: string
          updated_at: string
          updated_by: string | null
          uploaded_at: string
          uploaded_by: string
        }
        Insert: {
          category: Database["public"]["Enums"]["hseq_document_category"]
          created_at?: string
          created_by?: string | null
          description?: string | null
          file_checksum_sha256?: string | null
          file_size_bytes: number
          id?: string
          language: string
          mime_type: string
          organization_id: string
          original_filename: string
          status?: Database["public"]["Enums"]["toolbox_document_status"]
          storage_bucket: string
          storage_object_path: string
          title: string
          updated_at?: string
          updated_by?: string | null
          uploaded_at?: string
          uploaded_by: string
        }
        Update: {
          category?: Database["public"]["Enums"]["hseq_document_category"]
          created_at?: string
          created_by?: string | null
          description?: string | null
          file_checksum_sha256?: string | null
          file_size_bytes?: number
          id?: string
          language?: string
          mime_type?: string
          organization_id?: string
          original_filename?: string
          status?: Database["public"]["Enums"]["toolbox_document_status"]
          storage_bucket?: string
          storage_object_path?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
          uploaded_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "toolbox_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "toolbox_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "toolbox_templates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "toolbox_templates_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      allocate_employee_number: {
        Args: { target_org_id: string }
        Returns: string
      }
      assert_employee_eligible_for_assignment: {
        Args: { target_employee_id: string }
        Returns: undefined
      }
      assert_lmra_assessment_is_draft: {
        Args: { target_lmra_id: string }
        Returns: undefined
      }
      assert_no_unresolved_corrective_actions: {
        Args: { target_observation_id: string }
        Returns: undefined
      }
      assert_project_not_archived: {
        Args: { target_project_id: string }
        Returns: undefined
      }
      assert_safety_observation_is_open: {
        Args: { target_observation_id: string }
        Returns: undefined
      }
      assert_scaffold_inspection_is_draft: {
        Args: { target_inspection_id: string }
        Returns: undefined
      }
      assert_toolbox_authorized_employee: {
        Args: { target_employee_id: string; target_organization_id: string }
        Returns: undefined
      }
      bootstrap_first_owner: {
        Args: {
          notes?: string
          target_organization_id: string
          target_user_id: string
        }
        Returns: {
          created_at: string
          created_by: string | null
          id: string
          invited_at: string | null
          joined_at: string | null
          organization_id: string
          status: Database["public"]["Enums"]["membership_status"]
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "organization_memberships"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      can_close_corrective_action: {
        Args: {
          target_created_by: string
          target_organization_id: string
          target_project_id: string
          target_responsible_person_id: string
        }
        Returns: boolean
      }
      can_close_scaffold_defect: {
        Args: {
          target_created_by: string
          target_organization_id: string
          target_project_id: string
          target_responsible_person_id: string
        }
        Returns: boolean
      }
      count_employees: {
        Args: {
          include_archived?: boolean
          p_account_status?: Database["public"]["Enums"]["employee_account_status"]
          p_employment_status?: Database["public"]["Enums"]["employment_status"]
          search_term?: string
          target_org_id: string
        }
        Returns: number
      }
      employee_has_any_organization_role: {
        Args: {
          role_names: string[]
          target_employee_id: string
          target_organization_id: string
        }
        Returns: boolean
      }
      employee_matches_filters: {
        Args: {
          e: Database["public"]["Tables"]["employees"]["Row"]
          include_archived: boolean
          p_account_status: Database["public"]["Enums"]["employee_account_status"]
          p_employment_status: Database["public"]["Enums"]["employment_status"]
          search_term: string
        }
        Returns: boolean
      }
      end_team_assignment: {
        Args: { target_employee_id: string; target_project_id: string }
        Returns: undefined
      }
      escape_ilike_pattern: { Args: { input: string }; Returns: string }
      finalize_scaffold_inspection: {
        Args: {
          target_inspection_id: string
          target_outcome: Database["public"]["Enums"]["scaffold_inspection_outcome"]
          target_restrictions_notes?: string
        }
        Returns: {
          correction_reason: string | null
          corrects_inspection_id: string | null
          created_at: string
          created_by: string | null
          expires_at: string | null
          finalized_at: string | null
          finalized_by: string | null
          id: string
          inspected_at: string
          inspection_reason: Database["public"]["Enums"]["scaffold_inspection_reason"]
          inspector_id: string
          notes: string | null
          organization_id: string
          outcome:
            | Database["public"]["Enums"]["scaffold_inspection_outcome"]
            | null
          previous_inspection_id: string | null
          project_id: string
          restrictions_notes: string | null
          scaffold_id: string
          status: Database["public"]["Enums"]["scaffold_inspection_status"]
          superseded_by_id: string | null
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "scaffold_inspections"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      generate_user_number: { Args: never; Returns: string }
      get_basic_employee_info: {
        Args: { target_employee_ids: string[] }
        Returns: {
          archived_at: string
          first_name: string
          id: string
          last_name: string
          position_title: string
          profile_id: string
        }[]
      }
      get_toolbox_authorized_employee_info: {
        Args: { target_employee_ids: string[] }
        Returns: {
          employee_number: string
          first_name: string
          id: string
          last_name: string
          profile_id: string
        }[]
      }
      has_any_organization_role: {
        Args: { role_names: string[]; target_org_id: string }
        Returns: boolean
      }
      has_organization_role: {
        Args: { role_name: string; target_org_id: string }
        Returns: boolean
      }
      has_project_access: {
        Args: { target_project_id: string }
        Returns: boolean
      }
      is_eligible_scaffold_foreman: {
        Args: {
          target_employee_id: string
          target_organization_id: string
          target_project_id: string
        }
        Returns: boolean
      }
      is_eligible_scaffold_team_member: {
        Args: {
          target_employee_id: string
          target_organization_id: string
          target_project_id: string
        }
        Returns: boolean
      }
      is_organization_member: {
        Args: { target_org_id: string }
        Returns: boolean
      }
      is_project_foreman: {
        Args: { target_project_id: string }
        Returns: boolean
      }
      is_project_manager: {
        Args: { target_project_id: string }
        Returns: boolean
      }
      is_project_teammate: {
        Args: { target_employee_id: string }
        Returns: boolean
      }
      is_safety_flash_manage_tier: {
        Args: { target_organization_id: string; target_project_id: string }
        Returns: boolean
      }
      is_scaffold_manage_tier: {
        Args: { target_organization_id: string; target_project_id: string }
        Returns: boolean
      }
      is_toolbox_manage_tier: {
        Args: { target_organization_id: string; target_project_id: string }
        Returns: boolean
      }
      is_toolbox_template_manage_tier: {
        Args: { target_organization_id: string }
        Returns: boolean
      }
      list_eligible_scaffold_foremen: {
        Args: { target_organization_id: string; target_project_id: string }
        Returns: {
          employee_number: string
          first_name: string
          id: string
          last_name: string
        }[]
      }
      list_eligible_scaffold_team_members: {
        Args: { target_organization_id: string; target_project_id: string }
        Returns: {
          employee_number: string
          first_name: string
          id: string
          last_name: string
          position_title: string
        }[]
      }
      list_toolbox_authorized_employees: {
        Args: { target_organization_id: string; target_project_id: string }
        Returns: {
          employee_number: string
          first_name: string
          id: string
          last_name: string
          profile_id: string
        }[]
      }
      move_employee_to_team: {
        Args: {
          target_employee_id: string
          target_notes?: string
          target_project_id: string
          target_role?: Database["public"]["Enums"]["team_assignment_role"]
          target_team_id: string
        }
        Returns: {
          assigned_by: string | null
          assignment_role: Database["public"]["Enums"]["team_assignment_role"]
          created_at: string
          employee_id: string
          end_at: string | null
          ended_at: string | null
          ended_by: string | null
          id: string
          notes: string | null
          organization_id: string
          project_id: string
          start_at: string
          team_id: string
        }
        SetofOptions: {
          from: "*"
          to: "team_assignments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      next_employee_number: { Args: { target_org_id: string }; Returns: string }
      reorder_teams: {
        Args: { target_project_id: string; target_team_ids: string[] }
        Returns: undefined
      }
      replace_safety_flash_file: {
        Args: {
          new_file_checksum_sha256: string
          new_file_size_bytes: number
          new_mime_type: string
          new_original_filename: string
          new_storage_object_path: string
          reason: string
          target_flash_id: string
        }
        Returns: {
          category: Database["public"]["Enums"]["hseq_document_category"]
          created_at: string
          created_by: string | null
          date_issued: string
          file_checksum_sha256: string | null
          file_size_bytes: number
          flash_number: number
          id: string
          issued_by_employee_id: string
          language: string
          mime_type: string
          organization_id: string
          original_filename: string
          project_id: string | null
          status: Database["public"]["Enums"]["toolbox_document_status"]
          storage_bucket: string
          storage_object_path: string
          summary: string | null
          title: string
          updated_at: string
          updated_by: string | null
          uploaded_at: string
          uploaded_by: string
        }
        SetofOptions: {
          from: "*"
          to: "safety_flashes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      replace_toolbox_meeting_file: {
        Args: {
          new_file_checksum_sha256: string
          new_file_size_bytes: number
          new_mime_type: string
          new_original_filename: string
          new_storage_object_path: string
          reason: string
          target_meeting_id: string
        }
        Returns: {
          created_at: string
          created_by: string | null
          file_checksum_sha256: string | null
          file_size_bytes: number
          held_by_employee_id: string
          id: string
          meeting_date: string
          meeting_number: number
          mime_type: string
          notes: string | null
          organization_id: string
          original_filename: string
          project_id: string
          status: Database["public"]["Enums"]["toolbox_document_status"]
          storage_bucket: string
          storage_object_path: string
          title: string
          updated_at: string
          updated_by: string | null
          uploaded_at: string
          uploaded_by: string
          work_area: string | null
        }
        SetofOptions: {
          from: "*"
          to: "toolbox_meetings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      replace_toolbox_template_file: {
        Args: {
          new_file_checksum_sha256: string
          new_file_size_bytes: number
          new_mime_type: string
          new_original_filename: string
          new_storage_object_path: string
          reason: string
          target_template_id: string
        }
        Returns: {
          category: Database["public"]["Enums"]["hseq_document_category"]
          created_at: string
          created_by: string | null
          description: string | null
          file_checksum_sha256: string | null
          file_size_bytes: number
          id: string
          language: string
          mime_type: string
          organization_id: string
          original_filename: string
          status: Database["public"]["Enums"]["toolbox_document_status"]
          storage_bucket: string
          storage_object_path: string
          title: string
          updated_at: string
          updated_by: string | null
          uploaded_at: string
          uploaded_by: string
        }
        SetofOptions: {
          from: "*"
          to: "toolbox_templates"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_scaffold_inspection_validity_days: {
        Args: { target_project_id: string }
        Returns: number
      }
      save_lmra_hazards: {
        Args: { target_hazards: Json; target_lmra_id: string }
        Returns: undefined
      }
      save_scaffold_inspection_items: {
        Args: { target_inspection_id: string; target_items: Json }
        Returns: undefined
      }
      save_team_with_assignments: {
        Args: {
          target_assignments?: Json
          target_code: string
          target_color: Database["public"]["Enums"]["team_color"]
          target_description: string
          target_name: string
          target_project_id: string
          target_status: Database["public"]["Enums"]["team_status"]
          target_team_id: string
        }
        Returns: {
          code: string | null
          color: Database["public"]["Enums"]["team_color"]
          created_at: string
          created_by: string | null
          description: string | null
          display_order: number
          id: string
          name: string
          organization_id: string
          project_id: string
          status: Database["public"]["Enums"]["team_status"]
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "teams"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      search_employees: {
        Args: {
          include_archived?: boolean
          p_account_status?: Database["public"]["Enums"]["employee_account_status"]
          p_employment_status?: Database["public"]["Enums"]["employment_status"]
          page_limit?: number
          page_offset?: number
          search_term?: string
          target_org_id: string
        }
        Returns: {
          account_status: Database["public"]["Enums"]["employee_account_status"]
          archived_at: string
          employee_number: string
          employment_status: Database["public"]["Enums"]["employment_status"]
          first_name: string
          id: string
          last_name: string
          position_title: string
          profile_id: string
          work_email: string
        }[]
      }
    }
    Enums: {
      audit_action:
        | "create"
        | "update"
        | "delete"
        | "restore"
        | "approve"
        | "reject"
        | "sign"
        | "close"
        | "amend"
        | "archive"
        | "end_employment"
        | "rehire"
      corrective_action_priority: "low" | "medium" | "high" | "critical"
      corrective_action_status:
        | "open"
        | "in_progress"
        | "awaiting_verification"
        | "closed"
        | "rejected"
      employee_account_status:
        | "draft"
        | "invited"
        | "pending_activation"
        | "active"
        | "suspended"
        | "archived"
      employment_end_reason:
        | "resigned"
        | "terminated"
        | "layoff"
        | "end_of_contract"
        | "other"
      employment_status: "active" | "inactive" | "on_leave" | "terminated"
      hseq_document_category:
        | "working_at_height"
        | "line_of_fire"
        | "material_handling"
        | "falling_objects"
        | "scaffold_erection_dismantling"
        | "scaffold_inspection"
        | "ppe"
        | "access_egress"
        | "housekeeping"
        | "lifting_operations"
        | "mewp_mobile_equipment"
        | "tools_equipment"
        | "weather_conditions"
        | "emergency_response"
        | "alcohol_drugs"
        | "fit_for_work"
        | "incident_lessons_learned"
        | "other"
      lmra_hazard_type:
        | "working_at_height"
        | "falling_objects"
        | "line_of_fire"
        | "manual_material_handling"
        | "lifting_operations"
        | "mobile_equipment_mewp"
        | "weather_conditions"
        | "access_egress"
        | "housekeeping"
        | "tools_equipment"
        | "simultaneous_operations"
        | "other"
      lmra_result: "go" | "no_go"
      lmra_status: "draft" | "submitted" | "approved" | "rejected" | "archived"
      membership_status: "invited" | "active" | "suspended" | "removed"
      observation_category:
        | "positive_observation"
        | "unsafe_act"
        | "unsafe_condition"
        | "line_of_fire"
        | "working_at_height"
        | "falling_objects"
        | "material_handling"
        | "housekeeping"
        | "tools_equipment"
        | "mobile_equipment_mewp"
        | "access_egress"
        | "ppe"
        | "other"
      observation_risk_level: "low" | "medium" | "high" | "critical"
      observation_status: "open" | "closed"
      organization_status: "trial" | "active" | "suspended"
      project_assignment_role:
        | "project_manager"
        | "hseq_manager"
        | "hse_officer"
        | "inspector"
        | "member"
      project_status: "planning" | "active" | "completed" | "archived"
      scaffold_defect_severity: "low" | "medium" | "high" | "critical"
      scaffold_defect_status:
        | "open"
        | "in_progress"
        | "awaiting_verification"
        | "closed"
        | "rejected"
      scaffold_inspection_item_result:
        | "acceptable"
        | "defect_found"
        | "not_applicable"
      scaffold_inspection_item_type:
        | "foundation_sole_boards"
        | "base_plates_adjustable_bases"
        | "standards"
        | "ledgers"
        | "transoms"
        | "bracing"
        | "ties_anchors"
        | "platforms_decking"
        | "guardrails"
        | "midrails"
        | "toe_boards"
        | "access_ladders_stairways"
        | "access_gates"
        | "loading_bays"
        | "sheet_netting_condition"
        | "falling_object_controls"
        | "scaffold_tag_signage"
        | "housekeeping"
        | "maximum_load_information"
        | "electrical_clearance"
        | "vehicle_mobile_equipment_protection"
        | "unauthorized_alterations"
        | "overall_stability"
        | "other_identified_issue"
      scaffold_inspection_outcome:
        | "safe_for_use"
        | "safe_with_restrictions"
        | "unsafe_do_not_use"
        | "awaiting_corrective_action"
        | "closed_dismantled"
      scaffold_inspection_reason:
        | "initial_handover"
        | "routine_inspection"
        | "after_modification"
        | "after_severe_weather"
        | "after_impact_incident"
        | "after_relocation"
        | "reinspection_following_defects"
        | "other"
      scaffold_inspection_status: "draft" | "finalized"
      scaffold_status:
        | "pending_inspection"
        | "safe"
        | "restricted"
        | "awaiting_corrective_action"
        | "unsafe"
        | "closed"
      scaffold_type:
        | "independent"
        | "birdcage"
        | "mobile"
        | "suspended"
        | "cantilever"
        | "access_tower"
        | "loading_bay"
        | "temporary_roof"
        | "other"
      team_assignment_role: "member" | "foreman"
      team_color:
        | "gray"
        | "blue"
        | "green"
        | "yellow"
        | "orange"
        | "red"
        | "purple"
        | "cyan"
        | "brown"
      team_status: "active" | "archived"
      toolbox_document_status: "active" | "archived"
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
    Enums: {
      audit_action: [
        "create",
        "update",
        "delete",
        "restore",
        "approve",
        "reject",
        "sign",
        "close",
        "amend",
        "archive",
        "end_employment",
        "rehire",
      ],
      corrective_action_priority: ["low", "medium", "high", "critical"],
      corrective_action_status: [
        "open",
        "in_progress",
        "awaiting_verification",
        "closed",
        "rejected",
      ],
      employee_account_status: [
        "draft",
        "invited",
        "pending_activation",
        "active",
        "suspended",
        "archived",
      ],
      employment_end_reason: [
        "resigned",
        "terminated",
        "layoff",
        "end_of_contract",
        "other",
      ],
      employment_status: ["active", "inactive", "on_leave", "terminated"],
      hseq_document_category: [
        "working_at_height",
        "line_of_fire",
        "material_handling",
        "falling_objects",
        "scaffold_erection_dismantling",
        "scaffold_inspection",
        "ppe",
        "access_egress",
        "housekeeping",
        "lifting_operations",
        "mewp_mobile_equipment",
        "tools_equipment",
        "weather_conditions",
        "emergency_response",
        "alcohol_drugs",
        "fit_for_work",
        "incident_lessons_learned",
        "other",
      ],
      lmra_hazard_type: [
        "working_at_height",
        "falling_objects",
        "line_of_fire",
        "manual_material_handling",
        "lifting_operations",
        "mobile_equipment_mewp",
        "weather_conditions",
        "access_egress",
        "housekeeping",
        "tools_equipment",
        "simultaneous_operations",
        "other",
      ],
      lmra_result: ["go", "no_go"],
      lmra_status: ["draft", "submitted", "approved", "rejected", "archived"],
      membership_status: ["invited", "active", "suspended", "removed"],
      observation_category: [
        "positive_observation",
        "unsafe_act",
        "unsafe_condition",
        "line_of_fire",
        "working_at_height",
        "falling_objects",
        "material_handling",
        "housekeeping",
        "tools_equipment",
        "mobile_equipment_mewp",
        "access_egress",
        "ppe",
        "other",
      ],
      observation_risk_level: ["low", "medium", "high", "critical"],
      observation_status: ["open", "closed"],
      organization_status: ["trial", "active", "suspended"],
      project_assignment_role: [
        "project_manager",
        "hseq_manager",
        "hse_officer",
        "inspector",
        "member",
      ],
      project_status: ["planning", "active", "completed", "archived"],
      scaffold_defect_severity: ["low", "medium", "high", "critical"],
      scaffold_defect_status: [
        "open",
        "in_progress",
        "awaiting_verification",
        "closed",
        "rejected",
      ],
      scaffold_inspection_item_result: [
        "acceptable",
        "defect_found",
        "not_applicable",
      ],
      scaffold_inspection_item_type: [
        "foundation_sole_boards",
        "base_plates_adjustable_bases",
        "standards",
        "ledgers",
        "transoms",
        "bracing",
        "ties_anchors",
        "platforms_decking",
        "guardrails",
        "midrails",
        "toe_boards",
        "access_ladders_stairways",
        "access_gates",
        "loading_bays",
        "sheet_netting_condition",
        "falling_object_controls",
        "scaffold_tag_signage",
        "housekeeping",
        "maximum_load_information",
        "electrical_clearance",
        "vehicle_mobile_equipment_protection",
        "unauthorized_alterations",
        "overall_stability",
        "other_identified_issue",
      ],
      scaffold_inspection_outcome: [
        "safe_for_use",
        "safe_with_restrictions",
        "unsafe_do_not_use",
        "awaiting_corrective_action",
        "closed_dismantled",
      ],
      scaffold_inspection_reason: [
        "initial_handover",
        "routine_inspection",
        "after_modification",
        "after_severe_weather",
        "after_impact_incident",
        "after_relocation",
        "reinspection_following_defects",
        "other",
      ],
      scaffold_inspection_status: ["draft", "finalized"],
      scaffold_status: [
        "pending_inspection",
        "safe",
        "restricted",
        "awaiting_corrective_action",
        "unsafe",
        "closed",
      ],
      scaffold_type: [
        "independent",
        "birdcage",
        "mobile",
        "suspended",
        "cantilever",
        "access_tower",
        "loading_bay",
        "temporary_roof",
        "other",
      ],
      team_assignment_role: ["member", "foreman"],
      team_color: [
        "gray",
        "blue",
        "green",
        "yellow",
        "orange",
        "red",
        "purple",
        "cyan",
        "brown",
      ],
      team_status: ["active", "archived"],
      toolbox_document_status: ["active", "archived"],
    },
  },
} as const
