import React, { useState, useRef } from 'react';
import { UploadCloud, FileText, CheckCircle2, AlertCircle, X, RotateCcw } from 'lucide-react';
import Button from '../Button/Button';

const ALLOWED_EXTENSIONS = ['.dcm', '.nii', '.nii.gz', '.mhd', '.raw', '.png', '.jpg', '.jpeg'];
const MAX_FILE_SIZE_BYTES = 300 * 1024 * 1024; // 300 MB

export default function FileUpload({
  onUploadSuccess,
  onUploadError,
  selectedCaseId = null,
  simulateFailure = false,
}) {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('idle'); // 'idle' | 'uploading' | 'success' | 'failure'
  const fileInputRef = useRef(null);

  const validateFile = (selectedFile) => {
    if (!selectedFile) return false;

    const lowerName = selectedFile.name.toLowerCase();
    const hasValidExtension = ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));

    if (!hasValidExtension) {
      setError(`Invalid file format. Allowed medical formats: ${ALLOWED_EXTENSIONS.join(', ')}`);
      return false;
    }

    if (selectedFile.size > MAX_FILE_SIZE_BYTES) {
      setError(`File size exceeds 300MB limit (${(selectedFile.size / (1024 * 1024)).toFixed(1)}MB).`);
      return false;
    }

    setError(null);
    return true;
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e) => {
    if (e.target.files && e.target.files[0]) {
      processSelectedFile(e.target.files[0]);
    }
  };

  const processSelectedFile = (selectedFile) => {
    if (validateFile(selectedFile)) {
      setFile(selectedFile);
      setStatus('idle');
      setProgress(0);
    } else {
      setFile(null);
      setStatus('failure');
    }
  };

  const startUpload = () => {
    if (!file) return;

    setStatus('uploading');
    setProgress(5);
    setError(null);

    let current = 5;
    const interval = setInterval(() => {
      current += Math.floor(Math.random() * 20) + 15;
      if (current >= 100) {
        current = 100;
        clearInterval(interval);

        if (simulateFailure || file.name.toLowerCase().includes('fail') || file.name.toLowerCase().includes('corrupt')) {
          setStatus('failure');
          setError('Upload failed: Corrupt DICOM slice headers detected.');
          if (onUploadError) onUploadError('Corrupt slice headers detected.');
        } else {
          const completeUpload = async () => {
            try {
              if (onUploadSuccess) {
                await onUploadSuccess({
                  name: file.name,
                  size: file.size,
                  type: file.type || 'application/dicom',
                  file,
                  uploadedAt: new Date().toISOString(),
                  caseId: selectedCaseId,
                });
              }
              setStatus('success');
            } catch (err) {
              setStatus('failure');
              setError(err?.message || 'Upload failed. Please try again.');
              if (onUploadError) onUploadError(err?.message || 'Upload failed.');
            }
          };
          completeUpload();
        }
      }
      setProgress(current);
    }, 250);
  };

  const handleRemove = () => {
    setFile(null);
    setStatus('idle');
    setProgress(0);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRetry = () => {
    setStatus('idle');
    setProgress(0);
    setError(null);
    startUpload();
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const mb = bytes / (1024 * 1024);
    return mb >= 1 ? `${mb.toFixed(2)} MB` : `${(bytes / 1024).toFixed(1)} KB`;
  };

  const getFormatBadge = (filename) => {
    if (!filename) return 'Unknown';
    const lower = filename.toLowerCase();
    if (lower.endsWith('.dcm')) return 'DICOM Image';
    if (lower.endsWith('.nii') || lower.endsWith('.nii.gz')) return 'NIfTI 3D Volume';
    if (lower.endsWith('.mhd') || lower.endsWith('.raw')) return 'MetaImage (MHD)';
    return 'Standard Medical Image';
  };

  return (
    <div className="w-full">
      {/* Upload Drop Zone Card */}
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all ${
          dragActive
            ? 'border-medical-500 bg-medical-50/70 scale-[1.005]'
            : 'border-slate-300 hover:border-slate-400 bg-slate-50/50'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          id="medical-file-upload"
          className="hidden"
          accept=".dcm,.nii,.nii.gz,.mhd,.raw,.png,.jpg,.jpeg"
          onChange={handleFileInput}
        />

        <div className="flex flex-col items-center justify-center max-w-md mx-auto">
          <div className="w-14 h-14 rounded-2xl bg-medical-50 text-medical-600 flex items-center justify-center mb-4 shadow-2xs">
            <UploadCloud className="w-7 h-7" />
          </div>

          <h3 className="text-base font-semibold text-slate-800">
            Upload Medical Scan
          </h3>
          <p className="text-sm text-slate-500 mt-1 mb-4">
            Drag and drop your file here
          </p>

          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
            or
          </span>

          <label
            htmlFor="medical-file-upload"
            className="cursor-pointer inline-flex items-center justify-center text-sm font-medium px-4 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400 shadow-2xs transition-colors"
          >
            Browse Files
          </label>

          <p className="text-[11px] text-slate-400 mt-4 leading-normal">
            Supported medical formats: DICOM (.dcm), NIfTI (.nii, .nii.gz), MetaImage (.mhd, .raw), PNG, JPG. Max 300MB.
          </p>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mt-4 p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-3 text-xs">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold">Upload Error: </span>
            {error}
          </div>
          <button
            onClick={() => setError(null)}
            className="text-rose-500 hover:text-rose-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Selected File Details & Progress Card */}
      {file && (
        <div className="mt-5 p-5 rounded-xl border border-slate-200 bg-white shadow-xs">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3.5 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-medical-50 text-medical-600 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-slate-800 truncate" title={file.name}>
                  {file.name}
                </h4>
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1">
                  <span>Size: {formatFileSize(file.size)}</span>
                  <span>•</span>
                  <span>Type: {getFormatBadge(file.name)}</span>
                </div>
              </div>
            </div>

            <button
              onClick={handleRemove}
              disabled={status === 'uploading'}
              className="text-slate-400 hover:text-slate-600 p-1.5 rounded-md hover:bg-slate-100 transition-colors disabled:opacity-50"
              title="Remove selected file"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Progress Bar & Status */}
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-medium text-slate-600">
                Upload Progress:
              </span>
              <span className="font-mono font-semibold text-slate-800">
                {progress}%
              </span>
            </div>

            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
              <div
                className={`h-2 rounded-full transition-all duration-200 ${
                  status === 'failure'
                    ? 'bg-rose-500'
                    : status === 'success'
                    ? 'bg-emerald-500'
                    : 'bg-medical-500'
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="mt-2.5 flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">Status:</span>
                {status === 'idle' && (
                  <span className="font-medium text-slate-700">Ready to upload</span>
                )}
                {status === 'uploading' && (
                  <span className="font-medium text-medical-600 animate-pulse">Uploading medical scan...</span>
                )}
                {status === 'success' && (
                  <span className="font-medium text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Upload Successful & Validated
                  </span>
                )}
                {status === 'failure' && (
                  <span className="font-medium text-rose-600 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Upload Failed
                  </span>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                {status === 'idle' && (
                  <Button size="sm" onClick={startUpload}>
                    Upload File
                  </Button>
                )}

                {status === 'failure' && (
                  <Button size="sm" variant="outline" onClick={handleRetry} icon={RotateCcw}>
                    Retry Upload
                  </Button>
                )}

                {status === 'success' && (
                  <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                    Validated
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
