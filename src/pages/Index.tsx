import { useState, useEffect, type ClipboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, MessageSquare, BarChart3, Users, Search, LogOut, ImagePlus, X, Sparkles, Plus } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import { AnimatedHeadline } from "@/components/ui/animated-headline";
import { useAuth } from "@/contexts/AuthContext";
import { projectService, Project } from "@/services/projectService";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const templates = [{
  id: "ad-testing",
  title: "Reklam Testi ve Geri Bildirim",
  description: "Reklam kampanyalarınız ve kreatif varlıklarınız hakkında geri bildirim alın",
  icon: BarChart3,
  color: "bg-blue-50 text-blue-600"
}, {
  id: "landing-page",
  title: "Açılış Sayfası Testi",
  description: "Daha iyi dönüşüm oranları için açılış sayfanızı optimize edin",
  icon: Search,
  color: "bg-green-50 text-green-600"
}, {
  id: "nps-feedback",
  title: "NPS ve Müşteri Geri Bildirimi",
  description: "Müşteri memnuniyeti ve sadakatini ölçün",
  icon: Users,
  color: "bg-purple-50 text-purple-600"
}, {
  id: "foundational",
  title: "Temel Araştırma",
  description: "Kullanıcı ihtiyaçları ve pazar fırsatlarını derinlemesine analiz edin",
  icon: MessageSquare,
  color: "bg-orange-50 text-orange-600"
}];

const placeholderHints = [
  "Searcho AI, bu açılış sayfasında dönüşümü düşüren 3 kritik friksiyonu bulur musun?",
  "Bu reklam mesajında güveni zedeleyen ifadeleri tespit edip daha güçlü alternatifler önerir misin?",
  "Hedef kitlemiz için hangi görüşme sorularını sorarsak satın alma engellerini daha net görürüz?",
  "Kullanıcıların karar anında yaşadığı tereddütleri çıkarıp önceliklendirilmiş bir aksiyon planı oluşturur musun?",
  "Rakiplerle kıyaslayıp değer önerimizdeki boşlukları ve fırsatları net bir rapora dönüştürür müsün?",
  "İlk 10 kullanıcı görüşmesinden tema analizi yapıp en yüksek etkili iyileştirmeleri sıralar mısın?"
];

interface DesignScreenDraft {
  id: string;
  name: string;
  previewUrl: string;
  file: File;
}

interface UploadedDesignScreen {
  id: string;
  name: string;
  url: string;
  source: "upload" | "figma-link";
  mimeType?: string;
}

interface UsabilityIntake {
  objective: string;
  primaryTask: string;
  targetUsers: string;
  successSignals: string;
  riskAreas: string;
}

const DESIGN_SCREENS_BUCKET = "design-screens";
const USE_STORAGE_FOR_DESIGN_SCREENS = false;
const SCREEN_NAME_PREFIX = "Ekran";

const Index = () => {
  const [projectDescription, setProjectDescription] = useState("");
  const [userProjects, setUserProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPlaceholder, setCurrentPlaceholder] = useState(placeholderHints[0]);
  const [nextPlaceholder, setNextPlaceholder] = useState(placeholderHints[1]);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [screenDrafts, setScreenDrafts] = useState<DesignScreenDraft[]>([]);
  const [isUploadingScreens, setIsUploadingScreens] = useState(false);
  const [isDesignModuleOpen, setIsDesignModuleOpen] = useState(false);
  const [usabilityIntake, setUsabilityIntake] = useState<UsabilityIntake>({
    objective: "",
    primaryTask: "",
    targetUsers: "",
    successSignals: "",
    riskAreas: ""
  });
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const hasScreenContext = screenDrafts.length > 0;
  const hasRequiredUsabilityAnswers = usabilityIntake.objective.trim().length > 0 && usabilityIntake.primaryTask.trim().length > 0;

  useEffect(() => {
    if (user) {
      loadUserProjects();
    }
  }, [user]);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsTransitioning(true);
      
      setTimeout(() => {
        const currentIndex = placeholderHints.indexOf(currentPlaceholder);
        const nextIndex = (currentIndex + 1) % placeholderHints.length;
        const afterNextIndex = (nextIndex + 1) % placeholderHints.length;
        
        setCurrentPlaceholder(placeholderHints[nextIndex]);
        setNextPlaceholder(placeholderHints[afterNextIndex]);
        setIsTransitioning(false);
      }, 500);
    }, 4000);

    return () => clearInterval(interval);
  }, [currentPlaceholder]);

  const getNextScreenNumber = (drafts: DesignScreenDraft[]) => {
    const screenNumbers = drafts
      .map((draft) => {
        const match = draft.name.match(new RegExp(`^${SCREEN_NAME_PREFIX}\\s+(\\d+)$`));
        return match ? Number(match[1]) : 0;
      })
      .filter((value) => Number.isFinite(value));

    return screenNumbers.length > 0 ? Math.max(...screenNumbers) + 1 : 1;
  };

  const addScreenDrafts = (files: File[]) => {
    const validImageFiles = files.filter((file) => file.type.startsWith("image/"));
    if (validImageFiles.length === 0) return;

    setScreenDrafts((prev) => {
      const nextScreenNumber = getNextScreenNumber(prev);
      const newDrafts = validImageFiles.map((file, index) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        name: `${SCREEN_NAME_PREFIX} ${nextScreenNumber + index}`,
        previewUrl: URL.createObjectURL(file),
        file
      }));

      return [...prev, ...newDrafts];
    });
  };

  const handleScreenPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const items = Array.from(event.clipboardData.items || []);
    if (items.length === 0) return;

    const imageFiles = items
      .filter((item) => item.type.startsWith("image/"))
      .map((item, index) => {
        const file = item.getAsFile();
        if (!file) return null;
        const extension = file.type.split("/")[1] || "png";
        return new File([file], `figma-screen-${Date.now()}-${index}.${extension}`, { type: file.type });
      })
      .filter((file): file is File => file !== null);

    if (imageFiles.length === 0) return;

    event.preventDefault();
    addScreenDrafts(imageFiles);
    toast.success(imageFiles.length === 1 ? "1 ekran eklendi." : `${imageFiles.length} ekran eklendi.`);
  };

  const removeScreenDraft = (draftId: string) => {
    setScreenDrafts((prev) => {
      const target = prev.find((item) => item.id === draftId);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((item) => item.id !== draftId);
    });
  };

  const renameScreenDraft = (draftId: string, nextName: string) => {
    setScreenDrafts((prev) =>
      prev.map((draft) =>
        draft.id === draftId
          ? {
              ...draft,
              name: nextName
            }
          : draft
      )
    );
  };

  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
          return;
        }
        reject(new Error("Failed to encode image"));
      };
      reader.onerror = () => reject(new Error("Failed to read image file"));
      reader.readAsDataURL(file);
    });

  const uploadDesignScreens = async (): Promise<UploadedDesignScreen[]> => {
    if (!user || screenDrafts.length === 0) return [];

    setIsUploadingScreens(true);
    try {
      if (!USE_STORAGE_FOR_DESIGN_SCREENS) {
        const inlineScreens = await Promise.all(
          screenDrafts.map(async (draft) => ({
            id: draft.id,
            name: draft.name,
            url: await fileToDataUrl(draft.file),
            source: "upload" as const,
            mimeType: draft.file.type
          }))
        );
        return inlineScreens;
      }

      let usedInlineFallback = false;

      const uploads = await Promise.all(
        screenDrafts.map(async (draft) => {
          const safeFileName = draft.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const filePath = `${user.id}/${Date.now()}-${safeFileName}`;
          try {
            const { error: uploadError } = await supabase.storage
              .from(DESIGN_SCREENS_BUCKET)
              .upload(filePath, draft.file, {
                contentType: draft.file.type,
                upsert: false
              });

            if (uploadError) {
              throw new Error(uploadError.message);
            }

            const {
              data: { publicUrl }
            } = supabase.storage.from(DESIGN_SCREENS_BUCKET).getPublicUrl(filePath);

            return {
              id: draft.id,
              name: draft.name,
              url: publicUrl,
              source: "upload" as const,
              mimeType: draft.file.type
            };
          } catch (error) {
            usedInlineFallback = true;
            const inlineUrl = await fileToDataUrl(draft.file);
            return {
              id: draft.id,
              name: draft.name,
              url: inlineUrl,
              source: "upload" as const,
              mimeType: draft.file.type
            };
          }
        })
      );

      if (usedInlineFallback) {
        toast.warning("Ekranlar geçici olarak lokal veri olarak eklendi. Storage izinleri tamamlandığında otomatik yükleme aktif olur.");
      }

      return uploads;
    } finally {
      setIsUploadingScreens(false);
    }
  };

  const loadUserProjects = async () => {
    try {
      const projects = await projectService.getUserProjects();
      setUserProjects(projects);
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  };

  const handleStartProject = async (templateId?: string, description?: string) => {
    if (!user) {
      navigate('/auth');
      return;
    }

    const projectDesc = description || projectDescription;
    if (!projectDesc.trim()) {
      toast.error('Please enter a project description');
      return;
    }

    if (hasScreenContext && !hasRequiredUsabilityAnswers) {
      setIsDesignModuleOpen(true);
      toast.error("Ekran tabanlı test için önce araştırma amacı ve ana kullanıcı görevini doldurun.");
      return;
    }

    setLoading(true);
    try {
      const uploadedScreens = await uploadDesignScreens();
      const designScreens: UploadedDesignScreen[] = [...uploadedScreens];

      const usabilityTesting = hasScreenContext
        ? {
            mode: "figma-usability",
            objective: usabilityIntake.objective.trim(),
            primaryTask: usabilityIntake.primaryTask.trim(),
            targetUsers: usabilityIntake.targetUsers.trim(),
            successSignals: usabilityIntake.successSignals.trim(),
            riskAreas: usabilityIntake.riskAreas.trim(),
            guidancePrompt:
              "Bu proje ekran tabanlı kullanılabilirlik testidir. Sorular kullanıcı davranışı, görev tamamlama, anlaşılırlık, güven ve sürtünme noktalarına odaklanmalıdır.",
            createdAt: new Date().toISOString()
          }
        : null;

      const analysisPayload = {
        ...(templateId ? { template: templateId } : {}),
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
        template: templateId,
        analysis: project.analysis || analysisPayload,
        timestamp: Date.now()
      }));
      
      // Set flag to trigger LLM analysis on workspace page
      localStorage.setItem('searchai-analyze-request', 'true');
      
      navigate('/workspace');
    } catch (error: any) {
      toast.error('Failed to create project: ' + error.message);
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

  const handleTemplateSelect = (template: typeof templates[0]) => {
    const sampleDescriptions = {
      "ad-testing": "Reklam kampanyası performansını ve hedef kitle tepkilerini değerlendirmek için kapsamlı bir kullanıcı araştırması tasarlayın. Duygusal tepkiler, marka algısı ve satın alma niyeti üzerine odaklanılması gereken bir çalışma.",
      "landing-page": "Web sitesi açılış sayfasının kullanıcı deneyimi ve dönüşüm optimizasyonu için detaylı analiz gereksinimi. Kullanıcı davranışları, mesaj netliği ve etkileşim oranları üzerine araştırma planlanması.",
      "nps-feedback": "Müşteri memnuniyeti ve sadakat düzeyini ölçmeye yönelik NPS tabanlı araştırma metodolojisi. Kullanıcı geri bildirimlerinin sistematik analizi ve iyileştirme önerilerinin geliştirilmesi gereksinimi.",
      "foundational": "Kullanıcı ihtiyaçları ve pazar dinamiklerini derinlemesine anlamaya yönelik temel araştırma metodolojisi. Kullanıcı segmentasyonu, davranış analizi ve fırsat tespiti odaklı çalışma planlaması."
    };
    handleStartProject(template.id, sampleDescriptions[template.id as keyof typeof sampleDescriptions]);
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
            <div className="flex items-center space-x-2 relative">
              <span className="text-xl font-semibold text-text-primary">Searcho</span>
              <Badge variant="secondary" className="absolute -top-2 left-full ml-1 text-xs px-1.5 py-0.5 bg-brand-primary-light text-brand-primary">
                Beta
              </Badge>
            </div>
            
            <div className="flex items-center space-x-6">
              {user ? (
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
                      className="ml-2 p-1 h-6 w-6 hover:bg-destructive/10"
                    >
                      <LogOut className="w-3 h-3 text-text-secondary hover:text-destructive" />
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex items-center space-x-4">
                  <Link to="/auth">
                    <Button variant="outline">Sign In</Button>
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 max-w-4xl mx-auto px-6 py-16 landing-fade-in landing-fade-in--2">
        <div className="text-center mb-12 landing-fade-in landing-fade-in--3">
          <AnimatedHeadline />
          <p className="text-xl text-text-secondary mb-8 max-w-2xl mx-auto">Araştırmanızı haftalarca beklemeyin. AI destekli görüşme ve analizlerle saatler içinde derin içgörülere ulaşın.</p>
        </div>

        {/* Project Input */}
        <div className="landing-input-card bg-card border border-border rounded-xl p-8 mb-8 shadow-sm landing-fade-in landing-fade-in--4">
          <div className="relative">
            {/* Custom Animated Placeholder Overlay */}
            {!projectDescription && (
              <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div className="absolute left-3 top-2 right-3">
                  <div className="landing-placeholder-stack relative h-[120px] overflow-hidden">
                    <div 
                      className={`text-lg text-muted-foreground transition-all duration-600 ease-in-out ${
                        isTransitioning ? "animate-scroll-down-out" : ""
                      }`}
                      style={{ 
                        position: 'absolute',
                        width: '100%',
                        top: 0
                      }}
                    >
                      {currentPlaceholder}
                    </div>
                    <div 
                      className={`text-lg text-muted-foreground transition-all duration-600 ease-in-out ${
                        isTransitioning ? "animate-scroll-up-in" : "opacity-0"
                      }`}
                      style={{ 
                        position: 'absolute',
                        width: '100%',
                        top: 0
                      }}
                    >
                      {nextPlaceholder}
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            <Textarea 
              value={projectDescription} 
              onChange={e => setProjectDescription(e.target.value)} 
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && projectDescription.trim()) {
                  e.preventDefault();
                  handleStartProject();
                }
              }}
              placeholder=""
              className="min-h-[120px] text-lg border-border-light resize-none focus:ring-brand-primary focus:border-brand-primary relative z-10 bg-transparent landing-textarea"
            />
          </div>

          <div
            className={`overflow-hidden transition-all duration-500 ${
              isDesignModuleOpen
                ? "mt-5 max-h-[1200px] opacity-100 translate-y-0"
                : "mt-0 max-h-0 opacity-0 -translate-y-1 pointer-events-none"
            }`}
            style={{ transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}
            aria-hidden={!isDesignModuleOpen}
          >
            <div className="rounded-lg border border-border-light bg-surface/50 p-4 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ImagePlus className="w-4 h-4 text-brand-primary" />
                  <p className="text-sm font-medium text-text-primary">Figma ekranları ve prototip bağlamı</p>
                </div>
                {hasScreenContext && (
                  <Badge className="bg-brand-primary-light text-brand-primary border-0">
                    <Sparkles className="w-3 h-3 mr-1" />
                    Usability Mode
                  </Badge>
                )}
              </div>

              <p className="text-xs text-text-secondary">
                Figma'da test etmek istediğiniz ekranı kopyalayın ve aşağıdaki alana yapıştırın.
              </p>

              <div className="space-y-2">
                <Label className="text-xs text-text-secondary">Ekran Yapıştırma Alanı</Label>
                <div className="space-y-2">
                  <div
                    role="textbox"
                    tabIndex={0}
                    onPaste={handleScreenPaste}
                    onClick={(e) => e.currentTarget.focus()}
                    className="min-h-[88px] rounded-md border border-dashed border-border-light bg-white/80 p-3 text-sm text-text-secondary outline-none transition-colors focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20"
                  >
                    Buraya tıklayıp Cmd/Ctrl + V yapın.
                    <div className="mt-1 text-xs text-text-muted">
                      İpucu: Figma'da ilgili frame'i seçip Copy as PNG yaptıktan sonra yapıştırın.
                    </div>
                  </div>
                </div>
              </div>

              {screenDrafts.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-text-secondary">Yüklenecek ekranlar</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    {screenDrafts.map((draft) => (
                      <div key={draft.id} className="group relative rounded-xl border border-border-light bg-white p-3">
                        <div className="absolute right-2 top-2">
                          <button
                            type="button"
                            onClick={() => removeScreenDraft(draft.id)}
                            className="flex h-6 w-6 items-center justify-center rounded-full bg-black/75 text-white opacity-0 transition-opacity group-hover:opacity-100"
                            aria-label="Remove screen"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>

                        <div className="flex items-start gap-3">
                          <img src={draft.previewUrl} alt={draft.name} className="h-20 w-14 rounded-lg border border-border-light object-cover" />

                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="space-y-1">
                              <Label htmlFor={`screen-name-${draft.id}`} className="text-xs text-text-secondary">
                                Ekran başlığı
                              </Label>
                              <Input
                                id={`screen-name-${draft.id}`}
                                value={draft.name}
                                onChange={(e) => renameScreenDraft(draft.id, e.target.value)}
                                placeholder="Ekran başlığı"
                                className="h-9"
                              />
                            </div>

                            <p className="text-[11px] leading-5 text-text-muted">
                              Bu başlık kullanıcının göreceği bir başlık olacaktır.
                            </p>
                          </div>
                        </div>

                      </div>
                    ))}
                  </div>
                </div>
              )}

              {hasScreenContext && (
                <div className="space-y-3 rounded-md border border-brand-primary/20 bg-white p-3">
                  <p className="text-sm font-medium text-text-primary">Usability test intake</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2 md:col-span-2">
                      <Label className="text-xs text-text-secondary">1) Bu ekranlardan neyi anlamak istiyorsunuz? *</Label>
                      <Textarea
                        value={usabilityIntake.objective}
                        onChange={(e) => setUsabilityIntake((prev) => ({ ...prev, objective: e.target.value }))}
                        placeholder="Örn: Kullanıcılar onboarding akışında neden terk ediyor?"
                        className="min-h-[74px]"
                      />
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <Label className="text-xs text-text-secondary">2) Kullanıcının bu ekranlarda tamamlamasını beklediğiniz ana görev nedir? *</Label>
                      <Textarea
                        value={usabilityIntake.primaryTask}
                        onChange={(e) => setUsabilityIntake((prev) => ({ ...prev, primaryTask: e.target.value }))}
                        placeholder="Örn: Kullanıcı kredi kartı başvurusunu hatasız tamamlamalı."
                        className="min-h-[74px]"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs text-text-secondary">3) Hedef kullanıcı tipi</Label>
                      <Input
                        value={usabilityIntake.targetUsers}
                        onChange={(e) => setUsabilityIntake((prev) => ({ ...prev, targetUsers: e.target.value }))}
                        placeholder="Örn: 25-40 yaş dijital bankacılık kullanıcıları"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs text-text-secondary">4) Başarı kriteri</Label>
                      <Input
                        value={usabilityIntake.successSignals}
                        onChange={(e) => setUsabilityIntake((prev) => ({ ...prev, successSignals: e.target.value }))}
                        placeholder="Örn: %80 görev tamamlama, düşük hata oranı"
                      />
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <Label className="text-xs text-text-secondary">5) Özellikle test edilmesini istediğiniz riskli alanlar</Label>
                      <Textarea
                        value={usabilityIntake.riskAreas}
                        onChange={(e) => setUsabilityIntake((prev) => ({ ...prev, riskAreas: e.target.value }))}
                        placeholder="Örn: Form alanlarının anlaşılabilirliği, güven algısı, CTA metinleri"
                        className="min-h-[68px]"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex items-center justify-between mt-6">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setIsDesignModuleOpen((prev) => !prev)}
              className="h-9 w-9 rounded-full border-border-light bg-white/95 hover:bg-white shadow-sm"
              aria-label="Open design context panel"
            >
              <Plus className={`w-4.5 h-4.5 transition-transform duration-300 ${isDesignModuleOpen ? "rotate-45" : ""}`} />
            </Button>
            <Button onClick={() => handleStartProject()} disabled={!projectDescription.trim() || loading || isUploadingScreens} className="bg-brand-primary hover:bg-brand-primary-hover text-white px-6 landing-cta-button">
              {loading || isUploadingScreens ? 'Oluşturuluyor...' : 'Araştırma Planı Oluştur'} <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>

        {/* Templates */}
        <div className="mb-12 landing-fade-in landing-fade-in--5">
          <h2 className="text-2xl font-semibold text-text-primary mb-6 text-center">
            Veya bir şablonla başlayın
          </h2>
          
          <div className="grid md:grid-cols-2 gap-4">
            {templates.map((template, index) => <Card key={template.id} className="landing-template-card cursor-pointer transition-all duration-300 hover:shadow-md hover:border-brand-primary group" style={{ animationDelay: `${index * 140 + 360}ms` }} onClick={() => handleTemplateSelect(template)}>
                <CardHeader className="pb-3">
                  <div className="flex items-start space-x-3">
                    <div className={`landing-template-icon w-10 h-10 rounded-lg flex items-center justify-center ${template.color}`}>
                      <template.icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <CardTitle className="text-lg font-semibold text-text-primary group-hover:text-brand-primary transition-colors">
                        {template.title}
                      </CardTitle>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-text-secondary">
                    {template.description}
                  </CardDescription>
                </CardContent>
              </Card>)}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-text-muted landing-fade-in landing-fade-in--6">
          <p>Dünya çapında 500+ araştırma ekibi tarafından güveniliyor</p>
        </div>
      </main>
    </div>;
};
export default Index;
