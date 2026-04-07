import pptxgen from "pptxgenjs";
import type {
  ProjectInterviewReport,
  ProjectReportFinding,
  ProjectReportParticipantBreakdown,
  ProjectReportQuestionBreakdown,
  ProjectReportQuote,
  ProjectReportRecommendation,
  ProjectReportTheme,
} from "@/types/projectReport";

const COLORS = {
  primary: "0F766E",
  secondary: "115E59",
  accent: "14B8A6",
  dark: "0F172A",
  text: "334155",
  muted: "64748B",
  light: "F1F5F9",
  white: "FFFFFF",
  border: "CBD5E1",
  high: "DC2626",
  medium: "D97706",
  low: "059669",
};

const formatPercent = (value: number) => `${Math.round(value)}%`;

const formatDuration = (valueMs: number | null) => {
  if (!valueMs || valueMs <= 0) return "Yok";

  const totalSeconds = Math.round(valueMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) return `${seconds} sn`;
  return `${minutes} dk ${seconds.toString().padStart(2, "0")} sn`;
};

const sanitizeFileName = (value: string) =>
  value.replace(/[^a-zA-Z0-9ğüşıöçĞÜŞİÖÇ\s-]/g, "").replace(/\s+/g, "-");

const truncate = (value: string, maxLength = 180) =>
  value.length > maxLength ? `${value.slice(0, maxLength - 1).trim()}…` : value;

const addSlideTitle = (slide: pptxgen.Slide, title: string, subtitle?: string) => {
  slide.addText(title, {
    x: 0.5,
    y: 0.4,
    w: 12.3,
    h: 0.5,
    fontSize: 28,
    bold: true,
    color: COLORS.dark,
  });

  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.5,
      y: 0.95,
      w: 12.3,
      h: 0.35,
      fontSize: 11,
      color: COLORS.muted,
    });
  }
};

const addMetricCard = (
  slide: pptxgen.Slide,
  input: { x: number; title: string; value: string; helper: string },
) => {
  slide.addShape("roundRect" as any, {
    x: input.x,
    y: 1.45,
    w: 2.95,
    h: 1.45,
    rectRadius: 0.08,
    fill: { color: COLORS.light },
    line: { color: COLORS.border, width: 1 },
  });

  slide.addText(input.value, {
    x: input.x + 0.2,
    y: 1.7,
    w: 2.55,
    h: 0.4,
    fontSize: 22,
    bold: true,
    color: COLORS.primary,
  });

  slide.addText(input.title, {
    x: input.x + 0.2,
    y: 2.1,
    w: 2.55,
    h: 0.24,
    fontSize: 11,
    bold: true,
    color: COLORS.dark,
  });

  slide.addText(input.helper, {
    x: input.x + 0.2,
    y: 2.36,
    w: 2.55,
    h: 0.3,
    fontSize: 9,
    color: COLORS.muted,
  });
};

const addEvidenceBlock = (
  slide: pptxgen.Slide,
  input: { x: number; y: number; w: number; title: string; body: string; quote?: string; footer?: string },
) => {
  slide.addShape("roundRect" as any, {
    x: input.x,
    y: input.y,
    w: input.w,
    h: input.quote ? 2.2 : 1.55,
    rectRadius: 0.08,
    fill: { color: COLORS.white },
    line: { color: COLORS.border, width: 1 },
  });

  slide.addText(input.title, {
    x: input.x + 0.18,
    y: input.y + 0.14,
    w: input.w - 0.36,
    h: 0.26,
    fontSize: 13,
    bold: true,
    color: COLORS.dark,
  });

  slide.addText(input.body, {
    x: input.x + 0.18,
    y: input.y + 0.44,
    w: input.w - 0.36,
    h: input.quote ? 0.72 : 0.8,
    fontSize: 10,
    color: COLORS.text,
    breakLine: false,
    valign: "top",
  });

  if (input.quote) {
    slide.addShape("roundRect" as any, {
      x: input.x + 0.18,
      y: input.y + 1.24,
      w: input.w - 0.36,
      h: 0.62,
      rectRadius: 0.04,
      fill: { color: COLORS.light },
      line: { color: COLORS.border, width: 0.5 },
    });

    slide.addText(`"${truncate(input.quote, 130)}"`, {
      x: input.x + 0.28,
      y: input.y + 1.36,
      w: input.w - 0.56,
      h: 0.3,
      fontSize: 9,
      italic: true,
      color: COLORS.secondary,
    });
  }

  if (input.footer) {
    slide.addText(input.footer, {
      x: input.x + 0.18,
      y: input.y + (input.quote ? 1.92 : 1.18),
      w: input.w - 0.36,
      h: 0.18,
      fontSize: 8,
      color: COLORS.muted,
    });
  }
};

const addPriorityBadge = (slide: pptxgen.Slide, x: number, y: number, priority: ProjectReportRecommendation["priority"]) => {
  const color = priority === "high" ? COLORS.high : priority === "medium" ? COLORS.medium : COLORS.low;
  const label = priority === "high" ? "Yüksek" : priority === "medium" ? "Orta" : "Düşük";

  slide.addShape("roundRect" as any, {
    x,
    y,
    w: 1.0,
    h: 0.28,
    rectRadius: 0.04,
    fill: { color },
    line: { type: "none" },
  });

  slide.addText(label, {
    x,
    y: y + 0.02,
    w: 1.0,
    h: 0.2,
    fontSize: 9,
    bold: true,
    align: "center",
    color: COLORS.white,
  });
};

const quoteById = (report: ProjectInterviewReport, quoteIds: string[]) => {
  const quoteMap = new Map<string, ProjectReportQuote>(
    report.quoteCatalog.map((quote) => [quote.quoteId, quote]),
  );

  return quoteIds
    .map((quoteId) => quoteMap.get(quoteId))
    .filter((quote): quote is ProjectReportQuote => Boolean(quote));
};

const firstQuoteText = (report: ProjectInterviewReport, quoteIds: string[]) =>
  quoteById(report, quoteIds)[0]?.text;

const addOverviewSlide = (pptx: pptxgen, report: ProjectInterviewReport, projectTitle: string) => {
  const slide = pptx.addSlide();
  slide.background = { color: COLORS.white };

  addSlideTitle(slide, "Yönetici Özeti", projectTitle);

  addMetricCard(slide, {
    x: 0.6,
    title: "Tamamlanan Görüşme",
    value: String(report.sourceStats.completedSessionCount),
    helper: `${report.sourceStats.totalSessionCount} toplam oturum`,
  });
  addMetricCard(slide, {
    x: 3.75,
    title: "Tamamlama Oranı",
    value: formatPercent(report.overview.completionRate),
    helper: `${report.overview.completedParticipantCount}/${report.overview.invitedParticipantCount} katılımcı`,
  });
  addMetricCard(slide, {
    x: 6.9,
    title: "Skip Oranı",
    value: formatPercent(report.overview.skipRate),
    helper: `${report.sourceStats.skippedResponseCount} skip yanıt`,
  });
  addMetricCard(slide, {
    x: 10.05,
    title: "Ort. Oturum Süresi",
    value: formatDuration(report.overview.averageSessionDurationMs),
    helper: "Tamamlanan oturumlardan hesaplandı",
  });

  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.6,
    y: 3.25,
    w: 12,
    h: 1.55,
    rectRadius: 0.08,
    fill: { color: COLORS.light },
    line: { color: COLORS.border, width: 1 },
  });

  slide.addText(report.executiveSummary, {
    x: 0.85,
    y: 3.55,
    w: 11.5,
    h: 0.8,
    fontSize: 16,
    color: COLORS.text,
    valign: "middle",
  });

  slide.addText(
    `Kaynak: transcript-only • ${report.sourceStats.responsesAnalyzed} yanıt • ${report.sourceStats.quoteCount} alıntı kanıt • ${report.generatedAt ? new Date(report.generatedAt).toLocaleString("tr-TR") : "Henüz yok"}`,
    {
      x: 0.8,
      y: 4.95,
      w: 11.6,
      h: 0.25,
      fontSize: 9,
      color: COLORS.muted,
    },
  );
};

const addFindingsSlides = (pptx: pptxgen, report: ProjectInterviewReport) => {
  const findings = report.findings.slice(0, 6);
  if (findings.length === 0) return;

  for (let index = 0; index < findings.length; index += 3) {
    const slide = pptx.addSlide();
    slide.background = { color: COLORS.white };

    addSlideTitle(slide, "Önemli Bulgular", "Her bulgu doğrudan kaydedilmiş alıntılarla desteklenir.");

    findings.slice(index, index + 3).forEach((finding, offset) => {
      const quotes = quoteById(report, finding.quoteIds);
      const footerParts = [
        `${finding.evidenceCount} kanıt`,
        finding.questionRefs.length > 0 ? `${finding.questionRefs.length} soru` : null,
        finding.sessionRefs.length > 0 ? `${finding.sessionRefs.length} oturum` : null,
      ].filter(Boolean);

      addEvidenceBlock(slide, {
        x: 0.6,
        y: 1.45 + offset * 2.1,
        w: 12,
        title: finding.title,
        body: truncate(finding.summary, 240),
        quote: quotes[0]?.text,
        footer: footerParts.join(" • "),
      });
    });
  }
};

const addThemesSlide = (pptx: pptxgen, report: ProjectInterviewReport) => {
  const themes = report.themes.slice(0, 4);
  if (themes.length === 0) return;

  const slide = pptx.addSlide();
  slide.background = { color: COLORS.white };

  addSlideTitle(slide, "Temalar", "Tekrarlanan örüntüler ve bunları destekleyen örnek alıntılar.");

  themes.forEach((theme, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);

    addEvidenceBlock(slide, {
      x: 0.6 + column * 6.05,
      y: 1.45 + row * 2.3,
      w: 5.75,
      title: theme.title,
      body: truncate(theme.description, 160),
      quote: firstQuoteText(report, theme.quoteIds),
      footer: `${theme.evidenceCount} alıntı • ${theme.questionRefs.length} soru referansı`,
    });
  });
};

const addRecommendationsSlides = (pptx: pptxgen, report: ProjectInterviewReport) => {
  const recommendations = report.recommendations.slice(0, 6);
  if (recommendations.length === 0) return;

  for (let index = 0; index < recommendations.length; index += 3) {
    const slide = pptx.addSlide();
    slide.background = { color: COLORS.white };

    addSlideTitle(slide, "Öneriler", "Önceliklendirilmiş ürün aksiyonları ve dayandıkları kanıtlar.");

    recommendations.slice(index, index + 3).forEach((recommendation, offset) => {
      const y = 1.45 + offset * 2.1;
      addEvidenceBlock(slide, {
        x: 0.6,
        y,
        w: 12,
        title: recommendation.title,
        body: truncate(recommendation.description, 230),
        quote: firstQuoteText(report, recommendation.quoteIds),
        footer: `${recommendation.linkedFindingIds.length} ilişkili bulgu`,
      });
      addPriorityBadge(slide, 10.95, y + 0.14, recommendation.priority);
    });
  }
};

const addQuestionCoverageSlide = (pptx: pptxgen, report: ProjectInterviewReport) => {
  const questions = report.questionBreakdown.slice(0, 6);
  if (questions.length === 0) return;

  const slide = pptx.addSlide();
  slide.background = { color: COLORS.white };

  addSlideTitle(slide, "Soru Bazlı Kapsam", "Hangi sorular yanıt aldı, hangilerinde skip veya düşük kapsama oluştu.");

  questions.forEach((question, index) => {
    const y = 1.35 + index * 0.88;

    slide.addShape(pptx.ShapeType.roundRect, {
      x: 0.6,
      y,
      w: 12,
      h: 0.72,
      rectRadius: 0.04,
      fill: { color: index % 2 === 0 ? COLORS.light : COLORS.white },
      line: { color: COLORS.border, width: 0.5 },
    });

    slide.addText(`${question.section} • ${truncate(question.questionText, 78)}`, {
      x: 0.8,
      y: y + 0.14,
      w: 6.2,
      h: 0.18,
      fontSize: 10,
      bold: true,
      color: COLORS.dark,
    });

    slide.addText(question.summary || "Özet bulunmuyor", {
      x: 0.8,
      y: y + 0.36,
      w: 6.2,
      h: 0.18,
      fontSize: 8.5,
      color: COLORS.muted,
    });

    slide.addText(`${question.answeredResponseCount} yanıt`, {
      x: 7.35,
      y: y + 0.23,
      w: 1.0,
      h: 0.18,
      fontSize: 9,
      color: COLORS.text,
      align: "center",
    });
    slide.addText(`${question.skippedResponseCount} skip`, {
      x: 8.45,
      y: y + 0.23,
      w: 1.0,
      h: 0.18,
      fontSize: 9,
      color: COLORS.text,
      align: "center",
    });
    slide.addText(formatPercent(question.coverageRate), {
      x: 9.55,
      y: y + 0.23,
      w: 1.0,
      h: 0.18,
      fontSize: 9,
      color: COLORS.text,
      align: "center",
    });
    slide.addText(formatDuration(question.averageResponseDurationMs), {
      x: 10.65,
      y: y + 0.23,
      w: 1.5,
      h: 0.18,
      fontSize: 9,
      color: COLORS.text,
      align: "center",
    });
  });
};

const addParticipantSlide = (pptx: pptxgen, report: ProjectInterviewReport) => {
  const participants = report.participantBreakdown.slice(0, 4);
  if (participants.length === 0) return;

  const slide = pptx.addSlide();
  slide.background = { color: COLORS.white };

  addSlideTitle(slide, "Katılımcı Kırılımı", "Oturum bazında kapsama, süre ve örnek kanıtlar.");

  participants.forEach((participant, index) => {
    const row = Math.floor(index / 2);
    const column = index % 2;

    addEvidenceBlock(slide, {
      x: 0.6 + column * 6.05,
      y: 1.45 + row * 2.3,
      w: 5.75,
      title: participant.participantLabel,
      body: truncate(
        participant.summary ||
          `${participant.answeredResponseCount} yanıt, ${participant.skippedResponseCount} skip, durum: ${participant.status}.`,
        160,
      ),
      quote: firstQuoteText(report, participant.quoteIds),
      footer: `${participant.sessionRef} • ${formatDuration(participant.sessionDurationMs)} • ${participant.hasVideoEvidence ? "Video var" : "Video yok"}`,
    });
  });
};

const addNextStepsSlide = (pptx: pptxgen, report: ProjectInterviewReport) => {
  const slide = pptx.addSlide();
  slide.background = { color: COLORS.white };

  addSlideTitle(slide, "Sonraki Adımlar", "Bu sunum yalnızca doğrulanabilir araştırma kanıtlarını içerir.");

  const nextSteps =
    report.recommendations.slice(0, 5).map((recommendation, index) => `${index + 1}. ${recommendation.title}`) ||
    [];

  const fallbackSteps = [
    "Önce yüksek öncelikli önerileri ürün backlog'una taşıyın.",
    "Bulgu bazında sorumlu ekipleri ve teslim tarihlerini netleştirin.",
    "Düşük kapsamalı sorular için yeni oturumlarda ek kanıt toplayın.",
    "Skip oranı yüksek soruları discussion guide içinde gözden geçirin.",
    "Bir sonraki araştırma iterasyonunda aynı KPI'ları karşılaştırın.",
  ];

  (nextSteps.length > 0 ? nextSteps : fallbackSteps).forEach((step, index) => {
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 0.8,
      y: 1.5 + index * 0.78,
      w: 0.38,
      h: 0.38,
      rectRadius: 0.08,
      fill: { color: COLORS.accent },
      line: { type: "none" },
    });

    slide.addText(String(index + 1), {
      x: 0.8,
      y: 1.58 + index * 0.78,
      w: 0.38,
      h: 0.16,
      fontSize: 9,
      bold: true,
      color: COLORS.white,
      align: "center",
    });

    slide.addText(step, {
      x: 1.35,
      y: 1.53 + index * 0.78,
      w: 11.0,
      h: 0.26,
      fontSize: 14,
      color: COLORS.text,
    });
  });
};

export const generateResearchPresentation = async (
  report: ProjectInterviewReport,
  projectTitle = "Kullanıcı Araştırması",
): Promise<void> => {
  const pptx = new pptxgen();
  pptx.author = "Searcho";
  pptx.company = "Searcho";
  pptx.subject = "Kullanıcı Araştırması Analiz Raporu";
  pptx.title = `${projectTitle} - Araştırma Raporu`;
  pptx.layout = "LAYOUT_WIDE";

  const coverSlide = pptx.addSlide();
  coverSlide.background = { color: COLORS.primary };
  coverSlide.addText(projectTitle, {
    x: 0.7,
    y: 2.0,
    w: 11.2,
    h: 0.9,
    fontSize: 28,
    bold: true,
    color: COLORS.white,
    align: "center",
  });
  coverSlide.addText("Faz 4 • Kanıta Dayalı Araştırma Analizi", {
    x: 0.7,
    y: 3.0,
    w: 11.2,
    h: 0.4,
    fontSize: 16,
    color: COLORS.white,
    align: "center",
  });
  coverSlide.addText(
    report.generatedAt
      ? new Date(report.generatedAt).toLocaleDateString("tr-TR", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : new Date().toLocaleDateString("tr-TR"),
    {
      x: 0.7,
      y: 3.55,
      w: 11.2,
      h: 0.3,
      fontSize: 11,
      color: "D1FAE5",
      align: "center",
    },
  );

  addOverviewSlide(pptx, report, projectTitle);
  addFindingsSlides(pptx, report);
  addThemesSlide(pptx, report);
  addRecommendationsSlides(pptx, report);
  addQuestionCoverageSlide(pptx, report);
  addParticipantSlide(pptx, report);
  addNextStepsSlide(pptx, report);

  const fileName = `${sanitizeFileName(projectTitle)}-Arastirma-Raporu-${new Date().toISOString().slice(0, 10)}.pptx`;
  await pptx.writeFile({ fileName });
};
