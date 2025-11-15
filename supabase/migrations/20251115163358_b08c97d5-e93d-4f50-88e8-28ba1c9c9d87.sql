-- Create mock_exams table for timed exam functionality
CREATE TABLE public.mock_exams (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  exam_type TEXT NOT NULL CHECK (exam_type IN ('standard', 'strict', 'practice')),
  module TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  time_limit_minutes INTEGER,
  time_spent_seconds INTEGER DEFAULT 0,
  score INTEGER,
  total_questions INTEGER NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  questions_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  question_performance JSONB,
  ai_feedback TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.mock_exams ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can insert their own mock exams"
ON public.mock_exams
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own mock exams"
ON public.mock_exams
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own mock exams"
ON public.mock_exams
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all mock exams"
ON public.mock_exams
FOR SELECT
USING (has_role(auth.uid(), 'admin'));

-- Trigger for updated_at
CREATE TRIGGER update_mock_exams_updated_at
BEFORE UPDATE ON public.mock_exams
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();