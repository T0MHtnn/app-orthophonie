-- Les propositions de séances libérées (étape 4) respectent elles aussi le délai minimum
-- du cabinet quand la case « Appliquer aussi ce délai aux liens envoyés par email » est
-- cochée ; sinon, elles restent ouvertes jusqu'à 1 h avant la séance.

create function private.offer_cutoff(p_practice uuid) returns interval
language sql stable security definer
set search_path = ''
as $$
  select greatest(interval '1 hour',
                  case when p.links_respect_notice then make_interval(hours => p.booking_min_notice_hours) else interval '0' end)
  from public.practices p where p.id = p_practice;
$$;
revoke all on function private.offer_cutoff(uuid) from public, anon, authenticated;

create or replace function private.offer_next_wave(p_offer uuid)
returns table (email text, first_name text, practice_name text, starts_at timestamptz, token text)
language plpgsql security definer
set search_path = ''
as $$
declare
  o public.slot_offers;
  c record;
  v_token text;
  v_sent integer := 0;
begin
  select * into o from public.slot_offers where id = p_offer for update;
  if o.status <> 'ouvert' then return; end if;
  if o.starts_at < now() + private.offer_cutoff(o.practice_id) then
    update public.slot_offers set status = 'expire' where id = o.id;
    return;
  end if;
  if not private.slot_free(o.practice_id, o.starts_at, o.ends_at) then
    update public.slot_offers set status = 'annule' where id = o.id;
    return;
  end if;
  if not private.is_daytime() then return; end if; -- la nuit : on attend 8 h

  for c in
    select * from (
      select pa.id, pa.email, pa.first_name, pr.name as practice_name, pa.created_at,
             (select min(a.starts_at) from public.appointments a
              where a.patient_id = pa.id and a.status <> 'annule' and a.starts_at > now()) as next_at
      from public.patients pa
      join public.practices pr on pr.id = pa.practice_id
      where pa.practice_id = o.practice_id and pa.active and pa.email is not null
        and not exists (select 1 from public.slot_offer_recipients r where r.offer_id = o.id and r.patient_id = pa.id)
        and not exists (select 1 from public.freed_slots f where f.id = o.freed_slot_id and f.patient_id = pa.id)
    ) x
    where x.next_at is null or x.next_at > o.starts_at
    order by (x.next_at is not null), x.created_at
    limit 3
  loop
    v_token := private.new_token();
    insert into public.slot_offer_recipients (offer_id, patient_id, token_hash, wave)
    values (o.id, c.id, private.token_hash(v_token), o.wave + 1);
    v_sent := v_sent + 1;
    email := c.email; first_name := c.first_name; practice_name := c.practice_name; starts_at := o.starts_at; token := v_token;
    return next;
  end loop;

  if v_sent = 0 then
    update public.slot_offers set status = 'expire' where id = o.id;
  else
    update public.slot_offers set wave = wave + 1, next_wave_at = now() + interval '12 hours' where id = o.id;
  end if;
end;
$$;

create or replace function public.slot_offer_info(p_token text)
returns table (state text, practice_name text, patient_first_name text, starts_at timestamptz, ends_at timestamptz, moves_from timestamptz)
language sql stable security definer
set search_path = ''
as $$
  select
    case
      when r.id is null then 'invalide'
      when o.status = 'pris' then 'pris'
      when o.status <> 'ouvert' or o.starts_at < now() + private.offer_cutoff(o.practice_id)
           or not private.slot_free(o.practice_id, o.starts_at, o.ends_at) then 'expire'
      else 'ok'
    end,
    pr.name, pa.first_name, o.starts_at, o.ends_at,
    (select min(a.starts_at) from public.appointments a
     where a.patient_id = pa.id and a.status <> 'annule' and a.starts_at > o.starts_at)
  from (select 1) x
  left join public.slot_offer_recipients r on r.token_hash = private.token_hash(p_token)
  left join public.slot_offers o on o.id = r.offer_id
  left join public.patients pa on pa.id = r.patient_id
  left join public.practices pr on pr.id = o.practice_id;
$$;

create or replace function public.accept_slot_offer(p_token text)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  r public.slot_offer_recipients;
  o public.slot_offers;
  pa public.patients;
  v_move public.appointments;
begin
  select * into r from public.slot_offer_recipients where token_hash = private.token_hash(p_token);
  if r.id is null then return 'invalide'; end if;
  select * into o from public.slot_offers where id = r.offer_id for update;
  if o.status = 'pris' then return 'pris'; end if;
  if o.status <> 'ouvert' or o.starts_at < now() + private.offer_cutoff(o.practice_id) then return 'expire'; end if;
  select * into pa from public.patients where id = r.patient_id and active;
  if pa.id is null then return 'invalide'; end if;

  perform pg_advisory_xact_lock(hashtext(o.practice_id::text));
  select * into v_move from public.appointments
  where patient_id = pa.id and status <> 'annule' and starts_at > o.starts_at
  order by starts_at limit 1;
  if not private.slot_free(o.practice_id, o.starts_at, o.ends_at, v_move.id) then
    update public.slot_offers set status = 'annule' where id = o.id;
    return 'expire';
  end if;

  if v_move.id is not null then
    insert into public.freed_slots (practice_id, patient_id, starts_at, ends_at, source)
    values (o.practice_id, pa.id, v_move.starts_at, v_move.ends_at, 'avance');
    update public.appointments
    set starts_at = o.starts_at, ends_at = o.ends_at, status = 'confirme', family_notice = false
    where id = v_move.id;
  else
    insert into public.appointments (practice_id, patient_id, starts_at, ends_at, status, booked_by)
    values (o.practice_id, pa.id, o.starts_at, o.ends_at, 'confirme', 'famille');
  end if;
  update public.slot_offers set status = 'pris', taken_by = pa.id where id = o.id;
  return 'ok';
end;
$$;
