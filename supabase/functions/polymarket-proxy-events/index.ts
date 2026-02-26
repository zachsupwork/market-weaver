import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GAMMA_API = "https://gamma-api.polymarket.com";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const eventId = url.searchParams.get("id");
    const slug = url.searchParams.get("slug");

    let endpoint: string;
    if (eventId) {
      endpoint = `${GAMMA_API}/events/${encodeURIComponent(eventId)}`;
    } else if (slug) {
      endpoint = `${GAMMA_API}/events?slug=${encodeURIComponent(slug)}&limit=1`;
    } else {
      const qs = new URLSearchParams();
      const active = url.searchParams.get("active");
      const keyword = url.searchParams.get("_q");
      const limit = url.searchParams.get("limit") || "50";
      const offset = url.searchParams.get("offset") || "0";
      const order = url.searchParams.get("order") || "volume";
      const ascending = url.searchParams.get("ascending") || "false";

      qs.set("limit", limit);
      qs.set("offset", offset);
      qs.set("order", order);
      qs.set("ascending", ascending);
      if (active) qs.set("active", active);
      if (keyword) qs.set("_q", keyword);

      endpoint = `${GAMMA_API}/events?${qs}`;
    }

    const res = await fetch(endpoint, {
      headers: { "Accept": "application/json" },
    });

    if (!res.ok) {
      const text = await res.text();
      return new Response(
        JSON.stringify({ error: `Gamma API error: ${res.status}`, detail: text.substring(0, 200) }),
        { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await res.json();
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
