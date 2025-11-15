import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Sanitize text to remove characters that PostgreSQL TEXT columns cannot handle
function sanitizeText(text: string): string {
  return text
    .replace(/\u0000/g, '') // Remove null bytes
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let documentId: string | undefined;
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const body = await req.json();
    documentId = body.documentId;

    // Get document details
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (docError || !doc) {
      throw new Error('Document not found');
    }

    console.log(`Processing document: ${doc.file_name}`);

    // Mark as processing
    await supabase
      .from('documents')
      .update({ processing_status: 'processing' })
      .eq('id', documentId);

    // Download file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('cse-documents')
      .download(doc.file_path);

    if (downloadError) {
      throw downloadError;
    }

    // Read file content
    const fileContent = await fileData.text();

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    if (doc.purpose === 'questions') {
      // Extract questions using AI
      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            {
              role: 'system',
              content: 'Extract multiple-choice questions from the text. For each question, identify: question text, 4 options (A-D), correct answer index (0-3), explanation, difficulty (easy/medium/hard), and module category (vocabulary/analogy/reading/numerical/clerical). Return as JSON array.'
            },
            {
              role: 'user',
              content: sanitizeText(fileContent.slice(0, 50000)) // Sanitize and limit to 50k chars
            }
          ],
          tools: [{
            type: 'function',
            function: {
              name: 'extract_questions',
              description: 'Extract questions from document',
              parameters: {
                type: 'object',
                properties: {
                  questions: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        question_text: { type: 'string' },
                        options: { type: 'array', items: { type: 'string' } },
                        correct_answer: { type: 'number' },
                        explanation: { type: 'string' },
                        difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
                        module: { type: 'string' }
                      },
                      required: ['question_text', 'options', 'correct_answer', 'module']
                    }
                  }
                },
                required: ['questions']
              }
            }
          }],
          tool_choice: { type: 'function', function: { name: 'extract_questions' } }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('AI error:', errorText);
        throw new Error('AI processing failed');
      }

      const aiData = await response.json();
      const toolCall = aiData.choices[0]?.message?.tool_calls?.[0];
      
      if (toolCall) {
        const { questions } = JSON.parse(toolCall.function.arguments);
        
        // Insert questions mapped to existing schema (option_a..d, correct_answer as text)
        const questionsToInsert = questions.map((q: any) => {
          const opts = Array.isArray(q.options) ? q.options : [];
          const optionA = opts[0] ?? '';
          const optionB = opts[1] ?? '';
          const optionC = opts[2] ?? '';
          const optionD = opts[3] ?? '';
          const correctIdx = typeof q.correct_answer === 'number' ? q.correct_answer : 0;
          const correctAnswerText = opts[correctIdx] ?? '';

          return {
            document_id: documentId,
            question: q.question_text,
            option_a: optionA,
            option_b: optionB,
            option_c: optionC,
            option_d: optionD,
            correct_answer: correctAnswerText,
            module: q.module || doc.module || 'general',
          };
        });

        const { error: insertError } = await supabase
          .from('extracted_questions')
          .insert(questionsToInsert);

        if (insertError) {
          console.error('Insert error:', insertError);
          throw insertError;
        }

        console.log(`Extracted ${questions.length} questions`);
      }

    } else if (doc.purpose === 'rag') {
      // RAG processing - Store chunks WITHOUT embeddings
      console.log('Starting RAG processing (Gemini-only, no embeddings)...');
      const chunkSize = 1000;
      const chunks: string[] = [];

      for (let i = 0; i < fileContent.length; i += chunkSize) {
        const rawChunk = fileContent.slice(i, i + chunkSize);
        const sanitizedChunk = sanitizeText(rawChunk);
        
        if (sanitizedChunk.length > 0) {
          chunks.push(sanitizedChunk);
        }
      }

      console.log(`Created ${chunks.length} chunks for document`);

      // Insert chunks without embeddings
      for (let i = 0; i < chunks.length; i++) {
        const { error: insertError } = await supabase
          .from('document_chunks')
          .insert({
            document_id: documentId,
            content: chunks[i],
            chunk_index: i
          });

        if (insertError) {
          console.error(`Failed to insert chunk ${i}:`, insertError);
          throw new Error(`Chunk insert failed: ${insertError.message}`);
        }
      }

      console.log(`Successfully inserted ${chunks.length} chunks (no embeddings)`);
    }

    // Mark as processed
    await supabase
      .from('documents')
      .update({ 
        processed: true,
        processing_status: 'completed'
      })
      .eq('id', documentId);

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Document processed successfully' 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Processing error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Mark as failed if we have a documentId
    if (documentId) {
      await supabase
        .from('documents')
        .update({ 
          processing_status: 'failed',
          error_message: errorMessage
        })
        .eq('id', documentId);
    }
    
    return new Response(JSON.stringify({ 
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});