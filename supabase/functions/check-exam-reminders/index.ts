import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    console.log("Checking for upcoming exams...");

    // Get all goals with exam dates in the next 7 days that aren't completed
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    const { data: upcomingGoals, error: goalsError } = await supabaseClient
      .from("goals")
      .select("*, profiles:user_id(id)")
      .eq("is_completed", false)
      .not("exam_date", "is", null)
      .lte("exam_date", sevenDaysFromNow.toISOString().split("T")[0])
      .gte("exam_date", new Date().toISOString().split("T")[0]);

    if (goalsError) {
      throw goalsError;
    }

    console.log(`Found ${upcomingGoals?.length || 0} upcoming exams`);

    if (!upcomingGoals || upcomingGoals.length === 0) {
      return new Response(
        JSON.stringify({ message: "No upcoming exams found", count: 0 }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // For each goal, get user's current progress and send reminder
    const notifications = [];

    for (const goal of upcomingGoals) {
      // Get user email
      const { data: userData, error: userError } = await supabaseClient.auth.admin.getUserById(
        goal.user_id
      );

      if (userError || !userData.user?.email) {
        console.error(`Could not get user data for goal ${goal.id}:`, userError);
        continue;
      }

      // Get user's practice sessions for this module
      const { data: sessions } = await supabaseClient
        .from("practice_sessions")
        .select("score, total_questions")
        .eq("user_id", goal.user_id)
        .eq("module", goal.module);

      let currentScore = 0;
      if (sessions && sessions.length > 0) {
        const totalScore = sessions.reduce(
          (sum, session) => sum + (session.score / session.total_questions) * 100,
          0
        );
        currentScore = Math.round(totalScore / sessions.length);
      }

      // Calculate days until exam
      const examDate = new Date(goal.exam_date);
      const today = new Date();
      const daysUntilExam = Math.ceil(
        (examDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Only send reminders for exams 1, 3, or 7 days away
      if (![1, 3, 7].includes(daysUntilExam)) {
        continue;
      }

      console.log(`Sending reminder for ${goal.module} exam to ${userData.user.email}`);

      // Send email directly since we can't invoke authenticated functions from service role
      // We'll use a different approach - call Resend directly
      try {
        const Resend = (await import("https://esm.sh/resend@4.0.0")).Resend;
        const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

        const moduleName = goal.module.charAt(0).toUpperCase() + goal.module.slice(1);
        const subject = `📅 Exam Reminder: ${moduleName} in ${daysUntilExam} days`;
        const html = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #3b82f6;">Exam Reminder 📅</h1>
            <p>Your exam for <strong>${moduleName}</strong> is coming up soon!</p>
            <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0;"><strong>Exam Date:</strong> ${goal.exam_date}</p>
              <p style="margin: 10px 0 0 0;"><strong>Days Until Exam:</strong> ${daysUntilExam}</p>
              ${currentScore ? `<p style="margin: 10px 0 0 0;"><strong>Current Score:</strong> ${currentScore}%</p>` : ""}
              <p style="margin: 10px 0 0 0;"><strong>Target Score:</strong> ${goal.target_score}%</p>
            </div>
            ${currentScore && currentScore < goal.target_score 
              ? `<p style="color: #dc2626;">You're currently ${goal.target_score - currentScore}% below your target. Make sure to practice!</p>` 
              : `<p style="color: #10b981;">You're on track! Keep practicing to maintain your progress.</p>`
            }
            <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
              This is an automated notification from your CSE Prep App.
            </p>
          </div>
        `;

        await resend.emails.send({
          from: "CSE Prep <onboarding@resend.dev>",
          to: [userData.user.email],
          subject,
          html,
        });

        notifications.push({
          goalId: goal.id,
          module: goal.module,
          daysUntilExam,
          sent: true,
        });

        console.log(`Reminder sent successfully to ${userData.user.email}`);
      } catch (emailError: any) {
        console.error(`Error sending email for goal ${goal.id}:`, emailError);
        notifications.push({
          goalId: goal.id,
          module: goal.module,
          daysUntilExam,
          sent: false,
          error: emailError?.message || "Unknown error",
        });
      }
    }

    return new Response(
      JSON.stringify({
        message: "Exam reminders processed",
        count: notifications.length,
        notifications,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error checking exam reminders:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});
