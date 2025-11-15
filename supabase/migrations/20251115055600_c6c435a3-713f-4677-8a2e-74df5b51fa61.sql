-- Create agent_config table for storing ElevenLabs agent configuration
CREATE TABLE public.agent_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  agent_name TEXT,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.agent_config ENABLE ROW LEVEL SECURITY;

-- Only admins can manage agent configs
CREATE POLICY "Admins can view agent configs"
ON public.agent_config
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert agent configs"
ON public.agent_config
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update agent configs"
ON public.agent_config
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete agent configs"
ON public.agent_config
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'));

-- Create trigger for updated_at
CREATE TRIGGER update_agent_config_updated_at
BEFORE UPDATE ON public.agent_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for active agents
CREATE INDEX idx_agent_config_active ON public.agent_config(is_active) WHERE is_active = true;