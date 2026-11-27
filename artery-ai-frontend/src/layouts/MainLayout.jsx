import React, { useState, useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import Sidebar from '../components/Sidebar/Sidebar';
import Header from '../components/Header/Header';
import { getFeatureAccess, getProfile, getNotifications, getStoredUser, isAuthenticated } from '../services/api';
import AssistantWidget from '../components/Assistant/AssistantWidget';
import { useLanguage } from '../context/LanguageContext';

const ROUTE_TITLES = {
  '/dashboard': 'Dashboard',
  '/patients': 'Patients',
  '/model-registry': 'Model Registry',
  '/activity-logs': 'Activity Logs',
  '/medical-records': 'Medical Records',
  '/cases': 'Case Management',
  '/xrays': 'X-ray Library',
  '/cases/new': 'Create New Case',
  '/upload': 'Medical Image Upload',
  '/reports': 'Medical Reports',
  '/patient-medical-reports': 'Medical Reports',
  '/patient-history': 'Report History Comparison',
  '/case-review': 'Doctor Review & Approval',
  '/ai-analysis': 'AI Angiography Analysis',
  '/stenosis-visualization': 'Stenosis Visualization',
  '/explainable-ai': 'Explainable AI',
  '/medicine-catalogue': 'Medicine Catalogue',
  '/training': 'Training & Testing',
  '/stenosis-leaderboard': 'Stenosis Classifier Leaderboard',
  '/segmentation-results': 'Vessel Segmentation Results',
  '/appointments': 'My Appointments',
  '/messages': 'Messages',
  '/doctors': 'Available Doctors',
  '/patient-home': 'Patient Home',
  '/notifications': 'Clinical Notifications',
  '/profile': 'User Profile & Settings',
};

export default function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState(() => getStoredUser());
  const [unreadCount, setUnreadCount] = useState(0);
  const [featureManagementAllowed, setFeatureManagementAllowed] = useState(false);
  const location = useLocation();
  const { t } = useLanguage();

  useEffect(() => {
    if (!isAuthenticated()) return;
    // Load profile and notification badge
    async function loadInitialData() {
      try {
        const u = await getProfile();
        setUser(u);

        const [notifs, featureAccess] = await Promise.all([
          getNotifications(),
          getFeatureAccess().catch(() => ({ canManage: false })),
        ]);
        setUnreadCount(notifs.filter((n) => !n.read).length);
        setFeatureManagementAllowed(featureAccess.canManage === true);
      } catch (err) {
        console.error('Failed to load initial layout data', err);
      }
    }
    loadInitialData();
  }, [location.pathname]);

  if (!isAuthenticated()) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (user?.role?.toLowerCase() === 'patient' && !['/dashboard','/patient-home','/doctors','/appointments','/messages','/profile','/notifications','/patient-medical-reports','/patient-history'].includes(location.pathname)) {
    return <Navigate to="/patient-home" replace />;
  }

  // Compute page title (including dynamic /cases/:id)
  const translatedKeys = { '/dashboard': 'dashboard', '/cases': 'cases', '/xrays': 'xrays', '/reports': 'reports', '/training': 'training', '/notifications': 'notifications', '/profile': 'profile' };
  let pageTitle = translatedKeys[location.pathname] ? t(translatedKeys[location.pathname]) : ROUTE_TITLES[location.pathname];
  if (!pageTitle) {
    if (location.pathname.startsWith('/explainable-ai/')) {
      pageTitle = ROUTE_TITLES['/explainable-ai'];
    } else if (location.pathname.startsWith('/viewer/')) {
      pageTitle = 'Coronary Analysis Viewer';
    } else if (location.pathname.startsWith('/cases/')) {
      pageTitle = 'Case Details';
    } else {
      pageTitle = 'Medical Image Analysis';
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <div className="flex min-h-screen flex-col">
        <Header
          onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
          title={pageTitle}
          user={user}
          unreadCount={unreadCount}
        />
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          unreadCount={unreadCount}
          user={user}
          featureManagementAllowed={featureManagementAllowed}
        />

        <main className={`flex-1 w-full mx-auto ${location.pathname.startsWith('/viewer/') ? 'max-w-none p-0' : 'max-w-7xl p-4 sm:p-6 lg:p-8'}`}>
          <Outlet context={{ user, setUser, unreadCount, setUnreadCount, featureManagementAllowed }} />
        </main>
      </div>
      <AssistantWidget />
    </div>
  );
}
