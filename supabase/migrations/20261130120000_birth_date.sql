-- Date de naissance plutôt qu'âge (règle de Tom) : demandée à l'inscription sur la liste
-- d'attente, recopiée sur la fiche patient (modifiable par l'ortho), l'âge est calculé
-- à l'affichage. Les anciennes demandes gardent leur âge texte (patient_age) en secours.

alter table public.waitlist_entries
  add column birth_date date check (birth_date >= '1900-01-01'),
  alter column patient_age drop not null;

drop function public.submit_waitlist_entry(text, text, text, text, text, text, text, text, text, public.waitlist_request_type, text);

create function public.submit_waitlist_entry(
  p_slug text,
  p_patient_last_name text,
  p_patient_first_name text,
  p_birth_date date,
  p_caregiver_last_name text,
  p_caregiver_first_name text,
  p_email text,
  p_phone text,
  p_pathology_code text,
  p_request_type public.waitlist_request_type,
  p_notes text
) returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_practice uuid;
begin
  if v_uid is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;
  select u.email into v_email from auth.users u where u.id = v_uid and u.email_confirmed_at is not null;
  if v_email is null then
    raise exception 'Email non confirmé' using errcode = '42501';
  end if;
  if p_birth_date is null or p_birth_date < '1900-01-01' or p_birth_date > current_date then
    raise exception 'Date de naissance invalide' using errcode = '22023';
  end if;
  select id into v_practice from public.practices
  where slug = lower(p_slug) and verified and waitlist_open;
  if v_practice is null then
    return false;
  end if;
  -- Un ortho peut inscrire un proche ailleurs, jamais dans son propre cabinet.
  if exists (select 1 from public.practices where id = v_practice and owner_id = v_uid) then
    raise exception 'Propre cabinet' using errcode = 'P0403';
  end if;
  -- Un même compte ne peut inscrire qu'une fois le même patient dans un cabinet tant que
  -- la demande est en attente, proposée ou suivie (un autre patient reste possible).
  if exists (
    select 1 from public.waitlist_entries w
    where w.practice_id = v_practice and w.requester_id = v_uid and w.status in ('attente', 'contacte', 'rdv')
      and lower(trim(w.patient_first_name)) = lower(trim(p_patient_first_name))
      and lower(trim(w.patient_last_name)) = lower(trim(p_patient_last_name))
  ) then
    raise exception 'Patient déjà inscrit dans ce cabinet' using errcode = '23505';
  end if;

  if not private.hit_rate_limit('waitlist-user', v_uid::text, 5, interval '1 hour') then
    raise exception 'Trop de demandes' using errcode = 'P0429';
  end if;
  if not private.hit_rate_limit('waitlist-practice', v_practice::text, 200, interval '1 day') then
    raise exception 'Trop de demandes' using errcode = 'P0429';
  end if;

  insert into public.waitlist_entries (
    practice_id, requester_id, patient_last_name, patient_first_name, birth_date,
    caregiver_last_name, caregiver_first_name, email, phone,
    pathology_code, request_type, notes, info_acknowledged_at, consent_at
  ) values (
    v_practice, v_uid, trim(p_patient_last_name), trim(p_patient_first_name), p_birth_date,
    nullif(trim(p_caregiver_last_name), ''), nullif(trim(p_caregiver_first_name), ''),
    coalesce(nullif(lower(trim(p_email)), ''), lower(v_email)), nullif(trim(p_phone), ''),
    p_pathology_code, p_request_type, nullif(trim(p_notes), ''), now(), now()
  );
  return true;
end;
$$;
revoke all on function public.submit_waitlist_entry(text, text, text, date, text, text, text, text, text, public.waitlist_request_type, text) from public, anon;
grant execute on function public.submit_waitlist_entry(text, text, text, date, text, text, text, text, text, public.waitlist_request_type, text) to authenticated;

-- Fiche patient créée à « Pris en charge » : la date de naissance suit.
create or replace function private.sync_patient_from_waitlist() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.status = 'rdv' and old.status is distinct from 'rdv' then
    insert into public.patients (
      practice_id, waitlist_entry_id, family_id, last_name, first_name, patient_age, birth_date,
      caregiver_last_name, caregiver_first_name, email, phone, pathology_code, request_type
    ) values (
      new.practice_id, new.id, new.requester_id, new.patient_last_name, new.patient_first_name, new.patient_age, new.birth_date,
      new.caregiver_last_name, new.caregiver_first_name, new.email, new.phone, new.pathology_code, new.request_type
    )
    on conflict (waitlist_entry_id) do update set active = true;
  elsif old.status = 'rdv' and new.status <> 'rdv' then
    update public.patients set active = false where waitlist_entry_id = new.id;
  end if;
  return null;
end;
$$;
