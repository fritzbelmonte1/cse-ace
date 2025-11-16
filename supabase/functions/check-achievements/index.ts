import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      throw new Error('Invalid user token');
    }

    // Fetch all achievements
    const { data: allAchievements } = await supabase
      .from('achievements')
      .select('*');

    if (!allAchievements) {
      return new Response(JSON.stringify({ newAchievements: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch user's current achievements
    const { data: userAchievements } = await supabase
      .from('user_achievements')
      .select('achievement_id')
      .eq('user_id', user.id);

    const earnedAchievementIds = new Set(
      userAchievements?.map(ua => ua.achievement_id) || []
    );

    // Fetch user stats
    const { data: sessions } = await supabase
      .from('practice_sessions')
      .select('*')
      .eq('user_id', user.id);

    const { data: conversations } = await supabase
      .from('chat_conversations')
      .select('id')
      .eq('user_id', user.id);

    let messageCount = 0;
    if (conversations && conversations.length > 0) {
      const convIds = conversations.map(c => c.id);
      const { count } = await supabase
        .from('chat_messages')
        .select('*', { count: 'exact', head: true })
        .in('conversation_id', convIds);
      messageCount = count || 0;
    }

    // Fetch flashcard stats
    const { count: flashcardReviewCount } = await supabase
      .from('flashcard_reviews')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    const { data: streakData } = await supabase
      .from('study_streaks')
      .select('current_streak')
      .eq('user_id', user.id)
      .single();

    const { count: deckCount } = await supabase
      .from('flashcard_decks')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    const stats = {
      sessionCount: sessions?.length || 0,
      perfectScoreCount: sessions?.filter(s => s.score === s.total_questions).length || 0,
      conversationCount: conversations?.length || 0,
      messageCount,
      averageScore: sessions && sessions.length > 0
        ? Math.round((sessions.reduce((sum, s) => sum + (s.score / s.total_questions) * 100, 0) / sessions.length))
        : 0,
      flashcardReviewCount: flashcardReviewCount || 0,
      currentStreak: streakData?.current_streak || 0,
      deckCount: deckCount || 0,
    };

    // Check which achievements should be awarded
    const newAchievements = [];

    for (const achievement of allAchievements) {
      // Skip if already earned
      if (earnedAchievementIds.has(achievement.id)) continue;

      let shouldAward = false;

      switch (achievement.requirement_type) {
        case 'session_count':
          shouldAward = stats.sessionCount >= achievement.requirement_value;
          break;
        case 'perfect_score':
          shouldAward = stats.perfectScoreCount >= achievement.requirement_value;
          break;
        case 'conversation_count':
          shouldAward = stats.conversationCount >= achievement.requirement_value;
          break;
        case 'message_count':
          shouldAward = stats.messageCount >= achievement.requirement_value;
          break;
        case 'average_score':
          const minSessions = achievement.requirement_value >= 90 ? 10 : 5;
          shouldAward = stats.sessionCount >= minSessions && stats.averageScore >= achievement.requirement_value;
          break;
        case 'flashcard_reviews':
          shouldAward = stats.flashcardReviewCount >= achievement.requirement_value;
          break;
        case 'study_streak':
          shouldAward = stats.currentStreak >= achievement.requirement_value;
          break;
        case 'deck_count':
          shouldAward = stats.deckCount >= achievement.requirement_value;
          break;
      }

      if (shouldAward) {
        // Award the achievement
        const { error: insertError } = await supabase
          .from('user_achievements')
          .insert({
            user_id: user.id,
            achievement_id: achievement.id,
          });

        if (!insertError) {
          newAchievements.push(achievement);
        }
      }
    }

    return new Response(JSON.stringify({ newAchievements }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error checking achievements:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
