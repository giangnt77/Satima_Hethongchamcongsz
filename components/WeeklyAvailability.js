'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  getAvailabilityByEmployee,
  upsertAvailability,
  deleteAvailability,
  getBlockedOffDays,
  getHolidaySettings,
  getHolidayForDate,
  getSpecialEventMode,
  getWeeklyRegistrationLockDay,
} from '@/lib/supabase';
import { getToday, formatDateISO } from '@/lib/utils';
import { useToast } from '@/components/Toast';

/**
 * WeeklyAvailability — Đăng ký lịch rảnh CHỈ CHO TUẦN SAU.
 * Thao tác chọn thay đổi ở bộ nhớ tạm trước, sau đó bấm nút "XÁC NHẬN ĐĂNG KÝ" mới lưu vào DB.
 */

function getThisWeekDays() {
  const [y, m, d] = getToday().split('-').map(Number);
  const todayDate = new Date(y, m - 1, d);
  const dayOfWeek = todayDate.getDay(); // 0=CN, 1=T2...
  const daysToSub = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(y, m - 1, d - daysToSub);

  const days = [];
  for (let i = 0; i < 7; i++) {
    const dayObj = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    days.push(formatDateISO(dayObj));
  }
  return days;
}

function getNextWeekDays() {
  const [y, m, d] = getToday().split('-').map(Number);
  const todayDate = new Date(y, m - 1, d);
  const dayOfWeek = todayDate.getDay(); // 0=CN, 1=T2...
  const daysUntilNextMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek);
  const nextMonday = new Date(y, m - 1, d + daysUntilNextMonday);

  const days = [];
  for (let i = 0; i < 7; i++) {
    const dayObj = new Date(nextMonday.getFullYear(), nextMonday.getMonth(), nextMonday.getDate() + i);
    days.push(formatDateISO(dayObj));
  }
  return days;
}

function getSpecialMonthDays() {
  const [y, m, d] = getToday().split('-').map(Number);
  const todayDate = new Date(y, m - 1, d);
  const dayOfWeek = todayDate.getDay();
  const daysUntilNextMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek);
  const nextMonday = new Date(y, m - 1, d + daysUntilNextMonday);

  const days = [];
  // 4 Tuần = 28 Ngày liên tiếp cho Dịp Đặc Biệt (Tết/Lễ)
  for (let i = 0; i < 28; i++) {
    const dayObj = new Date(nextMonday.getFullYear(), nextMonday.getMonth(), nextMonday.getDate() + i);
    days.push(formatDateISO(dayObj));
  }
  return days;
}

const DAY_NAMES = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ Nhật'];
const DAY_INDEXES = [1, 2, 3, 4, 5, 6, 0];

export default function WeeklyAvailability({ employee, onUpdate }) {
  const toast = useToast();
  const [weekType, setWeekType] = useState('next'); // 'this' | 'next' | 'special_month'
  const [specialEventMode, setSpecialEventMode] = useState(false);
  const [registrationLockDay, setRegistrationLockDay] = useState(0);

  const days = useMemo(() => {
    if (weekType === 'this') return getThisWeekDays();
    if (weekType === 'special_month') return getSpecialMonthDays();
    return getNextWeekDays();
  }, [weekType]);

  // Selected state: { [dateStr]: 'full' | 'option' | 'off' }
  const [availability, setAvailability] = useState({});
  // Saved state from DB to compare changes
  const [initialAvailability, setInitialAvailability] = useState({});
  const [noteInputs, setNoteInputs] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  // blockedMap: { [dayIndex]: reasonString }
  const [blockedMap, setBlockedMap] = useState({});
  const [holidays, setHolidays] = useState([]);

  useEffect(() => {
    getSpecialEventMode().then(setSpecialEventMode);
  }, []);

  useEffect(() => {
    loadAvailability();
  }, [employee, weekType]);

  async function loadAvailability() {
    setLoading(true);
    try {
      const [data, blockedData, holidayData, lockDay] = await Promise.all([
        getAvailabilityByEmployee(employee.id, days[0], days[days.length - 1]),
        getBlockedOffDays(),
        getHolidaySettings(),
        getWeeklyRegistrationLockDay(),
      ]);
      const map = {};
      const notes = {};
      data.forEach((item) => {
        map[item.date] = item.type;
        notes[item.date] = item.note || '';
      });
      setAvailability(map);
      setInitialAvailability(map);
      setNoteInputs(notes);
      setHolidays(Array.isArray(holidayData) ? holidayData : []);
      setRegistrationLockDay(lockDay);

      if (blockedData && typeof blockedData === 'object' && !Array.isArray(blockedData)) {
        if (Array.isArray(blockedData.blockedDays)) {
          const mapObj = {};
          blockedData.blockedDays.forEach((dIdx) => {
            mapObj[dIdx] = blockedData.reason || 'Ngày cao điểm đông khách, quán yêu cầu nhân sự đi làm đầy đủ!';
          });
          setBlockedMap(mapObj);
        } else {
          setBlockedMap(blockedData);
        }
      } else if (Array.isArray(blockedData)) {
        const mapObj = {};
        blockedData.forEach((dIdx) => {
          mapObj[dIdx] = 'Ngày cao điểm đông khách, quán yêu cầu nhân sự đi làm đầy đủ!';
        });
        setBlockedMap(mapObj);
      }
      setHasChanges(false);
    } catch (err) {
      console.error(err);
      toast.error('Lỗi', 'Không thể tải lịch đăng ký');
    }
    setLoading(false);
  }

  function handleSelect(date, type) {
    if (type === 'off') {
      const dateObj = new Date(date + 'T00:00:00');
      const dayIdx = dateObj.getDay(); // 0: CN, 1: T2...
      if (blockedMap[dayIdx] !== undefined) {
        toast.warning(
          'Ngày Cấm Xin Nghỉ!',
          'Đây là ngày cao điểm của quán, Quản Lý quy định KHÔNG ĐƯỢC ĐĂNG KÝ XIN NGHỈ!'
        );
        return;
      }
    }

    setAvailability((prev) => {
      const next = { ...prev };
      if (next[date] === type) {
        delete next[date]; // Bấm lại để hủy chọn
      } else {
        next[date] = type;
      }
      return next;
    });
    setHasChanges(true);
  }

  function handleNoteChange(date, text) {
    setNoteInputs((prev) => ({ ...prev, [date]: text }));
    setHasChanges(true);
  }

  const unassignedDays = useMemo(() => {
    return days.filter((dateStr) => !availability[dateStr]);
  }, [days, availability]);

  const isAllDaysRegistered = unassignedDays.length === 0;
  const registeredCount = days.length - unassignedDays.length;

  async function handleSubmit() {
    // 1. BẮT BUỘC ĐĂNG KÝ ĐỦ 100% TẤT CẢ CÁC NGÀY TRONG TUẦN
    if (!isAllDaysRegistered) {
      const missingLabels = unassignedDays.map((dStr) => {
        const d = new Date(dStr + 'T00:00:00');
        const dayIdx = d.getDay();
        const name = DAY_NAMES[dayIdx === 0 ? 6 : dayIdx - 1];
        return `${name} (${d.getDate()}/${d.getMonth() + 1})`;
      });

      toast.warning(
        'Chưa chọn đủ tất cả các ngày!',
        `Bạn còn thiếu ${unassignedDays.length} ngày chưa chọn lịch: ${missingLabels.join(', ')}. Bắt buộc phải đăng ký đầy đủ ${days.length}/${days.length} ngày mới được lưu!`
      );
      return;
    }

    // 2. Kiểm tra xem nhân viên có đăng ký nghỉ (off) 3 ngày liên tiếp trở lên trong tuần hay không
    let consecutiveOff = 0;
    let maxConsecutiveOff = 0;
    for (const dateStr of days) {
      if (availability[dateStr] === 'off') {
        consecutiveOff++;
        if (consecutiveOff > maxConsecutiveOff) {
          maxConsecutiveOff = consecutiveOff;
        }
      } else {
        consecutiveOff = 0;
      }
    }

    // Khi đăng ký nghỉ từ 3 ngày liên tiếp trở lên thì mới hiện thông báo xác nhận
    if (maxConsecutiveOff >= 3) {
      // Popup Xác Nhận Lần 1
      const confirm1 = window.confirm(
        `Thí chủ đã xin phép Owner chưa? (Bạn đang đăng ký nghỉ ${maxConsecutiveOff} ngày liên tiếp trong tuần).`
      );
      if (!confirm1) {
        return; // Thí chủ chưa xin phép -> Dừng không cho gửi
      }

      // Popup Xác Nhận Lần 2
      const confirm2 = window.confirm(
        `Xác nhận lần 2: Thí chủ đã xin phép Owner thật chưa? (Đăng ký nghỉ ${maxConsecutiveOff} ngày liên tiếp). Nếu chưa xin phép sẽ bị xử lý theo nội quy quán!`
      );
      if (!confirm2) {
        return; // Dừng không cho gửi
      }
    }

    setSubmitting(true);
    try {
      // Xử lý từng ngày trong tuần sau
      for (const dateStr of days) {
        const currentType = availability[dateStr];
        const oldType = initialAvailability[dateStr];

        if (currentType) {
          // Lưu hoặc cập nhật
          const note = (currentType === 'option' || currentType === 'off') ? (noteInputs[dateStr] || '') : '';
          await upsertAvailability(employee.id, dateStr, currentType, note);
        } else if (oldType) {
          // Nếu bỏ chọn ngày đã lưu trước đó -> Xóa khỏi database
          await deleteAvailability(employee.id, dateStr);
        }
      }

      toast.success('ĐÃ CHỐT ĐĂNG KÝ!', `Lịch rảnh ${weekType === 'next' ? 'tuần sau' : 'tuần này'} đã được lưu thành công`);
      setInitialAvailability({ ...availability });
      setHasChanges(false);
      if (onUpdate) onUpdate();
    } catch (err) {
      console.error(err);
      toast.error('Lỗi', 'Không thể lưu lịch đăng ký. Vui lòng thử lại.');
    }
    setSubmitting(false);
  }

  function formatDateLabel(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return `${d.getDate()}/${d.getMonth() + 1}`;
  }

  function getWeekLabel() {
    const start = new Date(days[0] + 'T00:00:00');
    const end = new Date(days[days.length - 1] + 'T00:00:00');
    return `${start.getDate()}/${start.getMonth() + 1} — ${end.getDate()}/${end.getMonth() + 1}/${end.getFullYear()}`;
  }

  // LOGIC TỰ ĐỘNG KHÓA / MỞ ĐĂNG KÝ:
  // 1. Lịch "Tuần Này" (weekType === 'this'): KHÓA CỨNG 100%!
  // 2. Tuần sau tự khóa vào thứ do Admin cấu hình; dịp đặc biệt không tự khóa.
  const isLocked = useMemo(() => {
    if (weekType === 'this') {
      return true; // Khóa cứng 100% đối với Tuần Này!
    }
    if (weekType !== 'next' || registrationLockDay === null) return false;
    const [year, month, day] = getToday().split('-').map(Number);
    const dayOfWeek = new Date(year, month - 1, day).getDay();
    return dayOfWeek === registrationLockDay;
  }, [weekType, registrationLockDay]);

  // Danh sách các ngày lễ trong tuần/tháng đang chọn
  const weekHolidays = useMemo(() => {
    const list = [];
    days.forEach((dStr) => {
      const h = getHolidayForDate(dStr, holidays);
      if (h && !list.find((item) => item.name === h.name)) {
        list.push(h);
      }
    });
    return list;
  }, [days, holidays]);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl p-6 text-center border border-purple-200 shadow-2xs">
        <div className="inline-block w-8 h-8 border-3 border-purple-200 border-t-purple-700 rounded-full animate-spin" />
        <p className="mt-3 text-sm text-purple-700 font-bold">Đang tải lịch đăng ký...</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl p-4 sm:p-6 space-y-5 border border-purple-200/90 shadow-2xs">
      {/* Header */}
      <div className="border-b border-purple-100 pb-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="font-black text-lg sm:text-xl flex items-center gap-2 text-purple-950 tracking-tight">
            <span className="text-xl">✋</span> Đăng Ký Lịch Làm
          </h3>

          {/* Tab chọn Tuần Này vs Tuần Sau vs Dịp Đặc Biệt (1 Tháng) */}
          <div className="flex bg-purple-100/70 p-1 rounded-xl border border-purple-200/80 shadow-2xs flex-wrap gap-1">
            <button
              type="button"
              onClick={() => setWeekType('this')}
              className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-black cursor-pointer transition-all ${weekType === 'this'
                  ? 'bg-purple-700 text-white shadow-2xs font-black'
                  : 'text-purple-900 hover:text-purple-700 font-bold'
                }`}
            >
              ⚡ Tuần Này
            </button>
            <button
              type="button"
              onClick={() => setWeekType('next')}
              className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-black cursor-pointer transition-all ${weekType === 'next'
                  ? 'bg-purple-700 text-white shadow-2xs font-black'
                  : 'text-purple-900 hover:text-purple-700 font-bold'
                }`}
            >
              🚀 Tuần Sau
            </button>

            {/* Nút Đăng Ký Dịp Đặc Biệt (Kéo Dài 1 Tháng) - CHỈ BẬT KHI ADMIN CHO PHÉP ON */}
            {specialEventMode && (
              <button
                type="button"
                onClick={() => setWeekType('special_month')}
                className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-black cursor-pointer transition-all flex items-center gap-1 ${weekType === 'special_month'
                    ? 'bg-rose-600 text-white shadow-2xs font-black animate-pulse'
                    : 'bg-rose-100 text-rose-950 hover:bg-rose-200 font-extrabold border border-rose-300'
                  }`}
              >
                <span>🎆</span>
                <span>Dịp Đặc Biệt (1 Tháng)</span>
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 flex-wrap text-xs sm:text-sm font-extrabold text-purple-700">
          <p className="flex items-center gap-1.5">
            <span>📅</span>
            <span>
              {weekType === 'special_month'
                ? `Đăng ký Dịp Đặc Biệt (4 Tuần / 1 Tháng): `
                : weekType === 'next'
                  ? `Đăng ký cho tuần: `
                  : `Lịch tuần hiện tại: `}
              <span className="font-black text-purple-950">{getWeekLabel()}</span>
            </span>
          </p>

          <div className="flex items-center gap-1.5 flex-wrap">
            {isAllDaysRegistered ? (
              <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-950 border border-emerald-300 text-xs font-black flex items-center gap-1 shadow-2xs">
                <span>✅</span>
                <span>Đã chọn đủ {days.length}/{days.length} ngày</span>
              </span>
            ) : (
              <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-950 border border-amber-300 text-xs font-black flex items-center gap-1 shadow-2xs animate-pulse">
                <span>⚠️</span>
                <span>Đã chọn: {registeredCount}/{days.length} ngày (Còn thiếu {unassignedDays.length} ngày)</span>
              </span>
            )}

            {weekType === 'special_month' && (
              <span className="px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-900 border border-rose-300 text-xs font-black animate-pulse">
                🔥 Chế độ Dịp Đặc Biệt (Tết/Lễ) - Đăng ký kéo dài 1 Tháng
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Days Grid */}
      <div className="space-y-3">
        {days.map((dateStr, idx) => {
          const status = availability[dateStr]; // 'full' | 'option' | 'off' | undefined
          const dateObj = new Date(dateStr + 'T00:00:00');
          const dayIdx = dateObj.getDay();
          const isOffBlocked = blockedMap[dayIdx] !== undefined;
          const blockedReason = blockedMap[dayIdx] || 'Ngày cao điểm đông khách, quán yêu cầu đi làm đầy đủ!';
          const holiday = getHolidayForDate(dateStr, holidays);

          return (
            <div
              key={dateStr}
              className={`rounded-2xl p-3.5 sm:p-4 border transition-all ${
                holiday
                  ? status === 'full'
                    ? 'border-amber-400 bg-gradient-to-r from-amber-50 to-emerald-50 shadow-xs ring-1 ring-amber-400'
                    : status === 'option'
                      ? 'border-amber-400 bg-gradient-to-r from-amber-50 to-purple-50 shadow-xs ring-1 ring-amber-400'
                      : status === 'off'
                        ? 'border-rose-300 bg-rose-50/90 shadow-2xs'
                        : 'border-amber-300 bg-amber-50/60 ring-1 ring-amber-300/60 border-dashed'
                  : status === 'full'
                    ? 'border-emerald-300 bg-emerald-50/90 shadow-2xs'
                    : status === 'option'
                      ? 'border-purple-300 bg-purple-50/90 shadow-2xs'
                      : status === 'off'
                        ? 'border-rose-300 bg-rose-50/90 shadow-2xs'
                        : 'border-amber-300/90 bg-amber-50/30 border-dashed shadow-2xs'
              } ${isLocked ? 'opacity-90' : ''}`}
            >
              {/* Day Header */}
              <div className="flex items-center justify-between mb-2.5 flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-black text-base sm:text-lg text-purple-950">
                    {DAY_NAMES[idx % 7]}
                  </span>
                  <span className="text-xs sm:text-sm text-purple-800 font-black">
                    ({formatDateLabel(dateStr)})
                  </span>
                  {holiday && (
                    <span className="px-2.5 py-0.5 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 text-purple-950 text-xs font-black border border-amber-500 shadow-2xs flex items-center gap-1">
                      <span>🎉</span>
                      <span>{holiday.name} (x{holiday.multiplier} LƯƠNG)</span>
                    </span>
                  )}
                </div>
                {status ? (
                  <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-white text-purple-950 border border-purple-200 shadow-2xs flex items-center gap-1">
                    {isLocked && <span>🔒</span>}
                    {status === 'full' && '💪 Chọn Cả Ngày'}
                    {status === 'option' && '📝 Chọn Tùy Ca'}
                    {status === 'off' && '🛑 Chọn Xin Nghỉ'}
                  </span>
                ) : (
                  <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs flex items-center gap-1 animate-pulse">
                    <span>⚠️</span> Chưa chọn lịch
                  </span>
                )}
              </div>

              {/* 3 Nút chọn lớn rõ ràng (Khóa nếu đã chốt hoặc cấm off) */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  disabled={isLocked}
                  onClick={() => !isLocked && handleSelect(dateStr, 'full')}
                  className={`py-2.5 px-2 rounded-xl font-black text-xs sm:text-sm border transition-all shadow-2xs ${status === 'full'
                      ? 'border-emerald-600 bg-emerald-700 text-white font-black'
                      : 'border-purple-200 bg-white text-purple-950 font-bold'
                    } ${isLocked ? 'cursor-not-allowed opacity-80' : 'cursor-pointer active:scale-95 hover:bg-emerald-50'}`}
                >
                  {status === 'full' ? '✅ Cả ngày' : '💪 Cả ngày'}
                </button>
                <button
                  type="button"
                  disabled={isLocked}
                  onClick={() => !isLocked && handleSelect(dateStr, 'option')}
                  className={`py-2.5 px-2 rounded-xl font-black text-xs sm:text-sm border transition-all shadow-2xs ${status === 'option'
                      ? 'border-purple-600 bg-purple-700 text-white font-black'
                      : 'border-purple-200 bg-white text-purple-950 font-bold'
                    } ${isLocked ? 'cursor-not-allowed opacity-80' : 'cursor-pointer active:scale-95 hover:bg-purple-50'}`}
                >
                  {status === 'option' ? '✅ Tùy ca' : '📝 Tùy ca'}
                </button>
                <button
                  type="button"
                  disabled={isLocked || isOffBlocked}
                  onClick={() => !isLocked && handleSelect(dateStr, 'off')}
                  className={`py-2.5 px-2 rounded-xl font-black text-xs sm:text-sm border transition-all shadow-2xs ${isOffBlocked
                      ? 'bg-rose-50/40 text-rose-300 border-rose-200 cursor-not-allowed opacity-60 line-through'
                      : status === 'off'
                        ? 'border-rose-600 bg-rose-600 text-white font-black'
                        : 'border-purple-200 bg-white text-purple-950 font-bold'
                    } ${isLocked ? 'cursor-not-allowed opacity-80' : isOffBlocked ? '' : 'cursor-pointer active:scale-95 hover:bg-rose-50'}`}
                  title={isOffBlocked ? 'Ngày cao điểm của quán - Quản Lý quy định KHÔNG ĐƯỢC XIN NGHỈ' : ''}
                >
                  {isOffBlocked ? '🚫 Kh được Off' : status === 'off' ? '✅ Xin nghỉ' : '🛑 Xin nghỉ'}
                </button>
              </div>

              {/* Thông báo cảnh báo ngày không được Off với lý do chi tiết từ Admin */}
              {isOffBlocked && (
                <div className="mt-2.5 p-2.5 rounded-xl bg-rose-100/90 border border-rose-300 text-rose-950 font-black text-xs space-y-1 shadow-2xs animate-fade-in">
                  <div className="flex items-center gap-1.5 text-rose-900 font-black">
                    <span className="text-base">🚫</span>
                    <span>NGÀY NÀY KHÔNG ĐƯỢC XIN NGHỈ!</span>
                  </div>
                  <div className="text-[11.5px] font-extrabold text-purple-950 pl-6 leading-relaxed">
                    📌 <span className="text-purple-900 font-bold">Quản Lý Nhắn:</span>{' '}
                    <span className="bg-white px-2 py-0.5 rounded-md border border-rose-200 text-rose-950 font-black italic inline-block mt-0.5">
                      {blockedReason}
                    </span>
                  </div>
                </div>
              )}

              {/* Ô ghi chú nếu chọn Tùy chọn ca hoặc Xin nghỉ */}
              {(status === 'option' || status === 'off') && (
                <div className="mt-2.5 animate-fade-in">
                  <textarea
                    disabled={isLocked}
                    value={noteInputs[dateStr] || ''}
                    onChange={(e) => !isLocked && handleNoteChange(dateStr, e.target.value)}
                    placeholder={
                      status === 'off'
                        ? 'Lý do xin nghỉ (ví dụ: bận việc nhà, thi học kì...)'
                        : 'Ghi chú thời gian làm (ví dụ: rảnh sáng 8-12h, hoặc làm từ 13h...)'
                    }
                    rows={2}
                    className={`w-full px-3.5 py-2 bg-white border border-purple-200 rounded-xl text-purple-950 text-xs sm:text-sm outline-none transition-all resize-none placeholder:text-purple-400 font-bold ${isLocked ? 'cursor-not-allowed bg-purple-50/50' : 'focus:border-purple-600'
                      }`}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Nút XÁC NHẬN ĐĂNG KÝ HOẶC ĐÃ KHÓA THEO CHU KỲ */}
      <div className="pt-2 border-t border-purple-100">
        {isLocked ? (
          <div className="text-center space-y-2">
            <div className="w-full py-3.5 px-4 rounded-xl font-black text-xs sm:text-sm border border-rose-300 bg-rose-700 text-white flex items-center justify-center gap-2 shadow-xs">
              <span>🔒</span> {weekType === 'this' ? 'LỊCH "TUẦN NÀY" ĐÃ KHÓA (Đang diễn ra)' : 'ĐÃ HẾT HẠN ĐĂNG KÝ (Đã tự động khóa vào Chủ Nhật)'}
            </div>
            <p className="text-xs text-purple-800 font-extrabold italic">
              {weekType === 'this'
                ? '💡 Lịch phân công "Tuần Này" đã được chốt và đang chạy. Bạn hãy bấm chọn tab "🚀 Tuần Sau" ở trên để đăng ký lịch tuần tới nhé!'
                : '💡 Đã hết hạn đăng ký tuần này. Lịch sẽ tự động mở lại vào Thứ 2 tuần tới! Nếu cần điều chỉnh gấp, vui lòng liên hệ Quản Lý.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className={`w-full py-3.5 rounded-xl font-black text-sm sm:text-base border-0 cursor-pointer shadow-xs transition-all active:scale-95 ${
                !isAllDaysRegistered
                  ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-md ring-2 ring-amber-400'
                  : hasChanges
                    ? 'bg-purple-700 hover:bg-purple-800 text-white animate-pulse shadow-md'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md'
              }`}
            >
              {submitting
                ? '⏳ Đang lưu lịch...'
                : !isAllDaysRegistered
                  ? `⚠️ CÒN THIẾU ${unassignedDays.length} NGÀY CHƯA CHỌN (CHỌN ĐỦ ${days.length}/${days.length} NGÀY ĐỂ LƯU)`
                  : hasChanges
                    ? `🚀 CẬP NHẬT & CHỐT LỊCH ĐĂNG KÝ (${registeredCount}/${days.length} NGÀY)`
                    : `✅ ĐÃ CHỐT ĐĂNG KÝ LỊCH (${days.length}/${days.length} NGÀY)`}
            </button>
            <p className="text-[11px] sm:text-xs text-center text-purple-700 font-extrabold">
              💡 {weekType === 'special_month'
                ? 'Đăng ký Dịp Đặc Biệt không bị khóa tự động theo lịch tuần.'
                : weekType === 'this'
                  ? 'Lịch tuần hiện tại đã khóa chỉnh sửa đăng ký.'
                  : registrationLockDay === null
                    ? 'Admin đã tắt tự động khóa đăng ký tuần.'
                    : `Hệ thống tự khóa đăng ký tuần vào ${DAY_NAMES[DAY_INDEXES.indexOf(registrationLockDay)]}.`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
