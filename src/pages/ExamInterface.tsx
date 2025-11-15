import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Clock, Flag, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ExamInterface() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const [exam, setExam] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [markedForReview, setMarkedForReview] = useState<Set<number>>(new Set());
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadExam();
  }, [examId]);

  useEffect(() => {
    if (!exam || exam.exam_type === "practice" || !exam.time_limit_minutes) return;

    const endTime = new Date(exam.started_at).getTime() + exam.time_limit_minutes * 60 * 1000;
    const timer = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((endTime - now) / 1000));
      setTimeRemaining(remaining);

      if (remaining === 0) {
        handleSubmitExam(true);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [exam]);

  // Auto-save every 30 seconds
  useEffect(() => {
    if (!exam) return;
    const autoSave = setInterval(() => {
      saveProgress();
    }, 30000);
    return () => clearInterval(autoSave);
  }, [exam, answers]);

  // Prevent accidental navigation
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (exam && exam.status === "in_progress") {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [exam]);

  const loadExam = async () => {
    try {
      const { data, error } = await supabase
        .from("mock_exams")
        .select("*")
        .eq("id", examId)
        .single();

      if (error) throw error;
      if (!data) {
        toast.error("Exam not found");
        navigate("/dashboard");
        return;
      }

      setExam(data);
      const loadedAnswers = data.answers as Record<number, string> || {};
      setAnswers(loadedAnswers);
      setLoading(false);
    } catch (error: any) {
      console.error("Error loading exam:", error);
      toast.error("Failed to load exam");
      navigate("/dashboard");
    }
  };

  const saveProgress = useCallback(async () => {
    if (!exam) return;
    await supabase
      .from("mock_exams")
      .update({ answers })
      .eq("id", examId);
  }, [exam, examId, answers]);

  const handleAnswerChange = (value: string) => {
    setAnswers(prev => ({ ...prev, [currentQuestionIndex]: value }));
  };

  const handleMarkForReview = (checked: boolean) => {
    setMarkedForReview(prev => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(currentQuestionIndex);
      } else {
        newSet.delete(currentQuestionIndex);
      }
      return newSet;
    });
  };

  const handleSubmitExam = async (autoSubmit = false) => {
    setSubmitting(true);
    try {
      const questions = exam.questions_data;
      let score = 0;
      const performance: any[] = [];

      questions.forEach((q: any, index: number) => {
        const userAnswer = answers[index];
        const isCorrect = userAnswer === q.correct_answer;
        if (isCorrect) score++;

        performance.push({
          question_id: q.id,
          question: q.question,
          user_answer: userAnswer || null,
          correct_answer: q.correct_answer,
          is_correct: isCorrect,
          time_spent: null
        });
      });

      const timeSpent = exam.time_limit_minutes 
        ? exam.time_limit_minutes * 60 - (timeRemaining || 0)
        : Math.floor((Date.now() - new Date(exam.started_at).getTime()) / 1000);

      await supabase
        .from("mock_exams")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          score,
          time_spent_seconds: timeSpent,
          question_performance: performance
        })
        .eq("id", examId);

      toast.success(autoSubmit ? "Time's up! Exam auto-submitted." : "Exam submitted successfully!");
      navigate(`/exam/${examId}/results`);
    } catch (error: any) {
      console.error("Error submitting exam:", error);
      toast.error("Failed to submit exam");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const questions = exam.questions_data;
  const currentQuestion = questions[currentQuestionIndex];
  const progress = ((Object.keys(answers).length / questions.length) * 100);
  const isStrictMode = exam.exam_type === "strict";

  const getTimerColor = () => {
    if (!timeRemaining || exam.exam_type === "practice") return "text-foreground";
    const percentRemaining = (timeRemaining / (exam.time_limit_minutes * 60)) * 100;
    if (percentRemaining > 50) return "text-green-600";
    if (percentRemaining > 25) return "text-yellow-600";
    if (percentRemaining > 10) return "text-orange-600";
    return "text-red-600";
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold">Mock Exam - {exam.module}</h2>
            <span className="text-sm text-muted-foreground">
              Question {currentQuestionIndex + 1} of {questions.length}
            </span>
          </div>
          {exam.exam_type !== "practice" && timeRemaining !== null && (
            <div className={cn("flex items-center gap-2 font-mono text-2xl font-bold", getTimerColor())}>
              <Clock className="w-5 h-5" />
              {formatTime(timeRemaining)}
            </div>
          )}
        </div>
        <Progress value={progress} className="h-1" />
      </div>

      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Question Navigator */}
          <Card className="lg:col-span-1 h-fit">
            <CardContent className="p-4">
              <h3 className="font-semibold mb-3">Questions</h3>
              <div className="grid grid-cols-5 gap-2">
                {questions.map((_: any, index: number) => (
                  <button
                    key={index}
                    onClick={() => {
                      if (!isStrictMode || index > currentQuestionIndex) {
                        setCurrentQuestionIndex(index);
                      }
                    }}
                    disabled={isStrictMode && index < currentQuestionIndex}
                    className={cn(
                      "aspect-square rounded border-2 text-sm font-semibold transition-colors",
                      index === currentQuestionIndex && "ring-2 ring-primary ring-offset-2",
                      answers[index] && "bg-green-100 border-green-600 text-green-900 dark:bg-green-900/20 dark:text-green-100",
                      markedForReview.has(index) && "bg-yellow-100 border-yellow-600 text-yellow-900 dark:bg-yellow-900/20 dark:text-yellow-100",
                      !answers[index] && !markedForReview.has(index) && "border-border hover:bg-accent",
                      isStrictMode && index < currentQuestionIndex && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    {index + 1}
                  </button>
                ))}
              </div>
              <div className="mt-4 space-y-2 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded border-2 bg-green-100 border-green-600 dark:bg-green-900/20" />
                  <span>Answered</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded border-2 bg-yellow-100 border-yellow-600 dark:bg-yellow-900/20" />
                  <span>Review</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded border-2 border-border" />
                  <span>Not Answered</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Question Area */}
          <Card className="lg:col-span-3">
            <CardContent className="p-6 space-y-6">
              <div>
                <h3 className="text-xl font-semibold mb-4">
                  Question {currentQuestionIndex + 1}
                </h3>
                <p className="text-lg">{currentQuestion.question}</p>
              </div>

              <RadioGroup value={answers[currentQuestionIndex] || ""} onValueChange={handleAnswerChange}>
                <div className="space-y-3">
                  {["option_a", "option_b", "option_c", "option_d"].map((optionKey) => (
                    <div key={optionKey} className="flex items-start space-x-3 border rounded-lg p-4 hover:bg-accent transition-colors">
                      <RadioGroupItem value={optionKey.split("_")[1].toUpperCase()} id={optionKey} className="mt-1" />
                      <Label htmlFor={optionKey} className="flex-1 cursor-pointer">
                        <span className="font-semibold mr-2">{optionKey.split("_")[1].toUpperCase()}.</span>
                        {currentQuestion[optionKey]}
                      </Label>
                    </div>
                  ))}
                </div>
              </RadioGroup>

              <div className="flex items-center space-x-2 pt-4 border-t">
                <Checkbox
                  id="mark-review"
                  checked={markedForReview.has(currentQuestionIndex)}
                  onCheckedChange={handleMarkForReview}
                />
                <Label htmlFor="mark-review" className="flex items-center gap-2 cursor-pointer">
                  <Flag className="w-4 h-4" />
                  Mark for Review
                </Label>
              </div>

              <div className="flex justify-between pt-4">
                <Button
                  variant="outline"
                  onClick={() => setCurrentQuestionIndex(prev => prev - 1)}
                  disabled={currentQuestionIndex === 0 || isStrictMode}
                >
                  Previous
                </Button>
                <div className="flex gap-2">
                  {currentQuestionIndex === questions.length - 1 ? (
                    <Button onClick={() => setShowSubmitDialog(true)} size="lg">
                      Submit Exam
                    </Button>
                  ) : (
                    <Button onClick={() => setCurrentQuestionIndex(prev => prev + 1)}>
                      Next
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <AlertDialog open={showSubmitDialog} onOpenChange={setShowSubmitDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit Exam?</AlertDialogTitle>
            <AlertDialogDescription>
              You have answered {Object.keys(answers).length} out of {questions.length} questions.
              {Object.keys(answers).length < questions.length && " Unanswered questions will be marked as incorrect."}
              <br /><br />
              Are you sure you want to submit?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Review Answers</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleSubmitExam(false)} disabled={submitting}>
              {submitting ? "Submitting..." : "Submit Exam"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
