import pptxgen from "pptxgenjs";

interface AnalysisData {
  insights?: string[];
  personas?: Array<{
    name: string;
    age: string;
    occupation: string;
    experience?: string;
    goals: string;
    painPoints: string;
    quote: string;
  }>;
  recommendations?: Array<{
    category: string;
    suggestion: string;
    userQuotes: string[];
    priority: "high" | "medium" | "low";
  }>;
  quantitativeData?: {
    professionDistribution?: { profession: string; count: number }[];
    ageDistribution?: { range: string; percentage: number }[];
    studyMetrics?: {
      totalParticipants?: number;
      averageTime?: number;
      completionRate?: number;
    };
  };
  themes?: Array<{ title: string; description: string; category: string }>;
  demographics?: {
    locations?: Array<{ city: string; count: number }>;
    [key: string]: any;
  };
}

const COLORS = {
  primary: "10b981",
  secondary: "14b8a6", 
  accent: "06b6d4",
  dark: "1e293b",
  light: "f1f5f9",
  text: "334155",
  lightText: "64748b",
  high: "ef4444",
  medium: "f59e0b",
  low: "10b981"
};

export const generateResearchPresentation = async (
  analysisData: AnalysisData,
  projectTitle: string = "Kullanıcı Araştırması"
): Promise<void> => {
  const pptx = new pptxgen();
  
  // Set presentation properties
  pptx.author = "SearchoAI Research Platform";
  pptx.title = `${projectTitle} - Araştırma Sonuçları`;
  pptx.subject = "Kullanıcı Araştırması Sonuçları";
  
  // Define layout
  pptx.layout = "LAYOUT_16x9";
  
  // Slide 1: Cover Page
  const coverSlide = pptx.addSlide();
  coverSlide.background = { fill: COLORS.primary };
  
  coverSlide.addText(projectTitle, {
    x: 0.5,
    y: 2.5,
    w: 9,
    h: 1.5,
    fontSize: 54,
    bold: true,
    color: "FFFFFF",
    align: "center"
  });
  
  coverSlide.addText("Kullanıcı Araştırması Sonuçları", {
    x: 0.5,
    y: 4,
    w: 9,
    h: 0.5,
    fontSize: 28,
    color: "FFFFFF",
    align: "center"
  });
  
  const today = new Date().toLocaleDateString("tr-TR", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
  
  coverSlide.addText(today, {
    x: 0.5,
    y: 5,
    w: 9,
    h: 0.3,
    fontSize: 16,
    color: "FFFFFF",
    align: "center"
  });

  // Slide 2: Executive Summary
  const summarySlide = pptx.addSlide();
  summarySlide.background = { fill: "FFFFFF" };
  
  summarySlide.addText("Yönetici Özeti", {
    x: 0.5,
    y: 0.5,
    w: 9,
    h: 0.7,
    fontSize: 36,
    bold: true,
    color: COLORS.dark
  });

  const metrics = analysisData.quantitativeData?.studyMetrics || {};
  const totalParticipants = metrics.totalParticipants || 0;
  const completionRate = metrics.completionRate || 0;
  const averageTime = metrics.averageTime || 0;

  // Metrics cards
  const metricsData = [
    { label: "Katılımcı", value: totalParticipants.toString(), x: 0.8 },
    { label: "Tamamlanma", value: `${Math.round(completionRate)}%`, x: 3.8 },
    { label: "Ort. Süre", value: `${Math.round(averageTime)} dk`, x: 6.8 }
  ];

  metricsData.forEach(metric => {
    summarySlide.addShape(pptx.ShapeType.rect, {
      x: metric.x,
      y: 1.8,
      w: 2.5,
      h: 2,
      fill: { color: COLORS.light },
      line: { color: COLORS.primary, width: 2 }
    });
    
    summarySlide.addText(metric.value, {
      x: metric.x,
      y: 2.2,
      w: 2.5,
      h: 0.7,
      fontSize: 42,
      bold: true,
      color: COLORS.primary,
      align: "center"
    });
    
    summarySlide.addText(metric.label, {
      x: metric.x,
      y: 3,
      w: 2.5,
      h: 0.4,
      fontSize: 16,
      color: COLORS.text,
      align: "center"
    });
  });

  summarySlide.addText("Araştırma başarıyla tamamlanmış ve detaylı içgörüler elde edilmiştir.", {
    x: 0.5,
    y: 4.5,
    w: 9,
    h: 1,
    fontSize: 18,
    color: COLORS.text,
    align: "center"
  });

  // Slide 3-4: Key Insights
  const insights = analysisData.insights || [];
  const insightsPerSlide = 5;
  const insightSlideCount = Math.ceil(insights.length / insightsPerSlide);

  for (let i = 0; i < insightSlideCount; i++) {
    const slide = pptx.addSlide();
    slide.background = { fill: "FFFFFF" };
    
    const title = insightSlideCount > 1 ? `Temel İçgörüler (${i + 1}/${insightSlideCount})` : "Temel İçgörüler";
    slide.addText(title, {
      x: 0.5,
      y: 0.5,
      w: 9,
      h: 0.7,
      fontSize: 36,
      bold: true,
      color: COLORS.dark
    });

    const startIdx = i * insightsPerSlide;
    const endIdx = Math.min(startIdx + insightsPerSlide, insights.length);
    const slideInsights = insights.slice(startIdx, endIdx);

    slideInsights.forEach((insight, idx) => {
      const yPos = 1.6 + (idx * 0.95);
      
      slide.addShape(pptx.ShapeType.rect, {
        x: 0.7,
        y: yPos,
        w: 0.15,
        h: 0.15,
        fill: { color: COLORS.primary }
      });
      
      slide.addText(insight, {
        x: 1,
        y: yPos - 0.05,
        w: 8.5,
        h: 0.8,
        fontSize: 16,
        color: COLORS.text,
        valign: "top"
      });
    });
  }

  // Slide 5+: User Personas
  const personas = analysisData.personas || [];
  personas.forEach((persona, idx) => {
    const slide = pptx.addSlide();
    slide.background = { fill: "FFFFFF" };
    
    slide.addText(`Kullanıcı Profili ${idx + 1}`, {
      x: 0.5,
      y: 0.5,
      w: 9,
      h: 0.7,
      fontSize: 36,
      bold: true,
      color: COLORS.dark
    });

    // Persona card
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.7,
      y: 1.5,
      w: 8.6,
      h: 4,
      fill: { color: COLORS.light },
      line: { color: COLORS.secondary, width: 3 }
    });

    // Name and basic info
    slide.addText(persona.name, {
      x: 1,
      y: 1.8,
      w: 8,
      h: 0.5,
      fontSize: 28,
      bold: true,
      color: COLORS.primary
    });

    slide.addText(`${persona.age} | ${persona.occupation}`, {
      x: 1,
      y: 2.4,
      w: 8,
      h: 0.3,
      fontSize: 16,
      color: COLORS.lightText
    });

    if (persona.experience) {
      slide.addText(`Deneyim: ${persona.experience}`, {
        x: 1,
        y: 2.8,
        w: 8,
        h: 0.3,
        fontSize: 14,
        color: COLORS.lightText,
        italic: true
      });
    }

    // Goals
    slide.addText("Hedefler:", {
      x: 1,
      y: 3.3,
      w: 4,
      h: 0.3,
      fontSize: 14,
      bold: true,
      color: COLORS.text
    });

    slide.addText(persona.goals, {
      x: 1,
      y: 3.6,
      w: 4,
      h: 0.8,
      fontSize: 13,
      color: COLORS.text
    });

    // Pain Points
    slide.addText("Sorun Noktaları:", {
      x: 5.3,
      y: 3.3,
      w: 4,
      h: 0.3,
      fontSize: 14,
      bold: true,
      color: COLORS.text
    });

    slide.addText(persona.painPoints, {
      x: 5.3,
      y: 3.6,
      w: 4,
      h: 0.8,
      fontSize: 13,
      color: COLORS.text
    });

    // Quote
    slide.addShape(pptx.ShapeType.rect, {
      x: 1.5,
      y: 4.7,
      w: 7,
      h: 0.7,
      fill: { color: COLORS.accent },
      line: { type: "none" }
    });

    slide.addText(`"${persona.quote}"`, {
      x: 1.7,
      y: 4.85,
      w: 6.6,
      h: 0.4,
      fontSize: 14,
      color: "FFFFFF",
      italic: true,
      align: "center",
      valign: "middle"
    });
  });

  // Quantitative Data Slides
  if (analysisData.quantitativeData?.professionDistribution) {
    const slide = pptx.addSlide();
    slide.background = { fill: "FFFFFF" };
    
    slide.addText("Meslek Dağılımı", {
      x: 0.5,
      y: 0.5,
      w: 9,
      h: 0.7,
      fontSize: 36,
      bold: true,
      color: COLORS.dark
    });

    const chartData = analysisData.quantitativeData.professionDistribution.map(item => ({
      name: item.profession,
      labels: [item.profession],
      values: [item.count]
    }));

    slide.addChart(pptx.ChartType.bar, chartData, {
      x: 1,
      y: 1.5,
      w: 8,
      h: 4,
      barDir: "bar",
      chartColors: [COLORS.primary, COLORS.secondary, COLORS.accent],
      showLegend: false,
      showTitle: false,
      valAxisMaxVal: Math.max(...analysisData.quantitativeData.professionDistribution.map(i => i.count)) + 2
    });
  }

  if (analysisData.quantitativeData?.ageDistribution) {
    const slide = pptx.addSlide();
    slide.background = { fill: "FFFFFF" };
    
    slide.addText("Yaş Dağılımı", {
      x: 0.5,
      y: 0.5,
      w: 9,
      h: 0.7,
      fontSize: 36,
      bold: true,
      color: COLORS.dark
    });

    const chartData = [{
      name: "Yaş Grupları",
      labels: analysisData.quantitativeData.ageDistribution.map(item => item.range),
      values: analysisData.quantitativeData.ageDistribution.map(item => item.percentage)
    }];

    slide.addChart(pptx.ChartType.pie, chartData, {
      x: 2,
      y: 1.5,
      w: 6,
      h: 4,
      chartColors: [COLORS.primary, COLORS.secondary, COLORS.accent, COLORS.medium, COLORS.low],
      showPercent: true,
      showLegend: true,
      showTitle: false
    });
  }

  // Themes Slide
  if (analysisData.themes && analysisData.themes.length > 0) {
    const slide = pptx.addSlide();
    slide.background = { fill: "FFFFFF" };
    
    slide.addText("Tespit Edilen Temalar", {
      x: 0.5,
      y: 0.5,
      w: 9,
      h: 0.7,
      fontSize: 36,
      bold: true,
      color: COLORS.dark
    });

    analysisData.themes.slice(0, 6).forEach((theme, idx) => {
      const row = Math.floor(idx / 2);
      const col = idx % 2;
      const xPos = 0.7 + (col * 4.8);
      const yPos = 1.6 + (row * 1.4);

      slide.addShape(pptx.ShapeType.rect, {
        x: xPos,
        y: yPos,
        w: 4.3,
        h: 1.1,
        fill: { color: COLORS.light },
        line: { color: COLORS.primary, width: 2 }
      });

      slide.addText(theme.title, {
        x: xPos + 0.2,
        y: yPos + 0.15,
        w: 3.9,
        h: 0.35,
        fontSize: 16,
        bold: true,
        color: COLORS.primary
      });

      slide.addText(theme.description, {
        x: xPos + 0.2,
        y: yPos + 0.55,
        w: 3.9,
        h: 0.4,
        fontSize: 12,
        color: COLORS.text
      });
    });
  }

  // Recommendations Slides
  const recommendations = analysisData.recommendations || [];
  const recsPerSlide = 3;
  const recSlideCount = Math.ceil(recommendations.length / recsPerSlide);

  for (let i = 0; i < recSlideCount; i++) {
    const slide = pptx.addSlide();
    slide.background = { fill: "FFFFFF" };
    
    const title = recSlideCount > 1 ? `Öneriler (${i + 1}/${recSlideCount})` : "Öneriler";
    slide.addText(title, {
      x: 0.5,
      y: 0.5,
      w: 9,
      h: 0.7,
      fontSize: 36,
      bold: true,
      color: COLORS.dark
    });

    const startIdx = i * recsPerSlide;
    const endIdx = Math.min(startIdx + recsPerSlide, recommendations.length);
    const slideRecs = recommendations.slice(startIdx, endIdx);

    slideRecs.forEach((rec, idx) => {
      const yPos = 1.6 + (idx * 1.6);
      const priorityColor = rec.priority === "high" ? COLORS.high : rec.priority === "medium" ? COLORS.medium : COLORS.low;

      // Priority badge
      slide.addShape(pptx.ShapeType.rect, {
        x: 0.7,
        y: yPos,
        w: 1,
        h: 0.35,
        fill: { color: priorityColor },
        line: { type: "none" }
      });

      slide.addText(rec.priority.toUpperCase(), {
        x: 0.7,
        y: yPos,
        w: 1,
        h: 0.35,
        fontSize: 11,
        bold: true,
        color: "FFFFFF",
        align: "center",
        valign: "middle"
      });

      // Category
      slide.addText(rec.category, {
        x: 1.85,
        y: yPos + 0.05,
        w: 7,
        h: 0.25,
        fontSize: 14,
        bold: true,
        color: COLORS.primary
      });

      // Suggestion
      slide.addText(rec.suggestion, {
        x: 0.7,
        y: yPos + 0.45,
        w: 8.3,
        h: 0.6,
        fontSize: 13,
        color: COLORS.text
      });

      // User quote
      if (rec.userQuotes && rec.userQuotes.length > 0) {
        slide.addText(`"${rec.userQuotes[0]}"`, {
          x: 1,
          y: yPos + 1.1,
          w: 7.8,
          h: 0.35,
          fontSize: 11,
          color: COLORS.lightText,
          italic: true
        });
      }
    });
  }

  // Next Steps Slide
  const nextStepsSlide = pptx.addSlide();
  nextStepsSlide.background = { fill: "FFFFFF" };
  
  nextStepsSlide.addText("Sonraki Adımlar", {
    x: 0.5,
    y: 0.5,
    w: 9,
    h: 0.7,
    fontSize: 36,
    bold: true,
    color: COLORS.dark
  });

  const nextSteps = [
    "Yüksek öncelikli önerilerin uygulama planının oluşturulması",
    "Detaylı kullanıcı testlerinin başlatılması",
    "Prototip geliştirme ve A/B testleri",
    "Aylık kullanıcı geri bildirimi toplama sürecinin kurulması",
    "İyileştirmelerin etkisinin ölçülmesi için KPI takibi"
  ];

  nextSteps.forEach((step, idx) => {
    const yPos = 1.8 + (idx * 0.75);
    
    nextStepsSlide.addShape(pptx.ShapeType.rect, {
      x: 0.8,
      y: yPos,
      w: 0.4,
      h: 0.4,
      fill: { color: COLORS.secondary }
    });

    nextStepsSlide.addText((idx + 1).toString(), {
      x: 0.8,
      y: yPos,
      w: 0.4,
      h: 0.4,
      fontSize: 18,
      bold: true,
      color: "FFFFFF",
      align: "center",
      valign: "middle"
    });

    nextStepsSlide.addText(step, {
      x: 1.4,
      y: yPos + 0.05,
      w: 7.6,
      h: 0.6,
      fontSize: 15,
      color: COLORS.text
    });
  });

  // Generate and download
  const sanitizedTitle = projectTitle.replace(/[^a-zA-Z0-9ğüşıöçĞÜŞİÖÇ\s-]/g, "").replace(/\s+/g, "-");
  const dateStr = new Date().toISOString().split("T")[0];
  const fileName = `${sanitizedTitle}-Kullanici-Arastirmasi-${dateStr}.pptx`;
  
  await pptx.writeFile({ fileName });
};
