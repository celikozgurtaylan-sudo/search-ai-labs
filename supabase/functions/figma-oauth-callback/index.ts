// Public OAuth redirect target for the Figma authorization-code flow.
// Figma sends the browser here with ?code&state; we swap the code for tokens
// server-side and store them in figma_connections, then bounce the researcher
// back to the app. No token or secret ever reaches the browser.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

const FIGMA_CLIENT_ID = Deno.env.get("FIGMA_CLIENT_ID") ?? "";
const FIGMA_CLIENT_SECRET = Deno.env.get("FIGMA_CLIENT_SECRET") ?? "";
const CALLBACK_URL = `${Deno.env.get("SUPABASE_URL") ?? ""}/functions/v1/figma-oauth-callback`;

// The state row is inserted with the researcher's own origin; anything older
// than this is treated as a stale/replayed round trip.
const STATE_MAX_AGE_MS = 15 * 60 * 1000;

const redirect = (origin: string, status: "connected" | "failed", reason?: string) => {
  let target: URL;
  try {
    target = new URL(origin);
  } catch {
    target = new URL("https://beta.searcho.online");
  }
  target.searchParams.set("figma", status);
  if (reason) target.searchParams.set("figma_error", reason);
  return new Response(null, { status: 302, headers: { Location: target.toString() } });
};

serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const fallbackOrigin = "https://beta.searcho.online";

  if (!state) return redirect(fallbackOrigin, "failed", "missing_state");

  try {
    const { data: stateRow } = await supabase
      .from("figma_oauth_states")
      .select("state, user_id, return_origin, created_at")
      .eq("state", state)
      .maybeSingle();

    // Single-use: burn the state whether or not the rest succeeds.
    await supabase.from("figma_oauth_states").delete().eq("state", state);

    if (!stateRow) return redirect(fallbackOrigin, "failed", "unknown_state");

    const returnOrigin = stateRow.return_origin || fallbackOrigin;

    if (Date.now() - new Date(stateRow.created_at).getTime() > STATE_MAX_AGE_MS) {
      return redirect(returnOrigin, "failed", "expired_state");
    }

    // Figma sends ?error=access_denied when the researcher declines consent.
    const oauthError = url.searchParams.get("error");
    if (oauthError) return redirect(returnOrigin, "failed", oauthError);
    if (!code) return redirect(returnOrigin, "failed", "missing_code");

    if (!FIGMA_CLIENT_ID || !FIGMA_CLIENT_SECRET) {
      return redirect(returnOrigin, "failed", "figma_not_configured");
    }

    const basic = btoa(`${FIGMA_CLIENT_ID}:${FIGMA_CLIENT_SECRET}`);
    const tokenResponse = await fetch("https://api.figma.com/v1/oauth/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        redirect_uri: CALLBACK_URL,
        code,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      console.error("figma token exchange failed:", tokenResponse.status);
      return redirect(returnOrigin, "failed", "token_exchange_failed");
    }

    const tokens = await tokenResponse.json();
    if (!tokens?.access_token) return redirect(returnOrigin, "failed", "token_missing");

    const expiresAt = typeof tokens.expires_in === "number"
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

    const { error: upsertError } = await supabase
      .from("figma_connections")
      .upsert({
        user_id: stateRow.user_id,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? null,
        expires_at: expiresAt,
        figma_user_id: tokens.user_id ? String(tokens.user_id) : null,
        scope: tokens.scope ?? null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

    if (upsertError) {
      console.error("figma connection upsert failed:", upsertError.message);
      return redirect(returnOrigin, "failed", "persist_failed");
    }

    return redirect(returnOrigin, "connected");
  } catch (error) {
    console.error("figma-oauth-callback error:", error instanceof Error ? error.message : error);
    return redirect(fallbackOrigin, "failed", "internal_error");
  }
});
