-- Create question versions table for full audit trail
CREATE TABLE public.question_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES public.extracted_questions(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  
  -- Store complete question snapshot
  question TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  option_d TEXT NOT NULL,
  correct_answer TEXT NOT NULL,
  module TEXT NOT NULL,
  confidence_score NUMERIC,
  status TEXT,
  
  -- Audit fields
  changed_by UUID REFERENCES auth.users(id),
  changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  change_type TEXT NOT NULL, -- 'created', 'updated', 'rollback', 'status_changed'
  change_summary TEXT, -- Brief description of what changed
  
  UNIQUE(question_id, version_number)
);

-- Create index for efficient version queries
CREATE INDEX idx_question_versions_question_id ON public.question_versions(question_id, version_number DESC);
CREATE INDEX idx_question_versions_changed_at ON public.question_versions(changed_at DESC);

-- Enable RLS
ALTER TABLE public.question_versions ENABLE ROW LEVEL SECURITY;

-- Admins can view all versions
CREATE POLICY "Admins can view all versions"
ON public.question_versions
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- System can insert versions (via trigger)
CREATE POLICY "System can insert versions"
ON public.question_versions
FOR INSERT
WITH CHECK (true);

-- Function to capture question changes
CREATE OR REPLACE FUNCTION public.capture_question_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version_number INTEGER;
  v_change_type TEXT;
  v_change_summary TEXT;
BEGIN
  -- Determine change type and version number
  IF TG_OP = 'INSERT' THEN
    v_version_number := 1;
    v_change_type := 'created';
    v_change_summary := 'Question created';
  ELSE
    -- Get next version number
    SELECT COALESCE(MAX(version_number), 0) + 1
    INTO v_version_number
    FROM public.question_versions
    WHERE question_id = NEW.id;
    
    -- Determine what changed
    IF OLD.status != NEW.status THEN
      v_change_type := 'status_changed';
      v_change_summary := 'Status changed from ' || OLD.status || ' to ' || NEW.status;
    ELSIF OLD.question != NEW.question OR 
          OLD.option_a != NEW.option_a OR 
          OLD.option_b != NEW.option_b OR 
          OLD.option_c != NEW.option_c OR 
          OLD.option_d != NEW.option_d OR 
          OLD.correct_answer != NEW.correct_answer THEN
      v_change_type := 'updated';
      v_change_summary := 'Question content updated';
    ELSIF OLD.module != NEW.module THEN
      v_change_type := 'updated';
      v_change_summary := 'Module changed from ' || OLD.module || ' to ' || NEW.module;
    ELSE
      v_change_type := 'updated';
      v_change_summary := 'Question metadata updated';
    END IF;
  END IF;
  
  -- Insert version snapshot
  INSERT INTO public.question_versions (
    question_id,
    version_number,
    question,
    option_a,
    option_b,
    option_c,
    option_d,
    correct_answer,
    module,
    confidence_score,
    status,
    changed_by,
    changed_at,
    change_type,
    change_summary
  ) VALUES (
    NEW.id,
    v_version_number,
    NEW.question,
    NEW.option_a,
    NEW.option_b,
    NEW.option_c,
    NEW.option_d,
    NEW.correct_answer,
    NEW.module,
    NEW.confidence_score,
    NEW.status,
    auth.uid(),
    now(),
    v_change_type,
    v_change_summary
  );
  
  RETURN NEW;
END;
$$;

-- Trigger to automatically capture versions
CREATE TRIGGER capture_question_version_trigger
AFTER INSERT OR UPDATE ON public.extracted_questions
FOR EACH ROW
EXECUTE FUNCTION public.capture_question_version();

-- Function to rollback to a specific version
CREATE OR REPLACE FUNCTION public.rollback_question_to_version(
  p_question_id UUID,
  p_version_number INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version RECORD;
  v_result JSONB;
BEGIN
  -- Check if user is admin
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can rollback questions';
  END IF;
  
  -- Get the version to rollback to
  SELECT * INTO v_version
  FROM public.question_versions
  WHERE question_id = p_question_id
    AND version_number = p_version_number;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Version not found';
  END IF;
  
  -- Update the question with the old version data
  UPDATE public.extracted_questions
  SET
    question = v_version.question,
    option_a = v_version.option_a,
    option_b = v_version.option_b,
    option_c = v_version.option_c,
    option_d = v_version.option_d,
    correct_answer = v_version.correct_answer,
    module = v_version.module,
    confidence_score = v_version.confidence_score,
    status = v_version.status
  WHERE id = p_question_id;
  
  -- The trigger will automatically create a new version entry with change_type='rollback'
  -- But we need to update the change_summary
  UPDATE public.question_versions
  SET 
    change_type = 'rollback',
    change_summary = 'Rolled back to version ' || p_version_number
  WHERE question_id = p_question_id
    AND version_number = (
      SELECT MAX(version_number)
      FROM public.question_versions
      WHERE question_id = p_question_id
    );
  
  v_result := jsonb_build_object(
    'success', true,
    'message', 'Question rolled back to version ' || p_version_number
  );
  
  RETURN v_result;
END;
$$;