import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Loader2, MessageCircle, RefreshCw, Send, Sparkles, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  syntheticUserService,
  type SyntheticUserMessage,
  type SyntheticUserSession,
} from "@/services/syntheticUserService";
import type { EdgeConversationEntry } from "@/lib/edgeFunctionStream";
import {
  recommendSyntheticPersonas,
  type SyntheticPersona,
  type SyntheticPersonaRecommendation,
} from "@/lib/syntheticPersonas";

interface SyntheticUsersPanelProps {
  projectId: string;
  projectTitle?: string | null;
  projectDescription?: string;
  onBackToResearch?: () => void;
}

const groupMessagesBySession = (messages: SyntheticUserMessage[]) =>
  messages.reduce<Record<string, SyntheticUserMessage[]>>((acc, message) => {
    const entries = acc[message.session_id] ?? [];
    entries.push(message);
    acc[message.session_id] = entries;
    return acc;
  }, {});

const buildConversationHistory = (messages: SyntheticUserMessage[]): EdgeConversationEntry[] =>
  messages.map((message) => ({
    role: message.role === "synthetic_user" ? "assistant" : "user",
    content: message.content,
  }));

const SyntheticUsersPanel = ({
  projectId,
  projectTitle,
  projectDescription,
  onBackToResearch,
}: SyntheticUsersPanelProps) => {
  const [recommendations, setRecommendations] = useState<SyntheticPersonaRecommendation[]>([]);
  const [sessions, setSessions] = useState<SyntheticUserSession[]>([]);
  const [messagesBySession, setMessagesBySession] = useState<Record<string, SyntheticUserMessage[]>>({});
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [backendAvailable, setBackendAvailable] = useState(true);
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  const activeSession = sessions.find((session) => session.id === activeSessionId) ?? sessions[0] ?? null;
  const activeMessages = activeSession ? messagesBySession[activeSession.id] ?? [] : [];

  const flattenedPersonas = useMemo(
    () => recommendations.flatMap((recommendation) => recommendation.personas),
    [recommendations],
  );

  const recommendationTopic = useMemo(
    () => [projectTitle, projectDescription].filter(Boolean).join("\n"),
    [projectDescription, projectTitle],
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [activeMessages.length, sending]);

  const loadSyntheticState = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);

    const localRecommendations = recommendSyntheticPersonas(recommendationTopic);
    setRecommendations(localRecommendations);

    const [remoteRecommendationsResult, sessionResult] = await Promise.allSettled([
      syntheticUserService.recommendPersonas(projectId),
      syntheticUserService.listSessions(projectId),
    ]);

    if (remoteRecommendationsResult.status === "fulfilled" && remoteRecommendationsResult.value.length > 0) {
      setRecommendations(remoteRecommendationsResult.value);
    }

    if (sessionResult.status === "fulfilled") {
      const sessionPayload = sessionResult.value;
      setSessions(sessionPayload.sessions);
      setMessagesBySession(groupMessagesBySession(sessionPayload.messages));
      setActiveSessionId((current) => current ?? sessionPayload.sessions[0]?.id ?? null);
      setBackendAvailable(true);
    } else {
      console.error("Failed to load synthetic sessions:", sessionResult.reason);
      setSessions([]);
      setMessagesBySession({});
      setActiveSessionId(null);
      setBackendAvailable(false);
    }

    setLoading(false);
  }, [projectId, recommendationTopic]);

  useEffect(() => {
    void loadSyntheticState();
  }, [loadSyntheticState]);

  const createLocalSession = (persona: SyntheticPersona) => {
    const now = new Date().toISOString();
    const session: SyntheticUserSession = {
      id: `local-${persona.id}-${Date.now()}`,
      project_id: projectId,
      user_id: "local",
      persona_id: persona.id,
      persona_snapshot: persona,
      status: "active",
      title: `${persona.name} - ${persona.group}`,
      created_at: now,
      updated_at: now,
    };

    setSessions((prev) => [session, ...prev]);
    setMessagesBySession((prev) => ({
      ...prev,
      [session.id]: [],
    }));
    setActiveSessionId(session.id);
    toast.success(`${persona.name} ile sentetik sohbet hazır.`);
  };

  const startPersonaSession = async (persona: SyntheticPersona) => {
    if (!backendAvailable) {
      createLocalSession(persona);
      return;
    }

    try {
      const payload = await syntheticUserService.startSession(projectId, persona);
      setSessions((prev) => [payload.session, ...prev]);
      setMessagesBySession((prev) => ({
        ...prev,
        [payload.session.id]: payload.messages ?? [],
      }));
      setActiveSessionId(payload.session.id);
      toast.success(`${persona.name} ile sentetik sohbet hazır.`);
    } catch (error) {
      console.error("Failed to start synthetic session:", error);
      setBackendAvailable(false);
      createLocalSession(persona);
    }
  };

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || !activeSession || sending) return;

    const optimisticResearcherMessage: SyntheticUserMessage = {
      id: `local-researcher-${Date.now()}`,
      session_id: activeSession.id,
      role: "researcher",
      content: trimmed,
      created_at: new Date().toISOString(),
    };

    setInput("");
    setSending(true);
    setMessagesBySession((prev) => ({
      ...prev,
      [activeSession.id]: [...(prev[activeSession.id] ?? []), optimisticResearcherMessage],
    }));

    try {
      const conversationHistory = buildConversationHistory(activeMessages);
      const requestFallbackReply = () => syntheticUserService.sendFallbackMessage({
        persona: activeSession.persona_snapshot,
        projectTitle,
        projectDescription,
        message: trimmed,
        history: conversationHistory,
      });
      const reply = activeSession.id.startsWith("local-")
        ? await requestFallbackReply()
        : await syntheticUserService
          .sendMessage(projectId, activeSession.id, trimmed, conversationHistory)
          .catch(async (error) => {
            console.error("Falling back to turkish-chat for synthetic user message:", error);
            setBackendAvailable(false);
            return requestFallbackReply();
          });

      const syntheticMessage: SyntheticUserMessage = {
        id: `local-synthetic-${Date.now()}`,
        session_id: activeSession.id,
        role: "synthetic_user",
        content: reply.reply || "Bu konuda biraz daha bağlam paylaşırsanız personam açısından yanıtlayabilirim.",
        created_at: new Date().toISOString(),
      };

      setMessagesBySession((prev) => ({
        ...prev,
        [activeSession.id]: [...(prev[activeSession.id] ?? []), syntheticMessage],
      }));
    } catch (error) {
      console.error("Failed to send synthetic message:", error);
      toast.error("Sentetik kullanıcı yanıtı alınamadı.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="h-full min-h-0 bg-canvas">
      <div className="flex h-full min-h-0 flex-col">
        <div className="border-b border-border-light bg-white px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-brand-primary" />
                <h2 className="text-lg font-semibold text-text-primary">Sentetik Kullanıcılar</h2>
                <Badge variant="outline" className="border-brand-primary/30 text-brand-primary">Simülasyon</Badge>
              </div>
              <p className="mt-1 text-sm text-text-secondary">
                {projectTitle || "Araştırma"} için konuya göre önerilen sentetik persona gruplarıyla konuşun.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={() => void loadSyntheticState()} disabled={loading}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Yenile
              </Button>
              {onBackToResearch ? (
                <Button type="button" onClick={onBackToResearch} className="bg-brand-primary text-white hover:bg-brand-primary-hover">
                  Araştırma Akışına Dön
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="min-h-0 overflow-hidden border-r border-border-light bg-white">
            <ScrollArea className="h-full">
              <div className="space-y-5 p-5">
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                  Sentetik kullanıcı konuşmaları gerçek katılımcı kanıtı değildir ve Analiz & Rapor çıktısına karışmaz.
                </div>

                {loading ? (
                  <div className="flex items-center gap-2 text-sm text-text-secondary">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Persona önerileri hazırlanıyor...
                  </div>
                ) : null}

                {!loading && flattenedPersonas.length === 0 ? (
                  <p className="text-sm text-text-secondary">Bu araştırma konusu için öneri bulunamadı.</p>
                ) : null}

                {recommendations.map((recommendation) => (
                  <section key={recommendation.group} className="space-y-3">
                    <div>
                      <h3 className="text-sm font-semibold text-text-primary">{recommendation.group}</h3>
                      <p className="mt-1 text-xs text-text-muted">
                        {recommendation.reasons.length > 0
                          ? `Eşleşen bağlam: ${recommendation.reasons.join(", ")}`
                          : "Genel araştırma bağlamına uygun öneri."}
                      </p>
                    </div>

                    <div className="space-y-2">
                      {recommendation.personas.map((persona) => (
                        <Card key={persona.id} className="border-border-light">
                          <CardContent className="p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <UserRound className="h-4 w-4 text-text-muted" />
                                  <p className="font-medium text-text-primary">{persona.name}</p>
                                </div>
                                <p className="mt-1 text-xs text-text-secondary">{persona.occupation} · {persona.ageRange}</p>
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => void startPersonaSession(persona)}
                                title="Sentetik sohbet başlat"
                              >
                                Başlat
                              </Button>
                            </div>
                            <p className="mt-3 text-xs leading-5 text-text-secondary">{persona.context}</p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </ScrollArea>
          </aside>

          <main className="min-h-0 bg-surface/40">
            {activeSession ? (
              <div className="flex h-full min-h-0 flex-col">
                <div className="border-b border-border-light bg-white px-6 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-text-primary">
                        {activeSession.persona_snapshot?.name || activeSession.title}
                      </p>
                      <p className="mt-1 text-xs text-text-secondary">
                        {activeSession.persona_snapshot?.group} · {activeSession.persona_snapshot?.context}
                      </p>
                    </div>
                    <Badge variant="outline" className="shrink-0">Sentetik</Badge>
                  </div>
                </div>

                <ScrollArea className="flex-1">
                  <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
                    {activeMessages.length === 0 ? (
                      <Card className="border-border-light bg-white">
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2 text-base">
                            <Sparkles className="h-4 w-4 text-brand-primary" />
                            İlk soruyu sorun
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm leading-6 text-text-secondary">
                          Örneğin: “Bu akışta ilk nerede tereddüt ederdin?” veya “Bu teklif sana güven verir mi?”
                        </CardContent>
                      </Card>
                    ) : null}

                    {activeMessages.map((message) => {
                      const isResearcher = message.role === "researcher";
                      return (
                        <div key={message.id} className={`flex ${isResearcher ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-[78%] rounded-lg border px-4 py-3 text-sm leading-6 ${
                            isResearcher
                              ? "border-brand-primary/20 bg-brand-primary text-white"
                              : "border-border-light bg-white text-text-primary"
                          }`}>
                            <div className="mb-1 flex items-center gap-2 text-xs opacity-80">
                              {isResearcher ? <MessageCircle className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                              {isResearcher ? "Araştırmacı" : "Sentetik kullanıcı"}
                            </div>
                            <p className="whitespace-pre-wrap">{message.content}</p>
                          </div>
                        </div>
                      );
                    })}

                    {sending ? (
                      <div className="flex justify-start">
                        <div className="rounded-lg border border-border-light bg-white px-4 py-3 text-sm text-text-secondary">
                          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                          Sentetik kullanıcı düşünüyor...
                        </div>
                      </div>
                    ) : null}
                    <div ref={endRef} />
                  </div>
                </ScrollArea>

                <div className="border-t border-border-light bg-white p-4">
                  <div className="mx-auto flex max-w-3xl items-end gap-3">
                    <Textarea
                      value={input}
                      onChange={(event) => setInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          void sendMessage();
                        }
                      }}
                      placeholder="Sentetik kullanıcıya sorunuzu yazın..."
                      className="min-h-[52px] resize-none"
                    />
                    <Button
                      type="button"
                      onClick={() => void sendMessage()}
                      disabled={!input.trim() || sending}
                      className="h-[52px] bg-brand-primary px-4 text-white hover:bg-brand-primary-hover"
                    >
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center p-6">
                <div className="max-w-md text-center">
                  <Bot className="mx-auto h-10 w-10 text-brand-primary" />
                  <h3 className="mt-4 text-lg font-semibold text-text-primary">Bir persona seçin</h3>
                  <p className="mt-2 text-sm leading-6 text-text-secondary">
                    {projectDescription
                      ? "Soldaki öneriler araştırma konusuna göre sıralandı. Konuşmaya başlamak için bir persona seçin."
                      : "Konuşmaya başlamak için soldaki sentetik persona önerilerinden birini seçin."}
                  </p>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
};

export default SyntheticUsersPanel;
