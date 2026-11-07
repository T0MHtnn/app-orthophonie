-- Module Patients (étape 2) : plusieurs aidants, documents chiffrés, devoirs partagés.
-- Ortho : propriétaire du cabinet en aal2. Famille : seulement via les fonctions ci-dessous,
-- pour ses propres patients suivis (pa.family_id = auth.uid()).

-- ---------------------------------------------------------------------------
-- Aidants supplémentaires (l'aidant principal reste sur la fiche, issu de l'inscription).
-- ---------------------------------------------------------------------------
create table public.patient_caregivers (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete cascade,
  first_name text not null check (char_length(first_name) between 1 and 80),
  last_name text not null check (char_length(last_name) between 1 and 80),
  relation text check (char_length(relation) <= 60),
  phone text check (char_length(phone) <= 30),
  email text check (char_length(email) <= 254),
  created_at timestamptz not null default now()
);
create index patient_caregivers_patient_idx on public.patient_caregivers (patient_id);

-- Patient (et document lié) du même cabinet que la ligne : commun aux trois tables.
create function private.check_patient_child() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.patients p where p.id = new.patient_id and p.practice_id = new.practice_id) then
    raise exception 'Patient inconnu' using errcode = '42501';
  end if;
  if tg_table_name = 'homework' and new.document_id is not null and not exists (
    select 1 from public.patient_documents d where d.id = new.document_id and d.patient_id = new.patient_id
  ) then
    raise exception 'Document inconnu' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger patient_caregivers_check before insert or update on public.patient_caregivers
  for each row execute function private.check_patient_child();
create trigger patient_caregivers_phone before insert or update of phone on public.patient_caregivers
  for each row execute function private.check_phone_format();
create trigger patient_caregivers_audit after insert or update or delete on public.patient_caregivers
  for each row execute function private.audit();

-- ---------------------------------------------------------------------------
-- Documents : fichiers chiffrés par l'app (AES-256-GCM) avant d'être stockés.
-- Chemin : <cabinet>/<patient>/<id aléatoire>. « shared » = visible par la famille ;
-- un document déposé par la famille est toujours visible des deux.
-- ---------------------------------------------------------------------------
create table public.patient_documents (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  mime_type text not null check (char_length(mime_type) <= 100),
  size_bytes int not null check (size_bytes between 1 and 5000000),
  storage_path text not null unique check (char_length(storage_path) <= 300),
  uploaded_by text not null default 'ortho' check (uploaded_by in ('ortho', 'famille')),
  shared boolean not null default false,
  created_at timestamptz not null default now()
);
create index patient_documents_patient_idx on public.patient_documents (patient_id, created_at desc);

create trigger patient_documents_check before insert or update on public.patient_documents
  for each row execute function private.check_patient_child();
create trigger patient_documents_audit after insert or update or delete on public.patient_documents
  for each row execute function private.audit();

-- ---------------------------------------------------------------------------
-- Devoirs : exercice à faire à la maison, avec un document éventuel, coché par la famille.
-- ---------------------------------------------------------------------------
create table public.homework (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  instructions text check (char_length(instructions) <= 5000),
  document_id uuid references public.patient_documents (id) on delete set null,
  due_date date,
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index homework_patient_idx on public.homework (patient_id, created_at desc);

create trigger homework_check before insert or update on public.homework
  for each row execute function private.check_patient_child();
create trigger homework_audit after insert or update or delete on public.homework
  for each row execute function private.audit();

-- Un document joint à un devoir devient visible par la famille.
create function private.share_homework_document() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.document_id is not null then
    update public.patient_documents set shared = true where id = new.document_id and not shared;
  end if;
  return null;
end;
$$;
create trigger homework_share_document after insert or update of document_id on public.homework
  for each row execute function private.share_homework_document();

-- ---------------------------------------------------------------------------
-- RLS + droits (ortho, aal2)
-- ---------------------------------------------------------------------------
alter table public.patient_caregivers enable row level security;
alter table public.patient_documents enable row level security;
alter table public.homework enable row level security;
revoke all on public.patient_caregivers, public.patient_documents, public.homework from anon, authenticated;

grant select, delete on public.patient_caregivers, public.patient_documents, public.homework to authenticated;
grant insert (practice_id, patient_id, first_name, last_name, relation, phone, email) on public.patient_caregivers to authenticated;
grant update (first_name, last_name, relation, phone, email) on public.patient_caregivers to authenticated;
grant insert (practice_id, patient_id, name, mime_type, size_bytes, storage_path, shared) on public.patient_documents to authenticated;
grant update (name, shared) on public.patient_documents to authenticated;
grant insert (practice_id, patient_id, title, instructions, document_id, due_date) on public.homework to authenticated;
grant update (title, instructions, document_id, due_date) on public.homework to authenticated;

create policy patient_caregivers_owner on public.patient_caregivers for all to authenticated
  using ((select private.is_aal2()) and (select private.owns_practice(practice_id)))
  with check ((select private.is_aal2()) and (select private.owns_practice(practice_id)));
create policy patient_documents_owner on public.patient_documents for all to authenticated
  using ((select private.is_aal2()) and (select private.owns_practice(practice_id)))
  with check ((select private.is_aal2()) and (select private.owns_practice(practice_id)) and uploaded_by = 'ortho');
create policy homework_owner on public.homework for all to authenticated
  using ((select private.is_aal2()) and (select private.owns_practice(practice_id)))
  with check ((select private.is_aal2()) and (select private.owns_practice(practice_id)));

-- ---------------------------------------------------------------------------
-- Côté famille : fonctions limitées à ses patients suivis.
-- ---------------------------------------------------------------------------
create function public.my_documents()
returns table (id uuid, patient_id uuid, patient_first_name text, name text, mime_type text, size_bytes int, uploaded_by text, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select d.id, d.patient_id, pa.first_name, d.name, d.mime_type, d.size_bytes, d.uploaded_by, d.created_at
  from public.patient_documents d
  join public.patients pa on pa.id = d.patient_id
  where pa.family_id = auth.uid() and pa.active and (d.shared or d.uploaded_by = 'famille')
  order by d.created_at desc
  limit 300;
$$;

create function public.my_homework()
returns table (id uuid, patient_id uuid, patient_first_name text, title text, instructions text, document_id uuid, document_name text, due_date date, done_at timestamptz, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select h.id, h.patient_id, pa.first_name, h.title, h.instructions, h.document_id, d.name, h.due_date, h.done_at, h.created_at
  from public.homework h
  join public.patients pa on pa.id = h.patient_id
  left join public.patient_documents d on d.id = h.document_id
  where pa.family_id = auth.uid() and pa.active
  order by h.done_at is not null, h.created_at desc
  limit 300;
$$;

create function public.set_homework_done(p_id uuid, p_done boolean)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  update public.homework h set done_at = case when p_done then coalesce(h.done_at, now()) else null end
  from public.patients pa
  where h.id = p_id and pa.id = h.patient_id and pa.family_id = auth.uid() and pa.active;
  return found;
end;
$$;

-- Dépôt par la famille : le fichier chiffré est déjà dans le stockage (chemin du patient).
create function public.family_add_document(p_patient_id uuid, p_name text, p_mime_type text, p_size_bytes int, p_storage_path text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_practice uuid; v_id uuid;
begin
  select pa.practice_id into v_practice from public.patients pa
  where pa.id = p_patient_id and pa.family_id = auth.uid() and pa.active;
  if v_practice is null then
    raise exception 'Patient inconnu' using errcode = '42501';
  end if;
  if p_storage_path not like v_practice::text || '/' || p_patient_id::text || '/%' then
    raise exception 'Chemin invalide' using errcode = '42501';
  end if;
  if not private.hit_rate_limit('document-user', auth.uid()::text, 30, interval '1 day') then
    raise exception 'Trop de documents' using errcode = 'P0429';
  end if;
  insert into public.patient_documents (practice_id, patient_id, name, mime_type, size_bytes, storage_path, uploaded_by, shared)
  values (v_practice, p_patient_id, left(trim(p_name), 200), p_mime_type, p_size_bytes, p_storage_path, 'famille', true)
  returning id into v_id;
  return v_id;
end;
$$;

-- Chemin de stockage d'un document visible par la famille (téléchargement côté serveur).
create function public.my_document_path(p_id uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select d.storage_path from public.patient_documents d
  join public.patients pa on pa.id = d.patient_id
  where d.id = p_id and pa.family_id = auth.uid() and pa.active and (d.shared or d.uploaded_by = 'famille');
$$;
revoke all on function public.my_document_path(uuid) from public, anon;
grant execute on function public.my_document_path(uuid) to authenticated;

-- La famille peut retirer ce qu'elle a déposé (pas les documents du cabinet).
create function public.family_delete_document(p_id uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare v_path text;
begin
  delete from public.patient_documents d using public.patients pa
  where d.id = p_id and pa.id = d.patient_id and pa.family_id = auth.uid() and d.uploaded_by = 'famille'
  returning d.storage_path into v_path;
  return v_path;
end;
$$;

revoke all on function public.my_documents(), public.my_homework(), public.set_homework_done(uuid, boolean),
  public.family_add_document(uuid, text, text, int, text), public.family_delete_document(uuid) from public, anon;
grant execute on function public.my_documents(), public.my_homework(), public.set_homework_done(uuid, boolean),
  public.family_add_document(uuid, text, text, int, text), public.family_delete_document(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Stockage des fichiers (privé). Le contenu est chiffré par l'app : même lu directement,
-- un objet est illisible sans la clé du serveur.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('patient-documents', 'patient-documents', false, 5000000)
on conflict (id) do nothing;

-- Ortho : tout le dossier de son cabinet, en aal2.
create policy patient_documents_ortho on storage.objects for all to authenticated
  using (bucket_id = 'patient-documents' and (select private.is_aal2())
         and (select private.owns_practice(((storage.foldername(name))[1])::uuid)))
  with check (bucket_id = 'patient-documents' and (select private.is_aal2())
              and (select private.owns_practice(((storage.foldername(name))[1])::uuid)));

-- Famille : dépôt dans le dossier de son patient suivi…
create policy patient_documents_family_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'patient-documents' and exists (
    select 1 from public.patients pa
    where pa.family_id = (select auth.uid()) and pa.active
      and pa.practice_id::text = (storage.foldername(name))[1] and pa.id::text = (storage.foldername(name))[2]
  ));
-- … lecture des documents visibles par elle, suppression de ses propres dépôts.
create policy patient_documents_family_select on storage.objects for select to authenticated
  using (bucket_id = 'patient-documents' and exists (
    select 1 from public.patient_documents d join public.patients pa on pa.id = d.patient_id
    where d.storage_path = name and pa.family_id = (select auth.uid()) and pa.active and (d.shared or d.uploaded_by = 'famille')
  ));
create policy patient_documents_family_delete on storage.objects for delete to authenticated
  using (bucket_id = 'patient-documents' and (storage.foldername(name))[2] in (
    select pa.id::text from public.patients pa where pa.family_id = (select auth.uid())
  ) and not exists (select 1 from public.patient_documents d where d.storage_path = name));

-- my_patients renvoie aussi le cabinet (chemin de stockage des documents déposés par la famille).
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
  waitlist_entry_id uuid,
  practice_id uuid
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
         pa.waitlist_entry_id, pa.practice_id
  from public.patients pa
  join public.practices pr on pr.id = pa.practice_id
  where pa.family_id = auth.uid() and pa.active
  order by pa.first_name;
$$;
revoke all on function public.my_patients() from public, anon;
grant execute on function public.my_patients() to authenticated;
