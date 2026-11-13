import { useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  Star,
  Activity,
  AlertTriangle,
  Bell,
  RefreshCw,
  Search,
  Lock,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  CheckCircle2,
  Clock,
  Laptop,
  Settings,
  Eye,
  EyeOff,
  KeyRound,
  ShieldCheck,
} from 'lucide-react';
import { useSEO } from '../hooks/useSEO';
import { getBackendUrl, getPendingTelemetryCount, flushTelemetryQueue } from '../lib/telemetry';
import { isAllowedBackendOverride } from '../lib/privacy';
import PearlAuroraBackground from '../components/pearl/PearlAuroraBackground';
import { AnimatedNumber, PearlScanOverlay } from '../components/pearl/PearlMotion';

interface TelemetryData {
  summary: {
    total_feedback: number;
    avg_rating: number;
    total_errors: number;
    errors_24h: number;
  };
  tool_stats: Array<{
    tool_path: string;
    tool_name: string;
    feedback_count: number;
    avg_rating: number;
    error_count: number;
  }>;
  recent_feedback: Array<{
    id: number;
    tool_path: string;
    tool_name: string;
    rating: number;
    feedback_type: string;
    comment: string;
    user_agent: string;
    created_at: string;
  }>;
  recent_errors: Array<{
    id: number;
    tool_path: string;
    tool_name: string;
    error_message: string;
    error_stack: string;
    file_info: string;
    user_agent: string;
    created_at: string;
  }>;
  integrations: {
    discord_configured: boolean;
    telegram_configured: boolean;
  };
}

export default function AdminDashboard() {
  useSEO('Admin Telemetry & Health Dashboard — PDF Media Suite', 'Monitor tool performance, ratings, and error logs in real time.');

  const [backendUrl, setBackendUrl] = useState(() => getBackendUrl());
  const [customBackendInput, setCustomBackendInput] = useState(() => getBackendUrl());
  const [showConfig, setShowConfig] = useState(false);

  const [passcode, setPasscode] = useState(() => sessionStorage.getItem('pdf_admin_pass') || '');
  const [inputPass, setInputPass] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TelemetryData | null>(null);
  const [activeTab, setActiveTab] = useState<'tools' | 'errors' | 'reviews' | 'alerts' | 'security'>('tools');
  const [searchFilter, setSearchFilter] = useState('');
  const [expandedErrorId, setExpandedErrorId] = useState<number | null>(null);
  const [testWebhookStatus, setTestWebhookStatus] = useState<string | null>(null);

  // Change Passcode state
  const [newPasscode, setNewPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');
  const [passcodeChangeStatus, setPasscodeChangeStatus] = useState<string | null>(null);
  const [passcodeChangeError, setPasscodeChangeError] = useState<string | null>(null);
  const [changingPasscode, setChangingPasscode] = useState(false);

  // Offline queue state
  const [pendingQueueCount, setPendingQueueCount] = useState(() => getPendingTelemetryCount());

  const prefersReduced = useReducedMotion();

  const handleSyncQueue = async () => {
    setLoading(true);
    await flushTelemetryQueue();
    setPendingQueueCount(getPendingTelemetryCount());
    if (passcode) {
      await fetchTelemetry(passcode);
    } else {
      setLoading(false);
    }
  };

  const fetchTelemetry = async (key: string, urlOverride?: string) => {
    const targetUrl = urlOverride !== undefined ? urlOverride : (backendUrl || getBackendUrl());
    setLoading(true);
    setAuthError('');
    try {
      // Also trigger a background flush of any pending browser queue
      void flushTelemetryQueue().then(() => setPendingQueueCount(getPendingTelemetryCount()));

      if (!targetUrl && window.location.hostname !== 'localhost') {
        setAuthError('Backend URL is not set. Please enter your Render backend URL below.');
        setShowConfig(true);
        setLoading(false);
        return;
      }

      const res = await fetch(`${targetUrl}/api/admin/telemetry`, {
        headers: {
          'X-Admin-Key': key,
        },
      });

      if (res.status === 401) {
        setAuthError('Invalid admin passcode. Access denied.');
        setIsAuthenticated(false);
        setLoading(false);
        return;
      }

      if (res.status === 503) {
        setAuthError('Server ADMIN_SECRET_KEY is not configured. Set ADMIN_SECRET_KEY in your backend environment.');
        setIsAuthenticated(false);
        setLoading(false);
        return;
      }

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        setAuthError(`Backend returned non-JSON response from "${targetUrl || window.location.origin}". Make sure your Python backend service URL is entered below (e.g. https://your-backend.onrender.com).`);
        setShowConfig(true);
        setLoading(false);
        return;
      }

      const json = await res.json();
      setData(json);
      setIsAuthenticated(true);
      sessionStorage.setItem('pdf_admin_pass', key);
    } catch {
      setAuthError(`Unable to connect to backend at "${targetUrl || window.location.origin}". If your backend is hosted on Render, enter your Render URL below.`);
      setShowConfig(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (passcode) {
      fetchTelemetry(passcode);
    }
    const timer = setInterval(() => {
      setPendingQueueCount(getPendingTelemetryCount());
    }, 5000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputPass.trim()) return;
    setPasscode(inputPass.trim());
    fetchTelemetry(inputPass.trim());
  };

  const handleLogout = () => {
    sessionStorage.removeItem('pdf_admin_pass');
    setPasscode('');
    setIsAuthenticated(false);
    setData(null);
  };

  const sendTestWebhook = async () => {
    const targetUrl = backendUrl || getBackendUrl();
    setTestWebhookStatus('Sending test notification...');
    try {
      const res = await fetch(`${targetUrl}/api/admin/test-webhook`, {
        method: 'POST',
        headers: { 'X-Admin-Key': passcode },
      });
      const json = await res.json();
      if (json.success) {
        setTestWebhookStatus('✅ Test alert dispatched! Check your Telegram / Discord.');
      } else {
        setTestWebhookStatus('❌ Failed to trigger test alert.');
      }
    } catch {
      setTestWebhookStatus('❌ Network error contacting backend.');
    }
    setTimeout(() => setTestWebhookStatus(null), 6000);
  };

  const handleChangePasscode = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasscodeChangeStatus(null);
    setPasscodeChangeError(null);

    if (newPasscode.length < 6) {
      setPasscodeChangeError('New passcode must be at least 6 characters long.');
      return;
    }
    if (newPasscode !== confirmPasscode) {
      setPasscodeChangeError('New passcode and confirm passcode do not match.');
      return;
    }

    const targetUrl = backendUrl || getBackendUrl();
    setChangingPasscode(true);
    try {
      const res = await fetch(`${targetUrl}/api/admin/change-passcode`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': passcode,
        },
        body: JSON.stringify({ new_passcode: newPasscode }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setPasscode(newPasscode);
        sessionStorage.setItem('pdf_admin_pass', newPasscode);
        setNewPasscode('');
        setConfirmPasscode('');
        setPasscodeChangeStatus('✅ Passcode successfully updated! Your new passcode is now active.');
      } else {
        setPasscodeChangeError(json.detail || json.message || 'Failed to update passcode.');
      }
    } catch {
      setPasscodeChangeError('Network error updating passcode. Please verify backend connection.');
    } finally {
      setChangingPasscode(false);
    }
  };

  // Login Screen
  if (!isAuthenticated) {
    return (
      <div
        className="relative flex-1 flex items-center justify-center min-h-[82vh] p-4 sm:p-6 transition-colors"
        style={{ backgroundColor: 'var(--pms-pearl)', color: 'var(--pms-ink)' }}
      >
        <PearlAuroraBackground mode="workspace" />

        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 14, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-10 w-full max-w-md pms-glass-panel rounded-3xl p-8 overflow-hidden"
        >
          <PearlScanOverlay active={loading} label="Verifying admin access…" />

          <motion.div
            whileHover={prefersReduced ? undefined : { scale: 1.05, rotate: -3 }}
            transition={{ type: 'spring', stiffness: 360, damping: 18 }}
            className="w-14 h-14 rounded-2xl bg-[var(--pms-soft-rose)] text-[var(--pms-rose)] border border-[var(--pms-border)] flex items-center justify-center mx-auto mb-5 shadow-xs"
          >
            <Lock className="w-7 h-7" />
          </motion.div>

          <h2 className="text-2xl font-extrabold text-center text-slate-900 dark:text-white mb-2">
            Admin Telemetry Access
          </h2>
          <p className="text-xs sm:text-sm text-center text-slate-500 dark:text-slate-400 mb-6">
            Enter your secret passcode to view real-time tool error logs, user ratings, and performance reports.
          </p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Admin Passcode
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={inputPass}
                  onChange={(e) => setInputPass(e.target.value)}
                  placeholder="Enter Admin Passcode"
                  autoComplete="current-password"
                  className="w-full pl-4 pr-11 py-3 rounded-2xl border border-[var(--pms-border)] bg-white/85 dark:bg-slate-900/75 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/40"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {authError && (
              <motion.div
                initial={prefersReduced ? false : { opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 text-xs"
              >
                {authError}
              </motion.div>
            )}

            <motion.button
              type="submit"
              whileHover={prefersReduced || loading ? undefined : { scale: 1.01 }}
              whileTap={prefersReduced || loading ? undefined : { scale: 0.985 }}
              disabled={loading}
              className="w-full pms-btn-primary py-3.5 px-4 rounded-2xl font-bold text-sm disabled:opacity-50 cursor-pointer"
            >
              {loading ? 'Verifying…' : 'Unlock Dashboard'}
            </motion.button>
          </form>

          {/* Configurable Backend URL */}
          <div className="mt-5 pt-4 border-t border-[var(--pms-border)] text-center">
            <button
              type="button"
              onClick={() => setShowConfig(!showConfig)}
              className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 flex items-center justify-center gap-1.5 mx-auto font-semibold cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>{showConfig ? 'Hide Backend Settings' : 'Configure Backend Server URL'}</span>
            </button>

            <AnimatePresence initial={false}>
              {showConfig && (
                <motion.div
                  initial={prefersReduced ? false : { opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={prefersReduced ? undefined : { opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="mt-3 p-4 bg-white/75 dark:bg-slate-800/60 rounded-2xl border border-[var(--pms-border)] text-left space-y-2.5">
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                      Python Backend Service URL (Render / VPS)
                    </label>
                    <input
                      type="text"
                      value={customBackendInput}
                      onChange={(e) => setCustomBackendInput(e.target.value)}
                      placeholder="https://your-backend.onrender.com"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--pms-border)] bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none"
                    />
                    <p className="text-[10px] text-slate-400">
                      Enter your Render FastAPI URL (e.g. <code>https://your-backend.onrender.com</code>).
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        const clean = customBackendInput.trim().replace(/\/$/, '');
                        if (clean && !isAllowedBackendOverride(clean)) {
                          setAuthError('Untrusted backend URL blocked. Use an https://*.pdfmediasuite.in or https://*.onrender.com URL.');
                          return;
                        }
                        if (clean) {
                          localStorage.setItem('pdf_admin_backend_url', clean);
                        } else {
                          localStorage.removeItem('pdf_admin_backend_url');
                        }
                        setBackendUrl(clean);
                        fetchTelemetry(passcode || inputPass, clean);
                      }}
                      className="w-full py-2 px-3 bg-slate-900 hover:bg-black dark:bg-rose-600 dark:hover:bg-rose-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all cursor-pointer"
                    >
                      Save &amp; Connect
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="mt-4 text-center text-[11px] text-slate-400">
            🔒 Secure Admin Portal &bull; Unauthorized access is strictly prohibited.
          </div>
        </motion.div>
      </div>
    );
  }

  const summary = data?.summary || { total_feedback: 0, avg_rating: 5.0, total_errors: 0, errors_24h: 0 };
  const toolStats = (data?.tool_stats || []).filter(
    (t) =>
      t.tool_name.toLowerCase().includes(searchFilter.toLowerCase()) ||
      t.tool_path.toLowerCase().includes(searchFilter.toLowerCase())
  );

  return (
    <div
      className="relative flex-1 min-h-screen p-4 sm:p-8 transition-colors"
      style={{ backgroundColor: 'var(--pms-pearl)', color: 'var(--pms-ink)' }}
    >
      <PearlAuroraBackground mode="workspace" />

      <div className="relative z-10 max-w-7xl mx-auto space-y-6">
        {/* Top Header */}
        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pms-glass-panel p-6 rounded-3xl overflow-hidden"
        >
          <PearlScanOverlay active={loading} label="Refreshing telemetry…" />

          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-[var(--pms-soft-mint)] text-emerald-700 dark:text-emerald-400 border border-[var(--pms-border)] mb-2">
              <Activity className="w-3.5 h-3.5" />
              <span>LIVE TELEMETRY &amp; HEALTH SYSTEM</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
              Tool Performance &amp; Feedback Hub
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Track user satisfaction ratings, detect tool errors instantly, and monitor health across all 115+ tools.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            {pendingQueueCount > 0 && (
              <button
                onClick={handleSyncQueue}
                disabled={loading}
                title="Telemetry reports queued locally in this browser waiting for backend. Click to sync now."
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-xs font-bold text-amber-700 dark:text-amber-300 hover:bg-amber-500/25 transition-colors cursor-pointer"
              >
                <Activity className="w-3.5 h-3.5 animate-pulse" />
                <span>
                  <AnimatedNumber value={pendingQueueCount} suffix=" Queued Sync" />
                </span>
              </button>
            )}
            <button
              onClick={() => fetchTelemetry(passcode)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/80 dark:bg-slate-800/80 border border-[var(--pms-border)] text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <button
              onClick={handleLogout}
              className="px-4 py-2 rounded-xl bg-white/80 dark:bg-slate-800/80 border border-[var(--pms-border)] text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
            >
              Lock
            </button>
          </div>
        </motion.div>

        {/* KPI Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.03 }}
            whileHover={prefersReduced ? undefined : { y: -3 }}
            className="pms-glass-panel rounded-2xl p-5"
          >
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-bold mb-2">
              <span>Overall Rating</span>
              <span className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-950/50 flex items-center justify-center">
                <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
              <AnimatedNumber value={summary.avg_rating > 0 ? summary.avg_rating : 5.0} decimals={1} suffix=" ★" />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              From <AnimatedNumber value={summary.total_feedback} /> verified user reviews
            </p>
          </motion.div>

          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.07 }}
            whileHover={prefersReduced ? undefined : { y: -3 }}
            className="pms-glass-panel rounded-2xl p-5"
          >
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-bold mb-2">
              <span>Errors (Last 24h)</span>
              <span className="w-7 h-7 rounded-lg bg-[var(--pms-soft-rose)] flex items-center justify-center">
                <AlertTriangle className="w-4 h-4 text-rose-500" />
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-rose-600 dark:text-rose-400">
              <AnimatedNumber value={summary.errors_24h} />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              <AnimatedNumber value={summary.total_errors} /> total lifetime crash reports
            </p>
          </motion.div>

          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.11 }}
            whileHover={prefersReduced ? undefined : { y: -3 }}
            className="pms-glass-panel rounded-2xl p-5"
          >
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-bold mb-2">
              <span>Total Reviews</span>
              <span className="w-7 h-7 rounded-lg bg-[var(--pms-soft-blue)] flex items-center justify-center">
                <MessageSquare className="w-4 h-4 text-sky-500" />
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
              <AnimatedNumber value={summary.total_feedback} />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              User experience feedback submitted
            </p>
          </motion.div>

          <motion.div
            initial={prefersReduced ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.15 }}
            whileHover={prefersReduced ? undefined : { y: -3 }}
            className="pms-glass-panel rounded-2xl p-5"
          >
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-bold mb-2">
              <span>Instant Alerts</span>
              <span className="w-7 h-7 rounded-lg bg-[var(--pms-soft-lavender)] flex items-center justify-center">
                <Bell className="w-4 h-4 text-[var(--pms-violet)]" />
              </span>
            </div>
            <div className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5 mt-1">
              {data?.integrations.telegram_configured || data?.integrations.discord_configured ? (
                <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" /> Active Webhook
                </span>
              ) : (
                <span className="text-amber-500">Not Configured</span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Discord / Telegram instant alerts
            </p>
          </motion.div>
        </div>

        {/* Tab Navigation */}
        <div className="pms-glass-panel rounded-2xl p-1.5 flex items-center gap-1.5 overflow-x-auto">
          {[
            { id: 'tools', label: 'Tool Health & Ratings', badge: toolStats.length },
            { id: 'errors', label: 'Error Crash Reports', badge: data?.recent_errors.length || 0 },
            { id: 'reviews', label: 'User Feedback & Reviews', badge: data?.recent_feedback.length || 0 },
            { id: 'alerts', label: 'Instant Alerts Setup (Telegram / Discord)' },
            { id: 'security', label: 'Passcode & Security' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap flex items-center gap-2 cursor-pointer ${
                activeTab === tab.id
                  ? 'pms-btn-primary'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-white/70 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span>{tab.label}</span>
              {typeof tab.badge === 'number' && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    activeTab === tab.id
                      ? 'bg-white/25 text-white'
                      : 'bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {/* TAB 1: TOOL HEALTH & PERFORMANCE */}
          {activeTab === 'tools' && (
            <motion.div
              key="tab-tools"
              initial={prefersReduced ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={prefersReduced ? undefined : { opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="pms-glass-panel rounded-3xl p-6 space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
                    Tool Health Directory
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Per-tool breakdown of user ratings and crash frequency.
                  </p>
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search tool name or path..."
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-white/85 dark:bg-slate-800/80 border border-[var(--pms-border)] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500/30"
                  />
                </div>
              </div>

              {toolStats.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs">
                  No tool data found matching your search. Tools will populate as users rate or use them.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-white/70 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="py-3 px-4 rounded-l-xl">Tool Name &amp; Path</th>
                        <th className="py-3 px-4">Avg Rating</th>
                        <th className="py-3 px-4">Feedback Count</th>
                        <th className="py-3 px-4">Errors Encountered</th>
                        <th className="py-3 px-4 rounded-r-xl">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--pms-border)]">
                      {toolStats.map((t) => {
                        const isHighError = t.error_count > 3;
                        const isWarning = t.error_count > 0 || (t.avg_rating > 0 && t.avg_rating < 3.5);
                        return (
                          <tr key={t.tool_path} className="hover:bg-white/60 dark:hover:bg-slate-800/40 transition-colors">
                            <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-white">
                              <div>{t.tool_name}</div>
                              <div className="text-[11px] font-mono text-slate-400">{t.tool_path}</div>
                            </td>
                            <td className="py-3.5 px-4">
                              {t.avg_rating > 0 ? (
                                <span className="font-bold text-amber-500 flex items-center gap-1">
                                  {t.avg_rating} <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                                </span>
                              ) : (
                                <span className="text-slate-400">No ratings yet</span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 font-medium text-slate-600 dark:text-slate-300">
                              {t.feedback_count} reviews
                            </td>
                            <td className="py-3.5 px-4">
                              {t.error_count > 0 ? (
                                <span className="font-bold text-rose-600 dark:text-rose-400">
                                  {t.error_count} crashes
                                </span>
                              ) : (
                                <span className="text-emerald-600 dark:text-emerald-400">0 errors</span>
                              )}
                            </td>
                            <td className="py-3.5 px-4">
                              {isHighError ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 font-bold text-[10px]">
                                  🔴 Critical Errors
                                </span>
                              ) : isWarning ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 font-bold text-[10px]">
                                  🟡 Needs Review
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 font-bold text-[10px]">
                                  🟢 Healthy
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </motion.div>
          )}

          {/* TAB 2: ERROR CRASH REPORTS */}
          {activeTab === 'errors' && (
            <motion.div
              key="tab-errors"
              initial={prefersReduced ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={prefersReduced ? undefined : { opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="pms-glass-panel rounded-3xl p-6 space-y-4"
            >
              <div>
                <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
                  Live Error Telemetry Feed
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Automatic error catches from user browsers and backend handlers.
                </p>
              </div>

              {(!data?.recent_errors || data.recent_errors.length === 0) ? (
                <div className="text-center py-12 text-slate-400 text-xs">
                  🎉 No errors recorded! All tools have been running smoothly.
                </div>
              ) : (
                <div className="space-y-3">
                  {data.recent_errors.map((err) => {
                    const isExpanded = expandedErrorId === err.id;
                    let fileObj: any = {};
                    try {
                      fileObj = JSON.parse(err.file_info || '{}');
                    } catch {
                      fileObj = {};
                    }

                    return (
                      <div
                        key={err.id}
                        className="border border-[var(--pms-border)] rounded-2xl p-4 bg-white/70 dark:bg-slate-800/45 space-y-2 transition-all"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded-md bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 font-bold text-[11px]">
                              {err.tool_name}
                            </span>
                            <span className="text-xs font-mono text-slate-400">{err.tool_path}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-slate-400">
                            <Clock className="w-3 h-3" />
                            <span>{new Date(err.created_at).toLocaleString()}</span>
                          </div>
                        </div>

                        <div className="font-mono text-xs text-rose-700 dark:text-rose-400 bg-rose-50/75 dark:bg-rose-950/40 p-2.5 rounded-xl border border-rose-200/70 dark:border-rose-900/60">
                          {err.error_message}
                        </div>

                        <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-1">
                          <div className="flex items-center gap-3">
                            {(fileObj.extension || fileObj.type || fileObj.name) && (
                              <span>
                                File: <strong>{fileObj.extension || fileObj.type || 'document'}</strong> ({fileObj.sizeFormatted || 'N/A'})
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Laptop className="w-3 h-3" />
                              <span className="truncate max-w-[200px]" title={err.user_agent}>
                                {err.user_agent.slice(0, 35)}...
                              </span>
                            </span>
                          </div>

                          {err.error_stack && (
                            <button
                              type="button"
                              onClick={() => setExpandedErrorId(isExpanded ? null : err.id)}
                              className="text-rose-600 hover:text-rose-700 font-semibold flex items-center gap-1 cursor-pointer"
                            >
                              <span>{isExpanded ? 'Hide Stack Trace' : 'View Stack Trace'}</span>
                              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>
                          )}
                        </div>

                        <AnimatePresence initial={false}>
                          {isExpanded && err.error_stack && (
                            <motion.pre
                              initial={prefersReduced ? false : { opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={prefersReduced ? undefined : { opacity: 0, height: 0 }}
                              transition={{ duration: 0.18 }}
                              className="text-[10px] font-mono p-3 rounded-xl bg-slate-900 text-emerald-400 overflow-x-auto max-h-48 whitespace-pre-wrap"
                            >
                              {err.error_stack}
                            </motion.pre>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}

          {/* TAB 3: USER REVIEWS & FEEDBACK */}
          {activeTab === 'reviews' && (
            <motion.div
              key="tab-reviews"
              initial={prefersReduced ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={prefersReduced ? undefined : { opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="pms-glass-panel rounded-3xl p-6 space-y-4"
            >
              <div>
                <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
                  User Feedback Submissions
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Direct ratings and user feedback left at the bottom of tools.
                </p>
              </div>

              {(!data?.recent_feedback || data.recent_feedback.length === 0) ? (
                <div className="text-center py-12 text-slate-400 text-xs">
                  No user feedback submitted yet. Ratings will show here in real time.
                </div>
              ) : (
                <div className="space-y-3">
                  {data.recent_feedback.map((fb) => (
                    <div
                      key={fb.id}
                      className="border border-[var(--pms-border)] rounded-2xl p-4 bg-white/70 dark:bg-slate-800/45 space-y-2"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-slate-900 dark:text-white">
                            {fb.tool_name}
                          </span>
                          <div className="flex items-center text-amber-400">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star
                                key={i}
                                className={`w-3.5 h-3.5 ${
                                  i < fb.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300 dark:text-slate-700'
                                }`}
                              />
                            ))}
                          </div>
                          {fb.feedback_type && fb.feedback_type !== 'general' && (
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                                fb.rating <= 2
                                  ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400'
                                  : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
                              }`}
                            >
                              {fb.feedback_type}
                            </span>
                          )}
                        </div>

                        <span className="text-[11px] text-slate-400">
                          {new Date(fb.created_at).toLocaleString()}
                        </span>
                      </div>

                      {fb.comment && (
                        <p className="text-xs text-slate-700 dark:text-slate-300 italic bg-white/85 dark:bg-slate-800/80 p-3 rounded-xl border border-[var(--pms-border)]">
                          &ldquo;{fb.comment}&rdquo;
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* TAB 4: INSTANT ALERTS SETUP (TELEGRAM & DISCORD) */}
          {activeTab === 'alerts' && (
            <motion.div
              key="tab-alerts"
              initial={prefersReduced ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={prefersReduced ? undefined : { opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="pms-glass-panel rounded-3xl p-6 sm:p-8 space-y-6"
            >
              <div>
                <div className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)] border border-[var(--pms-border)] mb-2">
                  <Bell className="w-3.5 h-3.5" />
                  <span>MOBILE / INSTANT NOTIFICATIONS</span>
                </div>
                <h3 className="text-xl font-extrabold text-slate-900 dark:text-white">
                  Get Instant Alerts When Tools Fail
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                  Whenever a user experiences an error or gives a low rating, you can receive an instant ping on Telegram or Discord!
                </p>
              </div>

              {/* Test button */}
              <div className="p-4 rounded-2xl bg-white/75 dark:bg-slate-800/60 border border-[var(--pms-border)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    Test Webhook Notifications
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Click to send a test message to your configured Discord or Telegram channel.
                  </p>
                </div>
                <motion.button
                  type="button"
                  whileHover={prefersReduced ? undefined : { scale: 1.01 }}
                  whileTap={prefersReduced ? undefined : { scale: 0.985 }}
                  onClick={sendTestWebhook}
                  className="pms-btn-primary px-5 py-2.5 rounded-xl font-bold text-xs self-start sm:self-auto cursor-pointer"
                >
                  Send Test Alert
                </motion.button>
              </div>
              {testWebhookStatus && (
                <div className="text-xs font-semibold text-purple-600 dark:text-purple-400 p-2">
                  {testWebhookStatus}
                </div>
              )}

              {/* Step-by-Step Instructions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                {/* Telegram Instructions */}
                <div className="border border-[var(--pms-border)] bg-white/65 dark:bg-slate-800/40 rounded-2xl p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-[var(--pms-soft-blue)] text-[var(--pms-blue)] flex items-center justify-center font-bold">
                      ✈️
                    </div>
                    <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                      Setup Telegram Bot (Free)
                    </h4>
                  </div>
                  <ol className="text-xs text-slate-600 dark:text-slate-400 space-y-2 list-decimal list-inside leading-relaxed">
                    <li>Open Telegram and search for <code>@BotFather</code>.</li>
                    <li>Type <code>/newbot</code> and follow instructions to get your <strong>BOT TOKEN</strong>.</li>
                    <li>Start a chat with your bot, then get your <strong>CHAT ID</strong> via <code>@userinfobot</code>.</li>
                    <li>
                      Add these two variables to your backend <code>.env</code> file (or Render Environment Variables):
                      <pre className="mt-1.5 p-2 rounded-lg bg-slate-100 dark:bg-slate-800 font-mono text-[11px] text-slate-800 dark:text-slate-200">
                        TELEGRAM_BOT_TOKEN="your_token_here"<br />
                        TELEGRAM_CHAT_ID="your_chat_id_here"
                      </pre>
                    </li>
                  </ol>
                </div>

                {/* Discord Instructions */}
                <div className="border border-[var(--pms-border)] bg-white/65 dark:bg-slate-800/40 rounded-2xl p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-[var(--pms-soft-lavender)] text-[var(--pms-violet)] flex items-center justify-center font-bold">
                      👾
                    </div>
                    <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                      Setup Discord Webhook (Free)
                    </h4>
                  </div>
                  <ol className="text-xs text-slate-600 dark:text-slate-400 space-y-2 list-decimal list-inside leading-relaxed">
                    <li>In your Discord server, go to <strong>Channel Settings &gt; Integrations &gt; Webhooks</strong>.</li>
                    <li>Click <strong>New Webhook</strong>, name it &ldquo;PDF Tool Alerts&rdquo;, and click <strong>Copy Webhook URL</strong>.</li>
                    <li>
                      Add this variable to your backend <code>.env</code> file (or Render Environment Variables):
                      <pre className="mt-1.5 p-2 rounded-lg bg-slate-100 dark:bg-slate-800 font-mono text-[11px] text-slate-800 dark:text-slate-200">
                        DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/..."
                      </pre>
                    </li>
                    <li>Done! Any user error or low rating will instantly ping your Discord channel with formatted rich cards.</li>
                  </ol>
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB 5: PASSCODE & SECURITY */}
          {activeTab === 'security' && (
            <motion.div
              key="tab-security"
              initial={prefersReduced ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={prefersReduced ? undefined : { opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="pms-glass-panel rounded-3xl p-6 sm:p-8 space-y-6 max-w-3xl"
            >
              <div>
                <div className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-[var(--pms-soft-rose)] text-[var(--pms-rose)] border border-[var(--pms-border)] mb-2">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>ACCESS CONTROL &amp; SECURITY</span>
                </div>
                <h3 className="text-xl font-extrabold text-slate-900 dark:text-white">
                  Change Admin Passcode
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                  Update your secret admin passcode anytime. Your new passcode is immediately saved into the database.
                </p>
              </div>

              <form onSubmit={handleChangePasscode} className="space-y-4 pt-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    New Passcode (min 6 characters)
                  </label>
                  <input
                    type="password"
                    value={newPasscode}
                    onChange={(e) => setNewPasscode(e.target.value)}
                    placeholder="Enter new strong passcode"
                    className="w-full px-4 py-2.5 text-xs sm:text-sm rounded-xl border border-[var(--pms-border)] bg-white/85 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500/40"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    Confirm New Passcode
                  </label>
                  <input
                    type="password"
                    value={confirmPasscode}
                    onChange={(e) => setConfirmPasscode(e.target.value)}
                    placeholder="Confirm new passcode"
                    className="w-full px-4 py-2.5 text-xs sm:text-sm rounded-xl border border-[var(--pms-border)] bg-white/85 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500/40"
                    required
                  />
                </div>

                {passcodeChangeError && (
                  <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 text-xs">
                    {passcodeChangeError}
                  </div>
                )}

                {passcodeChangeStatus && (
                  <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 text-xs font-semibold">
                    {passcodeChangeStatus}
                  </div>
                )}

                <motion.button
                  type="submit"
                  whileHover={prefersReduced || changingPasscode || !newPasscode ? undefined : { scale: 1.01 }}
                  whileTap={prefersReduced || changingPasscode || !newPasscode ? undefined : { scale: 0.985 }}
                  disabled={changingPasscode || !newPasscode}
                  className="pms-btn-primary inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-xs sm:text-sm disabled:opacity-50 cursor-pointer"
                >
                  <KeyRound className="w-4 h-4" />
                  <span>{changingPasscode ? 'Updating…' : 'Save New Passcode'}</span>
                </motion.button>
              </form>

              <div className="pt-4 border-t border-[var(--pms-border)] text-xs text-slate-500 dark:text-slate-400 space-y-1">
                <p className="font-semibold text-slate-700 dark:text-slate-300">
                  Alternative: Environment Variable Method
                </p>
                <p>
                  You can also configure your passcode directly in Render Dashboard &gt; Environment Variables as:
                </p>
                <pre className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 font-mono text-[11px] text-slate-800 dark:text-slate-200 mt-1">
                  ADMIN_SECRET_KEY="your_custom_secret_key"
                </pre>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
