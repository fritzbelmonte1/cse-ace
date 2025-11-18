-- Add context fields to extracted_questions table for Phase 2 enhancements
ALTER TABLE public.extracted_questions
ADD COLUMN IF NOT EXISTS document_section TEXT,
ADD COLUMN IF NOT EXISTS page_number INTEGER,
ADD COLUMN IF NOT EXISTS question_number TEXT,
ADD COLUMN IF NOT EXISTS preceding_context TEXT,
ADD COLUMN IF NOT EXISTS quality_metrics JSONB DEFAULT '{}'::jsonb;

-- Add index for better query performance on new fields
CREATE INDEX IF NOT EXISTS idx_extracted_questions_page_number ON public.extracted_questions(page_number);
CREATE INDEX IF NOT EXISTS idx_extracted_questions_document_section ON public.extracted_questions(document_section);

COMMENT ON COLUMN public.extracted_questions.document_section IS 'Section or chapter where question was found (e.g., "Chapter 3: Numerical Reasoning")';
COMMENT ON COLUMN public.extracted_questions.page_number IS 'Page number in source document';
COMMENT ON COLUMN public.extracted_questions.question_number IS 'Original question numbering from document (e.g., "Q.15", "15a")';
COMMENT ON COLUMN public.extracted_questions.preceding_context IS 'Instructions or context text before the question';
COMMENT ON COLUMN public.extracted_questions.quality_metrics IS 'Detailed quality scoring metrics from extraction';