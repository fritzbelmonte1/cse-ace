import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";
import { Resend } from "npm:resend@4.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationRequest {
  type: "goal_completed" | "exam_reminder";
  goalData: {
    module: string;
    targetScore: number;
    currentScore?: number;
    examDate?: string;
    daysUntilExam?: number;
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    const { type, goalData }: NotificationRequest = await req.json();

    let subject = "";
    let html = "";

    if (type === "goal_completed") {
      subject = `🎉 Goal Achieved: ${goalData.module}`;
      html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #10b981;">Congratulations! 🎉</h1>
          <p>You've successfully completed your goal for <strong>${goalData.module}</strong>!</p>
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0;"><strong>Target Score:</strong> ${goalData.targetScore}%</p>
            <p style="margin: 10px 0 0 0;"><strong>Your Score:</strong> ${goalData.currentScore}%</p>
          </div>
          <p>Keep up the great work! Continue practicing to maintain your progress.</p>
          <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
            This is an automated notification from your CSE Prep App.
          </p>
        </div>
      `;
    } else if (type === "exam_reminder") {
      subject = `📅 Exam Reminder: ${goalData.module} in ${goalData.daysUntilExam} days`;
      html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #3b82f6;">Exam Reminder 📅</h1>
          <p>Your exam for <strong>${goalData.module}</strong> is coming up soon!</p>
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0;"><strong>Exam Date:</strong> ${goalData.examDate}</p>
            <p style="margin: 10px 0 0 0;"><strong>Days Until Exam:</strong> ${goalData.daysUntilExam}</p>
            ${goalData.currentScore ? `<p style="margin: 10px 0 0 0;"><strong>Current Score:</strong> ${goalData.currentScore}%</p>` : ""}
            <p style="margin: 10px 0 0 0;"><strong>Target Score:</strong> ${goalData.targetScore}%</p>
          </div>
          ${goalData.currentScore && goalData.currentScore < goalData.targetScore 
            ? `<p style="color: #dc2626;">You're currently ${goalData.targetScore - goalData.currentScore}% below your target. Make sure to practice!</p>` 
            : `<p style="color: #10b981;">You're on track! Keep practicing to maintain your progress.</p>`
          }
          <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
            This is an automated notification from your CSE Prep App.
          </p>
        </div>
      `;
    }

    console.log(`Sending ${type} email to ${user.email}`);

    const emailResponse = await resend.emails.send({
      from: "CSE Prep <onboarding@resend.dev>",
      to: [user.email!],
      subject,
      html,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(
      JSON.stringify({ success: true, emailId: emailResponse.id }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error sending notification:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});
