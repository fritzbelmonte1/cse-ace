import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { ArrowLeft, Upload, Trash2, RefreshCw, Loader2, CheckCircle2, FileUp } from "lucide-react";

const AdminUpload = () => {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [purpose, setPurpose] = useState<"questions" | "rag">("questions");
  const [module, setModule] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState("");
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDocuments();
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

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!file) {
      toast.error("Please select a file");
      return;
    }

    if (purpose === "questions" && !module) {
      toast.error("Please select a module for questions");
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      // Step 1: Upload to storage (0-50%)
      setUploadStatus("Uploading file to storage...");
      setUploadProgress(10);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Please log in first");
        navigate("/auth");
        return;
      }

      const fileName = `public/${Date.now()}-${file.name}`;
      
      setUploadProgress(25);
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('cse-documents')
        .upload(fileName, file, {
          contentType: file.type,
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
          file_name: file.name,
          file_path: fileName,
          purpose: purpose,
          module: module || null,
          processed: false
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
            <CardDescription>Upload documents for questions or RAG knowledge base</CardDescription>
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

              <div className="space-y-2">
                <label className="text-sm font-medium">File</label>
                <Input
                  type="file"
                  accept=".pdf,.txt,.doc,.docx"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  disabled={uploading}
                />
              </div>

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

              <Button type="submit" disabled={uploading || !file}>
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
                    <div>
                      <p className="font-medium">{doc.file_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {doc.purpose} • {doc.module || 'N/A'} • {doc.processed ? 'Processed' : 'Processing...'}
                      </p>
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