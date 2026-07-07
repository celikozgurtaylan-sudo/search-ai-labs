import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  dedupeSyntheticPersonaNames,
  dedupeSyntheticPersonaRecommendationNames,
  findPersonaById,
  localizeSyntheticPersonaForTurkishDisplay,
  loadNemotronSyntheticPersonaPool,
  recommendSyntheticPersonas,
  type SyntheticPersona,
} from "../_shared/synthetic-personas.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

const MODEL = Deno.env.get("ORCHESTRATOR_MODEL") || "gpt-4.1";
const SYNTHETIC_DATASET = "nvidia/Nemotron-Personas-Brazil";
const DEFAULT_SYNTHETIC_PERSONA_COUNT = 6;
const MIN_SYNTHETIC_PERSONAS = 3;
const MAX_SYNTHETIC_PERSONAS = 12;
const MAX_SYNTHETIC_QUESTIONS = 18;
const SYNTHETIC_PERSONA_BATCH_CONCURRENCY = 4;

const parseBearerToken = (req: Request) => {
  const header = req.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.replace(/^Bearer\s+/i, "").trim();
};

const asString = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const asArray = <T>(value: unknown): T[] => Array.isArray(value) ? value as T[] : [];

const clampSyntheticSampleSize = (value: unknown) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return DEFAULT_SYNTHETIC_PERSONA_COUNT;
  return Math.min(MAX_SYNTHETIC_PERSONAS, Math.max(MIN_SYNTHETIC_PERSONAS, Math.round(numericValue)));
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseJsonObject = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
};

const validateProjectOwner = async (projectId: string, token: string | null) => {
  if (!token) return null;

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(token);

  if (userError || !user) return null;

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, title, description, analysis")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (projectError || !project) return null;
  return { user, project };
};

const json = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const buildTopic = (project: Record<string, unknown>) => {
  const analysis = project.analysis && typeof project.analysis === "object" && !Array.isArray(project.analysis)
    ? project.analysis as Record<string, unknown>
    : {};
  const usability = analysis.usabilityTesting && typeof analysis.usabilityTesting === "object" && !Array.isArray(analysis.usabilityTesting)
    ? analysis.usabilityTesting as Record<string, unknown>
    : {};

  return [
    project.title,
    project.description,
    usability.objective,
    usability.primaryTask,
    usability.targetUsers,
    usability.successSignals,
    usability.riskAreas,
  ]
    .map((value) => asString(value))
    .filter(Boolean)
    .join("\n");
};

const sanitizePersonaSnapshot = (persona: SyntheticPersona) => ({
  id: persona.id,
  name: persona.name,
  group: persona.group,
  ageRange: persona.ageRange,
  occupation: persona.occupation,
  context: persona.context,
  goals: persona.goals,
  frustrations: persona.frustrations,
  traits: persona.traits,
  tags: persona.tags,
});

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const truncateText = (value: string, maxLength = 360) => {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trim()}…`;
};

const roundToOneDecimal = (value: number) => Math.round(value * 10) / 10;

const normalizeTitle = (value: string) =>
  value.toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();

const isMissingSyntheticResearchTableError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /synthetic_research_runs|synthetic_research_responses|schema cache|relation .* does not exist/i.test(message);
};

interface SyntheticResearchResponseRow {
  id: string;
  run_id?: string;
  project_id?: string;
  user_id?: string;
  persona_id: string;
  persona_snapshot: Record<string, unknown>;
  question_ref: string;
  section: string;
  question_text: string;
  response_text: string;
}

const parsePersonaSnapshot = (value: unknown): SyntheticPersona | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const persona = value as Record<string, unknown>;
  if (
    typeof persona.id !== "string" ||
    typeof persona.name !== "string" ||
    typeof persona.group !== "string" ||
    typeof persona.ageRange !== "string" ||
    typeof persona.occupation !== "string" ||
    typeof persona.context !== "string" ||
    !isStringArray(persona.goals) ||
    !isStringArray(persona.frustrations) ||
    !isStringArray(persona.traits) ||
    !isStringArray(persona.tags)
  ) {
    return null;
  }

  return {
    id: persona.id,
    name: persona.name,
    group: persona.group,
    ageRange: persona.ageRange,
    occupation: persona.occupation,
    context: persona.context,
    goals: persona.goals,
    frustrations: persona.frustrations,
    traits: persona.traits,
    tags: persona.tags,
  };
};

const loadSession = async (sessionId: string, projectId: string, userId: string) => {
  const { data: session, error } = await supabase
    .from("synthetic_user_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load synthetic session: ${error.message}`);
  return session;
};

const loadMessages = async (sessionId: string) => {
  const { data, error } = await supabase
    .from("synthetic_user_messages")
    .select("id, role, content, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to load synthetic messages: ${error.message}`);
  return data ?? [];
};

const buildPersonaSystemPrompt = (persona: SyntheticPersona, project: Record<string, unknown>) => `Sen Searcho icinde arastirmaciyla konusan SENTETIK bir kullanici personasin.

Kimlik:
- Ad: ${persona.name}
- Grup: ${persona.group}
- Yas araligi: ${persona.ageRange}
- Meslek/baglam: ${persona.occupation}
- Durum: ${persona.context}
- Hedefler: ${persona.goals.join(", ")}
- Frustrasyonlar: ${persona.frustrations.join(", ")}
- Davranis ozellikleri: ${persona.traits.join(", ")}

Arastirma konusu:
${buildTopic(project)}

Kurallar:
- Her zaman sentetik bir persona oldugunu unut; gercek katilimci veya gercek deneyim iddia etme.
- Arastirmacinin sorularina bu personanin bakis acisindan cevap ver.
- Cevabini her zaman dogal ve akici Turkce ver; Turkiye'deki kullanici beklentilerine uyarlanmis gibi dusun.
- Veri seti kaynakli ulke, sehir, eyalet, belediye veya Brezilya/Portekizce baglam ayrintilarini asla soyleme.
- Ekran, Figma prototipi veya arayuz hakkinda yalnizca arastirmacinin mesajinda tarif edilenlere dayan.
- Uydurma marka verisi, gizli sirket bilgisi, kisisel veri veya gercek musteri hikayesi ekleme.
- Kisa, dogal ve arastirma icin yararli cevap ver.
- Cevaplar Turkce olsun.`;

const extractDiscussionGuideQuestions = (project: Record<string, unknown>) => {
  const analysis = isRecord(project.analysis) ? project.analysis : {};
  const guide = isRecord(analysis.discussionGuide) ? analysis.discussionGuide : null;
  const sections = asArray<Record<string, unknown>>(guide?.sections);

  return sections
    .flatMap((section, sectionIndex) => {
      const sectionTitle = asString(section.title, `Bölüm ${sectionIndex + 1}`);
      return asArray<unknown>(section.questions)
        .map((question, questionIndex) => ({
          questionRef: `question-${sectionIndex + 1}-${questionIndex + 1}`,
          section: sectionTitle,
          questionText: asString(question),
          order: sectionIndex * 100 + questionIndex,
        }))
        .filter((entry) => entry.questionText.length > 0);
    })
    .slice(0, MAX_SYNTHETIC_QUESTIONS);
};

const selectSyntheticPersonas = async (
  topic: string,
  requestedPersonaIds: string[],
  sampleSize: number,
) => {
  const pool = await loadNemotronSyntheticPersonaPool(topic);
  const localizedPool = pool.map((persona) => localizeSyntheticPersonaForTurkishDisplay(persona));
  const requestedSet = new Set(requestedPersonaIds.filter(Boolean));
  const requestedPersonas = localizedPool.filter((persona) => requestedSet.has(persona.id));
  const fallbackPersonas = localizedPool.filter((persona) => !requestedSet.has(persona.id));
  const selected = [...requestedPersonas, ...fallbackPersonas].slice(0, sampleSize);

  if (selected.length === 0) {
    return dedupeSyntheticPersonaNames(recommendSyntheticPersonas(topic)
      .flatMap((recommendation) => recommendation.personas)
      .map((persona) => localizeSyntheticPersonaForTurkishDisplay(persona))
      .slice(0, sampleSize));
  }

  return dedupeSyntheticPersonaNames(selected);
};

const buildFallbackSyntheticAnswer = (
  persona: SyntheticPersona,
  question: { section: string; questionText: string },
) =>
  `${persona.name} perspektifinden baktığımda bu konuda önce ihtiyacın aciliyetine, maliyete ve güven veren açıklamalara bakarım. ${question.section} bağlamında karar vermeden önce koşulları net görmek, riski anlamak ve süreci pratik tamamlayabilmek isterim. Belirsiz ifadeler veya fazla adım varsa bu seçeneği erteleyebilirim.`;

const requestSyntheticResearchAnswersForPersona = async ({
  openaiApiKey,
  project,
  persona,
  questions,
}: {
  openaiApiKey: string;
  project: Record<string, unknown>;
  persona: SyntheticPersona;
  questions: Array<{ questionRef: string; section: string; questionText: string }>;
}): Promise<Array<{ questionRef: string; responseText: string }>> => {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.55,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `${buildPersonaSystemPrompt(persona, project)}

Bu bir otomatik sentetik arastirma kosusudur.
Yanitin:
- Turkce olsun.
- Her soruya 2-4 cumleyle cevap ver.
- Bu personanin bakis acisini yansitsin.
- Gercek katilimci kaniti gibi davranmasin.
- Brezilya, Portekizce, sehir, eyalet veya belediye baglami soylemesin.
- Verilmeyen ekran, marka veya gizli bilgi uydurmasin.
- Gecerli JSON disinda metin yazma.`,
        },
        {
          role: "user",
          content: `Aşağıdaki araştırma sorularını bu sentetik persona perspektifinden cevapla.

Sorular:
${JSON.stringify(questions.map((question) => ({
  questionRef: question.questionRef,
  section: question.section,
  questionText: question.questionText,
})), null, 2)}

Sadece şu JSON şemasında dön:
{
  "answers": [
    { "questionRef": "question-1-1", "responseText": "2-4 cümlelik Türkçe cevap" }
  ]
}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Synthetic research answer failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  const content = asString(data?.choices?.[0]?.message?.content);
  const parsed = parseJsonObject(content);
  const rawAnswers = isRecord(parsed) ? asArray<Record<string, unknown>>(parsed.answers) : [];
  const answerMap = new Map(
    rawAnswers
      .map((answer) => [asString(answer.questionRef), asString(answer.responseText)] as [string, string])
      .filter(([questionRef, responseText]) => questionRef && responseText),
  );

  return questions.map((question) => ({
    questionRef: question.questionRef,
    responseText: answerMap.get(question.questionRef) || buildFallbackSyntheticAnswer(persona, question),
  }));
};

const mapWithConcurrency = async <T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
) => {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(concurrency, 1), items.length);

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }));

  return results;
};

const callReportLlm = async (input: {
  projectTitle: string;
  projectDescription: string;
  responses: Array<Record<string, unknown>>;
}) => {
  const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiApiKey) return null;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.25,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Sen sentetik persona kosusundan cikarimsal UX arastirma raporu hazirlayan bir analistsin.
Sadece verilen sentetik cevaplara dayan.
Tum cikti Turkce ve gecerli JSON olmali.
Her bulgu, tema ve oneri en az bir quoteId referansi icermeli.
Gercek katilimci kaniti gibi yazma; cikarimsal/sentetik dil kullan.`,
        },
        {
          role: "user",
          content: `Proje:
${JSON.stringify({ title: input.projectTitle, description: input.projectDescription }, null, 2)}

Sentetik cevap katalogu:
${JSON.stringify(input.responses, null, 2)}

Sadece su JSON semasinda yanit ver:
{
  "executiveSummary": "kisa ozet",
  "findings": [{"title":"", "summary":"", "quoteIds":["quote-1"], "questionRefs":["question-1"], "sessionRefs":["persona-1"]}],
  "themes": [{"title":"", "description":"", "quoteIds":["quote-1"], "questionRefs":["question-1"]}],
  "recommendations": [{"title":"", "description":"", "priority":"high|medium|low", "quoteIds":["quote-1"], "linkedFindingTitles":[""]}],
  "questionInsights": [{"questionRef":"question-1", "summary":"", "quoteIds":["quote-1"]}],
  "participantSummaries": [{"sessionRef":"persona-1", "summary":"", "quoteIds":["quote-1"]}]
}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Synthetic report generation failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  const content = asString(data?.choices?.[0]?.message?.content);
  return content ? JSON.parse(content) : null;
};

const clampPriority = (value: unknown): "high" | "medium" | "low" => {
  if (value === "high" || value === "medium" || value === "low") return value;
  return "medium";
};

const sanitizeIdList = (values: unknown, allowed: Set<string>) =>
  Array.from(new Set(asArray<string>(values).filter((value) => typeof value === "string" && allowed.has(value))));

const buildDistribution = (responses: Array<{ response_text: string }>) => {
  const buckets = [
    { label: "Olumlu / kolay", value: 0, terms: ["kolay", "güven", "güvenli", "anlaşılır", "net", "beğen", "rahat"] },
    { label: "Kararsız / koşullu", value: 0, terms: ["kararsız", "emin değil", "duruma", "ama", "ancak", "koşul"] },
    { label: "Olumsuz / riskli", value: 0, terms: ["zor", "karmaşık", "güvensiz", "endişe", "tereddüt", "rahatsız", "risk"] },
  ];

  responses.forEach((response) => {
    const normalized = response.response_text.toLocaleLowerCase("tr-TR");
    const match = buckets.find((bucket) => bucket.terms.some((term) => normalized.includes(term)));
    if (match) {
      match.value += 1;
    } else {
      buckets[1].value += 1;
    }
  });

  const total = Math.max(responses.length, 1);
  return buckets.map(({ label, value }) => ({
    label,
    value,
    percent: roundToOneDecimal((value / total) * 100),
  }));
};

const buildSyntheticReport = async ({
  project,
  run,
  questions,
  responses,
}: {
  project: Record<string, unknown>;
  run: Record<string, unknown>;
  questions: Array<{ questionRef: string; section: string; questionText: string; order: number }>;
  responses: SyntheticResearchResponseRow[];
}) => {
  const personaRefs = new Map<string, string>();
  const personaSnapshots = new Map<string, SyntheticPersona>();
  responses.forEach((response) => {
    if (!personaRefs.has(response.persona_id)) {
      personaRefs.set(response.persona_id, `persona-${personaRefs.size + 1}`);
    }
    if (isRecord(response.persona_snapshot)) {
      personaSnapshots.set(response.persona_id, response.persona_snapshot as SyntheticPersona);
    }
  });

  const quoteCatalog = responses.map((response, index) => {
    const persona = personaSnapshots.get(response.persona_id);
    return {
      quoteId: `quote-${index + 1}`,
      responseId: response.id,
      sessionId: response.persona_id,
      sessionRef: personaRefs.get(response.persona_id) || response.persona_id,
      participantId: null,
      participantLabel: persona?.name || "Sentetik kullanıcı",
      questionId: response.question_ref,
      questionRef: response.question_ref,
      questionText: response.question_text,
      section: response.section,
      text: truncateText(response.response_text),
      audioUrl: null,
      audioMimeType: null,
      audioPrivacyTransform: null,
      audioDurationMs: null,
      transcriptSegments: [],
      videoUrl: null,
      videoDurationMs: null,
      syntheticPersonaId: response.persona_id,
      syntheticPersonaName: persona?.name || null,
    };
  });

  const quoteIdSet = new Set(quoteCatalog.map((quote) => quote.quoteId));
  const questionRefSet = new Set(questions.map((question) => question.questionRef));
  const personaRefSet = new Set(Array.from(personaRefs.values()));
  const llmInput = quoteCatalog.map((quote) => ({
    quoteId: quote.quoteId,
    sessionRef: quote.sessionRef,
    participantLabel: quote.participantLabel,
    questionRef: quote.questionRef,
    section: quote.section,
    questionText: quote.questionText,
    text: quote.text,
  }));

  const llmResult = await callReportLlm({
    projectTitle: asString(project.title, "Sentetik Araştırma"),
    projectDescription: asString(project.description),
    responses: llmInput,
  }).catch((error) => {
    console.error("[synthetic-users] synthetic report LLM failed", error instanceof Error ? error.message : error);
    return null;
  });

  const rawFindings = asArray<Record<string, unknown>>(llmResult?.findings);
  const findings = rawFindings
    .map((finding, index) => ({
      id: `finding-${index + 1}`,
      title: asString(finding.title, `Sentetik bulgu ${index + 1}`),
      summary: asString(finding.summary),
      quoteIds: sanitizeIdList(finding.quoteIds, quoteIdSet),
      questionRefs: sanitizeIdList(finding.questionRefs, questionRefSet),
      sessionRefs: sanitizeIdList(finding.sessionRefs, personaRefSet),
    }))
    .filter((finding) => finding.summary && finding.quoteIds.length > 0)
    .map((finding) => ({ ...finding, evidenceCount: finding.quoteIds.length }));

  const findingTitleToId = new Map(findings.map((finding) => [normalizeTitle(finding.title), finding.id]));
  const themes = asArray<Record<string, unknown>>(llmResult?.themes)
    .map((theme, index) => {
      const quoteIds = sanitizeIdList(theme.quoteIds, quoteIdSet);
      return {
        id: `theme-${index + 1}`,
        title: asString(theme.title, `Sentetik tema ${index + 1}`),
        description: asString(theme.description),
        quoteIds,
        questionRefs: sanitizeIdList(theme.questionRefs, questionRefSet),
        evidenceCount: quoteIds.length,
      };
    })
    .filter((theme) => theme.description && theme.quoteIds.length > 0);

  const recommendations = asArray<Record<string, unknown>>(llmResult?.recommendations)
    .map((recommendation, index) => ({
      id: `recommendation-${index + 1}`,
      title: asString(recommendation.title, `Sentetik öneri ${index + 1}`),
      description: asString(recommendation.description),
      priority: clampPriority(recommendation.priority),
      quoteIds: sanitizeIdList(recommendation.quoteIds, quoteIdSet),
      linkedFindingIds: asArray<string>(recommendation.linkedFindingTitles)
        .map((title) => findingTitleToId.get(normalizeTitle(title)))
        .filter((value): value is string => Boolean(value)),
    }))
    .filter((recommendation) => recommendation.description && recommendation.quoteIds.length > 0);

  const questionInsights = new Map(
    asArray<Record<string, unknown>>(llmResult?.questionInsights)
      .map((entry) => [asString(entry.questionRef), {
        summary: asString(entry.summary),
        quoteIds: sanitizeIdList(entry.quoteIds, quoteIdSet),
      }] as [string, { summary: string; quoteIds: string[] }])
      .filter(([questionRef]) => questionRef.length > 0),
  );

  const participantSummaries = new Map(
    asArray<Record<string, unknown>>(llmResult?.participantSummaries)
      .map((entry) => [asString(entry.sessionRef), {
        summary: asString(entry.summary),
        quoteIds: sanitizeIdList(entry.quoteIds, quoteIdSet),
      }] as [string, { summary: string; quoteIds: string[] }])
      .filter(([sessionRef]) => sessionRef.length > 0),
  );

  const questionBreakdown = questions.map((question) => {
    const questionResponses = responses.filter((response) => response.question_ref === question.questionRef);
    const matchingQuoteIds = quoteCatalog
      .filter((quote) => quote.questionRef === question.questionRef)
      .map((quote) => quote.quoteId)
      .slice(0, 4);
    const insight = questionInsights.get(question.questionRef);
    return {
      questionRef: question.questionRef,
      section: question.section,
      questionText: question.questionText,
      sessionCount: personaRefs.size,
      answeredResponseCount: questionResponses.length,
      skippedResponseCount: 0,
      coverageRate: personaRefs.size > 0 ? roundToOneDecimal((questionResponses.length / personaRefs.size) * 100) : 0,
      averageResponseDurationMs: null,
      summary: insight?.summary || "",
      quoteIds: insight?.quoteIds.length ? insight.quoteIds : matchingQuoteIds,
    };
  });

  const participantBreakdown = Array.from(personaRefs.entries()).map(([personaId, personaRef]) => {
    const persona = personaSnapshots.get(personaId);
    const personaQuotes = quoteCatalog.filter((quote) => quote.syntheticPersonaId === personaId).map((quote) => quote.quoteId);
    const summary = participantSummaries.get(personaRef);
    return {
      sessionId: personaId,
      sessionRef: personaRef,
      participantId: null,
      participantLabel: persona?.name || "Sentetik kullanıcı",
      status: "completed",
      responseCount: personaQuotes.length,
      answeredResponseCount: personaQuotes.length,
      skippedResponseCount: 0,
      averageResponseDurationMs: null,
      sessionDurationMs: null,
      hasAudioEvidence: false,
      hasVideoEvidence: false,
      screenRecordingUrl: null,
      screenRecordingMimeType: null,
      screenRecordingDurationMs: null,
      screenRecordingMetadata: null,
      summary: summary?.summary || persona?.context || "",
      quoteIds: summary?.quoteIds.length ? summary.quoteIds : personaQuotes.slice(0, 4),
    };
  });

  const inferentialSections = questions.slice(0, 8).map((question, index) => {
    const questionResponses = responses.filter((response) => response.question_ref === question.questionRef);
    const quoteIds = quoteCatalog
      .filter((quote) => quote.questionRef === question.questionRef)
      .map((quote) => quote.quoteId)
      .slice(0, 4);
    return {
      id: `inferential-${index + 1}`,
      title: question.questionText,
      summary: questionInsights.get(question.questionRef)?.summary ||
        `${questionResponses.length} sentetik persona bu soruya yanıt verdi; dağılım cevap metinlerindeki duygu ve risk sinyallerinden çıkarımsal olarak hesaplandı.`,
      chartTitle: "Sentetik tepki dağılımı",
      chartData: buildDistribution(questionResponses),
      quoteIds,
    };
  });

  const responseCount = responses.length;
  const completedAt = new Date().toISOString();

  return {
    interviewMode: "synthetic",
    status: responseCount === 0 ? "empty" : "ready",
    version: 1,
    generatedAt: completedAt,
    generatedFrom: "synthetic-personas",
    sourceStats: {
      invitedParticipantCount: personaRefs.size,
      joinedParticipantCount: personaRefs.size,
      completedParticipantCount: personaRefs.size,
      totalSessionCount: personaRefs.size,
      completedSessionCount: personaRefs.size,
      pendingSessionCount: 0,
      questionTemplateCount: questions.length,
      questionInstanceCount: questions.length * personaRefs.size,
      responsesAnalyzed: responseCount,
      skippedResponseCount: 0,
      quoteCount: quoteCatalog.length,
    },
    overview: {
      invitedParticipantCount: personaRefs.size,
      joinedParticipantCount: personaRefs.size,
      completedParticipantCount: personaRefs.size,
      joinRate: 100,
      completionRate: 100,
      skipRate: 0,
      averageResponseDurationMs: null,
      averageSessionDurationMs: null,
      averageResponsesPerCompletedSession: personaRefs.size > 0 ? roundToOneDecimal(responseCount / personaRefs.size) : 0,
    },
    executiveSummary: asString(llmResult?.executiveSummary) ||
      `${personaRefs.size} sentetik persona, ${questions.length} araştırma sorusu üzerinden koşturuldu. Bu çıktı gerçek katılımcı kanıtı değil, karar öncesi çıkarımsal simülasyondur.`,
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
    syntheticMeta: {
      runId: asString(run.id),
      dataset: SYNTHETIC_DATASET,
      sampleSize: Number(run.persona_count) || personaRefs.size,
      personaCount: personaRefs.size,
      questionCount: questions.length,
      responseCount,
      disclaimer: "Sentetik kullanıcı çıktıları gerçek katılımcı kanıtı değildir; yalnızca çıkarımsal araştırma simülasyonu olarak kullanılmalıdır.",
    },
    inferentialSections,
    generationMeta: {
      trigger: "synthetic-run",
      triggerSessionId: null,
      generatedBy: MODEL,
      llmUsed: Boolean(llmResult),
      analyzedSessionIds: Array.from(personaRefs.keys()),
      analyzedResponseIds: responses.map((response) => response.id),
      failureMessage: null,
    },
  };
};

const requestChatReply = async ({
  openaiApiKey,
  persona,
  project,
  history,
  message,
}: {
  openaiApiKey: string;
  persona: SyntheticPersona;
  project: Record<string, unknown>;
  history: Array<{ role: string; content: string }>;
  message: string;
}) => {
  const messages = [
    { role: "system", content: buildPersonaSystemPrompt(persona, project) },
    ...history.slice(-10).map((entry) => ({
      role: entry.role === "synthetic_user" ? "assistant" : "user",
      content: entry.content,
    })),
    { role: "user", content: message },
  ];

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Synthetic chat failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return asString(data?.choices?.[0]?.message?.content);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const action = asString(payload.action);
    const projectId = asString(payload.projectId);

    if (!projectId || !action) {
      return json({ error: "projectId and action are required" }, 400);
    }

    const access = await validateProjectOwner(projectId, parseBearerToken(req));
    if (!access) {
      return json({ error: "Unauthorized synthetic user request" }, 403);
    }

    if (action === "recommend") {
      try {
        const topic = buildTopic(access.project);
        const nemotronPersonas = await loadNemotronSyntheticPersonaPool(topic);
        return json({
          recommendations: dedupeSyntheticPersonaRecommendationNames(recommendSyntheticPersonas(topic, 4, nemotronPersonas)),
          source: "nvidia/Nemotron-Personas-Brazil",
        });
      } catch (error) {
        console.error("[synthetic-users] Nemotron dataset fallback", error instanceof Error ? error.message : error);
      }

      return json({
        recommendations: dedupeSyntheticPersonaRecommendationNames(recommendSyntheticPersonas(buildTopic(access.project))),
        source: "local_fallback",
      });
    }

    if (action === "list_sessions") {
      const { data: sessions, error: sessionsError } = await supabase
        .from("synthetic_user_sessions")
        .select("*")
        .eq("project_id", projectId)
        .eq("user_id", access.user.id)
        .order("created_at", { ascending: false });

      if (sessionsError) throw new Error(`Failed to load synthetic sessions: ${sessionsError.message}`);

      const sessionIds = (sessions ?? []).map((session) => session.id);
      const { data: messages, error: messagesError } = sessionIds.length > 0
        ? await supabase
          .from("synthetic_user_messages")
          .select("id, session_id, role, content, created_at")
          .in("session_id", sessionIds)
          .order("created_at", { ascending: true })
        : { data: [], error: null };

      if (messagesError) throw new Error(`Failed to load synthetic messages: ${messagesError.message}`);
      return json({ sessions: sessions ?? [], messages: messages ?? [] });
    }

    if (action === "get_research_run") {
      const { data: run, error: runError } = await supabase
        .from("synthetic_research_runs")
        .select("*")
        .eq("project_id", projectId)
        .eq("user_id", access.user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (runError) {
        if (isMissingSyntheticResearchTableError(runError)) {
          const analysis = isRecord(access.project.analysis) ? access.project.analysis : {};
          const syntheticUsers = isRecord(analysis.syntheticUsers) ? analysis.syntheticUsers : {};
          return json({
            run: null,
            responses: [],
            report: isRecord(syntheticUsers.report) ? syntheticUsers.report : null,
          });
        }
        throw new Error(`Failed to load synthetic research run: ${runError.message}`);
      }

      const { data: responses, error: responsesError } = run?.id
        ? await supabase
          .from("synthetic_research_responses")
          .select("*")
          .eq("run_id", run.id)
          .order("created_at", { ascending: true })
        : { data: [], error: null };

      if (responsesError) throw new Error(`Failed to load synthetic research responses: ${responsesError.message}`);

      return json({
        run: run ?? null,
        responses: responses ?? [],
        report: run?.report ?? null,
      });
    }

    if (action === "run_research") {
      const questions = extractDiscussionGuideQuestions(access.project);
      if (questions.length === 0) {
        return json({ error: "Synthetic research requires a generated discussion guide" }, 400);
      }

      const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
      if (!openaiApiKey) {
        throw new Error("OPENAI_API_KEY is not set");
      }

      const topic = buildTopic(access.project);
      const requestedPersonaIds = asArray<string>(payload.personaIds).filter((value) => typeof value === "string");
      const sampleSize = clampSyntheticSampleSize(payload.sampleSize);
      const personas = await selectSyntheticPersonas(topic, requestedPersonaIds, sampleSize);

      if (personas.length === 0) {
        return json({ error: "Synthetic personas could not be loaded" }, 500);
      }

      const { data: persistedRun, error: runError } = await supabase
        .from("synthetic_research_runs")
        .insert({
          project_id: projectId,
          user_id: access.user.id,
          status: "running",
          persona_count: personas.length,
          question_count: questions.length,
          response_count: 0,
        })
        .select("*")
        .single();

      const tableBackedRun = !runError;
      if (runError && !isMissingSyntheticResearchTableError(runError)) {
        throw new Error(`Failed to create synthetic research run: ${runError.message}`);
      }

      const run = persistedRun ?? {
        id: crypto.randomUUID(),
        project_id: projectId,
        user_id: access.user.id,
        status: "running",
        persona_count: personas.length,
        question_count: questions.length,
        response_count: 0,
        report: null,
        error_message: null,
        created_at: new Date().toISOString(),
        completed_at: null,
      };

      try {
        const personaAnswerBatches = await mapWithConcurrency(
          personas,
          SYNTHETIC_PERSONA_BATCH_CONCURRENCY,
          async (persona) => {
            const answers = await requestSyntheticResearchAnswersForPersona({
              openaiApiKey,
              project: access.project,
              persona,
              questions,
            }).catch((error) => {
              console.error(
                "[synthetic-users] persona batch answer failed",
                persona.id,
                error instanceof Error ? error.message : error,
              );
              return questions.map((question) => ({
                questionRef: question.questionRef,
                responseText: buildFallbackSyntheticAnswer(persona, question),
              }));
            });

            return answers.map((answer): SyntheticResearchResponseRow | null => {
              const question = questions.find((entry) => entry.questionRef === answer.questionRef);
              if (!question || !answer.responseText) return null;

              return {
                id: crypto.randomUUID(),
                run_id: run.id,
                project_id: projectId,
                user_id: access.user.id,
                persona_id: persona.id,
                persona_snapshot: sanitizePersonaSnapshot(persona),
                question_ref: question.questionRef,
                section: question.section,
                question_text: question.questionText,
                response_text: answer.responseText,
              };
            }).filter((row): row is SyntheticResearchResponseRow => Boolean(row));
          },
        );

        const responseRows = personaAnswerBatches.flat();

        const { data: insertedResponses, error: insertResponsesError } = tableBackedRun && responseRows.length > 0
          ? await supabase
            .from("synthetic_research_responses")
            .insert(responseRows)
            .select("*")
          : { data: responseRows, error: null };

        if (insertResponsesError && !isMissingSyntheticResearchTableError(insertResponsesError)) {
          throw new Error(`Failed to store synthetic research responses: ${insertResponsesError.message}`);
        }

        const normalizedResponses = insertResponsesError ? responseRows : insertedResponses ?? [];

        const report = await buildSyntheticReport({
          project: access.project,
          run,
          questions,
          responses: normalizedResponses,
        });

        const completedAt = new Date().toISOString();
        const { data: updatedRun, error: updateRunError } = tableBackedRun
          ? await supabase
            .from("synthetic_research_runs")
            .update({
              status: "completed",
              response_count: normalizedResponses.length,
              report,
              completed_at: completedAt,
            })
            .eq("id", run.id)
            .select("*")
            .single()
          : {
            data: {
              ...run,
              status: "completed",
              response_count: normalizedResponses.length,
              report,
              completed_at: completedAt,
            },
            error: null,
          };

        if (updateRunError) throw new Error(`Failed to complete synthetic research run: ${updateRunError.message}`);

        const analysis = isRecord(access.project.analysis) ? access.project.analysis : {};
        const syntheticUsers = isRecord(analysis.syntheticUsers) ? analysis.syntheticUsers : {};
        const nextAnalysis = {
          ...analysis,
          workflowStage: "analyze",
          syntheticUsers: {
            ...syntheticUsers,
            enabled: true,
            source: SYNTHETIC_DATASET,
            sampleSize,
            lastRunId: run.id,
            report,
            updatedAt: completedAt,
          },
          updatedAt: completedAt,
        };

        const { error: projectUpdateError } = await supabase
          .from("projects")
          .update({ analysis: nextAnalysis })
          .eq("id", projectId)
          .eq("user_id", access.user.id);

        if (projectUpdateError) {
          throw new Error(`Failed to persist synthetic report: ${projectUpdateError.message}`);
        }

        return json({
          run: updatedRun,
          responses: normalizedResponses,
          report,
        });
      } catch (error) {
        if (tableBackedRun) {
          await supabase
            .from("synthetic_research_runs")
            .update({
              status: "failed",
              error_message: error instanceof Error ? error.message : "Synthetic research run failed",
              completed_at: new Date().toISOString(),
            })
            .eq("id", run.id);
        }
        throw error;
      }
    }

    if (action === "start_session") {
      const personaId = asString(payload.personaId);
      const persona = findPersonaById(personaId) ?? parsePersonaSnapshot(payload.personaSnapshot);
      if (!persona) {
        return json({ error: "Unknown synthetic persona" }, 400);
      }
      const localizedPersona = localizeSyntheticPersonaForTurkishDisplay(persona);

      const { data: session, error } = await supabase
        .from("synthetic_user_sessions")
        .insert({
          project_id: projectId,
          user_id: access.user.id,
          persona_id: localizedPersona.id,
          persona_snapshot: sanitizePersonaSnapshot(localizedPersona),
          title: `${localizedPersona.name} - ${localizedPersona.group}`,
        })
        .select("*")
        .single();

      if (error) throw new Error(`Failed to create synthetic session: ${error.message}`);
      return json({ session, messages: [] });
    }

    if (action === "send_message") {
      const sessionId = asString(payload.sessionId);
      const message = asString(payload.message);
      if (!sessionId || !message) {
        return json({ error: "sessionId and message are required" }, 400);
      }

      const session = await loadSession(sessionId, projectId, access.user.id);
      if (!session) {
        return json({ error: "Synthetic session not found" }, 404);
      }

      const persona = localizeSyntheticPersonaForTurkishDisplay(
        findPersonaById(session.persona_id) ?? session.persona_snapshot as SyntheticPersona,
      );
      const history = await loadMessages(sessionId);

      const { error: researcherInsertError } = await supabase
        .from("synthetic_user_messages")
        .insert({
          session_id: sessionId,
          project_id: projectId,
          user_id: access.user.id,
          role: "researcher",
          content: message,
        });

      if (researcherInsertError) throw new Error(`Failed to store researcher message: ${researcherInsertError.message}`);

      const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
      if (!openaiApiKey) {
        throw new Error("OPENAI_API_KEY is not set");
      }

      const answer = await requestChatReply({
        openaiApiKey,
        persona,
        project: access.project,
        history,
        message,
      });

      if (answer) {
        await supabase.from("synthetic_user_messages").insert({
          session_id: sessionId,
          project_id: projectId,
          user_id: access.user.id,
          role: "synthetic_user",
          content: answer,
        });
      }

      return json({ reply: answer });
    }

    return json({ error: "Unknown synthetic user action" }, 400);
  } catch (error) {
    console.error("[synthetic-users] request failed", error instanceof Error ? error.message : error);
    return json({ error: error instanceof Error ? error.message : "Synthetic user request failed" }, 500);
  }
});
