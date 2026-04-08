import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  cleanQuestion,
  resolveQuestionMode,
} from "../_shared/question-quality.ts";
import { buildQuestionLearningArtifacts } from "../_shared/question-learning.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

const parseAuthToken = (authorizationHeader: string | null) => {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    return null;
  }

  return authorizationHeader.slice("Bearer ".length).trim() || null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authToken = parseAuthToken(req.headers.get("Authorization"));
    if (!authToken) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const {
      projectId,
      researchMode = null,
      hasUsabilityContext = false,
      sectionTitle = "",
      sectionIndex,
      originalQuestionText,
      editedQuestionText,
      editSource = "manual_edit",
    } = await req.json();

    const cleanedOriginal = cleanQuestion(originalQuestionText);
    const cleanedEdited = cleanQuestion(editedQuestionText);

    if (!projectId || !cleanedOriginal || !cleanedEdited) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(authToken);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mode = resolveQuestionMode({
      researchMode: typeof researchMode === "string" ? researchMode : null,
      hasUsabilityContext: Boolean(hasUsabilityContext),
    });

    const learningArtifacts = buildQuestionLearningArtifacts({
      mode,
      sectionTitle,
      sectionIndex: typeof sectionIndex === "number" ? sectionIndex : undefined,
      originalQuestionText: cleanedOriginal,
      editedQuestionText: cleanedEdited,
    });

    const { data: insertedEvent, error: insertEventError } = await supabase
      .from("question_edit_events")
      .insert({
        project_id: projectId,
        user_id: user.id,
        research_mode: mode,
        section_title: sectionTitle || null,
        section_index: typeof sectionIndex === "number" ? sectionIndex : null,
        original_question_text: cleanedOriginal,
        edited_question_text: cleanedEdited,
        edit_source: editSource,
        original_quality_status: learningArtifacts.originalReview.status,
        edited_quality_status: learningArtifacts.editedReview.status,
        original_issues: learningArtifacts.originalReview.issues,
        edited_issues: learningArtifacts.editedReview.issues,
        diff_summary: learningArtifacts.diffSummary || null,
      })
      .select("id")
      .single();

    if (insertEventError) {
      throw new Error(`Failed to store question edit event: ${insertEventError.message}`);
    }

    let promoted = false;
    let memoryUpdated = false;

    if (learningArtifacts.memoryCandidate) {
      const { data: existingMemory, error: existingMemoryError } = await supabase
        .from("question_learning_memory")
        .select("id, usage_count, confidence_score")
        .eq("pattern_key", learningArtifacts.memoryCandidate.patternKey)
        .maybeSingle();

      if (existingMemoryError) {
        throw new Error(`Failed to load learning memory: ${existingMemoryError.message}`);
      }

      if (existingMemory?.id) {
        const { error: updateMemoryError } = await supabase
          .from("question_learning_memory")
          .update({
            trigger_phrases: learningArtifacts.memoryCandidate.triggerPhrases,
            avoid_phrases: learningArtifacts.memoryCandidate.avoidPhrases,
            preferred_phrases: learningArtifacts.memoryCandidate.preferredPhrases,
            bad_example: learningArtifacts.memoryCandidate.badExample,
            better_example: learningArtifacts.memoryCandidate.betterExample,
            usage_count: Number(existingMemory.usage_count ?? 0) + 1,
            confidence_score: Math.min(1, Number(existingMemory.confidence_score ?? 0.25) + 0.12),
            last_seen_at: new Date().toISOString(),
          })
          .eq("id", existingMemory.id);

        if (updateMemoryError) {
          throw new Error(`Failed to update learning memory: ${updateMemoryError.message}`);
        }
      } else {
        const { error: insertMemoryError } = await supabase
          .from("question_learning_memory")
          .insert({
            pattern_key: learningArtifacts.memoryCandidate.patternKey,
            pattern_type: learningArtifacts.memoryCandidate.patternType,
            applies_to_mode: learningArtifacts.memoryCandidate.appliesToMode,
            section_kind: learningArtifacts.memoryCandidate.sectionKind,
            trigger_phrases: learningArtifacts.memoryCandidate.triggerPhrases,
            avoid_phrases: learningArtifacts.memoryCandidate.avoidPhrases,
            preferred_phrases: learningArtifacts.memoryCandidate.preferredPhrases,
            bad_example: learningArtifacts.memoryCandidate.badExample,
            better_example: learningArtifacts.memoryCandidate.betterExample,
            confidence_score: 0.35,
            usage_count: 1,
            last_seen_at: new Date().toISOString(),
          });

        if (insertMemoryError) {
          throw new Error(`Failed to insert learning memory: ${insertMemoryError.message}`);
        }
      }

      promoted = true;
      memoryUpdated = true;
    }

    return new Response(JSON.stringify({
      success: true,
      eventId: insertedEvent.id,
      promoted,
      memoryUpdated,
      meaningfulChange: learningArtifacts.meaningfulChange,
      improved: learningArtifacts.improved,
      originalQuality: learningArtifacts.originalReview.status,
      editedQuality: learningArtifacts.editedReview.status,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in record-question-edit-learning:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Internal server error",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
