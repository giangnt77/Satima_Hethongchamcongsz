'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { formatDateWithDayVN } from '@/lib/utils';

export default function ModalAdjustedShiftsList({
  isOpen,
  onClose,
  shifts = [],
  employees = [],
  branches = [],
  startDate,
  endDate,
  isWeekLocked,
}) {
  const [mounted, setMounted] = useState(false);
  const [filterEmpId, setFilterEmpId] = useState('all');

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !mounted) return null;

  // Lọc các ca có ghi nhận điều chỉnh (chứa [Gốc:, [Ca gốc:, tăng ca, làm thay, về sớm)
  const adjustedShifts = shifts.filter((s) => {
    if (!s || !s.note) return false;
    const n = s.note.toLowerCase();
    return (
      n.includes('[gốc:') ||
      n.includes('[ca gốc:') ||
      n.includes('làm thay') ||
      n.includes('tăng ca') ||
      n.includes('về sớm') ||
      n.includes('gánh ca')
    );
  });

  const filteredList = adjustedShifts.filter((s) => {
    if (filterEmpId === 'all') return true;
    return s.employee_id === filterEmpId;
  });

  return createPortal(
    <div className="fixed inset-0 z-[99999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fade-in">
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-purple-200 overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-purple-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">📋</span>
            <div>
              <h3 className="font-black text-sm sm:text-base">
                Nhật Ký Điều Chỉnh Ca Trong Tuần
              </h3>
              <p className="text-xs text-purple-200 font-bold">
                {startDate} ➔ {endDate} {isWeekLocked ? '(Tuần Đã Chốt)' : '(Chưa Chốt Lịch)'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center text-sm font-black cursor-pointer transition-all"
          >
            ✕
          </button>
        </div>

        {/* Filter Toolbar */}
        <div className="p-3 bg-purple-50/80 border-b border-purple-200 flex items-center justify-between gap-2 flex-wrap text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-purple-950">Lọc nhân viên:</span>
            <select
              value={filterEmpId}
              onChange={(e) => setFilterEmpId(e.target.value)}
              className="px-2.5 py-1 bg-white border border-purple-200 rounded-lg text-purple-950 font-bold outline-none cursor-pointer"
            >
              <option value="all">Tất cả ({adjustedShifts.length} ca đổi)</option>
              {employees
                .filter((e) => adjustedShifts.some((s) => s.employee_id === e.id))
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
            </select>
          </div>
          <span className="text-purple-700 font-extrabold">
            Tổng cộng: {filteredList.length} ca điều chỉnh
          </span>
        </div>

        {/* Content List */}
        <div className="p-3 sm:p-4 overflow-y-auto flex-1 space-y-2.5">
          {filteredList.length === 0 ? (
            <div className="text-center py-10 text-purple-400 font-bold text-xs">
              <span className="text-3xl block mb-2">✨</span>
              Tuần này không có ca nào phát sinh làm thay hoặc điều chỉnh giờ.
            </div>
          ) : (
            filteredList.map((shift) => {
              const emp = employees.find((e) => e.id === shift.employee_id);
              const branch = branches.find((b) => b.id === shift.branch_id);
              const sTime = shift.start_time ? shift.start_time.slice(0, 5) : '';
              const eTime = shift.end_time ? shift.end_time.slice(0, 5) : '';

              return (
                <div
                  key={shift.id}
                  className="p-3 rounded-2xl bg-purple-50/50 border border-purple-200/80 hover:border-purple-300 transition-all space-y-1.5"
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-purple-950 text-sm">
                        {emp?.name || 'Nhân viên'}
                      </span>
                      <span
                        className="px-2 py-0.5 rounded-md font-bold text-[11px] text-white"
                        style={{ backgroundColor: branch?.color || '#9333ea' }}
                      >
                        {branch?.name || 'Chi nhánh'}
                      </span>
                    </div>
                    <span className="font-extrabold text-purple-900 bg-white px-2 py-0.5 rounded-lg border border-purple-200">
                      {formatDateWithDayVN(shift.date)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs bg-white p-2 rounded-xl border border-purple-100">
                    <div>
                      <span className="font-bold text-purple-900">Giờ làm: </span>
                      <b className="text-purple-950 font-black">
                        {sTime} - {eTime}
                      </b>{' '}
                      <span className="text-purple-600 font-extrabold">
                        ({shift.hours || 0} tiếng)
                      </span>
                    </div>
                  </div>

                  <div className="text-xs bg-purple-100/70 p-2 rounded-xl border border-purple-200 text-purple-950 font-bold flex items-start gap-1.5">
                    <span>⚡</span>
                    <span className="flex-1 font-black">{shift.note}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-purple-50 border-t border-purple-200 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-purple-900 hover:bg-purple-950 text-white font-black text-xs cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
