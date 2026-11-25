'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useRef, type ReactNode } from 'react';
import { Button } from './button';

export function Modal({ open, onOpenChange, title, description, children, className = '' }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: string; children: ReactNode; className?: string;
}) {
  const returnFocus = useRef<HTMLElement>(null);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className={`dialog-content ${className}`} {...(!description ? { 'aria-describedby': undefined } : {})}
          onOpenAutoFocus={(event) => {
            if (document.activeElement instanceof HTMLElement) returnFocus.current = document.activeElement;
            if (!(event.target instanceof HTMLElement)) return;
            const target = event.target.querySelector<HTMLElement>('[data-dialog-autofocus]');
            if (target) { event.preventDefault(); target.focus(); }
          }}
          onCloseAutoFocus={(event) => { if (returnFocus.current?.isConnected) { event.preventDefault(); returnFocus.current.focus(); } }}>
          <div className="dialog-heading">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              {description && <Dialog.Description>{description}</Dialog.Description>}
            </div>
            <Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="Close dialog"><X size={20} /></Button></Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
