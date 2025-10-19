import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HorizontalBar } from "@/components/ui/horizontal-bar";
import { RefreshCw, Download, TrendingUp, Users, MessageSquare, FileText, Target, AlertCircle, Quote, Pencil, BarChart3, Lightbulb, Loader2 } from "lucide-react";
import { interviewService } from "@/services/interviewService";
import { toast } from "sonner";

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
  ],
  quantitativeData: [
    {
      question: "Mobil bankacılık uygulamasında hangi özellikleri en sık kullanıyorsunuz?",
      respondents: 30,
      results: [
        { label: "Hesap bakiyesi görüntüleme", value: 85, color: "#10b981" },
        { label: "Para transferi yapma", value: 72, color: "#10b981" },
        { label: "Yatırım widget'larını kontrol etme", value: 58, color: "#14b8a6" },
        { label: "Kredi kartı işlemleri", value: 45, color: "#14b8a6" },
        { label: "Fatura ödeme", value: 38, color: "#14b8a6" },
        { label: "Kampanyaları görüntüleme", value: 25, color: "#06b6d4" },
        { label: "Müşteri hizmetleri", value: 18, color: "#06b6d4" },
        { label: "QR kod ile ödeme", value: 15, color: "#06b6d4" }
      ]
    },
    {
      question: "Yatırım widget'larında hangi bilgileri görmek istersiniz?",
      respondents: 30,
      results: [
        { label: "Anlık fiyat değişimleri", value: 78, color: "#10b981" },
        { label: "Günlük kar/zarar durumu", value: 71, color: "#10b981" },
        { label: "Portföy dağılımı", value: 62, color: "#14b8a6" },
        { label: "Hızlı al-sat butonları", value: 54, color: "#14b8a6" },
        { label: "Grafik ve teknik analiz", value: 48, color: "#14b8a6" },
        { label: "Haberler ve duyurular", value: 33, color: "#06b6d4" },
        { label: "Uzman tavsiyeleri", value: 29, color: "#06b6d4" }
      ]
    }
  ]
};

interface AnalysisPanelProps {
  projectId: string;
  sessionIds: string[];
}

const AnalysisPanel = ({ projectId, sessionIds }: AnalysisPanelProps) => {
  const [analysisData, setAnalysisData] = useState<any>(DEMO_ANALYSIS_DATA);
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingPPT, setIsGeneratingPPT] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<string>("all");

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
      toast.error("Analiz sonuçları yüklenirken bir hata oluştu");
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
      toast.success("Görüşme analizi başarıyla yenilendi");
    } catch (error) {
      console.error('Failed to regenerate analysis:', error);
      toast.error("Analiz yenilenirken bir hata oluştu");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGeneratePPT = async () => {
    setIsGeneratingPPT(true);
    toast.info('Sunum hazırlanıyor...');

    // Simulate PPT generation
    setTimeout(() => {
      setIsGeneratingPPT(false);
      toast.success('Sunum başarıyla oluşturuldu! İndiriliyor...');
    }, 2000);
  };

  const handleEdit = () => {
    toast.info('Düzenleme özelliği yakında...');
  };

  const handleFilterChange = (value: string) => {
    setSelectedFilter(value);
    console.log('Filter selected:', value);
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
    <div className="h-full overflow-auto p-4 space-y-4">
      {/* Header */}
      <div className="flex justify-between items-start gap-3">
        <div>
          <h1 className="text-2xl font-bold mb-1">Analiz Raporu</h1>
          <p className="text-sm text-muted-foreground">
            Mobil bankacılık uygulaması yatırım widget'ları araştırması
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleEdit}
            variant="outline"
            size="sm"
            className="gap-1.5"
          >
            <Pencil className="h-3.5 w-3.5" />
            Düzenle
          </Button>
          <Button
            onClick={handleGeneratePPT}
            disabled={isGeneratingPPT}
            size="sm"
            className="gap-1.5"
          >
            {isGeneratingPPT ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Hazırlanıyor...
              </>
            ) : (
              <>
                <FileText className="h-3.5 w-3.5" />
                Sunum Oluştur
              </>
            )}
          </Button>
          <Button variant="outline" size="sm" onClick={regenerateAnalysis}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="sm">
            <Download className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="report" className="w-full">
        <TabsList className="h-9">
          <TabsTrigger value="report" className="gap-1.5 text-sm">
            <BarChart3 className="h-3.5 w-3.5" />
            Rapor
          </TabsTrigger>
          <TabsTrigger value="chat" className="gap-1.5 text-sm">
            <MessageSquare className="h-3.5 w-3.5" />
            Sohbet
          </TabsTrigger>
        </TabsList>

        <TabsContent value="report" className="space-y-4 mt-4">

          {/* Key Insights */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-primary" />
                <CardTitle className="text-lg">Önemli Bulgular</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <ul className="space-y-2">
                {analysisData.insights.map((insight: string, index: number) => (
                  <li key={index} className="flex gap-2">
                    <span className="text-primary mt-0.5 text-sm">•</span>
                    <span className="text-sm">{insight}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Quantitative Data */}
          {analysisData.quantitativeData?.map((dataSet: any, dataIndex: number) => (
            <Card key={dataIndex}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  <div>
                    <CardTitle className="text-base">{dataSet.question}</CardTitle>
                    <CardDescription className="mt-0.5 text-xs">
                      {dataSet.respondents} katılımcı
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                {dataSet.results.map((result: any, index: number) => (
                  <HorizontalBar
                    key={index}
                    label={result.label}
                    value={result.value}
                    color={result.color}
                  />
                ))}
                
                {/* Filter */}
                <div className="pt-3 mt-3 border-t">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium">Filtre:</span>
                    <Select value={selectedFilter} onValueChange={handleFilterChange}>
                      <SelectTrigger className="h-8 w-[200px] text-xs">
                        <SelectValue placeholder="Filtrelemek için bir özellik seçin" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tüm Katılımcılar</SelectItem>
                        <SelectItem value="new">Yeni Kullanıcılar</SelectItem>
                        <SelectItem value="experienced">Deneyimli Kullanıcılar</SelectItem>
                        <SelectItem value="18-30">18-30 Yaş</SelectItem>
                        <SelectItem value="31-45">31-45 Yaş</SelectItem>
                        <SelectItem value="45+">45+ Yaş</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Personas */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                <CardTitle className="text-lg">Kullanıcı Personaları</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {analysisData.personas?.map((persona: any, index: number) => (
                  <div key={index} className="border rounded-lg p-3 space-y-2 bg-muted/50">
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                        {persona.name.split(' ').map((n: string) => n[0]).join('')}
                      </div>
                      <div>
                        <h4 className="font-semibold text-sm">{persona.name}</h4>
                        <p className="text-xs text-muted-foreground">{persona.age} · {persona.occupation}</p>
                      </div>
                    </div>
                    
                    <div className="space-y-1.5 text-xs">
                      <div>
                        <span className="font-medium">Deneyim:</span>
                        <p className="text-muted-foreground">{persona.experience}</p>
                      </div>
                      <div>
                        <span className="font-medium">Hedefler:</span>
                        <p className="text-muted-foreground">{persona.goals}</p>
                      </div>
                      <div>
                        <span className="font-medium">Zorluklar:</span>
                        <p className="text-muted-foreground">{persona.painPoints}</p>
                      </div>
                    </div>

                    <div className="pt-2 border-t">
                      <div className="flex gap-1.5 items-start">
                        <Quote className="w-3 h-3 text-primary flex-shrink-0 mt-0.5" />
                        <p className="text-xs italic text-muted-foreground">"{persona.quote}"</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Themes */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-primary" />
                <CardTitle className="text-lg">Tespit Edilen Temalar</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex flex-wrap gap-1.5">
                {analysisData.themes?.map((theme: string, index: number) => (
                  <Badge key={index} variant="secondary" className="text-xs">
                    {theme}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Participant Feedback */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                <CardTitle className="text-lg">Katılımcı Geri Bildirimleri</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2.5">
                {analysisData.participantSummaries?.map((summary: any, index: number) => (
                  <div key={index} className="border-l-4 border-primary pl-3 py-1.5">
                    <p className="text-xs font-medium mb-0.5">
                      Katılımcı {index + 1}
                    </p>
                    <p className="text-muted-foreground text-xs">{summary}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Enhanced Recommendations with Quotes */}
          {analysisData.recommendations && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" />
                  <CardTitle className="text-lg">Doğrudan Öneriler ve Kullanıcı Alıntıları</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-3">
                  {analysisData.recommendations.map((rec: any, index: number) => (
                    <div key={index} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <Badge variant="outline" className="text-xs font-medium">
                              {rec.category}
                            </Badge>
                            <Badge 
                              className={`${getPriorityColor(rec.priority)} border text-xs`}
                            >
                              <AlertCircle className="w-3 h-3 mr-0.5" />
                              {getPriorityLabel(rec.priority)}
                            </Badge>
                          </div>
                          <p className="font-medium text-sm">{rec.suggestion}</p>
                        </div>
                      </div>

                      {rec.userQuotes && rec.userQuotes.length > 0 && (
                        <div className="space-y-1.5 pl-3 border-l-2 border-primary/30">
                          {rec.userQuotes.map((quote: string, qIndex: number) => (
                            <div key={qIndex} className="flex gap-1.5 items-start">
                              <Quote className="w-3 h-3 text-primary flex-shrink-0 mt-0.5" />
                              <p className="text-xs italic text-muted-foreground">"{quote}"</p>
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

          {/* Development Mode - Show raw data */}
          {process.env.NODE_ENV === 'development' && (
            <Card>
              <CardHeader>
                <CardTitle>Raw Analysis Data (Dev Only)</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-xs overflow-auto bg-muted p-4 rounded">
                  {JSON.stringify(analysisData, null, 2)}
                </pre>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="chat" className="mt-6">
          <Card>
            <CardContent className="py-12">
              <div className="text-center text-muted-foreground">
                <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Analiz sohbet özelliği yakında...</p>
                <p className="text-sm mt-2">Analizle ilgili sorular sorabileceğiniz bir AI asistanı eklenecek.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AnalysisPanel;
