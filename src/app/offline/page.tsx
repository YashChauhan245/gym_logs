import { BrandMark } from '@/components/brand-mark';

export default function Offline() {
  return <main className="offline-page"><BrandMark /><h1>You’re offline</h1><p>Open LiftLog to reach the data stored on this device.</p>
    {/* Use document navigation so the offline shell can serve this link. */}
    {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
    <a className="button button-primary" href="/#today">Open LiftLog</a>
  </main>;
}
