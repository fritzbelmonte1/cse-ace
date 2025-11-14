import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";

const Practice = () => {
  const { moduleId } = useParams();
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [startTime] = useState(Date.now());

  useEffect(() => {
    const fetchQuestions = async () => {
      try {
        const { data, error } = await supabase
          .from('extracted_questions')
          .select('*')
          .eq('module', moduleId)
          .limit(20);

        if (error) throw error;

        if (!data || data.length === 0) {
          toast.error("No questions available for this module yet.");
          navigate("/dashboard");
          return;
        }

        setQuestions(data);
        setAnswers(new Array(data.length).fill(-1));
      } catch (error: any) {
        console.error('Error fetching questions:', error);
        toast.error("Failed to load questions");
        navigate("/dashboard");
      } finally {
        setLoading(false);
      }
    };

    fetchQuestions();
  }, [moduleId, navigate]);

  const handleNext = () => {
    if (selectedAnswer !== null) {
      const newAnswers = [...answers];
      newAnswers[currentIndex] = selectedAnswer;
      setAnswers(newAnswers);
    }

    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setSelectedAnswer(answers[currentIndex + 1] === -1 ? null : answers[currentIndex + 1]);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setSelectedAnswer(answers[currentIndex - 1] === -1 ? null : answers[currentIndex - 1]);
    }
  };

  const handleSubmit = async () => {
    const finalAnswers = [...answers];
    if (selectedAnswer !== null) {
      finalAnswers[currentIndex] = selectedAnswer;
    }

    const score = finalAnswers.reduce((acc, answer, index) => {
      return acc + (answer === questions[index].correct_answer ? 1 : 0);
    }, 0);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        const timeSpentSeconds = Math.floor((Date.now() - startTime) / 1000);
        
        await supabase.from('practice_sessions').insert({
          user_id: user.id,
          module: moduleId!,
          score,
          total_questions: questions.length,
          time_spent_seconds: timeSpentSeconds,
        });

        // Check for new achievements
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            await fetch(
              `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-achievements`,
              {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${session.access_token}`,
                  'Content-Type': 'application/json',
                },
              }
            );
          }
        } catch (error) {
          console.error('Error checking achievements:', error);
        }
      }

      navigate(`/results/${moduleId}`, {
        state: { score, total: questions.length, answers: finalAnswers, questions }
      });
    } catch (error) {
      console.error('Error saving session:', error);
      toast.error("Failed to save your results");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const currentQuestion = questions[currentIndex];
  const options = JSON.parse(currentQuestion.options);
  const progress = ((currentIndex + 1) / questions.length) * 100;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted p-4">
      <div className="container max-w-3xl mx-auto py-8">
        <Button variant="ghost" onClick={() => navigate("/dashboard")} className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>

        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-muted-foreground">
              Question {currentIndex + 1} of {questions.length}
            </span>
            <span className="text-sm font-medium">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{currentQuestion.question_text}</CardTitle>
            <CardDescription>Select the correct answer</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <RadioGroup value={selectedAnswer?.toString()} onValueChange={(val) => setSelectedAnswer(parseInt(val))}>
              {options.map((option: string, index: number) => (
                <div key={index} className="flex items-center space-x-2 p-3 rounded-lg border hover:bg-accent transition-colors">
                  <RadioGroupItem value={index.toString()} id={`option-${index}`} />
                  <Label htmlFor={`option-${index}`} className="flex-1 cursor-pointer">
                    {option}
                  </Label>
                </div>
              ))}
            </RadioGroup>

            <div className="flex justify-between pt-4">
              <Button
                variant="outline"
                onClick={handlePrevious}
                disabled={currentIndex === 0}
              >
                Previous
              </Button>
              
              {currentIndex === questions.length - 1 ? (
                <Button onClick={handleSubmit} disabled={selectedAnswer === null}>
                  Submit Test
                </Button>
              ) : (
                <Button onClick={handleNext}>
                  Next
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Practice;