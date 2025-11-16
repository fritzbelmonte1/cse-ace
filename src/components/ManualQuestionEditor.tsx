import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Wand2, Plus } from "lucide-react";

const MODULES = [
  "SE1", "SE2", "SE3", "SE4", "SE5", "SE6", "SE7", "SE8", "SE9",
  "SE10", "SE11", "SE12", "SE13", "SE14", "SE15", "General"
];

interface QuestionForm {
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: string;
  module: string;
}

export const ManualQuestionEditor = () => {
  const { toast } = useToast();
  const [rawText, setRawText] = useState("");
  const [isConverting, setIsConverting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [questionForm, setQuestionForm] = useState<QuestionForm>({
    question: "",
    option_a: "",
    option_b: "",
    option_c: "",
    option_d: "",
    correct_answer: "A",
    module: "General"
  });

  const convertTextToQuestion = async () => {
    if (!rawText.trim()) {
      toast({
        title: "Error",
        description: "Please enter some text to convert",
        variant: "destructive"
      });
      return;
    }

    setIsConverting(true);
    try {
      const { data, error } = await supabase.functions.invoke('parse-questions-ai', {
        body: {
          content: rawText,
          module: questionForm.module,
          mode: 'single'
        }
      });

      if (error) throw error;

      if (data.questions && data.questions.length > 0) {
        const q = data.questions[0];
        setQuestionForm({
          question: q.question,
          option_a: q.option_a,
          option_b: q.option_b,
          option_c: q.option_c,
          option_d: q.option_d,
          correct_answer: q.correct_answer,
          module: questionForm.module
        });
        toast({
          title: "Success",
          description: "Question generated! Review and adjust before saving."
        });
      } else {
        toast({
          title: "No Question Generated",
          description: "Try providing more context or reformatting the text",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error converting text:', error);
      toast({
        title: "Conversion Failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsConverting(false);
    }
  };

  const submitQuestion = async () => {
    if (!questionForm.question || !questionForm.option_a || !questionForm.option_b || 
        !questionForm.option_c || !questionForm.option_d) {
      toast({
        title: "Incomplete Question",
        description: "Please fill in all fields",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Create a temporary document entry
      const { data: doc, error: docError } = await supabase
        .from('documents')
        .insert({
          file_name: 'Manual Entry',
          file_path: 'manual',
          purpose: 'question_bank',
          module: questionForm.module,
          processed: true
        })
        .select()
        .single();

      if (docError) throw docError;

      const { error: questionError } = await supabase
        .from('extracted_questions')
        .insert({
          ...questionForm,
          document_id: doc.id,
          confidence_score: 1.0,
          status: 'approved',
          approved_by: user?.id,
          approved_at: new Date().toISOString()
        });

      if (questionError) throw questionError;

      toast({
        title: "Success",
        description: "Question added to the question bank"
      });

      // Reset form
      setQuestionForm({
        question: "",
        option_a: "",
        option_b: "",
        option_c: "",
        option_d: "",
        correct_answer: "A",
        module: "General"
      });
      setRawText("");

    } catch (error) {
      console.error('Error submitting question:', error);
      toast({
        title: "Submission Failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="text-xl font-bold mb-4">AI-Assisted Question Creator</h3>
        
        <div className="space-y-4">
          <div>
            <Label>Module</Label>
            <Select value={questionForm.module} onValueChange={(val) => setQuestionForm({...questionForm, module: val})}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODULES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Paste Text / Notes / Content</Label>
            <Textarea
              placeholder="Paste any text, lecture notes, or content. AI will convert it to a multiple-choice question..."
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              rows={6}
              className="font-mono text-sm"
            />
          </div>

          <Button onClick={convertTextToQuestion} disabled={isConverting} className="w-full">
            {isConverting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
            Convert to Question with AI
          </Button>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-xl font-bold mb-4">Question Editor</h3>
        
        <div className="space-y-4">
          <div>
            <Label>Question</Label>
            <Textarea
              value={questionForm.question}
              onChange={(e) => setQuestionForm({...questionForm, question: e.target.value})}
              placeholder="Enter the question..."
              rows={3}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Option A</Label>
              <Input
                value={questionForm.option_a}
                onChange={(e) => setQuestionForm({...questionForm, option_a: e.target.value})}
                placeholder="First option"
              />
            </div>
            <div>
              <Label>Option B</Label>
              <Input
                value={questionForm.option_b}
                onChange={(e) => setQuestionForm({...questionForm, option_b: e.target.value})}
                placeholder="Second option"
              />
            </div>
            <div>
              <Label>Option C</Label>
              <Input
                value={questionForm.option_c}
                onChange={(e) => setQuestionForm({...questionForm, option_c: e.target.value})}
                placeholder="Third option"
              />
            </div>
            <div>
              <Label>Option D</Label>
              <Input
                value={questionForm.option_d}
                onChange={(e) => setQuestionForm({...questionForm, option_d: e.target.value})}
                placeholder="Fourth option"
              />
            </div>
          </div>

          <div>
            <Label>Correct Answer</Label>
            <Select value={questionForm.correct_answer} onValueChange={(val) => setQuestionForm({...questionForm, correct_answer: val})}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="A">A</SelectItem>
                <SelectItem value="B">B</SelectItem>
                <SelectItem value="C">C</SelectItem>
                <SelectItem value="D">D</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button onClick={submitQuestion} disabled={isSubmitting} className="w-full">
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Add Question to Bank
          </Button>
        </div>
      </Card>
    </div>
  );
};
