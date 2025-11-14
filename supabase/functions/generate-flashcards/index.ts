import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Flashcard {
  module: string;
  question: string;
  answer: string;
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

    const { text, module } = await req.json();

    if (!text || !module) {
      throw new Error("Missing required fields: text and module");
    }

    console.log(`Generating flashcards for module: ${module}`);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Use tool calling to extract structured flashcards
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are an expert educator who creates effective flashcards for ${module} study materials. Create clear, concise flashcards that help students learn key concepts. Each flashcard should have a focused question and a complete answer.`
          },
          {
            role: "user",
            content: `Generate 10-15 flashcards from the following study material:\n\n${text}\n\nCreate flashcards that cover the most important concepts, terms, and relationships.`
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_flashcards",
              description: "Generate flashcards from study material",
              parameters: {
                type: "object",
                properties: {
                  flashcards: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        question: {
                          type: "string",
                          description: "The question or front of the flashcard"
                        },
                        answer: {
                          type: "string",
                          description: "The answer or back of the flashcard"
                        }
                      },
                      required: ["question", "answer"],
                      additionalProperties: false
                    }
                  }
                },
                required: ["flashcards"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "generate_flashcards" } }
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error("Rate limit exceeded. Please try again later.");
      }
      if (response.status === 402) {
        throw new Error("Payment required. Please add credits to your workspace.");
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error("Failed to generate flashcards");
    }

    const aiResponse = await response.json();
    console.log("AI Response:", JSON.stringify(aiResponse));

    // Extract tool call result
    const toolCall = aiResponse.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      throw new Error("No flashcards generated");
    }

    const flashcardsData = JSON.parse(toolCall.function.arguments);
    const generatedFlashcards: Flashcard[] = flashcardsData.flashcards.map((card: any) => ({
      module,
      question: card.question,
      answer: card.answer
    }));

    console.log(`Generated ${generatedFlashcards.length} flashcards`);

    // Insert flashcards into database
    const flashcardsToInsert = generatedFlashcards.map(card => ({
      user_id: user.id,
      module: card.module,
      question: card.question,
      answer: card.answer,
    }));

    const { data: insertedCards, error: insertError } = await supabaseClient
      .from("flashcards")
      .insert(flashcardsToInsert)
      .select();

    if (insertError) {
      console.error("Error inserting flashcards:", insertError);
      throw new Error("Failed to save flashcards");
    }

    return new Response(
      JSON.stringify({
        success: true,
        count: insertedCards.length,
        flashcards: insertedCards,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error generating flashcards:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});
