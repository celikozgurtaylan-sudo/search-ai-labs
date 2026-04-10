-- Clean up duplicate questions, keep only the first one for each (session_id, question_order)
WITH ranked_questions AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (
      PARTITION BY session_id, question_order 
      ORDER BY created_at ASC
    ) as rn
  FROM interview_questions
)
DELETE FROM interview_questions
WHERE id IN (
  SELECT id FROM ranked_questions WHERE rn > 1
);

-- Add unique constraint to prevent future duplicates
ALTER TABLE interview_questions
ADD CONSTRAINT interview_questions_session_question_order_unique 
UNIQUE (session_id, question_order);