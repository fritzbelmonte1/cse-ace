-- Add question metadata tracking to mock_exams
ALTER TABLE mock_exams 
ADD COLUMN IF NOT EXISTS question_notes JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN mock_exams.question_notes IS 'Stores flags and notes for each question during exam. Format: {"questionId": {"flag": "difficult", "note": "text"}}';

-- Performance indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_mock_exams_user_completed 
ON mock_exams(user_id, completed_at DESC) 
WHERE status = 'completed';

CREATE INDEX IF NOT EXISTS idx_mock_exams_user_module 
ON mock_exams(user_id, module, completed_at DESC);

COMMENT ON INDEX idx_mock_exams_user_completed IS 'Optimizes analytics queries for completed exams timeline';
COMMENT ON INDEX idx_mock_exams_user_module IS 'Optimizes module-specific analytics queries';