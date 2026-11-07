-- Pointage des séances (choix de Tom) : une fois l'heure passée, l'ortho indique si la
-- séance a été faite ou si le patient était absent (lapin). Seules les séances « faites »
-- comptent dans l'avancement de la série.
alter table public.appointments
  add column attendance text check (attendance in ('faite', 'absent')),
  add column attendance_at timestamptz;

-- L'ortho pointe une séance de son cabinet, déjà commencée (null = annuler le pointage).
create function public.mark_attendance(p_id uuid, p_attendance text)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
begin
  if not private.is_aal2() then
    raise exception 'Double authentification requise' using errcode = '42501';
  end if;
  if p_attendance is not null and p_attendance not in ('faite', 'absent') then
    raise exception 'Valeur invalide' using errcode = '22023';
  end if;
  update public.appointments a
  set attendance = p_attendance, attendance_at = case when p_attendance is null then null else now() end
  where a.id = p_id and a.status = 'confirme' and a.starts_at <= now() and private.owns_practice(a.practice_id);
  return found;
end;
$$;
revoke all on function public.mark_attendance(uuid, text) from public, anon;
grant execute on function public.mark_attendance(uuid, text) to authenticated;
