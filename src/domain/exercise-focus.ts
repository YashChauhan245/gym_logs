import type { Exercise } from './workout';

export const muscleGroups = [
  { id: 'biceps', label: 'Biceps', muscles: ['biceps'], areas: [['long-head', 'Long head'], ['short-head', 'Short head'], ['brachialis', 'Brachialis']] },
  { id: 'triceps', label: 'Triceps', muscles: ['triceps'], areas: [['long-head', 'Long head'], ['lateral-head', 'Lateral head'], ['medial-head', 'Medial head']] },
  { id: 'legs', label: 'Legs', muscles: ['quadriceps', 'hamstrings', 'calves', 'glutes', 'adductors', 'abductors'], areas: [['quads', 'Quads'], ['hamstrings', 'Hamstrings'], ['calves', 'Calves'], ['glutes', 'Glutes'], ['adductors', 'Inner thigh / adductors'], ['abductors', 'Outer hip / abductors']] },
  { id: 'chest', label: 'Chest', muscles: ['chest'], areas: [['upper', 'Upper chest'], ['middle', 'Middle chest'], ['lower', 'Lower chest']] },
  { id: 'abs', label: 'Abs', muscles: ['abdominals'], areas: [['upper', 'Upper abs'], ['lower', 'Lower abs'], ['obliques', 'Obliques'], ['deep-core', 'Deep core / stability']] },
  { id: 'back', label: 'Back', muscles: ['lats', 'middle back', 'lower back', 'traps', 'neck'], areas: [['lats', 'Lats'], ['upper-back', 'Upper / middle back'], ['lower-back', 'Lower back'], ['traps', 'Traps'], ['neck', 'Neck']] },
  { id: 'shoulders', label: 'Shoulders', muscles: ['shoulders'], areas: [['front-delt', 'Front delts'], ['side-delt', 'Side delts'], ['rear-delt', 'Rear delts'], ['rotator-cuff', 'Rotator cuff']] },
  { id: 'forearms', label: 'Forearms', muscles: ['forearms'], areas: [['flexors', 'Wrist flexors'], ['extensors', 'Wrist extensors'], ['grip', 'Grip']] },
];
export const muscleGroupFor = (muscle: string) => muscleGroups.find((g) => g.muscles.includes(muscle));

const exactMuscleAreas: Record<string, string> = {
  quadriceps: 'quads', hamstrings: 'hamstrings', calves: 'calves', glutes: 'glutes',
  adductors: 'adductors', abductors: 'abductors', lats: 'lats',
  'middle back': 'upper-back', 'lower back': 'lower-back', traps: 'traps', neck: 'neck',
};

/** Descriptive training emphasis, never a claim that a movement isolates a head. */
export function exerciseAreas(exercise: Exercise, groupId: string, includeSecondary = false): string[] {
  const group = muscleGroups.find((g) => g.id === groupId);
  if (!group) return [];
  const isPrimary = group.muscles.includes(exercise.muscle);
  const muscles = [exercise.muscle, ...(includeSecondary ? exercise.secondary : [])].filter((m) => group.muscles.includes(m));
  if (isPrimary && exercise.targetAreas?.length) return exercise.targetAreas.filter((id) => group.areas.some(([key]) => key === id));
  if (groupId === 'legs' || groupId === 'back') return [...new Set(muscles.map((m) => exactMuscleAreas[m]).filter(Boolean))];
  if (!isPrimary) return [];
  const name = `${exercise.name} ${exercise.aliases.join(' ')}`.toLowerCase();
  switch (groupId) {
    case 'biceps':
      if (/hammer|reverse.*curl|pronated.*curl/.test(name)) return ['brachialis'];
      if (/preacher|concentration|spider|wide.grip|inner.bicep/.test(name)) return ['short-head'];
      if (/incline|drag.curl|behind/.test(name)) return ['long-head'];
      return ['long-head', 'short-head'];
    case 'triceps':
      if (/supinated|reverse.grip/.test(name)) return ['medial-head'];
      if (/overhead|skull|lying|seated.triceps.press|decline.*extension/.test(name)) return ['long-head'];
      if (/pushdown|kickback|pronated/.test(name)) return ['lateral-head', 'medial-head'];
      return ['long-head', 'lateral-head', 'medial-head'];
    case 'chest':
      if (/decline.*push.?up/.test(name)) return ['upper'];
      if (/incline.*push.?up/.test(name)) return ['lower'];
      if (/incline/.test(name)) return ['upper'];
      if (/decline|dip/.test(name)) return ['lower'];
      return ['middle'];
    case 'shoulders':
      if (/external.rotation|cuban/.test(name)) return ['rotator-cuff'];
      if (/rear|reverse.fly|face.pull|bent.over.*raise/.test(name)) return ['rear-delt'];
      if (/lateral|side.later|upright.row/.test(name)) return ['side-delt'];
      if (/front|scaption/.test(name)) return ['front-delt'];
      return ['front-delt', 'side-delt'];
    case 'abs':
      if (/side|oblique|twist|bike|bicycle|heel.touch|cross.body|180|spell.caster/.test(name)) return ['obliques'];
      if (/leg.raise|knee.raise|reverse.crunch|hip.raise|butt.up|bottoms.up|pull.in|cocoon/.test(name)) return ['lower'];
      if (/plank|dead.bug|pallof|rollout|ab.wheel/.test(name)) return ['deep-core'];
      return ['upper'];
    case 'forearms':
      if (/reverse|extension|palms?.down/.test(name)) return ['extensors'];
      if (/carry|farmer|hang|grip|pinch|squeeze/.test(name)) return ['grip'];
      return ['flexors'];
    default: return [];
  }
}
export function matchesExerciseFocus(exercise: Exercise, group: string, area: string, includeSecondary = false) {
  if (!group) return true;
  if (area) return exerciseAreas(exercise, group, includeSecondary).includes(area);
  return muscleGroupFor(exercise.muscle)?.id === group ||
    (includeSecondary && exercise.secondary.some((muscle) => muscleGroupFor(muscle)?.id === group));
}
