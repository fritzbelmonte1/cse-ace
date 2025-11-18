import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Brain, TrendingUp, Shield, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const Index = () => {
  const navigate = useNavigate();
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setIsLoggedIn(!!user);
    };
    checkAuth();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted">
      <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="CSE Practice Platform" className="h-8 w-8" />
            <span className="font-bold text-xl">CSE Practice Platform</span>
          </div>
          <Button onClick={() => navigate(isLoggedIn ? "/dashboard" : "/auth")}>
            {isLoggedIn ? "Dashboard" : "Get Started"}
          </Button>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <div className="flex justify-center mb-6">
            <img src="/logo.png" alt="CSE Practice Platform" className="h-32 w-32 animate-in fade-in zoom-in duration-700" />
          </div>
          <h1 className="text-5xl font-bold mb-4">
            Master the Civil Service Exam
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            AI-powered practice platform with intelligent question extraction and personalized study assistance
          </p>
          <Button size="lg" onClick={() => navigate(isLoggedIn ? "/dashboard" : "/auth")}>
            {isLoggedIn ? "Go to Dashboard" : "Start Learning Now"}
          </Button>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
          <div className="p-6 border rounded-lg bg-card">
            <Brain className="h-12 w-12 text-primary mb-4" />
            <h3 className="text-xl font-bold mb-2">Smart Practice</h3>
            <p className="text-muted-foreground">
              AI-extracted questions from official CSE materials across all exam modules
            </p>
          </div>

          <div className="p-6 border rounded-lg bg-card">
            <MessageSquare className="h-12 w-12 text-primary mb-4" />
            <h3 className="text-xl font-bold mb-2">AI Study Assistant</h3>
            <p className="text-muted-foreground">
              Get instant answers to your questions from uploaded CSE documents
            </p>
          </div>

          <div className="p-6 border rounded-lg bg-card">
            <TrendingUp className="h-12 w-12 text-primary mb-4" />
            <h3 className="text-xl font-bold mb-2">Track Progress</h3>
            <p className="text-muted-foreground">
              Monitor your performance and identify areas for improvement
            </p>
          </div>
        </div>

        <div className="text-center bg-card p-12 rounded-lg border">
          <Shield className="h-16 w-16 text-primary mx-auto mb-4" />
          <h2 className="text-3xl font-bold mb-4">Ready to Excel?</h2>
          <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
            Join students who are already using our AI-powered platform to prepare for the Civil Service Exam
          </p>
          <Button size="lg" onClick={() => navigate(isLoggedIn ? "/dashboard" : "/auth")}>
            {isLoggedIn ? "Continue Learning" : "Create Free Account"}
          </Button>
        </div>
      </main>
    </div>
  );
};

export default Index;
