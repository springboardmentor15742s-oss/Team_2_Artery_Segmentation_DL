import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Play,
  RefreshCw,
  Cpu,
  Layers,
  Lock,
  Zap,
  Terminal,
  Activity,
  Award,
  Download
} from 'lucide-react';
import Card from '../components/Card/Card';
import Button from '../components/Button/Button';
import LoadingSpinner from '../components/Loading/LoadingSpinner';
import { runVerificationSuite } from '../services/api';

export default function TestingVerification() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('all');

  const executeSuite = async () => {
    setRunning(true);
    setError('');
    try {
      const data = await runVerificationSuite();
      setResult(data);
    } catch (err) {
      setError(err.message || 'Verification suite execution failed.');
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    executeSuite();
  }, []);

  // Parse structured logs from output text
  const parseLogs = (rawText) => {
    if (!rawText) return [];
    const lines = rawText.split('\n');
    const items = [];
    for (const line of lines) {
      const match = line.match(/^\[(PASS|FAIL)\]\s*\|\s*(\w+)\s*\|\s*(.*?)\s*\|\s*(.*)$/);
      if (match) {
        items.push({
          status: match[1],
          suite: match[2].trim(),
          name: match[3].trim(),
          details: match[4].trim(),
        });
      }
    }
    return items;
  };

  const testItems = parseLogs(result?.output);

  const suiteStats = {
    e2e: testItems.filter(i => i.suite.toUpperCase() === 'E2E'),
    api: testItems.filter(i => i.suite.toUpperCase() === 'API'),
    security: testItems.filter(i => i.suite.toUpperCase() === 'SECURITY'),
    perf: testItems.filter(i => i.suite.toUpperCase() === 'PERF'),
  };
  const passedCount = testItems.filter(item => item.status === 'PASS').length;
  const failedCount = testItems.filter(item => item.status === 'FAIL').length;
  const totalCount = testItems.length;
  const suiteFinished = Boolean(result && result.success === true && totalCount > 0 && failedCount === 0);


  const filteredItems = activeTab === 'all'
    ? testItems
    : testItems.filter(i => i.suite.toLowerCase() === activeTab.toLowerCase());

  const downloadReportJson = () => {
    if (!result) return;
    const payload = JSON.stringify({
      title: "Infosys Artery AI Enterprise Quality & Verification Report",
      timestamp: result.timestamp,
      passed: result.success,
      totalTests: testItems.length,
      passedCount: testItems.filter(i => i.status === 'PASS').length,
      failedCount: testItems.filter(i => i.status === 'FAIL').length,
      tests: testItems,
      fullConsoleOutput: result.output
    }, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `artery-ai-verification-audit-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-sky-700">
            Infosys Enterprise Quality Assurance
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">
            System Verification & Testing Suites
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Automated compliance, API contract validation, end-to-end clinical workflow, security RBAC, and high-concurrency performance benchmarks.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            icon={Download}
            onClick={downloadReportJson}
            disabled={!result}
          >
            Export Audit JSON
          </Button>
          <Button
            size="sm"
            variant="primary"
            icon={running ? RefreshCw : Play}
            onClick={executeSuite}
            disabled={running}
            className={running ? 'animate-pulse' : ''}
          >
            {running ? 'Running Test Suites…' : 'Run Full Verification'}
          </Button>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <strong>Verification Error:</strong> {error}
        </div>
      )}

      {/* 4 Pillars Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* End-to-End Suite Card */}
        <div
          onClick={() => setActiveTab(activeTab === 'e2e' ? 'all' : 'e2e')}
          className={`cursor-pointer rounded-xl border p-4 transition-all ${
            activeTab === 'e2e'
              ? 'border-sky-500 bg-sky-50/50 shadow-xs'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="p-2 rounded-lg bg-sky-100 text-sky-800">
              <Layers size={18} />
            </span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${suiteStats.e2e.length ? 'text-slate-700 bg-slate-100' : 'text-slate-500 bg-slate-50'}`}>
              {suiteStats.e2e.filter(i => i.status === 'PASS').length}/{suiteStats.e2e.length || '—'} {suiteStats.e2e.length ? 'passed' : 'not run'}
            </span>
          </div>
          <h3 className="font-bold text-slate-900 mt-3 text-sm">End-to-End Testing</h3>
          <p className="text-xs text-slate-500 mt-1">
            Case ingestion, scan upload, U-Net inference, auto-report creation & appointment booking.
          </p>
        </div>

        {/* API Suite Card */}
        <div
          onClick={() => setActiveTab(activeTab === 'api' ? 'all' : 'api')}
          className={`cursor-pointer rounded-xl border p-4 transition-all ${
            activeTab === 'api'
              ? 'border-indigo-500 bg-indigo-50/50 shadow-xs'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="p-2 rounded-lg bg-indigo-100 text-indigo-800">
              <Cpu size={18} />
            </span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${suiteStats.api.length ? 'text-slate-700 bg-slate-100' : 'text-slate-500 bg-slate-50'}`}>
              {suiteStats.api.filter(i => i.status === 'PASS').length}/{suiteStats.api.length || '—'} {suiteStats.api.length ? 'passed' : 'not run'}
            </span>
          </div>
          <h3 className="font-bold text-slate-900 mt-3 text-sm">API Contract Testing</h3>
          <p className="text-xs text-slate-500 mt-1">
            Validation of Health, Cases, Reports, Model Registry, Features, and Clinician endpoints.
          </p>
        </div>

        {/* Security Suite Card */}
        <div
          onClick={() => setActiveTab(activeTab === 'security' ? 'all' : 'security')}
          className={`cursor-pointer rounded-xl border p-4 transition-all ${
            activeTab === 'security'
              ? 'border-violet-500 bg-violet-50/50 shadow-xs'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="p-2 rounded-lg bg-violet-100 text-violet-800">
              <Lock size={18} />
            </span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${suiteStats.security.length ? 'text-slate-700 bg-slate-100' : 'text-slate-500 bg-slate-50'}`}>
              {suiteStats.security.filter(i => i.status === 'PASS').length}/{suiteStats.security.length || '—'} {suiteStats.security.length ? 'passed' : 'not run'}
            </span>
          </div>
          <h3 className="font-bold text-slate-900 mt-3 text-sm">Security & Access Control</h3>
          <p className="text-xs text-slate-500 mt-1">
            RBAC enforcement, DICOM image isolation, SQL injection prevention & PBKDF2 salting.
          </p>
        </div>

        {/* Performance Suite Card */}
        <div
          onClick={() => setActiveTab(activeTab === 'perf' ? 'all' : 'perf')}
          className={`cursor-pointer rounded-xl border p-4 transition-all ${
            activeTab === 'perf'
              ? 'border-amber-500 bg-amber-50/50 shadow-xs'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="p-2 rounded-lg bg-amber-100 text-amber-800">
              <Zap size={18} />
            </span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${suiteStats.perf.length ? 'text-slate-700 bg-slate-100' : 'text-slate-500 bg-slate-50'}`}>
              {suiteStats.perf.filter(i => i.status === 'PASS').length}/{suiteStats.perf.length || '—'} {suiteStats.perf.length ? 'passed' : 'not run'}
            </span>
          </div>
          <h3 className="font-bold text-slate-900 mt-3 text-sm">Performance & Load</h3>
          <p className="text-xs text-slate-500 mt-1">
            Sub-millisecond endpoints, 10ms registry queries & 30-threaded concurrent throughput.
          </p>
        </div>
      </div>

      {/* Audit Banner */}
      <div className={`rounded-xl border p-4 flex flex-wrap items-center justify-between gap-3 ${suiteFinished ? 'border-emerald-200 bg-emerald-50/70' : failedCount ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-slate-50'}`}>
        <div className="flex items-center gap-3">
          {suiteFinished ? <Award className="text-emerald-700 w-6 h-6 shrink-0" /> : failedCount ? <XCircle className="text-rose-700 w-6 h-6 shrink-0" /> : <Activity className="text-slate-500 w-6 h-6 shrink-0" />}
          <div>
            <h4 className="text-sm font-bold text-slate-900">
              System verification: {running ? 'RUNNING' : suiteFinished ? `PASSED (${passedCount}/${totalCount})` : result ? `FAILED OR INCOMPLETE (${passedCount}/${totalCount} passed${failedCount ? `, ${failedCount} failed` : ''})` : 'NOT YET VERIFIED'}
            </h4>
            <p className="text-xs text-slate-600">{result?.timestamp ? `Last execution ${new Date(result.timestamp).toLocaleString()}.` : 'Run the verification suite to see measured test results.'} Counts reflect parsed output only.</p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs font-mono text-slate-700"><span>{passedCount} passed</span><span>{failedCount} failed</span><span>{totalCount} total</span></div>
      </div>

      {/* Filter Tabs & Test Table Card */}
      <Card
        title="Test Execution Matrix"
        subtitle={`Viewing ${filteredItems.length} test assertions (${activeTab.toUpperCase()})`}
        action={
          <div className="flex gap-1 bg-slate-100 p-0.5 rounded-lg text-xs">
            {['all', 'e2e', 'api', 'security', 'perf'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                  activeTab === tab
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab === 'all' ? `All (${totalCount})` : tab.toUpperCase()}
              </button>
            ))}
          </div>
        }
        noPadding
      >
        {running ? (
          <div className="py-16 text-center">
            <LoadingSpinner size="lg" label="Executing test harness and security checks in background..." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4 w-24">Status</th>
                  <th className="py-3 px-4 w-28">Category</th>
                  <th className="py-3 px-4">Test Assertion</th>
                  <th className="py-3 px-4">Execution Details / Output Telemetry</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4">
                      {item.status === 'PASS' ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                          <CheckCircle2 size={13} className="text-emerald-600" /> PASS
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full">
                          <XCircle size={13} className="text-rose-600" /> FAIL
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-slate-700">
                      {item.suite}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-900">
                      {item.name}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">
                      {item.details || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Raw Execution Console Output */}
      {result?.output && (
        <Card
          title="Automated Test Harness Console Log"
          subtitle="Real-time standard output from backend test execution runner"
          icon={Terminal}
        >
          <pre className="max-h-72 overflow-auto rounded-xl bg-slate-950 p-4 text-xs font-mono text-slate-200 leading-relaxed">
            {result.output}
          </pre>
        </Card>
      )}
    </div>
  );
}
