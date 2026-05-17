// apps/plugin/src/components/PrototypePickerView.tsx — Phase 02.2 Plan 07 Task 3.
//
// Screen S2 (UI-SPEC §"Screen S2 — Prototype / Flow Picker"). The designer
// arrives here once the silent cached-session restore succeeds AND the
// sandbox's `detect-flows` reply has populated `flows`.
//
// Layout:
//   - Top-right kebab → SignOutMenu (D-02c sign-out affordance).
//   - Title: "Выберите flow для публикации" (16/600).
//   - Helper: "Мы импортируем только этот flow. Остальные фреймы файла
//     не попадут в тест." (12/400 muted).
//   - FlowCard radiogroup with auto-detected pre-selected (if available).
//   - PrimaryCta "Опубликовать" — disabled until selectedId is set.
//
// Empty state (flows.length === 0): instead of FlowCard, render an
// ErrorCard with code `plugin_no_prototype`. CTA "Обновить" → onRefresh()
// re-issues `detect-flows` IPC.

import { useEffect, useState } from 'react';

import { getFriendlyError } from '../lib/ui/friendly-errors';
import type { FlowStart } from '../types';

import ErrorCard from './ErrorCard';
import FlowCard from './FlowCard';
import PrimaryCta from './PrimaryCta';
import SignOutMenu from './SignOutMenu';

interface PrototypePickerViewProps {
  flows: FlowStart[];
  onPublish: (flow: FlowStart) => void;
  onRefresh: () => void;
  onSignOut: () => void;
}

export default function PrototypePickerView({
  flows,
  onPublish,
  onRefresh,
  onSignOut,
}: PrototypePickerViewProps) {
  // Auto-detected = the first flow with source === 'flow-starting-point'
  // (UI-SPEC §"Component Inventory" #5 + CONTEXT D-05 step 3).
  const autoDetectedNodeId = flows.find((f) => f.source === 'flow-starting-point')?.nodeId ?? null;

  const [selectedId, setSelectedId] = useState<string | null>(autoDetectedNodeId);

  // If `flows` changes (re-detect after empty state recovery), recompute
  // the default selection so the user doesn't have to click twice.
  useEffect(() => {
    setSelectedId(autoDetectedNodeId);
  }, [autoDetectedNodeId]);

  // Empty state → ErrorCard with sign-out menu still accessible.
  if (flows.length === 0) {
    const fr = getFriendlyError('plugin_no_prototype');
    return (
      <main
        style={{
          flex: 1,
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          background: '#FFFFFF',
          position: 'relative',
        }}
      >
        <div style={{ position: 'absolute', top: 12, right: 12 }}>
          <SignOutMenu onSignOut={onSignOut} />
        </div>
        <ErrorCard
          code="plugin_no_prototype"
          title={fr.title}
          message={fr.message}
          onRetry={onRefresh}
          retryLabel={fr.retryLabel}
        />
      </main>
    );
  }

  const selectedFlow = flows.find((f) => f.nodeId === selectedId) ?? null;

  return (
    <main
      aria-labelledby="picker-title"
      style={{
        flex: 1,
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        background: '#FFFFFF',
        overflow: 'auto',
        position: 'relative',
      }}
    >
      <div style={{ position: 'absolute', top: 12, right: 12 }}>
        <SignOutMenu onSignOut={onSignOut} />
      </div>
      <h1
        id="picker-title"
        style={{
          font: '600 16px var(--font-sans, "IBM Plex Sans"), system-ui',
          color: 'var(--text-1)',
          margin: 0,
          paddingRight: 36,
        }}
      >
        Выберите flow для публикации
      </h1>
      <p
        style={{
          font: '400 12px/18px var(--font-sans, "IBM Plex Sans"), system-ui',
          color: 'var(--text-2)',
          margin: 0,
        }}
      >
        Мы импортируем только этот flow. Остальные фреймы файла не попадут в тест.
      </p>

      <FlowCard
        flows={flows}
        selectedId={selectedId}
        onSelect={setSelectedId}
        autoDetectedNodeId={autoDetectedNodeId}
      />

      <div style={{ marginTop: 4 }}>
        <PrimaryCta
          label="Опубликовать"
          disabled={!selectedFlow}
          onClick={() => {
            if (selectedFlow) onPublish(selectedFlow);
          }}
        />
      </div>
    </main>
  );
}
