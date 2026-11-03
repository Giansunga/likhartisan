import { describe, it, expect, vi } from 'vitest';
import { createModeratedFetch, censorSubmittedText } from '../messageModeration';
const notice = vi.hoisted(() => vi.fn());
vi.mock('../popups', () => ({ toast: { info: notice } }));
describe('message transport moderation', () => {
  it('preserves HEAD count queries without attempting to parse an empty JSON body', async () => {
    const fetcher = vi.fn(async () => new Response(null, { headers: { 'Content-Type':'application/json', 'Content-Range':'*/10' } }));
    const response = await createModeratedFetch(fetcher as typeof fetch)('https://example.com/rest/v1/product_reviews', {method:'HEAD'});
    expect(response.headers.get('content-range')).toBe('*/10');
  });
  it.each(['messages','product_reviews','design_requests','design_request_revisions','design_request_events','notifications','conversations'])('filters legacy %s reads without making a write', async table => {
    const row = {text:'shit',body:'shit',buyer_note:'shit',shop_response:'shit',message:'shit',last_message:'shit',payload:{response:'shit'}};
    const fetcher = vi.fn(async (request:Request) => {
      expect(request.method).toBe('GET');
      return new Response(JSON.stringify([row]), {headers:{'Content-Type':'application/json'}});
    });
    const response = await createModeratedFetch(fetcher as typeof fetch)(`https://example.com/rest/v1/${table}`);
    const [saved] = await response.json();
    const key = ({messages:'text',product_reviews:'body',design_requests:'buyer_note',design_request_revisions:'buyer_note',notifications:'message',conversations:'last_message'} as Record<string,string>)[table];
    expect(key ? saved[key] : saved.payload.response).toBe('****');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('censors writes, legacy reads and notices while preserving response metadata', async () => {
    const fetcher = vi.fn(async (request: Request) => {
      expect(await request.json()).toEqual({ text: '****', sender_id: 'gago' });
      return new Response(JSON.stringify([{ text: 'puta', sender_id: 'gago' }]), { headers: { 'Content-Type': 'application/json', 'Content-Range': '0-0/1' } });
    });
    const response = await createModeratedFetch(fetcher as typeof fetch)('https://example.com/rest/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'shit', sender_id: 'gago' }) });
    expect(await response.json()).toEqual([{ text:'****', sender_id:'gago' }]);
    expect(response.headers.get('content-range')).toBe('0-0/1');
    expect(notice).toHaveBeenCalled();
  });
  it('leaves catalog, auth, and error responses unchanged', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ message:'shit' }), { status:400,headers:{'Content-Type':'application/json'} }));
    for (const path of ['products','../auth/v1/token','messages']) {
      const response = await createModeratedFetch(fetcher as typeof fetch)(`https://example.com/rest/v1/${path}`);
      expect(await response.json()).toEqual({ message:'shit' });
    }
  });
  it('censors request notes without changing snapshots', async () => {
    const fetcher = vi.fn(async (request:Request) => {
      expect(await request.json()).toEqual({p_buyer_note:'****',p_design_snapshot:{name:'shit'}});
      return new Response(JSON.stringify({ buyer_note:'puta' }), {headers:{'Content-Type':'application/json'}});
    });
    const response = await createModeratedFetch(fetcher as typeof fetch)('https://example.com/rest/v1/rpc/submit_design_request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_buyer_note:'shit',p_design_snapshot:{name:'shit'}})});
    expect(await response.json()).toEqual({buyer_note:'****'});
  });
  it('only replaces submitted text, leaving callers’ drafts untouched', () => {
    const draft='gago'; expect(censorSubmittedText(draft)).toBe('****'); expect(draft).toBe('gago');
  });
});
