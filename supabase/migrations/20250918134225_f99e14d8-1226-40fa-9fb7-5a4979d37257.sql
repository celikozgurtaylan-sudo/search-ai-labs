-- Fix foreign key relationships for interview system

-- Add foreign key constraint from interview_responses to interview_questions
ALTER TABLE interview_responses 
ADD CONSTRAINT fk_interview_responses_question 
FOREIGN KEY (question_id) REFERENCES interview_questions(id) ON DELETE CASCADE;

-- Add foreign key constraint from interview_responses to study_sessions  
ALTER TABLE interview_responses 
ADD CONSTRAINT fk_interview_responses_session 
FOREIGN KEY (session_id) REFERENCES study_sessions(id) ON DELETE CASCADE;

-- Add foreign key constraint from interview_questions to study_sessions
ALTER TABLE interview_questions 
ADD CONSTRAINT fk_interview_questions_session 
FOREIGN KEY (session_id) REFERENCES study_sessions(id) ON DELETE CASCADE;

-- Add foreign key constraint from interview_questions to projects
ALTER TABLE interview_questions 
ADD CONSTRAINT fk_interview_questions_project 
FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- Add foreign key constraint from interview_responses to study_participants
ALTER TABLE interview_responses 
ADD CONSTRAINT fk_interview_responses_participant 
FOREIGN KEY (participant_id) REFERENCES study_participants(id) ON DELETE SET NULL;

-- Create indexes for better performance on foreign key columns
CREATE INDEX IF NOT EXISTS idx_interview_responses_question_id ON interview_responses(question_id);
CREATE INDEX IF NOT EXISTS idx_interview_responses_session_id ON interview_responses(session_id);
CREATE INDEX IF NOT EXISTS idx_interview_questions_session_id ON interview_questions(session_id);
CREATE INDEX IF NOT EXISTS idx_interview_questions_project_id ON interview_questions(project_id);