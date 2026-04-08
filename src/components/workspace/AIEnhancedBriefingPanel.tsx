import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  AIEnhancedBrief,
  normalizeAIEnhancedBrief,
} from "@/lib/aiEnhancedResearch";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

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
}

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

  useEffect(() => {
    setMessages(buildMessagesFromTranscript(brief));
    setConversationHistory(brief?.plannerTranscript ?? []);
  }, [brief]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isLoading]);

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

    try {
      const { data, error } = await supabase.functions.invoke("ai-enhanced-planner", {
        body: {
          message: trimmedMessage,
          projectTitle,
          projectDescription,
          existingBrief: brief,
          conversationHistory,
        },
      });

      if (error) {
        throw error;
      }

      const nextBrief = normalizeAIEnhancedBrief(data?.brief);
      if (!nextBrief) {
        throw new Error("Planner geçersiz bir brief döndürdü");
      }

      const assistantReply = typeof data?.reply === "string" && data.reply.trim()
        ? data.reply.trim()
        : "Devam etmeden önce biraz daha bağlam netleştirelim.";

      setMessages((prev) => [
        ...prev,
        {
          id: `planner-assistant-${Date.now()}`,
          role: "assistant",
          content: assistantReply,
        },
      ]);

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
      setMessages((prev) => [
        ...prev,
        {
          id: `planner-error-${Date.now()}`,
          role: "assistant",
          content: "Bağlamı işlerken bir hata oluştu. Tekrar deneyelim.",
        },
      ]);
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
    <div className="h-full overflow-y-auto bg-white">
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

          <Card className="min-h-[640px] overflow-hidden">
            <CardContent className="flex h-full min-h-[640px] flex-col p-0">
              <div className="flex-1 overflow-y-auto px-5 py-6">
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
                          className={`max-w-[84%] rounded-2xl px-4 py-3 text-sm leading-7 ${
                            message.role === "user"
                              ? "bg-brand-primary text-white"
                              : "border border-border-light bg-surface/70 text-text-primary"
                          }`}
                        >
                          {message.content}
                        </div>
                      </div>
                    ))
                  )}

                  {isLoading ? (
                    <div className="flex justify-start">
                      <div className="inline-flex items-center gap-2 rounded-2xl border border-border-light bg-surface/70 px-4 py-3 text-sm text-text-secondary">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Agent bağlamı netleştiriyor...
                      </div>
                    </div>
                  ) : null}
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
