/**
 * Quick task 260522-skm — boundary table for the three CSV-layer
 * interpretation helpers shipped alongside the SEQ / UMUX-Lite / NASA-TLX
 * column extension in `260522-skm-PLAN.md`.
 *
 * Why a dedicated boundary table:
 *   - The thresholds are sourced from RESEARCH.md §Threshold Sources
 *     (Sauro 2009 SEQ + Bangor 2009 SUS-aligned UMUX bands + community
 *     RTLX bands). Boundaries are HALF-OPEN in different directions per
 *     instrument — UMUX uses `>=` at the lower edge of each band, NASA-TLX
 *     uses `<=` at the upper edge. Pitfall 6 in RESEARCH.md explicitly
 *     calls out the `> 6` vs `>= 6` SEQ trap.
 *   - String literals MUST match the Russian copy exactly («…», not "…").
 *     Mis-encoded quotes silently drift the CSV downstream.
 */
import { describe, expect, it } from 'vitest';

import {
  nasaTlxInterpretation,
  seqInterpretation,
  umuxLiteInterpretation,
} from '../interpretations';

describe('seqInterpretation', () => {
  it('1 → Очень сложно', () => expect(seqInterpretation(1)).toBe('Очень сложно'));
  it('2 → Очень сложно', () => expect(seqInterpretation(2)).toBe('Очень сложно'));
  it('3 → Скорее сложно', () => expect(seqInterpretation(3)).toBe('Скорее сложно'));
  it('4 → Нейтрально', () => expect(seqInterpretation(4)).toBe('Нейтрально'));
  it('5 → Скорее легко', () => expect(seqInterpretation(5)).toBe('Скорее легко'));
  it('6 → Очень легко', () => expect(seqInterpretation(6)).toBe('Очень легко'));
  it('7 → Очень легко', () => expect(seqInterpretation(7)).toBe('Очень легко'));
});

describe('umuxLiteInterpretation', () => {
  it('0 → Неудовлетворительно', () =>
    expect(umuxLiteInterpretation(0)).toBe('Неудовлетворительно'));
  it('49.99 → Неудовлетворительно', () =>
    expect(umuxLiteInterpretation(49.99)).toBe('Неудовлетворительно'));
  it('50 → Приемлемо', () => expect(umuxLiteInterpretation(50)).toBe('Приемлемо'));
  it('69.99 → Приемлемо', () => expect(umuxLiteInterpretation(69.99)).toBe('Приемлемо'));
  it('70 → Хорошо (выше среднего)', () =>
    expect(umuxLiteInterpretation(70)).toBe('Хорошо (выше среднего)'));
  it('84.99 → Хорошо (выше среднего)', () =>
    expect(umuxLiteInterpretation(84.99)).toBe('Хорошо (выше среднего)'));
  it('85 → Отлично', () => expect(umuxLiteInterpretation(85)).toBe('Отлично'));
  it('100 → Отлично', () => expect(umuxLiteInterpretation(100)).toBe('Отлично'));
});

describe('nasaTlxInterpretation', () => {
  it('0 → Низкая нагрузка', () => expect(nasaTlxInterpretation(0)).toBe('Низкая нагрузка'));
  it('30 → Низкая нагрузка', () => expect(nasaTlxInterpretation(30)).toBe('Низкая нагрузка'));
  it('30.01 → Умеренная нагрузка', () =>
    expect(nasaTlxInterpretation(30.01)).toBe('Умеренная нагрузка'));
  it('60 → Умеренная нагрузка', () => expect(nasaTlxInterpretation(60)).toBe('Умеренная нагрузка'));
  it('60.01 → Высокая нагрузка', () =>
    expect(nasaTlxInterpretation(60.01)).toBe('Высокая нагрузка'));
  it('80 → Высокая нагрузка', () => expect(nasaTlxInterpretation(80)).toBe('Высокая нагрузка'));
  it('80.01 → Очень высокая нагрузка', () =>
    expect(nasaTlxInterpretation(80.01)).toBe('Очень высокая нагрузка'));
  it('100 → Очень высокая нагрузка', () =>
    expect(nasaTlxInterpretation(100)).toBe('Очень высокая нагрузка'));
});
