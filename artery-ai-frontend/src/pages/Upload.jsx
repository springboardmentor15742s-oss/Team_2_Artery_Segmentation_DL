import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import {
  UploadCloud,
  CheckCircle2,
  FolderKanban,
  FileText,
  AlertCircle,
  ArrowRight,
  ShieldAlert
} from 'lucide-react';
import Card from '../components/Card/Card';
import Button from '../components/Button/Button';
import Select from '../components/Select/Select';
import FileUpload from '../components/FileUpload/FileUpload';
import PreprocessingStatus from '../components/Preprocessing/PreprocessingStatus';
import { getCases, uploadMedicalImage, runInitialPreprocessing } from '../services/api';

export default function Upload() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const caseIdFromQuery = searchParams.get('caseId');

  const [cases, setCases] = useState([]);
  const [selectedCaseId, setSelectedCaseId] = useState(caseIdFromQuery || '');
  const [loadingCases, setLoadingCases] = useState(true);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [preprocessingState, setPreprocessingState] = useState('validation');
  const [preprocessingResult, setPreprocessingResult] = useState(null);
  const [preprocessingLoading, setPreprocessingLoading] = useState(false);
  const [preprocessingError, setPreprocessingError] = useState('');

  useEffect(() => {
    async function loadCases() {
      try {
        setLoadingCases(true);
        const res = await getCases();
        setCases(res.cases || []);
        if (!caseIdFromQuery && res.cases && res.cases.length > 0) {
          setSelectedCaseId(res.cases[0].id);
        }
      } catch (err) {
        console.error('Failed to load cases', err);
      } finally {
        setLoadingCases(false);
      }
    }
    loadCases();
  }, [caseIdFromQuery]);

  const handleUploadSuccess = async (fileMetadata) => {
    try {
      if (!selectedCaseId) throw new Error('Please select a case before uploading.');
      setPreprocessingResult(null);
      setPreprocessingError('');
      await uploadMedicalImage(selectedCaseId, fileMetadata);
      setUploadedFile(fileMetadata);
      setIsSuccess(true);
      setPreprocessingState('validation');
    } catch (err) {
      console.error('Upload sync error', err);
      throw err;
    }
  };

  const handleRunPreprocessing = async () => {
    if (!selectedCaseId) return;
    setPreprocessingLoading(true); setPreprocessingError('');
    try {
      const result = await runInitialPreprocessing(selectedCaseId);
      setPreprocessingResult(result);
      setPreprocessingState(result.metadata?.readable ? 'validation-complete' : 'failed');
    } catch (err) {
      setPreprocessingError(err.message || 'Initial validation failed.');
      setPreprocessingState('failed');
    } finally { setPreprocessingLoading(false); }
  };

  const selectedCaseObj = cases.find((c) => c.id === selectedCaseId);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
          Upload Medical Scan
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
          Attach volumetric angiography DICOM or NIfTI scan series to a registered clinical case
        </p>
      </div>

      {/* Case Selection Card */}
      <Card
        title="Select Target Clinical Case"
        subtitle="Associate this diagnostic scan with a registered patient record"
        icon={FolderKanban}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
          <Select
            label="Clinical Case"
            id="target-case-select"
            value={selectedCaseId}
            onChange={(e) => setSelectedCaseId(e.target.value)}
            disabled={loadingCases}
            options={cases.map((c) => ({
              value: c.id,
              label: `${c.id} - ${c.patientId} (${c.anatomicalRegion})`,
            }))}
            required
          />

          <div className="text-xs text-slate-500 pb-2">
            Don&apos;t see the case?{' '}
            <Link to="/cases/new" className="font-semibold text-medical-600 hover:text-medical-700 hover:underline">
              Create a new case first →
            </Link>
          </div>
        </div>

        {selectedCaseObj && (
          <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-slate-400 block">Patient ID:</span>
              <span className="font-mono font-medium text-slate-800">{selectedCaseObj.patientId}</span>
            </div>
            <div>
              <span className="text-slate-400 block">Modality:</span>
              <span className="font-medium text-slate-800">{selectedCaseObj.modality.split(' ')[0]}</span>
            </div>
            <div>
              <span className="text-slate-400 block">Region:</span>
              <span className="font-medium text-slate-800">{selectedCaseObj.anatomicalRegion}</span>
            </div>
            <div>
              <span className="text-slate-400 block">Current Status:</span>
              <span className="font-semibold text-medical-700">{selectedCaseObj.status}</span>
            </div>
          </div>
        )}
      </Card>

      {/* Main Upload Drop Zone Component */}
      <Card
        title="Medical Scan Upload"
        subtitle="Upload DICOM series (.dcm), NIfTI volumes (.nii, .nii.gz), or MetaImage (.mhd)"
        icon={UploadCloud}
      >
        <FileUpload
          selectedCaseId={selectedCaseId}
          onUploadSuccess={handleUploadSuccess}
        />
      </Card>

      {/* Success Banner & Navigation */}
      {isSuccess && uploadedFile && (
        <div className="p-5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold">Medical Scan Successfully Uploaded</h4>
              <p className="text-xs text-emerald-700 mt-0.5">
                File <span className="font-mono font-semibold">{uploadedFile.name}</span> has been linked to Case <span className="font-mono font-semibold">{selectedCaseId}</span>. Run initial validation below to inspect available metadata.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setIsSuccess(false);
                setUploadedFile(null);
              }}
            >
              Upload Another
            </Button>
            <Button
              size="sm"
              variant="primary"
              icon={ArrowRight}
              onClick={() => navigate(`/cases/${selectedCaseId}`)}
            >
              View Case Details
            </Button>
          </div>
        </div>
      )}

      {isSuccess && uploadedFile && (
        <Card title="Initial Preprocessing & Metadata Checks" subtitle="Runs file integrity checks and reads supported image headers; this is not AI segmentation." icon={CheckCircle2}>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" variant="primary" onClick={handleRunPreprocessing} disabled={preprocessingLoading || !selectedCaseId}>
              {preprocessingLoading ? 'Checking file…' : 'Run Initial Preprocessing Checks'}
            </Button>
            <span className="text-xs text-slate-500">Checks file readability, size and SHA-256; NIfTI/DICOM metadata is available when optional readers are installed.</span>
          </div>
          {preprocessingError && <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{preprocessingError}</div>}
          {preprocessingResult && (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-sm">{preprocessingResult.status}</span><span className="text-xs rounded-full bg-amber-100 text-amber-800 px-2 py-1">Validation only — no model inference</span></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div><div className="text-xs text-slate-500">Detected format</div><div className="font-medium">{preprocessingResult.metadata?.format || 'Unknown'}</div></div>
                <div><div className="text-xs text-slate-500">File size</div><div className="font-medium">{preprocessingResult.metadata?.sizeBytes?.toLocaleString?.() || '—'} bytes</div></div>
                {preprocessingResult.metadata?.shape && <div><div className="text-xs text-slate-500">Image shape</div><div className="font-medium">{preprocessingResult.metadata.shape.join(' × ')}</div></div>}
                {preprocessingResult.metadata?.voxelSpacingMm && <div><div className="text-xs text-slate-500">Voxel spacing</div><div className="font-medium">{preprocessingResult.metadata.voxelSpacingMm.join(' × ')} mm</div></div>}
              </div>
              <div><div className="text-xs font-semibold text-slate-600 mb-1">Completed checks</div><ul className="list-disc pl-5 text-xs text-slate-600">{(preprocessingResult.checks || []).map((item) => <li key={item}>{item}</li>)}</ul></div>
              {(preprocessingResult.warnings || []).length > 0 && <div className="text-xs text-amber-800">{preprocessingResult.warnings.join(' · ')}</div>}
              <div className="text-xs text-slate-500 break-all">SHA-256: {preprocessingResult.metadata?.sha256}</div>
              <p className="text-xs text-slate-600">{preprocessingResult.nextStep}</p>
            </div>
          )}
        </Card>
      )}

      {/* Basic Preprocessing Interface Representation */}
      <PreprocessingStatus
        currentStage={preprocessingState}
        showDetails={true}
      />
    </div>
  );
}
