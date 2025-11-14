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

    // Verify admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    // Check admin role
    const { data: adminRole, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (roleError) {
      console.error('Role check error:', roleError);
      throw new Error('Failed to verify admin status');
    }

    if (!adminRole) {
      throw new Error('Admin access required');
    }

    console.log(`Admin ${user.id} verified for reprocessing`);

    // Find all RAG documents that are marked processed but have no chunks
    const { data: ragDocs, error: docsError } = await supabase
      .from('documents')
      .select('id, file_name, purpose')
      .eq('purpose', 'rag')
      .eq('processed', true);

    if (docsError) {
      throw docsError;
    }

    const reprocessedDocs = [];
    
    for (const doc of ragDocs || []) {
      // Check if document has chunks
      const { count, error: countError } = await supabase
        .from('document_chunks')
        .select('id', { count: 'exact', head: true })
        .eq('document_id', doc.id);

      if (countError) {
        console.error(`Error checking chunks for ${doc.id}:`, countError);
        continue;
      }

      if (count === 0) {
        console.log(`Reprocessing document: ${doc.file_name} (${doc.id})`);
        
        // Mark as unprocessed
        await supabase
          .from('documents')
          .update({ processed: false })
          .eq('id', doc.id);

        // Trigger reprocessing
        const { error: invokeError } = await supabase.functions.invoke('process-document', {
          body: { documentId: doc.id }
        });

        if (invokeError) {
          console.error(`Failed to reprocess ${doc.file_name}:`, invokeError);
        } else {
          reprocessedDocs.push({
            id: doc.id,
            file_name: doc.file_name
          });
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Reprocessed ${reprocessedDocs.length} documents`,
      documents: reprocessedDocs
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Reprocessing error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});