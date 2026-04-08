export const WARMUP_SECTION_TITLE = "Isınma";
export const WARMUP_SECTION_ID = "warmup_context";

export type QuestionReviewStatus = "strong" | "caution" | "problematic";

export interface QuestionReviewIssue {
  code: string;
  label: string;
  detail: string;
  severity: "caution" | "problematic";
}

export interface QuestionReviewCheck {
  label: string;
  passed: boolean;
}

export interface QuestionReviewResult {
  status: QuestionReviewStatus;
  summary: string;
  issues: QuestionReviewIssue[];
  checks: Record<string, QuestionReviewCheck>;
}

const normalizeForMatch = (value: string) =>
  value
    .toLocaleLowerCase("tr-TR")
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ş/g, "s")
    .replace(/ü/g, "u")
    .replace(/\s+/g, " ")
    .trim();

export const cleanQuestion = (value: string) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");

export const isWarmupSectionTitle = (title: string) => {
  const normalized = normalizeForMatch(title || "");

  return [
    "isinma",
    "baglam",
    "tanisma",
    "giris",
    "ilk sohbet",
    "ilk temas",
    "ilk baglam",
  ].some((pattern) => normalized.includes(pattern));
};

const hasWarmupQuestionTone = (question: string) => {
  const normalized = normalizeForMatch(question);

  return [
    "bugun gununuz nasil",
    "gununuz nasil gec",
    "buraya gelmeden once",
    "gundelik rutininiz",
    "günlük rutininiz",
    "bu konuyla en son ne zaman",
    "hayatinizda ne kadar yer tut",
    "kendinizden biraz",
  ].some((pattern) => normalized.includes(pattern));
};

export const isWarmupSection = (sectionLike: { title?: string; questions?: string[] } | null | undefined) => {
  if (!sectionLike) {
    return false;
  }

  if (isWarmupSectionTitle(sectionLike.title || "")) {
    return true;
  }

  return Array.isArray(sectionLike.questions) && sectionLike.questions.some(hasWarmupQuestionTone);
};

export const buildWarmupQuestions = () => [
  "Bugün gününüz nasıl geçiyor, buraya gelmeden önce neler yapıyordunuz?",
  "Bu konunun günlük hayatınızda ne kadar yer tuttuğunu biraz anlatır mısınız?",
  "Bu konuyla en son ne zaman karşılaştığınızı kendi cümlelerinizle paylaşır mısınız?",
];

const dedupeQuestions = (questions: string[]) => {
  const seen = new Set<string>();

  return questions.filter((question) => {
    const normalized = normalizeForMatch(question);
    if (!normalized || seen.has(normalized)) {
      return false;
    }

    seen.add(normalized);
    return true;
  });
};

export const buildFallbackQuestions = (sectionTitle: string, sectionIndex?: number) => {
  const normalizedTitle = normalizeForMatch(sectionTitle || "");
  const isWarmup = sectionIndex === 0 || isWarmupSectionTitle(sectionTitle || "");

  if (isWarmup) {
    return buildWarmupQuestions();
  }

  if (normalizedTitle.includes("ilk izlenim") || normalizedTitle.includes("ilk algi")) {
    return [
      "Bu ekranı ilk gördüğünüzde dikkatinizi en çok ne çekti?",
      "İlk bakışta burada size ne anlatılmak istendiğini nasıl yorumladınız?",
      "Bu ilk görünümde size en az net gelen nokta neydi?",
    ];
  }

  if (normalizedTitle.includes("son dusunce") || normalizedTitle.includes("iyilestirme")) {
    return [
      "Bu deneyimi genel olarak nasıl özetlersiniz?",
      "Bu deneyimde sizin için en önemli nokta neydi?",
      "Bir şeyi değiştirebilseydiniz ilk nereden başlardınız?",
    ];
  }

  return [
    "Bu bölümde dikkatinizi en çok ne çekti?",
    "Buradaki deneyimi kendi cümlelerinizle anlatır mısınız?",
    "Bu bölüm size neyi düşündürdü?",
  ];
};

const hasYesNoEnding = (normalized: string) => {
  if (/( musunuz| misiniz| mısınız| musun| misin| mısın| mu| mi| mı| mü)\??$/.test(normalized)) {
    return true;
  }

  return [
    "oldu mu",
    "geldi mi",
    "verdi mi",
    "biliyor musunuz",
    "anliyor musunuz",
    "anlıyor musunuz",
    "memnun musunuz",
    "güven verdi mi",
    "guven verdi mi",
    "yeterli mi",
    "etkiliyor mu",
    "tercih eder miydiniz",
  ].some((pattern) => normalized.includes(pattern));
};

const hasLeadingLanguage = (normalized: string) =>
  [
    "ikna edici",
    "guven ver",
    "güven ver",
    "karisiklik",
    "karışıklık",
    "sorun",
    "problem",
    "eksik",
    "rahatsiz eden",
    "rahatsız eden",
    "durduran bir sey oldu mu",
  ].some((pattern) => normalized.includes(pattern));

const hasAssumptiveLanguage = (normalized: string) =>
  [
    "hangi sorun",
    "hangi problem",
    "hangi endise",
    "hangi endişe",
    "hangi tereddut",
    "hangi tereddüt",
    "neden zorland",
    "hangi noktada zorland",
    "neden karisti",
    "neden karıştı",
    "hangi bolum yetersiz",
    "hangi bölüm yetersiz",
    "hangi bolum eksik",
    "hangi bölüm eksik",
  ].some((pattern) => normalized.startsWith(pattern));

const hasDoubleBarrelStructure = (normalized: string) => {
  const multiPromptPatterns = [
    /ne .* ve ne /,
    /nasil .* ve nasil /,
    /hangi .* ve hangi /,
    /ne kadar .* ve ne kadar /,
    /hem .* hem /,
  ];

  if (multiPromptPatterns.some((pattern) => pattern.test(normalized))) {
    return true;
  }

  return /\bve\b/.test(normalized) && /(neden|nasil|hangi|ne)\b.*\bve\b.*\b(neden|nasil|hangi|ne)\b/.test(normalized);
};

const hasStandaloneVe = (normalized: string) => /\bve\b/.test(normalized);

const hasHeavyJargon = (normalized: string) =>
  [
    "onboarding",
    "cta",
    "conversion",
    "drop-off",
    "dropoff",
    "funnel",
    "kpi",
    "nps",
    "ux",
    "ui",
  ].some((pattern) => normalized.includes(pattern));

const getWordCount = (question: string) => cleanQuestion(question).split(/\s+/).filter(Boolean).length;

export const assessQuestionQuality = ({
  question,
  sectionTitle = "",
  sectionIndex,
}: {
  question: string;
  sectionTitle?: string;
  sectionIndex?: number;
}): QuestionReviewResult => {
  const cleanedQuestion = cleanQuestion(question);
  const normalized = normalizeForMatch(cleanedQuestion);
  const wordCount = getWordCount(cleanedQuestion);
  const warmupSection = sectionIndex === 0 || isWarmupSectionTitle(sectionTitle);
  const issues: QuestionReviewIssue[] = [];

  const openEnded = !hasYesNoEnding(normalized);
  const neutral = !hasLeadingLanguage(normalized) && !hasAssumptiveLanguage(normalized);
  const nonLeading = !hasLeadingLanguage(normalized);
  const nonAssumptive = !hasAssumptiveLanguage(normalized);
  const singleFocus = !hasDoubleBarrelStructure(normalized);
  const noStandaloneVe = !hasStandaloneVe(normalized);
  const clarity = wordCount >= 6 && wordCount <= 28 && cleanedQuestion.endsWith("?");
  const jargonFree = !hasHeavyJargon(normalized);
  const warmupFit = !warmupSection || hasWarmupQuestionTone(cleanedQuestion);

  if (!openEnded) {
    issues.push({
      code: "yes_no",
      label: "Kapalı uçlu",
      detail: "Soru evet/hayır cevabına fazla yakın duruyor.",
      severity: "problematic",
    });
  }

  if (!nonLeading) {
    issues.push({
      code: "leading",
      label: "Yönlendirici dil",
      detail: "Soru kullanıcıya sorun, güven veya yargı empoze ediyor olabilir.",
      severity: "problematic",
    });
  }

  if (!nonAssumptive) {
    issues.push({
      code: "assumptive",
      label: "Varsayım içeriyor",
      detail: "Soru kullanıcının belirli bir sorun yaşadığını peşinen kabul ediyor.",
      severity: "problematic",
    });
  }

  if (!singleFocus) {
    issues.push({
      code: "double_barreled",
      label: "Tek odaklı değil",
      detail: "Soru aynı anda birden fazla şeyi sormaya çalışıyor.",
      severity: "caution",
    });
  }

  if (!noStandaloneVe) {
    issues.push({
      code: "contains_ve",
      label: '"ve" ile kurulmuş',
      detail: 'Soru metninde "ve" geçtiğinde iki farklı odağı tek soruda birleştirme riski artıyor.',
      severity: "problematic",
    });
  }

  if (!clarity) {
    issues.push({
      code: "clarity",
      label: "Netlik zayıf",
      detail: "Soru fazla kısa, fazla uzun veya konuşma dilinde akmıyor.",
      severity: "caution",
    });
  }

  if (!jargonFree) {
    issues.push({
      code: "jargon",
      label: "Jargon riski",
      detail: "Katılımcının anlamakta zorlanabileceği ürün veya ekip dili içeriyor olabilir.",
      severity: "caution",
    });
  }

  if (!warmupFit) {
    issues.push({
      code: "warmup_tone",
      label: "Isınma tonu zayıf",
      detail: "İlk bölüm için soru fazla direkt; önce kullanıcıyı sohbete alıştıran bir giriş sorusu daha uygun olur.",
      severity: "caution",
    });
  }

  const problematicCount = issues.filter((issue) => issue.severity === "problematic").length;
  const cautionCount = issues.filter((issue) => issue.severity === "caution").length;

  let status: QuestionReviewStatus = "strong";
  let summary = "Soru nötr, açık uçlu ve görüşme akışına uygun görünüyor.";

  if (problematicCount > 0) {
    status = "problematic";
    summary = "Soru şu haliyle yönlendirici veya kapalı uçlu kaldığı için zayıf görünüyor.";
  } else if (cautionCount > 0) {
    status = "caution";
    summary = "Soru kullanılabilir, ama ifadeyi biraz daha temizlemek kaliteyi artırır.";
  }

  return {
    status,
    summary,
    issues,
    checks: {
      open_ended: { label: "Açık uçlu", passed: openEnded },
      neutral: { label: "Nötr", passed: neutral },
      non_leading: { label: "Yönlendirmesiz", passed: nonLeading },
      non_assumptive: { label: "Varsayımsız", passed: nonAssumptive },
      single_focus: { label: "Tek odaklı", passed: singleFocus },
      no_standalone_ve: { label: '"ve" içermiyor', passed: noStandaloneVe },
      clarity: { label: "Net", passed: clarity },
      warmup_fit: { label: "Isınma akışına uygun", passed: warmupFit },
    },
  };
};

export const shouldRejectGeneratedQuestion = (review: QuestionReviewResult) =>
  review.issues.some((issue) => issue.severity === "problematic");

export const sanitizeGeneratedQuestions = (
  questions: string[],
  context: { sectionTitle?: string; sectionIndex?: number } = {},
) => {
  const uniqueQuestions = dedupeQuestions(
    questions
      .map((question) => cleanQuestion(question))
      .filter(Boolean),
  );

  const valid: string[] = [];
  const rejected: string[] = [];

  uniqueQuestions.forEach((question) => {
    const review = assessQuestionQuality({
      question,
      sectionTitle: context.sectionTitle,
      sectionIndex: context.sectionIndex,
    });

    if (shouldRejectGeneratedQuestion(review)) {
      rejected.push(question);
      return;
    }

    valid.push(question);
  });

  return { valid, rejected };
};

export const repairGeneratedQuestions = (
  questions: string[],
  context: { sectionTitle?: string; sectionIndex?: number } = {},
) => {
  const { sectionTitle = "", sectionIndex } = context;
  const repaired = questions.map((question) => {
    const cleaned = cleanQuestion(question);
    if (!cleaned) {
      return "";
    }

    const review = assessQuestionQuality({
      question: cleaned,
      sectionTitle,
      sectionIndex,
    });

    if (shouldRejectGeneratedQuestion(review)) {
      return buildFallbackRewrite({
        question: cleaned,
        sectionTitle,
        sectionIndex,
      });
    }

    return cleaned;
  });

  const deduped = dedupeQuestions(repaired.filter(Boolean));
  const { valid } = sanitizeGeneratedQuestions(deduped, context);

  return valid;
};

export const ensureWarmupSection = (plan: any) => {
  if (!plan || !Array.isArray(plan.sections) || plan.sections.length === 0) {
    return plan;
  }

  const sections = [...plan.sections];
  const warmupIndex = sections.findIndex((section) => isWarmupSection(section));
  const extractedWarmup = warmupIndex >= 0 ? sections.splice(warmupIndex, 1)[0] : null;
  const warmupQuestions = dedupeQuestions([
    ...buildWarmupQuestions(),
    ...((Array.isArray(extractedWarmup?.questions) ? extractedWarmup.questions : []).map((question) => cleanQuestion(question))),
  ]).slice(0, 3);

  const warmupSection = {
    ...(extractedWarmup || {}),
    id: extractedWarmup?.id || WARMUP_SECTION_ID,
    title: WARMUP_SECTION_TITLE,
    questions: warmupQuestions,
  };

  return {
    ...plan,
    sections: [warmupSection, ...sections].slice(0, 4),
  };
};

export const buildFallbackRewrite = ({
  question,
  sectionTitle = "",
  sectionIndex,
}: {
  question: string;
  sectionTitle?: string;
  sectionIndex?: number;
}) => {
  const normalizedTitle = normalizeForMatch(sectionTitle);
  const warmupSection = sectionIndex === 0 || isWarmupSectionTitle(sectionTitle);

  if (warmupSection) {
    return buildWarmupQuestions()[0];
  }

  if (normalizedTitle.includes("ilk izlenim") || normalizedTitle.includes("ilk algi")) {
    return "Bu ekranı ilk gördüğünüzde sizde nasıl bir izlenim oluştu?";
  }

  if (normalizedTitle.includes("gorev") || normalizedTitle.includes("akis")) {
    return "Bu adımda ne yapmanız gerektiğini nasıl yorumladınız?";
  }

  if (normalizedTitle.includes("karar") || normalizedTitle.includes("anlas")) {
    return "Bu noktada kararınızı verirken hangi bilgiler öne çıktı?";
  }

  return "Bu deneyimi kendi cümlelerinizle nasıl anlatırsınız?";
};
