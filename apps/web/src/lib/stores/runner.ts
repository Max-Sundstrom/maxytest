/**
 * Runner store — Plan 01-05 Task 2.
 *
 * Zustand store powering the respondent-facing runner. Persists the
 * respondent's in-flight progress in localStorage keyed by `runToken` so a
 * refresh / accidental tab close resumes from the same block with the same
 * draft answers buffered (D-20 + D-21 minimal resume).
 *
 * Boundaries:
 *   - Server data (sessions, blocks, persisted responses) lives in TanStack
 *     Query under `useRunnerSession` — this store ONLY holds runtime state
 *     that isn't on the server yet (in-progress answers, current index,
 *     per-block start timer).
 *   - Persisted slice: `{ currentRunToken, currentBlockIndex, answers,
 *     resumeJumpTarget }`. Phase 5 swaps to Dexie for the offline queue;
 *     localStorage is sufficient for Phase 1.
 *
 * Resume semantics (D-22):
 *   - On setSession() we ALWAYS set currentBlockIndex = 0 (the welcome block
 *     is the contract with the respondent — they always see it first).
 *   - We compute `resumeJumpTarget` from the count of existing server-side
 *     answers; the welcome runner reads this and after Start jumps to that
 *     target rather than +1.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Block } from '@/lib/blocks/types';

/**
 * One entry per answered (or in-progress) block. `content` is whatever the
 * block runner records (e.g., `{ text: '...' }` for open_question);
 * `blockStartedAt` is the Date.now() when startBlockTimer ran;
 * `submittedAt` is the Date.now() when recordAnswer ran (i.e., when the
 * respondent pressed Next/Finish).
 */
export interface RunnerAnswer {
  content: unknown;
  blockStartedAt?: number;
  submittedAt?: number;
}

interface RunnerState {
  /** Active run token. Switching tokens RESETS the store. */
  currentRunToken: string | null;
  /** Session id from the server; only set in live mode. */
  sessionId: string | null;
  /** Block sequence resolved for this run. */
  blocks: Block[];
  /** 0-based index into `blocks`. Always starts at 0 (welcome first; D-22). */
  currentBlockIndex: number;
  /** Block index the welcome CTA should jump to (set on resume). */
  resumeJumpTarget: number | null;
  /** In-progress + completed answers keyed by block.id. */
  answers: Record<string, RunnerAnswer>;

  // --------------------------------------------------------------------------
  // Methods
  // --------------------------------------------------------------------------

  /**
   * Initialise a run. Resets per-token state if `runToken` changes;
   * preserves persisted answers/index if the token matches.
   *
   * @param existingAnswers - answers loaded from the server (resume case);
   *                          mapped into `answers[blockId].content` so the
   *                          per-block editors can prefill.
   */
  setSession: (input: {
    runToken: string;
    sessionId: string | null;
    blocks: Block[];
    existingAnswers: Array<{ blockId: string; content: unknown }>;
  }) => void;

  /** Direct setter — used by RunnerShell.advance(). */
  setCurrentIndex: (index: number) => void;

  /** Set the resume jump target (where welcome → Start should land). */
  setResumeJumpTarget: (target: number | null) => void;

  /**
   * Mark the start of the block so time_ms can be computed at submit time.
   * Does not clobber existing `content` (a respondent who returns to an
   * already-answered block keeps the prior content visible).
   */
  startBlockTimer: (blockId: string) => void;

  /**
   * Record the respondent's answer locally. Sets `submittedAt = Date.now()`;
   * server submission is the caller's responsibility (useSubmitResponse).
   */
  recordAnswer: (blockId: string, content: unknown) => void;

  /** Clear everything for a given run token (used after thanks). */
  clearRun: (runToken: string) => void;
}

const STORAGE_KEY_PREFIX = 'maxytest:runner:';

export const useRunnerStore = create<RunnerState>()(
  persist(
    (set, get) => ({
      currentRunToken: null,
      sessionId: null,
      blocks: [],
      currentBlockIndex: 0,
      resumeJumpTarget: null,
      answers: {},

      setSession: ({ runToken, sessionId, blocks, existingAnswers }) => {
        const prevToken = get().currentRunToken;

        // Map server answers into local buffer.
        const seededAnswers: Record<string, RunnerAnswer> = {};
        for (const a of existingAnswers) {
          seededAnswers[a.blockId] = {
            content: a.content,
            // submittedAt unknown — server doesn't return it here; we leave
            // it undefined so the open-question runner just shows the
            // pre-filled value without re-running its timer arithmetic.
          };
        }

        // Same-token: merge server answers into existing local buffer so we
        // don't drop drafts the respondent typed offline before a network
        // round-trip. Server answers take precedence (they're authoritative).
        const mergedAnswers =
          prevToken === runToken
            ? { ...get().answers, ...seededAnswers }
            : seededAnswers;

        // Resume jump target: the count of answered blocks is the index of
        // the next unanswered block. Clamp to [1, blocks.length - 1] so the
        // welcome CTA never jumps to itself or past the thanks block.
        const answeredCount = existingAnswers.length;
        const resumeTarget =
          answeredCount > 0
            ? Math.min(blocks.length - 1, Math.max(1, answeredCount + 1))
            : null;

        set({
          currentRunToken: runToken,
          sessionId,
          blocks,
          // D-22: ALWAYS start at the welcome block regardless of resume.
          currentBlockIndex: 0,
          resumeJumpTarget: resumeTarget,
          answers: mergedAnswers,
        });
      },

      setCurrentIndex: (index) => set({ currentBlockIndex: index }),

      setResumeJumpTarget: (target) => set({ resumeJumpTarget: target }),

      startBlockTimer: (blockId) =>
        set((state) => {
          const existing = state.answers[blockId];
          // Only set blockStartedAt if it's not already set (going back to a
          // block re-uses the original timer — time_ms is total time on the
          // block across visits, which is what the designer actually cares
          // about for "where did the respondent get stuck").
          if (existing?.blockStartedAt) return state;
          return {
            answers: {
              ...state.answers,
              [blockId]: {
                ...existing,
                content: existing?.content,
                blockStartedAt: Date.now(),
              },
            },
          };
        }),

      recordAnswer: (blockId, content) =>
        set((state) => ({
          answers: {
            ...state.answers,
            [blockId]: {
              ...state.answers[blockId],
              content,
              submittedAt: Date.now(),
            },
          },
        })),

      clearRun: (runToken) =>
        set((state) =>
          state.currentRunToken === runToken
            ? {
                currentRunToken: null,
                sessionId: null,
                blocks: [],
                currentBlockIndex: 0,
                resumeJumpTarget: null,
                answers: {},
              }
            : state,
        ),
    }),
    {
      // Per-token storage key — the persist middleware doesn't natively
      // support dynamic keys, so we use a SINGLE store keyed internally by
      // currentRunToken (the simplification noted in the plan <interfaces>).
      // Multi-token-resume happens by replacing the in-memory state when
      // the route param changes.
      name: `${STORAGE_KEY_PREFIX}store`,
      partialize: (state) => ({
        currentRunToken: state.currentRunToken,
        currentBlockIndex: state.currentBlockIndex,
        resumeJumpTarget: state.resumeJumpTarget,
        answers: state.answers,
      }),
    },
  ),
);
