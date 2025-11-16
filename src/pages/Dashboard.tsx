import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Brain, TrendingUp, PlayCircle, MessageSquare, Layers, Users, Target as TargetIcon, Pause } from "lucide-react";
import { toast } from "sonner";
import { Navigation } from "@/components/Navigation";
import { SmartExamSuggestions } from "@/components/SmartExamSuggestions";

const modules = [
  { id: "vocabulary", name: "Vocabulary", icon: BookOpen, description: "Word meanings and usage" },
  { id: "analogy", name: "Analogy", icon: Brain, description: "Relationships and patterns" },
  { id: "reading", name: "Reading Comprehension", icon: BookOpen, description: "Text understanding" },
  { id: "numerical", name: "Numerical Ability", icon: TrendingUp, description: "Math and logic" },
  { id: "clerical", name: "Clerical Ability", icon: BookOpen, description: "Administrative skills" },
];

const Dashboard = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [inProgressExams, setInProgressExams] = useState<any[]>([]);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }
      
      setUser(user);
      
      // Check if admin
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle();
      
      setIsAdmin(!!roleData);
      
      // Fetch in-progress and paused exams
      const { data: examsData } = await supabase
        .from("mock_exams")
        .select("*")
        .eq("user_id", user.id)
        .in("status", ["in_progress", "paused"])
        .order("started_at", { ascending: false });

      setInProgressExams(examsData || []);
      setLoading(false);
    };

    checkAuth();
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Logged out successfully");
    navigate("/");
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <BookOpen className="h-12 w-12 animate-pulse text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted">
        <div className="container mx-auto px-4 py-8">
          <div className="mb-8">
            <h1 className="text-4xl font-bold">CSE Practice Platform</h1>
            <p className="text-muted-foreground mt-2">Welcome back, {user?.email}</p>
          </div>

          {/* Smart Exam Suggestions */}
          <SmartExamSuggestions />

          {inProgressExams.length > 0 && (
            <Card className="mb-6 border-primary/50 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PlayCircle className="h-5 w-5 text-primary" />
                Resume Your Exam
              </CardTitle>
              <CardDescription>You have {inProgressExams.length} exam(s) to continue</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {inProgressExams.map((exam) => (
                <div key={exam.id} className="flex items-center justify-between p-3 bg-background rounded-lg border">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium">{exam.module} - {exam.exam_type === "practice" ? "Practice" : exam.exam_type === "strict" ? "Strict" : "Standard"} Mode</p>
                      {exam.status === "paused" && (
                        <Badge variant="outline" className="flex items-center gap-1">
                          <Pause className="h-3 w-3" />
                          Paused
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {Object.keys(exam.answers as object).length} of {exam.total_questions} questions answered
                    </p>
                  </div>
                  <Button onClick={() => navigate(`/exam/${exam.id}`)}>
                    {exam.status === "paused" ? "Resume" : "Continue"}
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {/* Mock Exam Mode Card */}
          <Card
            className="cursor-pointer hover:shadow-lg transition-all hover:scale-105 border-2 hover:border-primary bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-950/20 dark:to-red-950/20"
            onClick={() => navigate('/exam/setup')}
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <TargetIcon className="h-6 w-6" />
                  Mock Exam Mode
                </CardTitle>
              </div>
              <CardDescription className="text-base">
                Take full-length timed exams under realistic conditions
              </CardDescription>
            </CardHeader>
          </Card>

          {/* Practice Modules */}
          {modules.map((module) => {
            const Icon = module.icon;
            return (
              <Card key={module.id} className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigate(`/practice/${module.id}`)}>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <Icon className="h-8 w-8 text-primary" />
                    <div>
                      <CardTitle>{module.name}</CardTitle>
                      <CardDescription>{module.description}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Button className="w-full">Start Practice</Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigate("/ai-assistant")}>
          <CardHeader>
            <div className="flex items-center gap-3">
              <MessageSquare className="h-8 w-8 text-primary" />
              <div>
                <CardTitle>AI Study Assistant</CardTitle>
                <CardDescription>Ask questions about CSE materials</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Button className="w-full">Chat with AI</Button>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow cursor-pointer mt-6" onClick={() => navigate("/flashcards")}>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Layers className="h-8 w-8 text-primary" />
              <div>
                <CardTitle>Flashcards</CardTitle>
                <CardDescription>Learn with spaced repetition</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button className="w-full" onClick={(e) => { e.stopPropagation(); navigate("/flashcards"); }}>
              Study Flashcards
            </Button>
            <Button 
              variant="outline" 
              className="w-full" 
              onClick={(e) => { e.stopPropagation(); navigate("/browse-decks"); }}
            >
              <Users className="mr-2 h-4 w-4" />
              Browse Community Decks
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
    </>
  );
};

export default Dashboard;