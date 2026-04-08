import { useState, useEffect, useRef, useCallback, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Send, User } from "lucide-react";
import { supabase } from '@/integrations/supabase/client';
import { SearchoMark } from "@/components/icons/SearchoMark";

export interface ChatMessage {
  id: string;
  type: 'user' | 'ai';
  content: string;
  timestamp: Date;
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
  const isWritingResearchPlanRef = useRef(false);
  const hasTriggeredInitialMessageRef = useRef(initialMessages.length > 0 || initialConversationHistory.length > 0);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    onMessagesUpdate?.(messages);
  }, [messages, onMessagesUpdate]);

  useEffect(() => {
    onConversationHistoryUpdate?.(conversationHistory);
  }, [conversationHistory, onConversationHistoryUpdate]);

  // Load initial message from localStorage if available
  useEffect(() => {
    if (projectData?.description && !hasTriggeredInitialMessageRef.current && !discussionGuide?.sections?.length) {
      hasTriggeredInitialMessageRef.current = true;
      handleInitialMessage(projectData.description);
    }
  }, [discussionGuide?.sections?.length, projectData]);

  const buildUsabilityContextBlock = () => {
    const usability = projectData?.analysis?.usabilityTesting;
    if (!usability) return "";

    const screens = Array.isArray(projectData?.analysis?.designScreens)
      ? projectData.analysis.designScreens
          .map((screen: any, index: number) => `${index + 1}. ${screen.name || "Screen"} (${screen.source || "unknown"})`)
          .join("\n")
      : "Screen bilgisi yok";

    return `\n\n[USABILITY_TESTING_CONTEXT]
Bu proje ekran tabanli kullanilabilirlik testidir.
Arastirma amaci: ${usability.objective || "Belirtilmedi"}
Ana kullanici gorevi: ${usability.primaryTask || "Belirtilmedi"}
Hedef kullanicilar: ${usability.targetUsers || "Belirtilmedi"}
Basari kriterleri: ${usability.successSignals || "Belirtilmedi"}
Riskli alanlar: ${usability.riskAreas || "Belirtilmedi"}
Ekran listesi:
${screens}
Lutfen bu baglamla uyumlu sorular sor ve arastirma planini kullanilabilirlik odaginda olustur.`;
  };

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
    const contextualInitialMessage = `${initialPrompt.outgoingMessage}${buildUsabilityContextBlock()}`;
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: initialPrompt.displayMessage,
      timestamp: new Date(),
      clarifications: getClarificationRecap(),
      attachments: getChatAttachments()
    };
    
    setMessages([userMessage]);
    await sendToLLM(contextualInitialMessage, { forcePlan: initialPrompt.forcePlan });
  };

  const sendToLLM = async (messageText: string, options: SendToLlmOptions = {}) => {
    setIsLoading(true);
    const shouldShowGuideSkeleton = currentStep === 'guide';

    if (shouldShowGuideSkeleton) {
      onResearchPlanLoadingChange?.(true);
    }

    const researchContext = getResearchContext();
    
    // Add loading message
    const loadingMessage: ChatMessage = {
      id: `ai-loading-${Date.now()}`,
      type: 'ai',
      content: options.forceGuideEditPlan ? 'Plan güncelleniyor...' : 'Hazırlanıyor...',
      timestamp: new Date()
    };
    setMessages(prev => [...prev, loadingMessage]);
    
    try {
      const { data, error } = await supabase.functions.invoke('turkish-chat', {
        body: { 
          message: messageText,
          conversationHistory: conversationHistory,
          researchContext,
          guideContext: discussionGuide,
          researchMode: projectData?.analysis?.researchMode ?? "structured",
          forcePlan: options.forcePlan === true,
          forceGuideEditPlan: options.forceGuideEditPlan === true,
        }
      });

      if (error) {
        throw error;
      }

      setConversationHistory(data.conversationHistory || []);

      // Handle research plan generation - MUST check this first to prevent showing chat response
      if (data.researchPlan && onResearchPlanGenerated) {
        if (!shouldShowGuideSkeleton) {
          onResearchPlanLoadingChange?.(true);
        }

        // Keep the loading message visible while questions are being typed
        // Update it to show a different message
        setMessages(prev => prev.map(msg =>
          msg.id.includes('loading')
            ? {
                ...msg,
                content: options.forceGuideEditPlan
                  ? 'Plan güncelleniyor...'
                  : 'Sorular hazırlanıyor...'
              }
            : msg
        ));

        // Trigger research panel with structured questions
        onResearchPlanGenerated(data.researchPlan);
        if (onResearchDetected) {
          onResearchDetected(true);
        }

        // Calculate animation duration based on questions
        const calculateAnimationDuration = () => {
          if (!data.researchPlan?.sections) return 2000;

          let totalDuration = 2000; // Base delay from StudyPanel

          data.researchPlan.sections.forEach((section: any, sectionIndex: number) => {
            // Each question has 800ms delay + typewriter time
            totalDuration += section.questions.length * 800;
            // Add 400ms buffer between sections
            if (sectionIndex < data.researchPlan.sections.length - 1) {
              totalDuration += 400;
            }
          });

          return totalDuration;
        };

        const animationDuration = calculateAnimationDuration();

        // Mark that we're writing research plan - prevents finally block from turning off loading
        isWritingResearchPlanRef.current = true;

        // After animations complete, replace loading with success message
        setTimeout(() => {
          setMessages(prev => {
            const filtered = prev.filter(msg => !msg.id.includes('loading'));
            const successMessage: ChatMessage = {
              id: `ai-success-${Date.now()}`,
              type: 'ai',
              content: options.forceGuideEditPlan
                ? 'Planı güncelledim. İstersen devam edelim.'
                : 'Sorular hazır. İstersen birlikte revize edebiliriz.',
              timestamp: new Date()
            };
            return [...filtered, successMessage];
          });
          isWritingResearchPlanRef.current = false;
          onResearchPlanLoadingChange?.(false);
          setIsLoading(false);
        }, animationDuration);

        // Early return - loading state stays on, controlled by setTimeout above
        return;
      }
      
      // Only add AI chat response if no research plan was generated
      setMessages(prev => {
        const filtered = prev.filter(msg => !msg.id.includes('loading'));
        const assistantMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          type: 'ai',
          content: data.reply,
          timestamp: new Date()
        };
        return [...filtered, assistantMessage];
      });

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
      
      // Remove loading message and add error message
      setMessages(prev => {
        const filtered = prev.filter(msg => !msg.id.includes('loading'));
        const errorMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          type: 'ai',
          content: 'Üzgünüm, bir hata oluştu. Lütfen tekrar deneyin.',
          timestamp: new Date()
        };
        return [...filtered, errorMessage];
      });
    } finally {
      // Only turn off loading if we're not in the middle of writing research plan
      // (research plan loading is controlled by its own setTimeout)
      if (!isWritingResearchPlanRef.current) {
        setIsLoading(false);
      }
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
          <SearchoMark className="mb-5 h-12 w-12 text-brand-primary/70" />
          <h2 className="text-2xl font-semibold text-text-primary">Araştırma çerçevesini birlikte netleştirelim</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-text-secondary">
            Araştırmak istediğin konuyu birkaç cümleyle yaz. Searcho önce bağlamı anlayacak, sonra doğru anda planı açacak.
          </p>
        </div>
      ) : (
        <div className="py-8 text-center text-text-muted">
          <SearchoMark className="mx-auto mb-4 h-12 w-12 text-brand-primary opacity-50" />
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
        <div key={message.id} className="flex justify-start space-x-3">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-brand-primary-light text-brand-primary">
            <SearchoMark className="h-4 w-4" />
          </div>

          <div className={`flex-1 ${bubbleWidth}`}>
            <div className="rounded-2xl border border-border bg-surface px-4 py-3 text-text-primary">
              <p className="text-sm leading-relaxed whitespace-pre-line">
                {message.content}
              </p>
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
      <div className="h-full overflow-hidden bg-white">
        <div className="mx-auto flex h-full w-full max-w-5xl flex-col px-6 py-8">
          <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto min-h-0 scroll-smooth">
              <div className="min-h-full space-y-5 py-6">
                {renderMessages(true)}
                {isLoading && (
                  <div className="flex justify-start space-x-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-primary-light text-brand-primary">
                      <SearchoMark className="h-4 w-4" />
                    </div>
                    <div className="rounded-2xl border border-border bg-surface p-3 text-text-primary">
                      <div className="flex space-x-1">
                        <div className="h-2 w-2 animate-bounce rounded-full bg-text-secondary"></div>
                        <div className="h-2 w-2 animate-bounce rounded-full bg-text-secondary" style={{ animationDelay: '0.1s' }}></div>
                        <div className="h-2 w-2 animate-bounce rounded-full bg-text-secondary" style={{ animationDelay: '0.2s' }}></div>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={endRef} />
              </div>
            </div>

            <div className="border-t border-border-light bg-white/95 pt-4 pb-[env(safe-area-inset-bottom)]">
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
    <div className="h-full flex flex-col overflow-hidden">
      <div className="border-b border-border-light p-4">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-text-primary">Searcho AI Asistan</h2>
            <p className="text-sm text-text-secondary mt-1">Size nasıl yardımcı olabilirim?</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 min-h-0 scroll-smooth space-y-4">
        {renderMessages(false)}
        {isLoading && (
          <div className="flex justify-start space-x-3">
            <div className="w-8 h-8 bg-brand-primary-light text-brand-primary rounded-full flex items-center justify-center">
              <SearchoMark className="w-4 h-4" />
            </div>
            <div className="bg-surface text-text-primary border border-border p-3 rounded-2xl">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-text-secondary rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-text-secondary rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-text-secondary rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="flex-shrink-0 bg-white border-t border-border-light pb-[env(safe-area-inset-bottom)]">
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
