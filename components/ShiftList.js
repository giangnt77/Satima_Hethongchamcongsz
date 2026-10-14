'use client';

import { formatDateShort } from '@/lib/utils';

export default function ShiftList({ shifts, onDelete, canDelete = true, showDate = true }) {
  if (!shifts || shifts.length === 0) {
    return (
      <div className="text-center py-10 text-[var(--color-text-muted)]">
        <div className="text-4xl mb-3 opacity-50">📋</div>
        <p className="text-sm">Chưa có ca làm nào</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {shifts.map((shift) => (
        <div
          key={shift.id}
          className="bg-[var(--color-surface-2)] border border-[var(--color-glass-border)] rounded-xl px-4 py-3 flex items-center justify-between gap-3 animate-fade-in"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              {showDate && (
                <span className="text-xs font-semibold text-[var(--color-text-muted)] bg-[var(--color-surface-3)] px-2 py-1 rounded-md">
                  {formatDateShort(shift.date)}
                </span>
              )}
              <span className="font-semibold text-amber-400 text-sm">
                {shift.start_time?.slice(0, 5)} → {shift.end_time?.slice(0, 5)}
              </span>
              <span className="text-xs text-[var(--color-text-muted)]">
                ({shift.hours}h)
              </span>
            </div>
            {shift.note && (
              <p className="text-xs text-[var(--color-text-secondary)] mt-1 italic truncate">
                💬 {shift.note}
              </p>
            )}
          </div>

          {canDelete && (
            <button
              onClick={() => onDelete?.(shift.id)}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-[rgba(244,63,94,0.1)] hover:bg-[rgba(244,63,94,0.2)] text-[var(--color-coral-400)] transition-all text-xs cursor-pointer border-0 flex-shrink-0"
              title="Xóa ca này"
            >
              🗑️
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
