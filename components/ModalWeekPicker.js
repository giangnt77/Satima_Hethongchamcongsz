'use client';

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { getMondayOfCurrentWeek, getToday } from '@/lib/utils';

/**
 * Lấy danh sách tất cả các tuần (Thứ 2 -> Chủ Nhật) của một Năm
 */
export function getAllWeeksOfYear(year) {
  const weeks = [];
  let d = new Date(year, 0, 1);
  const day = d.getDay(); // 0: CN, 1: T2...
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);

  let weekNum = 1;
  while (true) {
    const mon = new Date(d);
    const sun = new Date(d);
    sun.setDate(sun.getDate() + 6);

    const monY = mon.getFullYear();
    const sunY = sun.getFullYear();

    // Nếu cả Thứ 2 và Chủ Nhật đều thuộc năm sau thì dừng
    if (monY > year) break;

    const monStr = `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, '0')}-${String(mon.getDate()).padStart(2, '0')}`;
    const sunStr = `${sun.getFullYear()}-${String(sun.getMonth() + 1).padStart(2, '0')}-${String(sun.getDate()).padStart(2, '0')}`;

    const monDisplay = `${String(mon.getDate()).padStart(2, '0')}/${String(mon.getMonth() + 1).padStart(2, '0')}`;
    const sunDisplay = `${String(sun.getDate()).padStart(2, '0')}/${String(sun.getMonth() + 1).padStart(2, '0')}`;

    // Tháng đại diện (dựa vào giữa tuần - Thứ 5)
    const midWeek = new Date(mon);
    midWeek.setDate(midWeek.getDate() + 3);
    const month = midWeek.getMonth() + 1;

    weeks.push({
      weekNumber: weekNum,
      mondayStr: monStr,
      sundayStr: sunStr,
      displayRange: `${monDisplay} — ${sunDisplay}`,
      fullLabel: `Tuần ${weekNum} (${monDisplay} — ${sunDisplay}/${sunY})`,
      month,
      year,
    });

    d.setDate(d.getDate() + 7);
    weekNum++;
    if (weekNum > 54) break;
  }

  return weeks;
}

export default function ModalWeekPicker({ isOpen, onClose, currentMonday, onSelectMonday }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const currentMondayToday = getMondayOfCurrentWeek();
  const initialYear = currentMonday ? parseInt(currentMonday.split('-')[0], 10) : new Date().getFullYear();

  const [selectedYear, setSelectedYear] = useState(initialYear || new Date().getFullYear());
  const [selectedMonthFilter, setSelectedMonthFilter] = useState('all'); // 'all' hoặc 1 -> 12

  const allWeeks = useMemo(() => getAllWeeksOfYear(selectedYear), [selectedYear]);

  const filteredWeeks = useMemo(() => {
    if (selectedMonthFilter === 'all') return allWeeks;
    return allWeeks.filter((w) => w.month === Number(selectedMonthFilter));
  }, [allWeeks, selectedMonthFilter]);

  const availableYears = [2024, 2025, 2026, 2027, 2028];

  function handleSelectWeek(monStr) {
    if (onSelectMonday) {
      onSelectMonday(monStr);
    }
    if (onClose) {
      onClose();
    }
  }

  function handleGoCurrentWeek() {
    handleSelectWeek(currentMondayToday);
  }

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[99999] bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-fade-in"
    >
      <div
        className="bg-white rounded-3xl max-w-xl w-full p-4 sm:p-6 shadow-2xl border border-purple-200/90 space-y-4 animate-scale-in max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Modal */}
        <div className="flex items-center justify-between border-b border-purple-100 pb-3 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-2xl">📅</span>
            <div>
              <h3 className="text-base sm:text-lg font-black text-purple-950 tracking-tight">
                Chọn Tuần & Năm
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-purple-100 text-purple-700 hover:bg-rose-600 hover:text-white border-0 flex items-center justify-center cursor-pointer text-xs font-black transition-all"
          >
            ✕
          </button>
        </div>

        {/* BỘ CHỌN NĂM (YEAR SWITCHER) */}
        <div className="space-y-1.5 shrink-0">
          <div className="flex items-center justify-between text-xs font-black text-purple-950 uppercase">
            <span>1. Chọn Năm:</span>
            <button
              type="button"
              onClick={handleGoCurrentWeek}
              className="px-2.5 py-1 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-black text-[11px] border-0 cursor-pointer shadow-2xs transition-all active:scale-95 flex items-center gap-1"
            >
              <span>⚡</span> Về Tuần Hiện Tại
            </button>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {availableYears.map((yr) => (
              <button
                key={yr}
                type="button"
                onClick={() => setSelectedYear(yr)}
                className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-black cursor-pointer transition-all border ${selectedYear === yr
                    ? 'bg-purple-700 text-white border-purple-800 shadow-md scale-[1.02]'
                    : 'bg-purple-50 hover:bg-purple-100 text-purple-950 border-purple-200'
                  }`}
              >
                Năm {yr}
              </button>
            ))}
          </div>
        </div>

        {/* BỘ LỌC THÁNG (MONTH PILLS) */}
        <div className="space-y-1.5 shrink-0">
          <label className="block text-xs font-black text-purple-950 uppercase">
            2. Lọc Theo Tháng Trong Năm {selectedYear}:
          </label>
          <div className="flex items-center gap-1 overflow-x-auto pb-1 custom-scrollbar">
            <button
              type="button"
              onClick={() => setSelectedMonthFilter('all')}
              className={`px-2.5 py-1 rounded-lg text-xs font-black cursor-pointer whitespace-nowrap transition-all border shrink-0 ${selectedMonthFilter === 'all'
                  ? 'bg-amber-400 text-purple-950 border-amber-500 shadow-2xs font-black'
                  : 'bg-white text-purple-900 border-purple-200 hover:bg-purple-50'
                }`}
            >
              Tất Cả 52 Tuần
            </button>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setSelectedMonthFilter(String(m))}
                className={`px-2.5 py-1 rounded-lg text-xs font-black cursor-pointer whitespace-nowrap transition-all border shrink-0 ${selectedMonthFilter === String(m)
                    ? 'bg-amber-400 text-purple-950 border-amber-500 shadow-2xs font-black'
                    : 'bg-white text-purple-900 border-purple-200 hover:bg-purple-50'
                  }`}
              >
                Tháng {m}
              </button>
            ))}
          </div>
        </div>

        {/* DANH SÁCH CÁC TUẦN (GRID OF WEEKS) */}
        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar min-h-[220px]">
          <div className="text-xs font-black text-purple-950 uppercase mb-1">
            3. Chọn Tuần Làm Việc ({filteredWeeks.length} tuần):
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {filteredWeeks.map((w) => {
              const isSelected = w.mondayStr === currentMonday;
              const isCurrentWeek = w.mondayStr === currentMondayToday;

              return (
                <button
                  key={w.mondayStr}
                  type="button"
                  onClick={() => handleSelectWeek(w.mondayStr)}
                  className={`p-2.5 rounded-2xl border text-left cursor-pointer transition-all active:scale-98 flex items-center justify-between gap-2 shadow-2xs ${isSelected
                      ? 'bg-purple-900 text-white border-purple-800 ring-2 ring-purple-400 font-black shadow-md'
                      : isCurrentWeek
                        ? 'bg-amber-50 text-purple-950 border-amber-300 hover:bg-amber-100 font-bold'
                        : 'bg-purple-50/60 hover:bg-purple-100/80 text-purple-950 border-purple-200/80'
                    }`}
                >
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs font-black ${isSelected ? 'text-amber-300' : 'text-purple-950'}`}>
                        Tuần {w.weekNumber}
                      </span>
                      {isCurrentWeek && (
                        <span className="px-1.5 py-0.2 rounded-full bg-amber-400 text-purple-950 text-[9px] font-black shadow-2xs">
                          Hiện tại
                        </span>
                      )}
                      {isSelected && (
                        <span className="px-1.5 py-0.2 rounded-full bg-purple-700 text-amber-300 text-[9px] font-black border border-purple-600">
                          Đang xem
                        </span>
                      )}
                    </div>
                    <div className={`text-[11px] font-mono mt-0.5 ${isSelected ? 'text-purple-200' : 'text-purple-800 font-bold'}`}>
                      📅 {w.displayRange}/{w.year}
                    </div>
                  </div>

                  <div className={`text-xs font-black px-2 py-1 rounded-xl ${isSelected ? 'bg-purple-800 text-white' : 'bg-white text-purple-900 border border-purple-200 shadow-2xs'}`}>
                    Chọn ➔
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="pt-2 border-t border-purple-100 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-purple-700 font-bold">
            💡 Gợi ý: Tuần bắt đầu từ Thứ 2 đến Chủ Nhật theo chuẩn xếp ca.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-purple-100 hover:bg-purple-200 text-purple-950 text-xs font-black border-0 cursor-pointer transition-all active:scale-95"
          >
            ✕ Đóng
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
