-- Type de demande (brainstorm) : bilan seul, bilan + rééducation, rééducation seule.
-- Et : un compte orthophoniste ne peut pas s'inscrire sur une liste d'attente.

create type public.waitlist_request_type as enum ('bilan', 'bilan_reeducation', 'reeducation');

-- Demandes existantes (données fictives) : cas le plus courant.
alter table public.waitlist_entries
  add column request_type public.waitlist_request_type not null default 'bilan_reeducation';
alter table public.waitlist_entries alter column request_type drop default;

drop function public.submit_waitlist_entry(text, text, text, text, text, text, text, text, text, text);

create function public.submit_waitlist_entry(
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
  if exists (select 1 from public.profiles where id = v_uid and role = 'ortho') then
    raise exception 'Compte orthophoniste' using errcode = 'P0403';
  end if;

  select id into v_practice from public.practices
  where slug = lower(p_slug) and verified and waitlist_open;
  if v_practice is null then
    return false;
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

revoke all on function public.submit_waitlist_entry(text, text, text, text, text, text, text, text, text, public.waitlist_request_type, text) from public, anon;
grant execute on function public.submit_waitlist_entry(text, text, text, text, text, text, text, text, text, public.waitlist_request_type, text) to authenticated;

-- Le type de demande apparaît aussi dans l'espace famille.
drop function public.my_waitlist_entries();
create function public.my_waitlist_entries()
returns table (
  id uuid,
  practice_name text,
  patient_first_name text,
  patient_last_name text,
  pathology_label text,
  request_type public.waitlist_request_type,
  status public.waitlist_status,
  created_at timestamptz,
  contacted_at timestamptz
)
language sql stable security definer
set search_path = ''
as $$
  select w.id, p.name, w.patient_first_name, w.patient_last_name, pa.label, w.request_type, w.status, w.created_at, w.contacted_at
  from public.waitlist_entries w
  join public.practices p on p.id = w.practice_id
  join public.pathologies pa on pa.code = w.pathology_code
  where w.requester_id = auth.uid()
  order by w.created_at desc;
$$;

revoke all on function public.my_waitlist_entries() from public, anon;
grant execute on function public.my_waitlist_entries() to authenticated;
