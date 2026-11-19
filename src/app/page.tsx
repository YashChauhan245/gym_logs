import { LiftLogApp } from '@/features/liftlog-app';

export default function Home() {
  return <><link rel="preload" as="image" href="/images/training-hero.webp" fetchPriority="high" /><LiftLogApp /></>;
}
