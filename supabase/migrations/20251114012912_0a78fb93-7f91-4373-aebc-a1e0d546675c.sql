-- Add time tracking and topic breakdown to practice sessions
ALTER TABLE practice_sessions 
ADD COLUMN time_spent_seconds integer DEFAULT 0,
ADD COLUMN topic_scores jsonb DEFAULT '{}'::jsonb;

-- Add comment for clarity
COMMENT ON COLUMN practice_sessions.time_spent_seconds IS 'Total time spent on practice session in seconds';
COMMENT ON COLUMN practice_sessions.topic_scores IS 'JSON object with topic names as keys and scores as values';