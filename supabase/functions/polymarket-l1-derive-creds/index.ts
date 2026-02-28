import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encrypt } from "../_shared/crypto.ts";
import { getServiceClient } from "../_shared/supabase-admin.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResp(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function tryDecodeBase64(input: string): Uint8Array | null {
  try {
    const normalized = input.replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function toUrlSafeBase64(base64: string, keepPadding = true): string {
  const converted = base64.replace(/\+/g, "-").replace(/\//g, "_");
  return keepPadding ? converted : converted.replace(/=+$/g, "");
}

async function hmacSignFromBytes(
  secretBytes: Uint8Array,
  message: string,
  mode: "std" | "urlsafe_padded" | "urlsafe_unpadded" = "urlsafe_padded"
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  const b64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  if (mode === "std") return b64;
  return toUrlSafeBase64(b64, mode === "urlsafe_padded");
}

async function buildSignatureCandidates(secret: string, message: string): Promise<Array<{ value: string; mode: string }>> {
  const trimmed = secret.trim();
  const variants: Array<{ bytes: Uint8Array; source: string }> = [];

  const decoded = tryDecodeBase64(trimmed);
  if (decoded) variants.push({ bytes: decoded, source: "base64" });
  variants.push({ bytes: new TextEncoder().encode(trimmed), source: "raw" });

  const out: Array<{ value: string; mode: string }> = [];
  const seen = new Set<string>();

  const formats: Array<"urlsafe_padded" | "std" | "urlsafe_unpadded"> = ["urlsafe_padded", "std", "urlsafe_unpadded"];

  for (const variant of variants) {
    for (const format of formats) {
      const value = await hmacSignFromBytes(variant.bytes, message, format);
      if (seen.has(value)) continue;
      seen.add(value);
      out.push({ value, mode: `${variant.source}:${format}` });
    }
  }

  return out;
}

async function sleep(ms: number) {
  return await new Promise((resolve) => setTimeout(resolve, ms));
}

async function validateDerivedCreds(
  clobHost: string,
  address: string,
  creds: { apiKey: string; secret: string; passphrase: string }
): Promise<{ ok: boolean; status?: number; body?: string; mode?: string; usedAddress?: string }> {
  const method = "GET";
  const requestPath = "/auth/api-keys";
  const addressCandidates = Array.from(new Set([address, address.toLowerCase()].map((v) => v.trim()).filter(Boolean)));

  let lastStatus: number | undefined;
  let lastBody = "";

  // Newly created keys can take a moment to propagate; retry before treating as failure.
  for (let attempt = 1; attempt <= 3; attempt++) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signMessage = timestamp + method + requestPath;
    const signatures = await buildSignatureCandidates(creds.secret, signMessage);

    for (const addr of addressCandidates) {
      for (const sig of signatures) {
        const res = await fetch(`${clobHost}${requestPath}`, {
          method,
          headers: {
            "POLY_ADDRESS": addr,
            "POLY_API_KEY": creds.apiKey,
            "POLY_PASSPHRASE": creds.passphrase,
            "POLY_TIMESTAMP": timestamp,
            "POLY_SIGNATURE": sig.value,
          },
        });

        const body = await res.text();
        lastStatus = res.status;
        lastBody = body.substring(0, 500);

        if (res.ok) {
          return { ok: true, status: res.status, body: lastBody, mode: sig.mode, usedAddress: addr };
        }
      }
    }

    if (attempt < 3) {
      await sleep(500 * attempt);
    }
  }

  return { ok: false, status: lastStatus, body: lastBody };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResp({ ok: false, error: "POST required" }, 405);
  }

  try {
    // ── Authenticate user via Supabase JWT ────────────────────────
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return jsonResp({ ok: false, error: "Authorization header required" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return jsonResp({ ok: false, error: "Invalid or expired auth token" }, 401);
    }

    // ── Parse input ──────────────────────────────────────────────
    const body = await req.json();
    const { address, signature, timestamp, nonce: rawNonce } = body;

    if (!address || !signature) {
      return jsonResp({ ok: false, error: "address and signature required" }, 400);
    }

    // Use client-provided timestamp/nonce so they match the signed EIP-712 message
    if (!timestamp || !/^\d{10,}$/.test(timestamp)) {
      return jsonResp({ ok: false, error: "Invalid timestamp — must be numeric unix seconds" }, 400);
    }
    const nonce = rawNonce ?? "0";
    if (!/^\d+$/.test(nonce)) {
      return jsonResp({ ok: false, error: "Invalid nonce — must be a numeric string" }, 400);
    }

    const clobHost = Deno.env.get("CLOB_HOST") || "https://clob.polymarket.com";

    const l1Headers: Record<string, string> = {
      "POLY_ADDRESS": address,
      "POLY_SIGNATURE": signature,
      "POLY_TIMESTAMP": timestamp,
      "POLY_NONCE": nonce,
    };

    console.log(`[l1-derive] Attempting derive for user=${user.id}, address=${address.slice(0, 10)}..., ts=${timestamp}, nonce=${nonce}`);

    // ── Step 1: Try POST /auth/api-key (create) ─────────────────
    let creds: { apiKey: string; secret: string; passphrase: string } | null = null;

    const createRes = await fetch(`${clobHost}/auth/api-key`, {
      method: "POST",
      headers: l1Headers,
    });

    const createBody = await createRes.text();
    console.log(`[l1-derive] create response status=${createRes.status} body=${createBody.substring(0, 500)}`);

    if (createRes.ok) {
      try {
        creds = JSON.parse(createBody);
      } catch {
        console.error("[l1-derive] Failed to parse create response as JSON");
      }
    } else {
      // NONCE_ALREADY_USED or other 400 → fallback to derive
      console.log(`[l1-derive] Create failed (${createRes.status}), falling back to GET /auth/derive-api-key`);
    }

    // ── Step 2: Fallback to GET /auth/derive-api-key ────────────
    if (!creds || !creds.apiKey) {
      const deriveRes = await fetch(`${clobHost}/auth/derive-api-key`, {
        method: "GET",
        headers: l1Headers,
      });

      const deriveBody = await deriveRes.text();
      console.log(`[l1-derive] derive response status=${deriveRes.status} body=${deriveBody.substring(0, 500)}`);

      if (!deriveRes.ok) {
        console.error(`[l1-derive] Both create and derive failed. create=${createRes.status} derive=${deriveRes.status}`);
        return jsonResp({
          ok: false,
          error: `Polymarket rejected credentials (create=${createRes.status}, derive=${deriveRes.status}): ${deriveBody.substring(0, 300)}`,
        }, 502);
      }

      try {
        creds = JSON.parse(deriveBody);
      } catch {
        return jsonResp({ ok: false, error: `Invalid JSON from Polymarket derive: ${deriveBody.substring(0, 200)}` }, 502);
      }
    }

    if (!creds?.apiKey || !creds?.secret || !creds?.passphrase) {
      return jsonResp({ ok: false, error: "Incomplete credentials returned from Polymarket" }, 502);
    }

    // Validate credentials immediately, but don't hard-fail on transient propagation delays.
    const validation = await validateDerivedCreds(clobHost, address, creds);
    if (!validation.ok) {
      console.error(`[l1-derive] Validation failed status=${validation.status} body=${validation.body}`);
      console.warn("[l1-derive] Proceeding to store newly-created creds despite failed immediate validation (will self-heal via order-time invalidation if truly bad)");
    } else {
      console.log(`[l1-derive] Validation passed mode=${validation.mode} addr=${validation.usedAddress}`);
    }

    // ── Encrypt and store per-user ───────────────────────────────
    const masterKey = Deno.env.get("MASTER_KEY");
    if (!masterKey) {
      return jsonResp({ ok: false, error: "MASTER_KEY not configured" }, 500);
    }

    const credsPayload = JSON.stringify({
      apiKey: creds.apiKey,
      secret: creds.secret,
      passphrase: creds.passphrase,
    });

    const { encrypted, iv, authTag } = await encrypt(credsPayload, masterKey);

    const adminClient = getServiceClient();
    const { error: upsertError } = await adminClient
      .from("polymarket_user_creds")
      .upsert(
        {
          user_id: user.id,
          address: address.toLowerCase(),
          value_encrypted: encrypted,
          iv,
          auth_tag: authTag,
        },
        { onConflict: "user_id" }
      );

    if (upsertError) {
      console.error("[l1-derive] DB upsert error:", upsertError.message);
      return jsonResp({ ok: false, error: "Failed to store credentials" }, 500);
    }

    console.log(`[l1-derive] Credentials stored for user=${user.id}`);
    return jsonResp({ ok: true });
  } catch (err) {
    console.error("[l1-derive] error:", err);
    return jsonResp({ ok: false, error: err.message }, 500);
  }
});
