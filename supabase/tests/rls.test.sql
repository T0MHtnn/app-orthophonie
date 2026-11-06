-- Tests de sécurité de la base. Chaque bloc lève une exception si une règle est violée.
\set ON_ERROR_STOP on
set client_min_messages = warning;

-- Deux orthos (A vérifiée, B non) et un patient.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com', now(), '{"full_name":"Ortho A","role":"admin"}'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com', now(), '{}'),
  ('00000000-0000-0000-0000-00000000000c', 'c@example.com', null, '{}');

create function pg_temp.as_user(p_uid text, p_aal text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal)::text, false);
$$;

-- 1. Le rôle demandé dans les métadonnées est ignoré.
do $$ begin
  if (select role from public.profiles where id = '00000000-0000-0000-0000-00000000000a') <> 'patient' then
    raise exception 'ÉCHEC 1 : le rôle des métadonnées a été pris en compte';
  end if;
end $$;

-- 2. Création de cabinet : OK si email confirmé, refusé sinon.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a', 'aal1');
set role authenticated;
select public.register_practice('Cabinet A', 'cabinet-a', '10000000001');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b', 'aal1');
set role authenticated;
select public.register_practice('Cabinet B', 'cabinet-b', '10000000002');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c', 'aal1');
set role authenticated;
do $$ begin
  perform public.register_practice('Cabinet C', 'cabinet-c', '10000000003');
  raise exception 'ÉCHEC 2 : cabinet créé sans email confirmé';
exception when insufficient_privilege then null;
end $$;
reset role;

-- 3. Un utilisateur ne peut pas se donner le rôle admin ni vérifier son cabinet.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a', 'aal2');
set role authenticated;
do $$ begin
  update public.profiles set role = 'admin' where id = auth.uid();
  raise exception 'ÉCHEC 3a : rôle modifiable';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  update public.practices set verified = true where owner_id = auth.uid();
  raise exception 'ÉCHEC 3b : statut vérifié modifiable';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  insert into public.waitlist_entries (practice_id, patient_last_name, patient_first_name, patient_age, email, pathology_code, info_acknowledged_at, consent_at)
  select id, 'X', 'Y', '7 ans', 'x@example.com', 'voix', now(), now() from public.practices limit 1;
  raise exception 'ÉCHEC 3c : insertion directe possible';
exception when insufficient_privilege then null;
end $$;
reset role;

-- 4. Le formulaire public : interdit à anon, possible pour service_role, seulement si le cabinet est vérifié.
update public.practices set verified = true where slug = 'cabinet-a';
select set_config('request.jwt.claims', '{"role":"anon"}', false);
set role anon;
do $$ begin
  perform public.submit_waitlist_entry('cabinet-a', 'h', 'Dupont', 'Léa', '7 ans', 'Dupont', 'Marie', 'm@example.com', null, 'langage-ecrit', null);
  raise exception 'ÉCHEC 4a : anon peut appeler submit_waitlist_entry';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  if (select count(*) from public.get_public_practice('cabinet-b')) <> 0 then raise exception 'ÉCHEC 4b : cabinet non vérifié visible'; end if;
  if (select count(*) from public.get_public_practice('cabinet-a')) <> 1 then raise exception 'ÉCHEC 4c : cabinet vérifié invisible'; end if;
end $$;
do $$ begin
  perform 1 from public.practices;
  raise exception 'ÉCHEC 4d : anon lit la table des cabinets';
exception when insufficient_privilege then null;
end $$;
reset role;
set role service_role;
do $$ begin
  if not public.submit_waitlist_entry('cabinet-a', 'ip1', 'Dupont', 'Léa', '7 ans', 'Dupont', 'Marie', 'm@example.com', null, 'langage-ecrit', 'note') then
    raise exception 'ÉCHEC 4e : inscription refusée';
  end if;
  if public.submit_waitlist_entry('cabinet-b', 'ip1', 'X', 'Y', '7 ans', null, null, 'x@example.com', null, 'voix', null) then
    raise exception 'ÉCHEC 4f : inscription acceptée sur un cabinet non vérifié';
  end if;
end $$;

-- 5. Limitation de débit : la 6e inscription de la même IP dans l'heure est refusée.
do $$ declare i int; begin
  for i in 2..5 loop
    perform public.submit_waitlist_entry('cabinet-a', 'ip1', 'Nom', 'Prénom', '5 ans', null, null, null, '06 00 00 00 00', 'voix', null);
  end loop;
  begin
    perform public.submit_waitlist_entry('cabinet-a', 'ip1', 'Nom', 'Prénom', '5 ans', null, null, null, '06 00 00 00 00', 'voix', null);
    raise exception 'ÉCHEC 5 : pas de limitation de débit';
  exception when sqlstate 'P0429' then null;
  end;
end $$;
reset role;

-- 6. Données de santé : lisibles par le propriétaire en aal2 seulement, jamais par un autre cabinet.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a', 'aal1');
set role authenticated;
do $$ begin
  if (select count(*) from public.waitlist_entries) <> 0 then raise exception 'ÉCHEC 6a : lecture sans double authentification'; end if;
end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a', 'aal2');
set role authenticated;
do $$ begin
  if (select count(*) from public.waitlist_entries) <> 5 then raise exception 'ÉCHEC 6b : le propriétaire ne voit pas ses inscrits'; end if;
  update public.waitlist_entries set status = 'contacte' where patient_first_name = 'Léa';
  if (select contacted_at from public.waitlist_entries where patient_first_name = 'Léa') is null then raise exception 'ÉCHEC 6c : date de contact absente'; end if;
end $$;
do $$ begin
  update public.waitlist_entries set notes = 'modifié';
  raise exception 'ÉCHEC 6d : notes modifiables';
exception when insufficient_privilege then null;
end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b', 'aal2');
set role authenticated;
do $$ begin
  if (select count(*) from public.waitlist_entries) <> 0 then raise exception 'ÉCHEC 6e : un autre cabinet voit les inscrits'; end if;
  update public.waitlist_entries set status = 'retire';
  delete from public.waitlist_entries;
  if (select count(*) from public.audit_log where table_name = 'waitlist_entries') <> 0 then raise exception 'ÉCHEC 6f : un autre cabinet lit le journal'; end if;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.waitlist_entries where status = 'retire') <> 0 then raise exception 'ÉCHEC 6g : modification par un autre cabinet'; end if;
  if (select count(*) from public.waitlist_entries) <> 5 then raise exception 'ÉCHEC 6h : suppression par un autre cabinet'; end if;
end $$;

-- 7. Journal d'audit : alimenté, en lecture seule, sans contenu de santé.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a', 'aal2');
set role authenticated;
do $$ begin
  if (select count(*) from public.audit_log where table_name = 'waitlist_entries') < 6 then raise exception 'ÉCHEC 7a : audit incomplet'; end if;
  delete from public.audit_log;
  raise exception 'ÉCHEC 7b : journal effaçable';
exception when insufficient_privilege then null;
end $$;
reset role;

-- 8. Le schéma privé n'est pas lisible.
set role authenticated;
do $$ begin
  perform 1 from private.rate_limits;
  raise exception 'ÉCHEC 8 : rate_limits lisible';
exception when insufficient_privilege then null;
end $$;
reset role;

select 'TOUS LES TESTS DE SÉCURITÉ PASSENT' as resultat;
