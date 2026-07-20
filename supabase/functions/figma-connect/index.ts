// Figma OAuth connection management for the signed-in researcher.
// Actions: start (build authorize URL), status (is connected?), disconnect.
// The Figma access/refresh tokens live only in the figma_connections table and
// are never returned to the client.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

const FIGMA_CLIENT_ID = Deno.env.get("FIGMA_CLIENT_ID") ?? "";
const CALLBACK_URL = `${Deno.env.get("SUPABASE_URL") ?? ""}/functions/v1/figma-oauth-callback`;
const FIGMA_SCOPE = "file_content:read";

const json = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const parseBearerToken = (req: Request) => {
  const header = req.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.replace(/^Bearer\s+/i, "").trim();
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const token = parseBearerToken(req);
    const { data: { user }, error: userError } = await supabase.auth.getUser(token ?? "");
    if (userError || !user) return json({ error: "unauthorized" }, 401);

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = (body.action as string) || "status";

    if (action === "status") {
      const { data } = await supabase
        .from("figma_connections")
        .select("figma_user_id, updated_at")
        .eq("user_id", user.id)
        .maybeSingle();
      return json({ connected: Boolean(data), figmaUserId: data?.figma_user_id ?? null });
    }

    if (action === "disconnect") {
      await supabase.from("figma_connections").delete().eq("user_id", user.id);
      return json({ connected: false });
    }

    if (action === "start") {
      if (!FIGMA_CLIENT_ID) return json({ error: "figma_not_configured" }, 500);
      const returnOrigin = typeof body.returnOrigin === "string" && body.returnOrigin
        ? body.returnOrigin
        : "https://beta.searcho.online";
      const state = crypto.randomUUID();

      const { error: stateError } = await supabase
        .from("figma_oauth_states")
        .insert({ state, user_id: user.id, return_origin: returnOrigin });
      if (stateError) return json({ error: "state_persist_failed" }, 500);

      const url = new URL("https://www.figma.com/oauth");
      url.searchParams.set("client_id", FIGMA_CLIENT_ID);
      url.searchParams.set("redirect_uri", CALLBACK_URL);
      url.searchParams.set("scope", FIGMA_SCOPE);
      url.searchParams.set("state", state);
      url.searchParams.set("response_type", "code");

      return json({ url: url.toString() });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (error) {
    console.error("figma-connect error:", error instanceof Error ? error.message : error);
    return json({ error: "internal_error" }, 500);
  }
});
