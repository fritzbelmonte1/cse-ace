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
    
    // Split by double newlines or Q: pattern for new questions
    const questionBlocks = text.split(/(?=Q:)/i).filter(block => block.trim());
    
    console.log('Found question blocks:', questionBlocks.length);

    for (let i = 0; i < questionBlocks.length; i++) {
      const block = questionBlocks[i];
      const lines = block.split('\n').map(l => l.trim()).filter(l => l);
      const question: any = {};

      for (const line of lines) {
        if (line.match(/^Q[:\.]?\s*/i)) {
          question.question = line.replace(/^Q[:\.]?\s*/i, '').trim();
        } else if (line.match(/^A[:\.]?\s*/i)) {
          question.option_a = line.replace(/^A[:\.]?\s*/i, '').trim();
        } else if (line.match(/^B[:\.]?\s*/i)) {
          question.option_b = line.replace(/^B[:\.]?\s*/i, '').trim();
        } else if (line.match(/^C[:\.]?\s*/i)) {
          question.option_c = line.replace(/^C[:\.]?\s*/i, '').trim();
        } else if (line.match(/^D[:\.]?\s*/i)) {
          question.option_d = line.replace(/^D[:\.]?\s*/i, '').trim();
        } else if (line.match(/^(Correct|Answer)[:\.]?\s*/i)) {
          const answer = line.replace(/^(Correct|Answer)[:\.]?\s*/i, '').trim().toUpperCase();
          question.correct_answer = answer.charAt(0); // Take first character in case they write "A)" or "A."
        }
      }

      // Validate question has all required fields
      const hasAllFields = question.question && question.option_a && question.option_b && 
          question.option_c && question.option_d && question.correct_answer;
      const hasValidAnswer = ['A', 'B', 'C', 'D'].includes(question.correct_answer);
      
      if (hasAllFields && hasValidAnswer) {
        questions.push(question);
        console.log(`Question ${i + 1} parsed successfully`);
      } else {
        invalidBlocks.push(`Block ${i + 1}: Missing or invalid fields`);
        console.log(`Question ${i + 1} invalid:`, { hasAllFields, hasValidAnswer, question });
      }
    }

    if (invalidBlocks.length > 0) {
      console.warn('Invalid question blocks:', invalidBlocks);
    }

    return questions;
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

        const parsedQuestions = parseStructuredQuestions(pastedText);

        if (parsedQuestions.length === 0) {
          toast.error("No valid questions found. Please check the format. Each question needs Q:, A:, B:, C:, D:, and Correct: fields. Check the console for details.");
          setUploading(false);
          return;
        }
        
        console.log(`Successfully parsed ${parsedQuestions.length} questions`);

        setUploadStatus("Uploading questions to database...");
        setUploadProgress(60);

        // Insert questions directly into extracted_questions table
        const questionsToInsert = parsedQuestions.map(q => ({
          question: q.question,
          option_a: q.option_a,
          option_b: q.option_b,
          option_c: q.option_c,
          option_d: q.option_d,
          correct_answer: q.correct_answer,
          module,
          document_id: '00000000-0000-0000-0000-000000000000', // Placeholder for manual uploads
          status: 'pending',
          confidence_score: 1.0
        }));

        const { error: insertError } = await supabase
          .from('extracted_questions')
          .insert(questionsToInsert);

        if (insertError) throw insertError;

        setUploadProgress(100);
        toast.success(`Successfully uploaded ${parsedQuestions.length} questions`);
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
                      </div>
                      <Textarea
                        value={pastedText}
                        onChange={(e) => setPastedText(e.target.value)}
                        placeholder="Q: What is the capital of France?&#10;A: London&#10;B: Paris&#10;C: Berlin&#10;D: Madrid&#10;Correct: B&#10;&#10;Q: Next question..."
                        disabled={uploading}
                        className="min-h-[200px] font-mono text-sm"
                      />
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

              <Button type="submit" disabled={uploading || (inputMethod === "file" && !file) || (inputMethod === "paste" && !pastedText.trim())}>
                {uploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload Document
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