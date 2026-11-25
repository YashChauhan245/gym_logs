begin;

create table liftlog_private.account_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('personal', 'gym_owner'))
);
alter table liftlog_private.account_roles enable row level security;
revoke all on liftlog_private.account_roles from public, anon, authenticated;

-- Preserve access for accounts that synced gym data before roles were introduced.
insert into liftlog_private.account_roles (user_id, role)
  select distinct user_id, 'gym_owner' from liftlog_private.records
    where left(kind, 3) = 'gym' and payload is not null;

create function public.liftlog_account_role(p_role text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := liftlog_private.require_owner(auth.uid());
        assigned text;
begin
  if p_role is not null and p_role not in ('personal', 'gym_owner') then
    raise exception 'Choose a LiftLog account type.' using errcode = '22023';
  end if;
  insert into liftlog_private.account_roles (user_id, role)
    values (owner_id, coalesce(p_role, 'personal')) on conflict (user_id) do nothing;
  select r.role into assigned from liftlog_private.account_roles as r where r.user_id = owner_id;
  return assigned;
end;
$$;
revoke all on function public.liftlog_account_role(text) from public, anon, authenticated;
grant execute on function public.liftlog_account_role(text) to authenticated;

create function liftlog_private.require_gym_role()
returns trigger language plpgsql set search_path = '' as $$
begin
  if left(new.kind, 3) = 'gym' and not exists (
    select 1 from liftlog_private.account_roles as r where r.user_id = new.user_id and r.role = 'gym_owner'
  ) then
    raise exception 'This account cannot write gym records.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function liftlog_private.require_gym_role() from public, anon, authenticated;
create trigger require_gym_role before insert or update on liftlog_private.records
  for each row execute function liftlog_private.require_gym_role();

create or replace function public.liftlog_sync_pull(p_owner uuid, p_after bigint default 0)
returns table(kind text, record_id text, revision bigint, payload jsonb)
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := liftlog_private.require_owner(p_owner);
        gym_access boolean := exists (
  select 1 from liftlog_private.account_roles as a where a.user_id = owner_id and a.role = 'gym_owner'
);
begin
  return query select r.kind, r.record_id, r.revision, r.payload
    from liftlog_private.records as r
    where r.user_id = owner_id and r.revision > greatest(0, coalesce(p_after, 0))
      and (gym_access or left(r.kind, 3) <> 'gym')
    order by r.revision limit 100;
end;
$$;

notify pgrst, 'reload schema';
commit;
