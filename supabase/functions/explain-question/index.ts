import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { question, options, correctAnswer, userAnswer } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Construct the prompt
    const optionsList = Object.entries(options)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');
    
    let prompt = `You are an expert tutor explaining CSE exam questions. Provide a clear, concise explanation.

IMPORTANT: Use proper LaTeX notation for all mathematical expressions:
- For inline math (within text): use $expression$ (e.g., "The formula $E = mc^2$ shows...")
- For display math (centered): use $$expression$$ (e.g., $$\\int_0^\\infty e^{-x} dx = 1$$)
- Common LaTeX examples:
  * Matrices: $\\mathbf{A}$ or $\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}$
  * Fractions: $\\frac{numerator}{denominator}$
  * Greek letters: $\\alpha, \\beta, \\gamma$
  * Equations: $ax^2 + bx + c = 0$

Question: ${question}

Options:
${optionsList}

Correct Answer: ${correctAnswer}`;

    if (userAnswer && userAnswer !== correctAnswer) {
      prompt += `\nUser's Answer: ${userAnswer}`;
    }

    prompt += `\n\nProvide a focused explanation covering:
1. Why answer ${correctAnswer} is correct (explain the key concepts)
2. What makes this answer the best choice`;

    if (userAnswer && userAnswer !== correctAnswer) {
      prompt += `\n3. Why answer ${userAnswer} was incorrect (explain the common misconception)`;
    }

    prompt += `\n\nKeep the explanation educational, clear, and under 200 words.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are an expert tutor providing clear, concise explanations for exam questions." },
          { role: "user", content: prompt }
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limits exceeded, please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required, please add funds to your Lovable AI workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "AI gateway error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const explanation = data.choices[0].message.content;

    return new Response(
      JSON.stringify({ explanation }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in explain-question function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
