-- Correctif : private.check_patient_child lisait new.document_id sur toutes les tables
-- (aidants, documents, devoirs) alors que seule « homework » a cette colonne → erreur 42703
-- à chaque dépôt de document ou ajout d'aidant. Le test du document est maintenant dans
-- un bloc à part, évalué seulement pour les devoirs.

create or replace function private.check_patient_child() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.patients p where p.id = new.patient_id and p.practice_id = new.practice_id) then
    raise exception 'Patient inconnu' using errcode = '42501';
  end if;
  if tg_table_name = 'homework' then
    if new.document_id is not null and not exists (
      select 1 from public.patient_documents d where d.id = new.document_id and d.patient_id = new.patient_id
    ) then
      raise exception 'Document inconnu' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
