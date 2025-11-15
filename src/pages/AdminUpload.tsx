import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Upload, Trash2, RefreshCw, Loader2 } from "lucide-react";

const AdminUpload = () => {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [purpose, setPurpose] = useState<"questions" | "rag">("questions");
  const [module, setModule] = useState("");
  const [uploading, setUploading] = useState(false);
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

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast.error("Please log in first");
        navigate("/auth");
        return;
      }

      const formData = new FormData();
      formData.append('file', file);
      formData.append('purpose', purpose);
      formData.append('module', module || 'general');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-document`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: formData,
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Upload failed');
      }

      toast.success("Document uploaded successfully!");
      setFile(null);
      setPurpose("questions");
      setModule("");
      fetchDocuments();
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(error.message || "Failed to upload document");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (documentId: string) => {
    if (!confirm("Are you sure you want to delete this document?")) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast.error("Please log in first");
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-document`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ documentId }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Delete failed');
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
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast.error("Please log in first");
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reprocess-rag-documents`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Reprocess failed');
      }

      toast.success(result.message);
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