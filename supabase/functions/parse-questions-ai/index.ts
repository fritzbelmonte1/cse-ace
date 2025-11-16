import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Module-specific guidelines for enhanced extraction
function getModuleSpecificGuidelines(module: string): string {
  const guidelines: Record<string, string> = {
    numerical: `
NUMERICAL REASONING FOCUS:
- Questions involve calculations, data interpretation, numerical patterns
- Look for tables, charts, statistics, percentages, ratios
- Questions may include graphs or data sets
- Common topics: arithmetic, percentages, ratios, data analysis`,
    
    vocabulary: `
VOCABULARY FOCUS:
- Questions test word meanings, synonyms, antonyms, word usage
- Look for "Which word means...", "Synonym for...", "Opposite of..."
- Questions may include context sentences
- Common topics: definitions, word relationships, contextual usage`,
    
    verbal: `
VERBAL REASONING FOCUS:
- Questions test reading comprehension, logic, analogies
- Look for passage-based questions, logical sequences, statements
- Questions may include argument analysis, inference
- Common topics: comprehension, critical reasoning, sentence completion`,
    
    abstract: `
ABSTRACT REASONING FOCUS:
- Questions test pattern recognition, spatial reasoning
- Look for sequences, shapes, matrices, visual patterns
- Questions may describe patterns or relationships
- Common topics: pattern completion, odd one out, series`,
    
    quantitative: `
QUANTITATIVE REASONING FOCUS:
- Questions test mathematical and statistical analysis
- Look for graphs, data interpretation, problem-solving
- Questions may include advanced calculations
- Common topics: statistics, probability, algebra, geometry`
  };
  
  return guidelines[module] || guidelines.numerical;
}

// Enhanced system prompt with few-shot examples
function buildSystemPrompt(module: string): string {
  return `You are an expert question extractor specialized in ${module} assessment questions.

CRITICAL EXTRACTION RULES:
1. Extract EVERY question you find - do not skip any
2. Even if a question seems incomplete, include it (mark fields as empty if missing)
3. Preserve the EXACT wording from the source text
4. If options are labeled differently (1,2,3,4 or i,ii,iii,iv), convert to A,B,C,D
5. If correct answer is missing, set it as empty string rather than guessing
6. Handle questions that span multiple lines or pages
7. Recognize questions in tables, bullet points, or numbered formats
8. Extract questions even if formatting is poor or inconsistent
9. If you see "Question X:" or "Q.X" or just a number followed by text, it's likely a question
10. Don't combine multiple questions into one - extract each separately

QUESTION FORMAT REQUIREMENTS:
- Question text: Must be clear and complete (minimum 10 characters)
- Exactly 4 options labeled A, B, C, D
- One correct answer (A, B, C, or D) - can be empty if not found
- Each option should be distinct and meaningful

${getModuleSpecificGuidelines(module)}

EXAMPLES OF VALID QUESTIONS:
Question: "What is 25% of 80?"
A: 15
B: 20
C: 25
D: 30
Correct: B

Question: "Which word is a synonym for 'happy'?"
A: Sad
B: Joyful
C: Angry
D: Tired
Correct: B

BE THOROUGH: Your goal is 100% extraction accuracy. Extract every question, even if some details are unclear.`;
}

// Build user prompt
function buildUserPrompt(text: string, module: string): string {
  return `Extract ALL ${module} questions from the following text. Be systematic and thorough:

INSTRUCTIONS:
1. Read through the entire text carefully
2. Identify every question, regardless of formatting
3. Extract each question with its options and correct answer
4. If any field is unclear, extract what you can and leave the rest empty
5. Do not skip questions due to poor formatting

TEXT TO PARSE:
${text}

Remember: Extract EVERY question you find. Completeness is more important than perfection.`;
}

// Create overlapping chunks for large documents
function createOverlappingChunks(text: string, chunkSize: number, overlap: number): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  
  if (words.length <= chunkSize) {
    return [text];
  }
  
  let startIdx = 0;
  while (startIdx < words.length) {
    const endIdx = Math.min(startIdx + chunkSize, words.length);
    const chunk = words.slice(startIdx, endIdx).join(' ');
    chunks.push(chunk);
    
    if (endIdx >= words.length) break;
    startIdx += (chunkSize - overlap);
  }
  
  console.log(`Created ${chunks.length} chunks from ${words.length} words`);
  return chunks;
}

// Deduplicate questions based on similarity
function deduplicateQuestions(questions: any[]): any[] {
  const unique: any[] = [];
  
  for (const q of questions) {
    const isDuplicate = unique.some(existing => {
      const similarity = calculateSimilarity(
        q.question?.toLowerCase() || '',
        existing.question?.toLowerCase() || ''
      );
      return similarity > 0.85; // 85% similarity threshold
    });
    
    if (!isDuplicate) {
      unique.push(q);
    }
  }
  
  console.log(`Deduplicated: ${questions.length} -> ${unique.length} questions`);
  return unique;
}

// Simple Levenshtein-based similarity
function calculateSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 1.0;
  if (!str1 || !str2) return 0;
  
  const maxLength = Math.max(str1.length, str2.length);
  if (maxLength === 0) return 1.0;
  
  const distance = levenshteinDistance(str1, str2);
  return 1 - (distance / maxLength);
}

function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= str1.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str2.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str1.length; i++) {
    for (let j = 1; j <= str2.length; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  
  return matrix[str1.length][str2.length];
}

// Validate extracted questions
function validateQuestion(q: any): any {
  const hasQuestion = !!(q.question && q.question.trim().length > 10);
  const hasAllOptions = !!(q.option_a && q.option_b && q.option_c && q.option_d);
  const hasAnswer = !!(q.correct_answer && /^[ABCD]$/i.test(q.correct_answer));
  
  const optionsArray = [
    q.option_a?.trim() || '',
    q.option_b?.trim() || '',
    q.option_c?.trim() || '',
    q.option_d?.trim() || ''
  ].filter(opt => opt.length > 0);
  
  const optionsDistinct = new Set(optionsArray.map(o => o.toLowerCase())).size === optionsArray.length;
  
  return {
    ...q,
    validation: {
      hasQuestion,
      hasAllOptions,
      hasAnswer,
      optionsDistinct,
      isComplete: hasQuestion && hasAllOptions && hasAnswer && optionsDistinct
    }
  };
}

// Extract questions with retry logic
async function extractWithRetry(
  text: string,
  module: string,
  apiKey: string,
  maxRetries: number = 3
): Promise<any[]> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const questions = await extractQuestionsFromText(text, module, apiKey);
      return questions;
    } catch (error: any) {
      console.error(`Attempt ${attempt} failed:`, error.message);
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Exponential backoff: 2s, 4s, 8s
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  return [];
}

// Core extraction function
async function extractQuestionsFromText(
  text: string,
  module: string,
  apiKey: string
): Promise<any[]> {
  const systemPrompt = buildSystemPrompt(module);
  const userPrompt = buildUserPrompt(text, module);
  
  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-pro',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'extract_questions',
            description: 'Extract multiple-choice questions from text',
            parameters: {
              type: 'object',
              properties: {
                questions: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      question: { type: 'string', description: 'The question text' },
                      option_a: { type: 'string', description: 'Option A text' },
                      option_b: { type: 'string', description: 'Option B text' },
                      option_c: { type: 'string', description: 'Option C text' },
                      option_d: { type: 'string', description: 'Option D text' },
                      correct_answer: { 
                        type: 'string', 
                        description: 'The correct answer letter (A, B, C, or D) - can be empty if not found'
                      }
                    },
                    required: ['question', 'option_a', 'option_b', 'option_c', 'option_d'],
                    additionalProperties: false
                  }
                }
              },
              required: ['questions'],
              additionalProperties: false
            }
          }
        }
      ],
      tool_choice: { type: 'function', function: { name: 'extract_questions' } }
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Lovable AI error:', response.status, errorText);
    
    if (response.status === 429) {
      throw new Error('RATE_LIMIT');
    }
    
    if (response.status === 402) {
      throw new Error('CREDITS_EXHAUSTED');
    }

    throw new Error(`AI API error: ${response.status}`);
  }

  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  
  if (!toolCall) {
    throw new Error('No tool call in AI response');
  }

  const parsedQuestions = JSON.parse(toolCall.function.arguments);
  return parsedQuestions.questions || [];
}

// Main handler
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const { text, module } = await req.json();
    console.log(`Starting extraction for module: ${module}, text length: ${text.length} chars`);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Normalize text
    const normalizedText = text
      .replace(/\r\n/g, '\n')
      .replace(/\t/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    let allQuestions: any[] = [];

    // Determine if chunking is needed (roughly 3000 words = 12000 chars)
    const CHUNK_SIZE = 2500; // words
    const OVERLAP = 200; // words
    const estimatedWords = normalizedText.split(/\s+/).length;

    if (estimatedWords > CHUNK_SIZE) {
      console.log(`Large document detected (${estimatedWords} words), using chunked processing`);
      
      const chunks = createOverlappingChunks(normalizedText, CHUNK_SIZE, OVERLAP);
      
      for (let i = 0; i < chunks.length; i++) {
        console.log(`Processing chunk ${i + 1}/${chunks.length}`);
        const chunkQuestions = await extractWithRetry(chunks[i], module, LOVABLE_API_KEY);
        allQuestions.push(...chunkQuestions);
        console.log(`Chunk ${i + 1} yielded ${chunkQuestions.length} questions`);
      }
      
      // Deduplicate across chunks
      allQuestions = deduplicateQuestions(allQuestions);
    } else {
      // Single extraction for smaller documents
      console.log(`Processing as single document (${estimatedWords} words)`);
      allQuestions = await extractWithRetry(normalizedText, module, LOVABLE_API_KEY);
    }

    // Validate all extracted questions
    const validatedQuestions = allQuestions.map(validateQuestion);
    
    const completeCount = validatedQuestions.filter(q => q.validation.isComplete).length;
    const incompleteCount = validatedQuestions.length - completeCount;
    
    // Calculate quality score (0-100)
    const completionRate = validatedQuestions.length > 0 ? (completeCount / validatedQuestions.length) : 0;
    const hasMinimumQuestions = validatedQuestions.length >= 5; // At least 5 questions expected
    const lowIncompleteRate = incompleteCount / Math.max(validatedQuestions.length, 1) < 0.3; // Less than 30% incomplete
    
    // Quality score formula:
    // - 60% based on completion rate
    // - 20% based on minimum question threshold
    // - 20% based on low incomplete rate
    let qualityScore = (completionRate * 60) + 
                       (hasMinimumQuestions ? 20 : (validatedQuestions.length / 5) * 20) +
                       (lowIncompleteRate ? 20 : 0);
    qualityScore = Math.round(Math.min(100, Math.max(0, qualityScore)));
    
    // Determine if needs review
    const needsReview = qualityScore < 70 || // Low quality score
                        (incompleteCount / Math.max(validatedQuestions.length, 1)) > 0.3 || // >30% incomplete
                        validatedQuestions.length < 3 || // Very few questions
                        completeCount === 0; // No complete questions
    
    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log(`Extraction complete in ${elapsedTime}s: ${validatedQuestions.length} questions (${completeCount} complete, ${incompleteCount} incomplete)`);
    console.log(`Quality Score: ${qualityScore}/100 | Needs Review: ${needsReview}`);

    return new Response(
      JSON.stringify({ 
        questions: validatedQuestions,
        metadata: {
          totalExtracted: validatedQuestions.length,
          completeQuestions: completeCount,
          incompleteQuestions: incompleteCount,
          processingTimeSeconds: parseFloat(elapsedTime),
          chunksProcessed: estimatedWords > CHUNK_SIZE ? Math.ceil(estimatedWords / CHUNK_SIZE) : 1,
          qualityScore,
          needsReview,
          qualityMetrics: {
            completionRate: Math.round(completionRate * 100),
            hasMinimumQuestions,
            lowIncompleteRate,
            validationIssues: validatedQuestions.filter(q => !q.validation.isComplete).map(q => ({
              question: q.question?.substring(0, 50) + '...',
              issues: {
                missingQuestion: !q.validation.hasQuestion,
                missingOptions: !q.validation.hasAllOptions,
                missingAnswer: !q.validation.hasAnswer,
                duplicateOptions: !q.validation.optionsDistinct
              }
            }))
          }
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in parse-questions-ai:', error);
    
    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
    
    if (error.message === 'RATE_LIMIT') {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (error.message === 'CREDITS_EXHAUSTED') {
      return new Response(
        JSON.stringify({ error: 'AI credits exhausted. Please add credits to your workspace.' }),
        { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTimeSeconds: parseFloat(elapsedTime)
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
