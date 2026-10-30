import React, { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from '../components/Sidebar/Sidebar';
import Header from '../components/Header/Header';
import { getProfile, getNotifications } from '../services/api';

const ROUTE_TITLES = {
  '/dashboard': 'Dashboard',
  '/cases': 'Case Management',
  '/cases/new': 'Create New Case',
  '/upload': 'Medical Image Upload',
  '/reports': 'Medical Reports',
  '/notifications': 'Clinical Notifications',
  '/profile': 'User Profile & Settings',
};

export default function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const location = useLocation();

  useEffect(() => {
    // Load profile and notification badge
    async function loadInitialData() {
      try {
        const u = await getProfile();
        setUser(u);

        const notifs = await getNotifications();
        const unread = notifs.filter((n) => !n.read).length;
        setUnreadCount(unread);
      } catch (err) {
        console.error('Failed to load initial layout data', err);
      }
    }
    loadInitialData();
  }, [location.pathname]);

  // Compute page title (including dynamic /cases/:id)
  let pageTitle = ROUTE_TITLES[location.pathname];
  if (!pageTitle) {
    if (location.pathname.startsWith('/cases/')) {
      pageTitle = 'Case Details';
    } else {
      pageTitle = 'Medical Image Analysis';
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row font-sans">
      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        unreadCount={unreadCount}
      />

      {/* Main Container */}
      <div className="flex-1 lg:pl-64 flex flex-col min-h-screen">
        <Header
          onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
          title={pageTitle}
          user={user}
          unreadCount={unreadCount}
        />

        {/* Content Outlet */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <Outlet context={{ user, setUser, unreadCount, setUnreadCount }} />
        </main>
      </div>
    </div>
  );
}
