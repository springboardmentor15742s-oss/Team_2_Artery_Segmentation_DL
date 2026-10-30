import React, { useState, useEffect } from 'react';
import {
  FileBarChart2,
  Download,
  Eye,
  Search,
  CheckCircle2,
  Clock,
  Printer,
  X,
  FileText
} from 'lucide-react';
import Card from '../components/Card/Card';
import Button from '../components/Button/Button';
import Input from '../components/Input/Input';
import StatusBadge from '../components/StatusBadge/StatusBadge';
import Modal from '../components/Modal/Modal';
import LoadingSpinner from '../components/Loading/LoadingSpinner';
import { getReports } from '../services/api';

export default function Reports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedReport, setSelectedReport] = useState(null);
  const [downloadSuccessToast, setDownloadSuccessToast] = useState(null);

  useEffect(() => {
    async function loadReports() {
      try {
        setLoading(true);
        const data = await getReports();
        setReports(data || []);
      } catch (err) {
        console.error('Failed to load reports', err);
      } finally {
        setLoading(false);
      }
    }
    loadReports();
  }, []);

  const filteredReports = reports.filter((r) => {
    const q = searchQuery.toLowerCase().trim();
    return (
      !q ||
      r.id.toLowerCase().includes(q) ||
      r.caseId.toLowerCase().includes(q) ||
      r.patientId.toLowerCase().includes(q) ||
      r.region.toLowerCase().includes(q) ||
      r.modality.toLowerCase().includes(q)
    );
  });

  const handleDownload = (report) => {
    // Simulate generation of download report file
    const content = `========================================================
ARTERY MEDICAL IMAGING & DIAGNOSTIC REPORT
========================================================
Report Identifier : ${report.id}
Clinical Case ID  : ${report.caseId}
Patient ID        : ${report.patientId}
Modality          : ${report.modality}
Anatomical Region : ${report.region}
Acquisition Date  : ${report.date}
Status            : ${report.status}
Author / Clinician: ${report.author}

CLINICAL SUMMARY:
${report.summary}

NOTE:
Volumetric centerline extraction, stenosis severity scoring, and 
Grad-CAM explainability will be appended upon diagnostic pipeline execution.
========================================================`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${report.id}_${report.caseId}_Clinical_Report.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setDownloadSuccessToast(`Report ${report.id} exported successfully.`);
    setTimeout(() => setDownloadSuccessToast(null), 3500);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Medical Reports
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Diagnostic summaries and case reports for clinical review
          </p>
        </div>
      </div>

      {/* Download feedback toast */}
      {downloadSuccessToast && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{downloadSuccessToast}</span>
          </div>
          <button onClick={() => setDownloadSuccessToast(null)}>
            <X className="w-4 h-4 text-emerald-600" />
          </button>
        </div>
      )}

      {/* Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs">
        <div className="max-w-md">
          <Input
            id="report-search"
            placeholder="Search Report ID, Case ID, Patient ID..."
            leftIcon={Search}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Reports Table Card */}
      <Card
        title="Diagnostic Case Reports"
        subtitle="Clinical diagnostic reports registry"
        icon={FileBarChart2}
        noPadding
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                <th className="py-3 px-4">Report ID</th>
                <th className="py-3 px-4">Case ID</th>
                <th className="py-3 px-4">Patient ID</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Modality</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    <LoadingSpinner size="md" label="Loading reports..." />
                  </td>
                </tr>
              ) : filteredReports.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500 text-xs">
                    No clinical reports match your search criteria.
                  </td>
                </tr>
              ) : (
                filteredReports.map((report) => (
                  <tr key={report.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-medium text-slate-900">
                      {report.id}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-medical-700 font-semibold">
                      {report.caseId}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-700">
                      {report.patientId}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 text-xs font-mono">
                      {report.date}
                    </td>
                    <td className="py-3.5 px-4 text-slate-800 font-medium">
                      {report.modality}
                      <span className="text-slate-400 font-normal text-xs ml-1">
                        • {report.region}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusBadge status={report.status} size="xs" />
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={Eye}
                          onClick={() => setSelectedReport(report)}
                        >
                          View Report
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          icon={Download}
                          onClick={() => handleDownload(report)}
                        >
                          Download
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* View Report Modal */}
      {selectedReport && (
        <Modal
          isOpen={Boolean(selectedReport)}
          onClose={() => setSelectedReport(null)}
          title={`Medical Diagnostic Report: ${selectedReport.id}`}
          subtitle={`Case: ${selectedReport.caseId} • Patient: ${selectedReport.patientId}`}
          footer={
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedReport(null)}
              >
                Close
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={Download}
                onClick={() => handleDownload(selectedReport)}
              >
                Download Report
              </Button>
            </>
          }
        >
          <div className="space-y-4 text-xs sm:text-sm">
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-slate-400 block">Report ID:</span>
                <span className="font-mono font-semibold text-slate-800">{selectedReport.id}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Date of Exam:</span>
                <span className="font-mono text-slate-800">{selectedReport.date}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Imaging Modality:</span>
                <span className="font-semibold text-slate-800">{selectedReport.modality} ({selectedReport.region})</span>
              </div>
              <div>
                <span className="text-slate-400 block">Author:</span>
                <span className="text-slate-800 font-medium">{selectedReport.author}</span>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Clinical Summary
              </h4>
              <p className="text-slate-700 leading-relaxed bg-white p-3 rounded-lg border border-slate-200">
                {selectedReport.summary}
              </p>
            </div>

            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
              <span className="font-semibold">Clinical Notice: </span>
              Detailed automated lumen diameter graphs, stenosis grading percentages, and centerline models will be dynamically populated upon diagnostic pipeline execution.
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
