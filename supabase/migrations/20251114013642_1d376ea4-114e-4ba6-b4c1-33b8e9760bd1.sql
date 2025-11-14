-- Create goals table
CREATE TABLE public.goals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  module TEXT NOT NULL,
  target_score INTEGER NOT NULL CHECK (target_score >= 0 AND target_score <= 100),
  exam_date DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_completed BOOLEAN DEFAULT false
);

-- Enable RLS
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

-- Create policies for goals
CREATE POLICY "Users can view their own goals" 
ON public.goals 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own goals" 
ON public.goals 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own goals" 
ON public.goals 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own goals" 
ON public.goals 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_goals_updated_at
BEFORE UPDATE ON public.goals
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();