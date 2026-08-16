create or replace function public.reserve_pixels(
  p_pixel_ids integer[], p_colour text, p_owner_name text, p_owner_title text,
  p_owner_note text, p_owner_link text, p_buyer_email text
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
  select array_agg(chosen.id order by chosen.id) into v_ids
  from (select distinct unnest(p_pixel_ids) as id) chosen;

  if coalesce(cardinality(v_ids), 0) < 1 or cardinality(v_ids) > 500 then
    raise exception 'Choose between 1 and 500 squares';
  end if;
  if exists (select 1 from unnest(v_ids) selected_id where selected_id < 1 or selected_id > 10000) then
    raise exception 'Invalid square selection';
  end if;
  if p_colour !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Invalid colour'; end if;
  if length(trim(p_owner_name)) < 1 then raise exception 'Name is required'; end if;
  if length(trim(p_buyer_email)) < 3 then raise exception 'Email is required'; end if;

  update public.pixels as stale_pixel
  set status = 'available', reservation_id = null, reserved_until = null, updated_at = now()
  where stale_pixel.status = 'reserved' and stale_pixel.reserved_until < now();

  update public.pixel_orders as stale_order
  set status = 'expired', updated_at = now()
  where stale_order.status = 'pending' and stale_order.expires_at < now();

  perform locked_pixel.id
  from public.pixels as locked_pixel
  where locked_pixel.id = any(v_ids)
  order by locked_pixel.id
  for update;

  select array_agg(unavailable_pixel.id order by unavailable_pixel.id) into v_unavailable
  from public.pixels as unavailable_pixel
  where unavailable_pixel.id = any(v_ids) and unavailable_pixel.status <> 'available';
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

  update public.pixels as selected_pixel
  set status = 'reserved', reservation_id = v_order_id,
      reserved_until = v_expires_at, updated_at = now()
  where selected_pixel.id = any(v_ids);

  return query select v_order_id, v_expires_at;
end;
$$;

revoke all on function public.reserve_pixels(integer[], text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.reserve_pixels(integer[], text, text, text, text, text, text) to service_role;
