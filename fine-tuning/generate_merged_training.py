#!/usr/bin/env python3
"""
Generate comprehensive merged training data for Searcho AI RFT fine-tuning.
Merges Şimal's examples + existing RFT prompts + new mobile banking examples.
"""
import json

SYSTEM_PROMPT = "Sen Searcho AI araştırma planlaması asistanısın. Kullanıcının araştırma talebini analiz et ve yapılandırılmış bir araştırma planı oluştur. SADECE JSON formatında yanıt ver."

def make_complete(user_msg, chat_response, title, sections):
    """Create a complete training example with assistant response."""
    plan = {
        "chatResponse": chat_response,
        "researchPlan": {
            "title": title,
            "sections": sections
        }
    }
    return {
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_msg},
            {"role": "assistant", "content": json.dumps(plan, ensure_ascii=False)}
        ]
    }

def make_prompt_only(user_msg):
    """Create a prompt-only example for RFT."""
    return {
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_msg}
        ]
    }

def get_simal_examples():
    """Load Şimal's 10 complete examples from file."""
    examples = []
    with open("/Users/fibabanka/Searcho/search-ai-labs/fine-tuning/(Şimal)training_data.jsonl", "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                examples.append(json.loads(line))
    return examples

def get_existing_rft_prompts():
    """Load existing RFT prompts."""
    examples = []
    with open("/Users/fibabanka/Searcho/search-ai-labs/fine-tuning/searcho_training_data_rft.jsonl", "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                examples.append(json.loads(line))
    return examples

def get_new_mobile_banking_examples():
    """Generate comprehensive mobile banking training examples with complete responses."""
    examples = []

    # ============================================================
    # 1. ACCOUNT DISCOVERY & MANAGEMENT
    # ============================================================
    examples.append(make_complete(
        "Mobil bankacılık uygulamamızda hesap keşfetme deneyimini araştırmak istiyoruz",
        "Mobil bankacılık hesap keşfetme deneyimi araştırma planını hazırladım. Soruları sağ panelde düzenleyebilirsiniz.",
        "Mobil Bankacılık Hesap Keşfetme Deneyimi Araştırması",
        [
            {"id": "account_discovery", "title": "Hesap Keşfetme Deneyimi", "questions": [
                "Mobil bankacılık uygulamasında hesap türlerini nasıl keşfediyorsunuz?",
                "Farklı hesap türleri arasındaki farkları kolayca anlayabiliyor musunuz?",
                "Hesap açma sayfasına ulaşmak ne kadar kolay?"
            ]},
            {"id": "account_types_awareness", "title": "Hesap Türleri Farkındalığı", "questions": [
                "Bankanızın sunduğu tüm hesap türlerinden haberdar mısınız?",
                "Hangi hesap türünü kullanıyorsunuz ve neden tercih ettiniz?",
                "Hesap türleri hakkında yeterli bilgilendirme yapılıyor mu?"
            ]},
            {"id": "account_opening_flow", "title": "Hesap Açma Akışı", "questions": [
                "Uygulama üzerinden hesap açma deneyiminizi anlatır mısınız?",
                "Hesap açma sürecinde karşılaştığınız zorluklar nelerdi?",
                "Hesap açma sürecinin hızı ve kolaylığı hakkında ne düşünüyorsunuz?"
            ]},
            {"id": "improvements", "title": "İyileştirme Önerileri", "questions": [
                "Hesap keşfetme ve açma sürecinde nelerin iyileştirilmesini istersiniz?",
                "Rakip bankaların hesap keşfetme deneyimleri ile karşılaştırdığınızda neler söylersiniz?",
                "Hesap önerisi yapan bir asistan sizin için faydalı olur mu?"
            ]}
        ]
    ))

    examples.append(make_complete(
        "Müşteriler hesap türlerini karşılaştıramıyor gibi görünüyor, araştıralım",
        "Hesap türleri karşılaştırma deneyimi araştırma planını hazırladım. Soruları sağ panelde düzenleyebilirsiniz.",
        "Hesap Türleri Karşılaştırma Deneyimi Araştırması",
        [
            {"id": "comparison_experience", "title": "Karşılaştırma Deneyimi", "questions": [
                "Farklı hesap türlerini karşılaştırırken hangi bilgilere ihtiyaç duyuyorsunuz?",
                "Hesap türleri arasındaki farkları anlamakta zorluk yaşıyor musunuz?",
                "Hesap karşılaştırma ekranını kullandınız mı? Deneyiminiz nasıldı?"
            ]},
            {"id": "decision_factors", "title": "Karar Faktörleri", "questions": [
                "Hesap seçerken en çok hangi kriterlere dikkat ediyorsunuz?",
                "Faiz oranı mı, esneklik mi yoksa ek özellikler mi daha önemli sizin için?",
                "Hesap seçiminde danışman desteği gerekli mi?"
            ]},
            {"id": "improvements", "title": "İyileştirme Önerileri", "questions": [
                "Hesap karşılaştırma deneyiminde nelerin değişmesini istersiniz?",
                "Otomatik hesap önerisi yapılsa kullanır mıydınız?",
                "Başka bankalarda beğendiğiniz hesap karşılaştırma özellikleri var mı?"
            ]}
        ]
    ))

    # ============================================================
    # 2. VADESIZ HESAP (CHECKING/CURRENT ACCOUNT)
    # ============================================================
    examples.append(make_complete(
        "Vadesiz hesap kullanım deneyimini araştırmak istiyoruz",
        "Vadesiz hesap kullanım deneyimi araştırma planını hazırladım. Soruları sağ panelde düzenleyebilirsiniz.",
        "Vadesiz Hesap Kullanım Deneyimi Araştırması",
        [
            {"id": "usage_experience", "title": "Kullanım Deneyimi", "questions": [
                "Vadesiz hesabınızı günlük olarak nasıl kullanıyorsunuz?",
                "Hesap bakiyenizi ne sıklıkla kontrol ediyorsunuz?",
                "Vadesiz hesabınızın sunduğu özelliklerden memnun musunuz?"
            ]},
            {"id": "features_needs", "title": "Özellik ve İhtiyaçlar", "questions": [
                "Vadesiz hesabınızda en çok hangi özellikleri kullanıyorsunuz?",
                "Vadesiz hesabınızda olmasını istediğiniz ama olmayan özellikler var mı?",
                "Birden fazla vadesiz hesap kullanıyor musunuz? Neden?"
            ]},
            {"id": "improvements", "title": "Sorunlar ve İyileştirmeler", "questions": [
                "Vadesiz hesap kullanımında yaşadığınız sorunlar nelerdir?",
                "Vadesiz hesap ücretleri hakkında ne düşünüyorsunuz?",
                "Rakip bankaların vadesiz hesap deneyimi ile karşılaştırdığınızda neler söylersiniz?"
            ]}
        ]
    ))

    examples.append(make_complete(
        "Döviz hesabı açma ve kullanım deneyimini müşterilerle test etmek istiyoruz",
        "Döviz hesabı açma ve kullanım deneyimi araştırma planını hazırladım. Soruları sağ panelde düzenleyebilirsiniz.",
        "Döviz Hesabı Deneyimi Araştırması",
        [
            {"id": "fx_account_opening", "title": "Döviz Hesabı Açma Deneyimi", "questions": [
                "Döviz hesabı açma sürecindeki deneyiminizi anlatır mısınız?",
                "Hangi döviz cinslerinde hesap açtınız ve neden?",
                "Döviz hesabı açma süreci beklentilerinizi karşıladı mı?"
            ]},
            {"id": "fx_usage", "title": "Kullanım Alışkanlıkları", "questions": [
                "Döviz hesabınızı ne amaçla kullanıyorsunuz?",
                "Döviz alım-satım işlemlerinde uygulamayı tercih ediyor musunuz?",
                "Döviz kurlarını uygulama üzerinden ne sıklıkla takip ediyorsunuz?"
            ]},
            {"id": "improvements", "title": "İyileştirme Önerileri", "questions": [
                "Döviz hesabı deneyiminde nelerin iyileştirilmesini istersiniz?",
                "Kur alarmı ve bildirim özellikleri sizin için yeterli mi?",
                "Rakip bankaların döviz hesap deneyimi ile karşılaştırdığınızda neler söylersiniz?"
            ]}
        ]
    ))

    examples.append(make_complete(
        "Altın hesabı ürünümüzün müşteri deneyimini araştırmak istiyoruz",
        "Altın hesabı müşteri deneyimi araştırma planını hazırladım. Soruları sağ panelde düzenleyebilirsiniz.",
        "Altın Hesabı Müşteri Deneyimi Araştırması",
        [
            {"id": "gold_account_experience", "title": "Altın Hesabı Deneyimi", "questions": [
                "Altın hesabı açma ve kullanma deneyiminizi anlatır mısınız?",
                "Altın alım-satım işlemlerinde uygulamayı mı yoksa şubeyi mi tercih ediyorsunuz?",
                "Altın hesabının sunduğu bilgilendirmeler yeterli mi?"
            ]},
            {"id": "preferences", "title": "Tercihler ve Beklentiler", "questions": [
                "Gram altın mı yoksa çeyrek/yarım altın mı tercih ediyorsunuz?",
                "Altın fiyat alarmları ve grafikleri sizin için yeterli mi?",
                "Altın birikimi için otomatik alım özelliği kullanır mıydınız?"
            ]},
            {"id": "improvements", "title": "İyileştirme Önerileri", "questions": [
                "Altın hesabı deneyiminde nelerin değişmesini istersiniz?",
                "Fiziki altına çevirme seçeneği sizin için önemli mi?",
                "Rakip bankaların altın hesabı deneyimleri ile karşılaştırdığınızda neler söylersiniz?"
            ]}
        ]
    ))

    # ============================================================
    # 3. KMH - KREDİLİ MEVDUAT HESABI (OVERDRAFT)
    # ============================================================
    examples.append(make_complete(
        "KMH (Kredili Mevduat Hesabı) kullanım deneyimini araştırmak istiyoruz",
        "KMH kullanım deneyimi araştırma planını hazırladım. Soruları sağ panelde düzenleyebilirsiniz.",
        "Kredili Mevduat Hesabı (KMH) Kullanım Deneyimi Araştırması",
        [
            {"id": "kmh_usage", "title": "KMH Kullanım Deneyimi", "questions": [
                "Kredili mevduat hesabınızı ne sıklıkla kullanıyorsunuz?",
                "KMH limitinizi nasıl ve hangi durumda kullanıyorsunuz?",
                "KMH'nin çalışma mantığını net olarak anlıyor musunuz?"
            ]},
            {"id": "kmh_awareness", "title": "Farkındalık ve Bilgi Düzeyi", "questions": [
                "KMH faiz oranları ve masraflar konusunda yeterince bilgilendirildiğinizi düşünüyor musunuz?",
                "KMH limitinizin ne kadar olduğunu biliyor musunuz?",
                "KMH kullanımı sonrası geri ödeme sürecini anlıyor musunuz?"
            ]},
            {"id": "kmh_application", "title": "Başvuru ve Limit Yönetimi", "questions": [
                "KMH başvuru sürecindeki deneyiminizi anlatır mısınız?",
                "KMH limit artırma veya azaltma işlemi yaptınız mı? Deneyiminiz nasıldı?",
                "KMH limitinizi uygulama üzerinden yönetebilmeyi ne kadar önemli buluyorsunuz?"
            ]},
            {"id": "improvements", "title": "Sorunlar ve İyileştirmeler", "questions": [
                "KMH kullanımında yaşadığınız sorunlar nelerdir?",
                "KMH uyarı ve bildirimleri yeterli mi?",
                "KMH yerine farklı bir acil nakit çözümü tercih eder miydiniz?"
            ]}
        ]
    ))

    examples.append(make_complete(
        "kredili mevduat hesabi basvuru sureci hakkinda musteri gorusleri alalim",
        "KMH başvuru süreci araştırma planını hazırladım. Soruları sağ panelde düzenleyebilirsiniz.",
        "KMH Başvuru Süreci Müşteri Araştırması",
        [
            {"id": "application_flow", "title": "Başvuru Akışı Deneyimi", "questions": [
                "KMH başvuru sürecini uygulama üzerinden gerçekleştirdiniz mi?",
                "Başvuru adımları sizin için anlaşılır mıydı?",
                "Başvuru sonucunu ne kadar sürede öğrendiniz?"
            ]},
            {"id": "information_clarity", "title": "Bilgi Netliği", "questions": [
                "KMH faiz oranları ve koşulları başvuru sırasında net olarak sunuldu mu?",
                "Sözleşme koşullarını okumak ve anlamak kolay mıydı?",
                "KMH ile normal kredi arasındaki fark yeterince açıklandı mı?"
            ]},
            {"id": "improvements", "title": "İyileştirme Önerileri", "questions": [
                "Başvuru sürecinde nelerin değişmesini istersiniz?",
                "Otomatik KMH limit önerisi yapılsa faydalı olur mu?",
                "Rakip bankaların KMH başvuru süreçleri ile karşılaştırdığınızda neler söylersiniz?"
            ]}
        ]
    ))

    # ============================================================
    # 4. EK HESAP (SUPPLEMENTARY/OVERDRAFT VARIANT)
    # ============================================================
    examples.append(make_complete(
        "Ek hesap ürünümüzü müşterilerin nasıl keşfettiğini ve kullandığını araştırmak istiyoruz",
        "Ek hesap keşfetme ve kullanım deneyimi araştırma planını hazırladım. Soruları sağ panelde düzenleyebilirsiniz.",
        "Ek Hesap Keşfetme ve Kullanım Deneyimi Araştırması",
        [
            {"id": "discovery", "title": "Ek Hesap Keşfetme", "questions": [
                "Ek hesap ürününü nasıl öğrendiniz?",
                "Ek hesabın ne olduğunu ve nasıl çalıştığını anlıyor musunuz?",
                "Ek hesap ile KMH arasındaki farkı biliyor musunuz?"
            ]},
            {"id": "usage_experience", "title": "Kullanım Deneyimi", "questions": [
                "Ek hesabınızı hangi durumlarda kullanıyorsunuz?",
                "Ek hesap limitiniz ihtiyaçlarınızı karşılıyor mu?",
                "Ek hesap geri ödeme sürecini nasıl yönetiyorsunuz?"
            ]},
            {"id": "improvements", "title": "İyileştirme Önerileri", "questions": [
                "Ek hesap deneyiminde nelerin iyileştirilmesini istersiniz?",
                "Ek hesap uyarı ve bildirimleri yeterli mi?",
                "Nakit ihtiyacı için ek hesap yerine başka çözümler kullanıyor musunuz?"
            ]}
        ]
    ))

    # ============================================================
    # 5. GÜNLÜK FAİZ HESABI (DAILY INTEREST ACCOUNT)
    # ============================================================
    examples.append(make_complete(
        "Günlük faiz hesabı ürünümüzün müşteri deneyimini derinlemesine araştırmak istiyoruz",
        "Günlük faiz hesabı deneyimi araştırma planını hazırladım. Soruları sağ panelde düzenleyebilirsiniz.",
        "Günlük Faiz Hesabı Müşteri Deneyimi Araştırması",
        [
            {"id": "daily_interest_understanding", "title": "Ürün Anlama ve Farkındalık", "questions": [
                "Günlük faiz hesabının nasıl çalıştığını net olarak anlıyor musunuz?",
                "Günlük faiz hesabı ile vadeli mevduat arasındaki temel farkları biliyor musunuz?",
                "Paranızı bağlamadan günlük faiz kazanma konseptini ilk nasıl öğrendiniz?"
            ]},
            {"id": "usage_motivation", "title": "Kullanım Motivasyonu", "questions": [
                "Günlük faiz hesabını neden tercih ettiniz?",
                "Paranızı istediğiniz zaman çekebilme esnekliği sizin için ne kadar önemli?",
                "Günlük faiz hesabını vadeli hesap yerine mi kullanıyorsunuz, yoksa ikisini birlikte mi?"
            ]},
            {"id": "experience_satisfaction", "title": "Deneyim ve Memnuniyet", "questions": [
                "Günlük faiz hesabı getiri oranları beklentilerinizi karşılıyor mu?",
                "Faiz hesaplama ve yansıtma süreci sizin için şeffaf mı?",
                "Hesaptan para çektiğinizde faiz kaybı yaşıyor musunuz?"
            ]},
            {"id": "improvements", "title": "İyileştirme Önerileri", "questions": [
                "Günlük faiz hesabı deneyiminde nelerin değişmesini istersiniz?",
                "Faiz oranı değişikliklerinden nasıl haberdar olmak istersiniz?",
                "Günlük faiz hesabı ile likit fon arasında tercih yaparken nelere dikkat ediyorsunuz?"
            ]}
        ]
    ))

    examples.append(make_complete(
        "musteriler gunluk faiz hesabini anlamiyor sanirim, arastirmamiz lazim",
        "Günlük faiz hesabı anlama düzeyi araştırma planını hazırladım. Soruları sağ panelde düzenleyebilirsiniz.",
        "Günlük Faiz Hesabı Müşteri Anlama Düzeyi Araştırması",
        [
            {"id": "comprehension", "title": "Anlama Düzeyi", "questions": [
                "Günlük faiz hesabını kendi cümlelerinizle anlatabilir misiniz?",
                "Günlük faiz hesabından para çektiğinizde ne olacağını biliyor musunuz?",
                "Taahhüt olmadan faiz kazanma kavramı size güvenilir geliyor mu?"
            ]},
            {"id": "information_sources", "title": "Bilgi Kaynakları", "questions": [
                "Günlük faiz hesabı hakkında bilgiyi nereden edindiniz?",
                "Uygulama içi açıklamalar yeterli mi yoksa daha fazla bilgiye ihtiyaç duyuyor musunuz?",
                "Müşteri temsilcisi ile görüşme ihtiyacı hissettiniz mi?"
            ]},
            {"id": "barriers", "title": "Kullanım Engelleri", "questions": [
                "Günlük faiz hesabı kullanmaktan sizi alıkoyan sebepler var mı?",
                "Faiz oranının düşük olması sizi bu hesaptan uzaklaştırıyor mu?",
                "Ürünün güvenilirliği konusunda endişeleriniz var mı?"
            ]}
        ]
    ))

    examples.append(make_complete(
        "Günlük faiz hesabı ile likit fon arasında müşteri tercihlerini anlamak istiyoruz",
        "Günlük faiz hesabı ve likit fon karşılaştırma araştırma planını hazırladım. Soruları sağ panelde düzenleyebilirsiniz.",
        "Günlük Faiz Hesabı vs Likit Fon Müşteri Tercih Araştırması",
        [
            {"id": "product_awareness", "title": "Ürün Farkındalığı", "questions": [
                "Günlük faiz hesabı ve likit fon arasındaki farkları biliyor musunuz?",
                "Her iki ürünü de kullandınız mı? Hangisini tercih ediyorsunuz?",
                "Bu iki ürünün risk ve getiri profillerini anlıyor musunuz?"
            ]},
            {"id": "decision_criteria", "title": "Karar Kriterleri", "questions": [
                "Paranızı kısa vadede değerlendirirken en çok neye dikkat ediyorsunuz?",
                "Likidite mi yoksa getiri mi sizin için daha önemli?",
                "Stopaj ve vergi avantajları kararınızı etkiliyor mu?"
            ]},
            {"id": "usage_patterns", "title": "Kullanım Kalıpları", "questions": [
                "Atıl paranızı değerlendirmek için hangi ürünleri kullanıyorsunuz?",
                "Acil ihtiyaç anında hangisinden para çekmeyi tercih edersiniz?",
                "Otomatik geçiş (sweep) özelliği sizin için faydalı olur mu?"
            ]},
            {"id": "improvements", "title": "İyileştirme Önerileri", "questions": [
                "Bu ürünler hakkında daha iyi bilgilendirilmek ister misiniz?",
                "Karşılaştırma araçları uygulama içinde sunulsa kullanır mıydınız?",
                "İdeal kısa vadeli yatırım ürünü sizce nasıl olmalı?"
            ]}
        ]
    ))

    # ============================================================
    # 6. VADELİ MEVDUAT (TERM DEPOSIT) - ENRICHED
    # ============================================================
    examples.append(make_complete(
        "Vadeli mevduat hesabı açma ve yönetim deneyimini araştırmak istiyoruz",
        "Vadeli mevduat deneyimi araştırma planını hazırladım. Soruları sağ panelde düzenleyebilirsiniz.",
        "Vadeli Mevduat Hesabı Açma ve Yönetim Deneyimi Araştırması",
        [
            {"id": "opening_experience", "title": "Hesap Açma Deneyimi", "questions": [
                "Vadeli mevduat hesabı açma sürecini uygulama üzerinden gerçekleştirdiniz mi?",
                "Vade seçenekleri ve faiz oranları net olarak sunuluyor mu?",
                "Hesap açma süreci beklentilerinizi karşıladı mı?"
            ]},
            {"id": "management", "title": "Hesap Yönetimi", "questions": [
                "Vadeli mevduat hesabınızı uygulama üzerinden yönetebiliyor musunuz?",
                "Vade sonunda otomatik yenileme tercihinizi değiştirebiliyor musunuz?",
                "Birden fazla vadeli hesabınız varsa yönetimi kolay mı?"
            ]},
            {"id": "maturity_experience", "title": "Vade Sonu Deneyimi", "questions": [
                "Vade sonu yaklaştığında yeterli bildirim alıyor musunuz?",
                "Vadeli hesabı vadesinden önce bozma deneyiminiz oldu mu?",
                "Vade sonu seçenekleri (yenileme, çekme, farklı vadeye aktarma) yeterli mi?"
            ]},
            {"id": "improvements", "title": "İyileştirme Önerileri", "questions": [
                "Vadeli mevduat deneyiminde nelerin iyileştirilmesini istersiniz?",
                "Kademeli faiz veya esnek vade seçenekleri sizin için cazip olur mu?",
                "Rakip bankaların vadeli mevduat deneyimi ile karşılaştırdığınızda neler söylersiniz?"
            ]}
        ]
    ))

    # ============================================================
    # 7. BİRİKİM HESABI (SAVINGS ACCOUNT)
    # ============================================================
    examples.append(make_complete(
        "Birikim hesabı ve otomatik birikim özelliklerini araştırmak istiyoruz",
        "Birikim hesabı deneyimi araştırma planını hazırladım. Soruları sağ panelde düzenleyebilirsiniz.",
        "Birikim Hesabı ve Otomatik Birikim Deneyimi Araştırması",
        [
            {"id": "savings_habits", "title": "Birikim Alışkanlıkları", "questions": [
                "Düzenli birikim yapıyor musunuz? Nasıl bir yöntem kullanıyorsunuz?",
                "Birikim hedeflerinizi nasıl belirliyorsunuz?",
                "Otomatik birikim talimatı kullanıyor musunuz?"
            ]},
            {"id": "product_experience", "title": "Ürün Deneyimi", "questions": [
                "Birikim hesabı açma sürecini anlatır mısınız?",
                "Hedefli birikim özelliğini kullanıyor musunuz?",
                "Birikim kuralları (harcama yuvarlama, maaş günü otomatik aktarım) sizin için faydalı mı?"
            ]},
            {"id": "motivation", "title": "Motivasyon ve Engeller", "questions": [
                "Birikim yapmaya devam etmenizi sağlayan motivasyon kaynağı nedir?",
                "Birikimden vazgeçtiğiniz zamanlar oldu mu? Neden?",
                "Gamification (rozet, hedef takibi) özellikleri birikim motivasyonunuzu artırır mı?"
            ]},
            {"id": "improvements", "title": "İyileştirme Önerileri", "questions": [
                "Birikim deneyiminde nelerin değişmesini istersiniz?",
                "Aile birikim hesabı veya ortak hedef özelliği kullanır mıydınız?",
                "Birikim hesabınızdaki paraya günlük faiz işlese nasıl olur?"
            ]}
        ]
    ))

    # ============================================================
    # 8. MÜŞTEREK HESAP (JOINT ACCOUNT)
    # ============================================================
    examples.append(make_complete(
        "Müşterek hesap deneyimini ve müşteri beklentilerini araştırmak istiyoruz",
        "Müşterek hesap deneyimi araştırma planını hazırladım. Soruları sağ panelde düzenleyebilirsiniz.",
        "Müşterek Hesap Deneyimi Araştırması",
        [
            {"id": "joint_account_usage", "title": "Müşterek Hesap Kullanımı", "questions": [
                "Müşterek hesap kullanıyor musunuz? Kim ile paylaşıyorsunuz?",
                "Müşterek hesap açma sürecini uygulama üzerinden gerçekleştirebildiniz mi?",
                "Her iki hesap sahibinin yetkileri net olarak tanımlanmış mı?"
            ]},
            {"id": "management", "title": "Hesap Yönetimi", "questions": [
                "Müşterek hesap hareketlerini takip etmek kolay mı?",
                "Hesap üzerindeki işlem limitlerini yönetebiliyor musunuz?",
                "Her iki tarafın da bildirim almasını sağlayabiliyor musunuz?"
            ]},
            {"id": "improvements", "title": "İyileştirme Önerileri", "questions": [
                "Müşterek hesap deneyiminde nelerin değişmesini istersiniz?",
                "Müşterek hesap için bütçe ve harcama takibi özelliği faydalı olur mu?",
                "Dijital olarak müşterek hesap açabilmek sizin için önemli mi?"
            ]}
        ]
    ))

    # ============================================================
    # 9. ÇOCUK HESABI
    # ============================================================
    examples.append(make_complete(
        "Çocuk hesabı ürünümüzün ebeveyn deneyimini araştırmak istiyoruz",
        "Çocuk hesabı ebeveyn deneyimi araştırma planını hazırladım. Soruları sağ panelde düzenleyebilirsiniz.",
        "Çocuk Hesabı Ebeveyn Deneyimi Araştırması",
        [
            {"id": "awareness", "title": "Farkındalık ve Bilgi", "questions": [
                "Çocuğunuz için banka hesabı açtırdınız mı veya açtırmayı düşünüyor musunuz?",
                "Çocuk hesabı ürünlerinden nasıl haberdar oldunuz?",
                "Çocuk hesabının sunduğu özellikleri biliyor musunuz?"
            ]},
            {"id": "opening_experience", "title": "Hesap Açma Deneyimi", "questions": [
                "Çocuk hesabı açma sürecini anlatır mısınız?",
                "Gerekli belgeler ve süreç uzunluğu hakkında ne düşünüyorsunuz?",
                "Uygulama üzerinden çocuk hesabı açabildiniz mi?"
            ]},
            {"id": "management_features", "title": "Yönetim ve Özellikler", "questions": [
                "Çocuğunuzun hesabını uygulama üzerinden yönetebiliyor musunuz?",
                "Harcama limiti belirleme ve kontrol özellikleri yeterli mi?",
                "Çocuğunuza finansal okuryazarlık kazandıran özellikler ister misiniz?"
            ]},
            {"id": "improvements", "title": "İyileştirme Önerileri", "questions": [
                "Çocuk hesabı deneyiminde nelerin iyileştirilmesini istersiniz?",
                "Harçlık gönderme ve birikim hedefi gibi özellikler faydalı olur mu?",
                "Rakip bankaların çocuk hesabı özellikleri ile karşılaştırdığınızda neler söylersiniz?"
            ]}
        ]
    ))

    # ============================================================
    # 10. PARA TRANSFERLERİ
    # ============================================================
    examples.append(make_complete(
        "EFT ve havale deneyimini müşterilerimizle araştırmak istiyoruz",
        "EFT ve havale deneyimi araştırma planını hazırladım. Soruları sağ panelde düzenleyebilirsiniz.",
        "EFT ve Havale Deneyimi Araştırması",
        [
            {"id": "transfer_experience", "title": "Transfer Deneyimi", "questions": [
                "Para gönderme işlemlerinizi genellikle nasıl yapıyorsunuz?",
                "EFT ve havale arasındaki farkı biliyor musunuz?",
                "Transfer sürecindeki adımlar sizin için anlaşılır mı?"
            ]},
            {"id": "speed_reliability", "title": "Hız ve Güvenilirlik", "questions": [
                "Transfer hızı beklentilerinizi karşılıyor mu?",
                "Transfer sonrası onay bildirimi alıyor musunuz?",
                "Hiç transfer hatası veya gecikmesi yaşadınız mı?"
            ]},
            {"id": "features", "title": "Özellikler ve Tercihler", "questions": [
                "Kayıtlı alıcılar özelliğini kullanıyor musunuz?",
                "Tekrarlayan transfer talimatı verme deneyiminiz nasıl?",
                "IBAN yerine telefon numarası veya e-posta ile transfer yapabilmeyi ister misiniz?"
            ]},
            {"id": "improvements", "title": "İyileştirme Önerileri", "questions": [
                "Para gönderme deneyiminde nelerin iyileştirilmesini istersiniz?",
                "Transfer ücretleri hakkında ne düşünüyorsunuz?",
                "Rakip bankaların transfer deneyimi ile karşılaştırdığınızda neler söylersiniz?"
            ]}
        ]
    ))

    examples.append(make_complete(
        "FAST anlık transfer deneyimini araştırmak istiyoruz",
        "FAST anlık transfer deneyimi araştırma planını hazırladım. Soruları sağ panelde düzenleyebilirsiniz.",
        "FAST Anlık Transfer Deneyimi Araştırması",
        [
            {"id": "fast_awareness", "title": "FAST Farkındalığı", "questions": [
                "FAST (Fonların Anlık ve Sürekli Transferi) sistemini biliyor musunuz?",
                "Normal EFT yerine FAST'ı ne zaman tercih ediyorsunuz?",
                "FAST'ın 7/24 çalıştığından haberdar mısınız?"
            ]},
            {"id": "usage_experience", "title": "Kullanım Deneyimi", "questions": [
                "FAST ile para gönderme deneyiminizi anlatır mısınız?",
                "Transferin anlık gerçekleşmesi beklentinizi karşılıyor mu?",
                "FAST Karekod ile ödeme özelliğini kullandınız mı?"
            ]},
            {"id": "improvements", "title": "İyileştirme Önerileri", "questions": [
                "FAST deneyiminde nelerin iyileştirilmesini istersiniz?",
                "FAST transfer limitleri sizin için yeterli mi?",
                "Kolay adres (telefon numarası/e-posta ile IBAN eşleştirme) kullanıyor musunuz?"
            ]}
        ]
    ))

    # ============================================================
    # 11. FATURA VE ÖDEMELER
    # ============================================================
    examples.append(make_complete(
        "Fatura ödeme deneyimini müşterilerle araştırmak istiyoruz",
        "Fatura ödeme deneyimi araştırma planını hazırladım. Soruları sağ panelde düzenleyebilirsiniz.",
        "Fatura Ödeme Deneyimi Araştırması",
        [
            {"id": "payment_experience", "title": "Ödeme Deneyimi", "questions": [
                "Faturalarınızı genellikle nasıl ve nereden ödüyorsunuz?",
                "Mobil uygulama üzerinden fatura ödeme deneyiminiz nasıl?",
                "Fatura sorgulama ve ödeme adımları sizin için kolay mı?"
            ]},
            {"id": "auto_payment", "title": "Otomatik Ödeme", "questions": [
                "Otomatik fatura ödeme talimatı kullanıyor musunuz?",
                "Otomatik ödeme talimatı verme süreci kolay mıydı?",
                "Otomatik ödemelerin doğru çalıştığından emin misiniz?"
            ]},
            {"id": "improvements", "title": "İyileştirme Önerileri", "questions": [
                "Fatura ödeme deneyiminde nelerin değişmesini istersiniz?",
                "Fatura hatırlatma bildirimleri yeterli mi?",
                "Tüm faturalarınızı tek ekrandan yönetebilmek ister misiniz?"
            ]}
        ]
    ))

    # ============================================================
    # 12. KREDİ ÜRÜNLERİ
    # ============================================================
    examples.append(make_complete(
        "İhtiyaç kredisi başvuru sürecini müşterilerle test etmek istiyoruz",
        "İhtiyaç kredisi başvuru deneyimi araştırma planını hazırladım. Soruları sağ panelde düzenleyebilirsiniz.",
        "İhtiyaç Kredisi Başvuru Süreci Araştırması",
        [
            {"id": "application_flow", "title": "Başvuru Akışı", "questions": [
                "İhtiyaç kredisi başvuru sürecini uygulama üzerinden yaptınız mı?",
                "Başvuru adımları ve süresi hakkında ne düşünüyorsunuz?",
                "Kredi tutarı ve vade seçenekleri beklentilerinizi karşıladı mı?"
            ]},
            {"id": "information_transparency", "title": "Bilgi Şeffaflığı", "questions": [
                "Faiz oranı, toplam geri ödeme tutarı ve taksit bilgileri net olarak sunuldu mu?",
                "Kredi simülasyonu/hesaplayıcı kullandınız mı? Faydalı buldunuz mu?",
                "Sözleşme koşullarını anlamak kolay mıydı?"
            ]},
            {"id": "approval_disbursement", "title": "Onay ve Kullandırım", "questions": [
                "Kredi onay sürecinin hızı hakkında ne düşünüyorsunuz?",
                "Kredinin hesabınıza yatma süresi beklentinizi karşıladı mı?",
                "Ret durumunda yeterli bilgilendirme yapıldı mı?"
            ]},
            {"id": "improvements", "title": "İyileştirme Önerileri", "questions": [
                "Kredi başvuru sürecinde nelerin iyileştirilmesini istersiniz?",
                "Kişiselleştirilmiş kredi teklifi almak ister misiniz?",
                "Rakip bankaların kredi başvuru süreçleri ile karşılaştırdığınızda neler söylersiniz?"
            ]}
        ]
    ))

    examples.append(make_complete(
        "kredi geri odeme ve taksit takip deneyimini arastirmak istiyoruz",
        "Kredi geri ödeme ve taksit takip deneyimi araştırma planını hazırladım. Soruları sağ panelde düzenleyebilirsiniz.",
        "Kredi Geri Ödeme ve Taksit Takip Deneyimi Araştırması",
        [
            {"id": "repayment_experience", "title": "Geri Ödeme Deneyimi", "questions": [
                "Kredi taksitlerinizi nasıl takip ediyorsunuz?",
                "Taksit ödeme tarihi yaklaştığında bildirim alıyor musunuz?",
                "Erken ödeme veya ara ödeme yapmayı denediniz mi?"
            ]},
            {"id": "tracking_features", "title": "Takip Özellikleri", "questions": [
                "Kalan borç ve taksit planınızı uygulamada kolayca görebiliyor musunuz?",
                "Ödeme takvimi ve geçmiş ödemeler ekranı yeterli mi?",
                "Kredi kapama simülasyonu sizin için faydalı olur mu?"
            ]},
            {"id": "improvements", "title": "İyileştirme Önerileri", "questions": [
                "Kredi takip deneyiminde nelerin iyileştirilmesini istersiniz?",
                "Taksit erteleme veya yeniden yapılandırma işlemlerini uygulama üzerinden yapabilmek ister misiniz?",
                "Otomatik erken ödeme önerisi yapılsa ilginizi çeker mi?"
            ]}
        ]
    ))

    # ============================================================
    # 13. KREDİ KARTI
    # ============================================================
    examples.append(make_complete(
        "Kredi kartı başvuru sürecini araştırmak istiyoruz",
        "Kredi kartı başvuru deneyimi araştırma planını hazırladım. Soruları sağ panelde düzenleyebilirsiniz.",
        "Kredi Kartı Başvuru Süreci Araştırması",
        [
            {"id": "card_selection", "title": "Kart Seçimi", "questions": [
                "Kredi kartı seçerken en çok nelere dikkat ediyorsunuz?",
                "Farklı kart türleri arasındaki farkları kolayca anlayabiliyor musunuz?",
                "Kart karşılaştırma araçlarını kullandınız mı?"
            ]},
            {"id": "application_flow", "title": "Başvuru Akışı", "questions": [
                "Kredi kartı başvurusunu uygulama üzerinden yaptınız mı?",
                "Başvuru süreci kolay ve anlaşılır mıydı?",
                "Başvuru sonucunu ne kadar sürede öğrendiniz?"
            ]},
            {"id": "improvements", "title": "İyileştirme Önerileri", "questions": [
                "Kredi kartı başvuru sürecinde nelerin değişmesini istersiniz?",
                "Kişiselleştirilmiş kart önerisi almak ister misiniz?",
                "Dijital olarak anında kullanıma başlayabilmek sizin için önemli mi?"
            ]}
        ]
    ))

    examples.append(make_complete(
        "Kredi kartı borç ödeme ve ekstre deneyimini araştırmak istiyoruz",
        "Kredi kartı borç ödeme ve ekstre deneyimi araştırma planını hazırladım. Soruları sağ panelde düzenleyebilirsiniz.",
        "Kredi Kartı Borç Ödeme ve Ekstre Deneyimi Araştırması",
        [
            {"id": "statement_experience", "title": "Ekstre Deneyimi", "questions": [
                "Kredi kartı ekstrenizi uygulama üzerinden inceleme deneyiminiz nasıl?",
                "Ekstre detayları (harcama kalemleri, taksitler, faiz) anlaşılır mı?",
                "Harcama kategorilendirmesi doğru ve faydalı mı?"
            ]},
            {"id": "payment_experience", "title": "Borç Ödeme Deneyimi", "questions": [
                "Kredi kartı borcunuzu nasıl ödüyorsunuz?",
                "Asgari, ekstre veya istediğiniz tutar seçenekleri yeterli mi?",
                "Otomatik borç ödeme talimatı kullanıyor musunuz?"
            ]},
            {"id": "installment_experience", "title": "Taksitlendirme", "questions": [
                "Harcama sonrası taksitlendirme özelliğini kullandınız mı?",
                "Taksitlendirme koşulları ve faiz bilgisi net olarak sunuluyor mu?",
                "Borç kapatma simülasyonu faydalı olur mu?"
            ]},
            {"id": "improvements", "title": "İyileştirme Önerileri", "questions": [
                "Ekstre ve borç ödeme deneyiminde nelerin değişmesini istersiniz?",
                "Harcama analizleri ve bütçe uyarıları yeterli mi?",
                "Ödeme hatırlatma bildirimleri zamanlaması uygun mu?"
            ]}
        ]
    ))

    examples.append(make_complete(
        "Kredi kartı puan ve mil kullanım deneyimini araştırmak istiyoruz",
        "Kredi kartı puan ve mil kullanım deneyimi araştırma planını hazırladım. Soruları sağ panelde düzenleyebilirsiniz.",
        "Kredi Kartı Puan/Mil Kullanım Deneyimi Araştırması",
        [
            {"id": "reward_awareness", "title": "Ödül Programı Farkındalığı", "questions": [
                "Kredi kartı puan/mil programınızın detaylarını biliyor musunuz?",
                "Puan kazanım kurallarını anlıyor musunuz?",
                "Puan bakiyenizi ne sıklıkla kontrol ediyorsunuz?"
            ]},
            {"id": "redemption_experience", "title": "Kullanım Deneyimi", "questions": [
                "Puanlarınızı/millerinizi hangi kanallardan kullanıyorsunuz?",
                "Puan harcama seçenekleri beklentilerinizi karşılıyor mu?",
                "Puan kullanım süreci kolay ve anlaşılır mı?"
            ]},
            {"id": "improvements", "title": "İyileştirme Önerileri", "questions": [
                "Puan/mil programında nelerin değişmesini istersiniz?",
                "Hangi yeni harcama kategorileri eklenmesini istersiniz?",
                "Puan transferi veya birleştirme özelliği kullanır mıydınız?"
            ]}
        ]
    ))

    examples.append(make_complete(
        "Sanal kart oluşturma ve kullanım deneyimini araştırmak istiyoruz",
        "Sanal kart deneyimi araştırma planını hazırladım. Soruları sağ panelde düzenleyebilirsiniz.",
        "Sanal Kart Oluşturma ve Kullanım Deneyimi Araştırması",
        [
            {"id": "virtual_card_awareness", "title": "Sanal Kart Farkındalığı", "questions": [
                "Sanal kart özelliğini biliyor musunuz?",
                "Sanal kartı hangi amaçla kullanıyorsunuz?",
                "Sanal kartın güvenlik avantajlarını anlıyor musunuz?"
            ]},
            {"id": "creation_experience", "title": "Oluşturma Deneyimi", "questions": [
                "Sanal kart oluşturma süreci kolay mıydı?",
                "Limit belirleme ve kart ayarları yeterli mi?",
                "Tek kullanımlık sanal kart özelliğini kullanıyor musunuz?"
            ]},
            {"id": "improvements", "title": "İyileştirme Önerileri", "questions": [
                "Sanal kart deneyiminde nelerin iyileştirilmesini istersiniz?",
                "Abonelik yönetimi için özel sanal kart oluşturabilmek ister misiniz?",
                "Sanal kart güvenlik ayarları yeterli mi?"
            ]}
        ]
    ))

    examples.append(make_complete(
        "Nakit avans deneyimini müşterilerle araştırmak istiyoruz",
        "Nakit avans deneyimi araştırma planını hazırladım. Soruları sağ panelde düzenleyebilirsiniz.",
        "Nakit Avans Deneyimi Araştırması",
        [
            {"id": "cash_advance_usage", "title": "Nakit Avans Kullanımı", "questions": [
                "Nakit avans özelliğini kullandınız mı? Hangi durumda?",
                "Nakit avans çekme süreci uygulama üzerinden kolay mı?",
                "Nakit avans faiz oranları ve masrafları hakkında önceden bilgilendirildiniz mi?"
            ]},
            {"id": "alternatives", "title": "Alternatifler", "questions": [
                "Nakit ihtiyacınız olduğunda ilk tercih ettiğiniz yöntem nedir?",
                "Nakit avans yerine KMH veya ihtiyaç kredisini tercih eder miydiniz?",
                "Acil nakit çözümleri konusunda yeterli seçenek sunuluyor mu?"
            ]},
            {"id": "improvements", "title": "İyileştirme Önerileri", "questions": [
                "Nakit avans deneyiminde nelerin değişmesini istersiniz?",
                "Nakit avans yerine farklı acil nakit çözümleri sunulsa kullanır mıydınız?",
                "Nakit avans masraf ve faiz bilgilendirmesi daha şeffaf olmalı mı?"
            ]}
        ]
    ))

    # ============================================================
    # 14. YATIRIM ÜRÜNLERİ
    # ============================================================
    examples.append(make_complete(
        "Yatırım fonu alım satım deneyimini araştırmak istiyoruz",
        "Yatırım fonu deneyimi araştırma planını hazırladım. Soruları sağ panelde düzenleyebilirsiniz.",
        "Yatırım Fonu Alım Satım Deneyimi Araştırması",
        [
            {"id": "fund_discovery", "title": "Fon Keşfetme", "questions": [
                "Yatırım fonlarını uygulama üzerinden nasıl keşfediyorsunuz?",
                "Fon bilgileri (getiri, risk, komisyon) yeterli ve anlaşılır mı?",
                "Fon karşılaştırma araçlarını kullanıyor musunuz?"
            ]},
            {"id": "trading_experience", "title": "Alım Satım Deneyimi", "questions": [
                "Yatırım fonu alım/satım işlemi yapma süreci kolay mı?",
                "İşlem onay ekranı ve bilgilendirmeler yeterli mi?",
                "Portföy takip ekranı beklentilerinizi karşılıyor mu?"
            ]},
            {"id": "improvements", "title": "İyileştirme Önerileri", "questions": [
                "Yatırım fonu deneyiminde nelerin iyileştirilmesini istersiniz?",
                "Risk profilinize göre fon önerisi yapılsa kullanır mıydınız?",
                "Otomatik yatırım (düzenli fon alımı) özelliği faydalı olur mu?"
            ]}
        ]
    ))

    examples.append(make_complete(
        "Hisse senedi alım satım deneyimini araştırmak istiyoruz",
        "Hisse senedi deneyimi araştırma planını hazırladım. Soruları sağ panelde düzenleyebilirsiniz.",
        "Hisse Senedi Alım Satım Deneyimi Araştırması",
        [
            {"id": "stock_trading", "title": "Hisse Senedi İşlem Deneyimi", "questions": [
                "Hisse senedi alım satım işlemlerinizi nereden yapıyorsunuz?",
                "Mobil uygulama üzerinden hisse alım satım deneyiminiz nasıl?",
                "Emir türleri ve fiyat bilgileri yeterli mi?"
            ]},
            {"id": "research_tools", "title": "Araştırma ve Analiz Araçları", "questions": [
                "Hisse analiz araçlarını (grafik, teknik analiz) kullanıyor musunuz?",
                "Şirket bilgileri ve finansal verilere erişim yeterli mi?",
                "Haber ve analiz bildirimleri faydalı mı?"
            ]},
            {"id": "improvements", "title": "İyileştirme Önerileri", "questions": [
                "Hisse senedi deneyiminde nelerin iyileştirilmesini istersiniz?",
                "Portföy performans raporu ve önerileri yeterli mi?",
                "Rakip aracı kurumların deneyimi ile karşılaştırdığınızda neler söylersiniz?"
            ]}
        ]
    ))

    # ============================================================
    # 15. BES (BİREYSEL EMEKLİLİK)
    # ============================================================
    examples.append(make_complete(
        "BES yönetimi ve fon dağılımı deneyimini araştırmak istiyoruz",
        "BES yönetimi deneyimi araştırma planını hazırladım. Soruları sağ panelde düzenleyebilirsiniz.",
        "BES Yönetimi ve Fon Dağılımı Deneyimi Araştırması",
        [
            {"id": "bes_management", "title": "BES Yönetim Deneyimi", "questions": [
                "BES hesabınızı uygulama üzerinden yönetebiliyor musunuz?",
                "Fon dağılımınızı değiştirmek kolay mı?",
                "BES performansınızı takip etmek için hangi araçları kullanıyorsunuz?"
            ]},
            {"id": "contribution_experience", "title": "Katkı Payı Deneyimi", "questions": [
                "Katkı payı tutarınızı değiştirme deneyiminiz nasıl?",
                "Devlet katkısı bilgilerinize kolayca ulaşabiliyor musunuz?",
                "Ek katkı payı ödeme işlemi kolay mı?"
            ]},
            {"id": "improvements", "title": "İyileştirme Önerileri", "questions": [
                "BES yönetim deneyiminde nelerin değişmesini istersiniz?",
                "Risk profilinize göre otomatik fon dağılımı önerisi faydalı olur mu?",
                "BES emeklilik projeksiyonu (tahmini birikim) özelliği kullanır mıydınız?"
            ]}
        ]
    ))

    # ============================================================
    # 16. DİJİTAL ÖZELLİKLER
    # ============================================================
    examples.append(make_complete(
        "Mobil bankacılık ana sayfa dashboard deneyimini araştırmak istiyoruz",
        "Ana sayfa dashboard deneyimi araştırma planını hazırladım. Soruları sağ panelde düzenleyebilirsiniz.",
        "Ana Sayfa Dashboard Deneyimi Araştırması",
        [
            {"id": "dashboard_usage", "title": "Dashboard Kullanımı", "questions": [
                "Uygulamayı açtığınızda ilk gördüğünüz ekran hakkında ne düşünüyorsunuz?",
                "Ana sayfada görmek istediğiniz en önemli bilgiler nelerdir?",
                "Ana sayfa düzenini kişiselleştirebilmeyi ister misiniz?"
            ]},
            {"id": "navigation", "title": "Navigasyon Deneyimi", "questions": [
                "İstediğiniz işleme ulaşmak ne kadar kolay?",
                "Alt menü ve hızlı erişim butonları sizin için yeterli mi?",
                "Arama fonksiyonunu kullanıyor musunuz? Faydalı buluyor musunuz?"
            ]},
            {"id": "improvements", "title": "İyileştirme Önerileri", "questions": [
                "Ana sayfa deneyiminde nelerin değişmesini istersiniz?",
                "Widget veya kısayol özelleştirmesi faydalı olur mu?",
                "Rakip bankaların ana sayfa deneyimleri ile karşılaştırdığınızda neler söylersiniz?"
            ]}
        ]
    ))

    examples.append(make_complete(
        "Bildirim ve uyarı yönetimi deneyimini araştırmak istiyoruz",
        "Bildirim yönetimi deneyimi araştırma planını hazırladım. Soruları sağ panelde düzenleyebilirsiniz.",
        "Bildirim ve Uyarı Yönetimi Deneyimi Araştırması",
        [
            {"id": "notification_experience", "title": "Bildirim Deneyimi", "questions": [
                "Bankadan aldığınız bildirimler sizin için faydalı mı?",
                "Hangi tür bildirimler alıyorsunuz ve hangilerini tercih edersiniz?",
                "Bildirim sıklığı sizin için uygun mu?"
            ]},
            {"id": "customization", "title": "Kişiselleştirme", "questions": [
                "Bildirim ayarlarınızı özelleştirebiliyor musunuz?",
                "Hangi bildirim kanallarını (push, SMS, e-posta) tercih ediyorsunuz?",
                "Belirli tutarın üzerindeki işlemler için özel uyarı almak ister misiniz?"
            ]},
            {"id": "improvements", "title": "İyileştirme Önerileri", "questions": [
                "Bildirim deneyiminde nelerin değişmesini istersiniz?",
                "Gereksiz bildirimlerden rahatsız oluyor musunuz?",
                "Kur alarmı, fatura hatırlatma gibi özel bildirimler yeterli mi?"
            ]}
        ]
    ))

    examples.append(make_complete(
        "Harcama analizi ve bütçe yönetimi özelliklerini araştırmak istiyoruz",
        "Harcama analizi ve bütçe yönetimi araştırma planını hazırladım. Soruları sağ panelde düzenleyebilirsiniz.",
        "Harcama Analizi ve Bütçe Yönetimi Deneyimi Araştırması",
        [
            {"id": "spending_analysis", "title": "Harcama Analizi", "questions": [
                "Harcama analizi özelliğini kullanıyor musunuz?",
                "Harcama kategorilendirmesi doğru ve faydalı mı?",
                "Aylık harcama raporları beklentilerinizi karşılıyor mu?"
            ]},
            {"id": "budget_management", "title": "Bütçe Yönetimi", "questions": [
                "Bütçe belirleme özelliğini kullanıyor musunuz?",
                "Kategori bazlı bütçe sınırları sizin için faydalı mı?",
                "Bütçe aşımı uyarıları zamanında geliyor mu?"
            ]},
            {"id": "financial_insights", "title": "Finansal İçgörüler", "questions": [
                "Kişiselleştirilmiş finansal öneriler alıyor musunuz?",
                "Tasarruf önerileri ve harcama trendleri faydalı mı?",
                "Gelir-gider dengenizi uygulama üzerinden takip edebiliyor musunuz?"
            ]},
            {"id": "improvements", "title": "İyileştirme Önerileri", "questions": [
                "Harcama analizi deneyiminde nelerin iyileştirilmesini istersiniz?",
                "AI destekli finansal asistan özelliği kullanır mıydınız?",
                "Farklı bankadaki hesaplarınızı da dahil edebilmek ister misiniz?"
            ]}
        ]
    ))

    examples.append(make_complete(
        "Dekont ve makbuz görüntüleme deneyimini araştırmak istiyoruz",
        "Dekont ve makbuz deneyimi araştırma planını hazırladım. Soruları sağ panelde düzenleyebilirsiniz.",
        "Dekont ve Makbuz Görüntüleme Deneyimi Araştırması",
        [
            {"id": "receipt_experience", "title": "Dekont Görüntüleme", "questions": [
                "İşlem dekontlarına uygulama üzerinden kolayca ulaşabiliyor musunuz?",
                "Dekont paylaşma ve indirme işlemi kolay mı?",
                "Eski işlem dekontlarına erişmekte sorun yaşıyor musunuz?"
            ]},
            {"id": "search_filter", "title": "Arama ve Filtreleme", "questions": [
                "Hesap hareketlerini filtreleme ve arama özellikleri yeterli mi?",
                "Tarih, tutar, kategori bazlı filtreleme kullanıyor musunuz?",
                "Belirli bir işlemi bulmak ne kadar kolay?"
            ]},
            {"id": "improvements", "title": "İyileştirme Önerileri", "questions": [
                "Dekont ve hesap hareketi deneyiminde nelerin değişmesini istersiniz?",
                "PDF dekont oluşturma ve e-posta gönderme özelliği yeterli mi?",
                "Toplu dekont indirme özelliği faydalı olur mu?"
            ]}
        ]
    ))

    # ============================================================
    # 17. GÜVENLİK VE KİMLİK DOĞRULAMA
    # ============================================================
    examples.append(make_complete(
        "Biyometrik giriş deneyimini araştırmak istiyoruz",
        "Biyometrik giriş deneyimi araştırma planını hazırladım. Soruları sağ panelde düzenleyebilirsiniz.",
        "Biyometrik Giriş Deneyimi Araştırması",
        [
            {"id": "biometric_usage", "title": "Biyometrik Giriş Kullanımı", "questions": [
                "Uygulamaya giriş için biyometrik doğrulama (parmak izi, yüz tanıma) kullanıyor musunuz?",
                "Biyometrik giriş deneyiminiz nasıl?",
                "Biyometrik giriş başarısız olduğunda ne yapıyorsunuz?"
            ]},
            {"id": "security_perception", "title": "Güvenlik Algısı", "questions": [
                "Biyometrik girişin güvenli olduğunu düşünüyor musunuz?",
                "Şifre mi yoksa biyometrik giriş mi tercih ediyorsunuz?",
                "İki faktörlü doğrulama (SMS, e-posta) güvenlik hissinizi artırıyor mu?"
            ]},
            {"id": "improvements", "title": "İyileştirme Önerileri", "questions": [
                "Giriş deneyiminde nelerin değişmesini istersiniz?",
                "Farklı biyometrik doğrulama yöntemleri (ses tanıma gibi) ister misiniz?",
                "Güvenlik ve kullanım kolaylığı dengesi sizce nasıl olmalı?"
            ]}
        ]
    ))

    examples.append(make_complete(
        "Kart güvenlik ayarları deneyimini araştırmak istiyoruz",
        "Kart güvenlik ayarları deneyimi araştırma planını hazırladım. Soruları sağ panelde düzenleyebilirsiniz.",
        "Kart Güvenlik Ayarları Deneyimi Araştırması",
        [
            {"id": "security_settings", "title": "Güvenlik Ayarları", "questions": [
                "Kredi/banka kartınızın güvenlik ayarlarını uygulama üzerinden yönetebiliyor musunuz?",
                "İnternet alışverişi açma/kapama, yurt dışı kullanım gibi ayarları kullanıyor musunuz?",
                "Kart bloke/açma işlemini uygulama üzerinden yaptınız mı?"
            ]},
            {"id": "fraud_protection", "title": "Dolandırıcılık Koruması", "questions": [
                "Şüpheli işlem bildirimi aldınız mı? Süreci nasıl buldunuz?",
                "Anlık işlem bildirimleri güvenlik hissinizi artırıyor mu?",
                "Kart kayıp/çalıntı bildirimi süreci hakkında ne düşünüyorsunuz?"
            ]},
            {"id": "improvements", "title": "İyileştirme Önerileri", "questions": [
                "Kart güvenlik ayarları deneyiminde nelerin değişmesini istersiniz?",
                "Geçici kart dondurma özelliğini kullanır mıydınız?",
                "Harcama limiti belirleme özellikleri yeterli mi?"
            ]}
        ]
    ))

    # ============================================================
    # 18. MÜŞTERİ HİZMETLERİ
    # ============================================================
    examples.append(make_complete(
        "Uygulama içi chatbot deneyimini araştırmak istiyoruz",
        "Chatbot deneyimi araştırma planını hazırladım. Soruları sağ panelde düzenleyebilirsiniz.",
        "Uygulama İçi Chatbot Deneyimi Araştırması",
        [
            {"id": "chatbot_usage", "title": "Chatbot Kullanımı", "questions": [
                "Uygulama içi chatbot/asistan özelliğini kullanıyor musunuz?",
                "Chatbot hangi konularda size yardımcı olabiliyor?",
                "Chatbot yanıtlarının kalitesinden memnun musunuz?"
            ]},
            {"id": "expectations", "title": "Beklentiler", "questions": [
                "Chatbot'tan ne tür işlemleri yapabilmeyi bekliyorsunuz?",
                "Chatbot ile canlı müşteri temsilcisine bağlanma geçişi nasıl?",
                "Sesli asistan özelliği kullanır mıydınız?"
            ]},
            {"id": "improvements", "title": "İyileştirme Önerileri", "questions": [
                "Chatbot deneyiminde nelerin iyileştirilmesini istersiniz?",
                "AI destekli kişisel finans danışmanı özelliği ilginizi çeker mi?",
                "Chatbot'un hangi yeni yeteneklere sahip olmasını istersiniz?"
            ]}
        ]
    ))

    examples.append(make_complete(
        "ATM ve şube bulucu deneyimini araştırmak istiyoruz",
        "ATM ve şube bulucu deneyimi araştırma planını hazırladım. Soruları sağ panelde düzenleyebilirsiniz.",
        "ATM ve Şube Bulucu Deneyimi Araştırması",
        [
            {"id": "locator_usage", "title": "Bulucu Kullanımı", "questions": [
                "ATM/şube bulucu özelliğini kullanıyor musunuz?",
                "En yakın ATM veya şubeye ulaşmak kolay mı?",
                "Harita ve yol tarifi bilgileri yeterli mi?"
            ]},
            {"id": "atm_experience", "title": "ATM Deneyimi", "questions": [
                "ATM'lerde en sık hangi işlemleri yapıyorsunuz?",
                "ATM'de para çekme limitleri yeterli mi?",
                "QR kod ile ATM'den para çekme özelliğini kullandınız mı?"
            ]},
            {"id": "improvements", "title": "İyileştirme Önerileri", "questions": [
                "ATM/şube bulucu deneyiminde nelerin değişmesini istersiniz?",
                "ATM yoğunluk bilgisi ve bekleme süresi tahmini faydalı olur mu?",
                "Şube randevu alma ile entegre çalışması sizin için önemli mi?"
            ]}
        ]
    ))

    # ============================================================
    # 19. PROFİL VE AYARLAR
    # ============================================================
    examples.append(make_complete(
        "Profil ve kişisel bilgi yönetimi deneyimini araştırmak istiyoruz",
        "Profil yönetimi deneyimi araştırma planını hazırladım. Soruları sağ panelde düzenleyebilirsiniz.",
        "Profil ve Kişisel Bilgi Yönetimi Deneyimi Araştırması",
        [
            {"id": "profile_management", "title": "Profil Yönetimi", "questions": [
                "Kişisel bilgilerinizi uygulama üzerinden güncelleyebiliyor musunuz?",
                "Adres, telefon, e-posta değişikliği süreci kolay mı?",
                "Profil sayfasının düzeni ve bilgilendirmesi yeterli mi?"
            ]},
            {"id": "preferences", "title": "Tercih Ayarları", "questions": [
                "Uygulama dili, tema ve görünüm ayarlarını özelleştirebiliyor musunuz?",
                "İletişim tercihlerinizi (SMS, e-posta, push) yönetmek kolay mı?",
                "Gizlilik ayarları yeterli mi?"
            ]},
            {"id": "improvements", "title": "İyileştirme Önerileri", "questions": [
                "Profil yönetimi deneyiminde nelerin değişmesini istersiniz?",
                "Karanlık mod/koyu tema kullanıyor musunuz veya kullanmak ister misiniz?",
                "Erişilebilirlik özellikleri (büyük font, ekran okuyucu desteği) yeterli mi?"
            ]}
        ]
    ))

    # ============================================================
    # 20. AÇIK BANKACILIK VE ENTEGRASYON
    # ============================================================
    examples.append(make_complete(
        "Açık bankacılık ve hesap birleştirme deneyimini araştırmak istiyoruz",
        "Açık bankacılık deneyimi araştırma planını hazırladım. Soruları sağ panelde düzenleyebilirsiniz.",
        "Açık Bankacılık ve Hesap Birleştirme Deneyimi Araştırması",
        [
            {"id": "open_banking_awareness", "title": "Açık Bankacılık Farkındalığı", "questions": [
                "Açık bankacılık kavramını biliyor musunuz?",
                "Farklı bankalardaki hesaplarınızı tek uygulamadan yönetebilmeyi ister misiniz?",
                "Finansal verilerinizin paylaşılması konusunda endişeleriniz var mı?"
            ]},
            {"id": "integration_needs", "title": "Entegrasyon İhtiyaçları", "questions": [
                "Muhasebe veya finans yönetim araçları ile entegrasyon kullanır mıydınız?",
                "E-ticaret sitelerinde doğrudan banka ödeme seçeneğini tercih eder misiniz?",
                "Gelir ve gider takibi için tüm hesaplarınızı tek yerden görmek ister misiniz?"
            ]},
            {"id": "improvements", "title": "İyileştirme Önerileri", "questions": [
                "Açık bankacılık hizmetlerinden beklentileriniz nelerdir?",
                "Veri güvenliği konusunda ne tür güvenceler istersiniz?",
                "Başka bankalardaki hesaplarınızı uygulamamız üzerinden görebilmek sizin için cazip olur mu?"
            ]}
        ]
    ))

    # ============================================================
    # 21. SİGORTA ÜRÜNLERİ
    # ============================================================
    examples.append(make_complete(
        "Mobil bankacılık üzerinden sigorta ürünleri deneyimini araştırmak istiyoruz",
        "Sigorta ürünleri deneyimi araştırma planını hazırladım. Soruları sağ panelde düzenleyebilirsiniz.",
        "Mobil Bankacılık Sigorta Ürünleri Deneyimi Araştırması",
        [
            {"id": "insurance_discovery", "title": "Sigorta Keşfetme", "questions": [
                "Mobil bankacılık uygulamasında sigorta ürünlerini keşfettiniz mi?",
                "Sigorta ürünleri hakkında yeterli bilgi sunuluyor mu?",
                "Banka uygulamasından sigorta satın almayı güvenli buluyor musunuz?"
            ]},
            {"id": "purchase_experience", "title": "Satın Alma Deneyimi", "questions": [
                "Uygulama üzerinden sigorta poliçesi aldınız mı?",
                "Poliçe karşılaştırma ve fiyat bilgilendirmesi yeterli mi?",
                "Sigorta satın alma süreci kolay ve anlaşılır mıydı?"
            ]},
            {"id": "improvements", "title": "İyileştirme Önerileri", "questions": [
                "Sigorta deneyiminde nelerin değişmesini istersiniz?",
                "Kişiselleştirilmiş sigorta önerisi almak ister misiniz?",
                "Poliçe yönetimi ve hasar bildirimi uygulama üzerinden yapılabilse kullanır mıydınız?"
            ]}
        ]
    ))

    # ============================================================
    # 22. ADDITIONAL PROMPT-ONLY EXAMPLES (DIVERSE BANKING)
    # ============================================================
    prompt_only_examples = [
        "Kart limiti değiştirme deneyimini araştırmak istiyoruz",
        "Ek kart başvuru sürecini test etmek istiyoruz",
        "Hesap kapatma sürecini araştırmamız lazım",
        "Temassız ödeme (NFC) deneyimini müşterilerle değerlendirelim",
        "Dijital cüzdan (Apple Pay, Google Pay) entegrasyonunu araştırmak istiyoruz",
        "Müşteri şikayet yönetimi sürecini uygulama üzerinden test edelim",
        "Havale/EFT iptal süreci hakkında müşteri görüşleri alalım",
        "Kredi yapılandırma ve borç erteleme deneyimini araştıralım",
        "Otomatik yatırım talimatı verme deneyimini test edelim",
        "Kişisel finans yönetimi araçlarının kullanılabilirliğini araştıralım",
        "Maaş hesabı avantajları hakkında müşteri farkındalığını ölçelim",
        "Döviz çevirici ve kur hesaplayıcı deneyimini test edelim",
        "Hesap hareketleri arama ve filtreleme deneyimini araştıralım",
        "SWIFT/uluslararası transfer deneyimini derinlemesine araştıralım",
        "Müşterilerin mobil bankacılıkta yaşadığı erişilebilirlik sorunlarını araştıralım",
        "Emekli müşteri segmentinin mobil bankacılık deneyimini araştıralım",
        "Z kuşağı müşterilerinin mobil bankacılık beklentilerini anlayalım",
        "KOBİ müşterilerinin mobil bankacılık kullanım alışkanlıklarını araştıralım",
        "Ticari müşterilerin toplu ödeme deneyimini araştırmak istiyoruz",
        "POS cihazı yönetimi deneyimini esnaf müşterilerle test edelim",
        "Kredi kartı kampanya ve indirim deneyimini araştıralım",
        "Cashback programının müşteri algısını araştırmak istiyoruz",
        "Müşteri sadakat programı deneyimini değerlendirelim",
        "Banka hesap özeti ve raporlama deneyimini test edelim",
        "Vergi ödemesi ve SGK prim ödeme deneyimini araştıralım",
        "Uygulama performansı ve hız konusunda müşteri memnuniyetini ölçelim",
        "Çoklu hesap yönetimi deneyimini araştırmak istiyoruz",
        "IBAN kopyalama ve paylaşma deneyimini test edelim",
        "Kredi kartı minimum ödeme ve faiz bilgilendirmesini araştıralım",
        "Para transferinde kayıtlı alıcı yönetimi deneyimini test edelim",
        "Hesap açılış kampanyaları ve promosyonların etkisini araştıralım",
        "Mobil bankacılıkta dark mode kullanım tercihlerini araştıralım",
        "Uygulama widget deneyimini iOS ve Android müşterilerle test edelim",
        "Banka kartı PIN değiştirme deneyimini araştıralım",
        "Kredi kartı limit artırma ve azaltma deneyimini araştıralım",
        "Hesaplar arası virman deneyimini test edelim",
        "Altın birikim hesabı deneyimini araştırmak istiyoruz",
        "Döviz alım satım spread ve komisyon bilgilendirmesini araştıralım",
        "Yatırım portföyü özeti ve performans raporlama deneyimini test edelim",
        "Kıymetli maden (altın, gümüş, platin) alım satım deneyimini araştıralım"
    ]

    for prompt in prompt_only_examples:
        examples.append(make_prompt_only(prompt))

    return examples


def main():
    all_examples = []

    # 1. Şimal's complete examples
    simal = get_simal_examples()
    print(f"Loaded {len(simal)} Şimal examples (complete with assistant responses)")
    all_examples.extend(simal)

    # 2. New comprehensive mobile banking examples
    new_banking = get_new_mobile_banking_examples()
    complete_count = sum(1 for e in new_banking if len(e["messages"]) == 3)
    prompt_count = sum(1 for e in new_banking if len(e["messages"]) == 2)
    print(f"Generated {len(new_banking)} new mobile banking examples ({complete_count} complete, {prompt_count} prompt-only)")
    all_examples.extend(new_banking)

    # 3. Existing RFT prompts (filter out duplicates based on user message)
    existing_user_msgs = set()
    for e in all_examples:
        for msg in e["messages"]:
            if msg["role"] == "user":
                existing_user_msgs.add(msg["content"].strip().lower())

    rft = get_existing_rft_prompts()
    added = 0
    skipped = 0
    for e in rft:
        user_msg = ""
        for msg in e["messages"]:
            if msg["role"] == "user":
                user_msg = msg["content"].strip().lower()
        if user_msg not in existing_user_msgs:
            all_examples.append(e)
            existing_user_msgs.add(user_msg)
            added += 1
        else:
            skipped += 1
    print(f"Added {added} existing RFT prompts, skipped {skipped} duplicates")

    # Write merged file
    output_path = "/Users/fibabanka/Searcho/search-ai-labs/fine-tuning/merged_training_data.jsonl"
    with open(output_path, "w", encoding="utf-8") as f:
        for example in all_examples:
            f.write(json.dumps(example, ensure_ascii=False) + "\n")

    print(f"\nTotal: {len(all_examples)} training examples written to {output_path}")

    # Stats
    complete_total = sum(1 for e in all_examples if len(e["messages"]) == 3)
    prompt_total = sum(1 for e in all_examples if len(e["messages"]) == 2)
    print(f"  - Complete (with assistant response): {complete_total}")
    print(f"  - Prompt-only (for RFT): {prompt_total}")


if __name__ == "__main__":
    main()
