-- Add confidence_score column to extracted_questions table
ALTER TABLE public.extracted_questions 
ADD COLUMN confidence_score numeric DEFAULT 1.0 CHECK (confidence_score >= 0 AND confidence_score <= 1.0);

COMMENT ON COLUMN public.extracted_questions.confidence_score IS 'Quality score of extraction: 1.0 = perfect, 0.5 = questionable, lower = needs review';