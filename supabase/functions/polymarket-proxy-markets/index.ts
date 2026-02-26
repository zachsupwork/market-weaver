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
    const limit = url.searchParams.get("limit") || "50";
    const offset = url.searchParams.get("offset") || "0";
    const closed = url.searchParams.get("closed") || "false";
    const slug = url.searchParams.get("slug");
    const tag = url.searchParams.get("tag");
    const text = url.searchParams.get("text");
    const conditionId = url.searchParams.get("condition_id");

    let endpoint: string;
    if (conditionId) {
      // Gamma's condition_id filter is unreliable - fetch broader set and filter server-side
      // Try multiple query approaches for best results
      endpoint = `${GAMMA_API}/markets?condition_id=${encodeURIComponent(conditionId)}&limit=20`;
    } else if (slug) {
      endpoint = `${GAMMA_API}/markets?slug=${encodeURIComponent(slug)}&limit=1`;
    } else {
      const qs = new URLSearchParams();
      qs.set("closed", closed);
      qs.set("limit", limit);
      qs.set("offset", offset);
      qs.set("order", "volume24hr");
      qs.set("ascending", "false");
      qs.set("active", "true");
      qs.set("archived", "false");
      if (tag) qs.set("tag", tag);
      if (text) qs.set("_q", text);
      endpoint = `${GAMMA_API}/markets?${qs}`;
    }

    const res = await fetch(endpoint, {
      headers: { "Accept": "application/json" },
    });

    if (!res.ok) {
      const errText = await res.text();
      return new Response(
        JSON.stringify({ error: `Gamma API error: ${res.status}`, detail: errText.substring(0, 200) }),
        { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let data = await res.json();

    // If searching by condition_id, do exact server-side filtering
    if (conditionId && Array.isArray(data)) {
      const needle = conditionId.toLowerCase();
      const exactMatch = data.filter((m: any) => {
        const cid = String(m.condition_id ?? m.conditionId ?? m.conditionID ?? "").trim().toLowerCase();
        return cid === needle;
      });
      
      if (exactMatch.length > 0) {
        data = exactMatch;
      } else {
        // Gamma didn't return our market - try slug-based search as fallback
        // Return empty array so client knows it's not found
        data = [];
      }
    }

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
