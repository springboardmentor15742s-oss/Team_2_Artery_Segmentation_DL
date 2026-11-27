import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import Login from '../pages/Login';
import Register from '../pages/Register';
import Dashboard from '../pages/Dashboard';
import Cases from '../pages/Cases';
import CreateCase from '../pages/CreateCase';
import CaseDetails from '../pages/CaseDetails';
import Upload from '../pages/Upload';
import Reports from '../pages/Reports';
import Notifications from '../pages/Notifications';
import Profile from '../pages/Profile';
import Training from '../pages/Training';
import ModelComparison from '../pages/ModelComparison';
import StenosisLeaderboard from '../pages/StenosisLeaderboard';
import VesselSegmentationResults from '../pages/VesselSegmentationResults';
import Doctors from '../pages/Doctors';
import XrayLibrary from '../pages/XrayLibrary';
import ClinicianDirectory from '../pages/ClinicianDirectory';
import Appointments from '../pages/Appointments';
import PatientHome from '../pages/PatientHome';
import Home from '../pages/Home';
import Messages from '../pages/Messages';
import AnalysisViewer from '../pages/AnalysisViewer';
import DoctorAIAnalysis from '../pages/DoctorAIAnalysis';
import ExplainableAI from '../pages/ExplainableAI';
import PatientMedicalReports from '../pages/PatientMedicalReports';
import MedicineCatalogue from '../pages/MedicineCatalogue';
import Patients from '../pages/Patients';
import ModelRegistry from '../pages/ModelRegistry';
import ActivityLogs from '../pages/ActivityLogs';
import FeatureManagementLayout from '../layouts/FeatureManagementLayout';
import FeatureDashboard from '../pages/FeatureDashboard';
import FeatureFlags from '../pages/FeatureFlags';
import FeatureFlagDetail from '../pages/FeatureFlagDetail';
import FeatureEnvironments from '../pages/FeatureEnvironments';
import FeatureAnalytics from '../pages/FeatureAnalytics';
import FeatureSettings from '../pages/FeatureSettings';
import TestingVerification from '../pages/TestingVerification';
import CaseReview from '../pages/CaseReview';
import PatientHistory from '../pages/PatientHistory';

export default function AppRoutes() {
  return (
    <Routes>
      {/* Public Authentication Routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/patient-login" element={<Login />} />
      <Route path="/patient-access" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/doctor-access" element={<Doctors />} />

      {/* Main Authenticated Application Routes wrapped in MainLayout */}
      <Route element={<MainLayout />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/patient-home" element={<PatientHome />} />
        <Route path="/cases" element={<Cases />} />
        <Route path="/patients" element={<Patients />} />
        <Route path="/medical-records" element={<Cases />} />
        <Route path="/xrays" element={<XrayLibrary />} />
        <Route path="/viewer/:id" element={<AnalysisViewer />} />
        <Route path="/ai-analysis" element={<DoctorAIAnalysis />} />
        <Route path="/stenosis-visualization" element={<DoctorAIAnalysis />} />
        <Route path="/explainable-ai/:id?" element={<ExplainableAI />} />
        <Route path="/patient-medical-reports" element={<PatientMedicalReports />} />
        <Route path="/patient-history" element={<PatientHistory />} />
        <Route path="/case-review" element={<CaseReview />} />
        <Route path="/medicine-catalogue" element={<MedicineCatalogue />} />
        <Route path="/doctors" element={<ClinicianDirectory />} />
        <Route path="/appointments" element={<Appointments />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="/cases/new" element={<CreateCase />} />
        <Route path="/cases/:id" element={<CaseDetails />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/training" element={<Training />} />
        <Route path="/model-comparison" element={<ModelComparison />} />
        <Route path="/stenosis-leaderboard" element={<StenosisLeaderboard />} />
        <Route path="/segmentation-results" element={<VesselSegmentationResults />} />
        <Route path="/model-registry" element={<ModelRegistry />} />
        <Route path="/testing-suite" element={<TestingVerification />} />
        <Route path="/activity-logs" element={<ActivityLogs />} />
        <Route path="/feature-management" element={<FeatureManagementLayout />}>
          <Route index element={<FeatureDashboard />} />
          <Route path="flags" element={<FeatureFlags />} />
          <Route path="flags/:flagKey" element={<FeatureFlagDetail />} />
          <Route path="environments" element={<FeatureEnvironments />} />
          <Route path="analytics" element={<FeatureAnalytics />} />
          <Route path="settings" element={<FeatureSettings />} />
        </Route>
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/profile" element={<Profile />} />
      </Route>

      {/* Public cardiovascular landing page */}
      <Route path="/" element={<Home />} />

      {/* Fallback unknown routes to the public homepage */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
