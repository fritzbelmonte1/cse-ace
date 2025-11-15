import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Upload, Trash2, RefreshCw, Loader2, CheckCircle2, FileUp, XCircle, Clock } from "lucide-react";
import { ProcessingStatusBadge } from "@/components/ProcessingStatusBadge";

const AdminUpload = () => {
  const navigate = useNavigate();
  const [inputMethod, setInputMethod] = useState<"file" | "paste">("file");
  const [file, setFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState("");
  const [purpose, setPurpose] = useState<"questions" | "rag">("questions");
  const [module, setModule] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState("");
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiParsing, setAiParsing] = useState(false);

  useEffect(() => {
    fetchDocuments();

    // Set up realtime subscription for document updates
    const channel = supabase
      .channel('documents-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'documents'
        },
        (payload) => {
          console.log('Document update:', payload);
          fetchDocuments();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchDocuments = async () => {
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDocuments(data || []);
    } catch (error: any) {
      console.error('Error fetching documents:', error);
      toast.error("Failed to load documents");
    } finally {
      setLoading(false);
    }
  };

  const parseStructuredQuestions = (text: string) => {
    const questions: any[] = [];
    const invalidBlocks: string[] = [];
    
    // Split by each new question starting with Q (case-insensitive). If not present, we'll still try to infer.
    const questionBlocks = text.split(/(?=^\s*Q\s*[:\.])/gim).filter(block => block.trim());
    
    console.log('Found question blocks:', questionBlocks.length);
    
    if (questionBlocks.length === 0) {
      toast.error("No questions found. Please follow the format: Q: Question text, A. Option A, B. Option B, C. Option C, D. Option D, Correct: A");
      return { success: false, questions: [], invalidBlocks: ["No valid question format detected"] };
    }

    for (let i = 0; i < questionBlocks.length; i++) {
      const block = questionBlocks[i];
      const rawLines = block.split('\n');
      const lines = rawLines.map(l => l.trim()).filter(l => l);
      const question: any = {};

      const isOptionLine = (l: string) => /^[ABCD][).:\-]?\s*/i.test(l);
      const stripLabel = (label: string, l: string) => l.replace(new RegExp(`^${label}[).:\\-]?\\s*`, 'i'), '').trim();

      for (const line of lines) {
        if (/^Q[.:]?\s*/i.test(line)) {
          question.question = stripLabel('Q', line);
        } else if (/^A[).:\-]?\s*/i.test(line)) {
          question.option_a = stripLabel('A', line);
        } else if (/^B[).:\-]?\s*/i.test(line)) {
          question.option_b = stripLabel('B', line);
        } else if (/^C[).:\-]?\s*/i.test(line)) {
          question.option_c = stripLabel('C', line);
        } else if (/^D[).:\-]?\s*/i.test(line)) {
          question.option_d = stripLabel('D', line);
        } else if (/^(Correct|Answer)[.:]?\s*/i.test(line)) {
          const answer = line.replace(/^(Correct|Answer)[.:]?\s*/i, '').trim().toUpperCase();
          question.correct_answer = answer.charAt(0);
        } else {
          // Fallback: capture first non-option/answer line as question if none found yet
          if (!question.question && !isOptionLine(line) && !/^(Correct|Answer)/i.test(line)) {
            question.question = line.trim();
          }
          // Fallback: detect correct answer if line mentions 'correct' and has A-D
          if (!question.correct_answer) {
            const m = line.match(/(Correct|Answer)[^A-D]*([A-D])/i);
            if (m) question.correct_answer = m[2].toUpperCase();
          }
        }
      }

      // Allow incomplete questions through, just log warnings
      const hasAllFields = question.question && question.option_a && question.option_b && question.option_c && question.option_d;
      const hasValidAnswer = question.correct_answer && /^[ABCD]$/i.test(question.correct_answer);

      if (!hasAllFields || !hasValidAnswer) {
        const missing = [];
        if (!question.question) missing.push("Question text");
        if (!question.option_a) missing.push("Option A");
        if (!question.option_b) missing.push("Option B");
        if (!question.option_c) missing.push("Option C");
        if (!question.option_d) missing.push("Option D");
        if (!hasValidAnswer) missing.push("Correct answer");
        
        invalidBlocks.push(`Block ${i + 1}: Missing ${missing.join(", ")}`);
        console.log(`Question ${i + 1} has issues:`, { hasAllFields, hasValidAnswer, missing, question });
      }
      
      // Add question regardless of validation issues
      questions.push(question);
      console.log(`Question ${i + 1} added to upload queue`);
    }

    if (invalidBlocks.length > 0) {
      console.warn('Questions with issues:', invalidBlocks);
      toast.warning(`${invalidBlocks.length} questions have missing fields but will be uploaded anyway.`, {
        description: invalidBlocks.slice(0, 3).join("; "),
        duration: 6000
      });
    }

    return { success: true, questions, invalidBlocks };
  };

  const handleAiParse = async () => {
    if (!pastedText.trim()) {
      toast.error("Please paste some content first");
      return;
    }

    if (!module) {
      toast.error("Please select a module");
      return;
    }

    setAiParsing(true);
    setUploadStatus("AI is parsing questions...");

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Please log in first");
        navigate("/auth");
        return;
      }

      const { data, error } = await supabase.functions.invoke('parse-questions-ai', {
        body: { text: pastedText, module }
      });

      if (error) {
        console.error('AI parsing error:', error);
        if (error.message.includes('Rate limit')) {
          toast.error("AI rate limit reached. Please try again in a moment.");
        } else if (error.message.includes('credits')) {
          toast.error("AI credits exhausted. Please add credits to continue.");
        } else {
          toast.error("Failed to parse questions with AI");
        }
        return;
      }

      if (!data?.questions || data.questions.length === 0) {
        toast.error("No questions found by AI. Please check the text format.");
        return;
      }

      console.log(`AI extracted ${data.questions.length} questions`);

      // Create document record
      setUploadStatus("Saving parsed questions...");
      const { data: docData, error: docError } = await supabase
        .from('documents')
        .insert({
          uploaded_by: user.id,
          file_name: `ai-parsed-${Date.now()}.txt`,
          file_path: '',
          purpose: 'questions',
          module,
          processed: true,
          processing_status: 'completed'
        })
        .select()
        .maybeSingle();

      if (docError || !docData) throw docError || new Error('Failed to create document record');

      // Prepare questions for insertion
      const questionsToInsert = data.questions.map((q: any) => {
        const hasAllFields = !!(q.question && q.option_a && q.option_b && q.option_c && q.option_d);
        const validAnswer = !!q.correct_answer && /^[ABCD]$/i.test(q.correct_answer);
        const status = (hasAllFields && validAnswer) ? 'approved' : 'pending';
        
        return {
          question: q.question || '[Missing question]',
          option_a: q.option_a || '',
          option_b: q.option_b || '',
          option_c: q.option_c || '',
          option_d: q.option_d || '',
          correct_answer: validAnswer ? q.correct_answer.toUpperCase() : '',
          module,
          document_id: docData.id,
          status,
          confidence_score: 1.0
        };
      });

      const { error: insertError } = await supabase
        .from('extracted_questions')
        .insert(questionsToInsert);

      if (insertError) throw insertError;

      const approvedCount = questionsToInsert.filter(q => q.status === 'approved').length;
      const pendingCount = questionsToInsert.filter(q => q.status === 'pending').length;

      toast.success(`AI extracted ${data.questions.length} questions!`, {
        description: pendingCount > 0 
          ? `${approvedCount} approved, ${pendingCount} pending review` 
          : 'All questions approved and ready'
      });

      setPastedText("");
      setUploadStatus("");

    } catch (error: any) {
      console.error('Error in AI parsing:', error);
      toast.error("Failed to parse with AI: " + error.message);
    } finally {
      setAiParsing(false);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (inputMethod === "file" && !file) {
      toast.error("Please select a file");
      return;
    }

    if (inputMethod === "paste" && !pastedText.trim()) {
      toast.error("Please paste some content");
      return;
    }

    if (purpose === "questions" && !module) {
      toast.error("Please select a module for questions");
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Please log in first");
        navigate("/auth");
        return;
      }

      // Handle structured question paste - direct upload without AI extraction
      if (purpose === "questions" && inputMethod === "paste") {
        setUploadStatus("Parsing structured questions...");
        setUploadProgress(30);

        const parseResult = parseStructuredQuestions(pastedText);

        if (parseResult.questions.length === 0) {
          toast.error("No questions could be extracted from the pasted text.");
          setUploading(false);
          return;
        }
        
        console.log(`Successfully parsed ${parseResult.questions.length} questions`);

        // Create a document record representing this pasted batch
        setUploadStatus("Creating document record for pasted questions...");
        setUploadProgress(50);

        const { data: docData, error: docError } = await supabase
          .from('documents')
          .insert({
            uploaded_by: user.id,
            file_name: `pasted-questions-${Date.now()}.txt`,
            file_path: '',
            purpose: 'questions',
            module,
            processed: true,
            processing_status: 'completed'
          })
          .select()
          .maybeSingle();

        if (docError || !docData) throw docError || new Error('Failed to create document record');

        setUploadStatus("Uploading questions to database...");
        setUploadProgress(70);

        const questionsToInsert = parseResult.questions.map((q) => {
          const normalize = (v?: string) => (typeof v === 'string' ? v : '');
          const validAnswer = !!q.correct_answer && /^[ABCD]$/i.test(q.correct_answer);
          const hasAllFields = !!(q.question && q.option_a && q.option_b && q.option_c && q.option_d);
          // Auto-approve complete questions uploaded by admin, mark incomplete as pending
          const status = (hasAllFields && validAnswer) ? 'approved' : 'pending';
          return {
            question: normalize(q.question) || '[Missing question]',
            option_a: normalize(q.option_a),
            option_b: normalize(q.option_b),
            option_c: normalize(q.option_c),
            option_d: normalize(q.option_d),
            correct_answer: validAnswer ? q.correct_answer.toUpperCase() : '',
            module,
            document_id: docData.id,
            status,
            confidence_score: 1.0
          };
        });

        const { error: insertError } = await supabase
          .from('extracted_questions')
          .insert(questionsToInsert);

        if (insertError) throw insertError;

        setUploadProgress(100);
        const approvedCount = questionsToInsert.filter(q => q.status === 'approved').length;
        const pendingCount = questionsToInsert.filter(q => q.status === 'pending').length;
        
        toast.success(`Successfully uploaded ${parseResult.questions.length} questions`, {
          description: pendingCount > 0 
            ? `${approvedCount} approved, ${pendingCount} pending review (missing fields)` 
            : 'All questions approved and ready for practice'
        });
        setPastedText("");
        setUploading(false);
        return;
      }

      let fileName: string;
      let fileToUpload: File;

      if (inputMethod === "paste") {
        // Create a text file from pasted content
        setUploadStatus("Creating file from pasted content...");
        setUploadProgress(10);
        
        const blob = new Blob([pastedText], { type: 'text/plain' });
        const timestamp = Date.now();
        fileToUpload = new File([blob], `pasted-content-${timestamp}.txt`, { type: 'text/plain' });
        fileName = `public/${timestamp}-pasted-content.txt`;
      } else {
        // Use uploaded file
        setUploadStatus("Uploading file to storage...");
        setUploadProgress(10);
        fileToUpload = file!;
        fileName = `public/${Date.now()}-${file!.name}`;
      }
      
      setUploadProgress(25);
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('cse-documents')
        .upload(fileName, fileToUpload, {
          contentType: fileToUpload.type,
          upsert: false
        });

      if (uploadError) throw uploadError;
      
      setUploadProgress(50);

      // Step 2: Create document record (50-70%)
      setUploadStatus("Creating document record...");
      
      const { data: docData, error: docError } = await supabase
        .from('documents')
        .insert({
          uploaded_by: user.id,
          file_name: inputMethod === "paste" ? fileToUpload.name : file!.name,
          file_path: fileName,
          purpose: purpose,
          module: module || null,
          processed: false,
          processing_status: 'pending'
        })
        .select()
        .single();

      if (docError) throw docError;
      
      setUploadProgress(70);

      // Step 3: Trigger processing (70-100%)
      setUploadStatus("Processing document...");
      
      await supabase.functions.invoke('process-document', {
        body: { documentId: docData.id }
      });

      setUploadProgress(100);
      setUploadStatus("Complete!");

      toast.success("Document uploaded and processing started!");
      
      // Reset after a brief delay
      setTimeout(() => {
        setFile(null);
        setPastedText("");
        setPurpose("questions");
        setModule("");
        setUploadProgress(0);
        setUploadStatus("");
        fetchDocuments();
      }, 1000);

    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(error.message || "Failed to upload document");
      setUploadProgress(0);
      setUploadStatus("");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (documentId: string) => {
    if (!confirm("Are you sure you want to delete this document?")) return;

    try {
      const { data, error } = await supabase.functions.invoke('delete-document', {
        body: { documentId },
      });

      if (error) {
        throw new Error(error.message || 'Delete failed');
      }

      toast.success("Document deleted successfully!");
      fetchDocuments();
    } catch (error: any) {
      console.error('Delete error:', error);
      toast.error(error.message || "Failed to delete document");
    }
  };

  const handleReprocess = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('reprocess-rag-documents');

      if (error) {
        throw new Error(error.message || 'Reprocess failed');
      }

      toast.success("Documents reprocessed successfully");
      fetchDocuments();
    } catch (error: any) {
      console.error('Reprocess error:', error);
      toast.error(error.message || "Failed to reprocess documents");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted p-4">
      <div className="container max-w-6xl mx-auto py-8">
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
          
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/admin/questions")}>
              Review Questions
            </Button>
            <Button variant="outline" onClick={() => navigate("/admin/users")}>
              Manage Users
            </Button>
            <Button variant="outline" onClick={() => navigate("/admin/settings")}>
              Settings
            </Button>
          </div>
        </div>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Upload Document</CardTitle>
            <CardDescription>Upload documents or paste content for question extraction or RAG knowledge base</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpload} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Purpose</label>
                <Select value={purpose} onValueChange={(val: any) => setPurpose(val)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="questions">Extract Questions</SelectItem>
                    <SelectItem value="rag">RAG Knowledge Base</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {purpose === "questions" && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Module</label>
                  <Select value={module} onValueChange={setModule}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select module" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="vocabulary">Vocabulary</SelectItem>
                      <SelectItem value="analogy">Analogy</SelectItem>
                      <SelectItem value="reading">Reading Comprehension</SelectItem>
                      <SelectItem value="numerical">Numerical Ability</SelectItem>
                      <SelectItem value="clerical">Clerical Ability</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Tabs value={inputMethod} onValueChange={(v) => setInputMethod(v as "file" | "paste")} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="file">Upload File</TabsTrigger>
                  <TabsTrigger value="paste">Paste Content</TabsTrigger>
                </TabsList>
                
                <TabsContent value="file" className="space-y-2">
                  <label className="text-sm font-medium">File</label>
                  <Input
                    type="file"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    accept=".pdf,.txt,.doc,.docx"
                    disabled={uploading}
                  />
                </TabsContent>
                
                <TabsContent value="paste" className="space-y-2">
                  <label className="text-sm font-medium">Paste Content</label>
                  {purpose === "questions" ? (
                    <>
                      <div className="text-xs text-muted-foreground mb-2 p-3 bg-muted rounded-md">
                        <p className="font-medium mb-1">Format for structured questions:</p>
                        <pre className="text-xs">
Q: Your question text here?{'\n'}A: Option A text{'\n'}B: Option B text{'\n'}C: Option C text{'\n'}D: Option D text{'\n'}Correct: A{'\n\n'}Q: Next question...
                        </pre>
                        <p className="mt-2 text-primary font-medium">✨ Or use AI to automatically parse any format!</p>
                      </div>
                      <Textarea
                        value={pastedText}
                        onChange={(e) => setPastedText(e.target.value)}
                        placeholder="Q: What is the capital of France?&#10;A: London&#10;B: Paris&#10;C: Berlin&#10;D: Madrid&#10;Correct: B&#10;&#10;Q: Next question..."
                        disabled={uploading || aiParsing}
                        className="min-h-[200px] font-mono text-sm"
                      />
                      {pastedText.trim() && module && (
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={handleAiParse}
                          disabled={aiParsing || uploading}
                          className="w-full"
                        >
                          {aiParsing ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              AI Parsing Questions...
                            </>
                          ) : (
                            <>
                              ✨ Parse with AI (Gemini)
                            </>
                          )}
                        </Button>
                      )}
                    </>
                  ) : (
                    <Textarea
                      value={pastedText}
                      onChange={(e) => setPastedText(e.target.value)}
                      placeholder="Paste your document content here for RAG processing..."
                      disabled={uploading}
                      className="min-h-[200px] font-mono text-sm"
                    />
                  )}
                </TabsContent>
              </Tabs>

              {uploading && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{uploadStatus}</span>
                    <span className="font-medium">{uploadProgress}%</span>
                  </div>
                  <Progress value={uploadProgress} className="h-2" />
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {uploadProgress < 50 && (
                      <>
                        <FileUp className="h-3 w-3 animate-pulse" />
                        <span>Uploading file...</span>
                      </>
                    )}
                    {uploadProgress >= 50 && uploadProgress < 100 && (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span>Processing document...</span>
                      </>
                    )}
                    {uploadProgress === 100 && (
                      <>
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                        <span className="text-green-500">Upload complete!</span>
                      </>
                    )}
                  </div>
                </div>
              )}

              <Button type="submit" disabled={uploading || aiParsing || (inputMethod === "file" && !file) || (inputMethod === "paste" && !pastedText.trim())}>
                {uploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    {inputMethod === "paste" && purpose === "questions" ? "Parse Structured Format" : "Upload Document"}
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Uploaded Documents</CardTitle>
                <CardDescription>Manage your uploaded documents</CardDescription>
              </div>
              <Button variant="outline" onClick={handleReprocess}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Reprocess Failed
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
              </div>
            ) : documents.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No documents uploaded yet</p>
            ) : (
              <div className="space-y-2">
                {documents.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium">{doc.file_name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-sm text-muted-foreground">
                          {doc.purpose} • {doc.module || 'N/A'}
                        </p>
                        <ProcessingStatusBadge 
                          status={doc.processing_status || 'pending'} 
                          errorMessage={doc.error_message}
                        />
                      </div>
                    </div>
                    <Button variant="destructive" size="icon" onClick={() => handleDelete(doc.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminUpload;