import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.108.1';

const session = new Supabase.ai.Session('gte-small');
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const jsonHeaders = { 'Content-Type': 'application/json' };

async function embed(input: string): Promise<number[]> {
  return await session.run(input.slice(0, 2000), {
    mean_pool: true,
    normalize: true,
  }) as number[];
}

async function processPending(limit: number) {
  const safeLimit = Math.min(Math.max(limit, 1), 20);
  const { data: rows, error } = await supabase
    .rpc('claim_gallery_search_index', { p_limit: safeLimit });

  if (error) throw error;

  const results = [];
  for (const row of rows ?? []) {
    try {
      const vector = await embed(row.search_text);
      const { error: updateError } = await supabase
        .from('product_search_index')
        .update({
          embedding: vector,
          embedded_hash: row.content_hash,
          embedding_status: 'ready',
          last_error: null,
          embedded_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('product_id', row.product_id)
        .eq('content_hash', row.content_hash);
      if (updateError) throw updateError;
      results.push({ productId: row.product_id, ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await supabase
        .from('product_search_index')
        .update({
          embedding_status: 'failed',
          last_error: message.slice(0, 500),
          updated_at: new Date().toISOString(),
        })
        .eq('product_id', row.product_id)
        .eq('content_hash', row.content_hash);
      results.push({ productId: row.product_id, ok: false, error: message });
    }
  }

  return results;
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: jsonHeaders,
    });
  }

  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!serviceRoleKey || token !== serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: jsonHeaders,
    });
  }

  try {
    const body = await request.json();
    if (body?.mode === 'batch') {
      const results = await processPending(Number(body.limit) || 10);
      return new Response(JSON.stringify({ processed: results.length, results }), { headers: jsonHeaders });
    }

    if (typeof body?.query !== 'string' || body.query.trim().length < 2) {
      return new Response(JSON.stringify({ error: 'query must contain at least 2 characters' }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    const embedding = await embed(body.query.trim());
    return new Response(JSON.stringify({ embedding, model: 'gte-small' }), { headers: jsonHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
