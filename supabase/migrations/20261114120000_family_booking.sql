-- =============================================================================
-- Planning, étape 2 : réservation en ligne par les familles.
-- Règle (Tom) : patient autonome → confirmé tout de suite ; sinon (mode « tous »)
-- → « à valider », l'ortho accepte ou refuse. Le réglage de validation séparé
-- (étape précédente) est donc supprimé.
-- Les familles ne voient jamais les rendez-vous des autres ni les titres des
-- blocages : seulement des plages occupées (début / fin).
-- =============================================================================

alter table public.practices drop column booking_validation;

-- Fenêtre horaire proposée aux familles (le planning est « ouvert sauf blocages »).
-- 7 h – 21 h, heure de Paris, comme l'agenda de l'ortho.

-- Occurrences des blocages d'un cabinet entre deux instants (début / fin seulement).
create function private.block_occurrences(p_practice uuid, p_from timestamptz, p_to timestamptz)
returns table (starts_at timestamptz, ends_at timestamptz)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  b public.schedule_blocks;
  v_first date;
  v_day date;
  v_start timestamptz;
  v_len interval;
begin
  for b in
    select * from public.schedule_blocks
    where practice_id = p_practice and schedule_blocks.starts_at < p_to
      and (until is null or until >= ((p_from at time zone 'Europe/Paris')::date - 1))
  loop
    v_first := (b.starts_at at time zone 'Europe/Paris')::date;
    v_len := b.ends_at - b.starts_at;
    for v_day in
      select d::date from generate_series(
        greatest(v_first, (p_from at time zone 'Europe/Paris')::date - 1),
        (p_to at time zone 'Europe/Paris')::date,
        interval '1 day') as d
    loop
      continue when v_day = any (b.skip_dates) or (b.until is not null and v_day > b.until);
      continue when not (
        (b.recurrence = 'none' and v_day = v_first)
        or b.recurrence = 'daily'
        or (b.recurrence = 'weekly' and (v_day - v_first) % 7 = 0)
        or (b.recurrence = 'biweekly' and (v_day - v_first) % 14 = 0)
        or (b.recurrence = 'triweekly' and (v_day - v_first) % 21 = 0)
        or (b.recurrence = 'monthly' and extract(day from v_day) = extract(day from v_first))
        or (b.recurrence = 'weekdays' and extract(isodow from v_day)::smallint = any (b.weekdays))
      );
      v_start := (v_day + (b.starts_at at time zone 'Europe/Paris')::time) at time zone 'Europe/Paris';
      if v_start < p_to and v_start + v_len > p_from then
        starts_at := v_start;
        ends_at := v_start + v_len;
        return next;
      end if;
    end loop;
  end loop;
end;
$$;
revoke all on function private.block_occurrences(uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- La famille peut-elle réserver pour ce patient ? Renvoie le cabinet, ou null.
create function private.family_can_book(p_patient_id uuid)
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select pa.practice_id
  from public.patients pa
  join public.practices pr on pr.id = pa.practice_id
  where pa.id = p_patient_id and pa.active and pa.family_id = auth.uid()
    and (pr.booking_mode = 'tous' or (pr.booking_mode = 'autonomes' and pa.autonomous));
$$;
revoke all on function private.family_can_book(uuid) from public, anon, authenticated;

-- Plages occupées du cabinet (sans aucun détail) pour la page de réservation.
create function public.booking_busy(p_patient_id uuid, p_from timestamptz, p_to timestamptz)
returns table (starts_at timestamptz, ends_at timestamptz)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_practice uuid := private.family_can_book(p_patient_id);
begin
  if v_practice is null then
    raise exception 'Réservation non autorisée' using errcode = '42501';
  end if;
  if p_to <= p_from or p_to - p_from > interval '15 days' then
    raise exception 'Période invalide' using errcode = '22023';
  end if;
  return query
    select a.starts_at, a.ends_at from public.appointments a
    where a.practice_id = v_practice and a.status <> 'annule' and a.starts_at < p_to and a.ends_at > p_from
    union all
    select o.starts_at, o.ends_at from private.block_occurrences(v_practice, p_from, p_to) o;
end;
$$;

-- Réservation par la famille. Durée = séance du cabinet. Autonome → confirmé, sinon à valider.
create function public.book_appointment(p_patient_id uuid, p_starts_at timestamptz)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  v_practice uuid := private.family_can_book(p_patient_id);
  v_minutes smallint;
  v_notice smallint;
  v_autonomous boolean;
  v_end timestamptz;
  v_local time;
  v_status text;
begin
  if v_practice is null then
    raise exception 'Réservation non autorisée' using errcode = '42501';
  end if;
  select session_minutes, booking_min_notice_hours into v_minutes, v_notice from public.practices where id = v_practice;
  select autonomous into v_autonomous from public.patients where id = p_patient_id;
  v_end := p_starts_at + make_interval(mins => v_minutes);

  if p_starts_at < now() + make_interval(hours => v_notice) then
    raise exception 'Trop tard pour réserver ce créneau' using errcode = 'P0411';
  end if;
  if p_starts_at > now() + interval '120 days' then
    raise exception 'Trop loin' using errcode = 'P0411';
  end if;
  v_local := (p_starts_at at time zone 'Europe/Paris')::time;
  if v_local < time '07:00' or (v_end at time zone 'Europe/Paris')::time > time '21:00'
     or (v_end at time zone 'Europe/Paris')::date <> (p_starts_at at time zone 'Europe/Paris')::date then
    raise exception 'Hors des heures proposées' using errcode = 'P0411';
  end if;
  if not private.hit_rate_limit('booking-user', auth.uid()::text, 10, interval '1 day') then
    raise exception 'Trop de réservations' using errcode = 'P0429';
  end if;
  -- Une seule demande en attente à la fois par patient.
  if not v_autonomous and exists (
    select 1 from public.appointments where patient_id = p_patient_id and status = 'a_valider' and starts_at > now()
  ) then
    raise exception 'Une demande est déjà en attente' using errcode = 'P0412';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_practice::text));
  if private.block_overlaps(v_practice, p_starts_at, v_end) or exists (
    select 1 from public.appointments a
    where a.practice_id = v_practice and a.status <> 'annule' and a.starts_at < v_end and a.ends_at > p_starts_at
  ) then
    raise exception 'Créneau déjà pris' using errcode = 'P0409';
  end if;

  v_status := case when v_autonomous then 'confirme' else 'a_valider' end;
  insert into public.appointments (practice_id, patient_id, starts_at, ends_at, status, booked_by)
  values (v_practice, p_patient_id, p_starts_at, v_end, v_status, 'famille');
  return v_status;
end;
$$;

-- Annulation par la famille : une demande en attente à tout moment, un RDV confirmé
-- jusqu'au délai minimum du cabinet.
create function public.family_cancel_appointment(p_id uuid)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.appointments a
  set status = 'annule', cancelled_at = now()
  from public.patients pa, public.practices pr
  where a.id = p_id and pa.id = a.patient_id and pr.id = a.practice_id
    and pa.family_id = auth.uid() and a.status <> 'annule' and a.starts_at > now()
    and (a.status = 'a_valider' or a.starts_at >= now() + make_interval(hours => pr.booking_min_notice_hours));
  return found;
end;
$$;

-- Séances des patients suivis par la famille (à venir et 30 derniers jours).
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
  can_cancel boolean
)
language sql stable security definer
set search_path = ''
as $$
  select a.id, pa.id, pa.first_name, pa.last_name, pr.name, a.starts_at, a.ends_at, a.status,
         a.starts_at > now() and (a.status = 'a_valider' or a.starts_at >= now() + make_interval(hours => pr.booking_min_notice_hours))
  from public.appointments a
  join public.patients pa on pa.id = a.patient_id
  join public.practices pr on pr.id = a.practice_id
  where pa.family_id = auth.uid() and a.status <> 'annule' and a.starts_at > now() - interval '30 days'
  order by a.starts_at;
$$;

-- Patients suivis par la famille, et ce qu'elle peut faire en ligne.
create function public.my_patients()
returns table (
  id uuid,
  first_name text,
  last_name text,
  practice_name text,
  can_book boolean,
  session_minutes smallint,
  min_notice_hours smallint
)
language sql stable security definer
set search_path = ''
as $$
  select pa.id, pa.first_name, pa.last_name, pr.name,
         pr.booking_mode = 'tous' or (pr.booking_mode = 'autonomes' and pa.autonomous),
         pr.session_minutes, pr.booking_min_notice_hours
  from public.patients pa
  join public.practices pr on pr.id = pa.practice_id
  where pa.family_id = auth.uid() and pa.active
  order by pa.first_name;
$$;

-- L'ortho accepte ou refuse une réservation en attente.
create function public.review_appointment(p_id uuid, p_accept boolean)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
begin
  if not private.is_aal2() then
    raise exception 'Double authentification requise' using errcode = '42501';
  end if;
  update public.appointments a
  set status = case when p_accept then 'confirme' else 'annule' end,
      cancelled_at = case when p_accept then null else now() end
  where a.id = p_id and a.status = 'a_valider' and private.owns_practice(a.practice_id);
  return found;
end;
$$;

revoke all on function public.booking_busy(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.booking_busy(uuid, timestamptz, timestamptz) to authenticated;
revoke all on function public.book_appointment(uuid, timestamptz) from public, anon;
grant execute on function public.book_appointment(uuid, timestamptz) to authenticated;
revoke all on function public.family_cancel_appointment(uuid) from public, anon;
grant execute on function public.family_cancel_appointment(uuid) to authenticated;
revoke all on function public.my_appointments() from public, anon;
grant execute on function public.my_appointments() to authenticated;
revoke all on function public.my_patients() from public, anon;
grant execute on function public.my_patients() to authenticated;
revoke all on function public.review_appointment(uuid, boolean) from public, anon;
grant execute on function public.review_appointment(uuid, boolean) to authenticated;
