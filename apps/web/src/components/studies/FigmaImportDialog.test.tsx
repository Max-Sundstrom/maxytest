/**
 * FigmaImportDialog tests — Plan 02-04 Task 2.
 *
 * RED → GREEN cycle locks two load-bearing contracts:
 *
 *  - PAT lifecycle (D-02b): the PAT input value is zeroed when the dialog is
 *    closed and re-opened. This is the privacy promise documented in
 *    CONTEXT.md §4.3 — if a future refactor accidentally persists the PAT to
 *    localStorage or a React Query cache, this test fails.
 *  - Client-side share-link validation: pasting a non-Figma URL surfaces an
 *    inline error and disables the Import button before any network call.
 *
 * The TanStack Query hooks (useImportPrototype, useImportJob) are mocked so the
 * tests run pure-render without a Supabase backend.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Mocks — keep the dialog isolated from Supabase / Edge Functions.
//
// Strategy: stub `@supabase/supabase-js` so the real auth.ts module can
// instantiate a client without `VITE_SUPABASE_URL`. Then mock the two
// query modules whose hooks the dialog calls. We re-implement
// `ImportPrototypeError` as a fresh class so the dialog's `instanceof` check
// still works (the dialog imports the symbol from `@/lib/queries/prototypes`
// — our mock provides it).
// ---------------------------------------------------------------------------

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: vi.fn() }) }) }),
    functions: { invoke: vi.fn() },
    channel: () => ({
      on: () => ({ subscribe: vi.fn() }),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    }),
  }),
}));

const mutateMock = vi.fn();
const resetMock = vi.fn();

interface MockMutationState {
  isPending: boolean;
  error: Error | null;
}

let mutationState: MockMutationState = { isPending: false, error: null };

interface MockJobData {
  id: string;
  status: 'pending' | 'fetching' | 'rendering' | 'uploading' | 'done' | 'partial' | 'failed';
  frames_total: number;
  frames_done: number;
  prototype_version_id: string | null;
  warnings: unknown;
  error_code: string | null;
  error_message: string | null;
  updated_at: string;
  created_at: string;
  actor_id: string | null;
  figma_file_key: string;
  idempotency_key: string;
  study_id: string;
}

let jobData: MockJobData | null = null;

vi.mock('@/lib/queries/prototypes', () => {
  // Local re-implementation of ImportPrototypeError so the dialog's
  // `instanceof` check matches against the mock-module class identity.
  class ImportPrototypeError extends Error {
    code: string;
    status?: number;
    constructor(code: string, message?: string, status?: number) {
      super(message ?? code);
      this.name = 'ImportPrototypeError';
      this.code = code;
      this.status = status;
    }
  }
  return {
    ImportPrototypeError,
    useImportPrototype: () => ({
      mutate: mutateMock,
      reset: resetMock,
      isPending: mutationState.isPending,
      error: mutationState.error,
    }),
  };
});

vi.mock('@/lib/queries/imports', () => ({
  useImportJob: () => ({ data: jobData, isLoading: false, error: null }),
}));

// Late import AFTER mocks so the module under test picks up the mocked hooks.
const { FigmaImportDialog } = await import('./FigmaImportDialog');

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function renderDialog(props: Partial<Parameters<typeof FigmaImportDialog>[0]> = {}) {
  const onOpenChange = vi.fn();
  const onComplete = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(
    <QueryClientProvider client={qc}>
      <FigmaImportDialog
        open={props.open ?? true}
        onOpenChange={props.onOpenChange ?? onOpenChange}
        studyId={props.studyId ?? '11111111-1111-7111-8111-111111111111'}
        onComplete={props.onComplete ?? onComplete}
      />
    </QueryClientProvider>,
  );
  return { ...result, onOpenChange, onComplete, qc };
}

// A long, regex-valid Figma file_key (22+ alphanumeric chars).
const VALID_FIGMA_URL = 'https://www.figma.com/proto/ABcdefGHijklMNopqRSTUV/My-Prototype';

beforeEach(() => {
  mutateMock.mockReset();
  resetMock.mockReset();
  mutationState = { isPending: false, error: null };
  jobData = null;
});

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FigmaImportDialog', () => {
  it('zeros the PAT input when the dialog is closed and re-opened', async () => {
    const user = userEvent.setup();
    const { rerender, qc } = renderDialog({ open: true });

    const patInput = screen.getByLabelText(/personal access token/i) as HTMLInputElement;
    await user.type(patInput, 'figd_super_secret_token_xyz');
    expect(patInput.value).toBe('figd_super_secret_token_xyz');

    // Close → state should be wiped by the useEffect cleanup.
    rerender(
      <QueryClientProvider client={qc}>
        <FigmaImportDialog
          open={false}
          onOpenChange={vi.fn()}
          studyId="11111111-1111-7111-8111-111111111111"
          onComplete={vi.fn()}
        />
      </QueryClientProvider>,
    );

    // Re-open — the form is back; PAT input must be empty (load-bearing privacy
    // promise per D-02b).
    rerender(
      <QueryClientProvider client={qc}>
        <FigmaImportDialog
          open={true}
          onOpenChange={vi.fn()}
          studyId="11111111-1111-7111-8111-111111111111"
          onComplete={vi.fn()}
        />
      </QueryClientProvider>,
    );

    const patInputAfter = screen.getByLabelText(/personal access token/i) as HTMLInputElement;
    expect(patInputAfter.value).toBe('');
  });

  it('shows an inline error when share-link is not a Figma URL', async () => {
    const user = userEvent.setup();
    renderDialog({ open: true });

    const shareInput = screen.getByLabelText(/share link/i);
    await user.type(shareInput, 'https://example.com/not-figma');

    expect(screen.getByText(/that doesn't look like a figma share link/i)).toBeInTheDocument();
  });

  it('clears the share-link error once a valid /proto/ URL is pasted', async () => {
    const user = userEvent.setup();
    renderDialog({ open: true });

    const shareInput = screen.getByLabelText(/share link/i) as HTMLInputElement;
    await user.type(shareInput, 'https://example.com/not-figma');
    expect(screen.getByText(/that doesn't look like a figma share link/i)).toBeInTheDocument();

    // Replace with a valid URL.
    await user.clear(shareInput);
    // userEvent.type interprets `{` as a special character; fireEvent.change is
    // simpler for pasting a URL literal in one shot.
    fireEvent.change(shareInput, { target: { value: VALID_FIGMA_URL } });

    await waitFor(() => {
      expect(
        screen.queryByText(/that doesn't look like a figma share link/i),
      ).not.toBeInTheDocument();
    });
  });

  it('disables the Import button when the share-link is invalid; enables when both fields valid', async () => {
    const user = userEvent.setup();
    renderDialog({ open: true });

    const importButton = screen.getByRole('button', { name: /^import$/i });
    expect(importButton).toBeDisabled();

    // Fill only the PAT — still disabled (share-link is empty).
    await user.type(screen.getByLabelText(/personal access token/i), 'figd_xxx');
    expect(importButton).toBeDisabled();

    // Bad URL — still disabled.
    await user.type(screen.getByLabelText(/share link/i), 'not-a-url');
    expect(importButton).toBeDisabled();

    // Replace with valid URL — should enable.
    const shareInput = screen.getByLabelText(/share link/i) as HTMLInputElement;
    await user.clear(shareInput);
    fireEvent.change(shareInput, { target: { value: VALID_FIGMA_URL } });

    await waitFor(() => {
      expect(importButton).not.toBeDisabled();
    });
  });

  it('calls useImportPrototype.mutate with the correct payload on Import click', async () => {
    const user = userEvent.setup();
    renderDialog({ open: true, studyId: 'study-uuid-7' });

    await user.type(screen.getByLabelText(/personal access token/i), 'figd_real_token');
    const shareInput = screen.getByLabelText(/share link/i) as HTMLInputElement;
    fireEvent.change(shareInput, { target: { value: VALID_FIGMA_URL } });

    const importButton = screen.getByRole('button', { name: /^import$/i });
    await waitFor(() => expect(importButton).not.toBeDisabled());

    await user.click(importButton);

    expect(mutateMock).toHaveBeenCalledTimes(1);
    const [payload] = mutateMock.mock.calls[0]!;
    expect(payload).toEqual(
      expect.objectContaining({
        share_link: VALID_FIGMA_URL,
        pat: 'figd_real_token',
        study_id: 'study-uuid-7',
      }),
    );
    // idempotency_key is a uuidv7 string (regex-checked rather than asserting
    // an exact value so the test does not depend on Math.random or fakeTimers).
    expect(typeof (payload as { idempotency_key?: unknown }).idempotency_key).toBe('string');
    expect((payload as { idempotency_key: string }).idempotency_key).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('renders the 50-frame soft-cap copy when the dialog is in the input state', () => {
    renderDialog({ open: true });
    expect(screen.getByText(/50 frames reliably/i)).toBeInTheDocument();
  });
});
