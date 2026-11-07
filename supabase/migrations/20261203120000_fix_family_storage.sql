-- Correctif : les règles « famille » du stockage lisaient public.patients et
-- public.patient_documents, eux-mêmes protégés par la RLS (visibles de l'ortho seulement).
-- Pour une famille, la vérification ne trouvait donc rien : téléchargement et dépôt refusés.
-- Les contrôles passent par des fonctions security definer, limitées à auth.uid().

-- Dossier <cabinet>/<patient>/… d'un patient suivi par la famille connectée.
create function private.family_owns_path(p_name text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.patients pa
    where pa.family_id = auth.uid() and pa.active
      and pa.practice_id::text = (storage.foldername(p_name))[1]
      and pa.id::text = (storage.foldername(p_name))[2]
  );
$$;

-- Fichier d'un document visible par la famille (partagé, ou déposé par elle).
create function private.family_can_read_object(p_name text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.patient_documents d
    join public.patients pa on pa.id = d.patient_id
    where d.storage_path = p_name and pa.family_id = auth.uid() and pa.active
      and (d.shared or d.uploaded_by = 'famille')
  );
$$;

-- Fichier sans document associé (dépôt annulé, ou document retiré par la famille).
create function private.object_is_orphan(p_name text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select not exists (select 1 from public.patient_documents d where d.storage_path = p_name);
$$;

revoke all on function private.family_owns_path(text), private.family_can_read_object(text), private.object_is_orphan(text) from public, anon;
grant execute on function private.family_owns_path(text), private.family_can_read_object(text), private.object_is_orphan(text) to authenticated;

drop policy patient_documents_family_insert on storage.objects;
drop policy patient_documents_family_select on storage.objects;
drop policy patient_documents_family_delete on storage.objects;

create policy patient_documents_family_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'patient-documents' and private.family_owns_path(name));
-- Lecture : ses documents visibles, et ses fichiers orphelins (nécessaire pour les effacer :
-- une suppression doit aussi passer la règle de lecture). Contenu chiffré de toute façon.
create policy patient_documents_family_select on storage.objects for select to authenticated
  using (bucket_id = 'patient-documents' and (
    private.family_can_read_object(name) or (private.family_owns_path(name) and private.object_is_orphan(name))
  ));
create policy patient_documents_family_delete on storage.objects for delete to authenticated
  using (bucket_id = 'patient-documents' and private.family_owns_path(name) and private.object_is_orphan(name));
