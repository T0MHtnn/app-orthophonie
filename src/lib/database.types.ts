/**
 * Types de la base, écrits à la main pour démarrer.
 * À régénérer quand le schéma évolue :
 *   npx supabase gen types typescript --project-id <id> > src/lib/database.types.ts
 */
export type UserRole = 'patient' | 'ortho' | 'admin';
export type WaitlistStatus = 'attente' | 'contacte' | 'rdv' | 'retire';

type NoInsert = { [_ in never]: never };

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type ProfileRow = {
  id: string;
  role: UserRole;
  full_name: string;
  created_at: string;
};

export type PracticeRow = {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  rpps: string;
  verified: boolean;
  waitlist_open: boolean;
  waitlist_info: string;
  email_template: string;
  created_at: string;
  updated_at: string;
};

export type WaitlistEntryRow = {
  id: string;
  practice_id: string;
  patient_last_name: string;
  patient_first_name: string;
  patient_age: string;
  caregiver_last_name: string | null;
  caregiver_first_name: string | null;
  email: string | null;
  phone: string | null;
  pathology_code: string;
  notes: string | null;
  status: WaitlistStatus;
  info_acknowledged_at: string;
  consent_at: string;
  contacted_at: string | null;
  requester_id: string | null;
  created_at: string;
  updated_at: string;
};

export type PathologyRow = {
  code: string;
  label: string;
  sort_order: number;
};

export type Database = {
  public: {
    Tables: {
      // Insert est vide : aucune insertion directe n'est autorisée (fonctions RPC uniquement).
      profiles: Table<ProfileRow, NoInsert, Partial<Pick<ProfileRow, 'full_name'>>>;
      practices: Table<PracticeRow, NoInsert, Partial<Pick<PracticeRow, 'name' | 'waitlist_open' | 'waitlist_info' | 'email_template'>>>;
      waitlist_entries: Table<WaitlistEntryRow, NoInsert, Partial<Pick<WaitlistEntryRow, 'status'>>>;
      pathologies: Table<PathologyRow, NoInsert, NoInsert>;
      audit_log: Table<
        { id: number; at: string; actor_id: string | null; action: string; table_name: string; record_id: string | null; practice_id: string | null },
        NoInsert,
        NoInsert
      >;
    };
    Views: { [_ in never]: never };
    Functions: {
      register_practice: { Args: { p_name: string; p_slug: string; p_rpps: string }; Returns: string };
      get_public_practice: { Args: { p_slug: string }; Returns: { name: string; waitlist_info: string; waitlist_open: boolean }[] };
      submit_waitlist_entry: {
        Args: {
          p_slug: string;
          p_patient_last_name: string;
          p_patient_first_name: string;
          p_patient_age: string;
          p_caregiver_last_name: string;
          p_caregiver_first_name: string;
          p_email: string;
          p_phone: string;
          p_pathology_code: string;
          p_notes: string;
        };
        Returns: boolean;
      };
      my_waitlist_entries: {
        Args: Record<string, never>;
        Returns: {
          id: string;
          practice_name: string;
          patient_first_name: string;
          patient_last_name: string;
          pathology_label: string;
          status: WaitlistStatus;
          created_at: string;
          contacted_at: string | null;
        }[];
      };
      withdraw_waitlist_entry: { Args: { p_id: string }; Returns: boolean };
    };
    Enums: { user_role: UserRole; waitlist_status: WaitlistStatus };
    CompositeTypes: { [_ in never]: never };
  };
};
