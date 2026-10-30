import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Activity, ShieldCheck, Stethoscope } from 'lucide-react';
import Button from '../components/Button/Button';
import Input from '../components/Input/Input';
import { login } from '../services/api';

export default function Login() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: 's.mitchell@hospital.med.org',
    password: 'Password123!',
    rememberMe: true,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState(null);

  const validate = () => {
    const errs = {};
    if (!formData.email) {
      errs.email = 'Medical institution email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      errs.email = 'Please enter a valid email address';
    }

    if (!formData.password) {
      errs.password = 'Password is required';
    } else if (formData.password.length < 6) {
      errs.password = 'Password must be at least 6 characters';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setAuthError(null);

    if (!validate()) return;

    setLoading(true);
    try {
      await login(formData);
      navigate('/dashboard');
    } catch (err) {
      setAuthError(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      {/* Branding Header */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-medical-600 text-white shadow-md mb-3">
          <Activity className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Artery Medical Imaging & Stenosis Analysis
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Clinical Case Management & Diagnostic Portal
        </p>
      </div>

      {/* Main Login Card */}
      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-white py-8 px-6 shadow-sm rounded-2xl border border-slate-200/90 sm:px-10">
          <div className="mb-6 pb-4 border-b border-slate-100">
            <h2 className="text-lg font-semibold text-slate-800">Sign In</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Access patient records, imaging modalities, and analysis status
            </p>
          </div>

          {authError && (
            <div className="mb-5 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <span className="font-semibold">Error:</span> {authError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <Input
              label="Email Address"
              id="login-email"
              type="email"
              placeholder="e.g. physician@hospital.org"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              error={errors.email}
              required
              autoComplete="email"
            />

            <Input
              label="Password"
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              error={errors.password}
              required
              rightIcon={showPassword ? EyeOff : Eye}
              onRightIconClick={() => setShowPassword(!showPassword)}
              autoComplete="current-password"
            />

            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  checked={formData.rememberMe}
                  onChange={(e) => setFormData({ ...formData, rememberMe: e.target.checked })}
                  className="h-4 w-4 text-medical-600 focus:ring-medical-500 border-slate-300 rounded"
                />
                <label htmlFor="remember-me" className="ml-2 block text-xs text-slate-700">
                  Remember me
                </label>
              </div>

              <div className="text-xs">
                <button
                  type="button"
                  onClick={() => alert('Password reset link has been dispatched to your registered institutional email.')}
                  className="font-medium text-medical-600 hover:text-medical-700 hover:underline"
                >
                  Forgot password?
                </button>
              </div>
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                variant="primary"
                fullWidth
                loading={loading}
              >
                Sign In
              </Button>
            </div>
          </form>

          {/* Quick Demo Credentials Helper */}
          <div className="mt-6 pt-4 border-t border-slate-100 bg-slate-50 -mx-6 -mb-8 px-6 py-4 rounded-b-2xl text-[11px] text-slate-500 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-slate-600">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Institutional demo credentials active</span>
            </div>
            <Link to="/register" className="font-semibold text-medical-600 hover:text-medical-700">
              Register New Account →
            </Link>
          </div>
        </div>

        {/* Clinical compliance note */}
        <p className="mt-6 text-center text-xs text-slate-400">
          Compliant with medical diagnostic data security and HIPAA guidelines.
        </p>
      </div>
    </div>
  );
}
