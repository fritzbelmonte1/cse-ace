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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find users with due flashcards who haven't studied today
    const today = new Date().toISOString().split('T')[0];
    
    const { data: usersWithDueCards, error: dueCardsError } = await supabase
      .from('flashcard_reviews')
      .select('user_id, flashcard_id')
      .lte('next_review_date', new Date().toISOString())
      .order('user_id');

    if (dueCardsError) {
      console.error('Error fetching due cards:', dueCardsError);
      return new Response(
        JSON.stringify({ error: dueCardsError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!usersWithDueCards || usersWithDueCards.length === 0) {
      return new Response(
        JSON.stringify({ message: "No users with due cards" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Group by user
    const userDueCounts = usersWithDueCards.reduce((acc, { user_id }) => {
      acc[user_id] = (acc[user_id] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Check who hasn't studied today
    const { data: studiedToday, error: studiedError } = await supabase
      .from('flashcard_reviews')
      .select('user_id')
      .gte('reviewed_at', today);

    if (studiedError) {
      console.error('Error checking today\'s reviews:', studiedError);
    }

    const studiedUserIds = new Set(studiedToday?.map(s => s.user_id) || []);

    let remindersSent = 0;
    for (const [userId, dueCount] of Object.entries(userDueCounts)) {
      if (studiedUserIds.has(userId)) continue;

      // Log reminder (in production, this would send email/push notification)
      console.log(`Reminder for user ${userId}: ${dueCount} cards due for review`);
      remindersSent++;
    }

    return new Response(
      JSON.stringify({ 
        message: `Sent ${remindersSent} reminders`,
        totalDueUsers: Object.keys(userDueCounts).length,
        alreadyStudied: studiedUserIds.size
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error('Error in send-study-reminder:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
