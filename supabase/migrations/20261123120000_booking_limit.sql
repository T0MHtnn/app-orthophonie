-- Limite anti-abus des réservations en ligne : 10 → 30 réservations réussies par compte
-- et par jour (la règle « une seule séance à venir par patient » freine déjà les abus ;
-- 10 se faisait atteindre pendant les tests).

create or replace function public.book_appointment(p_patient_id uuid, p_starts_at timestamptz)
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
  v_status text;
begin
  if v_practice is null then
    raise exception 'Réservation non autorisée' using errcode = '42501';
  end if;
  select session_minutes, booking_min_notice_hours into v_minutes, v_notice from public.practices where id = v_practice;
  select autonomous into v_autonomous from public.patients where id = p_patient_id;
  v_end := p_starts_at + make_interval(mins => v_minutes);

  if p_starts_at < now() + make_interval(hours => v_notice) or p_starts_at > now() + interval '120 days' then
    raise exception 'Trop tard ou trop loin' using errcode = 'P0411';
  end if;
  if (p_starts_at at time zone 'Europe/Paris')::time < time '07:00'
     or (v_end at time zone 'Europe/Paris')::time > time '21:00'
     or (v_end at time zone 'Europe/Paris')::date <> (p_starts_at at time zone 'Europe/Paris')::date then
    raise exception 'Hors des heures proposées' using errcode = 'P0411';
  end if;
  if not private.hit_rate_limit('booking-user', auth.uid()::text, 30, interval '1 day') then
    raise exception 'Trop de réservations' using errcode = 'P0429';
  end if;
  if exists (
    select 1 from public.appointments
    where patient_id = p_patient_id and status <> 'annule' and ends_at > now()
  ) then
    raise exception 'Une réservation est déjà active' using errcode = 'P0412';
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
