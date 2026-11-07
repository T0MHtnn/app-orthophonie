-- my_patients renvoie aussi la demande de liste d'attente d'origine : le bouton
-- « Réserver une séance » s'affiche sur la ligne de cette demande dans l'espace famille.

drop function public.my_patients();
create function public.my_patients()
returns table (
  id uuid,
  first_name text,
  last_name text,
  practice_name text,
  can_book boolean,
  session_minutes smallint,
  min_notice_hours smallint,
  active_booking boolean,
  waitlist_entry_id uuid
)
language sql stable security definer
set search_path = ''
as $$
  select pa.id, pa.first_name, pa.last_name, pr.name,
         pr.booking_mode = 'tous' or (pr.booking_mode = 'autonomes' and pa.autonomous),
         pr.session_minutes, pr.booking_min_notice_hours,
         exists (
           select 1 from public.appointments a
           where a.patient_id = pa.id and a.status <> 'annule' and a.ends_at > now()
         ),
         pa.waitlist_entry_id
  from public.patients pa
  join public.practices pr on pr.id = pa.practice_id
  where pa.family_id = auth.uid() and pa.active
  order by pa.first_name;
$$;
revoke all on function public.my_patients() from public, anon;
grant execute on function public.my_patients() to authenticated;
