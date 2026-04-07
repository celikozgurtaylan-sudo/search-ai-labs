import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { generateResearchPresentation } from "@/services/presentationService";
import { projectReportService } from "@/services/projectReportService";
import type {
  ProjectInterviewReport,
  ProjectReportFinding,
  ProjectReportQuote,
  ProjectReportRecommendation,
  ProjectReportTheme,
} from "@/types/projectReport";
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  FileText,
  Lightbulb,
  Loader2,
  MessageSquare,
  Quote,
  RefreshCw,
  Sparkles,
  Target,
  Users,
  Video,
} from "lucide-react";
import { toast } from "sonner";

interface AnalysisPanelProps {
  projectId: string;
  sessionIds: string[];
}

const navigationSections = [
  { id: "overview", label: "Genel Bakış" },
  { id: "findings", label: "Önemli Bulgular" },
  { id: "themes", label: "Temalar" },
  { id: "recommendations", label: "Öneriler" },
  { id: "questions", label: "Soru Dağılımı" },
  { id: "participants", label: "Katılımcılar" },
];

const formatPercent = (value: number) => `${Number.isFinite(value) ? value.toFixed(1) : "0.0"}%`;

const formatDuration = (valueMs: number | null) => {
  if (!valueMs || valueMs <= 0) return "Yok";

  const totalSeconds = Math.round(valueMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds} sn`;
  }

  return `${minutes} dk ${seconds.toString().padStart(2, "0")} sn`;
};

const formatGeneratedAt = (value: string | null) => {
  if (!value) return "Henüz üretilmedi";

  try {
    return new Date(value).toLocaleString("tr-TR", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return value;
  }
};

const priorityLabel: Record<ProjectReportRecommendation["priority"], string> = {
  high: "Yüksek",
  medium: "Orta",
  low: "Düşük",
};

const priorityClassName: Record<ProjectReportRecommendation["priority"], string> = {
  high: "border-red-200 bg-red-50 text-red-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  low: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

const ReportMetricCard = ({
  title,
  value,
  description,
}: {
  title: string;
  value: string;
  description: string;
}) => (
  <Card className="border-border-light">
    <CardContent className="p-5">
      <p className="text-sm font-medium text-text-secondary">{title}</p>
      <p className="mt-2 text-3xl font-semibold text-text-primary">{value}</p>
      <p className="mt-2 text-xs leading-5 text-text-muted">{description}</p>
    </CardContent>
  </Card>
);

const MetricBar = ({
  label,
  value,
  maxValue,
  helper,
}: {
  label: string;
  value: number;
  maxValue: number;
  helper: string;
}) => {
  const width = maxValue > 0 ? Math.max((value / maxValue) * 100, 4) : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-text-primary">{label}</p>
          <p className="text-xs text-text-secondary">{helper}</p>
        </div>
        <p className="text-sm font-semibold text-text-primary">{value}</p>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-brand-primary transition-all duration-500"
          style={{ width: `${Math.min(width, 100)}%` }}
        />
      </div>
    </div>
  );
};

const EvidenceQuotes = ({
  title,
  quotes,
}: {
  title?: string;
  quotes: ProjectReportQuote[];
}) => {
  if (quotes.length === 0) return null;

  return (
    <div className="space-y-3">
      {title ? <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-muted">{title}</p> : null}
      {quotes.map((quote) => (
        <div key={quote.quoteId} className="rounded-2xl border border-border-light bg-muted/30 p-4">
          <div className="flex items-start gap-2">
            <Quote className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary" />
            <div className="min-w-0 space-y-2">
              <p className="text-sm leading-6 text-text-primary">“{quote.text}”</p>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-text-secondary">
                <Badge variant="secondary" className="text-[11px]">
                  {quote.participantLabel}
                </Badge>
                <span>{quote.section}</span>
                <span>•</span>
                <span>{quote.questionText}</span>
                {quote.videoUrl ? (
                  <>
                    <span>•</span>
                    <a
                      href={quote.videoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-brand-primary hover:underline"
                    >
                      <Video className="h-3 w-3" />
                      Video kanıtı
                    </a>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

const EmptyReportState = ({
  hasSessions,
  onRegenerate,
  isGenerating,
}: {
  hasSessions: boolean;
  onRegenerate: () => void;
  isGenerating: boolean;
}) => (
  <div className="h-full flex items-center justify-center bg-white p-6">
    <div className="max-w-lg text-center">
      <BarChart3 className="mx-auto h-12 w-12 text-text-muted" />
      <h3 className="mt-4 text-lg font-semibold text-text-primary">
        {hasSessions ? "Rapor henüz hazır değil" : "Henüz görüşme verisi yok"}
      </h3>
      <p className="mt-2 text-sm leading-6 text-text-secondary">
        {hasSessions
          ? "Tamamlanan görüşmeler geldikçe arka planda analiz üretilecek. İsterseniz manuel olarak da yeniden tetikleyebilirsiniz."
          : "Bu aşamada rapor üretmek için en az bir görüşmenin tamamlanmış olması gerekir."}
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Button onClick={onRegenerate} disabled={isGenerating || !hasSessions}>
          {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Raporu Oluştur
        </Button>
      </div>
    </div>
  </div>
);

const findFindingTitles = (report: ProjectInterviewReport, findingIds: string[]) =>
  findingIds
    .map((findingId) => report.findings.find((finding) => finding.id === findingId)?.title)
    .filter((value): value is string => Boolean(value));

const takeQuotes = (quoteMap: Map<string, ProjectReportQuote>, quoteIds: string[]) =>
  quoteIds
    .map((quoteId) => quoteMap.get(quoteId))
    .filter((quote): quote is ProjectReportQuote => Boolean(quote));

const FindingCard = ({
  finding,
  quotes,
}: {
  finding: ProjectReportFinding;
  quotes: ProjectReportQuote[];
}) => (
  <Card className="border-border-light">
    <CardHeader className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{finding.evidenceCount} kanıt</Badge>
        {finding.questionRefs.length > 0 ? <Badge variant="outline">{finding.questionRefs.length} soru</Badge> : null}
        {finding.sessionRefs.length > 0 ? <Badge variant="outline">{finding.sessionRefs.length} oturum</Badge> : null}
      </div>
      <CardTitle className="text-lg">{finding.title}</CardTitle>
      <CardDescription className="text-sm leading-6 text-text-secondary">
        {finding.summary}
      </CardDescription>
    </CardHeader>
    <CardContent>
      <EvidenceQuotes quotes={quotes} />
    </CardContent>
  </Card>
);

const ThemeCard = ({
  theme,
  quotes,
}: {
  theme: ProjectReportTheme;
  quotes: ProjectReportQuote[];
}) => (
  <Card className="border-border-light">
    <CardHeader className="space-y-3">
      <div className="flex items-center gap-2">
        <Badge variant="secondary">{theme.evidenceCount} alıntı</Badge>
      </div>
      <CardTitle className="text-base">{theme.title}</CardTitle>
      <CardDescription className="text-sm leading-6 text-text-secondary">
        {theme.description}
      </CardDescription>
    </CardHeader>
    <CardContent>
      <EvidenceQuotes quotes={quotes} />
    </CardContent>
  </Card>
);

const RecommendationCard = ({
  report,
  recommendation,
  quotes,
}: {
  report: ProjectInterviewReport;
  recommendation: ProjectReportRecommendation;
  quotes: ProjectReportQuote[];
}) => {
  const linkedTitles = findFindingTitles(report, recommendation.linkedFindingIds);

  return (
    <Card className="border-border-light">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={cn("border", priorityClassName[recommendation.priority])}>
            {priorityLabel[recommendation.priority]} öncelik
          </Badge>
          {linkedTitles.length > 0 ? <Badge variant="outline">{linkedTitles.length} ilişkili bulgu</Badge> : null}
        </div>
        <CardTitle className="text-base">{recommendation.title}</CardTitle>
        <CardDescription className="text-sm leading-6 text-text-secondary">
          {recommendation.description}
        </CardDescription>
        {linkedTitles.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {linkedTitles.map((title) => (
              <Badge key={title} variant="secondary" className="text-[11px]">
                {title}
              </Badge>
            ))}
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        <EvidenceQuotes quotes={quotes} />
      </CardContent>
    </Card>
  );
};

const AnalysisPanel = ({ projectId, sessionIds }: AnalysisPanelProps) => {
  const [projectTitle, setProjectTitle] = useState("Araştırma Projesi");
  const [projectDescription, setProjectDescription] = useState("");
  const [report, setReport] = useState<ProjectInterviewReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingPPT, setIsGeneratingPPT] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState("overview");

  const quoteMap = useMemo(
    () => new Map((report?.quoteCatalog || []).map((quote) => [quote.quoteId, quote])),
    [report],
  );

  const hasSessions = sessionIds.length > 0;
  const hasRenderableReport = Boolean(
    report && (
      report.generatedAt ||
      report.findings.length > 0 ||
      report.themes.length > 0 ||
      report.recommendations.length > 0 ||
      report.questionBreakdown.length > 0 ||
      report.participantBreakdown.length > 0
    ),
  );

  const loadSavedReport = async (silent = false) => {
    if (!projectId) {
      setLoadError("Geçerli bir proje bulunamadı.");
      setIsLoading(false);
      return;
    }

    if (!silent) {
      setIsLoading(true);
    }

    try {
      setLoadError(null);
      const snapshot = await projectReportService.getProjectReport(projectId);
      setProjectTitle(snapshot.projectTitle);
      setProjectDescription(snapshot.projectDescription);
      setReport(snapshot.report);
    } catch (error) {
      console.error("Failed to load project report:", error);
      setLoadError(error instanceof Error ? error.message : "Rapor yüklenemedi.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadSavedReport();
  }, [projectId]);

  useEffect(() => {
    if (report?.status !== "generating") return;

    const intervalId = window.setInterval(() => {
      void loadSavedReport(true);
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [report?.status, projectId]);

  useEffect(() => {
    if (!report) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.25) {
            setActiveSection(entry.target.id);
          }
        });
      },
      {
        threshold: [0.25, 0.5, 0.75],
        rootMargin: "-100px 0px -55% 0px",
      },
    );

    navigationSections.forEach((section) => {
      const element = document.getElementById(section.id);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, [report]);

  const regenerateReport = async () => {
    if (!projectId) return;

    setIsGenerating(true);
    try {
      const nextReport = await projectReportService.generateProjectReport(projectId, { force: true });
      setReport(nextReport);
      toast.success("Analiz raporu güncellendi.");
      void loadSavedReport(true);
    } catch (error) {
      console.error("Failed to regenerate report:", error);
      toast.error(error instanceof Error ? error.message : "Analiz güncellenemedi.");
    } finally {
      setIsGenerating(false);
    }
  };

  const generatePresentation = async () => {
    if (!report) return;

    setIsGeneratingPPT(true);
    try {
      await generateResearchPresentation(report, projectTitle);
      toast.success("Sunum oluşturuldu ve indirildi.");
    } catch (error) {
      console.error("Presentation generation failed:", error);
      toast.error("Sunum oluşturulurken bir hata oluştu.");
    } finally {
      setIsGeneratingPPT(false);
    }
  };

  const navigateToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  if (isLoading && !report) {
    return (
      <div className="h-full flex items-center justify-center bg-white">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand-primary" />
          <p className="mt-4 text-sm text-text-secondary">Analiz raporu yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (!report && !isLoading) {
    if (loadError) {
      return (
        <div className="h-full flex items-center justify-center bg-white p-6">
          <div className="max-w-lg text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
            <h3 className="mt-4 text-lg font-semibold text-text-primary">Rapor yüklenemedi</h3>
            <p className="mt-2 text-sm leading-6 text-text-secondary">{loadError}</p>
            <div className="mt-6 flex justify-center gap-3">
              <Button variant="outline" onClick={() => void loadSavedReport()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Tekrar Dene
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <EmptyReportState hasSessions={hasSessions} onRegenerate={regenerateReport} isGenerating={isGenerating} />
    );
  }

  if (!report) {
    return null;
  }

  const generatingWithoutData = report.status === "generating" && !hasRenderableReport;
  const failedWithoutData = report.status === "failed" && !hasRenderableReport;
  const emptyWithoutData = report.status === "empty" && !hasRenderableReport;

  if (emptyWithoutData) {
    return (
      <EmptyReportState hasSessions={hasSessions} onRegenerate={regenerateReport} isGenerating={isGenerating} />
    );
  }

  if (generatingWithoutData) {
    return (
      <div className="h-full flex items-center justify-center bg-white p-6">
        <div className="max-w-lg text-center">
          <Loader2 className="mx-auto h-12 w-12 animate-spin text-brand-primary" />
          <h3 className="mt-4 text-lg font-semibold text-text-primary">Analiz hazırlanıyor</h3>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Tamamlanan görüşmeler birleştiriliyor ve kanıta dayalı rapor üretiliyor. Bu ekran otomatik olarak yenilenecek.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Button variant="outline" onClick={() => void loadSavedReport()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Durumu Yenile
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (failedWithoutData) {
    return (
      <div className="h-full flex items-center justify-center bg-white p-6">
        <div className="max-w-lg text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
          <h3 className="mt-4 text-lg font-semibold text-text-primary">Analiz üretilemedi</h3>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            {report.generationMeta.failureMessage || "Rapor üretilirken beklenmeyen bir hata oluştu."}
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Button onClick={regenerateReport} disabled={isGenerating}>
              {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Tekrar Dene
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full">
      <div className="flex-1 overflow-auto p-4 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                {report.status === "ready" ? "Hazır" : report.status === "generating" ? "Güncelleniyor" : report.status === "failed" ? "Hata" : "Boş"}
              </Badge>
              <Badge variant="outline">
                {report.sourceStats.completedSessionCount} tamamlanan oturum
              </Badge>
              <Badge variant="outline">
                {report.sourceStats.responsesAnalyzed} analiz edilen yanıt
              </Badge>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-text-primary">Analiz Raporu</h1>
              <p className="mt-1 text-sm text-text-secondary">{projectTitle}</p>
              {projectDescription ? (
                <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">{projectDescription}</p>
              ) : null}
            </div>
            <p className="text-xs text-text-muted">
              Son güncelleme: {formatGeneratedAt(report.generatedAt)}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void loadSavedReport(true)}>
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              Yenile
            </Button>
            <Button variant="outline" size="sm" onClick={regenerateReport} disabled={isGenerating}>
              {isGenerating ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-2 h-3.5 w-3.5" />}
              Yeniden Üret
            </Button>
            <Button size="sm" onClick={generatePresentation} disabled={isGeneratingPPT || !hasRenderableReport}>
              {isGeneratingPPT ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <FileText className="mr-2 h-3.5 w-3.5" />}
              Sunum Oluştur
            </Button>
          </div>
        </div>

        {loadError ? (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="flex items-start gap-3 p-4 text-amber-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="text-sm">{loadError}</p>
            </CardContent>
          </Card>
        ) : null}

        {report.status === "generating" ? (
          <Card className="border-brand-primary/20 bg-brand-primary/5">
            <CardContent className="flex items-start gap-3 p-4">
              <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-brand-primary" />
              <div>
                <p className="text-sm font-medium text-text-primary">Rapor güncelleniyor</p>
                <p className="mt-1 text-sm text-text-secondary">
                  Yeni tamamlanan görüşmeler arka planda rapora ekleniyor. Alttaki içerik son hazır versiyonu göstermeye devam eder.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : null}

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
            <Card id="overview" className="border-border-light">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-brand-primary" />
                  <CardTitle>Genel Bakış</CardTitle>
                </div>
                <CardDescription className="text-sm leading-6 text-text-secondary">
                  {report.executiveSummary}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <ReportMetricCard
                    title="Katılım"
                    value={`${report.overview.completedParticipantCount}/${report.overview.invitedParticipantCount}`}
                    description={`Katılım oranı ${formatPercent(report.overview.joinRate)} • Tamamlama oranı ${formatPercent(report.overview.completionRate)}`}
                  />
                  <ReportMetricCard
                    title="Skip Oranı"
                    value={formatPercent(report.overview.skipRate)}
                    description={`${report.sourceStats.skippedResponseCount} yanıt skip olarak işaretlendi.`}
                  />
                  <ReportMetricCard
                    title="Ort. Yanıt Süresi"
                    value={formatDuration(report.overview.averageResponseDurationMs)}
                    description="Tamamlanmış ve transcript oluşmuş cevapların ortalaması."
                  />
                  <ReportMetricCard
                    title="Ort. Oturum Süresi"
                    value={formatDuration(report.overview.averageSessionDurationMs)}
                    description={`${report.sourceStats.completedSessionCount} tamamlanan oturumdan hesaplandı.`}
                  />
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                  <Card className="border-border-light bg-muted/20">
                    <CardHeader>
                      <CardTitle className="text-base">Veri Kapsamı</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <MetricBar
                        label="Davet edilen katılımcılar"
                        value={report.sourceStats.invitedParticipantCount}
                        maxValue={Math.max(report.sourceStats.invitedParticipantCount, 1)}
                        helper={`${report.sourceStats.joinedParticipantCount} katıldı • ${report.sourceStats.completedParticipantCount} tamamladı`}
                      />
                      <MetricBar
                        label="Toplam oturumlar"
                        value={report.sourceStats.completedSessionCount}
                        maxValue={Math.max(report.sourceStats.totalSessionCount, 1)}
                        helper={`${report.sourceStats.pendingSessionCount} oturum henüz tamamlanmadı`}
                      />
                      <MetricBar
                        label="Analiz edilen transcriptler"
                        value={report.sourceStats.responsesAnalyzed}
                        maxValue={Math.max(report.sourceStats.responsesAnalyzed + report.sourceStats.skippedResponseCount, 1)}
                        helper={`${report.sourceStats.quoteCount} alıntı kanıt olarak kataloga alındı`}
                      />
                    </CardContent>
                  </Card>

                  <Card className="border-border-light bg-muted/20">
                    <CardHeader>
                      <CardTitle className="text-base">Kapsam Özeti</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm text-text-secondary">
                      <p>
                        {report.sourceStats.questionTemplateCount} benzersiz soru şablonu ve {report.sourceStats.questionInstanceCount} soru örneği üzerinden çalışıldı.
                      </p>
                      <p>
                        Her bulgu yalnızca kaydedilmiş transcriptlerden ve tamamlanma/skip/süre verilerinden üretildi.
                      </p>
                      <p>
                        Analiz üretim kaynağı: <span className="font-medium text-text-primary">{report.generatedFrom}</span>
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>

            <Card id="findings" className="border-border-light">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-brand-primary" />
                  <CardTitle>Önemli Bulgular</CardTitle>
                </div>
                <CardDescription>
                  Ürün kararlarını yönlendirecek ana içgörüler ve bunları destekleyen alıntılar.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {report.findings.length === 0 ? (
                  <p className="text-sm text-text-secondary">Henüz yeterli kanıt oluşmadığı için bulgu çıkarılamadı.</p>
                ) : (
                  report.findings.map((finding) => (
                    <FindingCard
                      key={finding.id}
                      finding={finding}
                      quotes={takeQuotes(quoteMap, finding.quoteIds)}
                    />
                  ))
                )}
              </CardContent>
            </Card>

            <Card id="themes" className="border-border-light">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-brand-primary" />
                  <CardTitle>Temalar</CardTitle>
                </div>
                <CardDescription>
                  Farklı görüşmelerde tekrar eden, kanıtlanmış örüntüler.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 lg:grid-cols-2">
                {report.themes.length === 0 ? (
                  <p className="text-sm text-text-secondary">Tema çıkarımı için yeterli tekrar eden kanıt bulunamadı.</p>
                ) : (
                  report.themes.map((theme) => (
                    <ThemeCard key={theme.id} theme={theme} quotes={takeQuotes(quoteMap, theme.quoteIds)} />
                  ))
                )}
              </CardContent>
            </Card>

            <Card id="recommendations" className="border-border-light">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-brand-primary" />
                  <CardTitle>Öneriler</CardTitle>
                </div>
                <CardDescription>
                  Kanıtla ilişkilendirilmiş, önceliklendirilmiş ürün aksiyonları.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {report.recommendations.length === 0 ? (
                  <p className="text-sm text-text-secondary">Öneri üretmek için yeterli kanıt bulunamadı.</p>
                ) : (
                  report.recommendations.map((recommendation) => (
                    <RecommendationCard
                      key={recommendation.id}
                      report={report}
                      recommendation={recommendation}
                      quotes={takeQuotes(quoteMap, recommendation.quoteIds)}
                    />
                  ))
                )}
              </CardContent>
            </Card>

            <Card id="questions" className="border-border-light">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-brand-primary" />
                  <CardTitle>Soru Dağılımı</CardTitle>
                </div>
                <CardDescription>
                  Hangi sorular daha çok yanıtlandı, hangi alanlarda skip veya kapsama problemi oluştu.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {report.questionBreakdown.length === 0 ? (
                  <p className="text-sm text-text-secondary">Henüz soru bazında analiz edilecek tamamlanmış yanıt yok.</p>
                ) : (
                  report.questionBreakdown.map((question) => (
                    <Card key={question.questionRef} className="border-border-light bg-muted/20">
                      <CardContent className="space-y-4 p-5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-muted">
                              {question.section}
                            </p>
                            <h4 className="mt-2 text-base font-semibold text-text-primary">{question.questionText}</h4>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="secondary">{question.answeredResponseCount} yanıt</Badge>
                            <Badge variant="outline">{question.skippedResponseCount} skip</Badge>
                            <Badge variant="outline">{formatPercent(question.coverageRate)} kapsama</Badge>
                          </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-3">
                          <MetricBar
                            label="Yanıt"
                            value={question.answeredResponseCount}
                            maxValue={Math.max(question.sessionCount, 1)}
                            helper={`${question.sessionCount} oturumda soruldu`}
                          />
                          <MetricBar
                            label="Skip"
                            value={question.skippedResponseCount}
                            maxValue={Math.max(question.sessionCount, 1)}
                            helper="Bu soruda vazgeçilen cevaplar"
                          />
                          <MetricBar
                            label="Süre"
                            value={question.averageResponseDurationMs ? Math.round(question.averageResponseDurationMs / 1000) : 0}
                            maxValue={Math.max(
                              ...report.questionBreakdown.map((entry) => Math.round((entry.averageResponseDurationMs || 0) / 1000)),
                              1,
                            )}
                            helper={`Ortalama ${formatDuration(question.averageResponseDurationMs)}`}
                          />
                        </div>

                        {question.summary ? (
                          <p className="text-sm leading-6 text-text-secondary">{question.summary}</p>
                        ) : null}

                        <EvidenceQuotes quotes={takeQuotes(quoteMap, question.quoteIds)} />
                      </CardContent>
                    </Card>
                  ))
                )}
              </CardContent>
            </Card>

            <Card id="participants" className="border-border-light">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-brand-primary" />
                  <CardTitle>Katılımcılar</CardTitle>
                </div>
              <CardDescription>
                  Oturum bazında kapsama, süre, skip ve özet kanıtlar.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {report.participantBreakdown.length === 0 ? (
                  <p className="text-sm text-text-secondary">Henüz katılımcı bazında gösterilecek tamamlanmış oturum yok.</p>
                ) : (
                  report.participantBreakdown.map((participant) => (
                    <Card key={participant.sessionId} className="border-border-light bg-muted/20">
                      <CardContent className="space-y-4 p-5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-muted">
                              {participant.sessionRef}
                            </p>
                            <h4 className="mt-2 text-base font-semibold text-text-primary">{participant.participantLabel}</h4>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="secondary">{participant.answeredResponseCount} yanıt</Badge>
                            <Badge variant="outline">{participant.skippedResponseCount} skip</Badge>
                            {participant.hasVideoEvidence ? <Badge variant="outline">Video var</Badge> : null}
                          </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-3">
                          <ReportMetricCard
                            title="Oturum Süresi"
                            value={formatDuration(participant.sessionDurationMs)}
                            description="started_at ve ended_at üzerinden hesaplandı."
                          />
                          <ReportMetricCard
                            title="Ort. Yanıt"
                            value={formatDuration(participant.averageResponseDurationMs)}
                            description={`${participant.responseCount} kayıt üzerinden hesaplandı.`}
                          />
                          <ReportMetricCard
                            title="Durum"
                            value={participant.status}
                            description="Oturumun kayıtlı son durumu."
                          />
                        </div>

                        {participant.summary ? (
                          <p className="text-sm leading-6 text-text-secondary">{participant.summary}</p>
                        ) : null}

                        <EvidenceQuotes quotes={takeQuotes(quoteMap, participant.quoteIds)} />
                      </CardContent>
                    </Card>
                  ))
                )}
              </CardContent>
            </Card>

            {import.meta.env.DEV ? (
              <Card className="border-border-light">
                <CardHeader>
                  <CardTitle>Raw Report (Dev Only)</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="overflow-auto rounded bg-muted p-4 text-xs">
                    {JSON.stringify(report, null, 2)}
                  </pre>
                </CardContent>
              </Card>
            ) : null}
          </TabsContent>

          <TabsContent value="chat" className="mt-6">
            <Card>
              <CardContent className="py-12">
                <div className="text-center text-muted-foreground">
                  <MessageSquare className="mx-auto mb-4 h-12 w-12 opacity-50" />
                  <p>Analiz sohbeti sonraki iterasyonda eklenecek.</p>
                  <p className="mt-2 text-sm">Bu sürümde faz 4 yalnızca kanıta dayalı raporu gösterir.</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <nav className="hidden w-48 overflow-auto border-l bg-background p-3 lg:block">
        {navigationSections.map((section) => (
          <button
            key={section.id}
            onClick={() => navigateToSection(section.id)}
            className={cn(
              "w-full rounded px-2 py-1.5 text-left text-xs leading-tight transition-colors",
              activeSection === section.id
                ? "border-l-2 border-primary bg-primary/10 pl-1.5 font-medium text-primary"
                : "text-muted-foreground hover:bg-muted/50",
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
