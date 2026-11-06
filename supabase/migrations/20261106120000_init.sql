-- =============================================================================
-- Schéma initial : profils, cabinets, liste d'attente, journal d'audit.
--
-- Principes de sécurité appliqués partout :
--   1. RLS activée sur toutes les tables exposées, rien n'est lisible par défaut.
--   2. Droits retirés explicitement à anon / authenticated, puis rendus colonne
--      par colonne quand c'est nécessaire (on ne peut pas modifier son rôle,
--      son RPPS ou le statut « vérifié » d'un cabinet).
--   3. Les données de santé ne sont lisibles qu'avec une session à double
--      authentification (aal2).
--   4. Les écritures sensibles passent par des fonctions SECURITY DEFINER avec
--      search_path vide et des contrôles explicites.
--   5. Aucune donnée de santé dans le journal d'audit.
-- =============================================================================

create schema if not exists private;
revoke all on schema private from public;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('patient', 'ortho', 'admin');
create type public.waitlist_status as enum ('attente', 'contacte', 'rdv', 'retire');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'patient',
  full_name text not null default '' check (char_length(full_name) <= 120),
  created_at timestamptz not null default now()
);

create table public.pathologies (
  code text primary key check (code ~ '^[a-z0-9-]{2,40}$'),
  label text not null check (char_length(label) <= 80),
  sort_order smallint not null default 0
);

create table public.practices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 60),
  -- Numéro RPPS du praticien (11 chiffres). Vérifié manuellement par un admin avant
  -- l'ouverture de la page publique.
  rpps text not null check (rpps ~ '^[0-9]{11}$'),
  verified boolean not null default false,
  waitlist_open boolean not null default true,
  waitlist_info text not null default '' check (char_length(waitlist_info) <= 10000),
  email_template text not null default '' check (char_length(email_template) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices (id) on delete cascade,
  patient_last_name text not null check (char_length(patient_last_name) between 1 and 80),
  patient_first_name text not null check (char_length(patient_first_name) between 1 and 80),
  patient_age text not null check (char_length(patient_age) between 1 and 30),
  caregiver_last_name text check (char_length(caregiver_last_name) <= 80),
  caregiver_first_name text check (char_length(caregiver_first_name) <= 80),
  email text check (char_length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text check (phone ~ '^[0-9 +().-]{6,20}$'),
  pathology_code text not null references public.pathologies (code),
  notes text check (char_length(notes) <= 2000),
  status public.waitlist_status not null default 'attente',
  info_acknowledged_at timestamptz not null,
  consent_at timestamptz not null,
  contacted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint waitlist_contact_required check (email is not null or phone is not null)
);
create index waitlist_entries_practice_created_idx on public.waitlist_entries (practice_id, created_at);

-- Journal d'audit : qui a fait quoi, sur quel enregistrement. Jamais le contenu.
create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  action text not null,
  table_name text not null,
  record_id uuid,
  practice_id uuid
);
create index audit_log_practice_at_idx on public.audit_log (practice_id, at desc);

-- Limitation de débit (formulaire public). Schéma privé : jamais exposé par l'API.
create table private.rate_limits (
  bucket text not null,
  key_hash text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket, key_hash, window_start)
);

-- ---------------------------------------------------------------------------
-- Fonctions utilitaires (privées)
-- ---------------------------------------------------------------------------

-- Vrai si la session courante a passé la double authentification.
create function private.is_aal2() returns boolean
language sql stable
set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'aal') = 'aal2', false);
$$;

-- Vrai si l'utilisateur courant possède ce cabinet.
create function private.owns_practice(p_practice_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.practices p
    where p.id = p_practice_id and p.owner_id = auth.uid()
  );
$$;

-- Incrémente un compteur ; renvoie faux si la limite est dépassée sur la fenêtre.
create function private.hit_rate_limit(p_bucket text, p_key text, p_limit integer, p_window interval)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / extract(epoch from p_window)) * extract(epoch from p_window));
  v_hits integer;
begin
  insert into private.rate_limits as r (bucket, key_hash, window_start, hits)
  values (p_bucket, p_key, v_window, 1)
  on conflict (bucket, key_hash, window_start) do update set hits = r.hits + 1
  returning hits into v_hits;

  -- Ménage opportuniste des vieilles fenêtres.
  delete from private.rate_limits where window_start < now() - interval '2 days';
  return v_hits <= p_limit;
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_aal2() to authenticated;
grant execute on function private.owns_practice(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- Crée le profil à l'inscription. Le rôle n'est JAMAIS lu dans les métadonnées
-- envoyées par le client : tout le monde démarre « patient ».
create function private.handle_new_user() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, left(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 120));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create function private.touch_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger practices_touch before update on public.practices
  for each row execute function private.touch_updated_at();
create trigger waitlist_touch before update on public.waitlist_entries
  for each row execute function private.touch_updated_at();

-- Date de contact remplie automatiquement au passage au statut « contacté ».
create function private.waitlist_status_dates() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'contacte' and old.status is distinct from 'contacte' then
    new.contacted_at := now();
  end if;
  return new;
end;
$$;

create trigger waitlist_status_dates before update of status on public.waitlist_entries
  for each row execute function private.waitlist_status_dates();

-- Audit : une ligne par création / modification / suppression.
create function private.audit() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_row record := coalesce(new, old);
  v_practice uuid;
begin
  if tg_table_name = 'practices' then
    v_practice := v_row.id;
  else
    v_practice := v_row.practice_id;
  end if;
  insert into public.audit_log (actor_id, action, table_name, record_id, practice_id)
  values (auth.uid(), lower(tg_op), tg_table_name, v_row.id, v_practice);
  return null;
end;
$$;

create trigger practices_audit after insert or update or delete on public.practices
  for each row execute function private.audit();
create trigger waitlist_audit after insert or update or delete on public.waitlist_entries
  for each row execute function private.audit();

-- ---------------------------------------------------------------------------
-- RLS + droits
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.pathologies enable row level security;
alter table public.practices enable row level security;
alter table public.waitlist_entries enable row level security;
alter table public.audit_log enable row level security;

revoke all on public.profiles, public.pathologies, public.practices, public.waitlist_entries, public.audit_log
  from anon, authenticated;

-- Profils : chacun lit le sien et ne peut modifier que son nom.
grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;
create policy profiles_select_own on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Pathologies : liste publique.
grant select on public.pathologies to anon, authenticated;
create policy pathologies_read on public.pathologies for select to anon, authenticated using (true);

-- Cabinets : le propriétaire, en double authentification, lit et modifie
-- uniquement les champs de contenu. Création via register_practice().
grant select on public.practices to authenticated;
grant update (name, waitlist_open, waitlist_info, email_template) on public.practices to authenticated;
create policy practices_select_owner on public.practices for select to authenticated
  using (owner_id = (select auth.uid()));
create policy practices_update_owner on public.practices for update to authenticated
  using (owner_id = (select auth.uid()) and (select private.is_aal2()))
  with check (owner_id = (select auth.uid()));

-- Liste d'attente : données de santé → propriétaire du cabinet + aal2 obligatoire.
-- Insertion uniquement via submit_waitlist_entry() (serveur).
grant select, delete on public.waitlist_entries to authenticated;
grant update (status) on public.waitlist_entries to authenticated;
create policy waitlist_select_owner on public.waitlist_entries for select to authenticated
  using ((select private.is_aal2()) and (select private.owns_practice(practice_id)));
create policy waitlist_update_owner on public.waitlist_entries for update to authenticated
  using ((select private.is_aal2()) and (select private.owns_practice(practice_id)))
  with check ((select private.owns_practice(practice_id)));
create policy waitlist_delete_owner on public.waitlist_entries for delete to authenticated
  using ((select private.is_aal2()) and (select private.owns_practice(practice_id)));

-- Audit : lecture seule pour le propriétaire du cabinet ; personne ne modifie ni n'efface.
grant select on public.audit_log to authenticated;
create policy audit_select_owner on public.audit_log for select to authenticated
  using ((select private.is_aal2()) and practice_id is not null and (select private.owns_practice(practice_id)));

-- ---------------------------------------------------------------------------
-- Fonctions publiques (RPC)
-- ---------------------------------------------------------------------------

-- Création du cabinet par un compte dont l'email est confirmé. Le cabinet
-- démarre « non vérifié » : sa page publique reste fermée tant qu'un admin
-- n'a pas contrôlé le RPPS.
create function public.register_practice(p_name text, p_slug text, p_rpps text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users u where u.id = v_uid and u.email_confirmed_at is not null) then
    raise exception 'Email non confirmé' using errcode = '42501';
  end if;
  if exists (select 1 from public.practices where owner_id = v_uid) then
    raise exception 'Un cabinet existe déjà pour ce compte' using errcode = '23505';
  end if;
  if (select role from public.profiles where id = v_uid) = 'admin' then
    raise exception 'Opération interdite' using errcode = '42501';
  end if;

  insert into public.practices (owner_id, name, slug, rpps, waitlist_info, email_template)
  values (v_uid, trim(p_name), lower(trim(p_slug)), trim(p_rpps), '', '')
  returning id into v_id;

  update public.profiles set role = 'ortho' where id = v_uid;
  return v_id;
end;
$$;

revoke all on function public.register_practice(text, text, text) from public, anon;
grant execute on function public.register_practice(text, text, text) to authenticated;

-- Infos publiques d'un cabinet vérifié (nom + texte d'information). Rien d'autre.
create function public.get_public_practice(p_slug text)
returns table (name text, waitlist_info text, waitlist_open boolean)
language sql stable security definer
set search_path = ''
as $$
  select p.name, p.waitlist_info, p.waitlist_open
  from public.practices p
  where p.slug = lower(p_slug) and p.verified;
$$;

revoke all on function public.get_public_practice(text) from public;
grant execute on function public.get_public_practice(text) to anon, authenticated;

-- Inscription sur la liste d'attente. Appelée UNIQUEMENT par le serveur (clé
-- secrète), après validation et calcul d'une empreinte d'IP. Limites :
-- 5 inscriptions / heure / IP, 200 / jour / cabinet.
create function public.submit_waitlist_entry(
  p_slug text,
  p_ip_hash text,
  p_patient_last_name text,
  p_patient_first_name text,
  p_patient_age text,
  p_caregiver_last_name text,
  p_caregiver_first_name text,
  p_email text,
  p_phone text,
  p_pathology_code text,
  p_notes text
) returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  v_practice uuid;
begin
  select id into v_practice from public.practices
  where slug = lower(p_slug) and verified and waitlist_open;
  if v_practice is null then
    return false;
  end if;

  if not private.hit_rate_limit('waitlist-ip', p_ip_hash, 5, interval '1 hour') then
    raise exception 'Trop de demandes' using errcode = 'P0429';
  end if;
  if not private.hit_rate_limit('waitlist-practice', v_practice::text, 200, interval '1 day') then
    raise exception 'Trop de demandes' using errcode = 'P0429';
  end if;

  insert into public.waitlist_entries (
    practice_id, patient_last_name, patient_first_name, patient_age,
    caregiver_last_name, caregiver_first_name, email, phone,
    pathology_code, notes, info_acknowledged_at, consent_at
  ) values (
    v_practice, trim(p_patient_last_name), trim(p_patient_first_name), trim(p_patient_age),
    nullif(trim(p_caregiver_last_name), ''), nullif(trim(p_caregiver_first_name), ''),
    nullif(lower(trim(p_email)), ''), nullif(trim(p_phone), ''),
    p_pathology_code, nullif(trim(p_notes), ''), now(), now()
  );
  return true;
end;
$$;

revoke all on function public.submit_waitlist_entry(text, text, text, text, text, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_waitlist_entry(text, text, text, text, text, text, text, text, text, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- Données de référence
-- ---------------------------------------------------------------------------
insert into public.pathologies (code, label, sort_order) values
  ('langage-oral', 'Langage oral', 1),
  ('langage-ecrit', 'Langage écrit', 2),
  ('articulation', 'Articulation / parole', 3),
  ('cognition-math', 'Cognition mathématique', 4),
  ('fluence', 'Fluence (bégaiement)', 5),
  ('voix', 'Voix', 6),
  ('deglutition', 'Déglutition / oralité', 7),
  ('neurologie', 'Neurologie (adulte)', 8),
  ('autre', 'Autre / je ne sais pas', 99);
