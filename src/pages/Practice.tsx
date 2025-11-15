import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Loader2, Lightbulb } from "lucide-react";
import { toast } from "sonner";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const Practice = () => {
  const { moduleId } = useParams();
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [startTime] = useState(Date.now());
  const [explanation, setExplanation] = useState<string | null>(null);
  const [loadingExplanation, setLoadingExplanation] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const [explanationCache, setExplanationCache] = useState<Record<number, string>>({});

  useEffect(() => {
    const fetchQuestions = async () => {
      try {
        const { data, error } = await supabase
          .from('extracted_questions')
          .select('*')
          .eq('module', moduleId)
          .limit(100);

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
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      setSelectedAnswer(answers[nextIndex] === -1 ? null : answers[nextIndex]);
      
      // Load cached explanation if available
      if (explanationCache[nextIndex]) {
        setExplanation(explanationCache[nextIndex]);
        setShowExplanation(true);
      } else {
        setExplanation(null);
        setShowExplanation(false);
      }
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      const prevIndex = currentIndex - 1;
      setCurrentIndex(prevIndex);
      setSelectedAnswer(answers[prevIndex] === -1 ? null : answers[prevIndex]);
      
      // Load cached explanation if available
      if (explanationCache[prevIndex]) {
        setExplanation(explanationCache[prevIndex]);
        setShowExplanation(true);
      } else {
        setExplanation(null);
        setShowExplanation(false);
      }
    }
  };

  const handleSubmit = async () => {
    const finalAnswers = [...answers];
    if (selectedAnswer !== null) {
      finalAnswers[currentIndex] = selectedAnswer;
    }

    const score = finalAnswers.reduce((acc, answer, index) => {
      const correctAnswerIndex = ['A', 'B', 'C', 'D'].indexOf(questions[index].correct_answer);
      return acc + (answer === correctAnswerIndex ? 1 : 0);
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

  const handleExplain = async () => {
    // Check cache first
    if (explanationCache[currentIndex]) {
      setExplanation(explanationCache[currentIndex]);
      setShowExplanation(true);
      return;
    }

    setLoadingExplanation(true);
    setShowExplanation(true);

    try {
      const currentQuestion = questions[currentIndex];
      const options = {
        A: currentQuestion.option_a,
        B: currentQuestion.option_b,
        C: currentQuestion.option_c,
        D: currentQuestion.option_d,
      };

      const correctAnswerLetter = currentQuestion.correct_answer;
      const userAnswerLetter = selectedAnswer !== null ? ['A', 'B', 'C', 'D'][selectedAnswer] : undefined;

      const { data, error } = await supabase.functions.invoke('explain-question', {
        body: {
          question: currentQuestion.question,
          options,
          correctAnswer: correctAnswerLetter,
          userAnswer: userAnswerLetter,
        }
      });

      if (error) throw error;

      if (data.error) {
        if (data.error.includes("Rate limits")) {
          toast.error("Too many requests. Please wait a moment and try again.");
        } else if (data.error.includes("Payment required")) {
          toast.error("AI explanation service temporarily unavailable.");
        } else {
          toast.error("Failed to generate explanation.");
        }
        setShowExplanation(false);
        return;
      }

      setExplanation(data.explanation);
      // Cache the explanation
      setExplanationCache(prev => ({
        ...prev,
        [currentIndex]: data.explanation
      }));
    } catch (error) {
      console.error('Error getting explanation:', error);
      toast.error("Failed to generate explanation. Please try again.");
      setShowExplanation(false);
    } finally {
      setLoadingExplanation(false);
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
  const options = [
    currentQuestion.option_a,
    currentQuestion.option_b,
    currentQuestion.option_c,
    currentQuestion.option_d,
  ];
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
            <CardTitle className="text-xl">{currentQuestion.question}</CardTitle>
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

            <div className="mt-4">
              <Button 
                variant="outline" 
                onClick={handleExplain}
                disabled={loadingExplanation}
                className="w-full"
              >
                {loadingExplanation ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating explanation...
                  </>
                ) : (
                  <>
                    <Lightbulb className="mr-2 h-4 w-4" />
                    Explain Answer
                  </>
                )}
              </Button>

              {showExplanation && explanation && (
                <Collapsible open={showExplanation} onOpenChange={setShowExplanation} className="mt-4">
                  <Card className="bg-muted/50">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Lightbulb className="h-4 w-4 text-primary" />
                        Explanation
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{explanation}</p>
                    </CardContent>
                  </Card>
                </Collapsible>
              )}
            </div>

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