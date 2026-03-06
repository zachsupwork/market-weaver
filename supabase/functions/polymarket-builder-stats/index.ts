import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function buildL2Signature(secret: string, message: string): Promise<string> {
  const trimmed = secret.trim();
  const normalized = trimmed.replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const secretBytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) secretBytes[i] = binary.charCodeAt(i);

  const key = await crypto.subtle.importKey("raw", secretBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  const b64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_");
}

function jsonResp(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Simple in-memory cache (edge functions are short-lived, so this is per-invocation)
let cachedStats: { data: any; ts: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Validate admin token
  const adminToken = Deno.env.get("ADMIN_TOKEN");
  if (adminToken) {
    const provided = req.headers.get("x-admin-token");
    if (provided !== adminToken) {
      return jsonResp({ ok: false, error: "Unauthorized" }, 401);
    }
  }

  const builderKey = Deno.env.get("POLY_BUILDER_API_KEY");
  const builderSecret = Deno.env.get("POLY_BUILDER_SECRET");
  const builderPassphrase = Deno.env.get("POLY_BUILDER_PASSPHRASE");

  if (!builderKey || !builderSecret || !builderPassphrase) {
    return jsonResp({
      ok: true,
      configured: false,
      message: "Builder credentials not configured",
      stats: null,
    });
  }

  try {
    const clobHost = Deno.env.get("CLOB_HOST") || "https://clob.polymarket.com";

    // Try fetching builder rewards endpoint
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const method = "GET";
    const requestPath = "/rewards/builder";
    const message = timestamp + method + requestPath;
    const signature = await buildL2Signature(builderSecret, message);

    const rewardsRes = await fetch(`${clobHost}${requestPath}`, {
      method,
      headers: {
        "POLY_ADDRESS": "",
        "POLY_API_KEY": builderKey,
        "POLY_PASSPHRASE": builderPassphrase,
        "POLY_TIMESTAMP": timestamp,
        "POLY_SIGNATURE": signature,
        "Content-Type": "application/json",
      },
    });

    let rewardsData: any = null;
    let rewardsError: string | null = null;
    if (rewardsRes.ok) {
      rewardsData = await rewardsRes.json();
    } else {
      const body = await rewardsRes.text();
      rewardsError = `${rewardsRes.status}: ${body.substring(0, 300)}`;
      console.log(`[builder-stats] Rewards endpoint returned ${rewardsRes.status}: ${body.substring(0, 200)}`);
    }

    // Try fetching builder profile/info
    const ts2 = Math.floor(Date.now() / 1000).toString();
    const profilePath = "/builder/profile";
    const profileMsg = ts2 + "GET" + profilePath;
    const profileSig = await buildL2Signature(builderSecret, profileMsg);

    const profileRes = await fetch(`${clobHost}${profilePath}`, {
      method: "GET",
      headers: {
        "POLY_API_KEY": builderKey,
        "POLY_PASSPHRASE": builderPassphrase,
        "POLY_TIMESTAMP": ts2,
        "POLY_SIGNATURE": profileSig,
        "Content-Type": "application/json",
      },
    });

    let profileData: any = null;
    if (profileRes.ok) {
      profileData = await profileRes.json();
    } else {
      console.log(`[builder-stats] Profile endpoint returned ${profileRes.status}`);
    }

    return jsonResp({
      ok: true,
      configured: true,
      builderKeyPrefix: builderKey.substring(0, 8) + "…",
      rewards: rewardsData,
      rewardsError,
      profile: profileData,
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[builder-stats] error:", err);
    return jsonResp({ ok: false, error: err.message }, 500);
  }
});
