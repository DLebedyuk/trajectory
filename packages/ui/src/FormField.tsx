import type { ReactNode } from 'react';

export function FormField({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="field" style={{ display: 'block' }}>
      <span className="lbl">{label}</span>
      {children}
      {error ? (
        <span className="hint" style={{ color: 'var(--d-act)', marginTop: 6, display: 'block' }}>
          {error}
        </span>
      ) : hint ? (
        <span className="hint" style={{ marginTop: 6, display: 'block' }}>
          {hint}
        </span>
      ) : null}
    </label>
  );
}
