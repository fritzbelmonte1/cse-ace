-- Add indexes for better performance on question fetching for large exams
CREATE INDEX IF NOT EXISTS idx_extracted_questions_status_module 
ON public.extracted_questions(status, module);

CREATE INDEX IF NOT EXISTS idx_extracted_questions_approved 
ON public.extracted_questions(status) WHERE status = 'approved';