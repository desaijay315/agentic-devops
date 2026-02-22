'use client';

import { useState } from 'react';

interface RecodeModalProps {
  sessionId: number;
  onSubmit: (feedback: string) => Promise<void>;
  onClose: () => void;
}

export default function RecodeModal({ sessionId, onSubmit, onClose }: RecodeModalProps) {
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onSubmit(feedback);
      onClose();
    } catch (e) {
      console.error('Recode failed:', e);
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg mx-4 bg-infraflow-card border border-infraflow-border rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-infraflow-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
                <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-semibold text-infraflow-text">Re-generate Fix</h3>
                <p className="text-xs text-infraflow-text-muted">Session #{sessionId}</p>
              </div>
            </div>
            <button onClick={onClose} className="text-infraflow-text-muted hover:text-infraflow-text transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-4">
          <label className="block text-sm font-medium text-infraflow-text mb-2">
            What should the AI do differently?
          </label>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="e.g. Use a different approach for the null check, avoid changing the API signature, focus on the retry logic instead..."
            className="w-full h-32 px-3 py-2 bg-infraflow-bg border border-infraflow-border rounded-lg text-sm text-infraflow-text placeholder-infraflow-text-muted focus:outline-none focus:ring-2 focus:ring-infraflow-accent/50 focus:border-infraflow-accent resize-none"
            autoFocus
          />
          <p className="text-xs text-infraflow-text-muted mt-2">
            Providing specific feedback helps the AI generate a better fix. You can also leave this blank to simply regenerate.
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-infraflow-border flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm text-infraflow-text-secondary hover:text-infraflow-text transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {submitting ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Regenerating...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Re-generate Fix
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
