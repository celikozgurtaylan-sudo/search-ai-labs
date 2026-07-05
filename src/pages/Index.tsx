import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Bot, LogOut, X, Sparkles, Plus, Link as LinkIcon } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import { AnimatedHeadline } from "@/components/ui/animated-headline";
import { SearchoMark } from "@/components/icons/SearchoMark";
import { useAuth } from "@/contexts/AuthContext";
import { projectService, Project } from "@/services/projectService";
import { toast } from "sonner";

const placeholderHints = [
"Searcho AI, bu açılış sayfasında dönüşümü düşüren 3 kritik friksiyonu bulur musun?",
"Bu reklam mesajında güveni zedeleyen ifadeleri tespit edip daha güçlü alternatifler önerir misin?",
"Hedef kitlemiz için hangi görüşme sorularını sorarsak satın alma engellerini daha net görürüz?",
"Kullanıcıların karar anında yaşadığı tereddütleri çıkarıp önceliklendirilmiş bir aksiyon planı oluşturur musun?",
"Rakiplerle kıyaslayıp değer önerimizdeki boşlukları ve fırsatları net bir rapora dönüştürür müsün?",
"İlk 10 kullanıcı görüşmesinden tema analizi yapıp en yüksek etkili iyileştirmeleri sıralar mısın?"];


interface UploadedDesignScreen {
  id: string;
  name: string;
  url: string;
  source: "figma-link";
  interactionMode?: "prototype";
  embedUrl?: string;
}

interface UsabilityIntake {
  objective: string;
  primaryTask: string;
  targetUsers: string;
  successSignals: string;
  riskAreas: string;
}

interface FigmaPrototypeDraft {
  id: string;
  name: string;
  url: string;
}

const Index = () => {
  const [projectDescription, setProjectDescription] = useState("");
  const [userProjects, setUserProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedResearchMode, setSelectedResearchMode] = useState<"structured" | "ai_enhanced">("structured");
  const [isAgentEnhancedPressing, setIsAgentEnhancedPressing] = useState(false);
  const [isUsabilityHovering, setIsUsabilityHovering] = useState(false);
  const [activePlaceholderIndex, setActivePlaceholderIndex] = useState(0);
  const [typedPlaceholderLength, setTypedPlaceholderLength] = useState(0);
  const [isDeletingPlaceholder, setIsDeletingPlaceholder] = useState(false);
  const [prototypeDrafts, setPrototypeDrafts] = useState<FigmaPrototypeDraft[]>([]);
  const [prototypeUrlDraft, setPrototypeUrlDraft] = useState("");
  const [isDesignModuleOpen, setIsDesignModuleOpen] = useState(false);
  const [usabilityIntake, setUsabilityIntake] = useState<UsabilityIntake>({
    objective: "",
    primaryTask: "",
    targetUsers: "",
    successSignals: "",
    riskAreas: ""
  });
  const agentEnhancedPressTimeoutRef = useRef<number | null>(null);
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const hasScreenContext = prototypeDrafts.length > 0;
  const hasRequiredUsabilityAnswers = usabilityIntake.objective.trim().length > 0 && usabilityIntake.primaryTask.trim().length > 0;
  const isAgentEnhancedSelected = selectedResearchMode === "ai_enhanced";
  const isUsabilityModeActive = isDesignModuleOpen || hasScreenContext;
  const isUsabilityWarmActive = isUsabilityModeActive && !isAgentEnhancedSelected;
  const isUsabilityWarmVisible = (isUsabilityHovering || isUsabilityWarmActive) && !isAgentEnhancedSelected;
  const activePlaceholder = placeholderHints[activePlaceholderIndex];
  const visiblePlaceholder = activePlaceholder.slice(0, typedPlaceholderLength);

  const buildFigmaEmbedUrl = (url: string) =>
    `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(url)}`;

  const isFigmaPrototypeUrl = (value: string) => {
    try {
      const url = new URL(value.trim());
      return url.hostname.endsWith("figma.com") && (
        url.pathname.includes("/proto/") ||
        url.pathname.includes("/design/") ||
        url.pathname.includes("/file/")
      );
    } catch {
      return false;
    }
  };

  const triggerAgentEnhancedPress = () => {
    if (agentEnhancedPressTimeoutRef.current) {
      window.clearTimeout(agentEnhancedPressTimeoutRef.current);
    }

    setIsAgentEnhancedPressing(true);
    agentEnhancedPressTimeoutRef.current = window.setTimeout(() => {
      setIsAgentEnhancedPressing(false);
      agentEnhancedPressTimeoutRef.current = null;
    }, 155);
  };

  useEffect(() => {
    if (user) {
      loadUserProjects();
    }
  }, [user]);

  useEffect(() => {
    return () => {
      if (agentEnhancedPressTimeoutRef.current) {
        window.clearTimeout(agentEnhancedPressTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (projectDescription) return;

    let timeoutId: number | undefined;

    if (!isDeletingPlaceholder && typedPlaceholderLength < activePlaceholder.length) {
      timeoutId = window.setTimeout(() => {
        setTypedPlaceholderLength((prev) => prev + 1);
      }, 18);
    } else if (!isDeletingPlaceholder && typedPlaceholderLength === activePlaceholder.length) {
      timeoutId = window.setTimeout(() => {
        setIsDeletingPlaceholder(true);
      }, 2200);
    } else if (isDeletingPlaceholder && typedPlaceholderLength > 0) {
      timeoutId = window.setTimeout(() => {
        setTypedPlaceholderLength((prev) => prev - 1);
      }, 10);
    } else if (isDeletingPlaceholder && typedPlaceholderLength === 0) {
      timeoutId = window.setTimeout(() => {
        setIsDeletingPlaceholder(false);
        setActivePlaceholderIndex((prev) => (prev + 1) % placeholderHints.length);
      }, 220);
    }

    return () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [activePlaceholder, isDeletingPlaceholder, projectDescription, typedPlaceholderLength]);

  const addPrototypeDraft = () => {
    const normalizedUrl = prototypeUrlDraft.trim();
    if (!isFigmaPrototypeUrl(normalizedUrl)) {
      toast.error("Geçerli bir Figma prototype veya design linki girin.");
      return;
    }

    setPrototypeDrafts((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        name: `Prototip ${prev.length + 1}`,
        url: normalizedUrl,
      },
    ]);
    setPrototypeUrlDraft("");
    toast.success("Figma prototipi eklendi.");
  };

  const removePrototypeDraft = (draftId: string) => {
    setPrototypeDrafts((prev) => prev.filter((draft) => draft.id !== draftId));
  };

  const renamePrototypeDraft = (draftId: string, nextName: string) => {
    setPrototypeDrafts((prev) =>
      prev.map((draft) => draft.id === draftId ? { ...draft, name: nextName } : draft)
    );
  };

  const uploadDesignScreens = async (): Promise<UploadedDesignScreen[]> =>
    prototypeDrafts.map((draft) => ({
      id: draft.id,
      name: draft.name.trim() || "Figma Prototip",
      url: draft.url,
      source: "figma-link" as const,
      interactionMode: "prototype" as const,
      embedUrl: buildFigmaEmbedUrl(draft.url),
    }));

  const loadUserProjects = async () => {
    try {
      const projects = await projectService.getUserProjects();
      setUserProjects(projects);
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  };

  const handleStartProject = async () => {
    if (!user) {
      navigate('/auth');
      return;
    }

    const projectDesc = projectDescription;
    if (!projectDesc.trim()) {
      toast.error('Please enter a project description');
      return;
    }

    if (hasScreenContext && !hasRequiredUsabilityAnswers) {
      setIsDesignModuleOpen(true);
      toast.error("Ekran tabanlı test için önce araştırma amacı ve ana kullanıcı görevini doldurun.");
      return;
    }

    if (selectedResearchMode === "ai_enhanced" && hasScreenContext) {
      toast.error("Agent Enhanced mod şimdilik kullanılabilirlik testi akışından ayrı çalışıyor.");
      return;
    }

    setLoading(true);
    try {
      const uploadedScreens = await uploadDesignScreens();
      const designScreens: UploadedDesignScreen[] = [...uploadedScreens];

      const usabilityTesting = hasScreenContext ?
      {
        mode: "figma-usability",
        objective: usabilityIntake.objective.trim(),
        primaryTask: usabilityIntake.primaryTask.trim(),
        targetUsers: usabilityIntake.targetUsers.trim(),
        successSignals: usabilityIntake.successSignals.trim(),
        riskAreas: usabilityIntake.riskAreas.trim(),
        guidancePrompt:
        "Bu proje ekran tabanlı kullanılabilirlik testidir. Sorular kullanıcı davranışı, görev tamamlama, anlaşılırlık, güven ve sürtünme noktalarına odaklanmalıdır.",
        createdAt: new Date().toISOString()
      } :
      null;

      const analysisPayload = {
        researchMode: selectedResearchMode,
        ...(hasScreenContext ? { designScreens, usabilityTesting } : {})
      };

      const project = await projectService.createProject({
        title: getProjectTitle(projectDesc),
        description: projectDesc,
        analysis: Object.keys(analysisPayload).length > 0 ? analysisPayload : null
      });

      // Store project data for the workspace
      localStorage.setItem('searchai-project', JSON.stringify({
        id: project.id,
        description: projectDesc,
        analysis: project.analysis || analysisPayload,
        timestamp: Date.now()
      }));

      // Set flag to trigger LLM analysis on workspace page
      localStorage.setItem('searchai-analyze-request', 'true');

      navigate('/workspace');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error('Failed to create project: ' + message);
    } finally {
      setLoading(false);
    }
  };

  const handleStartSyntheticUsers = async () => {
    if (!user) {
      navigate('/auth');
      return;
    }

    const projectDesc = projectDescription.trim();
    if (!projectDesc) {
      toast.error("Sentetik kullanıcı önerileri için önce araştırma konusunu yazın.");
      return;
    }

    setLoading(true);
    try {
      const project = await projectService.createProject({
        title: `${getProjectTitle(projectDesc)} - Sentetik Kullanıcılar`,
        description: projectDesc,
        analysis: {
          researchMode: "structured",
          syntheticUsers: {
            enabled: true,
            source: "manual_seed_v1",
            createdAt: new Date().toISOString(),
          },
        },
      });

      localStorage.setItem('searchai-project', JSON.stringify({
        id: project.id,
        title: project.title,
        description: projectDesc,
        analysis: project.analysis,
        timestamp: Date.now(),
      }));

      localStorage.setItem("searchai-workspace-synthetic-users", "true");
      navigate('/workspace');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error('Sentetik kullanıcı projesi oluşturulamadı: ' + message);
    } finally {
      setLoading(false);
    }
  };

  const getProjectTitle = (description: string) => {
    if (description.includes('Fibabanka.com.tr')) return 'Fibabanka Açılış Sayfası Araştırması';
    if (description.includes('reklam') || description.includes('advertisement') || description.includes('ad')) return 'Reklam Test Çalışması';
    if (description.includes('NPS') || description.includes('banking') || description.includes('bankacılık')) return 'Müşteri Memnuniyeti Araştırması';
    return 'Kullanıcı Deneyimi Araştırma Çalışması';
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      toast.success('Successfully signed out');
    } catch (error) {
      toast.error('Failed to sign out');
    }
  };
  return <div className="landing-page min-h-screen bg-canvas overflow-x-clip">
      <div className="landing-backdrop pointer-events-none" aria-hidden="true">
        <div className="landing-orb landing-orb--one" />
        <div className="landing-orb landing-orb--two" />
        <div className="landing-grid" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-border-light landing-fade-in landing-fade-in--1">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3 relative">
              <SearchoMark className="w-8 h-8 shrink-0" />
              <span className="text-xl font-semibold text-text-primary">Searcho</span>
              <Badge
              variant="secondary"
              className="absolute -top-2 left-full ml-1 text-xs px-1.5 py-0.5 bg-brand-primary-light text-brand-primary shadow-sm transition-transform duration-300 ease-out hover:rotate-[20deg] hover:-translate-y-0.5 hover:scale-105 hover:bg-brand-primary-light hover:text-brand-primary">
              
                Beta
              </Badge>
            </div>
            
            <div className="flex items-center space-x-6">
              {user ?
            <>
                  <Link to="/projects" className="flex items-center space-x-2 text-text-secondary hover:text-text-primary cursor-pointer transition-colors">
                    <span className="text-sm font-medium">Projelerim</span>
                    <div className="w-6 h-6 bg-brand-primary-light rounded-full flex items-center justify-center">
                      <span className="text-xs font-bold text-brand-primary">{userProjects.length}</span>
                    </div>
                  </Link>
                  
                  <div className="flex items-center space-x-2 bg-surface px-3 py-2 rounded-full border border-border-light">
                    <div className="w-6 h-6 bg-brand-primary rounded-full flex items-center justify-center">
                      <span className="text-xs font-medium text-white">
                        {user.email?.substring(0, 2).toUpperCase()}
                      </span>
                    </div>
                    <span className="text-sm font-medium text-text-primary">
                      {user.user_metadata?.display_name || 'Demo User'}
                    </span>
                    <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSignOut}
                  className="ml-2 p-1 h-6 w-6 hover:bg-destructive/10">
                  
                      <LogOut className="w-3 h-3 text-text-secondary hover:text-destructive" />
                    </Button>
                  </div>
                </> :

            <div className="flex items-center space-x-4">
                  <Link to="/auth">
                    <Button variant="outline">Sign In</Button>
                  </Link>
                </div>
            }
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 max-w-6xl mx-auto px-6 py-16 landing-fade-in landing-fade-in--2">
        <div className="text-center mb-12 landing-fade-in landing-fade-in--3">
          <AnimatedHeadline />
          <p className="text-xl text-text-secondary mb-8 max-w-2xl mx-auto">Araştırmanızı haftalarca beklemeyin. AI destekli görüşme ve analizlerle saatler içinde derin içgörülere ulaşın.</p>
        </div>

        {/* Project Input */}
        <div className={`landing-input-card mx-auto max-w-4xl bg-card border border-border rounded-xl p-8 mb-8 shadow-sm landing-fade-in landing-fade-in--4 ${isAgentEnhancedSelected ? "landing-input-card--agent-active" : ""} ${isUsabilityWarmActive ? "landing-input-card--usability-active" : ""} ${isUsabilityWarmVisible ? "landing-input-card--usability-hover" : ""} ${isAgentEnhancedPressing ? "landing-input-card--agent-smash" : ""}`}>
          <div
            className={`landing-agent-border-overlay landing-agent-border-overlay--card ${isAgentEnhancedSelected || isUsabilityWarmVisible ? "landing-agent-border-overlay--active" : ""} ${isUsabilityWarmVisible ? "landing-agent-border-overlay--warm" : ""}`}
            aria-hidden="true"
          />

          <div className="relative rounded-[0.9rem]">
            {/* Custom Animated Placeholder Overlay */}
            {!projectDescription &&
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div className="absolute left-3 top-2 right-4">
                  <div className={`min-h-[120px] whitespace-pre-wrap text-lg leading-8 ${isAgentEnhancedSelected ? "text-brand-secondary/55" : "text-text-muted opacity-75"}`}>
                    {visiblePlaceholder}
                    <span className={`ml-0.5 inline-block h-5 w-px translate-y-1 align-top animate-pulse ${isAgentEnhancedSelected ? "bg-brand-secondary/45" : "bg-text-muted"}`} />
                  </div>
                </div>
              </div>
          }
            
            <Textarea
            value={projectDescription}
            onChange={(e) => setProjectDescription(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && projectDescription.trim()) {
                e.preventDefault();
                handleStartProject();
              }
            }}
            placeholder=""
            className="min-h-[120px] text-lg border-border-light resize-none focus:ring-brand-primary focus:border-brand-primary relative z-10 bg-transparent landing-textarea" />
          
          </div>

          <div
          className={`overflow-hidden transition-all duration-500 ${
          isDesignModuleOpen ?
          "mt-5 max-h-[1200px] opacity-100 translate-y-0" :
          "mt-0 max-h-0 opacity-0 -translate-y-1 pointer-events-none"}`
          }
          style={{ transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}
          aria-hidden={!isDesignModuleOpen}>
          
            <div className="rounded-lg border border-border-light bg-surface/50 p-4 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <LinkIcon className="w-4 h-4 text-brand-primary" />
                  <p className="text-sm font-medium text-text-primary">Figma prototip linkini ekleyin</p>
                </div>
                {hasScreenContext && <Badge className="bg-brand-primary-light text-brand-primary border-0">
                    <Sparkles className="w-3 h-3 mr-1" />
                    Usability Mode
                  </Badge>}
              </div>

              <p className="text-xs text-text-secondary">
                Test etmek istediğiniz Figma prototype linkini girin. Katılımcının prototiple etkileşimi ekran kaydıyla doğrulanır.
              </p>

              <div className="space-y-2">
                <Label className="text-xs text-text-secondary">Figma Prototype Linki</Label>
                <div className="flex gap-2">
                  <Input
                    value={prototypeUrlDraft}
                    onChange={(event) => setPrototypeUrlDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addPrototypeDraft();
                      }
                    }}
                    placeholder="https://www.figma.com/proto/..."
                    className="h-10 bg-white placeholder:text-slate-300 placeholder:font-normal"
                  />
                  <Button type="button" variant="outline" onClick={addPrototypeDraft} className="h-10 gap-2">
                    <LinkIcon className="h-4 w-4" />
                    Ekle
                  </Button>
                </div>
                <p className="text-[11px] leading-5 text-text-muted">
                  Katılımcı bu prototipte etkileşime girerken ekran paylaşımı zorunlu olarak kaydedilir.
                </p>
              </div>

              {prototypeDrafts.length > 0 &&
                <div className="space-y-2">
                  <p className="text-xs text-text-secondary">Eklenecek prototipler</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    {prototypeDrafts.map((draft) =>
                      <div key={draft.id} className="group relative rounded-xl border border-border-light bg-white p-3">
                        <div className="absolute right-2 top-2">
                          <button
                            type="button"
                            onClick={() => removePrototypeDraft(draft.id)}
                            className="flex h-6 w-6 items-center justify-center rounded-full bg-black/75 text-white opacity-0 transition-opacity group-hover:opacity-100"
                            aria-label="Remove prototype">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="space-y-2 pr-7">
                          <div className="flex items-center gap-2 text-xs font-medium text-brand-primary">
                            <LinkIcon className="h-3.5 w-3.5" />
                            Figma prototype
                          </div>
                          <Input
                            value={draft.name}
                            onChange={(event) => renamePrototypeDraft(draft.id, event.target.value)}
                            placeholder="Prototip başlığı"
                            className="h-9"
                          />
                          <p className="truncate text-[11px] text-text-muted">{draft.url}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              }

              {hasScreenContext &&
            <div className="space-y-3 rounded-md border border-brand-primary/20 bg-white p-3">
                  <p className="text-sm font-medium text-text-primary">Usability test intake</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2 md:col-span-2">
                      <Label className="text-xs text-text-secondary">1) Bu ekranlardan neyi anlamak istiyorsunuz? *</Label>
                      <Textarea
                    value={usabilityIntake.objective}
                    onChange={(e) => setUsabilityIntake((prev) => ({ ...prev, objective: e.target.value }))}
                    placeholder="Örn: Kullanıcılar onboarding akışında neden terk ediyor?"
                    className="min-h-[74px]" />
                  
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <Label className="text-xs text-text-secondary">2) Kullanıcının bu ekranlarda tamamlamasını beklediğiniz ana görev nedir? *</Label>
                      <Textarea
                    value={usabilityIntake.primaryTask}
                    onChange={(e) => setUsabilityIntake((prev) => ({ ...prev, primaryTask: e.target.value }))}
                    placeholder="Örn: Kullanıcı kredi kartı başvurusunu hatasız tamamlamalı."
                    className="min-h-[74px]" />
                  
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs text-text-secondary">3) Hedef kullanıcı tipi</Label>
                      <Input
                    value={usabilityIntake.targetUsers}
                    onChange={(e) => setUsabilityIntake((prev) => ({ ...prev, targetUsers: e.target.value }))}
                    placeholder="Örn: 25-40 yaş dijital bankacılık kullanıcıları" />
                  
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs text-text-secondary">4) Başarı kriteri</Label>
                      <Input
                    value={usabilityIntake.successSignals}
                    onChange={(e) => setUsabilityIntake((prev) => ({ ...prev, successSignals: e.target.value }))}
                    placeholder="Örn: %80 görev tamamlama, düşük hata oranı" />
                  
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <Label className="text-xs text-text-secondary">5) Özellikle test edilmesini istediğiniz riskli alanlar</Label>
                      <Textarea
                    value={usabilityIntake.riskAreas}
                    onChange={(e) => setUsabilityIntake((prev) => ({ ...prev, riskAreas: e.target.value }))}
                    placeholder="Örn: Form alanlarının anlaşılabilirliği, güven algısı, CTA metinleri"
                    className="min-h-[68px]" />
                  
                    </div>
                  </div>
            </div>
            }
            </div>
          </div>
          
          <div className="flex items-center justify-between gap-3 mt-6">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onPointerEnter={() => setIsUsabilityHovering(true)}
                onPointerLeave={() => setIsUsabilityHovering(false)}
                onFocus={() => setIsUsabilityHovering(true)}
                onBlur={() => setIsUsabilityHovering(false)}
                onClick={() => {
                  setSelectedResearchMode("structured");
                  setIsDesignModuleOpen((prev) => !prev);
                }}
                className={`landing-usability-button h-9 rounded-full border-border-light bg-white/95 px-1.5 pr-3 hover:bg-white shadow-sm ${isUsabilityWarmVisible ? "landing-usability-button--hovering" : ""} ${isUsabilityWarmActive ? "landing-usability-button--active" : ""}`}
                aria-label={isDesignModuleOpen ? "Kullanılabilirlik testi panelini kapat" : "Kullanılabilirlik testi panelini aç"}
              >
                <span className={`mr-2 flex h-6 w-6 items-center justify-center rounded-full border border-border-light bg-surface text-text-primary ${isUsabilityWarmVisible ? "landing-usability-button__icon landing-usability-button__icon--hovering" : ""} ${isUsabilityWarmActive ? "landing-usability-button__icon landing-usability-button__icon--active" : ""}`}>
                  <Plus className={`h-4 w-4 transition-transform duration-300 ${isDesignModuleOpen ? "rotate-45" : ""}`} />
                </span>
                <span className={`text-xs font-medium text-text-secondary sm:text-sm ${isUsabilityWarmVisible ? "landing-usability-button__label landing-usability-button__label--hovering" : ""} ${isUsabilityWarmActive ? "landing-usability-button__label landing-usability-button__label--active" : ""}`}>
                  Kullanılabilirlik Testi
                </span>
              </Button>

              <Button
                type="button"
                variant="outline"
                onPointerDown={() => {
                  if (selectedResearchMode !== "ai_enhanced") {
                    triggerAgentEnhancedPress();
                  }
                }}
                onClick={() => {
                  if (selectedResearchMode === "ai_enhanced") {
                    setSelectedResearchMode("structured");
                    return;
                  }

                  setSelectedResearchMode("ai_enhanced");
                  setIsDesignModuleOpen(false);
                }}
                className={`h-9 rounded-full border-border-light bg-white/95 px-3 hover:bg-white shadow-sm ${selectedResearchMode === "ai_enhanced" ? "border-brand-primary/40 bg-brand-primary-light/30 text-brand-primary" : ""}`}
                aria-label={selectedResearchMode === "ai_enhanced" ? "Dinamik Soru-Cevap modunu kapat" : "Dinamik Soru-Cevap araştırma modunu seç"}
              >
                <Sparkles className="mr-2 h-4 w-4" />
                <span className="text-xs font-medium sm:text-sm">Dinamik Soru-Cevap</span>
              </Button>
            </div>
            <div className="flex flex-col items-stretch gap-2 sm:items-end">
              <Button onClick={() => handleStartProject()} disabled={!projectDescription.trim() || loading} className="bg-brand-primary hover:bg-brand-primary-hover text-white px-6 landing-cta-button">
                {loading ? 'Oluşturuluyor...' : 'Araştırma Planı Oluştur'} <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleStartSyntheticUsers()}
                disabled={!projectDescription.trim() || loading}
                className="h-9 border-brand-primary/25 bg-white/95 text-brand-primary hover:bg-brand-primary-light/30"
              >
                <Bot className="mr-2 h-4 w-4" />
                Sentetik Kullanıcılar
              </Button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-text-muted landing-fade-in landing-fade-in--6">
          
        </div>
      </main>
    </div>;
};
export default Index;
