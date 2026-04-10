import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  generateAndPersistProjectReport,
  setProjectReportStatus,
} from "../_shared/project-report.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session-token",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

const extractBearerToken = (req: Request) => {
  const header = req.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.replace(/^Bearer\s+/i, "").trim();
};

async function validateResearcherAccess(projectId: string, jwt: string | null) {
  if (!jwt) return null;

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(jwt);

  if (userError || !user) return null;

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (projectError || !project) return null;
  return user;
}

async function validateSessionAccess(projectId: string, sessionId: string | null, sessionToken: string | null) {
  if (!sessionToken) return null;

  let query = supabase
    .from("study_sessions")
    .select("id, project_id")
    .eq("project_id", projectId)
    .eq("session_token", sessionToken);

  if (sessionId) {
    query = query.eq("id", sessionId);
  }

  const { data: session, error } = await query.maybeSingle();
  if (error || !session) return null;
  return session;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { projectId, sessionId = null, force = true } = await req.json();

    if (!projectId) {
      return new Response(
        JSON.stringify({ error: "Missing projectId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const researcher = await validateResearcherAccess(projectId, extractBearerToken(req));
    const session = researcher
      ? null
      : await validateSessionAccess(projectId, sessionId, req.headers.get("x-session-token"));

    if (!researcher && !session) {
      return new Response(
        JSON.stringify({ error: "Unauthorized analysis request" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("analysis")
      .eq("id", projectId)
      .single();

    if (projectError) {
      throw new Error(`Failed to load project analysis: ${projectError.message}`);
    }

    const existingReport = project?.analysis && typeof project.analysis === "object"
      ? (project.analysis as Record<string, unknown>).report
      : null;

    if (!force && existingReport && typeof existingReport === "object") {
      return new Response(
        JSON.stringify({
          status: (existingReport as Record<string, unknown>).status ?? null,
          report: existingReport,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const trigger = researcher ? "owner-regenerate" : "session-trigger";
    const triggerSessionId = session?.id ?? sessionId ?? null;

    await setProjectReportStatus(supabase, projectId, "generating", {
      trigger,
      triggerSessionId,
    });

    let report;
    try {
      report = await generateAndPersistProjectReport(supabase, projectId, {
        trigger,
        triggerSessionId,
      });
    } catch (error) {
      await setProjectReportStatus(supabase, projectId, "failed", {
        trigger,
        triggerSessionId,
        failureMessage: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }

    return new Response(
      JSON.stringify({ status: report.status, report }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Interview analysis error:", error);

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
