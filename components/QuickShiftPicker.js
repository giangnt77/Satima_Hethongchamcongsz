'use client';

import { useState } from 'react';
import { getToday, formatDateISO } from '@/lib/utils';

/**
 * Ca làm cố định — nhân viên chỉ cần bấm 1 nút.
 * Có thêm "Tùy chỉnh" cho trường hợp đặc biệt.
 */
const PRESET_SHIFTS = [
  {
    id: 'morning',
    label: 'Ca Sáng',
    icon: '🌅',
    startTime: '08:30',
    endTime: '14:30',
    hours: 6,
    color: 'from-amber-400 to-orange-500',
    bgGlow: 'rgba(251, 191, 36, 0.15)',
    borderColor: 'rgba(251, 191, 36, 0.3)',
  },
  {
    id: 'afternoon',
    label: 'Ca Chiều',
    icon: '🌞',
    startTime: '14:00',
    endTime: '18:00',
    hours: 4,
    color: 'from-orange-400 to-red-500',
    bgGlow: 'rgba(249, 115, 22, 0.15)',
    borderColor: 'rgba(249, 115, 22, 0.3)',
  },
  {
    id: 'evening',
    label: 'Ca Tối',
    icon: '🌙',
    startTime: '17:00',
    endTime: '22:00',
    hours: 5,
    color: 'from-indigo-400 to-purple-500',
    bgGlow: 'rgba(129, 140, 248, 0.15)',
    borderColor: 'rgba(129, 140, 248, 0.3)',
  },
];

export default function QuickShiftPicker({ onSubmit, loading }) {
  const [step, setStep] = useState('date'); // 'date' | 'shift' | 'confirm'
  const [selectedDate, setSelectedDate] = useState(getToday());
  const [selectedShift, setSelectedShift] = useState(null);
  const [customMode, setCustomMode] = useState(false);
  const [customStart, setCustomStart] = useState('08:30');
  const [customEnd, setCustomEnd] = useState('14:30');
  const [note, setNote] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const today = getToday();

  // Format date for display
  function formatDateVN(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    const dayOfWeek = dayNames[date.getDay()];
    return `${dayOfWeek}, ${date.getDate()}/${date.getMonth() + 1}`;
  }

  // Calculate hours for custom mode
  function calcHours(start, end) {
    if (!start || !end || start === end) return 0;
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    if (eh * 60 + em <= sh * 60 + sm) return 0;
    const diff = (eh * 60 + em - (sh * 60 + sm)) / 60;
    return Math.round(diff * 100) / 100;
  }

  async function handleConfirm() {
    let data;
    if (customMode) {
      const hours = calcHours(customStart, customEnd);
      if (hours <= 0) return;
      data = {
        date: selectedDate,
        startTime: customStart,
        endTime: customEnd,
        hours,
        note,
      };
    } else {
      data = {
        date: selectedDate,
        startTime: selectedShift.startTime,
        endTime: selectedShift.endTime,
        hours: selectedShift.hours,
        note,
      };
    }

    await onSubmit(data);

    // Show success animation
    setShowSuccess(true);
    setTimeout(() => {
      setShowSuccess(false);
      // Reset for next registration
      setStep('date');
      setSelectedDate(getToday());
      setSelectedShift(null);
      setCustomMode(false);
      setNote('');
    }, 2000);
  }

  // ========= SUCCESS SCREEN =========
  if (showSuccess) {
    return (
      <div className="glass rounded-3xl p-8 text-center animate-fade-in-up">
        <div className="text-7xl mb-4 animate-bounce-in">✅</div>
        <h2 className="text-2xl font-bold text-white mb-2">Đã Đăng Ký!</h2>
        <p className="text-[var(--color-text-secondary)] text-lg">
          Ca làm đã được ghi nhận
        </p>
      </div>
    );
  }

  // ========= STEP 1: CHỌN NGÀY =========
  if (step === 'date') {
    // Generate next 7 days
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const dateStr = formatDateISO(d);
      days.push(dateStr);
    }

    return (
      <div className="glass rounded-3xl p-6 md:p-8 animate-fade-in-up">
        <h3 className="font-bold text-xl mb-1 flex items-center gap-2">
          <span>📅</span> Chọn Ngày Làm
        </h3>
        <p className="text-sm text-[var(--color-text-muted)] mb-6">Bước 1/3</p>

        {/* Quick Day Buttons */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {days.map((dateStr, idx) => {
            const isToday = dateStr === today;
            const isTomorrow = idx === 1;
            const isSelected = selectedDate === dateStr;

            let label = formatDateVN(dateStr);
            if (isToday) label = `Hôm nay • ${label}`;
            else if (isTomorrow) label = `Ngày mai • ${label}`;

            return (
              <button
                key={dateStr}
                onClick={() => setSelectedDate(dateStr)}
                className={`day-select-btn p-4 rounded-2xl text-left cursor-pointer border-2 transition-all ${
                  isSelected
                    ? 'border-amber-500 bg-[rgba(245,158,11,0.15)] shadow-[0_0_20px_rgba(245,158,11,0.2)]'
                    : 'border-[var(--color-glass-border)] bg-[var(--color-surface-1)] hover:border-[rgba(245,158,11,0.3)]'
                } ${isToday ? 'col-span-2' : ''}`}
              >
                <span className={`text-base font-semibold ${isSelected ? 'text-amber-400' : 'text-white'}`}>
                  {isToday && <span className="text-xl mr-1">⭐</span>}
                  {label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Other Date */}
        {showDatePicker ? (
          <div className="mb-5">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-5 py-4 bg-[var(--color-surface-1)] border border-[var(--color-glass-border)] rounded-xl text-white text-base focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition-all"
            />
          </div>
        ) : (
          <button
            onClick={() => setShowDatePicker(true)}
            className="w-full p-3 rounded-xl border border-dashed border-[var(--color-glass-border)] text-[var(--color-text-muted)] hover:text-amber-400 hover:border-amber-500 transition-all cursor-pointer bg-transparent text-sm mb-5"
          >
            📆 Chọn ngày khác...
          </button>
        )}

        {/* Next Button */}
        <button
          onClick={() => setStep('shift')}
          disabled={!selectedDate}
          className="w-full py-4 rounded-2xl btn-gradient btn-shine text-white font-bold text-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed border-0"
        >
          Tiếp Theo →
        </button>
      </div>
    );
  }

  // ========= STEP 2: CHỌN CA =========
  if (step === 'shift') {
    return (
      <div className="glass rounded-3xl p-6 md:p-8 animate-fade-in-up">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-bold text-xl flex items-center gap-2">
            <span>⏰</span> Chọn Ca Làm
          </h3>
          <button
            onClick={() => setStep('date')}
            className="text-sm text-[var(--color-text-muted)] hover:text-amber-400 cursor-pointer bg-transparent border-0 transition-colors"
          >
            ← Quay lại
          </button>
        </div>
        <p className="text-sm text-[var(--color-text-muted)] mb-6">
          Bước 2/3 • Ngày: <span className="text-amber-400 font-semibold">{formatDateVN(selectedDate)}</span>
        </p>

        {!customMode ? (
          <>
            {/* Preset Shifts */}
            <div className="space-y-3 mb-4">
              {PRESET_SHIFTS.map((shift) => {
                const isSelected = selectedShift?.id === shift.id;
                return (
                  <button
                    key={shift.id}
                    onClick={() => setSelectedShift(shift)}
                    className={`shift-select-btn w-full flex items-center gap-4 p-5 rounded-2xl cursor-pointer border-2 transition-all text-left ${
                      isSelected
                        ? `border-amber-500 shadow-[0_0_25px_${shift.bgGlow}]`
                        : 'border-[var(--color-glass-border)] hover:border-[rgba(255,255,255,0.15)]'
                    }`}
                    style={{
                      background: isSelected ? shift.bgGlow : 'var(--color-surface-1)',
                    }}
                  >
                    <span className="text-4xl">{shift.icon}</span>
                    <div className="flex-1">
                      <div className="text-lg font-bold text-white">{shift.label}</div>
                      <div className="text-sm text-[var(--color-text-secondary)]">
                        {shift.startTime} — {shift.endTime} ({shift.hours} giờ)
                      </div>
                    </div>
                    {isSelected && (
                      <span className="text-2xl animate-bounce-in">✅</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Custom Option */}
            <button
              onClick={() => {
                setCustomMode(true);
                setSelectedShift(null);
              }}
              className="w-full p-3 rounded-xl border border-dashed border-[var(--color-glass-border)] text-[var(--color-text-muted)] hover:text-amber-400 hover:border-amber-500 transition-all cursor-pointer bg-transparent text-sm mb-5"
            >
              ⏰ Tùy chỉnh giờ khác...
            </button>

            {/* Note field */}
            <div className="mb-5">
              <label className="block text-sm font-semibold text-[var(--color-text-secondary)] mb-2">
                💬 Ghi chú <span className="text-[var(--color-text-muted)] font-normal">(không bắt buộc)</span>
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="VD: Mai em đi học sáng 8-12h, làm được chiều thôi..."
                rows={2}
                className="w-full px-4 py-3 bg-[var(--color-surface-1)] border border-[var(--color-glass-border)] rounded-xl text-white text-base focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition-all resize-none placeholder:text-[var(--color-text-muted)]"
              />
            </div>

            {/* Next Button */}
            <button
              onClick={() => setStep('confirm')}
              disabled={!selectedShift}
              className="w-full py-4 rounded-2xl btn-gradient btn-shine text-white font-bold text-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed border-0"
            >
              Tiếp Theo →
            </button>
          </>
        ) : (
          /* Custom Time Mode */
          <>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-sm font-semibold text-[var(--color-text-secondary)] mb-2">
                  Bắt đầu
                </label>
                <input
                  type="time"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="w-full px-4 py-4 bg-[var(--color-surface-1)] border border-[var(--color-glass-border)] rounded-xl text-white text-lg focus:border-amber-500 outline-none transition-all text-center"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[var(--color-text-secondary)] mb-2">
                  Kết thúc
                </label>
                <input
                  type="time"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="w-full px-4 py-4 bg-[var(--color-surface-1)] border border-[var(--color-glass-border)] rounded-xl text-white text-lg focus:border-amber-500 outline-none transition-all text-center"
                />
              </div>
            </div>

            {calcHours(customStart, customEnd) > 0 && (
              <div className="bg-[rgba(245,158,11,0.1)] border border-[rgba(245,158,11,0.2)] rounded-xl px-4 py-3 mb-4 flex items-center justify-between">
                <span className="text-sm text-[var(--color-text-secondary)]">Tổng giờ:</span>
                <span className="text-xl font-bold text-amber-400">{calcHours(customStart, customEnd)}h</span>
              </div>
            )}

            {/* Note field */}
            <div className="mb-5">
              <label className="block text-sm font-semibold text-[var(--color-text-secondary)] mb-2">
                💬 Ghi chú <span className="text-[var(--color-text-muted)] font-normal">(không bắt buộc)</span>
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="VD: Mai em đi học sáng 8-12h, làm được chiều thôi..."
                rows={2}
                className="w-full px-4 py-3 bg-[var(--color-surface-1)] border border-[var(--color-glass-border)] rounded-xl text-white text-base focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition-all resize-none placeholder:text-[var(--color-text-muted)]"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setCustomMode(false);
                }}
                className="flex-1 py-4 rounded-2xl bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] font-semibold text-base cursor-pointer border-0 transition-all"
              >
                ← Chọn ca có sẵn
              </button>
              <button
                onClick={() => setStep('confirm')}
                disabled={calcHours(customStart, customEnd) <= 0}
                className="flex-1 py-4 rounded-2xl btn-gradient btn-shine text-white font-bold text-base cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed border-0"
              >
                Tiếp Theo →
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  // ========= STEP 3: XÁC NHẬN =========
  if (step === 'confirm') {
    const shift = customMode
      ? {
          icon: '⏰',
          label: 'Tùy chỉnh',
          startTime: customStart,
          endTime: customEnd,
          hours: calcHours(customStart, customEnd),
        }
      : selectedShift;

    return (
      <div className="glass rounded-3xl p-6 md:p-8 animate-fade-in-up">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-bold text-xl flex items-center gap-2">
            <span>📋</span> Xác Nhận
          </h3>
          <button
            onClick={() => setStep('shift')}
            className="text-sm text-[var(--color-text-muted)] hover:text-amber-400 cursor-pointer bg-transparent border-0 transition-colors"
          >
            ← Quay lại
          </button>
        </div>
        <p className="text-sm text-[var(--color-text-muted)] mb-6">Bước 3/3 • Kiểm tra lại</p>

        {/* Summary Card */}
        <div className="bg-[var(--color-surface-1)] rounded-2xl p-5 mb-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[var(--color-text-secondary)]">📅 Ngày:</span>
            <span className="font-bold text-white text-lg">{formatDateVN(selectedDate)}</span>
          </div>
          <div className="border-t border-[var(--color-glass-border)]" />
          <div className="flex items-center justify-between">
            <span className="text-[var(--color-text-secondary)]">{shift.icon} Ca làm:</span>
            <span className="font-bold text-white text-lg">{shift.label}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[var(--color-text-secondary)]">⏰ Giờ:</span>
            <span className="font-bold text-amber-400 text-lg">
              {shift.startTime} — {shift.endTime}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[var(--color-text-secondary)]">📊 Tổng:</span>
            <span className="font-extrabold text-gradient text-xl">{shift.hours} giờ</span>
          </div>
          {note && (
            <>
              <div className="border-t border-[var(--color-glass-border)]" />
              <div>
                <span className="text-[var(--color-text-secondary)] text-sm">💬 Ghi chú:</span>
                <p className="text-white mt-1 text-sm italic">{note}</p>
              </div>
            </>
          )}
        </div>

        {/* Confirm Button */}
        <button
          onClick={handleConfirm}
          disabled={loading}
          className="w-full py-5 rounded-2xl btn-gradient btn-shine text-white font-bold text-xl cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed border-0"
        >
          {loading ? '⏳ Đang lưu...' : '✅ Đăng Ký Ca Làm'}
        </button>
      </div>
    );
  }

  return null;
}
