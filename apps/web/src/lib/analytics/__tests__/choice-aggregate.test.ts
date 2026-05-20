/**
 * `choice-aggregate` unit tests — Plan 04-03 Task 2.
 *
 * Locks: sort order (count DESC, ties → original order, «Другое» pinned last),
 * empty defensiveness, single-mode + multi-mode counting, hasOtherOption
 * behaviour, pct rounding.
 */

import { describe, expect, it } from 'vitest';

import { choiceAggregate } from '../choice-aggregate';
import type { ChoiceAnswer, ChoiceContent } from '@/lib/blocks/schemas';

/** Helper to build a minimal ChoiceContent. */
function makeBlock(opts: { hasOtherOption?: boolean } = {}): ChoiceContent {
  return {
    type: 'choice',
    question: 'Какой ваш любимый цвет?',
    mode: 'single',
    options: [
      { id: 'opt-1', label: 'Красный' },
      { id: 'opt-2', label: 'Зелёный' },
      { id: 'opt-3', label: 'Синий' },
    ],
    hasOtherOption: opts.hasOtherOption ?? false,
    shuffleOptions: false,
    required: false,
  } as ChoiceContent;
}

function r(session_id: string, answer: ChoiceAnswer) {
  return { session_id, answer };
}

describe('choiceAggregate', () => {
  it('empty responses → bars=[], totalResponses=0, otherTexts=[]', () => {
    const result = choiceAggregate(makeBlock(), []);
    expect(result.bars).toEqual([]);
    expect(result.totalResponses).toBe(0);
    expect(result.otherTexts).toEqual([]);
  });

  it('single response single-mode → counts that option', () => {
    const result = choiceAggregate(makeBlock(), [r('s1', { selectedId: 'opt-1' })]);
    expect(result.totalResponses).toBe(1);
    const opt1 = result.bars.find((b) => b.optionId === 'opt-1')!;
    expect(opt1.count).toBe(1);
    expect(opt1.pct).toBe(100);
    const opt2 = result.bars.find((b) => b.optionId === 'opt-2')!;
    expect(opt2.count).toBe(0);
    expect(opt2.pct).toBe(0);
  });

  it('multi-mode response counts each selected option once', () => {
    const result = choiceAggregate(makeBlock(), [r('s1', { selectedIds: ['opt-1', 'opt-2'] })]);
    expect(result.totalResponses).toBe(1);
    expect(result.bars.find((b) => b.optionId === 'opt-1')!.count).toBe(1);
    expect(result.bars.find((b) => b.optionId === 'opt-2')!.count).toBe(1);
    expect(result.bars.find((b) => b.optionId === 'opt-3')!.count).toBe(0);
  });

  it('sorts bars by count DESC', () => {
    const result = choiceAggregate(makeBlock(), [
      r('s1', { selectedId: 'opt-3' }),
      r('s2', { selectedId: 'opt-3' }),
      r('s3', { selectedId: 'opt-3' }),
      r('s4', { selectedId: 'opt-1' }),
      r('s5', { selectedId: 'opt-1' }),
      r('s6', { selectedId: 'opt-2' }),
    ]);
    expect(result.bars.map((b) => b.optionId)).toEqual(['opt-3', 'opt-1', 'opt-2']);
    expect(result.totalResponses).toBe(6);
  });

  it('ties broken by original option order (opt-1 before opt-2 before opt-3)', () => {
    const result = choiceAggregate(makeBlock(), [
      r('s1', { selectedId: 'opt-2' }),
      r('s2', { selectedId: 'opt-3' }),
      r('s3', { selectedId: 'opt-1' }),
    ]);
    // All three have count=1 → original order wins.
    expect(result.bars.map((b) => b.optionId)).toEqual(['opt-1', 'opt-2', 'opt-3']);
  });

  it('hasOtherOption=true → «Другое» bar pinned LAST regardless of count', () => {
    const block = makeBlock({ hasOtherOption: true });
    const result = choiceAggregate(block, [
      r('s1', { selectedId: 'opt-1', otherText: 'мятный' }),
      r('s2', { selectedId: 'opt-2', otherText: 'фиолетовый' }),
      r('s3', { selectedId: 'opt-3', otherText: 'индиго' }),
      r('s4', { selectedId: 'opt-3', otherText: 'аквамарин' }),
      r('s5', { selectedId: 'opt-3', otherText: 'лиловый' }),
    ]);
    // Last bar must be «Другое».
    expect(result.bars[result.bars.length - 1]?.isOtherOption).toBe(true);
    expect(result.bars[result.bars.length - 1]?.label).toBe('Другое');
    expect(result.otherTexts).toHaveLength(5);
    expect(result.otherTexts).toContain('мятный');
  });

  it('pct rounded to 1 decimal (no 33.33333… artefacts)', () => {
    const result = choiceAggregate(makeBlock(), [
      r('s1', { selectedId: 'opt-1' }),
      r('s2', { selectedId: 'opt-2' }),
      r('s3', { selectedId: 'opt-3' }),
    ]);
    for (const bar of result.bars) {
      expect(bar.pct).toBe(33.3);
    }
  });

  it('responses with neither selectedId nor selectedIds are ignored', () => {
    const result = choiceAggregate(makeBlock(), [
      r('s1', { selectedId: 'opt-1' }),
      r('s2', {} as ChoiceAnswer),
      r('s3', { selectedIds: [] }),
    ]);
    expect(result.totalResponses).toBe(1);
  });

  it('empty otherText is not pushed; «Другое» count reflects only non-empty texts', () => {
    const block = makeBlock({ hasOtherOption: true });
    const result = choiceAggregate(block, [
      r('s1', { selectedId: 'opt-1', otherText: '' }),
      r('s2', { selectedId: 'opt-2', otherText: 'мятный' }),
    ]);
    expect(result.otherTexts).toEqual(['мятный']);
    const otherBar = result.bars.find((b) => b.isOtherOption)!;
    expect(otherBar.count).toBe(1);
    expect(otherBar.pct).toBe(50);
  });
});
