create extension if not exists pgcrypto;

create table if not exists public.pixel_orders (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'pending' check (status in ('pending', 'paid', 'expired', 'cancelled', 'refunded')),
  pixel_ids integer[] not null,
  colour text not null check (colour ~ '^#[0-9a-fA-F]{6}$'),
  owner_name text not null,
  owner_title text not null default '',
  owner_note text not null default '',
  owner_link text not null default '',
  buyer_email text not null,
  amount_total integer not null check (amount_total > 0),
  stripe_session_id text unique,
  stripe_payment_intent_id text,
  expires_at timestamptz not null,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pixels (
  id integer primary key check (id between 1 and 10000),
  status text not null default 'available' check (status in ('available', 'reserved', 'owned')),
  colour text,
  owner_name text,
  owner_title text,
  owner_note text,
  owner_link text,
  reservation_id uuid references public.pixel_orders(id) on delete set null,
  reserved_until timestamptz,
  purchased_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.pixels (id)
select id from generate_series(1, 10000) as id
on conflict (id) do nothing;

alter table public.pixels enable row level security;
alter table public.pixel_orders enable row level security;

drop policy if exists "Public can read map ownership" on public.pixels;
create policy "Public can read map ownership"
on public.pixels for select to anon, authenticated
using (true);

create or replace function public.reserve_pixels(
  p_pixel_ids integer[],
  p_colour text,
  p_owner_name text,
  p_owner_title text,
  p_owner_note text,
  p_owner_link text,
  p_buyer_email text
)
returns table(order_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ids integer[];
  v_order_id uuid := gen_random_uuid();
  v_expires_at timestamptz := now() + interval '30 minutes';
  v_unavailable integer[];
begin
  select array_agg(id order by id) into v_ids
  from (select distinct unnest(p_pixel_ids) as id) chosen;

  if coalesce(cardinality(v_ids), 0) < 1 or cardinality(v_ids) > 500 then
    raise exception 'Choose between 1 and 500 squares';
  end if;
  if exists (select 1 from unnest(v_ids) id where id < 1 or id > 10000) then
    raise exception 'Invalid square selection';
  end if;
  if p_colour !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Invalid colour'; end if;
  if length(trim(p_owner_name)) < 1 then raise exception 'Name is required'; end if;
  if length(trim(p_buyer_email)) < 3 then raise exception 'Email is required'; end if;

  update public.pixels
  set status = 'available', reservation_id = null, reserved_until = null, updated_at = now()
  where status = 'reserved' and reserved_until < now();

  update public.pixel_orders as pending_order
  set status = 'expired', updated_at = now()
  where pending_order.status = 'pending' and pending_order.expires_at < now();

  perform id from public.pixels where id = any(v_ids) order by id for update;

  select array_agg(id order by id) into v_unavailable
  from public.pixels where id = any(v_ids) and status <> 'available';
  if v_unavailable is not null then
    raise exception 'Some selected squares are no longer available: %', array_to_string(v_unavailable, ', ');
  end if;

  insert into public.pixel_orders (
    id, pixel_ids, colour, owner_name, owner_title, owner_note, owner_link,
    buyer_email, amount_total, expires_at
  ) values (
    v_order_id, v_ids, lower(p_colour), trim(p_owner_name), trim(p_owner_title),
    trim(p_owner_note), trim(p_owner_link), lower(trim(p_buyer_email)),
    cardinality(v_ids) * 200, v_expires_at
  );

  update public.pixels
  set status = 'reserved', reservation_id = v_order_id,
      reserved_until = v_expires_at, updated_at = now()
  where id = any(v_ids);

  return query select v_order_id, v_expires_at;
end;
$$;

create or replace function public.attach_checkout_session(p_order_id uuid, p_session_id text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.pixel_orders set stripe_session_id = p_session_id, updated_at = now()
  where id = p_order_id and status = 'pending';
  if not found then raise exception 'Reservation not found'; end if;
end;
$$;

create or replace function public.release_reservation(p_order_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.pixels
  set status = 'available', reservation_id = null, reserved_until = null, updated_at = now()
  where reservation_id = p_order_id and status = 'reserved';
  update public.pixel_orders set status = 'cancelled', updated_at = now()
  where id = p_order_id and status = 'pending';
end;
$$;

create or replace function public.complete_pixel_order(
  p_order_id uuid,
  p_session_id text,
  p_payment_intent_id text
)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_order public.pixel_orders%rowtype;
  v_owned_count integer;
begin
  select * into v_order from public.pixel_orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status = 'paid' then return; end if;
  if v_order.status <> 'pending' or v_order.stripe_session_id <> p_session_id then
    raise exception 'Order cannot be completed';
  end if;

  update public.pixels
  set status = 'owned', colour = v_order.colour, owner_name = v_order.owner_name,
      owner_title = v_order.owner_title, owner_note = v_order.owner_note,
      owner_link = v_order.owner_link, purchased_at = now(), reserved_until = null,
      updated_at = now()
  where reservation_id = p_order_id and status = 'reserved';
  get diagnostics v_owned_count = row_count;
  if v_owned_count <> cardinality(v_order.pixel_ids) then
    raise exception 'Reserved square count mismatch';
  end if;

  update public.pixel_orders
  set status = 'paid', stripe_payment_intent_id = p_payment_intent_id,
      paid_at = now(), updated_at = now()
  where id = p_order_id;
end;
$$;

revoke all on function public.reserve_pixels(integer[], text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.attach_checkout_session(uuid, text) from public, anon, authenticated;
revoke all on function public.release_reservation(uuid) from public, anon, authenticated;
revoke all on function public.complete_pixel_order(uuid, text, text) from public, anon, authenticated;
grant execute on function public.reserve_pixels(integer[], text, text, text, text, text, text) to service_role;
grant execute on function public.attach_checkout_session(uuid, text) to service_role;
grant execute on function public.release_reservation(uuid) to service_role;
grant execute on function public.complete_pixel_order(uuid, text, text) to service_role;

grant select on public.pixels to anon, authenticated;
