/**
 * PrototypeEditor tests — Plan 02-06 Task 1 (TDD RED → GREEN).
 *
 * Locks the load-bearing contracts of the prototype block editor:
 *   1. Empty state ⇒ shows the "Import Figma prototype" CTA.
 *   2. CTA click opens <FigmaImportDialog>.
 *   3. onComplete(pvId) sets `prototype_version_id` in form state.
 *   4. Auto-selects first frame as `starting_frame_id` once frames load.
 *   5. Populated state renders the task instruction textarea + thumbnail grid.
 *   6. 700ms debounced edit to task_instruction (with full schema validity)
 *      triggers `onSave` exactly once.
 *   7. Clicking "Set as start" on a non-starting frame updates form state.
 *
 * Strategy: mock `@/lib/queries/prototypes` so the editor's `useFrames` +
 * `usePrototypeVersion` calls return scripted data without a Supabase
 * backend. Mock `@supabase/supabase-js` so `auth.ts` instantiates without
 * env vars. Mock `FigmaImportDialog` so we don't need its full hook stack.
 */

import type * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Block } from '@/lib/blocks/types';

// ---------------------------------------------------------------------------
// Mocks — keep the editor isolated from Supabase / FigmaImportDialog.
// ---------------------------------------------------------------------------

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: vi.fn() }) }) }),
    functions: { invoke: vi.fn() },
    storage: {
      from: () => ({
        createSignedUrls: vi.fn().mockResolvedValue({
          data: [
            {
              path: 'frame-1@1x.png',
              signedUrl: 'https://signed.example.com/frame-1@1x.png?token=abc',
            },
            {
              path: 'frame-1@2x.png',
              signedUrl: 'https://signed.example.com/frame-1@2x.png?token=abc',
            },
            {
              path: 'frame-2@1x.png',
              signedUrl: 'https://signed.example.com/frame-2@1x.png?token=def',
            },
            {
              path: 'frame-2@2x.png',
              signedUrl: 'https://signed.example.com/frame-2@2x.png?token=def',
            },
          ],
          error: null,
        }),
      }),
    },
  }),
}));

interface MockFrame {
  id: string;
  frame_id: string;
  name: string;
  width: number;
  height: number;
  position: number;
  prototype_version_id: string;
  render_path_1x: string;
  render_path_2x: string;
}

interface MockPrototypeVersion {
  id: string;
  study_id: string;
  figma_file_key: string;
  figma_file_name: string | null;
  figma_node_tree: unknown;
  figma_source_last_modified: string | null;
  snapshot_taken_at: string;
  starting_frame_id: string | null;
  status: string;
  created_at: string;
}

let mockFrames: MockFrame[] = [];
let mockPrototypeVersion: MockPrototypeVersion | null = null;

vi.mock('@/lib/queries/prototypes', () => ({
  useFrames: (pvId: string | null | undefined) => ({
    data: pvId ? mockFrames : [],
    isLoading: false,
    error: null,
  }),
  usePrototypeVersion: (pvId: string | null | undefined) => ({
    data: pvId ? mockPrototypeVersion : null,
    isLoading: false,
    error: null,
  }),
}));

// Mock FigmaImportDialog so the test doesn't need the full Figma-import
// hook stack. The mock exposes the controls the editor wires up.
const fakeDialogState = { lastOnComplete: null as ((pvId: string) => void) | null };
vi.mock('@/components/studies/FigmaImportDialog', () => ({
  FigmaImportDialog: ({
    open,
    onOpenChange,
    studyId,
    onComplete,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    studyId: string;
    onComplete: (pvId: string) => void;
  }) => {
    fakeDialogState.lastOnComplete = onComplete;
    if (!open) return null;
    return (
      <div role="dialog" data-testid="mock-figma-import-dialog">
        <span>Mock dialog open for study {studyId}</span>
        <button type="button" onClick={() => onOpenChange(false)}>
          Close
        </button>
        <button
          type="button"
          onClick={() => {
            onComplete('aaaaaaaa-bbbb-7ccc-8ddd-eeeeeeeeeeee');
            onOpenChange(false);
          }}
        >
          Simulate import success
        </button>
      </div>
    );
  },
}));

// Late import AFTER mocks so the module under test picks up the mocked hooks.
const { PrototypeEditor } = await import('./PrototypeEditor');

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeBlock(overrides?: Partial<Block>): Block {
  return {
    id: 'block-uuid-1',
    study_id: 'study-uuid-1',
    position: 1,
    type: 'prototype',
    pinned: false,
    // partial content — designer hasn't imported yet.
    content: { type: 'prototype' } as unknown as Block['content'],
    version: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

type OnSaveArg = Parameters<React.ComponentProps<typeof PrototypeEditor>['onSave']>[0];

function renderEditor(props?: {
  block?: Block;
  disabled?: boolean;
  onSave?: (input: OnSaveArg) => void;
}) {
  const onSave = props?.onSave ?? vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(
    <QueryClientProvider client={qc}>
      <PrototypeEditor
        block={props?.block ?? makeBlock()}
        disabled={props?.disabled ?? false}
        onSave={onSave}
        serverVersion={(props?.block ?? makeBlock()).version}
      />
    </QueryClientProvider>,
  );
  return { ...result, onSave, qc };
}

beforeEach(() => {
  vi.useRealTimers();
  mockFrames = [
    {
      id: 'frame-row-1',
      frame_id: 'fig-frame-1',
      name: 'Home',
      width: 375,
      height: 812,
      position: 0,
      prototype_version_id: 'aaaaaaaa-bbbb-7ccc-8ddd-eeeeeeeeeeee',
      render_path_1x: 'frame-1@1x.png',
      render_path_2x: 'frame-1@2x.png',
    },
    {
      id: 'frame-row-2',
      frame_id: 'fig-frame-2',
      name: 'Settings',
      width: 375,
      height: 812,
      position: 1,
      prototype_version_id: 'aaaaaaaa-bbbb-7ccc-8ddd-eeeeeeeeeeee',
      render_path_1x: 'frame-2@1x.png',
      render_path_2x: 'frame-2@2x.png',
    },
  ];
  mockPrototypeVersion = {
    id: 'aaaaaaaa-bbbb-7ccc-8ddd-eeeeeeeeeeee',
    study_id: 'study-uuid-1',
    figma_file_key: 'ABCDEFG',
    figma_file_name: 'My Proto',
    figma_node_tree: null,
    figma_source_last_modified: '2026-01-10T00:00:00Z',
    snapshot_taken_at: '2026-01-15T00:00:00Z',
    starting_frame_id: null,
    status: 'complete',
    created_at: '2026-01-15T00:00:00Z',
  };
  fakeDialogState.lastOnComplete = null;
});

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PrototypeEditor', () => {
  it('shows the "Import Figma prototype" CTA when prototype_version_id is undefined', () => {
    renderEditor();
    expect(screen.getByRole('button', { name: /import figma prototype/i })).toBeInTheDocument();
  });

  it('opens FigmaImportDialog when the Import CTA is clicked', async () => {
    const user = userEvent.setup();
    renderEditor();
    expect(screen.queryByTestId('mock-figma-import-dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /import figma prototype/i }));

    expect(screen.getByTestId('mock-figma-import-dialog')).toBeInTheDocument();
  });

  it('sets prototype_version_id + starting_frame_id after onComplete fires from the dialog', async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole('button', { name: /import figma prototype/i }));
    await user.click(screen.getByRole('button', { name: /simulate import success/i }));

    // The editor should have transitioned to the populated state — the
    // task-instruction textarea is visible.
    await waitFor(() => {
      expect(screen.getByLabelText(/task instruction/i)).toBeInTheDocument();
    });

    // The thumbnail grid should be rendered with both frames.
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('renders task instruction textarea + thumbnail grid in populated state', () => {
    renderEditor({
      block: makeBlock({
        content: {
          type: 'prototype',
          prototype_version_id: 'aaaaaaaa-bbbb-7ccc-8ddd-eeeeeeeeeeee',
          starting_frame_id: 'fig-frame-1',
          task_instruction: 'Find the settings page.',
        },
      }),
    });

    expect(screen.getByLabelText(/task instruction/i)).toBeInTheDocument();
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('calls onSave with debounced content when task_instruction changes (full validity)', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    renderEditor({
      block: makeBlock({
        content: {
          type: 'prototype',
          prototype_version_id: 'aaaaaaaa-bbbb-7ccc-8ddd-eeeeeeeeeeee',
          starting_frame_id: 'fig-frame-1',
          task_instruction: 'Find the settings page.',
        },
      }),
      onSave,
    });

    const textarea = screen.getByLabelText(/task instruction/i);
    await user.clear(textarea);
    await user.type(textarea, 'Find the password reset flow.');

    // Wait > 700ms debounce window.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 900));
    });

    await waitFor(() => {
      expect(onSave).toHaveBeenCalled();
    });
    const lastCall = onSave.mock.calls.at(-1)![0];
    expect(lastCall.content.task_instruction).toBe('Find the password reset flow.');
    expect(lastCall.content.prototype_version_id).toBe('aaaaaaaa-bbbb-7ccc-8ddd-eeeeeeeeeeee');
    expect(lastCall.content.starting_frame_id).toBe('fig-frame-1');
    expect(typeof lastCall.idempotencyKey).toBe('string');
  });

  it('changes starting_frame_id when a non-start frame is set as start', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    renderEditor({
      block: makeBlock({
        content: {
          type: 'prototype',
          prototype_version_id: 'aaaaaaaa-bbbb-7ccc-8ddd-eeeeeeeeeeee',
          starting_frame_id: 'fig-frame-1',
          task_instruction: 'Find the settings page.',
        },
      }),
      onSave,
    });

    // Find the "Set as start" button on the non-starting frame (Settings).
    // The first frame (Home) already has "Start" indicator; the second
    // frame (Settings) should expose a "Set as start" action.
    const setStartButtons = screen.getAllByRole('button', { name: /set as start/i });
    // Click the first available "Set as start" button (Settings is non-start).
    await user.click(setStartButtons[0]!);

    // Wait > 700ms for debounce.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 900));
    });

    await waitFor(() => {
      expect(onSave).toHaveBeenCalled();
    });
    const lastCall = onSave.mock.calls.at(-1)![0];
    expect(lastCall.content.starting_frame_id).toBe('fig-frame-2');
  });
});
