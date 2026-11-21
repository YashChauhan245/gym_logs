import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LiftLog — Workout Tracker',
  description: 'Log workouts, time your rest, and build a training history that works offline.',
  applicationName: 'LiftLog',
  icons: { icon: '/icons/liftlog-192.png', apple: '/icons/liftlog-apple.png' },
  appleWebApp: { capable: true, title: 'LiftLog', statusBarStyle: 'black-translucent' },
  formatDetection: { telephone: false },
};
export const viewport: Viewport = { themeColor: '#151513', viewportFit: 'cover' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
