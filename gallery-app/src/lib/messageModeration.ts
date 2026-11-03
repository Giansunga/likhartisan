import { censorText, censorMessageRecord, censorRpc, moderatedTables } from './generated/moderation/index.mjs';
import { toast } from './popups';
export { censorText, censorMessageRecord };

export function censorSubmittedText(text: string): string {
  const result = censorText(text);
  if (result !== text) toast.info('Some words in your message were replaced with asterisks.');
  return result;
}

// Narrow PostgREST boundary: auth, catalog text, storage uploads, errors, and
// non-communication RPCs pass through unchanged.
export function createModeratedFetch(fetcher: typeof fetch = (...args) => fetch(...args)): typeof fetch {
  return async (input, init) => {
    let request = new Request(input, init);
    const path = new URL(request.url).pathname;
    const table = path.match(/\/rest\/v1\/([^/]+)$/)?.[1];
    const rpc = path.match(/\/rest\/v1\/rpc\/([^/]+)$/)?.[1];
    if ((!table || !moderatedTables.includes(table)) && !['submit_design_request', 'revise_design_request', 'respond_to_design_request'].includes(rpc || '')) return fetcher(request);
    if (['POST', 'PATCH'].includes(request.method) && request.headers.get('content-type')?.includes('json')) {
      const original = await request.clone().json();
      const cleaned = table ? censorMessageRecord(table, original) : censorRpc(rpc!, original);
      if (JSON.stringify(cleaned) !== JSON.stringify(original)) {
        toast.info('Some words in your message were replaced with asterisks.');
        request = new Request(request, { body: JSON.stringify(cleaned) });
      }
    }
    const response = await fetcher(request);
    if (!response.ok || request.method === 'HEAD' || !response.headers.get('content-type')?.includes('json') || response.status === 204) return response;
    const original = await response.clone().json();
    const cleaned = table ? censorMessageRecord(table, original) : censorRpc(rpc!, original);
    if (JSON.stringify(original) === JSON.stringify(cleaned)) return response;
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('content-encoding');
    return new Response(JSON.stringify(cleaned), { status: response.status, statusText: response.statusText, headers });
  };
}
