'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { getBlockedOffDays, saveBlockedOffDays } from '@/lib/supabase';

const DAYS_OPTIONS = [
  { dayIndex: 1, label: 'Thứ 2' },
  { dayIndex: 2, label: 'Thứ 3' },
  { dayIndex: 3, label: 'Thứ 4' },
  { dayIndex: 4, label: 'Thứ 5' },
  { dayIndex: 5, label: 'Thứ 6' },
  { dayIndex: 6, label: 'Thứ 7' },
  { dayIndex: 0, label: 'Chủ Nhật' },
];

export default function ModalBlockOffDays({ isOpen, onClose, toast, onSaved }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // blockedMap: { [dayIndex]: reasonString }
  const [blockedMap, setBlockedMap] = useState({});
  const [saving, setSaving] = useState(false);

  async function loadSettings() {
    try {
      const data = await getBlockedOffDays();
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        if (Array.isArray(data.blockedDays)) {
          const map = {};
          data.blockedDays.forEach((dIdx) => {
            map[dIdx] = data.reason || 'Ngày cao điểm đông khách, quán yêu cầu nhân sự đi làm đầy đủ!';
          });
          setBlockedMap(map);
        } else {
          setBlockedMap(data);
        }
      } else if (Array.isArray(data)) {
        const map = {};
        data.forEach((dIdx) => {
          map[dIdx] = 'Ngày cao điểm đông khách, quán yêu cầu nhân sự đi làm đầy đủ!';
        });
        setBlockedMap(map);
      }
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

  function toggleDay(dayIndex) {
    setBlockedMap((prev) => {
      const next = { ...prev };
      if (next[dayIndex] !== undefined) {
        delete next[dayIndex];
      } else {
        const dayObj = DAYS_OPTIONS.find((d) => d.dayIndex === dayIndex);
        const defaultReason = dayIndex === 6 || dayIndex === 0
          ? 'Ngày cao điểm cuối tuần đông khách!'
          : `Ngày ${dayObj?.label || ''} kh được xin nghỉ!`;
        next[dayIndex] = defaultReason;
      }
      return next;
    });
  }

  function handleReasonChange(dayIndex, newReason) {
    setBlockedMap((prev) => ({
      ...prev,
      [dayIndex]: newReason,
    }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveBlockedOffDays(blockedMap);
      if (toast) toast.success('Đã lưu quy định!', 'Đã cập nhật ngày không được nghỉ & lý do riêng cho từng thứ!');
      if (onSaved) onSaved(blockedMap);
      onClose();
    } catch (err) {
      console.error(err);
      if (toast) toast.error('Lỗi', 'Không thể lưu quy định không được xin nghỉ');
    }
    setSaving(false);
  }

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[99999] bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-purple-200/90 space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-purple-100 pb-3">
          <div>
            <h3 className="text-lg sm:text-xl font-black text-purple-950 tracking-tight flex items-center gap-2">
              <span>🚫</span> Quy Định Không Được Xin Nghỉ
            </h3>
            <p className="text-xs text-purple-700 font-bold mt-0.5">
              Bấm chọn Thứ để Kh được nghỉ & nhập lý do riêng cho Thứ đó.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-purple-100 text-purple-900 font-black flex items-center justify-center hover:bg-purple-200 text-sm cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Danh sách các Thứ trong tuần */}
        <div className="space-y-3">
          <label className="text-xs font-black text-purple-950 block uppercase tracking-wider">
            Danh sách Ngày Trong Tuần (Bấm nút để Bật/Tắt Kh Được Nghỉ):
          </label>

          <div className="space-y-2.5">
            {DAYS_OPTIONS.map((item) => {
              const isBlocked = blockedMap[item.dayIndex] !== undefined;
              const reason = blockedMap[item.dayIndex] || '';

              return (
                <div
                  key={item.dayIndex}
                  className={`p-3 rounded-2xl border transition-all ${
                    isBlocked
                      ? 'bg-rose-50/90 border-rose-300 shadow-2xs space-y-2'
                      : 'bg-purple-50/50 border-purple-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-black text-sm text-purple-950">
                      {item.label}
                    </span>

                    <button
                      type="button"
                      onClick={() => toggleDay(item.dayIndex)}
                      className={`py-1.5 px-3 rounded-xl font-black text-xs border cursor-pointer transition-all active:scale-95 shadow-2xs flex items-center gap-1 ${
                        isBlocked
                          ? 'bg-rose-600 text-white border-rose-700 font-black animate-pulse'
                          : 'bg-emerald-100 text-emerald-950 border-emerald-300 font-bold hover:bg-emerald-200'
                      }`}
                    >
                      <span>{isBlocked ? '🚫 KH ĐƯỢC NGHỈ' : '✅ Cho Phép Nghỉ'}</span>
                    </button>
                  </div>

                  {/* Khi chọn KH ĐƯỢC NGHỈ ➔ Hiện ngay ô nhập Ghi chú Lý do cấm riêng cho Thứ đó */}
                  {isBlocked && (
                    <div className="animate-fade-in space-y-1 pt-1 border-t border-rose-200">
                      <label className="text-[11px] font-black text-rose-950 flex items-center gap-1">
                        <span>📝</span>
                        <span>Nhập lý do tại sao {item.label} kh được nghỉ:</span>
                      </label>
                      <input
                        type="text"
                        value={reason}
                        onChange={(e) => handleReasonChange(item.dayIndex, e.target.value)}
                        placeholder={`Ví dụ: ${item.label} ngày cao điểm đông khách...`}
                        className="w-full px-3 py-1.5 bg-white border border-rose-300 rounded-xl text-xs font-black text-purple-950 focus:border-rose-600 outline-none transition-all"
                      />
                      {/* Nút gợi ý nhanh */}
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        {[
                          '🔥 Ngày cao điểm đông khách',
                          '🎆 Lễ Tết quán cần đủ nhân sự',
                          '📌 Cuối tuần cần đi làm đầy đủ',
                        ].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => handleReasonChange(item.dayIndex, preset)}
                            className="px-2 py-0.5 rounded-md bg-white hover:bg-rose-100 text-rose-950 text-[10px] font-bold border border-rose-200 cursor-pointer"
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer Buttons */}
        <div className="flex gap-2 pt-2 border-t border-purple-100">
          <button
            type="button"
            onClick={onClose}
            className="py-2.5 px-4 rounded-xl bg-purple-100 text-purple-900 font-black text-xs cursor-pointer border-0"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-black text-xs cursor-pointer border-0 shadow-2xs"
          >
            {saving ? '⏳ Đang lưu...' : '✅ Lưu Quy Định'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
