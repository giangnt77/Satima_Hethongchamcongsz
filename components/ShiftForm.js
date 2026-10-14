'use client';

import { useState } from 'react';
import { getToday, calculateHours } from '@/lib/utils';

export default function ShiftForm({ onSubmit, loading }) {
  const [date, setDate] = useState(getToday());
  const [startTime, setStartTime] = useState('08:30');
  const [endTime, setEndTime] = useState('14:30');
  const [note, setNote] = useState('');

  const hours = calculateHours(startTime, endTime);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (hours <= 0) return;
    onSubmit({ date, startTime, endTime, hours, note });
    setNote('');
  };

  return (
    <form onSubmit={handleSubmit} className="glass rounded-2xl p-6">
      <h3 className="font-bold text-base mb-5 flex items-center gap-2">
        <span>📝</span> Đăng Ký Ca Làm
      </h3>

      {/* Date */}
      <div className="mb-4">
        <label className="block text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide mb-2">
          Ngày làm
        </label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
          className="w-full px-4 py-3 bg-[var(--color-surface-1)] border border-[var(--color-glass-border)] rounded-xl text-white text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition-all"
        />
      </div>

      {/* Time Row */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="block text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide mb-2">
            Giờ bắt đầu
          </label>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            required
            className="w-full px-4 py-3 bg-[var(--color-surface-1)] border border-[var(--color-glass-border)] rounded-xl text-white text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition-all"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide mb-2">
            Giờ kết thúc
          </label>
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            required
            className="w-full px-4 py-3 bg-[var(--color-surface-1)] border border-[var(--color-glass-border)] rounded-xl text-white text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition-all"
          />
        </div>
      </div>

      {/* Hours Preview */}
      {hours > 0 && (
        <div className="bg-[rgba(245,158,11,0.1)] border border-[rgba(245,158,11,0.2)] rounded-xl px-4 py-3 mb-4 flex items-center justify-between">
          <span className="text-sm text-[var(--color-text-secondary)]">Tổng giờ:</span>
          <span className="text-lg font-bold text-amber-400">{hours}h</span>
        </div>
      )}

      {/* Note */}
      <div className="mb-5">
        <label className="block text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide mb-2">
          Ghi chú (tùy chọn)
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="VD: Ca tối, phụ bếp..."
          rows={2}
          className="w-full px-4 py-3 bg-[var(--color-surface-1)] border border-[var(--color-glass-border)] rounded-xl text-white text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition-all resize-none placeholder:text-[var(--color-text-muted)]"
        />
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={loading || hours <= 0}
        className="w-full py-3 rounded-xl btn-gradient btn-shine text-white font-semibold text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed border-0"
      >
        {loading ? '⏳ Đang lưu...' : '✅ Đăng Ký Ca Làm'}
      </button>
    </form>
  );
}
