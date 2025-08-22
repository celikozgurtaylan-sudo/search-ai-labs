import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Search, ArrowLeft, Video, Users, Play, BarChart3, Square, ChevronLeft, ChevronRight } from "lucide-react";
import ChatPanel from "@/components/workspace/ChatPanel";
import StudyPanel from "@/components/workspace/StudyPanel";
import RecruitmentDrawer from "@/components/workspace/RecruitmentDrawer";
import { useIsMobile } from "@/hooks/use-mobile";

interface ProjectData {
  description: string;
  template?: string;
  timestamp: number;
}

const Workspace = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [projectData, setProjectData] = useState<ProjectData | null>(null);
  const [currentStep, setCurrentStep] = useState<'guide' | 'recruit' | 'starting' | 'run' | 'analyze'>('guide');
  const [showRecruitment, setShowRecruitment] = useState(false);
  const [discussionGuide, setDiscussionGuide] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('searchai-project');
    if (stored) {
      const data = JSON.parse(stored);
      setProjectData(data);
      
      // Tartışma kılavuzunu otomatik oluştur
      setTimeout(() => {
        generateDiscussionGuide(data.description);
      }, 1000);
    } else {
      navigate('/');
    }
  }, [navigate]);

  // Auto-collapse chat panel when reaching run stage
  useEffect(() => {
    if (currentStep === 'run') {
      setTimeout(() => {
        setIsChatCollapsed(true);
      }, 200);
    }
  }, [currentStep]);

  const generateDiscussionGuide = (description: string) => {
    // AI tarafından oluşturulan tartışma kılavuzunu simüle et
    const guide = {
      title: getProjectTitle(description),
      sections: [
        {
          id: 'background',
          title: 'Profesyonel Geçmiş',
          questions: [
            'Rolünüz ve sorumluluklarınız hakkında bana bilgi verebilir misiniz?',
            'Bu alanda ne kadar süredir çalışıyorsunuz?',
            '[İlgili bağlam] için şu anda hangi araçları kullanıyorsunuz?'
          ]
        },
        {
          id: 'first-impressions',
          title: 'İlk İzlenimler',
          questions: [
            'Bu konudaki ilk tepkiniz nedir?',
            'Size en çok ne dikkat çekiyor?',
            'Bu alışık olduğunuz şeylerle nasıl karşılaştırılıyor?',
            'Aklınıza hemen hangi sorular geliyor?'
          ]
        },
        {
          id: 'detailed-exploration',
          title: 'Detaylı Keşif',
          questions: [
            'Bunu normalde nasıl yaklaşacağınızı anlatabilir misiniz?',
            'Bu sizin için daha değerli kılacak şey nedir?',
            'Hangi endişeleriniz veya tereddütleriniz var?',
            'Bu mevcut iş akışınıza nasıl uyar?',
            'Görmeyi beklediğiniz ama eksik olan şey nedir?'
          ]
        },
        {
          id: 'final-thoughts',
          title: 'Son Düşünceler ve Öneriler',
          questions: [
            'Genel olarak bunu nasıl değerlendirirsiniz?',
            'Elinizde olsa neyi değiştirirdiniz?',
            'Bunu bir meslektaşınıza tavsiye eder misiniz? Neden?',
            'Son düşünceleriniz veya önerileriniz var mı?'
          ]
        }
      ],
      suggestions: [
        'Fiyatlandırma/rakip soruları ekle',
        'AI ile ilgili sorular ekle',
        'Özellik odaklı sorular ekle',
        'Erişilebilirlik soruları ekle',
        'Mobil deneyim soruları ekle'
      ]
    };
    
    setDiscussionGuide(guide);
  };

  const getProjectTitle = (description: string) => {
    if (description.includes('Fibabanka.com.tr')) return 'Fibabanka Açılış Sayfası Araştırması';
    if (description.includes('reklam') || description.includes('advertisement') || description.includes('ad')) return 'Reklam Test Çalışması';
    if (description.includes('NPS') || description.includes('banking') || description.includes('bankacılık')) return 'Müşteri Memnuniyeti Araştırması';
    return 'Kullanıcı Deneyimi Araştırma Çalışması';
  };

  const handleNextStep = () => {
    if (currentStep === 'guide') {
      setShowRecruitment(true);
    } else if (currentStep === 'recruit') {
      setCurrentStep('starting');
    } else if (currentStep === 'starting') {
      setCurrentStep('run');
    } else if (currentStep === 'run') {
      setCurrentStep('analyze');
    }
  };

  const getStepButton = () => {
    switch (currentStep) {
      case 'guide':
        return (
          <Button 
            onClick={handleNextStep}
            className="bg-brand-primary hover:bg-brand-primary-hover text-white"
          >
            <Users className="w-4 h-4 mr-2" />
            Sonraki: Katılımcıları Ekle →
          </Button>
        );
      case 'recruit':
        return (
          <Button 
            onClick={handleNextStep}
            className="bg-brand-primary hover:bg-brand-primary-hover text-white"
            disabled={participants.length === 0}
          >
            <Play className="w-4 h-4 mr-2" />
            Görüşmeleri Başlat
          </Button>
        );
      case 'starting':
        return (
          <Button 
            onClick={handleNextStep}
            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
          >
            <Square className="w-4 h-4 mr-2" />
            Araştırmayı Durdur
          </Button>
        );
      case 'run':
        return (
          <Button 
            onClick={handleNextStep}
            className="bg-brand-primary hover:bg-brand-primary-hover text-white"
          >
            <BarChart3 className="w-4 h-4 mr-2" />
            Analizi Görüntüle
          </Button>
        );
      default:
        return null;
    }
  };

  if (!projectData) {
    return <div>Loading...</div>;
  }

  return (
    <div className="min-h-[100dvh] overflow-hidden bg-canvas">
      {/* Header */}
      <header className="border-b border-border-light bg-white flex-shrink-0">
        <div className="max-w-full mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => navigate('/')}
                className="flex items-center space-x-2"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Geri</span>
              </Button>
              
              <Separator orientation="vertical" className="h-6" />
              
              <div className="flex items-center space-x-2">
                <div className="w-6 h-6 bg-brand-primary rounded flex items-center justify-center">
                  <Search className="w-4 h-4 text-white" />
                </div>
                <span className="font-semibold text-text-primary">Search AI</span>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              {getStepButton()}
            </div>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <ResizablePanelGroup 
        direction={isMobile ? "vertical" : "horizontal"}
        className="h-[calc(100dvh-73px)] min-h-0 overflow-hidden"
      >
        {/* Left Panel - Chat */}
        <ResizablePanel 
          defaultSize={isChatCollapsed ? 3 : 25} 
          minSize={isChatCollapsed ? 3 : 20} 
          maxSize={isChatCollapsed ? 3 : 75}
          className="min-h-0 min-w-0 overflow-hidden transition-all duration-300"
        >
          {isChatCollapsed ? (
            <div className="h-full bg-white border-r border-border-light flex flex-col items-center justify-start pt-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsChatCollapsed(false)}
                className="w-10 h-10 p-0 hover:bg-surface"
                aria-label="Expand chat"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <ChatPanel 
              projectData={projectData}
              discussionGuide={discussionGuide}
              onGuideUpdate={setDiscussionGuide}
              isCollapsed={isChatCollapsed}
              onToggleCollapse={() => setIsChatCollapsed(!isChatCollapsed)}
            />
          )}
        </ResizablePanel>

        {!isChatCollapsed && <ResizableHandle withHandle />}

        {/* Right Panel - Study */}
        <ResizablePanel 
          defaultSize={isChatCollapsed ? 97 : 75} 
          minSize={isChatCollapsed ? 97 : 25} 
          maxSize={isChatCollapsed ? 97 : 80}
          className="min-h-0 min-w-0 overflow-hidden transition-all duration-300"
        >
          <StudyPanel 
            discussionGuide={discussionGuide}
            participants={participants}
            currentStep={currentStep}
            onGuideUpdate={setDiscussionGuide}
          />
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* Recruitment Drawer */}
      <RecruitmentDrawer 
        open={showRecruitment}
        onOpenChange={setShowRecruitment}
        onParticipantsSelect={(selected) => {
          setParticipants(selected);
          setCurrentStep('recruit');
          setShowRecruitment(false);
        }}
      />
    </div>
  );
};

export default Workspace;