import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowLeft, Target, Calendar, TrendingUp, Plus, Trash2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface Goal {
  id: string;
  module: string;
  target_score: number;
  exam_date: string | null;
  notes: string | null;
  is_completed: boolean;
  created_at: string;
}

const modules = [
  { id: "vocabulary", name: "Vocabulary" },
  { id: "analogy", name: "Analogy" },
  { id: "reading", name: "Reading Comprehension" },
  { id: "numerical", name: "Numerical Ability" },
  { id: "clerical", name: "Clerical Ability" },
];

const Goals = () => {
  const navigate = useNavigate();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [moduleProgress, setModuleProgress] = useState<Record<string, { current: number; sessions: number }>>({});
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  
  // Form state
  const [selectedModule, setSelectedModule] = useState("");
  const [targetScore, setTargetScore] = useState("");
  const [examDate, setExamDate] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadGoals();
    loadProgress();
  }, []);

  const loadGoals = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate("/auth");
      return;
    }

    const { data, error } = await supabase
      .from("goals")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading goals:", error);
      toast.error("Failed to load goals");
    } else {
      setGoals(data || []);
    }
    setLoading(false);
  };

  const loadProgress = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: sessions } = await supabase
      .from("practice_sessions")
      .select("module, score, total_questions")
      .eq("user_id", user.id);

    if (sessions) {
      const progress: Record<string, { current: number; sessions: number }> = {};
      sessions.forEach(session => {
        if (!progress[session.module]) {
          progress[session.module] = { current: 0, sessions: 0 };
        }
        progress[session.module].current += (session.score / session.total_questions) * 100;
        progress[session.module].sessions += 1;
      });

      Object.keys(progress).forEach(module => {
        progress[module].current = Math.round(progress[module].current / progress[module].sessions);
      });

      setModuleProgress(progress);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("goals").insert({
        user_id: user.id,
        module: selectedModule,
        target_score: parseInt(targetScore),
        exam_date: examDate || null,
        notes: notes || null,
      });

      if (error) throw error;

      toast.success("Goal created successfully!");
      setDialogOpen(false);
      resetForm();
      loadGoals();
    } catch (error) {
      console.error("Error creating goal:", error);
      toast.error("Failed to create goal");
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setSelectedModule("");
    setTargetScore("");
    setExamDate("");
    setNotes("");
  };

  const handleDelete = async (goalId: string) => {
    try {
      const { error } = await supabase
        .from("goals")
        .delete()
        .eq("id", goalId);

      if (error) throw error;

      toast.success("Goal deleted");
      loadGoals();
    } catch (error) {
      console.error("Error deleting goal:", error);
      toast.error("Failed to delete goal");
    }
  };

  const handleToggleComplete = async (goalId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from("goals")
        .update({ is_completed: !currentStatus })
        .eq("id", goalId);

      if (error) throw error;

      toast.success(currentStatus ? "Goal marked as incomplete" : "Goal completed! 🎉");
      loadGoals();
    } catch (error) {
      console.error("Error updating goal:", error);
      toast.error("Failed to update goal");
    }
  };

  const getDaysUntilExam = (examDate: string | null) => {
    if (!examDate) return null;
    const days = Math.ceil((new Date(examDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    return days;
  };

  const getProgressColor = (current: number, target: number) => {
    const percentage = (current / target) * 100;
    if (percentage >= 100) return "text-green-600";
    if (percentage >= 75) return "text-yellow-600";
    return "text-red-600";
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading goals...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Button variant="ghost" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                New Goal
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Goal</DialogTitle>
                <DialogDescription>
                  Set a target score and optional exam date for a module
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit}>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="module">Module</Label>
                    <Select value={selectedModule} onValueChange={setSelectedModule} required>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a module" />
                      </SelectTrigger>
                      <SelectContent>
                        {modules.map(module => (
                          <SelectItem key={module.id} value={module.id}>
                            {module.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="targetScore">Target Score (%)</Label>
                    <Input
                      id="targetScore"
                      type="number"
                      min="0"
                      max="100"
                      value={targetScore}
                      onChange={(e) => setTargetScore(e.target.value)}
                      placeholder="e.g., 85"
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="examDate">Exam Date (Optional)</Label>
                    <Input
                      id="examDate"
                      type="date"
                      value={examDate}
                      onChange={(e) => setExamDate(e.target.value)}
                    />
                  </div>

                  <div>
                    <Label htmlFor="notes">Notes (Optional)</Label>
                    <Textarea
                      id="notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Any additional notes or motivation..."
                      rows={3}
                    />
                  </div>
                </div>

                <DialogFooter className="mt-6">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? "Creating..." : "Create Goal"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Study Goals</h1>
          <p className="text-muted-foreground">Track your progress toward your target scores</p>
        </div>

        {goals.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No Goals Yet</CardTitle>
              <CardDescription>
                Create your first goal to start tracking your progress
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Your First Goal
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {goals.map(goal => {
              const moduleName = modules.find(m => m.id === goal.module)?.name || goal.module;
              const progress = moduleProgress[goal.module] || { current: 0, sessions: 0 };
              const progressPercentage = Math.min((progress.current / goal.target_score) * 100, 100);
              const daysUntil = getDaysUntilExam(goal.exam_date);

              return (
                <Card key={goal.id} className={goal.is_completed ? "opacity-75 border-green-500" : ""}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Target className={`h-5 w-5 ${goal.is_completed ? 'text-green-600' : 'text-primary'}`} />
                        <CardTitle className="text-xl">{moduleName}</CardTitle>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleToggleComplete(goal.id, goal.is_completed)}
                        >
                          <CheckCircle2 className={`h-5 w-5 ${goal.is_completed ? 'text-green-600' : 'text-muted-foreground'}`} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(goal.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <CardDescription>
                      Created {formatDistanceToNow(new Date(goal.created_at), { addSuffix: true })}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Progress */}
                    <div>
                      <div className="flex justify-between mb-2">
                        <span className="text-sm font-medium">Progress</span>
                        <span className={`text-sm font-bold ${getProgressColor(progress.current, goal.target_score)}`}>
                          {progress.current}% / {goal.target_score}%
                        </span>
                      </div>
                      <Progress value={progressPercentage} className="h-2" />
                      <p className="text-xs text-muted-foreground mt-1">
                        {progress.sessions} practice session{progress.sessions !== 1 ? 's' : ''} completed
                      </p>
                    </div>

                    {/* Exam Date */}
                    {goal.exam_date && (
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span>
                          Exam in <strong>{daysUntil}</strong> day{daysUntil !== 1 ? 's' : ''}
                        </span>
                      </div>
                    )}

                    {/* Notes */}
                    {goal.notes && (
                      <div className="bg-muted/50 p-3 rounded-lg">
                        <p className="text-sm text-muted-foreground">{goal.notes}</p>
                      </div>
                    )}

                    {/* Status */}
                    {goal.is_completed && (
                      <div className="flex items-center gap-2 text-green-600 font-medium">
                        <CheckCircle2 className="h-4 w-4" />
                        Goal Completed!
                      </div>
                    )}

                    {/* Action */}
                    {!goal.is_completed && (
                      <Button
                        className="w-full"
                        variant="outline"
                        onClick={() => navigate(`/practice/${goal.module}`)}
                      >
                        <TrendingUp className="mr-2 h-4 w-4" />
                        Practice Now
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Goals;
