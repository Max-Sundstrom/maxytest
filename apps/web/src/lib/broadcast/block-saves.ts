/**
 * BroadcastChannel singleton per workspace — D-15 / RESEARCH.md Pattern 7.
 *
 * When tab A saves a block, it posts `{type:'block-saved', blockId, version}`
 * on `block-saves-${workspaceId}`. Other tabs subscribed to the same channel
 * invalidate their TanStack Query cache for `['blocks', studyId]` and refetch.
 *
 * Tabs share one channel per workspace (singleton) so we don't leak Web API
 * resources on every component mount.
 */

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export type BlockSavesMessage = {
  type: 'block-saved';
  blockId: string;
  version: number;
};

const channels = new Map<string, BroadcastChannel>();

export function getBlockSavesChannel(workspaceId: string): BroadcastChannel {
  let ch = channels.get(workspaceId);
  if (!ch) {
    ch = new BroadcastChannel(`block-saves-${workspaceId}`);
    channels.set(workspaceId, ch);
  }
  return ch;
}

/**
 * `useBlockSavesSubscription(workspaceId, studyId)` — subscribes the current
 * builder tab to cross-tab `block-saved` broadcasts. On any message,
 * invalidates `['blocks', studyId]` so the next render fetches the fresh
 * value (which carries the new version).
 *
 * Cleanup removes the listener but DOES NOT close the channel — the channel
 * is shared with the saving path (`useUpdateBlock.onSuccess`) and other
 * mounted hooks in the same tab. Closing it would silently break those.
 */
export function useBlockSavesSubscription(
  workspaceId: string | null | undefined,
  studyId: string | null | undefined,
): void {
  const qc = useQueryClient();
  useEffect(() => {
    if (!workspaceId || !studyId) return;
    const ch = getBlockSavesChannel(workspaceId);
    const handler = (event: MessageEvent<BlockSavesMessage>) => {
      if (event.data?.type === 'block-saved') {
        qc.invalidateQueries({ queryKey: ['blocks', studyId] });
      }
    };
    ch.addEventListener('message', handler);
    return () => ch.removeEventListener('message', handler);
  }, [workspaceId, studyId, qc]);
}
