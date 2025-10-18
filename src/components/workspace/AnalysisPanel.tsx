import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { RefreshCw, Download, TrendingUp, Users, MessageSquare, FileText, Target, AlertCircle, Quote } from "lucide-react";
import { interviewService } from "@/services/interviewService";
import { useToast } from "@/hooks/use-toast";

// Mock data for demo purposes
const DEMO_ANALYSIS_DATA = {
  insights: [
    "Kullanıcılar widget'ların ana sayfada çok fazla yer kapladığını ve önemli bilgileri gölgelediğini belirtti",
    "Yatırım widget'larında gerçek zamanlı fiyat güncellemelerinin görünür ve anlaşılır olması en çok talep edilen özellik",
    "Katılımcıların %75'i widget'ları kişiselleştirme ve sıralama yapabilme özelliği istiyor",
    "Hızlı işlem yapabilme (al-sat) özelliğinin widget içinde olması kullanıcı deneyimini büyük ölçüde artırıyor",
    "Mobil cihazlarda widget'ların küçük ekranlarda okunabilirliği ciddi bir sorun olarak öne çıkıyor"
  ],
  personas: [
    {
      name: "Deneyimli Yatırımcı Ahmet",
      age: "35-45",
      occupation: "Finans Müdürü",
      experience: "10+ yıl yatırım deneyimi",
      goals: "Portföyünü sürekli takip etmek, hızlı işlem yapmak",
      painPoints: "Widget'lar yeterince detaylı bilgi vermiyor, grafik analizi eksik",
      quote: "Ana sayfadan direkt işlem yapabilmek istiyorum, detay sayfasına girmek zaman kaybı"
    },
    {
      name: "Yeni Başlayan Zeynep",
      age: "25-30",
      occupation: "Pazarlama Uzmanı",
      experience: "1-2 yıl yatırım deneyimi",
      goals: "Yatırım araçlarını öğrenmek, güvenli yatırım yapmak",
      painPoints: "Widget'lardaki terimler çok teknik, ne anlama geldiğini anlamakta zorlanıyor",
      quote: "Bazen widget'larda gördüğüm kısaltmaların ne anlama geldiğini bilmiyorum"
    },
    {
      name: "Teknoloji Meraklısı Can",
      age: "28-35",
      occupation: "Yazılım Geliştirici",
      experience: "3-5 yıl yatırım deneyimi",
      goals: "Yenilikçi yatırım araçlarını keşfetmek, teknoloji hisselerine yatırım yapmak",
      painPoints: "Widget'lar görsel olarak sıkıcı, animasyon ve interaktif özellikler yok",
      quote: "Widget'ların tasarımı 2010'lardan kalma gibi, daha modern bir arayüz bekliyorum"
    }
  ],
  recommendations: [
    {
      category: "Kişiselleştirme",
      suggestion: "Widget'ları sürükle-bırak ile yeniden düzenleyebilme",
      userQuotes: [
        "Benim için önemli olan hisse widget'ını en üstte görmek istiyorum",
        "Her gün kullanmadığım widget'ları gizleyebilmek çok işime yarardı"
      ],
      priority: "high"
    },
    {
      category: "Bilgi Görünürlüğü",
      suggestion: "Gerçek zamanlı fiyat değişimlerini renkli ve animasyonlu gösterme",
      userQuotes: [
        "Hisse fiyatı değiştiğinde yeşil veya kırmızı yanıp sönse dikkatimi çeker",
        "Anlık değişimleri göremiyorum, sürekli yenilemem gerekiyor"
      ],
      priority: "high"
    },
    {
      category: "Hızlı İşlem",
      suggestion: "Widget içinden direkt al-sat butonları ekleme",
      userQuotes: [
        "Detay sayfasına girmeden alım yapabilseydim çok zaman kazanırdım",
        "Fırsatı kaçırmamak için hızlı hareket etmem gerekiyor"
      ],
      priority: "medium"
    },
    {
      category: "Eğitim ve Yardım",
      suggestion: "Widget üzerinde bilgi ikonu ile terim açıklamaları",
      userQuotes: [
        "P/E ratio'nun ne olduğunu her seferinde Google'da arıyorum",
        "Yeni başlayanlar için açıklayıcı notlar çok faydalı olur"
      ],
      priority: "medium"
    }
  ],
  themes: [
    "Kişiselleştirme İhtiyacı",
    "Hız ve Verimlilik",
    "Görsel Tasarım",
    "Bilgi Erişilebilirliği",
    "Mobil Uyumluluk",
    "Güven ve Güvenlik",
    "Eğitim Desteği"
  ],
  participantSummaries: [
    "Deneyimli yatırımcı, widget'ların daha fazla teknik analiz aracı içermesini bekliyor",
    "Yeni başlayan kullanıcı, widget'lardaki terimleri anlamakta zorlanıyor ve rehberlik istiyor",
    "Aktif trader, widget'lardan direkt işlem yapabilmeyi ve gerçek zamanlı bildirimleri önemsiyor"
  ]
};

interface AnalysisPanelProps {
  projectId: string;
  sessionIds: string[];
}

const AnalysisPanel = ({ projectId, sessionIds }: AnalysisPanelProps) => {
  const { toast } = useToast();
  const [analysisData, setAnalysisData] = useState<any>(DEMO_ANALYSIS_DATA);
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingPPT, setIsGeneratingPPT] = useState(false);

  useEffect(() => {
    if (sessionIds.length > 0) {
      loadAnalysis();
    }
  }, [sessionIds]);

  const loadAnalysis = async () => {
    setIsLoading(true);
    try {
      // For now, analyze the first session
      // In future, you could aggregate multiple sessions
      const sessionId = sessionIds[0];
      const result = await interviewService.analyzeInterview(sessionId, projectId);
      setAnalysisData(result);
    } catch (error) {
      console.error('Failed to load analysis:', error);
      toast({
        title: "Analiz Yüklenemedi",
        description: "Analiz sonuçları yüklenirken bir hata oluştu",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const regenerateAnalysis = async () => {
    setIsLoading(true);
    try {
      const sessionId = sessionIds[0];
      const result = await interviewService.analyzeInterview(sessionId, projectId);
      setAnalysisData(result);
      toast({
        title: "Analiz Yenilendi",
        description: "Görüşme analizi başarıyla yenilendi",
      });
    } catch (error) {
      console.error('Failed to regenerate analysis:', error);
      toast({
        title: "Hata",
        description: "Analiz yenilenirken bir hata oluştu",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGeneratePPT = async () => {
    setIsGeneratingPPT(true);
    toast({
      title: "Sunum Hazırlanıyor",
      description: "PowerPoint sunumu oluşturuluyor...",
    });

    // Simulate PPT generation
    setTimeout(() => {
      setIsGeneratingPPT(false);
      toast({
        title: "Sunum Hazır!",
        description: "Sunum başarıyla oluşturuldu ve indiriliyor...",
      });
    }, 2500);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'low':
        return 'bg-green-100 text-green-800 border-green-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'Yüksek Öncelik';
      case 'medium':
        return 'Orta Öncelik';
      case 'low':
        return 'Düşük Öncelik';
      default:
        return 'Öncelik';
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-white">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin text-brand-primary mx-auto mb-4" />
          <p className="text-text-muted">Analiz sonuçları yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (!analysisData) {
    return (
      <div className="h-full flex items-center justify-center bg-white p-6">
        <div className="text-center max-w-md">
          <TrendingUp className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-text-primary mb-2">
            Analiz Bekleniyor
          </h3>
          <p className="text-text-muted mb-4">
            Görüşmeler tamamlandıktan sonra AI destekli analiz otomatik olarak başlayacak.
          </p>
          <Button onClick={loadAnalysis} variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" />
            Analizi Yeniden Yükle
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold text-text-primary mb-2">
                Görüşme Analizi
              </h2>
              <p className="text-text-muted">
                AI destekli içgörüler ve bulgular
              </p>
            </div>
            <div className="flex gap-2">
              <Button 
                onClick={handleGeneratePPT} 
                disabled={isGeneratingPPT}
                className="bg-brand-primary hover:bg-brand-primary/90"
              >
                <FileText className="w-4 h-4 mr-2" />
                {isGeneratingPPT ? "Hazırlanıyor..." : "Sunum Oluştur"}
              </Button>
              <Button onClick={regenerateAnalysis} variant="outline" size="sm">
                <RefreshCw className="w-4 h-4 mr-2" />
                Yeniden Analiz Et
              </Button>
              <Button variant="outline" size="sm">
                <Download className="w-4 h-4 mr-2" />
                Raporu İndir
              </Button>
            </div>
          </div>
        </div>

        {/* Key Insights */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Önemli Bulgular
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {analysisData.insights?.map((insight: string, index: number) => (
                <div key={index} className="flex gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-brand-primary/10 text-brand-primary flex items-center justify-center text-sm font-semibold">
                    {index + 1}
                  </div>
                  <p className="text-text-primary flex-1">{insight}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Personas */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Kullanıcı Personaları
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {analysisData.personas?.map((persona: any, index: number) => (
                <div key={index} className="border rounded-lg p-4 space-y-3 bg-gray-50">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-brand-primary text-white flex items-center justify-center text-lg font-bold">
                      {persona.name.split(' ').map((n: string) => n[0]).join('')}
                    </div>
                    <div>
                      <h4 className="font-semibold text-text-primary">{persona.name}</h4>
                      <p className="text-sm text-text-muted">{persona.age} · {persona.occupation}</p>
                    </div>
                  </div>
                  
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="font-medium text-text-primary">Deneyim:</span>
                      <p className="text-text-muted">{persona.experience}</p>
                    </div>
                    <div>
                      <span className="font-medium text-text-primary">Hedefler:</span>
                      <p className="text-text-muted">{persona.goals}</p>
                    </div>
                    <div>
                      <span className="font-medium text-text-primary">Zorluklar:</span>
                      <p className="text-text-muted">{persona.painPoints}</p>
                    </div>
                  </div>

                  <div className="pt-3 border-t">
                    <div className="flex gap-2 items-start">
                      <Quote className="w-4 h-4 text-brand-primary flex-shrink-0 mt-1" />
                      <p className="text-sm italic text-text-muted">"{persona.quote}"</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Themes */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              Tespit Edilen Temalar
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {analysisData.themes?.map((theme: string, index: number) => (
                <Badge key={index} variant="secondary">
                  {theme}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Participant Feedback */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Katılımcı Geri Bildirimleri
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {analysisData.participantSummaries?.map((summary: any, index: number) => (
                <div key={index} className="border-l-4 border-brand-primary pl-4 py-2">
                  <p className="text-sm font-medium text-text-primary mb-1">
                    Katılımcı {index + 1}
                  </p>
                  <p className="text-text-muted text-sm">{summary}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Enhanced Recommendations with Quotes */}
        {analysisData.recommendations && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="w-5 h-5" />
                Doğrudan Öneriler ve Kullanıcı Alıntıları
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {analysisData.recommendations.map((rec: any, index: number) => (
                  <div key={index} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline" className="font-medium">
                            {rec.category}
                          </Badge>
                          <Badge 
                            className={`${getPriorityColor(rec.priority)} border`}
                          >
                            <AlertCircle className="w-3 h-3 mr-1" />
                            {getPriorityLabel(rec.priority)}
                          </Badge>
                        </div>
                        <p className="font-medium text-text-primary">{rec.suggestion}</p>
                      </div>
                    </div>

                    {rec.userQuotes && rec.userQuotes.length > 0 && (
                      <div className="space-y-2 pl-4 border-l-2 border-brand-primary/30">
                        {rec.userQuotes.map((quote: string, qIndex: number) => (
                          <div key={qIndex} className="flex gap-2 items-start">
                            <Quote className="w-4 h-4 text-brand-primary flex-shrink-0 mt-1" />
                            <p className="text-sm italic text-text-muted">"{quote}"</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Raw Analysis Data (for debugging) */}
        {process.env.NODE_ENV === 'development' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Raw Analysis Data (Dev Only)</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-xs bg-gray-100 p-4 rounded overflow-auto max-h-96">
                {JSON.stringify(analysisData, null, 2)}
              </pre>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default AnalysisPanel;
