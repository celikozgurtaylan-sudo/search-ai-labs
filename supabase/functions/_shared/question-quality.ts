export const WARMUP_SECTION_TITLE = "Isınma";
export const WARMUP_SECTION_ID = "warmup_context";

export type ResearchQuestionMode = "structured" | "usability" | "interview" | "ai_enhanced";
export type QuestionSectionKind = "warmup" | "main";
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
  methodologyIssues: QuestionReviewIssue[];
  violatedMustRules: string[];
  checks: Record<string, QuestionReviewCheck>;
}

const BANNED_PARAPHRASE_PATTERNS = [
  "kendi cumlelerinizle",
  "kendi cümlelerinizle",
  "kendi sozlerinizle",
  "kendi sözlerinizle",
  "kendi kelimelerinizle",
];

const INTERPRETATION_PROMPTING_PATTERNS = [
  "nasil anliyorsunuz",
  "nasıl anlıyorsunuz",
  "nasil yorumluyorsunuz",
  "nasıl yorumluyorsunuz",
  "sizce ne demek",
  "sizce ne ifade ediyor",
];

const LABELLED_CONSTRUCT_PATTERNS = [
  "kisaltmalarini",
  "kısaltmalarını",
  "zaman dilimi kisaltmalarini",
  "zaman dilimi kısaltmalarını",
  "etiketlerini",
  "ibarelerini",
  "tereddutlerini",
  "tereddütlerini",
  "endiselerini",
  "endişelerini",
];

const LEADING_LANGUAGE_PATTERNS = [
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
];

const ASSUMPTIVE_LANGUAGE_PATTERNS = [
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
];

const YES_NO_ENDING_PATTERNS = [
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
];

const HEAVY_JARGON_PATTERNS = [
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
];

const USABILITY_CONTEXT_ANCHOR_PATTERNS = [
  "bu ekran",
  "ekranda",
  "ekrana",
  "burada",
  "bu adim",
  "bu adım",
  "adimda",
  "adımda",
  "bu noktada",
  "gorev",
  "görev",
  "akis",
  "akış",
  "karar verirken",
  "ilk gordugunuzde",
  "ilk gördüğünüzde",
  "ilk bakista",
  "ilk bakışta",
  "bu alan",
  "buton",
  "mesaj",
  "form",
];

const GENERIC_USABILITY_PATTERNS = [
  "bu deneyim sizde nasil bir izlenim birakiyor",
  "bu deneyim sizde ne hissettiriyor",
  "bu bolum sizde nasil bir izlenim birakiyor",
  "burasi sizde nasil bir izlenim birakiyor",
  "bu deneyimi nasil tarif edersiniz",
];

const METHODOLOGY_MUST_RULES_BY_CODE: Record<string, string> = {
  leading: "Katılımcıya sorun, duygu veya yargı empoze etme.",
  assumptive: "Katılımcının belirli bir deneyim yaşadığını peşinen varsayma.",
  yes_no: "Soru mümkün olduğunca açık uçlu olmalı.",
  contains_ve: "Tek soruda tek odak kullan; iki odağı ayır.",
  forced_paraphrase: "\"Kendi cümlelerinizle\" gibi zorlayıcı paraphrase kalıplarını kullanma.",
  interpretation_prompting: "\"Nasıl anlıyorsunuz\" gibi yorum yönlendirici kalıpları kullanma.",
  participant_framing: "UI öğesini kullanıcı adına etiketleyip sonra anlamını sorma.",
  labelled_construct: "Katılımcının zihnindeki kavramı önce sen isimlendirme.",
};

export const normalizeForMatch = (value: string) =>
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

export const cleanQuestion = (value: string) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";

const uniqueStrings = (values: string[]) => {
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = normalizeForMatch(value);
    if (!normalized || seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });
};

const findMatchedPatterns = (normalized: string, patterns: string[]) =>
  patterns.filter((pattern) => normalized.includes(normalizeForMatch(pattern)));

export const inferQuestionSectionKind = (sectionTitle = "", sectionIndex?: number): QuestionSectionKind =>
  sectionIndex === 0 || isWarmupSectionTitle(sectionTitle) ? "warmup" : "main";

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

export const resolveQuestionMode = ({
  researchMode,
  hasUsabilityContext = false,
}: {
  researchMode?: string | null;
  hasUsabilityContext?: boolean;
}): ResearchQuestionMode => {
  if (hasUsabilityContext) {
    return "usability";
  }

  if (researchMode === "ai_enhanced") {
    return "ai_enhanced";
  }

  if (researchMode === "structured") {
    return "structured";
  }

  return "interview";
};

export const buildWarmupQuestions = () => [
  "Bugün gününüz nasıl geçiyor, buraya gelmeden önce neler yapıyordunuz?",
  "Bu konu son dönemde günlük hayatınızda nasıl bir yer tutuyor?",
  "Bu konuyla en son karşılaştığınız anı biraz anlatır mısınız?",
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

export const buildFallbackQuestions = (
  sectionTitle: string,
  sectionIndex?: number,
  mode: ResearchQuestionMode = "interview",
) => {
  const normalizedTitle = normalizeForMatch(sectionTitle || "");
  const isWarmup = inferQuestionSectionKind(sectionTitle, sectionIndex) === "warmup";

  if (isWarmup) {
    return buildWarmupQuestions();
  }

  if (normalizedTitle.includes("ilk izlenim") || normalizedTitle.includes("ilk algi")) {
    return [
      "Bu ekranı ilk gördüğünüzde dikkatinizi ilk olarak ne çekti?",
      "İlk bakışta burada size en net gelen şey ne oldu?",
      "Bu ilk görünümde size en az net gelen nokta hangisiydi?",
    ];
  }

  if (normalizedTitle.includes("son dusunce") || normalizedTitle.includes("iyilestirme")) {
    return [
      "Bu deneyimi genel olarak nasıl özetlersiniz?",
      "Bu deneyimde sizin için en önemli nokta ne oldu?",
      "Bir şeyi değiştirebilseydiniz ilk nereden başlardınız?",
    ];
  }

  if (mode === "usability") {
    return [
      "Bu ekranda size en net gelen şey ne oldu?",
      "Burada ilk olarak ne yapmanız gerektiğini nasıl yorumladınız?",
      "Bu adımda kararınızı verirken hangi bilgi öne çıktı?",
    ];
  }

  return [
    "Bu bölümde ilk dikkatinizi çeken şey ne oldu?",
    "Burada size en net gelen nokta neydi?",
    "Bu bölüm sizde nasıl bir izlenim bıraktı?",
  ];
};

const hasYesNoEnding = (normalized: string) => {
  if (/( musunuz| misiniz| mısınız| musun| misin| mısın| mu| mi| mı| mü)\??$/.test(normalized)) {
    return true;
  }

  return YES_NO_ENDING_PATTERNS.some((pattern) => normalized.includes(normalizeForMatch(pattern)));
};

const hasLeadingLanguage = (normalized: string) =>
  LEADING_LANGUAGE_PATTERNS.some((pattern) => normalized.includes(normalizeForMatch(pattern)));

const hasAssumptiveLanguage = (normalized: string) =>
  ASSUMPTIVE_LANGUAGE_PATTERNS.some((pattern) => normalized.startsWith(normalizeForMatch(pattern)));

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
  HEAVY_JARGON_PATTERNS.some((pattern) => normalized.includes(normalizeForMatch(pattern)));

const hasUsabilityContextAnchor = (normalized: string) =>
  USABILITY_CONTEXT_ANCHOR_PATTERNS.some((pattern) => normalized.includes(normalizeForMatch(pattern)));

const hasGenericUsabilityPrompt = (normalized: string) =>
  GENERIC_USABILITY_PATTERNS.some((pattern) => normalized.includes(normalizeForMatch(pattern)));

const getWordCount = (question: string) => cleanQuestion(question).split(/\s+/).filter(Boolean).length;

const detectMethodologyMatches = (normalized: string) => {
  const forcedParaphraseMatches = findMatchedPatterns(normalized, BANNED_PARAPHRASE_PATTERNS);
  const interpretationPromptingMatches = findMatchedPatterns(normalized, INTERPRETATION_PROMPTING_PATTERNS);
  const labelledConstructMatches = findMatchedPatterns(normalized, LABELLED_CONSTRUCT_PATTERNS);
  const hasTokenGroup = /\([^)]+,[^)]+\)/.test(normalized) || /\([^)]+\)/.test(normalized);
  const participantFramingMatches =
    hasTokenGroup && labelledConstructMatches.length > 0
      ? uniqueStrings([...labelledConstructMatches, "etiketlenmis_ui_ogesi"])
      : [];

  return {
    forcedParaphraseMatches,
    interpretationPromptingMatches,
    labelledConstructMatches,
    participantFramingMatches,
  };
};

export const extractLearningPhrases = (question: string) => {
  const normalized = normalizeForMatch(question);
  const methodologyMatches = detectMethodologyMatches(normalized);
  const phrases = [
    ...methodologyMatches.forcedParaphraseMatches,
    ...methodologyMatches.interpretationPromptingMatches,
    ...methodologyMatches.labelledConstructMatches,
    ...methodologyMatches.participantFramingMatches,
  ];

  if (/\bve\b/.test(normalized)) {
    phrases.push("ve");
  }

  return uniqueStrings(phrases);
};

export const assessQuestionQuality = ({
  question,
  sectionTitle = "",
  sectionIndex,
  mode = "interview",
}: {
  question: string;
  sectionTitle?: string;
  sectionIndex?: number;
  mode?: ResearchQuestionMode;
}): QuestionReviewResult => {
  const cleanedQuestion = cleanQuestion(question);
  const normalized = normalizeForMatch(cleanedQuestion);
  const wordCount = getWordCount(cleanedQuestion);
  const warmupSection = inferQuestionSectionKind(sectionTitle, sectionIndex) === "warmup";
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
  const usabilityContextFit = mode !== "usability" || warmupSection || (!hasGenericUsabilityPrompt(normalized) && hasUsabilityContextAnchor(normalized));
  const methodologyMatches = detectMethodologyMatches(normalized);
  const methodologyFit =
    methodologyMatches.forcedParaphraseMatches.length === 0 &&
    methodologyMatches.interpretationPromptingMatches.length === 0 &&
    methodologyMatches.participantFramingMatches.length === 0 &&
    methodologyMatches.labelledConstructMatches.length === 0;

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

  if (!usabilityContextFit) {
    issues.push({
      code: "usability_context",
      label: "Bağlamdan kopuk",
      detail: "Usability sorusu somut ekran, adım, görev veya karar anına yeterince bağlanmıyor.",
      severity: "problematic",
    });
  }

  if (methodologyMatches.forcedParaphraseMatches.length > 0) {
    issues.push({
      code: "forced_paraphrase",
      label: "Zorlayıcı paraphrase",
      detail: "\"Kendi cümlelerinizle\" gibi kalıplar katılımcıya gereksiz bir anlatım çerçevesi dayatıyor.",
      severity: "problematic",
    });
  }

  if (methodologyMatches.interpretationPromptingMatches.length > 0) {
    issues.push({
      code: "interpretation_prompting",
      label: "Yorum yönlendiriyor",
      detail: "\"Nasıl anlıyorsunuz\" gibi ifadeler katılımcının anlamını tarif etmeye yönlendirebilir.",
      severity: "problematic",
    });
  }

  if (methodologyMatches.participantFramingMatches.length > 0) {
    issues.push({
      code: "participant_framing",
      label: "Katılımcı adına etiketliyor",
      detail: "UI öğesini önce sen isimlendirip sonra anlamını sormak katılımcıyı yönlendirir.",
      severity: "problematic",
    });
  } else if (mode === "usability" && methodologyMatches.labelledConstructMatches.length > 0) {
    issues.push({
      code: "labelled_construct",
      label: "Hazır kavram yüklüyor",
      detail: "Kullanıcının zihnindeki anlamı önce sen isimlendiriyorsun; usability sorularında bu daha nötr kurulmalı.",
      severity: "problematic",
    });
  }

  const methodologyIssues = issues.filter((issue) => issue.code in METHODOLOGY_MUST_RULES_BY_CODE);
  const violatedMustRules = uniqueStrings(
    methodologyIssues
      .map((issue) => METHODOLOGY_MUST_RULES_BY_CODE[issue.code])
      .filter(Boolean),
  );

  const problematicCount = issues.filter((issue) => issue.severity === "problematic").length;
  const cautionCount = issues.filter((issue) => issue.severity === "caution").length;

  let status: QuestionReviewStatus = "strong";
  let summary = "Soru nötr, açık uçlu ve görüşme akışına uygun görünüyor.";

  if (methodologyIssues.length > 0 || problematicCount > 0) {
    status = "problematic";
    summary = "Soru şu haliyle metodolojik olarak yönlendirici veya fazla çerçeveleyici kalıyor.";
  } else if (cautionCount > 0) {
    status = "caution";
    summary = "Soru kullanılabilir, ama ifadeyi biraz daha temizlemek kaliteyi artırır.";
  }

  return {
    status,
    summary,
    issues,
    methodologyIssues,
    violatedMustRules,
    checks: {
      open_ended: { label: "Açık uçlu", passed: openEnded },
      neutral: { label: "Nötr", passed: neutral },
      non_leading: { label: "Yönlendirmesiz", passed: nonLeading },
      non_assumptive: { label: "Varsayımsız", passed: nonAssumptive },
      single_focus: { label: "Tek odaklı", passed: singleFocus },
      no_standalone_ve: { label: '"ve" içermiyor', passed: noStandaloneVe },
      clarity: { label: "Net", passed: clarity },
      warmup_fit: { label: "Isınma akışına uygun", passed: warmupFit },
      usability_context: { label: "Usability bağlamına bağlı", passed: usabilityContextFit },
      methodology_fit: { label: "Metodolojiye uygun", passed: methodologyFit },
    },
  };
};

export const shouldRejectGeneratedQuestion = (review: QuestionReviewResult) =>
  review.issues.some((issue) => issue.severity === "problematic") || review.violatedMustRules.length > 0;

export const sanitizeGeneratedQuestions = (
  questions: string[],
  context: { sectionTitle?: string; sectionIndex?: number; mode?: ResearchQuestionMode } = {},
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
      mode: context.mode,
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
  context: { sectionTitle?: string; sectionIndex?: number; mode?: ResearchQuestionMode } = {},
) => {
  const { sectionTitle = "", sectionIndex, mode = "interview" } = context;
  const repaired = questions.map((question) => {
    const cleaned = cleanQuestion(question);
    if (!cleaned) {
      return "";
    }

    const review = assessQuestionQuality({
      question: cleaned,
      sectionTitle,
      sectionIndex,
      mode,
    });

    if (shouldRejectGeneratedQuestion(review)) {
      return buildFallbackRewrite({
        question: cleaned,
        sectionTitle,
        sectionIndex,
        mode,
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
    ...((Array.isArray(extractedWarmup?.questions) ? extractedWarmup.questions : []).map((question: any) => cleanQuestion(question))),
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
  mode = "interview",
}: {
  question: string;
  sectionTitle?: string;
  sectionIndex?: number;
  mode?: ResearchQuestionMode;
}) => {
  const normalizedTitle = normalizeForMatch(sectionTitle);
  const warmupSection = inferQuestionSectionKind(sectionTitle, sectionIndex) === "warmup";
  const normalizedQuestion = normalizeForMatch(question);

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

  if (normalizedQuestion.includes("nasil anliyorsunuz") || normalizedQuestion.includes("nasıl anlıyorsunuz")) {
    return "Bu ifadeler size ne anlatıyor?";
  }

  if (mode === "usability") {
    return "Bu ekranda bu adımda size en net gelen şey ne oldu?";
  }

  return "Bu deneyimi nasıl tarif edersiniz?";
};
