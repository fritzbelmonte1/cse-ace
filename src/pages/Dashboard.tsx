import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, LogOut, Shield, Brain, TrendingUp, MessageSquare, User, BarChart } from "lucide-react";
import { toast } from "sonner";

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
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold">CSE Practice Platform</h1>
            <p className="text-muted-foreground mt-2">Welcome back, {user?.email}</p>
          </div>
          <div className="flex gap-2">
            {isAdmin && (
              <Button variant="outline" onClick={() => navigate("/admin/upload")}>
                <Shield className="mr-2 h-4 w-4" />
                Admin Panel
              </Button>
            )}
            <Button variant="outline" onClick={() => navigate("/analytics")}>
              <BarChart className="mr-2 h-4 w-4" />
              Analytics
            </Button>
            <Button variant="outline" onClick={() => navigate("/profile")}>
              <User className="mr-2 h-4 w-4" />
              Profile
            </Button>
            <Button variant="outline" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
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
      </div>
    </div>
  );
};

export default Dashboard;