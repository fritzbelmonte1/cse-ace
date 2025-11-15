-- Create voice_conversations table for storing voice session metadata
CREATE TABLE public.voice_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ended_at TIMESTAMP WITH TIME ZONE,
  duration_seconds INTEGER,
  message_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create voice_messages table for storing individual transcripts
CREATE TABLE public.voice_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.voice_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.voice_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_messages ENABLE ROW LEVEL SECURITY;

-- RLS policies for voice_conversations
CREATE POLICY "Users can view their own voice conversations"
ON public.voice_conversations
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own voice conversations"
ON public.voice_conversations
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own voice conversations"
ON public.voice_conversations
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own voice conversations"
ON public.voice_conversations
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- RLS policies for voice_messages
CREATE POLICY "Users can view messages from their conversations"
ON public.voice_messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.voice_conversations
    WHERE voice_conversations.id = voice_messages.conversation_id
    AND voice_conversations.user_id = auth.uid()
  )
);

CREATE POLICY "Users can create messages in their conversations"
ON public.voice_messages
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.voice_conversations
    WHERE voice_conversations.id = voice_messages.conversation_id
    AND voice_conversations.user_id = auth.uid()
  )
);

-- Create indexes for better performance
CREATE INDEX idx_voice_conversations_user_id ON public.voice_conversations(user_id);
CREATE INDEX idx_voice_conversations_started_at ON public.voice_conversations(started_at DESC);
CREATE INDEX idx_voice_messages_conversation_id ON public.voice_messages(conversation_id);
CREATE INDEX idx_voice_messages_timestamp ON public.voice_messages(timestamp);