import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  ArrowLeft, 
  User, 
  TrendingUp, 
  BookOpen, 
  MessageSquare, 
  Award,
  BarChart3,
  Calendar
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface PracticeSession {
  id: string;
  module: string;
  score: number;
  total_questions: number;
  created_at: string;
}

interface Stats {
  totalSessions: number;
  averageScore: number;
  bestScore: number;
  totalConversations: number;
  totalMessages: number;
  recentSessions: PracticeSession[];
}

const Profile = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState("");
  const [stats, setStats] = useState<Stats>({
    totalSessions: 0,
    averageScore: 0,
    bestScore: 0,
    totalConversations: 0,
    totalMessages: 0,
    recentSessions: []
  });

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          navigate("/auth");
          return;
        }

        setUserEmail(user.email || "");

        // Fetch practice sessions
        const { data: sessions, error: sessionsError } = await supabase
          .from('practice_sessions')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (sessionsError) throw sessionsError;

        // Fetch conversation count
        const { count: convCount, error: convError } = await supabase
          .from('chat_conversations')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id);

        if (convError) throw convError;

        // Fetch message count from user's conversations
        const { data: conversations } = await supabase
          .from('chat_conversations')
          .select('id')
          .eq('user_id', user.id);

        let messageCount = 0;
        if (conversations) {
          const convIds = conversations.map(c => c.id);
          const { count: msgCount, error: msgError } = await supabase
            .from('chat_messages')
            .select('*', { count: 'exact', head: true })
            .in('conversation_id', convIds);

          if (!msgError) messageCount = msgCount || 0;
        }

        // Calculate statistics
        const totalSessions = sessions?.length || 0;
        const averageScore = totalSessions > 0
          ? Math.round((sessions!.reduce((sum, s) => sum + (s.score / s.total_questions) * 100, 0) / totalSessions))
          : 0;
        const bestScore = totalSessions > 0
          ? Math.max(...sessions!.map(s => Math.round((s.score / s.total_questions) * 100)))
          : 0;

        setStats({
          totalSessions,
          averageScore,
          bestScore,
          totalConversations: convCount || 0,
          totalMessages: messageCount,
          recentSessions: sessions?.slice(0, 10) || []
        });
      } catch (error) {
        console.error('Error loading profile:', error);
        toast.error("Failed to load profile data");
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  // Prepare chart data
  const chartData = stats.recentSessions
    .slice()
    .reverse()
    .map((session, index) => ({
      session: `#${stats.recentSessions.length - index}`,
      score: Math.round((session.score / session.total_questions) * 100),
      date: new Date(session.created_at).toLocaleDateString()
    }));

  const getInitials = (email: string) => {
    return email.charAt(0).toUpperCase();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-background via-background to-muted">
        <div className="text-center">
          <User className="h-8 w-8 animate-pulse text-primary mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted">
      {/* Header */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shadow-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="font-bold text-xl">My Profile</h1>
                <p className="text-xs text-muted-foreground">View your progress and statistics</p>
              </div>
            </div>
          </div>
          <Button variant="outline" onClick={handleLogout}>
            Logout
          </Button>
        </div>
      </div>

      {/* Profile Content */}
      <div className="container max-w-6xl mx-auto px-4 py-8">
        {/* User Info Card */}
        <Card className="mb-8 border-primary/20 shadow-lg">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <Avatar className="h-20 w-20 border-4 border-primary/20">
                <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                  {getInitials(userEmail)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <h2 className="text-2xl font-bold">{userEmail}</h2>
                <p className="text-sm text-muted-foreground">CSE Practice Platform Member</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <Card className="border-primary/20 hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Practice Sessions</CardTitle>
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-primary">{stats.totalSessions}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Keep practicing to improve!
              </p>
            </CardContent>
          </Card>

          <Card className="border-primary/20 hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Average Score</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-primary">{stats.averageScore}%</div>
              <p className="text-xs text-muted-foreground mt-1">
                Across all practice sessions
              </p>
            </CardContent>
          </Card>

          <Card className="border-primary/20 hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Best Score</CardTitle>
              <Award className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-primary">{stats.bestScore}%</div>
              <p className="text-xs text-muted-foreground mt-1">
                Your highest achievement
              </p>
            </CardContent>
          </Card>

          <Card className="border-primary/20 hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">AI Conversations</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-primary">{stats.totalConversations}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Total chat sessions
              </p>
            </CardContent>
          </Card>

          <Card className="border-primary/20 hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">AI Messages</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-primary">{stats.totalMessages}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Total messages exchanged
              </p>
            </CardContent>
          </Card>

          <Card className="border-primary/20 hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Member Since</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">
                {new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Registration date
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Stats */}
        <Tabs defaultValue="performance" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="performance">
              <BarChart3 className="h-4 w-4 mr-2" />
              Performance
            </TabsTrigger>
            <TabsTrigger value="history">
              <Calendar className="h-4 w-4 mr-2" />
              History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="performance" className="space-y-6">
            <Card className="border-primary/20">
              <CardHeader>
                <CardTitle>Score Trend</CardTitle>
                <CardDescription>
                  Your performance over the last {chartData.length} practice sessions
                </CardDescription>
              </CardHeader>
              <CardContent>
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        dataKey="session" 
                        className="text-xs"
                        stroke="hsl(var(--muted-foreground))"
                      />
                      <YAxis 
                        domain={[0, 100]}
                        className="text-xs"
                        stroke="hsl(var(--muted-foreground))"
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px'
                        }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="score" 
                        stroke="hsl(var(--primary))" 
                        strokeWidth={3}
                        dot={{ fill: 'hsl(var(--primary))', r: 5 }}
                        activeDot={{ r: 7 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex flex-col items-center justify-center h-[300px] text-center">
                    <BarChart3 className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground">No practice data yet</p>
                    <p className="text-sm text-muted-foreground/70 mt-1">
                      Start practicing to see your progress here
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            <Card className="border-primary/20">
              <CardHeader>
                <CardTitle>Recent Practice Sessions</CardTitle>
                <CardDescription>
                  Your most recent practice attempts
                </CardDescription>
              </CardHeader>
              <CardContent>
                {stats.recentSessions.length > 0 ? (
                  <div className="space-y-3">
                    {stats.recentSessions.map((session) => {
                      const percentage = Math.round((session.score / session.total_questions) * 100);
                      return (
                        <div 
                          key={session.id}
                          className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-center gap-4">
                            <div className="p-2 bg-primary/10 rounded-lg">
                              <BookOpen className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <p className="font-medium">{session.module}</p>
                              <p className="text-sm text-muted-foreground">
                                {new Date(session.created_at).toLocaleDateString('en-US', { 
                                  month: 'short', 
                                  day: 'numeric', 
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-bold text-primary">{percentage}%</p>
                            <p className="text-xs text-muted-foreground">
                              {session.score}/{session.total_questions} correct
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Calendar className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground">No practice history yet</p>
                    <p className="text-sm text-muted-foreground/70 mt-1">
                      Complete some practice sessions to see them here
                    </p>
                    <Button 
                      className="mt-4"
                      onClick={() => navigate("/dashboard")}
                    >
                      Start Practicing
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Profile;
