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
import { ArrowLeft, Upload, Trash2, RefreshCw, Loader2, CheckCircle2, FileUp, XCircle, Clock, AlertCircle, FileText, Download } from "lucide-react";
import { ProcessingStatusBadge } from "@/components/ProcessingStatusBadge";
import { Navigation } from "@/components/Navigation";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { QuestionImportPreview } from "@/components/QuestionImportPreview";
import { parseCSV, detectColumns, mapRowToQuestion, type ParsedQuestion, type ColumnMapping } from "@/utils/csvParser";

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
  const [showOnlyNeedsReview, setShowOnlyNeedsReview] = useState(false);
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  
  // CSV Import states
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState<string[][]>([]);
  const [columnMapping, setColumnMapping] = useState<Partial<ColumnMapping>>({});
  const [importPreview, setImportPreview] = useState<ParsedQuestion[]>([]);
  const [duplicates, setDuplicates] = useState<Set<number>>(new Set());
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [autoApprove, setAutoApprove] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [csvModule, setCsvModule] = useState("vocabulary");

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

  const handleBulkReprocess = async () => {
    if (selectedDocIds.length === 0) {
      toast.error('No documents selected', {
        description: 'Please select documents to reprocess'
      });
      return;
    }

    setIsReprocessing(true);
    setUploadStatus('Re-evaluating quality scores...');

    try {
      const { data, error } = await supabase.functions.invoke('reprocess-documents', {
        body: { documentIds: selectedDocIds }
      });

      if (error) throw error;

      const results = data.results || [];
      const successCount = results.filter((r: any) => r.success).length;
      const failCount = results.filter((r: any) => !r.success).length;

      await fetchDocuments();
      setSelectedDocIds([]);

      if (successCount > 0) {
        toast.success('Quality Re-evaluation Complete!', {
          description: `✅ ${successCount} documents reprocessed${failCount > 0 ? `\n⚠️ ${failCount} failed` : ''}`
        });
      } else {
        toast.error('Re-evaluation Failed', {
          description: `All ${failCount} documents failed to reprocess`
        });
      }
    } catch (error: any) {
      console.error('Bulk reprocess error:', error);
      toast.error('Re-evaluation Failed', {
        description: error.message || 'Failed to reprocess documents'
      });
    } finally {
      setIsReprocessing(false);
      setUploadStatus('');
    }
  };

  const handleCSVFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setCsvFile(file);
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const rows = parseCSV(text);
      
      if (rows.length < 2) {
        toast.error("CSV file must have at least a header row and one data row");
        return;
      }
      
      const headers = rows[0];
      const mapping = detectColumns(headers);
      
      setColumnMapping(mapping);
      setCsvData(rows);
      
      // Auto-generate preview if mapping is complete
      if (Object.keys(mapping).length >= 7) {
        generatePreview(rows.slice(1), mapping as ColumnMapping);
      } else {
        toast.info("Please verify column mapping", {
          description: "Some columns could not be auto-detected"
        });
      }
    };
    
    reader.readAsText(file);
  };
  
  const generatePreview = async (dataRows: string[][], mapping: ColumnMapping) => {
    const questions: ParsedQuestion[] = [];
    
    for (const row of dataRows) {
      const question = mapRowToQuestion(row, mapping, csvModule);
      if (question) {
        questions.push(question);
      }
    }
    
    setImportPreview(questions);
    
    // Detect duplicates
    await detectDuplicates(questions);
    
    toast.success(`Parsed ${questions.length} valid questions`);
  };
  
  const detectDuplicates = async (questions: ParsedQuestion[]) => {
    const duplicateIndices = new Set<number>();
    
    try {
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        
        const { data: existing } = await supabase
          .from("extracted_questions")
          .select("id")
          .eq("module", q.module)
          .ilike("question", `${q.question.substring(0, 50)}%`)
          .limit(1);
        
        if (existing && existing.length > 0) {
          duplicateIndices.add(i);
        }
      }
      
      setDuplicates(duplicateIndices);
    } catch (error) {
      console.error("Error detecting duplicates:", error);
    }
  };
  
  const handleBulkImport = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Authentication required");
      return;
    }
    
    setImporting(true);
    setImportProgress(0);
    
    const questionsToImport = importPreview.filter((_, idx) => 
      skipDuplicates ? !duplicates.has(idx) : true
    );
    
    if (questionsToImport.length === 0) {
      toast.error("No questions to import");
      setImporting(false);
      return;
    }
    
    const batchSize = 50;
    let imported = 0;
    
    try {
      // Create a placeholder document for CSV imports
      const { data: doc, error: docError } = await supabase
        .from("documents")
        .insert({
          file_name: csvFile?.name || "csv_import.csv",
          file_path: "csv_import",
          purpose: "questions",
          module: csvModule,
          processed: true,
          processing_status: "completed"
        })
        .select()
        .single();
      
      if (docError) throw docError;
      
      for (let i = 0; i < questionsToImport.length; i += batchSize) {
        const batch = questionsToImport.slice(i, i + batchSize);
        
        const { error } = await supabase
          .from("extracted_questions")
          .insert(batch.map(q => ({
            question: q.question,
            option_a: q.option_a,
            option_b: q.option_b,
            option_c: q.option_c,
            option_d: q.option_d,
            correct_answer: q.correct_answer,
            module: q.module,
            confidence_score: q.confidence_score,
            status: autoApprove && q.confidence_score >= 0.95 ? "approved" : "pending",
            document_id: doc.id,
            approved_by: autoApprove && q.confidence_score >= 0.95 ? user.id : null,
            approved_at: autoApprove && q.confidence_score >= 0.95 ? new Date().toISOString() : null
          })));
        
        if (error) throw error;
        
        imported += batch.length;
        setImportProgress((imported / questionsToImport.length) * 100);
        
        toast.loading(`Importing... ${imported}/${questionsToImport.length}`, { id: "import" });
      }
      
      toast.success(`Imported ${imported} questions successfully`, { id: "import" });
      
      // Reset form
      setCsvFile(null);
      setCsvData([]);
      setImportPreview([]);
      setDuplicates(new Set());
      setImportProgress(0);
      
      fetchDocuments();
      
    } catch (error: any) {
      console.error("Import error:", error);
      toast.error("Import failed: " + error.message);
    } finally {
      setImporting(false);
    }
  };
  
  const downloadTemplate = () => {
    const template = `question,option_a,option_b,option_c,option_d,correct_answer,module
"What is the synonym of 'happy'?","Sad","Joyful","Angry","Tired","B","vocabulary"
"What is 2 + 2?","2","3","4","5","C","numerical"
"Which word is a noun?","Run","Quickly","Dog","Beautiful","C","grammar"`;
    
    const blob = new Blob([template], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'question_import_template.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleReprocessAll = async () => {
    setIsReprocessing(true);
    setUploadStatus('Re-evaluating all documents...');

    try {
      const { data, error } = await supabase.functions.invoke('reprocess-documents', {
        body: { documentIds: null }
      });

      if (error) throw error;

      const results = data.results || [];
      const successCount = results.filter((r: any) => r.success).length;
      const failCount = results.filter((r: any) => !r.success).length;

      await fetchDocuments();
      setSelectedDocIds([]);

      if (successCount > 0) {
        toast.success('Bulk Re-evaluation Complete!', {
          description: `✅ ${successCount} documents reprocessed${failCount > 0 ? `\n⚠️ ${failCount} failed` : ''}`
        });
      } else {
        toast.error('Re-evaluation Failed', {
          description: 'No documents were successfully reprocessed'
        });
      }
    } catch (error: any) {
      console.error('Reprocess all error:', error);
      toast.error('Re-evaluation Failed', {
        description: error.message || 'Failed to reprocess documents'
      });
    } finally {
      setIsReprocessing(false);
      setUploadStatus('');
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
    setUploadStatus("AI is analyzing your text with enhanced extraction...");
    setUploadProgress(10);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Please log in first");
        navigate("/auth");
        return;
      }

      // Create document record with quality metrics
      const { data: aiDocData, error: aiDocError } = await supabase
        .from('documents')
        .insert({
          uploaded_by: user.id,
          file_name: `ai-parsed-${Date.now()}.txt`,
          file_path: '',
          purpose: 'questions',
          module,
          processed: false,
          processing_status: 'processing',
        })
        .select()
        .maybeSingle();

      if (aiDocError || !aiDocData) throw aiDocError || new Error('Failed to create document record');

      setUploadProgress(30);
      setUploadStatus("Processing with Phase 3 AI (learning + semantic dedup)...");

      const { data, error } = await supabase.functions.invoke('parse-questions-ai', {
        body: { text: pastedText, module, documentId: aiDocData.id }
      });

      if (error) {
        console.error('AI parsing error:', error);
        // Update document to failed status
        await supabase
          .from('documents')
          .update({
            processed: true,
            processing_status: 'failed',
            error_message: error.message || 'AI parsing failed'
          })
          .eq('id', aiDocData.id);
        
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
        // Update document to failed status
        await supabase
          .from('documents')
          .update({
            processed: true,
            processing_status: 'failed',
            error_message: 'No questions found by AI'
          })
          .eq('id', aiDocData.id);
        
        toast.error("No questions found by AI. Please check the text format.");
        return;
      }

      setUploadProgress(60);

      const metadata = data.metadata || {};
      console.log(`Phase 3 Extraction:`, {
        total: data.questions.length,
        complete: metadata.completeQuestions,
        learnedFromCorrections: metadata.learnedFromCorrections,
        semanticDedup: metadata.semanticDeduplicationApplied,
        resumed: metadata.resumedFromCheckpoint
      });

      // Show extraction progress
      if (metadata.chunksProcessed > 1) {
        setUploadStatus(`Processed ${metadata.chunksProcessed} chunks with semantic dedup...`);
      }

      setUploadProgress(70);
      setUploadStatus("Validating and saving questions...");

      // Update document with quality metrics
      const docQualityScore = metadata.qualityScore || 0;
      const docNeedsReview = metadata.needsReview || false;

      await supabase
        .from('documents')
        .update({
          processed: true,
          processing_status: 'completed',
          quality_score: docQualityScore,
          needs_review: docNeedsReview,
          extraction_metrics: {
            total_questions: metadata.totalExtracted,
            complete_questions: metadata.completeQuestions,
            incomplete_questions: metadata.incompleteQuestions,
            completion_rate: metadata.qualityMetrics?.completionRate,
            processing_time_seconds: metadata.processingTimeSeconds,
            chunks_processed: metadata.chunksProcessed,
            learned_from_corrections: metadata.learnedFromCorrections,
            semantic_dedup_applied: metadata.semanticDeduplicationApplied
          }
        })
        .eq('id', aiDocData.id);

      setUploadProgress(80);

      // Prepare questions for insertion using validation data
      const questionsToInsert = data.questions.map((q: any) => {
        // Use validation data from edge function if available
        const validation = q.validation || {};
        const isComplete = validation.isComplete !== undefined 
          ? validation.isComplete 
          : !!(q.question && q.option_a && q.option_b && q.option_c && q.option_d && q.correct_answer && /^[ABCD]$/i.test(q.correct_answer));
        
        const status = isComplete ? 'approved' : 'pending';
        
        return {
          question: q.question || '[Missing question]',
          option_a: q.option_a || '',
          option_b: q.option_b || '',
          option_c: q.option_c || '',
          option_d: q.option_d || '',
          correct_answer: q.correct_answer ? q.correct_answer.toUpperCase() : '',
          module,
              document_id: aiDocData.id,
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

      console.log(`Enhanced AI Extraction Complete:`, {
        extracted: data.questions.length,
        approved: approvedCount,
        pending: pendingCount,
        processingTime: metadata.processingTimeSeconds,
        chunks: metadata.chunksProcessed
      });

      // Enhanced success message with quality scoring
      const aiQualityScore = metadata.qualityScore || 0;
      const aiNeedsReview = metadata.needsReview || false;

      if (aiNeedsReview || aiQualityScore < 70) {
        toast.warning(`⚠️ Extraction Complete - Review Needed`, {
          description: `Quality Score: ${aiQualityScore}/100
          
${data.questions.length} questions extracted in ${metadata.processingTimeSeconds || 0}s
✅ ${approvedCount} complete | ⏳ ${pendingCount} incomplete

${aiQualityScore < 50 ? '🔴 Low quality: Many questions incomplete' : aiQualityScore < 70 ? '🟡 Medium quality: Some issues detected' : ''}
📋 Please review and complete missing data`,
          duration: 8000,
        });
      } else {
        toast.success(`✨ High-Quality Extraction Complete!`, {
          description: `Quality Score: ${aiQualityScore}/100
          
${data.questions.length} questions extracted in ${metadata.processingTimeSeconds || 0}s
✅ ${approvedCount} auto-approved (ready for practice)
${pendingCount > 0 ? `⏳ ${pendingCount} need review` : ''}
${metadata.chunksProcessed > 1 ? `📄 Processed ${metadata.chunksProcessed} chunks` : ''}`,
          duration: 6000,
        });
      }

      setPastedText("");
      setUploadStatus("");
      setUploadProgress(0);

    } catch (error: any) {
      console.error('Error in AI parsing:', error);
      
      // Try to update document to failed status
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: docs } = await supabase
            .from('documents')
            .select('id')
            .eq('uploaded_by', user.id)
            .eq('processing_status', 'processing')
            .order('created_at', { ascending: false })
            .limit(1);
          
          if (docs && docs.length > 0) {
            await supabase
              .from('documents')
              .update({
                processed: true,
                processing_status: 'failed',
                error_message: error.message || 'Processing failed'
              })
              .eq('id', docs[0].id);
          }
        }
      } catch (updateError) {
        console.error('Failed to update document status:', updateError);
      }
      
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

      // Handle question paste - try AI parsing for better results
      if (purpose === "questions" && inputMethod === "paste") {
        // Create document first for progress tracking
        const { data: pasteDocData, error: pasteDocError } = await supabase
          .from('documents')
          .insert({
            uploaded_by: user.id,
            file_name: `pasted-questions-${Date.now()}.txt`,
            file_path: '',
            purpose: 'questions',
            module,
            processed: false,
            processing_status: 'processing'
          })
          .select()
          .maybeSingle();

        if (pasteDocError || !pasteDocData) throw pasteDocError || new Error('Failed to create document record');

        setUploadStatus("Enhanced AI with Phase 3 features...");
        setUploadProgress(20);

        // Use AI to parse questions with documentId for progress tracking
        const { data: aiData, error: aiError } = await supabase.functions.invoke('parse-questions-ai', {
          body: { text: pastedText, module, documentId: pasteDocData.id }
        });

        if (aiError || !aiData?.questions || aiData.questions.length === 0) {
          console.error('AI parsing failed, trying structured format:', aiError);
          
          // Update document status to failed
          await supabase
            .from('documents')
            .update({ 
              processed: true, 
              processing_status: 'failed',
              error_message: 'AI parsing failed, fallback used'
            })
            .eq('id', pasteDocData.id);
          
          // Fallback to structured parsing
          setUploadStatus("Trying structured format...");
          const parseResult = parseStructuredQuestions(pastedText);

          if (parseResult.questions.length === 0) {
            toast.error("No questions found. Please paste in Q:/A:/B:/C:/D: format or use plain text for AI parsing.");
            setUploading(false);
            return;
          }
          
          // Use structured parsing results
          const structuredQuestions = parseResult.questions;
          console.log(`Structured parser found ${structuredQuestions.length} questions`);
          
          setUploadProgress(40);
          
          // Update the existing document record
          const { error: updateDocError } = await supabase
            .from('documents')
            .update({
              processed: true,
              processing_status: 'completed',
              error_message: null
            })
            .eq('id', pasteDocData.id);

          if (updateDocError) throw updateDocError;

          const questionsToInsert = structuredQuestions.map((q) => {
            const normalize = (v?: string) => (typeof v === 'string' ? v : '');
            const validAnswer = !!q.correct_answer && /^[ABCD]$/i.test(q.correct_answer);
            const hasAllFields = !!(q.question && q.option_a && q.option_b && q.option_c && q.option_d);
            const status = (hasAllFields && validAnswer) ? 'approved' : 'pending';
            return {
              question: normalize(q.question) || '[Missing question]',
              option_a: normalize(q.option_a),
              option_b: normalize(q.option_b),
              option_c: normalize(q.option_c),
              option_d: normalize(q.option_d),
              correct_answer: validAnswer ? q.correct_answer.toUpperCase() : 'A',
              module,
              document_id: pasteDocData.id,
              status,
              confidence_score: validAnswer ? 1.0 : 0.5
            };
          });

          const { error: insertError } = await supabase
            .from('extracted_questions')
            .insert(questionsToInsert);

          if (insertError) throw insertError;

          const approvedCount = questionsToInsert.filter(q => q.status === 'approved').length;
          const pendingCount = questionsToInsert.filter(q => q.status === 'pending').length;

          console.log(`Stored ${structuredQuestions.length} questions: ${approvedCount} approved, ${pendingCount} pending`);
          
          toast.success(`Uploaded ${structuredQuestions.length} questions to ${module}`, {
            description: pendingCount > 0 
              ? `${approvedCount} auto-approved and ready for practice, ${pendingCount} need review` 
              : 'All auto-approved and ready for practice!'
          });

          setPastedText("");
          setUploading(false);
          setUploadProgress(0);
          setUploadStatus("");
          return;
        }

        // AI parsing succeeded - get metadata
        const metadata = aiData.metadata || {};
        console.log(`Enhanced AI Extraction Stats:`, {
          total: aiData.questions.length,
          complete: metadata.completeQuestions,
          incomplete: metadata.incompleteQuestions,
          processingTime: metadata.processingTimeSeconds,
          chunksProcessed: metadata.chunksProcessed
        });

        if (metadata.chunksProcessed > 1) {
          setUploadStatus(`Processed ${metadata.chunksProcessed} chunks. Saving...`);
        }

        // Update document record with AI extraction results
        setUploadStatus("Saving extraction results...");
        setUploadProgress(50);

        // Calculate quality score for pasted upload metadata
        const uploadQualityScore = metadata.qualityScore || 0;
        const uploadNeedsReview = metadata.needsReview || false;

        const { error: updateDocError } = await supabase
          .from('documents')
          .update({
            processed: true,
            processing_status: 'completed',
            quality_score: uploadQualityScore,
            needs_review: uploadNeedsReview,
            extraction_metrics: {
              total_questions: metadata.totalExtracted,
              complete_questions: metadata.completeQuestions,
              incomplete_questions: metadata.incompleteQuestions,
              completion_rate: metadata.qualityMetrics?.completionRate,
              processing_time_seconds: metadata.processingTimeSeconds,
              chunks_processed: metadata.chunksProcessed,
              learned_from_corrections: metadata.learnedFromCorrections,
              semantic_deduplication_applied: metadata.semanticDeduplicationApplied,
              resumed_from_checkpoint: metadata.resumedFromCheckpoint
            }
          })
          .eq('id', pasteDocData.id);

        if (updateDocError) throw updateDocError;

        setUploadStatus("Uploading questions to database...");
        setUploadProgress(70);

        const questionsToInsert = aiData.questions.map((q: any) => {
          const normalize = (v?: string) => (typeof v === 'string' ? v : '');
          // Use validation data from edge function if available
          const validation = q.validation || {};
          const validAnswer = q.correct_answer && /^[ABCD]$/i.test(q.correct_answer);
          const isComplete = validation.isComplete !== undefined 
            ? validation.isComplete 
            : !!(q.question && q.option_a && q.option_b && q.option_c && q.option_d && validAnswer);
          const status = isComplete ? 'approved' : 'pending';
          return {
            question: normalize(q.question) || '[Missing question]',
            option_a: normalize(q.option_a),
            option_b: normalize(q.option_b),
            option_c: normalize(q.option_c),
            option_d: normalize(q.option_d),
            correct_answer: validAnswer ? q.correct_answer.toUpperCase() : 'A',
            module,
            document_id: pasteDocData.id,
            status,
            confidence_score: validAnswer ? (q.confidence_score || 1.0) : 0.5,
            document_section: q.document_section,
            page_number: q.page_number,
            question_number: q.question_number,
            preceding_context: q.preceding_context,
            quality_metrics: q.quality_metrics
          };
        });

        const { error: insertError } = await supabase
          .from('extracted_questions')
          .insert(questionsToInsert);

        if (insertError) throw insertError;

        setUploadProgress(100);
        const approvedCount = questionsToInsert.filter(q => q.status === 'approved').length;
        const pendingCount = questionsToInsert.filter(q => q.status === 'pending').length;
        
        console.log(`Enhanced AI parsing complete:`, {
          extracted: aiData.questions.length,
          approved: approvedCount,
          pending: pendingCount,
          processingTime: metadata.processingTimeSeconds,
          chunks: metadata.chunksProcessed
        });
        
        // Show appropriate message based on quality
        const pasteQualityScore = metadata.qualityScore || 0;
        const pasteNeedsReview = metadata.needsReview || false;

        if (pasteNeedsReview || pasteQualityScore < 70) {
          toast.warning(`⚠️ Extraction Complete - Review Needed`, {
            description: `Quality Score: ${pasteQualityScore}/100

${aiData.questions.length} questions in ${metadata.processingTimeSeconds || 0}s
✅ ${approvedCount} complete | ⏳ ${pendingCount} incomplete

${pasteQualityScore < 50 ? '🔴 Low quality: Many questions incomplete' : pasteQualityScore < 70 ? '🟡 Medium quality: Some issues detected' : ''}
📋 Please review in Admin Questions panel`,
            duration: 8000,
          });
        } else {
          toast.success(`✨ High-Quality Extraction Complete!`, {
            description: `Quality Score: ${pasteQualityScore}/100

${aiData.questions.length} questions in ${metadata.processingTimeSeconds || 0}s
✅ ${approvedCount} auto-approved (ready for practice)
${pendingCount > 0 ? `⏳ ${pendingCount} need review` : ''}
${metadata.chunksProcessed > 1 ? `📄 ${metadata.chunksProcessed} chunks` : ''}`,
            duration: 6000,
          });
        }
        setPastedText("");
        setUploading(false);
        setUploadProgress(0);
        setUploadStatus("");
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
      
      // Try to update any stuck document to failed status
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: docs } = await supabase
            .from('documents')
            .select('id')
            .eq('uploaded_by', user.id)
            .eq('processing_status', 'processing')
            .order('created_at', { ascending: false })
            .limit(1);
          
          if (docs && docs.length > 0) {
            await supabase
              .from('documents')
              .update({
                processed: true,
                processing_status: 'failed',
                error_message: error.message || 'Upload failed'
              })
              .eq('id', docs[0].id);
          }
        }
      } catch (updateError) {
        console.error('Failed to update document status:', updateError);
      }
      
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
    <>
      <Navigation />
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
                  <label className="text-sm font-medium flex items-center gap-1">
                    Module <span className="text-destructive">*</span>
                  </label>
                  <Select value={module} onValueChange={setModule} required>
                    <SelectTrigger className={!module ? "border-destructive/50 bg-destructive/5" : ""}>
                      <SelectValue placeholder="⚠️ Select a module before uploading" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="vocabulary">📚 Vocabulary</SelectItem>
                      <SelectItem value="analogy">🔗 Analogy</SelectItem>
                      <SelectItem value="reading">📖 Reading Comprehension</SelectItem>
                      <SelectItem value="numerical">🔢 Numerical Ability</SelectItem>
                      <SelectItem value="clerical">📋 Clerical Ability</SelectItem>
                    </SelectContent>
                  </Select>
                  {!module && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <XCircle className="h-3 w-3" />
                      Module selection is required for question uploads
                    </p>
                  )}
                  {module && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-green-500" />
                      Questions will be categorized as <span className="font-medium">{module}</span>
                    </p>
                  )}
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
                        <p className="font-medium mb-1">✨ AI-powered question extraction (Gemini)</p>
                        <p className="mb-2">Just paste your questions in any format! The AI will automatically extract:</p>
                        <ul className="text-xs list-disc list-inside space-y-1">
                          <li>Question text</li>
                          <li>All 4 options (A, B, C, D)</li>
                          <li>Correct answer</li>
                        </ul>
                        <p className="mt-2">Or use structured format:</p>
                        <pre className="text-xs mt-1">
Q: Your question?{'\n'}A: Option A{'\n'}B: Option B{'\n'}C: Option C{'\n'}D: Option D{'\n'}Correct: A
                        </pre>
                      </div>
                      <Textarea
                        value={pastedText}
                        onChange={(e) => setPastedText(e.target.value)}
                        placeholder="Paste your numerical questions here in any format..."
                        disabled={uploading || aiParsing}
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

                {/* CSV Import Tab */}
                <TabsContent value="csv" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle>Bulk Import Questions from CSV</CardTitle>
                          <CardDescription>
                            Upload a CSV file with questions to import them in bulk
                          </CardDescription>
                        </div>
                        <Button variant="outline" size="sm" onClick={downloadTemplate} className="gap-2">
                          <Download className="h-4 w-4" />
                          Download Template
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Module Selection */}
                      <div>
                        <Label>Default Module</Label>
                        <Select value={csvModule} onValueChange={setCsvModule}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="vocabulary">Vocabulary</SelectItem>
                            <SelectItem value="grammar">Grammar</SelectItem>
                            <SelectItem value="reading">Reading Comprehension</SelectItem>
                            <SelectItem value="numerical">Numerical Ability</SelectItem>
                            <SelectItem value="logical">Logical Reasoning</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* File Upload */}
                      <div>
                        <Label>CSV File</Label>
                        <Input 
                          type="file" 
                          accept=".csv,.xlsx" 
                          onChange={handleCSVFileSelect}
                          disabled={importing}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Required columns: question, option_a, option_b, option_c, option_d, correct_answer, module
                        </p>
                      </div>

                      {/* Preview */}
                      {importPreview.length > 0 && (
                        <Card>
                          <CardHeader>
                            <CardTitle className="text-base">Preview ({importPreview.length} questions)</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <QuestionImportPreview
                              questions={importPreview}
                              duplicates={duplicates}
                            />
                          </CardContent>
                        </Card>
                      )}

                      {/* Import Options */}
                      {importPreview.length > 0 && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <Checkbox 
                              id="skip-duplicates" 
                              checked={skipDuplicates}
                              onCheckedChange={(checked) => setSkipDuplicates(checked as boolean)}
                            />
                            <Label htmlFor="skip-duplicates" className="cursor-pointer">
                              Skip duplicate questions ({duplicates.size} found)
                            </Label>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <Checkbox 
                              id="auto-approve" 
                              checked={autoApprove}
                              onCheckedChange={(checked) => setAutoApprove(checked as boolean)}
                            />
                            <Label htmlFor="auto-approve" className="cursor-pointer">
                              Auto-approve high confidence questions (≥95%)
                            </Label>
                          </div>
                        </div>
                      )}

                      {/* Import Progress */}
                      {importing && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Importing questions...</span>
                            <span className="font-medium">{Math.round(importProgress)}%</span>
                          </div>
                          <Progress value={importProgress} className="h-2" />
                        </div>
                      )}

                      {/* Import Button */}
                      {importPreview.length > 0 && (
                        <Button 
                          onClick={handleBulkImport} 
                          disabled={importing}
                          className="w-full gap-2"
                        >
                          {importing ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Importing...
                            </>
                          ) : (
                            <>
                              <Upload className="h-4 w-4" />
                              Import {importPreview.length - (skipDuplicates ? duplicates.size : 0)} Questions
                            </>
                          )}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
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

              <Button 
                type="submit" 
                disabled={
                  uploading || 
                  aiParsing || 
                  (inputMethod === "file" && !file) || 
                  (inputMethod === "paste" && !pastedText.trim()) ||
                  (purpose === "questions" && !module)
                }
              >
                {uploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {uploadStatus || "Processing..."}
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    {inputMethod === "paste" && purpose === "questions" ? "✨ Extract Questions with AI" : "Upload Document"}
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
                <CardDescription>Manage your uploaded documents and quality scores</CardDescription>
              </div>
              <div className="flex gap-2 items-center">
                {selectedDocIds.length > 0 && (
                  <>
                    <Badge variant="secondary" className="px-3 py-1">
                      {selectedDocIds.length} selected
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleBulkReprocess}
                      disabled={isReprocessing}
                    >
                      <RefreshCw className={`w-4 h-4 mr-2 ${isReprocessing ? 'animate-spin' : ''}`} />
                      Re-evaluate Selected
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedDocIds([])}
                    >
                      Clear
                    </Button>
                  </>
                )}
                <Button 
                  variant={showOnlyNeedsReview ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowOnlyNeedsReview(!showOnlyNeedsReview)}
                >
                  <AlertCircle className="mr-2 h-4 w-4" />
                  {showOnlyNeedsReview ? 'Show All' : 'Needs Review'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReprocessAll}
                  disabled={isReprocessing}
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${isReprocessing ? 'animate-spin' : ''}`} />
                  Re-evaluate All
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReprocess}
                  disabled={isReprocessing}
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${isReprocessing ? 'animate-spin' : ''}`} />
                  Fix Stuck RAG Docs
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
              </div>
            ) : documents.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No documents uploaded yet</p>
            ) : (() => {
              const filteredDocs = showOnlyNeedsReview 
                ? documents.filter(doc => doc.needs_review) 
                : documents;
              
              return filteredDocs.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  {showOnlyNeedsReview ? 'No documents need review 🎉' : 'No documents uploaded yet'}
                </p>
              ) : (
              <div className="space-y-2">
                {filteredDocs.map((doc) => {
                  const qualityScore = doc.quality_score;
                  const needsReview = doc.needs_review;
                  const metrics = doc.extraction_metrics || {};
                  
                  // Determine quality color
                  const getQualityColor = (score: number | null) => {
                    if (score === null || score === undefined) return 'secondary';
                    if (score >= 80) return 'default'; // green-ish
                    if (score >= 70) return 'secondary'; // yellow-ish
                    return 'destructive'; // red
                  };
                  
                  const getQualityLabel = (score: number | null) => {
                    if (score === null || score === undefined) return 'N/A';
                    if (score >= 80) return `✅ ${score}%`;
                    if (score >= 70) return `⚠️ ${score}%`;
                    return `🔴 ${score}%`;
                  };

                  return (
                    <Card 
                      key={doc.id} 
                      className={`p-4 ${needsReview ? 'border-orange-500/50 bg-orange-500/5' : ''} ${selectedDocIds.includes(doc.id) ? 'ring-2 ring-primary' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 flex-1">
                          <input
                            type="checkbox"
                            checked={selectedDocIds.includes(doc.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedDocIds([...selectedDocIds, doc.id]);
                              } else {
                                setSelectedDocIds(selectedDocIds.filter(id => id !== doc.id));
                              }
                            }}
                            className="w-4 h-4 rounded border-border cursor-pointer"
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <FileText className="w-4 h-4 text-muted-foreground" />
                              <h3 className="font-semibold">{doc.file_name}</h3>
                              {needsReview && (
                                <Badge variant="destructive" className="text-xs">
                                  <AlertCircle className="w-3 h-3 mr-1" />
                                  Review
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <p className="text-sm text-muted-foreground">
                                {doc.purpose} • {doc.module || 'N/A'}
                              </p>
                              <ProcessingStatusBadge 
                                status={doc.processing_status || 'pending'} 
                                errorMessage={doc.error_message}
                              />
                              {qualityScore !== null && qualityScore !== undefined && (
                                <Badge variant={getQualityColor(qualityScore)}>
                                  {getQualityLabel(qualityScore)}
                                </Badge>
                              )}
                              {metrics.completeQuestions !== undefined && metrics.totalExtracted !== undefined && (
                                <span className="text-xs text-muted-foreground">
                                  {metrics.completeQuestions}/{metrics.totalExtracted} complete
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(doc.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
              );
            })()}
          </CardContent>
        </Card>
      </div>
    </div>
    </>
  );
};

export default AdminUpload;