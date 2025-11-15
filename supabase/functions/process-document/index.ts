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
      // Batched extraction for large files with overlap
      const CHUNK_SIZE = 45000; // ~45k characters per chunk
      const CHUNK_OVERLAP = 10000; // 10k character overlap to capture questions at boundaries
      const sanitizedContent = sanitizeText(fileContent);
      const totalChunks = Math.ceil(sanitizedContent.length / (CHUNK_SIZE - CHUNK_OVERLAP)) + 1;
      
      console.log(`Processing ${sanitizedContent.length} chars in ${totalChunks} chunks`);
      
      const allQuestions: any[] = [];
      
      // Process each chunk with overlap
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const start = Math.max(0, chunkIndex * (CHUNK_SIZE - CHUNK_OVERLAP));
        const end = Math.min(start + CHUNK_SIZE, sanitizedContent.length);
        const chunk = sanitizedContent.slice(start, end);
        
        // Skip if chunk is too small (last overlapping chunk)
        if (chunk.length < 1000) continue;
        
        console.log(`Processing chunk ${chunkIndex + 1}/${totalChunks} (${chunk.length} chars)`);
        
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
                content: `You are extracting multiple-choice questions from an educational test preparation document.

CRITICAL: Extract EVERY question you find, even if formatting is inconsistent or information is incomplete.

Common formats to look for:
1. Numbered questions: "1.", "2.", "Question 1:", "Q1:", etc.
2. Answer choices marked as: "A.", "B.", "C.", "D." or "(A)", "(B)", "(C)", "(D)" or "a)", "b)", "c)", "d)"
3. Questions followed by 2-4 answer options
4. Answer keys (correct answers listed separately at end of sections)
5. Questions with explanations, rationales, or hints below them
6. Multi-part questions or compound questions
7. Fill-in-the-blank questions converted to multiple choice

Extraction rules:
- Extract the COMPLETE question text, including any context or setup
- Extract ALL answer options you find (even if fewer than 4)
- If you find an answer key section, match answers to their questions
- If correct answer is unclear, still extract the question
- Include page numbers or question numbers if visible
- Handle questions that span multiple lines
- Look for patterns like "The answer is..." or "Correct: A"

For each question extract:
- question_text: The full question text (required)
- options: Array of answer choices - extract 2-4 options, pad to 4 with "N/A" if needed
- correct_answer: Index 0-3 of correct option (use -1 if unknown)

Your goal: Extract the MAXIMUM number of questions possible. When in doubt, extract it.`
              },
              {
                role: 'user',
                content: chunk
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
                          correct_answer: { type: 'number' }
                        },
                        required: ['question_text', 'options', 'correct_answer']
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
          console.error(`AI error on chunk ${chunkIndex + 1}:`, errorText);
          continue; // Skip failed chunks
        }

        const aiData = await response.json();
        const toolCall = aiData.choices[0]?.message?.tool_calls?.[0];
        
        if (toolCall) {
          const { questions } = JSON.parse(toolCall.function.arguments);
          console.log(`  Extracted ${questions.length} questions from chunk ${chunkIndex + 1}`);
          allQuestions.push(...questions);
        }
      }
      
      console.log(`Total extracted from all chunks: ${allQuestions.length} questions. Deduplicating...`);
      
      // Deduplicate by question text similarity (exact match)
      const uniqueQuestions = new Map();
      allQuestions.forEach(q => {
        const key = String(q.question_text).trim().toLowerCase().slice(0, 100);
        if (!uniqueQuestions.has(key)) {
          uniqueQuestions.set(key, q);
        }
      });
      
      const dedupedQuestions = Array.from(uniqueQuestions.values());
      console.log(`After deduplication: ${dedupedQuestions.length} unique questions. Validating...`);
      
      // Validation function
      const isValidQuestion = (q: any) => {
        const issues: string[] = [];
        
        if (!q.question_text || String(q.question_text).trim() === '') {
          issues.push('empty question text');
        }
        
        if (!Array.isArray(q.options) || q.options.length !== 4) {
          issues.push(`invalid options count (${Array.isArray(q.options) ? q.options.length : 0}/4)`);
        } else {
          const emptyOptions = q.options.filter((opt: any) => !opt || String(opt).trim() === '').length;
          if (emptyOptions > 0) {
            issues.push(`${emptyOptions} empty options`);
          }
        }
        
        if (typeof q.correct_answer !== 'number' || q.correct_answer < 0 || q.correct_answer > 3) {
          issues.push(`invalid correct_answer index (${q.correct_answer})`);
        }
        
        return { valid: issues.length === 0, issues };
      };
      
      // Validate and categorize
      const validQuestions: any[] = [];
      const dropReasons: { [key: string]: number } = {};
      
      dedupedQuestions.forEach((q: any, index: number) => {
        const validation = isValidQuestion(q);
        
        if (validation.valid) {
          validQuestions.push(q);
        } else {
          if (Object.keys(dropReasons).length < 5) {
            console.log(`Dropping question ${index + 1}: ${validation.issues.join(', ')}`);
          }
          
          validation.issues.forEach(issue => {
            dropReasons[issue] = (dropReasons[issue] || 0) + 1;
          });
        }
      });
      
      console.log(`Validation complete: ${validQuestions.length} valid, ${dedupedQuestions.length - validQuestions.length} dropped`);
      if (Object.keys(dropReasons).length > 0) {
        console.log('Drop reasons:', JSON.stringify(dropReasons, null, 2));
      }
      
      if (validQuestions.length > 0) {
        const questionsToInsert = validQuestions.map((q: any) => {
          const opts = q.options;
          const correctIdx = q.correct_answer;
          const letters = ['A', 'B', 'C', 'D'] as const;
          
          return {
            document_id: documentId,
            question: String(q.question_text),
            option_a: String(opts[0]),
            option_b: String(opts[1]),
            option_c: String(opts[2]),
            option_d: String(opts[3]),
            correct_answer: letters[correctIdx],
            module: String(doc.module || 'general'), // Use upload module, not AI classification
          };
        });

        const { error: insertError } = await supabase
          .from('extracted_questions')
          .insert(questionsToInsert);

        if (insertError) {
          console.error('Insert error:', insertError);
          throw insertError;
        }

        console.log(`Successfully inserted ${validQuestions.length} questions for module: ${doc.module}`);
      } else {
        console.log('No valid questions to insert');
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