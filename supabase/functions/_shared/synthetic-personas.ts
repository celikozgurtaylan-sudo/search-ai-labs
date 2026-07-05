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

const normalize = (value: string) =>
  value
    .toLocaleLowerCase("tr-TR")
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ş/g, "s")
    .replace(/ü/g, "u")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

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
  banking: ["banka", "bankacilik", "kredi", "kart", "finans", "odeme", "hesap", "sigorta", "yatirim", "fibabanka"],
  ecommerce: ["e-ticaret", "eticaret", "urun", "sepet", "checkout", "satinalma", "siparis", "kargo", "iade", "kampanya"],
  b2b: ["b2b", "saas", "dashboard", "panel", "crm", "operasyon", "ekip", "admin", "entegrasyon", "workflow"],
  accessibility: ["erisilebilir", "engelli", "kontrast", "okunabilir", "kapsayici", "yasli", "klavye"],
  mobile: ["mobil", "app", "uygulama", "ios", "android", "telefon"],
  onboarding: ["onboarding", "kayit", "basvuru", "ilk", "aktivasyon", "uye", "form"],
  trust: ["guven", "risk", "kvkk", "gizlilik", "izin", "onay", "sozlesme"],
  conversion: ["donusum", "landing", "acilis", "cta", "reklam", "funnel"],
};

export const findPersonaById = (personaId: string) =>
  SYNTHETIC_PERSONAS.find((persona) => persona.id === personaId) ?? null;

export const recommendSyntheticPersonas = (topic: string, limit = 4): SyntheticPersonaRecommendation[] => {
  const normalizedTopic = normalize(topic);
  const topicTokens = new Set(normalizedTopic.split(" ").filter(Boolean));

  const scored = SYNTHETIC_PERSONAS.map((persona) => {
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

  const grouped = new Map<string, { score: number; personas: SyntheticPersona[]; reasons: Set<string> }>();
  scored.forEach(({ persona, score }) => {
    const entry = grouped.get(persona.group) ?? { score: 0, personas: [], reasons: new Set<string>() };
    entry.score += score;
    entry.personas.push(persona);
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
      personas: entry.personas,
    }))
    .sort((a, b) => b.score - a.score || a.group.localeCompare(b.group, "tr"))
    .slice(0, limit);
};
