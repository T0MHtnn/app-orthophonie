import type { RequestType } from './request-type';
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
  first_name: string;
  last_name: string;
  /** Colonne calculée (prénom + nom), lecture seule. */
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
  address_line: string | null;
  postal_code: string | null;
  city: string | null;
  /** Visible dans l'annuaire « Trouver un orthophoniste ». */
  listed: boolean;
  /** Durée de séance proposée par défaut dans l'agenda (minutes). */
  session_minutes: number;
  /** Qui réserve en ligne : l'ortho seul·e, les patients autonomes, ou tous les patients suivis. */
  booking_mode: 'ortho' | 'autonomes' | 'tous';
  /** Délai minimum (heures) entre la réservation en ligne et le rendez-vous. */
  booking_min_notice_hours: number;
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
  request_type: RequestType;
  notes: string | null;
  status: WaitlistStatus;
  info_acknowledged_at: string;
  consent_at: string;
  contacted_at: string | null;
  requester_id: string | null;
  created_at: string;
  updated_at: string;
};

export type PatientRow = {
  id: string;
  practice_id: string;
  waitlist_entry_id: string | null;
  family_id: string | null;
  last_name: string;
  first_name: string;
  patient_age: string | null;
  caregiver_last_name: string | null;
  caregiver_first_name: string | null;
  email: string | null;
  phone: string | null;
  pathology_code: string | null;
  request_type: RequestType | null;
  autonomous: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type ScheduleBlockRow = {
  id: string;
  practice_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  recurrence: 'none' | 'daily' | 'weekly' | 'biweekly' | 'triweekly' | 'monthly' | 'weekdays';
  /** Jours ISO (1 = lundi) pour recurrence = 'weekdays'. */
  weekdays: number[];
  /** Dernier jour de répétition (inclus), AAAA-MM-JJ. */
  until: string | null;
  /** Jours supprimés ou remplacés (« ce jour seulement »). */
  skip_dates: string[];
  created_at: string;
  updated_at: string;
};

export type AppointmentStatus = 'confirme' | 'a_valider' | 'annule';

export type AppointmentRow = {
  id: string;
  practice_id: string;
  patient_id: string;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  booked_by: 'ortho' | 'famille';
  cancelled_at: string | null;
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
      profiles: Table<ProfileRow, NoInsert, Partial<Pick<ProfileRow, 'first_name' | 'last_name'>>>;
      practices: Table<PracticeRow, NoInsert, Partial<Pick<PracticeRow, 'name' | 'waitlist_open' | 'waitlist_info' | 'email_template' | 'address_line' | 'postal_code' | 'city' | 'listed' | 'session_minutes' | 'booking_mode' | 'booking_min_notice_hours'>>>;
      waitlist_entries: Table<WaitlistEntryRow, NoInsert, Partial<Pick<WaitlistEntryRow, 'status'>>>;
      pathologies: Table<PathologyRow, NoInsert, NoInsert>;
      patients: Table<PatientRow, NoInsert, Partial<Pick<PatientRow, 'autonomous'>>>;
      schedule_blocks: Table<
        ScheduleBlockRow,
        Pick<ScheduleBlockRow, 'practice_id' | 'title' | 'starts_at' | 'ends_at' | 'recurrence' | 'weekdays' | 'until' | 'skip_dates'>,
        Partial<Pick<ScheduleBlockRow, 'title' | 'starts_at' | 'ends_at' | 'recurrence' | 'weekdays' | 'until' | 'skip_dates'>>
      >;
      // Écritures via save_appointment / cancel_appointment uniquement.
      appointments: Table<AppointmentRow, NoInsert, NoInsert>;
      audit_log: Table<
        { id: number; at: string; actor_id: string | null; action: string; table_name: string; record_id: string | null; practice_id: string | null },
        NoInsert,
        NoInsert
      >;
    };
    Views: { [_ in never]: never };
    Functions: {
      register_practice: {
        Args: { p_name: string; p_slug: string; p_rpps: string; p_address_line: string; p_postal_code: string; p_city: string };
        Returns: string;
      };
      get_public_practice: {
        Args: { p_slug: string };
        Returns: { name: string; waitlist_info: string; waitlist_open: boolean; address_line: string | null; postal_code: string | null; city: string | null }[];
      };
      search_practices: {
        Args: { p_query: string };
        Returns: { name: string; slug: string; ortho_name: string; address_line: string | null; postal_code: string; city: string }[];
      };
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
          p_request_type: RequestType;
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
          request_type: RequestType;
          status: WaitlistStatus;
          created_at: string;
          contacted_at: string | null;
        }[];
      };
      withdraw_waitlist_entry: { Args: { p_id: string }; Returns: boolean };
      save_appointment: { Args: { p_id: string | null; p_patient_id: string; p_starts_at: string; p_ends_at: string }; Returns: string };
      cancel_appointment: { Args: { p_id: string }; Returns: boolean };
      review_appointment: { Args: { p_id: string; p_accept: boolean }; Returns: boolean };
      booking_busy: { Args: { p_patient_id: string; p_from: string; p_to: string }; Returns: { starts_at: string; ends_at: string }[] };
      /** Renvoie le statut créé : 'confirme' (patient autonome) ou 'a_valider'. */
      book_appointment: { Args: { p_patient_id: string; p_starts_at: string }; Returns: 'confirme' | 'a_valider' };
      family_cancel_appointment: { Args: { p_id: string }; Returns: boolean };
      my_appointments: {
        Args: Record<string, never>;
        Returns: {
          id: string;
          patient_id: string;
          patient_first_name: string;
          patient_last_name: string;
          practice_name: string;
          starts_at: string;
          ends_at: string;
          status: AppointmentStatus;
          can_cancel: boolean;
        }[];
      };
      my_patients: {
        Args: Record<string, never>;
        Returns: {
          id: string;
          first_name: string;
          last_name: string;
          practice_name: string;
          can_book: boolean;
          session_minutes: number;
          min_notice_hours: number;
          /** Une réservation en ligne (en attente ou confirmée) est déjà à venir : pas d'autre demande. */
          active_booking: boolean;
        }[];
      };
    };
    Enums: { user_role: UserRole; waitlist_status: WaitlistStatus; waitlist_request_type: RequestType };
    CompositeTypes: { [_ in never]: never };
  };
};
