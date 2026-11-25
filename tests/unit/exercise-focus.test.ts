import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { exerciseAreas, matchesExerciseFocus, muscleGroups } from '@/domain/exercise-focus';
import { exerciseSchema } from '@/domain/workout';

const catalog=exerciseSchema.array().parse(JSON.parse(readFileSync('public/data/exercises.json','utf8')));
function exercise(name:string) { const value=catalog.find((x)=>x.name===name);if(!value)throw Error(name);return value; }
describe('exercise group and target-area filters',()=>{
  it('finds every primary muscle and provides at least one exercise in every listed target area',()=>{
    for(const x of catalog) expect(muscleGroups.some((g)=>exerciseAreas(x,g.id).length>0),x.name).toBe(true);
    for(const group of muscleGroups) for(const [area] of group.areas) expect(catalog.some((x)=>matchesExerciseFocus(x,group.id,area)),`${group.id}/${area}`).toBe(true);
  });
  it('separates long head, short head and brachialis emphasis',()=>{
    expect(exerciseAreas(exercise('Incline Dumbbell Curl'),'biceps')).toEqual(['long-head']);
    expect(exerciseAreas(exercise('Cable Preacher Curl'),'biceps')).toEqual(['short-head']);
    expect(exerciseAreas(exercise('Rope Hammer Curl'),'biceps')).toEqual(['brachialis']);
    expect(matchesExerciseFocus(exercise('Rope Hammer Curl'),'biceps','long-head')).toBe(false);
  });
  it('supports legs, delts and regional chest and abdominal emphasis',()=>{
    expect(matchesExerciseFocus(exercise('Dumbbell Lateral Raise'),'shoulders','side-delt')).toBe(true);
    expect(matchesExerciseFocus(exercise('Cable Face Pull'),'shoulders','rear-delt')).toBe(true);
    expect(matchesExerciseFocus(exercise('Incline Dumbbell Press'),'chest','upper')).toBe(true);
    expect(matchesExerciseFocus(exercise('Hanging Leg Raise'),'abs','lower')).toBe(true);
    expect(matchesExerciseFocus(exercise('Barbell Back Squat'),'legs','quads')).toBe(true);
  });
  it('only includes secondary muscles when requested and respects custom target choices',()=>{
    const row=exercise('Alternating Kettlebell Row');
    expect(matchesExerciseFocus(row,'biceps','')).toBe(false);
    expect(matchesExerciseFocus(row,'biceps','',true)).toBe(true);
    expect(exerciseAreas({...row,muscle:'biceps',targetAreas:['brachialis']},'biceps')).toEqual(['brachialis']);
  });
});
