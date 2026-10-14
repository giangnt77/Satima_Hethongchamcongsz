'use client';

import { useState, useEffect, useCallback, createContext, useContext } from 'react';

const ToastContext = createContext(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((toast) => {
    setToasts((prev) => {
      // Chống duplicate: Nếu đã có toast cùng title & message thì không add trùng
      const isDuplicate = prev.some(
        (t) => t.title === toast.title && t.message === toast.message && !t.leaving
      );
      if (isDuplicate) return prev;

      const id = Date.now() + Math.random();
      setTimeout(() => {
        setToasts((p) => p.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
        setTimeout(() => {
          setToasts((p) => p.filter((t) => t.id !== id));
        }, 300);
      }, 3000);

      return [...prev, { ...toast, id }];
    });
  }, []);

  const success = useCallback((title, message) => {
    addToast({ type: 'success', title, message });
  }, [addToast]);

  const error = useCallback((title, message) => {
    addToast({ type: 'error', title, message });
  }, [addToast]);

  const warning = useCallback((title, message) => {
    addToast({ type: 'warning', title, message });
  }, [addToast]);

  const info = useCallback((title, message) => {
    addToast({ type: 'info', title, message });
  }, [addToast]);

  const icons = {
    success: '✨',
    error: '⚠️',
    warning: '🔔',
    info: '💜',
  };

  const badgeStyles = {
    success: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    error: 'bg-rose-100 text-rose-800 border-rose-300',
    warning: 'bg-amber-100 text-amber-800 border-amber-300',
    info: 'bg-purple-100 text-purple-900 border-purple-300',
  };

  return (
    <ToastContext.Provider value={{ success, error, warning, info }}>
      {children}
      {/* Toast Notification Container */}
      <div className="fixed top-4 right-4 sm:right-6 z-[9999] flex flex-col gap-2.5 max-w-sm w-[90vw] pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`
              pointer-events-auto bg-white/95 backdrop-blur-md border border-purple-200/90
              rounded-2xl p-3.5 shadow-xl transition-all duration-300
              flex items-start gap-3
              ${toast.leaving ? 'opacity-0 translate-x-10 scale-95' : 'opacity-100 translate-x-0 scale-100 animate-slide-in-right'}
            `}
          >
            {/* Left Badge Icon */}
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black border flex-shrink-0 shadow-2xs ${badgeStyles[toast.type]}`}>
              {icons[toast.type]}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 pr-1">
              <p className="font-black text-xs sm:text-sm text-purple-950 truncate leading-tight">
                {toast.title}
              </p>
              {toast.message && (
                <p className="text-[11px] font-extrabold text-purple-800 mt-0.5 leading-normal">
                  {toast.message}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
