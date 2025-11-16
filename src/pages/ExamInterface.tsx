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
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { toast } from "sonner";
import { Clock, Flag, Loader2, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { Navigation } from "@/components/Navigation";

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

  // Auto-save with dynamic interval based on exam length
  useEffect(() => {
    if (!exam) return;
    const saveInterval = exam.total_questions >= 200 ? 15000 : 30000; // 15s for long exams, 30s for shorter
    const autoSave = setInterval(() => {
      saveProgress();
    }, saveInterval);
    return () => clearInterval(autoSave);
  }, [exam, answers]); // saveProgress is stable from useCallback

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

  const handlePauseExam = async () => {
    await saveProgress();
    toast.success("Exam paused. You can resume from the dashboard.");
    navigate("/dashboard");
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
  const answeredCount = Object.keys(answers).length;
  const progress = ((answeredCount / questions.length) * 100);
  const isStrictMode = exam.exam_type === "strict";
  
  // Calculate section breaks for long exams (every 50 questions)
  const isLongExam = exam.total_questions >= 200;
  const sectionSize = 50;
  const currentSection = Math.floor(currentQuestionIndex / sectionSize) + 1;
  const isSectionStart = currentQuestionIndex % sectionSize === 0 && currentQuestionIndex > 0;

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
    <>
      <Navigation />
      <div className="min-h-screen bg-background pb-20 sm:pb-0">
        {/* Header */}
        <div className="border-b bg-card sticky top-16 z-10">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
              <h2 className="text-base sm:text-lg font-semibold truncate">
                <span className="hidden sm:inline">Mock Exam - </span>
                {exam.module}
              </h2>
              <span className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap">
                {currentQuestionIndex + 1}/{questions.length}
              </span>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              {exam.exam_type === "practice" && (
                <Button variant="outline" onClick={handlePauseExam} size="sm" className="hidden sm:flex">
                  Pause & Save
                </Button>
              )}
              {exam.exam_type !== "practice" && timeRemaining !== null && (
                <div className={cn("flex items-center gap-1 sm:gap-2 font-mono text-lg sm:text-2xl font-bold", getTimerColor())}>
                  <Clock className="w-4 h-4 sm:w-5 sm:h-5" />
                  {formatTime(timeRemaining)}
                </div>
              )}
            </div>
          </div>
        </div>
        <Progress value={progress} className="h-1" />
      </div>

      <div className="container mx-auto px-4 py-4 sm:py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 sm:gap-6">
          {/* Desktop Question Navigator */}
          <Card className="hidden lg:block lg:col-span-1 h-fit">
            <CardContent className="p-4">
              <h3 className="font-semibold mb-3">Questions</h3>
              {isLongExam && (
                <div className="mb-4 p-2 bg-primary/10 rounded-md">
                  <p className="text-xs font-medium">Section {currentSection} of {Math.ceil(exam.total_questions / sectionSize)}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Questions {(currentSection - 1) * sectionSize + 1}-{Math.min(currentSection * sectionSize, exam.total_questions)}
                  </p>
                </div>
              )}
              <div className="grid grid-cols-5 gap-2">
                {questions.map((_: any, index: number) => {
                  const isNewSection = isLongExam && index % sectionSize === 0 && index > 0;
                  return (
                    <>
                      {isNewSection && (
                        <div className="col-span-5 my-2 border-t pt-2">
                          <p className="text-xs font-medium text-muted-foreground">Section {Math.floor(index / sectionSize) + 1}</p>
                        </div>
                      )}
                      <button
                        key={index}
                        onClick={() => {
                          if (!isStrictMode || index > currentQuestionIndex) {
                            setCurrentQuestionIndex(index);
                          }
                        }}
                        disabled={isStrictMode && index < currentQuestionIndex}
                        className={cn(
                          "aspect-square rounded border-2 text-sm font-semibold transition-colors min-h-[44px]",
                          index === currentQuestionIndex && "ring-2 ring-primary ring-offset-2",
                          answers[index] && "bg-green-100 border-green-600 text-green-900 dark:bg-green-900/20 dark:text-green-100",
                          markedForReview.has(index) && "bg-yellow-100 border-yellow-600 text-yellow-900 dark:bg-yellow-900/20 dark:text-yellow-100",
                          !answers[index] && !markedForReview.has(index) && "border-border hover:bg-accent",
                          isStrictMode && index < currentQuestionIndex && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        {index + 1}
                      </button>
                    </>
                  );
                })}
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
            <CardContent className="p-4 sm:p-6 space-y-4 sm:space-y-6">
              {/* Section Break Banner for Long Exams */}
              {isSectionStart && isLongExam && (
                <Card className="bg-primary/5 border-primary/20 mb-4">
                  <CardContent className="p-4 text-center">
                    <h3 className="font-semibold text-lg">Section {currentSection}</h3>
                    <p className="text-sm text-muted-foreground">
                      Questions {(currentSection - 1) * sectionSize + 1} - {Math.min(currentSection * sectionSize, exam.total_questions)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      You've completed {Math.floor(progress)}% of the exam. Keep going!
                    </p>
                  </CardContent>
                </Card>
              )}
              
              <div>
                <h3 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4">
                  Question {currentQuestionIndex + 1}{isLongExam && ` • Section ${currentSection}`}
                </h3>
                <p className="text-base sm:text-lg leading-relaxed">{currentQuestion.question}</p>
              </div>

              <RadioGroup value={answers[currentQuestionIndex] || ""} onValueChange={handleAnswerChange}>
                <div className="space-y-3">
                  {["option_a", "option_b", "option_c", "option_d"].map((optionKey) => (
                    <div 
                      key={optionKey} 
                      className="flex items-start space-x-3 border rounded-lg p-4 hover:bg-accent transition-colors min-h-[56px] sm:min-h-[48px]"
                    >
                      <RadioGroupItem 
                        value={optionKey.split("_")[1].toUpperCase()} 
                        id={optionKey} 
                        className="mt-1 h-5 w-5 sm:h-4 sm:w-4" 
                      />
                      <Label htmlFor={optionKey} className="flex-1 cursor-pointer text-base sm:text-sm leading-relaxed">
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
                  className="h-5 w-5 sm:h-4 sm:w-4"
                />
                <Label htmlFor="mark-review" className="flex items-center gap-2 cursor-pointer text-base sm:text-sm">
                  <Flag className="w-4 h-4" />
                  Mark for Review
                </Label>
              </div>

              {/* Desktop Navigation */}
              <div className="hidden sm:flex justify-between pt-4">
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

      {/* Mobile Bottom Navigation with Question Navigator */}
      <div className="fixed bottom-0 left-0 right-0 bg-card border-t shadow-lg lg:hidden z-20">
        <div className="container px-4 py-3">
          <div className="flex items-center gap-3 mb-3">
            <Drawer>
              <DrawerTrigger asChild>
                <Button variant="outline" size="sm" className="flex-1">
                  <Menu className="w-4 h-4 mr-2" />
                  Questions ({Object.keys(answers).length}/{questions.length})
                </Button>
              </DrawerTrigger>
              <DrawerContent>
                <DrawerHeader>
                  <DrawerTitle>Question Navigator</DrawerTitle>
                </DrawerHeader>
                <div className="p-4">
                  {isLongExam && (
                    <div className="mb-4 p-2 bg-primary/10 rounded-md">
                      <p className="text-xs font-medium">Section {currentSection} of {Math.ceil(exam.total_questions / sectionSize)}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Questions {(currentSection - 1) * sectionSize + 1}-{Math.min(currentSection * sectionSize, exam.total_questions)}
                      </p>
                    </div>
                  )}
                  <div className="grid grid-cols-6 sm:grid-cols-8 gap-2 mb-4">
                    {questions.map((_: any, index: number) => {
                      const isNewSection = isLongExam && index % sectionSize === 0 && index > 0;
                      return (
                        <>
                          {isNewSection && (
                            <div className="col-span-6 sm:col-span-8 my-2 border-t pt-2">
                              <p className="text-xs font-medium text-muted-foreground">Section {Math.floor(index / sectionSize) + 1}</p>
                            </div>
                          )}
                          <button
                            key={index}
                            onClick={() => {
                              if (!isStrictMode || index > currentQuestionIndex) {
                                setCurrentQuestionIndex(index);
                              }
                            }}
                            disabled={isStrictMode && index < currentQuestionIndex}
                            className={cn(
                              "aspect-square rounded border-2 text-sm font-semibold transition-colors min-h-[44px] min-w-[44px]",
                              index === currentQuestionIndex && "ring-2 ring-primary ring-offset-2",
                              answers[index] && "bg-green-100 border-green-600 text-green-900 dark:bg-green-900/20 dark:text-green-100",
                              markedForReview.has(index) && "bg-yellow-100 border-yellow-600 text-yellow-900 dark:bg-yellow-900/20 dark:text-yellow-100",
                              !answers[index] && !markedForReview.has(index) && "border-border hover:bg-accent",
                              isStrictMode && index < currentQuestionIndex && "opacity-50 cursor-not-allowed"
                            )}
                          >
                            {index + 1}
                          </button>
                        </>
                      );
                    })}
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded border-2 bg-green-100 border-green-600 dark:bg-green-900/20" />
                      <span>Answered</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded border-2 bg-yellow-100 border-yellow-600 dark:bg-yellow-900/20" />
                      <span>Review</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded border-2 border-border" />
                      <span>Not Answered</span>
                    </div>
                  </div>
                </div>
              </DrawerContent>
            </Drawer>
            
            {exam.exam_type === "practice" && (
              <Button variant="outline" size="sm" onClick={handlePauseExam}>
                Pause
              </Button>
            )}
          </div>
          
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setCurrentQuestionIndex(prev => prev - 1)}
              disabled={currentQuestionIndex === 0 || isStrictMode}
              className="flex-1 h-12"
            >
              Previous
            </Button>
            {currentQuestionIndex === questions.length - 1 ? (
              <Button 
                onClick={() => setShowSubmitDialog(true)} 
                className="flex-1 h-12"
              >
                Submit
              </Button>
            ) : (
              <Button 
                onClick={() => setCurrentQuestionIndex(prev => prev + 1)}
                className="flex-1 h-12"
              >
                Next
              </Button>
            )}
          </div>
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
    </>
  );
}
