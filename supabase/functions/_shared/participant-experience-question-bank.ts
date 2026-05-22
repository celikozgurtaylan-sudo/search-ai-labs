export type ParticipantExperienceSignal =
  | "first_impression"
  | "expectation_clarity"
  | "entry_flow"
  | "permission_trust"
  | "ai_voice_quality"
  | "turkish_language_quality"
  | "warmup_experience"
  | "interview_flow"
  | "question_clarity"
  | "follow_up_relevance"
  | "feeling_understood"
  | "transcription_quality"
  | "privacy_concern"
  | "control_and_safety"
  | "completion_clarity"
  | "overall_value"
  | "improvement_suggestion"
  | "unclear_or_vague";

export type NextQuestionDecision =
  | "ask_follow_up"
  | "ask_clarification"
  | "move_to_next_anchor"
  | "skip_sensitive_topic"
  | "end_section";

export interface ParticipantExperienceQuestion {
  id: string;
  dimension: ParticipantExperienceSignal;
  textTr: string;
  purpose: string;
  whenToAsk?: string[];
  avoidWhen?: string[];
  followUpPrompts?: string[];
  riskLevel: "low" | "medium" | "high";
}

const normalizeForBankMatch = (value: string) =>
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

export const PARTICIPANT_EXPERIENCE_QUESTION_BANK: ParticipantExperienceQuestion[] = [
  {
    id: "opening_expectation_first_impression",
    dimension: "first_impression",
    textTr: "Görüşmenin başında dikkatinizi ilk ne çekti?",
    purpose: "İlk temasın katılımcıda bıraktığı genel izlenimi anlamak.",
    whenToAsk: ["İlk izlenim veya başlangıçtan söz edildiğinde."],
    followUpPrompts: ["Bu izlenimi oluşturan an neydi?"],
    riskLevel: "low",
  },
  {
    id: "opening_expectation_clarity",
    dimension: "expectation_clarity",
    textTr: "Başta sizden ne beklendiği ne kadar açıktı?",
    purpose: "Katılımcının görüşmeye hangi beklentiyle girdiğini anlamak.",
    whenToAsk: ["Amaç, yönerge veya beklenti netliğinden söz edildiğinde."],
    followUpPrompts: ["O anda ne bekliyordunuz?"],
    riskLevel: "low",
  },
  {
    id: "entry_flow_clarity",
    dimension: "entry_flow",
    textTr: "Görüşmeye girişte size en net gelen adım hangisiydi?",
    purpose: "Katılım linki, giriş ekranı veya ilk adımların anlaşılırlığını anlamak.",
    whenToAsk: ["Link, giriş, başlangıç ekranı veya akıştan söz edildiğinde."],
    followUpPrompts: ["O adımda karar vermenizi kolaylaştıran şey neydi?"],
    riskLevel: "low",
  },
  {
    id: "permission_trust_moment",
    dimension: "permission_trust",
    textTr: "İzin istediği anda aklınızdan ne geçti?",
    purpose: "Kamera ya da mikrofon izinlerinin güven algısına etkisini anlamak.",
    whenToAsk: ["Kamera, mikrofon veya izinlerden söz edildiğinde."],
    avoidWhen: ["Katılımcı konuyu kapatmak istediğini belirttiğinde."],
    followUpPrompts: ["O anda daha net olmasını istediğiniz şey neydi?"],
    riskLevel: "medium",
  },
  {
    id: "ai_voice_quality_signal",
    dimension: "ai_voice_quality",
    textTr: "Ses tarafında dikkatinizi en çok ne çekti?",
    purpose: "AI sesinin ton, tempo, telaffuz veya doğallık algısını anlamak.",
    whenToAsk: ["Ses, tonlama, hız, telaffuz veya robotiklikten söz edildiğinde."],
    followUpPrompts: ["Bu dikkatinizi hangi anda çekti?"],
    riskLevel: "low",
  },
  {
    id: "turkish_language_quality_signal",
    dimension: "turkish_language_quality",
    textTr: "Türkçe ifadelerde dikkatinizi en çok ne çekti?",
    purpose: "Dil kalitesi, telaffuz ve Türkçe akışını anlamak.",
    whenToAsk: ["Türkçe, telaffuz, cümle yapısı veya karakterlerden söz edildiğinde."],
    followUpPrompts: ["Aklınızda kalan ifade hangisiydi?"],
    riskLevel: "low",
  },
  {
    id: "warmup_usefulness",
    dimension: "warmup_experience",
    textTr: "Isınma soruları görüşmeye girmenizi nasıl etkiledi?",
    purpose: "Isınma bölümünün rahatlatma ve hazırlama etkisini anlamak.",
    whenToAsk: ["Isınma veya ilk sorular gündeme geldiğinde."],
    followUpPrompts: ["En işe yarayan ısınma anı hangisiydi?"],
    riskLevel: "low",
  },
  {
    id: "main_flow_clarity",
    dimension: "interview_flow",
    textTr: "Görüşme akışında takip etmesi en kolay bölüm hangisiydi?",
    purpose: "Ana görüşme akışının taranabilirliğini ve ritmini anlamak.",
    whenToAsk: ["Akış, sıra, bölüm veya görüşme temposundan söz edildiğinde."],
    followUpPrompts: ["Bu bölümü kolaylaştıran şey neydi?"],
    riskLevel: "low",
  },
  {
    id: "question_wording_clarity",
    dimension: "question_clarity",
    textTr: "Soru metinlerinde size en net gelen nokta neydi?",
    purpose: "Soru wording netliği ve anlaşılırlığını anlamak.",
    whenToAsk: ["Soruların açık, karışık veya uzun olduğundan söz edildiğinde."],
    followUpPrompts: ["Hangi soru aklınızda kaldı?"],
    riskLevel: "low",
  },
  {
    id: "follow_up_relevance",
    dimension: "follow_up_relevance",
    textTr: "Sonraki soruların cevabınızla ilişkisi nasıldı?",
    purpose: "AI follow-up alakasını ve konuşma devamlılığını anlamak.",
    whenToAsk: ["Takip soruları, alaka veya bağlantı hissinden söz edildiğinde."],
    followUpPrompts: ["İlişkinin koptuğunu hissettiğiniz an var mıydı?"],
    riskLevel: "low",
  },
  {
    id: "feeling_understood",
    dimension: "feeling_understood",
    textTr: "Anlaşıldığınızı hangi anda hissettiniz?",
    purpose: "Katılımcının AI tarafından dinlenme ve anlaşılma algısını anlamak.",
    whenToAsk: ["Anlaşılma, yanlış anlaşılma veya ilgisiz soru deneyimi anlatıldığında."],
    followUpPrompts: ["Bu hissi güçlendiren şey neydi?"],
    riskLevel: "medium",
  },
  {
    id: "transcription_quality",
    dimension: "transcription_quality",
    textTr: "Cevabınızın yazıya dönüşmesi tarafında dikkatinizi ne çekti?",
    purpose: "STT doğruluğu ve transkript güvenini anlamak.",
    whenToAsk: ["Transkript, yazıya dökme veya yanlış algılama anlatıldığında."],
    followUpPrompts: ["Hangi kelime ya da bölüm farklı yazıldı?"],
    riskLevel: "medium",
  },
  {
    id: "privacy_concern",
    dimension: "privacy_concern",
    textTr: "Gizlilik tarafında aklınızda kalan nokta ne oldu?",
    purpose: "Veri kullanımı, kayıt ve mahremiyet kaygısını anlamak.",
    whenToAsk: ["Gizlilik, veri, kayıt, güven veya kaygıdan söz edildiğinde."],
    avoidWhen: ["Katılımcı rahatsızlığını kapatmak istediğini söylediğinde."],
    followUpPrompts: ["Daha açık anlatılmasını istediğiniz şey neydi?"],
    riskLevel: "high",
  },
  {
    id: "control_and_safety",
    dimension: "control_and_safety",
    textTr: "Daha fazla kontrol hissi için ne farklı olmalıydı?",
    purpose: "Katılımcının durdurma, atlama, kayıt ve güvenli alan beklentisini anlamak.",
    whenToAsk: ["Rahatlık, kontrol, kamera, durdurma veya atlama deneyimi anlatıldığında."],
    avoidWhen: ["Katılımcı konuyu detaylandırmak istemediğinde."],
    followUpPrompts: ["Hangi kontrol sizi daha rahatlatırdı?"],
    riskLevel: "medium",
  },
  {
    id: "completion_clarity",
    dimension: "completion_clarity",
    textTr: "Görüşmenin bittiğini anlamanızı sağlayan şey neydi?",
    purpose: "Kapanış netliği ve tamamlanma hissini anlamak.",
    whenToAsk: ["Bitiş, kapanış veya tamamlanma deneyimi anlatıldığında."],
    followUpPrompts: ["Kapanışta eksik kalan bir işaret var mıydı?"],
    riskLevel: "low",
  },
  {
    id: "overall_value",
    dimension: "overall_value",
    textTr: "Bu görüşmeden sonra aklınızda kalan en önemli nokta ne?",
    purpose: "Genel değer algısını ve ana hatırlanan deneyimi anlamak.",
    whenToAsk: ["Genel değerlendirme, iyi/kötü, fayda veya değer anlatıldığında."],
    followUpPrompts: ["Bu noktayı önemli yapan şey neydi?"],
    riskLevel: "low",
  },
  {
    id: "improvement_suggestion",
    dimension: "improvement_suggestion",
    textTr: "Bir şeyi değiştirebilseydiniz nereden başlardınız?",
    purpose: "Katılımcıdan öncelikli iyileştirme önerisi almak.",
    whenToAsk: ["Öneri, geliştirme veya değişiklik ihtiyacı anlatıldığında."],
    followUpPrompts: ["Bu değişiklik deneyimi nasıl kolaylaştırırdı?"],
    riskLevel: "low",
  },
  {
    id: "unclear_or_vague",
    dimension: "unclear_or_vague",
    textTr: "Bunu biraz daha somutlaştırabilir misiniz?",
    purpose: "Kısa veya belirsiz yanıtı örnekle açmak.",
    whenToAsk: ["Yanıt kısa, genel veya yoruma açık kaldığında."],
    followUpPrompts: ["Aklınıza gelen ilk örnek hangisi?"],
    riskLevel: "low",
  },
];

export const getParticipantExperienceQuestionBySignal = (
  signal: ParticipantExperienceSignal,
  recentQuestions: string[] = [],
) => {
  const recent = new Set(recentQuestions.map(normalizeForBankMatch));
  const candidates = PARTICIPANT_EXPERIENCE_QUESTION_BANK.filter((question) =>
    question.dimension === signal && !recent.has(normalizeForBankMatch(question.textTr))
  );

  return candidates[0] ?? PARTICIPANT_EXPERIENCE_QUESTION_BANK.find((question) =>
    question.dimension === "unclear_or_vague" && !recent.has(normalizeForBankMatch(question.textTr))
  ) ?? PARTICIPANT_EXPERIENCE_QUESTION_BANK[PARTICIPANT_EXPERIENCE_QUESTION_BANK.length - 1];
};
