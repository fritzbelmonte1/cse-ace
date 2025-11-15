import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, Trash2, RefreshCw, AlertCircle, CheckCircle2, Edit, Search, Copy } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { QuestionMergeDialog } from "@/components/QuestionMergeDialog";
import { similarityScore } from "@/lib/utils";

interface ExtractedQuestion {
  id: string;
  document_id: string;
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: string;
  module: string;
  confidence_score: number;
  created_at: string;
}

const AdminQuestions = () => {
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<ExtractedQuestion[]>([]);
  const [filteredQuestions, setFilteredQuestions] = useState<ExtractedQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [confidenceFilter, setConfidenceFilter] = useState<string>("all");
  const [moduleFilter, setModuleFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedQuestions, setSelectedQuestions] = useState<Set<string>>(new Set());
  const [editingQuestion, setEditingQuestion] = useState<ExtractedQuestion | null>(null);
  const [modules, setModules] = useState<string[]>([]);
  const [similarQuestions, setSimilarQuestions] = useState<ExtractedQuestion[]>([]);
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);

  useEffect(() => {
    fetchQuestions();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [questions, confidenceFilter, moduleFilter, searchQuery]);

  const fetchQuestions = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('extracted_questions')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setQuestions(data || []);
      
      // Extract unique modules
      const uniqueModules = [...new Set(data?.map(q => q.module) || [])];
      setModules(uniqueModules);
    } catch (error: any) {
      console.error('Error fetching questions:', error);
      toast.error("Failed to load questions");
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...questions];

    // Confidence filter
    if (confidenceFilter === "low") {
      filtered = filtered.filter(q => q.confidence_score < 0.7);
    } else if (confidenceFilter === "medium") {
      filtered = filtered.filter(q => q.confidence_score >= 0.7 && q.confidence_score < 0.9);
    } else if (confidenceFilter === "high") {
      filtered = filtered.filter(q => q.confidence_score >= 0.9);
    } else if (confidenceFilter === "unknown") {
      filtered = filtered.filter(q => q.correct_answer === "unknown");
    }

    // Module filter
    if (moduleFilter !== "all") {
      filtered = filtered.filter(q => q.module === moduleFilter);
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(q => 
        q.question.toLowerCase().includes(query) ||
        q.option_a.toLowerCase().includes(query) ||
        q.option_b.toLowerCase().includes(query) ||
        q.option_c.toLowerCase().includes(query) ||
        q.option_d.toLowerCase().includes(query)
      );
    }

    setFilteredQuestions(filtered);
  };

  const handleSelectAll = () => {
    if (selectedQuestions.size === filteredQuestions.length) {
      setSelectedQuestions(new Set());
    } else {
      setSelectedQuestions(new Set(filteredQuestions.map(q => q.id)));
    }
  };

  const handleSelectQuestion = (questionId: string) => {
    const newSelected = new Set(selectedQuestions);
    if (newSelected.has(questionId)) {
      newSelected.delete(questionId);
    } else {
      newSelected.add(questionId);
    }
    setSelectedQuestions(newSelected);
  };

  const handleBulkDelete = async () => {
    if (selectedQuestions.size === 0) {
      toast.error("No questions selected");
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to delete ${selectedQuestions.size} question(s)?`
    );

    if (!confirmed) return;

    try {
      const { error } = await supabase
        .from('extracted_questions')
        .delete()
        .in('id', Array.from(selectedQuestions));

      if (error) throw error;

      toast.success(`Deleted ${selectedQuestions.size} question(s)`);
      setSelectedQuestions(new Set());
      fetchQuestions();
    } catch (error: any) {
      console.error('Error deleting questions:', error);
      toast.error("Failed to delete questions");
    }
  };

  const handleEditQuestion = async () => {
    if (!editingQuestion) return;

    try {
      const { error } = await supabase
        .from('extracted_questions')
        .update({
          question: editingQuestion.question,
          option_a: editingQuestion.option_a,
          option_b: editingQuestion.option_b,
          option_c: editingQuestion.option_c,
          option_d: editingQuestion.option_d,
          correct_answer: editingQuestion.correct_answer,
          module: editingQuestion.module,
        })
        .eq('id', editingQuestion.id);

      if (error) throw error;

      toast.success("Question updated successfully");
      setEditingQuestion(null);
      fetchQuestions();
    } catch (error: any) {
      console.error('Error updating question:', error);
      toast.error("Failed to update question");
    }
  };

  const getConfidenceBadge = (score: number) => {
    if (score >= 0.9) {
      return <Badge variant="default" className="bg-green-500 hover:bg-green-600">High ({score.toFixed(2)})</Badge>;
    } else if (score >= 0.7) {
      return <Badge variant="secondary">Medium ({score.toFixed(2)})</Badge>;
    } else {
      return <Badge variant="destructive">Low ({score.toFixed(2)})</Badge>;
    }
  };

  const findSimilarQuestions = (question: ExtractedQuestion) => {
    const SIMILARITY_THRESHOLD = 0.90;
    const similar: ExtractedQuestion[] = [question];
    
    questions.forEach((q) => {
      if (q.id !== question.id) {
        const similarity = similarityScore(question.question, q.question);
        if (similarity >= SIMILARITY_THRESHOLD) {
          similar.push(q);
        }
      }
    });
    
    if (similar.length > 1) {
      setSimilarQuestions(similar);
      setMergeDialogOpen(true);
    } else {
      toast.info("No similar questions found (90% similarity threshold)");
    }
  };

  const handleMerge = async (
    mergedQuestion: Partial<ExtractedQuestion>,
    keepId: string,
    deleteIds: string[]
  ) => {
    try {
      // Update the kept question
      const { error: updateError } = await supabase
        .from('extracted_questions')
        .update(mergedQuestion)
        .eq('id', keepId);

      if (updateError) throw updateError;

      // Delete the duplicate questions
      const { error: deleteError } = await supabase
        .from('extracted_questions')
        .delete()
        .in('id', deleteIds);

      if (deleteError) throw deleteError;

      toast.success(`Merged ${deleteIds.length + 1} similar questions successfully`);
      fetchQuestions();
      setSimilarQuestions([]);
    } catch (error: any) {
      console.error('Error merging questions:', error);
      toast.error("Failed to merge questions");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/5">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading questions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="icon"
              onClick={() => navigate("/admin/upload")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Question Review</h1>
              <p className="text-muted-foreground">
                Review and manage extracted questions
              </p>
            </div>
          </div>
          <Button onClick={fetchQuestions} variant="outline" size="icon">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Questions</CardDescription>
              <CardTitle className="text-3xl">{questions.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Low Confidence</CardDescription>
              <CardTitle className="text-3xl text-destructive">
                {questions.filter(q => q.confidence_score < 0.7).length}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Unknown Answers</CardDescription>
              <CardTitle className="text-3xl text-yellow-500">
                {questions.filter(q => q.correct_answer === "unknown").length}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>High Quality</CardDescription>
              <CardTitle className="text-3xl text-green-500">
                {questions.filter(q => q.confidence_score >= 0.9).length}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Confidence Level</Label>
                <Select value={confidenceFilter} onValueChange={setConfidenceFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Levels</SelectItem>
                    <SelectItem value="low">Low (&lt; 0.7)</SelectItem>
                    <SelectItem value="medium">Medium (0.7-0.9)</SelectItem>
                    <SelectItem value="high">High (&gt; 0.9)</SelectItem>
                    <SelectItem value="unknown">Unknown Answer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Module</Label>
                <Select value={moduleFilter} onValueChange={setModuleFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Modules</SelectItem>
                    {modules.map(module => (
                      <SelectItem key={module} value={module}>{module}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Search</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search questions..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Bulk Actions */}
        {selectedQuestions.size > 0 && (
          <Card className="border-primary">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">
                  {selectedQuestions.size} question(s) selected
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleBulkDelete}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Selected
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Questions List */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                Questions ({filteredQuestions.length})
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSelectAll}
              >
                {selectedQuestions.size === filteredQuestions.length ? "Deselect All" : "Select All"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {filteredQuestions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No questions found matching your filters</p>
                </div>
              ) : (
                filteredQuestions.map((question) => (
                  <Card key={question.id} className="border-l-4 border-l-primary/50">
                    <CardContent className="pt-6">
                      <div className="flex items-start gap-4">
                        <Checkbox
                          checked={selectedQuestions.has(question.id)}
                          onCheckedChange={() => handleSelectQuestion(question.id)}
                        />
                        <div className="flex-1 space-y-3">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <p className="font-medium text-foreground mb-2">
                                {question.question}
                              </p>
                              <div className="grid grid-cols-2 gap-2 text-sm">
                                <div className={`p-2 rounded border ${question.correct_answer === 'A' ? 'bg-green-500/10 border-green-500' : 'bg-muted'}`}>
                                  <span className="font-medium">A:</span> {question.option_a}
                                </div>
                                <div className={`p-2 rounded border ${question.correct_answer === 'B' ? 'bg-green-500/10 border-green-500' : 'bg-muted'}`}>
                                  <span className="font-medium">B:</span> {question.option_b}
                                </div>
                                <div className={`p-2 rounded border ${question.correct_answer === 'C' ? 'bg-green-500/10 border-green-500' : 'bg-muted'}`}>
                                  <span className="font-medium">C:</span> {question.option_c}
                                </div>
                                <div className={`p-2 rounded border ${question.correct_answer === 'D' ? 'bg-green-500/10 border-green-500' : 'bg-muted'}`}>
                                  <span className="font-medium">D:</span> {question.option_d}
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              {getConfidenceBadge(question.confidence_score)}
                              <Badge variant="outline">{question.module}</Badge>
                              {question.correct_answer === "unknown" && (
                                <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-700">
                                  <AlertCircle className="h-3 w-3 mr-1" />
                                  No Answer
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 pt-2 border-t">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => findSimilarQuestions(question)}
                            >
                              <Copy className="h-4 w-4 mr-2" />
                              Find Similar
                            </Button>
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setEditingQuestion(question)}
                                >
                                  <Edit className="h-4 w-4 mr-2" />
                                  Edit
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-2xl">
                                <DialogHeader>
                                  <DialogTitle>Edit Question</DialogTitle>
                                  <DialogDescription>
                                    Update the question details below
                                  </DialogDescription>
                                </DialogHeader>
                                {editingQuestion && (
                                  <div className="space-y-4">
                                    <div>
                                      <Label>Question</Label>
                                      <Textarea
                                        value={editingQuestion.question}
                                        onChange={(e) => setEditingQuestion({
                                          ...editingQuestion,
                                          question: e.target.value
                                        })}
                                        rows={3}
                                      />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                      <div>
                                        <Label>Option A</Label>
                                        <Input
                                          value={editingQuestion.option_a}
                                          onChange={(e) => setEditingQuestion({
                                            ...editingQuestion,
                                            option_a: e.target.value
                                          })}
                                        />
                                      </div>
                                      <div>
                                        <Label>Option B</Label>
                                        <Input
                                          value={editingQuestion.option_b}
                                          onChange={(e) => setEditingQuestion({
                                            ...editingQuestion,
                                            option_b: e.target.value
                                          })}
                                        />
                                      </div>
                                      <div>
                                        <Label>Option C</Label>
                                        <Input
                                          value={editingQuestion.option_c}
                                          onChange={(e) => setEditingQuestion({
                                            ...editingQuestion,
                                            option_c: e.target.value
                                          })}
                                        />
                                      </div>
                                      <div>
                                        <Label>Option D</Label>
                                        <Input
                                          value={editingQuestion.option_d}
                                          onChange={(e) => setEditingQuestion({
                                            ...editingQuestion,
                                            option_d: e.target.value
                                          })}
                                        />
                                      </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                      <div>
                                        <Label>Correct Answer</Label>
                                        <Select
                                          value={editingQuestion.correct_answer}
                                          onValueChange={(value) => setEditingQuestion({
                                            ...editingQuestion,
                                            correct_answer: value
                                          })}
                                        >
                                          <SelectTrigger>
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="A">A</SelectItem>
                                            <SelectItem value="B">B</SelectItem>
                                            <SelectItem value="C">C</SelectItem>
                                            <SelectItem value="D">D</SelectItem>
                                            <SelectItem value="unknown">Unknown</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      <div>
                                        <Label>Module</Label>
                                        <Input
                                          value={editingQuestion.module}
                                          onChange={(e) => setEditingQuestion({
                                            ...editingQuestion,
                                            module: e.target.value
                                          })}
                                        />
                                      </div>
                                    </div>
                                  </div>
                                )}
                                <DialogFooter>
                                  <Button variant="outline" onClick={() => setEditingQuestion(null)}>
                                    Cancel
                                  </Button>
                                  <Button onClick={handleEditQuestion}>
                                    <CheckCircle2 className="h-4 w-4 mr-2" />
                                    Save Changes
                                  </Button>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={async () => {
                                const confirmed = window.confirm("Delete this question?");
                                if (!confirmed) return;
                                try {
                                  const { error } = await supabase
                                    .from('extracted_questions')
                                    .delete()
                                    .eq('id', question.id);
                                  if (error) throw error;
                                  toast.success("Question deleted");
                                  fetchQuestions();
                                } catch (error) {
                                  toast.error("Failed to delete question");
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Question Merge Dialog */}
        <QuestionMergeDialog
          open={mergeDialogOpen}
          onOpenChange={setMergeDialogOpen}
          questions={similarQuestions}
          onMerge={handleMerge}
        />
      </div>
    </div>
  );
};

export default AdminQuestions;
