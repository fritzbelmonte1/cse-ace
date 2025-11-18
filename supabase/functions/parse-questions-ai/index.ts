import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Document analysis result
interface DocumentProfile {
  formattingQuality: 'good' | 'poor' | 'terrible';
  hasTable: boolean;
  hasDiagrams: boolean;
  estimatedQuestionCount: number;
  questionFormat: 'numbered' | 'bulleted' | 'mixed' | 'unknown';
  answerKeyLocation: 'inline' | 'end-of-section' | 'separate' | 'missing';
  recommendedModel: string;
  hasPageNumbers: boolean;
  hasSections: boolean;
  specialInstructions: string[];
}

// Model selection based on document complexity
function selectModel(profile: DocumentProfile): string {
  if (profile.formattingQuality === 'terrible' || profile.hasTable) {
    return 'google/gemini-2.5-pro'; // Best reasoning for complex cases
  }
  if (profile.estimatedQuestionCount > 100) {
    return 'google/gemini-2.5-flash'; // Balanced for large docs
  }
  return 'google/gemini-2.5-flash'; // Default quality model
}

// Analyze document before extraction (Pass 0)
async function analyzeDocument(text: string, apiKey: string): Promise<DocumentProfile> {
  const analysisPrompt = `Analyze this document excerpt and provide a structural assessment.

ANALYSIS TASKS:
1. Formatting quality (good/poor/terrible)
2. Presence of tables or diagrams
3. Estimated total question count
4. Question numbering format
5. Answer key location
6. Page number presence
7. Section headers presence

TEXT SAMPLE (first 3000 chars):
${text.substring(0, 3000)}

Provide a concise structural analysis.`;

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash-lite', // Fast analysis model
      messages: [
        { role: 'system', content: 'You are a document analysis expert. Provide brief, accurate assessments.' },
        { role: 'user', content: analysisPrompt }
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'document_analysis',
            description: 'Analyze document structure and formatting',
            parameters: {
              type: 'object',
              properties: {
                formattingQuality: { type: 'string', enum: ['good', 'poor', 'terrible'] },
                hasTable: { type: 'boolean' },
                hasDiagrams: { type: 'boolean' },
                estimatedQuestionCount: { type: 'number' },
                questionFormat: { type: 'string', enum: ['numbered', 'bulleted', 'mixed', 'unknown'] },
                answerKeyLocation: { type: 'string', enum: ['inline', 'end-of-section', 'separate', 'missing'] },
                hasPageNumbers: { type: 'boolean' },
                hasSections: { type: 'boolean' },
                specialInstructions: { type: 'array', items: { type: 'string' } }
              },
              required: ['formattingQuality', 'hasTable', 'estimatedQuestionCount'],
              additionalProperties: false
            }
          }
        }
      ],
      tool_choice: { type: 'function', function: { name: 'document_analysis' } }
    }),
  });

  if (!response.ok) {
    console.warn('Document analysis failed, using defaults');
    return {
      formattingQuality: 'good',
      hasTable: false,
      hasDiagrams: false,
      estimatedQuestionCount: 50,
      questionFormat: 'numbered',
      answerKeyLocation: 'inline',
      recommendedModel: 'google/gemini-2.5-flash',
      hasPageNumbers: false,
      hasSections: false,
      specialInstructions: []
    };
  }

  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  
  if (!toolCall) {
    throw new Error('No analysis tool call in response');
  }

  const analysis = JSON.parse(toolCall.function.arguments);
  const profile: DocumentProfile = {
    ...analysis,
    recommendedModel: selectModel(analysis)
  };
  
  console.log('Document analysis:', profile);
  return profile;
}

// Pass 1: Fast discovery of question boundaries
async function discoverQuestions(text: string, module: string, apiKey: string): Promise<any[]> {
  const discoveryPrompt = `Quickly identify ALL question boundaries in this ${module} text.

For each question found, extract:
- Approximate location (page/section if visible)
- Question number/identifier
- Question text (first 50 chars)
- Whether it appears complete or needs refinement

TEXT:
${text}

Find ALL questions, even if formatting is poor.`;

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash-lite', // Fast discovery
      messages: [
        { role: 'system', content: 'You are a question detector. Identify question boundaries quickly.' },
        { role: 'user', content: discoveryPrompt }
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'discover_questions',
            description: 'Identify question boundaries',
            parameters: {
              type: 'object',
              properties: {
                questions: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      question_number: { type: 'string' },
                      page_number: { type: 'number' },
                      section: { type: 'string' },
                      preview: { type: 'string' },
                      needs_refinement: { type: 'boolean' }
                    },
                    required: ['preview']
                  }
                }
              },
              required: ['questions']
            }
          }
        }
      ],
      tool_choice: { type: 'function', function: { name: 'discover_questions' } }
    }),
  });

  if (!response.ok) {
    console.warn('Discovery pass failed, skipping to direct extraction');
    return [];
  }

  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  
  if (!toolCall) return [];

  const discovered = JSON.parse(toolCall.function.arguments);
  console.log(`Discovery pass found ${discovered.questions?.length || 0} questions`);
  return discovered.questions || [];
}

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

// Enhanced system prompt with learned corrections (Phase 3)
function buildSystemPrompt(module: string, correctionGuidance: string = ''): string {
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
${correctionGuidance}

QUESTION FORMAT REQUIREMENTS:
- Question text: Must be clear and complete (minimum 10 characters)
- Exactly 4 options labeled A, B, C, D
- One correct answer (A, B, C, or D) - can be empty if not found
- Each option should be distinct and meaningful

${getModuleSpecificGuidelines(module)}

EXAMPLES OF VALID QUESTIONS:

✅ GOOD EXAMPLE 1 (Numerical):
Question: "What is 25% of 80?"
A: 15
B: 20
C: 25
D: 30
Correct: B

✅ GOOD EXAMPLE 2 (Vocabulary):
Question: "Which word is a synonym for 'happy'?"
A: Sad
B: Joyful
C: Angry
D: Tired
Correct: B

✅ GOOD EXAMPLE 3 (Complex formatting):
Source text: "15) Calculate: 5 + 3 × 2
(i) 11  (ii) 16  (iii) 13  (iv) 10  Answer: i"
Extracted as:
Question: "Calculate: 5 + 3 × 2"
A: 11
B: 16
C: 13
D: 10
Correct: A

COMMON ERRORS TO AVOID:

❌ ERROR 1: Duplicate or very similar options
BAD: A: "Happy" B: "Joyful" C: "Happy" D: "Glad"
GOOD: A: "Happy" B: "Sad" C: "Angry" D: "Excited"

❌ ERROR 2: Incomplete question text
BAD: "What is the"
GOOD: "What is the capital of France?"

❌ ERROR 3: Options that aren't answers
BAD: A: "Maybe" B: "I don't know" C: "Paris" D: "None"
GOOD: A: "Paris" B: "London" C: "Berlin" D: "Madrid"

❌ ERROR 4: Guessing the answer
If answer key says "Answer: X" but no X option exists, leave correct_answer empty

❌ ERROR 5: Combining multiple questions
If you see "15a)" and "15b)" - extract as TWO separate questions

BE THOROUGH: Your goal is 100% extraction accuracy. Extract every question, even if some details are unclear.`;
}

// Build user prompt with context awareness
function buildUserPrompt(text: string, module: string, profile: DocumentProfile, discoveredContext?: any[]): string {
  let contextHints = '';
  
  if (profile.hasSections) {
    contextHints += '\n- PRESERVE section/chapter headers when extracting questions';
  }
  if (profile.hasPageNumbers) {
    contextHints += '\n- CAPTURE page numbers where questions appear';
  }
  if (discoveredContext && discoveredContext.length > 0) {
    contextHints += `\n- ${discoveredContext.length} questions were detected in discovery pass - ensure all are extracted`;
  }
  if (profile.specialInstructions.length > 0) {
    contextHints += '\n- Special instructions: ' + profile.specialInstructions.join('; ');
  }

  return `Extract ALL ${module} questions from the following text. Be systematic and thorough:

INSTRUCTIONS:
1. Read through the entire text carefully
2. Identify every question, regardless of formatting
3. Extract each question with its options and correct answer
4. CAPTURE CONTEXT: Include section name, page number, and question number if visible
5. If any field is unclear, extract what you can and leave the rest empty
6. Do not skip questions due to poor formatting
${contextHints}

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

// Semantic deduplication using AI (Phase 3)
async function semanticDeduplication(questions: any[], apiKey: string): Promise<any[]> {
  if (questions.length < 2) return questions;
  
  const unique: any[] = [];
  const duplicatePairs: Array<{q1: number, q2: number, similarity: number}> = [];
  
  // First pass: exact and fuzzy deduplication (fast)
  for (const q of questions) {
    const isDuplicate = unique.some(existing => {
      const similarity = calculateSimilarity(
        q.question?.toLowerCase() || '',
        existing.question?.toLowerCase() || ''
      );
      return similarity > 0.85;
    });
    
    if (!isDuplicate) {
      unique.push(q);
    }
  }
  
  // Second pass: semantic check for borderline cases (70-85% text similarity)
  const borderlinePairs: Array<[number, number]> = [];
  for (let i = 0; i < unique.length; i++) {
    for (let j = i + 1; j < unique.length; j++) {
      const textSimilarity = calculateSimilarity(
        unique[i].question?.toLowerCase() || '',
        unique[j].question?.toLowerCase() || ''
      );
      
      if (textSimilarity > 0.70 && textSimilarity < 0.85) {
        borderlinePairs.push([i, j]);
      }
    }
  }
  
  // Use AI for semantic analysis of borderline cases
  if (borderlinePairs.length > 0 && borderlinePairs.length < 10) { // Limit to avoid excessive API calls
    console.log(`Running semantic analysis on ${borderlinePairs.length} borderline pairs`);
    
    for (const [i, j] of borderlinePairs) {
      const q1 = unique[i];
      const q2 = unique[j];
      
      const semanticPrompt = `Compare these two questions and determine if they are semantically the same (asking the same thing, just worded differently):

Question 1: ${q1.question}
Options: A) ${q1.option_a} B) ${q1.option_b} C) ${q1.option_c} D) ${q1.option_d}

Question 2: ${q2.question}
Options: A) ${q2.option_a} B) ${q2.option_b} C) ${q2.option_c} D) ${q2.option_d}

Are these semantically identical (testing the same concept)?`;

      try {
        const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash-lite',
            messages: [
              { role: 'system', content: 'You are a semantic similarity expert. Respond with only "yes" or "no".' },
              { role: 'user', content: semanticPrompt }
            ],
            max_tokens: 10
          }),
        });
        
        if (response.ok) {
          const data = await response.json();
          const answer = data.choices?.[0]?.message?.content?.toLowerCase().trim();
          
          if (answer?.includes('yes')) {
            duplicatePairs.push({ q1: i, q2: j, similarity: 0.9 });
          }
        }
      } catch (error) {
        console.warn('Semantic analysis failed for pair:', error);
      }
    }
  }
  
  // Remove semantic duplicates (keep first occurrence)
  const toRemove = new Set<number>();
  for (const { q1, q2 } of duplicatePairs) {
    toRemove.add(q2); // Keep q1, remove q2
  }
  
  const finalUnique = unique.filter((_, idx) => !toRemove.has(idx));
  
  console.log(`Semantic deduplication: ${questions.length} -> ${unique.length} (fuzzy) -> ${finalUnique.length} (semantic)`);
  return finalUnique;
}

// Get correction patterns for learning (Phase 3)
async function getCorrectionPatterns(module: string, supabase: any): Promise<string> {
  try {
    // Get recent corrections for this module
    const { data: corrections, error } = await supabase
      .from('question_corrections')
      .select(`
        field_changed,
        correction_type,
        original_value,
        corrected_value
      `)
      .eq('correction_type', 'content')
      .order('corrected_at', { ascending: false })
      .limit(20);
    
    if (error || !corrections || corrections.length === 0) {
      return '';
    }
    
    // Analyze patterns
    const patterns: Record<string, number> = {};
    corrections.forEach((c: any) => {
      if (c.field_changed === 'question') {
        // Detect common correction patterns
        if (c.corrected_value.length > c.original_value.length * 1.3) {
          patterns['expand_abbreviated'] = (patterns['expand_abbreviated'] || 0) + 1;
        }
        if (c.corrected_value.match(/^[A-Z]/) && !c.original_value.match(/^[A-Z]/)) {
          patterns['capitalize_questions'] = (patterns['capitalize_questions'] || 0) + 1;
        }
        if (c.corrected_value.includes('?') && !c.original_value.includes('?')) {
          patterns['add_question_mark'] = (patterns['add_question_mark'] || 0) + 1;
        }
      }
    });
    
    // Build guidance from patterns
    const guidance: string[] = [];
    if (patterns['expand_abbreviated'] > 3) {
      guidance.push('- Expand abbreviated terms in questions (common admin correction)');
    }
    if (patterns['capitalize_questions'] > 3) {
      guidance.push('- Ensure questions start with capital letters (common admin correction)');
    }
    if (patterns['add_question_mark'] > 3) {
      guidance.push('- Add question marks to interrogative sentences (common admin correction)');
    }
    
    if (guidance.length > 0) {
      return '\n\nLEARNED FROM PREVIOUS CORRECTIONS:\n' + guidance.join('\n');
    }
    
    return '';
  } catch (error) {
    console.warn('Failed to fetch correction patterns:', error);
    return '';
  }
}

// Save processing checkpoint (Phase 3)
async function saveCheckpoint(
  documentId: string,
  checkpoint: any,
  supabase: any
): Promise<void> {
  try {
    const { error } = await supabase
      .from('documents')
      .update({ processing_checkpoint: checkpoint })
      .eq('id', documentId);
    
    if (error) {
      console.error('Failed to save checkpoint:', error);
    }
  } catch (error) {
    console.error('Checkpoint save error:', error);
  }
}

// Load processing checkpoint (Phase 3)
async function loadCheckpoint(documentId: string, supabase: any): Promise<any | null> {
  try {
    const { data, error } = await supabase
      .from('documents')
      .select('processing_checkpoint')
      .eq('id', documentId)
      .single();
    
    if (error || !data) {
      return null;
    }
    
    const checkpoint = data.processing_checkpoint;
    if (checkpoint && Object.keys(checkpoint).length > 0) {
      console.log('Resuming from checkpoint:', checkpoint);
      return checkpoint;
    }
    
    return null;
  } catch (error) {
    console.error('Checkpoint load error:', error);
    return null;
  }
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

// Multi-dimensional quality scoring
function calculateQuestionQuality(q: any): any {
  const questionText = q.question?.trim() || '';
  const optionA = q.option_a?.trim() || '';
  const optionB = q.option_b?.trim() || '';
  const optionC = q.option_c?.trim() || '';
  const optionD = q.option_d?.trim() || '';
  const answer = q.correct_answer?.toUpperCase() || '';
  
  // 1. Question Clarity (0-1)
  const hasQuestion = questionText.length > 10;
  const questionEndsProper = /[?.]$/.test(questionText);
  const questionClarity = hasQuestion ? (questionEndsProper ? 1.0 : 0.8) : 0.0;
  
  // 2. Option Quality (0-1)
  const allOptionsPresent = optionA && optionB && optionC && optionD;
  const optionsArray = [optionA, optionB, optionC, optionD].filter(o => o.length > 0);
  const optionsDistinct = new Set(optionsArray.map(o => o.toLowerCase())).size === optionsArray.length;
  const optionsMinLength = optionsArray.every(o => o.length >= 1);
  const optionsNotTooLong = optionsArray.every(o => o.length <= 200);
  
  let optionQuality = 0;
  if (allOptionsPresent) optionQuality += 0.4;
  if (optionsDistinct) optionQuality += 0.3;
  if (optionsMinLength) optionQuality += 0.15;
  if (optionsNotTooLong) optionQuality += 0.15;
  
  // 3. Answer Certainty (0-1)
  const answerIsValid = ['A', 'B', 'C', 'D'].includes(answer);
  const answerCertainty = answerIsValid ? 1.0 : 0.0;
  
  // 4. Formatting Score (0-1)
  const noExtraSpaces = !/\s{3,}/.test(questionText);
  const properCapitalization = /^[A-Z]/.test(questionText);
  const formattingScore = (noExtraSpaces ? 0.5 : 0.3) + (properCapitalization ? 0.5 : 0.3);
  
  // 5. Overall Quality (weighted average)
  const overallQuality = (
    questionClarity * 0.35 +
    optionQuality * 0.30 +
    answerCertainty * 0.25 +
    formattingScore * 0.10
  );
  
  // Determine review reasons
  const reviewReasons: string[] = [];
  if (questionClarity < 0.7) reviewReasons.push('Question unclear or incomplete');
  if (optionQuality < 0.7) reviewReasons.push('Options missing, duplicate, or invalid');
  if (answerCertainty < 1.0) reviewReasons.push('Correct answer missing or invalid');
  if (formattingScore < 0.5) reviewReasons.push('Poor formatting');
  
  const needsReview = overallQuality < 0.75 || answerCertainty < 0.9;
  
  return {
    ...q,
    quality: {
      questionClarity: Math.round(questionClarity * 100) / 100,
      optionQuality: Math.round(optionQuality * 100) / 100,
      answerCertainty: Math.round(answerCertainty * 100) / 100,
      formattingScore: Math.round(formattingScore * 100) / 100,
      overallQuality: Math.round(overallQuality * 100) / 100,
      needsReview,
      reviewReasons
    },
    // Legacy validation for backward compatibility
    validation: {
      hasQuestion,
      hasAllOptions: allOptionsPresent,
      hasAnswer: answerIsValid,
      optionsDistinct,
      isComplete: hasQuestion && allOptionsPresent && answerIsValid && optionsDistinct
    }
  };
}

// Extract questions with retry logic
async function extractWithRetry(
  text: string,
  module: string,
  apiKey: string,
  profile: DocumentProfile,
  discoveredContext?: any[],
  correctionGuidance: string = '',
  maxRetries: number = 3
): Promise<any[]> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const questions = await extractQuestionsFromText(text, module, apiKey, profile, discoveredContext, correctionGuidance);
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

// Core extraction function (Pass 2: Refined extraction)
async function extractQuestionsFromText(
  text: string,
  module: string,
  apiKey: string,
  profile: DocumentProfile,
  discoveredContext?: any[],
  correctionGuidance: string = ''
): Promise<any[]> {
  const systemPrompt = buildSystemPrompt(module, correctionGuidance);
  const userPrompt = buildUserPrompt(text, module, profile, discoveredContext);
  
  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: profile.recommendedModel, // Use model selected by document analysis
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
                      },
                      document_section: { type: 'string', description: 'Section or chapter name if visible' },
                      page_number: { type: 'number', description: 'Page number if visible' },
                      question_number: { type: 'string', description: 'Original question numbering (e.g., "Q.15", "15a")' },
                      preceding_context: { type: 'string', description: 'Instructions or context before the question' }
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
    const { text, module, documentId } = await req.json();
    console.log(`Starting Phase 3 extraction for module: ${module}, text length: ${text.length} chars, documentId: ${documentId || 'N/A'}`);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Initialize Supabase client for Phase 3 features
    const supabase = documentId && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
      ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
      : null;

    // PHASE 3: Load correction patterns for learning
    const correctionGuidance = supabase 
      ? await getCorrectionPatterns(module, supabase)
      : '';
    
    if (correctionGuidance) {
      console.log('Applying learned correction patterns to extraction');
    }

    // PHASE 3: Check for existing checkpoint (resume capability)
    let checkpoint: any = null;
    if (documentId && supabase) {
      checkpoint = await loadCheckpoint(documentId, supabase);
    }

    // Normalize text
    const normalizedText = text
      .replace(/\r\n/g, '\n')
      .replace(/\t/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // PHASE 2: Pass 0 - Analyze document structure
    console.log('Pass 0: Analyzing document structure...');
    const documentProfile = await analyzeDocument(normalizedText, LOVABLE_API_KEY);
    console.log(`Recommended model: ${documentProfile.recommendedModel}`);
    console.log(`Estimated questions: ${documentProfile.estimatedQuestionCount}`);

    let allQuestions: any[] = [];
    let discoveredQuestions: any[] = [];

    // Determine if chunking is needed
    const CHUNK_SIZE = 2500; // words
    const OVERLAP = 200; // words
    const estimatedWords = normalizedText.split(/\s+/).length;

    // PHASE 3: Resume from checkpoint if available
    let startChunk = 0;
    if (checkpoint && checkpoint.lastProcessedChunk !== undefined) {
      startChunk = checkpoint.lastProcessedChunk + 1;
      allQuestions = checkpoint.extractedQuestions || [];
      console.log(`Resuming from chunk ${startChunk}, already extracted ${allQuestions.length} questions`);
    }

    if (estimatedWords > CHUNK_SIZE) {
      console.log(`Large document detected (${estimatedWords} words), using chunked processing with two-pass extraction`);
      
      const chunks = createOverlappingChunks(normalizedText, CHUNK_SIZE, OVERLAP);
      const totalChunks = chunks.length;
      
      // PHASE 3: Save initial checkpoint
      if (documentId && supabase && !checkpoint) {
        await saveCheckpoint(documentId, {
          totalChunks,
          lastProcessedChunk: -1,
          extractedQuestions: [],
          failedChunks: [],
          startedAt: new Date().toISOString()
        }, supabase);
      }
      
      // PHASE 2: Pass 1 - Discovery on first chunk
      if (startChunk === 0 && chunks.length > 0) {
        console.log('Pass 1: Running discovery on first chunk...');
        discoveredQuestions = await discoverQuestions(chunks[0], module, LOVABLE_API_KEY);
        console.log(`Discovery pass identified ${discoveredQuestions.length} question boundaries`);
      }
      
      // PHASE 2+3: Pass 2 - Refined extraction with checkpoints
      for (let i = startChunk; i < chunks.length; i++) {
        console.log(`Pass 2: Processing chunk ${i + 1}/${chunks.length} with refined extraction`);
        
        try {
          const chunkQuestions = await extractWithRetry(
            chunks[i], 
            module, 
            LOVABLE_API_KEY, 
            documentProfile,
            i === 0 ? discoveredQuestions : undefined,
            correctionGuidance
          );
          allQuestions.push(...chunkQuestions);
          console.log(`Chunk ${i + 1} yielded ${chunkQuestions.length} questions (total: ${allQuestions.length})`);
          
          // PHASE 3: Save checkpoint after each chunk
          if (documentId && supabase) {
            await saveCheckpoint(documentId, {
              totalChunks,
              lastProcessedChunk: i,
              extractedQuestions: allQuestions,
              failedChunks: checkpoint?.failedChunks || [],
              startedAt: checkpoint?.startedAt || new Date().toISOString(),
              progress: Math.round(((i + 1) / totalChunks) * 100)
            }, supabase);
          }
        } catch (error: any) {
          console.error(`Chunk ${i + 1} failed:`, error.message);
          
          // PHASE 3: Track failed chunk
          if (documentId && supabase) {
            const failedChunks = checkpoint?.failedChunks || [];
            failedChunks.push(i);
            await saveCheckpoint(documentId, {
              ...checkpoint,
              failedChunks,
              lastProcessedChunk: i
            }, supabase);
          }
        }
      }
      
      // PHASE 3: Semantic deduplication across chunks
      console.log('Phase 3: Running semantic deduplication...');
      allQuestions = await semanticDeduplication(allQuestions, LOVABLE_API_KEY);
    } else {
      // Single document: Two-pass extraction
      console.log(`Processing as single document (${estimatedWords} words) with two-pass extraction`);
      
      // PHASE 2: Pass 1 - Discovery
      console.log('Pass 1: Running discovery pass...');
      discoveredQuestions = await discoverQuestions(normalizedText, module, LOVABLE_API_KEY);
      console.log(`Discovery pass identified ${discoveredQuestions.length} question boundaries`);
      
      // PHASE 2+3: Pass 2 - Refined extraction with corrections
      console.log('Pass 2: Running refined extraction with learned patterns...');
      allQuestions = await extractWithRetry(
        normalizedText, 
        module, 
        LOVABLE_API_KEY, 
        documentProfile, 
        discoveredQuestions,
        correctionGuidance
      );
      
      // PHASE 3: Semantic deduplication
      console.log('Phase 3: Running semantic deduplication...');
      allQuestions = await semanticDeduplication(allQuestions, LOVABLE_API_KEY);
    }

    // PHASE 3: Clear checkpoint on successful completion
    if (documentId && supabase) {
      await saveCheckpoint(documentId, { completed: true }, supabase);
    }

    // Validate all extracted questions with quality scoring
    const validatedQuestions = allQuestions.map(calculateQuestionQuality);
    
    const completeCount = validatedQuestions.filter((q: any) => q.validation.isComplete).length;
    const incompleteCount = validatedQuestions.length - completeCount;
    const highQualityCount = validatedQuestions.filter((q: any) => q.quality.overallQuality >= 0.85).length;
    
    // Enhanced quality score calculation (0-100)
    const avgQuality = validatedQuestions.length > 0 
      ? validatedQuestions.reduce((sum: number, q: any) => sum + q.quality.overallQuality, 0) / validatedQuestions.length 
      : 0;
    
    const completionRate = validatedQuestions.length > 0 ? (completeCount / validatedQuestions.length) : 0;
    const hasMinimumQuestions = validatedQuestions.length >= 5;
    const highQualityRate = validatedQuestions.length > 0 ? (highQualityCount / validatedQuestions.length) : 0;
    const lowIncompleteRate = incompleteCount / Math.max(validatedQuestions.length, 1) < 0.3;
    
    // Quality score formula:
    // - 50% based on average question quality
    // - 30% based on completion rate
    // - 10% based on minimum question threshold
    // - 10% based on high-quality question rate
    let qualityScore = (avgQuality * 50) + 
                       (completionRate * 30) +
                       (hasMinimumQuestions ? 10 : (validatedQuestions.length / 5) * 10) +
                       (highQualityRate * 10);
    qualityScore = Math.round(Math.min(100, Math.max(0, qualityScore)));
    
    // Determine if needs review (more sophisticated)
    const needsReview = qualityScore < 70 || // Low overall quality
                        avgQuality < 0.70 || // Low average quality
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
          // Phase 2 metadata
          documentProfile: {
            formattingQuality: documentProfile.formattingQuality,
            estimatedQuestionCount: documentProfile.estimatedQuestionCount,
            modelUsed: documentProfile.recommendedModel,
            hasContextData: documentProfile.hasSections || documentProfile.hasPageNumbers
          },
          discoveryPassFound: discoveredQuestions.length,
          questionsWithContext: validatedQuestions.filter((q: any) => 
            q.document_section || q.page_number || q.question_number
          ).length,
          // Phase 3 metadata
          learnedFromCorrections: correctionGuidance.length > 0,
          semanticDeduplicationApplied: true,
          resumedFromCheckpoint: checkpoint !== null,
          qualityMetrics: {
            completionRate: Math.round(completionRate * 100),
            hasMinimumQuestions,
            lowIncompleteRate,
            highQualityRate: Math.round(highQualityRate * 100),
            averageQuality: Math.round(avgQuality * 100),
            validationIssues: validatedQuestions.filter((q: any) => !q.validation.isComplete).map((q: any) => ({
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
