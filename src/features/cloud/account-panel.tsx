'use client';

import { useState, type FormEvent } from 'react';
import { Cloud, Download, LogOut, RefreshCw, Trash2 } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useCloud } from '@/cloud/workspace';
import { guestStoresFor } from '@/cloud/types';
import { accountRoleLabel, type AccountRole } from '@/cloud/role';
import { db as guest } from '@/db/liftlog';

export function AccountPanel({ notify }: { notify: (message: string) => void }) {
  const cloud = useCloud();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [sent, setSent] = useState(false);
  const [role, setRole] = useState<AccountRole>('personal');
  const [confirm, setConfirm] = useState<'import' | 'delete'>();
  const count = useLiveQuery(async () => {
    if (!cloud?.signedIn || !cloud.role) return 0;
    const sizes = await Promise.all(guestStoresFor(cloud.role).map((name) => guest.table(name).count()));
    return sizes.reduce((sum, size) => sum + size, 0);
  }, [cloud?.signedIn, cloud?.role]) ?? 0;

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
    void act(async () => { await access.signIn(role, email); setSent(true); });
  }

  return <section className="panel settings-panel cloud-account" aria-labelledby="cloud-account-title">
    <div className="card-title"><span className="glyph-box"><Cloud size={19} /></span><h2 id="cloud-account-title">Cloud sync</h2></div>
    {access.signedIn && !access.role ? <>
      <p role="status">{access.roleError ? 'Account type unavailable' : 'Checking your account type…'}</p>
      {access.roleError && <p role="alert" className="error-text">{access.roleError}</p>}
      <div className="profile-actions"><Button variant="secondary" onClick={() => window.location.reload()}>Reload account</Button><Button variant="ghost" disabled={busy} onClick={() => act(access.signOut)}>Sign out</Button></div>
    </> : access.signedIn ? <>
      <p>{access.role && <strong>{accountRoleLabel(access.role)} · </strong>}{access.email && <span>{access.email} · </span>}<span role="status">{access.status}</span></p>
      <div className="profile-actions">
        <Button variant="secondary" disabled={busy} onClick={() => act(access.syncNow)}><RefreshCw size={17} /> Sync now</Button>
        {count > 0 && <Button variant="secondary" disabled={busy} onClick={() => setConfirm('import')}><Download size={17} /> Import guest data</Button>}
        <Button variant="ghost" disabled={busy} onClick={() => act(access.signOut)}><LogOut size={17} /> Sign out</Button>
        <Button variant="danger" disabled={busy} onClick={() => setConfirm('delete')}><Trash2 size={17} /> Delete account</Button>
      </div>
    </> : <>
      <p>{access.accountId ? 'Sign in again to resume syncing this workspace.' : 'Choose an account type before you sign in. Your first sign-in sets the account type.'}</p>
      <form className="stack-form" onSubmit={emailSignIn}>
        <fieldset className="account-types"><legend>Account type</legend>
          <label><input type="radio" name="account-type" checked={role === 'personal'} onChange={() => setRole('personal')} /> Personal <small>Workouts, progress and nutrition</small></label>
          <label><input type="radio" name="account-type" checked={role === 'gym_owner'} onChange={() => setRole('gym_owner')} /> Gym owner <small>Members, attendance and fee records</small></label>
        </fieldset>
        <label>Email<input type="email" name="email" autoComplete="email" required /></label>
        <div className="profile-actions"><Button type="submit" disabled={busy || !access.authReady}>Email a sign-in link</Button><Button variant="secondary" disabled={busy || !access.authReady} onClick={() => act(() => access.signIn(role))}>Sign in with Google</Button>
          {access.accountId && <Button variant="ghost" disabled={busy || !access.authReady} onClick={() => act(access.signOut)}>Switch to guest</Button>}</div>
      </form>
      {sent && <p role="status">Open the sign-in link in the same browser you used to request it.</p>}
    </>}
    {(error || access.error || access.role && access.roleError) && !confirm && <p className="error-text" role="alert">{error ?? access.error ?? access.roleError}</p>}
    {confirm && <Modal open onOpenChange={(open) => { if (!open && !busy) setConfirm(undefined); }}
      title={confirm === 'import' ? 'Import guest data?' : 'Delete account and synced data?'}
      description={confirm === 'import' ? (access.role === 'gym_owner' ? 'Copy guest gym records into your owner account.' : 'Copy guest workouts, nutrition, and preferences into your personal account.') : 'This permanently removes your synced LiftLog data, your sign-in from this Supabase project, and the account copy on this device.'}>
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
