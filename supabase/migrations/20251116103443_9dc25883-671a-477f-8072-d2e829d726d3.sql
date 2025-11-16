-- Add pause functionality to mock_exams table
ALTER TABLE public.mock_exams 
ADD COLUMN IF NOT EXISTS paused_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS total_pause_time_seconds integer DEFAULT 0;

-- Add comment for clarity
COMMENT ON COLUMN public.mock_exams.paused_at IS 'Timestamp when exam was last paused';
COMMENT ON COLUMN public.mock_exams.total_pause_time_seconds IS 'Total time spent paused in seconds';