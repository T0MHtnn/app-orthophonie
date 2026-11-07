-- États d'un rendez-vous (choix de Tom) :
--   prévu       = à venir ;
--   réalisé     = heure passée (automatique) ;
--   non honoré  = l'ortho l'a marqué ainsi (lapin), modifiable à tout moment.
-- Stocké dans appointments.attendance : null (prévu / réalisé selon l'heure) ou 'absent'.
-- Un rendez-vous annulé par l'ortho est simplement supprimé de l'agenda.

-- Marquer / démarquer « non honoré » (seulement une séance déjà commencée).
create or replace function public.mark_attendance(p_id uuid, p_attendance text)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
begin
  if not private.is_aal2() then
    raise exception 'Double authentification requise' using errcode = '42501';
  end if;
  if p_attendance is not null and p_attendance <> 'absent' then
    raise exception 'Valeur invalide' using errcode = '22023';
  end if;
  update public.appointments a
  set attendance = p_attendance, attendance_at = case when p_attendance is null then null else now() end
  where a.id = p_id and a.status = 'confirme' and a.starts_at <= now() and private.owns_practice(a.practice_id);
  return found;
end;
$$;

-- Les éventuels pointages « faite » d'avant deviennent simplement « réalisé » (null).
update public.appointments set attendance = null, attendance_at = null where attendance = 'faite';

-- Suppression d'un rendez-vous par l'ortho (remplace l'annulation côté ortho).
create function public.delete_appointment(p_id uuid)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
begin
  if not private.is_aal2() then
    raise exception 'Double authentification requise' using errcode = '42501';
  end if;
  delete from public.appointments a where a.id = p_id and private.owns_practice(a.practice_id);
  return found;
end;
$$;
revoke all on function public.delete_appointment(uuid) from public, anon;
grant execute on function public.delete_appointment(uuid) to authenticated;
