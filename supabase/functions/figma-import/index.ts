// Compile a Figma prototype into Searcho's own player format.
//
// Anonymous participants can't emit Figma embed events, so we can't observe a
// live embed. Instead the researcher connects Figma read-only once and we pull
// the prototype's frames (as PNGs we host), their click hotspots and the file's
// named flows. Searcho then renders the prototype itself and knows exactly which
// screen a participant is on -> automatic task completion.
//
// The researcher's Figma tokens never leave this function.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  parseFigmaUrl,
  reachableFrames,
  resolveStartFrameId,
  walkDocument,
} from "../_shared/figmaPrototype.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

const FIGMA_CLIENT_ID = Deno.env.get("FIGMA_CLIENT_ID") ?? "";
const FIGMA_CLIENT_SECRET = Deno.env.get("FIGMA_CLIENT_SECRET") ?? "";

// Guard rails so one huge design file can't blow the function's time budget.
const MAX_FRAMES = 60;
const IMAGE_BATCH_SIZE = 20;

const FRAMES_BUCKET = "prototype-frames";

const json = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// ---- Figma token handling --------------------------------------------------

interface FigmaConnection {
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
}

/** Returns a usable access token, refreshing (and persisting) it when expired. */
const resolveAccessToken = async (userId: string, connection: FigmaConnection): Promise<string | null> => {
  const expiresAt = connection.expires_at ? new Date(connection.expires_at).getTime() : null;
  const stillValid = expiresAt === null || expiresAt - Date.now() > 60_000;
  if (stillValid) return connection.access_token;
  if (!connection.refresh_token) return null;

  const basic = btoa(`${FIGMA_CLIENT_ID}:${FIGMA_CLIENT_SECRET}`);
  const response = await fetch("https://api.figma.com/v1/oauth/refresh", {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: connection.refresh_token }),
  });
  if (!response.ok) return null;

  const refreshed = await response.json();
  if (!refreshed?.access_token) return null;

  await supabase
    .from("figma_connections")
    .update({
      access_token: refreshed.access_token,
      expires_at: typeof refreshed.expires_in === "number"
        ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
        : null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  return refreshed.access_token;
};

// ---- Frame images ----------------------------------------------------------

const storagePath = (projectId: string, fileKey: string, frameId: string) =>
  `${projectId}/${fileKey}/${frameId.replace(/[^A-Za-z0-9]/g, "-")}.png`;

/**
 * Render each frame as a PNG and copy it into our own bucket — Figma's rendered
 * image URLs expire within the hour, and participants may open the study days
 * later.
 */
const renderAndStoreFrames = async (
  fileKey: string,
  projectId: string,
  frameIds: string[],
  accessToken: string,
): Promise<Map<string, string>> => {
  const urls = new Map<string, string>();

  for (let index = 0; index < frameIds.length; index += IMAGE_BATCH_SIZE) {
    const batch = frameIds.slice(index, index + IMAGE_BATCH_SIZE);
    const endpoint = `https://api.figma.com/v1/images/${fileKey}?ids=${encodeURIComponent(batch.join(","))}&format=png&scale=2`;
    const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) {
      console.error("figma image render failed:", response.status);
      continue;
    }
    const payload = await response.json();
    for (const [frameId, imageUrl] of Object.entries(payload?.images ?? {})) {
      if (typeof imageUrl === "string") urls.set(frameId, imageUrl);
    }
  }

  const stored = new Map<string, string>();

  await Promise.all(
    [...urls.entries()].map(async ([frameId, imageUrl]) => {
      try {
        const imageResponse = await fetch(imageUrl);
        if (!imageResponse.ok) return;
        const bytes = new Uint8Array(await imageResponse.arrayBuffer());
        const path = storagePath(projectId, fileKey, frameId);

        const { error } = await supabase.storage
          .from(FRAMES_BUCKET)
          .upload(path, bytes, { contentType: "image/png", upsert: true });
        if (error) {
          console.error("frame upload failed:", error.message);
          return;
        }

        const { data } = supabase.storage.from(FRAMES_BUCKET).getPublicUrl(path);
        if (data?.publicUrl) stored.set(frameId, data.publicUrl);
      } catch (error) {
        console.error("frame fetch failed:", error instanceof Error ? error.message : error);
      }
    }),
  );

  return stored;
};

// ---- Handler ---------------------------------------------------------------

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

    const body = await req.json().catch(() => ({}));
    const prototypeUrl = typeof body.prototypeUrl === "string" ? body.prototypeUrl : "";
    const projectId = typeof body.projectId === "string" ? body.projectId : "";

    if (!prototypeUrl || !projectId) return json({ error: "missing_parameters" }, 400);

    const { data: project } = await supabase
      .from("projects")
      .select("id, analysis")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!project) return json({ error: "project_not_found" }, 404);

    const parsed = parseFigmaUrl(prototypeUrl);
    if (!parsed) return json({ error: "invalid_prototype_url" }, 400);

    const { data: connection } = await supabase
      .from("figma_connections")
      .select("access_token, refresh_token, expires_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!connection) return json({ error: "figma_not_connected" }, 412);

    const accessToken = await resolveAccessToken(user.id, connection as FigmaConnection);
    if (!accessToken) return json({ error: "figma_token_expired" }, 412);

    const fileResponse = await fetch(`https://api.figma.com/v1/files/${parsed.fileKey}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (fileResponse.status === 403 || fileResponse.status === 404) {
      // The connected Figma account isn't a member of this file's team.
      return json({ error: "figma_file_not_accessible" }, 403);
    }
    if (!fileResponse.ok) {
      console.error("figma file fetch failed:", fileResponse.status);
      return json({ error: "figma_file_fetch_failed" }, 502);
    }

    const file = await fileResponse.json();
    const { frames: allFrames, flows, documentStartFrameId } = walkDocument(file?.document ?? {});
    if (allFrames.length === 0) return json({ error: "no_frames_found" }, 422);

    const startFrameId = resolveStartFrameId(allFrames, [
      parsed.nodeId,
      flows[0]?.startFrameId,
      documentStartFrameId,
    ]);

    const frames = reachableFrames(allFrames, startFrameId, MAX_FRAMES);
    const imageUrls = await renderAndStoreFrames(
      parsed.fileKey,
      projectId,
      frames.map((frame) => frame.id),
      accessToken,
    );

    const keptIds = new Set(frames.filter((frame) => imageUrls.has(frame.id)).map((frame) => frame.id));
    const compiled = {
      fileKey: parsed.fileKey,
      startFrameId,
      importedAt: new Date().toISOString(),
      frames: frames
        .filter((frame) => keptIds.has(frame.id))
        .map((frame) => ({
          id: frame.id,
          name: frame.name,
          imageUrl: imageUrls.get(frame.id)!,
          width: frame.width,
          height: frame.height,
          // Drop hotspots pointing outside the imported set so the player never
          // navigates to a frame it has no image for.
          hotspots: frame.hotspots.filter((hotspot) => keptIds.has(hotspot.targetFrameId)),
        })),
      flows: flows.filter((flow) => keptIds.has(flow.startFrameId)),
    };

    if (compiled.frames.length === 0) return json({ error: "frame_render_failed" }, 502);

    const analysis = (project.analysis ?? {}) as Record<string, unknown>;
    const usabilityTesting = (analysis.usabilityTesting ?? {}) as Record<string, unknown>;
    const { error: updateError } = await supabase
      .from("projects")
      .update({ analysis: { ...analysis, usabilityTesting: { ...usabilityTesting, prototype: compiled } } })
      .eq("id", projectId)
      .eq("user_id", user.id);
    if (updateError) {
      console.error("prototype persist failed:", updateError.message);
      return json({ error: "persist_failed" }, 500);
    }

    return json({ prototype: compiled });
  } catch (error) {
    console.error("figma-import error:", error instanceof Error ? error.message : error);
    return json({ error: "internal_error" }, 500);
  }
});
