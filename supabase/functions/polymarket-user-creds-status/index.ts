import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient } from "../_shared/supabase-admin.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return jsonResp({ hasCreds: false });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return jsonResp({ hasCreds: false });
    }

    const adminClient = getServiceClient();
    const { data } = await adminClient
      .from("polymarket_user_creds")
      .select("address, updated_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!data) {
      return jsonResp({ hasCreds: false });
    }

    return jsonResp({
      hasCreds: true,
      address: data.address,
      updatedAt: data.updated_at,
    });
  } catch (err) {
    console.error("[user-creds-status] error:", err);
    return jsonResp({ hasCreds: false, error: err.message });
  }
});
