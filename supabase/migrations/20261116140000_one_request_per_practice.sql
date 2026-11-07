-- Règle de Tom : avec un même compte (une adresse email), une seule demande de
-- liste d'attente par cabinet, tant qu'elle est en attente, proposée ou suivie.
-- (Une demande retirée ne compte plus.)

create or replace function public.submit_waitlist_entry(
  p_slug text,
  p_patient_last_name text,
  p_patient_first_name text,
  p_patient_age text,
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
  select id into v_practice from public.practices
  where slug = lower(p_slug) and verified and waitlist_open;
  if v_practice is null then
    return false;
  end if;
  -- Un ortho peut inscrire un proche ailleurs, jamais dans son propre cabinet.
  if exists (select 1 from public.practices where id = v_practice and owner_id = v_uid) then
    raise exception 'Propre cabinet' using errcode = 'P0403';
  end if;
  -- Un compte = une seule demande par cabinet (en attente, place proposée ou suivi).
  if private.family_known_practice(v_practice) then
    raise exception 'Demande déjà en cours dans ce cabinet' using errcode = 'P0413';
  end if;

  if not private.hit_rate_limit('waitlist-user', v_uid::text, 5, interval '1 hour') then
    raise exception 'Trop de demandes' using errcode = 'P0429';
  end if;
  if not private.hit_rate_limit('waitlist-practice', v_practice::text, 200, interval '1 day') then
    raise exception 'Trop de demandes' using errcode = 'P0429';
  end if;

  insert into public.waitlist_entries (
    practice_id, requester_id, patient_last_name, patient_first_name, patient_age,
    caregiver_last_name, caregiver_first_name, email, phone,
    pathology_code, request_type, notes, info_acknowledged_at, consent_at
  ) values (
    v_practice, v_uid, trim(p_patient_last_name), trim(p_patient_first_name), trim(p_patient_age),
    nullif(trim(p_caregiver_last_name), ''), nullif(trim(p_caregiver_first_name), ''),
    coalesce(nullif(lower(trim(p_email)), ''), lower(v_email)), nullif(trim(p_phone), ''),
    p_pathology_code, p_request_type, nullif(trim(p_notes), ''), now(), now()
  );
  return true;
end;
$$;
