-- Create flashcards table
CREATE TABLE public.flashcards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  module TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  difficulty INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create flashcard_reviews table for spaced repetition
CREATE TABLE public.flashcard_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  flashcard_id UUID NOT NULL REFERENCES public.flashcards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  quality INTEGER NOT NULL CHECK (quality >= 0 AND quality <= 5),
  reviewed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  next_review_date TIMESTAMP WITH TIME ZONE NOT NULL,
  interval_days INTEGER NOT NULL DEFAULT 1,
  ease_factor NUMERIC(3,2) NOT NULL DEFAULT 2.5,
  repetition_number INTEGER NOT NULL DEFAULT 0
);

-- Enable RLS
ALTER TABLE public.flashcards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flashcard_reviews ENABLE ROW LEVEL SECURITY;

-- RLS Policies for flashcards
CREATE POLICY "Users can view their own flashcards"
  ON public.flashcards
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own flashcards"
  ON public.flashcards
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own flashcards"
  ON public.flashcards
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own flashcards"
  ON public.flashcards
  FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for flashcard_reviews
CREATE POLICY "Users can view their own reviews"
  ON public.flashcard_reviews
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own reviews"
  ON public.flashcard_reviews
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create trigger for updating flashcards updated_at
CREATE TRIGGER update_flashcards_updated_at
  BEFORE UPDATE ON public.flashcards
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for better query performance
CREATE INDEX idx_flashcards_user_module ON public.flashcards(user_id, module);
CREATE INDEX idx_flashcard_reviews_next_review ON public.flashcard_reviews(user_id, next_review_date);
CREATE INDEX idx_flashcard_reviews_flashcard ON public.flashcard_reviews(flashcard_id);