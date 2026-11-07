-- Correctif de 20261108120000 : une contrainte « not valid » est quand même
-- revérifiée à CHAQUE mise à jour de la ligne. Une demande saisie avant (ancien
-- format de téléphone) ne pouvait donc plus changer de statut.
-- On ne vérifie plus le format que quand le téléphone est écrit (insertion ou
-- modification du numéro), via un trigger.

alter table public.waitlist_entries drop constraint waitlist_phone_format;

-- Anciennes saisies : on remet au nouveau format ce qui peut l'être.
update public.waitlist_entries
set phone = regexp_replace('0' || substring(regexp_replace(phone, '[[:space:].()-]', '', 'g') from '([1-9][0-9]{8})$'),
                           '([0-9]{2})(?=[0-9])', '\1 ', 'g')
where regexp_replace(phone, '[[:space:].()-]', '', 'g') ~ '^(0|\+330?|00330?)[1-9][0-9]{8}$';

create function private.check_phone_format() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.phone is not null
     and new.phone !~ '^0[1-9]( [0-9]{2}){4}$'
     and not (new.phone ~ '^\+[1-9][0-9]{7,14}$' and new.phone !~ '^\+33') then
    raise exception 'format de téléphone invalide' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger waitlist_phone_format before insert or update of phone on public.waitlist_entries
  for each row execute function private.check_phone_format();
