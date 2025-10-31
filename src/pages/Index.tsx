import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, MessageSquare, BarChart3, Users, Search, LogOut } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import { AnimatedHeadline } from "@/components/ui/animated-headline";
import { useAuth } from "@/contexts/AuthContext";
import { projectService, Project } from "@/services/projectService";
import { toast } from "sonner";

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
  "Reklam kampanyamın hedef kitle üzerindeki etkisini nasıl ölçebilirim?",
  "Kullanıcılarım web sitemde en çok hangi bölümlere zaman harcıyor?",
  "Müşteri memnuniyetini artırmak için neler yapabilirim?",
  "Yeni ürünümüz için hangi özelliklere öncelik vermeliyim?",
  "Rakiplerimize göre güçlü ve zayıf yönlerimiz neler?",
  "Kullanıcılar ürünümüzü satın almadan önce hangi tereddütleri yaşıyor?"
];

const Index = () => {
  const [projectDescription, setProjectDescription] = useState("");
  const [userProjects, setUserProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPlaceholder, setCurrentPlaceholder] = useState(placeholderHints[0]);
  const [isAnimating, setIsAnimating] = useState(false);
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  useEffect(() => {
    if (user) {
      loadUserProjects();
    }
  }, [user]);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsAnimating(true);
      setTimeout(() => {
        setCurrentPlaceholder(prev => {
          const currentIndex = placeholderHints.indexOf(prev);
          const nextIndex = (currentIndex + 1) % placeholderHints.length;
          return placeholderHints[nextIndex];
        });
        setIsAnimating(false);
      }, 300);
    }, 4000);

    return () => clearInterval(interval);
  }, []);

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

    setLoading(true);
    try {
      const project = await projectService.createProject({
        title: getProjectTitle(projectDesc),
        description: projectDesc,
        analysis: templateId ? { template: templateId } : null
      });

      // Store project data for the workspace
      localStorage.setItem('searchai-project', JSON.stringify({
        id: project.id,
        description: projectDesc,
        template: templateId,
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
  return <div className="min-h-screen bg-canvas">
      {/* Header */}
      <header className="border-b border-border-light">
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
      <main className="max-w-4xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <AnimatedHeadline />
          <p className="text-xl text-text-secondary mb-8 max-w-2xl mx-auto">Araştırmanızı haftalarca beklemeyin. AI destekli görüşme ve analizlerle saatler içinde derin içgörülere ulaşın.</p>
        </div>

        {/* Project Input */}
        <div className="bg-card border border-border rounded-xl p-8 mb-8 shadow-sm">
          <div className="relative">
            <Textarea 
              value={projectDescription} 
              onChange={e => setProjectDescription(e.target.value)} 
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && projectDescription.trim()) {
                  e.preventDefault();
                  handleStartProject();
                }
              }}
            placeholder={currentPlaceholder} 
              className="min-h-[120px] text-lg border-border-light resize-none focus:ring-brand-primary focus:border-brand-primary"
            />
          </div>
          
          <style dangerouslySetInnerHTML={{__html: `
            @keyframes slideOutUp {
              from {
                opacity: 1;
                transform: translateY(0);
              }
              to {
                opacity: 0;
                transform: translateY(-10px);
              }
            }
            
            @keyframes slideInUp {
              from {
                opacity: 0;
                transform: translateY(10px);
              }
              to {
                opacity: 1;
                transform: translateY(0);
              }
            }
            
            textarea::placeholder {
              animation: ${isAnimating ? 'slideOutUp' : 'slideInUp'} 0.3s ease-out forwards;
              transition: all 0.3s ease-out;
            }
          `}} />
          
          <div className="flex items-center justify-end mt-6">
            <Button onClick={() => handleStartProject()} disabled={!projectDescription.trim() || loading} className="bg-brand-primary hover:bg-brand-primary-hover text-white px-6">
              {loading ? 'Oluşturuluyor...' : 'Araştırma Planı Oluştur'} <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>

        {/* Templates */}
        <div className="mb-12">
          <h2 className="text-2xl font-semibold text-text-primary mb-6 text-center">
            Veya bir şablonla başlayın
          </h2>
          
          <div className="grid md:grid-cols-2 gap-4">
            {templates.map(template => <Card key={template.id} className="cursor-pointer transition-all duration-200 hover:shadow-md hover:border-brand-primary group" onClick={() => handleTemplateSelect(template)}>
                <CardHeader className="pb-3">
                  <div className="flex items-start space-x-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${template.color}`}>
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
        <div className="text-center text-text-muted">
          <p>Dünya çapında 500+ araştırma ekibi tarafından güveniliyor</p>
        </div>
      </main>
    </div>;
};
export default Index;