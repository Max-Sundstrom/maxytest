/**
 * <StatRich /> — single stat tile with optional person-icon adornment.
 *
 * Source: handoff `js/maxitest-report.jsx` <StatRich /> + <PeopleIcon />
 * + ADDENDUM-v3 §1 spec (label 12.5 text-2 above + 26/30 weight-500 value).
 *
 * Person icons distinguish success (user-check, green) from gave-up
 * (user-x, warn ochre). Plain stats (Avg / Median time) omit the icon.
 */

export type StatIconKind = 'user-check' | 'user-x' | undefined;

export interface StatRichProps {
  label: string;
  value: string;
  icon?: StatIconKind;
  iconColor?: string;
}

export function StatRich({ label, value, icon, iconColor }: StatRichProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span
        style={{
          font: '400 12.5px/16px var(--font-sans)',
          color: 'var(--text-2)',
          letterSpacing: '0.01em',
        }}
      >
        {label}
      </span>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
          font: '500 26px/30px var(--font-sans)',
          color: 'var(--text-1)',
        }}
      >
        {icon ? (
          <span style={{ color: iconColor ?? 'var(--text-2)', display: 'inline-flex' }}>
            <PeopleIcon kind={icon} />
          </span>
        ) : null}
        <span>{value}</span>
      </span>
    </div>
  );
}

function PeopleIcon({ kind }: { kind: StatIconKind }) {
  if (kind === 'user-check') {
    return (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
        <circle cx="9" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M3 19c0-3.3 2.7-6 6-6s6 2.7 6 6"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M14 6.5l1.7 1.7L19 5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    );
  }
  if (kind === 'user-x') {
    return (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
        <circle cx="9" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M3 19c0-3.3 2.7-6 6-6s6 2.7 6 6"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M14.5 5.5l4 4M18.5 5.5l-4 4"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return null;
}
