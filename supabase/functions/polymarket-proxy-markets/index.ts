import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GAMMA_API = "https://gamma-api.polymarket.com";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const limit = url.searchParams.get("limit") || "50";
    const offset = url.searchParams.get("offset") || "0";
    const closed = url.searchParams.get("closed") || "false";
    const slug = url.searchParams.get("slug");
    const tag = url.searchParams.get("tag");
    const text = url.searchParams.get("text");

    let endpoint: string;
    if (slug) {
      endpoint = `${GAMMA_API}/markets?slug=${encodeURIComponent(slug)}&limit=1`;
    } else {
      const qs = new URLSearchParams();
      qs.set("closed", closed);
      qs.set("limit", limit);
      qs.set("offset", offset);
      qs.set("order", "volume24hr");
      qs.set("ascending", "false");
      qs.set("active", "true");
      if (tag) qs.set("tag", tag);
      if (text) qs.set("_q", text);
      endpoint = `${GAMMA_API}/markets?${qs}`;
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
