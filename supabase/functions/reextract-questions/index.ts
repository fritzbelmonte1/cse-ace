import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { documentId, targetModule } = await req.json();
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Fetch document chunks
    const { data: chunks, error: chunksError } = await supabaseClient
      .from('document_chunks')
      .select('content')
      .eq('document_id', documentId)
      .order('chunk_index');

    if (chunksError) throw chunksError;

    const fullContent = chunks.map(c => c.content).join('\n\n');
    
    console.log(`Re-extracting questions from document ${documentId} with enhanced prompt`);

    // Enhanced multi-pass extraction prompt
    const systemPrompt = `You are an expert question extractor for ${targetModule} exam preparation. 
Extract high-quality multiple-choice questions following these CRITICAL rules:

QUALITY STANDARDS:
- Questions must be clear, unambiguous, and at appropriate exam difficulty
- Options must be plausible and of similar complexity
- Correct answer must be definitively correct based on content
- Avoid trick questions or overly easy questions

EXTRACTION GUIDELINES:
1. Extract 5-15 questions per passage depending on content richness
2. Focus on key concepts, definitions, procedures, and relationships
3. Ensure questions test understanding, not just memorization
4. All 4 options must be grammatically consistent with the question stem

OUTPUT FORMAT (JSON array):
[
  {
    "question": "Complete question text ending with ?",
    "option_a": "First option",
    "option_b": "Second option", 
    "option_c": "Third option",
    "option_d": "Fourth option",
    "correct_answer": "A" | "B" | "C" | "D",
    "confidence": 0.85,
    "reasoning": "Brief explanation of why this is a good question"
  }
]

CONFIDENCE SCORING:
- 0.9-1.0: Directly stated in source, unambiguous
- 0.7-0.89: Clearly inferable from source
- 0.5-0.69: Requires some interpretation
- Below 0.5: Do not include

Extract questions now:`;

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `CONTENT:\n\n${fullContent.slice(0, 50000)}\n\nModule: ${targetModule}` }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI extraction failed:', response.status, errorText);
      throw new Error(`AI extraction failed: ${response.status}`);
    }

    const aiResult = await response.json();
    const extractedText = aiResult.choices[0].message.content;
    
    console.log('AI extraction response:', extractedText.slice(0, 500));

    // Parse JSON from AI response
    const jsonMatch = extractedText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('No valid JSON found in AI response');
    }

    const questions = JSON.parse(jsonMatch[0]);
    
    // Insert extracted questions
    const questionsToInsert = questions
      .filter((q: any) => q.confidence >= 0.7)
      .map((q: any) => ({
        document_id: documentId,
        question: q.question,
        option_a: q.option_a,
        option_b: q.option_b,
        option_c: q.option_c,
        option_d: q.option_d,
        correct_answer: q.correct_answer,
        module: targetModule,
        confidence_score: q.confidence,
        status: q.confidence >= 0.85 ? 'approved' : 'pending'
      }));

    const { error: insertError, data: inserted } = await supabaseClient
      .from('extracted_questions')
      .insert(questionsToInsert)
      .select();

    if (insertError) throw insertError;

    console.log(`Successfully re-extracted ${inserted.length} questions`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        extracted: inserted.length,
        autoApproved: inserted.filter(q => q.status === 'approved').length,
        questions: inserted
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in reextract-questions:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
