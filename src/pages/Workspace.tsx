import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Search, ArrowLeft, Video, Users, Play, BarChart3, Square, ChevronLeft, ChevronRight } from "lucide-react";
import { SearchoMark } from "@/components/icons/SearchoMark";
import ChatPanel from "@/components/workspace/ChatPanel";
import StudyPanel from "@/components/workspace/StudyPanel";
import InvitationPanel from "@/components/workspace/InvitationPanel";
import AnalysisPanel from "@/components/workspace/AnalysisPanel";
import { Stepper } from "@/components/ui/stepper";
import { useIsMobile } from "@/hooks/use-mobile";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { projectService } from "@/services/projectService";
import { participantService } from "@/services/participantService";
import { useToast } from "@/hooks/use-toast";


interface ProjectData {
  id?: string;
  description: string;
  template?: string;
  analysis?: any;
  timestamp: number;
}

const Workspace = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { toast } = useToast();
  const [projectData, setProjectData] = useState<ProjectData | null>(null);
  const [currentStep, setCurrentStep] = useState<'guide' | 'recruit' | 'starting' | 'run' | 'analyze'>('guide');
  const [showRecruitment, setShowRecruitment] = useState(false);
  const [discussionGuide, setDiscussionGuide] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [isResearchRelated, setIsResearchRelated] = useState(false);
  const [isButtonReady, setIsButtonReady] = useState(false);
  const [sessionIds, setSessionIds] = useState<string[]>([]);

  useEffect(() => {
    // Check for researcher session first
    const researcherSession = localStorage.getItem('researcher-session');
    if (researcherSession) {
      const sessionData = JSON.parse(researcherSession);
      setProjectData(sessionData.projectData);
      setCurrentStep(sessionData.autoStartPhase || 'starting');
      setIsResearchRelated(true);
      localStorage.removeItem('researcher-session'); // Clean up
      return;
    }

    // Normal project loading
    const stored = localStorage.getItem('searchai-project');
    if (stored) {
      const data = JSON.parse(stored);
      setProjectData(data);
    } else {
      navigate('/');
    }
  }, [navigate]);

  useEffect(() => {
    const hydrateLatestProject = async () => {
      if (!projectData?.id || !user) return;

      try {
        const latestProject = await projectService.getProject(projectData.id);
        if (!latestProject) return;

        const mergedProject = {
          ...projectData,
          title: latestProject.title,
          description: latestProject.description,
          template: latestProject.analysis?.template || projectData.template,
          analysis: latestProject.analysis || projectData.analysis,
        };

        setProjectData(mergedProject);
        localStorage.setItem('searchai-project', JSON.stringify({
          ...mergedProject,
          timestamp: Date.now()
        }));
      } catch (error) {
        console.error('Failed to hydrate latest project:', error);
      }
    };

    void hydrateLatestProject();
  }, [projectData?.id, user]);

  useEffect(() => {
    const persistedGuide = projectData?.analysis?.discussionGuide;

    if (!discussionGuide && Array.isArray(persistedGuide?.sections) && persistedGuide.sections.length > 0) {
      setDiscussionGuide(persistedGuide);
    }

    if (!isResearchRelated && (projectData?.analysis?.isResearchRelated || persistedGuide?.sections?.length > 0)) {
      setIsResearchRelated(true);
    }
  }, [discussionGuide, isResearchRelated, projectData?.analysis]);

  // Update project in database when research is detected
  useEffect(() => {
    if (isResearchRelated && projectData?.id && discussionGuide) {
      updateProjectInDatabase();
    }
  }, [isResearchRelated, discussionGuide, projectData]);

  const updateProjectInDatabase = async () => {
    if (!projectData?.id) return;
    
    try {
      const existingAnalysis = projectData.analysis || {};
      const nextAnalysis = {
        ...existingAnalysis,
        discussionGuide,
        isResearchRelated: true,
        updatedAt: new Date().toISOString()
      };

      await projectService.updateProject(projectData.id, {
        analysis: {
          ...nextAnalysis
        }
      });

      setProjectData((prev) => (prev ? { ...prev, analysis: nextAnalysis } : prev));
    } catch (error) {
      console.error('Failed to update project:', error);
    }
  };

  // Generate discussion guide when research conversation starts (fallback)
  useEffect(() => {
    if (isResearchRelated && !discussionGuide && projectData) {
      setTimeout(() => {
        generateDiscussionGuide(projectData.description);
      }, 1000);
    }
  }, [isResearchRelated, discussionGuide, projectData]);

  // Calculate total animation duration and enable button after completion + 8 seconds
  useEffect(() => {
    if (discussionGuide && !isButtonReady) {
      console.log('Setting up button ready timer with discussionGuide:', discussionGuide);
      
      const calculateAnimationDuration = () => {
        if (!discussionGuide?.sections) return 0;
        
        let totalDuration = 2000; // Base delay from StudyPanel
        
        discussionGuide.sections.forEach((section: any, sectionIndex: number) => {
          // Each question has 800ms delay
          totalDuration += section.questions.length * 800;
          // Add 400ms buffer between sections (except for last section)
          if (sectionIndex < discussionGuide.sections.length - 1) {
            totalDuration += 400;
          }
        });
        
        return totalDuration;
      };

      const animationDuration = calculateAnimationDuration();
      const totalWaitTime = animationDuration + 8000; // Add 8 seconds after animation
      
      console.log('Animation duration:', animationDuration, 'Total wait time:', totalWaitTime);

      const timeoutId = setTimeout(() => {
        console.log('Setting isButtonReady to true');
        setIsButtonReady(true);
      }, totalWaitTime);

      return () => clearTimeout(timeoutId);
    }
  }, [discussionGuide, isButtonReady]);

  // Auto-collapse chat panel when reaching starting stage
  useEffect(() => {
    if (currentStep === 'starting') {
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
          title: 'Kullanım Bağlamı ve Mevcut Alışkanlıklar',
          questions: [
            'Rolünüz ve sorumluluklarınız hakkında bana bilgi verebilir misiniz?',
            'Bu alanda ne kadar süredir çalışıyorsunuz?',
            '[İlgili bağlam] için şu anda hangi araçları kullanıyorsunuz?'
          ]
        },
        {
          id: 'first-impressions',
          title: 'İlk Algı ve Mesaj',
          questions: [
            'Bu konudaki ilk tepkiniz nedir?',
            'Size en çok ne dikkat çekiyor?',
            'Bu alışık olduğunuz şeylerle nasıl karşılaştırılıyor?',
            'Aklınıza hemen hangi sorular geliyor?'
          ]
        },
        {
          id: 'detailed-exploration',
          title: 'Akışta Netlik ve Değer',
          questions: [
            'Buna normalde nasıl yaklaştığınızı anlatır mısınız?',
            'Burada sizin için değerli görünen unsurlar neler?',
            'Bu deneyim sizde hangi düşünceleri uyandırdı?',
            'Bu mevcut iş akışınızın neresine oturuyor?',
            'Burada görmeyi beklediğiniz şeyler nelerdi?'
          ]
        },
        {
          id: 'final-thoughts',
          title: 'İyileştirme Fırsatları',
          questions: [
            'Genel olarak bu deneyimi nasıl özetlersiniz?',
            'Elinizde olsa neyi değiştirirdiniz?',
            'Bunu bir meslektaşınıza nasıl anlatırdınız?',
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

  const fetchProjectSessions = async () => {
    if (!projectData?.id) return;
    
    try {
      const sessions = await participantService.getProjectSessions(projectData.id);
      
      const sessionIdArray = sessions?.map(s => s.id) || [];
      console.log('Fetched session IDs:', sessionIdArray);
      setSessionIds(sessionIdArray);
      
    } catch (error) {
      console.error('Error fetching sessions:', error);
    }
  };

  const getResearchSteps = () => {
    const steps = [
      { id: 'planning', title: 'Araştırma Planlaması' },
      { id: 'recruit', title: 'Katılımcı Seçimi' },
      { id: 'conduct', title: 'Görüşme Yürütme' },
      { id: 'analyze', title: 'Analiz & Rapor' }
    ];

    return steps.map(step => {
      let status: 'completed' | 'current' | 'upcoming' = 'upcoming';
      
      if (step.id === 'planning') {
        status = (currentStep === 'guide' && !isResearchRelated) ? 'current' :
                (isResearchRelated || currentStep === 'recruit' || currentStep === 'starting' || currentStep === 'analyze') ? 'completed' : 'current';
      } else if (step.id === 'recruit') {
        status = currentStep === 'recruit' ? 'current' : 
                currentStep === 'starting' || currentStep === 'analyze' ? 'completed' : 'upcoming';
      } else if (step.id === 'conduct') {
        status = currentStep === 'starting' ? 'current' : 
                currentStep === 'analyze' ? 'completed' : 'upcoming';
      } else if (step.id === 'analyze') {
        status = currentStep === 'analyze' ? 'current' : 'upcoming';
      }

      return { ...step, status };
    });
  };

  const handleNextStep = async () => {
    if (currentStep === 'guide') {
      setShowRecruitment(true);
    } else if (currentStep === 'recruit') {
      setCurrentStep('starting');
    } else if (currentStep === 'starting') {
      await fetchProjectSessions();
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
            disabled={!isResearchRelated || !discussionGuide || !isButtonReady}
            title={`Research: ${isResearchRelated}, Guide: ${!!discussionGuide}, Ready: ${isButtonReady}`}
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
      default:
        return null;
    }
  };

  if (!projectData) {
    return <div>Loading...</div>;
  }

  return (
    <ProtectedRoute>
      <div className="min-h-[100dvh] overflow-hidden bg-canvas">
      {/* Header */}
      <header className="border-b border-border-light bg-white flex-shrink-0 relative z-60">
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
              
              <div className="flex items-center space-x-3">
                <SearchoMark className="w-7 h-7 shrink-0" />
                <span className="font-semibold text-text-primary">Searcho</span>
              </div>
            </div>
            
            {/* Research Progress Stepper */}
            <div className="flex-1 flex justify-center max-w-2xl mx-8">
              <Stepper steps={getResearchSteps()} />
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
              onResearchDetected={setIsResearchRelated}
              onResearchPlanGenerated={(plan) => {
                setDiscussionGuide(plan);
              }}
              onMessagesUpdate={setChatMessages}
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
          {currentStep === 'analyze' ? (
            <AnalysisPanel 
              projectId={projectData.id || ''}
              sessionIds={sessionIds}
            />
          ) : isResearchRelated ? (
            <StudyPanel 
              discussionGuide={discussionGuide}
              participants={participants}
              currentStep={currentStep}
              onGuideUpdate={setDiscussionGuide}
              chatMessages={chatMessages}
            />
          ) : (
            <div className="h-full flex items-center justify-center bg-white border-l border-border-light">
              <div className="text-center text-text-muted max-w-md px-6">
                <h3 className="text-lg font-medium text-text-primary mb-2">Araştırma Planı Hazırlığı</h3>
                <p className="text-sm leading-relaxed">
                  Araştırma planınızı hazırlamak için sohbet alanında araştırma konunuzu detaylarıyla paylaşın. 
                  Anlamlı bir araştırma konusu belirlendikten sonra bu alan aktif hale gelecektir.
                </p>
              </div>
            </div>
          )}
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* Invitation Panel */}
      <InvitationPanel 
        open={showRecruitment}
        onOpenChange={setShowRecruitment}
        onParticipantsUpdate={(participants) => {
          setParticipants(participants);
          if (participants.length > 0) {
            setCurrentStep('recruit');
          }
        }}
        projectId={projectData.id || ''}
      />
      </div>
    </ProtectedRoute>
  );
};

export default Workspace;
