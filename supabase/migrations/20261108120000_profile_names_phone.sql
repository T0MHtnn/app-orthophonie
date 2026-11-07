-- Prénom et nom séparés sur le profil (page « Mon compte »), format de téléphone strict.

-- ---------------------------------------------------------------------------
-- Profil : prénom + nom. full_name devient une colonne calculée (lecture seule)
-- pour que le code existant (affichage, emails) continue de fonctionner.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column first_name text not null default '' check (char_length(first_name) <= 80),
  add column last_name text not null default '' check (char_length(last_name) <= 80);

-- Comptes existants (données fictives) : l'ancien nom complet va dans « nom »,
-- à corriger depuis « Mon compte ».
update public.profiles set last_name = left(trim(full_name), 80);

alter table public.profiles drop column full_name;
alter table public.profiles
  add column full_name text generated always as (trim(first_name || ' ' || last_name)) stored;

-- Chacun ne peut modifier que son prénom et son nom (jamais le rôle).
grant update (first_name, last_name) on public.profiles to authenticated;

-- Le rôle n'est toujours JAMAIS lu dans les métadonnées. full_name reste lu en
-- secours (comptes Google, anciens liens d'inscription).
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, first_name, last_name)
  values (
    new.id,
    left(trim(coalesce(new.raw_user_meta_data ->> 'first_name', '')), 80),
    left(trim(coalesce(new.raw_user_meta_data ->> 'last_name', new.raw_user_meta_data ->> 'full_name', '')), 80)
  );
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Téléphone : format normalisé par l'app (lib/phone.ts).
-- France : « 06 12 34 56 78 ». Étranger : « +32470123456 » (E.164, hors +33).
-- not valid : les lignes déjà saisies ne sont pas revérifiées.
-- ---------------------------------------------------------------------------
alter table public.waitlist_entries
  add constraint waitlist_phone_format check (
    phone ~ '^0[1-9]( [0-9]{2}){4}$'
    or (phone ~ '^\+[1-9][0-9]{7,14}$' and phone !~ '^\+33')
  ) not valid;
