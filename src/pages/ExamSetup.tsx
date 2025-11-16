import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { Clock, Target, Zap, AlertCircle, CheckCircle2 } from "lucide-react";
import { Navigation } from "@/components/Navigation";

const modules = [
  { id: "all", name: "Full CSE Mock Exam (All Modules)" },
  { id: "vocabulary", name: "Vocabulary" },
  { id: "numerical", name: "Numerical Ability" },
  { id: "reasoning", name: "Logical Reasoning" },
  { id: "general", name: "General Knowledge" }
];

const examTypes = [
  { id: "standard", name: "Standard Mode", icon: Target, description: "Timed exam, can review and change answers" },
  { id: "strict", name: "Strict Mode", icon: Zap, description: "Timed exam, no going back to previous questions" },
  { id: "practice", name: "Practice Mode", icon: Clock, description: "Untimed, relaxed conditions for learning" }
];

const timeLimits = [
  { minutes: 30, questions: 20, label: "Quick Test - 30 mins (20 questions)" },
  { minutes: 60, questions: 40, label: "Full Module - 60 mins (40 questions)" },
  { minutes: 90, questions: 60, label: "Comprehensive - 90 mins (60 questions)" },
  { minutes: 300, questions: 300, label: "Full CSE Mock Exam - 5 hours (300 questions)" }
];

export default function ExamSetup() {
  const navigate = useNavigate();
  const [module, setModule] = useState("all");
  const [examType, setExamType] = useState("standard");
  const [timeLimitIndex, setTimeLimitIndex] = useState(1);
  const [loading, setLoading] = useState(false);
  const [questionStats, setQuestionStats] = useState<{
    total: number;
    byModule: Record<string, number>;
  }>({
    total: 0,
    byModule: {}
  });

  const selectedTimeLimit = timeLimits[timeLimitIndex];

  useEffect(() => {
    loadQuestionStats();
  }, []);

  const loadQuestionStats = async () => {
    try {
      // Get total approved questions
      const { count: totalCount } = await supabase
        .from("extracted_questions")
        .select("*", { count: 'exact', head: true })
        .eq("status", "approved");

      // Get count by module
      const moduleStats: Record<string, number> = {};
      for (const mod of modules.filter(m => m.id !== "all")) {
        const { count } = await supabase
          .from("extracted_questions")
          .select("*", { count: 'exact', head: true })
          .eq("status", "approved")
          .eq("module", mod.id);
        moduleStats[mod.id] = count || 0;
      }

      setQuestionStats({
        total: totalCount || 0,
        byModule: moduleStats
      });
    } catch (error) {
      console.error("Error loading question stats:", error);
    }
  };

  const handleStartExam = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Please log in to start an exam");
        navigate("/auth");
        return;
      }

      // Check available questions first
      const availableQuestions = module === "all" ? questionStats.total : questionStats.byModule[module] || 0;
      
      if (availableQuestions < selectedTimeLimit.questions) {
        toast.error("Insufficient questions available", {
          description: `Need ${selectedTimeLimit.questions} questions but only ${availableQuestions} approved questions available. Please upload more documents or contact an admin.`
        });
        setLoading(false);
        return;
      }

      let shuffledQuestions;

      // Smart distribution for 300-question "all modules" exam
      if (module === "all" && selectedTimeLimit.questions === 300) {
        const moduleDistribution = {
          numerical: 100,
          vocabulary: 75,
          reasoning: 75,
          general: 50
        };

        const questionsByModule = await Promise.all(
          Object.entries(moduleDistribution).map(async ([mod, count]) => {
            const { data } = await supabase
              .from("extracted_questions")
              .select("*")
              .eq("status", "approved")
              .eq("module", mod)
              .limit(count);
            return data || [];
          })
        );

        const allQuestions = questionsByModule.flat();
        shuffledQuestions = allQuestions.sort(() => Math.random() - 0.5);

        console.log(`Fetched ${shuffledQuestions.length} questions with smart distribution for full CSE exam`);
      } else {
        // Standard fetch for other exam types
        let query = supabase
          .from("extracted_questions")
          .select("*")
          .eq("status", "approved")
          .limit(selectedTimeLimit.questions);

        if (module !== "all") {
          query = query.eq("module", module);
        }

        const { data: questions, error: questionsError } = await query;

        if (questionsError) throw questionsError;
        
        console.log(`Fetched ${questions?.length || 0} approved questions for exam (module: ${module})`);
        
        if (!questions || questions.length === 0) {
          toast.error("No approved questions available for this module", {
            description: "Please contact an admin to add questions for this module."
          });
          setLoading(false);
          return;
        }

        shuffledQuestions = questions.sort(() => Math.random() - 0.5);
      }

      // Create exam record
      const { data: exam, error: examError } = await supabase
        .from("mock_exams")
        .insert({
          user_id: user.id,
          exam_type: examType,
          module: module,
          time_limit_minutes: examType === "practice" ? null : selectedTimeLimit.minutes,
          total_questions: shuffledQuestions.length,
          questions_data: shuffledQuestions,
          status: "in_progress"
        })
        .select()
        .single();

      if (examError) throw examError;

      toast.success("Exam started! Good luck!");
      navigate(`/exam/${exam.id}`);
    } catch (error: any) {
      console.error("Error starting exam:", error);
      toast.error("Failed to start exam: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold text-foreground">Mock Exam Setup</h1>
          <p className="text-muted-foreground">Configure your exam and test your knowledge under realistic conditions</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Exam Configuration</CardTitle>
            <CardDescription>Select your preferences for the mock exam</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Question Availability Card */}
            <Card className="bg-muted/50">
              <CardHeader>
                <CardTitle className="text-base">Question Availability</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm">Total Approved Questions:</span>
                  <Badge variant={questionStats.total >= 300 ? "default" : "secondary"}>
                    {questionStats.total}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Required for Selected Exam:</span>
                  <Badge variant="outline">{examType === "practice" ? 20 : selectedTimeLimit.questions}</Badge>
                </div>
                {module !== "all" && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Available in {modules.find(m => m.id === module)?.name}:</span>
                    <Badge variant={questionStats.byModule[module] >= (examType === "practice" ? 20 : selectedTimeLimit.questions) ? "default" : "destructive"}>
                      {questionStats.byModule[module] || 0}
                    </Badge>
                  </div>
                )}
                {((module === "all" && questionStats.total < (examType === "practice" ? 20 : selectedTimeLimit.questions)) ||
                  (module !== "all" && (questionStats.byModule[module] || 0) < (examType === "practice" ? 20 : selectedTimeLimit.questions))) && (
                  <Alert variant="destructive" className="mt-2">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      {module === "all" 
                        ? `Need ${(examType === "practice" ? 20 : selectedTimeLimit.questions) - questionStats.total} more approved questions`
                        : `Need ${(examType === "practice" ? 20 : selectedTimeLimit.questions) - (questionStats.byModule[module] || 0)} more questions in ${modules.find(m => m.id === module)?.name}`
                      }
                    </AlertDescription>
                  </Alert>
                )}
                {((module === "all" && questionStats.total >= (examType === "practice" ? 20 : selectedTimeLimit.questions)) ||
                  (module !== "all" && (questionStats.byModule[module] || 0) >= (examType === "practice" ? 20 : selectedTimeLimit.questions))) && (
                  <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Sufficient questions available</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Module Selection */}
            <div className="space-y-2">
              <Label htmlFor="module">Select Module</Label>
              <Select value={module} onValueChange={setModule}>
                <SelectTrigger id="module">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {modules.map((mod) => (
                    <SelectItem key={mod.id} value={mod.id}>
                      {mod.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Exam Type */}
            <div className="space-y-3">
              <Label>Exam Type</Label>
              <RadioGroup value={examType} onValueChange={setExamType}>
                {examTypes.map((type) => {
                  const Icon = type.icon;
                  return (
                    <div key={type.id} className="flex items-start space-x-3 border rounded-lg p-4 hover:bg-accent transition-colors">
                      <RadioGroupItem value={type.id} id={type.id} className="mt-1" />
                      <div className="flex-1">
                        <Label htmlFor={type.id} className="flex items-center gap-2 font-semibold cursor-pointer">
                          <Icon className="w-4 h-4" />
                          {type.name}
                        </Label>
                        <p className="text-sm text-muted-foreground mt-1">{type.description}</p>
                      </div>
                    </div>
                  );
                })}
              </RadioGroup>
            </div>

            {/* Time Limit (hidden for practice mode) */}
            {examType !== "practice" && (
              <div className="space-y-2">
                <Label htmlFor="time-limit">Time Limit</Label>
                <Select value={timeLimitIndex.toString()} onValueChange={(val) => setTimeLimitIndex(parseInt(val))}>
                  <SelectTrigger id="time-limit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {timeLimits.map((limit, index) => (
                      <SelectItem key={index} value={index.toString()}>
                        {limit.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Exam Preview */}
            <Card className="bg-muted/50">
              <CardHeader>
                <CardTitle className="text-lg">Exam Preview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Questions:</span>
                  <span className="font-semibold">{examType === "practice" ? "20" : selectedTimeLimit.questions}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Time Limit:</span>
                  <span className="font-semibold">{examType === "practice" ? "Unlimited" : `${selectedTimeLimit.minutes} minutes`}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Mode:</span>
                  <span className="font-semibold">{examTypes.find(t => t.id === examType)?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Est. Time/Question:</span>
                  <span className="font-semibold">
                    {examType === "practice" ? "No limit" : `~${Math.round(selectedTimeLimit.minutes / selectedTimeLimit.questions * 60)}s`}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Button onClick={handleStartExam} disabled={loading} className="w-full" size="lg">
              {loading ? "Starting Exam..." : "Start Mock Exam"}
            </Button>
          </CardContent>
        </Card>

        <div className="text-center">
          <Button variant="ghost" onClick={() => navigate("/dashboard")}>
            Back to Dashboard
          </Button>
        </div>
      </div>
    </div>
    </>
  );
}
