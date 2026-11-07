-- Une famille ne voit plus dans l'annuaire les cabinets où elle a déjà une demande
-- en cours (en attente, place proposée) ou un patient suivi. Sur la page du cabinet,
-- un message le lui rappelle (elle peut quand même inscrire un autre enfant / proche).

create function private.family_known_practice(p_practice uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    exists (
      select 1 from public.waitlist_entries w
      where w.practice_id = p_practice and w.requester_id = auth.uid() and w.status in ('attente', 'contacte', 'rdv')
    )
    or exists (
      select 1 from public.patients pa
      where pa.practice_id = p_practice and pa.family_id = auth.uid() and pa.active
    )
  );
$$;
revoke all on function private.family_known_practice(uuid) from public, anon, authenticated;

create or replace function public.search_practices(p_query text)
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
    and p.owner_id is distinct from auth.uid()
    and not private.family_known_practice(p.id)
    and not exists (
      select 1 from words
      where position(w in private.fold(p.name || ' ' || pr.full_name || ' ' || p.city || ' ' || coalesce(p.postal_code, ''))) = 0
    )
  order by p.city, p.name
  limit 50;
$$;

-- La famille connectée a-t-elle déjà une demande en cours ou un suivi dans ce cabinet ?
create function public.known_practice(p_slug text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select private.family_known_practice(p.id) from public.practices p where p.slug = lower(p_slug)), false);
$$;
revoke all on function public.known_practice(text) from public, anon;
grant execute on function public.known_practice(text) to authenticated;
