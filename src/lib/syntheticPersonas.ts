export interface SyntheticPersona {
  id: string;
  name: string;
  group: string;
  ageRange: string;
  occupation: string;
  context: string;
  goals: string[];
  frustrations: string[];
  traits: string[];
  tags: string[];
}

export interface SyntheticPersonaRecommendation {
  group: string;
  score: number;
  reasons: string[];
  personas: SyntheticPersona[];
}

interface NemotronPersonaRow {
  uuid?: string;
  professional_persona?: string;
  persona?: string;
  cultural_background?: string;
  skills_and_expertise?: string;
  skills_and_expertise_list?: string;
  hobbies_and_interests?: string;
  hobbies_and_interests_list?: string;
  career_goals_and_ambitions?: string;
  sex?: string;
  age?: number;
  marital_status?: string;
  education_level?: string;
  bachelors_field?: string;
  occupation?: string;
  city?: string;
  municipality?: string;
  state?: string;
  country?: string;
}

interface NemotronRowsResponse {
  rows?: Array<{
    row_idx: number;
    row: NemotronPersonaRow;
  }>;
  num_rows_total?: number;
}

const NEMOTRON_PERSONAS_ENDPOINT = "https://datasets-server.huggingface.co/rows";
const NEMOTRON_PERSONAS_DATASET = "nvidia/Nemotron-Personas-Brazil";
const NEMOTRON_PAGE_LENGTH = 100;
const NEMOTRON_DEFAULT_TOTAL_ROWS = 1_000_000;
const NEMOTRON_POOL_PAGE_COUNT = 10;
const PERSONAS_PER_RECOMMENDATION_GROUP = 3;
const TURKISH_FEMALE_NAMES = ["Elif", "Zeynep", "Derya", "Selin", "Aylin", "Ece", "Burcu", "Merve", "Deniz", "Seda", "İpek", "Aslı"];
const TURKISH_MALE_NAMES = ["Mert", "Kerem", "Burak", "Can", "Emre", "Onur", "Barış", "Tolga", "Kaan", "Deniz", "Arda", "Cem"];
const TURKISH_NEUTRAL_NAMES = ["Deniz", "Ece", "Can", "Özgür", "Derya", "İlker", "Ekin", "Yağmur"];

const normalize = (value: string) =>
  value
    .toLocaleLowerCase("tr-TR")
    .replace(/[áàâãä]/g, "a")
    .replace(/[éèêë]/g, "e")
    .replace(/[íìîï]/g, "i")
    .replace(/[óòôõö]/g, "o")
    .replace(/[úùûü]/g, "u")
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ş/g, "s")
    .replace(/ü/g, "u")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const hashText = (value: string) =>
  normalize(value).split("").reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) >>> 0, 0);

const humanizeSnakeCase = (value?: string) =>
  (value || "")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const compactSentence = (value?: string, fallback = "") => {
  const trimmed = (value || "").replace(/\s+/g, " ").trim();
  if (!trimmed) return fallback;
  const sentence = trimmed.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim();
  return sentence || trimmed;
};

const splitListString = (value?: string) =>
  (value || "")
    .replace(/^\s*\[/, "")
    .replace(/\]\s*$/, "")
    .split(/',\s*'|",\s*"|,\s*/)
    .map((item) => item.replace(/^['"\s]+|['"\s]+$/g, "").trim())
    .filter(Boolean);

const splitGoalSentences = (value?: string) =>
  ((value || "").match(/[^.!?]+[.!?]+/g) ?? [value || ""])
    .map((item) => item.trim())
    .filter((item) => item.length > 24)
    .slice(0, 3);

const ageToRange = (age?: number) => {
  if (!Number.isFinite(age)) return "25-54";
  const numericAge = Number(age);
  const start = Math.max(18, Math.floor(numericAge / 10) * 10);
  return `${start}-${start + 9}`;
};

const inferGroup = (row: NemotronPersonaRow) => {
  const text = normalize([
    row.occupation,
    row.professional_persona,
    row.skills_and_expertise,
    row.career_goals_and_ambitions,
  ].filter(Boolean).join(" "));

  if (/\b(research|scientist|engineer|software|computer|data|machine|programming|stem|pesquisa|cientista|engenheiro|tecnologia|programacao|dados)\b/.test(text)) {
    return "Teknoloji ve Araştırma Personaları";
  }
  if (/\b(food|restaurant|service|retail|cash|customer|hospitality|servico|varejo|vendedor|cliente|comercio|mercado|caixa|atendimento)\b/.test(text)) {
    return "Hizmet ve Müşteri Deneyimi Personaları";
  }
  if (/\b(community|event|arts|culture|outreach|volunteer|education|teacher|comunidade|evento|arte|cultura|voluntario|educacao|professor|artesao)\b/.test(text)) {
    return "Topluluk ve Yaratıcı Yaşam Personaları";
  }
  if (/\b(finance|budget|accounting|manager|administrative|operations|business|financa|orcamento|contabilidade|administracao|operacao|gestao|supervisor|coordenador)\b/.test(text)) {
    return "Operasyon ve Planlama Personaları";
  }
  if (/\b(health|care|senior|not in workforce|retired|saude|cuidado|idoso|aposentado|fora da forca)\b/.test(text)) {
    return "Yaşam Evresi ve Bakım Personaları";
  }

  return "Brezilyalı Genel Tüketici Personaları";
};

const translateOccupation = (value?: string) => {
  const normalized = normalize(value || "");

  if (!normalized) return "Brezilya bağlamında sentetik kullanıcı";
  if (/\b(operador|maquina|montador|instalacao|industria|metalurgia|producao)\b/.test(normalized)) {
    return "makine operatörü ve üretim çalışanı";
  }
  if (/\b(servico|vendedor|comercio|mercado|varejo|cliente|caixa|pdv)\b/.test(normalized)) {
    return "hizmet ve perakende çalışanı";
  }
  if (/\b(artesao|artesanato|cultura|arte|bordado|renda)\b/.test(normalized)) {
    return "zanaat ve kültür odaklı kullanıcı";
  }
  if (/\b(administrador|administracao|coordenador|gestao|supervisor)\b/.test(normalized)) {
    return "operasyon ve yönetim deneyimi olan kullanıcı";
  }
  if (/\b(professor|educacao|ensino|estudante)\b/.test(normalized)) {
    return "eğitim bağlamında kullanıcı";
  }
  if (/\b(saude|enfermagem|cuidador|medico|farmacia)\b/.test(normalized)) {
    return "sağlık ve bakım bağlamında kullanıcı";
  }
  if (/\b(agricultura|rural|campo|agro|trator)\b/.test(normalized)) {
    return "tarım ve yerel işletme bağlamında kullanıcı";
  }
  if (/\b(ocupacao mal definida|no occupation|sem ocupacao)\b/.test(normalized)) {
    return "genel yaşam bağlamından kullanıcı";
  }

  return "Brezilya bağlamında sentetik kullanıcı";
};

const buildTurkishContext = (row: NemotronPersonaRow, name: string, occupation: string) => {
  const location = [row.municipality || row.city, row.state].filter(Boolean).join(", ");
  const age = Number.isFinite(row.age) ? `${row.age} yaşında, ` : "";
  const locationText = location ? `${location} çevresinde yaşayan` : "Brezilya'da yaşayan";

  return `${name}, ${age}${locationText} ${occupation}. Günlük kararlarında yerel yaşam koşulları, çalışma düzeni, aile/topluluk ilişkileri ve pratik beklentiler belirleyicidir. Araştırma konusuna bu Brezilya bağlamından, Türkçe yanıt verecek şekilde tepki verir.`;
};

const translateGroupName = (group: string) => {
  if (group === "Technology and Research Personas") return "Teknoloji ve Araştırma Personaları";
  if (group === "Service and Customer-Facing Personas") return "Hizmet ve Müşteri Deneyimi Personaları";
  if (group === "Community and Creative Personas") return "Topluluk ve Yaratıcı Yaşam Personaları";
  if (group === "Operations and Practical Planners") return "Operasyon ve Planlama Personaları";
  if (group === "Life-Stage and Care Personas") return "Yaşam Evresi ve Bakım Personaları";
  if (group === "General Brazilian Consumer Personas") return "Brezilyalı Genel Tüketici Personaları";
  return group;
};

const buildTurkishGoals = (occupation: string) => [
  "Günlük işlerini ve kararlarını daha az sürtünmeyle tamamlamak",
  "Güven, maliyet, zaman ve pratik faydayı net biçimde anlamak",
  `${occupation} perspektifinden gerçekçi ve uygulanabilir çözümler görmek`,
];

const BRAZILIAN_PERSONA_FRUSTRATIONS = [
  "Belirsiz yönlendirmeler ve karmaşık açıklamalar",
  "Yerel yaşam koşullarını dikkate almayan deneyimler",
  "Gereksiz adımlar, zaman kaybı ve güven eksikliği",
];

const inferTags = (row: NemotronPersonaRow) => {
  const text = normalize([
    row.occupation,
    row.education_level,
    row.bachelors_field,
    row.skills_and_expertise,
    row.hobbies_and_interests,
    row.career_goals_and_ambitions,
    row.municipality,
    row.city,
    row.state,
  ].filter(Boolean).join(" "));
  const tags = new Set<string>(["nemotron", "brazil", "brasil", "synthetic-persona"]);

  Object.entries(TOPIC_KEYWORDS).forEach(([tag, keywords]) => {
    if (keywords.some((keyword) => text.includes(normalize(keyword))) || text.includes(normalize(tag))) {
      tags.add(tag);
    }
  });

  [
    ["technology", /\b(research|scientist|engineer|software|computer|data|machine|programming|ai|stem)\b/],
    ["service", /\b(food|restaurant|service|retail|customer|hospitality)\b/],
    ["community", /\b(community|event|culture|outreach|volunteer)\b/],
    ["creative", /\b(art|design|creative|music|writing|photography)\b/],
    ["planning", /\b(budget|schedule|organize|planning|management|administrative)\b/],
    ["education", /\b(teacher|education|college|student|training|mentor)\b/],
  ].forEach(([tag, pattern]) => {
    if ((pattern as RegExp).test(text)) tags.add(tag as string);
  });

  return Array.from(tags).slice(0, 10);
};

const inferName = (row: NemotronPersonaRow, index: number) => {
  const source = row.persona || row.professional_persona || "";
  const name = source.match(/^([\p{Lu}][\p{L}'-]+(?:\s+[\p{Lu}][\p{L}'-]+){0,2})\b/u)?.[1];
  return name || `Nemotron Persona ${index + 1}`;
};

const pickTurkishName = (seed: string, sex?: string) => {
  const normalizedSex = normalize(sex || "");
  const names = normalizedSex.includes("feminino")
    ? TURKISH_FEMALE_NAMES
    : normalizedSex.includes("masculino")
      ? TURKISH_MALE_NAMES
      : TURKISH_NEUTRAL_NAMES;

  return names[hashText(seed) % names.length];
};

const mapNemotronRowToPersona = (row: NemotronPersonaRow, index: number): SyntheticPersona => {
  const skills = splitListString(row.skills_and_expertise_list).slice(0, 4);
  const hobbies = splitListString(row.hobbies_and_interests_list).slice(0, 3);
  const location = [row.municipality || row.city, row.state].filter(Boolean).join(", ");
  const occupation = translateOccupation(row.occupation || row.professional_persona || row.education_level);
  const name = pickTurkishName(row.uuid || inferName(row, index), row.sex);

  return {
    id: `nemotron-${row.uuid || index}`,
    name,
    group: inferGroup(row),
    ageRange: ageToRange(row.age),
    occupation: location ? `${occupation} - ${location}` : occupation,
    context: buildTurkishContext(row, name, occupation),
    goals: buildTurkishGoals(occupation),
    frustrations: BRAZILIAN_PERSONA_FRUSTRATIONS,
    traits: [
      ...skills,
      ...hobbies,
      humanizeSnakeCase(row.education_level),
    ].filter(Boolean).slice(0, 5),
    tags: inferTags(row),
  };
};

export const localizeSyntheticPersonaForTurkishDisplay = (persona: SyntheticPersona): SyntheticPersona => {
  if (!persona.id.startsWith("nemotron-")) return persona;

  const [rawOccupation, rawLocation] = persona.occupation.split(" - ");
  const occupation = translateOccupation(rawOccupation || persona.occupation);
  const location = rawLocation?.trim();
  const name = TURKISH_FEMALE_NAMES.includes(persona.name) || TURKISH_MALE_NAMES.includes(persona.name) || TURKISH_NEUTRAL_NAMES.includes(persona.name)
    ? persona.name
    : pickTurkishName(persona.id);
  const context = location
    ? `${name}, ${location} çevresinde yaşayan ${occupation}. Araştırma konusuna Brezilya'daki günlük yaşamı, iş düzeni ve pratik beklentileri üzerinden Türkçe yanıt verir.`
    : `${name}, Brezilya bağlamında yaşayan ${occupation}. Araştırma konusuna yerel yaşamı, iş düzeni ve pratik beklentileri üzerinden Türkçe yanıt verir.`;

  return {
    ...persona,
    name,
    group: translateGroupName(persona.group),
    occupation: location ? `${occupation} - ${location}` : occupation,
    context,
    goals: buildTurkishGoals(occupation),
    frustrations: BRAZILIAN_PERSONA_FRUSTRATIONS,
  };
};

export const SYNTHETIC_PERSONAS: SyntheticPersona[] = [
  {
    id: "banking-anxious-digital-adopter",
    name: "Elif",
    group: "Dijital Bankacılıkta Güven Arayanlar",
    ageRange: "28-38",
    occupation: "Özel sektör çalışanı",
    context: "Mobil bankacılığı sık kullanır fakat yeni finansal işlemlerde güven ve açıklık bekler.",
    goals: ["İşlemi hızlı tamamlamak", "Masraf ve riskleri net görmek", "Hata yapmadığından emin olmak"],
    frustrations: ["Belirsiz onay metinleri", "Fazla teknik finans dili", "Geri dönüşü olmayan işlem hissi"],
    traits: ["temkinli", "detay soran", "mobil öncelikli"],
    tags: ["banking", "finance", "trust", "risk", "mobile", "onboarding"],
  },
  {
    id: "banking-busy-credit-seeker",
    name: "Mert",
    group: "Dijital Bankacılıkta Güven Arayanlar",
    ageRange: "35-48",
    occupation: "KOBİ sahibi",
    context: "Kredi, ödeme ve hesap hareketlerini pratik yönetmek ister; zaman kaybına toleransı düşüktür.",
    goals: ["Başvuru sonucunu hızlı anlamak", "Evrak ihtiyacını önceden bilmek", "Destek kanalına kolay ulaşmak"],
    frustrations: ["Uzun formlar", "Tekrarlayan bilgi girişi", "Belirsiz bekleme süreleri"],
    traits: ["sabırsız", "sonuç odaklı", "iş yükü yüksek"],
    tags: ["banking", "finance", "sme", "credit", "forms", "conversion"],
  },
  {
    id: "ecommerce-price-comparer",
    name: "Derya",
    group: "E-ticaret Karar Vericileri",
    ageRange: "24-34",
    occupation: "Pazarlama uzmanı",
    context: "Satın almadan önce fiyat, teslimat ve iade koşullarını birkaç sitede karşılaştırır.",
    goals: ["Toplam maliyeti görmek", "Güvenilir yorum bulmak", "Kolay iade güvencesi almak"],
    frustrations: ["Son adımda çıkan ücretler", "Manipülatif kampanya sayaçları", "Belirsiz stok bilgisi"],
    traits: ["araştırmacı", "fiyat hassas", "yorum odaklı"],
    tags: ["ecommerce", "checkout", "pricing", "trust", "conversion"],
  },
  {
    id: "ecommerce-mobile-impulse",
    name: "Can",
    group: "E-ticaret Karar Vericileri",
    ageRange: "18-27",
    occupation: "Üniversite öğrencisi",
    context: "Genelde mobilde gezer, hızlı karar verir ama ödeme aşamasında güven sinyalleri arar.",
    goals: ["Ürünü hızlı bulmak", "Kuponu kolay uygulamak", "Mobil ödemeyle tamamlamak"],
    frustrations: ["Yavaş ürün sayfaları", "Karmaşık filtreler", "Gizli kargo koşulları"],
    traits: ["mobil hızlı", "kampanya duyarlı", "görsel odaklı"],
    tags: ["ecommerce", "mobile", "checkout", "search", "filters"],
  },
  {
    id: "saas-ops-power-user",
    name: "Selin",
    group: "B2B SaaS ve Operasyon Kullanıcıları",
    ageRange: "30-45",
    occupation: "Operasyon yöneticisi",
    context: "Gün içinde aynı aracı tekrar tekrar kullanır; net tablo, filtre ve hızlı aksiyon bekler.",
    goals: ["Veriyi hızlı taramak", "Öncelikleri kaçırmamak", "Ekip aksiyonlarını takip etmek"],
    frustrations: ["Dağınık dashboard", "Belirsiz durum etiketleri", "Gereksiz onay adımları"],
    traits: ["yoğun", "veri odaklı", "verimlilik arayan"],
    tags: ["b2b", "saas", "dashboard", "workflow", "productivity"],
  },
  {
    id: "saas-new-admin",
    name: "Burak",
    group: "B2B SaaS ve Operasyon Kullanıcıları",
    ageRange: "32-50",
    occupation: "BT yöneticisi",
    context: "Yeni bir aracı ekibine kurar; yetki, güvenlik ve entegrasyon adımlarının açık olmasını ister.",
    goals: ["Kurulumu risksiz yapmak", "Yetkileri doğru vermek", "Ekip adaptasyonunu hızlandırmak"],
    frustrations: ["Belirsiz rol izinleri", "Eksik kurulum rehberi", "Hata mesajlarının teknik kalması"],
    traits: ["sistematik", "risk azaltan", "dokümantasyon arayan"],
    tags: ["b2b", "saas", "admin", "onboarding", "security"],
  },
  {
    id: "accessibility-low-vision",
    name: "Aylin",
    group: "Erişilebilirlik ve Kapsayıcılık",
    ageRange: "40-58",
    occupation: "Serbest çalışan",
    context: "Düşük görme nedeniyle kontrast, metin boyutu ve net odak durumlarına ihtiyaç duyar.",
    goals: ["Metni rahat okumak", "Form hatasını kolay fark etmek", "Klavye/ekran büyütmeyle ilerlemek"],
    frustrations: ["Düşük kontrast", "Küçük placeholder metinleri", "Sadece renkle verilen uyarılar"],
    traits: ["dikkatli", "erişilebilirlik duyarlı", "sabırlı ama netlik bekleyen"],
    tags: ["accessibility", "forms", "readability", "contrast", "inclusion"],
  },
  {
    id: "general-first-time-user",
    name: "Kerem",
    group: "İlk Kez Deneyen Kullanıcılar",
    ageRange: "25-44",
    occupation: "Beyaz yaka çalışan",
    context: "Ürünü ilk kez dener; ne işe yaradığını ve ilk değer anını hızlı anlamak ister.",
    goals: ["Nereden başlayacağını görmek", "Değer önerisini anlamak", "Yanlış bir şey yapmamak"],
    frustrations: ["Aşırı seçenek", "Belirsiz CTA", "Ürünün faydasının geç anlaşılması"],
    traits: ["meraklı", "temkinli", "bağlam arayan"],
    tags: ["onboarding", "first-use", "landing", "conversion", "clarity"],
  },
];

const TOPIC_KEYWORDS: Record<string, string[]> = {
  banking: ["banka", "bankacilik", "kredi", "kart", "finans", "odeme", "hesap", "sigorta", "yatirim", "fibabanka", "banco", "credito", "cartao", "pagamento", "conta", "financeiro"],
  ecommerce: ["e-ticaret", "eticaret", "urun", "sepet", "checkout", "satinalma", "siparis", "kargo", "iade", "kampanya", "comercio", "varejo", "vendas", "mercado", "loja", "cliente"],
  b2b: ["b2b", "saas", "dashboard", "panel", "crm", "operasyon", "ekip", "admin", "entegrasyon", "workflow", "gestao", "equipe", "processo", "industria"],
  accessibility: ["erisilebilir", "engelli", "kontrast", "okunabilir", "kapsayici", "yasli", "klavye", "idoso", "acessibilidade", "inclusao"],
  mobile: ["mobil", "app", "uygulama", "ios", "android", "telefon", "celular", "aplicativo"],
  onboarding: ["onboarding", "kayit", "basvuru", "ilk", "aktivasyon", "uye", "form", "cadastro", "primeiro", "inscricao"],
  trust: ["guven", "risk", "kvkk", "gizlilik", "izin", "onay", "sozlesme", "confianca", "risco", "privacidade", "seguranca"],
  conversion: ["donusum", "landing", "acilis", "cta", "reklam", "funnel", "conversao", "campanha", "funil"],
};

export const findSyntheticPersonaById = (personaId: string) =>
  SYNTHETIC_PERSONAS.find((persona) => persona.id === personaId) ?? null;

export const loadNemotronSyntheticPersonas = async ({
  offset = 0,
  length = NEMOTRON_PAGE_LENGTH,
}: {
  offset?: number;
  length?: number;
} = {}) => {
  const params = new URLSearchParams({
    dataset: NEMOTRON_PERSONAS_DATASET,
    config: "default",
    split: "train",
    offset: String(offset),
    length: String(length),
  });
  const response = await fetch(`${NEMOTRON_PERSONAS_ENDPOINT}?${params.toString()}`);

  if (!response.ok) {
    throw new Error(`Failed to load Nemotron personas: ${response.status}`);
  }

  const payload = await response.json() as NemotronRowsResponse;
  return (payload.rows ?? []).map(({ row }, index) => mapNemotronRowToPersona(row, offset + index));
};

const buildNemotronOffsets = (topic: string, pageCount = NEMOTRON_POOL_PAGE_COUNT) => {
  const maxOffset = NEMOTRON_DEFAULT_TOTAL_ROWS - NEMOTRON_PAGE_LENGTH;
  const stride = Math.floor(NEMOTRON_DEFAULT_TOTAL_ROWS / pageCount);
  const topicSeed = hashText(topic || "general synthetic users");
  const offsets = new Set<number>([0]);

  for (let index = 0; index < pageCount; index += 1) {
    const offset = ((topicSeed + index * stride) % maxOffset);
    offsets.add(Math.floor(offset / NEMOTRON_PAGE_LENGTH) * NEMOTRON_PAGE_LENGTH);
  }

  return Array.from(offsets).slice(0, pageCount);
};

export const loadNemotronSyntheticPersonaPool = async (topic: string, pageCount = NEMOTRON_POOL_PAGE_COUNT) => {
  const offsets = buildNemotronOffsets(topic, pageCount);
  const results = await Promise.allSettled(
    offsets.map((offset) => loadNemotronSyntheticPersonas({ offset, length: NEMOTRON_PAGE_LENGTH })),
  );
  const personas = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);

  if (personas.length === 0) {
    const firstError = results.find((result) => result.status === "rejected");
    throw new Error(
      firstError?.status === "rejected" && firstError.reason instanceof Error
        ? firstError.reason.message
        : "Failed to load Nemotron Brazil personas",
    );
  }

  return personas;
};

export const recommendSyntheticPersonas = (
  topic: string,
  limit = 4,
  personas: SyntheticPersona[] = SYNTHETIC_PERSONAS,
): SyntheticPersonaRecommendation[] => {
  const normalizedTopic = normalize(topic);
  const topicTokens = new Set(normalizedTopic.split(" ").filter(Boolean));

  const scored = personas.map((persona) => {
    const tagScore = persona.tags.reduce((total, tag) => total + (normalizedTopic.includes(normalize(tag)) ? 4 : 0), 0);
    const keywordScore = Object.entries(TOPIC_KEYWORDS).reduce((total, [tag, keywords]) => {
      if (!persona.tags.includes(tag)) return total;
      return total + keywords.reduce((sum, keyword) => sum + (normalizedTopic.includes(normalize(keyword)) ? 3 : 0), 0);
    }, 0);
    const text = normalize([
      persona.group,
      persona.occupation,
      persona.context,
      ...persona.goals,
      ...persona.frustrations,
      ...persona.traits,
      ...persona.tags,
    ].join(" "));
    const tokenScore = Array.from(topicTokens).reduce((total, token) => total + (token.length > 3 && text.includes(token) ? 1 : 0), 0);
    return { persona, score: tagScore + keywordScore + tokenScore };
  });

  const grouped = new Map<string, { score: number; personas: Array<{ persona: SyntheticPersona; score: number }>; reasons: Set<string> }>();
  scored.forEach(({ persona, score }) => {
    const entry = grouped.get(persona.group) ?? { score: 0, personas: [], reasons: new Set<string>() };
    entry.score += score;
    entry.personas.push({ persona, score });
    persona.tags.forEach((tag) => {
      if (normalizedTopic.includes(normalize(tag)) || TOPIC_KEYWORDS[tag]?.some((keyword) => normalizedTopic.includes(normalize(keyword)))) {
        entry.reasons.add(tag);
      }
    });
    grouped.set(persona.group, entry);
  });

  return Array.from(grouped.entries())
    .map(([group, entry]) => ({
      group,
      score: entry.score,
      reasons: Array.from(entry.reasons).slice(0, 4),
      personas: entry.personas
        .sort((a, b) => b.score - a.score || a.persona.name.localeCompare(b.persona.name, "tr"))
        .slice(0, PERSONAS_PER_RECOMMENDATION_GROUP)
        .map(({ persona }) => persona),
    }))
    .sort((a, b) => b.score - a.score || a.group.localeCompare(b.group, "tr"))
    .slice(0, limit);
};
