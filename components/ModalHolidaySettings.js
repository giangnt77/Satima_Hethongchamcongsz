'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { getHolidaySettings, saveHolidaySettings } from '@/lib/supabase';
import { formatDateFull, getToday } from '@/lib/utils';
import VnDatePicker from './VnDatePicker';

const POPULAR_HOLIDAYS_SUGGESTIONS = [
  {
    name: 'Tết Dương Lịch (1/1)',
    multiplier: 2.0,
    isRange: false,
    getDate: (y) => `${y}-01-01`,
  },
  {
    name: 'Tết Nguyên Đán (Âm Lịch)',
    multiplier: 3.0,
    isRange: true,
    getRange: (y) => [`${y}-02-15`, `${y}-02-21`],
  },
  {
    name: 'Giỗ Tổ Hùng Vương (10/3 AL)',
    multiplier: 2.0,
    isRange: false,
    getDate: (y) => `${y}-04-26`,
  },
  {
    name: 'Lễ 30/4 - 1/5 (Thống Nhất & Lao Động)',
    multiplier: 2.0,
    isRange: true,
    getRange: (y) => [`${y}-04-30`, `${y}-05-01`],
  },
  {
    name: 'Lễ Quốc Khánh (2/9)',
    multiplier: 2.0,
    isRange: false,
    getDate: (y) => `${y}-09-02`,
  },
];

export default function ModalHolidaySettings({ isOpen, onClose, toast, onHolidaysUpdated }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form State
  const [holidayName, setHolidayName] = useState('');
  const [holidayDate, setHolidayDate] = useState(getToday());
  const [multiplier, setMultiplier] = useState(2.0);
  const [isRange, setIsRange] = useState(false);
  const [startDate, setStartDate] = useState(getToday());
  const [endDate, setEndDate] = useState(getToday());

  async function loadHolidays() {
    setLoading(true);
    try {
      const data = await getHolidaySettings();
      setHolidays(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isOpen) {
      loadHolidays();
    }
  }, [isOpen]);

  function applySuggestion(sug) {
    const currentYear = new Date().getFullYear();
    setHolidayName(sug.name);
    setMultiplier(sug.multiplier);
    if (sug.isRange && sug.getRange) {
      setIsRange(true);
      const [s, e] = sug.getRange(currentYear);
      setStartDate(s);
      setEndDate(e);
    } else if (sug.getDate) {
      setIsRange(false);
      setHolidayDate(sug.getDate(currentYear));
    }
  }

  // Thêm ngày lễ mới
  async function handleAddHoliday(e) {
    if (e) e.preventDefault();
    const cleanName = String(holidayName || '').trim();
    if (!cleanName) {
      if (toast) toast.warning('Thiếu thông tin', 'Vui lòng nhập tên dịp Lễ / Tết!');
      return;
    }

    const multNum = Number(multiplier) || 2.0;
    if (multNum <= 0) {
      if (toast) toast.warning('Hệ số không hợp lệ', 'Hệ số lương phải lớn hơn 0 (ví dụ x2, x3)!');
      return;
    }

    const newHoliday = {
      id: `h_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      name: cleanName,
      multiplier: multNum,
      createdAt: new Date().toISOString(),
    };

    if (isRange) {
      if (startDate > endDate) {
        if (toast) toast.warning('Ngày không hợp lệ', 'Ngày bắt đầu không được lớn hơn ngày kết thúc!');
        return;
      }
      newHoliday.startDate = startDate;
      newHoliday.endDate = endDate;
    } else {
      newHoliday.date = holidayDate || getToday();
    }

    const updatedList = [...holidays, newHoliday];
    setHolidays(updatedList);
    setSaving(true);

    try {
      await saveHolidaySettings(updatedList);
      if (toast) toast.success('Đã thêm ngày lễ!', `🎉 Đã cấu hình ${cleanName} (x${multNum} Lương)`);
      if (onHolidaysUpdated) onHolidaysUpdated(updatedList);
      
      // Reset form
      setHolidayName('');
    } catch (err) {
      console.error(err);
      if (toast) toast.error('Lỗi', 'Không thể lưu ngày lễ vào hệ thống');
    } finally {
      setSaving(false);
    }
  }

  // Xóa ngày lễ
  async function handleDeleteHoliday(holidayId) {
    const updatedList = holidays.filter((h) => h.id !== holidayId);
    setHolidays(updatedList);
    setSaving(true);
    try {
      await saveHolidaySettings(updatedList);
      if (toast) toast.success('Đã xóa', 'Đã gỡ bỏ ngày lễ khỏi danh sách');
      if (onHolidaysUpdated) onHolidaysUpdated(updatedList);
    } catch (err) {
      console.error(err);
      if (toast) toast.error('Lỗi', 'Không thể cập nhật danh sách ngày lễ');
    } finally {
      setSaving(false);
    }
  }

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-fade-in"
    >
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col border-2 border-purple-300 shadow-2xl overflow-hidden animate-scale-in">
        {/* Header Bar */}
        <div className="px-5 py-4 bg-gradient-to-r from-purple-950 via-purple-900 to-indigo-950 text-white flex items-center justify-between gap-3 border-b-2 border-purple-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">🎉</span>
            <div>
              <h3 className="font-black text-base sm:text-lg text-white uppercase tracking-tight">
                Cấu Hình Ngày Lễ (x2, x3 Lương)
              </h3>
              <p className="text-xs text-amber-300 font-extrabold">
                Tự động nhân hệ số lương cho nhân viên đi làm vào ngày Lễ / Tết
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-purple-800/80 text-purple-200 hover:bg-rose-600 hover:text-white border-0 flex items-center justify-center cursor-pointer text-sm font-black transition-all active:scale-90"
            title="Đóng"
          >
            ✕
          </button>
        </div>

        {/* Nội dung chính */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 custom-scrollbar flex-1 bg-slate-50/60">
          {/* FORM THÊM NGÀY LỄ */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-purple-200 shadow-2xs space-y-3.5">
            <h4 className="font-black text-xs sm:text-sm text-purple-950 uppercase tracking-tight flex items-center gap-1.5">
              <span>➕</span> Thêm Ngày Lễ / Tết Mới
            </h4>

            {/* Gợi ý ngày lễ nhanh */}
            <div>
              <span className="text-[11px] font-black text-purple-800 block mb-1.5">
                💡 Gợi ý ngày lễ phổ biến tại Việt Nam (Bấm để tự động điền thông tin):
              </span>
              <div className="flex flex-wrap gap-1.5">
                {POPULAR_HOLIDAYS_SUGGESTIONS.map((sug, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => applySuggestion(sug)}
                    className="px-2.5 py-1 rounded-xl text-[11px] font-black bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200 cursor-pointer transition-all active:scale-95 shadow-2xs flex items-center gap-1 hover:border-purple-300"
                  >
                    <span>🎉</span>
                    <span>{sug.name}</span>
                    <span className="text-amber-700 bg-amber-100 px-1 py-0.2 rounded font-black">
                      x{sug.multiplier}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Form Fields */}
            <form onSubmit={handleAddHoliday} className="space-y-3 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                {/* Tên dịp lễ */}
                <div className="sm:col-span-7">
                  <label className="block text-xs font-black text-purple-950 uppercase mb-1">
                    Tên Dịp Lễ / Tết
                  </label>
                  <input
                    type="text"
                    value={holidayName}
                    onChange={(e) => setHolidayName(e.target.value)}
                    placeholder="VD: Lễ Quốc Khánh 2/9, Tết Nguyên Đán..."
                    className="w-full px-3 py-2 bg-white border border-purple-200 rounded-xl text-purple-950 text-xs sm:text-sm font-black outline-none focus:border-purple-600 placeholder:text-purple-400 h-[40px] shadow-2xs"
                  />
                </div>

                {/* Chọn hệ số lương */}
                <div className="sm:col-span-5">
                  <label className="block text-xs font-black text-purple-950 uppercase mb-1">
                    Hệ Số Lương (Nhân)
                  </label>
                  <div className="flex items-center gap-1">
                    {[1.5, 2.0, 2.5, 3.0].map((mVal) => (
                      <button
                        key={mVal}
                        type="button"
                        onClick={() => setMultiplier(mVal)}
                        className={`flex-1 py-1.5 rounded-xl text-xs font-black cursor-pointer border transition-all h-[40px] shadow-2xs ${
                          multiplier === mVal
                            ? 'bg-amber-400 text-purple-950 border-amber-500 font-black ring-2 ring-amber-400/80 shadow-xs'
                            : 'bg-purple-50 hover:bg-purple-100 text-purple-900 border-purple-200'
                        }`}
                      >
                        x{mVal}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Lựa chọn Ngày đơn lẻ hay Khoảng ngày */}
              <div className="pt-1">
                <label className="inline-flex items-center gap-2 text-xs font-black text-purple-900 cursor-pointer select-none bg-purple-50/80 hover:bg-purple-100/70 px-3 py-1.5 rounded-xl border border-purple-200/80 transition-colors">
                  <input
                    type="checkbox"
                    checked={isRange}
                    onChange={(e) => setIsRange(e.target.checked)}
                    className="w-4 h-4 rounded text-purple-700 focus:ring-purple-500 cursor-pointer"
                  />
                  <span>Áp dụng theo khoảng ngày (Kỳ nghỉ dài / Tết)</span>
                </label>
              </div>

              {/* Ngày áp dụng */}
              {!isRange ? (
                <div className="p-2.5 bg-purple-50/60 rounded-2xl border border-purple-200/80 space-y-1">
                  <label className="block text-xs font-black text-purple-950 uppercase">
                    📅 Ngày Áp Dụng Lễ
                  </label>
                  <VnDatePicker value={holidayDate} onChange={setHolidayDate} />
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="p-2.5 bg-purple-50/60 rounded-2xl border border-purple-200/80 space-y-1">
                    <label className="block text-xs font-black text-purple-950 uppercase">
                      📅 Từ Ngày (Bắt đầu)
                    </label>
                    <VnDatePicker value={startDate} onChange={setStartDate} />
                  </div>
                  <div className="p-2.5 bg-purple-50/60 rounded-2xl border border-purple-200/80 space-y-1">
                    <label className="block text-xs font-black text-purple-950 uppercase">
                      📅 Đến Ngày (Kết thúc)
                    </label>
                    <VnDatePicker value={endDate} onChange={setEndDate} />
                  </div>
                </div>
              )}

              {/* Nút Thêm */}
              <button
                type="submit"
                disabled={saving || !holidayName.trim()}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-800 to-indigo-700 hover:from-purple-900 hover:to-indigo-800 text-white font-black text-xs sm:text-sm border-0 shadow-md cursor-pointer transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                <span>{saving ? '⏳ Đang lưu...' : '🎉 Thêm Ngày Lễ (Nhân Lương)'}</span>
              </button>
            </form>
          </div>

          {/* DANH SÁCH CÁC NGÀY LỄ ĐÃ CẤU HÌNH */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-purple-200 shadow-2xs space-y-3">
            <h4 className="font-black text-xs sm:text-sm text-purple-950 uppercase tracking-tight flex items-center justify-between border-b border-purple-100 pb-2">
              <span className="flex items-center gap-1.5">
                <span>📋</span> Danh Sách Ngày Lễ Được Nhân Lương ({holidays.length})
              </span>
            </h4>

            {loading ? (
              <div className="text-center py-6 text-purple-600 font-bold text-xs">
                ⏳ Đang tải dữ liệu ngày lễ...
              </div>
            ) : holidays.length === 0 ? (
              <div className="text-center py-6 text-slate-400 font-bold text-xs italic bg-purple-50/40 rounded-xl border border-dashed border-purple-200">
                Chưa có ngày lễ nào được cấu hình. Thêm ngày lễ ở trên để tự động nhân lương x2, x3 khi nhân viên đi làm!
              </div>
            ) : (
              <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1 custom-scrollbar">
                {holidays.map((h) => {
                  const dateDisplay = h.startDate && h.endDate
                    ? `${formatDateFull(h.startDate)} — ${formatDateFull(h.endDate)}`
                    : formatDateFull(h.date || '');

                  return (
                    <div
                      key={h.id}
                      className="p-3 bg-gradient-to-r from-purple-50/90 to-amber-50/60 hover:bg-purple-100/80 rounded-2xl border border-purple-200/90 flex items-center justify-between gap-3 shadow-2xs transition-all"
                    >
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-black text-xs sm:text-sm text-purple-950">
                            {h.name}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-amber-400 text-purple-950 text-[10.5px] font-black border border-amber-500 shadow-2xs">
                            x{h.multiplier} LƯƠNG
                          </span>
                        </div>
                        <div className="text-[11px] font-extrabold text-purple-800">
                          📅 {dateDisplay}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteHoliday(h.id)}
                        disabled={saving}
                        className="w-7 h-7 rounded-xl bg-white hover:bg-rose-600 hover:text-white text-rose-700 text-xs font-black border border-rose-200 cursor-pointer flex items-center justify-center transition-all shadow-2xs active:scale-95"
                        title="Xóa ngày lễ này"
                      >
                        🗑️
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-white border-t border-purple-100 flex items-center justify-between shrink-0">
          <span className="text-[11px] font-bold text-slate-500">
            ℹ️ Tiền lương ca làm vào các ngày lễ trên sẽ tự động được nhân theo đúng hệ số.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-purple-100 hover:bg-purple-200 text-purple-950 text-xs font-black border-0 cursor-pointer transition-all active:scale-95"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

