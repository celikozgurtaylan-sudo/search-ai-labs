import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, Play, Square, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import ChatPanel from "@/components/workspace/ChatPanel";
import StudyPanel from "@/components/workspace/StudyPanel";
import InvitationPanel from "@/components/workspace/InvitationPanel";
import AnalysisPanel from "@/components/workspace/AnalysisPanel";
import { Stepper } from "@/components/ui/stepper";
import { SearchoMark } from "@/components/icons/SearchoMark";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { projectService } from "@/services/projectService";
import { participantService, StudyParticipant, StudySession } from "@/services/participantService";
import {
  createNextQuestionSetState,
  ensureQuestionSetState,
  serializeDiscussionGuide,
  type QuestionSetState,
} from "@/lib/questionSet";

type WorkspaceStep = "guide" | "recruit" | "run" | "analyze";

interface ProjectData {
  id?: string;
  title?: string | null;
  description: string;
  template?: string | null;
  analysis?: any;
  timestamp: number;
}

const GuideLoadingPanel = ({ guide }: { guide: any }) => {
  const sections = Array.isArray(guide?.sections) && guide.sections.length > 0
    ? guide.sections
    : Array.from({ length: 3 }, (_, index) => ({
        id: `loading-section-${index}`,
        questions: Array.from({ length: index === 0 ? 3 : 4 }),
      }));

  return (
    <div className="h-full flex flex-col overflow-hidden bg-white border-l border-border-light">
      <div className="border-b border-border-light p-6 flex-shrink-0">
        <div className="space-y-3 max-w-xl">
          <Skeleton className="h-6 w-72" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 min-h-0">
        <div className="space-y-6">
          {sections.map((section: any, sectionIndex: number) => (
            <Card key={section.id || `guide-loading-${sectionIndex}`} className="p-6">
              <CardHeader className="p-0 mb-4">
                <Skeleton className="h-5 w-44" />
              </CardHeader>

              <CardContent className="p-0 space-y-3">
                {(Array.isArray(section.questions) ? section.questions : []).map((_: unknown, questionIndex: number) => (
                  <div key={`loading-question-${sectionIndex}-${questionIndex}`} className="flex items-start space-x-2">
                    <span className="text-xs text-text-muted mt-2 w-5">
                      {questionIndex + 1}.
                    </span>
                    <div className="flex-1 rounded-md border border-border-light bg-surface/60 px-3 py-3">
                      <Skeleton className="h-4 w-11/12" />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

const Workspace = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const [projectData, setProjectData] = useState<ProjectData | null>(null);
  const [currentStep, setCurrentStep] = useState<WorkspaceStep>("guide");
  const [showRecruitment, setShowRecruitment] = useState(false);
  const [discussionGuide, setDiscussionGuide] = useState<any>(null);
  const [questionSetState, setQuestionSetState] = useState<QuestionSetState | null>(null);
  const [participants, setParticipants] = useState<StudyParticipant[]>([]);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [isResearchRelated, setIsResearchRelated] = useState(false);
  const [isButtonReady, setIsButtonReady] = useState(false);
  const [isGuideLoading, setIsGuideLoading] = useState(false);
  const lastPersistedAnalysisKeyRef = useRef<string>("");

  useEffect(() => {
    const researcherSession = localStorage.getItem("researcher-session");
    if (researcherSession) {
      const sessionData = JSON.parse(researcherSession);
      setProjectData(sessionData.projectData);
      setCurrentStep((sessionData.autoStartPhase === "starting" ? "run" : sessionData.autoStartPhase || "run") as WorkspaceStep);
      setIsResearchRelated(true);
      localStorage.removeItem("researcher-session");
      return;
    }

    const stored = localStorage.getItem("searchai-project");
    if (stored) {
      setProjectData(JSON.parse(stored));
    } else {
      navigate("/");
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
          id: latestProject.id,
          title: latestProject.title,
          description: latestProject.description,
          template: latestProject.analysis?.template || projectData.template,
          analysis: latestProject.analysis || projectData.analysis,
        };

        setProjectData(mergedProject);
        localStorage.setItem("searchai-project", JSON.stringify({
          ...mergedProject,
          timestamp: Date.now(),
        }));
      } catch (error) {
        console.error("Failed to hydrate latest project:", error);
      }
    };

    void hydrateLatestProject();
  }, [projectData?.id, user]);

  const loadResearchState = useCallback(async () => {
    if (!projectData?.id || !user) return;

    try {
      const [participantData, sessionData] = await Promise.all([
        participantService.getProjectParticipants(projectData.id),
        participantService.getProjectSessions(projectData.id),
      ]);

      setParticipants(participantData);
      setSessions(sessionData);

      setCurrentStep((previousStep) => {
        if (previousStep === "analyze") return previousStep;
        if (previousStep === "run") return previousStep;
        if (sessionData.length > 0) return "run";
        if (participantData.length > 0) return "recruit";
        return previousStep;
      });
    } catch (error) {
      console.error("Failed to load participant state:", error);
    }
  }, [projectData?.id, user]);

  useEffect(() => {
    if (!projectData?.id || !user) return;
    void loadResearchState();
  }, [projectData?.id, user, loadResearchState]);

  useEffect(() => {
    if (currentStep !== "run" || !projectData?.id || !user) return;

    const intervalId = window.setInterval(() => {
      void loadResearchState();
    }, 10000);

    return () => window.clearInterval(intervalId);
  }, [currentStep, loadResearchState, projectData?.id, user]);

  useEffect(() => {
    const persistedGuide = projectData?.analysis?.discussionGuide;

    if (!discussionGuide && Array.isArray(persistedGuide?.sections) && persistedGuide.sections.length > 0) {
      setDiscussionGuide(persistedGuide);
    }

    if (!questionSetState && Array.isArray(persistedGuide?.sections) && persistedGuide.sections.length > 0) {
      setQuestionSetState(ensureQuestionSetState(projectData?.analysis?.questionSet, persistedGuide));
    }

    if (!isResearchRelated && (projectData?.analysis?.isResearchRelated || persistedGuide?.sections?.length > 0)) {
      setIsResearchRelated(true);
    }
  }, [discussionGuide, isResearchRelated, projectData?.analysis, questionSetState]);

  const persistProjectAnalysis = async (persistKey: string) => {
    if (!projectData?.id || !discussionGuide) return;

    try {
      const existingAnalysis = projectData.analysis || {};
      const ensuredQuestionSet = ensureQuestionSetState(questionSetState, discussionGuide);
      const nextAnalysis = {
        ...existingAnalysis,
        discussionGuide,
        questionSet: ensuredQuestionSet,
        isResearchRelated: true,
        updatedAt: new Date().toISOString(),
      };

      await projectService.updateProject(projectData.id, {
        analysis: nextAnalysis,
      });

      const nextProjectData = {
        ...projectData,
        analysis: nextAnalysis,
      };

      setProjectData(nextProjectData);
      localStorage.setItem("searchai-project", JSON.stringify({
        ...nextProjectData,
        timestamp: Date.now(),
      }));
      lastPersistedAnalysisKeyRef.current = persistKey;
    } catch (error) {
      console.error("Failed to update project:", error);
    }
  };

  useEffect(() => {
    if (!isResearchRelated || !projectData?.id || !discussionGuide) return;
    const nextPersistKey = `${serializeDiscussionGuide(discussionGuide)}::${questionSetState?.currentVersionId || "none"}`;
    if (lastPersistedAnalysisKeyRef.current === nextPersistKey) return;
    void persistProjectAnalysis(nextPersistKey);
  }, [discussionGuide, isResearchRelated, projectData?.id, questionSetState]);

  const applyDiscussionGuide = useCallback((nextGuide: any, source: string) => {
    setDiscussionGuide(nextGuide);
    setQuestionSetState((currentQuestionSet) => createNextQuestionSetState(currentQuestionSet, nextGuide, source));
    setIsResearchRelated(true);
  }, []);

  useEffect(() => {
    if (isResearchRelated && !discussionGuide && projectData) {
      const timeoutId = window.setTimeout(() => {
        const guide = {
          title: getProjectTitle(projectData.description),
          sections: [
            {
              id: "background",
              title: "Kullanım Bağlamı ve Mevcut Alışkanlıklar",
              questions: [
                "Rolünüz ve sorumluluklarınız hakkında bana bilgi verebilir misiniz?",
                "Bu alanda ne kadar süredir çalışıyorsunuz?",
                "[İlgili bağlam] için şu anda hangi araçları kullanıyorsunuz?",
              ],
            },
            {
              id: "first-impressions",
              title: "İlk Algı ve Mesaj",
              questions: [
                "Bu konudaki ilk tepkiniz nedir?",
                "Size en çok ne dikkat çekiyor?",
                "Bu alışık olduğunuz şeylerle nasıl karşılaştırılıyor?",
                "Aklınıza hemen hangi sorular geliyor?",
              ],
            },
            {
              id: "detailed-exploration",
              title: "Akışta Netlik ve Değer",
              questions: [
                "Buna normalde nasıl yaklaştığınızı anlatır mısınız?",
                "Burada sizin için değerli görünen unsurlar neler?",
                "Bu deneyim sizde hangi düşünceleri uyandırdı?",
                "Bu mevcut iş akışınızın neresine oturuyor?",
                "Burada görmeyi beklediğiniz şeyler nelerdi?",
              ],
            },
            {
              id: "final-thoughts",
              title: "İyileştirme Fırsatları",
              questions: [
                "Genel olarak bu deneyimi nasıl özetlersiniz?",
                "Elinizde olsa neyi değiştirirdiniz?",
                "Bunu bir meslektaşınıza nasıl anlatırdınız?",
                "Son düşünceleriniz veya önerileriniz var mı?",
              ],
            },
          ],
        };

        applyDiscussionGuide(guide, "fallback");
      }, 1000);

      return () => window.clearTimeout(timeoutId);
    }
  }, [applyDiscussionGuide, discussionGuide, isResearchRelated, projectData]);

  useEffect(() => {
    if (!discussionGuide || isButtonReady) return;

    const calculateAnimationDuration = () => {
      if (!discussionGuide?.sections) return 0;

      let totalDuration = 2000;
      discussionGuide.sections.forEach((section: any, sectionIndex: number) => {
        totalDuration += section.questions.length * 800;
        if (sectionIndex < discussionGuide.sections.length - 1) {
          totalDuration += 400;
        }
      });

      return totalDuration;
    };

    const timeoutId = window.setTimeout(() => {
      setIsButtonReady(true);
    }, calculateAnimationDuration() + 8000);

    return () => window.clearTimeout(timeoutId);
  }, [discussionGuide, isButtonReady]);

  useEffect(() => {
    if (currentStep === "run") {
      const timeoutId = window.setTimeout(() => {
        setIsChatCollapsed(true);
      }, 200);

      return () => window.clearTimeout(timeoutId);
    }
  }, [currentStep]);

  const getProjectTitle = (description: string) => {
    if (description.includes("Fibabanka.com.tr")) return "Fibabanka Açılış Sayfası Araştırması";
    if (description.includes("reklam") || description.includes("advertisement") || description.includes("ad")) return "Reklam Test Çalışması";
    if (description.includes("NPS") || description.includes("banking") || description.includes("bankacılık")) return "Müşteri Memnuniyeti Araştırması";
    return "Kullanıcı Deneyimi Araştırma Çalışması";
  };

  const getResearchSteps = () => {
    const steps = [
      { id: "planning", title: "Araştırma Planlaması" },
      { id: "recruit", title: "Katılımcı Seçimi" },
      { id: "conduct", title: "Görüşme Yürütme" },
      { id: "analyze", title: "Analiz & Rapor" },
    ];

    return steps.map((step) => {
      let status: "completed" | "current" | "upcoming" = "upcoming";

      if (step.id === "planning") {
        status = currentStep === "guide" && !isResearchRelated
          ? "current"
          : (isResearchRelated || currentStep === "recruit" || currentStep === "run" || currentStep === "analyze")
            ? "completed"
            : "current";
      } else if (step.id === "recruit") {
        status = currentStep === "recruit"
          ? "current"
          : currentStep === "run" || currentStep === "analyze"
            ? "completed"
            : "upcoming";
      } else if (step.id === "conduct") {
        status = currentStep === "run"
          ? "current"
          : currentStep === "analyze"
            ? "completed"
            : "upcoming";
      } else if (step.id === "analyze") {
        status = currentStep === "analyze" ? "current" : "upcoming";
      }

      return { ...step, status };
    });
  };

  const handleNextStep = async () => {
    if (currentStep === "guide") {
      setShowRecruitment(true);
      return;
    }

    if (currentStep === "recruit") {
      setShowRecruitment(false);
      await loadResearchState();
      setCurrentStep("run");
      return;
    }

    if (currentStep === "run") {
      setCurrentStep("analyze");
    }
  };

  const getStepButton = () => {
    switch (currentStep) {
      case "guide":
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
      case "recruit":
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
      case "run":
        return (
          <Button onClick={handleNextStep} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
            <Square className="w-4 h-4 mr-2" />
            Araştırmayı Durdur
          </Button>
        );
      default:
        return null;
    }
  };

  const currentQuestionSetVersion = useMemo(() => {
    if (!questionSetState) return null;
    return {
      id: questionSetState.currentVersionId,
      number: questionSetState.currentVersionNumber,
      updatedAt: questionSetState.updatedAt,
    };
  }, [questionSetState]);

  if (!projectData) {
    return <div>Loading...</div>;
  }

  return (
    <ProtectedRoute>
      <div className="min-h-[100dvh] overflow-hidden bg-canvas">
        <header className="border-b border-border-light bg-white flex-shrink-0 relative z-60">
          <div className="max-w-full mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate("/")}
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

              <div className="flex-1 flex justify-center max-w-2xl mx-8">
                <Stepper steps={getResearchSteps()} />
              </div>

              <div className="flex items-center space-x-3">
                {getStepButton()}
              </div>
            </div>
          </div>
        </header>

        <ResizablePanelGroup
          direction={isMobile ? "vertical" : "horizontal"}
          className="h-[calc(100dvh-73px)] min-h-0 overflow-hidden"
        >
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
                currentStep={currentStep}
                discussionGuide={discussionGuide}
                onResearchDetected={setIsResearchRelated}
                onResearchPlanLoadingChange={setIsGuideLoading}
                onResearchPlanGenerated={(plan) => {
                  applyDiscussionGuide(plan, "chat");
                  setIsButtonReady(false);
                }}
                onMessagesUpdate={setChatMessages}
              />
            )}
          </ResizablePanel>

          {!isChatCollapsed && <ResizableHandle withHandle />}

          <ResizablePanel
            defaultSize={isChatCollapsed ? 97 : 75}
            minSize={isChatCollapsed ? 97 : 25}
            maxSize={isChatCollapsed ? 97 : 80}
            className="min-h-0 min-w-0 overflow-hidden transition-all duration-300"
          >
            {currentStep === "analyze" ? (
              <AnalysisPanel
                projectId={projectData.id || ""}
                sessionIds={sessions.map((session) => session.id!).filter(Boolean)}
              />
            ) : isGuideLoading ? (
              <GuideLoadingPanel guide={discussionGuide} />
            ) : isResearchRelated ? (
              <StudyPanel
                discussionGuide={discussionGuide}
                participants={participants}
                sessions={sessions}
                projectId={projectData.id || ""}
                projectTitle={projectData.title || getProjectTitle(projectData.description)}
                currentStep={currentStep}
                questionSetVersionId={currentQuestionSetVersion?.id || null}
                questionSetVersionNumber={currentQuestionSetVersion?.number || null}
                questionSetUpdatedAt={currentQuestionSetVersion?.updatedAt || null}
                onGuideUpdate={(guide) => {
                  applyDiscussionGuide(guide, currentStep === "run" ? "run-edit" : "manual-edit");
                }}
                onParticipantsUpdate={(nextParticipants) => {
                  setParticipants(nextParticipants);
                  if (nextParticipants.length > 0 && currentStep === "guide") {
                    setCurrentStep("recruit");
                  }
                  void loadResearchState();
                }}
                isGuideLoading={isGuideLoading}
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

        <InvitationPanel
          open={showRecruitment}
          onOpenChange={setShowRecruitment}
          onParticipantsUpdate={(nextParticipants) => {
            setParticipants(nextParticipants);
            if (nextParticipants.length > 0 && currentStep === "guide") {
              setCurrentStep("recruit");
            }
            void loadResearchState();
          }}
          projectId={projectData.id || ""}
          projectTitle={projectData.title || getProjectTitle(projectData.description)}
          currentQuestionSetVersionId={currentQuestionSetVersion?.id || null}
          currentQuestionSetVersionNumber={currentQuestionSetVersion?.number || null}
          questionSetUpdatedAt={currentQuestionSetVersion?.updatedAt || null}
          sessions={sessions}
        />
      </div>
    </ProtectedRoute>
  );
};

export default Workspace;
