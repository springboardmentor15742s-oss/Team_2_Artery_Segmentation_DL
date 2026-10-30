import React from 'react';
import { CheckCircle2, Clock, AlertCircle, RefreshCw } from 'lucide-react';

export const PREPROCESSING_STAGES = [
  { id: 'validation', label: 'Image Validation', description: 'Header integrity, DICOM/NIfTI tag compliance & slice sequence check' },
  { id: 'conversion', label: 'Format Conversion', description: 'Standardized volumetric voxel grid alignment (HU / density scaling)' },
  { id: 'resolution', label: 'Resolution Check', description: 'Isotropic voxel resampling (0.5mm x 0.5mm x 0.5mm spatial normalization)' },
  { id: 'preparation', label: 'Image Preparation', description: 'Contrast windowing, noise filtering, and bounding box volume cropping' },
  { id: 'ready', label: 'Ready for Analysis', description: 'Pipeline preparation complete. Queued for downstream vessel analysis.' },
];

export default function PreprocessingStatus({
  currentStage = 'validation', // validation-complete means only the first-stage checks ran
  stages = PREPROCESSING_STAGES,
  compact = false,
  showDetails = true,
  onRerun,
}) {
  const getStageStatus = (stageId, index) => {
    if (currentStage === 'validation-complete') return index === 0 ? 'completed' : 'pending';
    if (currentStage === 'failed') {
      if (index === 0) return 'completed';
      if (index === 1) return 'failed';
      return 'pending';
    }

    const order = ['validation', 'conversion', 'resolution', 'preparation', 'ready'];
    const currentIndex = order.indexOf(currentStage);
    const stageIndex = order.indexOf(stageId);

    if (stageIndex < currentIndex || currentStage === 'ready') {
      return 'completed';
    }
    if (stageIndex === currentIndex) {
      return 'active';
    }
    return 'pending';
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
        <div>
          <h4 className="text-sm font-semibold text-slate-800">
            Preprocessing Pipeline Status
          </h4>
          <p className="text-xs text-slate-500 mt-0.5">
            Initial input verification and preparation interface
          </p>
        </div>
        {onRerun && (
          <button
            onClick={onRerun}
            className="inline-flex items-center gap-1.5 text-xs text-medical-600 hover:text-medical-700 font-medium px-2.5 py-1 rounded-md bg-medical-50 hover:bg-medical-100 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Re-verify
          </button>
        )}
      </div>

      <div className="space-y-3">
        {stages.map((stage, idx) => {
          const status = getStageStatus(stage.id, idx);

          return (
            <div
              key={stage.id}
              className={`flex items-start justify-between p-3 rounded-lg border transition-all ${
                status === 'completed'
                  ? 'bg-slate-50/60 border-slate-200/70 text-slate-700'
                  : status === 'active'
                  ? 'bg-sky-50/50 border-sky-200 text-sky-900 shadow-2xs'
                  : status === 'failed'
                  ? 'bg-rose-50/50 border-rose-200 text-rose-900'
                  : 'bg-white border-slate-100 text-slate-400'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 shrink-0">
                  {status === 'completed' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : status === 'active' ? (
                    <div className="w-4 h-4 rounded-full border-2 border-sky-600 border-t-transparent animate-spin" />
                  ) : status === 'failed' ? (
                    <AlertCircle className="w-4 h-4 text-rose-600" />
                  ) : (
                    <Clock className="w-4 h-4 text-slate-300" />
                  )}
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold">{stage.label}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                        status === 'completed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : status === 'active'
                          ? 'bg-sky-100 text-sky-800'
                          : status === 'failed'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {status === 'completed'
                        ? 'Passed'
                        : status === 'active'
                        ? 'Processing'
                        : status === 'failed'
                        ? 'Flagged'
                        : 'Queued'}
                    </span>
                  </div>

                  {showDetails && (
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {stage.description}
                    </p>
                  )}
                </div>
              </div>

              <div className="text-right shrink-0 ml-3">
                {status === 'completed' && (
                  <span className="text-xs font-bold text-emerald-600">✓</span>
                )}
                {status === 'active' && (
                  <span className="text-[11px] text-sky-600 font-medium">In Progress</span>
                )}
                {status === 'failed' && (
                  <span className="text-xs font-bold text-rose-600">✕</span>
                )}
                {status === 'pending' && (
                  <span className="text-xs text-slate-300">—</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
