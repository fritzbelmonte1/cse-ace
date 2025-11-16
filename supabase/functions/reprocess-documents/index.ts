import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { documentIds } = await req.json();
    console.log(`Starting reprocessing for ${documentIds?.length || 'all'} documents`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch documents to reprocess
    let query = supabase
      .from('documents')
      .select('id, file_name, module, processed');

    if (documentIds && documentIds.length > 0) {
      query = query.in('id', documentIds);
    }

    const { data: documents, error: fetchError } = await query;

    if (fetchError) {
      throw new Error(`Failed to fetch documents: ${fetchError.message}`);
    }

    if (!documents || documents.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No documents to reprocess', results: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results = [];

    for (const doc of documents) {
      console.log(`Reprocessing document: ${doc.file_name} (${doc.id})`);

      try {
        // Fetch document chunks to reconstruct full text
        const { data: chunks, error: chunksError } = await supabase
          .from('document_chunks')
          .select('content, chunk_index')
          .eq('document_id', doc.id)
          .order('chunk_index', { ascending: true });

        if (chunksError || !chunks || chunks.length === 0) {
          console.error(`No chunks found for document ${doc.id}`);
          results.push({
            documentId: doc.id,
            fileName: doc.file_name,
            success: false,
            error: 'No content chunks found'
          });
          continue;
        }

        // Reconstruct full text from chunks
        const fullText = chunks.map(c => c.content).join('\n\n');
        console.log(`Reconstructed ${fullText.length} characters from ${chunks.length} chunks`);

        // Call parse-questions-ai function to re-extract and get quality metrics
        const { data: parseResult, error: parseError } = await supabase.functions.invoke('parse-questions-ai', {
          body: {
            text: fullText,
            module: doc.module
          }
        });

        if (parseError) {
          throw parseError;
        }

        const metadata = parseResult.metadata || {};
        const questions = parseResult.questions || [];

        console.log(`Re-extraction complete: ${metadata.totalExtracted} questions, quality: ${metadata.qualityScore}`);

        // Delete old extracted questions for this document
        const { error: deleteError } = await supabase
          .from('extracted_questions')
          .delete()
          .eq('document_id', doc.id);

        if (deleteError) {
          console.error(`Failed to delete old questions: ${deleteError.message}`);
        }

        // Insert new extracted questions
        if (questions.length > 0) {
          const questionsToInsert = questions.map((q: any) => ({
            document_id: doc.id,
            module: doc.module,
            question: q.question,
            option_a: q.option_a,
            option_b: q.option_b,
            option_c: q.option_c,
            option_d: q.option_d,
            correct_answer: q.correct_answer || '',
            status: q.validation?.isComplete ? 'approved' : 'pending',
            confidence_score: q.validation?.isComplete ? 1.0 : 0.5
          }));

          const { error: insertError } = await supabase
            .from('extracted_questions')
            .insert(questionsToInsert);

          if (insertError) {
            console.error(`Failed to insert questions: ${insertError.message}`);
            throw insertError;
          }
        }

        // Update document with new quality metrics
        const { error: updateError } = await supabase
          .from('documents')
          .update({
            quality_score: metadata.qualityScore,
            needs_review: metadata.needsReview,
            extraction_metrics: metadata,
            processed: true,
            processing_status: 'completed',
            error_message: null
          })
          .eq('id', doc.id);

        if (updateError) {
          throw updateError;
        }

        results.push({
          documentId: doc.id,
          fileName: doc.file_name,
          success: true,
          qualityScore: metadata.qualityScore,
          needsReview: metadata.needsReview,
          totalExtracted: metadata.totalExtracted,
          completeQuestions: metadata.completeQuestions,
          incompleteQuestions: metadata.incompleteQuestions
        });

      } catch (error: any) {
        console.error(`Error reprocessing document ${doc.id}:`, error);
        results.push({
          documentId: doc.id,
          fileName: doc.file_name,
          success: false,
          error: error.message
        });

        // Update document with error status
        await supabase
          .from('documents')
          .update({
            processing_status: 'failed',
            error_message: `Reprocessing failed: ${error.message}`
          })
          .eq('id', doc.id);
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    console.log(`Reprocessing complete: ${successCount} successful, ${failCount} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Reprocessed ${successCount} documents (${failCount} failed)`,
        results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in reprocess-documents:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
