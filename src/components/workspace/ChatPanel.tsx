import { useState, useEffect, useRef, useCallback, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Send, User } from "lucide-react";
import {
  buildCompactConversationPayload,
  streamEdgeFunction,
} from "@/lib/edgeFunctionStream";

export interface ChatMessage {
  id: string;
  type: 'user' | 'ai';
  content: string;
  timestamp: Date;
  status?: 'thinking' | 'streaming' | 'done' | 'error';
  showThinking?: boolean;
  showDot?: boolean;
  clarifications?: Array<{
    question: string;
    answer: string;
  }>;
  attachments?: Array<{
    name?: string;
    source?: string;
    url?: string;
  }>;
}

interface ChatPanelProps {
  projectData?: any;
  currentStep?: 'guide' | 'recruit' | 'starting' | 'run' | 'analyze';
  discussionGuide?: any;
  layoutMode?: 'sidebar' | 'centered';
  initialMessages?: ChatMessage[];
  initialConversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  onResearchDetected?: (isResearch: boolean) => void;
  onResearchPlanGenerated?: (plan: any) => void;
  onResearchPlanLoadingChange?: (isLoading: boolean) => void;
  onMessagesUpdate?: (messages: ChatMessage[]) => void;
  onConversationHistoryUpdate?: (history: Array<{ role: 'user' | 'assistant'; content: string }>) => void;
}

interface ResearchContextPayload {
  usabilityTesting?: {
    mode?: string;
    objective?: string;
    primaryTask?: string;
    targetUsers?: string;
    successSignals?: string;
    riskAreas?: string;
    guidancePrompt?: string;
  };
  designScreens?: Array<{
    name?: string;
    source?: string;
    url?: string;
  }>;
}

interface SendToLlmOptions {
  forcePlan?: boolean;
  forceGuideEditPlan?: boolean;
}

const THINKING_LABEL_DELAY_MS = 1000;
const THINKING_DOT_DELAY_MS = 2200;
const MIN_THINKING_VISIBLE_MS = 3200;

const isInlineImageUrl = (value?: string) => typeof value === "string" && value.startsWith("data:image/");

const normalizeIntentText = (value: string) =>
  value
    .toLocaleLowerCase('tr-TR')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u')
    .replace(/\s+/g, ' ')
    .trim();

const detectGuideEditIntent = (message: string, discussionGuide?: any) => {
  if (!Array.isArray(discussionGuide?.sections) || discussionGuide.sections.length === 0) {
    return false;
  }

  const normalized = normalizeIntentText(message);

  const editKeywords = [
    'ekle',
    'artir',
    'arttir',
    'cogalt',
    'guncelle',
    'degistir',
    'duzenle',
    'revize et',
    'yeniden yaz',
    'yenile',
    'kisalt',
    'uzat',
    'sil',
    'kaldir',
    'cikar',
    'sadeleştir',
    'sadelestir',
    'odaklan',
    'yer ver',
    'sorulari',
    'soruyu',
    'bolumu',
    'bolumleri',
  ];

  const planTargets = [
    'soru',
    'sorular',
    'bolum',
    'bolumler',
    'plan',
    'kilavuz',
    'arastirma plan',
    'gorusme',
  ];

  const refinementPatterns = [
    /biraz daha/,
    /daha fazla/,
    /ek olarak/,
    /ozellikle/,
    /bunlari/,
    /mevcut/,
    /ilk bolum/,
    /son bolum/,
    /bu sorular/,
  ];

  return (
    (editKeywords.some((keyword) => normalized.includes(keyword)) &&
      planTargets.some((target) => normalized.includes(target))) ||
    refinementPatterns.some((pattern) => pattern.test(normalized))
  );
};

const ChatPanel = ({
  projectData,
  currentStep = 'guide',
  discussionGuide,
  layoutMode = 'sidebar',
  initialMessages = [],
  initialConversationHistory = [],
  onResearchDetected,
  onResearchPlanGenerated,
  onResearchPlanLoadingChange,
  onMessagesUpdate,
  onConversationHistoryUpdate,
}: ChatPanelProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>(() => initialMessages);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>(
    () => initialConversationHistory,
  );

  const endRef = useRef<HTMLDivElement | null>(null);
  const hasTriggeredInitialMessageRef = useRef(initialMessages.length > 0 || initialConversationHistory.length > 0);
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
          message.id === messageId && message.status === 'thinking' && message.content.trim().length === 0
            ? { ...message, showThinking: true }
            : message,
        ),
      );
    }, THINKING_LABEL_DELAY_MS);

    const dotTimer = window.setTimeout(() => {
      setMessages((prev) =>
        prev.map((message) =>
          message.id === messageId && message.status === 'thinking' && message.content.trim().length === 0
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

  const revealAssistantPendingContent = useCallback((messageId: string, status: 'streaming' | 'done', fallbackContent?: string) => {
    clearAssistantStageTimers(messageId);
    const state = assistantStreamStateRef.current[messageId];
    const nextContent = fallbackContent ?? state?.pending ?? '';

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
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    onMessagesUpdate?.(messages);
  }, [messages, onMessagesUpdate]);

  useEffect(() => {
    onConversationHistoryUpdate?.(conversationHistory);
  }, [conversationHistory, onConversationHistoryUpdate]);

  useEffect(() => {
    return () => {
      Object.keys(assistantStageTimersRef.current).forEach((messageId) => {
        clearAssistantStageTimers(messageId);
      });
      Object.keys(assistantStreamStateRef.current).forEach((messageId) => {
        clearAssistantStreamState(messageId);
      });
    };
  }, [clearAssistantStageTimers, clearAssistantStreamState]);

  // Load initial message from localStorage if available
  useEffect(() => {
    if (projectData?.description && !hasTriggeredInitialMessageRef.current && !discussionGuide?.sections?.length) {
      hasTriggeredInitialMessageRef.current = true;
      handleInitialMessage(projectData.description);
    }
  }, [discussionGuide?.sections?.length, projectData]);

  const getClarificationRecap = () => {
    const usability = projectData?.analysis?.usabilityTesting;
    if (!usability) return [];

    const pairs = [
      {
        question: "Bu ekranlardan neyi anlamak istiyorsunuz?",
        answer: usability.objective || "",
      },
      {
        question: "Kullanıcının bu ekranlarda tamamlamasını beklediğiniz ana görev nedir?",
        answer: usability.primaryTask || "",
      },
      {
        question: "Hedef kullanıcı tipi",
        answer: usability.targetUsers || "",
      },
      {
        question: "Başarı kriteri",
        answer: usability.successSignals || "",
      },
      {
        question: "Özellikle test edilmesini istediğiniz riskli alanlar",
        answer: usability.riskAreas || "",
      },
    ];

    return pairs.filter((pair) => pair.answer.trim().length > 0);
  };

  const getChatAttachments = () => {
    if (!Array.isArray(projectData?.analysis?.designScreens)) return [];

    return projectData.analysis.designScreens
      .filter((screen: any) => typeof screen?.url === "string" && screen.url.length > 0)
      .map((screen: any) => ({
        name: screen.name || "Screen",
        source: screen.source || "unknown",
        url: screen.url
      }));
  };

  const getResearchContext = (): ResearchContextPayload | null => {
    if (!projectData?.analysis?.usabilityTesting) return null;

    const sanitizedScreens = Array.isArray(projectData.analysis.designScreens)
      ? projectData.analysis.designScreens.map((screen: any) => ({
          name: screen?.name || "Screen",
          source: screen?.source || "unknown",
          url: isInlineImageUrl(screen?.url) ? "[inline-image-attached]" : screen?.url
        }))
      : [];

    return {
      usabilityTesting: projectData.analysis.usabilityTesting,
      designScreens: sanitizedScreens
    };
  };

  const buildInitialPrompt = (initialMessage: string) => {
    return {
      displayMessage: initialMessage,
      outgoingMessage: initialMessage,
      forcePlan: false,
    };
  };

  const handleInitialMessage = async (initialMessage: string) => {
    const initialPrompt = buildInitialPrompt(initialMessage);
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: initialPrompt.displayMessage,
      timestamp: new Date(),
      clarifications: getClarificationRecap(),
      attachments: getChatAttachments()
    };
    
    setMessages([userMessage]);
    await sendToLLM(initialPrompt.outgoingMessage, { forcePlan: initialPrompt.forcePlan });
  };

  const sendToLLM = async (messageText: string, options: SendToLlmOptions = {}) => {
    setIsLoading(true);
    const shouldShowGuideSkeleton = currentStep === 'guide';

    if (shouldShowGuideSkeleton) {
      onResearchPlanLoadingChange?.(true);
    }

    const researchContext = getResearchContext();
    const assistantMessageId = `ai-stream-${Date.now()}`;
    const compactConversation = buildCompactConversationPayload(conversationHistory);

    const loadingMessage: ChatMessage = {
      id: assistantMessageId,
      type: 'ai',
      content: '',
      timestamp: new Date(),
      status: 'thinking',
      showThinking: false,
      showDot: false,
    };
    setMessages(prev => [...prev, loadingMessage]);
    assistantStreamStateRef.current[assistantMessageId] = {
      createdAt: Date.now(),
      pending: '',
    };
    scheduleAssistantStageTimers(assistantMessageId);
    
    try {
      const data = await streamEdgeFunction<any>({
        functionName: 'turkish-chat',
        body: {
          message: messageText,
          conversationHistory: compactConversation.conversationHistory,
          conversationSummary: compactConversation.conversationSummary,
          researchContext,
          guideContext: discussionGuide,
          researchMode: projectData?.analysis?.researchMode ?? "structured",
          forcePlan: options.forcePlan === true,
          forceGuideEditPlan: options.forceGuideEditPlan === true,
        },
        onEvent: (event) => {
          if (event.event === 'assistant_delta' && event.delta) {
            const state = assistantStreamStateRef.current[assistantMessageId];
            if (!state) return;

            state.pending = `${state.pending}${event.delta}`;
            const elapsed = Date.now() - state.createdAt;

            if (elapsed >= MIN_THINKING_VISIBLE_MS) {
              revealAssistantPendingContent(assistantMessageId, 'streaming');
              return;
            }

            if (!state.revealTimerId) {
              state.revealTimerId = window.setTimeout(() => {
                revealAssistantPendingContent(assistantMessageId, 'streaming');
              }, MIN_THINKING_VISIBLE_MS - elapsed);
            }
          }
        },
      });

      setConversationHistory(data.conversationHistory || []);
      const state = assistantStreamStateRef.current[assistantMessageId];
      const finalReply = typeof data.reply === 'string' ? data.reply : (state?.pending ?? '');
      if (state) {
        state.pending = finalReply;
      }

      const elapsed = state ? Date.now() - state.createdAt : MIN_THINKING_VISIBLE_MS;
      if (elapsed < MIN_THINKING_VISIBLE_MS) {
        await new Promise((resolve) => window.setTimeout(resolve, MIN_THINKING_VISIBLE_MS - elapsed));
      }

      revealAssistantPendingContent(assistantMessageId, 'done', finalReply);
      clearAssistantStreamState(assistantMessageId);

      if (data.researchPlan && onResearchPlanGenerated) {
        onResearchPlanGenerated(data.researchPlan);
        if (onResearchDetected) {
          onResearchDetected(true);
        }
      }
      
      if (shouldShowGuideSkeleton) {
        onResearchPlanLoadingChange?.(false);
      }
      
      // Check if conversation became research-related (for future plan generation)
      if (data.isResearchRelated && onResearchDetected) {
        onResearchDetected(true);
      }
      
    } catch (error) {
      console.error('Error sending message to LLM:', error);
      onResearchPlanLoadingChange?.(false);
      clearAssistantStageTimers(assistantMessageId);
      clearAssistantStreamState(assistantMessageId);

      setMessages(prev => prev.map(msg =>
        msg.id === assistantMessageId
          ? {
              ...msg,
              content: 'Üzgünüm, bir hata oluştu. Lütfen tekrar deneyin.',
              status: 'error',
              showThinking: false,
              showDot: false,
            }
          : msg
      ));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    // Add user message
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      type: 'user',
      content: inputMessage,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMessage]);
    
    const currentInput = inputMessage;
    setInputMessage('');

    await sendToLLM(currentInput, {
      forceGuideEditPlan: detectGuideEditIntent(currentInput, discussionGuide),
    });
  };

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }, []);

  useEffect(() => {
    resizeTextarea();
  }, [inputMessage, resizeTextarea]);

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const isCenteredLayout = layoutMode === 'centered';

  const renderMessages = (centered: boolean) => {
    if (messages.length === 0) {
      return centered ? (
        <div className="flex h-full flex-col items-center justify-center px-6 text-center">
          <h2 className="text-2xl font-semibold text-text-primary">Araştırma çerçevesini birlikte netleştirelim</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-text-secondary">
            Araştırmak istediğin konuyu birkaç cümleyle yaz. Searcho önce bağlamı anlayacak, sonra doğru anda planı açacak.
          </p>
        </div>
      ) : (
        <div className="py-8 text-center text-text-muted">
          <p>Merhaba! Size nasıl yardımcı olabilirim?</p>
          <p className="mt-2 text-sm">Sormak istediğiniz her şeyi yazabilirsiniz.</p>
        </div>
      );
    }

    return messages.map((message) => {
      const timestamp = message.timestamp.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
      const bubbleWidth = centered ? "max-w-[88%] sm:max-w-[80%]" : "max-w-lg";

      if (message.type === 'user') {
        return (
          <div key={message.id} className="flex justify-end space-x-3">
            <div className={`flex-1 ${bubbleWidth}`}>
              <div className="rounded-2xl bg-brand-primary px-4 py-3 text-white">
                <p className="text-sm leading-relaxed whitespace-pre-line">
                  {message.content}
                </p>
                {message.clarifications && message.clarifications.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {message.clarifications.map((clarification, index) => (
                      <div
                        key={`${message.id}-clarification-${index}`}
                        className="rounded-2xl border border-white/20 bg-white px-3 py-3 text-left text-text-primary"
                      >
                        <p className="text-sm font-semibold leading-snug">
                          {clarification.question}
                        </p>
                        <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                          {clarification.answer}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                {message.attachments && message.attachments.length > 0 && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {message.attachments.map((attachment, index) => (
                      <div key={`${message.id}-attachment-${index}`} className="overflow-hidden rounded-xl border border-white/20 bg-white/10">
                        <img
                          src={attachment.url}
                          alt={attachment.name || "Attached screen"}
                          className="h-28 w-full object-cover"
                        />
                        <div className="px-2 py-1 text-[11px] text-white/85">
                          {attachment.name || "Screen"}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <p className="mt-1 ml-4 text-xs text-text-muted">
                {timestamp}
              </p>
            </div>

            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-border-light bg-surface text-text-secondary">
              <User className="h-4 w-4" aria-hidden="true" />
            </div>
          </div>
        );
      }

      return (
        <div key={message.id} className="flex justify-start">
          <div className={`flex-1 ${bubbleWidth}`}>
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
            <p className="mt-1 ml-4 text-xs text-text-muted">
              {timestamp}
            </p>
          </div>
        </div>
      );
    });
  };

  if (isCenteredLayout) {
    return (
      <div className="h-full overflow-hidden bg-[rgba(121,76,255,0.045)]">
        <div className="mx-auto flex h-full w-full max-w-5xl flex-col px-6 py-8">
          <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto min-h-0 scroll-smooth scrollbar-hide">
              <div className="min-h-full space-y-5 py-6">
                {renderMessages(true)}
                <div ref={endRef} />
              </div>
            </div>

            <div className="border-t border-border-light bg-white/88 pt-4 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm">
              <div className="rounded-3xl border border-border-light bg-surface/30 p-3 shadow-sm">
                <div className="flex items-end space-x-3">
                  <textarea
                    ref={textareaRef}
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Araştırmak istediğin konuyu yaz..."
                    className="flex-1 resize-none overflow-y-auto scrollbar-hide rounded-2xl border border-input bg-background px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={isLoading}
                    rows={1}
                    style={{ minHeight: '48px', maxHeight: '160px', scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                  />
                  <Button
                    onClick={handleSendMessage}
                    disabled={!inputMessage.trim() || isLoading}
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
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[rgba(121,76,255,0.045)]">
      <div className="border-b border-border-light p-4">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-text-primary">Searcho AI Asistan</h2>
            <p className="text-sm text-text-secondary mt-1">Size nasıl yardımcı olabilirim?</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 min-h-0 scroll-smooth space-y-4 scrollbar-hide">
        {renderMessages(false)}
        <div ref={endRef} />
      </div>

      <div className="flex-shrink-0 bg-white/88 border-t border-border-light pb-[env(safe-area-inset-bottom)] backdrop-blur-sm">
        <div className="p-4">
          <div className="flex items-end space-x-3">
            <textarea
              ref={textareaRef}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Sormak istediğiniz her şeyi yazabilirsiniz..."
              className="flex-1 resize-none overflow-y-auto scrollbar-hide rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isLoading}
              rows={1}
              style={{ minHeight: '40px', maxHeight: '160px', scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            />
            <Button
              onClick={handleSendMessage}
              disabled={!inputMessage.trim() || isLoading}
              className="px-4 h-10 flex-shrink-0"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatPanel;
