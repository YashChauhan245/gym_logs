import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowDown, ArrowRight, BookOpen, ChartNoAxesCombined, Dumbbell, Utensils } from 'lucide-react';
import { Button } from '@/components/ui/button';
import './product.css';

export const metadata: Metadata = {
  title: 'LiftLog — An offline training journal',
  description: 'Log strength workouts, follow exercise guides, see your progress, and plan nutrition with LiftLog.',
};

const preview = [1, 2, 1, 3, 3, 4];

export default function ProductPage() {
  return <main className="product-page">
    <header className="product-header product-boundary">
      <Link href="/" className="brand" aria-label="LiftLog home"><span className="app-mark"><Dumbbell size={22} strokeWidth={2.5} /></span><span>LiftLog</span></Link>
      <Button asChild variant="secondary"><Link href="/" prefetch={false}>Open app <ArrowRight size={16} /></Link></Button>
    </header>

    <div className="product-boundary">
      <section className="product-intro" aria-labelledby="product-title">
        <div className="product-intro-copy">
          <h1 id="product-title">Your training,<br /><em>on the record.</em></h1>
          <p>Log your lifts, find your form, and see the work add up. LiftLog brings strength training and nutrition together in a journal that works offline.</p>
          <div className="product-actions">
            <Button asChild><Link href="/" prefetch={false}>Open LiftLog <ArrowRight size={18} /></Link></Button>
            <a className="utility-link" href="#product-features">See what’s inside <ArrowDown size={16} /></a>
          </div>
          <p className="product-start-note">Start logging without an account.</p>
        </div>
        <div className="product-photo">
          <Image src="/images/liftlog-iron.webp" width={1032} height={1290} sizes="(max-width: 730px) 100vw, 48vw" preload unoptimized alt="" />
          <div className="product-example">
            <div className="product-example-label"><span>Example progress</span><ChartNoAxesCombined size={17} aria-hidden="true" /></div>
            <p><strong>{preview.reduce((sum, count) => sum + count, 0)}</strong> sessions<span className="sr-only"> over six weeks</span></p>
            <div className="product-example-plot" aria-hidden="true">{preview.map((count, index) => <span key={index} style={{ height: `${count * 25}%` }} />)}</div>
            <div className="product-example-axis" aria-hidden="true"><span>Week 1</span><span>Week 6</span></div>
          </div>
        </div>
      </section>

      <section id="product-features" className="product-features" aria-labelledby="product-features-title">
        <h2 id="product-features-title">What you can track</h2>
        <div className="product-feature-grid">
          <article><BookOpen size={22} aria-hidden="true" /><h3>Workouts</h3><p>Record sets by hand or paste them into Quick Log. Browse 360 exercise guides by muscle group or equipment.</p></article>
          <article><ChartNoAxesCombined size={22} aria-hidden="true" /><h3>Progress</h3><p>See weekly sessions, total weight moved, and the heaviest sets you logged for each lift.</p></article>
          <article><Utensils size={22} aria-hidden="true" /><h3>Nutrition</h3><p>Log meals, reuse portions, and estimate daily calorie and macro targets in the Goal Planner.</p></article>
        </div>
      </section>

      <footer className="product-footer"><span>LiftLog</span><Link href="/" prefetch={false} className="utility-link">Open the training journal <ArrowRight size={16} /></Link></footer>
    </div>
  </main>;
}
