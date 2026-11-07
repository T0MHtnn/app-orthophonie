-- La famille peut supprimer définitivement une de ses demandes RETIRÉES (icône poubelle
-- dans son espace). Les demandes en cours, suivies ou terminées ne sont pas concernées.
create function public.delete_my_waitlist_entry(p_id uuid)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
begin
  delete from public.waitlist_entries
  where id = p_id and requester_id = auth.uid() and status = 'retire';
  return found;
end;
$$;
revoke all on function public.delete_my_waitlist_entry(uuid) from public, anon;
grant execute on function public.delete_my_waitlist_entry(uuid) to authenticated;
