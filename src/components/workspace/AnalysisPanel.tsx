import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { RefreshCw, Download, TrendingUp, Users, MessageSquare } from "lucide-react";
import { interviewService } from "@/services/interviewService";
import { useToast } from "@/hooks/use-toast";

interface AnalysisPanelProps {
  projectId: string;
  sessionIds: string[];
}

const AnalysisPanel = ({ projectId, sessionIds }: AnalysisPanelProps) => {
  const { toast } = useToast();
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

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

        {/* Recommendations */}
        {analysisData.recommendations && (
          <Card>
            <CardHeader>
              <CardTitle>Öneriler</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {analysisData.recommendations.map((rec: string, index: number) => (
                  <li key={index} className="flex gap-2 text-text-primary">
                    <span className="text-brand-primary">•</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
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
