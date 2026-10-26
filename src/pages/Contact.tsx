import { Link } from 'react-router-dom';
import { ArrowLeft, Mail, MessageSquare, MapPin, Linkedin, Clock, ShieldCheck, Building2, ExternalLink, Github } from 'lucide-react';
import { useSEO } from '../hooks/useSEO';
import { FOUNDER_INFO, TEAM_MEMBERS } from '../config/founderInfo';

export default function Contact() {
  useSEO(
    'Contact & Support | PDF Media Suite',
    'Get in touch with PDF Media Suite and founding leadership team: Parmal Singh Gurjar (Founder), Pankaj Meena (Co-founder), and Sachin Kumar Sain (Co-founder) for product support, bug reports, or business inquiries.'
  );

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 text-slate-700 dark:text-slate-300">
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-sm font-semibold text-rose-600 dark:text-rose-400 hover:gap-3 transition-all mb-8 group"
      >
        <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
        Back to Home
      </Link>
      
      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/50 text-rose-600">
          <MessageSquare className="w-8 h-8" />
        </div>
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white">Contact & Support</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            We are here to assist with product inquiries, bug reports, and partnership requests.
          </p>
        </div>
      </div>
      
      <div className="space-y-8 text-base leading-relaxed">
        {/* Official Support */}
        <section>
          <div className="p-8 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center shadow-sm">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center mx-auto mb-4">
              <Mail className="w-6 h-6" />
            </div>
            <div className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 mb-2">
              Official Support &amp; Enquiries
            </div>
            <a 
              href={`mailto:${FOUNDER_INFO.supportEmail}`} 
              className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white hover:text-rose-600 dark:hover:text-rose-400 transition-colors block mb-2"
            >
              {FOUNDER_INFO.supportEmail}
            </a>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto mb-4">
              For technical feedback, tool issues, and feature requests. Typical response within 24 hours.
            </p>
            <div className="text-xs text-slate-400 flex items-center justify-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> Response Window: Monday – Saturday
            </div>
          </div>
        </section>

        {/* Founding Leadership Team Direct Contacts */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                Founding Leadership Direct Contacts
              </span>
              <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full">
                3 Co-founders
              </span>
            </div>
            <Link
              to="/about"
              className="text-xs font-bold text-rose-600 dark:text-rose-400 hover:underline"
            >
              Full Leadership Story &rarr;
            </Link>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            {TEAM_MEMBERS.map((member) => (
              <div
                key={member.id}
                className="p-6 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between text-center shadow-xs"
              >
                <div>
                  <div className="relative w-16 h-16 rounded-2xl overflow-hidden border-2 border-rose-500/20 bg-slate-100 dark:bg-slate-800 shadow-xs mx-auto mb-3 flex items-center justify-center font-bold text-white bg-gradient-to-br from-rose-500 to-indigo-600">
                    {member.photo ? (
                      <img
                        src={member.photo}
                        alt={member.name}
                        className="w-full h-full object-cover object-top"
                        onError={(e) => {
                          (e.currentTarget as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      member.initials
                    )}
                  </div>
                  <h3 className="font-extrabold text-base text-slate-900 dark:text-white mb-0.5">
                    {member.name}
                  </h3>
                  <p className="text-xs font-semibold text-rose-600 dark:text-rose-400 mb-1">
                    {member.role}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3">
                    {member.location}
                  </p>
                  <a
                    href={`mailto:${member.email}`}
                    className="text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 break-all block mb-4"
                  >
                    {member.email}
                  </a>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-center gap-2">
                  {member.linkedin && (
                    <a
                      href={member.linkedin}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0A66C2] text-white text-xs font-bold hover:bg-[#004182] transition-colors shadow-xs"
                    >
                      <Linkedin className="w-3.5 h-3.5 fill-current" />
                      LinkedIn
                    </a>
                  )}
                  {member.github && (
                    <a
                      href={member.github}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-colors"
                    >
                      <Github className="w-3.5 h-3.5" />
                      GitHub
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Operating Headquarters */}
        <section className="p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-rose-600 shrink-0">
                <Building2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Headquarters & Operating Location
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-rose-500 shrink-0" />
                  Jaipur, Rajasthan, India
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  PDF Media Suite operates globally, serving developers, students, and businesses across 40+ countries.
                </p>
              </div>
            </div>

            <Link
              to="/all-tools"
              className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold text-xs shrink-0 transition-colors"
            >
              Browse All Tools
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
