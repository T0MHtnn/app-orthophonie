-- =============================================================================
-- Planning, étape 1 : agenda de l'orthophoniste.
--   - fiche patient minimale, créée automatiquement à « Pris en charge » ;
--   - horaires d'ouverture de la semaine (récurrents) ;
--   - fermetures / ouvertures ponctuelles ;
--   - rendez-vous posés, déplacés, annulés par l'ortho (sans chevauchement).
-- Données de santé : lecture réservée au propriétaire du cabinet en aal2.
-- Heures d'ouverture en heure locale (Europe/Paris), rendez-vous en timestamptz.
-- =============================================================================

-- Durée de séance proposée par défaut dans l'agenda.
alter table public.practices
  add column session_minutes smallint not null default 30 check (session_minutes between 10 and 180);
grant update (session_minutes) on public.practices to authenticated;

-- ---------------------------------------------------------------------------
-- Patients suivis
-- ---------------------------------------------------------------------------
create table public.patients (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices (id) on delete cascade,
  -- Demande de liste d'attente d'origine (null si supprimée ou patient créé à la main plus tard).
  waitlist_entry_id uuid unique references public.waitlist_entries (id) on delete set null,
  -- Compte famille qui suit ce patient (espace patient, réservation en ligne).
  family_id uuid references auth.users (id) on delete set null,
  last_name text not null check (char_length(last_name) between 1 and 80),
  first_name text not null check (char_length(first_name) between 1 and 80),
  patient_age text check (char_length(patient_age) <= 30),
  caregiver_last_name text check (char_length(caregiver_last_name) <= 80),
  caregiver_first_name text check (char_length(caregiver_first_name) <= 80),
  email text check (char_length(email) <= 254),
  phone text check (char_length(phone) <= 30),
  pathology_code text references public.pathologies (code),
  request_type public.waitlist_request_type,
  -- Patient autorisé à réserver seul en ligne (étape 2).
  autonomous boolean not null default false,
  -- false quand la prise en charge est annulée (retour en liste d'attente).
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index patients_practice_idx on public.patients (practice_id);
create index patients_family_idx on public.patients (family_id);

-- ---------------------------------------------------------------------------
-- Horaires et exceptions
-- ---------------------------------------------------------------------------
create table public.opening_hours (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices (id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7), -- 1 = lundi (ISO)
  starts_at time not null,
  ends_at time not null,
  check (ends_at > starts_at)
);
create index opening_hours_practice_idx on public.opening_hours (practice_id, weekday);

create table public.schedule_exceptions (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices (id) on delete cascade,
  kind text not null check (kind in ('ferme', 'ouvert')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  label text not null default '' check (char_length(label) <= 120),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index schedule_exceptions_practice_idx on public.schedule_exceptions (practice_id, starts_at);

-- ---------------------------------------------------------------------------
-- Rendez-vous
-- ---------------------------------------------------------------------------
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'confirme' check (status in ('confirme', 'a_valider', 'annule')),
  booked_by text not null default 'ortho' check (booked_by in ('ortho', 'famille')),
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at and ends_at - starts_at <= interval '4 hours')
);
create index appointments_practice_time_idx on public.appointments (practice_id, starts_at);
create index appointments_patient_idx on public.appointments (patient_id);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create trigger patients_touch before update on public.patients
  for each row execute function private.touch_updated_at();
create trigger appointments_touch before update on public.appointments
  for each row execute function private.touch_updated_at();

create trigger patients_audit after insert or update or delete on public.patients
  for each row execute function private.audit();
create trigger appointments_audit after insert or update or delete on public.appointments
  for each row execute function private.audit();
create trigger opening_hours_audit after insert or update or delete on public.opening_hours
  for each row execute function private.audit();
create trigger schedule_exceptions_audit after insert or update or delete on public.schedule_exceptions
  for each row execute function private.audit();

-- « Pris en charge » sur la liste d'attente → fiche patient (ou réactivation).
-- Retour à un autre statut → fiche désactivée (gardée pour l'historique).
create function private.sync_patient_from_waitlist() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.status = 'rdv' and old.status is distinct from 'rdv' then
    insert into public.patients (
      practice_id, waitlist_entry_id, family_id, last_name, first_name, patient_age,
      caregiver_last_name, caregiver_first_name, email, phone, pathology_code, request_type
    ) values (
      new.practice_id, new.id, new.requester_id, new.patient_last_name, new.patient_first_name, new.patient_age,
      new.caregiver_last_name, new.caregiver_first_name, new.email, new.phone, new.pathology_code, new.request_type
    )
    on conflict (waitlist_entry_id) do update set active = true;
  elsif old.status = 'rdv' and new.status <> 'rdv' then
    update public.patients set active = false where waitlist_entry_id = new.id;
  end if;
  return null;
end;
$$;

create trigger waitlist_sync_patient after update of status on public.waitlist_entries
  for each row execute function private.sync_patient_from_waitlist();

-- Patients déjà « Pris en charge » avant cette migration.
insert into public.patients (
  practice_id, waitlist_entry_id, family_id, last_name, first_name, patient_age,
  caregiver_last_name, caregiver_first_name, email, phone, pathology_code, request_type
)
select practice_id, id, requester_id, patient_last_name, patient_first_name, patient_age,
       caregiver_last_name, caregiver_first_name, email, phone, pathology_code, request_type
from public.waitlist_entries
where status = 'rdv'
on conflict (waitlist_entry_id) do nothing;

-- ---------------------------------------------------------------------------
-- RLS + droits
-- ---------------------------------------------------------------------------
alter table public.patients enable row level security;
alter table public.opening_hours enable row level security;
alter table public.schedule_exceptions enable row level security;
alter table public.appointments enable row level security;

revoke all on public.patients, public.opening_hours, public.schedule_exceptions, public.appointments
  from anon, authenticated;

-- Patients : lecture + case « autonome » par le propriétaire en aal2. Création par trigger uniquement.
grant select on public.patients to authenticated;
grant update (autonomous) on public.patients to authenticated;
create policy patients_select_owner on public.patients for select to authenticated
  using ((select private.is_aal2()) and (select private.owns_practice(practice_id)));
create policy patients_update_owner on public.patients for update to authenticated
  using ((select private.is_aal2()) and (select private.owns_practice(practice_id)))
  with check ((select private.owns_practice(practice_id)));

-- Horaires et exceptions : gérés directement par le propriétaire en aal2.
grant select, delete on public.opening_hours, public.schedule_exceptions to authenticated;
grant insert (practice_id, weekday, starts_at, ends_at) on public.opening_hours to authenticated;
grant insert (practice_id, kind, starts_at, ends_at, label) on public.schedule_exceptions to authenticated;

create policy opening_hours_owner_select on public.opening_hours for select to authenticated
  using ((select private.is_aal2()) and (select private.owns_practice(practice_id)));
create policy opening_hours_owner_insert on public.opening_hours for insert to authenticated
  with check ((select private.is_aal2()) and (select private.owns_practice(practice_id)));
create policy opening_hours_owner_delete on public.opening_hours for delete to authenticated
  using ((select private.is_aal2()) and (select private.owns_practice(practice_id)));

create policy schedule_exceptions_owner_select on public.schedule_exceptions for select to authenticated
  using ((select private.is_aal2()) and (select private.owns_practice(practice_id)));
create policy schedule_exceptions_owner_insert on public.schedule_exceptions for insert to authenticated
  with check ((select private.is_aal2()) and (select private.owns_practice(practice_id)));
create policy schedule_exceptions_owner_delete on public.schedule_exceptions for delete to authenticated
  using ((select private.is_aal2()) and (select private.owns_practice(practice_id)));

-- Rendez-vous : lecture par le propriétaire en aal2 ; écritures via les fonctions ci-dessous.
grant select on public.appointments to authenticated;
create policy appointments_select_owner on public.appointments for select to authenticated
  using ((select private.is_aal2()) and (select private.owns_practice(practice_id)));

-- ---------------------------------------------------------------------------
-- Fonctions (écritures des rendez-vous)
-- ---------------------------------------------------------------------------

-- Crée (p_id null) ou déplace un rendez-vous. Refuse un chevauchement avec un
-- autre rendez-vous non annulé du cabinet (P0409).
create function public.save_appointment(p_id uuid, p_patient_id uuid, p_starts_at timestamptz, p_ends_at timestamptz)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_practice uuid;
  v_id uuid;
begin
  if not private.is_aal2() then
    raise exception 'Double authentification requise' using errcode = '42501';
  end if;
  select practice_id into v_practice from public.patients where id = p_patient_id and active;
  if v_practice is null or not private.owns_practice(v_practice) then
    raise exception 'Patient introuvable' using errcode = '42501';
  end if;
  if p_ends_at <= p_starts_at or p_ends_at - p_starts_at > interval '4 hours' then
    raise exception 'Durée invalide' using errcode = '22023';
  end if;

  -- Un seul enregistrement à la fois par cabinet : pas de double réservation.
  perform pg_advisory_xact_lock(hashtext(v_practice::text));
  if exists (
    select 1 from public.appointments a
    where a.practice_id = v_practice and a.status <> 'annule'
      and (p_id is null or a.id <> p_id)
      and a.starts_at < p_ends_at and a.ends_at > p_starts_at
  ) then
    raise exception 'Créneau déjà pris' using errcode = 'P0409';
  end if;

  if p_id is null then
    insert into public.appointments (practice_id, patient_id, starts_at, ends_at, status, booked_by)
    values (v_practice, p_patient_id, p_starts_at, p_ends_at, 'confirme', 'ortho')
    returning id into v_id;
  else
    update public.appointments
    set patient_id = p_patient_id, starts_at = p_starts_at, ends_at = p_ends_at
    where id = p_id and practice_id = v_practice and status <> 'annule'
    returning id into v_id;
    if v_id is null then
      raise exception 'Rendez-vous introuvable' using errcode = '42501';
    end if;
  end if;
  return v_id;
end;
$$;

create function public.cancel_appointment(p_id uuid)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
begin
  if not private.is_aal2() then
    raise exception 'Double authentification requise' using errcode = '42501';
  end if;
  update public.appointments a
  set status = 'annule', cancelled_at = now()
  where a.id = p_id and a.status <> 'annule' and private.owns_practice(a.practice_id);
  return found;
end;
$$;

revoke all on function public.save_appointment(uuid, uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.save_appointment(uuid, uuid, timestamptz, timestamptz) to authenticated;
revoke all on function public.cancel_appointment(uuid) from public, anon;
grant execute on function public.cancel_appointment(uuid) to authenticated;
