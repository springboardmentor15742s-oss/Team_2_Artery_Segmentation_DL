import React from 'react';

export default function NarrowingEstimate({ analysis, dark = false }) {
  const rawValue = analysis?.candidate_regions?.[0]?.estimated_narrowing_percent;
  const numericValue = rawValue === null || rawValue === undefined ? NaN : Number(rawValue);
  const narrowing = Number.isFinite(numericValue) ? Math.min(100, Math.max(0, numericValue)) : null;
  const remaining = narrowing === null ? null : 100 - narrowing;
  const referenceRadius = analysis?.explainability?.reference_radius_px;
  const minimumRadius = analysis?.candidate_regions?.[0]?.minimum_radius_px
    ?? analysis?.explainability?.minimum_radius_px;
  const theme = dark
    ? {
      container: 'border-white/10 bg-white/[.035] text-slate-100',
      muted: 'text-slate-400',
      track: 'bg-slate-700',
      reference: 'bg-cyan-400',
      minimum: 'bg-amber-400',
      formula: 'border-white/10 bg-black/20 text-slate-300',
    }
    : {
      container: 'border-slate-200 bg-white text-slate-900',
      muted: 'text-slate-500',
      track: 'bg-slate-200',
      reference: 'bg-cyan-600',
      minimum: 'bg-amber-500',
      formula: 'border-slate-200 bg-slate-50 text-slate-600',
    };

  return (
    <section className={`rounded-xl border p-4 ${theme.container}`} aria-label="Estimated percentage narrowing">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold">Estimated narrowing (research)</h3>
          <p className={`mt-1 text-[11px] ${theme.muted}`}>First QCA radius-profile candidate</p>
        </div>
        <strong className="font-mono text-2xl">{narrowing === null ? 'N/A' : `${narrowing.toFixed(1)}%`}</strong>
      </div>

      {narrowing === null ? (
        <p className={`mt-4 text-xs ${theme.muted}`}>No valid lumen candidate was returned; this is not a 0% narrowing result.</p>
      ) : (
        <div className="mt-4 space-y-3">
          <div>
            <div className={`mb-1 flex justify-between text-[10px] ${theme.muted}`}><span>Reference lumen</span><span>100%</span></div>
            <div className={`h-2 overflow-hidden rounded-full ${theme.track}`}><div className={`h-full w-full ${theme.reference}`} /></div>
          </div>
          <div>
            <div className={`mb-1 flex justify-between text-[10px] ${theme.muted}`}><span>Minimum lumen remaining</span><span>{remaining.toFixed(1)}%</span></div>
            <div className={`h-2 overflow-hidden rounded-full ${theme.track}`}><div className={`h-full ${theme.minimum}`} style={{ width: `${remaining}%` }} /></div>
          </div>
        </div>
      )}

      <p className={`mt-3 rounded-lg border p-2 text-[10px] leading-relaxed ${theme.formula}`}>
        Calculation: 100 × (1 − minimum radius ÷ reference radius)
        {Number.isFinite(referenceRadius) && Number.isFinite(minimumRadius)
          ? ` · ${minimumRadius}px ÷ ${referenceRadius}px`
          : ''}
      </p>
      <p className={`mt-2 text-[10px] leading-relaxed ${theme.muted}`}>
        Research estimate only: 100 × (1 − minimum candidate radius ÷ reference radius). It is not a confirmed or clinically validated stenosis measurement.
      </p>
    </section>
  );
}
