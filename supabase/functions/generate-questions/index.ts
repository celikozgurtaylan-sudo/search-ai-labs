import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

## Bölüm Türlerine Göre Yaklaşım
- **Profesyonel Geçmiş**: "Bu alanda ne zamandır çalışıyorsun?", "Günlük iş akışında hangi araçları kullanıyorsun?"
- **İlk İzlenimler**: "İlk gördüğünde aklına ne geldi?", "Dikkatini çeken ilk şey ne oldu?"
- **Detaylı Keşif**: "Bu özelliği kullanırken hangi noktalarda zorlandın?", "Başka ürünlerle kıyasladığında ne fark ettin?"
- **Son Düşünceler**: "Bu deneyimi bir arkadaşına nasıl anlatırdın?", "Bir şeyi değiştirebilseydin ne yapardın?"

## Önemli
- Sorular 15-25 kelime uzunluğunda olsun
- Her soru farklı bir açıdan yaklaşsın
- Kullanıcının hikayesini dinlemeye odaklan, sorgu değil keşif yap`;

    const userPrompt = `Proje: ${projectDescription}

Bölüm: "${sectionTitle}" (ID: ${sectionId})

Var olan sorular:
${existingQuestions.map((q: string, i: number) => `${i + 1}. ${q}`).join('\n')}

Bu bölüm için 3 yeni, farklı ve yaratıcı soru üret. JSON formatında döndür:
{"questions": ["soru1", "soru2", "soru3"]}`;

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
          model: 'google/gemini-2.5-flash',
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
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.8,
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

    // Try to parse JSON from the response
    let questions;
    try {
      const jsonMatch = generatedText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        questions = JSON.parse(jsonMatch[0]).questions;
      } else {
        // Fallback: split by lines and clean up
        questions = generatedText
          .split('\n')
          .filter((line: string) => line.trim().match(/^\d+\./))
          .map((line: string) => line.replace(/^\d+\.\s*/, '').trim())
          .slice(0, 3);
      }
    } catch (e) {
      console.error('JSON parsing failed, using fallback:', e);
      questions = generatedText
        .split('\n')
        .filter((line: string) => line.trim().length > 10)
        .slice(0, 3)
        .map((line: string) => line.replace(/^[-*]\s*/, '').trim());
    }

    // Ensure we have at least some questions
    if (!questions || questions.length === 0) {
      questions = [
        'Bu konudaki deneyiminizi paylaşır mısınız?',
        'Size en çok ne dikkat çekiyor?',
        'Hangi iyileştirmeleri önerirsiniz?'
      ];
    }

    console.log('Final questions:', questions);

    return new Response(JSON.stringify({ questions: questions.slice(0, 3) }), {
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