import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildFallbackQuestions,
  isWarmupSectionTitle,
  repairGeneratedQuestions,
  resolveQuestionMode,
  sanitizeGeneratedQuestions,
  type ResearchQuestionMode,
} from "../_shared/question-quality.ts";
import {
  formatQuestionLearningHints,
  loadQuestionLearningHints,
} from "../_shared/question-learning.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

const clampQuestionCount = (count: unknown) => {
  if (typeof count !== 'number' || !Number.isFinite(count)) {
    return 1;
  }

  return Math.max(1, Math.min(3, Math.floor(count)));
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

const buildQuestionPrompt = (
  sectionTitle: string,
  sectionId: string,
  sectionIndex: number | undefined,
  projectDescription: string,
  existingQuestions: string[],
  count: number,
  mode: ResearchQuestionMode,
  learningHintsPrompt: string,
) => {
  const warmupSection = sectionIndex === 0 || isWarmupSectionTitle(sectionTitle);

  return `Proje: ${projectDescription}

Bölüm: "${sectionTitle}" (ID: ${sectionId}, Sıra: ${typeof sectionIndex === "number" ? sectionIndex + 1 : "bilinmiyor"})

${warmupSection ? `Bu bölüm görüşmenin ilk ısınma bölümüdür.
- Katılımcıyı rahatlatan, düşük baskılı ve konuşmayı açan sorular üret.
- İlk soru mutlaka katılımcının gününe veya o ana kadar ne yaptığına dokunsun.
- Ürün değerlendirmesine doğrudan yüklenme; önce bağlam ve gündelik deneyim aç.` : `Bu bölüm görüşmenin ana araştırma bölümüdür.
- Warm-up sorusu üretme.
- Soruları bu bölümün araştırma odağına sadık, açık uçlu ve tek odaklı kur.`}

Var olan sorular:
${existingQuestions.map((q: string, i: number) => `${i + 1}. ${q}`).join('\n')}

${learningHintsPrompt ? `${learningHintsPrompt}\n` : ""}

Bu bölüm için ${count} yeni, farklı ve yaratıcı soru üret. JSON formatında döndür:
{"questions": [${Array.from({ length: count }, (_, index) => `"soru${index + 1}"`).join(', ')}]}`;
};

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

    const {
      sectionTitle,
      sectionId,
      sectionIndex,
      projectDescription,
      existingQuestions = [],
      validateProject = false,
      count,
      mode,
    } = await req.json();
    const requestedCount = clampQuestionCount(count);
    const warmupSection = sectionIndex === 0 || isWarmupSectionTitle(sectionTitle);
    const resolvedMode = resolveQuestionMode({
      researchMode: typeof mode === "string" ? mode : null,
      hasUsabilityContext: typeof mode === "string" && mode === "usability",
    });
    const learningHints = await loadQuestionLearningHints(supabase, {
      mode: resolvedMode,
      sectionTitle,
      sectionIndex,
      limit: 6,
    });
    const learningHintsPrompt = formatQuestionLearningHints(learningHints);

    const systemPrompt = `Sen Türkiye'de çalışan deneyimli bir UX araştırmacısısın. Kullanıcı görüşmeleri, kullanılabilirlik testleri ve keşifsel araştırmalarda uzmanlaşmışsın.

## Senin Görevin
Verilen proje açıklamasını derinlemesine analiz et ve o bölüm için profesyonel, doğal Türkçe UX araştırma soruları oluştur.

## Nasıl Yaklaşmalısın?
1. **Bağlamı Anla**: Proje açıklamasındaki ürün, hedef kitle, ve araştırma amacını kavra
2. **Kullanıcı Perspektifi**: Gerçek bir kullanıcının yaşadığı deneyimi, duyguları ve zorluklarını keşfedecek sorular sor
3. **Doğal Türkçe**: Günlük konuşma diline yakın ama profesyonel bir dil kullan. "Memnun musunuz?" yerine "Bu deneyimi kullanırken neler hissettin?" gibi
4. **Empati ve Merak**: Kullanıcının hikayesini dinlemek isteyen samimi bir araştırmacı gibi sor

## Soru Metodolojisi
- Görüşme soruları genişten özele ilerlemeli
- İlk bölüm warm-up ise katılımcıyı rahatlatan, gündelik ve düşük baskılı sorular üret
- Warm-up bölümünün ilk sorusu mutlaka katılımcının gününe veya o ana kadar ne yaptığına değsin
- Warm-up olmayan bölümlerde rapport yerine doğrudan araştırma odağına gir
- Her soru tek bir amaca hizmet etsin
- Mümkünse soru metninde "ve" kullanma; tek soruda tek odak koru
- "Kendi cümlelerinizle" gibi gereksiz paraphrase kalıplarını kullanma
- Kullanıcının anlamını senin çerçevelediğin "nasıl anlıyorsunuz" gibi kalıplardan kaçın
- Özellikle usability bağlamında UI öğesini önce sen isimlendirip sonra anlamını sorma

## Soru Kalitesi Kriterleri
✓ **Açık Uçlu**: "Evet/Hayır" yerine detaylı anlatımı teşvik etmeli
✓ **Özel ve İlgili**: Genel değil, projeye özgü olmalı
✓ **Samimi Üslup**: Robotik değil, konuşur gibi doğal Türkçe
✓ **Keşfedici**: Kullanıcının deneyimini, duygularını, motivasyonunu anlamaya yönelik
✓ **Jargonsuz**: Teknik terimler yerine anlaşılır günlük dil
✓ **Bağlamsal**: Var olan soruları tekrar etme, farklı açılardan yaklaş
✓ **Nötr ve Yönlendirmesiz**: Kullanıcıya bir sorun, duygu veya yargı empoze etme

## Bölüm Türlerine Göre Yaklaşım
- **Isınma**: "Bugün gününüz nasıl geçiyor, buraya gelmeden önce neler yapıyordunuz?", "Bu konunun günlük hayatınızda ne kadar yeri var?"
- **Profesyonel Geçmiş / Bağlam**: "Bu alanda ne zamandır çalışıyorsun?", "Günlük iş akışında hangi araçları kullanıyorsun?"
- **İlk İzlenimler**: "İlk gördüğünde aklına ne geldi?", "Dikkatini çeken ilk şey ne oldu?"
- **Detaylı Keşif**: "Bu özelliği kullanırken aklından neler geçti?", "Başka ürünlerle kıyasladığında sana ne farklı göründü?"
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
- Soru metninde "ve" ile iki odağı birleştirme
- "Kendi cümlelerinizle" yazma
- "(... ) nasıl anlıyorsunuz" gibi framing yapma

## Kötü ve İyi Örnekler
- Kötü: "Promosyon metni ve görsel öğeler arasında anlam karışıklığı yaşadığınız bir bölüm oldu mu?"
- İyi: "Promosyon metni size nasıl bir mesaj veriyor?"
- Kötü: "Bu alan size güven verdi mi?"
- İyi: "Bu alan sizde nasıl bir izlenim bıraktı?"
- Kötü: "Zaman dilimi kısaltmalarını (1G, 1H, 1A) nasıl anlıyorsunuz?"
- İyi: "(1G, 1H, 1A) gibi ifadeler size ne anlatıyor?"
- Kötü: "Bu deneyimi kendi cümlelerinizle nasıl anlatırsınız?"
- İyi: "Bu deneyimi nasıl tarif edersiniz?"

Çıktıdan önce kendi kendine kontrol et: Her soru nötr, açık uçlu ve varsayımsız mı? Değilse yeniden yaz.`;

    const userPrompt = buildQuestionPrompt(
      sectionTitle,
      sectionId,
      sectionIndex,
      projectDescription,
      existingQuestions,
      requestedCount,
      resolvedMode,
      learningHintsPrompt,
    );

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
    questions = repairGeneratedQuestions(questions, { sectionTitle, sectionIndex, mode: resolvedMode });
    let { valid, rejected } = sanitizeGeneratedQuestions(questions, { sectionTitle, sectionIndex, mode: resolvedMode });

    if (valid.length < requestedCount) {
      console.log('Retrying question generation due to leading or weak questions:', rejected);

      const retryPrompt = `${buildQuestionPrompt(sectionTitle, sectionId, sectionIndex, projectDescription, existingQuestions, requestedCount, resolvedMode, learningHintsPrompt)}

Aşağıdaki sorular leading, varsayımsız değil veya yeterince açık uçlu olmadığı için reddedildi:
${questions.map((question, index) => `${index + 1}. ${question}`).join('\n')}

Sadece nötr, açık uçlu ve varsayımsız ${requestedCount} soru üret. ${warmupSection ? "Bu bölüm warm-up olduğu için sorular hafif, sohbet açıcı ve gündelik tonda olsun." : "Warm-up sorusu üretme."} "Oldu mu?", "yaşadınız mı?", "karışıklık", "sorun", "problem", "güven verdi mi?", "kendi cümlelerinizle", "nasıl anlıyorsunuz" gibi kalıpları kullanma.`;

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
        questions = repairGeneratedQuestions(questions, { sectionTitle, sectionIndex, mode: resolvedMode });
        ({ valid, rejected } = sanitizeGeneratedQuestions(questions, { sectionTitle, sectionIndex, mode: resolvedMode }));
      }
    }

    if (rejected.length > 0) {
      console.log('Rejected leading questions:', rejected);
    }

    if (valid.length === 0) {
      valid = buildFallbackQuestions(sectionTitle, sectionIndex, resolvedMode);
    }

    if (valid.length < requestedCount) {
      valid = [...valid, ...buildFallbackQuestions(sectionTitle, sectionIndex, resolvedMode)].slice(0, requestedCount);
    }

    console.log('Final questions:', valid);

    return new Response(JSON.stringify({ questions: valid.slice(0, requestedCount) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in generate-questions function:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Internal server error',
      questions: [
        'Bu konudaki deneyiminizde ilk aklınıza gelen şey ne oldu?',
        'Burada size en net gelen nokta neydi?',
        'Bir değişiklik önerseniz ilk nereden başlardınız?'
      ]
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
