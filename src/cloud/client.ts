import { createClient } from '@supabase/supabase-js';
import { parseCloudRows, type Change, type CloudRow, type SyncTransport } from './types';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
export const cloudConfigured = Boolean(url && key?.startsWith('sb_publishable_'));

type Database = {
  public: {
    Tables: Record<never, never>;
    Views: Record<never, never>;
    Functions: {
      liftlog_cloud_ready: { Args: never; Returns: boolean };
      liftlog_sync_push: { Args: { p_owner: string; p_batch_id: string; p_changes: Change[] }; Returns: CloudRow[] };
      liftlog_sync_pull: { Args: { p_owner: string; p_after: number }; Returns: CloudRow[] };
      liftlog_delete_account: { Args: { p_owner: string }; Returns: undefined };
    };
  };
};

let browserClient: ReturnType<typeof createClient<Database>> | null = null;
export function getCloudClient() {
  if (!cloudConfigured || !url || !key) return null;
  browserClient ??= createClient<Database>(url, key, {
    auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'liftlog.supabase.session' },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
  });
  return browserClient;
}

export function redirectToProfile() {
  return `${window.location.origin}/?liftlog_auth=1`;
}

export function cloudError(error: { code?: string; message?: string; status?: number }) {
  if (error.code === 'PGRST202' || error.code === '42883') return 'Apply the LiftLog database migration in Supabase to enable sync.';
  if (error.code === '42501' || error.status === 401 || error.code === 'PGRST301') return 'Sign in again to sync this workspace.';
  if (error.status === 429 || error.code === 'over_email_send_rate_limit') return 'Too many requests. Wait a moment and try again.';
  if (error.code === 'provider_disabled' || error.code === 'validation_failed' && /provider/i.test(error.message ?? '')) return 'Enable Google sign-in in Supabase to use this option.';
  return 'Could not reach Supabase. Your local data is safe. Try again when connected.';
}

export function transportFor(client: NonNullable<ReturnType<typeof getCloudClient>>, userId: string, signal: AbortSignal): SyncTransport {
  return {
    async push(batch) {
      const { data, error } = await client.rpc('liftlog_sync_push', { p_owner: userId, p_batch_id: batch.batchId, p_changes: batch.changes }).abortSignal(signal);
      if (error) throw new Error(cloudError(error));
      return parseCloudRows(data);
    },
    async pull(cursor) {
      const { data, error } = await client.rpc('liftlog_sync_pull', { p_owner: userId, p_after: cursor }).abortSignal(signal);
      if (error) throw new Error(cloudError(error));
      return parseCloudRows(data);
    },
  };
}
