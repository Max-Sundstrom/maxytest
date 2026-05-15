import { createFileRoute } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';

/**
 * Walking-skeleton landing route.
 *
 * Phase 1 Plan 01-01 contract (must_haves.truths):
 *   - Renders one shadcn <Button> whose computed background = --color-accent
 *     (verified manually in checkpoint Task 4 via DevTools).
 *   - Uses Inter font (loaded in main.tsx; tokens.css points --font-sans at Inter).
 *
 * This route is the "Maxytest is alive" smoke screen; later plans replace it with
 * an auth-aware redirect (auth.login.tsx in Plan 01-02 → /app dashboard in Plan 01-03).
 */
function IndexComponent() {
  const bootTime = new Date().toISOString();
  // import.meta.env.MODE is one of 'development' | 'production' | (custom)
  const mode = import.meta.env.MODE;

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 shadow-sm">
        <h1 className="mb-2 text-3xl font-semibold tracking-tight text-foreground">
          Maxytest is alive
        </h1>
        <p className="mb-1 text-sm text-muted-foreground">
          Walking skeleton booted on Vite{' '}
          <span className="font-mono text-xs tabular-nums">{mode}</span>.
        </p>
        <p className="mb-6 font-mono text-xs tabular-nums text-muted-foreground">
          {bootTime}
        </p>
        <Button variant="default" size="default">
          Click me
        </Button>
      </div>
    </main>
  );
}

export const Route = createFileRoute('/')({
  component: IndexComponent,
});
