import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const parseQuestionsFromText = (generatedText: string): string[] => {
  try {
    const jsonMatch = generatedText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed.questions)) {
        return parsed.questions;
      }
    }
  } catch (error) {
    console.error('JSON parsing failed, using fallback:', error);
  }

  const numberedQuestions = generatedText
    .split('\n')
    .filter((line: string) => line.trim().match(/^\d+\./))
    .map((line: string) => line.replace(/^\d+\.\s*/, '').trim())
    .slice(0, 3);

  if (numberedQuestions.length > 0) {
    return numberedQuestions;
  }

  return generatedText
    .split('\n')
    .filter((line: string) => line.trim().length > 10)
    .slice(0, 3)
    .map((line: string) => line.replace(/^[-*]\s*/, '').trim());
};

const normalizeQuestion = (question: string) =>
  question
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, ' ')
    .trim();

const isLikelyLeadingQuestion = (question: string) => {
  const normalized = normalizeQuestion(question);

  const directLeadingPatterns = [
    /oldu mu\??$/,
    /geldi mi\??$/,
    /verdi mi\??$/,
    /yaşad[ıi]n[ıi]z mı\??$/,
    /yaşad[ıi]ğ[ıi]n[ıi]z bir .* oldu mu\??$/,
    /fark ettiniz mi\??$/,
    /zorland[ıi]n[ıi]z mı\??$/,
    /memnun musunuz\??$/,
    /ikna edici/,
    /güven ver/,
    /karışıklık/,
  ];

  if (directLeadingPatterns.some((pattern) => pattern.test(normalized))) {
    return true;
  }

  const assumptiveStarts = [
    'hangi sorun',
    'hangi problem',
    'hangi endişe',
    'hangi tereddüt',
    'nerede zorland',
    'neden zorland',
    'hangi noktada zorland',
    'neden karıştı',
    'hangi bölüm yetersiz',
    'hangi bölüm eksik',
  ];

  return assumptiveStarts.some((pattern) => normalized.startsWith(pattern));
};

const sanitizeQuestions = (questions: string[]) => {
  const uniqueQuestions = Array.from(new Set(
    questions
      .map((question) => question.trim())
      .filter((question) => question.length > 0)
  ));

  const valid = uniqueQuestions.filter((question) => !isLikelyLeadingQuestion(question));
  const rejected = uniqueQuestions.filter((question) => isLikelyLeadingQuestion(question));

  return { valid, rejected };
};

const getFallbackQuestions = (sectionTitle: string) => {
  const normalizedSectionTitle = sectionTitle.toLocaleLowerCase('tr-TR');

  if (normalizedSectionTitle.includes('ilk izlenim')) {
    return [
      'Bu ekranı ilk gördüğünüzde dikkatinizi en çok ne çekti?',
      'Burada size ne anlatılmak istendiğini kendi cümlelerinizle nasıl tarif edersiniz?',
      'İlk bakışta size net gelen ve belirsiz kalan noktalar nelerdi?',
    ];
  }

  if (normalizedSectionTitle.includes('son düşünce')) {
    return [
      'Bu deneyimi genel olarak nasıl özetlersiniz?',
      'Sizin için en önemli nokta neydi?',
      'Bu deneyimi geliştirmek için nereden başlamayı önerirsiniz?',
    ];
  }

  return [
    'Bu bölümde dikkatinizi en çok ne çekti?',
    'Burada yaşadığınız deneyimi kendi cümlelerinizle anlatır mısınız?',
    'Bu bölüm size neyi düşündürdü?',
  ];
};

const buildQuestionPrompt = (sectionTitle: string, sectionId: string, projectDescription: string, existingQuestions: string[]) => `Proje: ${projectDescription}

Bölüm: "${sectionTitle}" (ID: ${sectionId})

Var olan sorular:
${existingQuestions.map((q: string, i: number) => `${i + 1}. ${q}`).join('\n')}

Bu bölüm için 3 yeni, farklı ve yaratıcı soru üret. JSON formatında döndür:
{"questions": ["soru1", "soru2", "soru3"]}`;

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY is not set');
    }

    const { sectionTitle, sectionId, projectDescription, existingQuestions = [], validateProject = false } = await req.json();

    const systemPrompt = `Sen Türkiye'de çalışan deneyimli bir UX araştırmacısısın. Kullanıcı görüşmeleri, kullanılabilirlik testleri ve keşifsel araştırmalarda uzmanlaşmışsın.

## Senin Görevin
Verilen proje açıklamasını derinlemesine analiz et ve o bölüm için profesyonel, doğal Türkçe UX araştırma soruları oluştur.

## Nasıl Yaklaşmalısın?
1. **Bağlamı Anla**: Proje açıklamasındaki ürün, hedef kitle, ve araştırma amacını kavra
2. **Kullanıcı Perspektifi**: Gerçek bir kullanıcının yaşadığı deneyimi, duyguları ve zorluklarını keşfedecek sorular sor
3. **Doğal Türkçe**: Günlük konuşma diline yakın ama profesyonel bir dil kullan. "Memnun musunuz?" yerine "Bu deneyimi kullanırken neler hissettin?" gibi
4. **Empati ve Merak**: Kullanıcının hikayesini dinlemek isteyen samimi bir araştırmacı gibi sor

## Soru Kalitesi Kriterleri
✓ **Açık Uçlu**: "Evet/Hayır" yerine detaylı anlatımı teşvik etmeli
✓ **Özel ve İlgili**: Genel değil, projeye özgü olmalı
✓ **Samimi Üslup**: Robotik değil, konuşur gibi doğal Türkçe
✓ **Keşfedici**: Kullanıcının deneyimini, duygularını, motivasyonunu anlamaya yönelik
✓ **Jargonsuz**: Teknik terimler yerine anlaşılır günlük dil
✓ **Bağlamsal**: Var olan soruları tekrar etme, farklı açılardan yaklaş
✓ **Nötr ve Yönlendirmesiz**: Kullanıcıya bir sorun, duygu veya yargı empoze etme

## Bölüm Türlerine Göre Yaklaşım
- **Profesyonel Geçmiş**: "Bu alanda ne zamandır çalışıyorsun?", "Günlük iş akışında hangi araçları kullanıyorsun?"
- **İlk İzlenimler**: "İlk gördüğünde aklına ne geldi?", "Dikkatini çeken ilk şey ne oldu?"
- **Detaylı Keşif**: "Bu özelliği kullanırken hangi noktalarda zorlandın?", "Başka ürünlerle kıyasladığında ne fark ettin?"
- **Son Düşünceler**: "Bu deneyimi bir arkadaşına nasıl anlatırdın?", "Bir şeyi değiştirebilseydin ne yapardın?"

## Önemli
- Sorular 15-25 kelime uzunluğunda olsun
- Her soru farklı bir açıdan yaklaşsın
- Kullanıcının hikayesini dinlemeye odaklan, sorgu değil keşif yap

## Kesin Yasaklar
- Leading question yazma
- Sorunun içinde "karışıklık", "sorun", "problem", "eksik", "güven verdi", "ikna edici" gibi yargı veya varsayım gömme
- Evet/hayır ile cevaplanabilecek şekilde soru kurma
- Kullanıcının olumsuz bir deneyim yaşadığını varsayma

## Kötü ve İyi Örnekler
- Kötü: "Promosyon metni ve görsel öğeler arasında anlam karışıklığı yaşadığınız bir bölüm oldu mu?"
- İyi: "Promosyon metni ve görsellerin birlikte nasıl bir mesaj verdiğini anlatır mısınız?"
- Kötü: "Bu alan size güven verdi mi?"
- İyi: "Bu alan sizde nasıl bir izlenim bıraktı?"

Çıktıdan önce kendi kendine kontrol et: Her soru nötr, açık uçlu ve varsayımsız mı? Değilse yeniden yaz.`;

    const userPrompt = buildQuestionPrompt(sectionTitle, sectionId, projectDescription, existingQuestions);

    console.log('Generating questions for section:', sectionTitle);

    // Validate if the input is actually a research project
    if (validateProject) {
      const validationPrompt = `Bu metin bir araştırma projesi tanımı mı? Evet/Hayır ile yanıtla ve kısa açıklama yap.

Metin: "${projectDescription}"

Bir araştırma projesi için şunlar beklenir:
- Kullanıcı deneyimi, pazar araştırması, ürün testi gibi araştırma konuları
- Belirli bir hedef kitle veya problem tanımı
- Test edilecek hipotez veya cevaplanacak sorular
- Genel sohbet, kişisel konular, teknik sorular değil

Yanıt formatı: {"isResearchProject": true/false, "reason": "kısa açıklama"}`;

      const validationResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lovableApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
         model: 'openai/gpt-5.2',
         messages: [
           { role: 'user', content: validationPrompt }
         ],
          temperature: 0.3,
          max_tokens: 200,
        }),
      });

      if (validationResponse.ok) {
        const validationData = await validationResponse.json();
        const validationText = validationData.choices[0].message.content;
        
        try {
          const jsonMatch = validationText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const validation = JSON.parse(jsonMatch[0]);
            if (!validation.isResearchProject) {
              console.log('Input is not a research project:', validation.reason);
              return new Response(JSON.stringify({ 
                needsElaboration: true, 
                reason: validation.reason,
                message: 'Bu bir araştırma projesi gibi görünmüyor. Lütfen daha detaylı bir proje açıklaması yapın.'
              }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }
          }
        } catch (e) {
          console.log('Validation parsing failed, proceeding with generation');
        }
      }
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-5.2',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.5,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('OpenAI API error:', errorData);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const generatedText = data.choices[0].message.content;
    
    console.log('Generated response:', generatedText);

    let questions = parseQuestionsFromText(generatedText);
    let { valid, rejected } = sanitizeQuestions(questions);

    if (valid.length < 3) {
      console.log('Retrying question generation due to leading or weak questions:', rejected);

      const retryPrompt = `${buildQuestionPrompt(sectionTitle, sectionId, projectDescription, existingQuestions)}

Aşağıdaki sorular leading, varsayımsız değil veya yeterince açık uçlu olmadığı için reddedildi:
${questions.map((question, index) => `${index + 1}. ${question}`).join('\n')}

Sadece nötr, açık uçlu ve varsayımsız 3 soru üret. "Oldu mu?", "yaşadınız mı?", "karışıklık", "sorun", "problem", "güven verdi mi?" gibi kalıpları kullanma.`;

      const retryResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lovableApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'openai/gpt-5.2',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: retryPrompt }
          ],
          temperature: 0.35,
          max_tokens: 500,
        }),
      });

      if (retryResponse.ok) {
        const retryData = await retryResponse.json();
        questions = parseQuestionsFromText(retryData.choices[0].message.content);
        ({ valid, rejected } = sanitizeQuestions(questions));
      }
    }

    if (rejected.length > 0) {
      console.log('Rejected leading questions:', rejected);
    }

    if (valid.length === 0) {
      valid = getFallbackQuestions(sectionTitle);
    }

    if (valid.length < 3) {
      valid = [...valid, ...getFallbackQuestions(sectionTitle)].slice(0, 3);
    }

    console.log('Final questions:', valid);

    return new Response(JSON.stringify({ questions: valid.slice(0, 3) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in generate-questions function:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Internal server error',
      questions: [
        'Bu konudaki deneyiminizi anlatır mısınız?',
        'Size en önemli görünen nokta nedir?',
        'Hangi değişiklikleri önerirsiniz?'
      ]
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
