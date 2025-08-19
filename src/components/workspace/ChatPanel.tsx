import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Bot, User, Sparkles, Send, Loader2 } from "lucide-react";
import { analyzeProject, ProjectAnalysis } from "@/services/projectAnalysisService";

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
  const [inputMessage, setInputMessage] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

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

      setMessages(initialMessages);

      // Check if LLM analysis was requested
      const shouldAnalyze = localStorage.getItem('searchai-analyze-request');
      if (shouldAnalyze === 'true') {
        localStorage.removeItem('searchai-analyze-request');
        performProjectAnalysis(projectData.description);
      } else {
        // Default AI response if no analysis requested
        setTimeout(() => {
          const aiResponse: ChatMessage = {
            id: '2',
            type: 'ai',
            content: `Mükemmel! Projenizi analiz ettim ve kapsamlı bir tartışma kılavuzu oluşturdum. Çalışma kullanıcı perspektiflerini anlamaya ve eylem planına yönelik içgörüler toplamaya odaklanacak.\n\n4 ana bölümde hedefli sorular oluşturdum:\n• Profesyonel Geçmiş\n• İlk İzlenimler\n• Detaylı Keşif\n• Son Düşünceler ve Öneriler\n\nKılavuzun tamamını sağ panelde görebilirsiniz. Aşağıdaki öneri çiplerini kullanarak soruları özelleştirmekten veya yeni bölümler eklemekten çekinmeyin.`,
            timestamp: new Date()
          };
          setMessages(prev => [...prev, aiResponse]);
        }, 1500);
      }
    }
  }, [projectData]);

  const performProjectAnalysis = async (description: string) => {
    setIsAnalyzing(true);
    
    // Add loading message
    const loadingMessage: ChatMessage = {
      id: `ai-loading-${Date.now()}`,
      type: 'ai',
      content: 'Projenizi analiz ediyorum ve detaylı araştırma planı oluşturuyorum...',
      timestamp: new Date()
    };
    setMessages(prev => [...prev, loadingMessage]);

    try {
      const analysis = await analyzeProject(description);
      
      // Remove loading message and add analysis result
      setMessages(prev => {
        const filtered = prev.filter(msg => !msg.id.includes('loading'));
        const analysisMessage: ChatMessage = {
          id: `ai-analysis-${Date.now()}`,
          type: 'ai',
          content: `📊 **Proje Analizi Tamamlandı**

**Özet:** ${analysis.summary}

**Önerilen Araştırma Yöntemleri:**
${analysis.researchMethods.map(method => `• ${method}`).join('\n')}

**Hedef Kitle:** ${analysis.targetAudience}

**Anahtar Sorular:**
${analysis.keyQuestions.map(q => `• ${q}`).join('\n')}

**Tahmini Süre:** ${analysis.timeline}

**Önemli İçgörüler:** ${analysis.insights}

Araştırma kılavuzunu bu analize göre özelleştirebilir ve takip soruları ekleyebilirsiniz.`,
          timestamp: new Date()
        };
        return [...filtered, analysisMessage];
      });
    } catch (error) {
      // Remove loading message and add error message
      setMessages(prev => {
        const filtered = prev.filter(msg => !msg.id.includes('loading'));
        const errorMessage: ChatMessage = {
          id: `ai-error-${Date.now()}`,
          type: 'ai',
          content: 'Analiz sırasında bir hata oluştu. Varsayılan araştırma kılavuzu ile devam edebilirsiniz.',
          timestamp: new Date()
        };
        return [...filtered, errorMessage];
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

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

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;

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

    // Add loading message
    const loadingMessage: ChatMessage = {
      id: `ai-loading-${Date.now()}`,
      type: 'ai',
      content: 'Düşünüyorum...',
      timestamp: new Date()
    };
    setMessages(prev => [...prev, loadingMessage]);

    try {
      // Use the UX research planner to generate dynamic responses
      const analysis = await analyzeProject(`Kullanıcı sorusu: "${currentInput}"\n\nMevcut proje bağlamı: ${projectData?.description || 'Genel araştırma'}`);
      
      // Remove loading message and add AI response based on analysis
      setMessages(prev => {
        const filtered = prev.filter(msg => !msg.id.includes('loading'));
        const aiMessage: ChatMessage = {
          id: `ai-${Date.now()}`,
          type: 'ai',
          content: `${analysis.insights}\n\n**Önerilen yaklaşım:**\n${analysis.researchMethods.slice(0, 2).map(method => `• ${method}`).join('\n')}\n\nBu konuda araştırma kılavuzunuza yeni sorular eklemek ister misiniz?`,
          timestamp: new Date()
        };
        return [...filtered, aiMessage];
      });
    } catch (error) {
      // Fallback to contextual response if API fails
      setMessages(prev => {
        const filtered = prev.filter(msg => !msg.id.includes('loading'));
        const aiMessage: ChatMessage = {
          id: `ai-${Date.now()}`,
          type: 'ai',
          content: `"${currentInput}" hakkında çok iyi bir nokta! Bu konuyu araştırma kılavuzunuza dahil etmek için özel sorular oluşturabilirim. Hangi açıdan yaklaşmak istiyorsunuz - kullanıcı deneyimi, işlevsellik yoksa başka bir perspektif mi?`,
          timestamp: new Date()
        };
        return [...filtered, aiMessage];
      });
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
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
        <p className="text-sm text-text-secondary mt-1">AI destekli araştırma planı oluşturma ve optimizasyon</p>
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

      {/* Chat Input */}
      <div className="border-t border-border-light p-6">
        <div className="flex space-x-3">
          <Input
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Takip sorusu ekle..."
            className="flex-1"
          />
          <Button 
            onClick={handleSendMessage}
            disabled={!inputMessage.trim()}
            className="px-4"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
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