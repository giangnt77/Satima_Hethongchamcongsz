'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  getBranches,
  getScheduleByDateRange,
  getEmployeeRates,
  getAllEmployeeRates,
  calculateSalaryFromShifts,
  updateEmployeesSortOrders,
  getAllPenaltiesByMonth,
  getHolidaySettings,
} from '@/lib/supabase';
import {
  formatCurrency,
  formatDateISO,
  getBranchColorStyle,
  getMondayOfCurrentWeek,
  getWeekDaysFromMonday,
  getCurrentMonth,
} from '@/lib/utils';

import ModalEmployeeSalaryDetail from '@/components/ModalEmployeeSalaryDetail';
import ModalWeekPicker from '@/components/ModalWeekPicker';

const DAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

function getEffectiveRateForDate(emp, ratesList, dateStr) {
  const defaultRate = emp?.hourly_rate || 20000;
  if (!ratesList || ratesList.length === 0) return defaultRate;
  const sorted = [...ratesList].sort((a, b) => b.effective_date.localeCompare(a.effective_date));
  const active = sorted.find((r) => r.effective_date <= dateStr);
  return active ? active.hourly_rate : defaultRate;
}

export default function WeeklySalaryReportBoard({ employees = [], toast, onSelectPenaltyEmployee }) {
  const [currentMonday, setCurrentMonday] = useState(getMondayOfCurrentWeek());
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [schedule, setSchedule] = useState([]);
  const [monthSchedule, setMonthSchedule] = useState([]);
  const [branches, setBranches] = useState([]);
  const [ratesMap, setRatesMap] = useState({});
  const [penaltiesMap, setPenaltiesMap] = useState({});
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmpForDetail, setSelectedEmpForDetail] = useState(null);
  const [showWeekPickerModal, setShowWeekPickerModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const weekDays = useMemo(() => getWeekDaysFromMonday(currentMonday), [currentMonday]);
  const startDate = weekDays[0];
  const endDate = weekDays[6];

  const { monthStartDate, monthEndDate } = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    return {
      monthStartDate: `${y}-${String(m).padStart(2, '0')}-01`,
      monthEndDate: `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
    };
  }, [selectedMonth]);

  async function loadWeekSalaryData() {
    setLoading(true);
    try {
      const [schedData, monthSchedData, branchData, allPenalties, holidayData, allRatesData] = await Promise.all([
        getScheduleByDateRange(startDate, endDate),
        getScheduleByDateRange(monthStartDate, monthEndDate),
        getBranches(),
        getAllPenaltiesByMonth(selectedMonth),
        getHolidaySettings(),
        getAllEmployeeRates(),
      ]);
      setSchedule(schedData);
      setMonthSchedule(monthSchedData || []);
      setBranches(branchData || []);
      setHolidays(Array.isArray(holidayData) ? holidayData : []);

      // Tạo map thưởng/phạt theo employee_id
      const pMap = {};
      (allPenalties || []).forEach((p) => {
        if (!pMap[p.employee_id]) pMap[p.employee_id] = [];
        pMap[p.employee_id].push(p);
      });
      setPenaltiesMap(pMap);

      // Tạo map mốc lương theo employee_id tức thì (1 query duy nhất)
      const rMap = {};
      (allRatesData || []).forEach((r) => {
        if (!rMap[r.employee_id]) rMap[r.employee_id] = [];
        rMap[r.employee_id].push(r);
      });
      setRatesMap(rMap);
    } catch (err) {
      console.error(err);
      if (toast) toast.error('Lỗi', 'Không thể tải báo cáo lương tuần');
    }
    setLoading(false);
  }

  useEffect(() => {
    loadWeekSalaryData();
  }, [currentMonday, selectedMonth, employees]);

  function prevWeek() {
    const [y, m, d] = currentMonday.split('-').map(Number);
    const prevM = new Date(y, m - 1, d - 7);
    setCurrentMonday(formatDateISO(prevM));
  }

  function nextWeek() {
    const [y, m, d] = currentMonday.split('-').map(Number);
    const nextM = new Date(y, m - 1, d + 7);
    setCurrentMonday(formatDateISO(nextM));
  }

  function goTodayWeek() {
    setCurrentMonday(getMondayOfCurrentWeek());
  }

  function prevMonth() {
    const [y, m] = selectedMonth.split('-').map(Number);
    const newY = m === 1 ? y - 1 : y;
    const newM = m === 1 ? 12 : m - 1;
    setSelectedMonth(`${newY}-${String(newM).padStart(2, '0')}`);
  }

  function nextMonth() {
    const [y, m] = selectedMonth.split('-').map(Number);
    const newY = m === 12 ? y + 1 : y;
    const newM = m === 12 ? 1 : m + 1;
    setSelectedMonth(`${newY}-${String(newM).padStart(2, '0')}`);
  }

  function goCurrentMonth() {
    setSelectedMonth(getCurrentMonth());
  }

  // Index map dữ liệu ca làm theo employeeId_date
  const scheduleByEmpAndDate = useMemo(() => {
    const map = {};
    (schedule || []).forEach((item) => {
      const key = `${item.employee_id}_${item.date}`;
      if (!map[key]) map[key] = [];
      map[key].push(item);
    });
    return map;
  }, [schedule]);

  // Hàm kiểm tra tài khoản Quản trị / Chủ quán (Không tính vào chi phí lương nhân viên)
  const isManagementAccount = (emp) => {
    if (!emp) return false;
    const nameLower = String(emp.name || '').toLowerCase().trim();
    const roleLower = String(emp.role || '').toLowerCase().trim();
    return (
      roleLower === 'owner' ||
      roleLower === 'manager' ||
      nameLower === 'owner' ||
      nameLower === 'manager' ||
      nameLower.includes('owner') ||
      nameLower.includes('manager') ||
      nameLower.includes('chủ quán') ||
      nameLower.includes('quản lý')
    );
  };

  // Index map gom tất cả ca làm của nhân viên trong tháng được chọn
  const monthScheduleByEmp = useMemo(() => {
    const map = {};
    (monthSchedule || []).forEach((item) => {
      if (item.date && item.date.startsWith(selectedMonth)) {
        if (!map[item.employee_id]) map[item.employee_id] = [];
        map[item.employee_id].push(item);
      }
    });
    return map;
  }, [monthSchedule, selectedMonth]);

  // Sắp xếp & lọc danh sách nhân viên:
  // - Nếu có ca trong tuần đang xem -> HIỆN
  // - Nếu có ca trong tháng đang xem -> HIỆN
  // - Nếu nhân viên đang hoạt động -> HIỆN
  // - Chỉ ẩn nhân viên đã nghỉ ('off') nếu họ KHÔNG CÓ ca làm trong tuần lẫn tháng này
  const sortedEmployees = useMemo(() => {
    // 1. Tạo danh sách tất cả nhân viên từ prop và bổ sung nhân viên xuất hiện trong ca làm tháng
    const allEmpMap = {};
    (employees || []).forEach((emp) => {
      if (emp && !isManagementAccount(emp)) {
        allEmpMap[emp.id] = { ...emp };
      }
    });

    // Bổ sung nhân viên có ca làm trong tháng nếu chưa có trong prop employees
    (monthSchedule || []).forEach((s) => {
      if (s.employee_id && !allEmpMap[s.employee_id]) {
        const fallbackEmp = s.employees || { id: s.employee_id, name: s.employee_name || 'Nhân viên', hourly_rate: 20000 };
        if (!isManagementAccount(fallbackEmp)) {
          allEmpMap[s.employee_id] = fallbackEmp;
        }
      }
    });

    const empList = Object.values(allEmpMap);

    return empList
      .filter((emp) => {
        // 1. Có ca làm trong tuần đang xem
        const hasShiftsInThisWeek = (weekDays || []).some(
          (dStr) => (scheduleByEmpAndDate[`${emp.id}_${dStr}`] || []).length > 0
        );

        // 2. Có ca làm trong tháng đang xem
        const hasShiftsInThisMonth = (monthScheduleByEmp[emp.id] || []).length > 0;

        // 3. Nếu có ca làm trong tuần HOẶC trong tháng đang xem -> Bắt buộc hiển thị
        if (hasShiftsInThisWeek || hasShiftsInThisMonth) {
          return true;
        }

        // 4. Nếu nhân viên đang hoạt động (không phải status 'off')
        const isActive = emp.status !== 'off' && emp.is_active !== false;
        if (isActive) {
          const empStartDate = emp.created_at ? emp.created_at.slice(0, 10) : '2000-01-01';
          return empStartDate <= monthEndDate || empStartDate <= endDate;
        }

        // 5. Nhân viên đã nghỉ việc ('off') và không có ca nào trong tuần lẫn tháng -> Ẩn
        return false;
      })
      .sort((a, b) => {
        const isOffA = a.status === 'off';
        const isOffB = b.status === 'off';
        if (isOffA !== isOffB) return isOffA ? 1 : -1;

        const orderA = a.sort_order ?? 999;
        const orderB = b.sort_order ?? 999;
        if (orderA !== orderB) return orderA - orderB;
        return (a.name || '').localeCompare(b.name || '');
      });
  }, [employees, monthSchedule, monthScheduleByEmp, endDate, monthEndDate, weekDays, scheduleByEmpAndDate]);

  // Danh sách nhân viên sau khi áp dụng bộ lọc nhanh theo từ khóa (Tên / Biệt danh)
  const filteredEmployees = useMemo(() => {
    if (!searchQuery.trim()) return sortedEmployees;
    const q = searchQuery.toLowerCase().trim();
    return sortedEmployees.filter((emp) => {
      const name = (emp.name || '').toLowerCase();
      const nickname = (emp.nickname || '').toLowerCase();
      return name.includes(q) || nickname.includes(q);
    });
  }, [sortedEmployees, searchQuery]);

  // Tính tổng lương tháng cho từng nhân viên & toàn bộ nhân viên chuẩn xác 100%
  const { empMonthlyTotals, grandTotalMonthlySalary, grandTotalMonthlyHours, grandTotalMonthlyBonus, grandTotalMonthlyPenalty, grandTotalMonthlyNet } = useMemo(() => {
    const empTotals = {};
    let totalSal = 0;
    let totalHrs = 0;
    let totalBon = 0;
    let totalPen = 0;

    sortedEmployees.forEach((emp) => {
      const empShifts = monthScheduleByEmp[emp.id] || [];
      const empRates = ratesMap[emp.id] || [];
      const defaultRate = emp.hourly_rate || 20000;

      const { totalHours, grossSalary } = calculateSalaryFromShifts(
        empShifts,
        empRates,
        defaultRate,
        holidays
      );

      // Tính thưởng & phạt cho nhân viên này
      let empBonus = 0;
      let empPenalty = 0;
      const empPenalties = penaltiesMap[emp.id] || [];
      empPenalties.forEach((p) => {
        const isBonus = p.type === 'bonus' || (p.reason && (p.reason.toLowerCase().startsWith('[thưởng]') || p.reason.toLowerCase().startsWith('[bonus]')));
        if (isBonus) {
          empBonus += Math.abs(p.amount);
        } else {
          empPenalty += Math.abs(p.amount);
        }
      });

      const netSalary = grossSalary + empBonus - empPenalty;

      empTotals[emp.id] = {
        totalHours,
        grossSalary,
        shiftCount: empShifts.length,
        totalBonus: empBonus,
        totalPenalty: empPenalty,
        netSalary,
      };

      totalSal += grossSalary;
      totalHrs += totalHours;
      totalBon += empBonus;
      totalPen += empPenalty;
    });

    return {
      empMonthlyTotals: empTotals,
      grandTotalMonthlySalary: Math.round(totalSal),
      grandTotalMonthlyHours: Math.round(totalHrs * 100) / 100,
      grandTotalMonthlyBonus: Math.round(totalBon),
      grandTotalMonthlyPenalty: Math.round(totalPen),
      grandTotalMonthlyNet: Math.round(totalSal + totalBon - totalPen),
    };
  }, [sortedEmployees, monthScheduleByEmp, ratesMap, penaltiesMap, holidays]);



  // Tính tổng lương tuần cho từng nhân viên & toàn tiệm
  const { empWeeklyTotals, grandTotalSalary, grandTotalHours } = useMemo(() => {
    const empTotals = {};
    let totalSal = 0;
    let totalHrs = 0;

    sortedEmployees.forEach((emp) => {
      const empShifts = weekDays.flatMap((dStr) => scheduleByEmpAndDate[`${emp.id}_${dStr}`] || []);
      const empRates = ratesMap[emp.id] || [];

      const { totalHours, grossSalary } = calculateSalaryFromShifts(
        empShifts,
        empRates,
        emp.hourly_rate || 20000,
        holidays
      );

      empTotals[emp.id] = { totalHours, grossSalary, shiftCount: empShifts.length };
      totalSal += grossSalary;
      totalHrs += totalHours;
    });

    return {
      empWeeklyTotals: empTotals,
      grandTotalSalary: Math.round(totalSal),
      grandTotalHours: Math.round(totalHrs * 100) / 100,
    };
  }, [sortedEmployees, weekDays, scheduleByEmpAndDate, ratesMap, holidays]);

  return (
    <div className="space-y-3 animate-fade-in">
      {/* Header điều hướng Tháng & Tuần gọn gàng 1 hàng (Bên Trái: Tuần - Bên Phải: Tháng) */}
      <div className="bg-white rounded-3xl p-3 sm:p-4 border border-purple-200 shadow-2xs flex items-center justify-between flex-wrap gap-3">
        {/* Cụm Bên Trái: Tuần Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-black text-purple-900 uppercase">⚡ Báo Cáo Lương Tuần:</span>
          <button
            type="button"
            onClick={prevWeek}
            className="w-8 h-8 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-950 font-black border border-purple-200 flex items-center justify-center cursor-pointer transition-all active:scale-95 text-xs shadow-2xs"
            title="Tuần trước"
          >
            ◀
          </button>
          <button
            type="button"
            onClick={() => setShowWeekPickerModal(true)}
            className="px-2.5 sm:px-3 py-1.5 bg-purple-100/90 hover:bg-purple-200 border border-purple-300 rounded-xl text-center cursor-pointer transition-all active:scale-95 shadow-2xs flex items-center gap-1.5"
            title="Bấm để chọn nhanh bất kỳ Tuần & Năm nào (Ví dụ: Tuần 2 năm 2025)"
          >
            <span>📅</span>
            <span className="text-xs sm:text-sm font-black text-purple-950">
              Tuần: {startDate.split('-').reverse().slice(0, 2).join('/')} — {endDate.split('-').reverse().slice(0, 2).join('/')}/{endDate.split('-')[0]}
            </span>
            <span className="text-[10px] text-purple-700 font-bold">▾</span>
          </button>
          <button
            type="button"
            onClick={nextWeek}
            className="w-8 h-8 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-950 font-black border border-purple-200 flex items-center justify-center cursor-pointer transition-all active:scale-95 text-xs shadow-2xs"
            title="Tuần sau"
          >
            ▶
          </button>
          <button
            type="button"
            onClick={goTodayWeek}
            className="px-3 py-1.5 rounded-xl bg-purple-700 text-white hover:bg-purple-800 text-xs font-black border-0 cursor-pointer shadow-2xs transition-all active:scale-95"
          >
            Tuần Này
          </button>
        </div>

        {/* Cụm Bên Phải: Tháng Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-black text-amber-950 uppercase">📅 Lương Tháng:</span>
          <button
            type="button"
            onClick={prevMonth}
            className="w-8 h-8 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-950 font-black border border-amber-200 flex items-center justify-center cursor-pointer transition-all active:scale-95 text-xs shadow-2xs"
            title="Tháng trước"
          >
            ◀
          </button>
          <div className="px-3.5 py-1.5 bg-amber-500 text-purple-950 rounded-xl text-center font-black text-xs sm:text-sm shadow-2xs">
            Tháng {selectedMonth.split('-')[1]}/{selectedMonth.split('-')[0]}
          </div>
          <button
            type="button"
            onClick={nextMonth}
            className="w-8 h-8 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-950 font-black border border-amber-200 flex items-center justify-center cursor-pointer transition-all active:scale-95 text-xs shadow-2xs"
            title="Tháng sau"
          >
            ▶
          </button>
          <button
            type="button"
            onClick={goCurrentMonth}
            className="px-3 py-1.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-purple-950 text-xs font-black border border-amber-300 cursor-pointer shadow-2xs transition-all active:scale-95"
          >
            Tháng Hiện Tại
          </button>
        </div>
      </div>

      {/* BẢNG MA TRẬN BÁO CÁO LƯƠNG CHUẨN ĐỒNG BỘ 100% */}
      <div className="bg-white rounded-3xl p-0 border border-purple-200 shadow-xl overflow-x-auto custom-scrollbar relative">
        <table className="w-full min-w-[1020px] border-collapse text-xs">
          <thead>
            <tr className="bg-purple-900 text-white border-b border-purple-800">
              <th className="py-2 px-2 border-r-2 border-purple-300 w-32 sm:w-36 text-left font-black sticky left-0 z-30 bg-purple-950 text-white shadow-[4px_0_10px_-2px_rgba(0,0,0,0.3)] text-xs">
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span>NHÂN VIÊN</span>
                  {searchQuery && (
                    <span className="text-[10px] bg-amber-400 text-purple-950 font-black px-1.5 py-0.2 rounded">
                      {filteredEmployees.length}/{sortedEmployees.length}
                    </span>
                  )}
                </div>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="🔍 Lọc tên..."
                    className="w-full pl-2 pr-5 py-0.5 bg-purple-900/90 focus:bg-white border border-purple-700 focus:border-amber-400 rounded-lg text-[11px] font-black text-white focus:text-purple-950 outline-none placeholder:text-purple-300/80 placeholder:font-normal transition-all"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-1 text-purple-300 hover:text-white text-[10px] font-bold cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </th>
              {weekDays.map((dStr, idx) => (
                <th key={dStr} className="py-2.5 px-1 border-r border-purple-800 text-center font-black uppercase text-amber-300 text-xs min-w-[85px] sm:min-w-[92px]">
                  <div>{DAY_LABELS[idx]}</div>
                  <div className="text-[10px] font-extrabold text-purple-200 mt-0.5">{dStr.split('-').reverse().slice(0, 2).join('/')}</div>
                </th>
              ))}
              <th className="py-2.5 px-2 text-center font-black uppercase text-emerald-300 text-xs bg-purple-950 w-32">
                💵 LƯƠNG TUẦN
              </th>
              <th className="py-2.5 px-2 text-center font-black uppercase text-amber-300 text-xs bg-purple-950 w-44 border-l-2 border-amber-400">
                💰 THỰC NHẬN THÁNG ({selectedMonth.split('-')[1]}/{selectedMonth.split('-')[0]})
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} className="text-center py-12">
                  <div className="inline-block w-8 h-8 border-3 border-purple-200 border-t-purple-700 rounded-full animate-spin" />
                </td>
              </tr>
            ) : filteredEmployees.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center py-10 text-purple-600 italic font-bold">
                  {searchQuery ? `Không tìm thấy nhân viên "${searchQuery}"` : 'Không có nhân viên.'}
                </td>
              </tr>
            ) : (
              <>
                {filteredEmployees.map((emp) => {
                  const empShiftsThisWeek = weekDays.flatMap((dStr) => scheduleByEmpAndDate[`${emp.id}_${dStr}`] || []);
                  const empRates = ratesMap[emp.id] || [];
                  const defaultRate = emp.hourly_rate || 20000;
                  const currentWeeklyRate = getEffectiveRateForDate(emp, empRates, endDate);

                  const empTotals = empWeeklyTotals[emp.id] || { totalHours: 0, grossSalary: 0, shiftCount: 0 };
                  const empMTotal = empMonthlyTotals[emp.id] || { totalHours: 0, grossSalary: 0, shiftCount: 0, totalBonus: 0, totalPenalty: 0, netSalary: 0 };

                  const isOffWeek = empShiftsThisWeek.length === 0;
                  const rowBgClass = isOffWeek ? 'bg-rose-50/40' : 'bg-white';

                  return (
                    <tr key={emp.id} className={`border-b border-purple-100 transition-all ${rowBgClass} hover:bg-purple-100/70`}>
                      {/* Tên Nhân Viên Sticky */}
                      <td
                        className={`py-2 px-2 border-r-2 border-purple-300 font-black text-purple-950 text-xs sticky left-0 z-20 ${rowBgClass} shadow-[4px_0_10px_-2px_rgba(107,33,168,0.15)] transition-all w-28 sm:w-32`}
                      >
                        <div>
                          <div
                            onClick={() => setSelectedEmpForDetail(emp)}
                            className="font-black text-purple-950 truncate text-xs cursor-pointer hover:text-purple-700 transition-colors"
                            title={`Bấm để xem Phiếu Lương của ${emp.name}`}
                          >
                            {emp.name}
                          </div>
                          <div className="text-[10px] font-extrabold text-purple-700 truncate mt-0.5">
                            💵 {formatCurrency(currentWeeklyRate)}/h
                          </div>
                        </div>
                      </td>

                      {/* 7 Ô Ngày (T2 -> CN) */}
                      {weekDays.map((dStr) => {
                        const empShifts = scheduleByEmpAndDate[`${emp.id}_${dStr}`] || [];

                        return (
                          <td key={dStr} className="py-1.5 px-1 border-r border-purple-100 text-center align-middle">
                            {empShifts.length > 0 ? (
                              <div className="space-y-1">
                                {empShifts.map((shift) => {
                                  const startTimeStr = shift.start_time ? shift.start_time.slice(0, 5) : '09:00';
                                  const endTimeStr = shift.end_time ? shift.end_time.slice(0, 5) : '14:00';
                                  const timeRange = `${startTimeStr}-${endTimeStr}`;

                                  const branchObj = branches.find((b) => b.id === shift.branch_id) || shift.branches;
                                  const branchStyle = getBranchColorStyle(branchObj?.name, branchObj?.color);
                                  const { grossSalary: shiftSalary, totalHours: shiftHours } = calculateSalaryFromShifts([shift], empRates, defaultRate, holidays);

                                  // Kiểm tra xem đây có phải là ca gãy (có khoảng nghỉ giữa ca gốc và ca làm thay)
                                  let splitTimeDisplay = null;
                                  if (shift.note) {
                                    const splitMatch = shift.note.match(/\[(?:Ca gốc|Gốc):\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})[^\]]*\].*?\((\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/i);
                                    if (splitMatch) {
                                      const s1 = splitMatch[1];
                                      const e1 = splitMatch[2];
                                      const s2 = splitMatch[3];
                                      const e2 = splitMatch[4];
                                      if (e1 < s2 || e2 < s1) {
                                        splitTimeDisplay = `${s1}-${e1} & ${s2}-${e2}`;
                                      }
                                    }
                                  }

                                  return (
                                    <div
                                      key={shift.id}
                                      className="p-1 rounded-xl bg-purple-50/90 border text-center shadow-2xs space-y-0.5"
                                      style={{ borderColor: `${branchStyle.hex}60` }}
                                      title={shift.note ? `${shift.note} (${shiftHours}h)` : `${timeRange} (${shiftHours}h)`}
                                    >
                                      <div className="flex items-center justify-center gap-0.5">
                                        <span
                                          className="w-2 h-2 rounded-full border border-white flex-shrink-0 shadow-2xs"
                                          style={{ backgroundColor: branchStyle.hex }}
                                          title={`Chi nhánh: ${branchObj?.name || 'Chưa rõ'}`}
                                        />
                                        <span className="text-[9px] font-black text-purple-950 truncate max-w-[60px]">
                                          {branchStyle.badgeText || branchObj?.name}
                                        </span>
                                      </div>

                                      {/* Khung giờ làm việc: Tách 2 dòng rõ ràng nếu là ca gãy */}
                                      {splitTimeDisplay ? (
                                        <div className="text-[10px] font-black text-purple-950 tracking-tight leading-tight">
                                          <div>{splitTimeDisplay.split(' & ')[0]}</div>
                                          <div className="text-[9px] text-purple-700 font-extrabold">&amp; {splitTimeDisplay.split(' & ')[1]}</div>
                                        </div>
                                      ) : (
                                        <div className="text-[10.5px] font-black text-purple-950 tracking-tight">{timeRange}</div>
                                      )}

                                      {/* Tiền lương kèm số giờ làm thực tế để đối soát minh bạch */}
                                      <div className="text-[9.5px] font-black text-emerald-700 bg-emerald-100/70 px-1 py-0.5 rounded-md border border-emerald-200 flex items-center justify-center gap-0.5">
                                        <span className="text-[9px] text-purple-950 font-black">({shiftHours}h)</span>
                                        <span>{formatCurrency(shiftSalary)}</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <span className="text-red-500 font-black text-[9.5px] uppercase px-1 py-0.5 rounded-md bg-red-50 border border-red-200 inline-block shadow-2xs">
                                OFF
                              </span>
                            )}
                          </td>
                        );
                      })}

                      {/* Cột TỔNG LƯƠNG TUẦN */}
                      <td className="py-2 px-1 text-center align-middle bg-purple-100/30">
                        <div className="p-1.5 rounded-2xl bg-purple-700 text-white font-black shadow-xs space-y-0.5">
                          <div className="text-xs font-black tracking-tight">{formatCurrency(empTotals.grossSalary)}</div>
                          <div className="text-[9.5px] font-extrabold text-purple-200">({empTotals.totalHours}h • {empTotals.shiftCount} ca)</div>
                        </div>
                      </td>

                      {/* CỘT NỔI BẬT LƯƠNG THÁNG (THỰC NHẬN = LƯƠNG CA + THƯỞNG - PHẠT) - BẤM VÀO ĐỂ BẬT POPUP CHI TIẾT LƯƠNG THÁNG */}
                      <td className="py-2 px-1 text-center align-middle bg-amber-50/70 border-l-2 border-amber-400">
                        <div
                          onClick={() => setSelectedEmpForDetail(emp)}
                          className="p-1.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-purple-950 font-black shadow-xs space-y-0.5 border border-amber-400 cursor-pointer transition-all active:scale-95 hover:scale-[1.03] hover:shadow-md group"
                          title={`Bấm để xem bảng chi tiết lương tháng & Thưởng/Phạt của ${emp.name}`}
                        >
                          <div className="text-xs font-black tracking-tight">{formatCurrency(empMTotal.netSalary)}</div>
                          <div className="text-[9.5px] font-extrabold text-purple-900">({empMTotal.totalHours}h • {empMTotal.shiftCount} ca)</div>
                          {(empMTotal.totalBonus > 0 || empMTotal.totalPenalty > 0) && (
                            <div className="space-y-0.5 pt-0.5 border-t border-amber-400/70 font-bold mt-0.5">
                              <div className="flex items-center justify-center gap-1 text-[9px]">
                                {empMTotal.totalBonus > 0 && <span className="text-emerald-950 font-extrabold">🎁+{formatCurrency(empMTotal.totalBonus)}</span>}
                                {empMTotal.totalPenalty > 0 && <span className="text-rose-950 font-extrabold">⚠️-{formatCurrency(empMTotal.totalPenalty)}</span>}
                              </div>
                              <div className="text-[8.5px] font-black text-purple-900/80 pt-0.5 border-t border-amber-400/40" title="Lương ca gốc (chưa tính thưởng/phạt)">
                                Gốc: {formatCurrency(empMTotal.grossSalary)}
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {/* HÀNG CỘNG TỔNG TOÀN BỘ CA LÀM VÀ LƯƠNG THÁNG CUỐI BẢNG */}
                <tr className="bg-purple-950 text-white font-black border-t-2 border-purple-800">
                  <td className="py-3 px-2 font-black text-purple-950 text-xs sm:text-sm sticky left-0 z-20 bg-purple-200/90 shadow-[4px_0_10px_-2px_rgba(107,33,168,0.15)] uppercase">
                    TỔNG LƯƠNG
                  </td>
                  {weekDays.map((dStr) => {
                    const dayShifts = schedule.filter((s) => s.date === dStr);
                    let daySal = 0;
                    let dayHrs = 0;

                    dayShifts.forEach((shift) => {
                      const empRates = ratesMap[shift.employee_id] || [];
                      const emp = sortedEmployees.find((e) => e.id === shift.employee_id);
                      const defaultRate = emp?.hourly_rate || 20000;
                      const { grossSalary, totalHours: shiftHrs } = calculateSalaryFromShifts([shift], empRates, defaultRate, holidays);
                      daySal += grossSalary;
                      dayHrs += shiftHrs;
                    });

                    return (
                      <td key={dStr} className="py-3 px-2 border-r border-purple-800 text-center">
                        <div className="text-xs font-black text-emerald-300">{formatCurrency(daySal)}</div>
                        <div className="text-[10px] font-extrabold text-purple-200">{Math.round(dayHrs * 100) / 100}h</div>
                      </td>
                    );
                  })}
                  <td className="py-3 px-3 text-center bg-purple-900">
                    <div className="text-xs sm:text-sm font-black text-emerald-300">{formatCurrency(grandTotalSalary)}</div>
                    <div className="text-[10px] font-extrabold text-purple-200">({grandTotalHours}h)</div>
                  </td>
                  <td className="py-3 px-3 text-center bg-amber-600 border-l-4 border-amber-400">
                    <div className="text-xs sm:text-sm font-black text-white">{formatCurrency(grandTotalMonthlyNet)}</div>
                    <div className="text-[10px] font-extrabold text-amber-100">({grandTotalMonthlyHours}h)</div>
                    {(grandTotalMonthlyBonus > 0 || grandTotalMonthlyPenalty > 0) && (
                      <div className="space-y-0.5 pt-0.5 border-t border-amber-500/70 mt-1">
                        <div className="flex items-center justify-center gap-1 text-[9.5px] font-bold">
                          {grandTotalMonthlyBonus > 0 && <span className="text-emerald-200">🎁+{formatCurrency(grandTotalMonthlyBonus)}</span>}
                          {grandTotalMonthlyPenalty > 0 && <span className="text-rose-200">⚠️-{formatCurrency(grandTotalMonthlyPenalty)}</span>}
                        </div>
                        <div className="text-[10px] font-black text-amber-100 pt-0.5 border-t border-amber-500/50" title="Lương ca gốc (chưa cộng thưởng/trừ phạt)">
                          Gốc: {formatCurrency(grandTotalMonthlySalary)}
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* POPUP BẢNG CHI TIẾT LƯƠNG THÁNG VÀ THƯỞNG PHẠT */}
      {selectedEmpForDetail && (
        <ModalEmployeeSalaryDetail
          isOpen={!!selectedEmpForDetail}
          onClose={() => setSelectedEmpForDetail(null)}
          employee={selectedEmpForDetail}
          initialMonth={selectedMonth}
          onSelectPenaltyEmployee={onSelectPenaltyEmployee}
        />
      )}

      {/* MODAL CHỌN NHANH TUẦN & NĂM */}
      {showWeekPickerModal && (
        <ModalWeekPicker
          isOpen={showWeekPickerModal}
          onClose={() => setShowWeekPickerModal(false)}
          currentMonday={currentMonday}
          onSelectMonday={(mStr) => {
            setCurrentMonday(mStr);
          }}
        />
      )}
    </div>
  );
}
