-- =============================================================================
-- Liste d'attente liée à un compte : la famille s'inscrit connectée, puis suit
-- ou retire sa demande depuis son espace.
-- L'inscription n'a plus besoin de la clé secrète du serveur : elle passe par
-- la session de l'utilisateur, avec une limitation de débit par compte.
-- =============================================================================

alter table public.waitlist_entries
  add column requester_id uuid references auth.users (id) on delete set null;

create index waitlist_entries_requester_idx on public.waitlist_entries (requester_id);

-- Une même personne ne peut pas inscrire deux fois le même patient dans le même
-- cabinet tant que la demande est en cours.
create unique index waitlist_entries_no_duplicate_idx
  on public.waitlist_entries (practice_id, requester_id, lower(patient_first_name), lower(patient_last_name))
  where status in ('attente', 'contacte');

-- Ancienne version (appelée avec la clé secrète) : supprimée.
drop function public.submit_waitlist_entry(text, text, text, text, text, text, text, text, text, text, text);

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

  if not private.hit_rate_limit('waitlist-user', v_uid::text, 5, interval '1 hour') then
    raise exception 'Trop de demandes' using errcode = 'P0429';
  end if;
  if not private.hit_rate_limit('waitlist-practice', v_practice::text, 200, interval '1 day') then
    raise exception 'Trop de demandes' using errcode = 'P0429';
  end if;

  insert into public.waitlist_entries (
    practice_id, requester_id, patient_last_name, patient_first_name, patient_age,
    caregiver_last_name, caregiver_first_name, email, phone,
    pathology_code, notes, info_acknowledged_at, consent_at
  ) values (
    v_practice, v_uid, trim(p_patient_last_name), trim(p_patient_first_name), trim(p_patient_age),
    nullif(trim(p_caregiver_last_name), ''), nullif(trim(p_caregiver_first_name), ''),
    coalesce(nullif(lower(trim(p_email)), ''), lower(v_email)), nullif(trim(p_phone), ''),
    p_pathology_code, nullif(trim(p_notes), ''), now(), now()
  );
  return true;
end;
$$;

revoke all on function public.submit_waitlist_entry(text, text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.submit_waitlist_entry(text, text, text, text, text, text, text, text, text, text) to authenticated;

-- Demandes de l'utilisateur connecté, avec le nom du cabinet et le motif.
create function public.my_waitlist_entries()
returns table (
  id uuid,
  practice_name text,
  patient_first_name text,
  patient_last_name text,
  pathology_label text,
  status public.waitlist_status,
  created_at timestamptz,
  contacted_at timestamptz
)
language sql stable security definer
set search_path = ''
as $$
  select w.id, p.name, w.patient_first_name, w.patient_last_name, pa.label, w.status, w.created_at, w.contacted_at
  from public.waitlist_entries w
  join public.practices p on p.id = w.practice_id
  join public.pathologies pa on pa.code = w.pathology_code
  where w.requester_id = auth.uid()
  order by w.created_at desc;
$$;

revoke all on function public.my_waitlist_entries() from public, anon;
grant execute on function public.my_waitlist_entries() to authenticated;

-- La famille peut retirer sa propre demande (statut « retiré »), rien d'autre.
create function public.withdraw_waitlist_entry(p_id uuid)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.waitlist_entries
  set status = 'retire'
  where id = p_id and requester_id = auth.uid() and status in ('attente', 'contacte');
  return found;
end;
$$;

revoke all on function public.withdraw_waitlist_entry(uuid) from public, anon;
grant execute on function public.withdraw_waitlist_entry(uuid) to authenticated;
