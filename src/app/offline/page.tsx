import { Dumbbell } from 'lucide-react';

export default function Offline() {
  return <main className="offline-page"><div className="app-mark"><Dumbbell /></div><h1>You’re offline</h1><p>Open LiftLog to reach the workouts stored on this device.</p>
    {/* Use document navigation so the offline shell can serve this link. */}
    {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
    <a className="button button-primary" href="/#today">Open LiftLog</a>
  </main>;
}
