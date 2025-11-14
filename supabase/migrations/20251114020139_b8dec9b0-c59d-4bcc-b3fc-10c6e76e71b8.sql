-- Create flashcard_decks table
CREATE TABLE public.flashcard_decks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  module TEXT NOT NULL,
  is_public BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add deck_id to flashcards table (nullable for backward compatibility)
ALTER TABLE public.flashcards ADD COLUMN deck_id UUID REFERENCES public.flashcard_decks(id) ON DELETE SET NULL;

-- Create index for better performance
CREATE INDEX idx_flashcard_decks_public ON public.flashcard_decks(is_public, module) WHERE is_public = true;
CREATE INDEX idx_flashcards_deck ON public.flashcards(deck_id) WHERE deck_id IS NOT NULL;

-- Enable RLS
ALTER TABLE public.flashcard_decks ENABLE ROW LEVEL SECURITY;

-- RLS Policies for flashcard_decks
CREATE POLICY "Users can view their own decks"
  ON public.flashcard_decks
  FOR SELECT
  USING (auth.uid() = user_id OR is_public = true);

CREATE POLICY "Users can create their own decks"
  ON public.flashcard_decks
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own decks"
  ON public.flashcard_decks
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own decks"
  ON public.flashcard_decks
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create trigger for updating flashcard_decks updated_at
CREATE TRIGGER update_flashcard_decks_updated_at
  BEFORE UPDATE ON public.flashcard_decks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();