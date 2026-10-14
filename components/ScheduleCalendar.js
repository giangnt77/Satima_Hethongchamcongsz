'use client';

import { useState, useEffect, useMemo } from 'react';
import { getScheduleByDateRange, getBranches } from '@/lib/supabase';
import {
  getCalendarDays,
  getToday,
  formatDateISO,
  getMondayOfCurrentWeek,
  getWeekDaysFromMonday,
} from '@/lib/utils';

/**
 * ScheduleCalendar — Calendar tháng hiển thị lịch làm việc chính thức.
 * Mỗi ô ngày: hiển thị rõ tên chi nhánh, tên nhân viên và số giờ làm.
 */

const MONTH_NAMES = [
  'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4',
  'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8',
  'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
];

const DAY_HEADERS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

function formatBranchDisplayName(name = '') {
  if (!name) return '';
  const n = String(name).trim();
  if (n.toLowerCase().includes('thạch lam') || n.toLowerCase().includes('thach lam') || n.toUpperCase() === 'TL') {
    return 'TL';
  }
  return n;
}

export default function ScheduleCalendar({ highlightEmployeeId }) {
  const today = getToday();
  const [currentMonday, setCurrentMonday] = useState(getMondayOfCurrentWeek());
  const [showPastDays, setShowPastDays] = useState(false); // Mặc định ẨN ngày đã qua trong tuần

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const [schedule, setSchedule] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(today);

  // View Mode: 'list' (Mobile Weekly Focus Card List) | 'calendar' (30 Day Grid)
  const [viewMode, setViewMode] = useState('list');
  // Filter: 'my_shifts' | 'all'
  const [filterMode, setFilterMode] = useState(highlightEmployeeId ? 'my_shifts' : 'all');

  const weekDays = useMemo(() => getWeekDaysFromMonday(currentMonday), [currentMonday]);
  const startWeekLabel = weekDays[0].split('-').reverse().slice(0, 2).join('/');
  const endWeekLabel = weekDays[6].split('-').reverse().join('/');

  useEffect(() => {
    loadData();
  }, [viewMode, currentMonday, year, month]);

  async function loadData() {
    setLoading(true);
    try {
      let startDate, endDate;
      if (viewMode === 'list') {
        startDate = weekDays[0];
        endDate = weekDays[6];
      } else {
        const mStr = String(month + 1).padStart(2, '0');
        const lastDay = new Date(year, month + 1, 0).getDate();
        startDate = `${year}-${mStr}-01`;
        endDate = `${year}-${mStr}-${String(lastDay).padStart(2, '0')}`;
      }

      const [schedData, branchData] = await Promise.all([
        getScheduleByDateRange(startDate, endDate),
        getBranches(),
      ]);
      setSchedule(schedData);
      setBranches(branchData);
    } catch (err) {
      console.error('Error loading schedule calendar data:', err);
    }
    setLoading(false);
  }

  // Group schedule by date
  const scheduleByDate = useMemo(() => {
    const map = {};
    schedule.forEach((item) => {
      if (!map[item.date]) map[item.date] = [];
      map[item.date].push(item);
    });
    return map;
  }, [schedule]);

  // Calendar days
  const calendarDays = useMemo(
    () => getCalendarDays(year, month),
    [year, month]
  );

  // Agenda Dates List for Mobile Weekly View (Auto hide past days, focus Today)
  const agendaDatesList = useMemo(() => {
    const dates = viewMode === 'list' ? weekDays : Object.keys(scheduleByDate).sort();

    return dates
      .map((dStr) => {
        const items = scheduleByDate[dStr] || [];
        const myItems = highlightEmployeeId
          ? items.filter((s) => s.employee_id === highlightEmployeeId)
          : [];
        return {
          date: dStr,
          items,
          myItems,
          hasMyShift: myItems.length > 0,
          isPast: dStr < today,
          isToday: dStr === today,
        };
      })
      .filter((group) => {
        // Nếu ở chế độ Ẩn ngày quá khứ -> Lọc bỏ các ngày trước hôm nay
        if (viewMode === 'list' && !showPastDays && group.isPast) {
          return false;
        }
        if (filterMode === 'my_shifts') return group.hasMyShift;
        return group.items.length > 0;
      });
  }, [scheduleByDate, highlightEmployeeId, filterMode, viewMode, weekDays, showPastDays, today]);

  function prevWeek() {
    const [y, m, d] = currentMonday.split('-').map(Number);
    const prevMon = new Date(y, m - 1, d - 7);
    setCurrentMonday(formatDateISO(prevMon));
  }

  function nextWeek() {
    const [y, m, d] = currentMonday.split('-').map(Number);
    const nextMon = new Date(y, m - 1, d + 7);
    setCurrentMonday(formatDateISO(nextMon));
  }

  function resetToThisWeek() {
    setCurrentMonday(getMondayOfCurrentWeek());
  }

  function prevMonth() {
    let newYear = year;
    let newMonth = month;
    if (month === 0) {
      newMonth = 11;
      newYear = year - 1;
    } else {
      newMonth = month - 1;
    }
    setYear(newYear);
    setMonth(newMonth);
    const newMonthStr = `${newYear}-${String(newMonth + 1).padStart(2, '0')}`;
    setSelectedDate(today.startsWith(newMonthStr) ? today : `${newMonthStr}-01`);
  }

  function nextMonth() {
    let newYear = year;
    let newMonth = month;
    if (month === 11) {
      newMonth = 0;
      newYear = year + 1;
    } else {
      newMonth = month + 1;
    }
    setYear(newYear);
    setMonth(newMonth);
    const newMonthStr = `${newYear}-${String(newMonth + 1).padStart(2, '0')}`;
    setSelectedDate(today.startsWith(newMonthStr) ? today : `${newMonthStr}-01`);
  }

  // Get selected day detail
  const selectedDaySchedule = selectedDate ? (scheduleByDate[selectedDate] || []) : [];

  return (
    <div className="glass rounded-3xl overflow-hidden border border-[var(--color-glass-border)] shadow-xl">
      {/* Month/Week Header & Controls */}
      <div className="p-4 border-b border-[var(--color-glass-border)] space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          {viewMode === 'list' ? (
            /* Điều hướng Tuần cho Chế độ Danh Sách */
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={prevWeek}
                className="px-2.5 py-1.5 rounded-xl bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] hover:text-white transition-all text-xs font-bold cursor-pointer border-0"
                title="Tuần trước"
              >
                ◀ Tuần trước
              </button>
              <button
                type="button"
                onClick={resetToThisWeek}
                className="px-2.5 py-1.5 rounded-xl bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 transition-all text-xs font-black border border-amber-500/30 cursor-pointer"
              >
                Tuần này
              </button>
              <button
                type="button"
                onClick={nextWeek}
                className="px-2.5 py-1.5 rounded-xl bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] hover:text-white transition-all text-xs font-bold cursor-pointer border-0"
                title="Tuần sau"
              >
                Tuần sau ▶
              </button>
            </div>
          ) : (
            /* Điều hướng Tháng cho Chế độ Ô Lịch */
            <div className="flex items-center gap-2">
              <button
                onClick={prevMonth}
                className="w-9 h-9 flex items-center justify-center rounded-xl bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] hover:text-white transition-all text-xs font-bold cursor-pointer border-0"
              >
                ◀
              </button>
              <h3 className="font-extrabold text-base text-white">
                📅 {MONTH_NAMES[month]} {year}
              </h3>
              <button
                onClick={nextMonth}
                className="w-9 h-9 flex items-center justify-center rounded-xl bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] hover:text-white transition-all text-xs font-bold cursor-pointer border-0"
              >
                ▶
              </button>
            </div>
          )}

          {/* Toggle View Mode: List vs Calendar Grid */}
          <div className="flex bg-[var(--color-surface-2)] p-1 rounded-2xl border border-[rgba(255,255,255,0.08)]">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black cursor-pointer transition-all ${
                viewMode === 'list'
                  ? 'bg-amber-500 text-black shadow-md'
                  : 'text-[var(--color-text-muted)] hover:text-white'
              }`}
            >
              📱 Danh Sách
            </button>
            <button
              type="button"
              onClick={() => setViewMode('calendar')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black cursor-pointer transition-all ${
                viewMode === 'calendar'
                  ? 'bg-amber-500 text-black shadow-md'
                  : 'text-[var(--color-text-muted)] hover:text-white'
              }`}
            >
              📅 Ô Lịch
            </button>
          </div>
        </div>

        {/* Thông tin Tuần đang xem */}
        {viewMode === 'list' && (
          <div className="flex items-center justify-between text-xs text-[var(--color-text-secondary)] font-semibold pt-1 border-t border-[rgba(255,255,255,0.06)] flex-wrap gap-2">
            <div>
              📅 Lịch làm tuần: <span className="text-amber-400 font-extrabold">{startWeekLabel} — {endWeekLabel}</span>
            </div>
            <button
              type="button"
              onClick={() => setShowPastDays(!showPastDays)}
              className="text-[11px] font-bold text-amber-300/90 hover:text-amber-300 underline cursor-pointer bg-transparent border-0"
            >
              {showPastDays ? '🙈 Ẩn các ngày đã qua' : '📜 Xem các ngày đã qua trong tuần'}
            </button>
          </div>
        )}

        {/* Filter Toolbar (Lọc ca cá nhân vs Tất cả ca) */}
        {highlightEmployeeId && (
          <div className="flex items-center gap-2 pt-1 border-t border-[rgba(255,255,255,0.06)]">
            <button
              type="button"
              onClick={() => setFilterMode('my_shifts')}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold cursor-pointer border transition-all ${
                filterMode === 'my_shifts'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm'
                  : 'bg-transparent text-[var(--color-text-muted)] border-transparent hover:text-white'
              }`}
            >
              ⭐ Chỉ ca của tôi
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold cursor-pointer border transition-all ${
                filterMode === 'all'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm'
                  : 'bg-transparent text-[var(--color-text-muted)] border-transparent hover:text-white'
              }`}
            >
              🏢 Tất cả ca chi nhánh
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-center py-16">
          <div className="inline-block w-8 h-8 border-3 border-[var(--color-surface-3)] border-t-amber-500 rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* =========================================================================
             MODE 1: AGENDA LIST VIEW (MOBILE-FIRST CARD VIEW - RÕ RÀNG 100%)
             ========================================================================= */}
          {viewMode === 'list' && (
            <div className="p-4 space-y-4 max-h-[550px] overflow-y-auto scrollbar-thin animate-fade-in">
              {agendaDatesList.length === 0 ? (
                <div className="text-center py-12 text-[var(--color-text-muted)]">
                  <p className="text-sm font-bold">Chưa có ca phân công nào trong tháng này ✨</p>
                </div>
              ) : (
                agendaDatesList.map(({ date, items, myItems, hasMyShift }) => {
                  const [y, m, d] = date.split('-').map(Number);
                  const dateObj = new Date(y, m - 1, d);
                  const dayOfWeekStr = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][dateObj.getDay()];
                  const displayDateStr = `${dayOfWeekStr}, ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
                  const isTodayDate = date === today;

                  return (
                    <div
                      key={date}
                      className={`p-4 rounded-3xl border transition-all shadow-md ${
                        hasMyShift
                          ? 'bg-gradient-to-br from-amber-500/15 via-amber-500/5 to-transparent border-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.15)]'
                          : 'bg-[var(--color-surface-1)] border-[var(--color-glass-border)]'
                      }`}
                    >
                      {/* Thẻ Tiêu Đề Ngày */}
                      <div className="flex items-center justify-between mb-3 border-b border-[rgba(255,255,255,0.06)] pb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-sm text-white">{displayDateStr}</span>
                          {isTodayDate && (
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-amber-500 text-black">HÔM NAY</span>
                          )}
                        </div>
                        {hasMyShift && (
                          <span className="text-[11px] font-black text-amber-300 bg-amber-500/20 px-2.5 py-0.5 rounded-full border border-amber-500/40 flex items-center gap-1">
                            ⭐ Có Ca Phân Công
                          </span>
                        )}
                      </div>

                      {/* Danh Sách Các Ca Làm Trong Ngày - Sắp xếp ưu tiên: 1. Ca của Tôi -> 2. Ca cùng Chi Nhánh -> 3. Ca khác */}
                      <div className="space-y-2.5">
                        {(() => {
                          const myShiftInDay = items.find((s) => s.employee_id === highlightEmployeeId);
                          const myBranchId = myShiftInDay ? myShiftInDay.branch_id : null;

                          const sortedItems = [...items].sort((a, b) => {
                            const aIsMe = a.employee_id === highlightEmployeeId;
                            const bIsMe = b.employee_id === highlightEmployeeId;
                            if (aIsMe) return -1;
                            if (bIsMe) return 1;

                            if (myBranchId) {
                              const aSameBranch = a.branch_id === myBranchId;
                              const bSameBranch = b.branch_id === myBranchId;
                              if (aSameBranch && !bSameBranch) return -1;
                              if (!aSameBranch && bSameBranch) return 1;
                            }

                            return (a.branches?.name || '').localeCompare(b.branches?.name || '');
                          });

                          return sortedItems.map((shift) => {
                            const isMe = shift.employee_id === highlightEmployeeId;
                            const isSameBranch = myBranchId && shift.branch_id === myBranchId && !isMe;
                            const branchColor = shift.branches?.color || '#f59e0b';

                            return (
                              <div
                                key={shift.id}
                                className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 transition-all ${
                                  isMe
                                    ? 'bg-amber-500/25 border-amber-400 text-white shadow-lg ring-1 ring-amber-400/50'
                                    : isSameBranch
                                    ? 'bg-[var(--color-surface-2)] border-amber-500/30 text-white'
                                    : 'bg-[var(--color-surface-1)] border-[var(--color-glass-border)] text-white/80'
                                }`}
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span
                                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                      style={{ backgroundColor: branchColor }}
                                    />
                                    <span
                                      className="font-extrabold text-xs px-2 py-0.5 rounded-md text-white"
                                      style={{ backgroundColor: `${branchColor}35` }}
                                    >
                                      CN {formatBranchDisplayName(shift.branches?.name)}
                                    </span>
                                    <span className="font-extrabold text-sm text-white truncate">
                                      {isMe ? `⭐ ${shift.employees?.name} (TÔI)` : shift.employees?.name}
                                    </span>
                                    {isSameBranch && (
                                      <span className="text-[10px] font-bold text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                                        👥 Cùng CN
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs font-black text-amber-300 mt-1.5 flex items-center gap-1">
                                    <span>⏰ {shift.start_time ? `${shift.start_time.slice(0, 5)} — ${shift.end_time?.slice(0, 5)}` : `${shift.hours || 5}h`}</span>
                                    <span className="text-[10px] text-[var(--color-text-muted)] font-bold">({shift.hours || 5} tiếng)</span>
                                  </div>
                                  {shift.note && (
                                    <div className="text-xs text-[var(--color-text-muted)] italic truncate mt-1">
                                      💬 {shift.note}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* =========================================================================
             MODE 2: TRADITIONAL MONTHLY CALENDAR GRID
             ========================================================================= */}
          {viewMode === 'calendar' && (
            <div className="animate-fade-in">
              <div className="px-2 py-3">
                <div className="grid grid-cols-7 mb-1">
                  {DAY_HEADERS.map((d) => (
                    <div key={d} className="text-center text-xs font-bold text-[var(--color-text-muted)] py-1">
                      {d}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1 md:gap-1.5">
                  {calendarDays.map((day, idx) => {
                    const daySchedule = day.date ? (scheduleByDate[day.date] || []) : [];
                    const isToday = day.date === today;
                    const isSelected = day.date === selectedDate;
                    const hasMyShift = highlightEmployeeId && daySchedule.some((s) => s.employee_id === highlightEmployeeId);

                    return (
                      <button
                        key={idx}
                        onClick={() => day.date && setSelectedDate(day.date === selectedDate ? null : day.date)}
                        disabled={!day.isCurrentMonth}
                        className={`schedule-cal-day relative min-h-[70px] md:min-h-[95px] p-1.5 rounded-xl text-left align-top cursor-pointer border transition-all ${
                          !day.isCurrentMonth
                            ? 'opacity-30 cursor-default border-transparent'
                            : isSelected
                            ? 'border-amber-500 bg-[rgba(245,158,11,0.15)] shadow-lg'
                            : isToday
                            ? 'border-amber-500/60 bg-[var(--color-surface-1)]'
                            : 'border-transparent bg-[var(--color-surface-1)] hover:bg-[var(--color-surface-2)]'
                        } ${hasMyShift ? 'ring-2 ring-amber-400' : ''}`}
                      >
                        <span className={`text-xs md:text-sm font-extrabold block mb-1 ${isToday ? 'text-amber-400' : day.isCurrentMonth ? 'text-white' : 'text-[var(--color-text-muted)]'}`}>
                          {day.day}
                        </span>
                        <div className="space-y-1">
                          {branches.map((b) => {
                            const count = daySchedule.filter(s => s.branch_id === b.id).length;
                            if (count === 0) return null;
                            const hasMe = highlightEmployeeId && daySchedule.some(s => s.branch_id === b.id && s.employee_id === highlightEmployeeId);
                            return (
                              <div
                                key={b.id}
                                className={`text-[10px] md:text-[11px] leading-tight rounded-md px-1.5 py-0.5 font-bold flex items-center justify-between gap-1 ${hasMe ? 'ring-1 ring-amber-400 shadow-md' : ''}`}
                                style={{
                                  backgroundColor: `${b.color}25`,
                                  color: '#ffffff',
                                  borderLeft: `3px solid ${b.color}`,
                                }}
                              >
                                <span className="truncate" style={{ color: b.color }}>
                                  {hasMe && '⭐ '}{b.name}
                                </span>
                                <span className="text-[10px] text-white font-extrabold bg-white/20 px-1 rounded-full">
                                  {count}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {selectedDate && (
                <div className="px-5 py-4 border-t border-[var(--color-glass-border)] animate-fade-in">
                  <h4 className="font-bold text-base mb-3 flex items-center gap-2">
                    <span>📋</span> Chi tiết ca làm ngày {selectedDate.split('-').reverse().join('/')}
                  </h4>
                  {selectedDaySchedule.length === 0 ? (
                    <p className="text-sm text-[var(--color-text-muted)] italic">Chưa có lịch xếp cho ngày này</p>
                  ) : (
                    <div className="space-y-2">
                      {branches.map((branch) => {
                        const branchItems = selectedDaySchedule.filter((s) => s.branch_id === branch.id);
                        if (branchItems.length === 0) return null;
                        return (
                          <div key={branch.id} className="p-3 bg-[var(--color-surface-1)] rounded-2xl border border-[var(--color-glass-border)]">
                            <div className="font-extrabold text-xs mb-2 flex items-center gap-2 text-white">
                              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: branch.color }} />
                              Chi nhánh {branch.name} ({branchItems.length} người)
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {branchItems.map((s) => {
                                const isMe = s.employee_id === highlightEmployeeId;
                                return (
                                  <div key={s.id} className={`p-2 rounded-xl border text-xs flex items-center justify-between ${isMe ? 'bg-amber-500/20 border-amber-400 font-black text-amber-300' : 'bg-[var(--color-surface-2)] border-white/5 text-white'}`}>
                                    <span>{isMe ? `⭐ ${s.employees?.name}` : s.employees?.name}</span>
                                    <span className="text-[11px] text-amber-400 font-bold">⏱️ {s.start_time ? `${s.start_time.slice(0, 5)} - ${s.end_time?.slice(0, 5)}` : `${s.hours || 5}h`}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
