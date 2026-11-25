import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { BrandMark } from '@/components/brand-mark';
import { GymDemo } from '@/features/gym/gym-demo';
import '@/features/gym/gym.css';

export const metadata: Metadata = {
  title: 'Gym management demo | LiftLog',
  description: 'Try a member check-in or renewal in the LiftLog sample gym.',
};

export default function GymDemoPage() {
  return <div className="gym-demo-page">
    <header className="gym-demo-nav">
      <Link href="/product" className="brand" aria-label="LiftLog overview"><BrandMark /><span>LiftLog</span></Link>
      <Link href="/product#for-gym-owners" className="utility-link"><ArrowLeft size={16} aria-hidden="true" /> Back to overview</Link>
    </header>
    <main className="gym-demo-content"><GymDemo /></main>
  </div>;
}
