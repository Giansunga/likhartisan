import { API_BASE } from './api';
import { activityFiltersToParams, getActivityDateRange } from './activityLog';
import { supabase } from './supabase';
import type { ActivityFilters } from '../types/activity';

async function accessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || null;
}

export async function recordSecurityActivity(event: 'auth.signed_in' | 'auth.signed_out' | 'auth.password_changed' | 'auth.password_reset') {
  const token = await accessToken();
  if (!token) return;
  await fetch(`${API_BASE}/api/activity/security`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ event }),
  }).catch(() => undefined);
}

export async function signOutWithActivity() {
  await recordSecurityActivity('auth.signed_out');
  await supabase.auth.signOut();
}

export async function exportActivityLog(filters: ActivityFilters) {
  const token = await accessToken();
  if (!token) throw new Error('Your session has expired.');
  const params = activityFiltersToParams(filters);
  const range = getActivityDateRange(filters.range);
  params.set('from', range.from);
  params.set('to', range.to);
  const response = await fetch(`${API_BASE}/api/activity/export?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'Could not export activity log.');
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `activity-log-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
