import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Upload, ArrowRight, MessageSquare, BarChart3, Users, Search, LogOut, AlertTriangle, FileText } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import { AnimatedHeadline } from "@/components/ui/animated-headline";
import { useAuth } from "@/contexts/AuthContext";
import { projectService, Project } from "@/services/projectService";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

const Index = () => {
  const [projectDescription, setProjectDescription] = useState("");
  const [userProjects, setUserProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [additionalPrompt, setAdditionalPrompt] = useState("");
  const [processingDocument, setProcessingDocument] = useState(false);
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  useEffect(() => {
    if (user) {
      loadUserProjects();
    }
  }, [user]);

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
      "ad-testing": "Y kuşağını hedefleyen sürdürülebilir giyim markamız için yeni video reklamımızı test edin. Duygusal tepkileri ve satın alma niyetini anlamak istiyoruz.",
      "landing-page": "Fibabanka.com.tr adresindeki SaaS açılış sayfamızı değerlendirin - pazarlama profesyonellerinin AI destekli kullanıcı araştırma platformumuz hakkında ne düşündüğünü anlamak istiyoruz.",
      "nps-feedback": "Mobil bankacılık uygulamamızın kullanıcıları için NPS anketi yapın, iyileştirme alanlarını belirleyin ve müşteri sadakatini neyin yönlendirdiğini anlayın.",
      "foundational": "Uzaktan çalışanların verimlilik ve işbirliği araçlarını nasıl yönettiğini keşfedin, yeni çalışma alanı platformumuz için fırsatları belirleyin."
    };
    handleStartProject(template.id, sampleDescriptions[template.id as keyof typeof sampleDescriptions]);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const fileName = file.name.toLowerCase();
      if (fileName.endsWith('.pdf') || fileName.endsWith('.docx')) {
        setSelectedFile(file);
      } else {
        toast.error('Sadece PDF ve DOCX dosyaları desteklenmektedir.');
        event.target.value = '';
      }
    }
  };

  const processDocument = async () => {
    if (!selectedFile) return;

    setProcessingDocument(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('additionalPrompt', additionalPrompt);

      const { data, error } = await supabase.functions.invoke('process-document', {
        body: formData,
      });

      if (error) throw error;

      if (data.success) {
        // Use the analysis to populate the project description
        const analysis = data.analysis;
        const generatedDescription = `${analysis.summary}\n\nÖnerilen araştırma alanları: ${analysis.researchAreas.join(', ')}\n\nHedef kitle: ${analysis.targetAudience.join(', ')}\n\n${analysis.projectSuggestion}`;
        
        setProjectDescription(generatedDescription);
        setUploadModalOpen(false);
        setSelectedFile(null);
        setAdditionalPrompt("");
        
        toast.success(`${data.fileName} başarıyla işlendi ve proje açıklaması oluşturuldu!`);
      } else {
        throw new Error(data.error || 'Döküman işlenirken hata oluştu');
      }
    } catch (error) {
      console.error('Document processing error:', error);
      toast.error('Döküman işlenirken hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setProcessingDocument(false);
    }
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
          <Textarea 
            value={projectDescription} 
            onChange={e => setProjectDescription(e.target.value)} 
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && projectDescription.trim()) {
                e.preventDefault();
                handleStartProject();
              }
            }}
            placeholder="Merhaba! Size nasıl yardımcı olabilirim? Sormak istediğiniz her şeyi yazabilirsiniz..." 
            className="min-h-[120px] text-lg border-border-light resize-none focus:ring-brand-primary focus:border-brand-primary" 
          />
          
          <div className="flex items-center justify-between mt-6">
            <Dialog open={uploadModalOpen} onOpenChange={setUploadModalOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="flex items-center space-x-2">
                  <Upload className="w-4 h-4" />
                  <span>Döküman yükle</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-surface max-w-2xl">
                <DialogHeader>
                  <DialogTitle className="flex items-center space-x-2">
                    <FileText className="w-5 h-5" />
                    <span>Döküman Yükleme</span>
                  </DialogTitle>
                  <DialogDescription className="space-y-4">
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                      <div className="flex items-start space-x-2">
                        <AlertTriangle className="w-5 h-5 text-orange-600 mt-0.5" />
                        <div>
                          <h4 className="font-semibold text-orange-800 mb-2">Desteklenen Dosya Türleri</h4>
                          <ul className="text-sm text-orange-700 space-y-1">
                            <li>• <strong>PDF dosyaları</strong> (.pdf)</li>
                            <li>• <strong>Word belgeleri</strong> (.docx)</li>
                          </ul>
                          <p className="text-sm text-orange-600 mt-2">
                            Maksimum dosya boyutu: 20MB
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="file-upload" className="text-sm font-medium">
                          Dosya Seçin
                        </Label>
                        <Input
                          id="file-upload"
                          type="file"
                          accept=".pdf,.docx"
                          onChange={handleFileUpload}
                          className="mt-1"
                        />
                        {selectedFile && (
                          <p className="text-sm text-green-600 mt-1">
                            ✓ Seçilen dosya: {selectedFile.name}
                          </p>
                        )}
                      </div>
                      
                      <div>
                        <Label htmlFor="additional-prompt" className="text-sm font-medium">
                          Ek Talimatlar (İsteğe bağlı)
                        </Label>
                        <Textarea
                          id="additional-prompt"
                          value={additionalPrompt}
                          onChange={(e) => setAdditionalPrompt(e.target.value)}
                          placeholder="Dökümanınızla ilgili özel bir araştırma alanına odaklanmak istiyorsanız buraya yazın..."
                          className="mt-1 min-h-[80px]"
                        />
                      </div>
                      
                      <div className="flex justify-end space-x-2 pt-4">
                        <Button 
                          variant="outline" 
                          onClick={() => {
                            setUploadModalOpen(false);
                            setSelectedFile(null);
                            setAdditionalPrompt("");
                          }}
                        >
                          İptal
                        </Button>
                        <Button 
                          onClick={processDocument}
                          disabled={!selectedFile || processingDocument}
                          className="bg-brand-primary hover:bg-brand-primary-hover text-white"
                        >
                          {processingDocument ? 'İşleniyor...' : 'Dökümanı İşle'}
                        </Button>
                      </div>
                    </div>
                  </DialogDescription>
                </DialogHeader>
              </DialogContent>
            </Dialog>
            
            <div className="flex items-center space-x-3">
              <Button variant="outline" onClick={() => handleStartProject()} disabled={!projectDescription.trim() || loading}>
                Sıfırdan başla
              </Button>
              <Button onClick={() => handleStartProject()} disabled={!projectDescription.trim() || loading} className="bg-brand-primary hover:bg-brand-primary-hover text-white px-6">
                {loading ? 'Oluşturuluyor...' : 'Sohbete Başla'} <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
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