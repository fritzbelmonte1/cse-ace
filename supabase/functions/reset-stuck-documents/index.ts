import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Check if user is admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (roleError || roleData?.role !== 'admin') {
      throw new Error('Admin access required');
    }

    // Find stuck documents (pending for more than 10 minutes)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    
    const { data: stuckDocs, error: fetchError } = await supabase
      .from('documents')
      .select('id, file_name, purpose, processing_status, created_at')
      .eq('processing_status', 'processing')
      .lt('created_at', tenMinutesAgo);

    if (fetchError) {
      console.error('Error fetching stuck documents:', fetchError);
      throw new Error('Failed to fetch stuck documents');
    }

    // Find documents that are marked processed but have no chunks (for RAG documents)
    const { data: noChunkDocs, error: noChunkError } = await supabase
      .from('documents')
      .select('id, file_name, purpose, processing_status')
      .eq('purpose', 'rag')
      .eq('processed', true);

    if (noChunkError) {
      console.error('Error fetching no-chunk documents:', noChunkError);
      throw new Error('Failed to fetch no-chunk documents');
    }

    // Filter documents without chunks
    const docsWithoutChunks = [];
    if (noChunkDocs) {
      for (const doc of noChunkDocs) {
        const { count } = await supabase
          .from('document_chunks')
          .select('*', { count: 'exact', head: true })
          .eq('document_id', doc.id);

        if (count === 0) {
          docsWithoutChunks.push(doc);
        }
      }
    }

    // Combine all documents that need reprocessing
    const allStuckDocs = [...(stuckDocs || []), ...docsWithoutChunks];

    console.log(`Found ${allStuckDocs.length} documents to reset:`, allStuckDocs.map(d => d.file_name));

    const resetResults = [];

    for (const doc of allStuckDocs) {
      try {
        // Reset document status
        const { error: updateError } = await supabase
          .from('documents')
          .update({
            processed: false,
            processing_status: 'pending',
            error_message: null,
            processing_checkpoint: null
          })
          .eq('id', doc.id);

        if (updateError) {
          console.error(`Failed to reset document ${doc.id}:`, updateError);
          resetResults.push({
            id: doc.id,
            file_name: doc.file_name,
            success: false,
            error: updateError.message
          });
          continue;
        }

        // Trigger reprocessing
        const { error: processError } = await supabase.functions.invoke('process-document', {
          body: { documentId: doc.id }
        });

        if (processError) {
          console.error(`Failed to trigger processing for ${doc.id}:`, processError);
          resetResults.push({
            id: doc.id,
            file_name: doc.file_name,
            success: false,
            error: processError.message
          });
        } else {
          console.log(`Successfully reset and triggered reprocessing for: ${doc.file_name}`);
          resetResults.push({
            id: doc.id,
            file_name: doc.file_name,
            success: true
          });
        }
      } catch (error) {
        console.error(`Error processing document ${doc.id}:`, error);
        resetResults.push({
          id: doc.id,
          file_name: doc.file_name,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    const successCount = resetResults.filter(r => r.success).length;

    return new Response(JSON.stringify({
      message: `Reset ${successCount} of ${allStuckDocs.length} stuck documents`,
      results: resetResults
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error in reset-stuck-documents:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
