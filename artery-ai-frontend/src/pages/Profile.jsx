import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User,
  Shield,
  KeyRound,
  LogOut,
  Building,
  CheckCircle2,
  AlertCircle,
  FileCheck
} from 'lucide-react';
import Card from '../components/Card/Card';
import Button from '../components/Button/Button';
import Input from '../components/Input/Input';
import Select from '../components/Select/Select';
import LoadingSpinner from '../components/Loading/LoadingSpinner';
import { getProfile, updateProfile, changePassword, logout } from '../services/api';
import { ROLES } from '../data/mockData';

export default function Profile() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Edit Profile Form State
  const [profileForm, setProfileForm] = useState({
    name: '',
    email: '',
    role: '',
    department: '',
    institution: '',
    phone: '',
    licenseNumber: '',
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccessMsg, setProfileSuccessMsg] = useState(null);

  // Change Password Form State
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordSuccessMsg, setPasswordSuccessMsg] = useState(null);
  const [passwordErrorMsg, setPasswordErrorMsg] = useState(null);

  useEffect(() => {
    async function loadUserData() {
      try {
        setLoading(true);
        const data = await getProfile();
        setUser(data);
        setProfileForm({
          name: data.name || '',
          email: data.email || '',
          role: data.role || 'Radiologist / Clinician',
          department: data.department || '',
          institution: data.institution || '',
          phone: data.phone || '',
          licenseNumber: data.licenseNumber || '',
        });
      } catch (err) {
        console.error('Failed to load profile', err);
      } finally {
        setLoading(false);
      }
    }
    loadUserData();
  }, []);

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileSuccessMsg(null);
    try {
      const updated = await updateProfile(profileForm);
      setUser(updated);
      setProfileSuccessMsg('Clinical profile details saved successfully.');
      setTimeout(() => setProfileSuccessMsg(null), 3000);
    } catch (err) {
      alert(err.message || 'Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPasswordErrorMsg(null);
    setPasswordSuccessMsg(null);

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordErrorMsg('New password and confirmation do not match.');
      return;
    }

    if (passwordForm.newPassword.length < 8) {
      setPasswordErrorMsg('New password must be at least 8 characters long.');
      return;
    }

    setChangingPassword(true);
    try {
      await changePassword(passwordForm);
      setPasswordSuccessMsg('Password updated successfully.');
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
      setTimeout(() => setPasswordSuccessMsg(null), 3000);
    } catch (err) {
      setPasswordErrorMsg(err.message || 'Failed to change password.');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-3">
        <LoadingSpinner size="lg" />
        <p className="text-sm text-slate-500 font-medium">Loading clinical profile...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            User Profile & Clinical Credentials
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Manage your medical practitioner information, institutional affiliation, and account security
          </p>
        </div>

        <Button
          variant="danger"
          size="sm"
          icon={LogOut}
          onClick={handleLogout}
        >
          Sign Out
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Profile Card Overview */}
        <div className="lg:col-span-1 space-y-6">
          <Card>
            <div className="flex flex-col items-center text-center p-2">
              <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-medical-600 to-sky-400 text-white flex items-center justify-center text-2xl font-bold shadow-md mb-3">
                {user?.name
                  ? user.name
                      .split(' ')
                      .map((p) => p[0])
                      .slice(0, 2)
                      .join('')
                  : 'MD'}
              </div>

              <h3 className="text-base font-bold text-slate-900">{user?.name}</h3>
              <p className="text-xs text-medical-700 font-medium mt-0.5 bg-medical-50 px-2.5 py-1 rounded-full border border-medical-200">
                {user?.role}
              </p>

              <div className="w-full mt-5 pt-4 border-t border-slate-100 text-left space-y-2.5 text-xs text-slate-600">
                <div>
                  <span className="text-slate-400 block">Email:</span>
                  <span className="font-medium text-slate-800 break-all">{user?.email}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Department:</span>
                  <span className="font-medium text-slate-800">{user?.department}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Institution:</span>
                  <span className="font-medium text-slate-800">{user?.institution}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">License / NPI:</span>
                  <span className="font-mono font-medium text-slate-800">{user?.licenseNumber}</span>
                </div>
              </div>
            </div>
          </Card>

          <Card title="Clinical Compliance" icon={Shield}>
            <div className="text-xs text-slate-600 space-y-2">
              <div className="flex items-center gap-2 text-emerald-700">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>HIPAA Diagnostic Certified</span>
              </div>
              <div className="flex items-center gap-2 text-emerald-700">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Audit Logging Enabled</span>
              </div>
              <div className="flex items-center gap-2 text-emerald-700">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Multi-Factor Verification Active</span>
              </div>
            </div>
          </Card>
        </div>

        {/* Right Column: Edit Profile & Change Password */}
        <div className="lg:col-span-2 space-y-6">
          {/* Edit Profile Information */}
          <Card
            title="Profile Information"
            subtitle="Update personal and professional contact details"
            icon={User}
          >
            {profileSuccessMsg && (
              <div className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>{profileSuccessMsg}</span>
              </div>
            )}

            <form onSubmit={handleProfileSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Full Name"
                  id="profile-name"
                  value={profileForm.name}
                  onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                  required
                />

                <Input
                  label="Institutional Email"
                  id="profile-email"
                  type="email"
                  value={profileForm.email}
                  onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                  required
                />

                <Select
                  label="Professional Role"
                  id="profile-role"
                  value={profileForm.role}
                  onChange={(e) => setProfileForm({ ...profileForm, role: e.target.value })}
                  options={ROLES}
                  required
                />

                <Input
                  label="Medical License / NPI Number"
                  id="profile-license"
                  value={profileForm.licenseNumber}
                  onChange={(e) => setProfileForm({ ...profileForm, licenseNumber: e.target.value })}
                  helperText="Required for clinical diagnostic sign-off"
                />

                <Input
                  label="Department"
                  id="profile-dept"
                  value={profileForm.department}
                  onChange={(e) => setProfileForm({ ...profileForm, department: e.target.value })}
                />

                <Input
                  label="Hospital / Institution"
                  id="profile-inst"
                  value={profileForm.institution}
                  onChange={(e) => setProfileForm({ ...profileForm, institution: e.target.value })}
                />
              </div>

              <div className="pt-2 flex justify-end">
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  loading={savingProfile}
                >
                  Save Profile Changes
                </Button>
              </div>
            </form>
          </Card>

          {/* Change Password Card */}
          <Card
            title="Change Password"
            subtitle="Update your institutional authentication credential"
            icon={KeyRound}
          >
            {passwordSuccessMsg && (
              <div className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>{passwordSuccessMsg}</span>
              </div>
            )}

            {passwordErrorMsg && (
              <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600" />
                <span>{passwordErrorMsg}</span>
              </div>
            )}

            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <Input
                label="Current Password"
                id="current-password"
                type="password"
                placeholder="••••••••"
                value={passwordForm.currentPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                required
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="New Password"
                  id="new-password"
                  type="password"
                  placeholder="Min 8 characters"
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                  required
                />

                <Input
                  label="Confirm New Password"
                  id="confirm-new-password"
                  type="password"
                  placeholder="Re-enter new password"
                  value={passwordForm.confirmPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                  required
                />
              </div>

              <div className="pt-2 flex justify-end">
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  loading={changingPassword}
                >
                  Update Password
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
