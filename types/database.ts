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
      absence_reports: {
        Row: {
          comment: string | null
          company_id: string
          employee_id: string
          id: string
          project_id: string
          reason: Database["public"]["Enums"]["absence_report_reason"]
          reported_at: string
          reported_by: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["absence_report_status"]
          work_date: string
        }
        Insert: {
          comment?: string | null
          company_id: string
          employee_id: string
          id?: string
          project_id: string
          reason: Database["public"]["Enums"]["absence_report_reason"]
          reported_at?: string
          reported_by: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["absence_report_status"]
          work_date: string
        }
        Update: {
          comment?: string | null
          company_id?: string
          employee_id?: string
          id?: string
          project_id?: string
          reason?: Database["public"]["Enums"]["absence_report_reason"]
          reported_at?: string
          reported_by?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["absence_report_status"]
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "absence_reports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "absence_reports_employee_fk"
            columns: ["employee_id", "company_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "absence_reports_project_fk"
            columns: ["project_id", "company_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "absence_reports_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "absence_reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_user_id: string | null
          changes: Json | null
          company_id: string | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          ip_address: unknown
        }
        Insert: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_user_id?: string | null
          changes?: Json | null
          company_id?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          ip_address?: unknown
        }
        Update: {
          action?: Database["public"]["Enums"]["audit_action"]
          actor_user_id?: string | null
          changes?: Json | null
          company_id?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          ip_address?: unknown
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
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      bootstrap_audit_log: {
        Row: {
          company_id: string
          id: string
          notes: string | null
          performed_at: string
          role_assigned: string
          user_id: string
        }
        Insert: {
          company_id: string
          id?: string
          notes?: string | null
          performed_at?: string
          role_assigned: string
          user_id: string
        }
        Update: {
          company_id?: string
          id?: string
          notes?: string | null
          performed_at?: string
          role_assigned?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bootstrap_audit_log_organization_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
      companies: {
        Row: {
          created_at: string
          deleted_at: string | null
          employee_number_prefix: string
          id: string
          logo_storage_path: string | null
          name: string
          scaffold_inspection_validity_days: number | null
          slug: string
          status: Database["public"]["Enums"]["company_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          employee_number_prefix: string
          id?: string
          logo_storage_path?: string | null
          name: string
          scaffold_inspection_validity_days?: number | null
          slug: string
          status?: Database["public"]["Enums"]["company_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          employee_number_prefix?: string
          id?: string
          logo_storage_path?: string | null
          name?: string
          scaffold_inspection_validity_days?: number | null
          slug?: string
          status?: Database["public"]["Enums"]["company_status"]
          updated_at?: string
        }
        Relationships: []
      }
      company_employee_number_counters: {
        Row: {
          company_id: string
          next_number: number
          updated_at: string
        }
        Insert: {
          company_id: string
          next_number?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          next_number?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_employee_number_counters_organization_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_memberships: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          invited_at: string | null
          joined_at: string | null
          status: Database["public"]["Enums"]["membership_status"]
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          invited_at?: string | null
          joined_at?: string | null
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          invited_at?: string | null
          joined_at?: string | null
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
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
      corrective_actions: {
        Row: {
          closure_evidence: string | null
          company_id: string
          completion_notes: string | null
          created_at: string
          created_by: string | null
          description: string
          due_date: string
          id: string
          observation_id: string
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
          company_id: string
          completion_notes?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          due_date: string
          id?: string
          observation_id: string
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
          company_id?: string
          completion_notes?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          due_date?: string
          id?: string
          observation_id?: string
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
            columns: ["observation_id", "company_id"]
            isOneToOne: false
            referencedRelation: "safety_observations"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "corrective_actions_organization_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corrective_actions_project_fk"
            columns: ["project_id", "company_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "corrective_actions_responsible_person_fk"
            columns: ["responsible_person_id", "company_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id", "company_id"]
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
      daily_attendance: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          employee_id: string
          id: string
          note: string | null
          project_id: string
          status: Database["public"]["Enums"]["daily_attendance_status"]
          updated_at: string
          updated_by: string | null
          work_date: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          employee_id: string
          id?: string
          note?: string | null
          project_id: string
          status?: Database["public"]["Enums"]["daily_attendance_status"]
          updated_at?: string
          updated_by?: string | null
          work_date: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          employee_id?: string
          id?: string
          note?: string | null
          project_id?: string
          status?: Database["public"]["Enums"]["daily_attendance_status"]
          updated_at?: string
          updated_by?: string | null
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_attendance_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_attendance_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_attendance_employee_fk"
            columns: ["employee_id", "company_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "daily_attendance_project_fk"
            columns: ["project_id", "company_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "daily_attendance_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_attendance_corrections: {
        Row: {
          changed_at: string
          changed_by: string
          company_id: string
          employee_id: string
          id: string
          new_status: Database["public"]["Enums"]["daily_attendance_status"]
          previous_status: Database["public"]["Enums"]["daily_attendance_status"]
          project_id: string
          reason: string
          work_date: string
        }
        Insert: {
          changed_at?: string
          changed_by: string
          company_id: string
          employee_id: string
          id?: string
          new_status: Database["public"]["Enums"]["daily_attendance_status"]
          previous_status: Database["public"]["Enums"]["daily_attendance_status"]
          project_id: string
          reason: string
          work_date: string
        }
        Update: {
          changed_at?: string
          changed_by?: string
          company_id?: string
          employee_id?: string
          id?: string
          new_status?: Database["public"]["Enums"]["daily_attendance_status"]
          previous_status?: Database["public"]["Enums"]["daily_attendance_status"]
          project_id?: string
          reason?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_attendance_corrections_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_attendance_corrections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_attendance_day_locks: {
        Row: {
          company_id: string
          id: string
          locked_at: string
          locked_by: string | null
          project_id: string
          unlock_reason: string | null
          unlocked_at: string | null
          unlocked_by: string | null
          work_date: string
        }
        Insert: {
          company_id: string
          id?: string
          locked_at?: string
          locked_by?: string | null
          project_id: string
          unlock_reason?: string | null
          unlocked_at?: string | null
          unlocked_by?: string | null
          work_date: string
        }
        Update: {
          company_id?: string
          id?: string
          locked_at?: string
          locked_by?: string | null
          project_id?: string
          unlock_reason?: string | null
          unlocked_at?: string | null
          unlocked_by?: string | null
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_attendance_day_locks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_attendance_day_locks_locked_by_fkey"
            columns: ["locked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_attendance_day_locks_project_fk"
            columns: ["project_id", "company_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "daily_attendance_day_locks_unlocked_by_fkey"
            columns: ["unlocked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_team_foreman_roster: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          foreman_employee_id: string
          id: string
          project_id: string
          work_date: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          foreman_employee_id: string
          id?: string
          project_id: string
          work_date: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          foreman_employee_id?: string
          id?: string
          project_id?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_team_foreman_roster_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_team_foreman_roster_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_team_foreman_roster_employee_fk"
            columns: ["foreman_employee_id", "company_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "daily_team_foreman_roster_project_fk"
            columns: ["project_id", "company_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "company_id"]
          },
        ]
      }
      daily_team_members: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          daily_team_id: string
          employee_id: string
          id: string
          project_id: string
          removed_at: string | null
          removed_by: string | null
          role: Database["public"]["Enums"]["team_assignment_role"]
          shift: Database["public"]["Enums"]["lmra_shift"] | null
          work_date: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          daily_team_id: string
          employee_id: string
          id?: string
          project_id: string
          removed_at?: string | null
          removed_by?: string | null
          role?: Database["public"]["Enums"]["team_assignment_role"]
          shift?: Database["public"]["Enums"]["lmra_shift"] | null
          work_date: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          daily_team_id?: string
          employee_id?: string
          id?: string
          project_id?: string
          removed_at?: string | null
          removed_by?: string | null
          role?: Database["public"]["Enums"]["team_assignment_role"]
          shift?: Database["public"]["Enums"]["lmra_shift"] | null
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_team_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_team_members_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_team_members_employee_fk"
            columns: ["employee_id", "company_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "daily_team_members_removed_by_fkey"
            columns: ["removed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_team_members_team_fk"
            columns: ["daily_team_id", "project_id", "company_id"]
            isOneToOne: false
            referencedRelation: "daily_teams"
            referencedColumns: ["id", "project_id", "company_id"]
          },
        ]
      }
      daily_teams: {
        Row: {
          activity: string | null
          company_id: string
          created_at: string
          created_by: string | null
          display_order: number
          foreman_employee_id: string | null
          id: string
          locked_at: string | null
          locked_by: string | null
          name: string
          project_id: string
          shift: Database["public"]["Enums"]["lmra_shift"] | null
          status: Database["public"]["Enums"]["daily_team_status"]
          unlock_reason: string | null
          unlocked_at: string | null
          unlocked_by: string | null
          updated_at: string
          updated_by: string | null
          work_area: string | null
          work_date: string
        }
        Insert: {
          activity?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          display_order?: number
          foreman_employee_id?: string | null
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          name: string
          project_id: string
          shift?: Database["public"]["Enums"]["lmra_shift"] | null
          status?: Database["public"]["Enums"]["daily_team_status"]
          unlock_reason?: string | null
          unlocked_at?: string | null
          unlocked_by?: string | null
          updated_at?: string
          updated_by?: string | null
          work_area?: string | null
          work_date: string
        }
        Update: {
          activity?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          display_order?: number
          foreman_employee_id?: string | null
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          name?: string
          project_id?: string
          shift?: Database["public"]["Enums"]["lmra_shift"] | null
          status?: Database["public"]["Enums"]["daily_team_status"]
          unlock_reason?: string | null
          unlocked_at?: string | null
          unlocked_by?: string | null
          updated_at?: string
          updated_by?: string | null
          work_area?: string | null
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_teams_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_teams_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_teams_foreman_fk"
            columns: ["foreman_employee_id", "company_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "daily_teams_locked_by_fkey"
            columns: ["locked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_teams_project_fk"
            columns: ["project_id", "company_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "daily_teams_unlocked_by_fkey"
            columns: ["unlocked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_teams_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_employment_periods: {
        Row: {
          company_id: string
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
          start_date: string
          updated_at: string
        }
        Insert: {
          company_id: string
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
          start_date: string
          updated_at?: string
        }
        Update: {
          company_id?: string
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
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          account_status: Database["public"]["Enums"]["employee_account_status"]
          archived_at: string | null
          birth_date: string | null
          company_id: string
          created_at: string
          created_by: string | null
          employee_number: string
          employment_status: Database["public"]["Enums"]["employment_status"]
          end_date: string | null
          first_name: string
          id: string
          last_name: string
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
          company_id: string
          created_at?: string
          created_by?: string | null
          employee_number: string
          employment_status: Database["public"]["Enums"]["employment_status"]
          end_date?: string | null
          first_name: string
          id?: string
          last_name: string
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
          company_id?: string
          created_at?: string
          created_by?: string | null
          employee_number?: string
          employment_status?: Database["public"]["Enums"]["employment_status"]
          end_date?: string | null
          first_name?: string
          id?: string
          last_name?: string
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
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
      leave_request_history: {
        Row: {
          changed_at: string
          changed_by: string
          comment: string | null
          company_id: string
          from_status:
            | Database["public"]["Enums"]["leave_request_status"]
            | null
          id: string
          leave_request_id: string
          to_status: Database["public"]["Enums"]["leave_request_status"]
        }
        Insert: {
          changed_at?: string
          changed_by: string
          comment?: string | null
          company_id: string
          from_status?:
            | Database["public"]["Enums"]["leave_request_status"]
            | null
          id?: string
          leave_request_id: string
          to_status: Database["public"]["Enums"]["leave_request_status"]
        }
        Update: {
          changed_at?: string
          changed_by?: string
          comment?: string | null
          company_id?: string
          from_status?:
            | Database["public"]["Enums"]["leave_request_status"]
            | null
          id?: string
          leave_request_id?: string
          to_status?: Database["public"]["Enums"]["leave_request_status"]
        }
        Relationships: [
          {
            foreignKeyName: "leave_request_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_request_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_request_history_leave_request_id_fkey"
            columns: ["leave_request_id"]
            isOneToOne: false
            referencedRelation: "leave_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          cancelled_at: string | null
          cancelled_by: string | null
          company_id: string
          decided_at: string | null
          decided_by: string | null
          employee_comment: string | null
          employee_id: string
          end_date: string
          id: string
          leave_type: Database["public"]["Enums"]["leave_type"]
          management_comment: string | null
          project_id: string
          requested_at: string
          requested_by: string
          start_date: string
          status: Database["public"]["Enums"]["leave_request_status"]
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          company_id: string
          decided_at?: string | null
          decided_by?: string | null
          employee_comment?: string | null
          employee_id: string
          end_date: string
          id?: string
          leave_type: Database["public"]["Enums"]["leave_type"]
          management_comment?: string | null
          project_id: string
          requested_at?: string
          requested_by: string
          start_date: string
          status?: Database["public"]["Enums"]["leave_request_status"]
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          company_id?: string
          decided_at?: string | null
          decided_by?: string | null
          employee_comment?: string | null
          employee_id?: string
          end_date?: string
          id?: string
          leave_type?: Database["public"]["Enums"]["leave_type"]
          management_comment?: string | null
          project_id?: string
          requested_at?: string
          requested_by?: string
          start_date?: string
          status?: Database["public"]["Enums"]["leave_request_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_employee_fk"
            columns: ["employee_id", "company_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "leave_requests_project_fk"
            columns: ["project_id", "company_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "leave_requests_requested_by_fkey"
            columns: ["requested_by"]
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
          company_id: string
          completed_by_employee_id: string
          created_at: string
          created_by: string | null
          daily_team_id: string | null
          id: string
          notes: string | null
          project_id: string
          responsible_person_id: string | null
          result: Database["public"]["Enums"]["lmra_result"]
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          shift: Database["public"]["Enums"]["lmra_shift"]
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
          company_id: string
          completed_by_employee_id: string
          created_at?: string
          created_by?: string | null
          daily_team_id?: string | null
          id?: string
          notes?: string | null
          project_id: string
          responsible_person_id?: string | null
          result?: Database["public"]["Enums"]["lmra_result"]
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          shift: Database["public"]["Enums"]["lmra_shift"]
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
          company_id?: string
          completed_by_employee_id?: string
          created_at?: string
          created_by?: string | null
          daily_team_id?: string | null
          id?: string
          notes?: string | null
          project_id?: string
          responsible_person_id?: string | null
          result?: Database["public"]["Enums"]["lmra_result"]
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          shift?: Database["public"]["Enums"]["lmra_shift"]
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
            foreignKeyName: "lmra_assessments_completed_by_fk"
            columns: ["completed_by_employee_id", "company_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "lmra_assessments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lmra_assessments_daily_team_fk"
            columns: ["daily_team_id", "company_id"]
            isOneToOne: false
            referencedRelation: "daily_teams"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "lmra_assessments_organization_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lmra_assessments_project_fk"
            columns: ["project_id", "company_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "lmra_assessments_responsible_person_fk"
            columns: ["responsible_person_id", "company_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id", "company_id"]
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
          company_id: string
          controls: string | null
          controls_confirmed: boolean
          created_at: string
          hazard_type: Database["public"]["Enums"]["lmra_hazard_type"]
          id: string
          is_applicable: boolean
          lmra_assessment_id: string
          other_description: string | null
          responsible_person_id: string | null
          selected_controls: string[]
          updated_at: string
        }
        Insert: {
          company_id: string
          controls?: string | null
          controls_confirmed?: boolean
          created_at?: string
          hazard_type: Database["public"]["Enums"]["lmra_hazard_type"]
          id?: string
          is_applicable?: boolean
          lmra_assessment_id: string
          other_description?: string | null
          responsible_person_id?: string | null
          selected_controls?: string[]
          updated_at?: string
        }
        Update: {
          company_id?: string
          controls?: string | null
          controls_confirmed?: boolean
          created_at?: string
          hazard_type?: Database["public"]["Enums"]["lmra_hazard_type"]
          id?: string
          is_applicable?: boolean
          lmra_assessment_id?: string
          other_description?: string | null
          responsible_person_id?: string | null
          selected_controls?: string[]
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
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lmra_hazards_responsible_person_fk"
            columns: ["responsible_person_id", "company_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id", "company_id"]
          },
        ]
      }
      lmra_participants: {
        Row: {
          company_id: string
          created_at: string
          employee_id: string
          id: string
          lmra_assessment_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          employee_id: string
          id?: string
          lmra_assessment_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          employee_id?: string
          id?: string
          lmra_assessment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lmra_participants_employee_fk"
            columns: ["employee_id", "company_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id", "company_id"]
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
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_roles: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          membership_id: string
          role_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          membership_id: string
          role_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          membership_id?: string
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
            referencedRelation: "company_memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_roles_organization_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
      notifications: {
        Row: {
          body: string | null
          company_id: string
          created_at: string
          id: string
          link_path: string | null
          read_at: string | null
          recipient_user_id: string
          title: string
          type: string
        }
        Insert: {
          body?: string | null
          company_id: string
          created_at?: string
          id?: string
          link_path?: string | null
          read_at?: string | null
          recipient_user_id: string
          title: string
          type: string
        }
        Update: {
          body?: string | null
          company_id?: string
          created_at?: string
          id?: string
          link_path?: string | null
          read_at?: string | null
          recipient_user_id?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_super_admins: {
        Row: {
          granted_at: string
          granted_by: string | null
          notes: string | null
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          notes?: string | null
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          notes?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_super_admins_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_super_admins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_warnings: {
        Row: {
          acknowledged_at: string | null
          id: string
          issued_at: string
          issued_by: string
          reason: string
          user_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          id?: string
          issued_at?: string
          issued_by: string
          reason: string
          user_id: string
        }
        Update: {
          acknowledged_at?: string | null
          id?: string
          issued_at?: string
          issued_by?: string
          reason?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_warnings_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_warnings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          accent_theme: Database["public"]["Enums"]["accent_theme"]
          account_status: Database["public"]["Enums"]["account_status"]
          account_status_changed_at: string | null
          account_status_changed_by: string | null
          account_status_reason: string | null
          active_company_id: string | null
          active_project_id: string | null
          created_at: string
          full_name: string
          id: string
          phone: string | null
          theme_mode: Database["public"]["Enums"]["theme_mode"]
          updated_at: string
          user_number: string
        }
        Insert: {
          accent_theme?: Database["public"]["Enums"]["accent_theme"]
          account_status?: Database["public"]["Enums"]["account_status"]
          account_status_changed_at?: string | null
          account_status_changed_by?: string | null
          account_status_reason?: string | null
          active_company_id?: string | null
          active_project_id?: string | null
          created_at?: string
          full_name: string
          id: string
          phone?: string | null
          theme_mode?: Database["public"]["Enums"]["theme_mode"]
          updated_at?: string
          user_number: string
        }
        Update: {
          accent_theme?: Database["public"]["Enums"]["accent_theme"]
          account_status?: Database["public"]["Enums"]["account_status"]
          account_status_changed_at?: string | null
          account_status_changed_by?: string | null
          account_status_reason?: string | null
          active_company_id?: string | null
          active_project_id?: string | null
          created_at?: string
          full_name?: string
          id?: string
          phone?: string | null
          theme_mode?: Database["public"]["Enums"]["theme_mode"]
          updated_at?: string
          user_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_account_status_changed_by_fkey"
            columns: ["account_status_changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_active_organization_id_fkey"
            columns: ["active_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_active_project_id_fkey"
            columns: ["active_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_assignments: {
        Row: {
          assigned_by: string | null
          assignment_role: Database["public"]["Enums"]["project_assignment_role"]
          company_id: string
          created_at: string
          employee_id: string
          end_at: string | null
          ended_at: string | null
          ended_by: string | null
          id: string
          notes: string | null
          project_id: string
          start_at: string
        }
        Insert: {
          assigned_by?: string | null
          assignment_role: Database["public"]["Enums"]["project_assignment_role"]
          company_id: string
          created_at?: string
          employee_id: string
          end_at?: string | null
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          notes?: string | null
          project_id: string
          start_at?: string
        }
        Update: {
          assigned_by?: string | null
          assignment_role?: Database["public"]["Enums"]["project_assignment_role"]
          company_id?: string
          created_at?: string
          employee_id?: string
          end_at?: string | null
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          notes?: string | null
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
            columns: ["employee_id", "company_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id", "company_id"]
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
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_assignments_project_fk"
            columns: ["project_id", "company_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "company_id"]
          },
        ]
      }
      projects: {
        Row: {
          client_name: string | null
          code: string | null
          company_id: string
          created_at: string
          created_by: string | null
          description: string | null
          end_date: string | null
          id: string
          location: string | null
          name: string
          scaffold_inspection_validity_days: number | null
          start_date: string | null
          status: Database["public"]["Enums"]["project_status"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          client_name?: string | null
          code?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          location?: string | null
          name: string
          scaffold_inspection_validity_days?: number | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          client_name?: string | null
          code?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          location?: string | null
          name?: string
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
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
      report_shares: {
        Row: {
          company_id: string
          corrective_action_id: string | null
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          last_viewed_at: string | null
          lmra_assessment_id: string | null
          project_id: string | null
          record_type: Database["public"]["Enums"]["report_record_type"]
          revoked_at: string | null
          revoked_by: string | null
          safety_flash_id: string | null
          safety_observation_id: string | null
          scaffold_inspection_id: string | null
          token_hash: string
          toolbox_meeting_id: string | null
          view_count: number
        }
        Insert: {
          company_id: string
          corrective_action_id?: string | null
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          last_viewed_at?: string | null
          lmra_assessment_id?: string | null
          project_id?: string | null
          record_type: Database["public"]["Enums"]["report_record_type"]
          revoked_at?: string | null
          revoked_by?: string | null
          safety_flash_id?: string | null
          safety_observation_id?: string | null
          scaffold_inspection_id?: string | null
          token_hash: string
          toolbox_meeting_id?: string | null
          view_count?: number
        }
        Update: {
          company_id?: string
          corrective_action_id?: string | null
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          last_viewed_at?: string | null
          lmra_assessment_id?: string | null
          project_id?: string | null
          record_type?: Database["public"]["Enums"]["report_record_type"]
          revoked_at?: string | null
          revoked_by?: string | null
          safety_flash_id?: string | null
          safety_observation_id?: string | null
          scaffold_inspection_id?: string | null
          token_hash?: string
          toolbox_meeting_id?: string | null
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "report_shares_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_shares_corrective_action_id_fkey"
            columns: ["corrective_action_id"]
            isOneToOne: false
            referencedRelation: "corrective_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_shares_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_shares_lmra_assessment_id_fkey"
            columns: ["lmra_assessment_id"]
            isOneToOne: false
            referencedRelation: "lmra_assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_shares_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_shares_safety_flash_id_fkey"
            columns: ["safety_flash_id"]
            isOneToOne: false
            referencedRelation: "safety_flashes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_shares_safety_observation_id_fkey"
            columns: ["safety_observation_id"]
            isOneToOne: false
            referencedRelation: "safety_observations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_shares_scaffold_inspection_id_fkey"
            columns: ["scaffold_inspection_id"]
            isOneToOne: false
            referencedRelation: "scaffold_inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_shares_toolbox_meeting_id_fkey"
            columns: ["toolbox_meeting_id"]
            isOneToOne: false
            referencedRelation: "toolbox_meetings"
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
          company_id: string
          id: string
          new_original_filename: string
          new_storage_bucket: string
          new_storage_object_path: string
          previous_original_filename: string
          previous_storage_bucket: string
          previous_storage_object_path: string
          reason: string
          replaced_at: string
          replaced_by: string
          safety_flash_id: string
        }
        Insert: {
          company_id: string
          id?: string
          new_original_filename: string
          new_storage_bucket: string
          new_storage_object_path: string
          previous_original_filename: string
          previous_storage_bucket: string
          previous_storage_object_path: string
          reason: string
          replaced_at?: string
          replaced_by: string
          safety_flash_id: string
        }
        Update: {
          company_id?: string
          id?: string
          new_original_filename?: string
          new_storage_bucket?: string
          new_storage_object_path?: string
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
            columns: ["safety_flash_id", "company_id"]
            isOneToOne: false
            referencedRelation: "safety_flashes"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "safety_flash_file_replacements_organization_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
          company_id: string
          next_number: number
          updated_at: string
        }
        Insert: {
          company_id: string
          next_number?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          next_number?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "safety_flash_number_counters_organization_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_flashes: {
        Row: {
          category: Database["public"]["Enums"]["hseq_document_category"]
          company_id: string
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
          company_id: string
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
          company_id?: string
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
            columns: ["issued_by_employee_id", "company_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "safety_flashes_organization_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_flashes_project_fk"
            columns: ["project_id", "company_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "company_id"]
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
          company_id: string
          created_at: string
          employee_id: string
          id: string
          observation_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          employee_id: string
          id?: string
          observation_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          employee_id?: string
          id?: string
          observation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "safety_observation_participants_employee_fk"
            columns: ["employee_id", "company_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id", "company_id"]
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
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_observations: {
        Row: {
          category: Database["public"]["Enums"]["observation_category"]
          closed_at: string | null
          closed_by: string | null
          company_id: string
          created_at: string
          created_by: string | null
          description: string
          disposition:
            | Database["public"]["Enums"]["observation_negative_disposition"]
            | null
          id: string
          immediate_action_taken: string | null
          is_stop_work: boolean
          observation_type: Database["public"]["Enums"]["observation_type"]
          observed_at: string
          observer_id: string
          project_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          risk_level: Database["public"]["Enums"]["observation_risk_level"]
          status: Database["public"]["Enums"]["observation_status"]
          target_daily_team_id: string | null
          target_employee_id: string | null
          target_type: Database["public"]["Enums"]["observation_target_type"]
          updated_at: string
          updated_by: string | null
          work_area: string
        }
        Insert: {
          category: Database["public"]["Enums"]["observation_category"]
          closed_at?: string | null
          closed_by?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          description: string
          disposition?:
            | Database["public"]["Enums"]["observation_negative_disposition"]
            | null
          id?: string
          immediate_action_taken?: string | null
          is_stop_work?: boolean
          observation_type: Database["public"]["Enums"]["observation_type"]
          observed_at?: string
          observer_id: string
          project_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk_level?: Database["public"]["Enums"]["observation_risk_level"]
          status?: Database["public"]["Enums"]["observation_status"]
          target_daily_team_id?: string | null
          target_employee_id?: string | null
          target_type?: Database["public"]["Enums"]["observation_target_type"]
          updated_at?: string
          updated_by?: string | null
          work_area: string
        }
        Update: {
          category?: Database["public"]["Enums"]["observation_category"]
          closed_at?: string | null
          closed_by?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string
          disposition?:
            | Database["public"]["Enums"]["observation_negative_disposition"]
            | null
          id?: string
          immediate_action_taken?: string | null
          is_stop_work?: boolean
          observation_type?: Database["public"]["Enums"]["observation_type"]
          observed_at?: string
          observer_id?: string
          project_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk_level?: Database["public"]["Enums"]["observation_risk_level"]
          status?: Database["public"]["Enums"]["observation_status"]
          target_daily_team_id?: string | null
          target_employee_id?: string | null
          target_type?: Database["public"]["Enums"]["observation_target_type"]
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
            columns: ["observer_id", "company_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "safety_observations_organization_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_observations_project_fk"
            columns: ["project_id", "company_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "safety_observations_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_observations_target_daily_team_fk"
            columns: ["target_daily_team_id", "company_id"]
            isOneToOne: false
            referencedRelation: "daily_teams"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "safety_observations_target_employee_fk"
            columns: ["target_employee_id", "company_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id", "company_id"]
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
          company_id: string
          completion_notes: string | null
          created_at: string
          created_by: string | null
          description: string
          due_date: string
          id: string
          immediate_control: string | null
          inspection_item_id: string | null
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
          company_id: string
          completion_notes?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          due_date: string
          id?: string
          immediate_control?: string | null
          inspection_item_id?: string | null
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
          company_id?: string
          completion_notes?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          due_date?: string
          id?: string
          immediate_control?: string | null
          inspection_item_id?: string | null
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
            columns: ["scaffold_inspection_id", "company_id"]
            isOneToOne: false
            referencedRelation: "scaffold_inspections"
            referencedColumns: ["id", "company_id"]
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
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scaffold_defects_project_fk"
            columns: ["project_id", "company_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "scaffold_defects_responsible_person_fk"
            columns: ["responsible_person_id", "company_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "scaffold_defects_scaffold_fk"
            columns: ["scaffold_id", "company_id"]
            isOneToOne: false
            referencedRelation: "scaffolds"
            referencedColumns: ["id", "company_id"]
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
          company_id: string
          created_at: string
          id: string
          item_type: Database["public"]["Enums"]["scaffold_inspection_item_type"]
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
          company_id: string
          created_at?: string
          id?: string
          item_type: Database["public"]["Enums"]["scaffold_inspection_item_type"]
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
          company_id?: string
          created_at?: string
          id?: string
          item_type?: Database["public"]["Enums"]["scaffold_inspection_item_type"]
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
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
      scaffold_inspection_sequence_counters: {
        Row: {
          next_sequence: number
          scaffold_id: string
          updated_at: string
        }
        Insert: {
          next_sequence?: number
          scaffold_id: string
          updated_at?: string
        }
        Update: {
          next_sequence?: number
          scaffold_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scaffold_inspection_sequence_counters_scaffold_id_fkey"
            columns: ["scaffold_id"]
            isOneToOne: true
            referencedRelation: "scaffolds"
            referencedColumns: ["id"]
          },
        ]
      }
      scaffold_inspections: {
        Row: {
          company_id: string
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
          outcome:
            | Database["public"]["Enums"]["scaffold_inspection_outcome"]
            | null
          previous_inspection_id: string | null
          project_id: string
          restrictions_notes: string | null
          scaffold_id: string
          sequence_number: number
          status: Database["public"]["Enums"]["scaffold_inspection_status"]
          superseded_by_id: string | null
          updated_at: string
          updated_by: string | null
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          company_id: string
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
          outcome?:
            | Database["public"]["Enums"]["scaffold_inspection_outcome"]
            | null
          previous_inspection_id?: string | null
          project_id: string
          restrictions_notes?: string | null
          scaffold_id: string
          sequence_number?: number
          status?: Database["public"]["Enums"]["scaffold_inspection_status"]
          superseded_by_id?: string | null
          updated_at?: string
          updated_by?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          company_id?: string
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
          outcome?:
            | Database["public"]["Enums"]["scaffold_inspection_outcome"]
            | null
          previous_inspection_id?: string | null
          project_id?: string
          restrictions_notes?: string | null
          scaffold_id?: string
          sequence_number?: number
          status?: Database["public"]["Enums"]["scaffold_inspection_status"]
          superseded_by_id?: string | null
          updated_at?: string
          updated_by?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scaffold_inspections_corrects_fk"
            columns: ["corrects_inspection_id", "company_id"]
            isOneToOne: false
            referencedRelation: "scaffold_inspections"
            referencedColumns: ["id", "company_id"]
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
            columns: ["inspector_id", "company_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "scaffold_inspections_organization_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scaffold_inspections_previous_fk"
            columns: ["previous_inspection_id", "company_id"]
            isOneToOne: false
            referencedRelation: "scaffold_inspections"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "scaffold_inspections_project_fk"
            columns: ["project_id", "company_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "scaffold_inspections_scaffold_fk"
            columns: ["scaffold_id", "company_id"]
            isOneToOne: false
            referencedRelation: "scaffolds"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "scaffold_inspections_superseded_by_fk"
            columns: ["superseded_by_id", "company_id"]
            isOneToOne: false
            referencedRelation: "scaffold_inspections"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "scaffold_inspections_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scaffold_inspections_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      scaffold_number_counters: {
        Row: {
          next_number: number
          project_id: string
          updated_at: string
        }
        Insert: {
          next_number?: number
          project_id: string
          updated_at?: string
        }
        Update: {
          next_number?: number
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scaffold_number_counters_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      scaffold_team_members: {
        Row: {
          added_at: string
          added_by: string | null
          company_id: string
          employee_id: string
          id: string
          project_id: string
          removed_at: string | null
          removed_by: string | null
          scaffold_id: string
          team_position: number
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          company_id: string
          employee_id: string
          id?: string
          project_id: string
          removed_at?: string | null
          removed_by?: string | null
          scaffold_id: string
          team_position: number
        }
        Update: {
          added_at?: string
          added_by?: string | null
          company_id?: string
          employee_id?: string
          id?: string
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
            columns: ["employee_id", "company_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "scaffold_team_members_organization_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scaffold_team_members_project_fk"
            columns: ["project_id", "company_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "company_id"]
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
            columns: ["scaffold_id", "company_id"]
            isOneToOne: false
            referencedRelation: "scaffolds"
            referencedColumns: ["id", "company_id"]
          },
        ]
      }
      scaffolds: {
        Row: {
          company_id: string
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
          project_id: string
          responsible_foreman_id: string
          scaffold_number: number
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
          company_id: string
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
          project_id: string
          responsible_foreman_id: string
          scaffold_number?: number
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
          company_id?: string
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
          project_id?: string
          responsible_foreman_id?: string
          scaffold_number?: number
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
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scaffolds_project_fk"
            columns: ["project_id", "company_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "scaffolds_responsible_foreman_fk"
            columns: ["responsible_foreman_id", "company_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id", "company_id"]
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
      security_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          detail: string | null
          event_type: Database["public"]["Enums"]["security_event_type"]
          id: string
          ip_address: unknown
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          detail?: string | null
          event_type: Database["public"]["Enums"]["security_event_type"]
          id?: string
          ip_address?: unknown
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          detail?: string | null
          event_type?: Database["public"]["Enums"]["security_event_type"]
          id?: string
          ip_address?: unknown
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "security_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_events_user_id_fkey"
            columns: ["user_id"]
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
          company_id: string
          created_at: string
          employee_id: string
          end_at: string | null
          ended_at: string | null
          ended_by: string | null
          id: string
          notes: string | null
          project_id: string
          start_at: string
          team_id: string
        }
        Insert: {
          assigned_by?: string | null
          assignment_role?: Database["public"]["Enums"]["team_assignment_role"]
          company_id: string
          created_at?: string
          employee_id: string
          end_at?: string | null
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          notes?: string | null
          project_id: string
          start_at?: string
          team_id: string
        }
        Update: {
          assigned_by?: string | null
          assignment_role?: Database["public"]["Enums"]["team_assignment_role"]
          company_id?: string
          created_at?: string
          employee_id?: string
          end_at?: string | null
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          notes?: string | null
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
            columns: ["employee_id", "company_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id", "company_id"]
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
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_assignments_team_fk"
            columns: ["team_id", "project_id", "company_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id", "project_id", "company_id"]
          },
        ]
      }
      teams: {
        Row: {
          active_from: string | null
          active_until: string | null
          code: string | null
          color: Database["public"]["Enums"]["team_color"]
          company_id: string
          created_at: string
          created_by: string | null
          description: string | null
          display_order: number
          id: string
          name: string
          project_id: string
          shift: string | null
          status: Database["public"]["Enums"]["team_status"]
          updated_at: string
          updated_by: string | null
          work_area: string | null
        }
        Insert: {
          active_from?: string | null
          active_until?: string | null
          code?: string | null
          color?: Database["public"]["Enums"]["team_color"]
          company_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_order?: number
          id?: string
          name: string
          project_id: string
          shift?: string | null
          status?: Database["public"]["Enums"]["team_status"]
          updated_at?: string
          updated_by?: string | null
          work_area?: string | null
        }
        Update: {
          active_from?: string | null
          active_until?: string | null
          code?: string | null
          color?: Database["public"]["Enums"]["team_color"]
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_order?: number
          id?: string
          name?: string
          project_id?: string
          shift?: string | null
          status?: Database["public"]["Enums"]["team_status"]
          updated_at?: string
          updated_by?: string | null
          work_area?: string | null
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
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_project_fk"
            columns: ["project_id", "company_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "company_id"]
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
          company_id: string
          id: string
          new_original_filename: string
          new_storage_bucket: string
          new_storage_object_path: string
          previous_original_filename: string
          previous_storage_bucket: string
          previous_storage_object_path: string
          reason: string
          replaced_at: string
          replaced_by: string
          toolbox_meeting_id: string
        }
        Insert: {
          company_id: string
          id?: string
          new_original_filename: string
          new_storage_bucket: string
          new_storage_object_path: string
          previous_original_filename: string
          previous_storage_bucket: string
          previous_storage_object_path: string
          reason: string
          replaced_at?: string
          replaced_by: string
          toolbox_meeting_id: string
        }
        Update: {
          company_id?: string
          id?: string
          new_original_filename?: string
          new_storage_bucket?: string
          new_storage_object_path?: string
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
            columns: ["toolbox_meeting_id", "company_id"]
            isOneToOne: false
            referencedRelation: "toolbox_meetings"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "toolbox_meeting_file_replacements_organization_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
          company_id: string
          next_number: number
          project_id: string
          updated_at: string
        }
        Insert: {
          company_id: string
          next_number?: number
          project_id: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          next_number?: number
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "toolbox_meeting_number_counters_project_id_organization_id_fkey"
            columns: ["project_id", "company_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "company_id"]
          },
        ]
      }
      toolbox_meetings: {
        Row: {
          company_id: string
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
          company_id: string
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
          company_id?: string
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
            columns: ["held_by_employee_id", "company_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "toolbox_meetings_organization_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "toolbox_meetings_project_fk"
            columns: ["project_id", "company_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "company_id"]
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
          company_id: string
          id: string
          new_original_filename: string
          new_storage_bucket: string
          new_storage_object_path: string
          previous_original_filename: string
          previous_storage_bucket: string
          previous_storage_object_path: string
          reason: string
          replaced_at: string
          replaced_by: string
          toolbox_template_id: string
        }
        Insert: {
          company_id: string
          id?: string
          new_original_filename: string
          new_storage_bucket: string
          new_storage_object_path: string
          previous_original_filename: string
          previous_storage_bucket: string
          previous_storage_object_path: string
          reason: string
          replaced_at?: string
          replaced_by: string
          toolbox_template_id: string
        }
        Update: {
          company_id?: string
          id?: string
          new_original_filename?: string
          new_storage_bucket?: string
          new_storage_object_path?: string
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
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
            columns: ["toolbox_template_id", "company_id"]
            isOneToOne: false
            referencedRelation: "toolbox_templates"
            referencedColumns: ["id", "company_id"]
          },
        ]
      }
      toolbox_templates: {
        Row: {
          category: Database["public"]["Enums"]["hseq_document_category"]
          company_id: string
          created_at: string
          created_by: string | null
          description: string | null
          file_checksum_sha256: string | null
          file_size_bytes: number
          id: string
          language: string
          mime_type: string
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
          company_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          file_checksum_sha256?: string | null
          file_size_bytes: number
          id?: string
          language: string
          mime_type: string
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
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          file_checksum_sha256?: string | null
          file_size_bytes?: number
          id?: string
          language?: string
          mime_type?: string
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
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
      worked_hours: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          employee_id: string
          hours: number
          id: string
          note: string | null
          project_id: string
          status: Database["public"]["Enums"]["worked_hours_status"]
          submitted_at: string | null
          submitted_by: string | null
          updated_at: string
          updated_by: string | null
          work_date: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          employee_id: string
          hours: number
          id?: string
          note?: string | null
          project_id: string
          status?: Database["public"]["Enums"]["worked_hours_status"]
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string
          updated_by?: string | null
          work_date: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          employee_id?: string
          hours?: number
          id?: string
          note?: string | null
          project_id?: string
          status?: Database["public"]["Enums"]["worked_hours_status"]
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string
          updated_by?: string | null
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "worked_hours_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worked_hours_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worked_hours_employee_fk"
            columns: ["employee_id", "company_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "worked_hours_project_fk"
            columns: ["project_id", "company_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "worked_hours_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worked_hours_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      worked_hours_breakdown: {
        Row: {
          category: Database["public"]["Enums"]["worked_hours_category"]
          company_id: string
          created_at: string
          created_by: string | null
          hours: number
          id: string
          project_id: string
          updated_at: string
          updated_by: string | null
          worked_hours_id: string
        }
        Insert: {
          category: Database["public"]["Enums"]["worked_hours_category"]
          company_id: string
          created_at?: string
          created_by?: string | null
          hours: number
          id?: string
          project_id: string
          updated_at?: string
          updated_by?: string | null
          worked_hours_id: string
        }
        Update: {
          category?: Database["public"]["Enums"]["worked_hours_category"]
          company_id?: string
          created_at?: string
          created_by?: string | null
          hours?: number
          id?: string
          project_id?: string
          updated_at?: string
          updated_by?: string | null
          worked_hours_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worked_hours_breakdown_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worked_hours_breakdown_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worked_hours_breakdown_project_fk"
            columns: ["project_id", "company_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "company_id"]
          },
          {
            foreignKeyName: "worked_hours_breakdown_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worked_hours_breakdown_worked_hours_fk"
            columns: ["worked_hours_id", "company_id"]
            isOneToOne: false
            referencedRelation: "worked_hours"
            referencedColumns: ["id", "company_id"]
          },
        ]
      }
      worked_hours_corrections: {
        Row: {
          category: Database["public"]["Enums"]["worked_hours_category"] | null
          changed_at: string
          changed_by: string
          company_id: string
          employee_id: string
          id: string
          new_hours: number
          previous_hours: number
          project_id: string
          reason: string
          worked_hours_id: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["worked_hours_category"] | null
          changed_at?: string
          changed_by: string
          company_id: string
          employee_id: string
          id?: string
          new_hours: number
          previous_hours: number
          project_id: string
          reason: string
          worked_hours_id: string
        }
        Update: {
          category?: Database["public"]["Enums"]["worked_hours_category"] | null
          changed_at?: string
          changed_by?: string
          company_id?: string
          employee_id?: string
          id?: string
          new_hours?: number
          previous_hours?: number
          project_id?: string
          reason?: string
          worked_hours_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worked_hours_corrections_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worked_hours_corrections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worked_hours_corrections_worked_hours_fk"
            columns: ["worked_hours_id", "company_id"]
            isOneToOne: false
            referencedRelation: "worked_hours"
            referencedColumns: ["id", "company_id"]
          },
        ]
      }
      worked_hours_discrepancies: {
        Row: {
          comment: string
          company_id: string
          created_at: string
          employee_id: string
          id: string
          project_id: string
          reported_by: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          resulting_hours: number | null
          status: Database["public"]["Enums"]["worked_hours_discrepancy_status"]
          worked_hours_id: string
        }
        Insert: {
          comment: string
          company_id: string
          created_at?: string
          employee_id: string
          id?: string
          project_id: string
          reported_by: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          resulting_hours?: number | null
          status?: Database["public"]["Enums"]["worked_hours_discrepancy_status"]
          worked_hours_id: string
        }
        Update: {
          comment?: string
          company_id?: string
          created_at?: string
          employee_id?: string
          id?: string
          project_id?: string
          reported_by?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          resulting_hours?: number | null
          status?: Database["public"]["Enums"]["worked_hours_discrepancy_status"]
          worked_hours_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worked_hours_discrepancies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worked_hours_discrepancies_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worked_hours_discrepancies_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worked_hours_discrepancies_worked_hours_fk"
            columns: ["worked_hours_id", "company_id"]
            isOneToOne: false
            referencedRelation: "worked_hours"
            referencedColumns: ["id", "company_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      acknowledge_platform_warning: {
        Args: { target_warning_id: string }
        Returns: {
          acknowledged_at: string | null
          id: string
          issued_at: string
          issued_by: string
          reason: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "platform_warnings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      add_daily_team_foreman: {
        Args: {
          target_foreman_employee_id: string
          target_project_id: string
          target_work_date: string
        }
        Returns: {
          company_id: string
          created_at: string
          created_by: string | null
          foreman_employee_id: string
          id: string
          project_id: string
          work_date: string
        }
        SetofOptions: {
          from: "*"
          to: "daily_team_foreman_roster"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_update_profile_name: {
        Args: { target_full_name: string; target_user_id: string }
        Returns: {
          accent_theme: Database["public"]["Enums"]["accent_theme"]
          account_status: Database["public"]["Enums"]["account_status"]
          account_status_changed_at: string | null
          account_status_changed_by: string | null
          account_status_reason: string | null
          active_company_id: string | null
          active_project_id: string | null
          created_at: string
          full_name: string
          id: string
          phone: string | null
          theme_mode: Database["public"]["Enums"]["theme_mode"]
          updated_at: string
          user_number: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      allocate_employee_number: {
        Args: { target_org_id: string }
        Returns: string
      }
      allocate_scaffold_inspection_sequence: {
        Args: { target_scaffold_id: string }
        Returns: number
      }
      allocate_scaffold_number: {
        Args: { target_project_id: string }
        Returns: number
      }
      apply_leave_to_attendance: {
        Args: {
          target_request: Database["public"]["Tables"]["leave_requests"]["Row"]
          target_status: Database["public"]["Enums"]["daily_attendance_status"]
        }
        Returns: undefined
      }
      approve_leave_request: {
        Args: { target_comment?: string; target_request_id: string }
        Returns: {
          cancelled_at: string | null
          cancelled_by: string | null
          company_id: string
          decided_at: string | null
          decided_by: string | null
          employee_comment: string | null
          employee_id: string
          end_date: string
          id: string
          leave_type: Database["public"]["Enums"]["leave_type"]
          management_comment: string | null
          project_id: string
          requested_at: string
          requested_by: string
          start_date: string
          status: Database["public"]["Enums"]["leave_request_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "leave_requests"
          isOneToOne: true
          isSetofReturn: false
        }
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
      ban_account: {
        Args: { target_reason: string; target_user_id: string }
        Returns: {
          accent_theme: Database["public"]["Enums"]["accent_theme"]
          account_status: Database["public"]["Enums"]["account_status"]
          account_status_changed_at: string | null
          account_status_changed_by: string | null
          account_status_reason: string | null
          active_company_id: string | null
          active_project_id: string | null
          created_at: string
          full_name: string
          id: string
          phone: string | null
          theme_mode: Database["public"]["Enums"]["theme_mode"]
          updated_at: string
          user_number: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      bootstrap_first_owner: {
        Args: {
          notes?: string
          target_organization_id: string
          target_user_id: string
        }
        Returns: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          invited_at: string | null
          joined_at: string | null
          status: Database["public"]["Enums"]["membership_status"]
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "company_memberships"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      bootstrap_first_platform_super_admin: {
        Args: { notes?: string; target_user_id: string }
        Returns: {
          granted_at: string
          granted_by: string | null
          notes: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "platform_super_admins"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      bulk_apply_worked_hours: {
        Args: {
          target_category: Database["public"]["Enums"]["worked_hours_category"]
          target_employee_ids: string[]
          target_hours: number
          target_project_id: string
          target_work_date: string
        }
        Returns: {
          company_id: string
          created_at: string
          created_by: string | null
          employee_id: string
          hours: number
          id: string
          note: string | null
          project_id: string
          status: Database["public"]["Enums"]["worked_hours_status"]
          submitted_at: string | null
          submitted_by: string | null
          updated_at: string
          updated_by: string | null
          work_date: string
        }[]
        SetofOptions: {
          from: "*"
          to: "worked_hours"
          isOneToOne: false
          isSetofReturn: true
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
      can_manage_report_share_target: {
        Args: {
          target_corrective_action_id: string
          target_lmra_assessment_id: string
          target_record_type: Database["public"]["Enums"]["report_record_type"]
          target_safety_flash_id: string
          target_safety_observation_id: string
          target_scaffold_inspection_id: string
          target_toolbox_meeting_id: string
        }
        Returns: boolean
      }
      cancel_leave_request: {
        Args: { target_request_id: string }
        Returns: {
          cancelled_at: string | null
          cancelled_by: string | null
          company_id: string
          decided_at: string | null
          decided_by: string | null
          employee_comment: string | null
          employee_id: string
          end_date: string
          id: string
          leave_type: Database["public"]["Enums"]["leave_type"]
          management_comment: string | null
          project_id: string
          requested_at: string
          requested_by: string
          start_date: string
          status: Database["public"]["Enums"]["leave_request_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "leave_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      close_absence_day: {
        Args: { target_project_id: string; target_work_date: string }
        Returns: {
          company_id: string
          id: string
          locked_at: string
          locked_by: string | null
          project_id: string
          unlock_reason: string | null
          unlocked_at: string | null
          unlocked_by: string | null
          work_date: string
        }
        SetofOptions: {
          from: "*"
          to: "daily_attendance_day_locks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      confirm_absence_report: {
        Args: { target_report_id: string }
        Returns: {
          comment: string | null
          company_id: string
          employee_id: string
          id: string
          project_id: string
          reason: Database["public"]["Enums"]["absence_report_reason"]
          reported_at: string
          reported_by: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["absence_report_status"]
          work_date: string
        }
        SetofOptions: {
          from: "*"
          to: "absence_reports"
          isOneToOne: true
          isSetofReturn: false
        }
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
      create_daily_team_for_foreman: {
        Args: {
          target_activity?: string
          target_foreman_employee_id: string
          target_name: string
          target_project_id: string
          target_shift: Database["public"]["Enums"]["lmra_shift"]
          target_work_area?: string
          target_work_date: string
        }
        Returns: {
          activity: string | null
          company_id: string
          created_at: string
          created_by: string | null
          display_order: number
          foreman_employee_id: string | null
          id: string
          locked_at: string | null
          locked_by: string | null
          name: string
          project_id: string
          shift: Database["public"]["Enums"]["lmra_shift"] | null
          status: Database["public"]["Enums"]["daily_team_status"]
          unlock_reason: string | null
          unlocked_at: string | null
          unlocked_by: string | null
          updated_at: string
          updated_by: string | null
          work_area: string | null
          work_date: string
        }
        SetofOptions: {
          from: "*"
          to: "daily_teams"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_lmra_assessment: {
        Args: {
          target_company_id: string
          target_completed_by_employee_id: string
          target_daily_team_id?: string
          target_hazards: Json
          target_notes: string
          target_participant_employee_ids: string[]
          target_project_id: string
          target_responsible_person_id: string
          target_result?: Database["public"]["Enums"]["lmra_result"]
          target_shift: Database["public"]["Enums"]["lmra_shift"]
          target_stop_work_reason?: string
          target_submit: boolean
          target_work_activity: string
          target_work_area: string
          target_work_date: string
        }
        Returns: {
          approved_at: string | null
          archived_at: string | null
          archived_by: string | null
          company_id: string
          completed_by_employee_id: string
          created_at: string
          created_by: string | null
          daily_team_id: string | null
          id: string
          notes: string | null
          project_id: string
          responsible_person_id: string | null
          result: Database["public"]["Enums"]["lmra_result"]
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          shift: Database["public"]["Enums"]["lmra_shift"]
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
        SetofOptions: {
          from: "*"
          to: "lmra_assessments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_report_share: {
        Args: {
          target_company_id: string
          target_expires_at?: string
          target_project_id: string
          target_record_id: string
          target_record_type: Database["public"]["Enums"]["report_record_type"]
        }
        Returns: {
          created_at: string
          expires_at: string
          id: string
          token: string
        }[]
      }
      daily_attendance_permits_work: {
        Args: {
          target_status: Database["public"]["Enums"]["daily_attendance_status"]
        }
        Returns: boolean
      }
      deny_leave_request: {
        Args: { target_comment: string; target_request_id: string }
        Returns: {
          cancelled_at: string | null
          cancelled_by: string | null
          company_id: string
          decided_at: string | null
          decided_by: string | null
          employee_comment: string | null
          employee_id: string
          end_date: string
          id: string
          leave_type: Database["public"]["Enums"]["leave_type"]
          management_comment: string | null
          project_id: string
          requested_at: string
          requested_by: string
          start_date: string
          status: Database["public"]["Enums"]["leave_request_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "leave_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      employee_has_any_company_role: {
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
          company_id: string
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
          outcome:
            | Database["public"]["Enums"]["scaffold_inspection_outcome"]
            | null
          previous_inspection_id: string | null
          project_id: string
          restrictions_notes: string | null
          scaffold_id: string
          sequence_number: number
          status: Database["public"]["Enums"]["scaffold_inspection_status"]
          superseded_by_id: string | null
          updated_at: string
          updated_by: string | null
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
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
      get_basic_profile_info: {
        Args: { target_company_id: string; target_user_ids: string[] }
        Returns: {
          full_name: string
          id: string
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
      grant_platform_super_admin: {
        Args: { notes?: string; target_user_id: string }
        Returns: {
          granted_at: string
          granted_by: string | null
          notes: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "platform_super_admins"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      has_any_company_role: {
        Args: { role_names: string[]; target_org_id: string }
        Returns: boolean
      }
      has_company_role: {
        Args: { role_name: string; target_org_id: string }
        Returns: boolean
      }
      has_project_access: {
        Args: { target_project_id: string }
        Returns: boolean
      }
      is_company_member: { Args: { target_org_id: string }; Returns: boolean }
      is_daily_team_foreman: {
        Args: { target_daily_team_id: string }
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
      is_own_employee: {
        Args: { target_employee_id: string }
        Returns: boolean
      }
      is_own_lmra_assessment: {
        Args: { target_lmra_id: string }
        Returns: boolean
      }
      is_platform_super_admin: { Args: never; Returns: boolean }
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
      issue_platform_warning: {
        Args: { target_reason: string; target_user_id: string }
        Returns: {
          acknowledged_at: string | null
          id: string
          issued_at: string
          issued_by: string
          reason: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "platform_warnings"
          isOneToOne: true
          isSetofReturn: false
        }
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
      lmra_shift_sort_key: {
        Args: { target_shift: Database["public"]["Enums"]["lmra_shift"] }
        Returns: string
      }
      lock_daily_teams: {
        Args: { target_project_id: string; target_work_date: string }
        Returns: {
          activity: string | null
          company_id: string
          created_at: string
          created_by: string | null
          display_order: number
          foreman_employee_id: string | null
          id: string
          locked_at: string | null
          locked_by: string | null
          name: string
          project_id: string
          shift: Database["public"]["Enums"]["lmra_shift"] | null
          status: Database["public"]["Enums"]["daily_team_status"]
          unlock_reason: string | null
          unlocked_at: string | null
          unlocked_by: string | null
          updated_at: string
          updated_by: string | null
          work_area: string | null
          work_date: string
        }[]
        SetofOptions: {
          from: "*"
          to: "daily_teams"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      log_login_failed: {
        Args: {
          attempted_email?: string
          target_ip?: unknown
          target_user_agent?: string
        }
        Returns: undefined
      }
      log_login_success: {
        Args: { target_ip?: unknown; target_user_agent?: string }
        Returns: undefined
      }
      log_logout: {
        Args: { target_ip?: unknown; target_user_agent?: string }
        Returns: undefined
      }
      log_sessions_revoked: {
        Args: { target_user_id: string }
        Returns: undefined
      }
      move_daily_team_member: {
        Args: {
          target_daily_team_id: string
          target_employee_id: string
          target_project_id: string
          target_role?: Database["public"]["Enums"]["team_assignment_role"]
          target_work_date: string
        }
        Returns: {
          company_id: string
          created_at: string
          created_by: string | null
          daily_team_id: string
          employee_id: string
          id: string
          project_id: string
          removed_at: string | null
          removed_by: string | null
          role: Database["public"]["Enums"]["team_assignment_role"]
          shift: Database["public"]["Enums"]["lmra_shift"] | null
          work_date: string
        }
        SetofOptions: {
          from: "*"
          to: "daily_team_members"
          isOneToOne: true
          isSetofReturn: false
        }
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
          company_id: string
          created_at: string
          employee_id: string
          end_at: string | null
          ended_at: string | null
          ended_by: string | null
          id: string
          notes: string | null
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
      notify_project_managers: {
        Args: {
          notif_body: string
          notif_link_path: string
          notif_title: string
          notif_type: string
          target_company_id: string
          target_project_id: string
        }
        Returns: undefined
      }
      platform_admin_get_memberships: {
        Args: { target_user_id: string }
        Returns: {
          company_id: string
          company_name: string
          membership_status: Database["public"]["Enums"]["membership_status"]
          role_names: string[]
        }[]
      }
      platform_admin_search_accounts: {
        Args: { limit_count?: number; search_query?: string }
        Returns: {
          account_status: Database["public"]["Enums"]["account_status"]
          account_status_reason: string
          created_at: string
          email: string
          full_name: string
          id: string
        }[]
      }
      reject_absence_report: {
        Args: { target_report_id: string; target_review_note: string }
        Returns: {
          comment: string | null
          company_id: string
          employee_id: string
          id: string
          project_id: string
          reason: Database["public"]["Enums"]["absence_report_reason"]
          reported_at: string
          reported_by: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["absence_report_status"]
          work_date: string
        }
        SetofOptions: {
          from: "*"
          to: "absence_reports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      remove_daily_team_foreman: {
        Args: {
          target_foreman_employee_id: string
          target_project_id: string
          target_work_date: string
        }
        Returns: undefined
      }
      reopen_absence_day: {
        Args: {
          target_project_id: string
          target_reason: string
          target_work_date: string
        }
        Returns: {
          company_id: string
          id: string
          locked_at: string
          locked_by: string | null
          project_id: string
          unlock_reason: string | null
          unlocked_at: string | null
          unlocked_by: string | null
          work_date: string
        }
        SetofOptions: {
          from: "*"
          to: "daily_attendance_day_locks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reorder_daily_teams: {
        Args: {
          target_ordered_team_ids: string[]
          target_project_id: string
          target_work_date: string
        }
        Returns: {
          activity: string | null
          company_id: string
          created_at: string
          created_by: string | null
          display_order: number
          foreman_employee_id: string | null
          id: string
          locked_at: string | null
          locked_by: string | null
          name: string
          project_id: string
          shift: Database["public"]["Enums"]["lmra_shift"] | null
          status: Database["public"]["Enums"]["daily_team_status"]
          unlock_reason: string | null
          unlocked_at: string | null
          unlocked_by: string | null
          updated_at: string
          updated_by: string | null
          work_area: string | null
          work_date: string
        }[]
        SetofOptions: {
          from: "*"
          to: "daily_teams"
          isOneToOne: false
          isSetofReturn: true
        }
      }
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
          company_id: string
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
          company_id: string
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
          company_id: string
          created_at: string
          created_by: string | null
          description: string | null
          file_checksum_sha256: string | null
          file_size_bytes: number
          id: string
          language: string
          mime_type: string
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
      report_absence: {
        Args: {
          target_comment?: string
          target_employee_id: string
          target_project_id: string
          target_reason: Database["public"]["Enums"]["absence_report_reason"]
          target_work_date: string
        }
        Returns: {
          comment: string | null
          company_id: string
          employee_id: string
          id: string
          project_id: string
          reason: Database["public"]["Enums"]["absence_report_reason"]
          reported_at: string
          reported_by: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["absence_report_status"]
          work_date: string
        }
        SetofOptions: {
          from: "*"
          to: "absence_reports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      report_worked_hours_discrepancy: {
        Args: { target_comment: string; target_worked_hours_id: string }
        Returns: {
          comment: string
          company_id: string
          created_at: string
          employee_id: string
          id: string
          project_id: string
          reported_by: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          resulting_hours: number | null
          status: Database["public"]["Enums"]["worked_hours_discrepancy_status"]
          worked_hours_id: string
        }
        SetofOptions: {
          from: "*"
          to: "worked_hours_discrepancies"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_public_report: { Args: { target_token: string }; Returns: Json }
      resolve_scaffold_inspection_validity_days: {
        Args: { target_project_id: string }
        Returns: number
      }
      resolve_worked_hours_discrepancy: {
        Args: {
          target_discrepancy_id: string
          target_resolution_note: string
          target_resulting_hours?: number
          target_status: Database["public"]["Enums"]["worked_hours_discrepancy_status"]
        }
        Returns: {
          comment: string
          company_id: string
          created_at: string
          employee_id: string
          id: string
          project_id: string
          reported_by: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          resulting_hours: number | null
          status: Database["public"]["Enums"]["worked_hours_discrepancy_status"]
          worked_hours_id: string
        }
        SetofOptions: {
          from: "*"
          to: "worked_hours_discrepancies"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      restore_account: {
        Args: { target_reason?: string; target_user_id: string }
        Returns: {
          accent_theme: Database["public"]["Enums"]["accent_theme"]
          account_status: Database["public"]["Enums"]["account_status"]
          account_status_changed_at: string | null
          account_status_changed_by: string | null
          account_status_reason: string | null
          active_company_id: string | null
          active_project_id: string | null
          created_at: string
          full_name: string
          id: string
          phone: string | null
          theme_mode: Database["public"]["Enums"]["theme_mode"]
          updated_at: string
          user_number: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resubmit_leave_request: {
        Args: {
          target_comment?: string
          target_end_date: string
          target_leave_type: Database["public"]["Enums"]["leave_type"]
          target_request_id: string
          target_start_date: string
        }
        Returns: {
          cancelled_at: string | null
          cancelled_by: string | null
          company_id: string
          decided_at: string | null
          decided_by: string | null
          employee_comment: string | null
          employee_id: string
          end_date: string
          id: string
          leave_type: Database["public"]["Enums"]["leave_type"]
          management_comment: string | null
          project_id: string
          requested_at: string
          requested_by: string
          start_date: string
          status: Database["public"]["Enums"]["leave_request_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "leave_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      return_leave_request: {
        Args: { target_comment: string; target_request_id: string }
        Returns: {
          cancelled_at: string | null
          cancelled_by: string | null
          company_id: string
          decided_at: string | null
          decided_by: string | null
          employee_comment: string | null
          employee_id: string
          end_date: string
          id: string
          leave_type: Database["public"]["Enums"]["leave_type"]
          management_comment: string | null
          project_id: string
          requested_at: string
          requested_by: string
          start_date: string
          status: Database["public"]["Enums"]["leave_request_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "leave_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      revoke_platform_super_admin: {
        Args: { target_user_id: string }
        Returns: undefined
      }
      revoke_report_share: {
        Args: { target_share_id: string }
        Returns: {
          company_id: string
          corrective_action_id: string | null
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          last_viewed_at: string | null
          lmra_assessment_id: string | null
          project_id: string | null
          record_type: Database["public"]["Enums"]["report_record_type"]
          revoked_at: string | null
          revoked_by: string | null
          safety_flash_id: string | null
          safety_observation_id: string | null
          scaffold_inspection_id: string | null
          token_hash: string
          toolbox_meeting_id: string | null
          view_count: number
        }
        SetofOptions: {
          from: "*"
          to: "report_shares"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_daily_team: {
        Args: {
          target_activity?: string
          target_daily_team_id: string
          target_name: string
          target_project_id: string
          target_shift?: Database["public"]["Enums"]["lmra_shift"]
          target_work_area?: string
          target_work_date: string
        }
        Returns: {
          activity: string | null
          company_id: string
          created_at: string
          created_by: string | null
          display_order: number
          foreman_employee_id: string | null
          id: string
          locked_at: string | null
          locked_by: string | null
          name: string
          project_id: string
          shift: Database["public"]["Enums"]["lmra_shift"] | null
          status: Database["public"]["Enums"]["daily_team_status"]
          unlock_reason: string | null
          unlocked_at: string | null
          unlocked_by: string | null
          updated_at: string
          updated_by: string | null
          work_area: string | null
          work_date: string
        }
        SetofOptions: {
          from: "*"
          to: "daily_teams"
          isOneToOne: true
          isSetofReturn: false
        }
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
          target_active_from?: string
          target_active_until?: string
          target_assignments?: Json
          target_code: string
          target_color: Database["public"]["Enums"]["team_color"]
          target_description: string
          target_name: string
          target_project_id: string
          target_shift?: string
          target_status: Database["public"]["Enums"]["team_status"]
          target_team_id: string
          target_work_area?: string
        }
        Returns: {
          active_from: string | null
          active_until: string | null
          code: string | null
          color: Database["public"]["Enums"]["team_color"]
          company_id: string
          created_at: string
          created_by: string | null
          description: string | null
          display_order: number
          id: string
          name: string
          project_id: string
          shift: string | null
          status: Database["public"]["Enums"]["team_status"]
          updated_at: string
          updated_by: string | null
          work_area: string | null
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
      set_daily_attendance_status: {
        Args: {
          target_employee_id: string
          target_note?: string
          target_project_id: string
          target_reason?: string
          target_status: Database["public"]["Enums"]["daily_attendance_status"]
          target_work_date: string
        }
        Returns: {
          attendance: Database["public"]["Tables"]["daily_attendance"]["Row"]
          removed_from_team_id: string
        }[]
      }
      submit_worked_hours: {
        Args: { target_project_id: string; target_work_date: string }
        Returns: {
          company_id: string
          created_at: string
          created_by: string | null
          employee_id: string
          hours: number
          id: string
          note: string | null
          project_id: string
          status: Database["public"]["Enums"]["worked_hours_status"]
          submitted_at: string | null
          submitted_by: string | null
          updated_at: string
          updated_by: string | null
          work_date: string
        }[]
        SetofOptions: {
          from: "*"
          to: "worked_hours"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      suspend_account: {
        Args: { target_reason: string; target_user_id: string }
        Returns: {
          accent_theme: Database["public"]["Enums"]["accent_theme"]
          account_status: Database["public"]["Enums"]["account_status"]
          account_status_changed_at: string | null
          account_status_changed_by: string | null
          account_status_reason: string | null
          active_company_id: string | null
          active_project_id: string | null
          created_at: string
          full_name: string
          id: string
          phone: string | null
          theme_mode: Database["public"]["Enums"]["theme_mode"]
          updated_at: string
          user_number: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      unlock_daily_teams: {
        Args: {
          target_project_id: string
          target_reason: string
          target_work_date: string
        }
        Returns: {
          activity: string | null
          company_id: string
          created_at: string
          created_by: string | null
          display_order: number
          foreman_employee_id: string | null
          id: string
          locked_at: string | null
          locked_by: string | null
          name: string
          project_id: string
          shift: Database["public"]["Enums"]["lmra_shift"] | null
          status: Database["public"]["Enums"]["daily_team_status"]
          unlock_reason: string | null
          unlocked_at: string | null
          unlocked_by: string | null
          updated_at: string
          updated_by: string | null
          work_area: string | null
          work_date: string
        }[]
        SetofOptions: {
          from: "*"
          to: "daily_teams"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      update_daily_team_with_foreman: {
        Args: {
          target_activity?: string
          target_daily_team_id: string
          target_foreman_employee_id?: string
          target_name: string
          target_project_id: string
          target_shift: Database["public"]["Enums"]["lmra_shift"]
          target_work_area?: string
          target_work_date: string
        }
        Returns: {
          activity: string | null
          company_id: string
          created_at: string
          created_by: string | null
          display_order: number
          foreman_employee_id: string | null
          id: string
          locked_at: string | null
          locked_by: string | null
          name: string
          project_id: string
          shift: Database["public"]["Enums"]["lmra_shift"] | null
          status: Database["public"]["Enums"]["daily_team_status"]
          unlock_reason: string | null
          unlocked_at: string | null
          unlocked_by: string | null
          updated_at: string
          updated_by: string | null
          work_area: string | null
          work_date: string
        }
        SetofOptions: {
          from: "*"
          to: "daily_teams"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_lmra_assessment: {
        Args: {
          target_hazards: Json
          target_lmra_id: string
          target_notes: string
          target_participant_employee_ids: string[]
          target_responsible_person_id: string
          target_shift: Database["public"]["Enums"]["lmra_shift"]
          target_work_activity: string
          target_work_area: string
          target_work_date: string
        }
        Returns: {
          approved_at: string | null
          archived_at: string | null
          archived_by: string | null
          company_id: string
          completed_by_employee_id: string
          created_at: string
          created_by: string | null
          daily_team_id: string | null
          id: string
          notes: string | null
          project_id: string
          responsible_person_id: string | null
          result: Database["public"]["Enums"]["lmra_result"]
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          shift: Database["public"]["Enums"]["lmra_shift"]
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
        SetofOptions: {
          from: "*"
          to: "lmra_assessments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      upsert_worked_hours: {
        Args: {
          target_employee_id: string
          target_hours: number
          target_note?: string
          target_project_id: string
          target_reason?: string
          target_work_date: string
        }
        Returns: {
          company_id: string
          created_at: string
          created_by: string | null
          employee_id: string
          hours: number
          id: string
          note: string | null
          project_id: string
          status: Database["public"]["Enums"]["worked_hours_status"]
          submitted_at: string | null
          submitted_by: string | null
          updated_at: string
          updated_by: string | null
          work_date: string
        }
        SetofOptions: {
          from: "*"
          to: "worked_hours"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      upsert_worked_hours_categories: {
        Args: {
          target_categories: Json
          target_employee_id: string
          target_note?: string
          target_project_id: string
          target_reason?: string
          target_work_date: string
        }
        Returns: {
          company_id: string
          created_at: string
          created_by: string | null
          employee_id: string
          hours: number
          id: string
          note: string | null
          project_id: string
          status: Database["public"]["Enums"]["worked_hours_status"]
          submitted_at: string | null
          submitted_by: string | null
          updated_at: string
          updated_by: string | null
          work_date: string
        }
        SetofOptions: {
          from: "*"
          to: "worked_hours"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      void_scaffold_inspection: {
        Args: { target_inspection_id: string; target_void_reason: string }
        Returns: {
          company_id: string
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
          outcome:
            | Database["public"]["Enums"]["scaffold_inspection_outcome"]
            | null
          previous_inspection_id: string | null
          project_id: string
          restrictions_notes: string | null
          scaffold_id: string
          sequence_number: number
          status: Database["public"]["Enums"]["scaffold_inspection_status"]
          superseded_by_id: string | null
          updated_at: string
          updated_by: string | null
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "scaffold_inspections"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      absence_report_reason:
        | "sick"
        | "personal"
        | "family_emergency"
        | "transport_issue"
        | "other"
      absence_report_status: "pending" | "confirmed" | "rejected"
      accent_theme:
        | "default_blue"
        | "safety_green"
        | "steel_slate"
        | "orange"
        | "indigo_purple"
      account_status: "active" | "suspended" | "banned"
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
      company_status: "trial" | "active" | "suspended"
      corrective_action_priority: "low" | "medium" | "high" | "critical"
      corrective_action_status:
        | "open"
        | "in_progress"
        | "awaiting_verification"
        | "closed"
        | "rejected"
      daily_attendance_status:
        | "not_set"
        | "present"
        | "absent"
        | "sick"
        | "leave"
        | "training"
        | "off_site"
      daily_team_status: "open" | "locked"
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
      leave_request_status:
        | "pending"
        | "approved"
        | "denied"
        | "returned"
        | "cancelled"
      leave_type: "annual" | "sick" | "unpaid" | "compassionate" | "other"
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
      lmra_shift: "day" | "night" | "late"
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
      observation_negative_disposition:
        | "no_action"
        | "coaching"
        | "corrective_action"
        | "formal_warning"
      observation_risk_level: "low" | "medium" | "high" | "critical"
      observation_status: "open" | "closed"
      observation_target_type: "employee" | "daily_team" | "general"
      observation_type: "positive" | "negative" | "general"
      project_assignment_role:
        | "project_manager"
        | "hseq_manager"
        | "hse_officer"
        | "inspector"
        | "member"
      project_status: "planning" | "active" | "completed" | "archived"
      report_record_type:
        | "lmra"
        | "scaffold_inspection"
        | "safety_observation"
        | "corrective_action"
        | "toolbox_meeting"
        | "safety_flash"
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
      security_event_type:
        | "login_success"
        | "login_failed"
        | "logout"
        | "account_suspended"
        | "account_banned"
        | "account_restored"
        | "platform_warning_issued"
        | "sessions_revoked"
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
      theme_mode: "light" | "dark" | "system"
      toolbox_document_status: "active" | "archived"
      worked_hours_category:
        | "regular"
        | "overtime"
        | "night"
        | "travel"
        | "other"
      worked_hours_discrepancy_status: "open" | "accepted" | "rejected"
      worked_hours_status: "draft" | "submitted"
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
      absence_report_reason: [
        "sick",
        "personal",
        "family_emergency",
        "transport_issue",
        "other",
      ],
      absence_report_status: ["pending", "confirmed", "rejected"],
      accent_theme: [
        "default_blue",
        "safety_green",
        "steel_slate",
        "orange",
        "indigo_purple",
      ],
      account_status: ["active", "suspended", "banned"],
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
      company_status: ["trial", "active", "suspended"],
      corrective_action_priority: ["low", "medium", "high", "critical"],
      corrective_action_status: [
        "open",
        "in_progress",
        "awaiting_verification",
        "closed",
        "rejected",
      ],
      daily_attendance_status: [
        "not_set",
        "present",
        "absent",
        "sick",
        "leave",
        "training",
        "off_site",
      ],
      daily_team_status: ["open", "locked"],
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
      leave_request_status: [
        "pending",
        "approved",
        "denied",
        "returned",
        "cancelled",
      ],
      leave_type: ["annual", "sick", "unpaid", "compassionate", "other"],
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
      lmra_shift: ["day", "night", "late"],
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
      observation_negative_disposition: [
        "no_action",
        "coaching",
        "corrective_action",
        "formal_warning",
      ],
      observation_risk_level: ["low", "medium", "high", "critical"],
      observation_status: ["open", "closed"],
      observation_target_type: ["employee", "daily_team", "general"],
      observation_type: ["positive", "negative", "general"],
      project_assignment_role: [
        "project_manager",
        "hseq_manager",
        "hse_officer",
        "inspector",
        "member",
      ],
      project_status: ["planning", "active", "completed", "archived"],
      report_record_type: [
        "lmra",
        "scaffold_inspection",
        "safety_observation",
        "corrective_action",
        "toolbox_meeting",
        "safety_flash",
      ],
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
      security_event_type: [
        "login_success",
        "login_failed",
        "logout",
        "account_suspended",
        "account_banned",
        "account_restored",
        "platform_warning_issued",
        "sessions_revoked",
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
      theme_mode: ["light", "dark", "system"],
      toolbox_document_status: ["active", "archived"],
      worked_hours_category: [
        "regular",
        "overtime",
        "night",
        "travel",
        "other",
      ],
      worked_hours_discrepancy_status: ["open", "accepted", "rejected"],
      worked_hours_status: ["draft", "submitted"],
    },
  },
} as const
