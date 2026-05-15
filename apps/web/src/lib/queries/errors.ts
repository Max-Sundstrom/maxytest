/**
 * Small error taxonomy for studies/blocks mutations.
 *
 * Plan 01-04 introduces `ValidationError` so the publish flow can distinguish
 * the server-side "no_question_blocks" check (D-27, surfaced as a destructive
 * toast with a copy-locked message) from generic Supabase errors (toasted
 * with a generic fallback). Other phases can extend `code` as the surface
 * grows; the union stays narrow on purpose so the UX layer cannot match
 * stale codes against new rule strings.
 */

export type ValidationCode = 'NO_QUESTION_BLOCKS';

export class ValidationError extends Error {
  readonly code: ValidationCode;

  constructor(code: ValidationCode, message?: string) {
    super(message ?? code);
    this.name = 'ValidationError';
    this.code = code;
  }
}
