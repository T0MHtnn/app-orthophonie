-- =============================================================================
-- Planning, étapes 3 et 4 (validées avec Tom).
--
-- Étape 3 — « Proposer une place » (liste d'attente) : lien personnel (usage unique,
-- 72 h) vers les créneaux libres ; la famille choisit son 1er RDV (30 min, confirmé),
-- la demande passe « Pris en charge ». Le lien marche même en mode « moi seul·e ».
-- Le délai minimum s'applique ou non selon practices.links_respect_notice.
--
-- Étape 4 — séance libérée (annulation patient ou cabinet, ou séance avancée) :
-- récapitulatif dans le Planning, bouton « Envoyer » → proposition du créneau par
-- vagues de 3 (12 h) : d'abord les patients suivis sans prochain RDV, puis ceux qui
-- ont un RDV plus tard (leur RDV est alors avancé, et l'ancien créneau se libère à
-- son tour). Jamais la liste d'attente. Rien n'est envoyé entre 21 h et 8 h.
--
-- Annulation par l'ortho : avec une raison, gardée comme trace côté patient.
-- Liens : jetons aléatoires, seul leur empreinte SHA-256 est stockée.
-- =============================================================================

alter table public.practices add column links_respect_notice boolean not null default true;
grant update (links_respect_notice) on public.practices to authenticated;

-- Empreinte d'un jeton de lien (le jeton lui-même n'est jamais stocké).
create function private.token_hash(p_token text) returns text
language sql immutable
set search_path = ''
as $$ select encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex') $$;

-- Jeton aléatoire (2 UUID v4 : ~244 bits).
create function private.new_token() returns text
language sql volatile
set search_path = ''
as $$ select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') $$;

-- Heure de Paris entre 8 h et 21 h ?
create function private.is_daytime() returns boolean
language sql stable
set search_path = ''
as $$ select (now() at time zone 'Europe/Paris')::time between time '08:00' and time '21:00' $$;

-- Un créneau du cabinet est-il libre (ni blocage, ni RDV non annulé, sauf p_except) ?
create function private.slot_free(p_practice uuid, p_start timestamptz, p_end timestamptz, p_except uuid default null)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select not private.block_overlaps(p_practice, p_start, p_end)
     and not exists (
       select 1 from public.appointments a
       where a.practice_id = p_practice and a.status <> 'annule'
         and (p_except is null or a.id <> p_except)
         and a.starts_at < p_end and a.ends_at > p_start
     );
$$;

revoke all on function private.token_hash(text), private.new_token(), private.is_daytime(),
  private.slot_free(uuid, timestamptz, timestamptz, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Étape 3 : liens « place libérée »
-- ---------------------------------------------------------------------------
create table public.place_links (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices (id) on delete cascade,
  waitlist_entry_id uuid not null references public.waitlist_entries (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.place_links enable row level security;
revoke all on public.place_links from anon, authenticated;

-- L'ortho crée le lien en envoyant l'email « place libérée ». Renvoie le jeton (une seule fois).
create function public.create_place_link(p_entry_id uuid)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  v_practice uuid;
  v_token text := private.new_token();
begin
  if not private.is_aal2() then
    raise exception 'Double authentification requise' using errcode = '42501';
  end if;
  select practice_id into v_practice from public.waitlist_entries
  where id = p_entry_id and status in ('attente', 'contacte');
  if v_practice is null or not private.owns_practice(v_practice) then
    raise exception 'Demande introuvable' using errcode = '42501';
  end if;
  insert into public.place_links (practice_id, waitlist_entry_id, token_hash, expires_at)
  values (v_practice, p_entry_id, private.token_hash(v_token), now() + interval '72 hours');
  return v_token;
end;
$$;

-- Infos du lien (page publique /place/<jeton>). state : ok / utilise / expire / invalide.
create function public.place_link_info(p_token text)
returns table (state text, practice_name text, patient_first_name text, session_minutes smallint, min_notice_hours smallint)
language sql stable security definer
set search_path = ''
as $$
  select
    case
      when l.id is null then 'invalide'
      when l.used_at is not null or w.status not in ('attente', 'contacte') then 'utilise'
      when l.expires_at < now() then 'expire'
      else 'ok'
    end,
    p.name, w.patient_first_name, p.session_minutes,
    case when p.links_respect_notice then p.booking_min_notice_hours else 0::smallint end
  from (select 1) x
  left join public.place_links l on l.token_hash = private.token_hash(p_token)
  left join public.waitlist_entries w on w.id = l.waitlist_entry_id
  left join public.practices p on p.id = l.practice_id;
$$;

-- Plages occupées du cabinet pour la page du lien (aucun détail).
create function public.place_busy(p_token text, p_from timestamptz, p_to timestamptz)
returns table (starts_at timestamptz, ends_at timestamptz)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_practice uuid;
begin
  select l.practice_id into v_practice from public.place_links l
  where l.token_hash = private.token_hash(p_token) and l.used_at is null and l.expires_at > now();
  if v_practice is null or p_to <= p_from or p_to - p_from > interval '15 days' then
    raise exception 'Lien invalide' using errcode = '42501';
  end if;
  return query
    select a.starts_at, a.ends_at from public.appointments a
    where a.practice_id = v_practice and a.status <> 'annule' and a.starts_at < p_to and a.ends_at > p_from
    union all
    select o.starts_at, o.ends_at from private.block_occurrences(v_practice, p_from, p_to) o;
end;
$$;

-- La famille choisit son 1er RDV : 30 min (durée du cabinet), confirmé, demande « Pris en charge ».
create function public.place_book(p_token text, p_starts_at timestamptz)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  l public.place_links;
  w public.waitlist_entries;
  p public.practices;
  v_end timestamptz;
  v_patient uuid;
begin
  select * into l from public.place_links where token_hash = private.token_hash(p_token) for update;
  if l.id is null then return 'invalide'; end if;
  select * into w from public.waitlist_entries where id = l.waitlist_entry_id for update;
  if l.used_at is not null or w.status not in ('attente', 'contacte') then return 'utilise'; end if;
  if l.expires_at < now() then return 'expire'; end if;
  select * into p from public.practices where id = l.practice_id;
  v_end := p_starts_at + make_interval(mins => p.session_minutes);

  if p_starts_at < now() + make_interval(hours => case when p.links_respect_notice then p.booking_min_notice_hours else 0 end)
     or p_starts_at > now() + interval '120 days'
     or (p_starts_at at time zone 'Europe/Paris')::time < time '07:00'
     or (v_end at time zone 'Europe/Paris')::time > time '21:00'
     or (v_end at time zone 'Europe/Paris')::date <> (p_starts_at at time zone 'Europe/Paris')::date then
    return 'horaire';
  end if;

  perform pg_advisory_xact_lock(hashtext(p.id::text));
  if not private.slot_free(p.id, p_starts_at, v_end) then return 'pris'; end if;

  -- « Pris en charge » : le trigger existant crée la fiche patient.
  update public.waitlist_entries set status = 'rdv' where id = w.id;
  select id into v_patient from public.patients where waitlist_entry_id = w.id;
  insert into public.appointments (practice_id, patient_id, starts_at, ends_at, status, booked_by)
  values (p.id, v_patient, p_starts_at, v_end, 'confirme', 'famille');
  update public.place_links set used_at = now() where id = l.id;
  return 'ok';
end;
$$;

revoke all on function public.create_place_link(uuid) from public, anon;
grant execute on function public.create_place_link(uuid) to authenticated;
revoke all on function public.place_link_info(text), public.place_busy(text, timestamptz, timestamptz), public.place_book(text, timestamptz) from public;
grant execute on function public.place_link_info(text), public.place_busy(text, timestamptz, timestamptz), public.place_book(text, timestamptz) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Annulation par l'ortho, avec raison (trace gardée côté patient)
-- ---------------------------------------------------------------------------
create function public.cancel_by_ortho(p_id uuid, p_reason text default '')
returns boolean
language plpgsql security definer
set search_path = ''
as $$
begin
  if not private.is_aal2() then
    raise exception 'Double authentification requise' using errcode = '42501';
  end if;
  update public.appointments a
  set status = 'annule', cancelled_at = now(), cancelled_by = 'ortho',
      cancel_reason = nullif(left(trim(coalesce(p_reason, '')), 500), ''), family_notice = false
  where a.id = p_id and a.status <> 'annule' and private.owns_practice(a.practice_id);
  return found;
end;
$$;
revoke all on function public.cancel_by_ortho(uuid, text) from public, anon;
grant execute on function public.cancel_by_ortho(uuid, text) to authenticated;

-- Séances de la famille : + annulations récentes avec leur raison.
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
  is_new boolean,
  cancelled_by text,
  cancel_reason text
)
language sql stable security definer
set search_path = ''
as $$
  select a.id, pa.id, pa.first_name, pa.last_name, pr.name, a.starts_at, a.ends_at, a.status,
         a.status <> 'annule' and a.starts_at > now()
           and (a.status = 'a_valider' or a.starts_at >= now() + make_interval(hours => pr.booking_min_notice_hours)),
         a.family_notice, a.cancelled_by, a.cancel_reason
  from public.appointments a
  join public.patients pa on pa.id = a.patient_id
  join public.practices pr on pr.id = a.practice_id
  where pa.family_id = auth.uid() and a.starts_at > now() - interval '30 days'
    and (a.status <> 'annule' or (a.cancelled_by is not null and a.starts_at > now() - interval '7 days'))
  order by a.starts_at;
$$;
revoke all on function public.my_appointments() from public, anon;
grant execute on function public.my_appointments() to authenticated;

-- ---------------------------------------------------------------------------
-- Étape 4 : créneaux libérés et propositions
-- ---------------------------------------------------------------------------
create table public.freed_slots (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices (id) on delete cascade,
  patient_id uuid references public.patients (id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  source text not null check (source in ('patient', 'cabinet', 'avance')),
  reason text,
  -- Traité dans le récapitulatif (envoyé ou volontairement ignoré).
  handled_at timestamptz,
  created_at timestamptz not null default now()
);
create index freed_slots_practice_idx on public.freed_slots (practice_id, handled_at);

create table public.slot_offers (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices (id) on delete cascade,
  freed_slot_id uuid references public.freed_slots (id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'ouvert' check (status in ('ouvert', 'pris', 'expire', 'annule')),
  wave smallint not null default 0,
  next_wave_at timestamptz not null default now(),
  taken_by uuid references public.patients (id) on delete set null,
  created_at timestamptz not null default now()
);
create index slot_offers_open_idx on public.slot_offers (status, next_wave_at);

create table public.slot_offer_recipients (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.slot_offers (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete cascade,
  token_hash text not null unique,
  wave smallint not null,
  sent_at timestamptz not null default now(),
  unique (offer_id, patient_id)
);

alter table public.freed_slots enable row level security;
alter table public.slot_offers enable row level security;
alter table public.slot_offer_recipients enable row level security;
revoke all on public.freed_slots, public.slot_offers, public.slot_offer_recipients from anon, authenticated;
grant select on public.freed_slots, public.slot_offers to authenticated;
create policy freed_slots_owner on public.freed_slots for select to authenticated
  using ((select private.is_aal2()) and (select private.owns_practice(practice_id)));
create policy slot_offers_owner on public.slot_offers for select to authenticated
  using ((select private.is_aal2()) and (select private.owns_practice(practice_id)));

-- Toute séance à venir annulée (par le patient ou le cabinet) devient un créneau libéré.
create function private.appointment_freed() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.status = 'annule' and old.status = 'confirme' and new.cancelled_by is not null and new.starts_at > now() then
    insert into public.freed_slots (practice_id, patient_id, starts_at, ends_at, source, reason)
    values (new.practice_id, new.patient_id, new.starts_at, new.ends_at,
            case when new.cancelled_by = 'famille' then 'patient' else 'cabinet' end, new.cancel_reason);
  end if;
  return null;
end;
$$;
create trigger appointments_freed after update of status on public.appointments
  for each row execute function private.appointment_freed();

-- Vague suivante d'une proposition (3 patients). Renvoie les emails à envoyer, avec leur jeton.
-- Priorité : patients suivis sans RDV à venir, puis ceux dont le prochain RDV est plus tard.
create function private.offer_next_wave(p_offer uuid)
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
  if o.starts_at < now() + interval '1 hour' then
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

-- « Envoyer » dans le récapitulatif : crée la proposition et envoie la 1re vague (si c'est la journée).
create function public.start_slot_offer(p_freed_slot uuid)
returns table (email text, first_name text, practice_name text, starts_at timestamptz, token text)
language plpgsql security definer
set search_path = ''
as $$
declare
  f public.freed_slots;
  v_offer uuid;
begin
  if not private.is_aal2() then
    raise exception 'Double authentification requise' using errcode = '42501';
  end if;
  select * into f from public.freed_slots where id = p_freed_slot and handled_at is null;
  if f.id is null or not private.owns_practice(f.practice_id) then
    raise exception 'Créneau introuvable' using errcode = '42501';
  end if;
  update public.freed_slots set handled_at = now() where id = f.id;
  insert into public.slot_offers (practice_id, freed_slot_id, starts_at, ends_at)
  values (f.practice_id, f.id, f.starts_at, f.ends_at)
  returning id into v_offer;
  return query select * from private.offer_next_wave(v_offer);
end;
$$;

-- « Fermer » en ignorant des créneaux : ils ne réapparaissent plus dans le récapitulatif.
create function public.dismiss_freed_slots(p_ids uuid[])
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare v_count integer;
begin
  if not private.is_aal2() then
    raise exception 'Double authentification requise' using errcode = '42501';
  end if;
  update public.freed_slots f set handled_at = now()
  where f.id = any (p_ids) and f.handled_at is null and private.owns_practice(f.practice_id);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Vagues en retard (12 h écoulées, ou nuit terminée) pour le cabinet de l'ortho connectée.
create function public.advance_my_offers()
returns table (email text, first_name text, practice_name text, starts_at timestamptz, token text)
language plpgsql security definer
set search_path = ''
as $$
declare o record;
begin
  if not private.is_aal2() then return; end if;
  for o in
    select s.id from public.slot_offers s
    where s.status = 'ouvert' and s.next_wave_at <= now() and private.owns_practice(s.practice_id)
  loop
    return query select * from private.offer_next_wave(o.id);
  end loop;
end;
$$;

-- Infos d'un lien de proposition (page /creneau/<jeton>). state : ok / pris / expire / invalide.
create function public.slot_offer_info(p_token text)
returns table (state text, practice_name text, patient_first_name text, starts_at timestamptz, ends_at timestamptz, moves_from timestamptz)
language sql stable security definer
set search_path = ''
as $$
  select
    case
      when r.id is null then 'invalide'
      when o.status = 'pris' then 'pris'
      when o.status <> 'ouvert' or o.starts_at < now() + interval '1 hour'
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

-- Le patient accepte : 1er arrivé, 1er servi. Son RDV plus tard est avancé (l'ancien créneau
-- se libère et apparaît dans le récapitulatif de l'ortho), sinon un RDV est créé.
create function public.accept_slot_offer(p_token text)
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
  if o.status <> 'ouvert' or o.starts_at < now() + interval '1 hour' then return 'expire'; end if;
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

revoke all on function private.offer_next_wave(uuid), private.appointment_freed() from public, anon, authenticated;
revoke all on function public.start_slot_offer(uuid), public.dismiss_freed_slots(uuid[]), public.advance_my_offers() from public, anon;
grant execute on function public.start_slot_offer(uuid), public.dismiss_freed_slots(uuid[]), public.advance_my_offers() to authenticated;
revoke all on function public.slot_offer_info(text), public.accept_slot_offer(text) from public;
grant execute on function public.slot_offer_info(text), public.accept_slot_offer(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tâche planifiée (Vercel Cron, chaque matin) : vagues en attente de tous les cabinets.
-- Protégée par un secret dont seule l'empreinte est en base (private.app_secrets).
-- ---------------------------------------------------------------------------
create table private.app_secrets (name text primary key, hash text not null);

create function public.cron_advance_offers(p_secret text)
returns table (email text, first_name text, practice_name text, starts_at timestamptz, token text)
language plpgsql security definer
set search_path = ''
as $$
declare o record;
begin
  if not exists (select 1 from private.app_secrets where name = 'cron' and hash = private.token_hash(p_secret)) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  for o in select s.id from public.slot_offers s where s.status = 'ouvert' and s.next_wave_at <= now() loop
    return query select * from private.offer_next_wave(o.id);
  end loop;
end;
$$;
revoke all on function public.cron_advance_offers(text) from public;
grant execute on function public.cron_advance_offers(text) to anon, authenticated;
