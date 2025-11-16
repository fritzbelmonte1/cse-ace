import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, TrendingUp, Clock, Flag, Target, Brain } from "lucide-react";
import { toast } from "sonner";

const modules = ["All Modules", "vocabulary", "analogy", "reading", "numerical", "clerical"];
const timeRanges = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "All time", days: 9999 }
];

export default function ExamAnalytics() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [selectedModule, setSelectedModule] = useState("All Modules");
  const [selectedTimeRange, setSelectedTimeRange] = useState(30);
  const [exams, setExams] = useState<any[]>([]);
  const [aiInsights, setAiInsights] = useState<string>("");
  const [generatingInsights, setGeneratingInsights] = useState(false);

  useEffect(() => {
    checkAuthAndLoadData();
  }, []);

  useEffect(() => {
    if (exams.length > 0) {
      filterExams();
    }
  }, [selectedModule, selectedTimeRange]);

  const checkAuthAndLoadData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate("/auth");
      return;
    }
    await loadExams(user.id);
  };

  const loadExams = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("mock_exams")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "completed")
        .order("completed_at", { ascending: false });

      if (error) throw error;
      setExams(data || []);
    } catch (error) {
      console.error("Error loading exams:", error);
      toast.error("Failed to load exam data");
    } finally {
      setLoading(false);
    }
  };

  const filterExams = () => {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - selectedTimeRange);
    
    return exams.filter(exam => {
      const matchesModule = selectedModule === "All Modules" || exam.module === selectedModule;
      const matchesTime = selectedTimeRange === 9999 || new Date(exam.completed_at) >= cutoffDate;
      return matchesModule && matchesTime;
    });
  };

  const getScoreTrendData = () => {
    const filtered = filterExams();
    return filtered
      .slice()
      .reverse()
      .map((exam, idx) => ({
        exam: `Exam ${idx + 1}`,
        score: Math.round((exam.score / exam.total_questions) * 100),
        date: new Date(exam.completed_at).toLocaleDateString()
      }));
  };

  const getModulePerformance = () => {
    const filtered = filterExams();
    const moduleStats: Record<string, { total: number; correct: number; count: number }> = {};
    
    filtered.forEach(exam => {
      if (!moduleStats[exam.module]) {
        moduleStats[exam.module] = { total: 0, correct: 0, count: 0 };
      }
      moduleStats[exam.module].total += exam.total_questions;
      moduleStats[exam.module].correct += exam.score;
      moduleStats[exam.module].count += 1;
    });

    return Object.entries(moduleStats).map(([module, stats]) => ({
      module: module.charAt(0).toUpperCase() + module.slice(1),
      percentage: Math.round((stats.correct / stats.total) * 100),
      exams: stats.count
    }));
  };

  const getTimeDistribution = () => {
    const filtered = filterExams();
    return filtered.map((exam, idx) => ({
      exam: `Exam ${idx + 1}`,
      minutes: Math.round((exam.time_spent_seconds || 0) / 60),
      avgPerQuestion: ((exam.time_spent_seconds || 0) / exam.total_questions / 60).toFixed(1)
    }));
  };

  const getFlaggedQuestions = () => {
    const filtered = filterExams();
    const flaggedData: any[] = [];
    
    filtered.forEach(exam => {
      const notes = exam.question_notes || {};
      const performance = exam.question_performance || [];
      
      Object.keys(notes).forEach(qIdx => {
        const idx = parseInt(qIdx);
        const note = notes[qIdx];
        const perf = performance[idx];
        
        if (note?.flag) {
          flaggedData.push({
            examId: exam.id,
            examDate: new Date(exam.completed_at).toLocaleDateString(),
            module: exam.module,
            question: perf?.question?.substring(0, 80) + "..." || "N/A",
            flag: note.flag,
            correct: perf?.is_correct || false,
            note: note.note || ""
          });
        }
      });
    });
    
    return flaggedData;
  };

  const generateAIInsights = async () => {
    setGeneratingInsights(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-study-recommendations", {
        body: {}
      });

      if (error) throw error;
      setAiInsights(data.recommendations);
      toast.success("AI insights generated!");
    } catch (error: any) {
      console.error("Error generating insights:", error);
      toast.error(error.message || "Failed to generate insights");
    } finally {
      setGeneratingInsights(false);
    }
  };

  const scoreTrendData = getScoreTrendData();
  const modulePerformance = getModulePerformance();
  const timeDistribution = getTimeDistribution();
  const flaggedQuestions = getFlaggedQuestions();
  const filtered = filterExams();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted">
        <div className="container mx-auto px-4 py-8">
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-2">Exam Analytics</h1>
            <p className="text-muted-foreground">Deep insights into your exam performance</p>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-4 mb-6">
            <Select value={selectedModule} onValueChange={setSelectedModule}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {modules.map(mod => (
                  <SelectItem key={mod} value={mod}>{mod}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedTimeRange.toString()} onValueChange={(v) => setSelectedTimeRange(parseInt(v))}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {timeRanges.map(range => (
                  <SelectItem key={range.days} value={range.days.toString()}>{range.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Exams</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{filtered.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Avg Score</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {filtered.length > 0 
                    ? Math.round((filtered.reduce((acc, e) => acc + (e.score / e.total_questions * 100), 0) / filtered.length))
                    : 0}%
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Time</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {Math.round(filtered.reduce((acc, e) => acc + (e.time_spent_seconds || 0), 0) / 3600)}h
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Flagged Questions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{flaggedQuestions.length}</div>
              </CardContent>
            </Card>
          </div>

          {/* Score Trend Chart */}
          {scoreTrendData.length > 0 && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Score Progression
                </CardTitle>
                <CardDescription>Track your performance over time</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={{}} className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={scoreTrendData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="exam" />
                      <YAxis domain={[0, 100]} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Line type="monotone" dataKey="score" stroke="hsl(var(--primary))" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </CardContent>
            </Card>
          )}

          {/* Module Performance */}
          {modulePerformance.length > 0 && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Module Performance
                </CardTitle>
                <CardDescription>Compare performance across modules</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={{}} className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={modulePerformance}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="module" />
                      <YAxis domain={[0, 100]} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="percentage" fill="hsl(var(--primary))" />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </CardContent>
            </Card>
          )}

          {/* Time Distribution */}
          {timeDistribution.length > 0 && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Time Management
                </CardTitle>
                <CardDescription>Analyze your time usage patterns</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={{}} className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={timeDistribution}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="exam" />
                      <YAxis />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="minutes" fill="hsl(var(--secondary))" />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </CardContent>
            </Card>
          )}

          {/* Flagged Questions Table */}
          {flaggedQuestions.length > 0 && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Flag className="h-5 w-5" />
                  Flagged Questions Review
                </CardTitle>
                <CardDescription>Questions you marked for review</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Module</TableHead>
                      <TableHead>Question</TableHead>
                      <TableHead>Flag</TableHead>
                      <TableHead>Result</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {flaggedQuestions.slice(0, 20).map((q, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{q.examDate}</TableCell>
                        <TableCell className="capitalize">{q.module}</TableCell>
                        <TableCell className="max-w-md truncate">{q.question}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">{q.flag}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={q.correct ? "default" : "destructive"}>
                            {q.correct ? "✓" : "✗"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* AI Insights */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                AI Performance Insights
              </CardTitle>
              <CardDescription>Get personalized recommendations based on your exam history</CardDescription>
            </CardHeader>
            <CardContent>
              {!aiInsights ? (
                <Button onClick={generateAIInsights} disabled={generatingInsights}>
                  {generatingInsights ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    "Generate AI Insights"
                  )}
                </Button>
              ) : (
                <div className="prose prose-sm max-w-none">
                  <div className="whitespace-pre-wrap">{aiInsights}</div>
                  <Button onClick={generateAIInsights} variant="outline" className="mt-4" disabled={generatingInsights}>
                    Regenerate Insights
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
