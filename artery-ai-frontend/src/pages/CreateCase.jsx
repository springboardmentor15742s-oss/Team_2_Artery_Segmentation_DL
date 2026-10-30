import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  FolderPlus,
  User,
  Activity,
  CheckCircle2,
  ArrowLeft,
  AlertCircle
} from 'lucide-react';
import Button from '../components/Button/Button';
import Input from '../components/Input/Input';
import Select from '../components/Select/Select';
import Card from '../components/Card/Card';
import { createCase } from '../services/api';
import { IMAGING_MODALITIES, ANATOMICAL_REGIONS } from '../data/mockData';

const COMMON_RISK_FACTORS = [
  'Hypertension',
  'Diabetes Type 2',
  'Hyperlipidemia',
  'Active Smoker',
  'Former Smoker',
  'Family History CAD',
  'Obesity',
  'Peripheral Vascular Disease',
  'Prior Stroke / TIA',
  'Chronic Kidney Disease'
];

export default function CreateCase() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    // Patient Information
    patientId: '',
    age: '',
    gender: 'Male',
    medicalHistory: '',
    riskFactors: [],
    clinicalNotes: '',

    // Case Information
    caseId: `CAS-2024-${Math.floor(100 + Math.random() * 900)}`,
    modality: IMAGING_MODALITIES[0],
    scanDate: new Date().toISOString().split('T')[0],
    anatomicalRegion: ANATOMICAL_REGIONS[0],
  });

  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState(null);

  const toggleRiskFactor = (rf) => {
    setFormData((prev) => {
      const exists = prev.riskFactors.includes(rf);
      return {
        ...prev,
        riskFactors: exists
          ? prev.riskFactors.filter((item) => item !== rf)
          : [...prev.riskFactors, rf]
      };
    });
  };

  const validate = () => {
    const errs = {};

    if (!formData.patientId.trim()) {
      errs.patientId = 'Patient Identifier is required (e.g. PAT-1002)';
    }

    if (!formData.age) {
      errs.age = 'Patient age is required';
    } else if (Number(formData.age) < 1 || Number(formData.age) > 125) {
      errs.age = 'Please enter a valid age (1-125)';
    }

    if (!formData.caseId.trim()) {
      errs.caseId = 'Case ID is required';
    }

    if (!formData.scanDate) {
      errs.scanDate = 'Scan acquisition date is required';
    }

    if (!formData.modality) {
      errs.modality = 'Imaging modality must be selected';
    }

    if (!formData.anatomicalRegion) {
      errs.anatomicalRegion = 'Anatomical region must be selected';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError(null);

    if (!validate()) return;

    setLoading(true);
    try {
      const created = await createCase(formData);
      // Navigate to the newly created Case Details page per flow
      navigate(`/cases/${created.id}`);
    } catch (err) {
      setServerError(err.message || 'Failed to create case record.');
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top Breadcrumb & Title */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to="/cases"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
            title="Back to Cases"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              Register New Clinical Case
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Enter patient demographics, clinical background, and imaging protocol
            </p>
          </div>
        </div>
      </div>

      {serverError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{serverError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        {/* Section 1: Patient Information */}
        <Card
          title="Patient Information"
          subtitle="Demographics, cardiovascular risk profile, and diagnostic history"
          icon={User}
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input
              label="Patient ID"
              id="patient-id"
              placeholder="e.g. PAT-8492"
              value={formData.patientId}
              onChange={(e) => setFormData({ ...formData, patientId: e.target.value })}
              error={errors.patientId}
              required
            />

            <Input
              label="Age"
              id="patient-age"
              type="number"
              placeholder="e.g. 62"
              value={formData.age}
              onChange={(e) => setFormData({ ...formData, age: e.target.value })}
              error={errors.age}
              required
            />

            <Select
              label="Gender"
              id="patient-gender"
              value={formData.gender}
              onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
              options={['Male', 'Female', 'Other']}
              required
            />
          </div>

          {/* Risk Factors Selection */}
          <div className="mt-5">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Cardiovascular Risk Factors
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {COMMON_RISK_FACTORS.map((rf) => {
                const isSelected = formData.riskFactors.includes(rf);
                return (
                  <button
                    key={rf}
                    type="button"
                    onClick={() => toggleRiskFactor(rf)}
                    className={`text-left text-xs px-3 py-2 rounded-lg border transition-all flex items-center justify-between ${
                      isSelected
                        ? 'bg-medical-50 border-medical-500 text-medical-800 font-medium'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span>{rf}</span>
                    {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-medical-600" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Medical History & Clinical Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5">
            <div>
              <label htmlFor="med-history" className="block text-sm font-medium text-slate-700 mb-1.5">
                Medical History
              </label>
              <textarea
                id="med-history"
                rows={3}
                placeholder="Prior myocardial infarction, stents, surgical interventions, medications..."
                className="w-full rounded-lg border border-slate-300 p-2.5 text-sm placeholder-slate-400 focus:border-medical-500 focus:ring-1 focus:ring-medical-500"
                value={formData.medicalHistory}
                onChange={(e) => setFormData({ ...formData, medicalHistory: e.target.value })}
              />
            </div>

            <div>
              <label htmlFor="clinical-notes" className="block text-sm font-medium text-slate-700 mb-1.5">
                Clinical Notes
              </label>
              <textarea
                id="clinical-notes"
                rows={3}
                placeholder="Presenting symptoms, indications for scan, hemodynamic observation notes..."
                className="w-full rounded-lg border border-slate-300 p-2.5 text-sm placeholder-slate-400 focus:border-medical-500 focus:ring-1 focus:ring-medical-500"
                value={formData.clinicalNotes}
                onChange={(e) => setFormData({ ...formData, clinicalNotes: e.target.value })}
              />
            </div>
          </div>
        </Card>

        {/* Section 2: Case Information */}
        <Card
          title="Case & Acquisition Information"
          subtitle="Imaging modality protocol, anatomical region, and registry identifier"
          icon={Activity}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Case ID"
              id="case-id"
              value={formData.caseId}
              onChange={(e) => setFormData({ ...formData, caseId: e.target.value })}
              error={errors.caseId}
              required
              helperText="Unique institutional case identifier"
            />

            <Input
              label="Scan Acquisition Date"
              id="scan-date"
              type="date"
              value={formData.scanDate}
              onChange={(e) => setFormData({ ...formData, scanDate: e.target.value })}
              error={errors.scanDate}
              required
            />

            <Select
              label="Imaging Modality"
              id="case-modality"
              value={formData.modality}
              onChange={(e) => setFormData({ ...formData, modality: e.target.value })}
              options={IMAGING_MODALITIES}
              error={errors.modality}
              required
            />

            <Select
              label="Anatomical Region"
              id="case-region"
              value={formData.anatomicalRegion}
              onChange={(e) => setFormData({ ...formData, anatomicalRegion: e.target.value })}
              options={ANATOMICAL_REGIONS}
              error={errors.anatomicalRegion}
              required
            />
          </div>
        </Card>

        {/* Form Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/cases')}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={loading}
          >
            Save Case & Proceed
          </Button>
        </div>
      </form>
    </div>
  );
}
