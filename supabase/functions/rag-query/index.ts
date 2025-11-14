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
    const { query } = await req.json();
    
    if (!query) {
      throw new Error('Query is required');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!
    );

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Fetch ALL chunks (no vector search needed)
    const { data: allChunks, error: fetchError } = await supabase
      .from('document_chunks')
      .select(`
        id,
        document_id,
        chunk_text,
        chunk_index,
        documents!inner(file_name, module)
      `)
      .order('document_id')
      .order('chunk_index');

    if (fetchError) {
      console.error('Chunk fetch error:', fetchError);
      throw new Error('Failed to fetch knowledge base chunks');
    }

    if (!allChunks || allChunks.length === 0) {
      return new Response(JSON.stringify({ 
        answer: "I don't have any documents in my knowledge base yet. Please upload CSE materials first.",
        sources: []
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`Fetched ${allChunks.length} total chunks for analysis`);

    // Use Gemini to SELECT most relevant chunks
    const chunkSelectionPrompt = `You are a CSE exam knowledge retrieval system. 

User Question: "${query}"

Here are ALL available document chunks (${allChunks.length} total):

${allChunks.map((c: any, idx: number) => `
CHUNK ${idx + 1} (from ${c.documents.file_name}, module: ${c.documents.module}):
${c.chunk_text.substring(0, 500)}...
`).join('\n---\n')}

Task: Return ONLY the numbers (1-${allChunks.length}) of the TOP 5 most relevant chunks for answering the question.
Format your response as a JSON array of numbers, e.g.: [3, 7, 12, 1, 9]

If no chunks are relevant, return an empty array: []`;

    const selectionResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'You are a chunk selection assistant. Return only JSON arrays of numbers.' },
          { role: 'user', content: chunkSelectionPrompt }
        ]
      })
    });

    if (!selectionResponse.ok) {
      const errorText = await selectionResponse.text();
      console.error('Gemini selection error:', selectionResponse.status, errorText);
      
      if (selectionResponse.status === 429) {
        return new Response(JSON.stringify({ 
          error: 'Too many requests. Please wait a moment and try again.' 
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      if (selectionResponse.status === 402) {
        return new Response(JSON.stringify({ 
          error: 'AI service limit reached. Please contact support.' 
        }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      throw new Error(`Chunk selection failed: ${selectionResponse.status}`);
    }

    const selectionData = await selectionResponse.json();
    const selectionText = selectionData.choices[0].message.content;
    
    // Parse chunk indices from Gemini response
    let selectedIndices: number[] = [];
    try {
      selectedIndices = JSON.parse(selectionText.match(/\[[\d,\s]+\]/)?.[0] || '[]');
    } catch (parseError) {
      console.error('Failed to parse chunk indices:', selectionText);
      selectedIndices = [1, 2, 3, 4, 5]; // Fallback
    }

    // Convert to 0-indexed and filter valid chunks
    const selectedChunks = selectedIndices
      .map((idx: number) => allChunks[idx - 1])
      .filter(Boolean)
      .slice(0, 5);

    console.log(`Selected ${selectedChunks.length} relevant chunks:`, selectedIndices);

    if (selectedChunks.length === 0) {
      return new Response(JSON.stringify({ 
        answer: "I couldn't find relevant information about that in my knowledge base. Please ask questions related to the Civil Service Exam.",
        sources: []
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Use Gemini to ANSWER based on selected chunks
    const context = selectedChunks.map((c: any) => c.chunk_text).join('\n\n');

    const answerResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful CSE exam tutor. Answer questions based ONLY on the provided context from official CSE documents. If the context doesn\'t contain the answer, say so clearly.'
          },
          {
            role: 'user',
            content: `Context from CSE documents:\n${context}\n\nQuestion: ${query}\n\nProvide a clear, concise answer based on the context above.`
          }
        ]
      })
    });

    if (!answerResponse.ok) {
      const errorText = await answerResponse.text();
      console.error('Gemini answer error:', answerResponse.status, errorText);
      
      if (answerResponse.status === 429) {
        return new Response(JSON.stringify({ 
          error: 'Too many requests. Please wait a moment and try again.' 
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      if (answerResponse.status === 402) {
        return new Response(JSON.stringify({ 
          error: 'AI service limit reached. Please contact support.' 
        }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      throw new Error(`Answer generation failed: ${answerResponse.status}`);
    }

    const answerData = await answerResponse.json();
    const answer = answerData.choices[0].message.content;

    // Format sources
    const sources = selectedChunks.map((c: any) => ({
      text: c.chunk_text.substring(0, 200) + '...',
      document: c.documents.file_name,
      module: c.documents.module,
      similarity: 100
    }));

    return new Response(JSON.stringify({ 
      answer,
      sources
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('RAG query error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});