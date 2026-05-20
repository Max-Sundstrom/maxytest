/**
 * `context-aggregate` unit tests — Plan 04-03 Task 4.
 *
 * Locks: enabled/disabled sub-question handling (null when disabled), age
 * bucket ordering matches `block.age_question.options` original order,
 * experience histogram length matches `points`, role preserves submission
 * order, unknown age ids ignored.
 */

import { describe, expect, it } from 'vitest';

import { contextAggregate } from '../context-aggregate';
import type { ContextAnswer, ContextContent } from '@/lib/blocks/schemas';

/** Helper — full default context block with all sub-questions enabled. */
function fullBlock(): ContextContent {
  return {
    type: 'context',
    title: 'О вас',
    age_question: {
      enabled: true,
      options: [
        { id: '18-24', label: '18–24' },
        { id: '25-34', label: '25–34' },
        { id: '35-44', label: '35–44' },
        { id: '45-54', label: '45–54' },
        { id: '55+', label: '55+' },
        { id: 'prefer_not', label: 'Предпочитаю не отвечать' },
      ],
    },
    experience_question: {
      enabled: true,
      points: 5,
      endpointMinLabel: 'Новичок',
      endpointMaxLabel: 'Эксперт',
    },
    role_question: {
      enabled: true,
      placeholder: 'UX-дизайнер…',
    },
    required: false,
  } as ContextContent;
}

function ageOnlyBlock(): ContextContent {
  const b = fullBlock();
  // Disable experience + role
  b.experience_question = { ...b.experience_question!, enabled: false };
  b.role_question = { ...b.role_question!, enabled: false };
  return b;
}

function r(session_id: string, answer: Partial<ContextAnswer>) {
  return { session_id, answer };
}

describe('contextAggregate', () => {
  it('all sub-questions enabled → all three fields non-null', () => {
    const result = contextAggregate(fullBlock(), [
      r('s1', { age: '25-34', experience: 4, role: 'UX-дизайнер' }),
    ]);
    expect(result.age).not.toBeNull();
    expect(result.experience).not.toBeNull();
    expect(result.role).not.toBeNull();
    expect(result.n).toBe(1);
  });

  it('only age enabled → experience + role both null', () => {
    const result = contextAggregate(ageOnlyBlock(), [r('s1', { age: '25-34', experience: 3 })]);
    expect(result.age).not.toBeNull();
    expect(result.experience).toBeNull();
    expect(result.role).toBeNull();
    expect(result.n).toBe(1); // age alone satisfies "at least one enabled answer"
  });

  it('age buckets preserve original option order', () => {
    const result = contextAggregate(fullBlock(), [
      r('s1', { age: '55+' }),
      r('s2', { age: '18-24' }),
      r('s3', { age: '25-34' }),
    ]);
    expect(result.age!.map((b) => b.bucketId)).toEqual([
      '18-24',
      '25-34',
      '35-44',
      '45-54',
      '55+',
      'prefer_not',
    ]);
  });

  it('unknown age ids are ignored defensively', () => {
    const result = contextAggregate(fullBlock(), [
      r('s1', { age: 'martian-99' }),
      r('s2', { age: '18-24' }),
    ]);
    // Only s2 contributes — s1 is unknown.
    const bucket1824 = result.age!.find((b) => b.bucketId === '18-24')!;
    expect(bucket1824.count).toBe(1);
    expect(bucket1824.pct).toBe(100); // 1 of 1 valid
  });

  it('age pct rounded to 1 decimal', () => {
    const result = contextAggregate(fullBlock(), [
      r('s1', { age: '18-24' }),
      r('s2', { age: '25-34' }),
      r('s3', { age: '35-44' }),
    ]);
    for (const bucket of result.age!) {
      if (bucket.count > 0) expect(bucket.pct).toBe(33.3);
    }
  });

  it('experience histogram has length === points', () => {
    const result = contextAggregate(fullBlock(), [r('s1', { experience: 3 })]);
    expect(result.experience!.histogram).toHaveLength(5);
    expect(result.experience!.histogram[2]).toBe(1);
  });

  it('experience mean rounded to 2 decimals', () => {
    const result = contextAggregate(fullBlock(), [
      r('s1', { experience: 4 }),
      r('s2', { experience: 5 }),
      r('s3', { experience: 5 }),
    ]);
    // mean = 14/3 = 4.6666… → 4.67
    expect(result.experience!.mean).toBe(4.67);
    expect(result.experience!.n).toBe(3);
  });

  it('role preserves submission order; empty strings dropped', () => {
    const result = contextAggregate(fullBlock(), [
      r('s1', { role: 'PM' }),
      r('s2', { role: '' }), // dropped
      r('s3', { role: 'Дизайнер' }),
    ]);
    expect(result.role).toEqual([
      { text: 'PM', sessionId: 's1' },
      { text: 'Дизайнер', sessionId: 's3' },
    ]);
  });

  it('n counts respondents with at least one enabled answer', () => {
    const result = contextAggregate(fullBlock(), [
      r('s1', { age: '18-24' }),
      r('s2', { experience: 3 }),
      r('s3', { role: 'PM' }),
      r('s4', {}), // empty → does NOT count
    ]);
    expect(result.n).toBe(3);
  });

  it('all sub-questions disabled → all three null + n=0 (degenerate but defensive)', () => {
    const b = fullBlock();
    b.age_question = { ...b.age_question!, enabled: false };
    b.experience_question = { ...b.experience_question!, enabled: false };
    b.role_question = { ...b.role_question!, enabled: false };
    const result = contextAggregate(b, [r('s1', { age: '18-24', experience: 5 })]);
    expect(result.age).toBeNull();
    expect(result.experience).toBeNull();
    expect(result.role).toBeNull();
    expect(result.n).toBe(0);
  });

  it('out-of-range experience values skipped', () => {
    const result = contextAggregate(fullBlock(), [
      r('s1', { experience: 3 }),
      r('s2', { experience: 0 }),
      r('s3', { experience: 6 }),
      r('s4', { experience: 4 }),
    ]);
    expect(result.experience!.n).toBe(2);
  });
});
