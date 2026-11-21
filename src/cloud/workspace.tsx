'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { db as guest, LiftLogDB } from '@/db/liftlog';
import { WorkspaceDatabase } from '@/db/workspace';

const rememberedAccount = 'liftlog.workspace.user';
type ClientModule = typeof import('./client');
const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_'));
const workspaceEvent = 'liftlog-workspace';

function storedAccount() {
  if (!configured) return null;
  try {
    const value = localStorage.getItem(rememberedAccount);
    return value && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value) ? value : null;
  } catch { return null; }
}

function selectAccount(id: string | null) {
  try {
    if (id) localStorage.setItem(rememberedAccount, id);
    else localStorage.removeItem(rememberedAccount);
  } catch { /* The browser may block persistence. */ }
  window.dispatchEvent(new Event(workspaceEvent));
}

function subscribeWorkspace(change: () => void) {
  window.addEventListener('storage', change);
  window.addEventListener(workspaceEvent, change);
  return () => {
    window.removeEventListener('storage', change);
    window.removeEventListener(workspaceEvent, change);
  };
}

type CloudAccess = {
  configured: boolean;
  accountId: string | null;
  email?: string;
  signedIn: boolean;
  status: string;
  error?: string;
  signIn: (email?: string) => Promise<void>;
  signOut: () => Promise<void>;
  syncNow: () => Promise<void>;
  importGuest: () => Promise<number>;
  deleteAccount: () => Promise<void>;
};

const CloudContext = createContext<CloudAccess | null>(null);
export const useCloud = () => useContext(CloudContext);

export function CloudWorkspace({ children }: { children: ReactNode }) {
  const remembered = useSyncExternalStore(subscribeWorkspace, storedAccount, () => null);
  const [session, setSession] = useState<Session | null>(null);
  const [client, setClient] = useState<ClientModule>();
  const [status, setStatus] = useState('Local only');
  const [error, setError] = useState<string>();
  const accountId = session?.user.id ?? remembered;
  const signedIn = Boolean(session && session.user.id === accountId);
  const database = useMemo(() => accountId ? new LiftLogDB(`liftlog-account-${accountId}`) : guest, [accountId]);
  const runSync = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    if (!configured) return;
    let alive = true;
    let unsubscribe: (() => void) | undefined;
    void import('./client').then((module) => {
      if (!alive) return;
      const supabase = module.getCloudClient();
      if (!supabase) return;
      setClient(module);
      const { data } = supabase.auth.onAuthStateChange((event, next) => {
        if (!alive) return;
        setSession(next);
        if (next) selectAccount(next.user.id);
        if (event === 'SIGNED_OUT') selectAccount(null);
        const callback = new URL(window.location.href);
        if (callback.searchParams.has('liftlog_auth') && (next || event === 'INITIAL_SESSION')) {
          callback.searchParams.delete('liftlog_auth');
          callback.searchParams.delete('error');
          callback.searchParams.delete('error_code');
          callback.searchParams.delete('error_description');
          // A fragment navigation moves the tab to Profile without reloading the app.
          window.history.replaceState(window.history.state, '', callback);
          window.location.hash = 'profile';
          if (!next) setError('Open a fresh sign-in link in the same browser where you requested it.');
        }
      });
      unsubscribe = () => data.subscription.unsubscribe();
    }).catch(() => { if (alive) setError('Cloud sign-in could not start. Local tracking is available.'); });
    return () => { alive = false; unsubscribe?.(); };
  }, []);

  useEffect(() => {
    return () => { if (database !== guest) database.close({ disableAutoOpen: false }); };
  }, [database]);

  useEffect(() => {
    const supabase = client?.getCloudClient();
    if (!client || !supabase || !signedIn || !accountId) return;
    const controller = new AbortController();
    let running: Promise<void> | undefined;
    const transport = client.transportFor(supabase, accountId, controller.signal);

    function sync() {
      if (running) return running;
      running = (async () => {
        if (!navigator.onLine) {
          setStatus('Offline. Changes are saved here.');
          throw new Error('Reconnect to run cloud sync.');
        }
        setStatus('Syncing…');
        setError(undefined);
        try {
          const { syncAccount } = await import('./sync');
          let more = true;
          while (more && !controller.signal.aborted) more = await syncAccount(database, transport);
          if (!controller.signal.aborted) setStatus('Up to date');
        } catch (reason) {
          if (!controller.signal.aborted) {
            setStatus('Sync paused');
            setError(reason instanceof Error ? reason.message : 'Cloud sync is unavailable. Your local data is safe.');
          }
          throw reason;
        }
      })().finally(() => { running = undefined; });
      return running;
    }

    const start = () => { if (document.visibilityState === 'visible') void sync().catch(() => {}); };
    const offline = () => setStatus('Offline. Changes are saved here.');
    runSync.current = sync;
    start();
    const interval = window.setInterval(start, 15_000);
    window.addEventListener('online', start);
    window.addEventListener('offline', offline);
    document.addEventListener('visibilitychange', start);
    return () => {
      controller.abort();
      runSync.current = null;
      window.clearInterval(interval);
      window.removeEventListener('online', start);
      window.removeEventListener('offline', offline);
      document.removeEventListener('visibilitychange', start);
    };
  }, [client, database, signedIn, accountId]);

  function activeClient() {
    const supabase = client?.getCloudClient();
    if (!client || !supabase) throw new Error('Supabase sign-in is still opening. Try again in a moment.');
    return { module: client, supabase };
  }

  async function signIn(email?: string) {
    const { module, supabase } = activeClient();
    const redirectTo = module.redirectToProfile();
    const result = email
      ? await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } })
      : await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
    if (result.error) throw new Error(module.cloudError(result.error));
  }

  async function signOut() {
    const { module, supabase } = activeClient();
    const { error: failure } = await supabase.auth.signOut({ scope: 'local' });
    if (failure) throw new Error(module.cloudError(failure));
    selectAccount(null);
    setSession(null);
    setError(undefined);
  }

  async function syncNow() {
    if (!runSync.current) throw new Error('Sign in to run sync.');
    await runSync.current();
  }

  async function importGuest() {
    if (!signedIn) throw new Error('Sign in before importing guest data.');
    await syncNow();
    const { importGuestData } = await import('./sync');
    const count = await importGuestData(guest, database);
    // The copy is already durable. A network outage leaves it queued for the next sync.
    void syncNow().catch(() => {});
    return count;
  }

  async function deleteAccount() {
    if (!signedIn || !accountId) throw new Error('Sign in before deleting the account.');
    const { module, supabase } = activeClient();
    const { error: failure } = await supabase.rpc('liftlog_delete_account', { p_owner: accountId });
    if (failure) throw new Error(module.cloudError(failure));
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    selectAccount(null);
    setSession(null);
    setError(undefined);
    await database.clearGuestData();
  }

  return <CloudContext.Provider value={{ configured, accountId, email: session?.user.email, signedIn, status: signedIn ? status : accountId ? 'Stored on this device' : 'Local only', error, signIn, signOut, syncNow, importGuest, deleteAccount }}>
    <WorkspaceDatabase.Provider key={database.name} value={database}>{children}</WorkspaceDatabase.Provider>
  </CloudContext.Provider>;
}
