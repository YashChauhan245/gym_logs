begin;

create schema if not exists liftlog_private;
revoke all on schema liftlog_private from public, anon, authenticated;

create table if not exists liftlog_private.sync_heads (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 0 check (revision >= 0)
);

create table if not exists liftlog_private.records (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('profiles', 'workouts', 'workoutExercises', 'sets', 'customExercises', 'favourites', 'foodLogs', 'nutritionGoals', 'customFoods')),
  record_id text not null check (length(record_id) between 1 and 160),
  revision bigint not null check (revision > 0),
  payload jsonb check (payload is null or (jsonb_typeof(payload) = 'object' and payload->>'id' is not distinct from record_id)),
  primary key (user_id, kind, record_id),
  unique (user_id, revision)
);

create table if not exists liftlog_private.receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  batch_id uuid not null,
  request_hash text not null,
  primary key (user_id, batch_id)
);

alter table liftlog_private.sync_heads enable row level security;
alter table liftlog_private.records enable row level security;
alter table liftlog_private.receipts enable row level security;
revoke all on all tables in schema liftlog_private from public, anon, authenticated;

-- No direct table policies or grants. The RPCs bind every read and write to auth.uid().
create or replace function liftlog_private.require_owner(p_owner uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid();
begin
  if owner_id is null or owner_id is distinct from p_owner
    or not exists (select 1 from auth.users as u where u.id = owner_id) then
    raise exception 'Sign in to this LiftLog account.' using errcode = '42501';
  end if;
  return owner_id;
end;
$$;
revoke all on function liftlog_private.require_owner(uuid) from public, anon, authenticated;

create or replace function public.liftlog_cloud_ready()
returns boolean language sql stable set search_path = '' as $$ select true $$;

create or replace function public.liftlog_sync_pull(p_owner uuid, p_after bigint default 0)
returns table(kind text, record_id text, revision bigint, payload jsonb)
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := liftlog_private.require_owner(p_owner);
begin
  return query select r.kind, r.record_id, r.revision, r.payload
    from liftlog_private.records as r
    where r.user_id = owner_id and r.revision > greatest(0, coalesce(p_after, 0))
    order by r.revision limit 100;
end;
$$;

create or replace function public.liftlog_sync_push(p_owner uuid, p_batch_id uuid, p_changes jsonb)
returns table(kind text, record_id text, revision bigint, payload jsonb)
language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := liftlog_private.require_owner(p_owner);
  last_revision bigint;
  request_hash_value text;
  prior_hash text;
  change_item record;
  stored liftlog_private.records%rowtype;
begin
  if p_batch_id is null or jsonb_typeof(p_changes) is distinct from 'array' or pg_column_size(p_changes) > 1048576 then
    raise exception 'Invalid LiftLog batch.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_changes) not between 1 and 50 then
    raise exception 'Invalid LiftLog batch size.' using errcode = '22023';
  end if;

  -- Serialize revision assignment and idempotency receipts per account.
  insert into liftlog_private.sync_heads (user_id) values (owner_id) on conflict (user_id) do nothing;
  select h.revision into last_revision from liftlog_private.sync_heads as h where h.user_id = owner_id for update;
  request_hash_value := encode(sha256(convert_to(p_changes::text, 'UTF8')), 'hex');
  select h.request_hash into prior_hash from liftlog_private.receipts as h where h.user_id = owner_id and h.batch_id = p_batch_id;
  if prior_hash is not null and prior_hash <> request_hash_value then
    raise exception 'LiftLog batch ID was already used.' using errcode = '22023';
  end if;

  if prior_hash is null then
    if exists (
      select 1 from jsonb_to_recordset(p_changes) as i(kind text, record_id text)
      group by i.kind, i.record_id having count(*) > 1
    ) then raise exception 'Duplicate records in LiftLog batch.' using errcode = '22023'; end if;

    for change_item in select * from jsonb_to_recordset(p_changes) as i(kind text, record_id text, seen_revision bigint, payload jsonb) loop
      if change_item.kind is null or change_item.kind not in ('profiles', 'workouts', 'workoutExercises', 'sets', 'customExercises', 'favourites', 'foodLogs', 'nutritionGoals', 'customFoods')
        or change_item.record_id is null or length(change_item.record_id) not between 1 and 160
        or change_item.seen_revision is null or change_item.seen_revision not between 0 and last_revision
        or (change_item.kind = 'profiles' and change_item.record_id <> 'guest')
        or (change_item.kind = 'nutritionGoals' and change_item.record_id <> 'daily')
        or (change_item.payload is not null and (
          jsonb_typeof(change_item.payload) <> 'object' or change_item.payload->>'id' is distinct from change_item.record_id
          or pg_column_size(change_item.payload) > 65000
        )) then raise exception 'Invalid LiftLog record.' using errcode = '22023'; end if;

      select r.* into stored from liftlog_private.records as r
        where r.user_id = owner_id and r.kind = change_item.kind and r.record_id = change_item.record_id;
      if found then
        -- A delayed edit cannot resurrect a record deleted on another device.
        if stored.payload is null and change_item.seen_revision < stored.revision then continue; end if;
        if stored.payload is not distinct from change_item.payload then continue; end if;
      end if;

      last_revision := last_revision + 1;
      insert into liftlog_private.records as r (user_id, kind, record_id, revision, payload)
        values (owner_id, change_item.kind, change_item.record_id, last_revision, change_item.payload)
        on conflict on constraint records_pkey do update set revision = excluded.revision, payload = excluded.payload;
    end loop;

    update liftlog_private.sync_heads as h set revision = last_revision where h.user_id = owner_id;
    insert into liftlog_private.receipts (user_id, batch_id, request_hash) values (owner_id, p_batch_id, request_hash_value);
  end if;

  return query select r.kind, r.record_id, r.revision, r.payload
    from jsonb_to_recordset(p_changes) as i(kind text, record_id text)
    join liftlog_private.records as r on r.user_id = owner_id and r.kind = i.kind and r.record_id = i.record_id;
end;
$$;

create or replace function public.liftlog_delete_account(p_owner uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := liftlog_private.require_owner(p_owner);
begin
  delete from auth.users as u where u.id = owner_id;
end;
$$;

revoke all on function public.liftlog_cloud_ready() from public, anon, authenticated;
revoke all on function public.liftlog_sync_pull(uuid, bigint) from public, anon, authenticated;
revoke all on function public.liftlog_sync_push(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.liftlog_delete_account(uuid) from public, anon, authenticated;
grant execute on function public.liftlog_cloud_ready() to anon, authenticated;
grant execute on function public.liftlog_sync_pull(uuid, bigint) to authenticated;
grant execute on function public.liftlog_sync_push(uuid, uuid, jsonb) to authenticated;
grant execute on function public.liftlog_delete_account(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
