'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import dynamic from 'next/dynamic';
import { Download, HardDrive, Share, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

const InstallGuide = dynamic(() => import('@/components/ui/modal').then((module) => module.Modal));

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function subscribeOnline(listener: () => void) {
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => {
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
}

export function PlatformStatus() {
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const [worker, setWorker] = useState<'idle' | 'ready' | 'error'>('idle');
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt>();
  const [installed, setInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [guide, setGuide] = useState(false);

  useEffect(() => {
    let alive = true;
    const receivedPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPrompt);
    };
    const completed = () => {
      setInstalled(true);
      setInstallPrompt(undefined);
    };
    const controlled = () => { if (navigator.serviceWorker.controller) setWorker('ready'); };
    const device = window.requestAnimationFrame(() => {
      setInstalled(window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
      setIsIos(/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
    });
    window.addEventListener('beforeinstallprompt', receivedPrompt);
    window.addEventListener('appinstalled', completed);
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      controlled();
      navigator.serviceWorker.addEventListener('controllerchange', controlled);
      navigator.serviceWorker.register('/sw.js').then((registration) => {
        registration.installing?.addEventListener('statechange', (event) => {
          if (alive && !navigator.serviceWorker.controller && (event.target as ServiceWorker).state === 'redundant') setWorker('error');
        });
      }).catch(() => { if (alive) setWorker('error'); });
    }
    return () => {
      alive = false;
      window.cancelAnimationFrame(device);
      window.removeEventListener('beforeinstallprompt', receivedPrompt);
      window.removeEventListener('appinstalled', completed);
      navigator.serviceWorker?.removeEventListener('controllerchange', controlled);
    };
  }, []);

  async function install() {
    if (!installPrompt) {
      setGuide(true);
      return;
    }
    try {
      await installPrompt.prompt();
      const result = await installPrompt.userChoice;
      if (result.outcome === 'accepted') setInstalled(true);
    } catch {
      setGuide(true);
    } finally {
      setInstallPrompt(undefined);
    }
  }

  return <div className="platform-controls">
    <span className="local-status" title={worker === 'ready' ? 'The workout shell and exercise catalog are cached.' : 'Your workouts are stored on this device.'}>
      {online ? <HardDrive size={15} /> : <WifiOff size={15} />}
      <span>{!online ? 'Offline' : worker === 'ready' ? 'Offline ready' : worker === 'error' ? 'Offline setup failed' : 'Local storage'}</span>
    </span>
    {!installed && <Button size="compact" variant="secondary" className="install-button" onClick={install}><Download size={16} /><span>Install app</span></Button>}
    {guide && <InstallGuide open onOpenChange={setGuide} title="Install LiftLog" description="Open LiftLog directly from your home screen.">
      {isIos ? <ol className="guide-steps"><li>Open this page in Safari.</li><li>Tap Share <Share size={16} aria-hidden="true" />.</li><li>Choose Add to Home Screen, then tap Add.</li></ol>
        : <p className="muted">Open your browser menu and look for Install app or Add to Home Screen. The install option depends on the browser.</p>}
      <Button onClick={() => setGuide(false)} className="dialog-action">Done</Button>
    </InstallGuide>}
  </div>;
}
