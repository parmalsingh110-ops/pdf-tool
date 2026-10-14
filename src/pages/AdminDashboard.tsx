import { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Star,
  Activity,
  AlertTriangle,
  Bell,
  RefreshCw,
  Search,
  Lock,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  CheckCircle2,
  Clock,
  Laptop,
  Settings
} from 'lucide-react';
import { useSEO } from '../hooks/useSEO';
import { getBackendUrl } from '../lib/telemetry';

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
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TelemetryData | null>(null);
  const [activeTab, setActiveTab] = useState<'tools' | 'errors' | 'reviews' | 'alerts'>('tools');
  const [searchFilter, setSearchFilter] = useState('');
  const [expandedErrorId, setExpandedErrorId] = useState<number | null>(null);
  const [testWebhookStatus, setTestWebhookStatus] = useState<string | null>(null);

  const fetchTelemetry = async (key: string, urlOverride?: string) => {
    const targetUrl = urlOverride !== undefined ? urlOverride : (backendUrl || getBackendUrl());
    setLoading(true);
    setAuthError('');
    try {
      if (!targetUrl && window.location.hostname !== 'localhost') {
        setAuthError('Backend URL is not set. Please enter your Render backend URL below.');
        setShowConfig(true);
        setLoading(false);
        return;
      }

      const res = await fetch(`${targetUrl}/api/admin/telemetry?key=${encodeURIComponent(key)}`, {
        headers: {
          'X-Admin-Key': key,
        },
      });

      if (res.status === 401) {
        setAuthError('Incorrect passcode. Default passcode is "pdfadmin2026".');
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
    } catch (err: any) {
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
      const res = await fetch(`${targetUrl}/api/admin/test-webhook?key=${encodeURIComponent(passcode)}`, {
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

  // Login Screen
  if (!isAuthenticated) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[75vh] p-4 bg-slate-50 dark:bg-slate-950">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-xl">
          <div className="w-14 h-14 rounded-2xl bg-rose-600/10 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto mb-5">
            <Lock className="w-7 h-7" />
          </div>
          <h2 className="text-2xl font-bold text-center text-slate-900 dark:text-white mb-2">
            Admin Telemetry Access
          </h2>
          <p className="text-xs sm:text-sm text-center text-slate-500 dark:text-slate-400 mb-6">
            Enter your secret passcode to view real-time tool error logs, user ratings, and performance reports.
          </p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Admin Passcode
              </label>
              <input
                type="password"
                value={inputPass}
                onChange={(e) => setInputPass(e.target.value)}
                placeholder="Enter passcode (default: pdfadmin2026)"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/40"
              />
            </div>

            {authError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 text-xs">
                {authError}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm shadow-md transition-all disabled:opacity-50"
            >
              {loading ? 'Verifying...' : 'Unlock Dashboard'}
            </button>
          </form>

          {/* Configurable Backend URL */}
          <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 text-center">
            <button
              type="button"
              onClick={() => setShowConfig(!showConfig)}
              className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 flex items-center justify-center gap-1.5 mx-auto font-medium"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>{showConfig ? 'Hide Backend Settings' : 'Configure Backend Server URL'}</span>
            </button>

            {showConfig && (
              <div className="mt-3 p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 text-left space-y-2.5 animate-fadeIn">
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  Python Backend Service URL (Render / VPS)
                </label>
                <input
                  type="text"
                  value={customBackendInput}
                  onChange={(e) => setCustomBackendInput(e.target.value)}
                  placeholder="https://your-backend.onrender.com"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none"
                />
                <p className="text-[10px] text-slate-400">
                  Enter your Render FastAPI URL (e.g. <code>https://your-backend.onrender.com</code>).
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const clean = customBackendInput.trim().replace(/\/$/, '');
                    localStorage.setItem('pdf_admin_backend_url', clean);
                    setBackendUrl(clean);
                    fetchTelemetry(passcode || inputPass, clean);
                  }}
                  className="w-full py-2 px-3 bg-slate-900 hover:bg-black dark:bg-rose-600 dark:hover:bg-rose-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
                >
                  Save & Connect
                </button>
              </div>
            )}
          </div>

          <div className="mt-4 text-center text-[11px] text-slate-400">
            Protected endpoint &bull; Environment variable <code>ADMIN_SECRET_KEY</code>
          </div>
        </div>
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
    <div className="flex-1 bg-slate-50 dark:bg-slate-950 min-h-screen p-4 sm:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-3xl shadow-sm">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 mb-2">
              <Activity className="w-3.5 h-3.5" />
              <span>LIVE TELEMETRY & HEALTH SYSTEM</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
              Tool Performance & Feedback Hub
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Track user satisfaction ratings, detect tool errors instantly, and monitor health across all 115+ tools.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => fetchTelemetry(passcode)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <button
              onClick={handleLogout}
              className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-rose-50 hover:text-rose-600 transition-colors"
            >
              Lock
            </button>
          </div>
        </div>

        {/* KPI Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold mb-2">
              <span>Overall Rating</span>
              <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
              {summary.avg_rating > 0 ? `${summary.avg_rating} ★` : '5.0 ★'}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              From {summary.total_feedback} verified user reviews
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold mb-2">
              <span>Errors (Last 24h)</span>
              <AlertTriangle className="w-4 h-4 text-rose-500" />
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-rose-600 dark:text-rose-400">
              {summary.errors_24h}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              {summary.total_errors} total lifetime crash reports
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold mb-2">
              <span>Total Reviews</span>
              <MessageSquare className="w-4 h-4 text-sky-500" />
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
              {summary.total_feedback}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              User experience feedback submitted
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold mb-2">
              <span>Instant Alerts</span>
              <Bell className="w-4 h-4 text-purple-500" />
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
            <p className="text-[11px] text-slate-400 mt-1">
              Discord / Telegram instant alerts
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2 overflow-x-auto">
          {[
            { id: 'tools', label: 'Tool Health & Ratings', badge: toolStats.length },
            { id: 'errors', label: 'Error Crash Reports', badge: data?.recent_errors.length || 0 },
            { id: 'reviews', label: 'User Feedback & Reviews', badge: data?.recent_feedback.length || 0 },
            { id: 'alerts', label: 'Instant Alerts Setup (Telegram / Discord)' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap flex items-center gap-2 ${
                activeTab === tab.id
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span>{tab.label}</span>
              {typeof tab.badge === 'number' && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    activeTab === tab.id
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* TAB 1: TOOL HEALTH & PERFORMANCE */}
        {activeTab === 'tools' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Tool Health Directory
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Per-tool breakdown of user ratings and crash frequency.
                </p>
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Search tool name or path..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
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
                  <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="py-3 px-4 rounded-l-xl">Tool Name & Path</th>
                      <th className="py-3 px-4">Avg Rating</th>
                      <th className="py-3 px-4">Feedback Count</th>
                      <th className="py-3 px-4">Errors Encountered</th>
                      <th className="py-3 px-4 rounded-r-xl">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {toolStats.map((t) => {
                      const isHighError = t.error_count > 3;
                      const isWarning = t.error_count > 0 || (t.avg_rating > 0 && t.avg_rating < 3.5);
                      return (
                        <tr key={t.tool_path} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
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
          </div>
        )}

        {/* TAB 2: ERROR CRASH REPORTS */}
        {activeTab === 'errors' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
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
                      className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4 bg-slate-50/50 dark:bg-slate-800/40 space-y-2 transition-all"
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

                      <div className="font-mono text-xs text-rose-700 dark:text-rose-400 bg-rose-50/60 dark:bg-rose-950/40 p-2.5 rounded-xl border border-rose-200/60 dark:border-rose-900/60">
                        {err.error_message}
                      </div>

                      <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-1">
                        <div className="flex items-center gap-3">
                          {fileObj.name && (
                            <span>
                              File: <strong>{fileObj.name}</strong> ({fileObj.sizeFormatted || 'N/A'})
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
                            className="text-rose-600 hover:text-rose-700 font-semibold flex items-center gap-1"
                          >
                            <span>{isExpanded ? 'Hide Stack Trace' : 'View Stack Trace'}</span>
                            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>
                        )}
                      </div>

                      {isExpanded && err.error_stack && (
                        <pre className="text-[10px] font-mono p-3 rounded-xl bg-slate-900 text-emerald-400 overflow-x-auto max-h-48 whitespace-pre-wrap">
                          {err.error_stack}
                        </pre>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: USER REVIEWS & FEEDBACK */}
        {activeTab === 'reviews' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
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
                    className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4 bg-slate-50/50 dark:bg-slate-800/40 space-y-2"
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
                      <p className="text-xs text-slate-700 dark:text-slate-300 italic bg-white dark:bg-slate-800/80 p-3 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
                        &ldquo;{fb.comment}&rdquo;
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: INSTANT ALERTS SETUP (TELEGRAM & DISCORD) */}
        {activeTab === 'alerts' && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-400 mb-2">
                <Bell className="w-3.5 h-3.5" />
                <span>MOBILE / INSTANT NOTIFICATIONS</span>
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                Get Instant Alerts When Tools Fail
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                Whenever a user experiences an error or gives a low rating, you can receive an instant ping on Telegram or Discord!
              </p>
            </div>

            {/* Test button */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  Test Webhook Notifications
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Click to send a test message to your configured Discord or Telegram channel.
                </p>
              </div>
              <button
                type="button"
                onClick={sendTestWebhook}
                className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs shadow-md transition-all self-start sm:self-auto"
              >
                Send Test Alert
              </button>
            </div>
            {testWebhookStatus && (
              <div className="text-xs font-medium text-purple-600 dark:text-purple-400 p-2">
                {testWebhookStatus}
              </div>
            )}

            {/* Step-by-Step Instructions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              {/* Telegram Instructions */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-500 flex items-center justify-center font-bold">
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
              <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center font-bold">
                    👾
                  </div>
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                    Setup Discord Webhook (Free)
                  </h4>
                </div>
                <ol className="text-xs text-slate-600 dark:text-slate-400 space-y-2 list-decimal list-inside leading-relaxed">
                  <li>In your Discord server, go to <strong>Channel Settings &gt; Integrations &gt; Webhooks</strong>.</li>
                  <li>Click <strong>New Webhook</strong>, name it "PDF Tool Alerts", and click <strong>Copy Webhook URL</strong>.</li>
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
          </div>
        )}
      </div>
    </div>
  );
}
