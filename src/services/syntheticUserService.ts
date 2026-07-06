import {
  buildCompactConversationPayload,
  streamEdgeFunction,
  type EdgeConversationEntry,
} from "@/lib/edgeFunctionStream";

export interface SyntheticPersona {
  id: string;
  name: string;
  group: string;
  ageRange: string;
  occupation: string;
  context: string;
  goals: string[];
  frustrations: string[];
  traits: string[];
  tags: string[];
}

export interface SyntheticPersonaRecommendation {
  group: string;
  score: number;
  reasons: string[];
  personas: SyntheticPersona[];
}

export interface SyntheticUserSession {
  id: string;
  project_id: string;
  user_id: string;
  persona_id: string;
  persona_snapshot: SyntheticPersona;
  status: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface SyntheticUserMessage {
  id: string;
  session_id: string;
  project_id?: string;
  user_id?: string;
  role: "researcher" | "synthetic_user";
  content: string;
  created_at: string;
}

interface RecommendResponse {
  recommendations: SyntheticPersonaRecommendation[];
}

interface ListSessionsResponse {
  sessions: SyntheticUserSession[];
  messages: SyntheticUserMessage[];
}

interface StartSessionResponse {
  session: SyntheticUserSession;
  messages: SyntheticUserMessage[];
}

interface SendMessageResponse {
  reply: string;
}

interface SyntheticFallbackResponse {
  chatResponse?: string;
}

const callSyntheticUsers = <T>(body: Record<string, unknown>) =>
  streamEdgeFunction<T>({
    functionName: "synthetic-users",
    body,
  });

const buildFallbackPersonaPrompt = ({
  persona,
  projectTitle,
  projectDescription,
  message,
}: {
  persona: SyntheticPersona;
  projectTitle?: string | null;
  projectDescription?: string;
  message: string;
}) => `Sentetik kullanici simulasyonu olarak yanit ver.

Persona:
- Ad: ${persona.name}
- Grup: ${persona.group}
- Yas araligi: ${persona.ageRange}
- Meslek/baglam: ${persona.occupation}
- Durum: ${persona.context}
- Hedefler: ${persona.goals.join(", ")}
- Frustrasyonlar: ${persona.frustrations.join(", ")}
- Davranis ozellikleri: ${persona.traits.join(", ")}

Arastirma konusu:
${[projectTitle, projectDescription].filter(Boolean).join("\n")}

Kurallar:
- Gercek katilimci gibi davranma; sentetik persona perspektifinden cevap ver.
- Arastirmacinin sordugu soruya bu personanin bakis acisindan, Turkce ve dogal cevap ver.
- Gizli sirket bilgisi, gercek musteri hikayesi veya kisisel veri uydurma.
- Ekran veya prototip hakkinda yalnizca arastirmacinin tarif ettiklerine dayan.

Arastirmacinin sorusu:
${message}`;

export const syntheticUserService = {
  async recommendPersonas(projectId: string) {
    const data = await callSyntheticUsers<RecommendResponse>({
      action: "recommend",
      projectId,
    });
    return data.recommendations ?? [];
  },

  async listSessions(projectId: string) {
    const data = await callSyntheticUsers<ListSessionsResponse>({
      action: "list_sessions",
      projectId,
    });
    return {
      sessions: data.sessions ?? [],
      messages: data.messages ?? [],
    };
  },

  async startSession(projectId: string, personaId: string) {
    return callSyntheticUsers<StartSessionResponse>({
      action: "start_session",
      projectId,
      personaId,
    });
  },

  async sendMessage(
    projectId: string,
    sessionId: string,
    message: string,
    history: EdgeConversationEntry[],
  ) {
    const compact = buildCompactConversationPayload(history);
    return callSyntheticUsers<SendMessageResponse>({
      action: "send_message",
      projectId,
      sessionId,
      message,
      conversationHistory: compact.conversationHistory,
      conversationSummary: compact.conversationSummary,
    });
  },

  async sendFallbackMessage({
    persona,
    projectTitle,
    projectDescription,
    message,
    history,
  }: {
    persona: SyntheticPersona;
    projectTitle?: string | null;
    projectDescription?: string;
    message: string;
    history: EdgeConversationEntry[];
  }) {
    const compact = buildCompactConversationPayload(history);
    const data = await streamEdgeFunction<SyntheticFallbackResponse>({
      functionName: "turkish-chat",
      body: {
        message: buildFallbackPersonaPrompt({ persona, projectTitle, projectDescription, message }),
        conversationHistory: compact.conversationHistory,
        conversationSummary: compact.conversationSummary,
        researchMode: "structured",
      },
    });

    return {
      reply: data.chatResponse?.trim() || "Bu persona açısından yanıtlayabilmem için biraz daha bağlam paylaşabilir misiniz?",
    };
  },
};
