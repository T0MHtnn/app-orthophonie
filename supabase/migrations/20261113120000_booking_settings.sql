-- Réglages de la prise de rendez-vous en ligne (brainstorm) :
--   - qui réserve : l'ortho seul·e / les patients « autonomes » / tous les patients suivis ;
--   - validation : l'ortho valide chaque réservation, ou confirmation automatique ;
--   - délai minimum avant un rendez-vous réservable en ligne.
-- La liste des autonomes (patients.autonomous) est gardée quel que soit le mode :
-- passer à « tous » puis revenir à « autonomes » retrouve la liste.

alter table public.practices
  add column booking_mode text not null default 'ortho' check (booking_mode in ('ortho', 'autonomes', 'tous')),
  add column booking_validation text not null default 'manuelle' check (booking_validation in ('manuelle', 'auto')),
  add column booking_min_notice_hours smallint not null default 24 check (booking_min_notice_hours between 0 and 720);

grant update (booking_mode, booking_validation, booking_min_notice_hours) on public.practices to authenticated;
