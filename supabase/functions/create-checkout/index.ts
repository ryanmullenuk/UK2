import Stripe from "npm:stripe@^22";
import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = new Set(["https://pixeluk.co.uk", "https://www.pixeluk.co.uk", "https://ryanmullenuk.github.io", "http://localhost:3000", "http://localhost:5173"]);
const corsHeaders = (request: Request) => ({
  "Access-Control-Allow-Origin": allowedOrigins.has(request.headers.get("origin") || "") ? request.headers.get("origin")! : "https://pixeluk.co.uk",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});
const json = (request: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders(request), "Content-Type": "application/json", "Cache-Control": "no-store" },
});

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "");
const siteUrl = Deno.env.get("SITE_URL") || "https://pixeluk.co.uk";

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);
  if (!Deno.env.get("STRIPE_SECRET_KEY")) return json(request, { error: "Checkout is not configured yet" }, 503);

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return json(request, { error: "Invalid checkout request" }, 400); }

  const pixelIds = Array.isArray(body.pixelIds)
    ? [...new Set(body.pixelIds.filter((id): id is number => Number.isInteger(id) && id >= 1 && id <= 10_000))]
    : [];
  const colour = clean(body.colour, 7).toLowerCase();
  const ownerName = clean(body.ownerName, 80);
  const ownerTitle = clean(body.ownerTitle, 120);
  const ownerNote = clean(body.ownerNote, 500);
  const ownerLink = clean(body.ownerLink, 300);
  const buyerEmail = clean(body.buyerEmail, 254).toLowerCase();

  if (!pixelIds.length || pixelIds.length > 500) return json(request, { error: "Choose between 1 and 500 squares" }, 400);
  if (!/^#[0-9a-f]{6}$/.test(colour)) return json(request, { error: "Choose a valid colour" }, 400);
  if (!ownerName) return json(request, { error: "Enter your name or brand" }, 400);
  if (!/^\S+@\S+\.\S+$/.test(buyerEmail)) return json(request, { error: "Enter a valid email address" }, 400);
  if (ownerLink && !/^https?:\/\//i.test(ownerLink)) return json(request, { error: "The destination link must start with http:// or https://" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  const { data: reservation, error: reserveError } = await supabase.rpc("reserve_pixels", {
    p_pixel_ids: pixelIds,
    p_colour: colour,
    p_owner_name: ownerName,
    p_owner_title: ownerTitle,
    p_owner_note: ownerNote,
    p_owner_link: ownerLink,
    p_buyer_email: buyerEmail,
  }).single();

  if (reserveError || !reservation) {
    const unavailable = reserveError?.message?.includes("no longer available");
    return json(request, { error: unavailable ? "One or more squares have just been reserved or purchased. Refresh the map and choose again." : "We could not reserve those squares. Please try again." }, unavailable ? 409 : 400);
  }

  const orderId = reservation.order_id as string;
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: buyerEmail,
      line_items: [{
        quantity: pixelIds.length,
        price_data: {
          currency: "gbp",
          unit_amount: 200,
          product_data: { name: "pixelUK map square", description: "Permanent ownership on the pixelUK map" },
        },
      }],
      metadata: { order_id: orderId },
      payment_intent_data: { metadata: { order_id: orderId } },
      success_url: `${siteUrl}/?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/?payment=cancelled`,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    });

    const { error: attachError } = await supabase.rpc("attach_checkout_session", { p_order_id: orderId, p_session_id: session.id });
    if (attachError) throw attachError;
    return json(request, { url: session.url });
  } catch (error) {
    await supabase.rpc("release_reservation", { p_order_id: orderId });
    console.error("Checkout creation failed", error);
    return json(request, { error: "Stripe Checkout could not be started. Your squares have been released." }, 500);
  }
});
