import { words, substitutions, separator, protectedPattern } from './dictionary.mjs';

export function wordPattern(word) {
  return word.split(' ').map(part => [...part].map(char => substitutions[char] || char).join(separator)).join('[ ._-]+');
}
const patterns = [...words].sort((a, b) => b.length - a.length).map(word => new RegExp(`(^|[^a-z0-9])(${wordPattern(word)})(?=$|[^a-z0-9])`, 'g'));

export function censorText(text) {
  if (typeof text !== 'string' || !text) return text;
  const chars = [...text];
  // One folded code point per original code point preserves mask positions.
  const normalized = chars.map(char => {
    const folded = char.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
    return [...folded].length === 1 ? folded : /\p{M}/u.test(char) ? '.' : '#';
  }).join('');
  const protectedChars = new Set();
  // JS regex indices are UTF-16; convert them to code-point offsets.
  for (const match of text.matchAll(new RegExp(protectedPattern, 'gi'))) {
    const start = [...text.slice(0, match.index)].length;
    for (let i = start; i < start + [...match[0]].length; i++) protectedChars.add(i);
  }
  const masked = new Set();
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    for (const match of normalized.matchAll(pattern)) {
      const start = [...normalized.slice(0, match.index + match[1].length)].length;
      const end = start + [...match[2]].length;
      if ([...Array(end - start).keys()].some(i => protectedChars.has(start + i))) continue;
      for (let i = start; i < end; i++) if (/[\p{L}\p{N}]/u.test(chars[i])) masked.add(i);
    }
  }
  return chars.map((char, i) => masked.has(i) ? '*' : char).join('');
}

const columns = {
  messages: ['text'], conversations: ['last_message'], notifications: ['title', 'message'],
  product_reviews: ['body'], design_requests: ['buyer_note', 'shop_response'],
  design_request_revisions: ['buyer_note'], design_request_events: [],
};
export const moderatedTables = Object.keys(columns);
const noteKeys = ['buyer_note', 'shop_response', 'response', 'note', 'message'];
export function censorMessagePayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const result = { ...value };
  for (const key of noteKeys) if (typeof result[key] === 'string') result[key] = censorText(result[key]);
  if (result.summary && typeof result.summary === 'object') result.summary = censorMessagePayload(result.summary);
  return result;
}
export function censorMessageBody(text) {
  if (typeof text !== 'string') return text;
  try {
    const value = JSON.parse(text);
    if (['product_inquiry', 'design_request', 'design_request_update', 'design_submission'].includes(value?.type)) {
      const cleaned = censorMessagePayload(value);
      return JSON.stringify(cleaned) === JSON.stringify(value) ? text : JSON.stringify(cleaned);
    }
  } catch { /* ordinary message */ }
  return censorText(text);
}
export function censorMessageRecord(table, value) {
  if (Array.isArray(value)) return value.map(row => censorMessageRecord(table, row));
  if (!value || typeof value !== 'object' || !columns[table]) return value;
  const result = { ...value };
  for (const key of columns[table]) if (typeof result[key] === 'string') result[key] = ['text', 'last_message'].includes(key) ? censorMessageBody(result[key]) : censorText(result[key]);
  if (table === 'messages' || table === 'design_request_events') {
    for (const key of ['metadata', 'payload']) {
      if (!result[key] || typeof result[key] !== 'object' || Array.isArray(result[key])) continue;
      result[key] = censorMessagePayload(result[key]);
    }
  }
  return result;
}
export function censorRpc(name, value) {
  if (!['submit_design_request', 'revise_design_request', 'respond_to_design_request'].includes(name) || !value || typeof value !== 'object') return value;
  const result = { ...value };
  for (const key of ['p_buyer_note', 'p_response']) if (typeof result[key] === 'string') result[key] = censorText(result[key]);
  // These RPCs return communication fields alongside immutable workflow data.
  return censorMessageRecord('design_requests', result);
}
