-- Create achievements table
CREATE TABLE public.achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('practice', 'ai', 'performance')),
  requirement_type TEXT NOT NULL CHECK (requirement_type IN ('session_count', 'perfect_score', 'conversation_count', 'message_count', 'average_score')),
  requirement_value INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Enable RLS on achievements
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;

-- Anyone can view achievements
CREATE POLICY "Anyone can view achievements"
  ON public.achievements FOR SELECT
  USING (true);

-- Create user_achievements table
CREATE TABLE public.user_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  achievement_id UUID REFERENCES public.achievements(id) ON DELETE CASCADE NOT NULL,
  earned_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  UNIQUE(user_id, achievement_id)
);

-- Enable RLS on user_achievements
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

-- Users can view their own achievements
CREATE POLICY "Users can view their own achievements"
  ON public.user_achievements FOR SELECT
  USING (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX idx_user_achievements_user_id ON public.user_achievements(user_id);
CREATE INDEX idx_user_achievements_earned_at ON public.user_achievements(earned_at);

-- Insert achievement definitions
INSERT INTO public.achievements (code, name, description, icon, category, requirement_type, requirement_value) VALUES
  ('first_steps', 'First Steps', 'Complete your first practice session', 'Award', 'practice', 'session_count', 1),
  ('practice_warrior', 'Practice Warrior', 'Complete 10 practice sessions', 'Trophy', 'practice', 'session_count', 10),
  ('dedicated_learner', 'Dedicated Learner', 'Complete 25 practice sessions', 'Medal', 'practice', 'session_count', 25),
  ('practice_master', 'Practice Master', 'Complete 50 practice sessions', 'Crown', 'practice', 'session_count', 50),
  
  ('perfectionist', 'Perfectionist', 'Get a perfect score on any module', 'Star', 'performance', 'perfect_score', 1),
  ('flawless_three', 'Flawless Three', 'Get 3 perfect scores', 'Sparkles', 'performance', 'perfect_score', 3),
  ('perfect_ten', 'Perfect Ten', 'Get 10 perfect scores', 'Zap', 'performance', 'perfect_score', 10),
  
  ('ai_curious', 'AI Curious', 'Start your first AI conversation', 'MessageSquare', 'ai', 'conversation_count', 1),
  ('ai_enthusiast', 'AI Enthusiast', 'Have 5 AI conversations', 'MessageCircle', 'ai', 'conversation_count', 5),
  ('ai_expert', 'AI Expert', 'Have 20 AI conversations', 'MessagesSquare', 'ai', 'conversation_count', 20),
  
  ('chatterbox', 'Chatterbox', 'Send 50 messages to AI assistant', 'Send', 'ai', 'message_count', 50),
  ('conversationalist', 'Conversationalist', 'Send 200 messages to AI assistant', 'SendHorizonal', 'ai', 'message_count', 200),
  
  ('high_achiever', 'High Achiever', 'Maintain 80% average score across 5+ sessions', 'TrendingUp', 'performance', 'average_score', 80),
  ('excellence', 'Excellence', 'Maintain 90% average score across 10+ sessions', 'Target', 'performance', 'average_score', 90);