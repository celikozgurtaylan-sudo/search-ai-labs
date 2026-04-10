import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { findThemeById, getResearchModeFromAnalysis, normalizeAIEnhancedBrief } from "./ai-enhanced.ts";

const REPORT_VERSION = 1;
const REPORT_MODEL = "openai/gpt-5.2";
const MAX_QUOTES_FOR_PROMPT = 80;
const MAX_QUOTE_LENGTH = 320;

const EMPTY_SOURCE_STATS = {
  invitedParticipantCount: 0,
  joinedParticipantCount: 0,
  completedParticipantCount: 0,
  totalSessionCount: 0,
  completedSessionCount: 0,
  pendingSessionCount: 0,
  questionTemplateCount: 0,
  questionInstanceCount: 0,
  responsesAnalyzed: 0,
  skippedResponseCount: 0,
  quoteCount: 0,
};

const EMPTY_OVERVIEW = {
  invitedParticipantCount: 0,
  joinedParticipantCount: 0,
  completedParticipantCount: 0,
  joinRate: 0,
  completionRate: 0,
  skipRate: 0,
  averageResponseDurationMs: null,
  averageSessionDurationMs: null,
  averageResponsesPerCompletedSession: 0,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asArray = <T>(value: unknown): T[] => (Array.isArray(value) ? value as T[] : []);

const asString = (value: unknown, fallback = "") =>
  typeof value === "string" ? value.trim() : fallback;

const asNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const clampPriority = (value: unknown): "high" | "medium" | "low" => {
  if (value === "high" || value === "medium" || value === "low") {
    return value;
  }

  return "medium";
};

const roundToOneDecimal = (value: number) => Math.round(value * 10) / 10;

const average = (values: number[]) => {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const durationBetween = (startedAt?: string | null, endedAt?: string | null) => {
  if (!startedAt || !endedAt) return null;
  const start = Date.parse(startedAt);
  const end = Date.parse(endedAt);

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return null;
  }

  return end - start;
};

const truncateText = (value: string, maxLength = MAX_QUOTE_LENGTH) => {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trim()}…`;
};

const normalizeTitle = (value: string) =>
  value.toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();

const sanitizeIdList = (values: unknown, allowed: Set<string>) =>
  Array.from(
    new Set(
      asArray<string>(values).filter((value) => typeof value === "string" && allowed.has(value)),
    ),
  );

const buildQuestionTemplateKey = (section: string, questionText: string) => `${section}:::${questionText}`;

const buildEmptyReport = (
  trigger: string,
  failureMessage: string | null = null,
  interviewMode: "structured" | "ai_enhanced" = "structured",
) => ({
  interviewMode,
  status: failureMessage ? "failed" : "empty",
  version: REPORT_VERSION,
  generatedAt: failureMessage ? null : new Date().toISOString(),
  generatedFrom: interviewMode === "ai_enhanced" ? "ai-enhanced-transcript" : "transcript-only",
  sourceStats: { ...EMPTY_SOURCE_STATS },
  overview: { ...EMPTY_OVERVIEW },
  executiveSummary: failureMessage
    ? "Analiz üretimi başarısız oldu. Lütfen yeniden deneyin."
    : "Henüz analiz üretmek için tamamlanmış görüşme verisi bulunmuyor.",
  findings: [],
  themes: [],
  recommendations: [],
  questionBreakdown: [],
  participantBreakdown: [],
  anchorCoverage: [],
  followUpPaths: [],
  participantJourneys: [],
  turnCatalog: [],
  quoteCatalog: [],
  generationMeta: {
    trigger,
    generatedBy: REPORT_MODEL,
    llmUsed: false,
    analyzedSessionIds: [],
    analyzedResponseIds: [],
    failureMessage,
  },
});

async function loadProjectWithAnalysis(supabase: any, projectId: string) {
  const { data, error } = await supabase
    .from("projects")
    .select("id, title, description, analysis")
    .eq("id", projectId)
    .single();

  if (error) {
    throw new Error(`Failed to load project: ${error.message}`);
  }

  return data;
}

async function persistProjectReport(
  supabase: any,
  projectId: string,
  report: Record<string, unknown>,
) {
  const project = await loadProjectWithAnalysis(supabase, projectId);
  const nextAnalysis = {
    ...(isRecord(project.analysis) ? project.analysis : {}),
    report,
  };

  const { error } = await supabase
    .from("projects")
    .update({ analysis: nextAnalysis })
    .eq("id", projectId);

  if (error) {
    throw new Error(`Failed to persist project report: ${error.message}`);
  }
}

export async function setProjectReportStatus(
  supabase: any,
  projectId: string,
  status: "generating" | "failed",
  input: {
    trigger: string;
    triggerSessionId?: string | null;
    failureMessage?: string | null;
  },
) {
  const project = await loadProjectWithAnalysis(supabase, projectId);
  const existingAnalysis = isRecord(project.analysis) ? project.analysis : {};
  const existingReport = isRecord(existingAnalysis.report) ? existingAnalysis.report : {};
  const interviewMode = getResearchModeFromAnalysis(existingAnalysis);

  const nextReport = {
    ...existingReport,
    interviewMode,
    status,
    version: REPORT_VERSION,
    generatedFrom: interviewMode === "ai_enhanced" ? "ai-enhanced-transcript" : "transcript-only",
    generatedAt: typeof existingReport.generatedAt === "string" ? existingReport.generatedAt : null,
    generationMeta: {
      ...(isRecord(existingReport.generationMeta) ? existingReport.generationMeta : {}),
      trigger: input.trigger,
      triggerSessionId: input.triggerSessionId ?? null,
      generatedBy: REPORT_MODEL,
      llmUsed: existingReport.generationMeta && isRecord(existingReport.generationMeta)
        ? existingReport.generationMeta.llmUsed ?? false
        : false,
      analyzedSessionIds: asArray<string>(
        isRecord(existingReport.generationMeta) ? existingReport.generationMeta.analyzedSessionIds : [],
      ),
      analyzedResponseIds: asArray<string>(
        isRecord(existingReport.generationMeta) ? existingReport.generationMeta.analyzedResponseIds : [],
      ),
      failureMessage: input.failureMessage ?? null,
    },
  };

  await persistProjectReport(supabase, projectId, nextReport);
}

async function callLovableForReport(input: {
  projectTitle: string;
  projectDescription: string;
  objective?: string;
  primaryTask?: string;
  overview: Record<string, unknown>;
  questionSummaries: Array<Record<string, unknown>>;
  participantSummaries: Array<Record<string, unknown>>;
  quoteCatalog: Array<Record<string, unknown>>;
}) {
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!lovableApiKey) {
    return null;
  }

  const systemPrompt = `Sen kanit-temelli bir UX arastirma analistisin.
Sadece verilen veriyle calis.
Verilmeyen metrikleri, demografileri veya davranislari uydurma.
Tum ciktilar Turkce ve gecerli JSON olmali.
Her finding, theme ve recommendation en az bir gecerli quoteId referansi icermeli.
Kaniti olmayan bolumler icin bos dizi don.
Sonucta yonetici ozetini kisa, net ve urun ekibinin karar alabilecegi bicimde yaz.`;

  const userPrompt = `
Proje:
${JSON.stringify({
    title: input.projectTitle,
    description: input.projectDescription,
    objective: input.objective || null,
    primaryTask: input.primaryTask || null,
  }, null, 2)}

Deterministik overview:
${JSON.stringify(input.overview, null, 2)}

Soru ozetleri:
${JSON.stringify(input.questionSummaries, null, 2)}

Katilimci oturum ozetleri:
${JSON.stringify(input.participantSummaries, null, 2)}

Kanit katalogu:
${JSON.stringify(input.quoteCatalog, null, 2)}

Sadece asagidaki JSON formatinda cevap ver:
{
  "executiveSummary": "kisa yonetici ozeti",
  "findings": [
    {
      "title": "finding basligi",
      "summary": "ne oldugunu ve neden onemli oldugunu anlat",
      "quoteIds": ["quote-1"],
      "questionRefs": ["question-1"],
      "sessionRefs": ["session-1"]
    }
  ],
  "themes": [
    {
      "title": "tema basligi",
      "description": "tema aciklamasi",
      "quoteIds": ["quote-1"],
      "questionRefs": ["question-1"]
    }
  ],
  "recommendations": [
    {
      "title": "onerinin kisa basligi",
      "description": "ekibin ne yapmasi gerektigini anlat",
      "priority": "high",
      "quoteIds": ["quote-1"],
      "linkedFindingTitles": ["finding basligi"]
    }
  ],
  "participantSummaries": [
    {
      "sessionRef": "session-1",
      "summary": "katilimci bazli ozet",
      "quoteIds": ["quote-1"]
    }
  ],
  "questionInsights": [
    {
      "questionRef": "question-1",
      "summary": "soru bazli ozet",
      "quoteIds": ["quote-1"]
    }
  ]
}

Kurallar:
- En fazla 5 finding, 6 theme, 5 recommendation uret.
- Tum referanslar giriste verilen quoteId, questionRef ve sessionRef degerlerinden secilmeli.
- Demografi, persona, location, motivation veya telemetry uydurma.
- Yalnizca veriyle desteklenebilen sonuc yaz.
`;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: REPORT_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 4000,
    }),
  });

  if (!response.ok) {
    throw new Error(`Lovable API error: ${await response.text()}`);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("Lovable API returned an invalid payload");
  }

  const trimmed = content.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  const rawJson = jsonMatch ? jsonMatch[0] : trimmed;

  return JSON.parse(rawJson);
}

async function generateAIEnhancedProjectReport(params: {
  supabase: any;
  projectId: string;
  project: any;
  analysisContext: Record<string, unknown>;
  participants: any[];
  sessions: any[];
  questions: any[];
  responses: any[];
  input: {
    trigger: string;
    triggerSessionId?: string | null;
  };
}) {
  const brief = normalizeAIEnhancedBrief(params.analysisContext.aiEnhancedBrief);
  const completedSessions = params.sessions.filter((session: any) => session.status === "completed" || Boolean(session.ended_at));

  if (params.sessions.length === 0 || !brief) {
    const report = buildEmptyReport(params.input.trigger, null, "ai_enhanced");
    await persistProjectReport(params.supabase, params.projectId, report);
    return report;
  }

  const participantsById = new Map(asArray<any>(params.participants).map((participant) => [participant.id, participant]));
  const sessionsById = new Map(asArray<any>(params.sessions).map((session) => [session.id, session]));
  const questionsById = new Map(asArray<any>(params.questions).map((question) => [question.id, question]));
  const completedSessionIdSet = new Set(completedSessions.map((session: any) => session.id));
  const completedResponses = asArray<any>(params.responses).filter(
    (response) => response.is_complete && completedSessionIdSet.has(response.session_id),
  );
  const answeredResponses = completedResponses.filter((response) => asString(response.transcription).length > 0);
  const skippedResponses = completedResponses.filter((response) => Boolean(isRecord(response.metadata) && response.metadata.skipped));
  const responsesByQuestionId = new Map<string, any>();

  completedResponses.forEach((response) => {
    responsesByQuestionId.set(response.question_id, response);
  });

  const joinedParticipantCount = asArray<any>(params.participants).filter((participant) =>
    Boolean(participant.joined_at) || participant.status === "joined" || participant.status === "completed",
  ).length;
  const completedParticipantCount = asArray<any>(params.participants).filter((participant) => participant.status === "completed").length;
  const responseDurations = answeredResponses
    .map((response) => asNumber(response.audio_duration_ms))
    .filter((value): value is number => value !== null && value > 0);
  const sessionDurations = completedSessions
    .map((session: any) => durationBetween(session.started_at, session.ended_at))
    .filter((value): value is number => value !== null && value > 0);

  const sessionRefById = new Map<string, string>();
  completedSessions.forEach((session: any, index: number) => {
    sessionRefById.set(session.id, `session-${index + 1}`);
  });

  const quoteCatalog = answeredResponses.slice(0, MAX_QUOTES_FOR_PROMPT).map((response, index) => {
    const question = questionsById.get(response.question_id);
    const session = sessionsById.get(response.session_id);
    const participant = participantsById.get(response.participant_id);
    const questionMetadata = isRecord(question?.metadata) ? question.metadata : {};
    const anchorId = asString(questionMetadata.anchorId) || null;
    const anchorLabel = brief.anchorQuestions.find((anchor) => anchor.id === anchorId)?.text || null;

    return {
      quoteId: `quote-${index + 1}`,
      responseId: response.id,
      sessionId: response.session_id,
      sessionRef: sessionRefById.get(response.session_id) || response.session_id,
      participantId: response.participant_id ?? null,
      participantLabel: asString(participant?.name) || asString(participant?.email) || "Katılımcı",
      questionId: response.question_id,
      questionRef: anchorId || `turn-${index + 1}`,
      questionText: asString(question?.question_text),
      section: asString(question?.section, "AI Enhanced"),
      text: truncateText(asString(response.transcription)),
      source: asString(questionMetadata.source) as "anchor" | "follow_up" | "transition" | "closing" | null,
      anchorId,
      anchorLabel,
      turnIndex: asNumber(questionMetadata.turnIndex),
      videoUrl: asString(response.video_url) || null,
      videoDurationMs: asNumber(response.video_duration_ms),
      audioDurationMs: asNumber(response.audio_duration_ms),
    };
  });

  const anchorCoverageBase = brief.anchorQuestions.map((anchor) => {
    const anchorRows = asArray<any>(params.questions).filter((question) => {
      const metadata = isRecord(question.metadata) ? question.metadata : {};
      return metadata.source === "anchor" && metadata.anchorId === anchor.id && completedSessionIdSet.has(question.session_id);
    });

    const answeredSessionIds = new Set<string>();
    const skippedSessionIds = new Set<string>();
    const durations: number[] = [];

    anchorRows.forEach((question) => {
      const response = responsesByQuestionId.get(question.id);
      if (!response) return;
      if (Boolean(isRecord(response.metadata) && response.metadata.skipped)) {
        skippedSessionIds.add(response.session_id);
        return;
      }
      if (asString(response.transcription).length > 0) {
        answeredSessionIds.add(response.session_id);
      }
      const audioDuration = asNumber(response.audio_duration_ms);
      if (audioDuration && audioDuration > 0) {
        durations.push(audioDuration);
      }
    });

    const themeTitle = findThemeById(brief, anchor.themeId)?.title || "AI Enhanced";
    const quoteIds = quoteCatalog
      .filter((quote) => quote.anchorId === anchor.id)
      .map((quote) => quote.quoteId)
      .slice(0, 4);

    return {
      anchorId: anchor.id,
      anchorLabel: anchor.text,
      themeTitle,
      answeredSessionCount: answeredSessionIds.size,
      skippedSessionCount: skippedSessionIds.size,
      coverageRate: completedSessions.length > 0
        ? roundToOneDecimal((answeredSessionIds.size / completedSessions.length) * 100)
        : 0,
      averageResponseDurationMs: average(durations),
      quoteIds,
      summary: "",
    };
  });

  const followUpPathMap = new Map<string, {
    id: string;
    anchorId: string | null;
    anchorLabel: string;
    questionText: string;
    count: number;
    sessionIds: Set<string>;
    quoteIds: string[];
  }>();

  asArray<any>(params.questions).forEach((question, index) => {
    const metadata = isRecord(question.metadata) ? question.metadata : {};
    if (metadata.source !== "follow_up" || !completedSessionIdSet.has(question.session_id)) return;

    const anchorId = asString(metadata.anchorId) || null;
    const anchorLabel = brief.anchorQuestions.find((anchor) => anchor.id === anchorId)?.text || "AI follow-up";
    const key = `${anchorId || "none"}::${asString(question.question_text)}`;

    if (!followUpPathMap.has(key)) {
      followUpPathMap.set(key, {
        id: `follow-up-${index + 1}`,
        anchorId,
        anchorLabel,
        questionText: asString(question.question_text),
        count: 0,
        sessionIds: new Set<string>(),
        quoteIds: [],
      });
    }

    const entry = followUpPathMap.get(key)!;
    entry.count += 1;
    entry.sessionIds.add(question.session_id);
    const matchingQuote = quoteCatalog.find((quote) => quote.questionId === question.id);
    if (matchingQuote) {
      entry.quoteIds.push(matchingQuote.quoteId);
    }
  });

  const followUpPaths = Array.from(followUpPathMap.values())
    .sort((left, right) => right.count - left.count)
    .map((entry) => ({
      id: entry.id,
      anchorId: entry.anchorId,
      anchorLabel: entry.anchorLabel,
      questionText: entry.questionText,
      count: entry.count,
      sessionCount: entry.sessionIds.size,
      quoteIds: Array.from(new Set(entry.quoteIds)).slice(0, 3),
    }));

  const participantJourneysBase = completedSessions.map((session: any) => {
    const participant = participantsById.get(session.participant_id);
    const sessionQuestions = asArray<any>(params.questions).filter((question) => question.session_id === session.id);
    const anchorCoverageCount = sessionQuestions.filter((question) => {
      const metadata = isRecord(question.metadata) ? question.metadata : {};
      return metadata.source === "anchor";
    }).length;
    const followUpCount = sessionQuestions.filter((question) => {
      const metadata = isRecord(question.metadata) ? question.metadata : {};
      return metadata.source === "follow_up";
    }).length;
    const quoteIds = quoteCatalog
      .filter((quote) => quote.sessionId === session.id)
      .map((quote) => quote.quoteId)
      .slice(0, 4);

    return {
      sessionId: session.id,
      sessionRef: sessionRefById.get(session.id) || session.id,
      participantId: session.participant_id ?? null,
      participantLabel: asString(participant?.name) || asString(participant?.email) || "Katılımcı",
      anchorCoverageCount,
      followUpCount,
      sessionDurationMs: durationBetween(session.started_at, session.ended_at),
      summary: "",
      quoteIds,
    };
  });

  const turnCatalog = asArray<any>(params.questions)
    .filter((question) => completedSessionIdSet.has(question.session_id))
    .sort((left, right) => {
      const leftCreated = Date.parse(asString(left.created_at));
      const rightCreated = Date.parse(asString(right.created_at));
      if (left.session_id === right.session_id) {
        return (left.question_order ?? 0) - (right.question_order ?? 0);
      }
      return leftCreated - rightCreated;
    })
    .map((question) => {
      const response = responsesByQuestionId.get(question.id);
      const metadata = isRecord(question.metadata) ? question.metadata : {};
      const session = sessionsById.get(question.session_id);
      const participant = participantsById.get(session?.participant_id);
      const anchorId = asString(metadata.anchorId) || null;
      const anchorLabel = brief.anchorQuestions.find((anchor) => anchor.id === anchorId)?.text || null;

      return {
        questionId: question.id,
        responseId: response?.id ?? null,
        sessionId: question.session_id,
        sessionRef: sessionRefById.get(question.session_id) || question.session_id,
        participantLabel: asString(participant?.name) || asString(participant?.email) || "Katılımcı",
        questionText: asString(question.question_text),
        responseText: truncateText(asString(response?.transcription) || asString(response?.response_text)),
        source: (asString(metadata.source) || "anchor") as "anchor" | "follow_up" | "transition" | "closing",
        anchorId,
        anchorLabel,
        turnIndex: asNumber(metadata.turnIndex),
      };
    });

  const sourceStats = {
    invitedParticipantCount: asArray<any>(params.participants).length,
    joinedParticipantCount,
    completedParticipantCount,
    totalSessionCount: asArray<any>(params.sessions).length,
    completedSessionCount: completedSessions.length,
    pendingSessionCount: Math.max(asArray<any>(params.sessions).length - completedSessions.length, 0),
    questionTemplateCount: anchorCoverageBase.length,
    questionInstanceCount: asArray<any>(params.questions).length,
    responsesAnalyzed: answeredResponses.length,
    skippedResponseCount: skippedResponses.length,
    quoteCount: quoteCatalog.length,
  };

  const overview = {
    invitedParticipantCount: sourceStats.invitedParticipantCount,
    joinedParticipantCount: sourceStats.joinedParticipantCount,
    completedParticipantCount: sourceStats.completedParticipantCount,
    joinRate: sourceStats.invitedParticipantCount > 0
      ? roundToOneDecimal((sourceStats.joinedParticipantCount / sourceStats.invitedParticipantCount) * 100)
      : 0,
    completionRate: sourceStats.invitedParticipantCount > 0
      ? roundToOneDecimal((sourceStats.completedParticipantCount / sourceStats.invitedParticipantCount) * 100)
      : 0,
    skipRate: completedResponses.length > 0
      ? roundToOneDecimal((sourceStats.skippedResponseCount / completedResponses.length) * 100)
      : 0,
    averageResponseDurationMs: average(responseDurations),
    averageSessionDurationMs: average(sessionDurations),
    averageResponsesPerCompletedSession: completedSessions.length > 0
      ? roundToOneDecimal(completedResponses.length / completedSessions.length)
      : 0,
  };

  const deterministicSummary = completedSessions.length === 0
    ? "Henüz tamamlanmış AI enhanced görüşme bulunmuyor."
    : `${completedSessions.length} tamamlanmış AI enhanced görüşmeden ${answeredResponses.length} yanıt analiz edildi. Bulgular anchor omurga ve canlı follow-up akışına göre gösteriliyor.`;

  const llmResult = await callLovableForReport({
    projectTitle: asString(params.project.title, "AI Enhanced Araştırma"),
    projectDescription: asString(params.project.description),
    objective: brief.objective,
    primaryTask: brief.decisionScope,
    overview,
    questionSummaries: anchorCoverageBase.map((anchor) => ({
      questionRef: anchor.anchorId,
      section: anchor.themeTitle,
      questionText: anchor.anchorLabel,
      answeredResponseCount: anchor.answeredSessionCount,
      skippedResponseCount: anchor.skippedSessionCount,
      coverageRate: anchor.coverageRate,
    })),
    participantSummaries: participantJourneysBase.map((journey) => ({
      sessionRef: journey.sessionRef,
      participantLabel: journey.participantLabel,
      answeredResponseCount: journey.anchorCoverageCount,
      skippedResponseCount: 0,
    })),
    quoteCatalog: quoteCatalog.map((quote) => ({
      quoteId: quote.quoteId,
      sessionRef: quote.sessionRef,
      participantLabel: quote.participantLabel,
      questionRef: quote.anchorId || quote.questionRef,
      section: quote.section,
      questionText: quote.questionText,
      text: quote.text,
    })),
  }).catch((error) => {
    console.error("AI enhanced report LLM generation failed:", error);
    return null;
  });

  const quoteIdSet = new Set(quoteCatalog.map((quote) => quote.quoteId));
  const anchorRefSet = new Set(anchorCoverageBase.map((anchor) => anchor.anchorId));
  const sessionRefSet = new Set(participantJourneysBase.map((journey) => journey.sessionRef));

  const findings = asArray<Record<string, unknown>>(llmResult?.findings)
    .map((finding, index) => ({
      id: `finding-${index + 1}`,
      title: asString(finding.title, `Bulgu ${index + 1}`),
      summary: asString(finding.summary),
      quoteIds: sanitizeIdList(finding.quoteIds, quoteIdSet),
      questionRefs: sanitizeIdList(finding.questionRefs, anchorRefSet),
      sessionRefs: sanitizeIdList(finding.sessionRefs, sessionRefSet),
    }))
    .filter((finding) => finding.summary.length > 0 && finding.quoteIds.length > 0)
    .map((finding) => ({
      ...finding,
      evidenceCount: finding.quoteIds.length,
    }));

  const findingTitleToId = new Map(findings.map((finding) => [normalizeTitle(finding.title), finding.id]));

  const themes = asArray<Record<string, unknown>>(llmResult?.themes)
    .map((theme, index) => {
      const quoteIds = sanitizeIdList(theme.quoteIds, quoteIdSet);
      return {
        id: `theme-${index + 1}`,
        title: asString(theme.title, `Tema ${index + 1}`),
        description: asString(theme.description),
        quoteIds,
        questionRefs: sanitizeIdList(theme.questionRefs, anchorRefSet),
        evidenceCount: quoteIds.length,
      };
    })
    .filter((theme) => theme.description.length > 0 && theme.quoteIds.length > 0);

  const recommendations = asArray<Record<string, unknown>>(llmResult?.recommendations)
    .map((recommendation, index) => ({
      id: `recommendation-${index + 1}`,
      title: asString(recommendation.title, `Öneri ${index + 1}`),
      description: asString(recommendation.description),
      priority: clampPriority(recommendation.priority),
      quoteIds: sanitizeIdList(recommendation.quoteIds, quoteIdSet),
      linkedFindingIds: asArray<string>(recommendation.linkedFindingTitles)
        .map((title) => findingTitleToId.get(normalizeTitle(title)))
        .filter((value): value is string => Boolean(value)),
    }))
    .filter((recommendation) => recommendation.description.length > 0 && recommendation.quoteIds.length > 0);

  const participantSummaries = new Map<string, { summary: string }>(
    asArray<Record<string, unknown>>(llmResult?.participantSummaries)
      .map((entry) => [asString(entry.sessionRef), { summary: asString(entry.summary) }] as [string, { summary: string }])
      .filter(([sessionRef]) => sessionRef.length > 0),
  );

  const anchorInsights = new Map<string, { summary: string }>(
    asArray<Record<string, unknown>>(llmResult?.questionInsights)
      .map((entry) => [asString(entry.questionRef), { summary: asString(entry.summary) }] as [string, { summary: string }])
      .filter(([anchorId]) => anchorId.length > 0),
  );

  const anchorCoverage = anchorCoverageBase.map((anchor) => ({
    ...anchor,
    summary: anchorInsights.get(anchor.anchorId)?.summary || anchor.summary,
  }));

  const participantJourneys = participantJourneysBase.map((journey) => ({
    ...journey,
    summary: participantSummaries.get(journey.sessionRef)?.summary || journey.summary,
  }));

  const report = {
    interviewMode: "ai_enhanced",
    status: completedSessions.length === 0 ? "empty" : "ready",
    version: REPORT_VERSION,
    generatedAt: new Date().toISOString(),
    generatedFrom: "ai-enhanced-transcript",
    sourceStats,
    overview,
    executiveSummary: asString(llmResult?.executiveSummary) || deterministicSummary,
    findings,
    themes,
    recommendations,
    questionBreakdown: [],
    participantBreakdown: [],
    anchorCoverage,
    followUpPaths,
    participantJourneys,
    turnCatalog,
    quoteCatalog,
    generationMeta: {
      trigger: params.input.trigger,
      triggerSessionId: params.input.triggerSessionId ?? null,
      generatedBy: REPORT_MODEL,
      llmUsed: Boolean(llmResult),
      analyzedSessionIds: completedSessions.map((session: any) => session.id),
      analyzedResponseIds: answeredResponses.map((response) => response.id),
      failureMessage: null,
    },
  };

  await persistProjectReport(params.supabase, params.projectId, report);
  return report;
}

export async function generateAndPersistProjectReport(
  supabase: any,
  projectId: string,
  input: {
    trigger: string;
    triggerSessionId?: string | null;
  },
) {
  const project = await loadProjectWithAnalysis(supabase, projectId);
  const analysisContext = isRecord(project.analysis) ? project.analysis : {};
  const interviewMode = getResearchModeFromAnalysis(analysisContext);
  const usabilityTesting = isRecord(analysisContext.usabilityTesting) ? analysisContext.usabilityTesting : {};

  const { data: participants, error: participantError } = await supabase
    .from("study_participants")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  if (participantError) {
    throw new Error(`Failed to load participants: ${participantError.message}`);
  }

  const { data: sessions, error: sessionError } = await supabase
    .from("study_sessions")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  if (sessionError) {
    throw new Error(`Failed to load sessions: ${sessionError.message}`);
  }

  if (!sessions || sessions.length === 0) {
    const report = buildEmptyReport(input.trigger, null, interviewMode);
    await persistProjectReport(supabase, projectId, report);
    return report;
  }

  const completedSessions = sessions.filter((session: any) => session.status === "completed" || Boolean(session.ended_at));
  const sessionIds = sessions.map((session: any) => session.id);

  const { data: questions, error: questionError } = await supabase
    .from("interview_questions")
    .select("*")
    .eq("project_id", projectId)
    .order("question_order", { ascending: true });

  if (questionError) {
    throw new Error(`Failed to load interview questions: ${questionError.message}`);
  }

  const { data: responses, error: responseError } = sessionIds.length > 0
    ? await supabase
        .from("interview_responses")
        .select("*")
        .in("session_id", sessionIds)
        .order("created_at", { ascending: true })
    : { data: [], error: null };

  if (responseError) {
    throw new Error(`Failed to load interview responses: ${responseError.message}`);
  }

  if (interviewMode === "ai_enhanced") {
    return await generateAIEnhancedProjectReport({
      supabase,
      projectId,
      project,
      analysisContext,
      participants: participants ?? [],
      sessions: sessions ?? [],
      questions: questions ?? [],
      responses: responses ?? [],
      input,
    });
  }

  const participantsById = new Map(
    asArray<any>(participants).map((participant) => [participant.id, participant]),
  );
  const sessionsById = new Map(
    asArray<any>(sessions).map((session) => [session.id, session]),
  );
  const questionsById = new Map(
    asArray<any>(questions).map((question) => [question.id, question]),
  );

  const completedSessionIdSet = new Set(completedSessions.map((session: any) => session.id));
  const completedResponses = asArray<any>(responses).filter(
    (response) => response.is_complete && completedSessionIdSet.has(response.session_id),
  );
  const answeredResponses = completedResponses.filter((response) => asString(response.transcription).length > 0);
  const skippedResponses = completedResponses.filter(
    (response) => Boolean(isRecord(response.metadata) && response.metadata.skipped),
  );

  const joinedParticipantCount = asArray<any>(participants).filter((participant) =>
    Boolean(participant.joined_at) || participant.status === "joined" || participant.status === "completed",
  ).length;

  const completedParticipantCount = asArray<any>(participants).filter(
    (participant) => participant.status === "completed",
  ).length;

  const responseDurations = answeredResponses
    .map((response) => asNumber(response.audio_duration_ms))
    .filter((value): value is number => value !== null && value > 0);

  const sessionDurations = completedSessions
    .map((session: any) => durationBetween(session.started_at, session.ended_at))
    .filter((value: any): value is number => value !== null && value > 0);

  const sessionRefById = new Map<string, string>();
  completedSessions.forEach((session: any, index: number) => {
    sessionRefById.set(session.id, `session-${index + 1}`);
  });

  const questionTemplateMap = new Map<string, any>();
  const questionIdToRef = new Map<string, string>();

  asArray<any>(questions).forEach((question) => {
    const section = asString(question.section, "Genel");
    const questionText = asString(question.question_text);
    const templateKey = buildQuestionTemplateKey(section, questionText);

    if (!questionTemplateMap.has(templateKey)) {
      questionTemplateMap.set(templateKey, {
        templateKey,
        questionRef: `question-${questionTemplateMap.size + 1}`,
        section,
        questionText,
        questionIds: new Set<string>(),
        sessionIds: new Set<string>(),
        answeredResponseCount: 0,
        skippedResponseCount: 0,
        durations: [] as number[],
        quoteIds: [] as string[],
        summary: "",
        order: typeof question.question_order === "number" ? question.question_order : Number.MAX_SAFE_INTEGER,
      });
    }

    const entry = questionTemplateMap.get(templateKey);
    entry.questionIds.add(question.id);
    if (question.session_id) {
      entry.sessionIds.add(question.session_id);
    }
    if (typeof question.question_order === "number") {
      entry.order = Math.min(entry.order, question.question_order);
    }
    questionIdToRef.set(question.id, entry.questionRef);
  });

  const quoteCatalog = answeredResponses.slice(0, MAX_QUOTES_FOR_PROMPT).map((response, index) => {
    const question = questionsById.get(response.question_id);
    const session = sessionsById.get(response.session_id);
    const participant = participantsById.get(response.participant_id);
    const questionRef = questionIdToRef.get(response.question_id) || `question-${index + 1}`;
    const quoteId = `quote-${index + 1}`;
    const trimmedText = truncateText(asString(response.transcription));

    const templateKey = buildQuestionTemplateKey(
      asString(question?.section, "Genel"),
      asString(question?.question_text),
    );
    const questionTemplate = questionTemplateMap.get(templateKey);
    if (questionTemplate) {
      questionTemplate.quoteIds.push(quoteId);
    }

    return {
      quoteId,
      responseId: response.id,
      sessionId: response.session_id,
      sessionRef: sessionRefById.get(response.session_id) || response.session_id,
      participantId: response.participant_id ?? null,
      participantLabel: asString(participant?.name) || asString(participant?.email) || "Katılımcı",
      questionId: response.question_id,
      questionRef,
      questionText: asString(question?.question_text),
      section: asString(question?.section, "Genel"),
      text: trimmedText,
      videoUrl: asString(response.video_url) || null,
      videoDurationMs: asNumber(response.video_duration_ms),
      audioDurationMs: asNumber(response.audio_duration_ms),
    };
  });

  completedResponses.forEach((response) => {
    const question = questionsById.get(response.question_id);
    if (!question) return;

    const templateKey = buildQuestionTemplateKey(
      asString(question.section, "Genel"),
      asString(question.question_text),
    );
    const entry = questionTemplateMap.get(templateKey);
    if (!entry) return;

    if (response.session_id) {
      entry.sessionIds.add(response.session_id);
    }

    const audioDuration = asNumber(response.audio_duration_ms);
    if (audioDuration && audioDuration > 0) {
      entry.durations.push(audioDuration);
    }

    if (Boolean(isRecord(response.metadata) && response.metadata.skipped)) {
      entry.skippedResponseCount += 1;
      return;
    }

    if (asString(response.transcription).length > 0) {
      entry.answeredResponseCount += 1;
    }
  });

  const questionBreakdownBase = Array.from(questionTemplateMap.values())
    .sort((left, right) => left.order - right.order)
    .map((entry) => ({
      questionRef: entry.questionRef,
      section: entry.section,
      questionText: entry.questionText,
      sessionCount: entry.sessionIds.size,
      answeredResponseCount: entry.answeredResponseCount,
      skippedResponseCount: entry.skippedResponseCount,
      coverageRate: completedSessions.length > 0
        ? roundToOneDecimal((entry.answeredResponseCount / completedSessions.length) * 100)
        : 0,
      averageResponseDurationMs: average(entry.durations),
      summary: "",
      quoteIds: Array.from(new Set(entry.quoteIds)).slice(0, 4),
    }));

  const participantBreakdownBase = completedSessions.map((session: any) => {
    const participant = participantsById.get(session.participant_id);
    const sessionResponses = completedResponses.filter((response) => response.session_id === session.id);
    const sessionAnswered = sessionResponses.filter((response) => asString(response.transcription).length > 0);
    const sessionSkipped = sessionResponses.filter(
      (response) => Boolean(isRecord(response.metadata) && response.metadata.skipped),
    );
    const sessionQuoteIds = quoteCatalog
      .filter((quote) => quote.sessionId === session.id)
      .map((quote) => quote.quoteId)
      .slice(0, 4);

    return {
      sessionId: session.id,
      sessionRef: sessionRefById.get(session.id) || session.id,
      participantId: session.participant_id ?? null,
      participantLabel: asString(participant?.name) || asString(participant?.email) || "Katılımcı",
      status: asString(session.status, "completed"),
      responseCount: sessionResponses.length,
      answeredResponseCount: sessionAnswered.length,
      skippedResponseCount: sessionSkipped.length,
      averageResponseDurationMs: average(
        sessionAnswered
          .map((response) => asNumber(response.audio_duration_ms))
          .filter((value): value is number => value !== null && value > 0),
      ),
      sessionDurationMs: durationBetween(session.started_at, session.ended_at),
      hasVideoEvidence: sessionResponses.some((response) => asString(response.video_url).length > 0),
      summary: "",
      quoteIds: sessionQuoteIds,
    };
  });

  const sourceStats = {
    invitedParticipantCount: asArray<any>(participants).length,
    joinedParticipantCount,
    completedParticipantCount,
    totalSessionCount: asArray<any>(sessions).length,
    completedSessionCount: completedSessions.length,
    pendingSessionCount: Math.max(asArray<any>(sessions).length - completedSessions.length, 0),
    questionTemplateCount: questionBreakdownBase.length,
    questionInstanceCount: asArray<any>(questions).length,
    responsesAnalyzed: answeredResponses.length,
    skippedResponseCount: skippedResponses.length,
    quoteCount: quoteCatalog.length,
  };

  const overview = {
    invitedParticipantCount: sourceStats.invitedParticipantCount,
    joinedParticipantCount: sourceStats.joinedParticipantCount,
    completedParticipantCount: sourceStats.completedParticipantCount,
    joinRate: sourceStats.invitedParticipantCount > 0
      ? roundToOneDecimal((sourceStats.joinedParticipantCount / sourceStats.invitedParticipantCount) * 100)
      : 0,
    completionRate: sourceStats.invitedParticipantCount > 0
      ? roundToOneDecimal((sourceStats.completedParticipantCount / sourceStats.invitedParticipantCount) * 100)
      : 0,
    skipRate: completedResponses.length > 0
      ? roundToOneDecimal((sourceStats.skippedResponseCount / completedResponses.length) * 100)
      : 0,
    averageResponseDurationMs: average(responseDurations),
    averageSessionDurationMs: average(sessionDurations),
    averageResponsesPerCompletedSession: completedSessions.length > 0
      ? roundToOneDecimal(completedResponses.length / completedSessions.length)
      : 0,
  };

  const deterministicSummary = completedSessions.length === 0
    ? "Henüz tamamlanmış görüşme bulunmuyor."
    : answeredResponses.length === 0
      ? "Tamamlanmış görüşmeler mevcut ancak analiz edilebilir transcript oluşmamış. Bu rapor yalnızca kapsama, süre ve skip verilerini gösteriyor."
      : `${completedSessions.length} tamamlanmış görüşmeden ${answeredResponses.length} yanıt analiz edildi. Bulgular yalnızca kaydedilmiş transcript ve oturum verilerine dayanıyor.`;

  let llmResult: Record<string, unknown> | null = null;
  let llmUsed = false;

  if (answeredResponses.length > 0 && quoteCatalog.length > 0) {
    try {
      llmResult = await callLovableForReport({
        projectTitle: asString(project.title, "Araştırma Projesi"),
        projectDescription: asString(project.description),
        objective: asString(usabilityTesting.objective),
        primaryTask: asString(usabilityTesting.primaryTask),
        overview,
        questionSummaries: questionBreakdownBase.map((question) => ({
          questionRef: question.questionRef,
          section: question.section,
          questionText: question.questionText,
          answeredResponseCount: question.answeredResponseCount,
          skippedResponseCount: question.skippedResponseCount,
          coverageRate: question.coverageRate,
        })),
        participantSummaries: participantBreakdownBase.map((participant: any) => ({
          sessionRef: participant.sessionRef,
          participantLabel: participant.participantLabel,
          answeredResponseCount: participant.answeredResponseCount,
          skippedResponseCount: participant.skippedResponseCount,
        })),
        quoteCatalog: quoteCatalog.map((quote) => ({
          quoteId: quote.quoteId,
          sessionRef: quote.sessionRef,
          participantLabel: quote.participantLabel,
          questionRef: quote.questionRef,
          section: quote.section,
          questionText: quote.questionText,
          text: quote.text,
        })),
      });
      llmUsed = true;
    } catch (error) {
      console.error("Project report LLM generation failed:", error);
    }
  }

  const quoteIdSet = new Set(quoteCatalog.map((quote) => quote.quoteId));
  const questionRefSet = new Set(questionBreakdownBase.map((question) => question.questionRef));
  const sessionRefSet = new Set<string>(participantBreakdownBase.map((participant: any) => participant.sessionRef));

  const rawFindings = asArray<Record<string, unknown>>(llmResult?.findings);
  const findings = rawFindings
    .map((finding, index) => ({
      id: `finding-${index + 1}`,
      title: asString(finding.title, `Bulgu ${index + 1}`),
      summary: asString(finding.summary),
      quoteIds: sanitizeIdList(finding.quoteIds, quoteIdSet),
      questionRefs: sanitizeIdList(finding.questionRefs, questionRefSet),
      sessionRefs: sanitizeIdList(finding.sessionRefs, sessionRefSet),
    }))
    .filter((finding) => finding.summary.length > 0 && finding.quoteIds.length > 0)
    .map((finding) => ({
      ...finding,
      evidenceCount: finding.quoteIds.length,
    }));

  const findingTitleToId = new Map(findings.map((finding) => [normalizeTitle(finding.title), finding.id]));

  const themes = asArray<Record<string, unknown>>(llmResult?.themes)
    .map((theme, index) => {
      const quoteIds = sanitizeIdList(theme.quoteIds, quoteIdSet);
      return {
        id: `theme-${index + 1}`,
        title: asString(theme.title, `Tema ${index + 1}`),
        description: asString(theme.description),
        quoteIds,
        questionRefs: sanitizeIdList(theme.questionRefs, questionRefSet),
        evidenceCount: quoteIds.length,
      };
    })
    .filter((theme) => theme.description.length > 0 && theme.quoteIds.length > 0);

  const recommendations = asArray<Record<string, unknown>>(llmResult?.recommendations)
    .map((recommendation, index) => {
      const linkedFindingIds = asArray<string>(recommendation.linkedFindingTitles)
        .map((title) => findingTitleToId.get(normalizeTitle(title)))
        .filter((value): value is string => Boolean(value));

      return {
        id: `recommendation-${index + 1}`,
        title: asString(recommendation.title, `Öneri ${index + 1}`),
        description: asString(recommendation.description),
        priority: clampPriority(recommendation.priority),
        quoteIds: sanitizeIdList(recommendation.quoteIds, quoteIdSet),
        linkedFindingIds,
      };
    })
    .filter((recommendation) => recommendation.description.length > 0 && recommendation.quoteIds.length > 0);

  const participantSummaries = new Map<string, { summary: string; quoteIds: string[] }>(
    asArray<Record<string, unknown>>(llmResult?.participantSummaries)
      .map((entry) => [
        asString(entry.sessionRef),
        {
          summary: asString(entry.summary),
          quoteIds: sanitizeIdList(entry.quoteIds, quoteIdSet),
        },
      ] as [string, { summary: string; quoteIds: string[] }])
      .filter(([sessionRef]) => sessionRef.length > 0),
  );

  const questionInsights = new Map<string, { summary: string; quoteIds: string[] }>(
    asArray<Record<string, unknown>>(llmResult?.questionInsights)
      .map((entry) => [
        asString(entry.questionRef),
        {
          summary: asString(entry.summary),
          quoteIds: sanitizeIdList(entry.quoteIds, quoteIdSet),
        },
      ] as [string, { summary: string; quoteIds: string[] }])
      .filter(([questionRef]) => questionRef.length > 0),
  );

  const questionBreakdown = questionBreakdownBase.map((question) => {
    const insight = questionInsights.get(question.questionRef);
    return {
      ...question,
      summary: insight?.summary || question.summary,
      quoteIds: insight?.quoteIds?.length ? insight.quoteIds : question.quoteIds,
    };
  });

  const participantBreakdown = participantBreakdownBase.map((participant: any) => {
    const summary = participantSummaries.get(participant.sessionRef);
    return {
      ...participant,
      summary: summary?.summary || participant.summary,
      quoteIds: summary?.quoteIds?.length ? summary.quoteIds : participant.quoteIds,
    };
  });

  const report = {
    interviewMode: "structured",
    status: completedSessions.length === 0 ? "empty" : "ready",
    version: REPORT_VERSION,
    generatedAt: new Date().toISOString(),
    generatedFrom: "transcript-only",
    sourceStats,
    overview,
    executiveSummary: asString(llmResult?.executiveSummary) || deterministicSummary,
    findings,
    themes,
    recommendations,
    questionBreakdown,
    participantBreakdown,
    anchorCoverage: [],
    followUpPaths: [],
    participantJourneys: [],
    turnCatalog: [],
    quoteCatalog,
    generationMeta: {
      trigger: input.trigger,
      triggerSessionId: input.triggerSessionId ?? null,
      generatedBy: REPORT_MODEL,
      llmUsed,
      analyzedSessionIds: completedSessions.map((session: any) => session.id),
      analyzedResponseIds: answeredResponses.map((response) => response.id),
      failureMessage: null,
    },
  };

  await persistProjectReport(supabase, projectId, report);
  return report;
}
