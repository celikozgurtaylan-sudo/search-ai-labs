import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HorizontalBar } from "@/components/ui/horizontal-bar";
import { RefreshCw, Download, TrendingUp, Users, MessageSquare, FileText, Target, AlertCircle, Quote, Pencil, BarChart3, Lightbulb, Loader2, AlertTriangle, Sparkles, Heart, Mic, Type, Clock, MapPin, Layers, Timer } from "lucide-react";
import { interviewService } from "@/services/interviewService";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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
  ],
  outliers: [
    {
      participant: "Katılımcı #7",
      finding: "Widget kullanımını tamamen reddetmiş, sadece klasik menü yapısını tercih ediyor",
      impact: "Genel eğilimlerden %85 sapma"
    },
    {
      participant: "Katılımcı #15",
      finding: "Günde 50+ kez uygulama açma, ortalama 3 dakika kalma - anormal yüksek",
      impact: "Ortalamadan 10x fazla kullanım"
    },
    {
      participant: "Katılımcı #22",
      finding: "Sadece karanlık modda widget'ları kullanabiliyor, aydınlık modda göz yorgunluğu yaşıyor",
      impact: "Erişilebilirlik sorunu"
    }
  ],
  newStudies: [
    "Kripto para widget'larının kullanıcı davranışı üzerine etkisi",
    "Yaşlı kullanıcılar için widget erişilebilirlik araştırması",
    "Karanlık mod kullanımının widget görünürlüğüne etkisi",
    "Sesli komut ile widget kontrolü kullanılabilirlik testi",
    "Widget bildirimlerinin kullanıcı dikkatine etkisi"
  ],
  motivation: {
    overall: 78,
    reasons: [
      { reason: "Finansal hedeflerime ulaşmak", value: 85, color: "#10b981" },
      { reason: "Para tasarrufu yapmak", value: 72, color: "#10b981" },
      { reason: "Yatırım bilgisi edinmek", value: 68, color: "#14b8a6" },
      { reason: "Teknolojiye uyum sağlamak", value: 45, color: "#14b8a6" },
      { reason: "Arkadaş tavsiyesi", value: 32, color: "#06b6d4" }
    ]
  },
  voiceVsText: {
    voiceUsers: 35,
    textUsers: 65,
    voiceAvgTime: "12 saniye",
    textAvgTime: "45 saniye",
    voiceSatisfaction: 82,
    textSatisfaction: 71
  },
  surveyTime: {
    average: "8 dakika 34 saniye",
    shortest: "4 dakika 12 saniye",
    longest: "18 dakika 45 saniye",
    median: "7 dakika 50 saniye"
  },
  locationData: [
    { city: "İstanbul", count: 12, percentage: 40, color: "#10b981" },
    { city: "Ankara", count: 6, percentage: 20, color: "#10b981" },
    { city: "İzmir", count: 5, percentage: 17, color: "#14b8a6" },
    { city: "Bursa", count: 3, percentage: 10, color: "#14b8a6" },
    { city: "Diğer", count: 4, percentage: 13, color: "#06b6d4" }
  ],
  multitasking: {
    doesMultitask: 68,
    commonActivities: [
      { activity: "TV izlerken", percentage: 45, color: "#10b981" },
      { activity: "Toplu taşımada", percentage: 38, color: "#10b981" },
      { activity: "İş molasında", percentage: 32, color: "#14b8a6" },
      { activity: "Yemek sırasında", percentage: 18, color: "#14b8a6" }
    ]
  },
  duration: {
    averageSession: "3 dakika 22 saniye",
    shortSessions: 45,
    mediumSessions: 35,
    longSessions: 20
  },
  averageStudyTime: {
    overall: "8 dakika 34 saniye",
    firstTime: "12 dakika 15 saniye",
    returning: "6 dakika 48 saniye"
  },
  participationData: {
    firstTimeParticipants: 55,
    returningParticipants: 45,
    completionRate: 87,
    dropoutRate: 13
  },
  researchPanels: [
    { panel: "Finans Kullanıcıları", members: 42, active: 28 },
    { panel: "Genç Yetişkinler", members: 38, active: 31 },
    { panel: "Teknoloji Early Adopters", members: 35, active: 26 }
  ],
  panelDistribution: [
    { panels: "1 panel", users: 45, color: "#10b981" },
    { panels: "2 panel", users: 32, color: "#14b8a6" },
    { panels: "3+ panel", users: 23, color: "#06b6d4" }
  ],
  professionData: [
    { profession: "Özel Sektör Çalışanı", count: 12, percentage: 40, color: "#10b981" },
    { profession: "Kamu Çalışanı", count: 6, percentage: 20, color: "#10b981" },
    { profession: "Serbest Meslek", count: 5, percentage: 17, color: "#14b8a6" },
    { profession: "Öğrenci", count: 4, percentage: 13, color: "#14b8a6" },
    { profession: "Emekli", count: 3, percentage: 10, color: "#06b6d4" }
  ],
  ageData: [
    { range: "18-25", count: 8, percentage: 27, color: "#10b981" },
    { range: "26-35", count: 11, percentage: 37, color: "#10b981" },
    { range: "36-45", count: 7, percentage: 23, color: "#14b8a6" },
    { range: "46+", count: 4, percentage: 13, color: "#06b6d4" }
  ],
  charts: {
    motivationByAge: [
      { age: "18-25", motivation: 85, color: "#10b981" },
      { age: "26-35", motivation: 78, color: "#14b8a6" },
      { age: "36-45", motivation: 72, color: "#14b8a6" },
      { age: "46+", motivation: 65, color: "#06b6d4" }
    ],
    studyTimeByProfession: [
      { profession: "Özel Sektör", time: 7.5, color: "#10b981" },
      { profession: "Kamu", time: 9.2, color: "#14b8a6" },
      { profession: "Serbest", time: 6.8, color: "#14b8a6" },
      { profession: "Öğrenci", time: 11.5, color: "#06b6d4" },
      { profession: "Emekli", time: 12.3, color: "#06b6d4" }
    ],
    studyTimeByAge: [
      { age: "18-25", time: 10.2, color: "#10b981" },
      { age: "26-35", time: 7.8, color: "#14b8a6" },
      { age: "36-45", time: 8.5, color: "#14b8a6" },
      { age: "46+", time: 11.8, color: "#06b6d4" }
    ]
  }
};

// Navigation sections for sidebar
const navigationSections = [
  { id: "key-insights", label: "Önemli Bulgular" },
  { id: "quantitative-data", label: "Kantitatif Veri" },
  { id: "personas", label: "Kullanıcı Personaları" },
  { id: "themes", label: "Tespit Edilen Temalar" },
  { id: "recommendations", label: "Doğrudan Öneriler" },
  { id: "outliers", label: "Aykırı Değerler" },
  { id: "new-studies", label: "Yeni Çalışmalar" },
  { id: "motivation", label: "Motivasyon" },
  { id: "voice-vs-text", label: "Sesli vs Metin Girişi" },
  { id: "survey-time", label: "Anket Süresi" },
  { id: "location", label: "Konum" },
  { id: "multitasking", label: "Çoklu Görev" },
  { id: "duration", label: "Süre" },
  { id: "average-study-time", label: "Ortalama Çalışma Süresi" },
  { id: "participation", label: "Çalışmalara Katılım" },
  { id: "research-panels", label: "Kullanıcı Araştırma Panelleri" },
  { id: "panel-distribution", label: "Panel Sayısı" },
  { id: "profession", label: "Meslek" },
  { id: "age", label: "Yaş" },
  { id: "charts-header", label: "Grafikler" },
  { id: "motivation-by-age", label: "Yaşa Göre Motivasyon" },
  { id: "study-time-by-profession", label: "Mesleğe Göre Çalışma Süresi" },
  { id: "study-time-by-age", label: "Yaşa Göre Çalışma Süresi" },
  { id: "participant-feedback", label: "Katılımcı Geri Bildirimleri" }
];

interface AnalysisPanelProps {
  projectId: string;
  sessionIds: string[];
}

const AnalysisPanel = ({ projectId, sessionIds }: AnalysisPanelProps) => {
  const [analysisData, setAnalysisData] = useState<any>(DEMO_ANALYSIS_DATA);
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingPPT, setIsGeneratingPPT] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<string>("all");
  const [activeSection, setActiveSection] = useState<string>("key-insights");

  useEffect(() => {
    if (sessionIds.length > 0) {
      loadAnalysis();
    }
  }, [sessionIds]);

  // Track active section with IntersectionObserver
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.3) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { 
        threshold: [0, 0.3, 0.5, 1],
        rootMargin: '-100px 0px -60% 0px' 
      }
    );

    navigationSections.forEach(section => {
      const element = document.getElementById(section.id);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, [analysisData]);

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

  const handleNavigate = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'start'
      });
    }
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
    <div className="flex h-full w-full">
      {/* Main Content */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
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
          <Card id="key-insights">
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
            <Card key={dataIndex} id={dataIndex === 0 ? "quantitative-data" : undefined}>
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
          <Card id="personas">
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
          <Card id="themes">
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

          {/* Enhanced Recommendations with Quotes */}
          {analysisData.recommendations && (
            <Card id="recommendations">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" />
                  <CardTitle className="text-lg">Doğrudan Öneriler</CardTitle>
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

          {/* Outliers */}
          {analysisData.outliers && (
            <Card id="outliers">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-primary" />
                  <CardTitle className="text-lg">Aykırı Değerler</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2.5">
                  {analysisData.outliers.map((outlier: any, index: number) => (
                    <div key={index} className="border rounded-lg p-3 space-y-1.5 bg-amber-50/50 border-amber-200">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">{outlier.participant}</Badge>
                        <Badge variant="secondary" className="text-xs">{outlier.impact}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{outlier.finding}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* New Studies */}
          {analysisData.newStudies && (
            <Card id="new-studies">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <CardTitle className="text-lg">Yeni Çalışmalar</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <ul className="space-y-2">
                  {analysisData.newStudies.map((study: string, index: number) => (
                    <li key={index} className="flex gap-2">
                      <span className="text-primary mt-0.5 text-sm">•</span>
                      <span className="text-sm">{study}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Motivation */}
          {analysisData.motivation && (
            <Card id="motivation">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Heart className="h-4 w-4 text-primary" />
                  <CardTitle className="text-lg">Motivasyon</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                <div className="text-center py-3 bg-primary/5 rounded-lg">
                  <div className="text-3xl font-bold text-primary">{analysisData.motivation.overall}%</div>
                  <p className="text-xs text-muted-foreground mt-1">Genel Motivasyon Skoru</p>
                </div>
                <div className="space-y-3">
                  {analysisData.motivation.reasons.map((reason: any, index: number) => (
                    <HorizontalBar
                      key={index}
                      label={reason.reason}
                      value={reason.value}
                      color={reason.color}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Voice vs Text Input */}
          {analysisData.voiceVsText && (
            <Card id="voice-vs-text">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Mic className="h-4 w-4 text-primary" />
                  <CardTitle className="text-lg">Sesli vs Metin Girişi</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="text-center p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <Mic className="h-5 w-5 mx-auto mb-1 text-blue-600" />
                    <div className="text-2xl font-bold text-blue-600">{analysisData.voiceVsText.voiceUsers}%</div>
                    <p className="text-xs text-muted-foreground">Sesli Kullanıcılar</p>
                  </div>
                  <div className="text-center p-3 bg-green-50 rounded-lg border border-green-200">
                    <Type className="h-5 w-5 mx-auto mb-1 text-green-600" />
                    <div className="text-2xl font-bold text-green-600">{analysisData.voiceVsText.textUsers}%</div>
                    <p className="text-xs text-muted-foreground">Metin Kullanıcıları</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Ort. Süre:</span>
                      <span className="font-medium">{analysisData.voiceVsText.voiceAvgTime}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Memnuniyet:</span>
                      <span className="font-medium">{analysisData.voiceVsText.voiceSatisfaction}%</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Ort. Süre:</span>
                      <span className="font-medium">{analysisData.voiceVsText.textAvgTime}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Memnuniyet:</span>
                      <span className="font-medium">{analysisData.voiceVsText.textSatisfaction}%</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Survey Time */}
          {analysisData.surveyTime && (
            <Card id="survey-time">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  <CardTitle className="text-lg">Anket Süresi</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Ortalama:</span>
                      <span className="font-medium">{analysisData.surveyTime.average}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Medyan:</span>
                      <span className="font-medium">{analysisData.surveyTime.median}</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">En Kısa:</span>
                      <span className="font-medium">{analysisData.surveyTime.shortest}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">En Uzun:</span>
                      <span className="font-medium">{analysisData.surveyTime.longest}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Location */}
          {analysisData.locationData && (
            <Card id="location">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  <CardTitle className="text-lg">Konum</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                {analysisData.locationData.map((location: any, index: number) => (
                  <HorizontalBar
                    key={index}
                    label={location.city}
                    value={location.percentage}
                    color={location.color}
                  />
                ))}
              </CardContent>
            </Card>
          )}

          {/* Multitasking */}
          {analysisData.multitasking && (
            <Card id="multitasking">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-primary" />
                  <CardTitle className="text-lg">Çoklu Görev</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                <div className="text-center py-3 bg-primary/5 rounded-lg">
                  <div className="text-3xl font-bold text-primary">{analysisData.multitasking.doesMultitask}%</div>
                  <p className="text-xs text-muted-foreground mt-1">Çoklu Görev Yapan Kullanıcılar</p>
                </div>
                <div className="space-y-3">
                  <p className="text-xs font-medium">Yaygın Aktiviteler:</p>
                  {analysisData.multitasking.commonActivities.map((activity: any, index: number) => (
                    <HorizontalBar
                      key={index}
                      label={activity.activity}
                      value={activity.percentage}
                      color={activity.color}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Duration */}
          {analysisData.duration && (
            <Card id="duration">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Timer className="h-4 w-4 text-primary" />
                  <CardTitle className="text-lg">Süre</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                <div className="text-center py-3 bg-primary/5 rounded-lg">
                  <div className="text-2xl font-bold text-primary">{analysisData.duration.averageSession}</div>
                  <p className="text-xs text-muted-foreground mt-1">Ortalama Oturum Süresi</p>
                </div>
                <div className="space-y-3">
                  <HorizontalBar label="Kısa Oturumlar (< 2 dk)" value={analysisData.duration.shortSessions} color="#10b981" />
                  <HorizontalBar label="Orta Oturumlar (2-5 dk)" value={analysisData.duration.mediumSessions} color="#14b8a6" />
                  <HorizontalBar label="Uzun Oturumlar (> 5 dk)" value={analysisData.duration.longSessions} color="#06b6d4" />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Average Study Time */}
          {analysisData.averageStudyTime && (
            <Card id="average-study-time">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  <CardTitle className="text-lg">Ortalama Çalışma Süresi</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-3">
                  <div className="text-center py-3 bg-primary/5 rounded-lg">
                    <div className="text-2xl font-bold text-primary">{analysisData.averageStudyTime.overall}</div>
                    <p className="text-xs text-muted-foreground mt-1">Genel Ortalama</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="text-center p-3 bg-blue-50 rounded-lg">
                      <div className="text-lg font-bold text-blue-600">{analysisData.averageStudyTime.firstTime}</div>
                      <p className="text-muted-foreground mt-1">İlk Katılımcılar</p>
                    </div>
                    <div className="text-center p-3 bg-green-50 rounded-lg">
                      <div className="text-lg font-bold text-green-600">{analysisData.averageStudyTime.returning}</div>
                      <p className="text-muted-foreground mt-1">Dönen Katılımcılar</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Participation in Studies */}
          {analysisData.participationData && (
            <Card id="participation">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  <CardTitle className="text-lg">Çalışmalara Katılım</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="text-center p-3 bg-blue-50 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">{analysisData.participationData.firstTimeParticipants}%</div>
                    <p className="text-xs text-muted-foreground mt-1">İlk Kez</p>
                  </div>
                  <div className="text-center p-3 bg-green-50 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">{analysisData.participationData.returningParticipants}%</div>
                    <p className="text-xs text-muted-foreground mt-1">Geri Dönen</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <HorizontalBar label="Tamamlama Oranı" value={analysisData.participationData.completionRate} color="#10b981" />
                  <HorizontalBar label="Bırakma Oranı" value={analysisData.participationData.dropoutRate} color="#ef4444" />
                </div>
              </CardContent>
            </Card>
          )}

          {/* User Research Panels */}
          {analysisData.researchPanels && (
            <Card id="research-panels">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  <CardTitle className="text-lg">Kullanıcı Araştırma Panelleri</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {analysisData.researchPanels.map((panel: any, index: number) => (
                    <div key={index} className="border rounded-lg p-3 flex justify-between items-center">
                      <div>
                        <p className="text-sm font-medium">{panel.panel}</p>
                        <p className="text-xs text-muted-foreground">{panel.members} üye</p>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-primary">{panel.active}</div>
                        <p className="text-xs text-muted-foreground">aktif</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Number of Panels */}
          {analysisData.panelDistribution && (
            <Card id="panel-distribution">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  <CardTitle className="text-lg">Panel Sayısı</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                {analysisData.panelDistribution.map((dist: any, index: number) => (
                  <div key={index} className="flex justify-between items-center">
                    <span className="text-sm">{dist.panels}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-32">
                        <HorizontalBar label="" value={dist.users} maxValue={50} color={dist.color} />
                      </div>
                      <span className="text-sm font-medium w-8 text-right">{dist.users}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Profession */}
          {analysisData.professionData && (
            <Card id="profession">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  <CardTitle className="text-lg">Meslek</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                {analysisData.professionData.map((profession: any, index: number) => (
                  <HorizontalBar
                    key={index}
                    label={profession.profession}
                    value={profession.percentage}
                    color={profession.color}
                  />
                ))}
              </CardContent>
            </Card>
          )}

          {/* Age */}
          {analysisData.ageData && (
            <Card id="age">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  <CardTitle className="text-lg">Yaş</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                {analysisData.ageData.map((age: any, index: number) => (
                  <HorizontalBar
                    key={index}
                    label={age.range}
                    value={age.percentage}
                    color={age.color}
                  />
                ))}
              </CardContent>
            </Card>
          )}

          {/* Charts Section Header */}
          <div id="charts-header" className="pt-4 pb-2">
            <div className="flex items-center gap-3">
              <div className="h-px bg-border flex-1" />
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-bold">Grafikler</h2>
              </div>
              <div className="h-px bg-border flex-1" />
            </div>
          </div>

          {/* Motivation by Age Chart */}
          {analysisData.charts?.motivationByAge && (
            <Card id="motivation-by-age">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Heart className="h-4 w-4 text-primary" />
                  <CardTitle className="text-lg">Yaşa Göre Motivasyon</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                {analysisData.charts.motivationByAge.map((item: any, index: number) => (
                  <HorizontalBar
                    key={index}
                    label={item.age}
                    value={item.motivation}
                    color={item.color}
                  />
                ))}
              </CardContent>
            </Card>
          )}

          {/* Average Study Time by Profession Chart */}
          {analysisData.charts?.studyTimeByProfession && (
            <Card id="study-time-by-profession">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  <CardTitle className="text-lg">Mesleğe Göre Ortalama Çalışma Süresi</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                {analysisData.charts.studyTimeByProfession.map((item: any, index: number) => (
                  <div key={index} className="flex justify-between items-center">
                    <span className="text-sm flex-1">{item.profession}</span>
                    <div className="flex items-center gap-2 flex-1">
                      <HorizontalBar label="" value={item.time * 8} maxValue={100} color={item.color} />
                      <span className="text-sm font-medium w-12 text-right">{item.time} dk</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Average Study Time by Age Chart */}
          {analysisData.charts?.studyTimeByAge && (
            <Card id="study-time-by-age">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  <CardTitle className="text-lg">Yaşa Göre Ortalama Çalışma Süresi</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                {analysisData.charts.studyTimeByAge.map((item: any, index: number) => (
                  <div key={index} className="flex justify-between items-center">
                    <span className="text-sm flex-1">{item.age}</span>
                    <div className="flex items-center gap-2 flex-1">
                      <HorizontalBar label="" value={item.time * 8} maxValue={100} color={item.color} />
                      <span className="text-sm font-medium w-12 text-right">{item.time} dk</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Participant Feedback */}
          <Card id="participant-feedback">
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

      {/* Right Navigation Sidebar */}
      <nav className="w-48 border-l bg-background overflow-auto p-3 space-y-0.5 hidden lg:block">
        {navigationSections.map((section) => (
          <button
            key={section.id}
            onClick={() => handleNavigate(section.id)}
            className={cn(
              "w-full text-left py-1.5 px-2 rounded text-xs leading-tight transition-colors",
              activeSection === section.id
                ? "bg-primary/10 text-primary font-medium border-l-2 border-primary -ml-0.5 pl-1.5"
                : "text-muted-foreground hover:bg-muted/50"
            )}
          >
            {section.label}
          </button>
        ))}
      </nav>
    </div>
  );
};

export default AnalysisPanel;
