import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Enhanced sanitization to handle problematic Unicode and special characters
function sanitizeText(text: string): string {
  let sanitized = text
    // Remove null bytes and control characters
    .replace(/\u0000/g, '')
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')
    
    // Remove unpaired Unicode surrogates (causes JSON errors)
    .replace(/[\uD800-\uDFFF]/g, '')
    
    // Replace problematic Unicode characters
    .replace(/[\uFFFE\uFFFF]/g, '')
    
    // Normalize different types of whitespace
    .replace(/[\u2000-\u200B\u202F\u205F\u3000]/g, ' ')
    
    // Remove zero-width characters
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    
    // Normalize line breaks
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    
    // Collapse multiple spaces/newlines
    .replace(/\s+/g, ' ')
    .trim();
  
  // Additional validation: ensure valid UTF-8
  try {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const bytes = encoder.encode(sanitized);
    sanitized = decoder.decode(bytes);
  } catch (e) {
    console.warn('UTF-8 validation failed, applying aggressive cleaning');
    // If still invalid, keep only ASCII printable characters
    sanitized = sanitized.replace(/[^\x20-\x7E\n]/g, '');
  }
  
  return sanitized;
}

// Levenshtein distance for fuzzy string matching
function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));
  
  for (let i = 0; i <= len1; i++) matrix[i][0] = i;
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;
  
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  
  return matrix[len1][len2];
}

function similarityScore(str1: string, str2: string): number {
  const distance = levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
  const maxLength = Math.max(str1.length, str2.length);
  return maxLength === 0 ? 1.0 : 1 - (distance / maxLength);
}

// Filter out cross-document duplicates
async function filterCrossDocumentDuplicates(
  questions: any[],
  currentDocumentId: string,
  supabase: any
): Promise<{ unique: any[], duplicates: number }> {
  console.log(`Checking ${questions.length} questions for cross-document duplicates...`);
  
  // Fetch existing questions from other documents
  const { data: existingQuestions, error } = await supabase
    .from('extracted_questions')
    .select('question')
    .neq('document_id', currentDocumentId);
  
  if (error) {
    console.error('Error fetching existing questions:', error);
    return { unique: questions, duplicates: 0 };
  }
  
  if (!existingQuestions || existingQuestions.length === 0) {
    console.log('No existing questions to compare against');
    return { unique: questions, duplicates: 0 };
  }
  
  console.log(`Comparing against ${existingQuestions.length} existing questions from other documents`);
  
  // Filter using fuzzy matching (85% similarity threshold)
  const unique = questions.filter(newQ => {
    const isDuplicate = existingQuestions.some((existing: any) => {
      return similarityScore(newQ.question_text, existing.question) > 0.85;
    });
    return !isDuplicate;
  });
  
  const duplicatesCount = questions.length - unique.length;
  console.log(`Filtered out ${duplicatesCount} cross-document duplicates, keeping ${unique.length} unique questions`);
  
  return {
    unique,
    duplicates: duplicatesCount
  };
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
                        options: { 
                          type: 'array', 
                          items: { type: 'string' },
                          minItems: 2,
                          maxItems: 4
                        },
                        correct_answer: { 
                          type: 'number',
                          description: 'Index 0-3 of correct option, or -1 if unknown'
                        }
                      },
                      required: ['question_text', 'options']
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
      
      // Fuzzy deduplication using Levenshtein distance
      const levenshteinDistance = (str1: string, str2: string): number => {
        const len1 = str1.length;
        const len2 = str2.length;
        const matrix: number[][] = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));
        
        for (let i = 0; i <= len1; i++) matrix[i][0] = i;
        for (let j = 0; j <= len2; j++) matrix[0][j] = j;
        
        for (let i = 1; i <= len1; i++) {
          for (let j = 1; j <= len2; j++) {
            const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
              matrix[i - 1][j] + 1,
              matrix[i][j - 1] + 1,
              matrix[i - 1][j - 1] + cost
            );
          }
        }
        
        return matrix[len1][len2];
      };
      
      const similarityScore = (str1: string, str2: string): number => {
        const distance = levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
        const maxLength = Math.max(str1.length, str2.length);
        return maxLength === 0 ? 1.0 : 1 - (distance / maxLength);
      };
      
      // Fuzzy deduplication: keep highest confidence version of similar questions
      const dedupedQuestions: any[] = [];
      const SIMILARITY_THRESHOLD = 0.90;
      
      allQuestions.forEach((currentQ: any) => {
        const currentText = String(currentQ.question_text || '').trim();
        
        // Find if similar question already exists
        let similarIndex = -1;
        let highestSimilarity = 0;
        
        for (let i = 0; i < dedupedQuestions.length; i++) {
          const existingText = String(dedupedQuestions[i].question_text || '').trim();
          const similarity = similarityScore(currentText, existingText);
          
          if (similarity >= SIMILARITY_THRESHOLD && similarity > highestSimilarity) {
            similarIndex = i;
            highestSimilarity = similarity;
          }
        }
        
        if (similarIndex === -1) {
          // No similar question found, add it
          dedupedQuestions.push(currentQ);
        } else {
          // Similar question found - keep the one with higher confidence
          // We'll calculate confidence on the fly for comparison
          const currentConfidence = currentQ.correct_answer !== undefined && currentQ.correct_answer >= 0 ? 1.0 : 0.75;
          const existingConfidence = dedupedQuestions[similarIndex].correct_answer !== undefined && dedupedQuestions[similarIndex].correct_answer >= 0 ? 1.0 : 0.75;
          
          if (currentConfidence > existingConfidence) {
            console.log(`Replacing similar question (${(highestSimilarity * 100).toFixed(1)}% match) with higher confidence version`);
            dedupedQuestions[similarIndex] = currentQ;
          }
        }
      });
      
      console.log(`After fuzzy deduplication (90% threshold): ${dedupedQuestions.length} unique questions from ${allQuestions.length} total. Validating...`);
      
      // Relaxed validation function - accept incomplete questions
      const validateAndNormalize = (q: any) => {
        const issues: string[] = [];
        let confidenceScore = 1.0;
        
        // Must have question text
        if (!q.question_text || String(q.question_text).trim() === '') {
          return { valid: false, issues: ['empty question text'], confidenceScore: 0 };
        }
        
        // Normalize options: accept 2-4, pad to 4 with N/A
        if (!Array.isArray(q.options)) {
          return { valid: false, issues: ['no options array'], confidenceScore: 0 };
        }
        
        const validOptions = q.options.filter((opt: any) => opt && String(opt).trim() !== '');
        
        if (validOptions.length < 2) {
          return { valid: false, issues: ['fewer than 2 valid options'], confidenceScore: 0 };
        }
        
        // Pad to exactly 4 options
        const paddedOptions = [...validOptions];
        while (paddedOptions.length < 4) {
          paddedOptions.push('N/A');
          confidenceScore -= 0.15; // Lower confidence for padded options
        }
        
        // Handle correct_answer
        let correctAnswer = q.correct_answer;
        if (typeof correctAnswer !== 'number' || correctAnswer < 0 || correctAnswer >= validOptions.length) {
          correctAnswer = -1; // Unknown
          confidenceScore -= 0.25; // Lower confidence for unknown answer
          issues.push('unknown correct answer');
        }
        
        // Adjust confidence for short questions
        if (String(q.question_text).trim().length < 20) {
          confidenceScore -= 0.1;
        }
        
        return { 
          valid: true, 
          issues,
          confidenceScore: Math.max(0.1, confidenceScore),
          normalized: {
            question_text: String(q.question_text).trim(),
            options: paddedOptions.slice(0, 4),
            correct_answer: correctAnswer
          }
        };
      };
      
      // Validate, normalize, and categorize
      const validQuestions: any[] = [];
      const dropReasons: { [key: string]: number } = {};
      
      dedupedQuestions.forEach((q: any, index: number) => {
        const validation = validateAndNormalize(q);
        
        if (validation.valid && validation.normalized) {
          validQuestions.push({
            ...validation.normalized,
            confidenceScore: validation.confidenceScore
          });
          
          // Log low confidence questions
          if (validation.confidenceScore < 0.7 && index < 5) {
            console.log(`Question ${index + 1} accepted with confidence ${validation.confidenceScore.toFixed(2)}: ${validation.issues.join(', ')}`);
          }
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
      
      // Filter out questions with unknown correct answers
      const questionsWithAnswers = validQuestions.filter((q: any) => q.correct_answer >= 0 && q.correct_answer < 4);
      console.log(`After filtering unknown answers: ${questionsWithAnswers.length} questions with known answers`);
      
      // Filter out cross-document duplicates
      const { unique: uniqueQuestions, duplicates: duplicatesCount } = await filterCrossDocumentDuplicates(
        questionsWithAnswers,
        documentId!,
        supabase
      );
      
      if (duplicatesCount > 0) {
        console.log(`⚠️ Skipped ${duplicatesCount} cross-document duplicate questions`);
      }
      
      if (uniqueQuestions.length > 0) {
        const questionsToInsert = uniqueQuestions.map((q: any) => {
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
            module: String(doc.module || 'general'),
            confidence_score: q.confidenceScore
          };
        });

        const { error: insertError } = await supabase
          .from('extracted_questions')
          .insert(questionsToInsert);

        if (insertError) {
          console.error('Insert error:', insertError);
          throw insertError;
        }

        console.log(`Successfully inserted ${uniqueQuestions.length} unique questions for module: ${doc.module}`);
      } else {
        console.log('No valid questions with known answers to insert');
      }
    } else if (doc.purpose === 'rag') {
      // RAG processing - Semantic chunking with overlap
      console.log('Starting RAG processing with semantic chunking...');
      const chunkSize = 1000;
      const overlapSize = 200;
      const chunks: string[] = [];

      // Helper function to find the best split point (paragraph or sentence boundary)
      const findBestSplitPoint = (text: string, targetIndex: number, searchWindow: number = 100): number => {
        const start = Math.max(0, targetIndex - searchWindow);
        const end = Math.min(text.length, targetIndex + searchWindow);
        const searchText = text.slice(start, end);
        
        // Look for paragraph breaks first
        const paragraphBreak = searchText.lastIndexOf('\n\n');
        if (paragraphBreak !== -1 && paragraphBreak > searchWindow / 2) {
          return start + paragraphBreak + 2;
        }
        
        // Look for single line breaks
        const lineBreak = searchText.lastIndexOf('\n');
        if (lineBreak !== -1 && lineBreak > searchWindow / 3) {
          return start + lineBreak + 1;
        }
        
        // Look for sentence endings
        const sentenceEndings = ['. ', '! ', '? ', '.\n', '!\n', '?\n'];
        let bestSplit = -1;
        let bestDistance = Infinity;
        
        for (const ending of sentenceEndings) {
          const idx = searchText.lastIndexOf(ending);
          if (idx !== -1) {
            const distance = Math.abs(idx - searchWindow);
            if (distance < bestDistance) {
              bestDistance = distance;
              bestSplit = start + idx + ending.length;
            }
          }
        }
        
        if (bestSplit !== -1) return bestSplit;
        
        // Fallback to space
        const lastSpace = searchText.lastIndexOf(' ');
        if (lastSpace !== -1) return start + lastSpace + 1;
        
        // Last resort: use target index
        return targetIndex;
      };

      let position = 0;
      while (position < fileContent.length) {
        let endPosition = Math.min(position + chunkSize, fileContent.length);
        
        // If not at the end, find a good split point
        if (endPosition < fileContent.length) {
          endPosition = findBestSplitPoint(fileContent, endPosition);
        }
        
        const rawChunk = fileContent.slice(position, endPosition);
        const sanitizedChunk = sanitizeText(rawChunk);
        
        if (sanitizedChunk.trim().length > 50) { // Skip very small chunks
          chunks.push(sanitizedChunk);
        }
        
        // Move position forward, accounting for overlap
        position = endPosition - overlapSize;
        if (position >= fileContent.length) break;
      }

      console.log(`Created ${chunks.length} semantic chunks with ${overlapSize}char overlap`);

      // Insert chunks without embeddings with validation
      let successfulChunks = 0;
      let failedChunks = 0;
      
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        
        // Skip empty chunks
        if (!chunk || chunk.trim().length === 0) {
          console.log(`Skipping empty chunk ${i}`);
          continue;
        }
        
        // Additional validation: ensure chunk is valid string
        if (typeof chunk !== 'string') {
          console.error(`Chunk ${i} is not a string, skipping`);
          failedChunks++;
          continue;
        }
        
        const { error: insertError } = await supabase
          .from('document_chunks')
          .insert({
            document_id: documentId,
            content: chunk,
            chunk_index: i
          });

        if (insertError) {
          console.error(`Failed to insert chunk ${i}:`, insertError);
          console.error(`Chunk preview (first 100 chars): ${chunk.substring(0, 100)}`);
          failedChunks++;
          // Continue processing remaining chunks instead of throwing
          continue;
        }
        
        successfulChunks++;
      }

      console.log(`Chunk processing complete: ${successfulChunks} successful, ${failedChunks} failed out of ${chunks.length} total`);
      
      // If more than 90% of chunks failed, mark as failed
      if (failedChunks > chunks.length * 0.1) {
        throw new Error(`Too many failed chunks: ${failedChunks}/${chunks.length}`);
      }
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