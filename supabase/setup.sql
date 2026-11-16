-- Live sync for the trip schedule. Paste into Supabase: SQL Editor > New query > Run.
-- The table holds one encrypted row per trip. Its id is derived from the site password,
-- and its data is AES-encrypted in the browser, so Supabase never sees readable plans.
-- Visitors (anon key) cannot read or list the table directly: only these two functions.

create table if not exists public.trip_sync (
  id         text primary key check (char_length(id) = 64),
  data       text not null check (char_length(data) < 200000),
  version    int  not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.trip_sync enable row level security;
revoke all on public.trip_sync from anon, authenticated;

create or replace function public.trip_get(p_id text)
returns table (data text, version int)
language sql security definer set search_path = public
as $$
  select t.data, t.version from public.trip_sync t where t.id = p_id;
$$;

-- p_version = version you last read (0 = no row yet). Returns the new version,
-- or -1 if someone else saved first (the app then merges and retries).
create or replace function public.trip_put(p_id text, p_data text, p_version int)
returns int
language plpgsql security definer set search_path = public
as $$
declare v int;
begin
  if char_length(p_id) <> 64 or char_length(p_data) >= 200000 then
    raise exception 'bad input';
  end if;
  if p_version = 0 then
    insert into public.trip_sync (id, data) values (p_id, p_data)
    on conflict (id) do nothing
    returning trip_sync.version into v;
  else
    update public.trip_sync t
       set data = p_data, version = t.version + 1, updated_at = now()
     where t.id = p_id and t.version = p_version
    returning t.version into v;
  end if;
  return coalesce(v, -1);
end;
$$;

revoke all on function public.trip_get(text), public.trip_put(text, text, int) from public;
grant execute on function public.trip_get(text), public.trip_put(text, text, int) to anon;
