import React, { useState, useEffect } from 'react';
import {
  FileBarChart2,
  Eye,
  Search,
  CheckCircle2,
  Printer,
  Download,
  X,
  FileJson,
  FileSpreadsheet
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
  const [loadError, setLoadError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedReport, setSelectedReport] = useState(null);
  const [downloadSuccessToast, setDownloadSuccessToast] = useState(null);

  useEffect(() => {
    async function loadReports() {
      try {
        setLoading(true);
        const data = await getReports();
        setReports(data || []);
        setLoadError('');
      } catch (err) {
        console.error('Failed to load reports', err);
        setLoadError(err.message || 'Could not load reports. Check that you are signed in and the backend is running.');
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

  const exportFile = (payload, type, filename) => {
    const url = URL.createObjectURL(new Blob([payload], { type }));
    const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const exportJson = () => exportFile(JSON.stringify(reports, null, 2), 'application/json;charset=utf-8', 'artery-analysis-reports.json');
  const exportReportJson = (report) => exportFile(
    JSON.stringify(report, null, 2),
    'application/json;charset=utf-8',
    `${String(report.id).replace(/[^a-z0-9_-]/gi, '_')}.json`
  );
  const exportCsv = () => {
    const fields = ['id','caseId','patientId','date','modality','region','status','severity','narrowing_percentage','dice_score','confidence','author','summary'];
    const quote = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csv = [fields.join(','), ...reports.map(report => fields.map(field => quote(report[field])).join(','))].join('\r\n');
    exportFile(csv, 'text/csv;charset=utf-8', 'artery-analysis-reports.csv');
  };
  const handlePrintPdf = (report) => {
    const safe = value => String(value ?? 'Not available').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    const analysis = report.analysis || {};
    const candidates = Array.isArray(analysis.candidate_regions) ? analysis.candidate_regions : [];
    const candidateRows = candidates.length
      ? candidates.map(candidate => `<tr><td>${safe(candidate.candidate_id)}</td><td>${candidate.estimated_narrowing_percent == null ? 'Not available' : `${safe(candidate.estimated_narrowing_percent)}%`}</td><td>${safe(candidate.pipeline_status || 'Research candidate')}</td></tr>`).join('')
      : '<tr><td colspan="3">No candidate region recorded. This does not exclude stenosis.</td></tr>';
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) return;
    printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${safe(report.id)} report</title><style>body{font:14px Arial,sans-serif;color:#172033;margin:36px;line-height:1.55}h1,h2{color:#075985}table{border-collapse:collapse;width:100%;margin:16px 0}td,th{border:1px solid #dbe3ee;padding:9px;text-align:left}td:first-child{font-weight:bold;width:35%;background:#f8fafc}.notice{margin-top:32px;color:#64748b;font-size:12px}</style></head><body><h1>Artery Analysis Report</h1><p>Infosys Healthcare &amp; Life Sciences</p><table><tr><td>Report ID</td><td>${safe(report.id)}</td></tr><tr><td>Case / patient</td><td>${safe(report.caseId)} / ${safe(report.patientId)}</td></tr><tr><td>Date / modality</td><td>${safe(report.date)} · ${safe(report.modality)}</td></tr><tr><td>Region</td><td>${safe(report.region)}</td></tr><tr><td>Status / author</td><td>${safe(report.status)} · ${safe(report.author)}</td></tr><tr><td>Severity</td><td>${safe(report.severity)}</td></tr><tr><td>Estimated narrowing</td><td>${report.narrowing_percentage == null ? 'Not available' : `${safe(report.narrowing_percentage)}%`}</td></tr><tr><td>Reference-mask Dice</td><td>${report.dice_score == null ? 'Not available' : `${(report.dice_score*100).toFixed(1)}%`}</td></tr><tr><td>Analysis model</td><td>${safe(analysis.model_version)}</td></tr><tr><td>Image quality</td><td>${safe(analysis.quality_check?.status)}</td></tr><tr><td>Summary</td><td>${safe(report.summary)}</td></tr></table><h2>Proposed candidate regions</h2><table><thead><tr><th>Candidate</th><th>Pixel-based estimate</th><th>Interpretation</th></tr></thead><tbody>${candidateRows}</tbody></table><p class="notice">${safe(analysis.limitations || 'Research decision-support only. This report is not an autonomous diagnosis; review by a qualified clinician is required.')} Choose Save as PDF in the print dialog to save a copy.</p><script>window.onload=()=>window.print()</script></body></html>`);
    printWindow.document.close();
    setDownloadSuccessToast('Print dialog opened. Choose Save as PDF to export the report.');
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
            Reports are created after successful analysis; clinician review is required before patient release.
          </p>
        </div>
        <div className="flex gap-2"><Button size="sm" variant="outline" icon={FileSpreadsheet} onClick={exportCsv}>Export CSV</Button><Button size="sm" variant="outline" icon={FileJson} onClick={exportJson}>Export JSON</Button></div>
      </div>

      {loadError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{loadError}</div>}

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
                <th className="py-3 px-4">Analysis</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <LoadingSpinner size="md" label="Loading reports..." />
                  </td>
                </tr>
              ) : filteredReports.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-500 text-xs">
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
                    <td className="py-3.5 px-4 text-xs text-slate-600">
                      {report.analysis
                        ? `${report.analysis.candidate_regions?.length || 0} candidate(s)`
                        : 'Report summary'}
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
                        <Button size="sm" variant="ghost" icon={Download} onClick={() => exportReportJson(report)}>
                          JSON
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          icon={Printer}
                          onClick={() => handlePrintPdf(report)}
                        >
                          PDF / Print
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
                icon={Printer}
                onClick={() => handlePrintPdf(selectedReport)}
              >
                Export PDF
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

            {selectedReport.analysis && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-slate-200 p-3"><span className="block text-[10px] uppercase text-slate-400">Analysis model</span><span className="text-sm font-medium text-slate-800">{selectedReport.analysis.model_version || 'Not available'}</span></div>
                  <div className="rounded-lg border border-slate-200 p-3"><span className="block text-[10px] uppercase text-slate-400">Pipeline status</span><span className="text-sm font-medium text-slate-800">{selectedReport.analysis.pipeline_status || 'Not available'}</span></div>
                  <div className="rounded-lg border border-slate-200 p-3"><span className="block text-[10px] uppercase text-slate-400">Image quality</span><span className="text-sm font-medium text-slate-800">{selectedReport.analysis.quality_check?.status || 'Not available'}</span></div>
                  <div className="rounded-lg border border-slate-200 p-3"><span className="block text-[10px] uppercase text-slate-400">Reference / minimum diameter</span><span className="text-sm font-medium text-slate-800">{selectedReport.analysis.reference_diameter_mm == null || selectedReport.analysis.minimum_diameter_mm == null ? 'Not available' : `${selectedReport.analysis.reference_diameter_mm} / ${selectedReport.analysis.minimum_diameter_mm} mm`}</span></div>
                </div>
                <div>
                  <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-700">Proposed candidate regions</h4>
                  {selectedReport.analysis.candidate_regions?.length ? (
                    <div className="space-y-2">{selectedReport.analysis.candidate_regions.map((candidate, index) => (
                      <div key={candidate.candidate_id || index} className="flex flex-wrap justify-between gap-2 rounded-lg border border-slate-200 p-3 text-xs">
                        <span className="font-semibold text-slate-800">{candidate.candidate_id || `Candidate ${index + 1}`}</span>
                        <span className="text-slate-600">{candidate.estimated_narrowing_percent == null ? 'Estimate unavailable' : `Pixel-based estimate: ${candidate.estimated_narrowing_percent}%`}</span>
                      </div>
                    ))}</div>
                  ) : <p className="rounded-lg border border-slate-200 p-3 text-xs text-slate-500">No candidate region was recorded. This does not exclude stenosis.</p>}
                </div>
              </>
            )}

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <span className="font-semibold">Research notice: </span>
              {selectedReport.analysis?.limitations || 'Report output requires clinician review and is not an autonomous diagnosis.'}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
