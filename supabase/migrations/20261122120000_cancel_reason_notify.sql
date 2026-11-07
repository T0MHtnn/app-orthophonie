-- =============================================================================
-- Retours de Tom :
--   - la famille donne une raison quand elle annule ; l'ortho voit l'annulation
--     dans son agenda (fantôme non bloquant) et la raison en cliquant dessus ;
--   - l'ortho peut prévenir le patient d'une nouvelle séance (email + pastille
--     « Nouveau » dans l'espace famille, qui part quand la famille clique « Lu ») ;
--   - un RDV posé par l'ortho peut avoir un titre (privé, visible par l'ortho seulement).
-- =============================================================================

alter table public.appointments
  add column title text not null default '' check (char_length(title) <= 120),
  add column cancel_reason text check (char_length(cancel_reason) <= 500),
  add column cancelled_by text check (cancelled_by in ('famille', 'ortho')),
  add column family_notice boolean not null default false;

-- Création / déplacement par l'ortho : titre et notification de la famille en plus.
drop function public.save_appointment(uuid, uuid, timestamptz, timestamptz);
create function public.save_appointment(
  p_id uuid,
  p_patient_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_title text default '',
  p_notify boolean default false
)
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

  perform pg_advisory_xact_lock(hashtext(v_practice::text));
  if private.block_overlaps(v_practice, p_starts_at, p_ends_at) then
    raise exception 'Créneau bloqué' using errcode = 'P0410';
  end if;
  if exists (
    select 1 from public.appointments a
    where a.practice_id = v_practice and a.status <> 'annule'
      and (p_id is null or a.id <> p_id)
      and a.starts_at < p_ends_at and a.ends_at > p_starts_at
  ) then
    raise exception 'Créneau déjà pris' using errcode = 'P0409';
  end if;

  if p_id is null then
    insert into public.appointments (practice_id, patient_id, starts_at, ends_at, status, booked_by, title, family_notice)
    values (v_practice, p_patient_id, p_starts_at, p_ends_at, 'confirme', 'ortho', left(trim(coalesce(p_title, '')), 120), p_notify)
    returning id into v_id;
  else
    update public.appointments
    set patient_id = p_patient_id, starts_at = p_starts_at, ends_at = p_ends_at,
        title = left(trim(coalesce(p_title, '')), 120),
        family_notice = family_notice or p_notify
    where id = p_id and practice_id = v_practice and status <> 'annule'
    returning id into v_id;
    if v_id is null then
      raise exception 'Rendez-vous introuvable' using errcode = '42501';
    end if;
  end if;
  return v_id;
end;
$$;
revoke all on function public.save_appointment(uuid, uuid, timestamptz, timestamptz, text, boolean) from public, anon;
grant execute on function public.save_appointment(uuid, uuid, timestamptz, timestamptz, text, boolean) to authenticated;

-- Annulation par la famille, avec une raison (facultative).
drop function public.family_cancel_appointment(uuid);
create function public.family_cancel_appointment(p_id uuid, p_reason text default '')
returns boolean
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.appointments a
  set status = 'annule', cancelled_at = now(), cancelled_by = 'famille',
      cancel_reason = nullif(left(trim(coalesce(p_reason, '')), 500), ''), family_notice = false
  from public.patients pa, public.practices pr
  where a.id = p_id and pa.id = a.patient_id and pr.id = a.practice_id
    and pa.family_id = auth.uid() and a.status <> 'annule' and a.starts_at > now()
    and (a.status = 'a_valider' or a.starts_at >= now() + make_interval(hours => pr.booking_min_notice_hours));
  return found;
end;
$$;
revoke all on function public.family_cancel_appointment(uuid, text) from public, anon;
grant execute on function public.family_cancel_appointment(uuid, text) to authenticated;

-- Séances de la famille : + pastille « Nouveau » (séance posée par l'ortho, pas encore vue).
drop function public.my_appointments();
create function public.my_appointments()
returns table (
  id uuid,
  patient_id uuid,
  patient_first_name text,
  patient_last_name text,
  practice_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  status text,
  can_cancel boolean,
  is_new boolean
)
language sql stable security definer
set search_path = ''
as $$
  select a.id, pa.id, pa.first_name, pa.last_name, pr.name, a.starts_at, a.ends_at, a.status,
         a.starts_at > now() and (a.status = 'a_valider' or a.starts_at >= now() + make_interval(hours => pr.booking_min_notice_hours)),
         a.family_notice
  from public.appointments a
  join public.patients pa on pa.id = a.patient_id
  join public.practices pr on pr.id = a.practice_id
  where pa.family_id = auth.uid() and a.status <> 'annule' and a.starts_at > now() - interval '30 days'
  order by a.starts_at;
$$;
revoke all on function public.my_appointments() from public, anon;
grant execute on function public.my_appointments() to authenticated;

-- La famille a vu la nouvelle séance (« Lu »).
create function public.ack_appointment(p_id uuid)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.appointments a set family_notice = false
  from public.patients pa
  where a.id = p_id and pa.id = a.patient_id and pa.family_id = auth.uid();
  return found;
end;
$$;
revoke all on function public.ack_appointment(uuid) from public, anon;
grant execute on function public.ack_appointment(uuid) to authenticated;
