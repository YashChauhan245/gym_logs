import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, BookOpen, Building2, ChartNoAxesCombined, Utensils } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BrandMark } from '@/components/brand-mark';
import './product.css';

export const metadata: Metadata = {
  title: 'LiftLog | Gym management and workout tracking',
  description: 'Run gym memberships, renewals, and attendance. Try the LiftLog owner workspace with sample data.',
};

export default function ProductPage() {
  return <main className="product-page">
    <header className="product-header product-boundary">
      <Link href="/" className="brand" aria-label="LiftLog home"><BrandMark /><span>LiftLog</span></Link>
      <Button asChild variant="secondary"><Link href="/" prefetch={false}>Open app <ArrowRight size={16} /></Link></Button>
    </header>

    <div className="product-boundary">
      <section className="product-intro" aria-labelledby="product-title">
        <div className="product-intro-copy">
          <h1 id="product-title">Manage your gym<br /><em>with LiftLog.</em></h1>
          <p>Check members in, see whose membership is ending, and keep a record of fees received. LiftLog also includes an offline workout and nutrition journal.</p>
          <div className="product-actions">
            <Button asChild><Link href="/gym-demo" prefetch={false}>Try the gym demo <ArrowRight size={18} /></Link></Button>
            <Button asChild variant="secondary"><Link href="/" prefetch={false}>Open LiftLog</Link></Button>
          </div>
          <p className="product-start-note">Demo uses sample records.</p>
        </div>
        <div className="product-photo">
          <Image src="/images/liftlog-iron.webp" width={1032} height={1290} sizes="(max-width: 730px) 100vw, 48vw" preload unoptimized alt="" />
        </div>
      </section>

      <section id="for-gym-owners" className="product-owner" aria-labelledby="product-owner-title">
        <div>
          <Building2 size={23} aria-hidden="true" />
          <h2 id="product-owner-title">See today’s gym activity in one place</h2>
          <p>Open the attendance list to see who’s in. Follow up on renewals and fees from the same screen, and add your gym’s logo to printable receipts.</p>
          <Button asChild variant="secondary"><Link href="/#gym" prefetch={false}>Open gym management <ArrowRight size={16} /></Link></Button>
        </div>
        <Link href="/gym-demo" className="product-owner-preview" aria-label="Explore the sample gym dashboard" prefetch={false}>
          <Image src="/images/liftlog-gym-dashboard.webp" width={1076} height={730} sizes="(max-width: 730px) 95vw, 52vw" unoptimized alt="The LiftLog sample gym dashboard shows attendance, membership renewals and fees." />
        </Link>
      </section>

      <section id="product-features" className="product-features" aria-labelledby="product-features-title">
        <h2 id="product-features-title">What you can track</h2>
        <div className="product-feature-grid">
          <article><BookOpen size={22} aria-hidden="true" /><h3>Workouts</h3><p>Record sets or paste them into Quick Log. Browse 360 exercise guides by muscle group, target area, equipment, and difficulty.</p></article>
          <article><ChartNoAxesCombined size={22} aria-hidden="true" /><h3>Progress</h3><p>See weekly sessions, total weight moved, and the heaviest sets you logged for each lift.</p></article>
          <article><Utensils size={22} aria-hidden="true" /><h3>Nutrition</h3><p>Log meals, reuse portions, and estimate daily calorie and macro targets in the Goal Planner.</p></article>
        </div>
      </section>

      <footer className="product-footer"><span>LiftLog</span><Link href="/" prefetch={false} className="utility-link">Open the training journal <ArrowRight size={16} /></Link></footer>
    </div>
  </main>;
}
