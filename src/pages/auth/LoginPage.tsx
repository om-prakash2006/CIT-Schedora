import React, { useState } from 'react';
import { AlertCircle, ArrowRight, AtSign, Eye, EyeOff, Lock } from 'lucide-react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { CIT_CREST_URL } from '../../components/navigation/navigationConfig.ts';
import {
  getRoleDefaultRoute,
  isRoutePermittedForRole,
  useAuth,
} from '../../context/AuthContext.tsx';

interface LocationState {
  from?: string;
}

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = (location.state as LocationState | null) ?? null;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (user) {
    const requestedPath = locationState?.from;
    const targetPath =
      requestedPath && isRoutePermittedForRole(requestedPath, user.role)
        ? requestedPath
        : getRoleDefaultRoute(user.role);
    return <Navigate to={targetPath} replace />;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMessage('Please enter your assigned CIT institutional email address.');
      return;
    }

    if (!password) {
      setErrorMessage('Please enter your account password.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await login(trimmedEmail, password);
      if (!result.ok) {
        setErrorMessage(
          result.errorMessage ?? 'Authentication could not be completed.'
        );
        return;
      }

      if (result.redirectTo) {
        navigate(result.redirectTo, { replace: true });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      data-testid="unified-sign-in-page"
      className="min-h-screen flex flex-col lg:flex-row bg-[#FFFDF8] text-[#182238]"
    >
      {/* Left Institutional Panel — Original CIT Blue & Branding */}
      <div
        className="lg:w-[45%] bg-[#132957] text-white px-8 py-12 lg:px-14 lg:py-16 flex flex-col justify-start relative overflow-hidden"
        style={{
          backgroundImage:
            'radial-gradient(rgba(255, 255, 255, 0.07) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      >
        {/* Top Crest Card */}
        <div className="inline-flex items-center gap-3.5 bg-white text-[#182238] rounded-xl px-4 py-3 shadow-md max-w-xs mb-16">
          <div className="w-11 h-11 rounded-lg bg-[#FFFDF8] border border-[#E7DFCF] p-0.5 flex items-center justify-center shrink-0 overflow-hidden">
            <img
              src={CIT_CREST_URL}
              alt="Chilika Institute of Technology Official Crest"
              className="w-full h-full object-contain"
            />
          </div>
          <div className="leading-tight">
            <div className="text-[11px] font-bold tracking-wider uppercase text-[#294074]">
              CHILIKA INSTITUTE
            </div>
            <div className="text-[10px] font-medium tracking-wide uppercase text-slate-500">
              OF TECHNOLOGY
            </div>
          </div>
        </div>

        {/* Brand Identity & Description */}
        <div className="max-w-md space-y-5 my-auto lg:my-0">
          <div className="flex items-center gap-2.5 text-[11px] font-semibold tracking-[0.16em] uppercase text-[#FBEFA3]">
            <span className="inline-block w-5 h-0.5 bg-[#FBEFA3]" />
            <span>UNIFIED CAMPUS OPERATIONS</span>
          </div>

          <h1 className="font-institutional-serif text-4xl lg:text-5xl font-normal tracking-tight text-white">
            CIT Schedora
          </h1>

          <p className="font-institutional-serif italic text-base lg:text-lg text-[#FBEFA3]/95">
            &ldquo;One Campus. One Intelligent Scheduling System.&rdquo;
          </p>

          <p className="text-sm text-blue-100/85 leading-relaxed pt-1">
            Manage institutional class timetables, semester examinations, venue
            reservations, and dynamic lab allocations through deterministic
            constraint modeling.
          </p>
        </div>
      </div>

      {/* Right Sign-In Panel */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12 bg-[#FFFDF8]">
        <div className="w-full max-w-md bg-white rounded-xl border border-[#E7DFCF] shadow-sm p-8 sm:p-10 space-y-6">
          <div>
            <h2 className="font-institutional-serif text-2xl font-normal text-[#182238]">
              Sign In
            </h2>
          </div>

          {errorMessage && (
            <div
              role="alert"
              data-testid="login-error-alert"
              className="rounded-lg border border-[#D62D32]/40 bg-[#D62D32]/5 px-4 py-3 flex items-start gap-2.5 text-xs text-[#D62D32]"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="leading-relaxed">{errorMessage}</div>
            </div>
          )}

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5" noValidate>
            {/* Institutional Email */}
            <div className="space-y-1.5">
              <label
                htmlFor="institutional-email"
                className="block text-[10px] font-bold tracking-wider uppercase text-[#182238]"
              >
                INSTITUTIONAL EMAIL
              </label>
              <div className="relative">
                <AtSign className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="institutional-email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@cit.edu.in"
                  className="w-full pl-10 pr-3.5 py-2.5 bg-white border border-[#E7DFCF] rounded-md text-xs text-[#182238] placeholder:text-slate-400 focus:outline-none focus:border-[#294074]"
                />
              </div>
              <p className="text-[11px] text-slate-500">
                Provide your assigned CIT username or institutional mailbox address.
              </p>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="institutional-password"
                  className="block text-[10px] font-bold tracking-wider uppercase text-[#182238]"
                >
                  PASSWORD
                </label>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="institutional-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full pl-10 pr-10 py-2.5 bg-white border border-[#E7DFCF] rounded-md text-xs text-[#182238] placeholder:text-slate-400 focus:outline-none focus:border-[#294074]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#182238] p-0.5"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Remember me */}
            <div className="flex items-center gap-2 pt-0.5">
              <input
                id="remember-me"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-3.5 h-3.5 rounded-xs border-[#E7DFCF] text-[#294074] focus:ring-[#294074]"
              />
              <label
                htmlFor="remember-me"
                className="text-xs text-[#182238] select-none cursor-pointer"
              >
                Remember me
              </label>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 rounded-md bg-[#294074] hover:bg-[#1e325e] disabled:opacity-60 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors shadow-xs cursor-pointer"
            >
              <span>
                {submitting ? 'Verifying Credentials...' : 'Sign In to Campus Workspace'}
              </span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>

        {/* Demo Login Access Section */}
        {((typeof process === 'undefined' || process.env?.APP_ENV !== 'test') &&
          (typeof import.meta === 'undefined' ||
            import.meta.env?.VITE_DEMO_ACCESS_ENABLED !== 'false')) && (
          <div
            data-testid="demo-login-access-panel"
            className="w-full max-w-md mt-6 bg-white rounded-xl border border-[#E7DFCF] shadow-sm p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#182238]">
                Demo Login Access
              </h3>
              <span className="text-[10px] bg-blue-50 text-[#294074] px-2 py-0.5 rounded font-medium">
                4 Roles Available
              </span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Click &quot;Use Credentials&quot; to populate the sign-in fields for testing each institutional role.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {[
                {
                  roleName: 'Admin',
                  email: 'dean.admin@cit-schedora.test',
                  password: 'CITSchedora!Admin2026',
                },
                {
                  roleName: 'Department Coordinator',
                  email: 'coordinator.cse@cit-schedora.test',
                  password: 'CITSchedora!Coord2026',
                },
                {
                  roleName: 'Faculty',
                  email: 'faculty.f01@cit-schedora.test',
                  password: 'CITSchedora!Faculty2026',
                },
                {
                  roleName: 'Club Representative',
                  email: 'robotics.club@cit-schedora.test',
                  password: 'CITSchedora!Club2026',
                },
              ].map((demo) => (
                <div
                  key={demo.email}
                  className="p-3 rounded-lg border border-[#E7DFCF] bg-[#F8FAFC] flex flex-col justify-between space-y-2"
                >
                  <div className="space-y-0.5">
                    <div className="text-[11px] font-bold text-[#182238]">
                      {demo.roleName}
                    </div>
                    <div className="text-[10px] text-slate-600 truncate font-mono" title={demo.email}>
                      {demo.email}
                    </div>
                    <div className="text-[10px] text-slate-500 font-sans">
                      Click to fill credentials
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEmail(demo.email);
                      setPassword(demo.password);
                      setErrorMessage(null);
                    }}
                    className="w-full py-1.5 px-2 bg-white border border-[#294074]/30 hover:border-[#294074] text-[#294074] rounded text-[10px] font-semibold transition-colors cursor-pointer text-center"
                  >
                    Use Credentials
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="mt-6 text-[11px] text-slate-500 text-center">
          © Chilika Institute of Technology | CIT Schedora
        </p>
      </div>
    </div>
  );
}
