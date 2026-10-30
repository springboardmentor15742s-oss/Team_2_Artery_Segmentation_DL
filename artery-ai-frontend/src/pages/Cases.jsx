import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Search,
  Filter,
  Plus,
  Eye,
  UploadCloud,
  Edit2,
  RefreshCw,
  FolderKanban,
  FileText,
  X
} from 'lucide-react';
import Button from '../components/Button/Button';
import Input from '../components/Input/Input';
import Select from '../components/Select/Select';
import Table from '../components/Table/Table';
import StatusBadge from '../components/StatusBadge/StatusBadge';
import Modal from '../components/Modal/Modal';
import { getCases, updateCase } from '../services/api';
import { IMAGING_MODALITIES, ANATOMICAL_REGIONS } from '../data/mockData';

export default function Cases() {
  const navigate = useNavigate();
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [modalityFilter, setModalityFilter] = useState('all');
  const [regionFilter, setRegionFilter] = useState('all');

  // Edit Case Modal State
  const [editingCase, setEditingCase] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [editLoading, setEditLoading] = useState(false);
  const [editSuccess, setEditSuccess] = useState(false);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8;

  const fetchCases = async () => {
    try {
      setLoading(true);
      const res = await getCases();
      setCases(res.cases || []);
    } catch (err) {
      console.error('Failed to load cases', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCases();
  }, []);

  // Filter & Search Logic
  const filteredCases = cases.filter((c) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      c.id.toLowerCase().includes(q) ||
      c.patientId.toLowerCase().includes(q) ||
      c.anatomicalRegion.toLowerCase().includes(q) ||
      c.modality.toLowerCase().includes(q);

    const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
    const matchesModality =
      modalityFilter === 'all' || c.modality.includes(modalityFilter);
    const matchesRegion =
      regionFilter === 'all' || c.anatomicalRegion === regionFilter;

    return matchesSearch && matchesStatus && matchesModality && matchesRegion;
  });

  // Pagination
  const totalPages = Math.ceil(filteredCases.length / pageSize) || 1;
  const paginatedCases = filteredCases.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const handleEditClick = (caseItem, e) => {
    e.stopPropagation();
    setEditingCase(caseItem);
    setEditFormData({
      clinicalNotes: caseItem.clinicalNotes || '',
      medicalHistory: caseItem.medicalHistory || '',
      anatomicalRegion: caseItem.anatomicalRegion || '',
      modality: caseItem.modality || '',
      status: caseItem.status || 'Pending',
    });
    setEditSuccess(false);
  };

  const handleSaveEdit = async () => {
    if (!editingCase) return;
    setEditLoading(true);
    try {
      await updateCase(editingCase.id, editFormData);
      setEditSuccess(true);
      await fetchCases();
      setTimeout(() => {
        setEditingCase(null);
      }, 700);
    } catch (err) {
      alert(err.message || 'Failed to update case');
    } finally {
      setEditLoading(false);
    }
  };

  const columns = [
    {
      header: 'Case ID',
      key: 'id',
      className: 'font-mono font-medium text-slate-900',
      render: (val) => (
        <span className="font-semibold text-medical-700 bg-medical-50/60 px-2 py-0.5 rounded">
          {val}
        </span>
      ),
    },
    {
      header: 'Patient ID',
      key: 'patientId',
      className: 'font-mono text-slate-700 font-medium',
    },
    {
      header: 'Imaging Modality',
      key: 'modality',
      render: (val) => (
        <span className="font-medium text-slate-800">
          {val.split(' ')[0]}
          <span className="text-slate-400 font-normal text-xs ml-1 hidden xl:inline">
            {val.includes('(') ? `(${val.split('(')[1]}` : ''}
          </span>
        </span>
      ),
    },
    {
      header: 'Scan Date',
      key: 'scanDate',
      className: 'text-slate-600 font-mono text-xs',
    },
    {
      header: 'Anatomical Region',
      key: 'anatomicalRegion',
      className: 'text-slate-700',
    },
    {
      header: 'Analysis Status',
      key: 'status',
      render: (val) => <StatusBadge status={val} size="sm" />,
    },
    {
      header: 'Model Version',
      key: 'modelVersion',
      className: 'font-mono text-xs text-slate-500',
      render: (val) => <span className="bg-slate-100 px-1.5 py-0.5 rounded">{val}</span>,
    },
    {
      header: 'Actions',
      key: 'actions',
      align: 'right',
      render: (_, row) => (
        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => navigate(`/cases/${row.id}`)}
            className="p-1.5 rounded-md text-slate-500 hover:text-medical-600 hover:bg-medical-50 transition-colors"
            title="View Case Details"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            onClick={() => navigate(`/upload?caseId=${row.id}`)}
            className="p-1.5 rounded-md text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
            title="Upload Scan"
          >
            <UploadCloud className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => handleEditClick(row, e)}
            className="p-1.5 rounded-md text-slate-500 hover:text-sky-600 hover:bg-sky-50 transition-colors"
            title="Edit Case Record"
          >
            <Edit2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      {/* Page Title & Header Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Case Management
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Review, filter, and inspect registered patient angiograms and analysis states
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="md"
            icon={RefreshCw}
            onClick={fetchCases}
            disabled={loading}
          >
            Refresh
          </Button>
          <Link to="/cases/new">
            <Button variant="primary" size="md" icon={Plus}>
              Create New Case
            </Button>
          </Link>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search input */}
          <div className="lg:col-span-1">
            <Input
              id="case-search"
              placeholder="Search Case ID, Patient ID..."
              leftIcon={Search}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>

          {/* Status filter */}
          <div>
            <Select
              id="filter-status"
              placeholder="All Statuses"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              options={[
                { value: 'all', label: 'All Statuses' },
                { value: 'Completed', label: 'Completed' },
                { value: 'In Progress', label: 'In Progress' },
                { value: 'Pending', label: 'Pending' },
                { value: 'Review Required', label: 'Review Required' },
                { value: 'Failed', label: 'Failed' },
              ]}
            />
          </div>

          {/* Modality filter */}
          <div>
            <Select
              id="filter-modality"
              placeholder="All Modalities"
              value={modalityFilter}
              onChange={(e) => {
                setModalityFilter(e.target.value);
                setCurrentPage(1);
              }}
              options={[
                { value: 'all', label: 'All Modalities' },
                { value: 'CTA', label: 'CTA (Computed Tomography)' },
                { value: 'MRA', label: 'MRA (Magnetic Resonance)' },
                { value: 'DSA', label: 'DSA (Digital Subtraction)' },
                { value: 'X-ray', label: 'X-ray Angiography' },
              ]}
            />
          </div>

          {/* Region filter */}
          <div>
            <Select
              id="filter-region"
              placeholder="All Regions"
              value={regionFilter}
              onChange={(e) => {
                setRegionFilter(e.target.value);
                setCurrentPage(1);
              }}
              options={[
                { value: 'all', label: 'All Anatomical Regions' },
                ...ANATOMICAL_REGIONS.map((r) => ({ value: r, label: r })),
              ]}
            />
          </div>
        </div>

        {/* Active Filter Clear Helper */}
        {(searchQuery || statusFilter !== 'all' || modalityFilter !== 'all' || regionFilter !== 'all') && (
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-500">
            <span>
              Showing {filteredCases.length} of {cases.length} total clinical records
            </span>
            <button
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('all');
                setModalityFilter('all');
                setRegionFilter('all');
                setCurrentPage(1);
              }}
              className="text-medical-600 hover:text-medical-800 font-medium inline-flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" />
              Reset Filters
            </button>
          </div>
        )}
      </div>

      {/* Case Management Table */}
      <Table
        columns={columns}
        data={paginatedCases}
        loading={loading}
        onRowClick={(row) => navigate(`/cases/${row.id}`)}
        emptyMessage="No matching clinical cases found."
        emptyAction={
          <Link to="/cases/new">
            <Button size="sm" variant="outline" icon={Plus}>
              Register New Case
            </Button>
          </Link>
        }
      />

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between bg-white px-4 py-3 rounded-xl border border-slate-200 text-xs text-slate-600">
          <div>
            Page <span className="font-semibold text-slate-900">{currentPage}</span> of{' '}
            <span className="font-semibold text-slate-900">{totalPages}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Edit Case Modal */}
      {editingCase && (
        <Modal
          isOpen={Boolean(editingCase)}
          onClose={() => setEditingCase(null)}
          title={`Edit Clinical Record: ${editingCase.id}`}
          subtitle={`Patient ID: ${editingCase.patientId}`}
          footer={
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingCase(null)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSaveEdit}
                loading={editLoading}
              >
                Save Changes
              </Button>
            </>
          }
        >
          {editSuccess ? (
            <div className="py-8 text-center text-emerald-600">
              <p className="font-semibold text-sm">Case record updated successfully!</p>
            </div>
          ) : (
            <div className="space-y-4">
              <Select
                label="Analysis Status"
                id="edit-status"
                value={editFormData.status}
                onChange={(e) =>
                  setEditFormData({ ...editFormData, status: e.target.value })
                }
                options={[
                  'Pending',
                  'In Progress',
                  'Completed',
                  'Review Required',
                  'Failed',
                ]}
              />

              <Select
                label="Anatomical Region"
                id="edit-region"
                value={editFormData.anatomicalRegion}
                onChange={(e) =>
                  setEditFormData({ ...editFormData, anatomicalRegion: e.target.value })
                }
                options={ANATOMICAL_REGIONS}
              />

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Clinical Notes
                </label>
                <textarea
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:border-medical-500 focus:ring-1 focus:ring-medical-500"
                  value={editFormData.clinicalNotes}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, clinicalNotes: e.target.value })
                  }
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Medical History
                </label>
                <textarea
                  rows={2}
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:border-medical-500 focus:ring-1 focus:ring-medical-500"
                  value={editFormData.medicalHistory}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, medicalHistory: e.target.value })
                  }
                />
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
