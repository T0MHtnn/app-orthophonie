-- Module Patients (étape 1) : fiche complète, prescription + acte AMO, notes de séance privées.
-- Données de santé : lecture et écriture par le propriétaire du cabinet en aal2 uniquement.

-- ---------------------------------------------------------------------------
-- Actes AMO (NGAP orthophonie). Prix = coefficient × lettre clé (2,60 € au 23/02/2026, FNO).
-- Nombre de séances par série : null tant que la liste n'est pas fournie ; l'ortho
-- saisit de toute façon le nombre de séances prescrites sur la fiche.
-- ---------------------------------------------------------------------------
create table public.amo_acts (
  code text primary key check (code ~ '^[a-z0-9-]{2,40}$'),
  label text not null check (char_length(label) between 2 and 120),
  coefficient numeric(5, 2) not null check (coefficient > 0 and coefficient < 100),
  kind text not null check (kind in ('bilan', 'reeducation')),
  sessions int check (sessions between 1 and 200),
  sort_order int not null default 0
);
alter table public.amo_acts enable row level security;
revoke all on public.amo_acts from anon, authenticated;
grant select on public.amo_acts to authenticated;
create policy amo_acts_read on public.amo_acts for select to authenticated using (true);

insert into public.amo_acts (code, label, coefficient, kind, sort_order) values
  ('bilan-langage-ecrit', 'Bilan du langage écrit', 34.02, 'bilan', 10),
  ('reeduc-langage-ecrit', 'Rééducation du langage écrit', 11.6, 'reeducation', 20),
  ('reeduc-articulation', 'Rééducation des troubles de l’articulation', 9.7, 'reeducation', 30),
  ('reeduc-cognition-math', 'Rééducation de la cognition mathématique', 11.7, 'reeducation', 40),
  ('reeduc-langage-oral-3-6', 'Rééducation du langage oral (3 à 6 ans)', 12.6, 'reeducation', 50),
  ('reeduc-neuro', 'Rééducation des pathologies neurologiques', 15.7, 'reeducation', 60);

-- ---------------------------------------------------------------------------
-- Fiche patient : nouvelles informations, modifiables par l'ortho.
-- L'email reste celui du compte (une seule adresse partout) : non modifiable ici.
-- ---------------------------------------------------------------------------
alter table public.patients
  add column birth_date date check (birth_date >= '1900-01-01'),
  add column prescriber_name text check (char_length(prescriber_name) <= 120),
  add column prescription_date date check (prescription_date >= '2000-01-01'),
  add column amo_act_code text references public.amo_acts (code),
  add column sessions_prescribed int check (sessions_prescribed between 1 and 200);

grant update (first_name, last_name, birth_date, patient_age, caregiver_first_name, caregiver_last_name, phone,
  pathology_code, request_type, prescriber_name, prescription_date, amo_act_code, sessions_prescribed)
  on public.patients to authenticated;

-- Même contrôle du téléphone que pour la liste d'attente.
create trigger patients_phone_format before insert or update of phone on public.patients
  for each row execute function private.check_phone_format();

-- ---------------------------------------------------------------------------
-- Notes de séance : privées (jamais visibles par le patient), rattachées ou non à une séance.
-- ---------------------------------------------------------------------------
create table public.session_notes (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete cascade,
  appointment_id uuid references public.appointments (id) on delete set null,
  body text not null check (char_length(trim(body)) between 1 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index session_notes_patient_idx on public.session_notes (patient_id, created_at desc);

-- Patient et séance doivent appartenir au même cabinet que la note.
create function private.check_session_note() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.patients p where p.id = new.patient_id and p.practice_id = new.practice_id) then
    raise exception 'Patient inconnu' using errcode = '42501';
  end if;
  if new.appointment_id is not null and not exists (
    select 1 from public.appointments a where a.id = new.appointment_id and a.patient_id = new.patient_id
  ) then
    raise exception 'Séance inconnue' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger session_notes_check before insert or update on public.session_notes
  for each row execute function private.check_session_note();
create trigger session_notes_touch before update on public.session_notes
  for each row execute function private.touch_updated_at();
create trigger session_notes_audit after insert or update or delete on public.session_notes
  for each row execute function private.audit();

alter table public.session_notes enable row level security;
revoke all on public.session_notes from anon, authenticated;
grant select, delete on public.session_notes to authenticated;
grant insert (practice_id, patient_id, appointment_id, body) on public.session_notes to authenticated;
grant update (appointment_id, body) on public.session_notes to authenticated;
create policy session_notes_select on public.session_notes for select to authenticated
  using ((select private.is_aal2()) and (select private.owns_practice(practice_id)));
create policy session_notes_insert on public.session_notes for insert to authenticated
  with check ((select private.is_aal2()) and (select private.owns_practice(practice_id)));
create policy session_notes_update on public.session_notes for update to authenticated
  using ((select private.is_aal2()) and (select private.owns_practice(practice_id)))
  with check ((select private.owns_practice(practice_id)));
create policy session_notes_delete on public.session_notes for delete to authenticated
  using ((select private.is_aal2()) and (select private.owns_practice(practice_id)));
