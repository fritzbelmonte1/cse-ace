import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    // Fetch user's practice sessions
    const { data: sessions, error: sessionsError } = await supabase
      .from('practice_sessions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (sessionsError) throw sessionsError;

    // Calculate module statistics
    const moduleStats: Record<string, { total: number; correct: number; sessions: number; avgTime: number }> = {};
    
    (sessions || []).forEach(session => {
      if (!moduleStats[session.module]) {
        moduleStats[session.module] = { total: 0, correct: 0, sessions: 0, avgTime: 0 };
      }
      moduleStats[session.module].total += session.total_questions;
      moduleStats[session.module].correct += session.score;
      moduleStats[session.module].sessions += 1;
      moduleStats[session.module].avgTime += session.time_spent_seconds || 0;
    });

    // Calculate percentages and identify weak areas
    const moduleAnalysis = Object.entries(moduleStats).map(([module, stats]) => {
      const percentage = (stats.correct / stats.total) * 100;
      const avgTimeMinutes = Math.round((stats.avgTime / stats.sessions) / 60);
      return {
        module,
        percentage: percentage.toFixed(1),
        sessions: stats.sessions,
        avgTimeMinutes,
        needsImprovement: percentage < 70,
        category: percentage < 50 ? 'critical' : percentage < 70 ? 'moderate' : 'strong'
      };
    }).sort((a, b) => parseFloat(a.percentage) - parseFloat(b.percentage));

    // Generate AI recommendations
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const systemPrompt = `You are an expert CSE exam tutor. Analyze the student's performance data and provide personalized study recommendations.

Your response must include:
1. A brief overall assessment (2-3 sentences)
2. Specific recommendations for weak topics (prioritize lowest scoring modules)
3. A detailed 2-week study schedule
4. Specific learning resources and strategies for each weak module
5. Motivational advice

Keep recommendations practical, actionable, and encouraging.`;

    const userPrompt = `Student Performance Analysis:
${moduleAnalysis.map(m => `- ${m.module}: ${m.percentage}% (${m.sessions} sessions, avg ${m.avgTimeMinutes} min/session) - ${m.category}`).join('\n')}

Total Practice Sessions: ${sessions?.length || 0}

Please provide comprehensive study recommendations focusing on the weakest areas.`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Payment required. Please add funds to continue.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      throw new Error('AI service error');
    }

    const aiData = await aiResponse.json();
    const recommendations = aiData.choices[0].message.content;

    return new Response(
      JSON.stringify({
        recommendations,
        moduleAnalysis,
        totalSessions: sessions?.length || 0,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in ai-study-recommendations:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
