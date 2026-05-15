import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/auth';

/**
 * The TanStack Router `useNavigate` return type is route-tree-aware (it only
 * accepts paths it knows about). `useSignOut` lives in `lib/queries/` which is
 * deliberately route-tree-agnostic, so we widen the navigate function via a
 * structural type. The route '/auth/login' is registered in Task 4's
 * `auth.login.tsx` and the runtime path is verified by the manual checkpoint.
 */
type LooseNavigate = (opts: { to: string; replace?: boolean }) => unknown;

/**
 * Auth query hooks for the designer (Studio) Supabase client.
 *
 * Plan 01-02 Task 3 contract:
 *   - `useSession()`            — query `auth.getSession()` + subscribe to onAuthStateChange
 *   - `useSignInWithOtp()`      — magic-link send (AUTH-01)
 *   - `useSignOut()`            — clears session and redirects to /auth/login (D-04)
 *
 * Convention (PLAN.md): on auth-state-change, invalidate the 'session' query
 * key so any consumer re-reads the fresh session.
 */

const SESSION_QUERY_KEY = ['session'] as const;
const LAST_OTP_EMAIL_KEY = 'maxytest:last-otp-email';

export interface UseSessionResult {
  session: Session | null;
  isLoading: boolean;
}

/**
 * Subscribes the React tree to the designer's auth state.
 * Returns null when signed out (consumers handle redirect).
 */
export function useSession(): UseSessionResult {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: async (): Promise<Session | null> => {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      return data.session ?? null;
    },
    // Sessions are read once and then updated via the subscription below.
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      // Push the new session into the query cache so consumers re-render
      // without an extra round-trip to getSession().
      qc.setQueryData(SESSION_QUERY_KEY, session);
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, [qc]);

  return {
    session: query.data ?? null,
    isLoading: query.isLoading,
  };
}

export interface SignInWithOtpInput {
  email: string;
}

/**
 * Sends a magic-link email via Supabase Auth (signInWithOtp).
 * `emailRedirectTo` lands the user at /auth/callback with `next=/app` —
 * D-02 + Pitfall 10. The callback handler validates `next` before navigating.
 *
 * On success, stashes the email in sessionStorage under
 * `maxytest:last-otp-email` so `<MagicLinkSentScreen>` can replay it on Resend.
 */
export function useSignInWithOtp() {
  return useMutation({
    mutationFn: async ({ email }: SignInWithOtpInput) => {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/app`,
        },
      });
      if (error) throw error;
      // Keep the original email so the /auth/sent screen can resend without
      // round-tripping back through /auth/login.
      try {
        window.sessionStorage.setItem(LAST_OTP_EMAIL_KEY, email);
      } catch {
        // sessionStorage may be unavailable (private mode quotas, embeds).
        // Resend will fall back to "Use a different email".
      }
      return { email };
    },
  });
}

/**
 * Signs out the designer and navigates to /auth/login.
 * D-04: no confirm dialog. Per PLAN.md Task 3 acceptance criteria, this hook
 * uses `useNavigate` directly so consumers only need to call `.mutate()`.
 */
export function useSignOut() {
  const navigate = useNavigate() as unknown as LooseNavigate;
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    },
    onSuccess: () => {
      // Clear any leftover OTP email from sessionStorage so a re-login starts
      // fresh.
      try {
        window.sessionStorage.removeItem(LAST_OTP_EMAIL_KEY);
      } catch {
        /* see note in useSignInWithOtp */
      }
      navigate({ to: '/auth/login' });
    },
  });
}

/**
 * Helper exported for tests + the resend flow on /auth/sent.
 * Returns the last email the user entered on /auth/login, or null.
 */
export function readLastOtpEmail(): string | null {
  try {
    return window.sessionStorage.getItem(LAST_OTP_EMAIL_KEY);
  } catch {
    return null;
  }
}
