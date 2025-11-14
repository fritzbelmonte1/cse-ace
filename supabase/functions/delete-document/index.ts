import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Verify admin role
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabaseClient.auth.getUser(token);

    if (!user) {
      throw new Error('Unauthorized');
    }

    // Check if user has admin role
    const { data: adminRole, error: roleError } = await supabaseClient
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

    console.log(`Admin ${user.id} verified for document deletion`);

    // Get document ID from request
    const { documentId } = await req.json();
    
    if (!documentId) {
      throw new Error('Document ID is required');
    }

    console.log(`Admin ${user.id} deleting document ${documentId}`);

    // Get document details before deletion
    const { data: document, error: fetchError } = await supabaseClient
      .from('documents')
      .select('file_path, file_name')
      .eq('id', documentId)
      .single();

    if (fetchError) {
      throw new Error(`Document not found: ${fetchError.message}`);
    }

    // Delete file from storage
    const { error: storageError } = await supabaseClient.storage
      .from('cse-documents')
      .remove([document.file_path]);

    if (storageError) {
      console.error('Storage deletion error:', storageError);
      // Continue with database deletion even if storage fails
    }

    // Delete document record (cascades to chunks and questions)
    const { error: deleteError } = await supabaseClient
      .from('documents')
      .delete()
      .eq('id', documentId);

    if (deleteError) {
      throw new Error(`Failed to delete document: ${deleteError.message}`);
    }

    console.log(`Successfully deleted document: ${document.file_name}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Document deleted successfully',
        fileName: document.file_name 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Delete error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});