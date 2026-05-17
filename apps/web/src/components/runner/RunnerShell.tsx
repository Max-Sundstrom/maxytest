/**
 * <RunnerShell> — Plan 01-05 Task 3 / UI-SPEC.md §"Layout Contracts → Respondent Runner"
 *                / D-22, D-23, D-25, D-26 + Pitfall 14.
 *
 * The respondent-facing runner shell. Drives:
 *   - Anonymous session bootstrap (live mode only — preview mode skips all
 *     network writes).
 *   - Block sequencing with welcome-first + resume-jump (D-22).
 *   - Progress bar pinned at top (D-23).
 *   - Mobile-first layout with `min-h-[100dvh]` (D-26 / Pitfall 14e: dvh
 *     instead of vh so mobile chrome doesn't crop the sticky CTA footer).
 *   - `touch-action: manipulation` on the root (Pitfall 14d: kills the
 *     iOS Safari 300ms double-tap-to-zoom delay).
 *   - Error boundary around the entire tree (D-25).
 *
 * Two modes (D-12):
 *   - mode='live'  : real session_id, real submits via useSubmitResponse,
 *                    real completion via useCompleteSession.
 *   - mode='preview': in-memory only; no Supabase writes. Designer Preview
 *                    overlay (Plan 01-03) passes blocks directly.
 *
 * Reused by Plan 01-03's <PreviewOverlay>: this component is the contract
 * the stub there now mounts.
 */

import { useEffect, useMemo, useState } from 'react';
import type { Block } from '@/lib/blocks/types';
import { useRunnerStore } from '@/lib/stores/runner';
import { useSubmitResponse } from '@/lib/queries/responses';
import { useCompleteSession } from '@/lib/queries/sessions';
import { RunnerErrorBoundary } from './RunnerErrorBoundary';
import { RunnerHeader } from './RunnerHeader';
import { WelcomeRunner } from './blocks/WelcomeRunner';
import { OpenQuestionRunner } from './blocks/OpenQuestionRunner';
import { ThanksRunner } from './blocks/ThanksRunner';
import { PrototypeRunner } from './blocks/PrototypeRunner';

export type RunnerMode = 'live' | 'preview';

export interface RunnerShellProps {
  mode: RunnerMode;
  /** Block sequence (already ordered by position). */
  blocks: Block[];
  /** Run token — drives the runner store's per-token keying. */
  runToken?: string;
  /** Required in live mode; ignored in preview mode. */
  sessionId?: string | null;
  /** Resume case: prior server-side answers. */
  existingAnswers?: Array<{ blockId: string; content: unknown }>;
  /** Called when the runner reaches the end (last block done). */
  onComplete?: () => void;
}

export function RunnerShell({
  mode,
  blocks,
  runToken,
  sessionId,
  existingAnswers = [],
  onComplete,
}: RunnerShellProps) {
  return (
    <RunnerErrorBoundary>
      <div
        style={{
          // height (not minHeight) locks the runner to viewport so footer
          // CTAs stay docked at the bottom and progress header at top.
          // 100dvh — not 100vh — so mobile Safari's chrome doesn't crop the
          // CTA (Pitfall 14e). touchAction:manipulation kills the iOS Safari
          // 300ms double-tap-to-zoom delay.
          height: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-page)',
          touchAction: 'manipulation',
          overflow: 'hidden',
        }}
      >
        <RunnerShellInner
          mode={mode}
          blocks={blocks}
          runToken={runToken}
          sessionId={sessionId}
          existingAnswers={existingAnswers}
          onComplete={onComplete}
        />
      </div>
    </RunnerErrorBoundary>
  );
}

function RunnerShellInner({
  mode,
  blocks,
  runToken,
  sessionId,
  existingAnswers,
  onComplete,
}: RunnerShellProps) {
  const storeRunToken = useRunnerStore((s) => s.currentRunToken);
  const currentBlockIndex = useRunnerStore((s) => s.currentBlockIndex);
  const resumeJumpTarget = useRunnerStore((s) => s.resumeJumpTarget);
  const setSession = useRunnerStore((s) => s.setSession);
  const setCurrentIndex = useRunnerStore((s) => s.setCurrentIndex);
  const startBlockTimer = useRunnerStore((s) => s.startBlockTimer);
  const recordAnswer = useRunnerStore((s) => s.recordAnswer);
  const answers = useRunnerStore((s) => s.answers);

  // Preview-mode synthetic token so the runner store still namespaces state.
  const effectiveRunToken = runToken ?? `preview:${blocks[0]?.id ?? 'empty'}`;

  // Hydrate the store on mount / token-change. We rebuild this every time
  // blocks changes (preview-mode mutations during builder edits would
  // otherwise leave the store stale).
  useEffect(() => {
    if (storeRunToken !== effectiveRunToken || mode === 'preview') {
      setSession({
        runToken: effectiveRunToken,
        sessionId: sessionId ?? null,
        blocks,
        existingAnswers: mode === 'live' ? (existingAnswers ?? []) : [],
      });
    }
  }, [effectiveRunToken, mode, blocks.length]);

  const total = blocks.length;
  const currentBlock = blocks[currentBlockIndex] ?? blocks[0];

  // The "last question" check controls Next vs Finish copy on the last
  // open-question block (the thanks block always follows). We compute it
  // by looking ahead from the current index for a non-question block.
  const isLastQuestion = useMemo(() => {
    if (!currentBlock) return false;
    if (currentBlock.type === 'welcome' || currentBlock.type === 'thanks') {
      return false;
    }
    // The block immediately after this one is the thanks block?
    const next = blocks[currentBlockIndex + 1];
    return !next || next.type === 'thanks';
  }, [blocks, currentBlockIndex, currentBlock]);

  // Start the per-block timer whenever the active block changes.
  useEffect(() => {
    if (currentBlock) {
      startBlockTimer(currentBlock.id);
    }
  }, [currentBlock?.id]);

  // Mutations (only used in live mode — but we always call the hooks so
  // React's hooks-order contract is satisfied; in preview mode we never
  // invoke `.mutate(...)`).
  const submitResponse = useSubmitResponse(runToken ?? null);
  const completeSession = useCompleteSession(runToken ?? null);

  const [completedFlag, setCompletedFlag] = useState(false);

  function advance(targetIndex?: number) {
    if (!currentBlock) return;
    const fallback = currentBlockIndex + 1;
    const next = Math.min(total - 1, Math.max(0, targetIndex ?? fallback));
    setCurrentIndex(next);
  }

  function handleWelcomeStart() {
    // Resume jump (D-22): after welcome CTA, land on resumeJumpTarget if any,
    // else index 1.
    advance(resumeJumpTarget ?? 1);
  }

  function handleQuestionSubmit(content: unknown) {
    if (!currentBlock) return;
    recordAnswer(currentBlock.id, content);

    // Compute time_ms from store's blockStartedAt.
    const started = answers[currentBlock.id]?.blockStartedAt ?? Date.now();
    const timeMs = Math.max(0, Date.now() - started);

    if (mode === 'live' && sessionId) {
      submitResponse.mutate({
        sessionId,
        blockId: currentBlock.id,
        answer: content,
        timeMs,
      });
    }

    advance();
  }

  /**
   * Plan 02-09 W-02: advance helper for blocks that do NOT submit an answer
   * (the prototype block). Unlike handleQuestionSubmit, this does NOT call
   * recordAnswer() and does NOT fire submitResponse.mutate. The prototype
   * block produces events (Plan 02-08 submit_events) directly; advancing
   * the runner just moves to the next block.
   *
   * Idempotent: if a tap-triggered auto-finish races with the explicit
   * Finish-task button, both call paths land here with the same blockId
   * (T-02-09-08 disposition: accept — duplicate calls are no-ops because
   * we early-return when the currentBlock id mismatches OR the index has
   * already advanced).
   */
  function handleBlockAdvance(blockId: string) {
    if (!currentBlock || currentBlock.id !== blockId) return;
    advance();
  }

  function handleThanksRendered() {
    if (completedFlag) return;
    setCompletedFlag(true);

    if (mode === 'live' && sessionId) {
      completeSession.mutate({ sessionId });
    }
    onComplete?.();
  }

  if (!currentBlock) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '32px 16px',
          textAlign: 'center',
        }}
      >
        <p style={{ font: '400 14px/20px var(--font-sans)', color: 'var(--text-2)' }}>
          В этом тесте пока нет блоков.
        </p>
      </div>
    );
  }

  // Question-only index/total (excludes welcome + thanks). These power the
  // mono "Вопрос N из M" step-tag on each non-welcome block. We count any
  // block that isn't pinned welcome/thanks.
  const questionBlocks = blocks.filter((b) => b.type !== 'welcome' && b.type !== 'thanks');
  const questionIndex = questionBlocks.findIndex((b) => b.id === currentBlock.id);
  const questionTotal = questionBlocks.length;
  const isFirstQuestion = questionIndex === 0;

  function handleBack() {
    if (currentBlockIndex <= 0) return;
    setCurrentIndex(currentBlockIndex - 1);
  }

  return (
    <>
      <RunnerHeader current={currentBlockIndex} total={total} />
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          width: '100%',
          maxWidth: 480,
          margin: '0 auto',
        }}
      >
        {currentBlock.type === 'welcome' && (
          <WelcomeRunner block={currentBlock} totalBlocks={total} onStart={handleWelcomeStart} />
        )}
        {currentBlock.type === 'open_question' && (
          <OpenQuestionRunner
            block={currentBlock}
            questionIndex={Math.max(0, questionIndex)}
            questionTotal={Math.max(1, questionTotal)}
            isFirst={isFirstQuestion}
            isLast={isLastQuestion}
            onSubmit={handleQuestionSubmit}
            onBack={handleBack}
            initialValue={
              (answers[currentBlock.id]?.content as { text?: string } | undefined)?.text ?? ''
            }
          />
        )}
        {currentBlock.type === 'prototype' && (
          <PrototypeRunner
            block={currentBlock}
            sessionId={sessionId ?? null}
            onComplete={() => handleBlockAdvance(currentBlock.id)}
          />
        )}
        {currentBlock.type === 'thanks' && (
          <ThanksRunner block={currentBlock} onMounted={handleThanksRendered} />
        )}
      </div>
    </>
  );
}
