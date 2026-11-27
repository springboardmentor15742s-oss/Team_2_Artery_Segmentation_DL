import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Activity, Eye, EyeOff, ShieldCheck, CheckCircle2 } from 'lucide-react';
import Button from '../components/Button/Button';
import Input from '../components/Input/Input';
import Select from '../components/Select/Select';
import { register } from '../services/api';
import { ROLES } from '../data/mockData';
import { LANGUAGES, useLanguage } from '../context/LanguageContext';

export default function Register() {
  const navigate = useNavigate();
  const { language, setLanguage } = useLanguage();
  const requestedRole = new URLSearchParams(window.location.search).get('role');
  const initialRole = requestedRole && ROLES.includes(requestedRole) ? requestedRole : 'Patient';
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    role: initialRole,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const validate = () => {
    const errs = {};

    if (!formData.fullName.trim()) {
      errs.fullName = 'Full Name is required';
    } else if (formData.fullName.trim().length < 3) {
      errs.fullName = 'Full Name must be at least 3 characters';
    }

    if (!formData.email.trim()) {
      errs.email = 'Email address is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      errs.email = 'Please enter a valid email address';
    }

    if (!formData.password) {
      errs.password = 'Password is required';
    } else if (formData.password.length < 8) {
      errs.password = 'Password must be at least 8 characters';
    } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])/.test(formData.password)) {
      errs.password = 'Password must contain uppercase, lowercase, and a number';
    }

    if (!formData.confirmPassword) {
      errs.confirmPassword = 'Confirm your password';
    } else if (formData.password !== formData.confirmPassword) {
      errs.confirmPassword = 'Passwords do not match';
    }

    if (!formData.role) {
      errs.role = 'Please select an account type';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError(null);

    if (!validate()) return;

    setLoading(true);
    try {
      await register(formData);
      navigate(formData.role === 'Patient' ? '/patient-login' : '/login', { state: { registered: true, email: formData.email } });
    } catch (err) {
      setSubmitError(err.message || 'Registration failed. Please check form details.');
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
          {formData.role === 'Patient' ? 'Create a Patient Account' : formData.role ? 'Create a Clinical Team Account' : 'Create an Artery AI Account'}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {formData.role === 'Patient' ? 'Register to find doctors, contact hospitals, and manage appointments' : 'Choose a patient or clinical team account to continue'}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="mb-2 flex justify-end"><select aria-label="Language" value={language} onChange={e => setLanguage(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">{LANGUAGES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></div>
        <div className="bg-white py-8 px-6 shadow-sm rounded-2xl border border-slate-200/90 sm:px-10">
          <div className="mb-6 pb-4 border-b border-slate-100">
            <h2 className="text-lg font-semibold text-slate-800">{formData.role === 'Patient' ? 'Patient Registration' : formData.role ? 'Practitioner Registration' : 'Choose your account type'}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {formData.role === 'Patient' ? 'Your patient account gives you access to doctor contacts, hospital search, and appointments.' : 'Patient accounts can browse doctors and request appointments. Clinical accounts access the medical workflow.'}
            </p>
          </div>

          {submitError && (
            <div className="mb-5 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <span className="font-semibold">Error:</span> {submitError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <Input
              label="Full Name"
              id="register-fullname"
              placeholder="e.g. Dr. Alexander Chen, MD"
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              error={errors.fullName}
              required
            />

            <Input
              label="Email Address"
              id="register-email"
              type="email"
              placeholder="e.g. patient@example.com"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              error={errors.email}
              required
            />

            <Input
              label="Phone Number (optional)"
              id="register-phone"
              type="tel"
              placeholder="Include country code if possible"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            />

            <Select
              label="I am registering as"
              id="register-role"
              options={ROLES}
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              error={errors.role}
              required
            />

            {formData.role === 'Patient' && <div className="rounded-lg border border-sky-100 bg-sky-50 px-3 py-2.5 text-xs leading-relaxed text-sky-900">Patient portal includes available doctor contact details, appointment requests, and nearby hospital search after sign-in.</div>}

            <Input
              label="Password"
              id="register-password"
              type={showPassword ? 'text' : 'password'}
              placeholder="At least 8 characters (mixed case + number)"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              error={errors.password}
              required
              rightIcon={showPassword ? EyeOff : Eye}
              onRightIconClick={() => setShowPassword(!showPassword)}
              helperText="Min 8 characters, uppercase, lowercase, and a number"
            />

            <Input
              label="Confirm Password"
              id="register-confirmpassword"
              type={showConfirmPassword ? 'text' : 'password'}
              placeholder="Re-enter password"
              value={formData.confirmPassword}
              onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
              error={errors.confirmPassword}
              required
              rightIcon={showConfirmPassword ? EyeOff : Eye}
              onRightIconClick={() => setShowConfirmPassword(!showConfirmPassword)}
            />

            <div className="pt-2">
              <Button
                type="submit"
                variant="primary"
                fullWidth
                loading={loading}
              >
                Register Account
              </Button>
            </div>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-100 text-center text-xs text-slate-600">
            Already have an active account?{' '}
            <Link to={formData.role === 'Patient' ? '/patient-login' : '/login'} className="font-semibold text-medical-600 hover:text-medical-700 hover:underline">
              Sign In here
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
