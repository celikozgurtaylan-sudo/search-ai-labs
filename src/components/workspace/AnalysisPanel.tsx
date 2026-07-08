import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { generateResearchPresentation } from "@/services/presentationService";
import { projectReportService } from "@/services/projectReportService";
import { syntheticUserService } from "@/services/syntheticUserService";
import type {
  ProjectReportAnchorCoverage,
  ProjectInterviewReport,
  ProjectReportFinding,
  ProjectReportFollowUpPath,
  ProjectReportInferentialSection,
  ProjectReportParticipantJourney,
  ProjectReportQuote,
  ProjectReportRecommendation,
  ProjectReportTheme,
  ProjectReportTurn,
} from "@/types/projectReport";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  FileText,
  Lightbulb,
  Loader2,
  MessageSquare,
  MonitorUp,
  Pause,
  Play,
  Quote,
  RefreshCw,
  Sparkles,
  Target,
  Users,
  Volume2,
} from "lucide-react";
import { toast } from "sonner";

interface AnalysisPanelProps {
  projectId: string;
  sessionIds: string[];
  synthetic?: boolean;
  syntheticSampleSize?: number;
  onOpenSyntheticChat?: (personaId?: string | null) => void;
}

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

const ScreenRecordingPlayer = ({
  recordingUrl,
  mimeType,
  durationMs,
}: {
  recordingUrl?: string | null;
  mimeType?: string | null;
  durationMs?: number | null;
}) => {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    if (!recordingUrl) {
      setSignedUrl(null);
      return;
    }

    void supabase.storage
      .from("interview-screen-recordings")
      .createSignedUrl(recordingUrl, 300)
      .then(({ data, error }) => {
        if (!isMounted) return;
        if (error) {
          console.error("Failed to create signed screen recording URL:", error);
          setSignedUrl(null);
          return;
        }
        setSignedUrl(data?.signedUrl ?? null);
      });

    return () => {
      isMounted = false;
    };
  }, [recordingUrl]);

  if (!recordingUrl) return null;

  return (
    <div className="space-y-3 rounded-md border border-border-light bg-white p-3">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-text-secondary">
        <span className="inline-flex items-center gap-1 font-medium text-brand-primary">
          <MonitorUp className="h-3 w-3" />
          Ekran kaydı
        </span>
        <span>•</span>
        <span>{formatDuration(durationMs ?? null)}</span>
      </div>
      {signedUrl ? (
        <video controls className="aspect-video w-full rounded border border-border-light bg-black" preload="metadata">
          <source src={signedUrl} type={mimeType || "video/webm"} />
        </video>
      ) : (
        <p className="text-xs text-text-secondary">Ekran kaydı için geçici bağlantı hazırlanıyor.</p>
      )}
    </div>
  );
};

const normalizeQuoteText = (value: string) =>
  value
    .toLocaleLowerCase("tr-TR")
    .replace(/[“”"'.!,?;:()[\]\n\r]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

type QuoteTranscriptSegment = NonNullable<ProjectReportQuote["transcriptSegments"]>[number];

const findQuoteAudioSegment = (quote: ProjectReportQuote) => {
  const quoteText = normalizeQuoteText(quote.text);
  if (!quoteText || !quote.transcriptSegments?.length) {
    return null;
  }

  const directMatch = quote.transcriptSegments.find((segment) => {
    const segmentText = normalizeQuoteText(segment.text);
    return segmentText.includes(quoteText) || quoteText.includes(segmentText);
  });

  if (directMatch) {
    return directMatch;
  }

  const quoteWords = new Set(quoteText.split(" ").filter((word) => word.length > 2));
  let bestMatch: QuoteTranscriptSegment | null = null;
  let bestScore = 0;

  quote.transcriptSegments.forEach((segment) => {
    const segmentWords = normalizeQuoteText(segment.text).split(" ").filter((word) => word.length > 2);
    const score = segmentWords.filter((word) => quoteWords.has(word)).length;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = segment;
    }
  });

  return bestScore >= 3 ? bestMatch : null;
};

const waitForAudioMetadata = (audio: HTMLAudioElement) =>
  new Promise<void>((resolve) => {
    if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
      resolve();
      return;
    }

    let timeoutId: number | null = null;
    const handleLoadedMetadata = () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      resolve();
    };

    audio.addEventListener("loadedmetadata", handleLoadedMetadata, { once: true });
    timeoutId = window.setTimeout(() => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      resolve();
    }, 2_000);
    audio.load();
  });

const EvidenceQuotes = ({
  title,
  quotes,
  synthetic,
  onOpenSyntheticChat,
}: {
  title?: string;
  quotes: ProjectReportQuote[];
  synthetic?: boolean;
  onOpenSyntheticChat?: (personaId?: string | null) => void;
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [activeQuoteId, setActiveQuoteId] = useState<string | null>(null);
  const [loadingQuoteId, setLoadingQuoteId] = useState<string | null>(null);
  const [playingQuoteId, setPlayingQuoteId] = useState<string | null>(null);
  const [signedAudioUrls, setSignedAudioUrls] = useState<Record<string, string>>({});
  const quotePlaybackStopAtRef = useRef<number | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const clearPlaying = () => setPlayingQuoteId(null);
    const stopAtSegmentEnd = () => {
      if (quotePlaybackStopAtRef.current === null) {
        return;
      }

      if (audio.currentTime >= quotePlaybackStopAtRef.current) {
        audio.pause();
        quotePlaybackStopAtRef.current = null;
      }
    };
    audio.addEventListener("ended", clearPlaying);
    audio.addEventListener("pause", clearPlaying);
    audio.addEventListener("timeupdate", stopAtSegmentEnd);

    return () => {
      audio.removeEventListener("ended", clearPlaying);
      audio.removeEventListener("pause", clearPlaying);
      audio.removeEventListener("timeupdate", stopAtSegmentEnd);
    };
  }, []);

  const handleQuoteAudioToggle = async (quote: ProjectReportQuote) => {
    if (!quote.audioUrl || !audioRef.current) return;

    if (playingQuoteId === quote.quoteId) {
      audioRef.current.pause();
      setPlayingQuoteId(null);
      return;
    }

    setLoadingQuoteId(quote.quoteId);

    try {
      let signedUrl = signedAudioUrls[quote.quoteId];
      if (!signedUrl) {
        const { data, error } = await supabase.storage
          .from("interview-audio")
          .createSignedUrl(quote.audioUrl, 300);

        if (error || !data?.signedUrl) {
          throw new Error(error?.message || "Signed audio URL could not be created");
        }

        signedUrl = data.signedUrl;
        setSignedAudioUrls((previous) => ({
          ...previous,
          [quote.quoteId]: signedUrl,
        }));
      }

      if (audioRef.current.src !== signedUrl) {
        audioRef.current.src = signedUrl;
      }

      const segment = findQuoteAudioSegment(quote);
      await waitForAudioMetadata(audioRef.current);
      if (segment) {
        audioRef.current.currentTime = Math.max(0, segment.startMs / 1000);
        quotePlaybackStopAtRef.current = Math.max(segment.startMs + 800, segment.endMs) / 1000;
      } else {
        audioRef.current.currentTime = 0;
        quotePlaybackStopAtRef.current = null;
      }

      setActiveQuoteId(quote.quoteId);
      await audioRef.current.play();
      setPlayingQuoteId(quote.quoteId);
    } catch (error) {
      console.error("Failed to play pitch-shifted quote audio:", error);
      toast.error("Ses kanıtı oynatılamadı. Lütfen tekrar deneyin.");
    } finally {
      setLoadingQuoteId(null);
    }
  };

  if (quotes.length === 0) return null;

  return (
    <div className="space-y-3">
      {title ? <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-muted">{title}</p> : null}
      <audio ref={audioRef} className="hidden" preload="none" />
      {quotes.map((quote) => (
        <div
          key={quote.quoteId}
          className={cn(
            "rounded-2xl border border-border-light bg-muted/30 p-4 transition-colors",
            activeQuoteId === quote.quoteId && "border-brand-primary/40 bg-brand-primary/5"
          )}
        >
          <div className="flex items-start gap-3">
            <Quote className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary" />
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-sm leading-6 text-text-primary">“{quote.text}”</p>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-text-secondary">
                <Badge variant="secondary" className="text-[11px]">
                  {quote.participantLabel}
                </Badge>
                <span>{quote.section}</span>
                <span>•</span>
                <span>{quote.questionText}</span>
                {quote.audioUrl ? (
                  <>
                    <span>•</span>
                    <span className="inline-flex items-center gap-1 text-brand-primary">
                      <Volume2 className="h-3 w-3" />
                      Pitch-shifted ses kanıtı
                      {quote.audioPrivacyTransform?.semitoneShift
                        ? ` (+${quote.audioPrivacyTransform.semitoneShift} semiton)`
                        : null}
                    </span>
                  </>
                ) : null}
              </div>
            </div>
            {quote.audioUrl ? (
              <Button
                type="button"
                variant={playingQuoteId === quote.quoteId ? "default" : "outline"}
                size="sm"
                onClick={() => void handleQuoteAudioToggle(quote)}
                disabled={loadingQuoteId === quote.quoteId}
                className="shrink-0 gap-1.5"
                aria-label={playingQuoteId === quote.quoteId ? "Ses kanıtını duraklat" : "Ses kanıtını oynat"}
              >
                {loadingQuoteId === quote.quoteId ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : playingQuoteId === quote.quoteId ? (
                  <Pause className="h-3.5 w-3.5" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                {playingQuoteId === quote.quoteId ? "Pause" : "Play"}
              </Button>
            ) : null}
            {synthetic && onOpenSyntheticChat ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenSyntheticChat(quote.syntheticPersonaId ?? null)}
                className="shrink-0 gap-1.5"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Konuş
              </Button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
};

const syntheticChartConfig = {
  value: {
    label: "Yanıt",
    color: "hsl(var(--primary))",
  },
} satisfies ChartConfig;

const SyntheticInferentialSectionCard = ({
  section,
  quotes,
  onOpenSyntheticChat,
}: {
  section: ProjectReportInferentialSection;
  quotes: ProjectReportQuote[];
  onOpenSyntheticChat?: (personaId?: string | null) => void;
}) => (
  <Card className="border-border-light">
    <CardHeader>
      <div className="flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-brand-primary" />
        <CardTitle className="text-base">{section.title}</CardTitle>
      </div>
      <CardDescription className="text-sm leading-6 text-text-secondary">
        {section.summary}
      </CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      {Array.isArray(section.chartData) && section.chartData.length > 0 ? (
        <div className="rounded-md border border-border-light bg-muted/20 p-3">
          {section.chartTitle ? (
            <p className="mb-3 text-sm font-medium text-text-primary">{section.chartTitle}</p>
          ) : null}
          <ChartContainer config={syntheticChartConfig} className="h-[220px] w-full">
            <BarChart data={section.chartData} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="value" fill="var(--color-value)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </div>
      ) : null}
      <EvidenceQuotes synthetic quotes={quotes} onOpenSyntheticChat={onOpenSyntheticChat} />
    </CardContent>
  </Card>
);

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
  synthetic,
  onOpenSyntheticChat,
}: {
  finding: ProjectReportFinding;
  quotes: ProjectReportQuote[];
  synthetic?: boolean;
  onOpenSyntheticChat?: (personaId?: string | null) => void;
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
      <EvidenceQuotes synthetic={synthetic} quotes={quotes} onOpenSyntheticChat={onOpenSyntheticChat} />
    </CardContent>
  </Card>
);

const ThemeCard = ({
  theme,
  quotes,
  synthetic,
  onOpenSyntheticChat,
}: {
  theme: ProjectReportTheme;
  quotes: ProjectReportQuote[];
  synthetic?: boolean;
  onOpenSyntheticChat?: (personaId?: string | null) => void;
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
      <EvidenceQuotes synthetic={synthetic} quotes={quotes} onOpenSyntheticChat={onOpenSyntheticChat} />
    </CardContent>
  </Card>
);

const RecommendationCard = ({
  report,
  recommendation,
  quotes,
  synthetic,
  onOpenSyntheticChat,
}: {
  report: ProjectInterviewReport;
  recommendation: ProjectReportRecommendation;
  quotes: ProjectReportQuote[];
  synthetic?: boolean;
  onOpenSyntheticChat?: (personaId?: string | null) => void;
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
        <EvidenceQuotes synthetic={synthetic} quotes={quotes} onOpenSyntheticChat={onOpenSyntheticChat} />
      </CardContent>
    </Card>
  );
};

const getNavigationSections = (report: ProjectInterviewReport | null) => {
  if (report?.interviewMode === "synthetic") {
    return [
      { id: "overview", label: "Genel Bakış" },
      { id: "inferential", label: "Çıkarımsal Paneller" },
      { id: "findings", label: "Önemli Bulgular" },
      { id: "themes", label: "Temalar" },
      { id: "recommendations", label: "Öneriler" },
      { id: "questions", label: "Soru Dağılımı" },
      { id: "participants", label: "Personalar" },
    ];
  }

  if (report?.interviewMode === "ai_enhanced") {
    return [
      { id: "overview", label: "Genel Bakış" },
      { id: "findings", label: "Önemli Bulgular" },
      { id: "themes", label: "Temalar" },
      { id: "recommendations", label: "Öneriler" },
      { id: "anchors", label: "Anchor Kapsamı" },
      { id: "followups", label: "Follow-up Akışları" },
      { id: "journeys", label: "Katılımcı Akışları" },
      { id: "turns", label: "Soru-Cevap Dökümü" },
    ];
  }

  return [
    { id: "overview", label: "Genel Bakış" },
    { id: "findings", label: "Önemli Bulgular" },
    { id: "themes", label: "Temalar" },
    { id: "recommendations", label: "Öneriler" },
    { id: "questions", label: "Soru Dağılımı" },
    { id: "participants", label: "Katılımcılar" },
  ];
};

const AnchorCoverageCard = ({
  anchor,
  quotes,
}: {
  anchor: ProjectReportAnchorCoverage;
  quotes: ProjectReportQuote[];
}) => (
  <Card className="border-border-light bg-muted/20">
    <CardContent className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-muted">
            {anchor.themeTitle}
          </p>
          <h4 className="mt-2 text-base font-semibold text-text-primary">{anchor.anchorLabel}</h4>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{anchor.answeredSessionCount} cevaplanan</Badge>
          <Badge variant="outline">{anchor.skippedSessionCount} skip</Badge>
          <Badge variant="outline">{formatPercent(anchor.coverageRate)} kapsama</Badge>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricBar
          label="Cevaplanan oturum"
          value={anchor.answeredSessionCount}
          maxValue={Math.max(anchor.answeredSessionCount + anchor.skippedSessionCount, 1)}
          helper="Bu anchor'a gerçek cevap gelen oturumlar"
        />
        <MetricBar
          label="Skip"
          value={anchor.skippedSessionCount}
          maxValue={Math.max(anchor.answeredSessionCount + anchor.skippedSessionCount, 1)}
          helper="Anchor soruda skip oluşan oturumlar"
        />
        <MetricBar
          label="Süre"
          value={anchor.averageResponseDurationMs ? Math.round(anchor.averageResponseDurationMs / 1000) : 0}
          maxValue={Math.max(Math.round((anchor.averageResponseDurationMs || 0) / 1000), 1)}
          helper={`Ortalama ${formatDuration(anchor.averageResponseDurationMs)}`}
        />
      </div>

      {anchor.summary ? (
        <p className="text-sm leading-6 text-text-secondary">{anchor.summary}</p>
      ) : null}

      <EvidenceQuotes quotes={quotes} />
    </CardContent>
  </Card>
);

const FollowUpPathCard = ({
  path,
  quotes,
}: {
  path: ProjectReportFollowUpPath;
  quotes: ProjectReportQuote[];
}) => (
  <Card className="border-border-light">
    <CardHeader className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{path.count} kez soruldu</Badge>
        <Badge variant="outline">{path.sessionCount} oturum</Badge>
      </div>
      <CardTitle className="text-base">{path.questionText}</CardTitle>
      <CardDescription className="text-sm leading-6 text-text-secondary">
        Anchor: {path.anchorLabel}
      </CardDescription>
    </CardHeader>
    <CardContent>
      <EvidenceQuotes quotes={quotes} />
    </CardContent>
  </Card>
);

const ParticipantJourneyCard = ({
  journey,
  quotes,
}: {
  journey: ProjectReportParticipantJourney;
  quotes: ProjectReportQuote[];
}) => (
  <Card className="border-border-light bg-muted/20">
    <CardContent className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-muted">
            {journey.sessionRef}
          </p>
          <h4 className="mt-2 text-base font-semibold text-text-primary">{journey.participantLabel}</h4>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{journey.anchorCoverageCount} anchor</Badge>
          <Badge variant="outline">{journey.followUpCount} follow-up</Badge>
          {journey.screenRecordingUrl ? <Badge variant="outline">Ekran kaydı var</Badge> : null}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <ReportMetricCard
          title="Anchor Kapsamı"
          value={String(journey.anchorCoverageCount)}
          description="Bu oturumda kapsanan anchor soru sayısı."
        />
        <ReportMetricCard
          title="Follow-up"
          value={String(journey.followUpCount)}
          description="AI tarafından açılan takip soruları."
        />
        <ReportMetricCard
          title="Oturum Süresi"
          value={formatDuration(journey.sessionDurationMs)}
          description="Başlangıç ve bitiş zamanından hesaplandı."
        />
      </div>

      {journey.summary ? (
        <p className="text-sm leading-6 text-text-secondary">{journey.summary}</p>
      ) : null}

      <ScreenRecordingPlayer
        recordingUrl={journey.screenRecordingUrl}
        mimeType={journey.screenRecordingMimeType}
        durationMs={journey.screenRecordingDurationMs}
      />

      <EvidenceQuotes quotes={quotes} />
    </CardContent>
  </Card>
);

const TurnCard = ({ turn }: { turn: ProjectReportTurn }) => (
  <Card className="border-border-light bg-muted/20">
    <CardContent className="space-y-3 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{turn.source === "anchor" ? "Anchor" : turn.source === "follow_up" ? "Follow-up" : turn.source}</Badge>
        {turn.anchorLabel ? <Badge variant="outline">{truncateTurn(turn.anchorLabel, 48)}</Badge> : null}
        {turn.turnIndex ? <Badge variant="outline">Tur {turn.turnIndex}</Badge> : null}
        <Badge variant="outline">{turn.sessionRef}</Badge>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-muted">{turn.participantLabel}</p>
        <p className="mt-2 text-sm font-medium leading-6 text-text-primary">{turn.questionText}</p>
      </div>
      <p className="text-sm leading-6 text-text-secondary">
        {turn.responseText || "Bu turda kaydedilmiş metin yok."}
      </p>
    </CardContent>
  </Card>
);

const truncateTurn = (value: string, maxLength = 120) =>
  value.length > maxLength ? `${value.slice(0, maxLength - 1).trim()}…` : value;

const AnalysisPanel = ({ projectId, sessionIds, synthetic = false, syntheticSampleSize, onOpenSyntheticChat }: AnalysisPanelProps) => {
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
  const navigationSections = useMemo(() => getNavigationSections(report), [report]);

  const hasSessions = synthetic ? Boolean(report?.syntheticMeta?.responseCount) : sessionIds.length > 0;
  const hasRenderableReport = Boolean(
    report && (
      report.generatedAt ||
      report.findings.length > 0 ||
      report.themes.length > 0 ||
      report.recommendations.length > 0 ||
      report.questionBreakdown.length > 0 ||
      report.participantBreakdown.length > 0 ||
      report.anchorCoverage.length > 0 ||
      report.followUpPaths.length > 0 ||
      report.participantJourneys.length > 0 ||
      report.turnCatalog.length > 0
    ),
  );

  const loadSavedReport = useCallback(async (silent = false) => {
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
      const snapshot = await projectReportService.getProjectReport(projectId, { synthetic });
      setProjectTitle(snapshot.projectTitle);
      setProjectDescription(snapshot.projectDescription);
      setReport(snapshot.report);
    } catch (error) {
      console.error("Failed to load project report:", error);
      setLoadError(error instanceof Error ? error.message : "Rapor yüklenemedi.");
    } finally {
      setIsLoading(false);
    }
  }, [projectId, synthetic]);

  useEffect(() => {
    void loadSavedReport();
  }, [loadSavedReport]);

  useEffect(() => {
    if (report?.status !== "generating") return;

    const intervalId = window.setInterval(() => {
      void loadSavedReport(true);
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [loadSavedReport, report?.status]);

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
  }, [navigationSections, report]);

  useEffect(() => {
    if (navigationSections.length > 0) {
      setActiveSection(navigationSections[0].id);
    }
  }, [navigationSections]);

  const regenerateReport = async () => {
    if (!projectId) return;

    setIsGenerating(true);
    try {
      const nextReport = synthetic
        ? (await syntheticUserService.runResearch(projectId, { sampleSize: syntheticSampleSize })).report
        : await projectReportService.generateProjectReport(projectId, { force: true });
      setReport(nextReport);
      toast.success(synthetic ? "Sentetik analiz yeniden üretildi." : "Analiz raporu güncellendi.");
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
              <Badge variant={report.interviewMode === "ai_enhanced" ? "default" : "outline"}>
                {report.interviewMode === "synthetic"
                  ? "Sentetik / Çıkarımsal"
                  : report.interviewMode === "ai_enhanced"
                    ? "AI Enhanced"
                    : "Yapılandırılmış"}
              </Badge>
              <Badge variant="outline">
                {report.sourceStats.completedSessionCount} tamamlanan oturum
              </Badge>
              <Badge variant="outline">
                {report.sourceStats.responsesAnalyzed} analiz edilen yanıt
              </Badge>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-text-primary">
                {report.interviewMode === "synthetic" ? "Sentetik Analiz Raporu" : "Analiz Raporu"}
              </h1>
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

        {report.interviewMode === "synthetic" ? (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="flex items-start gap-3 p-4 text-amber-900">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="space-y-1">
                <p className="text-sm font-medium">Bu çıktı gerçek katılımcı kanıtı değildir.</p>
                <p className="text-sm">
                  {report.syntheticMeta?.disclaimer ||
                    "Sentetik kullanıcı sonuçları karar öncesi çıkarımsal simülasyon olarak değerlendirilmelidir."}
                </p>
              </div>
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
                    title={report.interviewMode === "synthetic" ? "Persona" : "Katılım"}
                    value={`${report.overview.completedParticipantCount}/${report.overview.invitedParticipantCount}`}
                    description={report.interviewMode === "synthetic"
                      ? `${report.syntheticMeta?.sampleSize || report.syntheticMeta?.personaCount || report.overview.invitedParticipantCount} kişilik sentetik örneklem seçildi.`
                      : `Katılım oranı ${formatPercent(report.overview.joinRate)} • Tamamlama oranı ${formatPercent(report.overview.completionRate)}`}
                  />
                  <ReportMetricCard
                    title={report.interviewMode === "ai_enhanced" ? "Anchor Sayısı" : "Skip Oranı"}
                    value={report.interviewMode === "ai_enhanced" ? String(report.anchorCoverage.length) : formatPercent(report.overview.skipRate)}
                    description={report.interviewMode === "ai_enhanced"
                      ? `${report.followUpPaths.length} farklı follow-up yolu oluştu.`
                      : `${report.sourceStats.skippedResponseCount} yanıt skip olarak işaretlendi.`}
                  />
                  <ReportMetricCard
                    title={report.interviewMode === "ai_enhanced" ? "Konuşma Turu" : "Ort. Yanıt Süresi"}
                    value={report.interviewMode === "ai_enhanced"
                      ? String(report.turnCatalog.length)
                      : formatDuration(report.overview.averageResponseDurationMs)}
                    description={report.interviewMode === "ai_enhanced"
                      ? `${report.turnCatalog.filter((turn) => turn.source === "follow_up").length} follow-up turu kaydedildi.`
                      : "Tamamlanmış ve transcript oluşmuş cevapların ortalaması."}
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
                        {report.interviewMode === "ai_enhanced"
                          ? `${report.anchorCoverage.length} anchor omurga ve ${report.turnCatalog.length} gerçek konuşma turu üzerinden çalışıldı.`
                          : report.interviewMode === "synthetic"
                            ? `${report.syntheticMeta?.personaCount || report.sourceStats.completedSessionCount} sentetik persona ve ${report.syntheticMeta?.questionCount || report.sourceStats.questionTemplateCount} plan sorusu üzerinden simülasyon çalıştırıldı.`
                          : `${report.sourceStats.questionTemplateCount} benzersiz soru şablonu ve ${report.sourceStats.questionInstanceCount} soru örneği üzerinden çalışıldı.`}
                      </p>
                      <p>
                        {report.interviewMode === "synthetic"
                          ? "Her bulgu yalnızca sentetik persona cevaplarından üretildi; gerçek kullanıcı davranışı veya kanıtı olarak yorumlanmamalıdır."
                          : "Her bulgu yalnızca kaydedilmiş transcriptlerden ve tamamlanma/skip/süre verilerinden üretildi."}
                      </p>
                      <p>
                        Analiz üretim kaynağı: <span className="font-medium text-text-primary">{report.generatedFrom}</span>
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>

            {report.interviewMode === "synthetic" ? (
              <Card id="inferential" className="border-border-light">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-brand-primary" />
                    <CardTitle>Çıkarımsal Paneller</CardTitle>
                  </div>
                  <CardDescription>
                    Sentetik persona cevaplarından üretilen soru bazlı dağılımlar ve bağlamsal yorumlar.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!report.inferentialSections?.length ? (
                    <p className="text-sm text-text-secondary">Henüz çıkarımsal panel oluşturulmadı.</p>
                  ) : (
                    report.inferentialSections.map((section) => (
                      <SyntheticInferentialSectionCard
                        key={section.id}
                        section={section}
                        quotes={takeQuotes(quoteMap, section.quoteIds)}
                        onOpenSyntheticChat={onOpenSyntheticChat}
                      />
                    ))
                  )}
                </CardContent>
              </Card>
            ) : null}

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
                      synthetic={report.interviewMode === "synthetic"}
                      onOpenSyntheticChat={onOpenSyntheticChat}
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
                    <ThemeCard
                      key={theme.id}
                      theme={theme}
                      quotes={takeQuotes(quoteMap, theme.quoteIds)}
                      synthetic={report.interviewMode === "synthetic"}
                      onOpenSyntheticChat={onOpenSyntheticChat}
                    />
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
                      synthetic={report.interviewMode === "synthetic"}
                      onOpenSyntheticChat={onOpenSyntheticChat}
                    />
                  ))
                )}
              </CardContent>
            </Card>

            {report.interviewMode === "ai_enhanced" ? (
              <>
                <Card id="anchors" className="border-border-light">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-brand-primary" />
                      <CardTitle>Anchor Kapsamı</CardTitle>
                    </div>
                    <CardDescription>
                      Her katılımcıya ortak omurga olarak sorulan anchor soruların kapsama ve süre görünümü.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {report.anchorCoverage.length === 0 ? (
                      <p className="text-sm text-text-secondary">Henüz anchor bazında gösterilecek tamamlanmış cevap yok.</p>
                    ) : (
                      report.anchorCoverage.map((anchor) => (
                        <AnchorCoverageCard
                          key={anchor.anchorId}
                          anchor={anchor}
                          quotes={takeQuotes(quoteMap, anchor.quoteIds)}
                        />
                      ))
                    )}
                  </CardContent>
                </Card>

                <Card id="followups" className="border-border-light">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-brand-primary" />
                      <CardTitle>Follow-up Akışları</CardTitle>
                    </div>
                    <CardDescription>
                      AI'ın katılımcı cevabına göre açtığı takip soruları ve en sık tekrar eden yollar.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {report.followUpPaths.length === 0 ? (
                      <p className="text-sm text-text-secondary">Henüz follow-up üretecek kadar konuşma akışı oluşmadı.</p>
                    ) : (
                      report.followUpPaths.map((path) => (
                        <FollowUpPathCard
                          key={path.id}
                          path={path}
                          quotes={takeQuotes(quoteMap, path.quoteIds)}
                        />
                      ))
                    )}
                  </CardContent>
                </Card>

                <Card id="journeys" className="border-border-light">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-brand-primary" />
                      <CardTitle>Katılımcı Akışları</CardTitle>
                    </div>
                    <CardDescription>
                      Her katılımcının anchor kapsaması, follow-up yoğunluğu ve oturum özeti.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {report.participantJourneys.length === 0 ? (
                      <p className="text-sm text-text-secondary">Henüz katılımcı yolculuğu görünümü oluşmadı.</p>
                    ) : (
                      report.participantJourneys.map((journey) => (
                        <ParticipantJourneyCard
                          key={journey.sessionId}
                          journey={journey}
                          quotes={takeQuotes(quoteMap, journey.quoteIds)}
                        />
                      ))
                    )}
                  </CardContent>
                </Card>

                <Card id="turns" className="border-border-light">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-brand-primary" />
                      <CardTitle>Soru-Cevap Dökümü</CardTitle>
                    </div>
                    <CardDescription>
                      Görüşmeler sırasında gerçekten sorulan tüm anchor ve follow-up turları.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {report.turnCatalog.length === 0 ? (
                      <p className="text-sm text-text-secondary">Henüz gösterilecek konuşma dökümü yok.</p>
                    ) : (
                      report.turnCatalog.map((turn) => (
                        <TurnCard key={`${turn.sessionId}-${turn.questionId}`} turn={turn} />
                      ))
                    )}
                  </CardContent>
                </Card>
              </>
            ) : (
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

                        <EvidenceQuotes
                          synthetic={report.interviewMode === "synthetic"}
                          quotes={takeQuotes(quoteMap, question.quoteIds)}
                          onOpenSyntheticChat={onOpenSyntheticChat}
                        />
                      </CardContent>
                    </Card>
                  ))
                )}
              </CardContent>
            </Card>
            )}

            {report.interviewMode === "structured" || report.interviewMode === "synthetic" ? (
            <Card id="participants" className="border-border-light">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-brand-primary" />
                  <CardTitle>{report.interviewMode === "synthetic" ? "Personalar" : "Katılımcılar"}</CardTitle>
                </div>
              <CardDescription>
                  {report.interviewMode === "synthetic"
                    ? "Sentetik persona bazında kapsama, özet ve alıntılar."
                    : "Oturum bazında kapsama, süre, skip ve özet kanıtlar."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {report.participantBreakdown.length === 0 ? (
                  <p className="text-sm text-text-secondary">
                    {report.interviewMode === "synthetic"
                      ? "Henüz persona bazında gösterilecek sentetik cevap yok."
                      : "Henüz katılımcı bazında gösterilecek tamamlanmış oturum yok."}
                  </p>
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
                            {participant.hasAudioEvidence ? <Badge variant="outline">Ses kanıtı var</Badge> : null}
                            {participant.screenRecordingUrl ? <Badge variant="outline">Ekran kaydı var</Badge> : null}
                          </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-3">
                          <ReportMetricCard
                            title={report.interviewMode === "synthetic" ? "Persona Cevabı" : "Oturum Süresi"}
                            value={report.interviewMode === "synthetic" ? String(participant.responseCount) : formatDuration(participant.sessionDurationMs)}
                            description={report.interviewMode === "synthetic" ? "Bu personadan alınan sentetik yanıt sayısı." : "started_at ve ended_at üzerinden hesaplandı."}
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

                        <ScreenRecordingPlayer
                          recordingUrl={participant.screenRecordingUrl}
                          mimeType={participant.screenRecordingMimeType}
                          durationMs={participant.screenRecordingDurationMs}
                        />

                        <EvidenceQuotes
                          synthetic={report.interviewMode === "synthetic"}
                          quotes={takeQuotes(quoteMap, participant.quoteIds)}
                          onOpenSyntheticChat={onOpenSyntheticChat}
                        />
                      </CardContent>
                    </Card>
                  ))
                )}
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
