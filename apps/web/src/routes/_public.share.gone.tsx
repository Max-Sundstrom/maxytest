/**
 * `/share/gone` — empty-state for revoked / unknown share tokens.
 *
 * Plan 04-07 Task 6. The `_public.share.$token` loader redirects here
 * whenever `read_share_report(token)` returns NULL (token never existed,
 * was revoked, or was rotated out). Renders Russian copy + noindex meta.
 */

import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_public/share/gone')({
  component: GoneRoute,
  head: () => ({
    meta: [{ name: 'robots', content: 'noindex,nofollow' }],
  }),
});

function GoneRoute() {
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        gap: 16,
        background: 'var(--bg-page)',
        color: 'var(--text-1)',
      }}
    >
      <h1
        style={{
          font: '500 28px/36px var(--font-sans)',
          margin: 0,
          textAlign: 'center',
        }}
      >
        Отчёт больше не доступен
      </h1>
      <p
        style={{
          font: '400 15px/24px var(--font-sans)',
          color: 'var(--text-2)',
          maxWidth: 480,
          textAlign: 'center',
          margin: 0,
        }}
      >
        Возможно, дизайнер отозвал ссылку или удалил тест. Запросите новую ссылку у того, кто
        прислал её вам.
      </p>
    </main>
  );
}
