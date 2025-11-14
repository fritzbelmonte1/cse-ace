import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, Sparkles, FileText } from "lucide-react";
import { Input } from "@/components/ui/input";

interface FlashcardImportProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const modules = [
  { id: "vocabulary", name: "Vocabulary" },
  { id: "analogy", name: "Analogy" },
  { id: "reading", name: "Reading Comprehension" },
  { id: "numerical", name: "Numerical Ability" },
  { id: "clerical", name: "Clerical Ability" },
];

export const FlashcardImport = ({ open, onOpenChange, onSuccess }: FlashcardImportProps) => {
  const [selectedModule, setSelectedModule] = useState("");
  const [studyText, setStudyText] = useState("");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const handleGenerateFromText = async () => {
    if (!selectedModule || !studyText.trim()) {
      toast.error("Please select a module and enter study material");
      return;
    }

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-flashcards", {
        body: {
          text: studyText,
          module: selectedModule,
        },
      });

      if (error) throw error;

      if (data.error) {
        throw new Error(data.error);
      }

      toast.success(`Generated ${data.count} flashcards successfully!`);
      onSuccess();
      onOpenChange(false);
      setStudyText("");
      setSelectedModule("");
    } catch (error: any) {
      console.error("Error generating flashcards:", error);
      toast.error(error.message || "Failed to generate flashcards");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCSVImport = async () => {
    if (!csvFile) {
      toast.error("Please select a CSV file");
      return;
    }

    setIsImporting(true);
    try {
      const text = await csvFile.text();
      const lines = text.split("\n").filter(line => line.trim());
      
      if (lines.length < 2) {
        throw new Error("CSV file is empty or invalid");
      }

      // Parse CSV (assumes: module,question,answer format)
      const headers = lines[0].toLowerCase().split(",").map(h => h.trim());
      const moduleIndex = headers.indexOf("module");
      const questionIndex = headers.indexOf("question");
      const answerIndex = headers.indexOf("answer");

      if (moduleIndex === -1 || questionIndex === -1 || answerIndex === -1) {
        throw new Error("CSV must have 'module', 'question', and 'answer' columns");
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const flashcards = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(",").map(v => v.trim().replace(/^"|"$/g, ""));
        if (values.length >= 3) {
          flashcards.push({
            user_id: user.id,
            module: values[moduleIndex],
            question: values[questionIndex],
            answer: values[answerIndex],
          });
        }
      }

      if (flashcards.length === 0) {
        throw new Error("No valid flashcards found in CSV");
      }

      const { error } = await supabase.from("flashcards").insert(flashcards);

      if (error) throw error;

      toast.success(`Imported ${flashcards.length} flashcards successfully!`);
      onSuccess();
      onOpenChange(false);
      setCsvFile(null);
    } catch (error: any) {
      console.error("Error importing CSV:", error);
      toast.error(error.message || "Failed to import flashcards");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Flashcards</DialogTitle>
          <DialogDescription>
            Generate flashcards from study materials or import from CSV
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="generate" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="generate">
              <Sparkles className="mr-2 h-4 w-4" />
              AI Generate
            </TabsTrigger>
            <TabsTrigger value="csv">
              <Upload className="mr-2 h-4 w-4" />
              CSV Import
            </TabsTrigger>
          </TabsList>

          <TabsContent value="generate" className="space-y-4">
            <div>
              <Label htmlFor="gen-module">Module</Label>
              <Select value={selectedModule} onValueChange={setSelectedModule}>
                <SelectTrigger id="gen-module">
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
              <Label htmlFor="study-text">Study Material</Label>
              <Textarea
                id="study-text"
                value={studyText}
                onChange={(e) => setStudyText(e.target.value)}
                placeholder="Paste your study notes, textbook content, or any material you want to create flashcards from..."
                rows={12}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-2">
                AI will analyze the text and generate 10-15 flashcards covering key concepts
              </p>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleGenerateFromText}
                disabled={isGenerating || !selectedModule || !studyText.trim()}
              >
                {isGenerating ? (
                  <>Generating...</>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate Flashcards
                  </>
                )}
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="csv" className="space-y-4">
            <div className="space-y-4">
              <div>
                <Label htmlFor="csv-file">CSV File</Label>
                <Input
                  id="csv-file"
                  type="file"
                  accept=".csv"
                  onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                />
                <p className="text-xs text-muted-foreground mt-2">
                  CSV must have columns: module, question, answer
                </p>
              </div>

              <div className="bg-muted p-4 rounded-lg space-y-2">
                <div className="flex items-start gap-2">
                  <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div className="space-y-1 text-sm">
                    <p className="font-medium">CSV Format Example:</p>
                    <pre className="text-xs bg-background p-2 rounded overflow-x-auto">
{`module,question,answer
vocabulary,"What does 'ubiquitous' mean?","Present everywhere"
vocabulary,"Define 'ephemeral'","Lasting for a very short time"
analogy,"Hot is to Cold as...","Light is to Dark"`}
                    </pre>
                  </div>
                </div>
              </div>

              {csvFile && (
                <div className="text-sm text-muted-foreground">
                  Selected file: {csvFile.name} ({(csvFile.size / 1024).toFixed(2)} KB)
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCSVImport}
                disabled={isImporting || !csvFile}
              >
                {isImporting ? (
                  <>Importing...</>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Import CSV
                  </>
                )}
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
