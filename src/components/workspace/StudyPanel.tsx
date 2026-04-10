import { useState, useEffect, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Plus, Edit3, Check, X, FileText, Download, Share, Loader2, TrendingUp, AlertTriangle, Users, Video, Sparkles, RefreshCw, Trash2, GripVertical } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import TypewriterText from "@/components/ui/typewriter-text";
import ParticipantManager from "@/components/workspace/ParticipantManager";
import { StudyParticipant, StudySession } from "@/services/participantService";
import type { AIEnhancedBrief, ResearchMode } from "@/lib/aiEnhancedResearch";

interface StudyPanelProps {
  discussionGuide: any;
  participants: StudyParticipant[];
  sessions: StudySession[];
  projectId: string;
  projectTitle: string;
  currentStep: 'guide' | 'recruit' | 'run' | 'analyze';
  researchMode?: ResearchMode;
  aiEnhancedBrief?: AIEnhancedBrief | null;
  isResearchPaused?: boolean;
  researchPausedAt?: string | null;
  questionSetVersionId?: string | null;
  questionSetVersionNumber?: number | null;
  questionSetUpdatedAt?: string | null;
  onGuideUpdate: (guide: any) => void;
  onParticipantsUpdate: (participants: StudyParticipant[]) => void;
  isGuideLoading?: boolean;
  chatMessages?: any[];
}

interface QuestionReviewIssue {
  code: string;
  label: string;
  detail: string;
  severity: "caution" | "problematic";
}

interface QuestionReviewCheck {
  label: string;
  passed: boolean;
}

interface QuestionReviewResult {
  reviewedQuestion: string;
  status: "strong" | "caution" | "problematic";
  summary: string;
  issues: QuestionReviewIssue[];
  methodologyIssues?: QuestionReviewIssue[];
  violatedMustRules?: string[];
  checks: Record<string, QuestionReviewCheck>;
  suggestedRewrite: string | null;
  suggestionReason?: string;
}

const StudyPanel = ({
  discussionGuide,
  participants,
  sessions,
  projectId,
  projectTitle,
  currentStep,
  researchMode = "structured",
  aiEnhancedBrief = null,
  isResearchPaused = false,
  researchPausedAt = null,
  questionSetVersionId = null,
  questionSetVersionNumber = null,
  questionSetUpdatedAt = null,
  onGuideUpdate,
  onParticipantsUpdate,
  isGuideLoading = false,
  chatMessages = []
}: StudyPanelProps) => {
  const [editingQuestion, setEditingQuestion] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editingGuideTitle, setEditingGuideTitle] = useState(false);
  const [editGuideTitleValue, setEditGuideTitleValue] = useState("");
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editSectionValue, setEditSectionValue] = useState("");
  const [draggedSectionId, setDraggedSectionId] = useState<string | null>(null);
  const [dragOverSectionId, setDragOverSectionId] = useState<string | null>(null);
  const [loadingQuestions, setLoadingQuestions] = useState<{
    [key: string]: boolean;
  }>({});
  const [generatingQuestions, setGeneratingQuestions] = useState<{
    [key: string]: boolean;
  }>({});
  const [showSectionTypewriters, setShowSectionTypewriters] = useState<{
    [key: string]: boolean;
  }>({});
  const [showAnalysisTypewriter, setShowAnalysisTypewriter] = useState(false);
  const [visibleQuestions, setVisibleQuestions] = useState<{
    [key: string]: boolean;
  }>({});
  const [questionReviews, setQuestionReviews] = useState<{
    [key: string]: QuestionReviewResult;
  }>({});
  const [reviewingQuestions, setReviewingQuestions] = useState<{
    [key: string]: boolean;
  }>({});
  const isAIEnhancedMode = researchMode === "ai_enhanced";
  const allowGuideEditing = !isAIEnhancedMode;
  const questionSkeletonWidth = "w-11/12";
  const useQuestionSkeletonReveal = currentStep === "recruit";
  const questionRevealTimeoutsRef = useRef<number[]>([]);
  const scheduledQuestionKeysRef = useRef<{
    [key: string]: boolean;
  }>({});
  const visibleQuestionsRef = useRef<{
    [key: string]: boolean;
  }>({});

  const getQuestionKey = (sectionId: string, questionIndex: number) => `${sectionId}-${questionIndex}`;
  const getReviewStatusLabel = (status: QuestionReviewResult["status"]) => {
    switch (status) {
      case "strong":
        return "Güçlü";
      case "caution":
        return "Dikkat";
      default:
        return "Sorunlu";
    }
  };

  const getReviewStatusClasses = (status: QuestionReviewResult["status"]) => {
    switch (status) {
      case "strong":
        return "bg-status-success-light text-status-success border-0";
      case "caution":
        return "bg-status-warning/15 text-status-warning border-0";
      default:
        return "bg-destructive/10 text-destructive border-0";
    }
  };

  const clearQuestionReviewState = (questionKey: string) => {
    setQuestionReviews((prev) => {
      if (!prev[questionKey]) return prev;
      const next = { ...prev };
      delete next[questionKey];
      return next;
    });

    setReviewingQuestions((prev) => {
      if (!prev[questionKey]) return prev;
      const next = { ...prev };
      delete next[questionKey];
      return next;
    });
  };

  const clearSectionReviewState = (sectionId: string) => {
    setQuestionReviews((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((key) => {
        if (key.startsWith(`${sectionId}-`)) {
          delete next[key];
        }
      });
      return next;
    });

    setReviewingQuestions((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((key) => {
        if (key.startsWith(`${sectionId}-`)) {
          delete next[key];
        }
      });
      return next;
    });
  };

  const resolveProjectDescription = () => {
    const userMessages = chatMessages.filter((msg) => msg.type === "user");
    const latestUserInput = userMessages.length > 0 ? userMessages[userMessages.length - 1].content : "";

    if (latestUserInput) {
      return latestUserInput;
    }

    const persistedProject = localStorage.getItem("searchai-project");
    if (persistedProject) {
      try {
        const parsedProject = JSON.parse(persistedProject);
        if (typeof parsedProject?.description === "string" && parsedProject.description.trim()) {
          return parsedProject.description.trim();
        }
      } catch (error) {
        console.error("Stored project description parsing failed:", error);
      }
    }

    return discussionGuide?.title || "Kullanıcı deneyimi araştırması";
  };

  const resolveQuestionMode = () => {
    const persistedProject = localStorage.getItem("searchai-project");
    if (persistedProject) {
      try {
        const parsedProject = JSON.parse(persistedProject);
        if (parsedProject?.analysis?.usabilityTesting) {
          return "usability";
        }
        if (parsedProject?.analysis?.researchMode === "ai_enhanced") {
          return "ai_enhanced";
        }
      } catch (error) {
        console.error("Stored project parsing failed for question mode:", error);
      }
    }

    return researchMode === "ai_enhanced" ? "ai_enhanced" : "structured";
  };

  const recordQuestionEditLearning = async ({
    sectionTitle,
    sectionIndex,
    originalQuestionText,
    editedQuestionText,
    editSource,
  }: {
    sectionTitle: string;
    sectionIndex: number;
    originalQuestionText: string;
    editedQuestionText: string;
    editSource: string;
  }) => {
    const normalizedOriginal = originalQuestionText.trim();
    const normalizedEdited = editedQuestionText.trim();

    if (!projectId || !normalizedOriginal || !normalizedEdited || normalizedOriginal === normalizedEdited) {
      return;
    }

    if (sectionIndex < 0) {
      return;
    }

    try {
      const { error } = await supabase.functions.invoke("record-question-edit-learning", {
        body: {
          projectId,
          researchMode,
          hasUsabilityContext: resolveQuestionMode() === "usability",
          sectionTitle,
          sectionIndex,
          originalQuestionText: normalizedOriginal,
          editedQuestionText: normalizedEdited,
          editSource,
        },
      });

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error("Question learning event could not be recorded:", error);
    }
  };

  const createDemoQuestions = (sectionTitle: string, existingQuestions: string[]) => {
    const normalizedTitle = sectionTitle.toLocaleLowerCase('tr-TR');

    let candidates = [
      "Bu bölüm sizin için neyi daha görünür veya daha net hale getirmeli?",
      "Buradaki bilgi akışını nasıl tarif edersiniz?",
      "Bu aşamada aklınıza gelen ilk soru veya tereddüt ne olurdu?",
    ];

    if (normalizedTitle.includes('ilk') || normalizedTitle.includes('izlenim')) {
      candidates = [
        "Bu bölüme ilk baktığınızda dikkatinizi en çok ne çekiyor?",
        "İlk bakışta burada size ne anlatılmak istendiğini nasıl yorumladınız?",
        "Bu ilk görünümde size en az net gelen nokta ne?",
      ];
    } else if (normalizedTitle.includes('değer') || normalizedTitle.includes('akı')) {
      candidates = [
        "Bu adımın size hangi faydayı sunduğunu nasıl anlarsınız?",
        "Bu akışta devam etmek istemenizi sağlayan unsur ne olurdu?",
        "Burada eksik olduğunu düşündüğünüz bilgi veya yönlendirme var mı?",
      ];
    } else if (normalizedTitle.includes('iyileştirme') || normalizedTitle.includes('son')) {
      candidates = [
        "Bu deneyimi geliştirmek için ilk hangi noktadan başlardınız?",
        "Bu bölümde tek bir şeyi değiştirebilseydiniz neyi değiştirirdiniz?",
        "Buradaki deneyimi bir ekip arkadaşınıza nasıl özetlerdiniz?",
      ];
    }

    const normalizedExistingQuestions = new Set(
      existingQuestions.map((question: string) => question.trim().toLocaleLowerCase('tr-TR')),
    );

    return candidates
      .filter((question) => !normalizedExistingQuestions.has(question.trim().toLocaleLowerCase('tr-TR')))
      .slice(0, 3);
  };
  const handleEditGuideTitle = (currentValue: string) => {
    setEditingGuideTitle(true);
    setEditGuideTitleValue(currentValue);
  };
  const handleSaveGuideTitle = () => {
    if (!discussionGuide) return;

    onGuideUpdate({
      ...discussionGuide,
      title: editGuideTitleValue.trim() || "Adsız Araştırma Kılavuzu"
    });
    setEditingGuideTitle(false);
    setEditGuideTitleValue("");
  };
  const handleEditQuestion = (questionId: string, currentValue: string) => {
    setEditingQuestion(questionId);
    setEditValue(currentValue);
  };
  const handleEditSection = (sectionId: string, currentValue: string) => {
    setEditingSection(sectionId);
    setEditSectionValue(currentValue);
  };
  const handleSaveSectionTitle = (sectionId: string) => {
    if (!discussionGuide) return;
    const trimmedValue = editSectionValue.trim();
    const updatedGuide = {
      ...discussionGuide,
      sections: discussionGuide.sections.map((section: any, index: number) => {
        if (section.id === sectionId) {
          return {
            ...section,
            title: trimmedValue || `Başlıksız Bölüm ${index + 1}`
          };
        }
        return section;
      })
    };
    onGuideUpdate(updatedGuide);
    setEditingSection(null);
    setEditSectionValue("");
  };
  const handleDeleteSection = (sectionId: string) => {
    if (!discussionGuide) return;

    const updatedSections = discussionGuide.sections.filter((section: any) => section.id !== sectionId);
    const updatedGuide = {
      ...discussionGuide,
      sections: updatedSections
    };

    onGuideUpdate(updatedGuide);
    setEditingSection(current => current === sectionId ? null : current);
    setEditSectionValue("");
    setShowSectionTypewriters(prev => {
      const next = {
        ...prev
      };
      delete next[sectionId];
      return next;
    });
    setVisibleQuestions(prev => {
      const next = {
        ...prev
      };
      Object.keys(next).forEach(key => {
        if (key.startsWith(`${sectionId}-`)) {
          delete next[key];
        }
      });
      return next;
    });
    Object.keys(scheduledQuestionKeysRef.current).forEach(key => {
      if (key.startsWith(`${sectionId}-`)) {
        delete scheduledQuestionKeysRef.current[key];
      }
    });
    clearSectionReviewState(sectionId);
  };
  const handleAddSection = () => {
    if (!discussionGuide) return;

    const sectionId = `section-${Date.now()}`;
    const questionKey = `${sectionId}-0`;
    const newSection = {
      id: sectionId,
      title: "Yeni Bölüm",
      questions: ["Yeni soru - düzenlemek için tıklayın"]
    };

    onGuideUpdate({
      ...discussionGuide,
      sections: [...(discussionGuide.sections || []), newSection]
    });

    setShowSectionTypewriters(prev => ({
      ...prev,
      [sectionId]: false
    }));
    setVisibleQuestions(prev => ({
      ...prev,
      [questionKey]: false
    }));
    scheduledQuestionKeysRef.current[questionKey] = true;
    const timeoutId = window.setTimeout(() => {
      setVisibleQuestions(prev => ({
        ...prev,
        [questionKey]: true
      }));
    }, 180);
    questionRevealTimeoutsRef.current.push(timeoutId);
    setEditingSection(sectionId);
    setEditSectionValue(newSection.title);
  };
  const handleMoveSection = (sourceSectionId: string, targetSectionId: string) => {
    if (!discussionGuide || sourceSectionId === targetSectionId) return;

    const sections = [...discussionGuide.sections];
    const sourceIndex = sections.findIndex((section: any) => section.id === sourceSectionId);
    const targetIndex = sections.findIndex((section: any) => section.id === targetSectionId);

    if (sourceIndex < 0 || targetIndex < 0) return;

    const [movedSection] = sections.splice(sourceIndex, 1);
    sections.splice(targetIndex, 0, movedSection);

    onGuideUpdate({
      ...discussionGuide,
      sections
    });
  };
  const handleSectionDragStart = (event: React.DragEvent<HTMLElement>, sectionId: string) => {
    setDraggedSectionId(sectionId);
    setDragOverSectionId(sectionId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", sectionId);
  };
  const handleSectionDragOver = (event: React.DragEvent<HTMLDivElement>, sectionId: string) => {
    if (!draggedSectionId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (draggedSectionId !== sectionId && dragOverSectionId !== sectionId) {
      handleMoveSection(draggedSectionId, sectionId);
    }
    setDragOverSectionId(sectionId);
  };
  const handleSectionDrop = (event: React.DragEvent<HTMLDivElement>, sectionId: string) => {
    event.preventDefault();
    setDraggedSectionId(null);
    setDragOverSectionId(null);
  };
  const handleSectionDragEnd = () => {
    setDraggedSectionId(null);
    setDragOverSectionId(null);
  };
  const handleSaveQuestion = (sectionId: string, questionIndex: number) => {
    if (!discussionGuide) return;
    const questionKey = getQuestionKey(sectionId, questionIndex);
    const updatedQuestion = editValue.trim() || "Yeni soru - düzenlemek için tıklayın";
    const currentSection = discussionGuide.sections.find((section: any) => section.id === sectionId);
    const originalQuestion = currentSection?.questions?.[questionIndex] || "";
    const currentReview = questionReviews[questionKey];
    const sectionIndex = discussionGuide.sections.findIndex((section: any) => section.id === sectionId);
    const updatedGuide = {
      ...discussionGuide,
      sections: discussionGuide.sections.map((section: any) => {
        if (section.id === sectionId) {
          const updatedQuestions = [...section.questions];
          updatedQuestions[questionIndex] = updatedQuestion;
          return {
            ...section,
            questions: updatedQuestions
          };
        }
        return section;
      })
    };
    onGuideUpdate(updatedGuide);
    setQuestionReviews((prev) => {
      const currentReview = prev[questionKey];
      if (!currentReview || currentReview.reviewedQuestion === updatedQuestion) {
        return prev;
      }

      const next = { ...prev };
      delete next[questionKey];
      return next;
    });
    setEditingQuestion(null);
    setEditValue("");

    void recordQuestionEditLearning({
      sectionTitle: currentSection?.title || "",
      sectionIndex,
      originalQuestionText: originalQuestion,
      editedQuestionText: updatedQuestion,
      editSource: currentReview?.suggestedRewrite === updatedQuestion ? "review_rewrite_accept" : "manual_edit",
    });
  };
  const handleDeleteQuestion = (sectionId: string, questionIndex: number) => {
    if (!discussionGuide) return;

    const updatedGuide = {
      ...discussionGuide,
      sections: discussionGuide.sections.map((section: any) => {
        if (section.id === sectionId) {
          return {
            ...section,
            questions: section.questions.filter((_: string, index: number) => index !== questionIndex)
          };
        }
        return section;
      })
    };

    onGuideUpdate(updatedGuide);

    const questionKey = getQuestionKey(sectionId, questionIndex);
    setEditingQuestion(current => current === questionKey ? null : current);
    setEditValue("");
    clearSectionReviewState(sectionId);
    setVisibleQuestions(prev => {
      const next = {
        ...prev
      };
      Object.keys(next).forEach(key => {
        if (key.startsWith(`${sectionId}-`)) {
          delete next[key];
        }
      });

      const updatedSection = updatedGuide.sections.find((section: any) => section.id === sectionId);
      updatedSection?.questions.forEach((_: string, index: number) => {
        next[getQuestionKey(sectionId, index)] = true;
      });

      return next;
    });
    Object.keys(scheduledQuestionKeysRef.current).forEach(key => {
      if (key.startsWith(`${sectionId}-`)) {
        delete scheduledQuestionKeysRef.current[key];
      }
    });
  };
  const handleAddQuestion = (sectionId: string) => {
    if (!discussionGuide) return;
    const newQuestion = "Yeni soru - düzenlemek için tıklayın";
    let newQuestionIndex = 0;
    const updatedGuide = {
      ...discussionGuide,
      sections: discussionGuide.sections.map((section: any) => {
        if (section.id === sectionId) {
          newQuestionIndex = section.questions.length;
          return {
            ...section,
            questions: [...section.questions, newQuestion]
          };
        }
        return section;
      })
    };
    onGuideUpdate(updatedGuide);
    const questionKey = getQuestionKey(sectionId, newQuestionIndex);
    setVisibleQuestions(prev => ({
      ...prev,
      [questionKey]: true
    }));
    delete scheduledQuestionKeysRef.current[questionKey];
    clearQuestionReviewState(questionKey);
  };

  useEffect(() => {
    visibleQuestionsRef.current = visibleQuestions;
  }, [visibleQuestions]);

  useEffect(() => {
    if (!isGuideLoading || !discussionGuide?.sections?.length) return;

    questionRevealTimeoutsRef.current.forEach(timeoutId => window.clearTimeout(timeoutId));
    questionRevealTimeoutsRef.current = [];
    scheduledQuestionKeysRef.current = {};

    const hiddenQuestions: Record<string, boolean> = {};
    discussionGuide.sections.forEach((section: any) => {
      section.questions.forEach((_: string, questionIndex: number) => {
        hiddenQuestions[getQuestionKey(section.id, questionIndex)] = false;
      });
    });

    setVisibleQuestions(hiddenQuestions);
    setShowSectionTypewriters({});
  }, [discussionGuide, isGuideLoading]);

  useEffect(() => {
    if (!discussionGuide?.sections?.length) return;
    if (isGuideLoading) return;
    if (!useQuestionSkeletonReveal) {
      const nextVisibleQuestions: Record<string, boolean> = {};
      discussionGuide.sections.forEach((section: any) => {
        section.questions.forEach((_: string, questionIndex: number) => {
          nextVisibleQuestions[getQuestionKey(section.id, questionIndex)] = true;
        });
      });
      questionRevealTimeoutsRef.current.forEach(timeoutId => window.clearTimeout(timeoutId));
      questionRevealTimeoutsRef.current = [];
      scheduledQuestionKeysRef.current = {};
      setVisibleQuestions(nextVisibleQuestions);
      return;
    }

    const hiddenQuestions: Record<string, boolean> = {};
    let globalQuestionIndex = 0;

    discussionGuide.sections.forEach((section: any) => {
      section.questions.forEach((_: string, questionIndex: number) => {
        const questionKey = getQuestionKey(section.id, questionIndex);

        if (typeof visibleQuestionsRef.current[questionKey] === 'undefined') {
          hiddenQuestions[questionKey] = false;
        }

        if (
          typeof visibleQuestionsRef.current[questionKey] === 'undefined' &&
          !scheduledQuestionKeysRef.current[questionKey]
        ) {
          scheduledQuestionKeysRef.current[questionKey] = true;
          const timeoutId = window.setTimeout(() => {
            setVisibleQuestions(prev => ({
              ...prev,
              [questionKey]: true
            }));
          }, 320 + globalQuestionIndex * 170);
          questionRevealTimeoutsRef.current.push(timeoutId);
        }

        globalQuestionIndex += 1;
      });
    });

    if (Object.keys(hiddenQuestions).length > 0) {
      setVisibleQuestions(prev => ({
        ...prev,
        ...hiddenQuestions
      }));
    }
  }, [discussionGuide, isGuideLoading, useQuestionSkeletonReveal]);

  useEffect(() => {
    return () => {
      questionRevealTimeoutsRef.current.forEach(timeoutId => window.clearTimeout(timeoutId));
      questionRevealTimeoutsRef.current = [];
      scheduledQuestionKeysRef.current = {};
    };
  }, []);

  // Show analysis typewriter when entering analyze step
  useEffect(() => {
    if (currentStep === 'analyze' && !showAnalysisTypewriter) {
      setShowAnalysisTypewriter(true);
    }
  }, [currentStep, showAnalysisTypewriter]);

  useEffect(() => {
    if (!discussionGuide?.sections?.length) return;
    if (isGuideLoading) return;
    if (!useQuestionSkeletonReveal) {
      setShowSectionTypewriters({});
      return;
    }

    setShowSectionTypewriters(prev => {
      const next = { ...prev };
      let changed = false;

      discussionGuide.sections.forEach((section: any) => {
        if (typeof next[section.id] === 'undefined') {
          next[section.id] = true;
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [discussionGuide, isGuideLoading, useQuestionSkeletonReveal]);

  const handleReviewQuestion = async (sectionId: string, questionIndex: number, questionOverride?: string) => {
    if (!discussionGuide) return;

    const questionKey = getQuestionKey(sectionId, questionIndex);
    const trimmedQuestion = (questionOverride ?? editValue).trim();
    const section = discussionGuide.sections.find((item: any) => item.id === sectionId);
    const sectionIndex = discussionGuide.sections.findIndex((item: any) => item.id === sectionId);

    if (!trimmedQuestion || !section) {
      return;
    }

    setReviewingQuestions((prev) => ({
      ...prev,
      [questionKey]: true
    }));

    try {
      const { data, error } = await supabase.functions.invoke("review-question-quality", {
        body: {
          question: trimmedQuestion,
          sectionTitle: section.title,
          sectionIndex,
          projectDescription: resolveProjectDescription(),
          guideTitle: discussionGuide.title,
          mode: resolveQuestionMode(),
        }
      });

      if (error) {
        throw error;
      }

      setQuestionReviews((prev) => ({
        ...prev,
        [questionKey]: data as QuestionReviewResult
      }));
    } catch (error) {
      console.error("Error reviewing question quality:", error);
      alert(`Soru değerlendirilirken hata oluştu: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`);
    } finally {
      setReviewingQuestions((prev) => ({
        ...prev,
        [questionKey]: false
      }));
    }
  };

  const generateAIQuestions = async (sectionId: string, sectionTitle: string) => {
    const loadingStartedAt = performance.now();
    setGeneratingQuestions(prev => ({
      ...prev,
      [sectionId]: true
    }));
    
    setLoadingQuestions(prev => ({
      ...prev,
      [sectionId]: true
    }));

    try {
      // Get current questions for this section
      const currentSection = discussionGuide?.sections?.find((s: any) => s.id === sectionId);
      const existingQuestions = currentSection?.questions || [];

      const projectDescription = resolveProjectDescription();
      const sectionIndex = discussionGuide?.sections?.findIndex((section: any) => section.id === sectionId);

      console.log('Generating questions for:', { sectionTitle, sectionId, projectDescription });

      let questions: string[] = [];

      const { data, error } = await supabase.functions.invoke('generate-questions', {
        body: {
          sectionTitle,
          sectionId,
          sectionIndex,
          projectDescription,
          existingQuestions,
          count: 1,
          validateProject: false,
          mode: resolveQuestionMode(),
        }
      });

      if (error) {
        console.error('Supabase function error:', error);
        alert(`Sorular oluşturulurken hata oluştu: ${error.message}`);
        throw error;
      }

      console.log('Generated questions response:', data);

      if (data?.needsElaboration) {
        alert(`Lütfen daha detaylı bir araştırma projesi açıklaması yapın. ${data.reason || ''}`);
        return;
      }

      questions = (data?.questions || []).slice(0, 1);
      
      if (questions.length === 0) {
        alert('Soru oluşturulamadı. Lütfen tekrar deneyin.');
        return;
      }

      console.log('Adding questions:', questions);

      const updatedGuide = {
        ...discussionGuide,
        sections: discussionGuide.sections.map((section: any) => {
          if (section.id === sectionId) {
            return {
              ...section,
              questions: [...section.questions, ...questions]
            };
          }
          return section;
        })
      };
      onGuideUpdate(updatedGuide);

      console.log('Questions added successfully');
    } catch (error) {
      console.error('Error generating AI questions:', error);
      alert(`Beklenmeyen bir hata oluştu: ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`);
    } finally {
      const elapsed = performance.now() - loadingStartedAt;
      const remainingDelay = Math.max(0, 900 - elapsed);

      if (remainingDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, remainingDelay));
      }

      setLoadingQuestions(prev => ({
        ...prev,
        [sectionId]: false
      }));
      setGeneratingQuestions(prev => ({
        ...prev,
        [sectionId]: false
      }));
    }
  };
  const sessionsByParticipantId = useMemo(() => {
    const entries = new Map<string, StudySession[]>();

    sessions.forEach((session) => {
      if (!session.participant_id) return;
      const nextSessions = entries.get(session.participant_id) ?? [];
      nextSessions.push(session);
      entries.set(session.participant_id, nextSessions);
    });

    return entries;
  }, [sessions]);

  const getLatestSession = (participantId?: string | null) => {
    if (!participantId) return null;

    const participantSessions = sessionsByParticipantId.get(participantId) ?? [];
    return participantSessions
      .slice()
      .sort((left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime())[0] ?? null;
  };

  const getInterviewStatus = (participant: StudyParticipant) => {
    const latestSession = getLatestSession(participant.id);

    if (participant.status === "declined") {
      return "Reddetti";
    }

    if (participant.status === "completed" || latestSession?.status === "completed" || latestSession?.ended_at) {
      return "Tamamlandı";
    }

    if (latestSession?.status === "active" || latestSession?.started_at) {
      return "Görüşmede";
    }

    if (participant.status === "joined" || latestSession?.status === "scheduled") {
      return "Katıldı";
    }

    return "Davet Edildi";
  };
  const completedInterviewCount = participants.filter((participant) => getInterviewStatus(participant) === "Tamamlandı").length;
  const activeInterviewCount = participants.filter((participant) => getInterviewStatus(participant) === "Görüşmede").length;
  const renderAnalysisView = () => <div className="space-y-6">
      {/* Research Summary with Typewriter */}
      <div className="bg-surface p-6 rounded-lg">
        <h3 className="text-lg font-semibold text-text-primary mb-4">
          {showAnalysisTypewriter ? <TypewriterText text="Araştırma Özeti" speed={40} onComplete={() => {}} /> : "Araştırma Özeti"}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-brand-primary">
              {showAnalysisTypewriter ? <TypewriterText text="5" speed={100} delay={1000} /> : "5"}
            </div>
            <div className="text-sm text-text-secondary">Toplam Görüşme</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-brand-primary">
              {showAnalysisTypewriter ? <TypewriterText text="42" speed={100} delay={1500} /> : "42"}
            </div>
            <div className="text-sm text-text-secondary">Dakika</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-brand-primary">
              {showAnalysisTypewriter ? <TypewriterText text="8" speed={100} delay={2000} /> : "8"}
            </div>
            <div className="text-sm text-text-secondary">Ana Tema</div>
          </div>
        </div>
      </div>

      {/* Asked Questions */}
      <div className="bg-surface p-6 rounded-lg">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Sorulan Sorular</h3>
        <div className="space-y-3">
          {discussionGuide?.sections?.map((section: any) => <div key={section.id} className="border-l-2 border-brand-primary-light pl-4">
              <h4 className="font-medium text-text-primary mb-2">{section.title}</h4>
              <ul className="space-y-1">
                {section.questions.slice(0, 2).map((question: string, index: number) => <li key={index} className="text-sm text-text-secondary">• {question}</li>)}
              </ul>
            </div>)}
        </div>
      </div>

      {/* Given Answers */}
      <div className="bg-surface p-6 rounded-lg">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Verilen Cevaplar</h3>
        <div className="space-y-4">
          <div className="p-4 bg-canvas rounded-lg">
            <div className="flex items-center space-x-2 mb-2">
              <div className="w-6 h-6 bg-brand-primary-light rounded-full flex items-center justify-center">
                <span className="text-xs font-medium text-brand-primary">AK</span>
              </div>
              <span className="text-sm font-medium text-text-primary">Ahmet Kılıç</span>
            </div>
            <p className="text-sm text-text-secondary">"Mevcut bankacılık uygulamaları çok karmaşık. Daha basit bir arayüz isterdim..."</p>
          </div>
          <div className="p-4 bg-canvas rounded-lg">
            <div className="flex items-center space-x-2 mb-2">
              <div className="w-6 h-6 bg-brand-primary-light rounded-full flex items-center justify-center">
                <span className="text-xs font-medium text-brand-primary">MÖ</span>
              </div>
              <span className="text-sm font-medium text-text-primary">Merve Özkan</span>
            </div>
            <p className="text-sm text-text-secondary">"Güvenlik çok önemli ama kullanılabilirlik de ihmal edilmemeli..."</p>
          </div>
        </div>
      </div>

      {/* Common Points & Trends with Typewriter */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-surface p-6 rounded-lg">
          <h3 className="text-lg font-semibold text-text-primary mb-4">
            {showAnalysisTypewriter ? <TypewriterText text="Ortak Noktalar" speed={40} delay={3000} /> : "Ortak Noktalar"}
          </h3>
          <div className="space-y-3">
            <div className="flex items-start space-x-3">
              <div className="w-2 h-2 bg-status-success rounded-full mt-2"></div>
              <div>
                <p className="text-sm font-medium text-text-primary">
                  {showAnalysisTypewriter ? <TypewriterText text="Basitlik İsteği" speed={30} delay={4000} /> : "Basitlik İsteği"}
                </p>
                <p className="text-xs text-text-secondary">
                  {showAnalysisTypewriter ? <TypewriterText text="5/5 katılımcı daha basit arayüz istiyor" speed={20} delay={4500} /> : "5/5 katılımcı daha basit arayüz istiyor"}
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-2 h-2 bg-status-success rounded-full mt-2"></div>
              <div>
                <p className="text-sm font-medium text-text-primary">
                  {showAnalysisTypewriter ? <TypewriterText text="Güvenlik Endişesi" speed={30} delay={5000} /> : "Güvenlik Endişesi"}
                </p>
                <p className="text-xs text-text-secondary">
                  {showAnalysisTypewriter ? <TypewriterText text="4/5 katılımcı güvenlik önceliği vurguluyor" speed={20} delay={5500} /> : "4/5 katılımcı güvenlik önceliği vurguluyor"}
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-2 h-2 bg-status-warning rounded-full mt-2"></div>
              <div>
                <p className="text-sm font-medium text-text-primary">
                  {showAnalysisTypewriter ? <TypewriterText text="Mobil Öncelik" speed={30} delay={6000} /> : "Mobil Öncelik"}
                </p>
                <p className="text-xs text-text-secondary">
                  {showAnalysisTypewriter ? <TypewriterText text="3/5 katılımcı mobil odaklı çözüm istiyor" speed={20} delay={6500} /> : "3/5 katılımcı mobil odaklı çözüm istiyor"}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-surface p-6 rounded-lg">
          <h3 className="text-lg font-semibold text-text-primary mb-4">Genel Eğilimler</h3>
          <div className="space-y-3">
            <div className="flex items-start space-x-3">
              <TrendingUp className="w-4 h-4 text-status-success mt-1" />
              <div>
                <p className="text-sm font-medium text-text-primary">Pozitif Geri Bildirim</p>
                <p className="text-xs text-text-secondary">Genel konsept %80 olumlu karşılandı</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <AlertTriangle className="w-4 h-4 text-status-warning mt-1" />
              <div>
                <p className="text-sm font-medium text-text-primary">İyileştirme Alanları</p>
                <p className="text-xs text-text-secondary">Navigasyon ve filtreleme özellikleri</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <Users className="w-4 h-4 text-brand-primary mt-1" />
              <div>
                <p className="text-sm font-medium text-text-primary">Hedef Kitle</p>
                <p className="text-xs text-text-secondary">25-45 yaş arası profesyoneller odaklı</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Key Insights */}
      <div className="bg-surface p-6 rounded-lg">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Ana Temalar</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="p-4 bg-canvas rounded-lg">
              <h4 className="font-medium text-text-primary mb-2">🎯 Kullanılabilirlik</h4>
              <p className="text-sm text-text-secondary">Katılımcılar mevcut çözümlerin çok karmaşık olduğunu düşünüyor ve daha sezgisel arayüzler istiyor.</p>
            </div>
            <div className="p-4 bg-canvas rounded-lg">
              <h4 className="font-medium text-text-primary mb-2">🔒 Güvenlik</h4>
              <p className="text-sm text-text-secondary">Finansal işlemlerde güvenlik en önemli faktör olarak görülüyor ancak kullanıcı deneyimini engellemeden.</p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="p-4 bg-canvas rounded-lg">
              <h4 className="font-medium text-text-primary mb-2">📱 Mobil Odaklılık</h4>
              <p className="text-sm text-text-secondary">Kullanıcılar çoğunlukla mobil cihazlarından işlem yapıyor ve masaüstü deneyimine göre öncelik veriyor.</p>
            </div>
            <div className="p-4 bg-canvas rounded-lg">
              <h4 className="font-medium text-text-primary mb-2">⚡ Hız</h4>
              <p className="text-sm text-text-secondary">Yavaş loading süreler ve çok adımlı işlemler kullanıcı memnuniyetsizliğinin ana kaynağı.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Export Options */}
      <div className="bg-surface p-6 rounded-lg">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Rapor Dışa Aktarma</h3>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" size="sm">
            <FileText className="w-4 h-4 mr-2" />
            PDF Rapor
          </Button>
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            CSV Verileri
          </Button>
          <Button variant="outline" size="sm">
            <Share className="w-4 h-4 mr-2" />
            Paylaš
          </Button>
        </div>
      </div>
    </div>;
  if (!discussionGuide) {
    return <div className="h-full overflow-y-auto p-6">
        <div className="max-w-4xl space-y-6">
          <div className="text-center">
            <div className="w-12 h-12 bg-brand-primary-light rounded-lg flex items-center justify-center mx-auto mb-3">
              <Video className="w-6 h-6 text-brand-primary" />
            </div>
            <TypewriterText text="Tartışma kılavuzu oluşturuluyor..." speed={50} className="text-text-secondary" showCursor={true} />
          </div>

          {[0, 1].map(cardIndex => <Card key={cardIndex} className="p-6">
              <CardHeader className="p-0 mb-5 space-y-3">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-56" />
              </CardHeader>
              <CardContent className="p-0 space-y-4">
                <div className="flex items-start gap-3">
                    <Skeleton className="mt-1 h-4 w-4 rounded-sm" />
                    <Skeleton className={`h-4 ${questionSkeletonWidth}`} />
                  </div>
                <div className="flex gap-2 pt-2">
                  <Skeleton className="h-8 w-24 rounded-md" />
                  <Skeleton className="h-8 w-28 rounded-md" />
                </div>
              </CardContent>
            </Card>)}
        </div>
      </div>;
  }
  return <div className="h-full flex flex-col overflow-hidden">
      {/* Study Header */}
      <div className="border-b border-border-light p-6 flex-shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3">
          <div className="group">
            {isGuideLoading ? <div className="space-y-3 max-w-xl">
                <Skeleton className="h-6 w-72" />
                <Skeleton className="h-4 w-40" />
              </div> : editingGuideTitle ? <div className="space-y-2 max-w-xl">
                <Input value={editGuideTitleValue} onChange={e => setEditGuideTitleValue(e.target.value)} autoFocus />
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={handleSaveGuideTitle}>
                    <Check className="w-3 h-3 mr-1" />
                    Kaydet
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => {
                setEditingGuideTitle(false);
                setEditGuideTitleValue("");
              }}>
                    <X className="w-3 h-3 mr-1" />
                    İptal
                  </Button>
                </div>
              </div> : <div className="flex items-center gap-2">
                {isAIEnhancedMode ? (
                  <h2 className="text-lg font-semibold text-text-primary">{discussionGuide.title}</h2>
                ) : (
                  <>
                    <button type="button" className="text-left hover:text-brand-primary transition-colors" onClick={() => handleEditGuideTitle(discussionGuide.title)}>
                      <h2 className="text-lg font-semibold text-text-primary">{discussionGuide.title}</h2>
                    </button>
                    {questionSetVersionNumber ? <Badge variant="outline" className="border-brand-primary/30 text-brand-primary">
                        v{questionSetVersionNumber}
                      </Badge> : null}
                    <Button size="sm" variant="ghost" onClick={() => handleEditGuideTitle(discussionGuide.title)} className="text-text-secondary hover:text-text-primary">
                      <Edit3 className="w-3 h-3" />
                    </Button>
                  </>
                )}
                {isAIEnhancedMode ? <Badge variant="outline" className="border-brand-primary/30 text-brand-primary">
                    Agent Enhanced
                  </Badge> : null}
              </div>}
            <p className="mt-2 text-sm font-medium text-text-secondary">
              {currentStep === 'run'
                ? (isAIEnhancedMode
                  ? 'Katılımcıları yönet, anchor omurgayı görüntüle ve AI native görüşme akışını takip et'
                  : 'Katılımcıları yönet, görüşmeleri takip et ve gerekirse soru setini güncelle')
                : (isAIEnhancedMode
                  ? 'Agent Enhanced modda herkese aynı anchor omurga sorulur, follow-up sorular agent tarafından canlı üretilir'
                  : 'Kullanıcılara sorulacak sorular')}
            </p>
          </div>
          
          
        </div>
        
        {currentStep === 'run' && participants.length > 0 && <div className="text-sm text-text-secondary">
            {completedInterviewCount} / {participants.length} görüşme tamamlandı • {activeInterviewCount} görüşme şu anda aktif
          </div>}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 min-h-0">
        {currentStep === 'analyze' ? renderAnalysisView() : <div className="space-y-6">
            {currentStep === 'run' ? <Card className={`${isResearchPaused ? "border-amber-300/90 bg-amber-50" : "border-amber-200/80 bg-amber-50/90"} p-5 shadow-sm`}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-amber-900">
                      {isResearchPaused ? "Araştırma Duraklatıldı" : "Görüşme Yürütme Merkezi"}
                    </p>
                    <p className="mt-1 text-sm text-amber-800/90">
                      {isResearchPaused
                        ? "Gönderilmiş linkler geçici olarak kapalı. Aktif görüşmeler devam edebilir, yeni girişler ise araştırmaya devam ettiğinizde tekrar açılır."
                        : isAIEnhancedMode
                          ? "Katılımcıları buradan takip edebilir, yeni davetler gönderebilir ve Agent Enhanced görüşme omurgasını izleyebilirsin."
                          : "Katılımcıları buradan takip edebilir, yeni davetler gönderebilir ve soru setini düzenleyebilirsin."}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {isResearchPaused ? <Badge variant="outline" className="border-amber-300 bg-white/70 text-amber-900">
                        Linkler duraklatıldı
                      </Badge> : null}
                    <Badge variant="outline" className="border-amber-300 bg-white/70 text-amber-900">
                      {participants.length} katılımcı
                    </Badge>
                    <Badge variant="outline" className="border-amber-300 bg-white/70 text-amber-900">
                      {isAIEnhancedMode ? "AI native akış" : questionSetVersionNumber ? `v${questionSetVersionNumber}` : "Varsayılan set"}
                    </Badge>
                  </div>
                </div>

                <div className="mt-4 space-y-2 text-sm text-amber-900/80">
                  {isResearchPaused && researchPausedAt ? <p>
                      Araştırma {new Date(researchPausedAt).toLocaleString('tr-TR')} tarihinde duraklatıldı. Aynı linkler araştırmaya devam dediğiniz anda yeniden çalışır.
                    </p> : null}
                  {isAIEnhancedMode && aiEnhancedBrief?.themes?.length ? <p>
                      Bu modda tüm katılımcılar aynı anchor omurgayla başlar. AI follow-up soruları cevaplara göre canlı üretir ve tüm turn'ler analizde ayrı gösterilir.
                    </p> : null}
                  {!isAIEnhancedMode && questionSetVersionNumber && questionSetVersionNumber > 1 && questionSetUpdatedAt ? <p>
                      Sorular {new Date(questionSetUpdatedAt).toLocaleString('tr-TR')} tarihinde güncellendi. Bu andan sonra gönderdiğiniz yeni davetler güncel soru setini kullanır. Aktif veya tamamlanmış oturumlar etkilenmez.
                    </p> : null}
                </div>
              </Card> : null}

            {currentStep === 'run' ? <ParticipantManager
                projectId={projectId}
                projectTitle={projectTitle}
                researchMode={researchMode}
                aiEnhancedBrief={aiEnhancedBrief}
                isResearchPaused={isResearchPaused}
                currentQuestionSetVersionId={questionSetVersionId}
                currentQuestionSetVersionNumber={questionSetVersionNumber}
                questionSetUpdatedAt={questionSetUpdatedAt}
                sessions={sessions}
                onParticipantsUpdate={onParticipantsUpdate}
              /> : null}

            {/* Discussion Guide Sections */}
            {discussionGuide.sections.map((section: any) => {
            const isSectionEditing = editingSection === section.id || editingQuestion?.startsWith(`${section.id}-`);
            const isDragged = draggedSectionId === section.id;
            return <Card key={section.id} draggable={!isSectionEditing} onDragStart={event => handleSectionDragStart(event, section.id)} onDragEnd={handleSectionDragEnd} className={`p-6 transition-all ${dragOverSectionId === section.id ? 'border-brand-primary bg-brand-primary-light/20' : ''} ${isDragged ? 'opacity-60 scale-[0.99] shadow-lg' : ''} ${!isSectionEditing ? 'cursor-grab active:cursor-grabbing' : ''}`} onDragOver={event => handleSectionDragOver(event, section.id)} onDrop={event => handleSectionDrop(event, section.id)}>
                <CardHeader className="p-0 mb-4">
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle className="text-base font-semibold text-text-primary group flex-1 min-w-0">
                      {isGuideLoading ? <Skeleton className="h-5 w-44" /> : editingSection === section.id ? <div className="space-y-2">
                          <Input value={editSectionValue} onChange={e => setEditSectionValue(e.target.value)} autoFocus />
                          <div className="flex items-center gap-2">
                            <Button size="sm" onClick={() => handleSaveSectionTitle(section.id)}>
                              <Check className="w-3 h-3 mr-1" />
                              Kaydet
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => {
                        setEditingSection(null);
                        setEditSectionValue("");
                      }}>
                              <X className="w-3 h-3 mr-1" />
                              İptal
                            </Button>
                          </div>
                        </div> : allowGuideEditing ? <button type="button" className="text-left hover:text-brand-primary transition-colors" onClick={() => handleEditSection(section.id, section.title)}>
                          {showSectionTypewriters[section.id] ? <TypewriterText text={section.title} speed={24} delay={discussionGuide.sections.indexOf(section) * 180} enableControls={true} onComplete={() => setShowSectionTypewriters(prev => ({
                      ...prev,
                      [section.id]: false
                    }))} /> : section.title}
                        </button> : <span>{section.title}</span>}
                    </CardTitle>

                    {allowGuideEditing ? <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" draggable={false} className={`cursor-grab active:cursor-grabbing text-text-secondary hover:text-text-primary ${isGuideLoading ? 'invisible pointer-events-none' : ''}`} aria-label="Bölümü sürükleyerek yeniden sırala">
                        <GripVertical className="w-3 h-3" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleEditSection(section.id, section.title)} className={`text-text-secondary hover:text-text-primary ${isGuideLoading ? 'invisible pointer-events-none' : ''}`}>
                        <Edit3 className="w-3 h-3" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDeleteSection(section.id)} className={`text-text-secondary hover:text-destructive ${isGuideLoading ? 'invisible pointer-events-none' : ''}`}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div> : null}
                  </div>
                </CardHeader>
                
                <CardContent className="p-0 space-y-3">
                  {section.questions.map((question: string, index: number) => {
              const questionKey = getQuestionKey(section.id, index);
              const isQuestionVisible = !isGuideLoading && (useQuestionSkeletonReveal ? visibleQuestions[questionKey] === true : true);
              const currentReview = questionReviews[questionKey];
              const expectedReviewText = editingQuestion === questionKey ? editValue.trim() : question.trim();
              const isReviewCurrent = !!currentReview && currentReview.reviewedQuestion === expectedReviewText;
              return <div key={`${section.id}-${index}`} className="group flex items-start space-x-2">
                        <span className="text-xs text-text-muted mt-2 w-5">
                          {index + 1}.
                        </span>
                        
                        <div className="flex-1">
                          {isGuideLoading ? <div className="rounded-md border border-border-light bg-surface/60 px-3 py-3">
                              <Skeleton className={`h-4 ${questionSkeletonWidth}`} />
                            </div> : editingQuestion === questionKey && isQuestionVisible && allowGuideEditing ? <div className="space-y-3">
                                <Textarea value={editValue} onChange={e => setEditValue(e.target.value)} className="text-sm" autoFocus />
                                <div className="flex flex-wrap gap-2">
                                  <Button size="sm" onClick={() => handleSaveQuestion(section.id, index)}>
                                    Kaydet
                                  </Button>
                                  <Button size="sm" variant="outline" onClick={() => setEditingQuestion(null)}>
                                    İptal
                                  </Button>
                                </div>

                                {currentReview && currentReview.reviewedQuestion !== editValue.trim() && <p className="text-xs text-text-secondary">
                                    Metin değişti. Güncel yorum için yeniden değerlendir.
                                  </p>}
                              </div> : isQuestionVisible ? <div className={`text-sm text-text-primary rounded p-2 -m-2 transition-colors ${allowGuideEditing ? "cursor-text hover:bg-surface" : ""}`} onClick={() => {
                        if (allowGuideEditing) {
                          handleEditQuestion(questionKey, question);
                        }
                      }}>
                              {question}
                            </div> : <div className="rounded-md border border-border-light bg-surface/60 px-3 py-3">
                              <Skeleton className={`h-4 ${questionSkeletonWidth}`} />
                            </div>}

                          {!isGuideLoading && isReviewCurrent && <div className="mt-3 rounded-lg border border-border-light bg-surface/70 p-3 space-y-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge className={getReviewStatusClasses(currentReview.status)}>
                                  {getReviewStatusLabel(currentReview.status)}
                                </Badge>
                                <p className="text-xs text-text-secondary">
                                  {currentReview.summary}
                                </p>
                              </div>

                              {currentReview.issues.length > 0 && <div className="space-y-2">
                                  {currentReview.issues.map((issue) => <div key={issue.code} className="rounded-md border border-border-light bg-white/80 px-3 py-2">
                                      <p className="text-xs font-medium text-text-primary">{issue.label}</p>
                                      <p className="text-xs text-text-secondary">{issue.detail}</p>
                                    </div>)}
                                </div>}

                              {currentReview.violatedMustRules && currentReview.violatedMustRules.length > 0 ? <div className="rounded-md border border-destructive/15 bg-destructive/5 px-3 py-3">
                                  <p className="text-[11px] font-medium uppercase tracking-wide text-destructive mb-2">Must Kurallar</p>
                                  <div className="space-y-1">
                                    {currentReview.violatedMustRules.map((rule) => <p key={rule} className="text-xs text-text-secondary">
                                        {rule}
                                      </p>)}
                                  </div>
                                </div> : null}

                              <div className="flex flex-wrap gap-2">
                                {Object.entries(currentReview.checks).map(([key, check]) => <span key={key} className={`inline-flex items-center rounded-full px-2 py-1 text-[11px] ${check.passed ? "bg-status-success-light text-status-success" : "bg-surface text-text-secondary"}`}>
                                    {check.label}
                                  </span>)}
                              </div>

                              {currentReview.suggestedRewrite && <div className="rounded-md bg-white/80 px-3 py-3">
                                  <p className="text-[11px] font-medium uppercase tracking-wide text-text-secondary mb-1">Öneri</p>
                                  <p className="text-sm text-text-primary">"{currentReview.suggestedRewrite}"</p>
                                </div>}
                            </div>}
                        </div>
                        
                        {allowGuideEditing ? <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" className={`transition-opacity ${isQuestionVisible ? 'opacity-0 group-hover:opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => handleEditQuestion(questionKey, question)}>
                            <Edit3 className="w-3 h-3" />
                          </Button>
                          <Button size="sm" variant="ghost" className={`transition-opacity text-brand-primary hover:text-brand-primary-hover ${isQuestionVisible ? 'opacity-0 group-hover:opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => handleReviewQuestion(section.id, index, question)} disabled={reviewingQuestions[questionKey]}>
                            {reviewingQuestions[questionKey] ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />}
                            <span>Değerlendir</span>
                          </Button>
                          <Button size="sm" variant="ghost" className={`transition-opacity text-text-secondary hover:text-destructive ${isQuestionVisible ? 'opacity-0 group-hover:opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => handleDeleteQuestion(section.id, index)}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div> : null}
                      </div>;
            })}
                  
                   {!isGuideLoading && loadingQuestions[section.id] && <div className="group flex items-start space-x-2">
                      <span className="text-xs text-text-muted mt-2 w-5">
                        {section.questions.length + 1}.
                      </span>
                      <div className="flex-1 rounded-md border border-border-light bg-surface/60 px-3 py-3">
                        <div className="flex items-center gap-2 text-xs text-text-secondary mb-2">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>AI sorusu hazırlanıyor...</span>
                        </div>
                        <Skeleton className={`h-4 ${questionSkeletonWidth}`} />
                      </div>
                    </div>}
                  
                  {!isGuideLoading && allowGuideEditing ? <div className="flex items-center space-x-2">
                    <Button size="sm" variant="ghost" onClick={() => handleAddQuestion(section.id)} className="flex items-center space-x-1 text-text-secondary hover:text-text-primary" disabled={generatingQuestions[section.id]}>
                      <Plus className="w-3 h-3" />
                      <span>Soru ekle</span>
                    </Button>
                    
                    <Button size="sm" variant="ghost" onClick={() => generateAIQuestions(section.id, section.title)} className="flex items-center space-x-1 text-brand-primary hover:text-brand-primary-hover" disabled={generatingQuestions[section.id] || loadingQuestions[section.id]}>
                      {generatingQuestions[section.id] ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                      <span>AI soru üret</span>
                    </Button>
                  </div> : null}
                </CardContent>
              </Card>;
            })}

            {!isGuideLoading && allowGuideEditing ? <Card className="border-dashed border-border-light bg-surface/50">
              <CardContent className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-text-primary">Yeni bölüm ekle</p>
                    <p className="text-xs text-text-secondary">Başlık ve soruları sonradan düzenleyebilirsin.</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={handleAddSection} className="w-full sm:w-auto">
                    <Plus className="w-4 h-4 mr-2" />
                    Bölüm ekle
                  </Button>
                </div>
              </CardContent>
            </Card> : null}
            {currentStep === 'recruit' ? <ParticipantManager
                projectId={projectId}
                projectTitle={projectTitle}
                researchMode={researchMode}
                aiEnhancedBrief={aiEnhancedBrief}
                currentQuestionSetVersionId={questionSetVersionId}
                currentQuestionSetVersionNumber={questionSetVersionNumber}
                questionSetUpdatedAt={questionSetUpdatedAt}
                sessions={sessions}
                onParticipantsUpdate={onParticipantsUpdate}
              /> : null}
          </div>}
      </div>
    </div>;
};
export default StudyPanel;
