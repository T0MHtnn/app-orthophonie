-- =============================================================================
-- Planning : « tout est ouvert sauf ce que l'ortho bloque ».
-- Les horaires d'ouverture et exceptions (étape 1) sont remplacés par des
-- blocages posés en cliquant sur l'agenda, avec répétition possible.
-- Ni l'ortho ni (plus tard) les familles ne peuvent poser un RDV sur un blocage.
-- =============================================================================

drop table public.opening_hours;
drop table public.schedule_exceptions;

create table public.schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices (id) on delete cascade,
  title text not null default '' check (char_length(title) <= 120),
  -- Première occurrence (heure de Paris). Les suivantes gardent la même heure locale.
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  recurrence text not null default 'none'
    check (recurrence in ('none', 'daily', 'weekly', 'biweekly', 'triweekly', 'monthly', 'weekdays')),
  -- Pour « weekdays » : jours ISO (1 = lundi … 7 = dimanche).
  weekdays smallint[] not null default '{}' check (weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]),
  -- Dernier jour de répétition (inclus), null = sans fin.
  until date,
  -- Jours où l'occurrence a été supprimée ou remplacée (« ce jour seulement »).
  skip_dates date[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at and ends_at - starts_at <= interval '24 hours'),
  check (recurrence <> 'weekdays' or cardinality(weekdays) > 0)
);
create index schedule_blocks_practice_idx on public.schedule_blocks (practice_id, starts_at);

create trigger schedule_blocks_touch before update on public.schedule_blocks
  for each row execute function private.touch_updated_at();
create trigger schedule_blocks_audit after insert or update or delete on public.schedule_blocks
  for each row execute function private.audit();

alter table public.schedule_blocks enable row level security;
revoke all on public.schedule_blocks from anon, authenticated;
grant select, delete on public.schedule_blocks to authenticated;
grant insert (practice_id, title, starts_at, ends_at, recurrence, weekdays, until, skip_dates) on public.schedule_blocks to authenticated;
grant update (title, starts_at, ends_at, recurrence, weekdays, until, skip_dates) on public.schedule_blocks to authenticated;

create policy schedule_blocks_owner_select on public.schedule_blocks for select to authenticated
  using ((select private.is_aal2()) and (select private.owns_practice(practice_id)));
create policy schedule_blocks_owner_insert on public.schedule_blocks for insert to authenticated
  with check ((select private.is_aal2()) and (select private.owns_practice(practice_id)));
create policy schedule_blocks_owner_update on public.schedule_blocks for update to authenticated
  using ((select private.is_aal2()) and (select private.owns_practice(practice_id)))
  with check ((select private.owns_practice(practice_id)));
create policy schedule_blocks_owner_delete on public.schedule_blocks for delete to authenticated
  using ((select private.is_aal2()) and (select private.owns_practice(practice_id)));

-- Vrai si un blocage du cabinet chevauche [p_start, p_end[. Les occurrences sont
-- recalculées jour par jour en heure de Paris (même règle que lib/agenda.ts).
create function private.block_overlaps(p_practice uuid, p_start timestamptz, p_end timestamptz)
returns boolean
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
    where practice_id = p_practice and starts_at < p_end
      and (until is null or until >= ((p_start at time zone 'Europe/Paris')::date - 1))
  loop
    v_first := (b.starts_at at time zone 'Europe/Paris')::date;
    v_len := b.ends_at - b.starts_at;
    for v_day in
      select d::date from generate_series(
        greatest(v_first, (p_start at time zone 'Europe/Paris')::date - 1),
        (p_end at time zone 'Europe/Paris')::date,
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
      if v_start < p_end and v_start + v_len > p_start then
        return true;
      end if;
    end loop;
  end loop;
  return false;
end;
$$;
revoke all on function private.block_overlaps(uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- Rendez-vous : refuse aussi un créneau bloqué (P0410).
create or replace function public.save_appointment(p_id uuid, p_patient_id uuid, p_starts_at timestamptz, p_ends_at timestamptz)
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
