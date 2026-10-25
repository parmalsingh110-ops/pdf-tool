import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  User,
  Target,
  Route,
  Linkedin,
  Github,
  Mail,
  MapPin,
  Building2,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  Cpu,
  Layers,
  ExternalLink,
  Award,
  Globe,
  FileCheck2,
  Briefcase,
  Code2,
  TrendingUp,
  Check,
} from 'lucide-react';
import { useSEO } from '../hooks/useSEO';
import { FOUNDER_INFO, TEAM_MEMBERS, TeamMember } from '../config/founderInfo';

export default function About() {
  useSEO(
    'About & Leadership Team | PDF Media Suite',
    'Meet the founding team behind PDF Media Suite: Parmal Singh Gurjar (Founder & Web Developer), Pankaj Meena (Co-founder — Business & Growth), and Sachin Kumar Sain (Co-founder — Technical Development). Discover our mission to build high-performance, privacy-first document productivity infrastructure.'
  );

  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});

  const handleImgError = (id: string) => {
    setImgErrors((prev) => ({ ...prev, [id]: true }));
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 text-slate-700 dark:text-slate-300">
      {/* Back to Home navigation */}
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-sm font-semibold text-rose-600 dark:text-rose-400 hover:gap-3 transition-all mb-8 group"
      >
        <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
        Back to Home
      </Link>

      {/* Header Banner */}
      <div className="relative mb-12 rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-white via-slate-50 to-rose-50/30 dark:from-slate-900 dark:via-slate-900/90 dark:to-slate-950 p-8 sm:p-12 shadow-sm">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900/60 text-xs font-bold text-rose-700 dark:text-rose-300 mb-6">
          <Sparkles className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
          <span>Independent Startup &amp; Cloud-Accelerated SaaS</span>
        </div>

        <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-tight">
          About &amp; Founding Team
        </h1>
        <p className="mt-4 text-lg text-slate-600 dark:text-slate-300 max-w-2xl leading-relaxed">
          Building high-performance, client-first document productivity infrastructure. Engineered with 110+ specialized tools designed for speed, privacy, and scale.
        </p>

        {/* Quick Highlights Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8 pt-8 border-t border-slate-200/70 dark:border-slate-800">
          {FOUNDER_INFO.milestones.map((m, idx) => (
            <div key={idx} className="space-y-1">
              <div className="text-2xl font-black text-slate-900 dark:text-white">{m.value}</div>
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{m.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-14">
        {/* ================= FOUNDING TEAM & LEADERSHIP SECTION (CRITICAL FOR GOOGLE REVIEW) ================= */}
        <section id="leadership" className="scroll-mt-24">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-8">
            <div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2.5">
                <Award className="w-7 h-7 text-rose-600" />
                Founding Team &amp; Leadership
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                Real founders with distinct, verifiable contributions across engineering, business growth, and system architecture.
              </p>
            </div>
            <span className="self-start sm:self-auto text-xs font-bold px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1.5 shrink-0">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              3 Verified Co-founders
            </span>
          </div>

          <div className="space-y-8">
            {TEAM_MEMBERS.map((member: TeamMember) => {
              const isFailedImg = !member.photo || imgErrors[member.id];

              return (
                <div
                  key={member.id}
                  className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl shadow-slate-100/50 dark:shadow-none overflow-hidden transition-all hover:border-slate-300 dark:hover:border-slate-700"
                >
                  <div className="p-7 sm:p-9">
                    <div className="flex flex-col md:flex-row gap-7 items-start">
                      {/* Photo or High-Res Initials Avatar */}
                      <div className="shrink-0 flex flex-col items-center sm:items-start">
                        <div className="relative w-32 h-32 sm:w-40 sm:h-40 rounded-2xl overflow-hidden border-2 border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 shadow-md">
                          {!isFailedImg ? (
                            <img
                              src={member.photo}
                              alt={member.name}
                              onError={() => handleImgError(member.id)}
                              className="w-full h-full object-cover object-top"
                            />
                          ) : (
                            <div className={`w-full h-full flex flex-col items-center justify-center bg-gradient-to-br ${member.colorGradient} text-white select-none`}>
                              <span className="text-3xl sm:text-4xl font-black tracking-wider">{member.initials}</span>
                              <span className="text-[10px] uppercase font-bold tracking-widest mt-1 opacity-90 px-2 text-center truncate max-w-full">
                                {member.badge}
                              </span>
                            </div>
                          )}
                          <div className="absolute bottom-2 right-2 bg-white dark:bg-slate-900 rounded-full p-1 shadow-md border border-slate-200 dark:border-slate-700">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                          </div>
                        </div>
                        <span className="mt-2.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5 text-rose-600" />
                          Verified Founding Role
                        </span>
                      </div>

                      {/* Member Info */}
                      <div className="flex-1 space-y-4">
                        <div>
                          <div className="flex flex-wrap items-center gap-2.5 mb-1.5">
                            <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
                              {member.name}
                            </h3>
                            <span className="text-xs font-bold px-3 py-1 rounded-full bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/40">
                              {member.role}
                            </span>
                          </div>
                          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                            {member.title}
                          </p>
                          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400 mt-2">
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5 text-rose-500" />
                              {member.location}
                            </span>
                            <span className="flex items-center gap-1">
                              <Building2 className="w-3.5 h-3.5 text-slate-400" />
                              PDF Media Suite
                            </span>
                          </div>
                        </div>

                        {/* Direct Responsibilities Bullet Points (Required by Google for Startups Slide 3) */}
                        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60 space-y-2">
                          <span className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 block">
                            Specific Responsibilities &amp; Delivery:
                          </span>
                          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300">
                            {member.responsibilities.map((resp, rIdx) => (
                              <li key={rIdx} className="flex items-start gap-1.5 font-medium">
                                <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                                <span>{resp}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Bio */}
                        <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed">
                          {member.bio}
                        </p>

                        {/* Story quote if present */}
                        {member.story && (
                          <div className="p-4 rounded-xl bg-rose-50/40 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed italic">
                            &ldquo;{member.story}&rdquo;
                          </div>
                        )}

                        {/* Social Verification & Contact Links */}
                        <div className="pt-2 flex flex-wrap items-center gap-2.5">
                          {member.linkedin && (
                            <a
                              href={member.linkedin}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0A66C2] hover:bg-[#004182] text-white text-xs font-bold transition-all shadow-sm"
                            >
                              <Linkedin className="w-3.5 h-3.5 fill-current" />
                              LinkedIn Profile
                              <ExternalLink className="w-3 h-3 opacity-80" />
                            </a>
                          )}

                          {member.github && (
                            <a
                              href={member.github}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-bold transition-all shadow-sm"
                            >
                              <Github className="w-3.5 h-3.5" />
                              GitHub Profile
                            </a>
                          )}

                          {member.githubSecondary && (
                            <a
                              href={member.githubSecondary}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-slate-400 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all"
                            >
                              <Github className="w-3.5 h-3.5" />
                              GitHub (Ops)
                            </a>
                          )}

                          <a
                            href={`mailto:${member.email}`}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-rose-300 dark:hover:border-rose-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all"
                          >
                            <Mail className="w-3.5 h-3.5 text-rose-500" />
                            {member.email}
                          </a>
                        </div>

                        {/* Core Competencies Tags */}
                        <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                            Core Competencies &amp; Focus:
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {member.competencies.map((skill, cIdx) => (
                              <span
                                key={cIdx}
                                className="px-2.5 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-medium border border-slate-200/60 dark:border-slate-700/60"
                              >
                                {skill}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ================= STARTUP MISSION & VISION ================= */}
        <section className="grid md:grid-cols-2 gap-6">
          <div className="p-8 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
            <div className="w-10 h-10 rounded-2xl bg-rose-50 dark:bg-rose-950/60 flex items-center justify-center text-rose-600">
              <Target className="w-5 h-5" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">Our Mission</h3>
            <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              To dismantle paywalls and eliminate privacy risks around everyday document workflows. We believe powerful PDF, image, and office document manipulation should be instantaneous, zero-cost, and private by default.
            </p>
          </div>

          <div className="p-8 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">Privacy-First Architecture</h3>
            <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              Most online document tools upload files to remote servers without clarity. PDF Media Suite implements client-side WebAssembly rendering and in-memory isolated compute buffers that immediately wipe data upon session completion.
            </p>
          </div>
        </section>

        {/* ================= TECHNICAL ARCHITECTURE & STACK ================= */}
        <section className="p-8 sm:p-10 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600">
              <Cpu className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Engineering Architecture</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Robust, modern stack powering 110+ productivity modules</p>
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-6 text-sm">
            <div className="space-y-2 p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800">
              <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-rose-500" /> Frontend Client
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                React 18, TypeScript, TailwindCSS, WebAssembly, PDF.js, and client-side canvas rendering engines.
              </p>
            </div>

            <div className="space-y-2 p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800">
              <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Cpu className="w-4 h-4 text-rose-500" /> Compute Microservices
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Python FastAPI engine powered by PyMuPDF, LibreOffice CLI conversion, Poppler, and Tesseract OCR pipelines.
              </p>
            </div>

            <div className="space-y-2 p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800">
              <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Globe className="w-4 h-4 text-rose-500" /> Cloud Scaling
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Stateless Docker containerization, Google Cloud Platform compute instances, and automated CDN asset delivery.
              </p>
            </div>
          </div>
        </section>

        {/* ================= COMPANY & CONTACT INFORMATION ================= */}
        <section className="p-8 sm:p-10 rounded-3xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/60">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
                Company &amp; Contact Information
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md">
                PDF Media Suite is an independent technology startup headquartered in India and accessible to users worldwide.
              </p>
              <div className="mt-4 space-y-1 text-xs text-slate-600 dark:text-slate-400">
                <p><strong>Entity Name:</strong> PDF Media Suite</p>
                <p><strong>Operating Base:</strong> Jaipur, Rajasthan, India</p>
                <p><strong>Support &amp; Legal:</strong> support@pdfmediasuite.in</p>
                <p><strong>Founding Inquiries:</strong> founder@pdfmediasuite.in</p>
              </div>
            </div>

            <div className="shrink-0 flex flex-col gap-3">
              <Link
                to="/all-tools"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm transition-all shadow-md shadow-rose-600/20"
              >
                <FileCheck2 className="w-4 h-4" />
                Explore All 110+ Tools
              </Link>
              <Link
                to="/contact"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 text-slate-800 dark:text-white font-bold text-sm transition-all"
              >
                Contact &amp; Support
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
