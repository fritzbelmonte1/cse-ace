import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, CheckCircle } from "lucide-react";
import { ParsedQuestion } from "@/utils/csvParser";

interface QuestionImportPreviewProps {
  questions: ParsedQuestion[];
  duplicates: Set<number>;
  onToggleQuestion?: (index: number) => void;
  selectedIndices?: Set<number>;
}

const modules = [
  { id: "vocabulary", name: "Vocabulary" },
  { id: "grammar", name: "Grammar" },
  { id: "reading", name: "Reading Comprehension" },
  { id: "numerical", name: "Numerical Ability" },
  { id: "logical", name: "Logical Reasoning" },
];

export function QuestionImportPreview({ 
  questions, 
  duplicates, 
  onToggleQuestion,
  selectedIndices 
}: QuestionImportPreviewProps) {
  const displayQuestions = questions.slice(0, 50);
  const hasMore = questions.length > 50;
  
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <span className="text-sm font-medium">
              {questions.length - duplicates.size} Valid
            </span>
          </div>
          {duplicates.size > 0 && (
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span className="text-sm font-medium text-destructive">
                {duplicates.size} Duplicates
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-2">
        {displayQuestions.map((question, idx) => {
          const isDuplicate = duplicates.has(idx);
          const isSelected = selectedIndices?.has(idx) ?? true;
          
          return (
            <Card 
              key={idx} 
              className={isDuplicate ? "border-destructive bg-destructive/5" : ""}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start gap-3">
                  {onToggleQuestion && (
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => onToggleQuestion(idx)}
                      className="mt-1"
                    />
                  )}
                  <div className="flex-1 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-sm font-medium leading-tight flex-1">
                        {idx + 1}. {question.question}
                      </CardTitle>
                      {isDuplicate && (
                        <Badge variant="destructive" className="text-xs shrink-0">
                          Duplicate
                        </Badge>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex items-start gap-1">
                        <span className={question.correct_answer === 'A' ? 'font-bold text-green-600' : ''}>
                          A.
                        </span>
                        <span className={question.correct_answer === 'A' ? 'font-bold' : ''}>
                          {question.option_a}
                        </span>
                      </div>
                      <div className="flex items-start gap-1">
                        <span className={question.correct_answer === 'B' ? 'font-bold text-green-600' : ''}>
                          B.
                        </span>
                        <span className={question.correct_answer === 'B' ? 'font-bold' : ''}>
                          {question.option_b}
                        </span>
                      </div>
                      <div className="flex items-start gap-1">
                        <span className={question.correct_answer === 'C' ? 'font-bold text-green-600' : ''}>
                          C.
                        </span>
                        <span className={question.correct_answer === 'C' ? 'font-bold' : ''}>
                          {question.option_c}
                        </span>
                      </div>
                      <div className="flex items-start gap-1">
                        <span className={question.correct_answer === 'D' ? 'font-bold text-green-600' : ''}>
                          D.
                        </span>
                        <span className={question.correct_answer === 'D' ? 'font-bold' : ''}>
                          {question.option_d}
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        {modules.find(m => m.id === question.module)?.name || question.module}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        Correct: {question.correct_answer}
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardHeader>
            </Card>
          );
        })}
        
        {hasMore && (
          <Card className="bg-muted/50">
            <CardContent className="py-4 text-center text-sm text-muted-foreground">
              ... and {questions.length - 50} more questions
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
