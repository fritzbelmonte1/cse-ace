import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Loader2, Search, Filter } from "lucide-react";
import { Navigation } from "@/components/Navigation";

const modules = [
  { id: "vocabulary", name: "Vocabulary", icon: "📚" },
  { id: "analogy", name: "Analogy", icon: "🔗" },
  { id: "reading", name: "Reading Comprehension", icon: "📖" },
  { id: "numerical", name: "Numerical Ability", icon: "🔢" },
  { id: "clerical", name: "Clerical Ability", icon: "📋" },
];

const AdminRecategorize = () => {
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<any[]>([]);
  const [filteredQuestions, setFilteredQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [newModule, setNewModule] = useState("");
  const [updating, setUpdating] = useState(false);
  const [filterModule, setFilterModule] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    checkAdminAndFetchQuestions();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [questions, filterModule, filterStatus, searchQuery]);

  const checkAdminAndFetchQuestions = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle();

      if (!roleData) {
        toast.error("Unauthorized access");
        navigate("/dashboard");
        return;
      }

      await fetchQuestions();
    } catch (error: any) {
      console.error('Error checking admin status:', error);
      toast.error("Failed to verify admin access");
      navigate("/dashboard");
    }
  };

  const fetchQuestions = async () => {
    try {
      const { data, error } = await supabase
        .from('extracted_questions')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setQuestions(data || []);
    } catch (error: any) {
      console.error('Error fetching questions:', error);
      toast.error("Failed to load questions");
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...questions];

    if (filterModule !== "all") {
      filtered = filtered.filter(q => q.module === filterModule);
    }

    if (filterStatus !== "all") {
      filtered = filtered.filter(q => q.status === filterStatus);
    }

    if (searchQuery.trim()) {
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

  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredQuestions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredQuestions.map(q => q.id)));
    }
  };

  const handleBulkRecategorize = async () => {
    if (selectedIds.size === 0) {
      toast.error("Please select at least one question");
      return;
    }

    if (!newModule) {
      toast.error("Please select a new module category");
      return;
    }

    setUpdating(true);

    try {
      const selectedIdsArray = Array.from(selectedIds);
      
      const { error } = await supabase
        .from('extracted_questions')
        .update({ module: newModule })
        .in('id', selectedIdsArray);

      if (error) throw error;

      toast.success(`Successfully recategorized ${selectedIds.size} question(s)`, {
        description: `Updated to ${modules.find(m => m.id === newModule)?.name}`
      });

      setSelectedIds(new Set());
      setNewModule("");
      await fetchQuestions();
    } catch (error: any) {
      console.error('Error updating questions:', error);
      toast.error("Failed to recategorize questions");
    } finally {
      setUpdating(false);
    }
  };

  const getModuleBadge = (moduleId: string) => {
    const module = modules.find(m => m.id === moduleId);
    return (
      <Badge variant="outline" className="gap-1">
        <span>{module?.icon}</span>
        <span>{module?.name || moduleId}</span>
      </Badge>
    );
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive"> = {
      approved: "default",
      pending: "secondary",
      rejected: "destructive"
    };
    return <Badge variant={variants[status] || "secondary"}>{status}</Badge>;
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading questions...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted p-4">
        <div className="container max-w-7xl mx-auto py-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <Button variant="ghost" onClick={() => navigate("/admin/upload")} className="mb-2">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Admin Panel
              </Button>
              <h1 className="text-3xl font-bold">Bulk Question Recategorization</h1>
              <p className="text-muted-foreground mt-1">Select questions and change their module category</p>
            </div>
          </div>

          <div className="grid gap-6 mb-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Filter className="h-5 w-5" />
                  Filters & Actions
                </CardTitle>
                <CardDescription>Filter questions and perform bulk recategorization</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Search</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search questions..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Filter by Module</label>
                    <Select value={filterModule} onValueChange={setFilterModule}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Modules</SelectItem>
                        {modules.map(m => (
                          <SelectItem key={m.id} value={m.id}>{m.icon} {m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Filter by Status</label>
                    <Select value={filterStatus} onValueChange={setFilterStatus}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="approved">Approved</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="rejected">Rejected</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">New Module</label>
                    <Select value={newModule} onValueChange={setNewModule}>
                      <SelectTrigger className={!newModule && selectedIds.size > 0 ? "border-destructive/50" : ""}>
                        <SelectValue placeholder="Select new category" />
                      </SelectTrigger>
                      <SelectContent>
                        {modules.map(m => (
                          <SelectItem key={m.id} value={m.id}>{m.icon} {m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t">
                  <div className="text-sm text-muted-foreground">
                    {selectedIds.size > 0 ? (
                      <span className="font-medium text-foreground">
                        {selectedIds.size} question{selectedIds.size !== 1 ? 's' : ''} selected
                      </span>
                    ) : (
                      <span>No questions selected</span>
                    )}
                    {filteredQuestions.length > 0 && (
                      <span className="ml-2">
                        (Showing {filteredQuestions.length} of {questions.length} total)
                      </span>
                    )}
                  </div>

                  <Button
                    onClick={handleBulkRecategorize}
                    disabled={selectedIds.size === 0 || !newModule || updating}
                  >
                    {updating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Recategorize {selectedIds.size > 0 ? `${selectedIds.size} Question${selectedIds.size !== 1 ? 's' : ''}` : ''}
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Questions ({filteredQuestions.length})</CardTitle>
                <CardDescription>Select questions to recategorize</CardDescription>
              </CardHeader>
              <CardContent>
                {filteredQuestions.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <p>No questions found matching your filters</p>
                  </div>
                ) : (
                  <div className="border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">
                            <Checkbox
                              checked={selectedIds.size === filteredQuestions.length && filteredQuestions.length > 0}
                              onCheckedChange={toggleSelectAll}
                            />
                          </TableHead>
                          <TableHead>Question</TableHead>
                          <TableHead className="w-32">Module</TableHead>
                          <TableHead className="w-28">Status</TableHead>
                          <TableHead className="w-24">Answer</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredQuestions.map((question) => (
                          <TableRow key={question.id}>
                            <TableCell>
                              <Checkbox
                                checked={selectedIds.has(question.id)}
                                onCheckedChange={() => toggleSelection(question.id)}
                              />
                            </TableCell>
                            <TableCell>
                              <div className="max-w-xl">
                                <p className="font-medium line-clamp-2">{question.question}</p>
                                <div className="grid grid-cols-2 gap-1 mt-2 text-xs text-muted-foreground">
                                  <p>A: {question.option_a}</p>
                                  <p>B: {question.option_b}</p>
                                  <p>C: {question.option_c}</p>
                                  <p>D: {question.option_d}</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>{getModuleBadge(question.module)}</TableCell>
                            <TableCell>{getStatusBadge(question.status)}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{question.correct_answer}</Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
};

export default AdminRecategorize;
