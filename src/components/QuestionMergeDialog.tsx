import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, AlertCircle } from "lucide-react";

interface ExtractedQuestion {
  id: string;
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: string;
  module: string;
  confidence_score: number;
}

interface QuestionMergeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  questions: ExtractedQuestion[];
  onMerge: (mergedQuestion: Partial<ExtractedQuestion>, keepId: string, deleteIds: string[]) => Promise<void>;
}

export function QuestionMergeDialog({ open, onOpenChange, questions, onMerge }: QuestionMergeDialogProps) {
  const [selectedQuestion, setSelectedQuestion] = useState(questions[0]?.id || "");
  const [selectedOptionA, setSelectedOptionA] = useState(questions[0]?.id || "");
  const [selectedOptionB, setSelectedOptionB] = useState(questions[0]?.id || "");
  const [selectedOptionC, setSelectedOptionC] = useState(questions[0]?.id || "");
  const [selectedOptionD, setSelectedOptionD] = useState(questions[0]?.id || "");
  const [selectedCorrectAnswer, setSelectedCorrectAnswer] = useState(questions[0]?.id || "");
  const [merging, setMerging] = useState(false);

  const getConfidenceBadge = (score: number) => {
    if (score >= 0.9) return <Badge variant="default" className="bg-green-500">High ({(score * 100).toFixed(0)}%)</Badge>;
    if (score >= 0.7) return <Badge variant="secondary">Medium ({(score * 100).toFixed(0)}%)</Badge>;
    return <Badge variant="destructive">Low ({(score * 100).toFixed(0)}%)</Badge>;
  };

  const handleMerge = async () => {
    try {
      setMerging(true);

      const selectedQ = questions.find(q => q.id === selectedQuestion);
      const selectedOptA = questions.find(q => q.id === selectedOptionA);
      const selectedOptB = questions.find(q => q.id === selectedOptionB);
      const selectedOptC = questions.find(q => q.id === selectedOptionC);
      const selectedOptD = questions.find(q => q.id === selectedOptionD);
      const selectedCA = questions.find(q => q.id === selectedCorrectAnswer);

      if (!selectedQ || !selectedOptA || !selectedOptB || !selectedOptC || !selectedOptD || !selectedCA) {
        throw new Error("Please select all fields");
      }

      // Calculate new confidence score (average of selected confidence scores)
      const avgConfidence = questions.reduce((sum, q) => sum + q.confidence_score, 0) / questions.length;

      const mergedQuestion: Partial<ExtractedQuestion> = {
        question: selectedQ.question,
        option_a: selectedOptA.option_a,
        option_b: selectedOptB.option_b,
        option_c: selectedOptC.option_c,
        option_d: selectedOptD.option_d,
        correct_answer: selectedCA.correct_answer,
        confidence_score: Math.min(1.0, avgConfidence + 0.1), // Slight boost for manual review
      };

      // Keep the first question's ID, delete the rest
      const keepId = questions[0].id;
      const deleteIds = questions.slice(1).map(q => q.id);

      await onMerge(mergedQuestion, keepId, deleteIds);
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error merging questions:", error);
    } finally {
      setMerging(false);
    }
  };

  if (questions.length < 2) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Merge Similar Questions</DialogTitle>
          <DialogDescription>
            Select the best version for each field. The merged question will be saved and duplicates will be deleted.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Question Text */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Question Text</Label>
            <RadioGroup value={selectedQuestion} onValueChange={setSelectedQuestion}>
              {questions.map((q) => (
                <Card key={q.id} className={selectedQuestion === q.id ? "border-primary" : ""}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <RadioGroupItem value={q.id} id={`question-${q.id}`} className="mt-1" />
                      <div className="flex-1">
                        <label htmlFor={`question-${q.id}`} className="cursor-pointer">
                          <p className="text-sm">{q.question}</p>
                          <div className="mt-2">{getConfidenceBadge(q.confidence_score)}</div>
                        </label>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </RadioGroup>
          </div>

          {/* Option A */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Option A</Label>
            <RadioGroup value={selectedOptionA} onValueChange={setSelectedOptionA}>
              {questions.map((q) => (
                <Card key={q.id} className={selectedOptionA === q.id ? "border-primary" : ""}>
                  <CardContent className="p-3">
                    <div className="flex items-center gap-3">
                      <RadioGroupItem value={q.id} id={`opt-a-${q.id}`} />
                      <label htmlFor={`opt-a-${q.id}`} className="cursor-pointer flex-1 text-sm">
                        {q.option_a}
                      </label>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </RadioGroup>
          </div>

          {/* Option B */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Option B</Label>
            <RadioGroup value={selectedOptionB} onValueChange={setSelectedOptionB}>
              {questions.map((q) => (
                <Card key={q.id} className={selectedOptionB === q.id ? "border-primary" : ""}>
                  <CardContent className="p-3">
                    <div className="flex items-center gap-3">
                      <RadioGroupItem value={q.id} id={`opt-b-${q.id}`} />
                      <label htmlFor={`opt-b-${q.id}`} className="cursor-pointer flex-1 text-sm">
                        {q.option_b}
                      </label>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </RadioGroup>
          </div>

          {/* Option C */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Option C</Label>
            <RadioGroup value={selectedOptionC} onValueChange={setSelectedOptionC}>
              {questions.map((q) => (
                <Card key={q.id} className={selectedOptionC === q.id ? "border-primary" : ""}>
                  <CardContent className="p-3">
                    <div className="flex items-center gap-3">
                      <RadioGroupItem value={q.id} id={`opt-c-${q.id}`} />
                      <label htmlFor={`opt-c-${q.id}`} className="cursor-pointer flex-1 text-sm">
                        {q.option_c}
                      </label>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </RadioGroup>
          </div>

          {/* Option D */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Option D</Label>
            <RadioGroup value={selectedOptionD} onValueChange={setSelectedOptionD}>
              {questions.map((q) => (
                <Card key={q.id} className={selectedOptionD === q.id ? "border-primary" : ""}>
                  <CardContent className="p-3">
                    <div className="flex items-center gap-3">
                      <RadioGroupItem value={q.id} id={`opt-d-${q.id}`} />
                      <label htmlFor={`opt-d-${q.id}`} className="cursor-pointer flex-1 text-sm">
                        {q.option_d}
                      </label>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </RadioGroup>
          </div>

          {/* Correct Answer */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Correct Answer</Label>
            <RadioGroup value={selectedCorrectAnswer} onValueChange={setSelectedCorrectAnswer}>
              {questions.map((q) => (
                <Card key={q.id} className={selectedCorrectAnswer === q.id ? "border-primary" : ""}>
                  <CardContent className="p-3">
                    <div className="flex items-center gap-3">
                      <RadioGroupItem value={q.id} id={`correct-${q.id}`} />
                      <label htmlFor={`correct-${q.id}`} className="cursor-pointer flex-1 text-sm">
                        {q.correct_answer === "unknown" ? (
                          <span className="flex items-center gap-2 text-muted-foreground">
                            <AlertCircle className="h-4 w-4" />
                            Unknown
                          </span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                            {q.correct_answer.toUpperCase()}
                          </span>
                        )}
                      </label>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </RadioGroup>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={merging}>
            Cancel
          </Button>
          <Button onClick={handleMerge} disabled={merging}>
            {merging ? "Merging..." : "Merge Questions"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

