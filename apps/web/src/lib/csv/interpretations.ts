/**
 * Quick task 260522-skm — interpretation helpers for the CSV export layer.
 *
 * Three pure threshold-to-Russian-label functions used by `buildCsv`'s
 * per-block cell-emit code for the SEQ / UMUX-Lite / NASA-TLX survey
 * blocks shipped in quick task 260522-jwn.
 *
 * Thresholds sourced from RESEARCH.md §Threshold Sources:
 *   - SEQ:        Sauro & Dumas 2009 (HIGH confidence — measuring-u canon)
 *   - UMUX-Lite:  Bangor 2009 SUS-aligned bands re-applied to the 0..100
 *                 UMUX composite (MEDIUM confidence — conventional, not
 *                 vendor-canonical)
 *   - NASA-TLX:   Community UX convention 30/60/80 cuts (MEDIUM confidence —
 *                 widely cited; Hart 2006 publishes no canonical thresholds)
 *
 * Co-located with `export.ts` (NOT in `lib/analytics/`) because the labels
 * are an EXPORT-layer presentation concern — analytics modules return raw
 * numbers, the CSV layer maps them to humanized labels for downstream
 * Excel / pandas consumption. If a UI consumer (report tile) ever wants
 * the same labels, lift this file to a generic location at that point.
 *
 * Pitfall reminders (RESEARCH.md §Common Pitfalls):
 *   - SEQ band edge is `>= 6` (Pitfall 6) — a SEQ of exactly 6 is
 *     «Очень легко», not «Скорее легко».
 *   - UMUX-Lite bands are HALF-OPEN at the LOWER edge (`>= 85`, `>= 70`,
 *     `>= 50`). A composite of exactly 70 is «Хорошо (выше среднего)».
 *   - NASA-TLX bands are HALF-OPEN at the UPPER edge (`<= 30`, `<= 60`,
 *     `<= 80`). An RTLX of exactly 60 is «Умеренная нагрузка»; 60.01 is
 *     already «Высокая нагрузка».
 *
 * Pure module — no imports, no React, no Supabase, no clock reads.
 */

export function seqInterpretation(value: number): string {
  if (value >= 6) return 'Очень легко';
  if (value === 5) return 'Скорее легко';
  if (value === 4) return 'Нейтрально';
  if (value === 3) return 'Скорее сложно';
  return 'Очень сложно';
}

export function umuxLiteInterpretation(composite: number): string {
  if (composite >= 85) return 'Отлично';
  if (composite >= 70) return 'Хорошо (выше среднего)';
  if (composite >= 50) return 'Приемлемо';
  return 'Неудовлетворительно';
}

export function nasaTlxInterpretation(rtlx: number): string {
  if (rtlx <= 30) return 'Низкая нагрузка';
  if (rtlx <= 60) return 'Умеренная нагрузка';
  if (rtlx <= 80) return 'Высокая нагрузка';
  return 'Очень высокая нагрузка';
}
