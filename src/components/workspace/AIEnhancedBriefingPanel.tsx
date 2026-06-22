import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  AIEnhancedBrief,
  normalizeAIEnhancedBrief,
} from "@/lib/aiEnhancedResearch";
import { Send, User } from "lucide-react";
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

interface AIEnhancedPlannerResponse {
  reply?: string;
  brief?: unknown;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
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
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const autoStartedRef = useRef(false);
  const assistantStageTimersRef = useRef<Record<string, number[]>>({});
  const assistantStreamStateRef = useRef<Record<string, { createdAt: number; pending: string; revealTimerId?: number }>>({});

  const clearAssistantStageTimers = useCallback((messageId: string) => {
    const timers = assistantStageTimersRef.current[messageId];
    if (!timers?.length) return;

    timers.forEach((timerId) => window.clearTimeout(timerId));
    delete assistantStageTimersRef.current[messageId];
  }, []);

  const scheduleAssistantStageTimers = useCallback((messageId: string) => {
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
  }, [clearAssistantStageTimers]);

  const clearAssistantStreamState = useCallback((messageId: string) => {
    const state = assistantStreamStateRef.current[messageId];
    if (state?.revealTimerId) {
      window.clearTimeout(state.revealTimerId);
    }
    delete assistantStreamStateRef.current[messageId];
  }, []);

  const revealAssistantPendingContent = useCallback((messageId: string, status: "streaming" | "done", fallbackContent?: string) => {
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
  }, [clearAssistantStageTimers]);

  useEffect(() => {
    setMessages(buildMessagesFromTranscript(brief));
    setConversationHistory(brief?.plannerTranscript ?? []);
  }, [brief]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isLoading]);

  useEffect(() => {
    const stageTimers = assistantStageTimersRef.current;
    const streamStates = assistantStreamStateRef.current;

    return () => {
      Object.values(stageTimers).forEach((timers) => {
        timers.forEach((timerId) => window.clearTimeout(timerId));
      });
      Object.values(streamStates).forEach((state) => {
        if (state.revealTimerId) {
          window.clearTimeout(state.revealTimerId);
        }
      });
      assistantStageTimersRef.current = {};
      assistantStreamStateRef.current = {};
    };
  }, []);

  const sendMessage = useCallback(async (messageText: string) => {
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
      const data = await streamEdgeFunction<AIEnhancedPlannerResponse>({
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

      const nextTranscript: AIEnhancedPlannerTranscriptItem[] = Array.isArray(data?.conversationHistory)
        ? (data.conversationHistory as AIEnhancedPlannerTranscriptItem[])
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
  }, [
    brief,
    clearAssistantStageTimers,
    clearAssistantStreamState,
    conversationHistory,
    onBriefUpdate,
    projectDescription,
    projectTitle,
    revealAssistantPendingContent,
    scheduleAssistantStageTimers,
  ]);

  useEffect(() => {
    if (autoStartedRef.current) return;
    if (!projectDescription.trim()) return;
    if (brief?.plannerTranscript?.length) {
      autoStartedRef.current = true;
      return;
    }

    autoStartedRef.current = true;
    void sendMessage(projectDescription);
  }, [brief?.plannerTranscript?.length, projectDescription, sendMessage]);

  const hasMessages = messages.length > 0;

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);

  useEffect(() => {
    resizeTextarea();
  }, [input, resizeTextarea]);

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const currentInput = input;
    setInput("");
    await sendMessage(currentInput);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSendMessage();
    }
  };

  return (
    <div className="h-full overflow-hidden bg-[rgba(121,76,255,0.045)]">
      <div className="mx-auto flex h-full w-full max-w-5xl flex-col px-6 py-8">
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto min-h-0 scroll-smooth scrollbar-hide">
            <div className="min-h-full space-y-5 py-6">
              {!hasMessages ? (
                <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                  <h2 className="text-2xl font-semibold text-text-primary">Araştırma çerçevesini birlikte netleştirelim</h2>
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-text-secondary">
                    Araştırmak istediğin konuyu birkaç cümleyle yaz. Searcho önce bağlamı anlayacak, sonra doğru anda planı açacak.
                  </p>
                </div>
              ) : (
                messages.map((message) => {
                  if (message.role === "user") {
                    return (
                      <div key={message.id} className="flex justify-end space-x-3">
                        <div className="flex-1 max-w-[88%] sm:max-w-[80%]">
                          <div className="rounded-2xl bg-brand-primary px-4 py-3 text-white">
                            <p className="text-sm leading-relaxed whitespace-pre-line">
                              {message.content}
                            </p>
                          </div>
                        </div>

                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-border-light bg-surface text-text-secondary">
                          <User className="h-4 w-4" aria-hidden="true" />
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={message.id} className="flex justify-start">
                      <div className="flex-1 max-w-[88%] sm:max-w-[80%]">
                        <div className="px-1 py-1 text-text-primary min-h-[44px]">
                          {message.content.trim().length > 0 ? (
                            <p className="text-sm leading-relaxed whitespace-pre-line">
                              {message.content}
                            </p>
                          ) : message.showThinking || message.showDot ? (
                            <div className="space-y-2 py-1">
                              <p
                                className={`chat-thinking-shimmer origin-left text-sm font-medium transform-gpu transition-all duration-700 ${
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
                          ) : (
                            <div className="h-[38px]" />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}

              <div ref={endRef} />
            </div>
          </div>

          <div className="border-t border-border-light bg-white/88 pt-4 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm">
            <div className="rounded-3xl border border-border-light bg-surface/30 p-3 shadow-sm">
              <div className="flex items-end space-x-3">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Araştırmak istediğin konuyu yaz..."
                  className="flex-1 resize-none overflow-y-auto scrollbar-hide rounded-2xl border border-input bg-background px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isLoading}
                  rows={1}
                  style={{ minHeight: "48px", maxHeight: "160px", scrollbarWidth: "none", msOverflowStyle: "none" }}
                />
                <Button
                  onClick={() => void handleSendMessage()}
                  disabled={!input.trim() || isLoading}
                  className="h-12 flex-shrink-0 rounded-2xl px-5"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIEnhancedBriefingPanel;
