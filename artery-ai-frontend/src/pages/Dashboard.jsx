import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FolderKanban,
  Clock,
  CheckCircle2,
  AlertTriangle,
  UploadCloud,
  Plus,
  ArrowRight,
  TrendingUp,
  Activity,
  FileText
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';

import Card from '../components/Card/Card';
import Button from '../components/Button/Button';
import StatusBadge from '../components/StatusBadge/StatusBadge';
import LoadingSpinner from '../components/Loading/LoadingSpinner';
import { getCases } from '../services/api';

// Register Chart.js elements
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

export default function Dashboard() {
  const navigate = useNavigate();
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        setLoading(true);
        const res = await getCases();
        setCases(res.cases || []);
      } catch (err) {
        console.error('Failed to load dashboard data', err);
      } finally {
        setLoading(false);
      }
    }
    fetchDashboardData();
  }, []);

  // Compute Statistics
  const totalCases = cases.length;
  const completedCases = cases.filter((c) => c.status === 'Completed').length;
  const pendingCases = cases.filter((c) => c.status === 'Pending').length;
  const inProgressCases = cases.filter((c) => c.status === 'In Progress').length;
  const reviewCases = cases.filter((c) => c.status === 'Review Required' || c.status === 'Failed').length;

  // Modality Breakdown for Doughnut Chart
  const modalityCounts = cases.reduce((acc, c) => {
    const key = c.modality.split(' ')[0]; // CTA, MRA, DSA
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const doughnutData = {
    labels: Object.keys(modalityCounts),
    datasets: [
      {
        data: Object.values(modalityCounts),
        backgroundColor: [
          '#0284c7', // sky 600
          '#0d9488', // teal 600
          '#6366f1', // indigo 500
          '#f59e0b', // amber 500
        ],
        borderWidth: 2,
        borderColor: '#ffffff',
      },
    ],
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          boxWidth: 12,
          padding: 14,
          font: { size: 11, family: 'Inter, sans-serif' },
        },
      },
    },
    cutout: '70%',
  };

  // Anatomical Region Distribution for Bar Chart
  const regionCounts = cases.reduce((acc, c) => {
    const key = c.anatomicalRegion.split(' ')[0]; // Carotid, Coronary, Cerebral, etc.
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const barData = {
    labels: Object.keys(regionCounts),
    datasets: [
      {
        label: 'Cases by Region',
        data: Object.values(regionCounts),
        backgroundColor: '#0284c7',
        borderRadius: 6,
      },
    ],
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { stepSize: 1, font: { size: 10 } },
        grid: { color: '#f1f5f9' },
      },
      x: {
        ticks: { font: { size: 11 } },
        grid: { display: false },
      },
    },
  };

  const recentCases = [...cases].slice(0, 5);

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-3">
        <LoadingSpinner size="lg" />
        <p className="text-sm text-slate-500 font-medium">Loading clinical metrics...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Welcome / Action Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-medical-900 rounded-2xl p-6 text-white shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-medical-500/20 text-medical-200 border border-medical-400/30 text-xs font-medium mb-2">
            <Activity className="w-3.5 h-3.5" />
            <span>Clinical Diagnostic Workspace</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
            Medical Imaging & Arterial Analysis
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-xl leading-relaxed">
            Manage patient angiograms, track scan uploads, and prepare clinical case studies.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <Link to="/cases/new">
            <Button variant="primary" icon={Plus}>
              New Case
            </Button>
          </Link>
          <Link to="/upload">
            <Button variant="secondary" icon={UploadCloud}>
              Upload Scan
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Cases */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Cases
            </span>
            <div className="w-9 h-9 rounded-lg bg-medical-50 text-medical-600 flex items-center justify-center">
              <FolderKanban className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-slate-900 font-mono">
              {totalCases}
            </span>
            <span className="text-xs text-slate-400">active records</span>
          </div>
          <div className="mt-2 text-xs text-slate-500 flex items-center gap-1">
            <span className="text-emerald-600 font-semibold">100%</span> tracked in registry
          </div>
        </div>

        {/* Pending Analysis */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Pending Analysis
            </span>
            <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-amber-600 font-mono">
              {pendingCases}
            </span>
            <span className="text-xs text-slate-400">in queue</span>
          </div>
          <div className="mt-2 text-xs text-slate-500">
            Awaiting scan processing
          </div>
        </div>

        {/* Completed Analysis */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Completed Analysis
            </span>
            <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-emerald-600 font-mono">
              {completedCases}
            </span>
            <span className="text-xs text-slate-400">cases</span>
          </div>
          <div className="mt-2 text-xs text-slate-500">
            Reports finalized
          </div>
        </div>

        {/* In Progress / Review */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              In Progress / Review
            </span>
            <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-bold text-indigo-600 font-mono">
              {inProgressCases + reviewCases}
            </span>
            <span className="text-xs text-slate-400">cases</span>
          </div>
          <div className="mt-2 text-xs text-slate-500">
            Active preparation & review
          </div>
        </div>
      </div>

      {/* Chart Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Modality Doughnut Chart */}
        <Card
          title="Imaging Modality Distribution"
          subtitle="Breakdown of registered scan modalities"
          className="lg:col-span-1"
        >
          <div className="h-64 flex items-center justify-center">
            {Object.keys(modalityCounts).length > 0 ? (
              <Doughnut data={doughnutData} options={doughnutOptions} />
            ) : (
              <p className="text-xs text-slate-400">No modality data available</p>
            )}
          </div>
        </Card>

        {/* Anatomical Region Distribution */}
        <Card
          title="Cases by Anatomical Region"
          subtitle="Vascular territories under diagnostic observation"
          className="lg:col-span-2"
        >
          <div className="h-64">
            {Object.keys(regionCounts).length > 0 ? (
              <Bar data={barData} options={barOptions} />
            ) : (
              <p className="text-xs text-slate-400 flex items-center justify-center h-full">No anatomical data available</p>
            )}
          </div>
        </Card>
      </div>

      {/* Recent Cases Table Preview */}
      <Card
        title="Recent Cases"
        subtitle="Recently registered clinical records"
        action={
          <Link
            to="/cases"
            className="inline-flex items-center gap-1 text-xs font-semibold text-medical-600 hover:text-medical-700"
          >
            <span>View All Cases</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        }
        noPadding
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold uppercase tracking-wider">
                <th className="py-3 px-4">Case ID</th>
                <th className="py-3 px-4">Patient ID</th>
                <th className="py-3 px-4">Modality</th>
                <th className="py-3 px-4">Region</th>
                <th className="py-3 px-4">Scan Date</th>
                <th className="py-3 px-4">Analysis Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentCases.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3 px-4 font-mono font-medium text-slate-900">
                    {c.id}
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-600">
                    {c.patientId}
                  </td>
                  <td className="py-3 px-4 text-slate-700 font-medium">
                    {c.modality.split(' ')[0]}
                  </td>
                  <td className="py-3 px-4 text-slate-600">
                    {c.anatomicalRegion}
                  </td>
                  <td className="py-3 px-4 text-slate-500">
                    {c.scanDate}
                  </td>
                  <td className="py-3 px-4">
                    <StatusBadge status={c.status} size="xs" />
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => navigate(`/cases/${c.id}`)}
                      className="text-xs text-medical-600 hover:text-medical-800 font-medium hover:underline"
                    >
                      View Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
