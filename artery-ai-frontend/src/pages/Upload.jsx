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
import { getCases, uploadMedicalImage } from '../services/api';

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
      setPreprocessingState('conversion');
      await uploadMedicalImage(selectedCaseId, fileMetadata);
      setUploadedFile(fileMetadata);
      setIsSuccess(true);
      setPreprocessingState('ready');
    } catch (err) {
      console.error('Upload sync error', err);
      throw err;
    }
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
          Attach a DICOM study, still angiogram or angiography video to a registered case
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
              <h4 className="text-sm font-bold">{/\.(mp4|mov|avi|webm|mpg|mpeg)$/i.test(uploadedFile.name) ? 'Angiography Video Uploaded' : 'Medical Scan Uploaded Successfully'}</h4>
              <p className="text-xs text-emerald-700 mt-0.5">
                File <span className="font-mono font-semibold">{uploadedFile.name}</span> has been stored and linked to Case <span className="font-mono font-semibold">{selectedCaseId}</span>. {/\.(mp4|mov|avi|webm|mpg|mpeg)$/i.test(uploadedFile.name) ? 'Choose a timestamp in the viewer to extract and analyze a frame.' : 'It passed automated image-readability checks; clinician review is still required.'}
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
              variant="outline"
              onClick={() => navigate(`/cases/${selectedCaseId}`)}
            >
              View Case Details
            </Button>
            <Button
              size="sm"
              variant="primary"
              icon={ArrowRight}
              onClick={() => navigate(`/explainable-ai/${encodeURIComponent(selectedCaseId)}`)}
            >
              Open Explainable AI
            </Button>
          </div>
        </div>
      )}

      {/* Basic Preprocessing Interface Representation */}
      <PreprocessingStatus
        currentStage={preprocessingState}
        showDetails={true}
      />
    </div>
  );
}
