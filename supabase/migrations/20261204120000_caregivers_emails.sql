-- Aidants (suite) : ajout possible dès l'inscription sur la liste d'attente, et case
-- « reçoit les emails » : ces aidants reçoivent les mêmes emails que le compte du patient
-- (rappels, séances ajoutées / déplacées / annulées, validation, créneaux libérés).

alter table public.patient_caregivers add column receives_emails boolean not null default false;
grant insert (receives_emails), update (receives_emails) on public.patient_caregivers to authenticated;

-- Aidants saisis à l'inscription (4 maximum), recopiés sur la fiche à la prise en charge.
alter table public.waitlist_entries
  add column extra_caregivers jsonb not null default '[]'::jsonb
  check (jsonb_typeof(extra_caregivers) = 'array' and jsonb_array_length(extra_caregivers) <= 4);

-- Nettoie la liste reçue du formulaire : objets, champs attendus, longueurs bornées.
create function private.clean_caregivers(p jsonb) returns jsonb
language plpgsql immutable set search_path = ''
as $$
declare v jsonb := '[]'::jsonb; x jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'array' then return v; end if;
  for x in select * from jsonb_array_elements(p) loop
    exit when jsonb_array_length(v) >= 4;
    continue when jsonb_typeof(x) <> 'object' or coalesce(trim(x ->> 'first_name'), '') = '' or coalesce(trim(x ->> 'last_name'), '') = '';
    v := v || jsonb_build_array(jsonb_build_object(
      'first_name', left(trim(x ->> 'first_name'), 80),
      'last_name', left(trim(x ->> 'last_name'), 80),
      'relation', nullif(left(trim(coalesce(x ->> 'relation', '')), 60), ''),
      'phone', nullif(left(trim(coalesce(x ->> 'phone', '')), 30), ''),
      'email', nullif(lower(left(trim(coalesce(x ->> 'email', '')), 254)), ''),
      'receives_emails', (x ->> 'receives_emails') = 'true'
    ));
  end loop;
  return v;
end;
$$;

drop function public.submit_waitlist_entry(text, text, text, date, text, text, text, text, text, public.waitlist_request_type, text);

create function public.submit_waitlist_entry(
  p_slug text,
  p_patient_last_name text,
  p_patient_first_name text,
  p_birth_date date,
  p_caregiver_last_name text,
  p_caregiver_first_name text,
  p_email text,
  p_phone text,
  p_pathology_code text,
  p_request_type public.waitlist_request_type,
  p_notes text,
  p_extra_caregivers jsonb default '[]'::jsonb
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
  if p_birth_date is null or p_birth_date < '1900-01-01' or p_birth_date > current_date then
    raise exception 'Date de naissance invalide' using errcode = '22023';
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
    practice_id, requester_id, patient_last_name, patient_first_name, birth_date,
    caregiver_last_name, caregiver_first_name, email, phone,
    pathology_code, request_type, notes, info_acknowledged_at, consent_at, extra_caregivers
  ) values (
    v_practice, v_uid, trim(p_patient_last_name), trim(p_patient_first_name), p_birth_date,
    nullif(trim(p_caregiver_last_name), ''), nullif(trim(p_caregiver_first_name), ''),
    coalesce(nullif(lower(trim(p_email)), ''), lower(v_email)), nullif(trim(p_phone), ''),
    p_pathology_code, p_request_type, nullif(trim(p_notes), ''), now(), now(),
    private.clean_caregivers(p_extra_caregivers)
  );
  return true;
end;
$$;
revoke all on function public.submit_waitlist_entry(text, text, text, date, text, text, text, text, text, public.waitlist_request_type, text, jsonb) from public, anon;
grant execute on function public.submit_waitlist_entry(text, text, text, date, text, text, text, text, text, public.waitlist_request_type, text, jsonb) to authenticated;

-- Prise en charge : les aidants de l'inscription arrivent sur la fiche (une seule fois).
create or replace function private.sync_patient_from_waitlist() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare v_patient uuid; x jsonb;
begin
  if new.status = 'rdv' and old.status is distinct from 'rdv' then
    insert into public.patients (
      practice_id, waitlist_entry_id, family_id, last_name, first_name, patient_age, birth_date,
      caregiver_last_name, caregiver_first_name, email, phone, pathology_code, request_type
    ) values (
      new.practice_id, new.id, new.requester_id, new.patient_last_name, new.patient_first_name, new.patient_age, new.birth_date,
      new.caregiver_last_name, new.caregiver_first_name, new.email, new.phone, new.pathology_code, new.request_type
    )
    on conflict (waitlist_entry_id) do update set active = true
    returning id into v_patient;
    if not exists (select 1 from public.patient_caregivers where patient_id = v_patient) then
      for x in select * from jsonb_array_elements(coalesce(new.extra_caregivers, '[]'::jsonb)) loop
        begin
          insert into public.patient_caregivers (practice_id, patient_id, first_name, last_name, relation, phone, email, receives_emails)
          values (new.practice_id, v_patient, x ->> 'first_name', x ->> 'last_name', x ->> 'relation', x ->> 'phone', x ->> 'email',
                  coalesce((x ->> 'receives_emails')::boolean, false));
        exception when check_violation then null; -- téléphone mal formé : l'aidant est ignoré, pas la prise en charge
        end;
      end loop;
    end if;
  elsif old.status = 'rdv' and new.status <> 'rdv' then
    update public.patients set active = false where waitlist_entry_id = new.id;
  end if;
  return null;
end;
$$;

-- Adresses à prévenir pour un patient : son compte + les aidants qui reçoivent les emails.
create function private.patient_emails(p_patient uuid) returns setof text
language sql stable security definer set search_path = ''
as $$
  select distinct lower(e) from (
    select pa.email as e from public.patients pa where pa.id = p_patient
    union all
    select c.email from public.patient_caregivers c where c.patient_id = p_patient and c.receives_emails
  ) x
  where e is not null and e <> '';
$$;
revoke all on function private.patient_emails(uuid) from public, anon, authenticated;

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
    -- Même lien pour le compte du patient et ses aidants qui reçoivent les emails.
    first_name := c.first_name; practice_name := c.practice_name; starts_at := o.starts_at; token := v_token;
    for email in select e from private.patient_emails(c.id) e loop
      return next;
    end loop;
  end loop;

  if v_sent = 0 then
    update public.slot_offers set status = 'expire' where id = o.id;
  else
    update public.slot_offers set wave = wave + 1, next_wave_at = now() + interval '12 hours' where id = o.id;
  end if;
end;
$$;

-- Rappels de la veille : aussi aux aidants qui reçoivent les emails.
create or replace function public.cron_session_reminders(p_secret text)
returns table (email text, first_name text, practice_name text, address_line text, postal_code text, city text, starts_at timestamptz)
language plpgsql security definer
set search_path = ''
as $$
declare v_day date := (now() at time zone 'Europe/Paris')::date + 1;
begin
  if not exists (select 1 from private.app_secrets s where s.name = 'cron' and s.hash = private.token_hash(p_secret)) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  return query
  with due as (
    update public.appointments a set reminder_sent_at = now()
    from public.patients pa
    where pa.id = a.patient_id and pa.active
      and a.status = 'confirme' and a.reminder_sent_at is null
      and (a.starts_at at time zone 'Europe/Paris')::date = v_day
    returning a.patient_id, a.practice_id, a.starts_at
  )
  select e.e, pa.first_name, pr.name, pr.address_line, pr.postal_code, pr.city, d.starts_at
  from due d
  join public.patients pa on pa.id = d.patient_id
  join public.practices pr on pr.id = d.practice_id
  cross join lateral private.patient_emails(d.patient_id) as e(e)
  order by d.starts_at;
end;
$$;
