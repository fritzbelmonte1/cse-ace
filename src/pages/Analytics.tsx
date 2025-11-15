import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, TrendingUp, Target, Clock, Award, Sparkles, Loader2 } from "lucide-react";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Navigation } from "@/components/Navigation";

interface PracticeSession {
  id: string;
  module: string;
  score: number;
  total_questions: number;
  time_spent_seconds: number;
  topic_scores: any;
  created_at: string;
}

const Analytics = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<PracticeSession[]>([]);
  const [recommendations, setRecommendations] = useState<string>("");
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAIRecommendations = async () => {
    setLoadingRecommendations(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-study-recommendations`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate recommendations');
      }

      const data = await response.json();
      setRecommendations(data.recommendations);
    } catch (error) {
      console.error('Error loading recommendations:', error);
      toast.error(error instanceof Error ? error.message : "Failed to load AI recommendations");
    } finally {
      setLoadingRecommendations(false);
    }
  };

  const loadAnalytics = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate("/auth");
      return;
    }

    const { data, error } = await supabase
      .from("practice_sessions")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error loading analytics:", error);
    } else {
      setSessions(data || []);
    }
    setLoading(false);
  };

  // Calculate performance trends
  const performanceTrend = sessions.map((session, index) => ({
    session: index + 1,
    score: Math.round((session.score / session.total_questions) * 100),
    date: new Date(session.created_at).toLocaleDateString(),
  }));

  // Calculate module strengths/weaknesses
  const moduleStats: Record<string, { total: number; correct: number; sessions: number }> = {};
  sessions.forEach(session => {
    if (!moduleStats[session.module]) {
      moduleStats[session.module] = { total: 0, correct: 0, sessions: 0 };
    }
    moduleStats[session.module].total += session.total_questions;
    moduleStats[session.module].correct += session.score;
    moduleStats[session.module].sessions += 1;
  });

  const modulePerformance = Object.entries(moduleStats).map(([module, stats]) => ({
    module,
    percentage: Math.round((stats.correct / stats.total) * 100),
    sessions: stats.sessions,
  })).sort((a, b) => a.percentage - b.percentage);

  // Calculate time spent analysis
  const timeByModule: Record<string, number> = {};
  sessions.forEach(session => {
    if (!timeByModule[session.module]) {
      timeByModule[session.module] = 0;
    }
    timeByModule[session.module] += session.time_spent_seconds;
  });

  const timeAnalysis = Object.entries(timeByModule).map(([module, seconds]) => ({
    module,
    hours: Number((seconds / 3600).toFixed(1)),
  }));

  // Calculate exam readiness score
  const recentSessions = sessions.slice(-10);
  const avgRecentScore = recentSessions.length > 0
    ? recentSessions.reduce((sum, s) => sum + (s.score / s.total_questions), 0) / recentSessions.length * 100
    : 0;
  
  const totalSessions = sessions.length;
  const consistencyBonus = Math.min(totalSessions * 2, 20);
  const moduleCompletionBonus = Object.keys(moduleStats).length * 5;
  
  const examReadiness = Math.min(
    Math.round(avgRecentScore * 0.6 + consistencyBonus + moduleCompletionBonus),
    100
  );

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

  const getReadinessColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  const getReadinessMessage = (score: number) => {
    if (score >= 80) return "Excellent! You're well-prepared for your exam.";
    if (score >= 60) return "Good progress! Keep practicing to improve.";
    return "More practice needed. Focus on weak areas.";
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="min-h-screen bg-background p-6">
        <Button variant="ghost" onClick={() => navigate("/dashboard")} className="mb-6">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>No Data Available</CardTitle>
            <CardDescription>Complete some practice sessions to see your analytics.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        <Button variant="ghost" onClick={() => navigate("/dashboard")} className="mb-6">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>

        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Performance Analytics</h1>
          <p className="text-muted-foreground">Detailed insights into your learning progress</p>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Exam Readiness</CardTitle>
              <Award className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${getReadinessColor(examReadiness)}`}>
                {examReadiness}%
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {getReadinessMessage(examReadiness)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Sessions</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalSessions}</div>
              <p className="text-xs text-muted-foreground mt-1">Practice attempts completed</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Score</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{Math.round(avgRecentScore)}%</div>
              <p className="text-xs text-muted-foreground mt-1">Last 10 sessions</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Study Time</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {Math.round(Object.values(timeByModule).reduce((a, b) => a + b, 0) / 3600)}h
              </div>
              <p className="text-xs text-muted-foreground mt-1">Total time invested</p>
            </CardContent>
          </Card>
        </div>

        {/* AI Recommendations Card */}
        <Card className="mb-8">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <CardTitle>AI Study Recommendations</CardTitle>
              </div>
              <Button 
                onClick={loadAIRecommendations}
                disabled={loadingRecommendations}
                size="sm"
              >
                {loadingRecommendations ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate Plan
                  </>
                )}
              </Button>
            </div>
            <CardDescription>
              Get personalized study recommendations based on your performance
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recommendations ? (
              <div className="prose prose-sm max-w-none dark:prose-invert">
                <div className="whitespace-pre-wrap bg-muted/50 p-6 rounded-lg">
                  {recommendations}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Sparkles className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Click "Generate Plan" to get AI-powered study recommendations</p>
                <p className="text-sm mt-2">Based on your performance data and weak areas</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Detailed Analytics Tabs */}
        <Tabs defaultValue="trends" className="space-y-4">
          <TabsList>
            <TabsTrigger value="trends">Performance Trends</TabsTrigger>
            <TabsTrigger value="topics">Topic Analysis</TabsTrigger>
            <TabsTrigger value="time">Time Analysis</TabsTrigger>
          </TabsList>

          <TabsContent value="trends" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Score Progress Over Time</CardTitle>
                <CardDescription>Track your improvement across all practice sessions</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={performanceTrend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="session" />
                    <YAxis domain={[0, 100]} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="score" stroke="#8884d8" strokeWidth={2} name="Score %" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="topics" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Module Performance</CardTitle>
                  <CardDescription>Identify your strengths and weaknesses</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={modulePerformance}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="module" />
                      <YAxis domain={[0, 100]} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="percentage" fill="#8884d8" name="Score %" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Strengths & Weaknesses</CardTitle>
                  <CardDescription>Focus areas for improvement</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {modulePerformance.length > 0 && (
                      <>
                        <div className="border-l-4 border-green-500 pl-4">
                          <h3 className="font-semibold text-green-700">Strongest Topic</h3>
                          <p className="text-2xl font-bold">{modulePerformance[modulePerformance.length - 1].module}</p>
                          <p className="text-sm text-muted-foreground">
                            {modulePerformance[modulePerformance.length - 1].percentage}% average score
                          </p>
                        </div>
                        <div className="border-l-4 border-red-500 pl-4">
                          <h3 className="font-semibold text-red-700">Needs Improvement</h3>
                          <p className="text-2xl font-bold">{modulePerformance[0].module}</p>
                          <p className="text-sm text-muted-foreground">
                            {modulePerformance[0].percentage}% average score - Practice more!
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="time" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Study Time Distribution</CardTitle>
                  <CardDescription>Time spent on each module</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={timeAnalysis}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ module, hours }) => `${module}: ${hours}h`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="hours"
                      >
                        {timeAnalysis.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Time Investment</CardTitle>
                  <CardDescription>Hours spent per module</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={timeAnalysis}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="module" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="hours" fill="#82ca9d" name="Hours" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
    </>
  );
};

export default Analytics;
