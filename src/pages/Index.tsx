import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, ArrowRight, MessageSquare, BarChart3, Users, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";

const templates = [
  {
    id: "ad-testing",
    title: "Reklam Testi ve Geri Bildirim",
    description: "Reklam kampanyalarınız ve kreatif varlıklarınız hakkında geri bildirim alın",
    icon: BarChart3,
    color: "bg-blue-50 text-blue-600"
  },
  {
    id: "landing-page",
    title: "Açılış Sayfası Testi",
    description: "Daha iyi dönüşüm oranları için açılış sayfanızı optimize edin",
    icon: Search,
    color: "bg-green-50 text-green-600"
  },
  {
    id: "nps-feedback",
    title: "NPS ve Müşteri Geri Bildirimi",
    description: "Müşteri memnuniyeti ve sadakatini ölçün",
    icon: Users,
    color: "bg-purple-50 text-purple-600"
  },
  {
    id: "foundational",
    title: "Temel Araştırma",
    description: "Kullanıcı ihtiyaçları ve pazar fırsatlarını derinlemesine analiz edin",
    icon: MessageSquare,
    color: "bg-orange-50 text-orange-600"
  }
];

const Index = () => {
  const [projectDescription, setProjectDescription] = useState("");
  const navigate = useNavigate();

  const handleStartProject = (templateId?: string, description?: string) => {
    const projectData = {
      description: description || projectDescription,
      template: templateId,
      timestamp: Date.now()
    };
    
    // Store project data for the workspace
    localStorage.setItem('searchai-project', JSON.stringify(projectData));
    navigate('/workspace');
  };

  const handleTemplateSelect = (template: typeof templates[0]) => {
    const sampleDescriptions = {
      "ad-testing": "Y kuşağını hedefleyen sürdürülebilir giyim markamız için yeni video reklamımızı test edin. Duygusal tepkileri ve satın alma niyetini anlamak istiyoruz.",
      "landing-page": "listenlabs.ai adresindeki SaaS açılış sayfamızı değerlendirin - pazarlama profesyonellerinin AI destekli kullanıcı araştırma platformumuz hakkında ne düşündüğünü anlamak istiyoruz.",
      "nps-feedback": "Mobil bankacılık uygulamamızın kullanıcıları için NPS anketi yapın, iyileştirme alanlarını belirleyin ve müşteri sadakatini neyin yönlendirdiğini anlayın.",
      "foundational": "Uzaktan çalışanların verimlilik ve işbirliği araçlarını nasıl yönettiğini keşfedin, yeni çalışma alanı platformumuz için fırsatları belirleyin."
    };
    
    handleStartProject(template.id, sampleDescriptions[template.id as keyof typeof sampleDescriptions]);
  };

  return (
    <div className="min-h-screen bg-canvas">
      {/* Header */}
      <header className="border-b border-border-light">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-brand-primary rounded-lg flex items-center justify-center">
                <Search className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-semibold text-text-primary">Search AI</span>
            </div>
            <Button variant="outline" size="sm">
              Giriş Yap
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-text-primary mb-6 leading-tight">
            Projeniz hakkında bize bilgi verin
          </h1>
          <p className="text-xl text-text-secondary mb-8 max-w-2xl mx-auto">
            Haftalarca değil, saatlerce uçtan uca UX araştırması simüle edin. AI destekli görüşmeler ve analizlerden içgörüler elde edin.
          </p>
        </div>

        {/* Project Input */}
        <div className="bg-card border border-border rounded-xl p-8 mb-8 shadow-sm">
          <Textarea
            value={projectDescription}
            onChange={(e) => setProjectDescription(e.target.value)}
            placeholder="Lütfen projenizi detaylarıyla açıklayın →"
            className="min-h-[120px] text-lg border-border-light resize-none focus:ring-brand-primary focus:border-brand-primary"
          />
          
          <div className="flex items-center justify-between mt-6">
            <Button variant="outline" className="flex items-center space-x-2">
              <Upload className="w-4 h-4" />
              <span>Tartışma Kılavuzu Yükle</span>
            </Button>
            
            <div className="flex items-center space-x-3">
              <Button 
                variant="outline"
                onClick={() => handleStartProject()}
                disabled={!projectDescription.trim()}
              >
                Sıfırdan başla
              </Button>
              <Button 
                onClick={() => handleStartProject()}
                disabled={!projectDescription.trim()}
                className="bg-brand-primary hover:bg-brand-primary-hover text-white px-6"
              >
                Devam Et <ArrowRight className="w-4 h-4 ml-2" />
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
            {templates.map((template) => (
              <Card 
                key={template.id} 
                className="cursor-pointer transition-all duration-200 hover:shadow-md hover:border-brand-primary group"
                onClick={() => handleTemplateSelect(template)}
              >
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
              </Card>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-text-muted">
          <p>Dünya çapında 500+ araştırma ekibi tarafından güveniliyor</p>
        </div>
      </main>
    </div>
  );
};

export default Index;