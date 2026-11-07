-- Retour de Tom : les nouveaux patients (liste d'attente) ne reçoivent PAS de lien pour
-- prendre eux-mêmes leur 1er rendez-vous : c'est l'ortho qui le fixe. Le lien personnel
-- « place libérée » (étape 3) est donc retiré. La case « délai pour les liens par email »
-- ne concerne plus que les séances libérées proposées aux patients suivis.
drop function public.place_book(text, timestamptz);
drop function public.place_busy(text, timestamptz, timestamptz);
drop function public.place_link_info(text);
drop function public.create_place_link(uuid);
drop table public.place_links;
