-- Phase 3: Create question_corrections table for learning from admin edits
CREATE TABLE IF NOT EXISTS public.question_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_question_id UUID NOT NULL REFERENCES public.extracted_questions(id) ON DELETE CASCADE,
  field_changed TEXT NOT NULL,
  original_value TEXT,
  corrected_value TEXT,
  correction_type TEXT NOT NULL,
  document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE,
  corrected_by UUID,
  corrected_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_question_corrections_question_id ON public.question_corrections(original_question_id);
CREATE INDEX IF NOT EXISTS idx_question_corrections_document_id ON public.question_corrections(document_id);
CREATE INDEX IF NOT EXISTS idx_question_corrections_correction_type ON public.question_corrections(correction_type);
CREATE INDEX IF NOT EXISTS idx_question_corrections_field_changed ON public.question_corrections(field_changed);

-- RLS policies for question_corrections
ALTER TABLE public.question_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all corrections"
  ON public.question_corrections FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can insert corrections"
  ON public.question_corrections FOR INSERT
  WITH CHECK (true);

-- Add progress tracking to documents table
ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS processing_checkpoint JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_documents_processing_checkpoint ON public.documents USING gin(processing_checkpoint);

COMMENT ON COLUMN public.documents.processing_checkpoint IS 'Checkpoint data for resumable processing: lastProcessedChunk, totalChunks, extractedQuestions, failedChunks, startedAt, estimatedCompletion';

COMMENT ON TABLE public.question_corrections IS 'Tracks admin corrections to questions for learning and improving future extractions';
COMMENT ON COLUMN public.question_corrections.field_changed IS 'Field that was corrected: question, option_a, option_b, option_c, option_d, correct_answer, module';
COMMENT ON COLUMN public.question_corrections.correction_type IS 'Type of correction: formatting, content, answer_key, module_change, clarity';

-- Function to automatically capture corrections when questions are updated
CREATE OR REPLACE FUNCTION public.capture_question_correction()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_field TEXT;
  v_correction_type TEXT;
BEGIN
  -- Only capture changes by admins after initial creation
  IF TG_OP = 'UPDATE' AND OLD.created_at < NEW.created_at - INTERVAL '1 minute' THEN
    
    -- Check each field for changes
    IF OLD.question != NEW.question THEN
      v_correction_type := CASE 
        WHEN LENGTH(NEW.question) > LENGTH(OLD.question) * 1.5 THEN 'clarity'
        WHEN NEW.question ~ '[A-Z][a-z]' AND NOT (OLD.question ~ '[A-Z][a-z]') THEN 'formatting'
        ELSE 'content'
      END;
      
      INSERT INTO public.question_corrections (
        original_question_id, field_changed, original_value, corrected_value, 
        correction_type, document_id, corrected_by
      ) VALUES (
        NEW.id, 'question', OLD.question, NEW.question,
        v_correction_type, NEW.document_id, auth.uid()
      );
    END IF;
    
    -- Track option changes
    IF OLD.option_a != NEW.option_a THEN
      INSERT INTO public.question_corrections (
        original_question_id, field_changed, original_value, corrected_value, 
        correction_type, document_id, corrected_by
      ) VALUES (
        NEW.id, 'option_a', OLD.option_a, NEW.option_a,
        'content', NEW.document_id, auth.uid()
      );
    END IF;
    
    IF OLD.option_b != NEW.option_b THEN
      INSERT INTO public.question_corrections (
        original_question_id, field_changed, original_value, corrected_value, 
        correction_type, document_id, corrected_by
      ) VALUES (
        NEW.id, 'option_b', OLD.option_b, NEW.option_b,
        'content', NEW.document_id, auth.uid()
      );
    END IF;
    
    IF OLD.option_c != NEW.option_c THEN
      INSERT INTO public.question_corrections (
        original_question_id, field_changed, original_value, corrected_value, 
        correction_type, document_id, corrected_by
      ) VALUES (
        NEW.id, 'option_c', OLD.option_c, NEW.option_c,
        'content', NEW.document_id, auth.uid()
      );
    END IF;
    
    IF OLD.option_d != NEW.option_d THEN
      INSERT INTO public.question_corrections (
        original_question_id, field_changed, original_value, corrected_value, 
        correction_type, document_id, corrected_by
      ) VALUES (
        NEW.id, 'option_d', OLD.option_d, NEW.option_d,
        'content', NEW.document_id, auth.uid()
      );
    END IF;
    
    -- Track answer key changes
    IF OLD.correct_answer != NEW.correct_answer THEN
      INSERT INTO public.question_corrections (
        original_question_id, field_changed, original_value, corrected_value, 
        correction_type, document_id, corrected_by
      ) VALUES (
        NEW.id, 'correct_answer', OLD.correct_answer, NEW.correct_answer,
        'answer_key', NEW.document_id, auth.uid()
      );
    END IF;
    
    -- Track module changes
    IF OLD.module != NEW.module THEN
      INSERT INTO public.question_corrections (
        original_question_id, field_changed, original_value, corrected_value, 
        correction_type, document_id, corrected_by
      ) VALUES (
        NEW.id, 'module', OLD.module, NEW.module,
        'module_change', NEW.document_id, auth.uid()
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to extracted_questions
DROP TRIGGER IF EXISTS trigger_capture_question_correction ON public.extracted_questions;
CREATE TRIGGER trigger_capture_question_correction
  AFTER UPDATE ON public.extracted_questions
  FOR EACH ROW
  EXECUTE FUNCTION public.capture_question_correction();