-- Règle de Tom : une seule adresse email, celle du compte, utilisée partout.
-- L'email des demandes de liste d'attente et des fiches patients est toujours celui
-- du compte famille, et suit automatiquement un changement d'adresse.

-- À l'inscription sur une liste d'attente : l'email est celui du compte (quoi qu'envoie le client).
create function private.waitlist_account_email() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.requester_id is not null then
    new.email := (select lower(u.email) from auth.users u where u.id = new.requester_id);
  end if;
  return new;
end;
$$;

create trigger waitlist_account_email before insert on public.waitlist_entries
  for each row execute function private.waitlist_account_email();

-- Changement d'adresse du compte (confirmé) : demandes et fiches patients suivent.
create function private.sync_account_email() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email and new.email is not null then
    update public.waitlist_entries set email = lower(new.email) where requester_id = new.id;
    update public.patients set email = lower(new.email) where family_id = new.id;
  end if;
  return null;
end;
$$;

create trigger on_auth_user_email_changed after update of email on auth.users
  for each row execute function private.sync_account_email();

-- Données existantes : alignées sur l'adresse du compte.
update public.waitlist_entries w set email = lower(u.email)
from auth.users u where u.id = w.requester_id and w.email is distinct from lower(u.email);
update public.patients p set email = lower(u.email)
from auth.users u where u.id = p.family_id and p.email is distinct from lower(u.email);
