import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Sparkles, Target, Clock, TrendingUp } from "lucide-react";
import { toast } from "sonner";

export function SmartExamSuggestions() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [suggestion, setSuggestion] = useState<any>(null);

  useEffect(() => {
    generateSuggestion();
  }, []);

  const generateSuggestion = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch recent completed exams
      const { data: exams } = await supabase
        .from("mock_exams")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(10);

      if (!exams || exams.length === 0) {
        setSuggestion({
          module: "vocabulary",
          reason: "Start with Vocabulary to build your foundation",
          length: 25,
          type: "standard",
          confidence: 60
        });
        setLoading(false);
        return;
      }

      // Calculate module performance
      const moduleStats: Record<string, { total: number; correct: number; lastTaken: Date | null }> = {};
      
      exams.forEach(exam => {
        if (!moduleStats[exam.module]) {
          moduleStats[exam.module] = { total: 0, correct: 0, lastTaken: null };
        }
        moduleStats[exam.module].total += exam.total_questions;
        moduleStats[exam.module].correct += exam.score;
        
        const examDate = new Date(exam.completed_at);
        if (!moduleStats[exam.module].lastTaken || examDate > moduleStats[exam.module].lastTaken) {
          moduleStats[exam.module].lastTaken = examDate;
        }
      });

      // Find weakest module
      let weakestModule = "";
      let lowestScore = 100;
      let oldestModule = "";
      let oldestDate = new Date();

      Object.entries(moduleStats).forEach(([module, stats]) => {
        const percentage = (stats.correct / stats.total) * 100;
        if (percentage < lowestScore) {
          lowestScore = percentage;
          weakestModule = module;
        }
        
        if (stats.lastTaken && stats.lastTaken < oldestDate) {
          oldestDate = stats.lastTaken;
          oldestModule = module;
        }
      });

      // Check if weakest module needs practice or if we should rotate
      const daysSinceOldest = Math.floor((Date.now() - oldestDate.getTime()) / (1000 * 60 * 60 * 24));
      const targetModule = daysSinceOldest > 7 ? oldestModule : weakestModule;

      // Determine exam length based on confidence
      const avgScore = exams.slice(0, 5).reduce((acc, e) => acc + (e.score / e.total_questions * 100), 0) / Math.min(5, exams.length);
      const length = avgScore > 70 ? 50 : avgScore > 50 ? 35 : 25;

      // Determine exam type
      const recentScores = exams.slice(0, 3).map(e => (e.score / e.total_questions * 100));
      const consistentlyHigh = recentScores.every(s => s > 75);
      const type = consistentlyHigh ? "strict" : "standard";

      setSuggestion({
        module: targetModule,
        reason: daysSinceOldest > 7 
          ? `It's been ${daysSinceOldest} days since your last ${targetModule} exam`
          : `Focus on ${targetModule} - current performance is ${Math.round(lowestScore)}%`,
        length,
        type,
        confidence: Math.min(95, Math.round(avgScore + 10))
      });

    } catch (error) {
      console.error("Error generating suggestion:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleStartExam = () => {
    navigate("/exam/setup", {
      state: {
        suggestedModule: suggestion.module,
        suggestedLength: suggestion.length,
        suggestedType: suggestion.type
      }
    });
  };

  if (loading) {
    return (
      <Card className="border-primary/50 bg-gradient-to-br from-primary/5 to-primary/10">
        <CardContent className="pt-6">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-3/4"></div>
            <div className="h-4 bg-muted rounded w-1/2"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!suggestion) return null;

  return (
    <Card className="border-primary/50 bg-gradient-to-br from-primary/5 to-primary/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Smart Exam Suggestion
        </CardTitle>
        <CardDescription>AI-powered recommendation based on your performance</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Recommended Module</span>
            <Badge className="capitalize">{suggestion.module}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Suggested Length</span>
            <Badge variant="outline">{suggestion.length} questions</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Exam Type</span>
            <Badge variant="outline" className="capitalize">{suggestion.type}</Badge>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Readiness</span>
            <span className="font-medium">{suggestion.confidence}%</span>
          </div>
          <Progress value={suggestion.confidence} className="h-2" />
        </div>

        <div className="p-3 bg-muted/50 rounded-lg">
          <p className="text-sm text-muted-foreground">
            <Target className="h-4 w-4 inline mr-1" />
            {suggestion.reason}
          </p>
        </div>

        <Button onClick={handleStartExam} className="w-full" size="lg">
          <TrendingUp className="mr-2 h-4 w-4" />
          Start Recommended Exam
        </Button>
      </CardContent>
    </Card>
  );
}
