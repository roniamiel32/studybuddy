/**
 * File:        src/types/database.types.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: PostgreSQL schema types, GENERATED from the live local
 *              database. Do not edit by hand — run `npm run gen:types`
 *              after every migration instead.
 * Version:     generated
 *
 * Modifications:
 *     Regenerated automatically; see supabase/migrations for schema history.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      ai_generation_log: {
        Row: {
          completion_tokens: number | null
          created_at: string
          error_message: string | null
          id: string
          latency_ms: number | null
          model: string
          profile_id: string | null
          prompt_tokens: number | null
          status: Database["public"]["Enums"]["ai_status"]
          task: Database["public"]["Enums"]["ai_task"]
        }
        Insert: {
          completion_tokens?: number | null
          created_at?: string
          error_message?: string | null
          id?: string
          latency_ms?: number | null
          model: string
          profile_id?: string | null
          prompt_tokens?: number | null
          status: Database["public"]["Enums"]["ai_status"]
          task: Database["public"]["Enums"]["ai_task"]
        }
        Update: {
          completion_tokens?: number | null
          created_at?: string
          error_message?: string | null
          id?: string
          latency_ms?: number | null
          model?: string
          profile_id?: string | null
          prompt_tokens?: number | null
          status?: Database["public"]["Enums"]["ai_status"]
          task?: Database["public"]["Enums"]["ai_task"]
        }
        Relationships: [
          {
            foreignKeyName: "ai_generation_log_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_slots: {
        Row: {
          created_at: string
          day_of_week: number
          ends_at: string
          id: string
          profile_id: string
          source: Database["public"]["Enums"]["availability_source"]
          starts_at: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          ends_at: string
          id?: string
          profile_id: string
          source?: Database["public"]["Enums"]["availability_source"]
          starts_at: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          ends_at?: string
          id?: string
          profile_id?: string
          source?: Database["public"]["Enums"]["availability_source"]
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_slots_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      blocked_users: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocked_users_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocked_users_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_likes: {
        Row: {
          comment_id: string
          created_at: string
          profile_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          profile_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_likes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "post_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_likes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      connection_requests: {
        Row: {
          addressee_id: string
          course_offering_id: string
          created_at: string
          icebreaker_model: string | null
          icebreaker_text: string | null
          id: string
          requester_id: string
          responded_at: string | null
          status: Database["public"]["Enums"]["connection_status"]
          student_note: string | null
          university_id: string
          updated_at: string
        }
        Insert: {
          addressee_id: string
          course_offering_id: string
          created_at?: string
          icebreaker_model?: string | null
          icebreaker_text?: string | null
          id?: string
          requester_id: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["connection_status"]
          student_note?: string | null
          university_id: string
          updated_at?: string
        }
        Update: {
          addressee_id?: string
          course_offering_id?: string
          created_at?: string
          icebreaker_model?: string | null
          icebreaker_text?: string | null
          id?: string
          requester_id?: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["connection_status"]
          student_note?: string | null
          university_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "connection_requests_addressee_id_fkey"
            columns: ["addressee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connection_requests_course_offering_id_fkey"
            columns: ["course_offering_id"]
            isOneToOne: false
            referencedRelation: "course_offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connection_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connection_requests_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          course_offering_id: string | null
          created_at: string
          id: string
          last_message_at: string
          participant_a: string
          participant_b: string
          university_id: string
        }
        Insert: {
          course_offering_id?: string | null
          created_at?: string
          id?: string
          last_message_at?: string
          participant_a: string
          participant_b: string
          university_id: string
        }
        Update: {
          course_offering_id?: string | null
          created_at?: string
          id?: string
          last_message_at?: string
          participant_a?: string
          participant_b?: string
          university_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_course_offering_id_fkey"
            columns: ["course_offering_id"]
            isOneToOne: false
            referencedRelation: "course_offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_participant_a_fkey"
            columns: ["participant_a"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_participant_b_fkey"
            columns: ["participant_b"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
        ]
      }
      course_offerings: {
        Row: {
          course_id: string
          created_at: string
          id: string
          lecturer: string | null
          term_id: string
        }
        Insert: {
          course_id: string
          created_at?: string
          id?: string
          lecturer?: string | null
          term_id: string
        }
        Update: {
          course_id?: string
          created_at?: string
          id?: string
          lecturer?: string | null
          term_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_offerings_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_offerings_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          code: string
          created_at: string
          degree_id: string | null
          faculty: string | null
          generated_at: string | null
          id: string
          name: string
          source: Database["public"]["Enums"]["course_source"]
          university_id: string
        }
        Insert: {
          code: string
          created_at?: string
          degree_id?: string | null
          faculty?: string | null
          generated_at?: string | null
          id?: string
          name: string
          source?: Database["public"]["Enums"]["course_source"]
          university_id: string
        }
        Update: {
          code?: string
          created_at?: string
          degree_id?: string | null
          faculty?: string | null
          generated_at?: string | null
          id?: string
          name?: string
          source?: Database["public"]["Enums"]["course_source"]
          university_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_degree_id_fkey"
            columns: ["degree_id"]
            isOneToOne: false
            referencedRelation: "degrees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
        ]
      }
      degrees: {
        Row: {
          created_at: string
          id: string
          level: Database["public"]["Enums"]["degree_level"]
          name: string
          university_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          level: Database["public"]["Enums"]["degree_level"]
          name: string
          university_id: string
        }
        Update: {
          created_at?: string
          id?: string
          level?: Database["public"]["Enums"]["degree_level"]
          name?: string
          university_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "degrees_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollments: {
        Row: {
          course_offering_id: string
          created_at: string
          group_sizes: Database["public"]["Enums"]["group_size_choice"][] | null
          id: string
          intent: Database["public"]["Enums"]["enrollment_intent"]
          preferred_time_blocks:
            | Database["public"]["Enums"]["time_block"][]
            | null
          profile_id: string
          study_environments:
            | Database["public"]["Enums"]["study_environment"][]
            | null
          study_formats: Database["public"]["Enums"]["study_format"][] | null
          university_id: string
        }
        Insert: {
          course_offering_id: string
          created_at?: string
          group_sizes?:
            | Database["public"]["Enums"]["group_size_choice"][]
            | null
          id?: string
          intent?: Database["public"]["Enums"]["enrollment_intent"]
          preferred_time_blocks?:
            | Database["public"]["Enums"]["time_block"][]
            | null
          profile_id: string
          study_environments?:
            | Database["public"]["Enums"]["study_environment"][]
            | null
          study_formats?: Database["public"]["Enums"]["study_format"][] | null
          university_id: string
        }
        Update: {
          course_offering_id?: string
          created_at?: string
          group_sizes?:
            | Database["public"]["Enums"]["group_size_choice"][]
            | null
          id?: string
          intent?: Database["public"]["Enums"]["enrollment_intent"]
          preferred_time_blocks?:
            | Database["public"]["Enums"]["time_block"][]
            | null
          profile_id?: string
          study_environments?:
            | Database["public"]["Enums"]["study_environment"][]
            | null
          study_formats?: Database["public"]["Enums"]["study_format"][] | null
          university_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_course_offering_id_fkey"
            columns: ["course_offering_id"]
            isOneToOne: false
            referencedRelation: "course_offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
        ]
      }
      group_meeting_ratings: {
        Row: {
          created_at: string
          group_id: string
          id: string
          meeting_id: string
          note: string | null
          rater_id: string
          sentiment: Database["public"]["Enums"]["rating_sentiment"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          meeting_id: string
          note?: string | null
          rater_id: string
          sentiment: Database["public"]["Enums"]["rating_sentiment"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          meeting_id?: string
          note?: string | null
          rater_id?: string
          sentiment?: Database["public"]["Enums"]["rating_sentiment"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_meeting_ratings_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "study_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_meeting_ratings_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_meeting_ratings_rater_id_fkey"
            columns: ["rater_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          group_id: string
          id: string
          invited_by: string | null
          kind: Database["public"]["Enums"]["group_request_kind"]
          requester_id: string
          status: Database["public"]["Enums"]["group_request_status"]
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          group_id: string
          id?: string
          invited_by?: string | null
          kind?: Database["public"]["Enums"]["group_request_kind"]
          requester_id: string
          status?: Database["public"]["Enums"]["group_request_status"]
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          group_id?: string
          id?: string
          invited_by?: string | null
          kind?: Database["public"]["Enums"]["group_request_kind"]
          requester_id?: string
          status?: Database["public"]["Enums"]["group_request_status"]
        }
        Relationships: [
          {
            foreignKeyName: "group_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_requests_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "study_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_requests_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_preferences: {
        Row: {
          created_at: string
          group_sizes: Database["public"]["Enums"]["group_size_choice"][]
          preferred_time_blocks: Database["public"]["Enums"]["time_block"][]
          profile_id: string
          spoken_languages: string[]
          studies_on_saturday: boolean
          study_environments: Database["public"]["Enums"]["study_environment"][]
          study_formats: Database["public"]["Enums"]["study_format"][]
          updated_at: string
        }
        Insert: {
          created_at?: string
          group_sizes: Database["public"]["Enums"]["group_size_choice"][]
          preferred_time_blocks: Database["public"]["Enums"]["time_block"][]
          profile_id: string
          spoken_languages?: string[]
          studies_on_saturday: boolean
          study_environments: Database["public"]["Enums"]["study_environment"][]
          study_formats?: Database["public"]["Enums"]["study_format"][]
          updated_at?: string
        }
        Update: {
          created_at?: string
          group_sizes?: Database["public"]["Enums"]["group_size_choice"][]
          preferred_time_blocks?: Database["public"]["Enums"]["time_block"][]
          profile_id?: string
          spoken_languages?: string[]
          studies_on_saturday?: boolean
          study_environments?: Database["public"]["Enums"]["study_environment"][]
          study_formats?: Database["public"]["Enums"]["study_format"][]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_preferences_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      match_scores: {
        Row: {
          ai_rank: number | null
          ai_reason: string | null
          ai_score: number | null
          candidate_id: string
          computed_at: string
          course_offering_id: string
          expires_at: string
          id: string
          model: string | null
          profile_id: string
          rule_score: number
        }
        Insert: {
          ai_rank?: number | null
          ai_reason?: string | null
          ai_score?: number | null
          candidate_id: string
          computed_at?: string
          course_offering_id: string
          expires_at: string
          id?: string
          model?: string | null
          profile_id: string
          rule_score: number
        }
        Update: {
          ai_rank?: number | null
          ai_reason?: string | null
          ai_score?: number | null
          candidate_id?: string
          computed_at?: string
          course_offering_id?: string
          expires_at?: string
          id?: string
          model?: string | null
          profile_id?: string
          rule_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "match_scores_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_scores_course_offering_id_fkey"
            columns: ["course_offering_id"]
            isOneToOne: false
            referencedRelation: "course_offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_scores_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_attendees: {
        Row: {
          created_at: string
          meeting_id: string
          profile_id: string
          responded_at: string | null
          rsvp: Database["public"]["Enums"]["meeting_rsvp"]
        }
        Insert: {
          created_at?: string
          meeting_id: string
          profile_id: string
          responded_at?: string | null
          rsvp?: Database["public"]["Enums"]["meeting_rsvp"]
        }
        Update: {
          created_at?: string
          meeting_id?: string
          profile_id?: string
          responded_at?: string | null
          rsvp?: Database["public"]["Enums"]["meeting_rsvp"]
        }
        Relationships: [
          {
            foreignKeyName: "meeting_attendees_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_attendees_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          cancelled_at: string | null
          cancelled_by: string | null
          conversation_id: string | null
          course_offering_id: string | null
          created_at: string
          created_by: string | null
          ends_at: string
          group_id: string | null
          id: string
          location: string | null
          starts_at: string
          status: Database["public"]["Enums"]["meeting_status"]
          title: string
          university_id: string
        }
        Insert: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          conversation_id?: string | null
          course_offering_id?: string | null
          created_at?: string
          created_by?: string | null
          ends_at: string
          group_id?: string | null
          id?: string
          location?: string | null
          starts_at: string
          status?: Database["public"]["Enums"]["meeting_status"]
          title: string
          university_id: string
        }
        Update: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          conversation_id?: string | null
          course_offering_id?: string | null
          created_at?: string
          created_by?: string | null
          ends_at?: string
          group_id?: string | null
          id?: string
          location?: string | null
          starts_at?: string
          status?: Database["public"]["Enums"]["meeting_status"]
          title?: string
          university_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetings_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_course_offering_id_fkey"
            columns: ["course_offering_id"]
            isOneToOne: false
            referencedRelation: "course_offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "study_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          id: string
          is_icebreaker: boolean
          is_read: boolean
          model: string | null
          read_at: string | null
          sender_id: string
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          is_icebreaker?: boolean
          is_read?: boolean
          model?: string | null
          read_at?: string | null
          sender_id: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          is_icebreaker?: boolean
          is_read?: boolean
          model?: string | null
          read_at?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string | null
          comment_id: string | null
          course_offering_id: string | null
          created_at: string
          group_id: string | null
          id: string
          meeting_id: string | null
          occurred_on: string
          read_at: string | null
          recipient_id: string
          secondary_id: string | null
          type: Database["public"]["Enums"]["notification_type"]
          wall_post_id: string | null
        }
        Insert: {
          actor_id?: string | null
          comment_id?: string | null
          course_offering_id?: string | null
          created_at?: string
          group_id?: string | null
          id?: string
          meeting_id?: string | null
          occurred_on?: string
          read_at?: string | null
          recipient_id: string
          secondary_id?: string | null
          type: Database["public"]["Enums"]["notification_type"]
          wall_post_id?: string | null
        }
        Update: {
          actor_id?: string | null
          comment_id?: string | null
          course_offering_id?: string | null
          created_at?: string
          group_id?: string | null
          id?: string
          meeting_id?: string | null
          occurred_on?: string
          read_at?: string | null
          recipient_id?: string
          secondary_id?: string | null
          type?: Database["public"]["Enums"]["notification_type"]
          wall_post_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "post_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_course_offering_id_fkey"
            columns: ["course_offering_id"]
            isOneToOne: false
            referencedRelation: "course_offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "study_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_secondary_id_fkey"
            columns: ["secondary_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_wall_post_id_fkey"
            columns: ["wall_post_id"]
            isOneToOne: false
            referencedRelation: "wall_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_comments: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          parent_comment_id: string | null
          post_id: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          parent_comment_id?: string | null
          post_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          parent_comment_id?: string | null
          post_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "post_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "wall_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_likes: {
        Row: {
          created_at: string
          post_id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          profile_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "wall_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_likes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_contacts: {
        Row: {
          created_at: string
          phone_e164: string
          phone_verified_at: string | null
          profile_id: string
          updated_at: string
          whatsapp_opt_in: boolean
        }
        Insert: {
          created_at?: string
          phone_e164: string
          phone_verified_at?: string | null
          profile_id: string
          updated_at?: string
          whatsapp_opt_in?: boolean
        }
        Update: {
          created_at?: string
          phone_e164?: string
          phone_verified_at?: string | null
          profile_id?: string
          updated_at?: string
          whatsapp_opt_in?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "profile_contacts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_private: {
        Row: {
          created_at: string
          date_of_birth: string | null
          profile_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date_of_birth?: string | null
          profile_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date_of_birth?: string | null
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_private_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          availability_mode: Database["public"]["Enums"]["availability_mode"]
          avatar_url: string | null
          bio: string | null
          city: string | null
          created_at: string
          degree_id: string | null
          full_name: string | null
          id: string
          is_discoverable: boolean
          onboarding_completed_at: string | null
          university_id: string
          updated_at: string
          year_of_study: number | null
        }
        Insert: {
          availability_mode?: Database["public"]["Enums"]["availability_mode"]
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          created_at?: string
          degree_id?: string | null
          full_name?: string | null
          id: string
          is_discoverable?: boolean
          onboarding_completed_at?: string | null
          university_id: string
          updated_at?: string
          year_of_study?: number | null
        }
        Update: {
          availability_mode?: Database["public"]["Enums"]["availability_mode"]
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          created_at?: string
          degree_id?: string | null
          full_name?: string | null
          id?: string
          is_discoverable?: boolean
          onboarding_completed_at?: string | null
          university_id?: string
          updated_at?: string
          year_of_study?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_degree_id_fkey"
            columns: ["degree_id"]
            isOneToOne: false
            referencedRelation: "degrees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
        ]
      }
      study_group_members: {
        Row: {
          group_id: string
          joined_at: string
          profile_id: string
          role: Database["public"]["Enums"]["study_group_role"]
        }
        Insert: {
          group_id: string
          joined_at?: string
          profile_id: string
          role?: Database["public"]["Enums"]["study_group_role"]
        }
        Update: {
          group_id?: string
          joined_at?: string
          profile_id?: string
          role?: Database["public"]["Enums"]["study_group_role"]
        }
        Relationships: [
          {
            foreignKeyName: "study_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "study_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_group_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      study_group_messages: {
        Row: {
          body: string
          created_at: string
          group_id: string
          id: string
          is_system: boolean
          sender_id: string | null
        }
        Insert: {
          body: string
          created_at?: string
          group_id: string
          id?: string
          is_system?: boolean
          sender_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          group_id?: string
          id?: string
          is_system?: boolean
          sender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "study_group_messages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "study_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_group_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      study_groups: {
        Row: {
          admin_id: string | null
          course_offering_id: string
          created_at: string
          description: string | null
          id: string
          max_participants: number
          name: string
          status: Database["public"]["Enums"]["study_group_status"]
          university_id: string
        }
        Insert: {
          admin_id?: string | null
          course_offering_id: string
          created_at?: string
          description?: string | null
          id?: string
          max_participants: number
          name: string
          status?: Database["public"]["Enums"]["study_group_status"]
          university_id: string
        }
        Update: {
          admin_id?: string | null
          course_offering_id?: string
          created_at?: string
          description?: string | null
          id?: string
          max_participants?: number
          name?: string
          status?: Database["public"]["Enums"]["study_group_status"]
          university_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_groups_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_groups_course_offering_id_fkey"
            columns: ["course_offering_id"]
            isOneToOne: false
            referencedRelation: "course_offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_groups_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
        ]
      }
      study_ratings: {
        Row: {
          course_offering_id: string | null
          created_at: string
          id: string
          meeting_id: string | null
          note: string | null
          ratee_id: string
          rater_id: string
          sentiment: Database["public"]["Enums"]["rating_sentiment"]
          updated_at: string
        }
        Insert: {
          course_offering_id?: string | null
          created_at?: string
          id?: string
          meeting_id?: string | null
          note?: string | null
          ratee_id: string
          rater_id: string
          sentiment: Database["public"]["Enums"]["rating_sentiment"]
          updated_at?: string
        }
        Update: {
          course_offering_id?: string | null
          created_at?: string
          id?: string
          meeting_id?: string | null
          note?: string | null
          ratee_id?: string
          rater_id?: string
          sentiment?: Database["public"]["Enums"]["rating_sentiment"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_ratings_course_offering_id_fkey"
            columns: ["course_offering_id"]
            isOneToOne: false
            referencedRelation: "course_offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_ratings_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_ratings_ratee_id_fkey"
            columns: ["ratee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_ratings_rater_id_fkey"
            columns: ["rater_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      terms: {
        Row: {
          created_at: string
          ends_on: string
          id: string
          is_current: boolean
          name: string
          starts_on: string
          university_id: string
        }
        Insert: {
          created_at?: string
          ends_on: string
          id?: string
          is_current?: boolean
          name: string
          starts_on: string
          university_id: string
        }
        Update: {
          created_at?: string
          ends_on?: string
          id?: string
          is_current?: boolean
          name?: string
          starts_on?: string
          university_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "terms_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
        ]
      }
      universities: {
        Row: {
          country_code: string
          created_at: string
          default_phone_region: string
          id: string
          is_active: boolean
          name: string
          slug: string
          timezone: string
        }
        Insert: {
          country_code?: string
          created_at?: string
          default_phone_region?: string
          id?: string
          is_active?: boolean
          name: string
          slug: string
          timezone?: string
        }
        Update: {
          country_code?: string
          created_at?: string
          default_phone_region?: string
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          timezone?: string
        }
        Relationships: []
      }
      university_domains: {
        Row: {
          created_at: string
          domain: string
          is_student_domain: boolean
          university_id: string
        }
        Insert: {
          created_at?: string
          domain: string
          is_student_domain?: boolean
          university_id: string
        }
        Update: {
          created_at?: string
          domain?: string
          is_student_domain?: boolean
          university_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "university_domains_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
        ]
      }
      wall_posts: {
        Row: {
          author_id: string | null
          body: string | null
          created_at: string
          id: string
          is_edited: boolean | null
          original_post_id: string | null
          profile_owner_id: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          is_edited?: boolean | null
          original_post_id?: string | null
          profile_owner_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body?: string | null
          created_at?: string
          id?: string
          is_edited?: boolean | null
          original_post_id?: string | null
          profile_owner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wall_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wall_posts_original_post_id_fkey"
            columns: ["original_post_id"]
            isOneToOne: false
            referencedRelation: "wall_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wall_posts_profile_owner_id_fkey"
            columns: ["profile_owner_id"]
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
      app_age_gap_years: {
        Args: { profile_a: string; profile_b: string }
        Returns: number
      }
      app_array_jaccard: { Args: { a: unknown; b: unknown }; Returns: number }
      app_can_see_comment: {
        Args: { target_comment_id: string }
        Returns: boolean
      }
      app_can_see_group: { Args: { target_group_id: string }; Returns: boolean }
      app_can_see_profile: {
        Args: { target_profile_id: string }
        Returns: boolean
      }
      app_can_see_wall_post: {
        Args: { target_post_id: string }
        Returns: boolean
      }
      app_connection_birthday: {
        Args: { target_profile_id: string }
        Returns: {
          birth_day: number
          birth_month: number
        }[]
      }
      app_current_university_id: { Args: never; Returns: string }
      app_is_connected_to: {
        Args: { other_profile_id: string }
        Returns: boolean
      }
      app_is_connection: {
        Args: { profile_a: string; profile_b: string }
        Returns: boolean
      }
      app_is_conversation_participant: {
        Args: { target_conversation_id: string }
        Returns: boolean
      }
      app_is_group_admin: {
        Args: { target_group_id: string }
        Returns: boolean
      }
      app_is_group_founder: {
        Args: { target_group_id: string }
        Returns: boolean
      }
      app_is_group_member: {
        Args: { target_group_id: string }
        Returns: boolean
      }
      app_is_meeting_attendee: {
        Args: { target_meeting_id: string }
        Returns: boolean
      }
      app_overlap_minutes: {
        Args: { profile_a: string; profile_b: string }
        Returns: number
      }
      app_positive_rating_count: {
        Args: { target_profile_id: string }
        Returns: number
      }
      app_profile_age_years: {
        Args: { target_profile_id: string }
        Returns: number
      }
      app_shared_completed_meeting: {
        Args: { profile_a: string; profile_b: string }
        Returns: boolean
      }
      app_shared_days: {
        Args: { profile_a: string; profile_b: string }
        Returns: number[]
      }
      app_university_timezone: {
        Args: { target_profile_id: string }
        Returns: string
      }
      app_wall_post_owner: { Args: { target_post_id: string }; Returns: string }
      rpc_approve_group_request: {
        Args: { p_request_id: string }
        Returns: string
      }
      rpc_cancel_meeting: { Args: { p_meeting_id: string }; Returns: undefined }
      rpc_create_meeting: {
        Args: {
          p_conversation_id?: string
          p_ends_at: string
          p_group_id?: string
          p_location?: string
          p_starts_at: string
          p_title: string
        }
        Returns: string
      }
      rpc_find_candidates: {
        Args: { p_course_offering_id?: string; p_limit?: number }
        Returns: {
          avatar_url: string
          bonus_points: number
          candidate_id: string
          city: string
          close_in_age: boolean
          course_code: string
          course_name: string
          course_offering_id: string
          degree_level: Database["public"]["Enums"]["degree_level"]
          degree_name: string
          environment_exact: boolean
          full_name: string
          group_sizes: Database["public"]["Enums"]["group_size_choice"][]
          hours_exact: boolean
          intent: Database["public"]["Enums"]["enrollment_intent"]
          overlap_minutes: number
          preferred_time_blocks: Database["public"]["Enums"]["time_block"][]
          rule_score: number
          same_city: boolean
          same_cohort: boolean
          shared_course_count: number
          shared_days: number[]
          studies_on_saturday: boolean
          study_environments: Database["public"]["Enums"]["study_environment"][]
          study_formats: Database["public"]["Enums"]["study_format"][]
          year_of_study: number
        }[]
      }
      rpc_meeting_slots: {
        Args: {
          p_conversation_id?: string
          p_days?: number
          p_from?: string
          p_group_id?: string
        }
        Returns: {
          ends_at: string
          participant_count: number
          starts_at: string
        }[]
      }
      rpc_my_schedule: {
        Args: { p_from?: string; p_to?: string }
        Returns: {
          conversation_id: string
          course_offering_id: string
          ends_at: string
          group_id: string
          location: string
          meeting_id: string
          other_attendees: number
          starts_at: string
          title: string
        }[]
      }
      rpc_reject_group_request: {
        Args: { p_note?: string; p_request_id: string }
        Returns: string
      }
      rpc_sync_notifications: { Args: never; Returns: undefined }
    }
    Enums: {
      ai_status: "ok" | "error" | "rate_limited" | "invalid_output"
      ai_task: "match_rerank" | "icebreaker" | "course_generation"
      availability_mode: "manual" | "calendar_sync"
      availability_source: "manual" | "google_calendar" | "apple_calendar"
      connection_status:
        | "pending"
        | "accepted"
        | "declined"
        | "cancelled"
        | "expired"
      course_source: "seed" | "registrar" | "ai_generated" | "placeholder"
      degree_level: "bachelors" | "masters" | "phd"
      enrollment_intent: "need_help" | "want_partner" | "can_tutor"
      group_request_kind: "request" | "invite"
      group_request_status: "pending" | "approved" | "rejected"
      group_size_choice: "small" | "large"
      meeting_rsvp: "going" | "cancelled"
      meeting_status: "scheduled" | "cancelled"
      notification_type:
        | "group_request"
        | "group_promotion"
        | "meeting_scheduled"
        | "meeting_cancelled"
        | "new_match"
        | "birthday"
        | "match_suggestion"
        | "wall_post"
        | "post_like"
        | "post_comment"
        | "post_share"
        | "comment_reply"
        | "comment_like"
        | "group_invite"
        | "rate_partner"
      rating_sentiment: "positive" | "negative"
      study_environment: "discussion" | "quiet"
      study_format: "in_person" | "remote"
      study_group_role: "member" | "admin"
      study_group_status: "open" | "closed"
      time_block: "morning" | "noon" | "evening"
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
      ai_status: ["ok", "error", "rate_limited", "invalid_output"],
      ai_task: ["match_rerank", "icebreaker", "course_generation"],
      availability_mode: ["manual", "calendar_sync"],
      availability_source: ["manual", "google_calendar", "apple_calendar"],
      connection_status: [
        "pending",
        "accepted",
        "declined",
        "cancelled",
        "expired",
      ],
      course_source: ["seed", "registrar", "ai_generated", "placeholder"],
      degree_level: ["bachelors", "masters", "phd"],
      enrollment_intent: ["need_help", "want_partner", "can_tutor"],
      group_request_kind: ["request", "invite"],
      group_request_status: ["pending", "approved", "rejected"],
      group_size_choice: ["small", "large"],
      meeting_rsvp: ["going", "cancelled"],
      meeting_status: ["scheduled", "cancelled"],
      notification_type: [
        "group_request",
        "group_promotion",
        "meeting_scheduled",
        "meeting_cancelled",
        "new_match",
        "birthday",
        "match_suggestion",
        "wall_post",
        "post_like",
        "post_comment",
        "post_share",
        "comment_reply",
        "comment_like",
        "group_invite",
        "rate_partner",
      ],
      rating_sentiment: ["positive", "negative"],
      study_environment: ["discussion", "quiet"],
      study_format: ["in_person", "remote"],
      study_group_role: ["member", "admin"],
      study_group_status: ["open", "closed"],
      time_block: ["morning", "noon", "evening"],
    },
  },
} as const

