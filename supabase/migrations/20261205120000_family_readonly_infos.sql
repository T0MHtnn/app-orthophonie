-- Règle de Tom : la famille ne modifie jamais les informations personnelles (nom, prénom,
-- date de naissance) ; seule l'ortho le fait. Elle les voit en lecture seule dans Réglages.

-- Infos des patients suivis, en lecture seule pour la famille.
create function public.my_patient_infos()
returns table (id uuid, first_name text, last_name text, birth_date date, patient_age text, practice_name text)
language sql stable security definer set search_path = ''
as $$
  select pa.id, pa.first_name, pa.last_name, pa.birth_date, pa.patient_age, pr.name
  from public.patients pa
  join public.practices pr on pr.id = pa.practice_id
  where pa.family_id = auth.uid() and pa.active
  order by pa.first_name;
$$;
revoke all on function public.my_patient_infos() from public, anon;
grant execute on function public.my_patient_infos() to authenticated;

-- Nom et prénom d'un compte famille : figés après l'inscription (l'ortho garde la main sur les siens).
create function private.lock_family_names() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if old.role = 'patient' and auth.uid() is not null
     and (new.first_name is distinct from old.first_name or new.last_name is distinct from old.last_name) then
    raise exception 'Informations modifiables par l''orthophoniste uniquement' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger profiles_lock_family_names before update of first_name, last_name on public.profiles
  for each row execute function private.lock_family_names();
