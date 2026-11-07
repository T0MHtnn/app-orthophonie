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
select public.register_practice('Cabinet A', 'cabinet-a', '10000000001', '1 rue de la Paix', '75011', 'Paris');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b', 'aal1');
set role authenticated;
select public.register_practice('Cabinet B', 'cabinet-b', '10000000002', '1 rue de la Paix', '75011', 'Paris');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c', 'aal1');
set role authenticated;
do $$ begin
  perform public.register_practice('Cabinet C', 'cabinet-c', '10000000003', '1 rue de la Paix', '75011', 'Paris');
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

-- 4. Liste d'attente : inscription réservée aux comptes connectés et confirmés, cabinet vérifié uniquement.
update public.practices set verified = true where slug = 'cabinet-a';
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000f1', 'famille1@example.com', now()),
  ('00000000-0000-0000-0000-0000000000f2', 'famille2@example.com', now());
select set_config('request.jwt.claims', '{"role":"anon"}', false);
set role anon;
do $$ begin
  perform public.submit_waitlist_entry('cabinet-a', 'Dupont', 'Léa', '2019-01-01'::date, 'Dupont', 'Marie', 'm@example.com', null, 'langage-ecrit', 'bilan', null);
  raise exception 'ÉCHEC 4a : anon peut s''inscrire';
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
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c', 'aal1');
set role authenticated;
do $$ begin
  perform public.submit_waitlist_entry('cabinet-a', 'X', 'Y', '2019-01-01'::date, null, null, null, '06 00 00 00 00', 'voix', 'bilan', null);
  raise exception 'ÉCHEC 4e : inscription sans email confirmé';
exception when insufficient_privilege then null;
end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1', 'aal1');
set role authenticated;
do $$ begin
  if not public.submit_waitlist_entry('cabinet-a', 'Dupont', 'Léa', '2019-01-01'::date, 'Dupont', 'Marie', '', null, 'langage-ecrit', 'bilan', 'note') then
    raise exception 'ÉCHEC 4f : inscription refusée';
  end if;
  if public.submit_waitlist_entry('cabinet-b', 'X', 'Y', '2019-01-01'::date, null, null, 'x@example.com', null, 'voix', 'bilan', null) then
    raise exception 'ÉCHEC 4g : inscription acceptée sur un cabinet non vérifié';
  end if;
  begin
    perform public.submit_waitlist_entry('cabinet-a', 'dupont', 'léa', '2019-01-01'::date, null, null, null, '06 00 00 00 00', 'voix', 'bilan', null);
    raise exception 'ÉCHEC 4h : doublon accepté';
  exception when unique_violation then null;
  end;
end $$;
reset role;
do $$ begin
  if (select email from public.waitlist_entries where patient_first_name = 'Léa') <> 'famille1@example.com' then
    raise exception 'ÉCHEC 4i : email du compte non repris';
  end if;
end $$;

-- 5. Limitation de débit : au-delà de 5 inscriptions par heure et par compte, refus.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1', 'aal1');
set role authenticated;
do $$ declare i int; begin
  for i in 2..5 loop
    perform public.submit_waitlist_entry('cabinet-a', 'Nom', 'Enfant' || i, '2019-01-01'::date, null, null, null, '06 00 00 00 00', 'voix', 'bilan', null);
  end loop;
  begin
    perform public.submit_waitlist_entry('cabinet-a', 'Nom', 'Enfant10', '2019-01-01'::date, null, null, null, '06 00 00 00 00', 'voix', 'bilan', null);
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

-- 9. Espace famille : on ne voit et ne retire que ses propres demandes.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f2', 'aal1');
set role authenticated;
do $$ begin
  if (select count(*) from public.my_waitlist_entries()) <> 0 then raise exception 'ÉCHEC 9a : voit les demandes d''une autre famille'; end if;
  if (select count(*) from public.waitlist_entries) <> 0 then raise exception 'ÉCHEC 9b : lecture directe de la table'; end if;
  if public.withdraw_waitlist_entry((select id from public.waitlist_entries limit 1)) then raise exception 'ÉCHEC 9c : retire la demande d''un autre'; end if;
end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1', 'aal1');
set role authenticated;
do $$ declare v uuid; begin
  if (select count(*) from public.my_waitlist_entries()) <> 5 then raise exception 'ÉCHEC 9d : la famille ne voit pas ses demandes'; end if;
  select id into v from public.my_waitlist_entries() where patient_first_name = 'Enfant2';
  if not public.withdraw_waitlist_entry(v) then raise exception 'ÉCHEC 9e : retrait impossible'; end if;
  if (select status from public.my_waitlist_entries() where id = v) <> 'retire' then raise exception 'ÉCHEC 9f : statut non mis à jour'; end if;
end $$;
reset role;

-- 10. Prénom / nom séparés : repris des métadonnées, modifiables par soi seul, nom complet calculé.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000d', 'd@example.com', now(), '{"first_name":" Léa ","last_name":"Martin","role":"ortho"}');
do $$ begin
  if (select full_name from public.profiles where id = '00000000-0000-0000-0000-00000000000d') <> 'Léa Martin' then
    raise exception 'ÉCHEC 10a : prénom / nom non repris';
  end if;
  if (select role from public.profiles where id = '00000000-0000-0000-0000-00000000000d') <> 'patient' then
    raise exception 'ÉCHEC 10b : rôle des métadonnées pris en compte';
  end if;
  if (select last_name from public.profiles where id = '00000000-0000-0000-0000-00000000000a') <> 'Ortho A' then
    raise exception 'ÉCHEC 10c : ancien full_name non repris';
  end if;
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d', 'aal1');
set role authenticated;
update public.profiles set first_name = 'Zoé' where id = auth.uid();
update public.profiles set last_name = 'Pirate' where id = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  update public.profiles set full_name = 'X' where id = auth.uid();
  raise exception 'ÉCHEC 10d : nom complet modifiable directement';
exception when insufficient_privilege or generated_always then null;
end $$;
reset role;
do $$ begin
  if (select full_name from public.profiles where id = '00000000-0000-0000-0000-00000000000d') <> 'Zoé Martin' then
    raise exception 'ÉCHEC 10e : prénom non modifié';
  end if;
  if (select last_name from public.profiles where id = '00000000-0000-0000-0000-00000000000a') <> 'Ortho A' then
    raise exception 'ÉCHEC 10f : profil d''un autre modifié';
  end if;
end $$;

-- 11. Téléphone : format normalisé obligatoire.
do $$ begin
  insert into public.waitlist_entries (practice_id, patient_last_name, patient_first_name, patient_age, phone, pathology_code, info_acknowledged_at, consent_at)
  select id, 'Tel', 'Test', '7 ans', '1234567890', 'voix', now(), now() from public.practices limit 1;
  raise exception 'ÉCHEC 11 : téléphone mal formé accepté';
exception when check_violation then null;
end $$;

-- 12. Un ortho peut inscrire un proche dans un autre cabinet, pas dans le sien ; son cabinet est absent de son annuaire.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a', 'aal2');
set role authenticated;
do $$ begin
  perform public.submit_waitlist_entry('cabinet-a', 'Ortho', 'Test', '2019-01-01'::date, null, null, 'a@example.com', null, 'voix', 'reeducation', null);
  raise exception 'ÉCHEC 12a : un ortho peut s''inscrire dans son propre cabinet';
exception when sqlstate 'P0403' then null;
end $$;
do $$ begin
  if exists (select 1 from public.search_practices('cabinet a')) then raise exception 'ÉCHEC 12b : propre cabinet visible dans l''annuaire'; end if;
end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b', 'aal2');
set role authenticated;
do $$ begin
  if not public.submit_waitlist_entry('cabinet-a', 'Enfant', 'DeB', '2019-01-01'::date, 'B', 'Parent', 'b@example.com', null, 'voix', 'bilan', null) then
    raise exception 'ÉCHEC 12c : un ortho ne peut pas inscrire son enfant ailleurs';
  end if;
end $$;
reset role;

-- 13. Annuaire : seuls les cabinets vérifiés, ouverts et listés apparaissent, sans accents.
set role anon;
do $$ begin
  if (select count(*) from public.search_practices('paris')) <> 1 then raise exception 'ÉCHEC 13a : annuaire incorrect (cabinet non vérifié visible ?)'; end if;
  if (select slug from public.search_practices('CABINÉT a 750')) <> 'cabinet-a' then raise exception 'ÉCHEC 13b : recherche sans accents / code postal'; end if;
  if exists (select 1 from public.search_practices('lyon')) then raise exception 'ÉCHEC 13c : résultat inattendu'; end if;
end $$;
reset role;
update public.practices set listed = false where slug = 'cabinet-a';
set role anon;
do $$ begin
  if exists (select 1 from public.search_practices('paris')) then raise exception 'ÉCHEC 13d : cabinet hors annuaire visible'; end if;
end $$;
reset role;

-- 14. Planning : fiche patient créée à « Pris en charge », rendez-vous sans chevauchement, aal2 obligatoire.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a', 'aal2');
set role authenticated;
do $$
declare v_entry uuid; v_patient uuid; v_rdv uuid;
begin
  select id into v_entry from public.waitlist_entries where practice_id = (select id from public.practices where slug = 'cabinet-a') and status <> 'rdv' limit 1;
  update public.waitlist_entries set status = 'rdv' where id = v_entry;
  select id into v_patient from public.patients where waitlist_entry_id = v_entry and active;
  if v_patient is null then raise exception 'ÉCHEC 14a : fiche patient non créée'; end if;

  v_rdv := public.save_appointment(null, v_patient, '2030-01-07 09:00+01', '2030-01-07 09:30+01');
  begin
    perform public.save_appointment(null, v_patient, '2030-01-07 09:15+01', '2030-01-07 09:45+01');
    raise exception 'ÉCHEC 14b : chevauchement accepté';
  exception when sqlstate 'P0409' then null;
  end;
  perform public.save_appointment(null, v_patient, '2030-01-07 09:30+01', '2030-01-07 10:00+01');
  if not public.cancel_appointment(v_rdv) then raise exception 'ÉCHEC 14c : annulation refusée'; end if;
  perform public.save_appointment(null, v_patient, '2030-01-07 09:00+01', '2030-01-07 09:30+01');

  update public.waitlist_entries set status = 'attente' where id = v_entry;
  if (select active from public.patients where id = v_patient) then raise exception 'ÉCHEC 14d : fiche toujours active'; end if;
end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a', 'aal1');
set role authenticated;
do $$ begin
  if (select count(*) from public.appointments) <> 0 or (select count(*) from public.patients) <> 0 then
    raise exception 'ÉCHEC 14e : planning lisible sans double authentification';
  end if;
end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b', 'aal2');
set role authenticated;
do $$ begin
  if (select count(*) from public.appointments) <> 0 then raise exception 'ÉCHEC 14f : rendez-vous d''un autre cabinet visibles'; end if;
  begin
    insert into public.schedule_blocks (practice_id, title, starts_at, ends_at)
    select id, 'X', '2030-01-07 12:00+01', '2030-01-07 13:00+01' from public.practices where slug = 'cabinet-a';
    raise exception 'ÉCHEC 14g : planning d''un autre cabinet modifiable';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- 15. Blocages : un rendez-vous ne peut pas tomber sur un créneau bloqué (répétitions comprises).
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a', 'aal2');
set role authenticated;
do $$
declare v_patient uuid;
begin
  update public.waitlist_entries set status = 'rdv'
  where id = (select waitlist_entry_id from public.patients limit 1);
  select id into v_patient from public.patients where active limit 1;
  -- Pause chaque lundi 12 h – 13 h 30, sauf le 14 janvier 2030.
  insert into public.schedule_blocks (practice_id, title, starts_at, ends_at, recurrence, skip_dates)
  select id, 'Pause', '2030-01-07 12:00+01', '2030-01-07 13:30+01', 'weekly', '{2030-01-14}' from public.practices where slug = 'cabinet-a';
  begin
    perform public.save_appointment(null, v_patient, '2030-01-21 13:00+01', '2030-01-21 13:30+01');
    raise exception 'ÉCHEC 15a : rendez-vous accepté sur un créneau bloqué';
  exception when sqlstate 'P0410' then null;
  end;
  perform public.save_appointment(null, v_patient, '2030-01-14 13:00+01', '2030-01-14 13:30+01'); -- jour supprimé : libre
  perform public.save_appointment(null, v_patient, '2030-01-21 13:30+01', '2030-01-21 14:00+01'); -- juste après : libre
end $$;
reset role;

-- 16. Réservation par la famille : modes du cabinet, autonome → confirmé, sinon à valider ; jamais les détails des autres.
do $$
declare v_patient uuid;
begin
  select id into v_patient from public.patients where active limit 1;
  update public.patients set family_id = '00000000-0000-0000-0000-0000000000f1', autonomous = false where id = v_patient;
  -- RDV posés par l'ortho dans les tests 14-15 : annulés, sinon la règle « une séance à venir » bloquerait tout.
  update public.appointments set status = 'annule', cancelled_at = now() where patient_id = v_patient;
  update public.practices set booking_mode = 'ortho', booking_min_notice_hours = 0 where slug = 'cabinet-a';
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1', 'aal1');
set role authenticated;
do $$
declare v_patient uuid := (select id from public.my_patients() limit 1); v_status text;
begin
  if v_patient is null then raise exception 'ÉCHEC 16a : la famille ne voit pas son patient'; end if;
  begin
    perform public.book_appointment(v_patient, '2030-02-04 10:00+01');
    raise exception 'ÉCHEC 16b : réservation possible en mode « ortho seul·e »';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
update public.practices set booking_mode = 'tous' where slug = 'cabinet-a';
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1', 'aal1');
set role authenticated;
do $$
declare v_patient uuid := (select id from public.my_patients() limit 1); v_status text;
begin
  v_status := public.book_appointment(v_patient, '2030-02-04 10:00+01');
  if v_status <> 'a_valider' then raise exception 'ÉCHEC 16c : non autonome confirmé sans validation'; end if;
  begin
    perform public.book_appointment(v_patient, '2030-02-05 10:00+01');
    raise exception 'ÉCHEC 16d : deux demandes en attente acceptées';
  exception when sqlstate 'P0412' then null;
  end;
  begin
    perform public.book_appointment(v_patient, '2030-02-04 22:00+01');
    raise exception 'ÉCHEC 16e : réservation hors 7 h – 21 h';
  exception when sqlstate 'P0411' then null;
  end;
  if exists (select 1 from public.appointments) then raise exception 'ÉCHEC 16f : la famille lit la table des rendez-vous'; end if;
  if (select count(*) from public.my_appointments()) <> 1 then raise exception 'ÉCHEC 16g : séances de la famille incorrectes'; end if;
end $$;
reset role;
-- L'ortho accepte ; un patient autonome est ensuite confirmé directement.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a', 'aal2');
set role authenticated;
do $$ begin
  if not public.review_appointment((select id from public.appointments where status = 'a_valider' limit 1), true) then
    raise exception 'ÉCHEC 16h : validation impossible';
  end if;
end $$;
reset role;
update public.patients set autonomous = true where family_id = '00000000-0000-0000-0000-0000000000f1';
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1', 'aal1');
set role authenticated;
do $$
declare v_patient uuid := (select id from public.my_patients() limit 1);
begin
  -- Une seule réservation active : la séance acceptée (16h) bloque toute nouvelle demande.
  begin
    perform public.book_appointment(v_patient, '2030-02-06 10:00+01');
    raise exception 'ÉCHEC 16j : deuxième réservation acceptée alors qu''une est active';
  exception when sqlstate 'P0412' then null;
  end;
  if not (select active_booking from public.my_patients() where id = v_patient) then raise exception 'ÉCHEC 16m : réservation active non signalée'; end if;
  if not public.family_cancel_appointment((select id from public.my_appointments() limit 1)) then raise exception 'ÉCHEC 16n : annulation refusée'; end if;
  if public.book_appointment(v_patient, '2030-02-06 10:00+01') <> 'confirme' then raise exception 'ÉCHEC 16i : autonome non confirmé'; end if;
end $$;
reset role;
-- Une autre famille ne voit rien et ne peut pas réserver pour ce patient.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f2', 'aal1');
set role authenticated;
do $$ begin
  if exists (select 1 from public.my_appointments()) then raise exception 'ÉCHEC 16k : séances d''une autre famille visibles'; end if;
  begin
    perform public.booking_busy((select id from public.patients limit 1), now(), now() + interval '7 days');
    raise exception 'ÉCHEC 16l : disponibilités d''un patient d''une autre famille';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

update public.practices set listed = true where slug = 'cabinet-a';
-- 17. Un même compte peut inscrire plusieurs patients dans un cabinet, mais pas deux fois le même.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f2', 'aal1');
set role authenticated;
do $$ begin
  if not public.submit_waitlist_entry('cabinet-a', 'Marry', 'Léa', '2019-01-01'::date, 'X', 'Y', 'f2@example.com', null, 'voix', 'bilan', null) then
    raise exception 'ÉCHEC 17a : demande pour un nouveau patient refusée';
  end if;
  if not public.submit_waitlist_entry('cabinet-a', 'Eude', 'Jean', '2019-01-01'::date, 'X', 'Y', 'f2@example.com', null, 'voix', 'bilan', null) then
    raise exception 'ÉCHEC 17b : deuxième patient refusé';
  end if;
  begin
    perform public.submit_waitlist_entry('cabinet-a', 'EUDE', ' jean ', '2019-01-01'::date, 'X', 'Y', 'f2@example.com', null, 'voix', 'bilan', null);
    raise exception 'ÉCHEC 17c : même patient inscrit deux fois';
  exception when unique_violation then null;
  end;
  if not exists (select 1 from public.search_practices('paris') where slug = 'cabinet-a') then
    raise exception 'ÉCHEC 17d : cabinet connu masqué de l''annuaire';
  end if;
end $$;
reset role;

-- Un autre compte peut inscrire un homonyme « Jean Eude » dans le même cabinet.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d', 'aal1');
set role authenticated;
do $$ begin
  if not public.submit_waitlist_entry('cabinet-a', 'Eude', 'Jean', '2019-01-01'::date, 'Z', 'W', 'd@example.com', null, 'voix', 'bilan', null) then
    raise exception 'ÉCHEC 17e : homonyme d''un autre compte refusé';
  end if;
end $$;
reset role;

-- 18. Prise en charge terminée : fiche désactivée, le patient peut refaire une demande.
do $$
declare v_entry uuid := (select id from public.waitlist_entries where patient_first_name = 'Léa' and patient_last_name = 'Marry' limit 1);
begin
  update public.waitlist_entries set status = 'rdv' where id = v_entry;
  update public.waitlist_entries set status = 'termine' where id = v_entry;
  if (select active from public.patients where waitlist_entry_id = v_entry) then raise exception 'ÉCHEC 18a : fiche toujours active'; end if;
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f2', 'aal1');
set role authenticated;
do $$ begin
  if not public.submit_waitlist_entry('cabinet-a', 'Marry', 'Léa', '2019-01-01'::date, 'X', 'Y', 'f2@example.com', null, 'voix', 'reeducation', null) then
    raise exception 'ÉCHEC 18b : réinscription refusée après la fin de prise en charge';
  end if;
end $$;
reset role;

-- 19. « Non honoré » : seulement les RDV commencés, confirmés, de son cabinet ; suppression d'un RDV.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a', 'aal2');
set role authenticated;
do $$
declare v_patient uuid := (select id from public.patients where active limit 1); v_past uuid; v_future uuid;
begin
  v_past := public.save_appointment(null, v_patient, now() - interval '3 days', now() - interval '3 days' + interval '30 minutes');
  v_future := public.save_appointment(null, v_patient, now() + interval '400 days', now() + interval '400 days' + interval '30 minutes');
  if not public.mark_attendance(v_past, 'absent') then raise exception 'ÉCHEC 19a : « non honoré » refusé'; end if;
  if public.mark_attendance(v_future, 'absent') then raise exception 'ÉCHEC 19b : RDV futur marqué non honoré'; end if;
  if (select attendance from public.appointments where id = v_past) <> 'absent' then raise exception 'ÉCHEC 19c : non enregistré'; end if;
  if not public.delete_appointment(v_future) then raise exception 'ÉCHEC 19e : suppression refusée'; end if;
end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b', 'aal2');
set role authenticated;
do $$ begin
  if public.mark_attendance((select id from public.appointments limit 1), 'absent') then raise exception 'ÉCHEC 19d : pointage d''un autre cabinet'; end if;
end $$;
reset role;

-- 20. La famille supprime ses demandes retirées, et seulement celles-là.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f2', 'aal1');
set role authenticated;
do $$
declare v_active uuid := (select id from public.my_waitlist_entries() where status = 'attente' limit 1);
begin
  if public.delete_my_waitlist_entry(v_active) then raise exception 'ÉCHEC 20a : demande en cours supprimée'; end if;
  perform public.withdraw_waitlist_entry(v_active);
  if not public.delete_my_waitlist_entry(v_active) then raise exception 'ÉCHEC 20b : demande retirée non supprimée'; end if;
end $$;
reset role;

-- 21. Une seule adresse : l'email des demandes / fiches = celui du compte, et suit ses changements.
do $$ begin
  if exists (
    select 1 from public.waitlist_entries w join auth.users u on u.id = w.requester_id where w.email is distinct from lower(u.email)
  ) then raise exception 'ÉCHEC 21a : email de demande différent du compte'; end if;
  update auth.users set email = 'famille2-nouveau@example.com' where id = '00000000-0000-0000-0000-0000000000f2';
  if exists (select 1 from public.waitlist_entries where requester_id = '00000000-0000-0000-0000-0000000000f2' and email <> 'famille2-nouveau@example.com') then
    raise exception 'ÉCHEC 21b : changement d''adresse non répercuté';
  end if;
end $$;

-- 23. Annulation par l'ortho : raison gardée, créneau libéré pour le récapitulatif.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a', 'aal2');
set role authenticated;
do $$
declare v_appt uuid := public.save_appointment(null, (select id from public.patients where active limit 1), '2030-03-04 10:00+01', '2030-03-04 10:30+01');
begin
  if not public.cancel_by_ortho(v_appt, 'Formation') then raise exception 'ÉCHEC 23a : annulation refusée'; end if;
  if not exists (select 1 from public.freed_slots where starts_at = '2030-03-04 10:00+01' and source = 'cabinet' and reason = 'Formation') then
    raise exception 'ÉCHEC 23b : créneau libéré absent';
  end if;
  if public.dismiss_freed_slots(array(select id from public.freed_slots where handled_at is null)) < 1 then
    raise exception 'ÉCHEC 23c : ignorer impossible';
  end if;
end $$;
reset role;

-- 24. Rappels de la veille : réservés à la tâche planifiée (secret exigé).
set role anon;
do $$
begin
  perform public.cron_session_reminders('mauvais-secret');
  raise exception 'ÉCHEC 24 : rappels sans secret';
exception when insufficient_privilege then null;
end $$;
reset role;

-- 25. Module Patients : fiche modifiable en aal2 seulement, notes privées et cloisonnées.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a', 'aal1');
set role authenticated;
do $$
declare n int;
begin
  with u as (update public.patients set prescriber_name = 'Dr Test' returning 1) select count(*) into n from u;
  if n > 0 then raise exception 'ÉCHEC 25a : fiche modifiée en aal1'; end if;
end $$;
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a', 'aal2');
set role authenticated;
do $$
declare
  v_patient uuid := (select id from public.patients limit 1);
  v_practice uuid := (select practice_id from public.patients where id = (select id from public.patients limit 1));
  n int;
begin
  with u as (update public.patients set prescriber_name = 'Dr Test', sessions_prescribed = 20, amo_act_code = 'reeduc-langage-ecrit'
             where id = v_patient returning 1) select count(*) into n from u;
  if n <> 1 then raise exception 'ÉCHEC 25b : fiche non modifiable par son ortho'; end if;
  insert into public.session_notes (practice_id, patient_id, body) values (v_practice, v_patient, 'Note test');
  perform set_config('test.patient_a', v_patient::text, false);
  begin
    update public.patients set email = 'autre@example.com' where id = v_patient;
    raise exception 'ÉCHEC 25c : email du patient modifiable';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Un autre ortho ne voit pas les notes, et ne peut pas en écrire sur un patient qui n'est pas le sien.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b', 'aal2');
set role authenticated;
do $$
begin
  if exists (select 1 from public.session_notes) then raise exception 'ÉCHEC 25d : notes visibles par un autre cabinet'; end if;
  begin
    insert into public.session_notes (practice_id, patient_id, body)
    values ((select id from public.practices where owner_id = auth.uid()), current_setting('test.patient_a')::uuid, 'Intrus');
    raise exception 'ÉCHEC 25e : note sur le patient d''un autre cabinet';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Une famille ne voit jamais les notes de séance.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1', 'aal1');
set role authenticated;
do $$
begin
  if exists (select 1 from public.session_notes) then raise exception 'ÉCHEC 25f : notes visibles par une famille'; end if;
end $$;
reset role;

-- 26. Étape 2 : devoirs et documents cloisonnés ; la famille passe uniquement par ses fonctions.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a', 'aal2');
set role authenticated;
do $$
declare v_patient uuid := current_setting('test.patient_a')::uuid;
begin
  insert into public.homework (practice_id, patient_id, title)
  values ((select practice_id from public.patients where id = v_patient), v_patient, 'Lire 10 minutes');
  begin
    insert into public.patient_documents (practice_id, patient_id, name, mime_type, size_bytes, storage_path, uploaded_by)
    values ((select practice_id from public.patients where id = v_patient), v_patient, 'x.pdf', 'application/pdf', 10, 'x/y/z', 'famille');
    raise exception 'ÉCHEC 26a : l''ortho se fait passer pour la famille';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000b', 'aal2');
set role authenticated;
do $$
begin
  if exists (select 1 from public.homework) or exists (select 1 from public.patient_documents) then
    raise exception 'ÉCHEC 26b : devoirs ou documents visibles par un autre cabinet';
  end if;
  if public.family_delete_document(gen_random_uuid()) is not null then raise exception 'ÉCHEC 26c'; end if;
end $$;
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1', 'aal1');
set role authenticated;
do $$
begin
  if exists (select 1 from public.homework) or exists (select 1 from public.patient_documents) or exists (select 1 from public.patient_caregivers) then
    raise exception 'ÉCHEC 26d : tables lisibles directement par une famille';
  end if;
  if exists (select 1 from public.my_homework() h where h.patient_id <> all (select id from public.my_patients())) then
    raise exception 'ÉCHEC 26e : devoirs d''un autre patient';
  end if;
  begin
    perform public.family_add_document(current_setting('test.patient_a')::uuid, 'x.pdf', 'application/pdf', 10, 'a/b/c');
    if not exists (select 1 from public.my_patients() where id = current_setting('test.patient_a')::uuid) then
      raise exception 'ÉCHEC 26f : dépôt sur le patient d''une autre famille';
    end if;
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- 27. Aidants : liste de l'inscription nettoyée, emails envoyés seulement aux aidants cochés.
do $$
declare v_patient uuid := current_setting('test.patient_a')::uuid;
begin
  if jsonb_array_length(private.clean_caregivers('[{"first_name":"A","last_name":"B"},{"first_name":""},"x",{"first_name":"C","last_name":"D"},{"first_name":"E","last_name":"F"},{"first_name":"G","last_name":"H"},{"first_name":"I","last_name":"J"}]')) <> 4 then
    raise exception 'ÉCHEC 27a : nettoyage des aidants';
  end if;
  insert into public.patient_caregivers (practice_id, patient_id, first_name, last_name, email, receives_emails)
  select practice_id, id, 'Paul', 'Oui', 'paul@example.com', true from public.patients where id = v_patient;
  insert into public.patient_caregivers (practice_id, patient_id, first_name, last_name, email, receives_emails)
  select practice_id, id, 'Jeanne', 'Non', 'jeanne@example.com', false from public.patients where id = v_patient;
  if not exists (select 1 from private.patient_emails(v_patient) e where e = 'paul@example.com')
     or exists (select 1 from private.patient_emails(v_patient) e where e = 'jeanne@example.com') then
    raise exception 'ÉCHEC 27b : destinataires des emails';
  end if;
end $$;

select 'TOUS LES TESTS DE SÉCURITÉ PASSENT' as resultat;
