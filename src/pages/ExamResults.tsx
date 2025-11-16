import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Clock, Award, TrendingUp, Loader2, Sparkles, ArrowLeftRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Navigation } from "@/components/Navigation";
import { ExamComparison } from "@/components/ExamComparison";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function ExamResults() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const [exam, setExam] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [generatingFeedback, setGeneratingFeedback] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [comparisonExamId, setComparisonExamId] = useState<string>("");
  const [comparisonExam, setComparisonExam] = useState<any>(null);
  const [availableExams, setAvailableExams] = useState<any[]>([]);

  useEffect(() => {
    loadExam();
    loadAvailableExams();
  }, [examId]);

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
      setLoading(false);
    } catch (error: any) {
      console.error("Error loading exam:", error);
      toast.error("Failed to load results");
      navigate("/dashboard");
    }
  };

  const loadAvailableExams = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("mock_exams")
        .select("id, module, exam_type, score, total_questions, completed_at")
        .eq("user_id", user.id)
        .eq("status", "completed")
        .neq("id", examId)
        .order("completed_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      setAvailableExams(data || []);
    } catch (error) {
      console.error("Error loading available exams:", error);
    }
  };

  const handleCompareExam = async () => {
    if (!comparisonExamId) return;
    
    try {
      const { data, error } = await supabase
        .from("mock_exams")
        .select("*")
        .eq("id", comparisonExamId)
        .single();

      if (error) throw error;
      setComparisonExam(data);
      setShowComparison(true);
    } catch (error) {
      console.error("Error loading comparison exam:", error);
      toast.error("Failed to load comparison exam");
    }
  };

  const handleGenerateFeedback = async () => {
    setGeneratingFeedback(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-study-recommendations", {
        body: { examId }
      });

      if (error) throw error;

      setExam((prev: any) => ({ ...prev, ai_feedback: data.recommendations }));
      toast.success("AI feedback generated!");
    } catch (error: any) {
      console.error("Error generating feedback:", error);
      toast.error("Failed to generate feedback: " + error.message);
    } finally {
      setGeneratingFeedback(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const percentage = Math.round((exam.score / exam.total_questions) * 100);
  const timeSpent = exam.time_spent_seconds;
  const minutes = Math.floor(timeSpent / 60);
  const seconds = timeSpent % 60;

  const performance = exam.question_performance || [];

  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-background p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold text-foreground">Exam Results</h1>
          <p className="text-muted-foreground">Mock Exam - {exam.module}</p>
        </div>

        {/* Score Card */}
        <Card className="border-primary/50">
          <CardHeader className="text-center">
            <CardTitle className="text-6xl font-bold text-primary">{percentage}%</CardTitle>
            <CardDescription className="text-lg">
              {exam.score} out of {exam.total_questions} questions correct
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={percentage} className="h-3" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-green-600">{exam.score}</div>
                <div className="text-sm text-muted-foreground">Correct</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-600">{exam.total_questions - exam.score}</div>
                <div className="text-sm text-muted-foreground">Incorrect</div>
              </div>
              <div>
                <div className="text-2xl font-bold flex items-center justify-center gap-1">
                  <Clock className="w-5 h-5" />
                  {minutes}:{seconds.toString().padStart(2, "0")}
                </div>
                <div className="text-sm text-muted-foreground">Time Taken</div>
              </div>
              <div>
                <Badge variant={exam.exam_type === "strict" ? "destructive" : "secondary"} className="text-sm">
                  {exam.exam_type === "strict" ? "Strict Mode" : exam.exam_type === "standard" ? "Standard Mode" : "Practice Mode"}
                </Badge>
                <div className="text-sm text-muted-foreground mt-1">Exam Type</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* AI Feedback Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              AI-Powered Feedback
            </CardTitle>
            <CardDescription>Personalized insights to improve your performance</CardDescription>
          </CardHeader>
          <CardContent>
            {exam.ai_feedback ? (
              <div className="prose prose-sm max-w-none dark:prose-invert">
                <div className="whitespace-pre-wrap text-foreground">{exam.ai_feedback}</div>
              </div>
            ) : (
              <div className="text-center py-8">
                <Button onClick={handleGenerateFeedback} disabled={generatingFeedback} size="lg">
                  {generatingFeedback ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Analyzing Performance...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Generate AI Feedback
                    </>
                  )}
                </Button>
                <p className="text-sm text-muted-foreground mt-2">
                  Get personalized recommendations and study plan
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Exam Comparison */}
        {availableExams.length > 0 && !showComparison && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowLeftRight className="w-5 w-5" />
                Compare with Previous Exam
              </CardTitle>
              <CardDescription>See how you've improved</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3">
                <Select value={comparisonExamId} onValueChange={setComparisonExamId}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select an exam to compare" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableExams.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.module} - {Math.round((e.score / e.total_questions) * 100)}% ({new Date(e.completed_at).toLocaleDateString()})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={handleCompareExam} disabled={!comparisonExamId}>
                  Compare
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Show Comparison */}
        {showComparison && comparisonExam && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <ArrowLeftRight className="w-5 w-5" />
                  Exam Comparison
                </CardTitle>
                <Button variant="outline" size="sm" onClick={() => setShowComparison(false)}>
                  Hide Comparison
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ExamComparison exam1={comparisonExam} exam2={exam} />
            </CardContent>
          </Card>
        )}

        {/* Question Review */}
        <Card>
          <CardHeader>
            <CardTitle>Question-by-Question Review</CardTitle>
            <CardDescription>Review all questions and your answers</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {performance.map((item: any, index: number) => {
              const question = exam.questions_data[index];
              const isCorrect = item.is_correct;

              return (
                <div key={index} className="space-y-3">
                  <div className="flex items-start gap-3">
                    {isCorrect ? (
                      <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0 mt-1" />
                    ) : (
                      <XCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
                    )}
                    <div className="flex-1">
                      <p className="font-semibold text-lg mb-2">
                        Question {index + 1}: {question.question}
                      </p>
                      <div className="space-y-2">
                        {["A", "B", "C", "D"].map((option) => {
                          const optionKey = `option_${option.toLowerCase()}`;
                          const isUserAnswer = item.user_answer === option;
                          const isCorrectAnswer = item.correct_answer === option;

                          return (
                            <div
                              key={option}
                              className={cn(
                                "p-3 rounded-lg border-2",
                                isCorrectAnswer && "border-green-600 bg-green-50 dark:bg-green-900/20",
                                isUserAnswer && !isCorrectAnswer && "border-red-600 bg-red-50 dark:bg-red-900/20",
                                !isUserAnswer && !isCorrectAnswer && "border-border"
                              )}
                            >
                              <span className="font-semibold mr-2">{option}.</span>
                              {question[optionKey]}
                              {isCorrectAnswer && (
                                <Badge variant="outline" className="ml-2 border-green-600 text-green-600">
                                  Correct Answer
                                </Badge>
                              )}
                              {isUserAnswer && !isCorrectAnswer && (
                                <Badge variant="outline" className="ml-2 border-red-600 text-red-600">
                                  Your Answer
                                </Badge>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  {index < performance.length - 1 && <Separator />}
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button onClick={() => navigate("/exam/setup")} size="lg">
            <TrendingUp className="w-4 h-4 mr-2" />
            Take Another Exam
          </Button>
          <Button variant="outline" onClick={() => navigate("/dashboard")} size="lg">
            Back to Dashboard
          </Button>
        </div>
      </div>
    </div>
    </>
  );
}
