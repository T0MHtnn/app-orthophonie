-- Nouveau statut de liste d'attente : « Prise en charge terminée ».
-- (Seul dans sa migration : une valeur d'enum ajoutée ne peut pas servir dans la même transaction.)
alter type public.waitlist_status add value if not exists 'termine';
