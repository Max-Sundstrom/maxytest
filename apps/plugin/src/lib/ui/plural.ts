// apps/plugin/src/lib/ui/plural.ts — Phase 02.2 Plan 07 Task 2.
//
// Russian-language plural-form helpers. Russian has THREE plural categories:
//
//   - 'one' : 1, 21, 31, … (ending in 1, but NOT 11)
//   - 'few' : 2-4, 22-24, 32-34, … (ending in 2-4, but NOT 12-14)
//   - 'many': 0, 5-20, 25-30, … (everything else)
//
// `Intl.PluralRules` does the bucket math for us; we just map the three
// buckets to literal words. The 'other' bucket (used for fractional numbers
// in some languages) is a safe alias to 'many' here — we always pass
// integers, and Russian's 'other' coincides with 'many' for integers.
//
// Spec: UI-SPEC §"Copywriting Contract" + §"Open Items" #3.

// `Intl.PluralRules` is ES2018+ but Figma's runtime (Chromium 95+) has had
// full ES2020 support for years. tsconfig.ui.json targets ES2017 to keep
// the emit floor low; we strongly-type a thin local wrapper rather than
// raising the project-wide lib target or declaring a TS namespace (which
// the workspace ESLint rule @typescript-eslint/no-namespace forbids).
interface PluralRulesShape {
  select(n: number): 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';
}

// Cast through `unknown` — `Intl` as typed by ES2017 lib has no
// `PluralRules` member; the runtime call still works on Figma's Chromium.
const pluralRules: PluralRulesShape = new (
  Intl as unknown as { PluralRules: new (locale?: string) => PluralRulesShape }
).PluralRules('ru');

/** Returns "фрейм" / "фрейма" / "фреймов" for n ∈ ℤ⁺. */
export function frameWord(n: number): string {
  switch (pluralRules.select(n)) {
    case 'one':
      return 'фрейм';
    case 'few':
      return 'фрейма';
    case 'many':
    case 'other':
    default:
      return 'фреймов';
  }
}

/** Returns "изображение" / "изображения" / "изображений" for n ∈ ℤ⁺. */
export function imageWord(n: number): string {
  switch (pluralRules.select(n)) {
    case 'one':
      return 'изображение';
    case 'few':
      return 'изображения';
    case 'many':
    case 'other':
    default:
      return 'изображений';
  }
}
