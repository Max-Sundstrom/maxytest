// apps/plugin/src/lib/auth.ts — Phase 02.2 Plan 05 Task 2.
//
// Auth orchestrator for the Figma plugin. Three exported entry points cover
// the whole sign-in lifecycle described in CONTEXT D-02..D-02c:
//
//   - signInWithMagicLink(viewerUrl) — first-time sign-in via the
//     magic-link + Realtime broadcast handshake. Opens the OS browser to
//     `${viewerUrl}/auth/plugin-callback?nonce=<uuid>` (apps/web Plan 04
//     route), subscribes to `plugin-auth:<nonce>` on Supabase Realtime,
//     awaits the broadcast carrying `{access_token, refresh_token}`, then
//     calls `supabase.auth.setSession(...)` to persist them via the custom
//     storage adapter (→ figma.clientStorage via IPC bridge).
//
//   - restoreCachedSession() — silent reuse on plugin reopen. Reads the
//     cached session via the same storage adapter; if access-token already
//     expired, attempts refresh. Returns boolean for the UI state machine.
//
//   - signOut() — clears the cached session by delegating to supabase-js,
//     which calls `storage.removeItem(...)` → IPC → clientStorage.deleteAsync.
//
// === Pitfalls reinforced in code ===
//   - Pitfall 3 (user-gesture): signInWithMagicLink MUST post `open-external`
//     BEFORE any await. Figma Desktop consumes the user-gesture flag the
//     instant the JS event loop yields, so the open-external IPC has to be
//     the first synchronous statement after the React click handler entry.
//   - Pitfall 4 (subscribe-before-send): not directly relevant here — the
//     plugin SUBSCRIBES; the web route is the one that has to wait for
//     SUBSCRIBED before .send(). We still surface SUBSCRIBED-error states
//     via the subscribe callback so a CHANNEL_ERROR is not silently
//     waited-on for 10 minutes.

import type { Session } from '@supabase/supabase-js';

import { supabase } from './supabase';

/** Channel-level subscribe statuses that indicate failure (not just info). */
type SubscribeFailureStatus = 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED';

/** Result envelope shared by signInWithMagicLink — exactly the union the
 *  SignInView reducer expects (Task 4). */
export interface AuthResult {
  session: Session | null;
  error: Error | null;
}

/**
 * Start the magic-link + Realtime handshake.
 *
 * Returns a promise that resolves with `{session}` on success or
 * `{error}` on failure (timeout / CHANNEL_ERROR / setSession error).
 *
 * IMPORTANT: this function MUST be called directly from a synchronous click
 * handler — `figma.openExternal` (forwarded by the sandbox) only fires if
 * the user-gesture flag is still set. Wrapping in setTimeout or awaiting
 * something else first will silently drop the browser launch (Pitfall 3).
 */
export function signInWithMagicLink(viewerUrl: string): Promise<AuthResult> {
  // 1) Generate a fresh ~122-bit nonce. crypto.randomUUID is available in
  //    every Figma-supported desktop browser shell (Chromium 92+); no
  //    polyfill needed.
  const nonce = crypto.randomUUID();

  // 2) Pitfall 3 — SYNCHRONOUSLY post the open-external IPC FIRST, before
  //    any await / channel.subscribe(). The sandbox handler forwards
  //    figma.openExternal(...) directly on the same JS tick, preserving the
  //    user-gesture flag that Figma Desktop checks to authorize opening
  //    the OS browser. Any code reordering that puts an `await` ahead of
  //    this line will break sign-in in production.
  parent.postMessage(
    {
      pluginMessage: {
        type: 'open-external',
        url: `${viewerUrl}/auth/plugin-callback?nonce=${nonce}`,
      },
    },
    '*',
  );

  // 3) Subscribe to the broadcast channel. `broadcast.self: false` means
  //    our own send (if we ever did one — we don't on this side) would not
  //    loop back. The web route is the only sender on this channel.
  const channel = supabase.channel(`plugin-auth:${nonce}`, {
    config: { broadcast: { self: false } },
  });

  return new Promise<AuthResult>((resolve) => {
    let settled = false;

    // 4) 10-minute TTL per D-02 — magic-link emails routinely take 30-60s
    //    to arrive, and we want to give the designer enough headroom to
    //    switch tabs / wake their inbox / hit retry on the email provider.
    //    On timeout we tear down the channel and surface `auth_timeout`
    //    (SignInView maps this code to a localized ErrorCard).
    const ttl = setTimeout(
      () => {
        if (settled) return;
        settled = true;
        void channel.unsubscribe();
        resolve({ session: null, error: new Error('auth_timeout') });
      },
      10 * 60 * 1000,
    );

    // 5) The broadcast handler — fires once the web route hits its own
    //    SUBSCRIBED state and pushes `{access_token, refresh_token}`. We
    //    immediately try to setSession (which goes through the custom
    //    storage adapter on success), then tear down.
    channel.on(
      'broadcast',
      { event: 'session' },
      async (msg: { payload?: { access_token?: string; refresh_token?: string } }) => {
        if (settled) return;
        const payload = msg.payload;
        if (
          !payload ||
          typeof payload.access_token !== 'string' ||
          typeof payload.refresh_token !== 'string'
        ) {
          // Malformed broadcast — keep waiting (the web route is our own
          // code; a malformed payload here would mean a hijacker on the
          // channel — see T-02.2-05-03 in PLAN threat model). Do NOT
          // settle so the legitimate broadcast can still arrive within the
          // 10-min TTL.
          return;
        }
        const { data, error } = await supabase.auth.setSession({
          access_token: payload.access_token,
          refresh_token: payload.refresh_token,
        });
        if (settled) return;
        settled = true;
        clearTimeout(ttl);
        await channel.unsubscribe();
        resolve({ session: data.session, error });
      },
    );

    // 6) Subscribe — failure statuses settle the promise immediately so the
    //    UI doesn't wait the full 10-min TTL on a dead channel.
    channel.subscribe((status, err) => {
      if (settled) return;
      const failure = (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'] as SubscribeFailureStatus[]).find(
        (s) => s === status,
      );
      if (failure) {
        settled = true;
        clearTimeout(ttl);
        void channel.unsubscribe();
        resolve({
          session: null,
          error: err ?? new Error(failure),
        });
      }
    });
  });
}

/**
 * Try to silently rehydrate a cached session from figma.clientStorage.
 *
 * Used by ui.tsx on mount — if true, the UI skips SignIn and goes straight
 * to the authenticated screen. If false (no cache OR refresh failed), the
 * UI shows SignIn.
 *
 * Per CONTEXT D-02b: the supabase-js init lazily reads our custom storage,
 * so `getSession()` is the right call — it doesn't trigger a network round
 * trip unless the access token is already expired AND autoRefreshToken
 * decides to refresh proactively. We layer an explicit expiry check below
 * to handle the case where the plugin was closed for longer than the JWT
 * lifetime (typically 1 hour).
 */
export async function restoreCachedSession(): Promise<boolean> {
  const { data, error } = await supabase.auth.getSession();
  if (error) return false;
  const session = data.session;
  if (!session) return false;

  // expires_at is Unix seconds. If we are already past it (or within a
  // 30-second grace window), force a refresh up-front so the UI doesn't
  // flash an authenticated screen on a token that the next RPC will reject.
  const nowSec = Math.floor(Date.now() / 1000);
  const expiresAt = session.expires_at ?? 0;
  if (nowSec >= expiresAt - 30) {
    const { error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) {
      // Refresh failed (token revoked, network blip, etc.) — sign out so the
      // stale entry in clientStorage doesn't haunt the next reopen. No
      // logging of the error token contents (T-02.2-05-07 mitigation).
      await supabase.auth.signOut();
      return false;
    }
  }

  return true;
}

/**
 * Sign out — delegates to supabase-js which calls our storage adapter's
 * removeItem for all auth-related keys (sb-<ref>-auth-token et al.), which
 * propagates to figma.clientStorage.deleteAsync via the IPC bridge.
 *
 * No manual key deletion required; supabase-js owns the namespace.
 */
export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
