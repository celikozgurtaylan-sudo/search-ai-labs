import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bot, User, Sparkles } from "lucide-react";

interface ChatMessage {
  id: string;
  type: 'user' | 'ai';
  content: string;
  timestamp: Date;
}

interface ChatPanelProps {
  projectData: any;
  discussionGuide: any;
  onGuideUpdate: (guide: any) => void;
}

const ChatPanel = ({ projectData, discussionGuide, onGuideUpdate }: ChatPanelProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    if (projectData) {
      // Initialize chat with user's project description
      const initialMessages: ChatMessage[] = [
        {
          id: '1',
          type: 'user',
          content: projectData.description,
          timestamp: new Date(projectData.timestamp)
        }
      ];

      // Gecikme sonrası AI yanıtı ekle
      setTimeout(() => {
        const aiResponse: ChatMessage = {
          id: '2',
          type: 'ai',
          content: `Mükemmel! Projenizi analiz ettim ve kapsamlı bir tartışma kılavuzu oluşturdum. Çalışma kullanıcı perspektiflerini anlamaya ve eylem planına yönelik içgörüler toplamaya odaklanacak.\n\n4 ana bölümde hedefli sorular oluşturdum:\n• Profesyonel Geçmiş\n• İlk İzlenimler\n• Detaylı Keşif\n• Son Düşünceler ve Öneriler\n\nKılavuzun tamamını sağ panelde görebilirsiniz. Aşağıdaki öneri çiplerini kullanarak soruları özelleştirmekten veya yeni bölümler eklemekten çekinmeyin.`,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, aiResponse]);
      }, 1500);

      setMessages(initialMessages);
    }
  }, [projectData]);

  const handleSuggestionClick = (suggestion: string) => {
    if (!discussionGuide) return;

    const newQuestion = generateQuestionFromSuggestion(suggestion);
    const updatedGuide = {
      ...discussionGuide,
      sections: discussionGuide.sections.map((section: any) => {
        if (section.id === 'detailed-exploration') {
          return {
            ...section,
            questions: [...section.questions, newQuestion]
          };
        }
        return section;
      }),
      suggestions: discussionGuide.suggestions.filter((s: string) => s !== suggestion)
    };

    onGuideUpdate(updatedGuide);

    // Ekleme hakkında AI mesajı ekle
    const aiMessage: ChatMessage = {
      id: `ai-${Date.now()}`,
      type: 'ai',
      content: `Harika! "${newQuestion}" sorusunu Detaylı Keşif bölümüne ekledim. Bu ${suggestion.toLowerCase()} hakkında daha spesifik içgörüler toplanmasına yardımcı olacak.`,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, aiMessage]);
  };

  const generateQuestionFromSuggestion = (suggestion: string): string => {
    const questionMap: Record<string, string> = {
      'Fiyatlandırma/rakip soruları ekle': 'Fiyatlandırma gördüğünüz alternatiflerle nasıl karşılaştırılıyor?',
      'AI ile ilgili sorular ekle': 'Bu bağlamda AI destekli özellikler hakkında düşünceleriniz nelerdir?',
      'Özellik odaklı sorular ekle': 'Sizin için en değerli olacak belirli özellikler hangisidir?',
      'Erişilebilirlik soruları ekle': 'Kullanım durumunuz için erişilebilirlik özellikleri ne kadar önemli?',
      'Mobil deneyim soruları ekle': 'Bunun mobil cihazlarda nasıl çalışmasını beklersiniz?'
    };
    return questionMap[suggestion] || 'Bu konuyu biraz daha detaylandırabilir misiniz?';
  };

  return (
    <div className="h-full flex flex-col">
      {/* Chat Header */}
      <div className="border-b border-border-light p-6">
        <h2 className="text-lg font-semibold text-text-primary">Araştırma Asistanı</h2>
        <p className="text-sm text-text-secondary mt-1">AI destekli kılavuz oluşturma ve optimizasyon</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex space-x-3 ${message.type === 'user' ? 'justify-start' : 'justify-start'}`}
          >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
              message.type === 'user' 
                ? 'bg-surface text-text-secondary' 
                : 'bg-brand-primary-light text-brand-primary'
            }`}>
              {message.type === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>
            
            <div className="flex-1 max-w-lg">
              <div className={`rounded-2xl px-4 py-3 ${
                message.type === 'user'
                  ? 'bg-surface text-text-primary'
                  : 'bg-white border border-border text-text-primary'
              }`}>
                <p className="text-sm leading-relaxed whitespace-pre-line">
                  {message.content}
                </p>
              </div>
              <p className="text-xs text-text-muted mt-1 ml-4">
                {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Suggestions */}
      {discussionGuide && discussionGuide.suggestions && discussionGuide.suggestions.length > 0 && (
        <div className="border-t border-border-light p-6">
          <div className="flex items-center space-x-2 mb-3">
            <Sparkles className="w-4 h-4 text-brand-primary" />
            <span className="text-sm font-medium text-text-secondary">Önerilen geliştirmeler</span>
          </div>
          
          <div className="flex flex-wrap gap-2">
            {discussionGuide.suggestions.map((suggestion: string, index: number) => (
              <Button
                key={index}
                variant="outline"
                size="sm"
                onClick={() => handleSuggestionClick(suggestion)}
                className="text-xs hover:bg-brand-primary-light hover:border-brand-primary hover:text-brand-primary"
              >
                + {suggestion}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatPanel;