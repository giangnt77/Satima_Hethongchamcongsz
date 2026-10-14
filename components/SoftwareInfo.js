'use client';

import { useEffect, useState } from 'react';

export default function SoftwareInfo({ onClose, embedded = false }) {
  const [readme, setReadme] = useState(() => (
    typeof window !== 'undefined' && window.__SATIMA_README__
      ? window.__SATIMA_README__
      : ''
  ));
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (readme) return undefined;

    const controller = new AbortController();
    fetch('/api/software-info', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        setReadme(await response.text());
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setLoadError(`Không tải được README của phần mềm: ${error.message}`);
        }
      });

    return () => controller.abort();
  }, [readme]);

  useEffect(() => {
    if (embedded) return undefined;

    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [embedded, onClose]);

  const readmeContent = readme ? (
    <pre className="m-0 p-4 sm:p-6 overflow-y-auto whitespace-pre-wrap break-words text-xs sm:text-sm leading-relaxed text-slate-800 font-sans">
      {readme}
    </pre>
  ) : (
    <p className="m-0 p-6 text-sm text-purple-900" role="status">
      {loadError || 'Đang tải README...'}
    </p>
  );

  if (embedded) {
    return (
      <section className="bg-white rounded-3xl border border-purple-200 shadow-2xs overflow-hidden animate-fade-in">
        <header className="px-4 py-3 sm:px-6 sm:py-4 border-b border-purple-100">
          <h2 className="text-base sm:text-lg font-black text-purple-950">📄 LICENSE</h2>
        </header>
        <div className="max-h-[70vh] overflow-y-auto">{readmeContent}</div>
      </section>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[100] bg-purple-950/60 backdrop-blur-sm p-2 sm:p-5 flex items-center justify-center"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="w-full max-w-4xl max-h-[94vh] bg-white rounded-2xl shadow-2xl border border-purple-200 flex flex-col overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="software-info-title"
      >
        <header className="shrink-0 px-4 py-3 sm:px-6 sm:py-4 border-b border-purple-100 flex items-center justify-between gap-3">
          <h2 id="software-info-title" className="text-base sm:text-lg font-black text-purple-950">
            📄 LICENSE
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 w-9 h-9 rounded-xl bg-purple-100 hover:bg-purple-200 text-purple-950 font-black border-0 cursor-pointer"
            aria-label="Đóng thông tin phần mềm"
          >
            ✕
          </button>
        </header>
        {readmeContent}
      </section>
    </div>
  );
}
