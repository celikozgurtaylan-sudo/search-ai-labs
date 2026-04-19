import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, Pause, Play, Square, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import ChatPanel, { type ChatMessage } from "@/components/workspace/ChatPanel";
import StudyPanel from "@/components/workspace/StudyPanel";
import InvitationPanel from "@/components/workspace/InvitationPanel";
import AnalysisPanel from "@/components/workspace/AnalysisPanel";
import AIEnhancedBriefingPanel from "@/components/workspace/AIEnhancedBriefingPanel";
import { Stepper } from "@/components/ui/stepper";
import { SearchoMark } from "@/components/icons/SearchoMark";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { projectService } from "@/services/projectService";
import { participantService, StudyParticipant, StudySession } from "@/services/participantService";
import { applyInterviewLinkAccess, getInterviewControlState } from "@/lib/interviewControl";
import {
  createNextQuestionSetState,
  ensureQuestionSetState,
  serializeDiscussionGuide,
  type QuestionSetState,
} from "@/lib/questionSet";
import {
  buildAIEnhancedDisplayGuide,
  getResearchMode,
  isAIEnhancedReady,
  normalizeAIEnhancedBrief,
  type AIEnhancedBrief,
} from "@/lib/aiEnhancedResearch";

type WorkspaceStep = "guide" | "recruit" | "run" | "analyze";
const WORKSPACE_CHAT_STORAGE_PREFIX = "searchai-workspace-chat";

const getPersistedWorkflowStage = (analysis: any): WorkspaceStep | null => {
  const workflowStage = analysis?.workflowStage;
  return workflowStage === "guide" || workflowStage === "recruit" || workflowStage === "run" || workflowStage === "analyze"
    ? workflowStage
    : null;
};

interface ProjectData {
  id?: string;
  title?: string | null;
  description: string;
  template?: string | null;
  analysis?: any;
  timestamp: number;
}

interface PersistedChatMessage {
  id: string;
  type: "user" | "ai";
  content: string;
  timestamp: string;
  status?: "done" | "error";
  clarifications?: Array<{
    question: string;
    answer: string;
  }>;
  attachments?: PersistedChatAttachment[];
}

interface PersistedChatAttachment {
  name?: string;
  source?: string;
  url?: string;
}

interface PersistedWorkspaceChatState {
  messages: PersistedChatMessage[];
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>;
  updatedAt: number;
}

interface RestoredWorkspaceChatState {
  messages: ChatMessage[];
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>;
  updatedAt: number;
}

const getWorkspaceChatStorageKey = (projectId?: string | null) => {
  if (typeof projectId !== "string" || projectId.trim().length === 0) {
    return null;
  }

  return `${WORKSPACE_CHAT_STORAGE_PREFIX}:${projectId}`;
};

const isInlineImageUrl = (value?: string) => typeof value === "string" && value.startsWith("data:image/");

const sanitizeConversationHistory = (history: unknown): Array<{ role: "user" | "assistant"; content: string }> => {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .filter((entry): entry is { role: "user" | "assistant"; content: string } => {
      const candidate = entry as { role?: string; content?: unknown };
      return (candidate.role === "user" || candidate.role === "assistant") && typeof candidate.content === "string";
    })
    .map((entry) => ({
      role: entry.role,
      content: entry.content,
    }))
    .filter((entry) => entry.content.trim().length > 0);
};

const serializeChatMessages = (messages: ChatMessage[]): PersistedChatMessage[] => {
  return messages
    .filter((message) => {
      if (message.type === "user") {
        return message.content.trim().length > 0;
      }

      return message.status === "error" || message.content.trim().length > 0;
    })
    .map((message) => ({
      id: message.id,
      type: message.type,
      content: message.content,
      timestamp: message.timestamp instanceof Date
        ? message.timestamp.toISOString()
        : new Date(message.timestamp).toISOString(),
      status: message.status === "error" ? "error" : "done",
      clarifications: Array.isArray(message.clarifications)
        ? message.clarifications
            .filter((item) => typeof item?.question === "string" && typeof item?.answer === "string")
            .map((item) => ({
              question: item.question,
              answer: item.answer,
            }))
        : undefined,
      attachments: Array.isArray(message.attachments)
        ? message.attachments.map((attachment) => ({
            name: attachment?.name,
            source: attachment?.source,
            url: isInlineImageUrl(attachment?.url) ? undefined : attachment?.url,
          }))
        : undefined,
    }));
};

const restoreAttachmentUrl = (attachment: PersistedChatAttachment, projectData: ProjectData | null) => {
  if (typeof attachment?.url === "string" && attachment.url.length > 0) {
    return attachment.url;
  }

  const designScreens = Array.isArray(projectData?.analysis?.designScreens)
    ? projectData.analysis.designScreens
    : [];

  const matchingScreen = designScreens.find((screen: any) => {
    if (attachment?.source && attachment?.name) {
      return screen?.source === attachment.source && screen?.name === attachment.name;
    }

    if (attachment?.name) {
      return screen?.name === attachment.name;
    }

    return false;
  });

  return typeof matchingScreen?.url === "string" ? matchingScreen.url : undefined;
};

const deserializeChatMessages = (messages: unknown, projectData: ProjectData | null): ChatMessage[] => {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .filter((message): message is PersistedChatMessage => {
      const candidate = message as Partial<PersistedChatMessage>;
      return (
        typeof candidate.id === "string" &&
        (candidate.type === "user" || candidate.type === "ai") &&
        typeof candidate.content === "string"
      );
    })
    .map((message) => ({
      id: message.id,
      type: message.type,
      content: message.content,
      timestamp: new Date(message.timestamp),
      status: message.status === "error" ? "error" : "done",
      showThinking: false,
      showDot: false,
      clarifications: Array.isArray(message.clarifications)
        ? message.clarifications
            .filter((item) => typeof item?.question === "string" && typeof item?.answer === "string")
            .map((item) => ({
              question: item.question,
              answer: item.answer,
            }))
        : undefined,
      attachments: Array.isArray(message.attachments)
        ? message.attachments
            .map((attachment) => {
              const resolvedUrl = restoreAttachmentUrl(attachment, projectData);

              return {
                name: attachment?.name,
                source: attachment?.source,
                url: resolvedUrl,
              };
            })
            .filter((attachment) => typeof attachment.url === "string" && attachment.url.length > 0)
        : undefined,
    }));
};

const getChatClarificationRecap = (projectData: ProjectData | null) => {
  const usability = projectData?.analysis?.usabilityTesting;
  if (!usability) return [];

  return [
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
  ].filter((pair) => pair.answer.trim().length > 0);
};

const getChatAttachments = (projectData: ProjectData | null) => {
  if (!Array.isArray(projectData?.analysis?.designScreens)) return [];

  return projectData.analysis.designScreens
    .filter((screen: any) => typeof screen?.url === "string" && screen.url.length > 0)
    .map((screen: any) => ({
      name: screen.name || "Screen",
      source: screen.source || "unknown",
      url: screen.url,
    }));
};

const buildFallbackWorkspaceChatState = (projectData: ProjectData | null): RestoredWorkspaceChatState => {
  const description = typeof projectData?.description === "string" ? projectData.description.trim() : "";
  const hasResearchContext = Boolean(
    description &&
    (
      projectData?.analysis?.isResearchRelated ||
      Array.isArray(projectData?.analysis?.discussionGuide?.sections) ||
      projectData?.analysis?.aiEnhancedBrief
    ),
  );

  if (!hasResearchContext) {
    return {
      messages: [],
      conversationHistory: [],
      updatedAt: 0,
    };
  }

  const timestampValue = typeof projectData?.timestamp === "number" ? projectData.timestamp : Date.now();

  return {
    messages: [
      {
        id: `seed-${projectData?.id || "project"}`,
        type: "user",
        content: description,
        timestamp: new Date(timestampValue),
        status: "done",
        clarifications: getChatClarificationRecap(projectData),
        attachments: getChatAttachments(projectData),
      },
    ],
    conversationHistory: [{ role: "user", content: description }],
    updatedAt: timestampValue,
  };
};

const parsePersistedWorkspaceChatState = (
  value: unknown,
  projectData: ProjectData | null,
): RestoredWorkspaceChatState | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<PersistedWorkspaceChatState>;
  const messages = deserializeChatMessages(candidate.messages, projectData);
  const conversationHistory = sanitizeConversationHistory(candidate.conversationHistory);
  const updatedAt = typeof candidate.updatedAt === "number" ? candidate.updatedAt : 0;

  if (messages.length === 0 && conversationHistory.length === 0) {
    return null;
  }

  return {
    messages,
    conversationHistory,
    updatedAt,
  };
};

const buildPersistedWorkspaceChatPayload = (
  messages: ChatMessage[],
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>,
): PersistedWorkspaceChatState | null => {
  const serializedMessages = serializeChatMessages(messages);
  const sanitizedConversationHistory = sanitizeConversationHistory(conversationHistory);

  if (serializedMessages.length === 0 && sanitizedConversationHistory.length === 0) {
    return null;
  }

  const updatedAt = serializedMessages.reduce((latest, message) => {
    const nextTimestamp = Number.isFinite(Date.parse(message.timestamp)) ? Date.parse(message.timestamp) : 0;
    return Math.max(latest, nextTimestamp);
  }, 0);

  return {
    messages: serializedMessages,
    conversationHistory: sanitizedConversationHistory,
    updatedAt: updatedAt || Date.now(),
  };
};

const restoreWorkspaceChatState = (projectData: ProjectData | null): RestoredWorkspaceChatState => {
  try {
    const storageKey = getWorkspaceChatStorageKey(projectData?.id);
    const stored = storageKey ? localStorage.getItem(storageKey) : null;
    const localSnapshot = stored
      ? parsePersistedWorkspaceChatState(JSON.parse(stored), projectData)
      : null;
    const analysisSnapshot = parsePersistedWorkspaceChatState(projectData?.analysis?.workspaceChat, projectData);
    const resolvedSnapshot = [localSnapshot, analysisSnapshot]
      .filter((snapshot): snapshot is RestoredWorkspaceChatState => Boolean(snapshot))
      .sort((left, right) => right.updatedAt - left.updatedAt)[0];

    if (resolvedSnapshot) {
      return resolvedSnapshot;
    }
  } catch (error) {
    console.error("Failed to restore workspace chat state:", error);
  }

  return buildFallbackWorkspaceChatState(projectData);
};

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
  const [aiEnhancedBrief, setAiEnhancedBrief] = useState<AIEnhancedBrief | null>(null);
  const [questionSetState, setQuestionSetState] = useState<QuestionSetState | null>(null);
  const [participants, setParticipants] = useState<StudyParticipant[]>([]);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatConversationHistory, setChatConversationHistory] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [isResearchRelated, setIsResearchRelated] = useState(false);
  const [isButtonReady, setIsButtonReady] = useState(false);
  const [isGuideLoading, setIsGuideLoading] = useState(false);
  const [showPauseResearchDialog, setShowPauseResearchDialog] = useState(false);
  const [showCompleteResearchDialog, setShowCompleteResearchDialog] = useState(false);
  const lastPersistedAnalysisKeyRef = useRef<string>("");
  const lastPersistedWorkspaceChatKeyRef = useRef<string>("");
  const restoredChatProjectIdRef = useRef<string | null>(null);
  const workspaceChatPersistTimeoutRef = useRef<number | null>(null);
  const researchMode = useMemo(() => getResearchMode(projectData?.analysis), [projectData?.analysis]);
  const isAIEnhancedMode = researchMode === "ai_enhanced";
  const aiEnhancedDisplayGuide = useMemo(
    () => buildAIEnhancedDisplayGuide(aiEnhancedBrief),
    [aiEnhancedBrief],
  );
  const hasStructuredGuide = Boolean(discussionGuide?.sections?.length);
  const shouldShowCenteredGuideChat = !isAIEnhancedMode && currentStep === "guide" && !hasStructuredGuide;

  const syncProjectData = useCallback((nextProjectData: ProjectData) => {
    setProjectData(nextProjectData);
    localStorage.setItem("searchai-project", JSON.stringify({
      ...nextProjectData,
      timestamp: Date.now(),
    }));
  }, []);

  const workspaceChatPayload = useMemo(
    () => buildPersistedWorkspaceChatPayload(chatMessages, chatConversationHistory),
    [chatConversationHistory, chatMessages],
  );

  const workspaceChatContentKey = useMemo(
    () => JSON.stringify(workspaceChatPayload ? {
      messages: workspaceChatPayload.messages,
      conversationHistory: workspaceChatPayload.conversationHistory,
    } : null),
    [workspaceChatPayload],
  );

  const buildCurrentAnalysisSnapshot = useCallback((includeResearchState: boolean) => {
    const existingAnalysis = projectData?.analysis || {};
    const nextWorkspaceChat = workspaceChatPayload ?? existingAnalysis.workspaceChat ?? null;

    if (!includeResearchState) {
      return {
        ...existingAnalysis,
        workspaceChat: nextWorkspaceChat,
      };
    }

    if (researchMode === "ai_enhanced") {
      return {
        ...existingAnalysis,
        researchMode: "ai_enhanced",
        aiEnhancedBrief,
        isResearchRelated: true,
        workspaceChat: nextWorkspaceChat,
        updatedAt: new Date().toISOString(),
      };
    }

    return {
      ...existingAnalysis,
      researchMode: "structured",
      discussionGuide,
      questionSet: ensureQuestionSetState(questionSetState, discussionGuide),
      isResearchRelated: true,
      workspaceChat: nextWorkspaceChat,
      updatedAt: new Date().toISOString(),
    };
  }, [aiEnhancedBrief, discussionGuide, projectData?.analysis, questionSetState, researchMode, workspaceChatPayload]);

  useEffect(() => {
    const researcherSession = localStorage.getItem("researcher-session");
    if (researcherSession) {
      const sessionData = JSON.parse(researcherSession);
      const restoredChatState = restoreWorkspaceChatState(sessionData.projectData ?? null);

      setProjectData(sessionData.projectData);
      setChatMessages(restoredChatState.messages);
      setChatConversationHistory(restoredChatState.conversationHistory);
      restoredChatProjectIdRef.current = sessionData.projectData?.id ?? null;
      setCurrentStep((sessionData.autoStartPhase === "starting" ? "run" : sessionData.autoStartPhase || "run") as WorkspaceStep);
      setIsResearchRelated(true);
      localStorage.removeItem("researcher-session");
      return;
    }

    const stored = localStorage.getItem("searchai-project");
    if (stored) {
      const parsedProject = JSON.parse(stored);
      const targetStep = localStorage.getItem("searchai-workspace-target-step");
      const persistedWorkflowStage = getPersistedWorkflowStage(parsedProject?.analysis);
      const restoredChatState = restoreWorkspaceChatState(parsedProject);

      setProjectData(parsedProject);
      setChatMessages(restoredChatState.messages);
      setChatConversationHistory(restoredChatState.conversationHistory);
      restoredChatProjectIdRef.current = parsedProject?.id ?? null;
      if (targetStep === "analyze" || persistedWorkflowStage === "analyze") {
        setCurrentStep("analyze");
      }
      localStorage.removeItem("searchai-workspace-target-step");
    } else {
      navigate("/");
    }
  }, [navigate]);

  useEffect(() => {
    const projectId = projectData?.id ?? null;
    if (!projectId) {
      return;
    }

    const hasCurrentChat = chatMessages.length > 0 || chatConversationHistory.length > 0;
    const hasPersistedAnalysisChat = Boolean(projectData?.analysis?.workspaceChat);
    const shouldRestoreForProjectSwitch = restoredChatProjectIdRef.current !== projectId;

    if (!shouldRestoreForProjectSwitch && (hasCurrentChat || !hasPersistedAnalysisChat)) {
      return;
    }

    const restoredChatState = restoreWorkspaceChatState(projectData);
    if (!shouldRestoreForProjectSwitch && restoredChatState.messages.length === 0 && restoredChatState.conversationHistory.length === 0) {
      return;
    }

    setChatMessages(restoredChatState.messages);
    setChatConversationHistory(restoredChatState.conversationHistory);
    restoredChatProjectIdRef.current = projectId;
  }, [chatConversationHistory.length, chatMessages.length, projectData]);

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
          analysis: latestProject.analysis
            ? {
                ...latestProject.analysis,
                workspaceChat: latestProject.analysis.workspaceChat ?? projectData.analysis?.workspaceChat,
              }
            : projectData.analysis,
        };

        syncProjectData(mergedProject);
      } catch (error) {
        console.error("Failed to hydrate latest project:", error);
      }
    };

    void hydrateLatestProject();
  }, [projectData?.id, syncProjectData, user]);

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
    const persistedBrief = normalizeAIEnhancedBrief(projectData?.analysis?.aiEnhancedBrief);

    if (researchMode === "structured") {
      if (!discussionGuide && Array.isArray(persistedGuide?.sections) && persistedGuide.sections.length > 0) {
        setDiscussionGuide(persistedGuide);
      }

      if (!questionSetState && Array.isArray(persistedGuide?.sections) && persistedGuide.sections.length > 0) {
        setQuestionSetState(ensureQuestionSetState(projectData?.analysis?.questionSet, persistedGuide));
      }

      if (!isResearchRelated && (projectData?.analysis?.isResearchRelated || persistedGuide?.sections?.length > 0)) {
        setIsResearchRelated(true);
      }
      return;
    }

    if (!aiEnhancedBrief && persistedBrief) {
      setAiEnhancedBrief(persistedBrief);
    }

    if (!isResearchRelated) {
      setIsResearchRelated(true);
    }
  }, [aiEnhancedBrief, discussionGuide, isResearchRelated, projectData?.analysis, questionSetState, researchMode]);

  useEffect(() => {
    if (getPersistedWorkflowStage(projectData?.analysis) !== "analyze") return;
    setCurrentStep("analyze");
  }, [projectData?.analysis]);

  const persistProjectAnalysis = async (persistKey: string) => {
    if (!projectData?.id) return;

    try {
      const nextAnalysis = buildCurrentAnalysisSnapshot(true);

      await projectService.updateProject(projectData.id, {
        analysis: nextAnalysis,
      });

      const nextProjectData = {
        ...projectData,
        analysis: nextAnalysis,
      };

      syncProjectData(nextProjectData);
      lastPersistedAnalysisKeyRef.current = persistKey;
    } catch (error) {
      console.error("Failed to update project:", error);
    }
  };

  useEffect(() => {
    if (!isResearchRelated || !projectData?.id) return;

    if (researchMode === "ai_enhanced") {
      if (!aiEnhancedBrief) return;
      const nextPersistKey = JSON.stringify({
        mode: researchMode,
        updatedAt: aiEnhancedBrief.updatedAt,
        readiness: aiEnhancedBrief.contextReadiness,
        transcriptLength: aiEnhancedBrief.plannerTranscript.length,
      });
      if (lastPersistedAnalysisKeyRef.current === nextPersistKey) return;
      void persistProjectAnalysis(nextPersistKey);
      return;
    }

    if (!discussionGuide) return;
    const nextPersistKey = `${serializeDiscussionGuide(discussionGuide)}::${questionSetState?.currentVersionId || "none"}`;
    if (lastPersistedAnalysisKeyRef.current === nextPersistKey) return;
    void persistProjectAnalysis(nextPersistKey);
  }, [aiEnhancedBrief, discussionGuide, isResearchRelated, projectData?.id, questionSetState, researchMode]);

  useEffect(() => {
    const storageKey = getWorkspaceChatStorageKey(projectData?.id);
    if (!storageKey) {
      return;
    }

    try {
      if (!workspaceChatPayload) {
        localStorage.removeItem(storageKey);
        return;
      }

      localStorage.setItem(storageKey, JSON.stringify(workspaceChatPayload));
    } catch (error) {
      console.error("Failed to persist workspace chat state:", error);
    }
  }, [projectData?.id, workspaceChatPayload]);

  useEffect(() => {
    if (!projectData?.id || !user) {
      return;
    }

    if (workspaceChatPersistTimeoutRef.current) {
      window.clearTimeout(workspaceChatPersistTimeoutRef.current);
      workspaceChatPersistTimeoutRef.current = null;
    }

    if (!workspaceChatPayload) {
      lastPersistedWorkspaceChatKeyRef.current = "";
      return;
    }

    if (lastPersistedWorkspaceChatKeyRef.current === workspaceChatContentKey) {
      return;
    }

    workspaceChatPersistTimeoutRef.current = window.setTimeout(() => {
      const nextAnalysis = buildCurrentAnalysisSnapshot(false);

      void projectService.updateProject(projectData.id!, {
        analysis: nextAnalysis,
      }).then((updatedProject) => {
        syncProjectData({
          ...projectData,
          analysis: updatedProject.analysis ?? nextAnalysis,
        });
        lastPersistedWorkspaceChatKeyRef.current = workspaceChatContentKey;
      }).catch((error) => {
        console.error("Failed to persist workspace chat to project:", error);
      }).finally(() => {
        workspaceChatPersistTimeoutRef.current = null;
      });
    }, 600);

    return () => {
      if (workspaceChatPersistTimeoutRef.current) {
        window.clearTimeout(workspaceChatPersistTimeoutRef.current);
        workspaceChatPersistTimeoutRef.current = null;
      }
    };
  }, [buildCurrentAnalysisSnapshot, projectData, syncProjectData, user, workspaceChatContentKey, workspaceChatPayload]);

  const applyDiscussionGuide = useCallback((nextGuide: any, source: string) => {
    setDiscussionGuide(nextGuide);
    setQuestionSetState((currentQuestionSet) => createNextQuestionSetState(currentQuestionSet, nextGuide, source));
    setIsResearchRelated(true);
  }, []);

  const applyAIEnhancedBrief = useCallback((nextBrief: AIEnhancedBrief) => {
    setAiEnhancedBrief(nextBrief);
    setIsResearchRelated(true);
  }, []);

  useEffect(() => {
    if (researchMode !== "structured") return;
    setIsButtonReady(Boolean(discussionGuide?.sections?.length) && !isGuideLoading);
  }, [discussionGuide, isGuideLoading, researchMode]);

  useEffect(() => {
    if (currentStep === "run") {
      const timeoutId = window.setTimeout(() => {
        setIsChatCollapsed(true);
      }, 200);

      return () => window.clearTimeout(timeoutId);
    }
  }, [currentStep]);

  useEffect(() => {
    if (currentStep === "guide" && hasStructuredGuide) {
      setIsChatCollapsed(false);
    }
  }, [currentStep, hasStructuredGuide]);

  const getProjectTitle = (description: string) => {
    if (description.includes("Fibabanka.com.tr")) return "Fibabanka Açılış Sayfası Araştırması";
    if (description.includes("reklam") || description.includes("advertisement") || description.includes("ad")) return "Reklam Test Çalışması";
    if (description.includes("NPS") || description.includes("banking") || description.includes("bankacılık")) return "Müşteri Memnuniyeti Araştırması";
    return "Kullanıcı Deneyimi Araştırma Çalışması";
  };

  const getResearchSteps = () => {
    const planningReady = isAIEnhancedMode
      ? isAIEnhancedReady(aiEnhancedBrief) || currentStep === "recruit" || currentStep === "run" || currentStep === "analyze"
      : isResearchRelated || currentStep === "recruit" || currentStep === "run" || currentStep === "analyze";

    const steps = [
      { id: "planning", title: "Araştırma Planlaması" },
      { id: "recruit", title: "Katılımcı Seçimi" },
      { id: "conduct", title: "Görüşme Yürütme" },
      { id: "analyze", title: "Analiz & Rapor" },
    ];

    return steps.map((step) => {
      let status: "completed" | "current" | "upcoming" = "upcoming";

      if (step.id === "planning") {
        status = currentStep === "guide" && !planningReady
          ? "current"
          : planningReady
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
      setShowCompleteResearchDialog(true);
    }
  };

  const handleCompleteResearch = async () => {
    setShowCompleteResearchDialog(false);
    if (projectData?.id) {
      const nextAnalysis = {
        ...(projectData.analysis || {}),
        workflowStage: "analyze" as WorkspaceStep,
        updatedAt: new Date().toISOString(),
      };

      syncProjectData({
        ...projectData,
        analysis: nextAnalysis,
      });

      try {
        await projectService.updateProject(projectData.id, {
          analysis: nextAnalysis,
        });
      } catch (error) {
        console.error("Failed to persist analyze stage:", error);
      }
    }
    setCurrentStep("analyze");
  };

  const handlePauseResearch = async () => {
    try {
      await updateInterviewLinkAccess("paused");
      setShowPauseResearchDialog(false);
    } catch (error) {
      console.error("Failed to pause research:", error);
    }
  };

  const handleResumeResearch = async () => {
    try {
      await updateInterviewLinkAccess("active");
    } catch (error) {
      console.error("Failed to resume research:", error);
    }
  };

  const getStepButton = () => {
    switch (currentStep) {
      case "guide":
        return (
          <Button
            onClick={handleNextStep}
            className="bg-brand-primary hover:bg-brand-primary-hover text-white"
            disabled={
              isAIEnhancedMode
                ? !isAIEnhancedReady(aiEnhancedBrief)
                : !isResearchRelated || !discussionGuide || !isButtonReady
            }
            title={
              isAIEnhancedMode
                ? `AI Enhanced hazır: ${isAIEnhancedReady(aiEnhancedBrief)}`
                : `Research: ${isResearchRelated}, Guide: ${!!discussionGuide}, Ready: ${isButtonReady}`
            }
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
          <div className="flex items-center gap-3">
            <Button
              variant={isResearchPaused ? "outline" : "secondary"}
              onClick={isResearchPaused ? () => void handleResumeResearch() : () => setShowPauseResearchDialog(true)}
              className={isResearchPaused ? "border-amber-300 text-amber-900 hover:bg-amber-50" : ""}
            >
              {isResearchPaused ? <Play className="w-4 h-4 mr-2" /> : <Pause className="w-4 h-4 mr-2" />}
              {isResearchPaused ? "Araştırmaya Devam Et" : "Araştırmayı Durdur"}
            </Button>

            <Button onClick={handleNextStep} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
              <Square className="w-4 h-4 mr-2" />
              Araştırmayı Tamamla
            </Button>
          </div>
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

  const interviewControl = useMemo(
    () => getInterviewControlState(projectData?.analysis),
    [projectData?.analysis]
  );

  const isResearchPaused = interviewControl.linkAccess === "paused";

  const updateInterviewLinkAccess = useCallback(async (nextLinkAccess: "active" | "paused") => {
    if (!projectData?.id || !user) return;

    const nextAnalysis = applyInterviewLinkAccess(projectData.analysis, nextLinkAccess, user.id);
    const updatedProject = await projectService.updateProject(projectData.id, {
      analysis: nextAnalysis,
    });

    syncProjectData({
      ...projectData,
      analysis: updatedProject.analysis ?? nextAnalysis,
    });
  }, [projectData, syncProjectData, user]);

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

        {isAIEnhancedMode ? (
          <div className="h-[calc(100dvh-73px)] min-h-0 overflow-hidden">
            {currentStep === "analyze" ? (
              <AnalysisPanel
                projectId={projectData.id || ""}
                sessionIds={sessions.map((session) => session.id!).filter(Boolean)}
              />
            ) : currentStep === "guide" ? (
              <AIEnhancedBriefingPanel
                projectTitle={projectData.title || getProjectTitle(projectData.description)}
                projectDescription={projectData.description}
                brief={aiEnhancedBrief}
                onBriefUpdate={applyAIEnhancedBrief}
              />
            ) : (
              <StudyPanel
                discussionGuide={aiEnhancedDisplayGuide}
                participants={participants}
                sessions={sessions}
                projectId={projectData.id || ""}
                projectTitle={projectData.title || getProjectTitle(projectData.description)}
                currentStep={currentStep}
                researchMode={researchMode}
                aiEnhancedBrief={aiEnhancedBrief}
                isResearchPaused={isResearchPaused}
                researchPausedAt={interviewControl.pausedAt}
                questionSetVersionId={null}
                questionSetVersionNumber={null}
                questionSetUpdatedAt={aiEnhancedBrief?.updatedAt || null}
                onGuideUpdate={() => {}}
                onParticipantsUpdate={(nextParticipants) => {
                  setParticipants(nextParticipants);
                  if (nextParticipants.length > 0 && (currentStep as string) === "guide") {
                    setCurrentStep("recruit");
                  }
                  void loadResearchState();
                }}
                isGuideLoading={false}
                chatMessages={[]}
              />
            )}
          </div>
        ) : shouldShowCenteredGuideChat ? (
          <div className="h-[calc(100dvh-73px)] min-h-0 overflow-hidden">
            <ChatPanel
              key={`chat-centered-${projectData.id || "draft"}`}
              projectData={projectData}
              currentStep={currentStep}
              discussionGuide={discussionGuide}
              layoutMode="centered"
              initialMessages={chatMessages}
              initialConversationHistory={chatConversationHistory}
              onResearchDetected={setIsResearchRelated}
              onResearchPlanLoadingChange={setIsGuideLoading}
              onResearchPlanGenerated={(plan) => {
                applyDiscussionGuide(plan, "chat");
                setIsButtonReady(false);
              }}
              onMessagesUpdate={setChatMessages}
              onConversationHistoryUpdate={setChatConversationHistory}
            />
          </div>
        ) : (
          <ResizablePanelGroup
            direction={isMobile ? "vertical" : "horizontal"}
            className="h-[calc(100dvh-73px)] min-h-0 overflow-hidden"
          >
            <ResizablePanel
              defaultSize={isChatCollapsed ? 4 : currentStep === "guide" ? 24 : 25}
              minSize={isChatCollapsed ? 4 : currentStep === "guide" ? 18 : 20}
              maxSize={isChatCollapsed ? 4 : currentStep === "guide" ? 38 : 75}
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
                  key={`chat-sidebar-${projectData.id || "draft"}`}
                  projectData={projectData}
                  currentStep={currentStep}
                  discussionGuide={discussionGuide}
                  layoutMode="sidebar"
                  initialMessages={chatMessages}
                  initialConversationHistory={chatConversationHistory}
                  onResearchDetected={setIsResearchRelated}
                  onResearchPlanLoadingChange={setIsGuideLoading}
                  onResearchPlanGenerated={(plan) => {
                    applyDiscussionGuide(plan, "chat");
                    setIsButtonReady(false);
                  }}
                  onMessagesUpdate={setChatMessages}
                  onConversationHistoryUpdate={setChatConversationHistory}
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
                  researchMode={researchMode}
                  aiEnhancedBrief={null}
                  isResearchPaused={isResearchPaused}
                  researchPausedAt={interviewControl.pausedAt}
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
        )}

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
          researchMode={researchMode}
          aiEnhancedBrief={aiEnhancedBrief}
          currentQuestionSetVersionId={currentQuestionSetVersion?.id || null}
          currentQuestionSetVersionNumber={currentQuestionSetVersion?.number || null}
          questionSetUpdatedAt={isAIEnhancedMode ? aiEnhancedBrief?.updatedAt || null : currentQuestionSetVersion?.updatedAt || null}
          sessions={sessions}
        />

        <AlertDialog open={showPauseResearchDialog} onOpenChange={setShowPauseResearchDialog}>
          <AlertDialogContent className="bg-surface">
            <AlertDialogHeader>
              <AlertDialogTitle>Araştırmayı durdurmak istiyor musunuz?</AlertDialogTitle>
              <AlertDialogDescription className="space-y-3">
                <p>
                  Araştırmayı durdurduğunuzda bu zamana kadar gönderilen davet linkleri geçici olarak etkisiz hale gelir.
                </p>
                <p>
                  Şu anda görüşmede olan katılımcılar etkilenmez, ancak yeni girişler ve yeniden girişler durur. Araştırmaya devam ettiğinizde aynı linkler tekrar çalışır.
                </p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Vazgeç</AlertDialogCancel>
              <AlertDialogAction onClick={() => void handlePauseResearch()} className="bg-amber-600 hover:bg-amber-700 text-white">
                Araştırmayı Durdur
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={showCompleteResearchDialog} onOpenChange={setShowCompleteResearchDialog}>
          <AlertDialogContent className="bg-surface">
            <AlertDialogHeader>
              <AlertDialogTitle>Araştırmayı tamamlamak istiyor musunuz?</AlertDialogTitle>
              <AlertDialogDescription className="space-y-3">
                <p>
                  Araştırmayı tamamladığınız takdirde şu ana kadar tamamlanan görüşmelerin analizi çalıştırılacaktır.
                </p>
                <p>
                  Devam etmek istiyor musunuz? Bu işlem sonrasında analiz ekranına geçeceksiniz.
                </p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Vazgeç</AlertDialogCancel>
              <AlertDialogAction onClick={() => void handleCompleteResearch()} className="bg-destructive hover:bg-destructive/90">
                Araştırmayı Tamamla
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </ProtectedRoute>
  );
};

export default Workspace;
