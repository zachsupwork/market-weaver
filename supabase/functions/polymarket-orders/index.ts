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

async function fetchClobOrders(
  clobHost: string,
  creds: { apiKey: string; secret: string; passphrase: string },
  polyAddress: string,
  state?: string,
): Promise<any[]> {
  const clobParams = new URLSearchParams();
  if (polyAddress) clobParams.set("maker", polyAddress);
  if (state) clobParams.set("state", state);

  const queryString = clobParams.toString();
  const requestPath = "/data/orders" + (queryString ? `?${queryString}` : "");

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signPath = "/data/orders";
  const signMessage = timestamp + "GET" + signPath;
  const signature = toUrlSafeBase64(await hmacSign(creds.secret, signMessage));

  const res = await fetch(`${clobHost}${requestPath}`, {
    method: "GET",
    headers: {
      "POLY_API_KEY": creds.apiKey,
      "POLY_PASSPHRASE": creds.passphrase,
      "POLY_TIMESTAMP": timestamp,
      "POLY_SIGNATURE": signature,
      "POLY_ADDRESS": polyAddress,
      "Accept": "application/json",
    },
  });

  const resBody = await res.text();
  if (!res.ok) {
    console.error(`[orders] CLOB error for state=${state || "none"}: ${res.status} ${resBody.substring(0, 200)}`);
    return [];
  }

  let parsed;
  try { parsed = JSON.parse(resBody); } catch { parsed = {}; }
  return Array.isArray(parsed) ? parsed : Array.isArray(parsed?.data) ? parsed.data : [];
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
    const statusFilter = url.searchParams.get("status"); // "ALL", "LIVE", "MATCHED", "CANCELLED"

    const clobHost = Deno.env.get("CLOB_HOST") || "https://clob.polymarket.com";
    const polyAddress = (credRow.address || "").toLowerCase();

    console.log(`[orders] user=${user.id} addr=${polyAddress} statusFilter=${statusFilter || "ALL"}`);

    let orders: any[];

    if (!statusFilter || statusFilter === "ALL") {
      // Fetch all states in parallel to get complete order history
      const [live, matched, cancelled] = await Promise.all([
        fetchClobOrders(clobHost, creds, polyAddress, "LIVE"),
        fetchClobOrders(clobHost, creds, polyAddress, "MATCHED"),
        fetchClobOrders(clobHost, creds, polyAddress, "CANCELLED"),
      ]);
      // Deduplicate by order id
      const seen = new Set<string>();
      orders = [];
      for (const o of [...live, ...matched, ...cancelled]) {
        const id = o.id || o.orderID || "";
        if (id && !seen.has(id)) {
          seen.add(id);
          orders.push(o);
        }
      }
      console.log(`[orders] ALL: live=${live.length} matched=${matched.length} cancelled=${cancelled.length} deduped=${orders.length}`);
    } else {
      orders = await fetchClobOrders(clobHost, creds, polyAddress, statusFilter);
      console.log(`[orders] ${statusFilter}: ${orders.length} orders`);
    }

    return jsonResp({ ok: true, orders, rawCount: orders.length });
  } catch (err) {
    console.error("[orders] Error:", err);
    return jsonResp({ ok: false, error: (err as any).message }, 500);
  }
});
