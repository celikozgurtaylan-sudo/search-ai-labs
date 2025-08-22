import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Search, ArrowLeft, Video, Users, Play, BarChart3 } from "lucide-react";
import ChatPanel from "@/components/workspace/ChatPanel";
import StudyPanel from "@/components/workspace/StudyPanel";
import RecruitmentDrawer from "@/components/workspace/RecruitmentDrawer";
interface ProjectData {
  description: string;
  template?: string;
  timestamp: number;
}
const Workspace = () => {
  const navigate = useNavigate();
  const [projectData, setProjectData] = useState<ProjectData | null>(null);
  const [currentStep, setCurrentStep] = useState<'guide' | 'recruit' | 'run' | 'analyze'>('guide');
  const [showRecruitment, setShowRecruitment] = useState(false);
  const [discussionGuide, setDiscussionGuide] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
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
  const generateDiscussionGuide = (description: string) => {
    // AI tarafından oluşturulan tartışma kılavuzunu simüle et
    const guide = {
      title: getProjectTitle(description),
      sections: [{
        id: 'background',
        title: 'Profesyonel Geçmiş',
        questions: ['Rolünüz ve sorumluluklarınız hakkında bana bilgi verebilir misiniz?', 'Bu alanda ne kadar süredir çalışıyorsunuz?', '[İlgili bağlam] için şu anda hangi araçları kullanıyorsunuz?']
      }, {
        id: 'first-impressions',
        title: 'İlk İzlenimler',
        questions: ['Bu konudaki ilk tepkiniz nedir?', 'Size en çok ne dikkat çekiyor?', 'Bu alışık olduğunuz şeylerle nasıl karşılaştırılıyor?', 'Aklınıza hemen hangi sorular geliyor?']
      }, {
        id: 'detailed-exploration',
        title: 'Detaylı Keşif',
        questions: ['Bunu normalde nasıl yaklaşacağınızı anlatabilir misiniz?', 'Bu sizin için daha değerli kılacak şey nedir?', 'Hangi endişeleriniz veya tereddütleriniz var?', 'Bu mevcut iş akışınıza nasıl uyar?', 'Görmeyi beklediğiniz ama eksik olan şey nedir?']
      }, {
        id: 'final-thoughts',
        title: 'Son Düşünceler ve Öneriler',
        questions: ['Genel olarak bunu nasıl değerlendirirsiniz?', 'Elinizde olsa neyi değiştirirdiniz?', 'Bunu bir meslektaşınıza tavsiye eder misiniz? Neden?', 'Son düşünceleriniz veya önerileriniz var mı?']
      }],
      suggestions: ['Fiyatlandırma/rakip soruları ekle', 'AI ile ilgili sorular ekle', 'Özellik odaklı sorular ekle', 'Erişilebilirlik soruları ekle', 'Mobil deneyim soruları ekle']
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
      setCurrentStep('run');
    } else if (currentStep === 'run') {
      setCurrentStep('analyze');
    }
  };
  const getStepButton = () => {
    switch (currentStep) {
      case 'guide':
        return <Button onClick={handleNextStep} className="bg-brand-primary hover:bg-brand-primary-hover text-white">
            <Users className="w-4 h-4 mr-2" />
            Sonraki: Katılımcıları Ekle →
          </Button>;
      case 'recruit':
        return <Button onClick={handleNextStep} className="bg-brand-primary hover:bg-brand-primary-hover text-white" disabled={participants.length === 0}>
            <Play className="w-4 h-4 mr-2" />
            Görüşmeleri Başlat
          </Button>;
      case 'run':
        return <Button onClick={handleNextStep} className="bg-brand-primary hover:bg-brand-primary-hover text-white">
            <BarChart3 className="w-4 h-4 mr-2" />
            Analizi Görüntüle
          </Button>;
      default:
        return null;
    }
  };
  if (!projectData) {
    return <div>Loading...</div>;
  }
  return <div className="min-h-screen bg-canvas">
      {/* Header */}
      <header className="border-b border-border-light bg-white">
        <div className="max-w-full mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="flex items-center space-x-2">
                <ArrowLeft className="w-4 h-4" />
                <span>Geri</span>
              </Button>
              
              <Separator orientation="vertical" className="h-6" />
              
              <div 
                className="flex items-center space-x-2 cursor-pointer" 
                onClick={() => navigate('/')}
              >
                <div className="w-8 h-8 bg-brand-primary rounded-lg flex items-center justify-center">
                  <Search className="w-5 h-5 text-white" />
                </div>
                <span className="text-xl font-semibold text-text-primary">Search AI</span>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              {getStepButton()}
            </div>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex h-[calc(100vh-73px)]">
        {/* Left Panel - Chat */}
        <div className="w-1/2 border-r border-border-light">
          <ChatPanel projectData={projectData} discussionGuide={discussionGuide} onGuideUpdate={setDiscussionGuide} />
        </div>

        {/* Right Panel - Study */}
        <div className="w-1/2">
          <StudyPanel discussionGuide={discussionGuide} participants={participants} currentStep={currentStep} onGuideUpdate={setDiscussionGuide} />
        </div>
      </div>

      {/* Recruitment Drawer */}
      <RecruitmentDrawer open={showRecruitment} onOpenChange={setShowRecruitment} onParticipantsSelect={selected => {
      setParticipants(selected);
      setCurrentStep('recruit');
      setShowRecruitment(false);
    }} />
    </div>;
};
export default Workspace;