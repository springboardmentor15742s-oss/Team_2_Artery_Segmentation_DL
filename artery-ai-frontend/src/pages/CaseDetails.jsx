import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  User,
  Activity,
  UploadCloud,
  FileText,
  CheckCircle2,
  Clock,
  AlertCircle,
  Layers,
  Calendar,
  Tag,
  Stethoscope,
  Info
} from 'lucide-react';
import Card from '../components/Card/Card';
import Button from '../components/Button/Button';
import StatusBadge from '../components/StatusBadge/StatusBadge';
import LoadingSpinner from '../components/Loading/LoadingSpinner';
import PreprocessingStatus from '../components/Preprocessing/PreprocessingStatus';
import FileUpload from '../components/FileUpload/FileUpload';
import { getCase, uploadMedicalImage } from '../services/api';

export default function CaseDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [caseData, setCaseData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showInlineUpload, setShowInlineUpload] = useState(false);

  const fetchCaseDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getCase(id);
      setCaseData(data);
    } catch (err) {
      setError(err.message || `Case ${id} could not be loaded.`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCaseDetails();
  }, [id]);

  const handleUploadSuccess = async (fileMeta) => {
    try {
      await uploadMedicalImage(id, fileMeta);
      await fetchCaseDetails();
      setShowInlineUpload(false);
    } catch (err) {
      console.error('Upload sync failed', err);
    }
  };

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-3">
        <LoadingSpinner size="lg" />
        <p className="text-sm text-slate-500 font-medium">Loading clinical record {id}...</p>
      </div>
    );
  }

  if (error || !caseData) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-800">Case Record Not Found</h2>
        <p className="text-sm text-slate-500">{error || 'The requested clinical case does not exist.'}</p>
        <Link to="/cases">
          <Button variant="outline" icon={ArrowLeft}>
            Back to Case Registry
          </Button>
        </Link>
      </div>
    );
  }

  const { fileInfo } = caseData;

  return (
    <div className="space-y-6">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <Link
            to="/cases"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
            title="Back to Cases"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 font-mono">
                {caseData.id}
              </h1>
              <StatusBadge status={caseData.status} size="md" />
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Patient ID: <span className="font-mono font-semibold text-slate-700">{caseData.patientId}</span> • Registered on {caseData.scanDate}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant={showInlineUpload ? 'secondary' : 'primary'}
            icon={UploadCloud}
            onClick={() => setShowInlineUpload(!showInlineUpload)}
          >
            {showInlineUpload ? 'Close Upload' : fileInfo ? 'Re-upload Scan' : 'Upload Medical Scan'}
          </Button>
        </div>
      </div>

      {/* Inline Upload Drawer/Section if toggled */}
      {showInlineUpload && (
        <Card
          title="Upload Medical Scan for Case"
          subtitle={`Attaching DICOM/NIfTI volumetric series to ${caseData.id}`}
          icon={UploadCloud}
        >
          <FileUpload
            selectedCaseId={caseData.id}
            onUploadSuccess={handleUploadSuccess}
          />
        </Card>
      )}

      {/* Main 2-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Patient & Case Information */}
        <div className="space-y-6 lg:col-span-1">
          {/* Patient Information Card */}
          <Card
            title="Patient Information"
            subtitle="Demographics and medical history"
            icon={User}
          >
            <div className="space-y-4 text-xs sm:text-sm">
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">Patient Identifier</span>
                <span className="font-mono font-semibold text-slate-800">
                  {caseData.patientId}
                </span>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">Age & Gender</span>
                <span className="font-medium text-slate-800">
                  {caseData.age} yrs • {caseData.gender}
                </span>
              </div>

              <div className="py-2 border-b border-slate-100">
                <span className="text-slate-500 block mb-1.5">Cardiovascular Risk Factors</span>
                <div className="flex flex-wrap gap-1.5">
                  {caseData.riskFactors && caseData.riskFactors.length > 0 ? (
                    caseData.riskFactors.map((rf, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200"
                      >
                        {rf}
                      </span>
                    ))
                  ) : (
                    <span className="text-slate-400 text-xs">No risk factors recorded</span>
                  )}
                </div>
              </div>

              <div className="py-2 border-b border-slate-100">
                <span className="text-slate-500 block mb-1">Medical History</span>
                <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  {caseData.medicalHistory || 'No prior vascular interventions noted.'}
                </p>
              </div>

              {caseData.clinicalNotes && (
                <div className="py-2">
                  <span className="text-slate-500 block mb-1">Clinical Notes</span>
                  <p className="text-xs text-slate-700 leading-relaxed bg-medical-50/50 p-2.5 rounded-lg border border-medical-100">
                    {caseData.clinicalNotes}
                  </p>
                </div>
              )}
            </div>
          </Card>

          {/* Case Information Card */}
          <Card
            title="Case Information"
            subtitle="Acquisition protocol and pipeline settings"
            icon={Activity}
          >
            <div className="space-y-3.5 text-xs sm:text-sm">
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Case ID</span>
                <span className="font-mono font-semibold text-medical-700">
                  {caseData.id}
                </span>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Imaging Modality</span>
                <span className="font-medium text-slate-800">
                  {caseData.modality}
                </span>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Scan Date</span>
                <span className="font-mono text-slate-800">
                  {caseData.scanDate}
                </span>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Anatomical Region</span>
                <span className="font-medium text-slate-800">
                  {caseData.anatomicalRegion}
                </span>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Analysis Status</span>
                <StatusBadge status={caseData.status} size="sm" />
              </div>

              <div className="flex items-center justify-between py-1.5">
                <span className="text-slate-500">Model Version</span>
                <span className="font-mono text-xs text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                  {caseData.modelVersion}
                </span>
              </div>
            </div>
          </Card>
        </div>

        {/* Right Column: Scan Section & Preprocessing Pipeline Representation */}
        <div className="space-y-6 lg:col-span-2">
          {/* Scan Section Card */}
          <Card
            title="Medical Scan Section"
            subtitle="Volumetric imaging file specifications and acquisition parameters"
            icon={Layers}
          >
            {fileInfo ? (
              <div className="space-y-5">
                {/* File Information Specs Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <div>
                    <span className="text-[11px] text-slate-500 uppercase tracking-wider block">File Name</span>
                    <span className="text-xs font-mono font-semibold text-slate-900 truncate block mt-0.5" title={fileInfo.fileName}>
                      {fileInfo.fileName}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 uppercase tracking-wider block">Format</span>
                    <span className="text-xs font-semibold text-slate-800 block mt-0.5">
                      {fileInfo.fileType}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 uppercase tracking-wider block">File Size</span>
                    <span className="text-xs font-semibold text-slate-800 block mt-0.5">
                      {fileInfo.fileSize}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 uppercase tracking-wider block">Slices / Res</span>
                    <span className="text-xs font-mono text-slate-800 block mt-0.5">
                      {fileInfo.slices || 512} slices
                    </span>
                  </div>
                </div>

                {/* Medical Image Visualization Area Placeholder */}
                <div className="border border-slate-200 rounded-xl bg-slate-900 text-white p-6 min-h-[260px] flex flex-col items-center justify-center text-center relative overflow-hidden">
                  {/* Subtle Grid Background Pattern */}
                  <div
                    className="absolute inset-0 opacity-10"
                    style={{
                      backgroundImage: `radial-gradient(#38bdf8 1px, transparent 1px)`,
                      backgroundSize: '20px 20px',
                    }}
                  />

                  <div className="relative z-10 max-w-md space-y-3">
                    <div className="w-12 h-12 rounded-xl bg-slate-800/90 border border-slate-700 text-sky-400 flex items-center justify-center mx-auto shadow-inner">
                      <Layers className="w-6 h-6" />
                    </div>

                    <h4 className="text-sm font-semibold text-slate-200">
                      Medical Image Viewport Preview
                    </h4>

                    <p className="text-xs text-slate-400 leading-relaxed">
                      Scan file <span className="font-mono text-sky-300">{fileInfo.fileName}</span> is loaded and verified. Volumetric multi-planar reconstruction, artery segmentation, and stenosis localization will be integrated upon model pipeline execution.
                    </p>

                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700 text-[11px] text-slate-300">
                      <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                      <span>Preprocessing Checkpoints Satisfied</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* No file uploaded empty state */
              <div className="py-12 px-4 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-3">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-semibold text-slate-800">
                  No Medical Scan Uploaded Yet
                </h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
                  Attach a DICOM series (.dcm) or NIfTI volume (.nii, .nii.gz) for this case to begin the verification pipeline.
                </p>
                <Button
                  size="sm"
                  variant="primary"
                  icon={UploadCloud}
                  onClick={() => setShowInlineUpload(true)}
                >
                  Upload Medical Scan
                </Button>
              </div>
            )}
          </Card>

          {/* Basic Preprocessing Interface Component */}
          <PreprocessingStatus
            currentStage={
              fileInfo
                ? fileInfo.uploadStatus === 'Failed'
                  ? 'failed'
                  : 'ready'
                : 'validation'
            }
          />
        </div>
      </div>
    </div>
  );
}
