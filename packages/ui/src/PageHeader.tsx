import type { ReactNode } from 'react';
import { IconBack } from './icons.js';

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
  onBack,
  backLabel = 'Назад',
}: {
  title: string;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  onBack?: () => void;
  backLabel?: string;
}) {
  return (
    <>
      {onBack ? (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ marginBottom: 14, paddingLeft: 7 }}
          onClick={onBack}
        >
          <IconBack />
          {backLabel}
        </button>
      ) : null}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 20,
          marginBottom: 20,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ maxWidth: '66ch' }}>
          {eyebrow}
          <h1 style={{ fontSize: 26, marginTop: eyebrow ? 8 : 0 }}>{title}</h1>
          {subtitle ? (
            <div className="hint" style={{ marginTop: 5, fontSize: 14 }}>
              {subtitle}
            </div>
          ) : null}
        </div>
        {actions ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{actions}</div>
        ) : null}
      </div>
    </>
  );
}
