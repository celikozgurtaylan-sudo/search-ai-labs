import { useState, useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bot, User, Send } from "lucide-react";
import { supabase } from '@/integrations/supabase/client';
import userAvatar from "@/assets/user-avatar.jpg";

interface ChatMessage {
  id: string;
  type: 'user' | 'ai';
  content: string;
  timestamp: Date;
}

interface ChatPanelProps {
  projectData?: any;
  onResearchDetected?: (isResearch: boolean) => void;
  onResearchPlanGenerated?: (plan: any) => void;
}

const ChatPanel = ({ projectData, onResearchDetected, onResearchPlanGenerated }: ChatPanelProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<any[]>([]);

  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  // Load initial message from localStorage if available
  useEffect(() => {
    if (projectData?.description) {
      handleInitialMessage(projectData.description);
    }
  }, [projectData]);

  const handleInitialMessage = async (initialMessage: string) => {
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: initialMessage,
      timestamp: new Date()
    };
    
    setMessages([userMessage]);
    await sendToLLM(initialMessage);
  };

  const sendToLLM = async (messageText: string) => {
    setIsLoading(true);
    
    // Add loading message
    const loadingMessage: ChatMessage = {
      id: `ai-loading-${Date.now()}`,
      type: 'ai',
      content: 'Düşünüyorum...',
      timestamp: new Date()
    };
    setMessages(prev => [...prev, loadingMessage]);
    
    try {
      const { data, error } = await supabase.functions.invoke('turkish-chat', {
        body: { 
          message: messageText,
          conversationHistory: conversationHistory
        }
      });

      if (error) {
        throw error;
      }

      // Remove loading message and add AI response
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
      
      setConversationHistory(data.conversationHistory || []);
      
      // Check if the conversation became research-related
      if (data.isResearchRelated && onResearchDetected) {
        onResearchDetected(true);
      }
      
      // Handle research plan generation
      if (data.researchPlan && onResearchPlanGenerated) {
        onResearchPlanGenerated(data.researchPlan);
      }
      
    } catch (error) {
      console.error('Error sending message to LLM:', error);
      
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

    await sendToLLM(currentInput);
  };

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Chat Header */}
      <div className="border-b border-border-light p-4">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-text-primary">Türkçe AI Asistan</h2>
            <p className="text-sm text-text-secondary mt-1">Size nasıl yardımcı olabilirim?</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 min-h-0 scroll-smooth space-y-4">
        {messages.length === 0 ? (
          <div className="text-center text-text-muted py-8">
            <Bot className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Merhaba! Size nasıl yardımcı olabilirim?</p>
            <p className="text-sm mt-2">Sormak istediğiniz her şeyi yazabilirsiniz.</p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex space-x-3 ${message.type === 'user' ? 'justify-start' : 'justify-start'}`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center overflow-hidden ${
                message.type === 'user' 
                  ? 'bg-surface text-text-secondary' 
                  : 'bg-brand-primary-light text-brand-primary'
              }`}>
                {message.type === 'user' ? (
                  <img 
                    src={userAvatar} 
                    alt="User avatar" 
                    className="w-full h-full object-cover rounded-full"
                  />
                ) : (
                  <Bot className="w-4 h-4" />
                )}
              </div>
              
              <div className="flex-1 max-w-lg">
                <div className={`rounded-2xl px-4 py-3 ${
                  message.type === 'user'
                    ? 'bg-brand-primary text-white'
                    : 'bg-surface text-text-primary border border-border'
                }`}>
                  <p className="text-sm leading-relaxed whitespace-pre-line">
                    {message.content}
                  </p>
                </div>
                <p className="text-xs text-text-muted mt-1 ml-4">
                  {message.timestamp.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))
        )}
        {isLoading && (
          <div className="flex justify-start space-x-3">
            <div className="w-8 h-8 bg-brand-primary-light text-brand-primary rounded-full flex items-center justify-center">
              <Bot className="w-4 h-4" />
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

      {/* Chat Input */}
      <div className="flex-shrink-0 bg-white border-t border-border-light pb-[env(safe-area-inset-bottom)]">
        <div className="p-4">
          <div className="flex space-x-3">
            <Input
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Sormak istediğiniz her şeyi yazabilirsiniz..."
              className="flex-1"
              disabled={isLoading}
            />
            <Button 
              onClick={handleSendMessage}
              disabled={!inputMessage.trim() || isLoading}
              className="px-4 h-10 md:h-9"
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