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

    // Verify admin role
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    // Check if user has admin role
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

    console.log(`Admin ${user.id} verified for upload`);

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const purpose = formData.get('purpose') as string;
    const module = formData.get('module') as string;

    if (!file) {
      throw new Error('No file provided');
    }

    // Upload to storage
    const fileName = `public/${Date.now()}-${file.name}`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('cse-documents')
      .upload(fileName, file, {
        contentType: file.type,
        upsert: false
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      throw uploadError;
    }

    // Create document record
    const { data: docData, error: docError } = await supabase
      .from('documents')
      .insert({
        user_id: user.id,
        file_name: file.name,
        file_type: file.type,
        file_path: fileName,
        file_size: file.size,
        is_public: true,
        purpose: purpose,
        module: module,
        processed: false
      })
      .select()
      .single();

    if (docError) {
      console.error('Document insert error:', docError);
      throw docError;
    }

    console.log(`Document uploaded: ${docData.id}`);

    // Trigger processing
    await supabase.functions.invoke('process-document', {
      body: { documentId: docData.id }
    });

    return new Response(JSON.stringify({ 
      success: true, 
      document: docData 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Admin upload error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});