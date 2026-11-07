-- Correction (Tom) : la limite est PAR PATIENT, pas par compte.
-- Un même compte peut inscrire Jean et Léa dans le même cabinet, mais pas Jean deux fois
-- (tant que sa demande est en attente, proposée ou suivie). L'annuaire réaffiche donc
-- les cabinets où la famille a déjà une demande.

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

create or replace function public.search_practices(p_query text)
returns table (name text, slug text, ortho_name text, address_line text, postal_code text, city text)
language sql stable security definer
set search_path = ''
as $$
  with words as (
    select w from unnest(string_to_array(private.fold(left(trim(coalesce(p_query, '')), 80)), ' ')) as w
    where w <> ''
  )
  select p.name, p.slug, pr.full_name, p.address_line, p.postal_code, p.city
  from public.practices p
  join public.profiles pr on pr.id = p.owner_id
  where p.verified and p.waitlist_open and p.listed and p.city is not null
    and p.owner_id is distinct from auth.uid()
    and not exists (
      select 1 from words
      where position(w in private.fold(p.name || ' ' || pr.full_name || ' ' || p.city || ' ' || coalesce(p.postal_code, ''))) = 0
    )
  order by p.city, p.name
  limit 50;
$$;

