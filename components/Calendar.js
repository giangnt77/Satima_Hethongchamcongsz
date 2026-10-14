'use client';

import { useMemo } from 'react';
import { getCalendarDays, getMonthName, getToday } from '@/lib/utils';

const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

export default function Calendar({ year, month, shifts = [], onPrevMonth, onNextMonth, onDayClick, selectedDate }) {
  const today = getToday();
  const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
  
  const days = useMemo(() => getCalendarDays(year, month), [year, month]);

  const shiftDates = useMemo(() => {
    const set = new Set();
    shifts.forEach(s => set.add(s.date));
    return set;
  }, [shifts]);

  const getShiftsForDate = (date) => {
    return shifts.filter(s => s.date === date);
  };

  return (
    <div className="bg-white rounded-2xl overflow-hidden border border-purple-200 shadow-2xs">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-purple-100">
        <button
          onClick={onPrevMonth}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-900 transition-all text-sm cursor-pointer border border-purple-200/80 font-black"
        >
          ◀
        </button>
        <h3 className="font-black text-base text-purple-950">
          {getMonthName(monthStr)}
        </h3>
        <button
          onClick={onNextMonth}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-900 transition-all text-sm cursor-pointer border border-purple-200/80 font-black"
        >
          ▶
        </button>
      </div>

      {/* Weekday Headers */}
      <div className="grid grid-cols-7 px-3 pt-3">
        {WEEKDAYS.map((day) => (
          <div key={day} className="text-center text-xs font-black text-purple-700 uppercase tracking-wide py-2">
            {day}
          </div>
        ))}
      </div>

      {/* Days Grid */}
      <div className="grid grid-cols-7 px-3 pb-3 gap-1">
        {days.map((dayInfo, idx) => {
          const hasShift = dayInfo.date && shiftDates.has(dayInfo.date);
          const isToday = dayInfo.date === today;
          const isSelected = dayInfo.date === selectedDate;
          const dayShifts = dayInfo.date ? getShiftsForDate(dayInfo.date) : [];

          return (
            <button
              key={idx}
              onClick={() => dayInfo.isCurrentMonth && onDayClick?.(dayInfo.date)}
              disabled={!dayInfo.isCurrentMonth}
              className={`
                calendar-day aspect-square flex flex-col items-center justify-center rounded-xl text-xs font-black relative cursor-pointer border-0 bg-transparent text-purple-950 transition-all
                ${!dayInfo.isCurrentMonth ? 'opacity-25 cursor-default text-purple-400' : 'hover:bg-purple-50'}
                ${isToday ? 'bg-purple-100 text-purple-950 ring-2 ring-purple-600 font-black' : ''}
                ${hasShift ? 'bg-purple-50 font-black text-purple-900' : ''}
                ${isSelected ? 'ring-2 ring-purple-700 bg-purple-200 text-purple-950' : ''}
              `}
            >
              <span>{dayInfo.day}</span>
              {hasShift && (
                <span className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-purple-700" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
