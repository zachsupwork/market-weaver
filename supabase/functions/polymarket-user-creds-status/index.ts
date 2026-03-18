import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const adminClient = getServiceClient();
    const url = new URL(req.url);
    const addressParam = url.searchParams.get("address");

    // Try JWT-based lookup first
    const authHeader = req.headers.get("authorization");
    if (authHeader) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (user) {
        const { data } = await adminClient
          .from("polymarket_user_creds")
          .select("address, updated_at")
          .eq("user_id", user.id)
          .maybeSingle();

        if (data) {
          return jsonResp({
            hasCreds: true,
            address: data.address,
            updatedAt: data.updated_at,
          });
        }
      }
    }

    // Fallback: look up by wallet address
    if (addressParam) {
      const { data } = await adminClient
        .from("polymarket_user_creds")
        .select("address, updated_at")
        .eq("address", addressParam.toLowerCase())
        .order("updated_at", { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        return jsonResp({
          hasCreds: true,
          address: data[0].address,
          updatedAt: data[0].updated_at,
        });
      }
    }

    return jsonResp({ hasCreds: false });
  } catch (err) {
    console.error("[user-creds-status] error:", err);
    return jsonResp({ hasCreds: false, error: (err as any).message });
  }
});
