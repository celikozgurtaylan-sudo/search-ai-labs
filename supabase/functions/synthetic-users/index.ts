import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  findPersonaById,
  recommendSyntheticPersonas,
  type SyntheticPersona,
} from "../_shared/synthetic-personas.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

const MODEL = Deno.env.get("ORCHESTRATOR_MODEL") || "gpt-4.1";

const parseBearerToken = (req: Request) => {
  const header = req.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.replace(/^Bearer\s+/i, "").trim();
};

const asString = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const validateProjectOwner = async (projectId: string, token: string | null) => {
  if (!token) return null;

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(token);

  if (userError || !user) return null;

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, title, description, analysis")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (projectError || !project) return null;
  return { user, project };
};

const json = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const buildTopic = (project: Record<string, unknown>) => {
  const analysis = project.analysis && typeof project.analysis === "object" && !Array.isArray(project.analysis)
    ? project.analysis as Record<string, unknown>
    : {};
  const usability = analysis.usabilityTesting && typeof analysis.usabilityTesting === "object" && !Array.isArray(analysis.usabilityTesting)
    ? analysis.usabilityTesting as Record<string, unknown>
    : {};

  return [
    project.title,
    project.description,
    usability.objective,
    usability.primaryTask,
    usability.targetUsers,
    usability.successSignals,
    usability.riskAreas,
  ]
    .map((value) => asString(value))
    .filter(Boolean)
    .join("\n");
};

const sanitizePersonaSnapshot = (persona: SyntheticPersona) => ({
  id: persona.id,
  name: persona.name,
  group: persona.group,
  ageRange: persona.ageRange,
  occupation: persona.occupation,
  context: persona.context,
  goals: persona.goals,
  frustrations: persona.frustrations,
  traits: persona.traits,
  tags: persona.tags,
});

const loadSession = async (sessionId: string, projectId: string, userId: string) => {
  const { data: session, error } = await supabase
    .from("synthetic_user_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load synthetic session: ${error.message}`);
  return session;
};

const loadMessages = async (sessionId: string) => {
  const { data, error } = await supabase
    .from("synthetic_user_messages")
    .select("id, role, content, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to load synthetic messages: ${error.message}`);
  return data ?? [];
};

const buildPersonaSystemPrompt = (persona: SyntheticPersona, project: Record<string, unknown>) => `Sen Searcho icinde arastirmaciyla konusan SENTETIK bir kullanici personasin.

Kimlik:
- Ad: ${persona.name}
- Grup: ${persona.group}
- Yas araligi: ${persona.ageRange}
- Meslek/baglam: ${persona.occupation}
- Durum: ${persona.context}
- Hedefler: ${persona.goals.join(", ")}
- Frustrasyonlar: ${persona.frustrations.join(", ")}
- Davranis ozellikleri: ${persona.traits.join(", ")}

Arastirma konusu:
${buildTopic(project)}

Kurallar:
- Her zaman sentetik bir persona oldugunu unut; gercek katilimci veya gercek deneyim iddia etme.
- Arastirmacinin sorularina bu personanin bakis acisindan cevap ver.
- Ekran, Figma prototipi veya arayuz hakkinda yalnizca arastirmacinin mesajinda tarif edilenlere dayan.
- Uydurma marka verisi, gizli sirket bilgisi, kisisel veri veya gercek musteri hikayesi ekleme.
- Kisa, dogal ve arastirma icin yararli cevap ver.
- Cevaplar Turkce olsun.`;

const requestChatReply = async ({
  openaiApiKey,
  persona,
  project,
  history,
  message,
}: {
  openaiApiKey: string;
  persona: SyntheticPersona;
  project: Record<string, unknown>;
  history: Array<{ role: string; content: string }>;
  message: string;
}) => {
  const messages = [
    { role: "system", content: buildPersonaSystemPrompt(persona, project) },
    ...history.slice(-10).map((entry) => ({
      role: entry.role === "synthetic_user" ? "assistant" : "user",
      content: entry.content,
    })),
    { role: "user", content: message },
  ];

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Synthetic chat failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return asString(data?.choices?.[0]?.message?.content);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const action = asString(payload.action);
    const projectId = asString(payload.projectId);

    if (!projectId || !action) {
      return json({ error: "projectId and action are required" }, 400);
    }

    const access = await validateProjectOwner(projectId, parseBearerToken(req));
    if (!access) {
      return json({ error: "Unauthorized synthetic user request" }, 403);
    }

    if (action === "recommend") {
      return json({
        recommendations: recommendSyntheticPersonas(buildTopic(access.project)),
      });
    }

    if (action === "list_sessions") {
      const { data: sessions, error: sessionsError } = await supabase
        .from("synthetic_user_sessions")
        .select("*")
        .eq("project_id", projectId)
        .eq("user_id", access.user.id)
        .order("created_at", { ascending: false });

      if (sessionsError) throw new Error(`Failed to load synthetic sessions: ${sessionsError.message}`);

      const sessionIds = (sessions ?? []).map((session) => session.id);
      const { data: messages, error: messagesError } = sessionIds.length > 0
        ? await supabase
          .from("synthetic_user_messages")
          .select("id, session_id, role, content, created_at")
          .in("session_id", sessionIds)
          .order("created_at", { ascending: true })
        : { data: [], error: null };

      if (messagesError) throw new Error(`Failed to load synthetic messages: ${messagesError.message}`);
      return json({ sessions: sessions ?? [], messages: messages ?? [] });
    }

    if (action === "start_session") {
      const personaId = asString(payload.personaId);
      const persona = findPersonaById(personaId);
      if (!persona) {
        return json({ error: "Unknown synthetic persona" }, 400);
      }

      const { data: session, error } = await supabase
        .from("synthetic_user_sessions")
        .insert({
          project_id: projectId,
          user_id: access.user.id,
          persona_id: persona.id,
          persona_snapshot: sanitizePersonaSnapshot(persona),
          title: `${persona.name} - ${persona.group}`,
        })
        .select("*")
        .single();

      if (error) throw new Error(`Failed to create synthetic session: ${error.message}`);
      return json({ session, messages: [] });
    }

    if (action === "send_message") {
      const sessionId = asString(payload.sessionId);
      const message = asString(payload.message);
      if (!sessionId || !message) {
        return json({ error: "sessionId and message are required" }, 400);
      }

      const session = await loadSession(sessionId, projectId, access.user.id);
      if (!session) {
        return json({ error: "Synthetic session not found" }, 404);
      }

      const persona = findPersonaById(session.persona_id) ?? session.persona_snapshot as SyntheticPersona;
      const history = await loadMessages(sessionId);

      const { error: researcherInsertError } = await supabase
        .from("synthetic_user_messages")
        .insert({
          session_id: sessionId,
          project_id: projectId,
          user_id: access.user.id,
          role: "researcher",
          content: message,
        });

      if (researcherInsertError) throw new Error(`Failed to store researcher message: ${researcherInsertError.message}`);

      const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
      if (!openaiApiKey) {
        throw new Error("OPENAI_API_KEY is not set");
      }

      const answer = await requestChatReply({
        openaiApiKey,
        persona,
        project: access.project,
        history,
        message,
      });

      if (answer) {
        await supabase.from("synthetic_user_messages").insert({
          session_id: sessionId,
          project_id: projectId,
          user_id: access.user.id,
          role: "synthetic_user",
          content: answer,
        });
      }

      return json({ reply: answer });
    }

    return json({ error: "Unknown synthetic user action" }, 400);
  } catch (error) {
    console.error("[synthetic-users] request failed", error instanceof Error ? error.message : error);
    return json({ error: error instanceof Error ? error.message : "Synthetic user request failed" }, 500);
  }
});
