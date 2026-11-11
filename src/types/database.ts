export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Audit = { created_at: string; updated_at: string };

export interface Database {
  public: {
    Tables: {
      content_documents: {
        Row: Audit & { key: string; content: Json; active: boolean; version: number; schema_version: string; source: string | null; published_at: string | null; metadata: Json };
        Insert: { key: string; content: Json; active?: boolean; version?: number; schema_version?: string; source?: string | null; published_at?: string | null; metadata?: Json; created_at?: string; updated_at?: string };
        Update: { content?: Json; active?: boolean; version?: number; schema_version?: string; source?: string | null; published_at?: string | null; metadata?: Json; updated_at?: string };
        Relationships: [];
      };
      content_document_revisions: {
        Row: { id: number; document_key: string; version: number; content: Json; metadata: Json; changed_by: string | null; created_at: string };
        Insert: { document_key: string; version: number; content: Json; metadata?: Json; changed_by?: string | null; created_at?: string };
        Update: never;
        Relationships: [];
      };
      daily_checkins: {
        Row: Audit & { user_id: string; checkin_date: string; water_glasses: number; mood: number | null; meals: Json; choices: Json; custom_habits: Json; workout_completed: boolean };
        Insert: { user_id: string; checkin_date: string; water_glasses?: number; mood?: number | null; meals?: Json; choices?: Json; custom_habits?: Json; workout_completed?: boolean; created_at?: string; updated_at?: string };
        Update: { water_glasses?: number; mood?: number | null; meals?: Json; choices?: Json; custom_habits?: Json; workout_completed?: boolean; updated_at?: string };
        Relationships: [];
      };
      profiles: {
        Row: Audit & { id: string; email: string; first_name: string; last_name: string; preferred_name: string | null; role: Database['public']['Enums']['app_role']; subscription_status: Database['public']['Enums']['subscription_status']; birth_date: string | null; avatar_url: string | null; objective: string | null; personal_goal: string | null; weekly_goal: number | null; level: string | null; modality: string | null; notify_workouts: boolean; notify_meetings: boolean; notify_rewards: boolean; share_progress_with_team: boolean; onboarding_completed: boolean; active: boolean; meal_plan_id: string | null; calorie_goal: number | null; meal_times: Json; legacy_imported_at: string | null; reminder_settings: Json; theme_preference: string; workout_clearance_at: string | null; running_state: Json };
        Insert: { id: string; email: string; first_name?: string; last_name?: string; preferred_name?: string | null; role?: Database['public']['Enums']['app_role']; subscription_status?: Database['public']['Enums']['subscription_status']; birth_date?: string | null; avatar_url?: string | null; objective?: string | null; personal_goal?: string | null; weekly_goal?: number | null; level?: string | null; modality?: string | null; notify_workouts?: boolean; notify_meetings?: boolean; notify_rewards?: boolean; share_progress_with_team?: boolean; onboarding_completed?: boolean; active?: boolean; meal_plan_id?: string | null; calorie_goal?: number | null; meal_times?: Json; legacy_imported_at?: string | null; reminder_settings?: Json; theme_preference?: string; workout_clearance_at?: string | null; running_state?: Json; created_at?: string; updated_at?: string };
        Update: { first_name?: string; last_name?: string; preferred_name?: string | null; birth_date?: string | null; avatar_url?: string | null; objective?: string | null; personal_goal?: string | null; weekly_goal?: number | null; level?: string | null; modality?: string | null; notify_workouts?: boolean; notify_meetings?: boolean; notify_rewards?: boolean; share_progress_with_team?: boolean; onboarding_completed?: boolean; meal_plan_id?: string | null; calorie_goal?: number | null; meal_times?: Json; legacy_imported_at?: string | null; reminder_settings?: Json; theme_preference?: string; workout_clearance_at?: string | null; running_state?: Json; updated_at?: string };
        Relationships: [];
      };
      workout_sessions: {
        Row: Audit & { id: string; user_id: string; workout_id: string; program_id: string; name: string; focus: string; status: string; started_at: string; elapsed_ms: number; is_running: boolean; running_since: string | null; finished_at: string | null; items: Json; substitutions: Json; exercise_map: Json; scheduled_for: string | null; phase_index: number | null; estimated_calories: number | null; source: string; mobility_completed_at: string | null; mobility_items: Json };
        Insert: { id: string; user_id: string; workout_id: string; program_id: string; name: string; focus?: string; status?: string; started_at: string; elapsed_ms?: number; is_running?: boolean; running_since?: string | null; finished_at?: string | null; items?: Json; substitutions?: Json; exercise_map?: Json; scheduled_for?: string | null; phase_index?: number | null; estimated_calories?: number | null; source?: string; mobility_completed_at?: string | null; mobility_items?: Json; created_at?: string; updated_at?: string };
        Update: { status?: string; elapsed_ms?: number; is_running?: boolean; running_since?: string | null; finished_at?: string | null; items?: Json; substitutions?: Json; exercise_map?: Json; scheduled_for?: string | null; phase_index?: number | null; estimated_calories?: number | null; source?: string; mobility_completed_at?: string | null; mobility_items?: Json; updated_at?: string };
        Relationships: [];
      };
      workout_session_sets: {
        Row: { session_id: string; item_id: string; set_index: number; repetitions: number | null; load_kg: number; completed: boolean; completed_at: string | null };
        Insert: { session_id: string; item_id: string; set_index: number; repetitions?: number | null; load_kg?: number; completed?: boolean; completed_at?: string | null };
        Update: { repetitions?: number | null; load_kg?: number; completed?: boolean; completed_at?: string | null };
        Relationships: [];
      };
      food_entries: {
        Row: Audit & { user_id: string; entry_date: string; id: string; meal_ref: string; eaten_at: string | null; description: string; calories: number; source: string | null; option_index: number | null; photo_path: string | null; food_items: Json };
        Insert: { user_id: string; entry_date: string; id: string; meal_ref: string; eaten_at?: string | null; description: string; calories?: number; source?: string | null; option_index?: number | null; photo_path?: string | null; food_items?: Json; created_at?: string; updated_at?: string };
        Update: { eaten_at?: string | null; description?: string; calories?: number; source?: string | null; option_index?: number | null; photo_path?: string | null; food_items?: Json; updated_at?: string };
        Relationships: [];
      };
      body_measurements: {
        Row: Audit & { id: string; user_id: string; measured_on: string; weight_kg: number | null; waist_cm: number | null; hip_cm: number | null; arm_cm: number | null; notes: string | null };
        Insert: { id?: string; user_id: string; measured_on: string; weight_kg?: number | null; waist_cm?: number | null; hip_cm?: number | null; arm_cm?: number | null; notes?: string | null; created_at?: string; updated_at?: string };
        Update: { measured_on?: string; weight_kg?: number | null; waist_cm?: number | null; hip_cm?: number | null; arm_cm?: number | null; notes?: string | null; updated_at?: string };
        Relationships: [];
      };
      progress_milestones: {
        Row: { id: string; user_id: string; milestone_date: string; title: string; type: string; created_at: string };
        Insert: { id?: string; user_id: string; milestone_date?: string; title: string; type?: string; created_at?: string };
        Update: { milestone_date?: string; title?: string; type?: string };
        Relationships: [];
      };
      user_workout_schedules: {
        Row: Audit & { user_id: string; program_id: string; starts_on: string; weekday_plan: Json; phase_index: number; current_week: number };
        Insert: { user_id: string; program_id: string; starts_on?: string; weekday_plan?: Json; phase_index?: number; current_week?: number; created_at?: string; updated_at?: string };
        Update: { program_id?: string; starts_on?: string; weekday_plan?: Json; phase_index?: number; current_week?: number; updated_at?: string };
        Relationships: [];
      };
      user_reminders: {
        Row: Audit & { id: string; user_id: string; title: string; body: string | null; kind: string; reminder_time: string | null; weekdays: number[]; scheduled_at: string | null; interval_minutes: number | null; window_start: string | null; window_end: string | null; source: string; content_ref: string | null; enabled: boolean };
        Insert: { id?: string; user_id: string; title: string; body?: string | null; kind?: string; reminder_time?: string | null; weekdays?: number[]; scheduled_at?: string | null; interval_minutes?: number | null; window_start?: string | null; window_end?: string | null; source?: string; content_ref?: string | null; enabled?: boolean; created_at?: string; updated_at?: string };
        Update: { title?: string; body?: string | null; kind?: string; reminder_time?: string | null; weekdays?: number[]; scheduled_at?: string | null; interval_minutes?: number | null; window_start?: string | null; window_end?: string | null; source?: string; content_ref?: string | null; enabled?: boolean; updated_at?: string };
        Relationships: [];
      };
      run_sessions: {
        Row: Audit & { id: string; user_id: string; plan_id: string | null; plan_session_id: string | null; activity_date: string; distance_km: number | null; duration_seconds: number; perceived_effort: number | null; notes: string | null; completed_at: string; pain: boolean };
        Insert: { id?: string; user_id: string; plan_id?: string | null; plan_session_id?: string | null; activity_date?: string; distance_km?: number | null; duration_seconds: number; perceived_effort?: number | null; notes?: string | null; completed_at?: string; pain?: boolean; created_at?: string; updated_at?: string };
        Update: { plan_id?: string | null; plan_session_id?: string | null; activity_date?: string; distance_km?: number | null; duration_seconds?: number; perceived_effort?: number | null; notes?: string | null; completed_at?: string; pain?: boolean; updated_at?: string };
        Relationships: [];
      };
      external_activities: {
        Row: Audit & { id: string; user_id: string; activity_date: string; activity_type: string; duration_minutes: number; distance_km: number | null; estimated_calories: number | null; notes: string | null };
        Insert: { id?: string; user_id: string; activity_date?: string; activity_type: string; duration_minutes: number; distance_km?: number | null; estimated_calories?: number | null; notes?: string | null; created_at?: string; updated_at?: string };
        Update: { activity_date?: string; activity_type?: string; duration_minutes?: number; distance_km?: number | null; estimated_calories?: number | null; notes?: string | null; updated_at?: string };
        Relationships: [];
      };
      monthly_evaluations: {
        Row: Audit & { id: string; user_id: string; reference_month: string; energy: number | null; sleep: number | null; self_esteem: number | null; relationship_with_food: number | null; consistency: number | null; notes: string | null; scores: Json };
        Insert: { id?: string; user_id: string; reference_month: string; energy?: number | null; sleep?: number | null; self_esteem?: number | null; relationship_with_food?: number | null; consistency?: number | null; notes?: string | null; scores?: Json; created_at?: string; updated_at?: string };
        Update: { reference_month?: string; energy?: number | null; sleep?: number | null; self_esteem?: number | null; relationship_with_food?: number | null; consistency?: number | null; notes?: string | null; scores?: Json; updated_at?: string };
        Relationships: [];
      };
      running_plan_progress: {
        Row: { user_id: string; plan_id: string; session_id: string; completed_on: string; created_at: string };
        Insert: { user_id: string; plan_id: string; session_id: string; completed_on?: string; created_at?: string };
        Update: { completed_on?: string };
        Relationships: [];
      };
      course_lesson_progress: {
        Row: Audit & { user_id: string; module_id: string; lesson_id: string; completed_at: string | null; last_position_seconds: number; notes: string | null };
        Insert: { user_id: string; module_id: string; lesson_id: string; completed_at?: string | null; last_position_seconds?: number; notes?: string | null; created_at?: string; updated_at?: string };
        Update: { completed_at?: string | null; last_position_seconds?: number; notes?: string | null; updated_at?: string };
        Relationships: [];
      };
      meetings: {
        Row: Audit & { id: string; meeting_date: string; meeting_time: string | null; topic: string; responsible: string | null; join_url: string | null; recording_url: string | null; active: boolean; duration_minutes: number; meeting_type: string; materials_url: string | null };
        Insert: { id: string; meeting_date: string; meeting_time?: string | null; topic: string; responsible?: string | null; join_url?: string | null; recording_url?: string | null; active?: boolean; duration_minutes?: number; meeting_type?: string; materials_url?: string | null; created_at?: string; updated_at?: string };
        Update: { meeting_date?: string; meeting_time?: string | null; topic?: string; responsible?: string | null; join_url?: string | null; recording_url?: string | null; active?: boolean; duration_minutes?: number; meeting_type?: string; materials_url?: string | null; updated_at?: string };
        Relationships: [];
      };
      rewards: {
        Row: Audit & { id: string; name: string; description: string | null; metric: string; target: number; sort_order: number; active: boolean };
        Insert: { id: string; name: string; description?: string | null; metric: string; target: number; sort_order?: number; active?: boolean; created_at?: string; updated_at?: string };
        Update: { name?: string; description?: string | null; metric?: string; target?: number; sort_order?: number; active?: boolean; updated_at?: string };
        Relationships: [];
      };
      user_reward_redemptions: {
        Row: { user_id: string; reward_id: string; redeemed_at: string };
        Insert: { user_id: string; reward_id: string; redeemed_at?: string };
        Update: { redeemed_at?: string };
        Relationships: [];
      };
      onboarding_quizzes: {
        Row: Audit & { user_id: string; answers: Json; recommendations: Json; completed_at: string };
        Insert: { user_id: string; answers: Json; recommendations: Json; completed_at?: string; created_at?: string; updated_at?: string };
        Update: { answers?: Json; recommendations?: Json; completed_at?: string; updated_at?: string };
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      can_access_content: { Args: Record<PropertyKey, never>; Returns: boolean };
      admin_team_indicators: { Args: Record<PropertyKey, never>; Returns: Json };
      validate_my_access: { Args: Record<PropertyKey, never>; Returns: Json };
      monthly_evaluation_status: { Args: Record<PropertyKey, never>; Returns: Json };
      submit_monthly_evaluation: { Args: { p_scores: Json }; Returns: string };
    };
    Enums: { app_role: 'participant' | 'coach' | 'admin'; subscription_status: 'pending' | 'active' | 'suspended' | 'cancelled' };
    CompositeTypes: Record<never, never>;
  };
}
