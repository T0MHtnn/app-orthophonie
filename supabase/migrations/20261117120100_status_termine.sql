-- « Prise en charge terminée » : la fiche patient est désactivée (trigger existant :
-- tout statut autre que « rdv » après « rdv » désactive la fiche) et le patient peut
-- refaire une demande dans le cabinet (la règle « une seule demande par patient »
-- ne compte que attente / contacte / rdv).
--
-- La famille ne voit plus de place « Pris en charge » pour ce patient ; ses anciennes
-- séances restent dans l'historique du cabinet.
comment on type public.waitlist_status is 'attente → contacte → rdv (pris en charge) → termine ; retire à tout moment';
