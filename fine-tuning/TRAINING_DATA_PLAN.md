# Searcho CORTEX Fine-Tuning Training Data Plan

## Overview
- **Target**: 50-100 training examples (currently have 5)
- **Format**: JSONL with system/user/assistant messages
- **Language**: Turkish

---

## Coverage Matrix

### Research Types × Industries

|                        | Finance & Banking | Retail & E-commerce |
|------------------------|-------------------|---------------------|
| **User Interviews**    | 12 examples       | 12 examples         |
| **Usability Testing**  | 12 examples       | 12 examples         |

**Total new examples needed**: ~48 (+ 5 existing = 53 total)

---

## Detailed Scenario List

### 1. FINANCE & BANKING - User Interviews (12 examples)

#### Simple Requests (6)
- [ ] Mobile banking app general UX research *(already exists)*
- [ ] Investment app user motivations research
- [ ] Insurance claim process experience
- [ ] Credit card application journey
- [ ] Digital wallet adoption barriers
- [ ] Branch vs. digital banking preferences
- [ ] Youth banking needs (Gen Z)

#### Complex/Vague Requests (6)
- [ ] "Müşterilerimiz neden rakibe geçiyor?" (Why customers switch)
- [ ] "Yaşlı kullanıcılar uygulamayı kullanmıyor" (Elderly users not using app)
- [ ] "NPS skorumuz düştü, nedenini anlamamız lazım"
- [ ] "Yeni özellikler ekliyoruz ama kimse kullanmıyor"
- [ ] "Müşteri şikayetleri artıyor, ne yapmalıyız?"
- [ ] "Dijital dönüşüm için müşteri beklentilerini anlamak istiyoruz"

---

### 2. FINANCE & BANKING - Usability Testing (12 examples)

#### Simple Requests (6)
- [ ] Para transfer akışı testi (Money transfer flow)
- [ ] Kredi başvurusu sürecini test etmek istiyoruz
- [ ] Fatura ödeme özelliğinin kullanılabilirliği
- [ ] Mobil bankacılık giriş/kimlik doğrulama testi
- [ ] Yatırım portföyü yönetim ekranı testi
- [ ] Hesap özeti ve hareket geçmişi arayüzü

#### Complex/Vague Requests (6)
- [ ] "Kullanıcılar işlem yapamıyor ama nerede takıldıklarını bilmiyoruz"
- [ ] "Yeni tasarım ile eski tasarımı karşılaştırmak istiyoruz"
- [ ] "Rakiplerin uygulaması daha kolay kullanılıyor diyorlar"
- [ ] "İlk kez kullanan biri ne yaşıyor görmek istiyoruz"
- [ ] "Erişilebilirlik konusunda sorunlarımız var mı?"
- [ ] "Tasarım değişikliği sonrası şikayetler arttı"

---

### 3. RETAIL & E-COMMERCE - User Interviews (12 examples)

#### Simple Requests (6)
- [ ] Sepet terk nedenleri araştırması *(already exists)*
- [ ] Online alışveriş tercihleri araştırması
- [ ] Müşteri sadakati ve tekrar alışveriş motivasyonları
- [ ] Teslimat deneyimi memnuniyet araştırması
- [ ] İade süreci deneyimi araştırması
- [ ] Mağaza içi vs online alışveriş tercihleri
- [ ] Ürün arama ve keşif davranışları

#### Complex/Vague Requests (6)
- [ ] "Müşteriler bir kez alışveriş yapıp geri dönmüyor"
- [ ] "Kampanyalar işe yaramıyor gibi"
- [ ] "Mobil uygulama indiriliyor ama kullanılmıyor"
- [ ] "Z kuşağı müşterilere ulaşamıyoruz"
- [ ] "Premium segment ürünlerimiz satmıyor"
- [ ] "Müşteri yorumları çok olumsuz, nedenini anlamak istiyoruz"

---

### 4. RETAIL & E-COMMERCE - Usability Testing (12 examples)

#### Simple Requests (6)
- [ ] Ürün filtreleme ve sıralama özelliği testi
- [ ] Ödeme sayfası kullanılabilirlik testi
- [ ] Ürün detay sayfası testi
- [ ] Arama fonksiyonu kullanılabilirlik testi
- [ ] Mobil uygulama navigasyon testi
- [ ] Hesap oluşturma ve giriş akışı testi

#### Complex/Vague Requests (6)
- [ ] "Checkout'ta dönüşüm oranı çok düşük"
- [ ] "Kullanıcılar ürünleri bulamıyor"
- [ ] "Yeni ana sayfa tasarımını test etmek istiyoruz"
- [ ] "Rakiplere göre alışveriş süresi çok uzun"
- [ ] "Mobil ve web arasında fark var mı görmek istiyoruz"
- [ ] "Misafir checkout vs üyelik hangisi tercih ediliyor"

---

## Example Quality Checklist

Each example should:
- [ ] Have a clear, natural user request (Turkish)
- [ ] Include appropriate `chatResponse` (friendly, acknowledges the request)
- [ ] Contain `researchPlan` with:
  - Relevant `title`
  - 3 sections with meaningful `id` names
  - 3 questions per section (9 total)
- [ ] Questions should be:
  - Open-ended (not yes/no)
  - Neutral (not leading)
  - Appropriate for the research type (interviews vs usability)
  - Ordered from general → specific

---

## JSON Structure Reference

```json
{
  "messages": [
    {
      "role": "system",
      "content": "Sen Searcho AI araştırma planlaması asistanısın. Kullanıcının araştırma talebini analiz et ve yapılandırılmış bir araştırma planı oluştur. SADECE JSON formatında yanıt ver."
    },
    {
      "role": "user",
      "content": "[User's research request in Turkish]"
    },
    {
      "role": "assistant",
      "content": "{\"chatResponse\": \"...\", \"researchPlan\": {\"title\": \"...\", \"sections\": [...]}}"
    }
  ]
}
```

---

## Usability Testing vs User Interview Differences

| Aspect | User Interviews | Usability Testing |
|--------|-----------------|-------------------|
| Focus | Attitudes, motivations, past experiences | Task completion, errors, efficiency |
| Questions | "How do you feel about..." | "Walk me through how you would..." |
| Section themes | Experience, Preferences, Needs | Tasks, Pain Points, Improvements |
| Tone | Exploratory, conversational | Task-oriented, observational |

---

## Progress Tracker

- [x] Existing examples: 5
- [ ] Finance + User Interviews: 0/12
- [ ] Finance + Usability Testing: 0/12
- [ ] Retail + User Interviews: 0/12
- [ ] Retail + Usability Testing: 0/12

**Total: 5/53**
