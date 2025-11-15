-- Add status tracking to extracted_questions
ALTER TABLE public.extracted_questions 
ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_extracted_questions_status ON public.extracted_questions(status);
CREATE INDEX IF NOT EXISTS idx_extracted_questions_module_status ON public.extracted_questions(module, status);

-- Update RLS policy to only show approved questions to regular users
DROP POLICY IF EXISTS "Users can view questions" ON public.extracted_questions;

CREATE POLICY "Users can view approved questions"
ON public.extracted_questions
FOR SELECT
TO authenticated
USING (
  status = 'approved' OR has_role(auth.uid(), 'admin'::app_role)
);

-- Auto-approve all existing questions (one-time migration)
UPDATE public.extracted_questions 
SET status = 'approved' 
WHERE status = 'pending';