import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = new Set(["https://pixeluk.co.uk", "https://www.pixeluk.co.uk", "https://ryanmullenuk.github.io", "http://localhost:3000", "http://localhost:5173"]);
const corsHeaders = (request: Request) => ({
  "Access-Control-Allow-Origin": allowedOrigins.has(request.headers.get("origin") || "") ? request.headers.get("origin")! : "https://pixeluk.co.uk",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Vary": "Origin",
});
const json = (request: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders(request), "Content-Type": "application/json", "Cache-Control": "no-store" },
});

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "GET") return json(request, { error: "Method not allowed" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  const { data, error } = await supabase
    .from("pixels")
    .select("id,colour,owner_name,owner_title,owner_note,owner_link")
    .eq("status", "owned")
    .order("id");

  if (error) return json(request, { error: "Map data is temporarily unavailable" }, 500);
  const { count: available, error: countError } = await supabase
    .from("pixels")
    .select("id", { count: "exact", head: true })
    .eq("status", "available");
  if (countError) return json(request, { error: "Availability is temporarily unavailable" }, 500);
  return json(request, { owned: data, available: available || 0, total: 10_000 });
});
