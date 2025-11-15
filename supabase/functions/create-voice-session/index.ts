import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Extract and verify authentication token
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[Voice Session] Creating session for user:', user.id);

    // Validate input
    const sessionSchema = z.object({
      context: z.string().max(2000, "Context must not exceed 2,000 characters").optional(),
      conversationId: z.string().uuid("Invalid conversation ID format").optional()
    });

    const rawData = await req.json();
    const validationResult = sessionSchema.safeParse(rawData);

    if (!validationResult.success) {
      console.error('Validation error:', validationResult.error.issues);
      return new Response(
        JSON.stringify({ 
          error: 'Invalid input', 
          details: validationResult.error.issues.map(issue => ({
            field: issue.path.join('.'),
            message: issue.message
          }))
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { context, conversationId } = validationResult.data;
    
    const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
    const ELEVENLABS_AGENT_ID = Deno.env.get('ELEVENLABS_AGENT_ID');
    
    if (!ELEVENLABS_API_KEY) {
      throw new Error('ElevenLabs API key not configured');
    }

    if (!ELEVENLABS_AGENT_ID) {
      throw new Error('ElevenLabs Agent ID not configured');
    }

    console.log('[Voice Session] Creating ElevenLabs conversational session');

    // Get recent conversation context if conversationId provided
    let conversationContext = '';
    if (conversationId) {
      const { data: messages } = await supabaseClient
        .from('chat_messages')
        .select('role, content')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(5);

      if (messages && messages.length > 0) {
        conversationContext = messages
          .reverse()
          .map(m => `${m.role === 'user' ? 'Student' : 'Assistant'}: ${m.content.substring(0, 200)}`)
          .join('\n');
      }
    }

    // Build dynamic variables for the agent
    const dynamicVariables: Record<string, string> = {
      user_context: context || 'General CSE study assistance',
      conversation_history: conversationContext || 'New conversation',
      current_module: 'Computer Science Engineering',
      student_name: user.email?.split('@')[0] || 'Student'
    };

    console.log('[Voice Session] Dynamic variables prepared:', Object.keys(dynamicVariables).length);

    // Get signed URL for conversation
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${ELEVENLABS_AGENT_ID}`,
      {
        method: "GET",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Voice Session] ElevenLabs API error:", response.status, errorText);
      throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('[Voice Session] Signed URL generated successfully');
    
    return new Response(JSON.stringify({
      signed_url: data.signed_url,
      dynamic_variables: dynamicVariables,
      user_id: user.id
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error("[Voice Session] Error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
