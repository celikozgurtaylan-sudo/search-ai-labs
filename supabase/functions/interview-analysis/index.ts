import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sessionId, projectId } = await req.json();

    // Get all questions and responses for the session
    const { data: questions, error } = await supabase
      .from('interview_questions')
      .select(`
        *,
        interview_responses!inner(*)
      `)
      .eq('session_id', sessionId)
      .eq('interview_responses.is_complete', true)
      .order('question_order', { ascending: true });

    if (error) {
      throw new Error(`Failed to get interview data: ${error.message}`);
    }

    if (!questions || questions.length === 0) {
      throw new Error('No completed interview responses found');
    }

    // Prepare data for AI analysis
    const interviewData = questions.map(q => ({
      section: q.section,
      question: q.question_text,
      responses: q.interview_responses.map((r: any) => r.transcription).filter(Boolean)
    }));

    // Generate analysis using OpenAI
    const analysis = await generateAnalysis(interviewData);

    // Save analysis back to project
    const { error: updateError } = await supabase
      .from('projects')
      .update({
        analysis: {
          ...analysis,
          sessionId,
          analyzedAt: new Date().toISOString(),
          questionsAnalyzed: questions.length,
          responsesAnalyzed: questions.reduce((acc, q) => acc + q.interview_responses.length, 0)
        }
      })
      .eq('id', projectId);

    if (updateError) {
      console.error('Failed to save analysis:', updateError);
    }

    return new Response(
      JSON.stringify({ success: true, analysis }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Interview analysis error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

async function generateAnalysis(interviewData: any[]) {
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  // Prepare comprehensive analysis prompt
  const analysisPrompt = `
You are a UX research expert analyzing interview responses. Please provide a comprehensive analysis of the following interview data.

Interview Data:
${JSON.stringify(interviewData, null, 2)}

Please provide analysis in the following JSON format:
{
  "summary": "Overall summary of findings",
  "keyInsights": [
    "Key insight 1",
    "Key insight 2",
    "Key insight 3"
  ],
  "themes": {
    "theme1": {
      "title": "Theme Title",
      "description": "Theme description",
      "supportingQuotes": ["Quote 1", "Quote 2"]
    }
  },
  "recommendations": [
    {
      "title": "Recommendation 1",
      "description": "Detailed recommendation",
      "priority": "high|medium|low",
      "rationale": "Why this recommendation"
    }
  ],
  "painPoints": [
    "Pain point 1",
    "Pain point 2"
  ],
  "opportunities": [
    "Opportunity 1",
    "Opportunity 2"
  ],
  "userBehaviors": [
    "Observed behavior 1",
    "Observed behavior 2"
  ],
  "demographics": {
    "summary": "Demographics summary if available"
  }
}

Focus on actionable insights that can drive product decisions. Look for patterns, contradictions, and unexpected findings.
`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a UX research expert. Provide structured, actionable analysis of user interview data.' },
        { role: 'user', content: analysisPrompt }
      ],
      temperature: 0.3,
      max_tokens: 4000
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${await response.text()}`);
  }

  const data = await response.json();
  let analysisText = data.choices[0].message.content;

  try {
    // Try to parse as JSON
    return JSON.parse(analysisText);
  } catch (e) {
    // If not valid JSON, return structured fallback
    return {
      summary: analysisText,
      keyInsights: ["Analysis completed - see summary for details"],
      themes: {},
      recommendations: [{
        title: "Review Analysis",
        description: "Review the generated analysis summary",
        priority: "medium",
        rationale: "Generated analysis needs review"
      }],
      painPoints: [],
      opportunities: [],
      userBehaviors: [],
      demographics: { summary: "Not available" }
    };
  }
}