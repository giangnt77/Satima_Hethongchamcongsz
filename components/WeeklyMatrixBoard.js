'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import html2canvas from 'html2canvas';
import {
  getBranches,
  getAvailabilityByDateRange,
  getScheduleByDateRange,
  upsertSchedule,
  deleteSchedule,
  upsertAvailability,
  updateEmployeesSortOrders,
  getHolidaySettings,
  getHolidayForDate,
  getBlockedOffDays,
  getWeekLockStatus,
  saveWeekLockStatus,
  getWeeklyRegistrationLockDay,
  saveWeeklyRegistrationLockDay,
  getAllEmployeeRates,
  calculateSalaryFromShifts,
} from '@/lib/supabase';
import {
  getBranchColorStyle,
  getToday,
  formatCurrency,
  formatDateISO,
  getMondayOfCurrentWeek,
  getWeekDaysFromMonday,
  calculateHours,
} from '@/lib/utils';
import ModalXepLichQuick from './ModalXepLichQuick';
import ModalSortEmployees from './ModalSortEmployees';
import ModalBlockOffDays from './ModalBlockOffDays';
import ModalHolidaySettings from './ModalHolidaySettings';
import ModalWeekPicker from './ModalWeekPicker';
import ModalAdjustedShiftsList from './ModalAdjustedShiftsList';

function calculateShiftHours(shift) {
  if (!shift) return 0;
  if (shift.hours && Number(shift.hours) > 0) {
    return Number(shift.hours);
  }
  if (shift.duration_hours && Number(shift.duration_hours) > 0) {
    return Number(shift.duration_hours);
  }
  const startStr = shift.start_time || '09:00';
  const endStr = shift.end_time || '14:00';
  const [sH, sM] = startStr.split(':').map(Number);
  const [eH, eM] = endStr.split(':').map(Number);
  let startMinutes = (sH || 0) * 60 + (sM || 0);
  let endMinutes = (eH || 0) * 60 + (eM || 0);
  if (endMinutes <= startMinutes) {
    endMinutes += 24 * 60;
  }
  return Math.max(0, (endMinutes - startMinutes) / 60);
}

// Bóc tách text hiển thị chi tiết (ví dụ: [Gốc 15h-22h] đổi ca sáng, +3h làm thay Loan...)
function getShiftAdjustmentDisplay(shift) {
  if (!shift || !shift.note) return null;
  const note = shift.note.trim();

  // Kiểm tra format [Gốc: ...] hoặc [Ca gốc: ...]
  const match = note.match(/\[(?:Ca gốc|Gốc):\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})(?:\s*\|\s*([^\]]+))?\]\s*(.*)/i);
  if (match) {
    const origStart = match[1];
    const origEnd = match[2];
    const insidePipe = (match[3] || '').trim();
    const outsideText = (match[4] || '').trim();
    const sH = origStart.replace(':00', 'h');
    const eH = origEnd.replace(':00', 'h');

    // 1. Trường hợp tăng ca làm thay (ví dụ: +3h làm thay Mai Loan (từ 19:00))
    if (outsideText && outsideText.startsWith('+')) {
      return outsideText.replace(/:00/g, 'h');
    }

    // 2. Trường hợp bạn kia làm thay từ mấy giờ (ví dụ: [Gốc 16:00-22:00 | Tường Duy làm thay từ 19:00])
    if (insidePipe) {
      return `[Gốc ${sH}-${eH}] ${insidePipe.replace(/:00/g, 'h')}`;
    }

    // 3. Trường hợp đổi ca / ghi chú tùy biến (ví dụ: [Gốc: 15:00-22:00] đổi ca sáng)
    if (outsideText) {
      return `[Gốc ${sH}-${eH}] ${outsideText.replace(/:00/g, 'h')}`;
    }

    // 4. Mặc định tính chênh lệch giờ so với ca hiện tại
    const curStart = shift.start_time ? shift.start_time.slice(0, 5) : '';
    const curEnd = shift.end_time ? shift.end_time.slice(0, 5) : '';
    if (curStart && curEnd && origStart && origEnd) {
      const [sh, sm] = curStart.split(':').map(Number);
      const [eh, em] = curEnd.split(':').map(Number);
      const [osh, osm] = origStart.split(':').map(Number);
      const [oeh, oem] = origEnd.split(':').map(Number);
      let curH = (eh * 60 + em - (sh * 60 + sm)) / 60;
      if (curH < 0) curH += 24;
      let origH = (oeh * 60 + oem - (osh * 60 + osm)) / 60;
      if (origH < 0) origH += 24;
      const diff = Math.round((curH - origH) * 100) / 100;
      if (diff > 0) return `+${diff}h tăng ca`;
      if (diff < 0) return `[Gốc ${sH}-${eH}] Về sớm (${diff}h)`;
    }

    return `Gốc: ${sH}-${eH}`;
  }

  return note;
}

/**
 * WeeklyMatrixBoard — Bảng Ma Trận Phân Công Ca Làm Tuần Chuẩn ExcelCao Cấp.
 * Hiển thị chính xác như ảnh mẫu: STT | Tên Nhân Viên | T2 -> CN.
 * Bấm vào bất kỳ ô ngày của Nhân viên để mở Modal Xếp Lịch / Chỉnh Sửa / Xóa Ca.
 */



function formatBranchDisplayName(name = '') {
  if (!name) return '';
  const n = String(name).trim();
  if (n.toLowerCase().includes('thạch lam') || n.toLowerCase().includes('thach lam') || n.toUpperCase() === 'TL') {
    return 'TL';
  }
  return n;
}

function formatAvailTextForView(empAvail, isReadOnly) {
  if (!empAvail) return null;

  if (empAvail.type === 'full') {
    return '💪 Cả ngày';
  }

  if (empAvail.type === 'off') {
    // Phía Admin (isReadOnly === false): Hiện chi tiết ghi chú xin nghỉ
    if (!isReadOnly && empAvail.note) {
      return `🔴 ${empAvail.note}`;
    }
    // Phía Nhân Viên (isReadOnly === true): Ẩn 100% lý do riêng tư, chỉ hiện "Xin nghỉ"!
    return '🔴 Xin nghỉ';
  }

  // Loại 'option' (Tùy ca):
  const rawNote = (empAvail.note || '').trim();
  const isOnlyHours = /^\d{1,2}h?(\d{2})?\s*-\s*\d{1,2}h?(\d{2})?$/i.test(rawNote) || /^\d{1,2}h\s*-\s*\d{1,2}h$/i.test(rawNote);

  if (isReadOnly) {
    // Phía Nhân Viên: Giữ mốc giờ sạch (VD: "9h-17h"). Nếu là lý do chữ cá nhân ("bận học", "thứ 2 em xin...") -> Hiện "📝 Tùy ca"!
    if (isOnlyHours) {
      return `📝 ${rawNote}`;
    }
    return '📝 Tùy ca';
  }

  // Phía Admin: Hiện đầy đủ ghi chú
  return `📝 ${rawNote || 'Tùy ca'}`;
}

const DAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

export default function WeeklyMatrixBoard({ employees, toast, highlightEmployeeId, readOnly = false, onRefreshEmployees }) {
  const [currentMonday, setCurrentMonday] = useState(getMondayOfCurrentWeek());
  const [branches, setBranches] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [localSchedule, setLocalSchedule] = useState([]);
  const [deletedShiftIds, setDeletedShiftIds] = useState([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isBatchSaving, setIsBatchSaving] = useState(false);
  const [availability, setAvailability] = useState([]);
  const [localAvailability, setLocalAvailability] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSortModal, setShowSortModal] = useState(false);
  const [showBlockOffModal, setShowBlockOffModal] = useState(false);
  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [showWeekPickerModal, setShowWeekPickerModal] = useState(false);
  const [showAdjustedShiftsModal, setShowAdjustedShiftsModal] = useState(false);
  const [showRegistrationLockModal, setShowRegistrationLockModal] = useState(false);
  const [registrationLockDay, setRegistrationLockDay] = useState(0);
  const [isLoadingRegistrationLockDay, setIsLoadingRegistrationLockDay] = useState(false);
  const [isSavingRegistrationLockDay, setIsSavingRegistrationLockDay] = useState(false);
  const [registrationLockSettingsError, setRegistrationLockSettingsError] = useState('');
  const [isWeekLocked, setIsWeekLocked] = useState(false);
  const [ratesMap, setRatesMap] = useState({});
  const [holidays, setHolidays] = useState([]);
  const [blockedMap, setBlockedMap] = useState({});

  // Modal State
  const [modalState, setModalState] = useState({
    isOpen: false,
    date: null,
    branch: null,
    employee: null,
    editItem: null,
  });

  const weekDays = useMemo(() => getWeekDaysFromMonday(currentMonday), [currentMonday]);
  const startDate = weekDays[0];
  const endDate = weekDays[6];

  // Danh sách các ca có phát sinh đổi ca / làm thay / tăng ca / về sớm trong tuần (Chỉ áp dụng khi tuần ĐÃ CHỐT LỊCH)
  const adjustedShiftsInWeek = useMemo(() => {
    if (!isWeekLocked) return [];
    const activeSched = localSchedule.length > 0 ? localSchedule : schedule;
    return activeSched.filter((s) => {
      if (!s || !s.note) return false;
      const n = s.note.toLowerCase();
      return (
        n.includes('[gốc:') ||
        n.includes('[ca gốc:') ||
        n.includes('làm thay') ||
        n.includes('tăng ca') ||
        n.includes('về sớm') ||
        n.includes('gánh ca') ||
        n.includes('[đổi ca')
      );
    });
  }, [localSchedule, schedule, isWeekLocked]);

  const tableContainerRef = useRef(null);

  useEffect(() => {
    loadWeekData();
  }, [currentMonday]);

  // CHỈ BÊN NHÂN VIÊN ĐĂNG NHẬP (readOnly === true): TỰ ĐỘNG CUỘN NGANG ĐẾN CỘT "HÔM NAY" ĐỂ XEM LỊCH NHANH ⚡
  useEffect(() => {
    if (readOnly && !loading && tableContainerRef.current) {
      const todayStr = getToday();
      const todayIdx = weekDays.indexOf(todayStr);
      if (todayIdx >= 0) {
        requestAnimationFrame(() => {
          const todayTh = tableContainerRef.current?.querySelector(`[data-date="${todayStr}"]`);
          if (todayTh) {
            const scrollLeft = todayTh.offsetLeft - 140;
            tableContainerRef.current.scrollTo({ left: Math.max(0, scrollLeft), behavior: 'smooth' });
          }
        });
      }
    }
  }, [readOnly, loading, weekDays]);

  async function loadWeekData(isSilent = false) {
    const savedScrollY = typeof window !== 'undefined' ? window.scrollY : 0;
    if (!isSilent) {
      setLoading(true);
    }
    try {
      const [branchData, schedData, availData, holidayData, blockedData, lockStatus, allRatesData] = await Promise.all([
        getBranches(),
        getScheduleByDateRange(startDate, endDate),
        getAvailabilityByDateRange(startDate, endDate),
        getHolidaySettings(),
        getBlockedOffDays(),
        getWeekLockStatus(currentMonday),
        getAllEmployeeRates(),
      ]);
      setBranches(branchData);
      setSchedule(schedData);
      setLocalSchedule(schedData);
      setDeletedShiftIds([]);
      setHasUnsavedChanges(false);
      setAvailability(availData);
      setLocalAvailability(availData);
      setHolidays(Array.isArray(holidayData) ? holidayData : []);
      setIsWeekLocked(Boolean(lockStatus));

      const rMap = {};
      (allRatesData || []).forEach((r) => {
        if (!rMap[r.employee_id]) rMap[r.employee_id] = [];
        rMap[r.employee_id].push(r);
      });
      setRatesMap(rMap);

      if (blockedData && typeof blockedData === 'object' && !Array.isArray(blockedData)) {
        if (Array.isArray(blockedData.blockedDays)) {
          const map = {};
          blockedData.blockedDays.forEach((dIdx) => {
            map[dIdx] = blockedData.reason || 'Ngày cao điểm đông khách, quán yêu cầu đi làm đầy đủ!';
          });
          setBlockedMap(map);
        } else {
          setBlockedMap(blockedData);
        }
      } else if (Array.isArray(blockedData)) {
        const map = {};
        blockedData.forEach((dIdx) => {
          map[dIdx] = 'Ngày cao điểm đông khách, quán yêu cầu đi làm đầy đủ!';
        });
        setBlockedMap(map);
      }
    } catch (err) {
      console.error(err);
      if (toast) toast.error('Lỗi', 'Không thể tải lịch tuần');
    }
    if (!isSilent) {
      setLoading(false);
    }

    // Tự động giữ nguyên vị trí cuộn màn hình hiện tại của Admin
    if (typeof window !== 'undefined' && savedScrollY > 0) {
      requestAnimationFrame(() => {
        window.scrollTo({ top: savedScrollY, behavior: 'instant' });
      });
    }
  }

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

  async function handleToggleWeekLock() {
    const nextLock = !isWeekLocked;
    if (nextLock) {
      const confirmed = window.confirm(
        '🔒 Bạn có chắc muốn CHỐT LỊCH TUẦN NÀY?\n\n- Toàn bộ lịch làm hiện tại sẽ được lưu làm MỐC CA GỐC chính thức.\n- Các thay đổi sau này trong tuần sẽ được tính là Làm thay / Tăng ca / Về sớm.\n- Bạn vẫn có thể Mở lại chốt lịch bất cứ lúc nào nếu cần xếp lại.'
      );
      if (!confirmed) return;
    }

    try {
      await saveWeekLockStatus(currentMonday, nextLock);
      setIsWeekLocked(nextLock);
      if (toast) {
        if (nextLock) {
          toast.success('Đã chốt lịch tuần!', 'Lịch tuần này đã được chốt làm Lịch Gốc chính thức.');
        } else {
          toast.info('Đã mở khóa lịch tuần', 'Bạn có thể chỉnh sửa lịch tự do mà không tính làm thay.');
        }
      }
    } catch (err) {
      console.error('Error saving schedule lock status:', err);
      if (toast) toast.error('Lỗi', 'Không thể lưu trạng thái chốt lịch tuần.');
    }
  }

  async function openRegistrationLockSettings() {
    setShowRegistrationLockModal(true);
    setIsLoadingRegistrationLockDay(true);
    setRegistrationLockSettingsError('');
    try {
      setRegistrationLockDay(await getWeeklyRegistrationLockDay());
    } catch (err) {
      console.error('Error loading weekly registration lock settings:', err);
      setRegistrationLockSettingsError(err.message || 'Không thể tải cài đặt ngày khóa đăng ký.');
      if (toast) toast.error('Lỗi', 'Không thể tải cài đặt ngày khóa đăng ký.');
    } finally {
      setIsLoadingRegistrationLockDay(false);
    }
  }

  async function handleSaveRegistrationLockDay() {
    setIsSavingRegistrationLockDay(true);
    try {
      await saveWeeklyRegistrationLockDay(registrationLockDay);
      setShowRegistrationLockModal(false);
      if (toast) {
        toast.success(
          'Đã lưu cài đặt',
          registrationLockDay === null
            ? 'Đã tắt tự động khóa đăng ký tuần.'
            : `Đăng ký tuần sẽ tự khóa vào ${['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'][registrationLockDay]}.`
        );
      }
    } catch (err) {
      console.error('Error saving weekly registration lock settings:', err);
      if (toast) toast.error('Lỗi', 'Không thể lưu cài đặt ngày khóa đăng ký.');
    } finally {
      setIsSavingRegistrationLockDay(false);
    }
  }

  // Lọc bỏ tài khoản Owner & Quản Lý ra khỏi Bảng Xếp Lịch Nhân Viên (BẰNG MỌI GIÁ LOẠI BỎ 'Owner' VÀ 'Manager')
  const staffEmployees = useMemo(() => {
    if (!employees || employees.length === 0) return [];
    return employees.filter((e) => {
      const nameLower = String(e.name || '').toLowerCase().trim();
      const roleLower = String(e.role || '').toLowerCase().trim();
      return (
        roleLower !== 'owner' &&
        roleLower !== 'manager' &&
        nameLower !== 'owner' &&
        nameLower !== 'manager' &&
        !nameLower.includes('owner') &&
        !nameLower.includes('manager') &&
        !nameLower.includes('chủ quán') &&
        !nameLower.includes('quản lý')
      );
    });
  }, [employees]);

  // Sắp xếp danh sách nhân viên: Theo sort_order do Admin sắp xếp
  const sortedEmployees = useMemo(() => {
    if (!staffEmployees || staffEmployees.length === 0) return [];

    return [...staffEmployees].sort((a, b) => {
      if (highlightEmployeeId) {
        if (a.id === highlightEmployeeId) return -1;
        if (b.id === highlightEmployeeId) return 1;
      }

      const orderA = a.sort_order ?? 999;
      const orderB = b.sort_order ?? 999;
      if (orderA !== orderB) return orderA - orderB;

      return a.name.localeCompare(b.name);
    });
  }, [staffEmployees, highlightEmployeeId]);

  // Index map dữ liệu ca làm theo employeeId_date
  const scheduleByEmpAndDate = useMemo(() => {
    const map = {};
    localSchedule.forEach((item) => {
      const key = `${item.employee_id}_${item.date}`;
      if (!map[key]) map[key] = [];
      map[key].push(item);
    });
    return map;
  }, [localSchedule]);

  // Helper tính chuẩn xác tổng lương & tổng giờ dựa trên lịch sử tăng lương và ngày lễ
  const calcTotalSalaryForShifts = useMemo(() => {
    return (shiftsList) => {
      let totalH = 0;
      let totalS = 0;

      const shiftsByEmp = {};
      (shiftsList || []).forEach((s) => {
        if (!s || !s.employee_id) return;
        if (!shiftsByEmp[s.employee_id]) shiftsByEmp[s.employee_id] = [];
        shiftsByEmp[s.employee_id].push(s);
      });

      Object.keys(shiftsByEmp).forEach((empId) => {
        const emp = (employees || []).find((e) => e.id === empId);
        const empRates = ratesMap[empId] || [];
        const defaultRate = emp?.hourly_rate || 20000;
        const { totalHours, grossSalary } = calculateSalaryFromShifts(
          shiftsByEmp[empId],
          empRates,
          defaultRate,
          holidays
        );
        totalH += totalHours;
        totalS += grossSalary;
      });

      return {
        totalHours: Math.round(totalH * 100) / 100,
        totalSalary: Math.round(totalS),
      };
    };
  }, [employees, ratesMap, holidays]);

  // Tính tổng lương & tổng giờ làm của toàn bộ 7 ngày trong tuần
  const { weekTotalHours, weekTotalSalary } = useMemo(() => {
    const weekShifts = (localSchedule || []).filter((s) => weekDays.includes(s.date));
    const res = calcTotalSalaryForShifts(weekShifts);
    return {
      weekTotalHours: res.totalHours || 0,
      weekTotalSalary: res.totalSalary || 0,
    };
  }, [localSchedule, weekDays, calcTotalSalaryForShifts]);

  // Index map lịch rảnh theo employeeId_date
  const availByEmpAndDate = useMemo(() => {
    const map = {};
    (localAvailability.length > 0 ? localAvailability : availability).forEach((item) => {
      const key = `${item.employee_id}_${item.date}`;
      map[key] = item;
    });
    return map;
  }, [localAvailability, availability]);

  // Phân loại danh sách nhân viên thành 3 nhóm độc lập:
  // 1. matrixEmployees: Nhân viên đi làm -> Hiện trong bảng ma trận xếp lịch chính
  // 2. shortLeaveEmployees: BẢNG VÀNG 🟡 -> Danh sách Nhân viên xin nghỉ cả tuần (7/7 ngày) hoặc trạng thái 'leave'
  // 3. permanentOffEmployees: BẢNG ĐỎ 🔴 -> Danh sách Nhân viên Off luôn / nghỉ việc cố định ('off')
  const { matrixEmployees, shortLeaveEmployees, permanentOffEmployees } = useMemo(() => {
    if (!sortedEmployees) return { matrixEmployees: [], shortLeaveEmployees: [], permanentOffEmployees: [] };

    const matrix = [];
    const shortLeaveList = [];
    const permanentOffList = [];

    sortedEmployees.forEach((emp) => {
      // 0. Kiểm tra xem nhân viên có ca phân công nào trong tuần này không (dù 1 ca cũng tính)
      const hasShiftsInThisWeek = weekDays.some(
        (dStr) => (scheduleByEmpAndDate[`${emp.id}_${dStr}`] || []).length > 0
      );

      // QUY TẮC ƯU TIÊN SỐ 1: Bất kỳ tuần nào có ca phân công -> LUÔN HIỆN TRÊN BẢNG MA TRẬN CHÍNH
      if (hasShiftsInThisWeek) {
        matrix.push(emp);
        return;
      }

      // 0.1 Nếu nhân viên mới vào làm SAU KHI tuần này đã kết thúc -> Ẩn tên khỏi bảng tuần cũ này
      const empStartDate = emp.created_at ? emp.created_at.slice(0, 10) : '2000-01-01';
      if (empStartDate > endDate) {
        return;
      }

      // 1. NGHỈ VIỆC / OFF CỐ ĐỊNH ('off')
      // Nếu tuần đang xem xảy ra TRƯỚC NGÀY NGHỈ VIỆC (startDate < resignedDate) -> Vẫn hiển thị bình thường ở các tuần quá khứ!
      // Nếu tuần đang xem diễn ra SAU KHI ĐÃ NGHỈ VIỆC và không có ca làm -> Ẩn khỏi bảng ma trận chính để tránh rác hàng OFF!
      if (emp.status === 'off' || emp.is_active === false) {
        const resignedDate = emp.resigned_at || emp.off_date || (emp.created_at ? emp.created_at.slice(0, 10) : '1970-01-01');
        const hasShiftsInThisWeek = (weekDays || []).some(
          (dStr) => (scheduleByEmpAndDate[`${emp.id}_${dStr}`] || []).length > 0
        );

        if (hasShiftsInThisWeek || startDate < resignedDate) {
          matrix.push(emp); // Tuần quá khứ trước khi nghỉ hoặc có ca làm -> Vẫn hiện trên bảng!
        } else {
          permanentOffList.push({
            employee: emp,
            reason: `Đã nghỉ việc từ ${resignedDate.split('-').reverse().join('/')}`,
          });
        }
        return;
      }

      // 2. XIN OFF TẠM THỜI ('leave')
      if (emp.status === 'leave') {
        const offStart = emp.off_start_date || (emp.updated_at ? emp.updated_at.slice(0, 10) : startDate);
        const offEnd = emp.off_end_date || offStart;

        // Nếu tuần đang xem nằm trước offStart hoặc nằm sau offEnd -> Hiện tên trên bảng chính
        if (endDate < offStart || startDate > offEnd) {
          matrix.push(emp);
          return;
        }

        // Tính số ngày trong tuần này bị trùng khoảng off [offStart -> offEnd]
        const daysInOffPeriod = weekDays.filter((dStr) => dStr >= offStart && dStr <= offEnd);

        // Nếu OFF TOÀN BỘ 7 NGÀY TRONG TUẦN VÀ KHÔNG CÓ CA NÀO -> Mới đưa vào BẢNG VÀNG 🟡
        if (daysInOffPeriod.length >= 7) {
          shortLeaveList.push({
            employee: emp,
            reason: `Off từ ${offStart.split('-').reverse().slice(0, 2).join('/')} đến ${offEnd.split('-').reverse().slice(0, 2).join('/')}`,
            offDaysCount: daysInOffPeriod.length,
          });
          return;
        }

        // Nếu off vài ngày trong tuần (ví dụ off từ Chủ Nhật) -> VẪN GIỮ NGHUYÊN TRÊN BẢNG MA TRẬN CHÍNH!
        matrix.push(emp);
        return;
      }

      // 3. TẤT CẢ NHÂN VIÊN ĐANG LÀM ('active') -> LUÔN HIỆN TRÊN BẢNG MA TRẬN CHÍNH
      matrix.push(emp);
    });

    return {
      matrixEmployees: matrix,
      shortLeaveEmployees: shortLeaveList,
      permanentOffEmployees: permanentOffList,
    };
  }, [sortedEmployees, weekDays, startDate, endDate, availByEmpAndDate, scheduleByEmpAndDate]);

  const [customMatrixOrder, setCustomMatrixOrder] = useState([]);
  const [draggedIdx, setDraggedIdx] = useState(null);
  const [isSortMode, setIsSortMode] = useState(false);
  const [savingSort, setSavingSort] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [nameSortOrder, setNameSortOrder] = useState('default'); // 'default' | 'asc' | 'desc'

  const toggleNameSort = () => {
    setNameSortOrder((prev) => {
      if (prev === 'default') return 'asc';
      if (prev === 'asc') return 'desc';
      return 'default';
    });
  };

  // Danh sách nhân viên hiển thị trên bảng ma trận sau khi lọc/sắp xếp tên (giống bảng QL tính lương)
  const filteredMatrixOrder = useMemo(() => {
    let list = [...customMatrixOrder];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((emp) => {
        const name = (emp.name || '').toLowerCase();
        const nickname = (emp.nickname || '').toLowerCase();
        return name.includes(q) || nickname.includes(q);
      });
    }

    if (nameSortOrder === 'asc') {
      list.sort((a, b) => {
        const nameA = (a.nickname || a.name || '').trim();
        const nameB = (b.nickname || b.name || '').trim();
        return nameA.localeCompare(nameB, 'vi', { sensitivity: 'base' });
      });
    } else if (nameSortOrder === 'desc') {
      list.sort((a, b) => {
        const nameA = (a.nickname || a.name || '').trim();
        const nameB = (b.nickname || b.name || '').trim();
        return nameB.localeCompare(nameA, 'vi', { sensitivity: 'base' });
      });
    }

    return list;
  }, [customMatrixOrder, searchQuery, nameSortOrder]);

  useEffect(() => {
    if (matrixEmployees && matrixEmployees.length > 0) {
      setCustomMatrixOrder(matrixEmployees);
    }
  }, [matrixEmployees]);

  // Khi hoàn thành sắp xếp, lưu lên Google Sheets và làm mới dữ liệu cho Admin và Nhân viên.
  async function handleFinishSorting() {
    setSavingSort(true);
    try {
      const fullList = [
        ...customMatrixOrder,
        ...shortLeaveEmployees.map((x) => x.employee),
        ...permanentOffEmployees.map((x) => x.employee),
      ];
      const orders = fullList.map((emp, i) => ({
        id: emp.id,
        sort_order: i + 1,
      }));

      await updateEmployeesSortOrders(orders);
      if (onRefreshEmployees) await onRefreshEmployees();
      await loadWeekData();
      setIsSortMode(false);
      if (toast) toast.success('Đã lưu thứ tự', 'Đã cập nhật thứ tự mới cho cả Admin & Nhân Viên!');
    } catch (err) {
      console.error('Lỗi lưu thứ tự lên Google Sheets:', err);
      if (toast) toast.error('Lỗi', 'Không thể lưu thứ tự nhân viên!');
    }
    setSavingSort(false);
  }

  function jumpDirectMatrixPosition(fromIndex, toIndex) {
    if (toIndex < 0 || toIndex >= customMatrixOrder.length || fromIndex === toIndex) return;
    const newMatrix = [...customMatrixOrder];
    const [movedEmp] = newMatrix.splice(fromIndex, 1);
    newMatrix.splice(toIndex, 0, movedEmp);
    setCustomMatrixOrder(newMatrix);
  }

  function handleDirectDragStart(e, index) {
    if (!isSortMode) return;
    setDraggedIdx(index);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDirectDragOver(e, index) {
    if (!isSortMode) return;
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === index) return;
    jumpDirectMatrixPosition(draggedIdx, index);
    setDraggedIdx(index);
  }

  function handleDirectDragEnd() {
    setDraggedIdx(null);
  }

  function handleDirectTouchStart(e, index) {
    if (!isSortMode) return;
    setDraggedIdx(index);
  }

  function handleDirectTouchMove(e) {
    if (!isSortMode || draggedIdx === null) return;
    const touch = e.touches[0];
    const targetElement = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!targetElement) return;
    const cellElement = targetElement.closest('[data-sort-index]');
    if (cellElement) {
      const targetIdx = Number(cellElement.getAttribute('data-sort-index'));
      if (!isNaN(targetIdx) && targetIdx !== draggedIdx) {
        jumpDirectMatrixPosition(draggedIdx, targetIdx);
        setDraggedIdx(targetIdx);
      }
    }
  }

  function handleDirectTouchEnd() {
    setDraggedIdx(null);
  }

  const [copyingEmpId, setCopyingEmpId] = useState(null);

  async function handleCopyEmployeePrevWeek(emp) {
    const [y, m, d] = currentMonday.split('-').map(Number);
    const prevMondayObj = new Date(y, m - 1, d - 7);
    const prevSundayObj = new Date(y, m - 1, d - 1);
    const prevStartDate = formatDateISO(prevMondayObj);
    const prevEndDate = formatDateISO(prevSundayObj);

    if (
      !confirm(
        `Bạn có muốn SAO CHÉP toàn bộ ca làm tuần trước (${prevStartDate
          .split('-')
          .reverse()
          .slice(0, 2)
          .join('/')} - ${prevEndDate.split('-').reverse().slice(0, 2).join('/')}) của nhân viên "${emp.name}" sang tuần này không?`
      )
    ) {
      return;
    }

    setCopyingEmpId(emp.id);
    try {
      const prevSchedData = await getScheduleByDateRange(prevStartDate, prevEndDate);
      const empPrevShifts = prevSchedData.filter((s) => s.employee_id === emp.id);

      if (!empPrevShifts || empPrevShifts.length === 0) {
        if (toast) toast.warning('Trống', `Tuần trước nhân viên ${emp.name} chưa có ca làm nào!`);
        setCopyingEmpId(null);
        return;
      }

      let count = 0;
      for (const item of empPrevShifts) {
        const itemDate = new Date(item.date + 'T00:00:00');
        const newDateObj = new Date(itemDate.getFullYear(), itemDate.getMonth(), itemDate.getDate() + 7);
        const newDateStr = formatDateISO(newDateObj);

        await upsertSchedule({
          employeeId: item.employee_id,
          branchId: item.branch_id,
          date: newDateStr,
          startTime: item.start_time ? item.start_time.slice(0, 5) : '09:00',
          endTime: item.end_time ? item.end_time.slice(0, 5) : '14:00',
          hours: item.hours || 5,
          note: item.note || '',
        });
        count++;
      }

      await loadWeekData(true);
      if (toast) toast.success('Đã sao chép!', `Đã sao chép ${count} ca làm tuần trước cho ${emp.name}!`);
    } catch (err) {
      console.error(err);
      if (toast) toast.error('Lỗi', `Không thể sao chép lịch cho ${emp.name}`);
    }
    setCopyingEmpId(null);
  }

  // 1. Gán / Chỉnh sửa ca làm từ Modal (chỉ cập nhật State Local & đánh dấu isDirty)
  function handleSaveModal(data) {
    const datesToApply = data.applyWholeWeek ? weekDays : [data.date];
    const targetBranch = branches.find((b) => b.id === data.branchId) || branches[0];

    setLocalSchedule((prev) => {
      let updated = [...prev];
      datesToApply.forEach((dStr) => {
        // =========================================================================
        // TRƯỜNG HỢP 1: HOÁN ĐỔI CA HOÀN TOÀN GIỮA 2 NHÂN VIÊN (SWAP EMPLOYEES)
        // =========================================================================
        if (data.swapEmployeeId) {
          const empA = employees.find((e) => e.id === data.employeeId);
          const empB = employees.find((e) => e.id === data.swapEmployeeId);
          const empAName = empA?.name || 'Nhân viên';
          const empBName = empB?.name || 'Nhân viên';

          const idxA = updated.findIndex((s) => s.employee_id === data.employeeId && s.date === dStr);
          const idxB = updated.findIndex((s) => s.employee_id === data.swapEmployeeId && s.date === dStr);

          if (idxA !== -1 && idxB !== -1) {
            // Cả 2 đều có ca -> Hoán đổi ca cho nhau
            const shiftA = { ...updated[idxA] };
            const shiftB = { ...updated[idxB] };

            const origAStart = shiftA.start_time?.slice(0, 5) || data.startTime;
            const origAEnd = shiftA.end_time?.slice(0, 5) || data.endTime;
            const origBStart = shiftB.start_time?.slice(0, 5);
            const origBEnd = shiftB.end_time?.slice(0, 5);

            updated[idxA] = {
              ...shiftB,
              id: shiftA.id,
              employee_id: data.employeeId,
              note: isWeekLocked ? `[Gốc: ${origAStart}-${origAEnd} | Đổi ca với ${empBName}]` : (shiftB.note || ''),
              isDirty: true,
            };

            updated[idxB] = {
              ...shiftA,
              id: shiftB.id,
              employee_id: data.swapEmployeeId,
              note: isWeekLocked ? `[Gốc: ${origBStart}-${origBEnd} | Đổi ca với ${empAName}]` : (shiftA.note || ''),
              isDirty: true,
            };

            // Đảm bảo cả 2 nhân viên đều không bị dính cờ OFF khi hoán đổi ca đi làm với nhau
            setLocalAvailability((prevAvail) => {
              const nextAvail = [...prevAvail];
              const availAIdx = nextAvail.findIndex((a) => a.employee_id === data.employeeId && a.date === dStr);
              if (availAIdx >= 0) {
                nextAvail[availAIdx] = { ...nextAvail[availAIdx], is_admin_assigned: false };
              }
              const availBIdx = nextAvail.findIndex((a) => a.employee_id === data.swapEmployeeId && a.date === dStr);
              if (availBIdx >= 0) {
                nextAvail[availBIdx] = { ...nextAvail[availBIdx], is_admin_assigned: false };
              }
              return nextAvail;
            });
          } else if (idxA !== -1 && idxB === -1) {
            // A có ca, B ĐANG OFF -> Xóa ca cũ của A trong DB và tạo ca mới cho B
            const shiftA = { ...updated[idxA] };

            // Đánh dấu xóa ID ca cũ của A trong Google Sheets.
            if (shiftA.id && !String(shiftA.id).startsWith('draft_')) {
              setDeletedShiftIds((prev) => [...prev, shiftA.id]);
            }

            // Xóa mọi ca của A trong ngày này
            updated = updated.filter((s) => !(s.employee_id === data.employeeId && s.date === dStr));

            // Tạo ca mới cho B
            const newShiftForB = {
              id: `draft_${Date.now()}_${data.swapEmployeeId}`,
              employee_id: data.swapEmployeeId,
              branch_id: data.branchId || shiftA.branch_id,
              branches: targetBranch,
              date: dStr,
              start_time: data.startTime || shiftA.start_time,
              end_time: data.endTime || shiftA.end_time,
              hours: data.hours || shiftA.hours,
              note: isWeekLocked ? `[Đổi ca từ ${empAName}]` : '',
              isDraft: true,
              isDirty: true,
            };
            updated.push(newShiftForB);

            // Bật cờ 🛑 OFF cho A (người nhường ca) kèm ghi chú đổi ca (nếu đã chốt lịch), đồng thời lưu giữ orig_note & orig_type
            setLocalAvailability((prevAvail) => {
              const nextAvail = [...prevAvail];
              const availBIdx = nextAvail.findIndex((a) => a.employee_id === data.swapEmployeeId && a.date === dStr);
              if (availBIdx >= 0) {
                nextAvail[availBIdx] = { ...nextAvail[availBIdx], is_admin_assigned: false };
              }

              const availAIdx = nextAvail.findIndex((a) => a.employee_id === data.employeeId && a.date === dStr);
              if (availAIdx >= 0) {
                const cur = nextAvail[availAIdx];
                nextAvail[availAIdx] = {
                  ...cur,
                  orig_note: cur.orig_note !== undefined ? cur.orig_note : (cur.note || ''),
                  orig_type: cur.orig_type !== undefined ? cur.orig_type : (cur.type || 'full'),
                  type: cur.orig_type || cur.type || 'full',
                  note: cur.orig_note !== undefined ? cur.orig_note : (cur.note || ''),
                  admin_note: isWeekLocked ? `Đổi ca với ${empBName}` : '',
                  is_admin_assigned: true,
                };
              } else {
                nextAvail.push({
                  id: `draft_avail_${Date.now()}_${data.employeeId}`,
                  employee_id: data.employeeId,
                  date: dStr,
                  type: 'full',
                  orig_note: '',
                  orig_type: 'full',
                  note: '',
                  admin_note: isWeekLocked ? `Đổi ca với ${empBName}` : '',
                  is_admin_assigned: true,
                });
              }
              return nextAvail;
            });
          } else if (idxA === -1 && idxB !== -1) {
            // A ĐANG OFF, B có ca -> Xóa ca cũ của B trong DB và tạo ca mới cho A
            const shiftB = { ...updated[idxB] };

            // Đánh dấu xóa ID ca cũ của B trong Google Sheets.
            if (shiftB.id && !String(shiftB.id).startsWith('draft_')) {
              setDeletedShiftIds((prev) => [...prev, shiftB.id]);
            }

            // Xóa mọi ca của B trong ngày này
            updated = updated.filter((s) => !(s.employee_id === data.swapEmployeeId && s.date === dStr));

            // Tạo ca mới cho A
            const newShiftForA = {
              id: `draft_${Date.now()}_${data.employeeId}`,
              employee_id: data.employeeId,
              branch_id: data.branchId || shiftB.branch_id,
              branches: targetBranch,
              date: dStr,
              start_time: data.startTime || shiftB.start_time,
              end_time: data.endTime || shiftB.end_time,
              hours: data.hours || shiftB.hours,
              note: isWeekLocked ? `[Đổi ca từ ${empBName}]` : '',
              isDraft: true,
              isDirty: true,
            };
            updated.push(newShiftForA);

            // Bật cờ 🛑 OFF cho B (người nhường ca) kèm ghi chú đổi ca (nếu đã chốt lịch), đồng thời lưu giữ orig_note & orig_type
            setLocalAvailability((prevAvail) => {
              const nextAvail = [...prevAvail];
              const availAIdx = nextAvail.findIndex((a) => a.employee_id === data.employeeId && a.date === dStr);
              if (availAIdx >= 0) {
                nextAvail[availAIdx] = { ...nextAvail[availAIdx], is_admin_assigned: false };
              }

              const availBIdx = nextAvail.findIndex((a) => a.employee_id === data.swapEmployeeId && a.date === dStr);
              if (availBIdx >= 0) {
                const cur = nextAvail[availBIdx];
                nextAvail[availBIdx] = {
                  ...cur,
                  orig_note: cur.orig_note !== undefined ? cur.orig_note : (cur.note || ''),
                  orig_type: cur.orig_type !== undefined ? cur.orig_type : (cur.type || 'full'),
                  type: cur.orig_type || cur.type || 'full',
                  note: cur.orig_note !== undefined ? cur.orig_note : (cur.note || ''),
                  admin_note: isWeekLocked ? `Đổi ca với ${empAName}` : '',
                  is_admin_assigned: true,
                };
              } else {
                nextAvail.push({
                  id: `draft_avail_${Date.now()}_${data.swapEmployeeId}`,
                  employee_id: data.swapEmployeeId,
                  date: dStr,
                  type: 'full',
                  orig_note: '',
                  orig_type: 'full',
                  note: '',
                  admin_note: isWeekLocked ? `Đổi ca với ${empAName}` : '',
                  is_admin_assigned: true,
                });
              }
              return nextAvail;
            });
          } else {
            // Cả A và B đều chưa có ca trước đó -> Tạo ca mới cho B, gán OFF cho A
            const newShiftForB = {
              id: `draft_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
              employee_id: data.swapEmployeeId,
              branch_id: data.branchId,
              branches: targetBranch,
              date: dStr,
              start_time: data.startTime,
              end_time: data.endTime,
              hours: data.hours,
              note: isWeekLocked ? `[Đổi ca từ ${empAName}]` : '',
              isDraft: true,
              isDirty: true,
            };
            updated.push(newShiftForB);

            setLocalAvailability((prevAvail) => {
              const nextAvail = [...prevAvail];
              const availAIdx = nextAvail.findIndex((a) => a.employee_id === data.employeeId && a.date === dStr);
              if (availAIdx >= 0) {
                const cur = nextAvail[availAIdx];
                nextAvail[availAIdx] = {
                  ...cur,
                  orig_note: cur.orig_note !== undefined ? cur.orig_note : (cur.note || ''),
                  orig_type: cur.orig_type !== undefined ? cur.orig_type : (cur.type || 'full'),
                  type: cur.orig_type || cur.type || 'full',
                  note: cur.orig_note !== undefined ? cur.orig_note : (cur.note || ''),
                  admin_note: `Đổi ca với ${empBName}`,
                  is_admin_assigned: true,
                };
              } else {
                nextAvail.push({
                  id: `draft_avail_${Date.now()}_${data.employeeId}`,
                  employee_id: data.employeeId,
                  date: dStr,
                  type: 'full',
                  orig_note: '',
                  orig_type: 'full',
                  note: '',
                  admin_note: `Đổi ca với ${empBName}`,
                  is_admin_assigned: true,
                });
              }
              return nextAvail;
            });
          }
          return; // Hoàn thành hoán đổi, không tạo ca thường cho A
        }

        // =========================================================================
        // TRƯỜNG HỢP 2: TẠO MỚI / CHỈNH SỬA CA LÀM THÔNG THƯỜNG
        // =========================================================================
        const existingIdx = updated.findIndex((s) => s.id && s.id === data.editId);
        if (existingIdx !== -1) {
          updated[existingIdx] = {
            ...updated[existingIdx],
            branch_id: data.branchId,
            branches: targetBranch,
            start_time: data.startTime,
            end_time: data.endTime,
            hours: data.hours,
            note: data.note || '',
            date: dStr,
            isDirty: true,
          };
        } else {
          // Tạo mới item ca làm draft
          const newDraft = {
            id: `draft_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            employee_id: data.employeeId,
            branch_id: data.branchId,
            branches: targetBranch,
            date: dStr,
            start_time: data.startTime,
            end_time: data.endTime,
            hours: data.hours,
            note: data.note || '',
            isDraft: true,
            isDirty: true,
          };
          updated.push(newDraft);
        }

        // Tự động gỡ cờ OFF nếu nhân viên này đang bị gán OFF mà vừa được phân ca / nhận làm thay
        setLocalAvailability((prevAvail) => {
          const nextAvail = [...prevAvail];
          const myAvailIdx = nextAvail.findIndex((a) => a.employee_id === data.employeeId && a.date === dStr);
          if (myAvailIdx >= 0 && nextAvail[myAvailIdx].is_admin_assigned) {
            nextAvail[myAvailIdx] = {
              ...nextAvail[myAvailIdx],
              admin_note: '',
              is_admin_assigned: false,
            };
          }
          return nextAvail;
        });

        // Tự động đồng bộ ca đối ứng 2 chiều cho nhân viên làm thay/bị thay
        if (data.peerAdjustment && data.peerAdjustment.peerEmployeeId) {
          const peerId = data.peerAdjustment.peerEmployeeId;
          const peerIdx = updated.findIndex(
            (s) => s.employee_id === peerId && s.date === dStr
          );
          const currentEmp = employees.find((e) => e.id === data.employeeId);
          const currentEmpName = currentEmp?.name || 'Bạn';

          if (data.peerAdjustment.type === 'full_off') {
            // TRƯỜNG HỢP 2: BẠN ĐƯỢC LÀM THAY NGHỈ HOÀN TOÀN NGÀY ĐÓ -> XÓA CA VÀ GÁN TRẠNG THÁI OFF
            const peerShift = peerIdx !== -1 ? { ...updated[peerIdx] } : null;

            if (peerShift && peerShift.id && !String(peerShift.id).startsWith('draft_')) {
              setDeletedShiftIds((prev) => [...prev, peerShift.id]);
            }

            // Xóa ca của peer trong ngày này
            updated = updated.filter((s) => !(s.employee_id === peerId && s.date === dStr));

            let baseStart = peerShift?.start_time ? peerShift.start_time.slice(0, 5) : '14:00';
            let baseEnd = peerShift?.end_time ? peerShift.end_time.slice(0, 5) : '22:00';
            if (peerShift?.note) {
              const match = peerShift.note.match(/\[(?:Ca gốc|Gốc):\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/i);
              if (match) {
                baseStart = match[1];
                baseEnd = match[2];
              }
            }
            const cleanReason = (data.peerAdjustment.peerOffReason || 'Bận việc riêng')
              .replace(/\[(?:Ca gốc|Gốc):\s*[^\]]+\]/g, '')
              .trim() || 'Bận việc riêng';
            const offNote = isWeekLocked
              ? `[Gốc: ${baseStart}-${baseEnd} | ${currentEmpName} làm thay trọn ca] ${cleanReason}`
              : cleanReason;

            // Bật cờ 🛑 OFF cho peer trong localAvailability
            setLocalAvailability((prevAvail) => {
              const nextAvail = [...prevAvail];
              const availIdx = nextAvail.findIndex((a) => a.employee_id === peerId && a.date === dStr);
              if (availIdx >= 0) {
                const cur = nextAvail[availIdx];
                const realOrigNote = (cur.orig_note && !cur.orig_note.includes('[Gốc:') && !cur.orig_note.includes('làm thay') && !cur.orig_note.includes('Đổi ca'))
                  ? cur.orig_note
                  : (!cur.is_admin_assigned && cur.note && !cur.note.includes('[Gốc:') && !cur.note.includes('làm thay') && !cur.note.includes('Đổi ca'))
                  ? cur.note
                  : '';
                nextAvail[availIdx] = {
                  ...cur,
                  orig_note: realOrigNote,
                  orig_type: cur.orig_type !== undefined ? cur.orig_type : (cur.type || 'full'),
                  type: cur.orig_type || cur.type || 'full',
                  note: realOrigNote,
                  admin_note: offNote,
                  is_admin_assigned: true,
                };
              } else {
                nextAvail.push({
                  id: `draft_avail_${Date.now()}_${peerId}`,
                  employee_id: peerId,
                  date: dStr,
                  type: 'full',
                  orig_note: '',
                  orig_type: 'full',
                  note: '',
                  admin_note: offNote,
                  is_admin_assigned: true,
                });
              }
              return nextAvail;
            });
          } else if (peerIdx !== -1) {
            // TRƯỜNG HỢP 1: BẠN ĐƯỢC LÀM THAY VẪN ĐI LÀM 1 PHẦN (VỀ SỚM HOẶC VÀO TRỄ)
            const peerShift = updated[peerIdx];
            const curPeerStart = peerShift.start_time ? peerShift.start_time.slice(0, 5) : '09:00';
            const curPeerEnd = peerShift.end_time ? peerShift.end_time.slice(0, 5) : '18:00';

            // Trích xuất ca gốc ban đầu của peer
            let baseStart = curPeerStart;
            let baseEnd = curPeerEnd;
            if (peerShift.note) {
              const match = peerShift.note.match(/\[(?:Ca gốc|Gốc):\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/i);
              if (match) {
                baseStart = match[1];
                baseEnd = match[2];
              }
            }

            const [bsh, bsm] = baseStart.split(':').map(Number);
            const [beh, bem] = baseEnd.split(':').map(Number);
            let baseHours = (beh * 60 + bem - (bsh * 60 + bsm)) / 60;
            if (baseHours < 0) baseHours += 24;

            let newPeerStart = baseStart;
            let newPeerEnd = baseEnd;
            let newPeerHours = baseHours;
            let peerNote = '';

            const { type, hoursDiff, remainingStartTime, remainingEndTime } = data.peerAdjustment;
            const diffH = Math.abs(hoursDiff || 0);

            if (type === 'reduce') {
              // Rút ngắn ca của peer:
              // TH1: Làm thay phần đầu (vào trễ) - ví dụ ca 13:00-22:00 được làm thay 13:00-17:00 -> ca mới 17:00 - 22:00
              if (remainingStartTime && remainingStartTime <= baseStart && remainingEndTime < baseEnd) {
                newPeerStart = remainingEndTime;
                newPeerEnd = baseEnd;
                newPeerHours = calculateHours(newPeerStart, newPeerEnd);
                peerNote = `[Gốc: ${baseStart}-${baseEnd} | ${currentEmpName} làm thay đến ${newPeerStart}]`;
              }
              // TH2: Làm thay phần đuôi (về sớm) - ví dụ ca 13:00-22:00 được làm thay từ 17:00 -> ca mới 13:00 - 17:00
              else if (remainingStartTime && remainingStartTime > baseStart && remainingEndTime >= baseEnd) {
                newPeerStart = baseStart;
                newPeerEnd = remainingStartTime;
                newPeerHours = calculateHours(newPeerStart, newPeerEnd);
                peerNote = `[Gốc: ${baseStart}-${baseEnd} | ${currentEmpName} làm thay từ ${newPeerEnd}]`;
              }
              // TH3: Làm thay phần giữa hoặc có mốc cụ thể
              else if (remainingStartTime && remainingStartTime > baseStart && remainingEndTime < baseEnd) {
                newPeerStart = baseStart;
                newPeerEnd = remainingStartTime;
                newPeerHours = calculateHours(newPeerStart, newPeerEnd);
                peerNote = `[Gốc: ${baseStart}-${baseEnd} | ${currentEmpName} làm thay ${remainingStartTime}-${remainingEndTime}]`;
              }
              else if (remainingEndTime && remainingEndTime > baseStart && remainingEndTime < baseEnd) {
                newPeerStart = remainingEndTime;
                newPeerEnd = baseEnd;
                newPeerHours = calculateHours(newPeerStart, newPeerEnd);
                peerNote = `[Gốc: ${baseStart}-${baseEnd} | ${currentEmpName} làm thay đến ${newPeerStart}]`;
              }
              // TH4: Mặc định lùi giờ kết thúc theo diffH
              else {
                newPeerHours = Math.max(0, baseHours - diffH);
                const targetMinutes = (bsh * 60 + bsm + Math.round(newPeerHours * 60)) % (24 * 60);
                const ehStr = String(Math.floor(targetMinutes / 60)).padStart(2, '0');
                const emStr = String(targetMinutes % 60).padStart(2, '0');
                newPeerEnd = `${ehStr}:${emStr}`;
                peerNote = `[Gốc: ${baseStart}-${baseEnd} | ${currentEmpName} làm thay ${diffH}h]`;
              }
            } else if (type === 'increase') {
              // Tăng ca cho peer (ví dụ Duy 17:00 + 4h = 21:00)
              newPeerHours = baseHours + diffH;
              const targetMinutes = (bsh * 60 + bsm + Math.round(newPeerHours * 60)) % (24 * 60);
              const ehStr = String(Math.floor(targetMinutes / 60)).padStart(2, '0');
              const emStr = String(targetMinutes % 60).padStart(2, '0');
              newPeerEnd = `${ehStr}:${emStr}`;
              peerNote = `[Gốc: ${baseStart}-${baseEnd}] +${diffH}h làm thay ${currentEmpName} (từ ${data.endTime || '19:00'})`;
            }

            updated[peerIdx] = {
              ...peerShift,
              start_time: newPeerStart,
              end_time: newPeerEnd,
              hours: Math.round(newPeerHours * 100) / 100,
              note: peerNote,
              isDirty: true,
            };
          } else {
            // Peer ĐANG OFF / Chưa có ca -> Tự động tạo ca mới cho peer nhận làm hộ phần ca còn lại!
            const currentEmp = employees.find((e) => e.id === data.employeeId);
            const currentEmpName = currentEmp?.name || 'Bạn';
            const { remainingStartTime, remainingEndTime, remainingHours, hoursDiff } = data.peerAdjustment;
            const newPeerStart = remainingStartTime || data.endTime || '16:00';
            const newPeerEnd = remainingEndTime || '22:00';
            const newPeerH = remainingHours || Math.abs(hoursDiff || 0);

            const newPeerShift = {
              id: `draft_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
              employee_id: data.peerAdjustment.peerEmployeeId,
              branch_id: data.branchId,
              branches: targetBranch,
              date: dStr,
              start_time: newPeerStart,
              end_time: newPeerEnd,
              hours: newPeerH,
              note: `+${newPeerH}h làm thay ${currentEmpName} (từ ${newPeerStart})`,
              isDraft: true,
              isDirty: true,
            };
            updated.push(newPeerShift);
          }
        }
      });
      return updated;
    });

    setHasUnsavedChanges(true);
    if (data.swapEmployeeId && toast) {
      const empA = employees.find((e) => e.id === data.employeeId);
      const empB = employees.find((e) => e.id === data.swapEmployeeId);
      toast.success('Đã hoán đổi ca!', `Đã hoán đổi ca làm hoàn toàn giữa ${empA?.name || 'NV'} và ${empB?.name || 'NV'}!`);
    } else if (data.peerAdjustment && toast) {
      toast.info('Đã đồng bộ ca 2 chiều', 'Đã cập nhật giờ ca làm cho cả 2 nhân viên!');
    }
  }

  // 2. Xóa ca làm (chỉ cập nhật State Local)
  function handleDeleteScheduleItem(itemId) {
    if (itemId && !String(itemId).startsWith('draft_')) {
      setDeletedShiftIds((prev) => [...prev, itemId]);
    }
    setLocalSchedule((prev) => prev.filter((s) => s.id !== itemId));
    setHasUnsavedChanges(true);
  }

  // 2.5. Gán ca OFF đè lên kèm ghi chú
  function handleAssignOff(employeeId, targetDateStr, customNote = '') {
    if (!employeeId || !targetDateStr) return;

    // Xóa ca phân công cũ trong daySchedule nếu có
    const existingShifts = localSchedule.filter((s) => s.employee_id === employeeId && s.date === targetDateStr);
    existingShifts.forEach((s) => {
      if (s.id && !String(s.id).startsWith('draft_')) {
        setDeletedShiftIds((prev) => [...prev, s.id]);
      }
    });
    setLocalSchedule((prev) => prev.filter((s) => !(s.employee_id === employeeId && s.date === targetDateStr)));

    // Bật flag is_admin_assigned = true, TUYỆT ĐỐI KHÔNG ĐÈ HỎNG type và note đăng ký ban đầu của nhân viên
    setLocalAvailability((prev) => {
      const idx = prev.findIndex((a) => a.employee_id === employeeId && a.date === targetDateStr);
      const origInDb = availability.find((a) => a.employee_id === employeeId && a.date === targetDateStr);
      if (idx >= 0) {
        const cur = prev[idx];
        const updated = [...prev];
        const origType = cur.orig_type !== undefined ? cur.orig_type : (origInDb?.orig_type || origInDb?.type || cur.type || 'full');
        const origNote = cur.orig_note !== undefined ? cur.orig_note : (origInDb?.orig_note !== undefined ? origInDb.orig_note : (origInDb?.note !== undefined ? origInDb.note : (cur.note || '')));
        updated[idx] = {
          ...cur,
          orig_note: origNote,
          orig_type: origType,
          // Giữ nguyên 100% đăng ký gốc của nhân viên
          type: origType,
          note: origNote,
          admin_note: customNote || (isWeekLocked ? 'Nghỉ' : ''),
          is_admin_assigned: true,
        };
        return updated;
      }
      return [
        ...prev,
        {
          id: `draft_avail_${Date.now()}_${employeeId}`,
          employee_id: employeeId,
          date: targetDateStr,
          type: 'full',
          orig_note: '',
          orig_type: 'full',
          note: '',
          admin_note: customNote || (isWeekLocked ? 'Nghỉ' : ''),
          is_admin_assigned: true,
        },
      ];
    });

    setHasUnsavedChanges(true);
    if (toast) {
      const emp = employees.find((e) => e.id === employeeId);
      toast.info('Đã gán OFF', `Đã chuyển ca của ${emp?.nickname || emp?.name || 'nhân viên'} sang OFF${customNote ? ` (${customNote})` : ''}`);
    }
  }

  // 2.6. Xóa ca OFF — quay về trạng thái ban đầu (thấy lại ghi chú đăng ký của NV)
  function handleRemoveOff(employeeId, targetDateStr) {
    if (!employeeId || !targetDateStr) return;

    setLocalAvailability((prev) => {
      const idx = prev.findIndex((a) => a.employee_id === employeeId && a.date === targetDateStr);
      if (idx >= 0) {
        const cur = prev[idx];
        const origInDb = availability.find((a) => a.employee_id === employeeId && a.date === targetDateStr);

        // Nếu bản ghi này là draft tạo bởi admin khi nhân viên chưa từng đăng ký ngày này
        if (!origInDb && String(cur.id).startsWith('draft_avail_')) {
          return prev.filter((_, i) => i !== idx);
        }

        const updated = [...prev];
        // Giữ nguyên 100% type và note đăng ký ban đầu của nhân viên (kể cả type === 'off' xin nghỉ)
        const resolvedType = cur.orig_type !== undefined
          ? cur.orig_type
          : (origInDb?.orig_type || origInDb?.type || cur.type || 'full');
        const resolvedNote = cur.orig_note !== undefined
          ? cur.orig_note
          : (origInDb?.orig_note !== undefined ? origInDb.orig_note : (origInDb?.note !== undefined ? origInDb.note : (cur.note || '')));

        updated[idx] = {
          ...cur,
          orig_type: resolvedType,
          orig_note: resolvedNote,
          note: resolvedNote,
          type: resolvedType,
          admin_note: '',
          is_admin_assigned: false,
        };
        return updated;
      }
      return prev;
    });

    setHasUnsavedChanges(true);
    if (toast) {
      const emp = employees.find((e) => e.id === employeeId);
      toast.success('Đã khôi phục', `Đã trả ca của ${emp?.nickname || emp?.name || 'nhân viên'} về trạng thái ban đầu`);
    }
  }

  // 3. Sao chép ca từ hôm trước (chỉ cập nhật State Local)
  function handleCopyShiftFromPrevDay(employeeId, sourceShift, targetDateStr) {
    const targetBranch = branches.find((b) => b.id === sourceShift.branch_id) || sourceShift.branches || branches[0];
    const newDraft = {
      id: `draft_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      employee_id: employeeId,
      branch_id: sourceShift.branch_id,
      branches: targetBranch,
      date: targetDateStr,
      start_time: sourceShift.start_time ? sourceShift.start_time.slice(0, 5) : '09:00',
      end_time: sourceShift.end_time ? sourceShift.end_time.slice(0, 5) : '14:00',
      hours: sourceShift.hours || 5,
      note: sourceShift.note || '',
      isDraft: true,
      isDirty: true,
    };

    setLocalSchedule((prev) => [...prev, newDraft]);
    setHasUnsavedChanges(true);
  }

  // 4. LƯU THÔNG MINH: CHỈ LƯU NHỮNG CA BỊ THAY ĐỔI/THÊM MỚI/XÓA (TỐC ĐỘ SIÊU TỐC THẦN TỐC ⚡)
  async function handleSaveAllBatch() {
    setIsBatchSaving(true);
    try {
      // 1. Xóa các ca đã bấm xóa (chạy song song)
      if (deletedShiftIds.length > 0) {
        await Promise.all(deletedShiftIds.map((delId) => deleteSchedule(delId)));
      }

      // 2. CHỈ LƯU / CẬP NHẬT CÁC CA BỊ THAY ĐỔI HOẶC THÊM MỚI (isDirty || isDraft) - Chạy song song
      const dirtyShifts = localSchedule.filter((item) => item.isDirty || item.isDraft);

      if (dirtyShifts.length > 0) {
        await Promise.all(
          dirtyShifts.map((item) =>
            upsertSchedule({
              employeeId: item.employee_id,
              branchId: item.branch_id,
              date: item.date,
              startTime: item.start_time ? item.start_time.slice(0, 5) : '09:00',
              endTime: item.end_time ? item.end_time.slice(0, 5) : '14:00',
              hours: item.hours || 5,
              note: item.note || '',
            })
          )
        );
      }

      const origAvailMap = {};
      availability.forEach((a) => { origAvailMap[`${a.employee_id}_${a.date}`] = a; });
      const changedAvails = localAvailability.filter((a) => {
        const orig = origAvailMap[`${a.employee_id}_${a.date}`];
        // Bản ghi mới (draft) hoặc is_admin_assigned / note / type thay đổi so với DB gốc
        return (
          String(a.id).startsWith('draft_avail_') ||
          !orig ||
          !!orig.is_admin_assigned !== !!a.is_admin_assigned ||
          (orig.note || '') !== (a.note || '') ||
          orig.type !== a.type
        );
      });
      if (changedAvails.length > 0) {
        await Promise.all(
          changedAvails.map((a) =>
            upsertAvailability(
              a.employee_id,
              a.date,
              a.orig_type || a.type || 'full',
              a.orig_note !== undefined ? a.orig_note : (a.note || ''),
              !!a.is_admin_assigned
            )
          )
        );
      }

      if (toast) toast.success('Đã lưu thành công', 'Đã cập nhật lịch phân công & Ca OFF');
      await loadWeekData(true);
    } catch (err) {
      console.error('Lỗi khi lưu batch lịch:', err);
      if (toast) toast.error('Lỗi', 'Không thể lưu bảng lịch phân công!');
    }
    setIsBatchSaving(false);
  }

  // Hủy thay đổi chưa lưu
  function handleCancelUnsavedChanges() {
    if (confirm('Bạn có chắc chắn muốn HỦY BỎ toàn bộ thay đổi chưa lưu trên bảng xếp lịch tuần này không?')) {
      setLocalSchedule(schedule);
      setLocalAvailability(availability);
      setDeletedShiftIds([]);
      setHasUnsavedChanges(false);
      if (toast) toast.info('Đã hủy', 'Đã khôi phục lại bảng xếp lịch ban đầu.');
    }
  }

  const [isExportingImage, setIsExportingImage] = useState(false);
  const [showPDFPreview, setShowPDFPreview] = useState(false);

  // Tải trực tiếp FILE ẢNH PNG (Độ phân giải 2K sắc nét 100%, RẮC GỌN VỪA KHÍT TỈ LỆ, CHỮ RÕ NẾT ĐẸP MẮT)
  async function handleDownloadImage() {
    if (typeof window === 'undefined') return;
    setIsExportingImage(true);
    if (toast) toast.info('⏳ Đang xuất bức ảnh PNG...', 'Vui lòng đợi vài giây để tải file ảnh bảng lịch!');

    try {
      const tableHeaderDays = weekDays.map((dStr, idx) => `
        <th style="padding: 7px 4px; border: 1.5px solid #a855f7; background-color: #581c87; color: #ffffff; text-align: center; font-size: 12.5px; font-weight: 900; width: 11.8%;">
          <div style="color: #ffffff; font-weight: 900; font-size: 13px; text-transform: uppercase;">${DAY_LABELS[idx]}</div>
          <div style="font-size: 10px; opacity: 0.95; color: #f3e8ff; font-weight: 700; margin-top: 1px;">${dStr.split('-').reverse().slice(0, 2).join('/')}</div>
        </th>
      `).join('');

      const tableRows = customMatrixOrder.map((emp, idx) => {
        const rowBg = idx % 2 === 0 ? '#ffffff' : '#faf5ff';
        const cells = weekDays.map((dStr) => {
          const empShifts = scheduleByEmpAndDate[`${emp.id}_${dStr}`] || [];
          const empAvail = availByEmpAndDate[`${emp.id}_${dStr}`];

          let cellContent = '<span style="color: #cbd5e1; font-size: 13px; font-weight: bold; text-align: center;">—</span>';

          if (empShifts.length > 0) {
            cellContent = empShifts.map((shift) => {
              const style = getBranchColorStyle(shift.branches?.name, shift.branches?.color);
              const startTimeStr = shift.start_time ? shift.start_time.slice(0, 5) : '09:00';
              const endTimeStr = shift.end_time ? shift.end_time.slice(0, 5) : '14:00';
              const branchDisplayName = formatBranchDisplayName(shift.branches?.name);
              
              const bgHex = style.badgeStyle?.backgroundColor || '#f3e8ff';
              const colorHex = style.badgeStyle?.color || '#581c87';

              return `
                <div style="background-color: ${bgHex}; color: ${colorHex}; border-radius: 7px; padding: 5px 2px; text-align: center; border: 1.5px solid rgba(0,0,0,0.12); box-shadow: 0 1px 2px rgba(0,0,0,0.04); font-family: system-ui, -apple-system, sans-serif; box-sizing: border-box; width: 100%; min-height: 48px; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 3px;">
                  <span style="font-size: 14px; font-weight: 900; color: ${colorHex}; display: block; line-height: 1.1; letter-spacing: -0.3px;">${startTimeStr}-${endTimeStr}</span>
                  <span style="font-size: 12px; font-weight: 900; color: ${colorHex}; display: block; line-height: 1.1; text-transform: uppercase; opacity: 0.95;">${branchDisplayName}</span>
                </div>
              `;
            }).join('');
          } else if (empAvail?.is_admin_assigned || empAvail?.type === 'off') {
            cellContent = `
              <div style="background-color: #fff1f2; color: #e11d48; border-radius: 7px; padding: 5px 2px; font-size: 13.5px; font-weight: 900; text-align: center; border: 1.5px solid #fecdd3; font-family: system-ui, -apple-system, sans-serif; box-sizing: border-box; width: 100%; min-height: 48px; display: flex; justify-content: center; align-items: center; line-height: 1;">
                🛑 OFF
              </div>
            `;
          }

          return `<td style="padding: 3px 3px; border: 1px solid #e9d5ff; text-align: center; vertical-align: middle; height: 52px;">${cellContent}</td>`;
        }).join('');

        return `
          <tr style="background-color: ${rowBg};">
            <td style="padding: 8px 12px; border: 1.5px solid #e9d5ff; font-size: 21px; font-weight: 900; color: #0f172a; text-align: left; white-space: nowrap; vertical-align: middle; font-family: system-ui, -apple-system, Arial, sans-serif;">
              <span style="color: #6b21a8; font-size: 17px; margin-right: 6px; font-weight: 900;">${idx + 1}.</span>
              <span style="font-weight: 900; color: #0f172a; font-size: 21px; letter-spacing: -0.3px;">${emp.name}</span>
            </td>
            ${cells}
          </tr>
        `;
      }).join('');

      const tempElement = document.createElement('div');
      tempElement.style.backgroundColor = '#ffffff';
      tempElement.style.padding = '20px 24px';
      tempElement.style.fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      tempElement.style.color = '#1e1b4b';
      tempElement.style.width = '1420px';
      tempElement.style.margin = '0 auto';
      tempElement.style.boxSizing = 'border-box';

      tempElement.innerHTML = `
        <div style="text-align: center; margin-bottom: 14px; border-bottom: 3.5px solid #581c87; padding-bottom: 10px;">
          <h2 style="font-size: 24px; font-weight: 900; color: #1e1b4b; margin: 0; text-transform: uppercase; letter-spacing: 0.6px;">
            BẢNG PHÂN CÔNG LỊCH LÀM TUẦN
          </h2>
          <p style="font-size: 14px; font-weight: 900; color: #6b21a8; margin: 5px 0 0 0;">
            Thời gian: Từ ngày ${startDate.split('-').reverse().join('/')} đến ngày ${endDate.split('-').reverse().join('/')}
          </p>
        </div>

        <table style="width: 100%; border-collapse: collapse; background-color: #ffffff; table-layout: fixed;">
          <thead>
            <tr style="background-color: #581c87; color: #ffffff;">
              <th style="padding: 14px 12px; border: 1.5px solid #a855f7; text-align: left; font-size: 16px; font-weight: 900; width: 290px;">
                STT / NHÂN VIÊN
              </th>
              ${tableHeaderDays}
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      `;

      document.body.appendChild(tempElement);

      const isMobile = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      const canvasScale = isMobile ? 1.5 : 2;

      let canvas;
      try {
        canvas = await html2canvas(tempElement, {
          scale: canvasScale,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
          onclone: (clonedDoc) => {
            const styles = clonedDoc.querySelectorAll('style, link[rel="stylesheet"]');
            styles.forEach((s) => s.remove());
          },
        });
      } finally {
        if (tempElement && tempElement.parentNode) {
          tempElement.parentNode.removeChild(tempElement);
        }
      }

      if (!canvas) throw new Error('Không thể tạo ảnh từ bảng lịch.');

      const imageBlob = await new Promise((resolve, reject) => {
        canvas.toBlob((blob) => (
          blob ? resolve(blob) : reject(new Error('Không thể mã hóa ảnh PNG.'))
        ), 'image/png');
      });
      const imageUrl = URL.createObjectURL(imageBlob);
      const link = document.createElement('a');
      link.download = `Bảng_Xếp_Lịch_Chè_Ms_Hoa_${startDate}_đến_${endDate}.png`;
      link.href = imageUrl;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(imageUrl), 1000);
      if (toast) toast.success('Đã tải thành công', 'Đã tải file ảnh bảng lịch (PNG)');
    } catch (err) {
      console.error('Lỗi tải ảnh:', err);
      if (toast) {
        toast.error(
          'Lỗi tải ảnh',
          err instanceof Error ? err.message : 'Không thể xuất file ảnh PNG. Vui lòng thử lại!'
        );
      }
    } finally {
      setIsExportingImage(false);
    }
  }

  function openCellModal(emp, dateStr, existingShift = null) {
    if (readOnly) return;
    const defaultBranch = branches[0] || { id: '', name: 'Chi nhánh' };
    setModalState({
      isOpen: true,
      date: dateStr,
      branch: existingShift?.branches || defaultBranch,
      employee: emp,
      editItem: existingShift,
    });
  }

  const weekHolidays = useMemo(() => {
    const list = [];
    weekDays.forEach((dStr) => {
      const h = getHolidayForDate(dStr, holidays);
      if (h && !list.find((item) => item.name === h.name)) {
        list.push(h);
      }
    });
    return list;
  }, [weekDays, holidays]);

  return (
    <div className="space-y-2.5">
      {/* THANH CẢNH BÁO THAY ĐỔI CHƯA LƯU & NÚT LƯU BATCH 1 LẦN */}
      {!readOnly && hasUnsavedChanges && (
        <div className="sticky top-2 z-40 p-3 sm:p-4 rounded-2xl bg-amber-500 text-purple-950 shadow-xl border-2 border-amber-300 flex items-center justify-between flex-wrap gap-3 animate-fade-in">
          <div className="flex items-center gap-2">
            <span className="text-xl">⚠️</span>
            <div>
              <div className="font-black text-sm sm:text-base text-purple-950">
                Có thay đổi chưa lưu trên Bảng Phân Công!
              </div>
              <p className="text-xs text-purple-900 font-extrabold">
                Bấm nút bên phải sau khi xếp ca xong để lưu chính thức 1 lần duy nhất.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleCancelUnsavedChanges}
              disabled={isBatchSaving}
              className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-purple-950/20 hover:bg-purple-950/30 text-purple-950 text-xs font-black border border-purple-950/30 cursor-pointer"
            >
              ↺ Hủy Bỏ
            </button>
            <button
              type="button"
              onClick={handleSaveAllBatch}
              disabled={isBatchSaving}
              className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-purple-900 hover:bg-purple-950 text-white font-black text-xs sm:text-sm border border-purple-800 cursor-pointer shadow-md active:scale-95 transition-all"
            >
              {isBatchSaving ? '⏳ Đang lưu toàn bộ...' : '💾 LƯU LỊCH PHÂN CÔNG (1 Bấm)'}
            </button>
          </div>
        </div>
      )}

      {/* Thanh điều hướng Tuần, Cụm Nút Thao Tác & Chú thích Chi Nhánh — Thiết Kế Đẳng Cấp, Tinh Tế */}
      <div className="bg-white rounded-2xl sm:rounded-3xl p-2 sm:px-5 sm:py-3.5 border border-purple-200/90 shadow-2xs space-y-1.5 sm:space-y-2.5">
        {/* HÀNG 1: ĐIỀU HƯỚNG TUẦN (TRÁI) & CÁC NÚT HÀNH ĐỘNG (PHẢI) */}
        <div className="flex items-center justify-between flex-wrap gap-x-1.5 gap-y-1 sm:gap-2.5">
          {/* Cụm chuyển tuần */}
          <div className="order-1 flex items-center gap-1 sm:order-none sm:gap-1.5">
            <button
              type="button"
              onClick={prevWeek}
              className="w-7 h-7 sm:w-9 sm:h-9 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-950 font-black border border-purple-200 flex items-center justify-center cursor-pointer transition-all active:scale-95 text-xs shadow-2xs"
              title="Tuần trước"
            >
              ◀
            </button>

            <button
              type="button"
              onClick={() => setShowWeekPickerModal(true)}
              className="px-2 sm:px-3.5 py-1 rounded-xl bg-purple-100/80 hover:bg-purple-200 text-purple-950 font-black border border-purple-200/90 flex items-center gap-1 sm:gap-1.5 cursor-pointer shadow-2xs transition-all active:scale-95 text-[10px] sm:text-sm min-w-[120px] sm:min-w-[145px] justify-center"
              title="Bấm để mở bảng chọn nhanh bất kỳ Tuần & Năm nào"
            >
              <span>📅</span>
              <span className="text-purple-950 font-black">
                {startDate.split('-').reverse().slice(0, 2).join('/')} — {endDate.split('-').reverse().slice(0, 2).join('/')}
              </span>
              <span className="text-[10px] text-purple-700 font-bold">▾</span>
            </button>

            <button
              type="button"
              onClick={nextWeek}
              className="w-7 h-7 sm:w-9 sm:h-9 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-950 font-black border border-purple-200 flex items-center justify-center cursor-pointer transition-all active:scale-95 text-xs shadow-2xs"
              title="Tuần sau"
            >
              ▶
            </button>

            <button
              type="button"
              onClick={goTodayWeek}
              className="px-2 py-1 sm:px-3 sm:py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-950 text-[10px] sm:text-xs font-black border border-purple-200 cursor-pointer shadow-2xs transition-all active:scale-95"
            >
              Tuần này
            </button>
          </div>

          {/* Nhóm Nút Thao Tác Bên Phải: Gọn Gàng & Thanh Lịch */}
          {!readOnly && (
            <div className="order-3 flex w-full items-center gap-1 flex-wrap sm:order-none sm:w-auto sm:ml-auto">
              {/* Nút Chốt Lịch Tuần: 1 Nút ON/OFF Duy Nhất như Dịp Đặc Biệt */}
              <button
                type="button"
                onClick={handleToggleWeekLock}
                className={`px-1.5 sm:px-3 py-1 sm:py-1.5 rounded-xl text-[10px] sm:text-xs font-black border cursor-pointer shadow-2xs transition-all active:scale-95 flex items-center gap-1 ${
                  isWeekLocked
                    ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border-emerald-300'
                    : 'bg-white hover:bg-purple-50 text-purple-950 border-purple-200'
                }`}
                title={isWeekLocked ? 'Lịch đang chốt - Bấm để Mở Khóa' : 'Lịch chưa chốt - Bấm để Chốt Lịch'}
              >
                <span>{isWeekLocked ? '🔒' : '🔓'}</span>
                <span className="sm:hidden">{isWeekLocked ? 'Chốt ON' : 'Chốt OFF'}</span>
                <span className="hidden sm:inline">{isWeekLocked ? 'Chốt Lịch: ON' : 'Chốt Lịch: OFF'}</span>
              </button>

              <button
                type="button"
                onClick={openRegistrationLockSettings}
                className="px-1.5 sm:px-2.5 py-1 sm:py-1.5 rounded-xl text-[10px] sm:text-xs font-black border border-purple-200 bg-white hover:bg-purple-50 text-purple-950 cursor-pointer shadow-2xs transition-all active:scale-95 flex items-center gap-1"
                title="Chọn thứ tự động khóa đăng ký tuần hoặc tắt tự khóa"
              >
                <span>⏰</span>
                <span className="sm:hidden">Hạn ĐK</span>
                <span className="hidden sm:inline">Khóa Đăng Ký</span>
              </button>

              {/* Cụm Tiện Ích (Ngày Lễ | Cấm Off | Sắp Xếp) */}
              <div className="inline-flex rounded-xl shadow-2xs border border-purple-200 bg-purple-50/50 p-0.5 divide-x divide-purple-200">
                <button
                  type="button"
                  onClick={() => setShowHolidayModal(true)}
                  className="px-1.5 sm:px-2.5 py-1 text-purple-950 hover:bg-white rounded-lg text-[10px] sm:text-xs font-black flex items-center gap-1 transition-all cursor-pointer active:scale-95"
                  title="Cấu hình các ngày lễ tết và hệ số nhân lương (x2, x3...)"
                >
                  <span>🎉</span>
                  <span className="hidden sm:inline">Ngày Lễ</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowBlockOffModal(true)}
                  className="px-1.5 sm:px-2.5 py-1 text-purple-950 hover:text-rose-900 hover:bg-white rounded-lg text-[10px] sm:text-xs font-black flex items-center gap-1 transition-all cursor-pointer active:scale-95"
                  title="Cấu hình các ngày cao điểm cấm nhân viên xin nghỉ trong tuần"
                >
                  <span>🚫</span>
                  <span className="hidden sm:inline">Cấm Off</span>
                </button>

              </div>
            </div>
          )}

          <button
            type="button"
            onClick={handleDownloadImage}
            disabled={isExportingImage}
            className="order-2 ml-auto px-1.5 sm:px-3.5 py-1 sm:py-1.5 bg-purple-900 hover:bg-purple-950 text-white rounded-xl text-[10px] sm:text-xs font-black flex items-center gap-1 sm:gap-1.5 transition-all cursor-pointer active:scale-95 disabled:opacity-50 shadow-2xs sm:order-none sm:ml-0"
            title="Tải File Bức Ảnh PNG Bảng Phân Công Lịch Tuần"
          >
            <span>🖼️</span>
            <span className="sm:hidden">{isExportingImage ? '⏳' : 'Ảnh'}</span>
            <span className="hidden sm:inline">{isExportingImage ? '⏳ Đang Tải...' : 'Tải Ảnh (PNG)'}</span>
          </button>
        </div>

        {/* HÀNG 2: THÔNG BÁO / HƯỚNG DẪN (TRÁI) & NÚT LS ĐỔI CA + CHÚ THÍCH CHI NHÁNH (PHẢI) */}
        <div className="flex items-center justify-between flex-wrap gap-1 pt-1 sm:gap-2 sm:pt-2 border-t border-purple-100">
          {/* Thông báo ngày lễ nếu tuần này có ngày lễ hoặc Hướng dẫn xếp ca */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {weekHolidays.length > 0 ? (
              weekHolidays.map((h, hIdx) => (
                <span
                  key={hIdx}
                  className="px-2.5 py-0.5 rounded-full bg-amber-100 text-purple-950 border border-amber-300 text-[11px] font-black flex items-center gap-1 shadow-2xs"
                >
                  <span>🎉</span>
                  <span>{h.name}:</span>
                  <strong className="text-amber-800">x{h.multiplier} Lương</strong>
                </span>
              ))
            ) : !readOnly ? (
              <span className="hidden sm:inline text-[11px] font-extrabold text-purple-600/80">
                ✨ Bấm vào ô của nhân viên để xếp ca nhanh
              </span>
            ) : null}
          </div>

          {/* Phía Phải: Nút LS ĐỔI CA & Chú thích màu Chi Nhánh */}
          <div className="flex items-center flex-wrap gap-1 sm:gap-2 text-xs font-black justify-end ml-auto">
            {!readOnly && (
              <button
                type="button"
                onClick={() => {
                  if (isSortMode) {
                    handleFinishSorting();
                  } else {
                    setSearchQuery('');
                    setNameSortOrder('default');
                    setIsSortMode(true);
                  }
                }}
                disabled={savingSort}
                className={`flex items-center gap-1 rounded-lg px-1.5 py-1 text-[10px] font-black transition-all cursor-pointer active:scale-95 sm:hidden ${
                  isSortMode
                    ? 'bg-emerald-600 text-white animate-pulse'
                    : 'border border-purple-200 bg-purple-50 text-purple-950'
                }`}
                title={isSortMode ? 'Bấm để lưu thứ tự mới' : 'Bấm để sắp xếp thứ tự nhân viên'}
              >
                {savingSort ? '⏳' : isSortMode ? '✓ XONG' : '↕️ Sắp Xếp'}
              </button>
            )}
            {/* Nút Xem Danh Sách Ca Đổi Trong Tuần (Đặt ở Hàng Dưới Cực Kỳ Gọn) */}
            {adjustedShiftsInWeek.length > 0 && !readOnly && (
              <button
                type="button"
                onClick={() => setShowAdjustedShiftsModal(true)}
                className="px-3 py-1 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-950 text-xs font-black border border-amber-300 cursor-pointer shadow-2xs transition-all active:scale-95 flex items-center gap-1.5"
                title="Xem danh sách các ca có làm thay, tăng ca, về sớm trong tuần"
              >
                <span>📋</span>
                <span>LS ĐỔI CA {adjustedShiftsInWeek.length > 0 ? `(${adjustedShiftsInWeek.length})` : ''}</span>
              </button>
            )}

            <div className="flex items-center flex-wrap gap-1 sm:gap-1.5">
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => {
                    if (isSortMode) {
                      handleFinishSorting();
                    } else {
                      setSearchQuery('');
                      setNameSortOrder('default');
                      setIsSortMode(true);
                    }
                  }}
                  disabled={savingSort}
                  className={`hidden sm:flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-black transition-all cursor-pointer active:scale-95 ${
                    isSortMode
                      ? 'bg-emerald-600 text-white animate-pulse'
                      : 'text-purple-950 hover:bg-white'
                  }`}
                  title={isSortMode ? 'Bấm để lưu thứ tự mới' : 'Bấm để sắp xếp thứ tự nhân viên'}
                >
                  {savingSort ? '⏳ Lưu...' : isSortMode ? '✓ XONG' : '↕️ Sắp Xếp'}
                </button>
              )}
              <span className="hidden sm:inline text-[11px] font-extrabold text-purple-800 mr-0.5">
                🏢 Chi nhánh:
              </span>
              {branches.map((b) => {
                const style = getBranchColorStyle(b.name, b.color);
                return (
                  <div
                    key={b.id}
                    className="flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-lg text-[10px] sm:text-[11px] font-black border shadow-2xs"
                    style={style.badgeStyle}
                  >
                    <span>{formatBranchDisplayName(b.name)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
         BẢNG MA TRẬN PHÂN CÔNG SATIMA • HEADER 1 DÒNG TỐI ƯU • TỰ ĐỘNG CUỘN TỚI HÔM NAY
         ========================================================================= */}
      <div ref={tableContainerRef} className="bg-white rounded-3xl p-0 border border-purple-200 shadow-xl overflow-x-auto custom-scrollbar relative">
        <table className="table-fixed w-full min-w-[760px] sm:min-w-[1000px] border-collapse text-xs">
          <thead>
            {/* Hàng 1: Tên Thứ (T2 -> CN) */}
            <tr className="bg-purple-900 text-white border-b border-purple-800">
              <th className="py-1 sm:py-2 px-1.5 sm:px-2 border-r-2 border-purple-300 w-[14%] min-w-[105px] sm:min-w-[125px] max-w-[150px] text-left font-black sticky left-0 z-30 bg-purple-950 text-white shadow-[4px_0_10px_-2px_rgba(0,0,0,0.3)] text-xs">
                <div className="flex items-center justify-between gap-1 mb-1">
                  <div className="flex items-center gap-1">
                    <span>NHÂN VIÊN</span>
                    {!isSortMode && (
                      <button
                        type="button"
                        onClick={toggleNameSort}
                        title={
                          nameSortOrder === 'asc'
                            ? 'Đang xếp A-Z (Bấm để xếp Z-A)'
                            : nameSortOrder === 'desc'
                            ? 'Đang xếp Z-A (Bấm về thứ tự mặc định)'
                            : 'Bấm để sắp xếp theo tên A-Z'
                        }
                        className={`px-1 py-0.2 rounded text-[10px] font-black cursor-pointer transition-all ${
                          nameSortOrder !== 'default'
                            ? 'bg-amber-400 text-purple-950 shadow-xs'
                            : 'bg-purple-900/80 text-purple-300 hover:text-white hover:bg-purple-800'
                        }`}
                      >
                        {nameSortOrder === 'asc' ? 'A→Z' : nameSortOrder === 'desc' ? 'Z→A' : '↕'}
                      </button>
                    )}
                  </div>
                  {searchQuery && (
                    <span className="text-[10px] bg-amber-400 text-purple-950 font-black px-1.5 py-0.2 rounded shrink-0">
                      {filteredMatrixOrder.length}/{customMatrixOrder.length}
                    </span>
                  )}
                </div>
                {!isSortMode ? (
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
                        title="Xóa bộ lọc"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="text-[10.5px] text-amber-300 font-bold italic">
                    Chế độ kéo thả
                  </div>
                )}
              </th>
              {weekDays.map((dStr, idx) => {
                const isToday = dStr === getToday();
                const holiday = !readOnly ? getHolidayForDate(dStr, holidays) : null;

                return (
                  <th
                    key={dStr}
                    data-date={dStr}
                    className={`py-1.5 sm:py-2.5 px-0.5 sm:px-1 border-r border-purple-800 text-center font-black uppercase text-[10px] sm:text-xs w-[12.28%] min-w-[88px] sm:min-w-[115px] max-w-[135px] transition-all ${
                      isToday
                        ? 'bg-amber-400 text-purple-950 font-black border-x-2 border-amber-500 shadow-inner'
                        : 'text-amber-300'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>{DAY_LABELS[idx]}</span>
                      {isToday && (
                        <span className="px-1.5 py-0.2 rounded-full bg-rose-600 text-white text-[9px] font-black animate-pulse">
                          HÔM NAY
                        </span>
                      )}
                      {!readOnly && holiday && (
                        <span
                          className={`px-1.5 py-0.5 rounded-full text-[10.5px] font-black shadow-xs tracking-tight transition-all ${
                            isToday
                              ? 'bg-purple-950 text-amber-300 border border-purple-900'
                              : 'bg-amber-400 text-purple-950 border border-amber-300 shadow-sm font-black ring-1 ring-amber-300/80'
                          }`}
                          title={`${holiday.name} (x${holiday.multiplier} Lương)`}
                        >
                          x{holiday.multiplier}
                        </span>
                      )}
                    </div>
                    <div className={`text-[11px] font-extrabold mt-0.5 ${isToday ? 'text-purple-950' : 'text-purple-200'}`}>
                      {dStr.split('-').reverse().slice(0, 2).join('/')}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="text-center py-12">
                  <div className="inline-block w-8 h-8 border-3 border-purple-200 border-t-purple-700 rounded-full animate-spin" />
                </td>
              </tr>
            ) : customMatrixOrder.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-10 text-purple-600 italic font-bold">
                  Không có nhân viên đi làm tuần này.
                </td>
              </tr>
            ) : filteredMatrixOrder.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-10 text-purple-600 italic font-bold">
                  Không tìm thấy nhân viên nào khớp với &quot;{searchQuery}&quot;.
                </td>
              </tr>
            ) : (
              filteredMatrixOrder.map((emp, idx) => {
                const isMe = emp.id === highlightEmployeeId;

                const rowBgClass = isMe
                  ? 'bg-purple-100'
                  : idx % 2 === 0
                    ? 'bg-white'
                    : 'bg-purple-50';

                return (
                  <tr
                    key={emp.id}
                    className={`border-b border-purple-100 transition-all ${rowBgClass} hover:bg-purple-100`}
                  >
                    {/* Tên Nhân Viên — CHỈ CHO PHÉP KÉO THẢ KHI BẬT isSortMode */}
                    <td
                      data-sort-index={idx}
                      draggable={!readOnly && isSortMode}
                      onDragStart={(e) => !readOnly && isSortMode && handleDirectDragStart(e, idx)}
                      onDragOver={(e) => !readOnly && isSortMode && handleDirectDragOver(e, idx)}
                      onDragEnd={handleDirectDragEnd}
                      onTouchStart={(e) => !readOnly && isSortMode && handleDirectTouchStart(e, idx)}
                      onTouchMove={(e) => !readOnly && isSortMode && handleDirectTouchMove(e)}
                      onTouchEnd={handleDirectTouchEnd}
                      className={`py-1 sm:py-2 px-1.5 sm:px-2 border-r-2 border-purple-300 font-black text-purple-950 text-[11px] sm:text-xs sticky left-0 z-20 ${rowBgClass} shadow-[4px_0_10px_-2px_rgba(107,33,168,0.15)] transition-all w-[14%] min-w-[105px] sm:min-w-[125px] max-w-[150px] truncate ${isSortMode
                        ? 'cursor-grab active:cursor-grabbing bg-amber-50/80 border-amber-300 hover:bg-amber-100/90'
                        : ''
                        } ${draggedIdx === idx ? 'bg-purple-200/90 opacity-75 border-purple-500 shadow-xl scale-98' : ''}`}
                      title={isSortMode ? 'Đang bật Sắp Xếp: Chạm/Giữ kéo thả hàng này' : ''}
                    >
                      <div className="flex items-center gap-1.5 truncate min-w-0">
                        {isSortMode && (
                          <span className="text-amber-600 font-black text-sm select-none touch-none animate-pulse" title="Chạm giữ để kéo hàng">
                            ≡
                          </span>
                        )}
                        {isMe && <span className="text-purple-700 text-xs shrink-0" title="Tài khoản của tôi">⭐</span>}
                        <div className="truncate min-w-0 flex flex-col justify-center">
                          {emp.nickname ? (
                            <>
                              <span
                                className="text-purple-950 font-black text-xs sm:text-sm truncate leading-tight"
                                title={!readOnly ? `Biệt danh: ${emp.nickname} - Tên thật: ${emp.name}` : `Biệt danh: ${emp.nickname}`}
                              >
                                {emp.nickname}
                              </span>
                              {/* Phía Admin: Hiện tên thật bên dưới trong ngoặc. Phía Nhân Viên: Chỉ hiện Biệt Danh! */}
                              {!readOnly && (
                                <span className="text-[9.5px] font-bold text-purple-700/80 truncate leading-none mt-0.5">
                                  ({emp.name})
                                </span>
                              )}
                            </>
                          ) : (
                            <span
                              className={isMe ? 'text-purple-950 font-black text-xs sm:text-sm truncate' : 'text-purple-950 font-extrabold text-xs sm:text-sm truncate'}
                              title={`Tên nhân viên: ${emp.name}`}
                            >
                              {emp.name}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* 7 Ô Ngày (T2 -> CN) */}
                    {weekDays.map((dStr, dayIdx) => {
                      const empShifts = scheduleByEmpAndDate[`${emp.id}_${dStr}`] || [];
                      const empAvail = availByEmpAndDate[`${emp.id}_${dStr}`];

                      // Tìm ca của ngày hôm trước (nếu dayIdx > 0)
                      const prevDateStr = dayIdx > 0 ? weekDays[dayIdx - 1] : null;
                      const prevDayShifts = prevDateStr ? scheduleByEmpAndDate[`${emp.id}_${prevDateStr}`] || [] : [];
                      const canCopyFromPrevDay = !readOnly && !isSortMode && empShifts.length === 0 && prevDayShifts.length > 0;

                      return (
                        <td
                          key={dStr}
                          onClick={() => openCellModal(emp, dStr, empShifts[0] || null)}
                          className={`p-0.5 sm:p-1.5 border-r border-purple-100 text-center align-middle transition-all w-[12.28%] min-w-[88px] sm:min-w-[115px] max-w-[135px] overflow-hidden group ${readOnly ? 'cursor-default select-none' : 'cursor-pointer hover:bg-purple-100/60'
                            }`}
                        >
                          {/* Phía Nhân Viên khi Admin CHƯA BẤM CHỐT LỊCH: Luôn hiển thị 'Đang xếp lịch' */}
                          {readOnly && !isWeekLocked ? (
                            <div className="py-1 text-center">
                              <span className="text-purple-700 font-extrabold text-[10.5px] px-2 py-0.5 rounded-md bg-purple-50 border border-purple-200 inline-block shadow-2xs">
                                ⏳ Đang xếp lịch
                              </span>
                            </div>
                          ) : empShifts.length > 0 ? (
                            /* Có Ca Phân Công -> Phô diễn màu sắc tươi sáng chuẩn DB 100% */
                            <div className="space-y-1">
                              {empShifts.map((shift) => {
                                const style = getBranchColorStyle(shift.branches?.name, shift.branches?.color);
                                const startTimeStr = shift.start_time ? shift.start_time.slice(0, 5) : '09:00';
                                const endTimeStr = shift.end_time ? shift.end_time.slice(0, 5) : '14:00';
                                const timeRange = `${startTimeStr}-${endTimeStr}`;
                                const branchDisplayName = formatBranchDisplayName(shift.branches?.name);

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
                                    className="p-1.5 rounded-xl font-black text-xs sm:text-sm leading-tight border shadow-2xs transition-all hover:scale-[1.02]"
                                    style={style.badgeStyle}
                                  >
                                    <div className="text-xs font-black tracking-tight">
                                      {splitTimeDisplay ? (
                                        <div className="flex flex-col leading-tight text-[10.5px]">
                                          <span>{splitTimeDisplay.split(' & ')[0]}</span>
                                          <span className="text-[9.5px] opacity-90">&amp; {splitTimeDisplay.split(' & ')[1]}</span>
                                        </div>
                                      ) : (
                                        timeRange
                                      )}
                                    </div>
                                    <div className="text-xs font-black opacity-95 mt-0.5">
                                      {branchDisplayName}
                                    </div>
                                    {shift.note && (
                                      <div
                                        className="text-[10px] font-extrabold opacity-95 truncate max-w-[110px] mx-auto mt-0.5"
                                        title={shift.note}
                                      >
                                        <span className="inline-block px-1.5 py-0.2 rounded bg-black/15 text-[9px] font-black tracking-tight">
                                          {getShiftAdjustmentDisplay(shift)}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            /* Ô Ngày Trống / Không có ca:
                               - Phía Nhân Viên (readOnly): CHỈ hiện OFF khi Chủ bấm gán OFF (ADMIN_OFF). Còn lại luôn hiện "Đang xếp lịch".
                               - Phía Chủ/Admin: Hiện thông tin đăng ký rảnh. Khi Chủ bấm OFF -> đè chữ OFF thay thế. */
                            <div className="py-1 text-center space-y-1 overflow-hidden">
                              {readOnly ? (
                                /* === PHÍA NHÂN VIÊN: CHỈ HIỆN 🛑 OFF GỌN GÀNG, KHÔNG HIỆN GHI CHÚ === */
                                empAvail?.is_admin_assigned || empAvail?.type === 'off' ? (
                                  <span className="text-rose-600 font-black text-[11px] uppercase px-2.5 py-1 rounded-xl bg-rose-50 border-2 border-rose-300 inline-block shadow-sm">
                                    🛑 OFF
                                  </span>
                                ) : (
                                  /* Chưa có lịch, chưa gán OFF -> Đang xếp lịch */
                                  <span className="text-purple-700 font-extrabold text-[10.5px] px-2 py-0.5 rounded-md bg-purple-50 border border-purple-200 inline-block shadow-2xs">
                                    ⏳ Đang xếp lịch
                                  </span>
                                )
                              ) : (
                                /* === PHÍA CHỦ / ADMIN === */
                                empAvail?.is_admin_assigned ? (
                                  /* Chủ đã bấm OFF -> Hiện badge OFF lớn nổi bật kèm ghi chú */
                                  <div className="p-1.5 rounded-xl font-black text-xs sm:text-sm leading-tight border-2 border-rose-400 shadow-sm bg-rose-100 text-rose-700 transition-all hover:scale-[1.02]">
                                    <div className="text-xs font-black">🛑 OFF</div>
                                    {(() => {
                                      const subtitle = empAvail.admin_note
                                        ? empAvail.admin_note
                                        : empAvail.type === 'full'
                                        ? 'ĐK: Cả ngày'
                                        : empAvail.type === 'option'
                                        ? (empAvail.note ? `ĐK: ${empAvail.note}` : 'ĐK: Tùy ca')
                                        : empAvail.type === 'off'
                                        ? (empAvail.note ? `Xin off: ${empAvail.note}` : 'Xin nghỉ')
                                        : (empAvail.note || '');
                                      if (!subtitle) return null;
                                      return (
                                        <div
                                          className="text-[10px] font-extrabold text-rose-800 opacity-90 mt-0.5 line-clamp-2 leading-tight break-words max-w-[115px] mx-auto"
                                          title={
                                            empAvail.admin_note
                                              ? `${empAvail.admin_note}${empAvail.note ? ` (ĐK gốc: ${empAvail.note})` : ''}`
                                              : subtitle
                                          }
                                        >
                                          {subtitle}
                                        </div>
                                      );
                                    })()}
                                  </div>
                                ) : empAvail ? (
                                  /* Nhân viên đã đăng ký rảnh -> Hiện thông tin đăng ký */
                                  <div
                                    className="text-[11px] font-black text-purple-700 truncate max-w-[115px] mx-auto px-1"
                                    title={empAvail.type === 'off' && empAvail.note ? `Xin nghỉ: ${empAvail.note}` : empAvail.note || ''}
                                  >
                                    {empAvail.type === 'full'
                                      ? '💪 Cả ngày'
                                      : empAvail.type === 'off'
                                        ? (empAvail.note ? `🛑 ${empAvail.note}` : '🛑 Xin nghỉ')
                                        : `📝 ${empAvail.note || 'Tùy ca'}`}
                                  </div>
                                ) : (
                                  /* Nhân viên chưa đăng ký gì */
                                  <span className="text-gray-400 font-bold text-[10px] italic">—</span>
                                )
                              )}

                              {/* NÚT SAO CHÉP NHANH TINH TẾ TỪ NGÀY HÔM TRƯỚC */}
                              {canCopyFromPrevDay && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCopyShiftFromPrevDay(emp.id, prevDayShifts[0], dStr);
                                  }}
                                  className="py-0.5 px-2 rounded-lg bg-purple-100 hover:bg-purple-700 text-purple-900 hover:text-white font-black text-[10px] border border-purple-200 cursor-pointer shadow-2xs transition-all active:scale-95 flex items-center justify-center gap-1 mx-auto opacity-80 group-hover:opacity-100 group-hover:scale-105"
                                  title={`Bấm 1-chạm để sao chép ca làm của ${DAY_LABELS[dayIdx - 1]} sang ${DAY_LABELS[dayIdx]}`}
                                >
                                  <span>⚡</span>
                                  <span>Copy {DAY_LABELS[dayIdx - 1]}</span>
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}

            {/* =========================================================================
               HÀNG TỔNG LƯƠNG & TỔNG GIỜ LÀM THEO TỪNG NGÀY TRONG TUẦN (CHỈ HIỂN THỊ PHÍA ADMIN)
               ========================================================================= */}
            {!readOnly && (
              <tr className="border-t-2 border-purple-900 font-black">
                {/* Cột Đầu Tiên: TỔNG CẢ TUẦN (Cộng dồn tất cả 7 ngày trong tuần) */}
                <td className="p-2 sm:p-2.5 bg-purple-200 text-purple-950 text-center font-black border-r-2 border-purple-300 space-y-0.5 min-w-[110px] sticky left-0 z-20 shadow-[4px_0_10px_-2px_rgba(107,33,168,0.15)]">
                  <div className="text-[10px] font-black uppercase tracking-wider text-purple-800">
                    TỔNG CẢ TUẦN
                  </div>
                  <div className="text-xs sm:text-sm font-black text-purple-950 tracking-tight">
                    {formatCurrency(weekTotalSalary)}
                  </div>
                  <div className="text-[11px] font-extrabold text-purple-800/90">
                    {weekTotalHours > 0 ? `${weekTotalHours}h` : '0h'}
                  </div>
                </td>

                {/* 7 Cột Tương Ứng T2 -> CN */}
                {weekDays.map((dStr) => {
                  // 1. Lọc tất cả ca phân công trong ngày dStr từ localSchedule
                  const dayShifts = (localSchedule || []).filter((s) => s.date === dStr);

                  // 2. Tính tổng giờ và tổng lương ngày đó chuẩn xác theo mốc lương & ngày lễ
                  const { totalHours: dayTotalHours, totalSalary: dayTotalSalary } = calcTotalSalaryForShifts(dayShifts);

                  return (
                    <td
                      key={dStr}
                      className="p-2 sm:p-2.5 bg-purple-950 text-center text-white border-r border-purple-900 shadow-inner space-y-0.5"
                    >
                      {/* Tổng Số Tiền Lương Ngày Hôm Đó (Chữ Xanh Lá Cây Sáng Nổi Bật) */}
                      <div className="text-xs sm:text-sm font-black text-emerald-400 tracking-tight">
                        {formatCurrency(dayTotalSalary)}
                      </div>

                      {/* Tổng Số Giờ Làm Trong Ngày Đó */}
                      <div className="text-[11px] font-extrabold text-purple-200/90">
                        {dayTotalHours > 0 ? `${dayTotalHours}h` : '0h'}
                      </div>
                    </td>
                  );
                })}
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* =========================================================================
         BẢNG RIÊNG 1: DANH SÁCH NHÂN VIÊN XIN OFF (TẠM NGHỈ VÀI NGÀY) - CHỈ ADMIN HIỂN THỊ
         ========================================================================= */}
      {!readOnly && shortLeaveEmployees.length > 0 && (
        <div className="bg-white rounded-2xl p-4 border border-amber-200/90 shadow-2xs space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-black text-xs sm:text-sm text-amber-950 flex items-center gap-2">
              <span>🟡</span> Danh Sách Nhân Viên Xin Off ({shortLeaveEmployees.length} nhân viên)
            </h3>
            <span className="text-[11px] font-extrabold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
              Tạm off vài ngày trong tuần
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {shortLeaveEmployees.map(({ employee: emp, reason, offDaysCount }) => (
              <div
                key={emp.id}
                className="p-3 rounded-xl bg-amber-50/80 border border-amber-200 flex items-center justify-between gap-2 shadow-2xs"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-black text-sm text-purple-950 truncate">{emp.name}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-md font-black bg-amber-100 text-amber-900 border border-amber-300 flex-shrink-0">
                      🟡 {reason}
                    </span>
                  </div>
                  <div className="text-[11px] font-extrabold text-amber-800 mt-1">
                    🗓️ Đã xin off: {offDaysCount > 0 ? `${offDaysCount}/7 ngày tuần này` : 'Tạm off'}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => openCellModal(emp, startDate)}
                  className="px-2.5 py-1.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-black border-0 cursor-pointer shadow-2xs transition-all active:scale-95 flex-shrink-0"
                  title="Xếp lịch làm cho nhân viên này"
                >
                  + Xếp lịch
                </button>
              </div>
            ))}
          </div>
        </div>
      )}



      {/* MODAL XẾP LỊCH QUICK KHI BẤM VÀO Ô BẤT KỲ */}
      {modalState.isOpen && (
        <ModalXepLichQuick
          isOpen={modalState.isOpen}
          onClose={() => setModalState({ isOpen: false, date: null, branch: null, employee: null, editItem: null })}
          date={modalState.date}
          branch={modalState.branch}
          branches={branches}
          employees={employees}
          availabilities={(localAvailability.length > 0 ? localAvailability : availability).filter((a) => a.date === modalState.date)}
          daySchedule={localSchedule.filter((s) => s.date === modalState.date)}
          onSave={handleSaveModal}
          onDelete={handleDeleteScheduleItem}
          onAssignOff={handleAssignOff}
          onRemoveOff={handleRemoveOff}
          editItem={modalState.editItem}
          initialEmployee={modalState.employee}
          isWeekLocked={isWeekLocked}
        />
      )}

      {/* MODAL XEM TRƯỚC BẢNG NGUYÊN BẢN TRƯỚC KHI TẢI FILE PDF / IN */}
      {showPDFPreview && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[99999] bg-black/75 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-fade-in">
          <div className="bg-white rounded-3xl max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl border-2 border-purple-300 overflow-hidden">
            {/* Header Modal */}
            <div className="p-3.5 sm:p-5 bg-purple-900 text-white flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xl">👁️</span>
                <div>
                  <h3 className="font-black text-sm sm:text-base tracking-tight text-white uppercase">
                    XEM TRƯỚC BẢNG LỊCH PHÂN CÔNG
                  </h3>
                  <p className="text-xs text-purple-200 font-extrabold">
                    Xem trước hình ảnh bảng phân công trước khi tải về
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadImage}
                  disabled={isExportingImage}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-black text-xs sm:text-sm border border-emerald-400 cursor-pointer shadow-md active:scale-95 transition-all flex items-center gap-1.5 disabled:opacity-50"
                  title="Tải file ảnh PNG"
                >
                  <span>🖼️</span>
                  <span>{isExportingImage ? '⏳ Đang Tải...' : 'TẢI FILE ẢNH (PNG)'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowPDFPreview(false)}
                  className="w-8 h-8 rounded-full bg-purple-950/50 hover:bg-purple-950 text-white font-black text-sm flex items-center justify-center cursor-pointer border border-purple-700"
                  title="Đóng xem trước"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Nội dung bản xem trước — Định dạng trọn bộ 1 hình ma trận sạch đét y hệt Hình 4 */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-purple-50/50 space-y-4">
              <div
                id="pdf-preview-content"
                className="bg-white p-4 sm:p-6 rounded-2xl border border-purple-200 shadow-md space-y-4 max-w-full overflow-x-auto"
              >
                {/* Tiêu đề bảng ngắn gọn sạch đét */}
                <div className="text-center pb-2 border-b-2 border-purple-900">
                  <h2 className="text-base sm:text-xl font-black text-purple-950 uppercase tracking-tight">
                    BẢNG PHÂN CÔNG LỊCH LÀM TUẦN
                  </h2>
                  <p className="text-xs sm:text-sm font-bold text-purple-800 mt-1">
                    Thời gian: Từ ngày {startDate.split('-').reverse().join('/')} đến ngày {endDate.split('-').reverse().join('/')}
                  </p>
                </div>

                {/* Bản sao chép Ma Trận Bảng Lịch Tuần */}
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="bg-purple-900 text-white border-b border-purple-800">
                        <th className="py-2 px-2 border-r border-purple-800 text-left font-black text-xs">
                          STT / NHÂN VIÊN
                        </th>
                        {weekDays.map((dStr, idx) => (
                          <th key={dStr} className="py-2 px-1 text-center font-black text-xs border-r border-purple-800 min-w-[95px]">
                            <div>{DAY_LABELS[idx]}</div>
                            <div className="text-[10px] font-extrabold text-purple-200">
                              {dStr.split('-').reverse().slice(0, 2).join('/')}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {customMatrixOrder.map((emp, idx) => (
                        <tr key={emp.id} className={`border-b border-purple-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-purple-50/60'}`}>
                          <td className="py-1.5 px-3 border-r border-purple-200 font-black text-purple-950 text-sm whitespace-nowrap">
                            <span className="text-purple-700 font-black text-xs mr-1.5">{idx + 1}.</span>
                            <span className="font-black text-purple-950 text-sm">{emp.name}</span>
                          </td>
                          {weekDays.map((dStr) => {
                            const empShifts = scheduleByEmpAndDate[`${emp.id}_${dStr}`] || [];
                            const empAvail = availByEmpAndDate[`${emp.id}_${dStr}`];

                            return (
                              <td key={dStr} className="py-1 px-1 border-r border-purple-100 text-center align-middle h-[34px]">
                                {empShifts.length > 0 ? (
                                  <div className="space-y-0.5">
                                    {empShifts.map((shift) => {
                                      const style = getBranchColorStyle(shift.branches?.name, shift.branches?.color);
                                      const startTimeStr = shift.start_time ? shift.start_time.slice(0, 5) : '09:00';
                                      const endTimeStr = shift.end_time ? shift.end_time.slice(0, 5) : '14:00';
                                      const branchDisplayName = formatBranchDisplayName(shift.branches?.name);

                                      return (
                                        <div
                                          key={shift.id}
                                          className="p-1 rounded-md font-black text-[11px] leading-tight border shadow-2xs flex flex-col justify-center items-center min-h-[26px]"
                                          style={style.badgeStyle}
                                        >
                                          <div className="text-[11px] font-black">{startTimeStr}-{endTimeStr}</div>
                                          <div className="text-[9.5px] font-black uppercase opacity-95 mt-0.5">{branchDisplayName}</div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : empAvail?.is_admin_assigned || empAvail?.type === 'off' ? (
                                  <div className="text-rose-600 font-black text-[11px] uppercase p-1 rounded-md bg-rose-50 border border-rose-200 flex flex-col justify-center items-center min-h-[26px]">
                                    <span>🛑 OFF</span>
                                    {empAvail.note && (
                                      <span className="text-[9px] font-extrabold normal-case text-rose-800 tracking-tight mt-0.5 truncate max-w-[85px]">
                                        {empAvail.note}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-slate-400 font-bold text-xs">
                                    —
                                  </span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL CẤU HÌNH CẤM XIN NGHỈ CHO ADMIN */}
      {showBlockOffModal && (
        <ModalBlockOffDays
          isOpen={showBlockOffModal}
          onClose={() => setShowBlockOffModal(false)}
          toast={toast}
          onSaved={(newBlockedMap) => {
            setBlockedMap(newBlockedMap || {});
            loadWeekData(true);
          }}
        />
      )}

      {/* MODAL CẤU HÌNH NGÀY LỄ (x2, x3 LƯƠNG) CHO ADMIN */}
      {showHolidayModal && (
        <ModalHolidaySettings
          isOpen={showHolidayModal}
          onClose={() => setShowHolidayModal(false)}
          toast={toast}
          onHolidaysUpdated={(newHolidays) => {
            setHolidays(newHolidays);
          }}
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

      {/* MODAL XEM NHẬT KÝ CÁC CA ĐỔI / LÀM THAY / TĂNG CA / VỀ SỚM TRONG TUẦN */}
      {showAdjustedShiftsModal && (
        <ModalAdjustedShiftsList
          isOpen={showAdjustedShiftsModal}
          onClose={() => setShowAdjustedShiftsModal(false)}
          shifts={localSchedule.length > 0 ? localSchedule : schedule}
          employees={employees}
          branches={branches}
          startDate={startDate}
          endDate={endDate}
          isWeekLocked={isWeekLocked}
        />
      )}

      {showRegistrationLockModal && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[110] bg-purple-950/60 backdrop-blur-sm p-3 flex items-center justify-center"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isSavingRegistrationLockDay) {
              setShowRegistrationLockModal(false);
            }
          }}
        >
          <section
            className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-purple-200 overflow-hidden"
            role="dialog"
            aria-modal="true"
            aria-labelledby="registration-lock-title"
          >
            <header className="px-4 py-3 border-b border-purple-100 flex items-center justify-between gap-3">
              <h2 id="registration-lock-title" className="font-black text-purple-950">
                ⏰ Khóa đăng ký hàng tuần
              </h2>
              <button
                type="button"
                onClick={() => setShowRegistrationLockModal(false)}
                disabled={isSavingRegistrationLockDay}
                className="w-8 h-8 rounded-lg bg-purple-100 hover:bg-purple-200 text-purple-950 font-black border-0 cursor-pointer disabled:opacity-50"
                aria-label="Đóng cài đặt khóa đăng ký"
              >
                ×
              </button>
            </header>
            <div className="p-4 space-y-4">
              <p className="text-sm text-purple-900 leading-relaxed">
                Chọn ngày tự động khóa đăng ký lịch tuần của nhân viên. Mặc định là Chủ Nhật.
              </p>
              <label className="block text-xs font-black text-purple-950">
                Tự khóa đăng ký vào
                <select
                  value={registrationLockDay === null ? 'disabled' : String(registrationLockDay)}
                  onChange={(event) => setRegistrationLockDay(
                    event.target.value === 'disabled' ? null : Number(event.target.value)
                  )}
                  disabled={isLoadingRegistrationLockDay || isSavingRegistrationLockDay || Boolean(registrationLockSettingsError)}
                  className="mt-1.5 w-full rounded-xl border border-purple-300 bg-white px-3 py-2.5 text-sm font-bold text-purple-950 disabled:opacity-60"
                >
                  <option value="disabled">Tắt tự động khóa</option>
                  <option value="1">Thứ 2</option>
                  <option value="2">Thứ 3</option>
                  <option value="3">Thứ 4</option>
                  <option value="4">Thứ 5</option>
                  <option value="5">Thứ 6</option>
                  <option value="6">Thứ 7</option>
                  <option value="0">Chủ Nhật</option>
                </select>
              </label>
              {isLoadingRegistrationLockDay && (
                <p className="text-xs font-bold text-purple-700" role="status">Đang tải cài đặt...</p>
              )}
              {registrationLockSettingsError && (
                <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-900">
                  <p className="font-bold">{registrationLockSettingsError}</p>
                  <button
                    type="button"
                    onClick={openRegistrationLockSettings}
                    className="mt-2 font-black underline cursor-pointer"
                  >
                    Tải lại cài đặt
                  </button>
                </div>
              )}
              <p className="text-[11px] text-slate-600">
                Khóa áp dụng suốt ngày đã chọn cho đăng ký tuần sau. Lịch tuần hiện tại vẫn khóa; Dịp Đặc Biệt không bị ảnh hưởng.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowRegistrationLockModal(false)}
                  disabled={isSavingRegistrationLockDay}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-black border-0 cursor-pointer disabled:opacity-50"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleSaveRegistrationLockDay}
                  disabled={isLoadingRegistrationLockDay || isSavingRegistrationLockDay || Boolean(registrationLockSettingsError)}
                  className="px-4 py-2 rounded-xl bg-purple-800 hover:bg-purple-900 text-white text-xs font-black border-0 cursor-pointer disabled:opacity-50"
                >
                  {isSavingRegistrationLockDay ? 'Đang lưu...' : 'Lưu cài đặt'}
                </button>
              </div>
            </div>
          </section>
        </div>,
        document.body
      )}
    </div>
  );
}
