import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { examId } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableApiKey) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch exam data
    const { data: exam, error: examError } = await supabase
      .from("mock_exams")
      .select("*")
      .eq("id", examId)
      .single();

    if (examError) throw examError;

    // Fetch historical exams
    const { data: historicalExams, error: historyError } = await supabase
      .from("mock_exams")
      .select("score, total_questions, module, created_at")
      .eq("user_id", exam.user_id)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(5);

    if (historyError) throw historyError;

    // Calculate metrics
    const percentage = Math.round((exam.score / exam.total_questions) * 100);
    const performance = exam.question_performance || [];
    
    // Analyze topic performance
    const topicStats: Record<string, { correct: number; total: number }> = {};
    performance.forEach((item: any) => {
      const question = exam.questions_data.find((q: any) => q.id === item.question_id);
      if (question) {
        const module = question.module || "general";
        if (!topicStats[module]) {
          topicStats[module] = { correct: 0, total: 0 };
        }
        topicStats[module].total++;
        if (item.is_correct) {
          topicStats[module].correct++;
        }
      }
    });

    const historicalScores = historicalExams.map((e: any) => 
      Math.round((e.score / e.total_questions) * 100)
    );

    const prompt = `You are an expert educational advisor analyzing a student's mock exam performance.

**Current Exam Performance:**
- Module: ${exam.module}
- Score: ${exam.score}/${exam.total_questions} (${percentage}%)
- Time Spent: ${Math.floor(exam.time_spent_seconds / 60)} minutes ${exam.time_spent_seconds % 60} seconds
- Exam Type: ${exam.exam_type}

**Topic-wise Performance:**
${Object.entries(topicStats).map(([topic, stats]) => 
  `- ${topic}: ${stats.correct}/${stats.total} (${Math.round((stats.correct / stats.total) * 100)}%)`
).join("\n")}

**Historical Performance (Last 5 Exams):**
${historicalScores.length > 0 ? historicalScores.join("%, ") + "%" : "No previous exams"}

**Task:**
Provide a comprehensive analysis with:

1. **Strengths** (2-3 bullet points of areas where the student performed well)
2. **Areas for Improvement** (3-5 specific topics or concepts needing work)
3. **7-Day Study Plan** (concrete daily recommendations)
4. **Exam Readiness Assessment** (0-100% with justification)

Keep the tone encouraging but honest. Be specific about what to study.`;

    // Call Lovable AI
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are an expert educational advisor providing personalized feedback." },
          { role: "user", content: prompt }
        ],
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to your workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const feedback = aiData.choices[0].message.content;

    // Cache feedback in database
    await supabase
      .from("mock_exams")
      .update({ ai_feedback: feedback })
      .eq("id", examId);

    return new Response(
      JSON.stringify({ feedback }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in generate-exam-feedback:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
