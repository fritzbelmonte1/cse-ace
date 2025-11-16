import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ArrowLeft, Check, X, Edit2, Save, XCircle, CheckCircle, Clock, Search, Filter, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const modules = [
  { id: "vocabulary", name: "Vocabulary" },
  { id: "grammar", name: "Grammar" },
  { id: "reading", name: "Reading Comprehension" },
  { id: "numerical", name: "Numerical Ability" },
  { id: "logical", name: "Logical Reasoning" },
];

interface Question {
  id: string;
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: string;
  module: string;
  confidence_score: number;
  status: string;
  document_id: string;
  created_at: string;
}

export default function AdminQuestions() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedQuestions, setSelectedQuestions] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Question>>({});
  const [quickEditId, setQuickEditId] = useState<string | null>(null);
  const [quickEditForm, setQuickEditForm] = useState<Partial<Question>>({});
  const [showBulkPreview, setShowBulkPreview] = useState(false);
  const [bulkAction, setBulkAction] = useState<"approve" | "reject" | null>(null);
  const [stats, setStats] = useState({ pending: 0, approved: 0, rejected: 0, highConf: 0 });
  
  // Filters
  const [moduleFilter, setModuleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [searchQuery, setSearchQuery] = useState("");
  const [confidenceFilter, setConfidenceFilter] = useState<string>("all");
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const ITEMS_PER_PAGE = 20;

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (user) {
      fetchQuestions();
      fetchStats();
    }
  }, [user, moduleFilter, statusFilter, confidenceFilter, currentPage]);

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate("/auth");
      return;
    }

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      toast.error("Admin access required");
      navigate("/dashboard");
      return;
    }

    setUser(user);
    setLoading(false);
  };

  const fetchStats = async () => {
    try {
      const [pendingRes, approvedRes, rejectedRes, highConfRes] = await Promise.all([
        supabase.from("extracted_questions").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("extracted_questions").select("id", { count: "exact", head: true }).eq("status", "approved"),
        supabase.from("extracted_questions").select("id", { count: "exact", head: true }).eq("status", "rejected"),
        supabase.from("extracted_questions").select("id", { count: "exact", head: true }).eq("status", "pending").gte("confidence_score", 0.95),
      ]);

      setStats({
        pending: pendingRes.count || 0,
        approved: approvedRes.count || 0,
        rejected: rejectedRes.count || 0,
        highConf: highConfRes.count || 0,
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  };

  const fetchQuestions = async () => {
    setLoading(true);
    let query = supabase
      .from("extracted_questions")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });

    if (moduleFilter !== "all") {
      query = query.eq("module", moduleFilter);
    }

    if (statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }

    if (confidenceFilter === "low") {
      query = query.lt("confidence_score", 0.7);
    } else if (confidenceFilter === "high") {
      query = query.gte("confidence_score", 0.9);
    }

    if (searchQuery) {
      query = query.ilike("question", `%${searchQuery}%`);
    }

    const from = (currentPage - 1) * ITEMS_PER_PAGE;
    const to = from + ITEMS_PER_PAGE - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      console.error("Error fetching questions:", error);
      toast.error("Failed to load questions");
    } else {
      setQuestions(data || []);
      setTotalCount(count || 0);
    }
    setLoading(false);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedQuestions(new Set(questions.map(q => q.id)));
    } else {
      setSelectedQuestions(new Set());
    }
  };

  const handleSelectQuestion = (id: string, checked: boolean) => {
    const newSelected = new Set(selectedQuestions);
    if (checked) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedQuestions(newSelected);
  };

  const handleAutoApprove = async () => {
    if (!confirm("Auto-approve all pending questions with confidence ≥ 95%?")) return;

    setLoading(true);
    try {
      const { data: highConfQuestions, error: fetchError } = await supabase
        .from("extracted_questions")
        .select("id")
        .eq("status", "pending")
        .gte("confidence_score", 0.95);

      if (fetchError) throw fetchError;

      if (!highConfQuestions || highConfQuestions.length === 0) {
        toast.info("No high-confidence questions found");
        setLoading(false);
        return;
      }

      const chunkSize = 50;
      let approved = 0;

      for (let i = 0; i < highConfQuestions.length; i += chunkSize) {
        const chunk = highConfQuestions.slice(i, i + chunkSize);
        const ids = chunk.map(q => q.id);

        const { error } = await supabase
          .from("extracted_questions")
          .update({
            status: "approved",
            approved_by: user.id,
            approved_at: new Date().toISOString()
          })
          .in("id", ids);

        if (error) throw error;
        approved += chunk.length;

        toast.loading(`Approving... ${approved}/${highConfQuestions.length}`, { id: "auto-approve" });
      }

      toast.success(`Auto-approved ${approved} high-confidence questions`, { id: "auto-approve" });
      fetchQuestions();
      fetchStats();
    } catch (error: any) {
      console.error("Auto-approval error:", error);
      toast.error("Auto-approval failed");
    } finally {
      setLoading(false);
    }
  };

  const handleBulkAction = async (action: "approve" | "reject") => {
    if (selectedQuestions.size === 0) {
      toast.error("No questions selected");
      return;
    }

    setBulkAction(action);
    setShowBulkPreview(true);
  };

  const confirmBulkAction = async () => {
    if (!bulkAction) return;

    setLoading(true);
    setShowBulkPreview(false);

    try {
      const ids = Array.from(selectedQuestions);
      const chunkSize = 50;
      let processed = 0;

      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);

        const updateData: any = { status: bulkAction === "approve" ? "approved" : "rejected" };
        if (bulkAction === "approve") {
          updateData.approved_by = user.id;
          updateData.approved_at = new Date().toISOString();
        }

        const { error } = await supabase
          .from("extracted_questions")
          .update(updateData)
          .in("id", chunk);

        if (error) throw error;
        processed += chunk.length;

        toast.loading(`Processing... ${processed}/${ids.length}`, { id: "bulk-action" });
      }

      toast.success(`${bulkAction === "approve" ? "Approved" : "Rejected"} ${processed} questions`, { id: "bulk-action" });
      setSelectedQuestions(new Set());
      fetchQuestions();
      fetchStats();
    } catch (error: any) {
      console.error("Bulk action error:", error);
      toast.error(`Failed to ${bulkAction} questions`);
    } finally {
      setLoading(false);
      setBulkAction(null);
    }
  };

  const startEdit = (question: Question) => {
    setEditingId(question.id);
    setEditForm(question);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const startQuickEdit = (question: Question) => {
    setQuickEditId(question.id);
    setQuickEditForm(question);
  };

  const saveQuickEdit = async () => {
    if (!quickEditId) return;

    try {
      const { error } = await supabase
        .from("extracted_questions")
        .update(quickEditForm)
        .eq("id", quickEditId);

      if (error) throw error;

      toast.success("Question updated");
      setQuickEditId(null);
      setQuickEditForm({});
      fetchQuestions();
    } catch (error: any) {
      console.error("Quick edit error:", error);
      toast.error("Failed to update question");
    }
  };

  const cancelQuickEdit = () => {
    setQuickEditId(null);
    setQuickEditForm({});
  };

  const saveEdit = async () => {
    if (!editingId) return;

    const { error } = await supabase
      .from("extracted_questions")
      .update({
        question: editForm.question,
        option_a: editForm.option_a,
        option_b: editForm.option_b,
        option_c: editForm.option_c,
        option_d: editForm.option_d,
        correct_answer: editForm.correct_answer,
        module: editForm.module
      })
      .eq("id", editingId);

    if (error) {
      console.error("Save error:", error);
      toast.error("Failed to save changes");
    } else {
      toast.success("Question updated");
      setEditingId(null);
      setEditForm({});
      fetchQuestions();
    }
  };

  const getConfidenceBadge = (score: number) => {
    if (score >= 0.9) return <Badge variant="default" className="bg-green-500">High ({score.toFixed(2)})</Badge>;
    if (score >= 0.7) return <Badge variant="secondary">Medium ({score.toFixed(2)})</Badge>;
    return <Badge variant="destructive">Low ({score.toFixed(2)})</Badge>;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge variant="default" className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />Approved</Badge>;
      case "rejected":
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
    }
  };

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  if (loading && !questions.length) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/admin/upload")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Question Review</h1>
              <p className="text-muted-foreground">Review and approve AI-extracted questions</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/admin/create-question")}>
              <Edit2 className="w-4 h-4 mr-2" />
              Create Question
            </Button>
            <Button variant="outline" onClick={() => navigate("/admin/recategorize")}>
              Bulk Recategorize
            </Button>
            <Button variant="outline" onClick={() => navigate("/admin/users")}>
              Manage Users
            </Button>
            <Button variant="outline" onClick={() => navigate("/admin/settings")}>
              Settings
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl font-bold">{stats.pending}</div>
                  <p className="text-xs text-muted-foreground">Pending Review</p>
                </div>
                <Clock className="h-8 w-8 text-muted-foreground opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl font-bold">{stats.approved}</div>
                  <p className="text-xs text-muted-foreground">Approved</p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl font-bold">{stats.rejected}</div>
                  <p className="text-xs text-muted-foreground">Rejected</p>
                </div>
                <XCircle className="h-8 w-8 text-destructive opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl font-bold">{stats.highConf}</div>
                  <p className="text-xs text-muted-foreground">High Confidence (≥95%)</p>
                </div>
                <CheckCircle className="h-8 w-8 text-blue-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Filter className="w-5 h-5" />
                Filters
              </CardTitle>
              <Button
                onClick={handleAutoApprove}
                variant="outline"
                className="gap-2"
                disabled={loading || stats.highConf === 0}
              >
                <CheckCircle className="h-4 w-4" />
                Auto-Approve High Confidence ({stats.highConf})
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label>Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
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
                    {modules.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Confidence</Label>
                <Select value={confidenceFilter} onValueChange={setConfidenceFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Levels</SelectItem>
                    <SelectItem value="high">High (≥0.9)</SelectItem>
                    <SelectItem value="low">Low (&lt;0.7)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Search</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search questions..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && fetchQuestions()}
                    className="pl-8"
                  />
                </div>
              </div>
            </div>

            <Button onClick={fetchQuestions} className="w-full">
              Apply Filters
            </Button>
          </CardContent>
        </Card>

        {/* Bulk Actions */}
        {selectedQuestions.size > 0 && (
          <Card className="mb-6 border-primary/50 bg-primary/5">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <p className="font-medium">{selectedQuestions.size} question(s) selected</p>
                <div className="flex gap-2">
                  <Button onClick={() => handleBulkAction("approve")} variant="default" size="sm">
                    <Check className="w-4 h-4 mr-2" />
                    Approve Selected
                  </Button>
                  <Button onClick={() => handleBulkAction("reject")} variant="destructive" size="sm">
                    <X className="w-4 h-4 mr-2" />
                    Reject Selected
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Questions List */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Checkbox
              checked={selectedQuestions.size === questions.length && questions.length > 0}
              onCheckedChange={handleSelectAll}
            />
            <Label>Select All ({totalCount} total)</Label>
          </div>

          {questions.map((question) => (
            <Card key={question.id} className={cn(
              "transition-all",
              selectedQuestions.has(question.id) && "border-primary"
            )}>
              <CardContent className="p-6">
                <div className="flex gap-4">
                  <Checkbox
                    checked={selectedQuestions.has(question.id)}
                    onCheckedChange={(checked) => handleSelectQuestion(question.id, checked as boolean)}
                  />

                  <div className="flex-1">
                    {editingId === question.id ? (
                      // Full Edit Mode
                      <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                        <div>
                          <Label>Module</Label>
                          <Select value={editForm.module} onValueChange={(value) => setEditForm({...editForm, module: value})}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {modules.map(m => (
                                <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label>Question</Label>
                          <Textarea
                            value={editForm.question}
                            onChange={(e) => setEditForm({...editForm, question: e.target.value})}
                            rows={3}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label>Option A</Label>
                            <Input
                              value={editForm.option_a}
                              onChange={(e) => setEditForm({...editForm, option_a: e.target.value})}
                            />
                          </div>
                          <div>
                            <Label>Option B</Label>
                            <Input
                              value={editForm.option_b}
                              onChange={(e) => setEditForm({...editForm, option_b: e.target.value})}
                            />
                          </div>
                          <div>
                            <Label>Option C</Label>
                            <Input
                              value={editForm.option_c}
                              onChange={(e) => setEditForm({...editForm, option_c: e.target.value})}
                            />
                          </div>
                          <div>
                            <Label>Option D</Label>
                            <Input
                              value={editForm.option_d}
                              onChange={(e) => setEditForm({...editForm, option_d: e.target.value})}
                            />
                          </div>
                        </div>

                        <div>
                          <Label>Correct Answer</Label>
                          <RadioGroup value={editForm.correct_answer} onValueChange={(value) => setEditForm({...editForm, correct_answer: value})}>
                            <div className="flex gap-4">
                              <div className="flex items-center gap-2">
                                <RadioGroupItem value="A" id="edit-a" />
                                <Label htmlFor="edit-a">A</Label>
                              </div>
                              <div className="flex items-center gap-2">
                                <RadioGroupItem value="B" id="edit-b" />
                                <Label htmlFor="edit-b">B</Label>
                              </div>
                              <div className="flex items-center gap-2">
                                <RadioGroupItem value="C" id="edit-c" />
                                <Label htmlFor="edit-c">C</Label>
                              </div>
                              <div className="flex items-center gap-2">
                                <RadioGroupItem value="D" id="edit-d" />
                                <Label htmlFor="edit-d">D</Label>
                              </div>
                            </div>
                          </RadioGroup>
                        </div>

                        <div className="flex gap-2">
                          <Button onClick={saveEdit} size="sm">
                            <Save className="w-4 h-4 mr-2" />
                            Save Changes
                          </Button>
                          <Button onClick={cancelEdit} variant="outline" size="sm">
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : quickEditId === question.id ? (
                      // Quick Edit Mode
                      <div className="space-y-3 p-4 border-2 border-primary rounded-lg bg-primary/5">
                        <div>
                          <Label className="text-xs">Question</Label>
                          <Textarea
                            value={quickEditForm.question || ""}
                            onChange={(e) => setQuickEditForm({ ...quickEditForm, question: e.target.value })}
                            rows={2}
                            className="text-sm"
                          />
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2">
                          {["A", "B", "C", "D"].map((option) => (
                            <div key={option}>
                              <Label className="text-xs">Option {option}</Label>
                              <Input
                                value={quickEditForm[`option_${option.toLowerCase()}` as keyof Question] as string || ""}
                                onChange={(e) => setQuickEditForm({
                                  ...quickEditForm,
                                  [`option_${option.toLowerCase()}`]: e.target.value
                                })}
                                className="text-sm"
                              />
                            </div>
                          ))}
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <Label className="text-xs">Correct:</Label>
                            <Select
                              value={quickEditForm.correct_answer || ""}
                              onValueChange={(value) => setQuickEditForm({ ...quickEditForm, correct_answer: value })}
                            >
                              <SelectTrigger className="w-20 h-8 text-sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {["A", "B", "C", "D"].map((opt) => (
                                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          
                          <div className="flex gap-2 ml-auto">
                            <Button onClick={saveQuickEdit} size="sm" className="gap-1 h-8">
                              <Save className="h-3 w-3" />
                              Save
                            </Button>
                            <Button onClick={cancelQuickEdit} variant="outline" size="sm" className="h-8">
                              Cancel
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      // View Mode
                      <div className="space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="outline">{question.module}</Badge>
                              {getStatusBadge(question.status)}
                              {getConfidenceBadge(question.confidence_score)}
                            </div>
                            <p className="font-medium text-lg mb-3">{question.question}</p>

                            <div className="space-y-2">
                              <div className={cn(
                                "p-2 rounded border",
                                question.correct_answer === "A" && "border-green-500 bg-green-50 dark:bg-green-950"
                              )}>
                                <span className="font-semibold">A.</span> {question.option_a}
                              </div>
                              <div className={cn(
                                "p-2 rounded border",
                                question.correct_answer === "B" && "border-green-500 bg-green-50 dark:bg-green-950"
                              )}>
                                <span className="font-semibold">B.</span> {question.option_b}
                              </div>
                              <div className={cn(
                                "p-2 rounded border",
                                question.correct_answer === "C" && "border-green-500 bg-green-50 dark:bg-green-950"
                              )}>
                                <span className="font-semibold">C.</span> {question.option_c}
                              </div>
                              <div className={cn(
                                "p-2 rounded border",
                                question.correct_answer === "D" && "border-green-500 bg-green-50 dark:bg-green-950"
                              )}>
                                <span className="font-semibold">D.</span> {question.option_d}
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-col gap-2 ml-4">
                            <Button
                              onClick={() => startQuickEdit(question)}
                              variant="default"
                              size="sm"
                              className="gap-2"
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            {question.status !== "approved" && (
                              <Button
                                onClick={() => {
                                  setSelectedQuestions(new Set([question.id]));
                                  handleBulkAction("approve");
                                }}
                                variant="default"
                                size="sm"
                              >
                                <Check className="w-4 h-4" />
                              </Button>
                            )}
                            {question.status !== "rejected" && (
                              <Button
                                onClick={() => {
                                  setSelectedQuestions(new Set([question.id]));
                                  handleBulkAction("reject");
                                }}
                                variant="destructive"
                                size="sm"
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </div>

                        <p className="text-xs text-muted-foreground">
                          Added {new Date(question.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {questions.length === 0 && !loading && (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">No questions found with current filters</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-6">
            <Button
              variant="outline"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              Previous
            </Button>
            <span className="px-4">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              Next
            </Button>
          </div>
        )}
      </div>

      {/* Bulk Action Preview Dialog */}
      <Dialog open={showBulkPreview} onOpenChange={setShowBulkPreview}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {bulkAction === "approve" ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <XCircle className="h-5 w-5 text-destructive" />
              )}
              Confirm Bulk {bulkAction === "approve" ? "Approval" : "Rejection"}
            </DialogTitle>
            <DialogDescription>
              You are about to {bulkAction} {selectedQuestions.size} questions. Please review before confirming.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {questions
              .filter(q => selectedQuestions.has(q.id))
              .map((q, idx) => (
                <Card key={q.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start gap-2">
                      <Badge variant="outline" className="mt-1">{idx + 1}</Badge>
                      <div className="flex-1 space-y-1">
                        <p className="text-sm font-medium leading-tight">
                          {q.question.length > 100 ? q.question.substring(0, 100) + "..." : q.question}
                        </p>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">{modules.find(m => m.id === q.module)?.name}</Badge>
                          {getConfidenceBadge(q.confidence_score)}
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkPreview(false)}>
              Cancel
            </Button>
            <Button
              onClick={confirmBulkAction}
              variant={bulkAction === "approve" ? "default" : "destructive"}
              className="gap-2"
            >
              {bulkAction === "approve" ? (
                <>
                  <CheckCircle className="h-4 w-4" />
                  Approve {selectedQuestions.size} Questions
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4" />
                  Reject {selectedQuestions.size} Questions
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}