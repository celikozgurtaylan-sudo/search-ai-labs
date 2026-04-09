import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  AIEnhancedBrief,
  normalizeAIEnhancedBrief,
} from "@/lib/aiEnhancedResearch";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  buildCompactConversationPayload,
  streamEdgeFunction,
} from "@/lib/edgeFunctionStream";

interface AIEnhancedBriefingPanelProps {
  projectTitle: string;
  projectDescription: string;
  brief: AIEnhancedBrief | null;
  onBriefUpdate: (brief: AIEnhancedBrief) => void;
}

interface PlannerMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  status?: "thinking" | "streaming" | "done" | "error";
  showThinking?: boolean;
  showDot?: boolean;
}

const THINKING_LABEL_DELAY_MS = 1000;
const THINKING_DOT_DELAY_MS = 2200;
const MIN_THINKING_VISIBLE_MS = 3200;

const buildMessagesFromTranscript = (brief: AIEnhancedBrief | null): PlannerMessage[] => {
  if (!brief?.plannerTranscript?.length) return [];

  return brief.plannerTranscript.map((entry, index) => ({
    id: `planner-${entry.role}-${index}`,
    role: entry.role,
    content: entry.content,
  }));
};

const AIEnhancedBriefingPanel = ({
  projectTitle,
  projectDescription,
  brief,
  onBriefUpdate,
}: AIEnhancedBriefingPanelProps) => {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<PlannerMessage[]>(() => buildMessagesFromTranscript(brief));
  const [conversationHistory, setConversationHistory] = useState<Array<{ role: "user" | "assistant"; content: string }>>(
    () => brief?.plannerTranscript ?? [],
  );
  const [isLoading, setIsLoading] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const autoStartedRef = useRef(false);
  const assistantStageTimersRef = useRef<Record<string, number[]>>({});
  const assistantStreamStateRef = useRef<Record<string, { createdAt: number; pending: string; revealTimerId?: number }>>({});

  const clearAssistantStageTimers = (messageId: string) => {
    const timers = assistantStageTimersRef.current[messageId];
    if (!timers?.length) return;

    timers.forEach((timerId) => window.clearTimeout(timerId));
    delete assistantStageTimersRef.current[messageId];
  };

  const scheduleAssistantStageTimers = (messageId: string) => {
    clearAssistantStageTimers(messageId);

    const thinkingTimer = window.setTimeout(() => {
      setMessages((prev) =>
        prev.map((message) =>
          message.id === messageId && message.status === "thinking" && message.content.trim().length === 0
            ? { ...message, showThinking: true }
            : message,
        ),
      );
    }, THINKING_LABEL_DELAY_MS);

    const dotTimer = window.setTimeout(() => {
      setMessages((prev) =>
        prev.map((message) =>
          message.id === messageId && message.status === "thinking" && message.content.trim().length === 0
            ? { ...message, showThinking: true, showDot: true }
            : message,
        ),
      );
    }, THINKING_DOT_DELAY_MS);

    assistantStageTimersRef.current[messageId] = [thinkingTimer, dotTimer];
  };

  const clearAssistantStreamState = (messageId: string) => {
    const state = assistantStreamStateRef.current[messageId];
    if (state?.revealTimerId) {
      window.clearTimeout(state.revealTimerId);
    }
    delete assistantStreamStateRef.current[messageId];
  };

  const revealAssistantPendingContent = (messageId: string, status: "streaming" | "done", fallbackContent?: string) => {
    clearAssistantStageTimers(messageId);
    const state = assistantStreamStateRef.current[messageId];
    const nextContent = fallbackContent ?? state?.pending ?? "";

    setMessages((prev) =>
      prev.map((message) =>
        message.id === messageId
          ? {
              ...message,
              content: nextContent,
              status,
              showThinking: false,
              showDot: false,
            }
          : message,
      ),
    );

    if (state) {
      state.revealTimerId = undefined;
    }
  };

  useEffect(() => {
    setMessages(buildMessagesFromTranscript(brief));
    setConversationHistory(brief?.plannerTranscript ?? []);
  }, [brief]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isLoading]);

  useEffect(() => {
    return () => {
      Object.keys(assistantStageTimersRef.current).forEach((messageId) => {
        clearAssistantStageTimers(messageId);
      });
      Object.keys(assistantStreamStateRef.current).forEach((messageId) => {
        clearAssistantStreamState(messageId);
      });
    };
  }, []);

  const sendMessage = async (messageText: string) => {
    const trimmedMessage = messageText.trim();
    if (!trimmedMessage) return;

    const nextUserMessage: PlannerMessage = {
      id: `planner-user-${Date.now()}`,
      role: "user",
      content: trimmedMessage,
    };

    setMessages((prev) => [...prev, nextUserMessage]);
    setIsLoading(true);
    const assistantMessageId = `planner-assistant-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        status: "thinking",
        showThinking: false,
        showDot: false,
      },
    ]);
    assistantStreamStateRef.current[assistantMessageId] = {
      createdAt: Date.now(),
      pending: "",
    };
    scheduleAssistantStageTimers(assistantMessageId);

    try {
      const compactConversation = buildCompactConversationPayload(conversationHistory);
      const data = await streamEdgeFunction<any>({
        functionName: "ai-enhanced-planner",
        body: {
          message: trimmedMessage,
          projectTitle,
          projectDescription,
          existingBrief: brief,
          conversationHistory: compactConversation.conversationHistory,
          conversationSummary: compactConversation.conversationSummary,
        },
        onEvent: (event) => {
          if (event.event === "assistant_delta" && event.delta) {
            const state = assistantStreamStateRef.current[assistantMessageId];
            if (!state) return;

            state.pending = `${state.pending}${event.delta}`;
            const elapsed = Date.now() - state.createdAt;

            if (elapsed >= MIN_THINKING_VISIBLE_MS) {
              revealAssistantPendingContent(assistantMessageId, "streaming");
              return;
            }

            if (!state.revealTimerId) {
              state.revealTimerId = window.setTimeout(() => {
                revealAssistantPendingContent(assistantMessageId, "streaming");
              }, MIN_THINKING_VISIBLE_MS - elapsed);
            }
          }
        },
      });

      const nextBrief = normalizeAIEnhancedBrief(data?.brief);
      if (!nextBrief) {
        throw new Error("Planner geçersiz bir brief döndürdü");
      }

      const assistantReply = typeof data?.reply === "string" && data.reply.trim()
        ? data.reply.trim()
        : "Devam etmeden önce biraz daha bağlam netleştirelim.";

      const state = assistantStreamStateRef.current[assistantMessageId];
      if (state) {
        state.pending = assistantReply;
      }

      const elapsed = state ? Date.now() - state.createdAt : MIN_THINKING_VISIBLE_MS;
      if (elapsed < MIN_THINKING_VISIBLE_MS) {
        await new Promise((resolve) => window.setTimeout(resolve, MIN_THINKING_VISIBLE_MS - elapsed));
      }

      revealAssistantPendingContent(assistantMessageId, "done", assistantReply);
      clearAssistantStreamState(assistantMessageId);

      const nextTranscript = Array.isArray(data?.conversationHistory)
        ? data.conversationHistory
        : [...conversationHistory, { role: "user", content: trimmedMessage }, { role: "assistant", content: assistantReply }];

      const hydratedBrief: AIEnhancedBrief = {
        ...nextBrief,
        plannerTranscript: nextTranscript,
      };

      setConversationHistory(nextTranscript);
      onBriefUpdate(hydratedBrief);

    } catch (error) {
      console.error("AI enhanced planner failed:", error);
      toast.error("Agent Enhanced brief hazırlanamadı. Tekrar deneyin.");
      clearAssistantStageTimers(assistantMessageId);
      clearAssistantStreamState(assistantMessageId);
      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantMessageId
            ? {
                ...message,
                content: "Bağlamı işlerken bir hata oluştu. Tekrar deneyelim.",
                status: "error",
                showThinking: false,
                showDot: false,
              }
            : message,
        ),
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (autoStartedRef.current) return;
    if (!projectDescription.trim()) return;
    if (brief?.plannerTranscript?.length) {
      autoStartedRef.current = true;
      return;
    }

    autoStartedRef.current = true;
    void sendMessage(projectDescription);
  }, [brief?.plannerTranscript?.length, projectDescription]);

  const hasMessages = messages.length > 0;

  return (
    <div className="h-full overflow-y-auto bg-[rgba(121,76,255,0.045)] scrollbar-hide">
      <div className="mx-auto flex min-h-full max-w-5xl flex-col px-6 py-8">
        <div className="mx-auto w-full max-w-3xl">
          <div className="mb-6 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-primary/20 bg-brand-primary-light/20 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-brand-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Agent Enhanced
            </div>
            <h2 className="mt-5 text-2xl font-semibold text-text-primary">Bağlamı birlikte netleştirelim</h2>
            <p className="mt-3 text-sm leading-7 text-text-secondary">
              Önce araştırmanın çerçevesini netleştiriyoruz. Sonra görüşme akışını senin adına sessizce kurup katılımcı aşamasına geçiyoruz.
            </p>
          </div>

          <Card className="min-h-[640px] overflow-hidden bg-white/88 backdrop-blur-sm">
            <CardContent className="flex h-full min-h-[640px] flex-col p-0">
              <div className="flex-1 overflow-y-auto px-5 py-6 scrollbar-hide">
                <div className="space-y-4">
                  {!hasMessages ? (
                    <div className="flex min-h-[360px] flex-col items-center justify-center px-6 text-center">
                      <Sparkles className="mb-4 h-10 w-10 text-brand-primary/65" />
                      <h3 className="text-xl font-semibold text-text-primary">Araştırmanın bağlamını anlat</h3>
                      <p className="mt-3 max-w-xl text-sm leading-7 text-text-secondary">
                        Burada konu, hedef kitle ve karar alanını doğal bir sohbetle netleştiriyoruz. Teknik sinyalleri sana göstermeden arkada topluyoruz.
                      </p>
                    </div>
                  ) : (
                    messages.map((message) => (
                      <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[84%] px-4 py-3 text-sm leading-7 ${
                            message.role === "user"
                              ? "bg-brand-primary text-white"
                              : "text-text-primary"
                          }`}
                        >
                          {message.role === "assistant" && message.status === "thinking" && message.content.trim().length === 0 ? (
                            <div className="space-y-2 min-h-[44px]">
                              <p
                                className={`chat-thinking-shimmer origin-left font-medium transform-gpu transition-all duration-700 ${
                                  message.showThinking
                                    ? "translate-y-0 scale-100 opacity-100"
                                    : "translate-y-2 scale-[0.985] opacity-0"
                                }`}
                                style={{ transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)" }}
                              >
                                Düşünüyor...
                              </p>
                              <div
                                className={`chat-thinking-dot origin-left text-[1.6rem] font-medium leading-none text-text-muted/80 transform-gpu transition-all duration-900 ${
                                  message.showDot
                                    ? "translate-y-0 scale-100 opacity-100"
                                    : "translate-y-2 scale-95 opacity-0"
                                }`}
                                style={{ transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)" }}
                              >
                                .
                              </div>
                            </div>
                          ) : message.content.trim().length > 0 ? (
                            <p className="whitespace-pre-line">{message.content}</p>
                          ) : (
                            <div className="min-h-[44px]" />
                          )}
                        </div>
                      </div>
                    ))
                  )}

                  <div ref={endRef} />
                </div>
              </div>

              <div className="border-t border-border-light p-4">
                <div className="space-y-3">
                  <Textarea
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    placeholder="Bağlamı netleştirecek ek bilgi verin..."
                    className="min-h-[96px] resize-none"
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        const currentInput = input;
                        setInput("");
                        void sendMessage(currentInput);
                      }
                    }}
                  />
                  <div className="flex justify-end">
                    <Button
                      onClick={() => {
                        const currentInput = input;
                        setInput("");
                        void sendMessage(currentInput);
                      }}
                      disabled={isLoading || !input.trim()}
                      className="bg-brand-primary text-white hover:bg-brand-primary-hover"
                    >
                      {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
                      Gönder
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AIEnhancedBriefingPanel;
