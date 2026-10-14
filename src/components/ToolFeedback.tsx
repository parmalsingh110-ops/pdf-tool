import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Star, CheckCircle2, MessageSquare, Send, Sparkles, AlertCircle } from 'lucide-react';
import { submitToolFeedback, inferToolName } from '../lib/telemetry';

const NEGATIVE_REASONS = [
  'File failed to convert / error occurred',
  'Downloaded file was corrupted or blank',
  'Formatting / layout was distorted',
  'Took too long / browser froze',
  'Quality was low',
  'Other problem',
];

const POSITIVE_REASONS = [
  'Fast & effortless',
  'Perfect formatting',
  'High output quality',
  'Better than other tools',
  'Great experience',
];

export default function ToolFeedback() {
  const location = useLocation();
  const toolPath = location.pathname;

  // Don't display on utility or informational non-tool pages
  const excludedPaths = [
    '/',
    '/all-tools',
    '/about',
    '/privacy',
    '/terms',
    '/pricing',
    '/contact',
    '/admin',
  ];

  const isExcluded = excludedPaths.includes(toolPath);

  const [rating, setRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [selectedTag, setSelectedTag] = useState<string>('');
  const [comment, setComment] = useState<string>('');
  const [submitted, setSubmitted] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Check if previously submitted in this session/browser
  useEffect(() => {
    setRating(0);
    setHoverRating(0);
    setSelectedTag('');
    setComment('');
    const stored = localStorage.getItem(`pdf_rated_${toolPath}`);
    setSubmitted(Boolean(stored));
  }, [toolPath]);

  if (isExcluded) return null;

  const toolName = inferToolName(toolPath);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (rating === 0) return;

    setIsSubmitting(true);
    await submitToolFeedback({
      toolPath,
      toolName,
      rating,
      feedbackType: selectedTag || (rating >= 4 ? 'positive' : 'issue'),
      comment: comment.trim(),
    });

    localStorage.setItem(`pdf_rated_${toolPath}`, 'true');
    setIsSubmitting(false);
    setSubmitted(true);
  };

  return (
    <section className="w-full max-w-4xl mx-auto px-4 py-8 mt-6">
      <div className="bg-gradient-to-br from-slate-50 to-rose-50/30 dark:from-slate-900/90 dark:to-slate-800/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm transition-all">
        {submitted ? (
          <div className="flex flex-col items-center justify-center text-center py-4 space-y-2.5">
            <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h4 className="text-lg font-bold text-slate-900 dark:text-white">
              Thank you for your feedback!
            </h4>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md">
              Your rating helps us keep {toolName} fast, bug-free, and 100% reliable for everyone.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 mb-1.5">
                  <Sparkles className="w-3 h-3" />
                  <span>Your Experience Matters</span>
                </div>
                <h4 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                  How was your experience with {toolName}?
                </h4>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                  Rate this tool or let us know if anything went wrong so we can fix it.
                </p>
              </div>

              {/* Star Rating Buttons */}
              <div className="flex items-center gap-1.5 self-start sm:self-auto">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => {
                      setRating(star);
                      setSelectedTag('');
                    }}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    aria-label={`Rate ${star} star`}
                    className="p-1 rounded-lg transition-transform hover:scale-125 focus:outline-none"
                  >
                    <Star
                      className={`w-7 h-7 sm:w-8 sm:h-8 transition-colors ${
                        (hoverRating || rating) >= star
                          ? 'fill-amber-400 text-amber-400'
                          : 'text-slate-300 dark:text-slate-700'
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* Expandable feedback details when rating is clicked */}
            {rating > 0 && (
              <form onSubmit={handleSubmit} className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3.5 animate-fadeIn">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                  {rating <= 3 ? (
                    <>
                      <AlertCircle className="w-4 h-4 text-amber-500" />
                      <span>What went wrong with {toolName}? (Select one)</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-emerald-500" />
                      <span>What did you like most?</span>
                    </>
                  )}
                </div>

                {/* Reason tags */}
                <div className="flex flex-wrap gap-2">
                  {(rating <= 3 ? NEGATIVE_REASONS : POSITIVE_REASONS).map((reason) => (
                    <button
                      key={reason}
                      type="button"
                      onClick={() => setSelectedTag(reason)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                        selectedTag === reason
                          ? 'bg-rose-600 text-white border-rose-600 font-medium shadow-sm'
                          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-rose-400'
                      }`}
                    >
                      {reason}
                    </button>
                  ))}
                </div>

                {/* Optional comment field */}
                <div className="relative">
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder={
                      rating <= 3
                        ? 'Optional: Describe the issue (e.g., error message or file type) to help us fix it...'
                        : 'Optional: Anything else you would like us to know?'
                    }
                    rows={2}
                    maxLength={500}
                    className="w-full text-xs sm:text-sm p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500/30"
                  />
                </div>

                <div className="flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setRating(0);
                      setSelectedTag('');
                    }}
                    className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs sm:text-sm font-semibold shadow-md transition-all disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{isSubmitting ? 'Submitting...' : 'Send Feedback'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
