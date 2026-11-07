-- Annuaire des cabinets : les familles trouvent elles-mêmes un orthophoniste
-- (ville, code postal, nom) et s'inscrivent sur sa liste d'attente.
-- Seules des informations professionnelles sont exposées (nom, adresse du cabinet).

alter table public.practices
  add column address_line text check (char_length(address_line) <= 200),
  add column postal_code text check (postal_code ~ '^[0-9]{5}$'),
  add column city text check (char_length(city) between 1 and 100),
  add column listed boolean not null default true;

-- L'ortho modifie son adresse et sa présence dans l'annuaire (Réglages).
grant update (address_line, postal_code, city, listed) on public.practices to authenticated;

-- Création du cabinet : l'adresse est désormais demandée.
drop function public.register_practice(text, text, text);

create function public.register_practice(
  p_name text,
  p_slug text,
  p_rpps text,
  p_address_line text,
  p_postal_code text,
  p_city text
) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users u where u.id = v_uid and u.email_confirmed_at is not null) then
    raise exception 'Email non confirmé' using errcode = '42501';
  end if;
  if exists (select 1 from public.practices where owner_id = v_uid) then
    raise exception 'Un cabinet existe déjà pour ce compte' using errcode = '23505';
  end if;
  if (select role from public.profiles where id = v_uid) = 'admin' then
    raise exception 'Opération interdite' using errcode = '42501';
  end if;

  insert into public.practices (owner_id, name, slug, rpps, address_line, postal_code, city, waitlist_info, email_template)
  values (v_uid, trim(p_name), lower(trim(p_slug)), trim(p_rpps),
          nullif(trim(p_address_line), ''), trim(p_postal_code), trim(p_city), '', '')
  returning id into v_id;

  update public.profiles set role = 'ortho' where id = v_uid;
  return v_id;
end;
$$;

revoke all on function public.register_practice(text, text, text, text, text, text) from public, anon;
grant execute on function public.register_practice(text, text, text, text, text, text) to authenticated;

-- Texte comparable : minuscules, sans accents (sans dépendre de l'extension unaccent).
create function private.fold(p text) returns text
language sql immutable
set search_path = ''
as $$
  select translate(lower(coalesce(p, '')),
    'àâäáãåçéèêëíìîïñóòôöõúùûüýÿœ',
    'aaaaaaceeeeiiiinooooouuuuyyo');
$$;
revoke all on function private.fold(text) from public, anon, authenticated;

-- Recherche publique : cabinets vérifiés, liste ouverte, présents dans l'annuaire,
-- adresse renseignée. Chaque mot doit apparaître dans le nom du cabinet, le nom
-- de l'ortho, la ville ou le code postal. 50 résultats au plus.
create function public.search_practices(p_query text)
returns table (name text, slug text, ortho_name text, address_line text, postal_code text, city text)
language sql stable security definer
set search_path = ''
as $$
  with words as (
    select w from unnest(string_to_array(private.fold(left(trim(coalesce(p_query, '')), 80)), ' ')) as w
    where w <> ''
  )
  select p.name, p.slug, pr.full_name, p.address_line, p.postal_code, p.city
  from public.practices p
  join public.profiles pr on pr.id = p.owner_id
  where p.verified and p.waitlist_open and p.listed and p.city is not null
    and not exists (
      select 1 from words
      where position(w in private.fold(p.name || ' ' || pr.full_name || ' ' || p.city || ' ' || coalesce(p.postal_code, ''))) = 0
    )
  order by p.city, p.name
  limit 50;
$$;

revoke all on function public.search_practices(text) from public;
grant execute on function public.search_practices(text) to anon, authenticated;

-- La page publique du cabinet affiche aussi son adresse.
drop function public.get_public_practice(text);
create function public.get_public_practice(p_slug text)
returns table (name text, waitlist_info text, waitlist_open boolean, address_line text, postal_code text, city text)
language sql stable security definer
set search_path = ''
as $$
  select p.name, p.waitlist_info, p.waitlist_open, p.address_line, p.postal_code, p.city
  from public.practices p
  where p.slug = lower(p_slug) and p.verified;
$$;

revoke all on function public.get_public_practice(text) from public;
grant execute on function public.get_public_practice(text) to anon, authenticated;
