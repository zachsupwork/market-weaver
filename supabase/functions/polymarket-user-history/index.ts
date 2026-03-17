import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { decrypt } from "../_shared/crypto.ts";
import { getServiceClient } from "../_shared/supabase-admin.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function base64ToBytes(base64: string): Uint8Array {
  const sanitized = base64
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .replace(/[^A-Za-z0-9+/=]/g, "");
  const binary = atob(sanitized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toUrlSafeBase64(base64: string): string {
  return base64.replace(/\+/g, "-").replace(/\//g, "_");
}

async function hmacSign(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    base64ToBytes(secret.trim()).buffer as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message).buffer as ArrayBuffer);
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

function jsonResp(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Auth ──
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return jsonResp({ ok: false, error: "Authorization required" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return jsonResp({ ok: false, error: "Invalid auth token" }, 401);
    }

    // ── Load user creds ──
    const masterKey = Deno.env.get("MASTER_KEY");
    if (!masterKey) return jsonResp({ ok: false, error: "MASTER_KEY not configured" }, 500);

    const adminClient = getServiceClient();
    const { data: credRow } = await adminClient
      .from("polymarket_user_creds")
      .select("value_encrypted, iv, auth_tag, address")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!credRow) {
      return jsonResp({ ok: false, error: "No trading credentials. Enable trading first." }, 400);
    }

    const credsJson = await decrypt(credRow.value_encrypted, credRow.iv, credRow.auth_tag, masterKey);
    const creds = JSON.parse(credsJson);

    // ── Parse query params ──
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get("limit") || "100");
    const offset = parseInt(url.searchParams.get("offset") || "0");
    const typeFilter = url.searchParams.get("type") || "ALL"; // ALL, TRADES, ORDERS

    const clobHost = Deno.env.get("CLOB_HOST") || "https://clob.polymarket.com";
    const polyAddress = (credRow.address || "").toLowerCase();

    const results: any[] = [];

    // ── Fetch trades (filled orders) ──
    if (typeFilter === "ALL" || typeFilter === "TRADES") {
      try {
        const tradesPath = "/data/trades";
        const tradesParams = new URLSearchParams();
        tradesParams.set("maker_address", polyAddress);
        tradesParams.set("limit", String(limit));
        if (offset > 0) tradesParams.set("offset", String(offset));

        const tradesFullPath = `${tradesPath}?${tradesParams}`;
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const signMessage = timestamp + "GET" + tradesPath;
        const signature = toUrlSafeBase64(await hmacSign(creds.secret, signMessage));

        console.log(`[user-history] fetching trades for ${polyAddress}`);

        const res = await fetch(`${clobHost}${tradesFullPath}`, {
          headers: {
            "POLY_API_KEY": creds.apiKey,
            "POLY_PASSPHRASE": creds.passphrase,
            "POLY_TIMESTAMP": timestamp,
            "POLY_SIGNATURE": signature,
            "POLY_ADDRESS": polyAddress,
            "Accept": "application/json",
          },
        });

        const body = await res.text();
        console.log(`[user-history] trades status=${res.status} len=${body.length}`);

        if (res.ok) {
          let parsed;
          try { parsed = JSON.parse(body); } catch { parsed = []; }
          const trades = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.data) ? parsed.data : [];
          for (const t of trades) {
            results.push({
              type: t.side === "SELL" ? "SELL" : "BUY",
              market: t.market || t.title || "",
              outcome: t.outcome || "",
              price: parseFloat(t.price || "0"),
              size: parseFloat(t.size || t.amount || "0"),
              total: parseFloat(t.price || "0") * parseFloat(t.size || t.amount || "0"),
              status: "Filled",
              timestamp: t.match_time || t.created_at || t.timestamp || "",
              asset_id: t.asset_id || "",
              condition_id: t.market || "",
              tx_hash: t.transaction_hash || t.tx_hash || "",
              source: "trade",
            });
          }
        }
      } catch (err) {
        console.error("[user-history] trades fetch error:", (err as any).message);
      }
    }

    // ── Fetch orders (all states) ──
    if (typeFilter === "ALL" || typeFilter === "ORDERS") {
      try {
        const ordersPath = "/data/orders";
        const ordersParams = new URLSearchParams();
        ordersParams.set("maker", polyAddress);

        const ordersFullPath = `${ordersPath}?${ordersParams}`;
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const signMessage = timestamp + "GET" + ordersPath;
        const signature = toUrlSafeBase64(await hmacSign(creds.secret, signMessage));

        console.log(`[user-history] fetching orders for ${polyAddress}`);

        const res = await fetch(`${clobHost}${ordersFullPath}`, {
          headers: {
            "POLY_API_KEY": creds.apiKey,
            "POLY_PASSPHRASE": creds.passphrase,
            "POLY_TIMESTAMP": timestamp,
            "POLY_SIGNATURE": signature,
            "POLY_ADDRESS": polyAddress,
            "Accept": "application/json",
          },
        });

        const body = await res.text();
        console.log(`[user-history] orders status=${res.status} len=${body.length}`);

        if (res.ok) {
          let parsed;
          try { parsed = JSON.parse(body); } catch { parsed = []; }
          const orders = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.data) ? parsed.data : [];
          for (const o of orders) {
            const state = (o.status || o.state || "").toUpperCase();
            // Skip LIVE orders (those are in the orders tab, not history)
            if (state === "LIVE") continue;
            results.push({
              type: o.side === "SELL" ? "SELL" : "BUY",
              market: o.market || o.title || "",
              outcome: o.outcome || "",
              price: parseFloat(o.price || "0"),
              size: parseFloat(o.original_size || o.size || "0"),
              total: parseFloat(o.price || "0") * parseFloat(o.original_size || o.size || "0"),
              status: state === "MATCHED" ? "Filled" : state === "CANCELLED" ? "Cancelled" : state,
              timestamp: o.created_at || o.timestamp || "",
              asset_id: o.asset_id || "",
              condition_id: o.market || "",
              order_id: o.id || "",
              source: "order",
            });
          }
        }
      } catch (err) {
        console.error("[user-history] orders fetch error:", (err as any).message);
      }
    }

    // ── Fetch platform fees from DB ──
    if (typeFilter === "ALL" || typeFilter === "FEES") {
      try {
        const { data: fees } = await adminClient
          .from("platform_fees")
          .select("*")
          .eq("user_address", polyAddress)
          .order("created_at", { ascending: false })
          .limit(limit);

        if (fees) {
          for (const f of fees) {
            results.push({
              type: "FEE",
              market: f.order_condition_id || "",
              outcome: "",
              price: 0,
              size: parseFloat(f.fee_amount || "0"),
              total: parseFloat(f.fee_amount || "0"),
              status: "Completed",
              timestamp: f.created_at || "",
              tx_hash: f.tx_hash || "",
              condition_id: f.order_condition_id || "",
              source: "fee",
            });
          }
        }
      } catch (err) {
        console.error("[user-history] fees fetch error:", (err as any).message);
      }
    }

    // ── Sort by timestamp descending ──
    results.sort((a, b) => {
      const ta = new Date(a.timestamp).getTime() || 0;
      const tb = new Date(b.timestamp).getTime() || 0;
      return tb - ta;
    });

    // ── Deduplicate: trades already appear in orders as MATCHED ──
    const seen = new Set<string>();
    const deduped = results.filter((r) => {
      // Use asset_id + timestamp + size as dedup key
      const key = `${r.source}:${r.asset_id || r.order_id || ""}:${r.timestamp}:${r.size}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    console.log(`[user-history] user=${user.id} returning ${deduped.length} items (raw=${results.length})`);

    return jsonResp({
      ok: true,
      history: deduped.slice(offset, offset + limit),
      total: deduped.length,
      address: polyAddress,
    });
  } catch (err) {
    console.error("[user-history] Error:", err);
    return jsonResp({ ok: false, error: (err as any).message }, 500);
  }
});
