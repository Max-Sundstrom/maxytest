import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { supabase } from '@/lib/supabase/auth';

/**
 * `/auth/plugin-callback` — Realtime broadcast bridge from the web app to the
 * Maxytest Figma plugin (Phase 02.2 D-02 / D-02a).
 *
 * Flow:
 *   1. Plugin generates a UUIDv4 `nonce` and subscribes to Realtime channel
 *      `plugin-auth:{nonce}`.
 *   2. Plugin opens this page in the user's default browser via
 *      `figma.openExternal('https://{host}/auth/plugin-callback?nonce=...')`.
 *   3. If the designer has no active Supabase session, this route redirects to
 *      `/auth/login?next=/auth/plugin-callback?nonce=<nonce>` so the Phase 1
 *      magic-link flow runs (H4 fix — Task 2 of Plan 02.2-04 adds `?next=`
 *      pass-through to the login route).
 *   4. With a session in hand, the route subscribes to the same channel,
 *      awaits `SUBSCRIBED` (RESEARCH Pitfall 4 — `.send()` before SUBSCRIBED
 *      silently downgrades to HTTP), then broadcasts the designer's session
 *      tokens. The plugin receives them, stores under
 *      `figma.clientStorage.supabase-session`, unsubscribes.
 *
 * Trust boundary: channel name embeds a ~122-bit UUIDv4 nonce — anyone who
 * knows the exact nonce can read the session payload. CONTEXT D-02a accepts
 * this constraint for v1 (no server-side replay protection). UUID is validated
 * at route-entry via `validateSearch`.
 *
 * Client choice: uses the DESIGNER client (`@/lib/supabase/auth`) — the
 * broadcast carries the designer's own session, and the route is reachable
 * only from designer-side flows. Not under `_app/*` because the inline
 * no-session → redirect logic needs to run BEFORE any session gate kicks in.
 */

const searchSchema = z.object({
  nonce: z.string().uuid(),
});

type CallbackStatus = 'checking' | 'need-login' | 'broadcasting' | 'done' | 'error';

function PluginCallbackRoute() {
  const { nonce } = Route.useSearch();
  const [status, setStatus] = useState<CallbackStatus>('checking');

  useEffect(() => {
    let cancelled = false;
    // The channel is allocated lazily inside the async body once we confirm a
    // session exists; the cleanup closure captures the handle via this ref.
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function run() {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (cancelled) return;
        if (error) {
          setStatus('error');
          return;
        }
        const session = data.session;
        if (!session) {
          // H4 fix: Task 2 in this plan teaches `/auth/login` to honour
          // `?next=` and round-trip through `emailRedirectTo`. Until that
          // lands, the magic-link click defaults back to `/app`.
          setStatus('need-login');
          const next = `/auth/plugin-callback?nonce=${nonce}`;
          window.location.href = `/auth/login?next=${encodeURIComponent(next)}`;
          return;
        }

        setStatus('broadcasting');
        channel = supabase.channel(`plugin-auth:${nonce}`);
        channel.subscribe((subscribeStatus) => {
          if (cancelled) return;
          if (subscribeStatus !== 'SUBSCRIBED') return;
          void (async () => {
            try {
              await channel!.send({
                type: 'broadcast',
                event: 'session',
                payload: {
                  access_token: session.access_token,
                  refresh_token: session.refresh_token,
                },
              });
              if (cancelled) return;
              setStatus('done');
              await channel!.unsubscribe();
              channel = null;
            } catch {
              if (cancelled) return;
              setStatus('error');
            }
          })();
        });
      } catch {
        if (cancelled) return;
        setStatus('error');
      }
    }

    void run();

    return () => {
      cancelled = true;
      if (channel) {
        void channel.unsubscribe();
        channel = null;
      }
    };
  }, [nonce]);

  return (
    <main className="grid min-h-[100dvh] place-items-center bg-background px-4">
      <div className="max-w-[400px] text-center">
        {status === 'checking' && (
          <p className="text-body text-muted-foreground" role="status" aria-live="polite">
            Checking your session…
          </p>
        )}
        {status === 'need-login' && (
          <p className="text-body text-muted-foreground" role="status" aria-live="polite">
            Redirecting to sign in…
          </p>
        )}
        {status === 'broadcasting' && (
          <p className="text-body text-muted-foreground" role="status" aria-live="polite">
            Sending session to the plugin…
          </p>
        )}
        {status === 'done' && (
          <p className="text-body text-foreground" role="status" aria-live="polite">
            Sign-in complete — close this tab and return to Figma.
          </p>
        )}
        {status === 'error' && (
          <p className="text-body text-foreground" role="alert">
            Couldn&rsquo;t send the session. Close this tab and try again from Figma.
          </p>
        )}
      </div>
    </main>
  );
}

export const Route = createFileRoute('/auth/plugin-callback')({
  validateSearch: searchSchema,
  component: PluginCallbackRoute,
});
