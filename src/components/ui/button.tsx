import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const buttonVariants = cva('button', {
  variants: {
    variant: { primary: 'button-primary', secondary: 'button-secondary', ghost: 'button-ghost', danger: 'button-danger' },
    size: { default: '', compact: 'button-compact', icon: 'button-icon' },
  },
  defaultVariants: { variant: 'primary', size: 'default' },
});

export function Button({ className, variant, size, asChild, type = 'button', ...props }:
  React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Component = asChild ? Slot : 'button';
  return <Component type={asChild ? undefined : type} className={twMerge(clsx(buttonVariants({ variant, size }), className))} {...props} />;
}
