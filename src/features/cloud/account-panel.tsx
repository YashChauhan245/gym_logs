'use client';

import { useState, type FormEvent } from 'react';
import { Cloud, Download, LogOut, RefreshCw, Trash2 } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useCloud } from '@/cloud/workspace';
import { syncedStores } from '@/cloud/types';
import { db as guest } from '@/db/liftlog';

export function AccountPanel({ notify }: { notify: (message: string) => void }) {
  const cloud = useCloud();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [sent, setSent] = useState(false);
  const [confirm, setConfirm] = useState<'import' | 'delete'>();
  const count = useLiveQuery(async () => {
    if (!cloud?.signedIn) return 0;
    const sizes = await Promise.all(syncedStores.map((name) => guest.table(name).count()));
    return sizes.reduce((sum, size) => sum + size, 0);
  }, [cloud?.signedIn]) ?? 0;

  if (!cloud?.configured) return null;
  const access = cloud;

  async function act(action: () => Promise<void>) {
    setError(undefined);
    setBusy(true);
    try { await action(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Try again when connected.'); }
    finally { setBusy(false); }
  }

  function emailSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get('email') ?? '').trim();
    if (!email) return;
    void act(async () => { await access.signIn(email); setSent(true); });
  }

  return <section className="panel settings-panel cloud-account" aria-labelledby="cloud-account-title">
    <div className="card-title"><span className="glyph-box"><Cloud size={19} /></span><h2 id="cloud-account-title">Cloud sync</h2></div>
    {access.signedIn ? <>
      <p>{access.email && <strong>{access.email} · </strong>}<span role="status">{access.status}</span></p>
      <div className="profile-actions">
        <Button variant="secondary" disabled={busy} onClick={() => act(access.syncNow)}><RefreshCw size={17} /> Sync now</Button>
        {count > 0 && <Button variant="secondary" disabled={busy} onClick={() => setConfirm('import')}><Download size={17} /> Import guest data</Button>}
        <Button variant="ghost" disabled={busy} onClick={() => act(access.signOut)}><LogOut size={17} /> Sign out</Button>
        <Button variant="danger" disabled={busy} onClick={() => setConfirm('delete')}><Trash2 size={17} /> Delete account</Button>
      </div>
    </> : <>
      <p>{access.accountId ? 'Sign in again to resume syncing this workspace.' : 'Sign in to sync your workouts and nutrition across devices.'}</p>
      <form className="stack-form" onSubmit={emailSignIn}>
        <label>Email<input type="email" name="email" autoComplete="email" required /></label>
        <div className="profile-actions"><Button type="submit" disabled={busy}>Email a sign-in link</Button><Button variant="secondary" disabled={busy} onClick={() => act(() => access.signIn())}>Sign in with Google</Button>
          {access.accountId && <Button variant="ghost" disabled={busy} onClick={() => act(access.signOut)}>Switch to guest</Button>}</div>
      </form>
      {sent && <p role="status">Open the sign-in link in the same browser you used to request it.</p>}
    </>}
    {(error || access.error) && !confirm && <p className="error-text" role="alert">{error ?? access.error}</p>}
    {confirm && <Modal open onOpenChange={(open) => { if (!open && !busy) setConfirm(undefined); }}
      title={confirm === 'import' ? 'Import guest data?' : 'Delete account and synced data?'}
      description={confirm === 'import' ? 'Copy your guest workouts, nutrition, and preferences into this account. The guest copy stays on this device.' : 'This permanently removes your synced LiftLog data, your sign-in from this Supabase project, and the account copy on this device.'}>
      {error && <p className="error-text" role="alert">{error}</p>}
      <div className="row-actions"><Button variant="secondary" disabled={busy} onClick={() => setConfirm(undefined)}>Cancel</Button>
        {confirm === 'import' ? <Button disabled={busy} onClick={() => act(async () => {
          const copied = await access.importGuest();
          setConfirm(undefined);
          notify(copied ? 'Guest data copied into this account.' : 'Your guest data is already in this account.');
        })}>Import data</Button> : <Button variant="danger" disabled={busy} onClick={() => act(async () => { await access.deleteAccount(); setConfirm(undefined); })}>Delete account</Button>}
      </div>
    </Modal>}
  </section>;
}
