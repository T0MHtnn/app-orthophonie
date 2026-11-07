-- Planning (fin) : rappel par email la veille de chaque séance confirmée.
-- Envoyé par la tâche du matin (/api/taches) ; une seule fois par séance,
-- à nouveau si la séance est déplacée.

alter table public.appointments add column reminder_sent_at timestamptz;

create function private.reset_reminder() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.starts_at is distinct from old.starts_at then
    new.reminder_sent_at := null;
  end if;
  return new;
end;
$$;
create trigger appointments_reset_reminder before update of starts_at on public.appointments
  for each row execute function private.reset_reminder();

-- Séances confirmées du lendemain (jour de Paris), patients actifs avec un email.
-- Marque les séances comme rappelées et renvoie de quoi écrire l'email (aucune donnée médicale).
create function public.cron_session_reminders(p_secret text)
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
    where pa.id = a.patient_id and pa.active and pa.email is not null
      and a.status = 'confirme' and a.reminder_sent_at is null
      and (a.starts_at at time zone 'Europe/Paris')::date = v_day
    returning a.patient_id, a.practice_id, a.starts_at
  )
  select pa.email, pa.first_name, pr.name, pr.address_line, pr.postal_code, pr.city, d.starts_at
  from due d
  join public.patients pa on pa.id = d.patient_id
  join public.practices pr on pr.id = d.practice_id
  order by d.starts_at;
end;
$$;
revoke all on function public.cron_session_reminders(text) from public;
grant execute on function public.cron_session_reminders(text) to anon, authenticated;

-- Adresse du cabinet obligatoire (rue comprise) : elle figure dans les rappels.
-- Trigger plutôt que check : les cabinets existants sans rue ne sont bloqués
-- que lorsqu'ils modifient leur adresse (Réglages), pas pour le reste.
create function private.require_practice_address() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if coalesce(trim(new.address_line), '') = '' then
    raise exception 'Adresse du cabinet requise' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger practices_require_address before insert or update of address_line on public.practices
  for each row execute function private.require_practice_address();
