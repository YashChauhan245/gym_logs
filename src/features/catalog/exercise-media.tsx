import { ExternalLink } from 'lucide-react';
import type { Exercise } from '@/domain/workout';
import data from './exercise-media.json';

const licenses = {
  'by-3': ['CC BY 3.0', 'https://creativecommons.org/licenses/by/3.0/'],
  'by-4': ['CC BY 4.0', 'https://creativecommons.org/licenses/by/4.0/'],
  'by-sa-3': ['CC BY-SA 3.0', 'https://creativecommons.org/licenses/by-sa/3.0/'],
  'by-sa-4': ['CC BY-SA 4.0', 'https://creativecommons.org/licenses/by-sa/4.0/'],
  cc0: ['CC0 1.0', 'https://creativecommons.org/publicdomain/zero/1.0/'],
} as const;

type MediaFile = { src: string; author: string; license: keyof typeof licenses; source: string; changes: string };
type ExerciseMedia = { images?: MediaFile[]; video?: MediaFile };
const media: Record<string, ExerciseMedia> = data as Record<string, ExerciseMedia>;
const tutorials: Partial<Record<string, { provider: string; url: string }>> = {
  'catalog:Alternate_Hammer_Curl': { provider: 'Muscle & Strength', url: 'https://www.muscleandstrength.com/exercises/alternate-standing-hammer-curl.html' },
  'catalog:Cable_Preacher_Curl': { provider: 'FitMetrics', url: 'https://www.fitmetrics.ch/en/exercise/6733d741ca1c0-cable-preacher-curl/videos' },
  'catalog:Cable_Rope_Overhead_Triceps_Extension': { provider: 'Muscle & Strength', url: 'https://www.muscleandstrength.com/node/4118' },
  'catalog:Incline_Dumbbell_Curl': { provider: 'YouTube', url: 'https://www.youtube.com/watch?v=HhHHBj3qTJ4' },
  'catalog:Alternate_Incline_Dumbbell_Curl': { provider: 'Weight Training Guide', url: 'https://weighttraining.guide/exercises/incline-dumbbell-curl/' },
  'catalog:Romanian_Deadlift': { provider: 'Catalyst Athletics', url: 'https://www.catalystathletics.com/exercise/101/Romanian-Deadlift-RDL/' },
  'catalog:Wide-Grip_Lat_Pulldown': { provider: 'YouTube', url: 'https://www.youtube.com/watch?v=7JnP8dFbS14' },
};

export function mediaFor(exercise: Exercise): ExerciseMedia | undefined {
  return media[exercise.id];
}

export function movementImages(exercise: Exercise) {
  return mediaFor(exercise)?.images?.map((image) => image.src) ?? exercise.images;
}

export function ExerciseVideo({ exercise }: { exercise: Exercise }) {
  const demo = mediaFor(exercise)?.video;
  if (!demo && exercise.custom) return null;
  const tutorial = tutorials[exercise.id];
  const search = new URLSearchParams({ search_query: `${exercise.name} exercise form tutorial` });
  return <section className="movement-guide" aria-labelledby="exercise-video-title">
    <h3 id="exercise-video-title">{demo ? 'Demonstration video' : tutorial ? 'Video tutorial' : 'Video tutorial search'}</h3>
    {demo ? <>
      {/* These clips have no audio. The written guide describes the technique. */}
      <video className="exercise-video" aria-label={`${exercise.name} demonstration`} controls playsInline preload="none" poster={movementImages(exercise)[0]}>
        <source src={demo.src} type="video/mp4" />
      </video>
      <a className="utility-link" href={demo.src} target="_blank" rel="noreferrer">Open video separately <ExternalLink size={15} aria-hidden="true" /></a>
    </> : <a className="utility-link" href={tutorial?.url ?? `https://www.youtube.com/results?${search}`} target="_blank" rel="noreferrer">
      {tutorial ? `Watch tutorial on ${tutorial.provider}` : `Find a ${exercise.name} tutorial on YouTube`} <ExternalLink size={15} aria-hidden="true" />
    </a>}
  </section>;
}

export function ExerciseMediaCredits({ exercise }: { exercise: Exercise }) {
  const current = mediaFor(exercise);
  if (!current) return null;
  const files = [...(current.images ?? []), ...(current.video ? [current.video] : [])];
  const credits = new Map(files.map((item) => [JSON.stringify([item.author, item.license, item.source, item.changes]), item]));
  return <details className="exercise-media-credits">
    <summary>Media credits</summary>
    <ul>{Array.from(credits, ([key, credit]) => {
      const [name, url] = licenses[credit.license];
      return <li key={key}>
        {credit.author} · <a href={credit.source} target="_blank" rel="noreferrer">Source</a> · <a href={url} target="_blank" rel="noreferrer">{name}</a>. {credit.changes}
      </li>;
    })}</ul>
  </details>;
}
