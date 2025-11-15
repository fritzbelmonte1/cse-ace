import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Clock, Target, Zap } from "lucide-react";

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
  { minutes: 90, questions: 60, label: "Comprehensive - 90 mins (60 questions)" }
];

export default function ExamSetup() {
  const navigate = useNavigate();
  const [module, setModule] = useState("all");
  const [examType, setExamType] = useState("standard");
  const [timeLimitIndex, setTimeLimitIndex] = useState(1);
  const [loading, setLoading] = useState(false);

  const selectedTimeLimit = timeLimits[timeLimitIndex];

  const handleStartExam = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Please log in to start an exam");
        navigate("/auth");
        return;
      }

      // Fetch questions for the exam
      let query = supabase
        .from("extracted_questions")
        .select("*")
        .limit(selectedTimeLimit.questions);

      if (module !== "all") {
        query = query.eq("module", module);
      }

      const { data: questions, error: questionsError } = await query;

      if (questionsError) throw questionsError;
      if (!questions || questions.length === 0) {
        toast.error("No questions available for this module");
        setLoading(false);
        return;
      }

      // Shuffle questions
      const shuffledQuestions = questions.sort(() => Math.random() - 0.5);

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
  );
}
