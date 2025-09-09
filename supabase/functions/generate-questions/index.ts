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
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      throw new Error('OPENAI_API_KEY is not set');
    }

    const { sectionTitle, sectionId, projectDescription, existingQuestions = [] } = await req.json();

    const systemPrompt = `Sen bir kullanıcı deneyimi araştırması uzmanısın. Verilen proje açıklaması ve bölüm başlığına göre, o bölüm için uygun araştırma soruları oluştur.

Kurallar:
- Her soru Türkçe olmalı
- Sorular açık uçlu ve derinlemesine düşünmeyi teşvik etmeli
- Var olan sorulara benzer olmayan, farklı açılardan yaklaşan sorular üret
- Her soru 15-25 kelime arasında olmalı
- Sorular kullanıcı deneyimi araştırması için uygun olmalı
- Teknik jargon kullanma, anlaşılır dilde yaz

Bölüm türlerine göre soru tarzları:
- Profesyonel Geçmiş: Deneyim, rol, kullandığı araçlar hakkında
- İlk İzlenimler: Spontan tepkiler, duygusal yanıtlar
- Detaylı Keşif: Derinlemesine analiz, karşılaştırma, endişeler
- Son Düşünceler: Genel değerlendirme, öneriler, tavsiyeler`;

    const userPrompt = `Proje: ${projectDescription}

Bölüm: "${sectionTitle}" (ID: ${sectionId})

Var olan sorular:
${existingQuestions.map((q: string, i: number) => `${i + 1}. ${q}`).join('\n')}

Bu bölüm için 3 yeni, farklı ve yaratıcı soru üret. JSON formatında döndür:
{"questions": ["soru1", "soru2", "soru3"]}`;

    console.log('Generating questions for section:', sectionTitle);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
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
      error: error.message || 'Internal server error',
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