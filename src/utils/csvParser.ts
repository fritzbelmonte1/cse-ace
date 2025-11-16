export interface ParsedQuestion {
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: string;
  module: string;
  confidence_score: number;
}

export interface ColumnMapping {
  question: number;
  option_a: number;
  option_b: number;
  option_c: number;
  option_d: number;
  correct_answer: number;
  module: number;
}

export function detectColumns(headers: string[]): Partial<ColumnMapping> {
  const mapping: Partial<ColumnMapping> = {};
  
  headers.forEach((header, idx) => {
    const lower = header.toLowerCase().trim();
    
    if (lower.includes('question') || lower === 'q' || lower === 'q.') {
      mapping.question = idx;
    } else if (lower.includes('option') && (lower.includes('a') || lower.includes('1'))) {
      mapping.option_a = idx;
    } else if (lower.includes('option') && (lower.includes('b') || lower.includes('2'))) {
      mapping.option_b = idx;
    } else if (lower.includes('option') && (lower.includes('c') || lower.includes('3'))) {
      mapping.option_c = idx;
    } else if (lower.includes('option') && (lower.includes('d') || lower.includes('4'))) {
      mapping.option_d = idx;
    } else if (lower.includes('correct') || lower.includes('answer') || lower === 'ans') {
      mapping.correct_answer = idx;
    } else if (lower.includes('module') || lower.includes('category') || lower.includes('subject')) {
      mapping.module = idx;
    }
  });
  
  return mapping;
}

export function parseCSV(text: string): string[][] {
  const lines = text.split('\n').filter(line => line.trim());
  return lines.map(line => {
    // Handle quoted fields with commas
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    result.push(current.trim());
    return result;
  });
}

export function validateQuestion(question: ParsedQuestion): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!question.question || question.question.length < 10) {
    errors.push("Question text is too short");
  }
  
  if (!question.option_a || !question.option_b || !question.option_c || !question.option_d) {
    errors.push("All four options are required");
  }
  
  if (!['A', 'B', 'C', 'D'].includes(question.correct_answer?.toUpperCase())) {
    errors.push("Correct answer must be A, B, C, or D");
  }
  
  if (!question.module) {
    errors.push("Module is required");
  }
  
  return { valid: errors.length === 0, errors };
}

export function mapRowToQuestion(row: string[], mapping: ColumnMapping, defaultModule: string): ParsedQuestion | null {
  try {
    const question: ParsedQuestion = {
      question: row[mapping.question]?.replace(/^"|"$/g, '').trim() || '',
      option_a: row[mapping.option_a]?.replace(/^"|"$/g, '').trim() || '',
      option_b: row[mapping.option_b]?.replace(/^"|"$/g, '').trim() || '',
      option_c: row[mapping.option_c]?.replace(/^"|"$/g, '').trim() || '',
      option_d: row[mapping.option_d]?.replace(/^"|"$/g, '').trim() || '',
      correct_answer: row[mapping.correct_answer]?.replace(/^"|"$/g, '').trim().toUpperCase() || '',
      module: row[mapping.module]?.replace(/^"|"$/g, '').trim() || defaultModule,
      confidence_score: 1.0,
    };
    
    const validation = validateQuestion(question);
    if (!validation.valid) {
      console.warn("Invalid question:", validation.errors);
      return null;
    }
    
    return question;
  } catch (error) {
    console.error("Error mapping row:", error);
    return null;
  }
}
