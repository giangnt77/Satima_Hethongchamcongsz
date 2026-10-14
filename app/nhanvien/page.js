'use client';

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import Navbar from '@/components/Navbar';
import CopyrightFooter from '@/components/CopyrightFooter';
import EmployeeSelector from '@/components/EmployeeSelector';
import WeeklyAvailability from '@/components/WeeklyAvailability';
import WeeklyMatrixBoard from '@/components/WeeklyMatrixBoard';
import ModalShiftSwap from '@/components/ModalShiftSwap';
import NewsCenter from '@/components/NewsCenter';
import { ToastProvider, useToast } from '@/components/Toast';
import {
  getEmployeeByName,
  getEmployees,
  getAllEmployees,
  createEmployee,
  getScheduleByDateRange,
  updateEmployeeRate,
  getEmployeeRates,
  calculateSalaryFromShifts,
  getAnnouncementNotice,
  getShiftSwapsByEmployee,
  getPenaltiesByEmployee,
  getHolidaySettings,
  getMonthlySalaryConfirmation,
  confirmMonthlySalary,
  updateEmployeeNickname,
  checkNicknameCooldown,
  verifyEmployeePin,
  logoutDataSession,
} from '@/lib/supabase';
import { getCurrentMonth, formatCurrency, getToday, formatDateFull, formatDateWithDayVN, getBranchColorStyle, validateNickname } from '@/lib/utils';

function getDayOfWeekLabel(dateStr) {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-').map(Number);
  const dayOfWeek = new Date(year, month - 1, day).getDay();
  return ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][dayOfWeek] || '';
}

function EmployeeContent() {
  const toast = useToast();

  // Auth state
  const [employee, setEmployee] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [authLoading, setAuthLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(false);

  useEffect(() => {
    getAllEmployees().then((data) => {
      const filtered = (data || []).filter((emp) => {
        const nameLower = String(emp.name || '').toLowerCase().trim();
        const roleLower = String(emp.role || '').toLowerCase().trim();
        return (
          roleLower !== 'owner' &&
          roleLower !== 'manager' &&
          nameLower !== 'owner' &&
          nameLower !== 'manager' &&
          !nameLower.includes('owner') &&
          !nameLower.includes('manager')
        );
      });
      setEmployees(filtered);
    }).catch(console.error);
  }, []);

  // View state
  const [view, setView] = useState('schedule');

  // Worked hours & salary state
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [monthlyHours, setMonthlyHours] = useState(0);
  const [monthlyShiftsCount, setMonthlyShiftsCount] = useState(0);
  const [monthlySalary, setMonthlySalary] = useState(0);
  const [monthlyShifts, setMonthlyShifts] = useState([]);
  const [empRates, setEmpRates] = useState([]);
  const [empPenalties, setEmpPenalties] = useState([]);
  const [salaryConfirmation, setSalaryConfirmation] = useState(null);
  const [loadingSalaryConfirmation, setLoadingSalaryConfirmation] = useState(false);
  const [savingSalaryConfirmation, setSavingSalaryConfirmation] = useState(false);
  
  // Password change modal
  const [showPinModal, setShowPinModal] = useState(false);
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinSuccess, setPinSuccess] = useState(false);

  // Nickname state
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');
  const [savingNickname, setSavingNickname] = useState(false);
  const [isIncomeExpanded, setIsIncomeExpanded] = useState(false);

  // State Thông Báo Quan Trọng Dành Cho Nhân Viên
  const [showNoticeModal, setShowNoticeModal] = useState(false);
  const [showNewsCenter, setShowNewsCenter] = useState(false);
  const [noticeText, setNoticeText] = useState(
    '📌 THÔNG BÁO TỪ QUẢN LÝ:\n- Hãy chốt và đăng ký lịch rảnh tuần tới trước 22:00 Chủ Nhật hàng tuần.\n- Kiểm tra các ngày Cao Điểm cấm Off trước khi gửi yêu cầu xin nghỉ!'
  );

  // State Quản Lý Đổi Ca & Chi Tiết Lỗi Phạt / Thưởng
  const [shiftSwaps, setShiftSwaps] = useState([]);
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [showPenaltyDetailModal, setShowPenaltyDetailModal] = useState(false);
  const [showBonusDetailModal, setShowBonusDetailModal] = useState(false);
  const [swapFilterMonth, setSwapFilterMonth] = useState(getCurrentMonth());

  useEffect(() => {
    if (employee) {
      getAnnouncementNotice().then((text) => {
        if (text) setNoticeText(text);
      });

      loadMyShiftSwaps();

      const snoozeKey = `chems_employee_notice_snooze_${employee.id}`;
      const snooze = localStorage.getItem(snoozeKey);
      if (!snooze || Date.now() > Number(snooze)) {
        setShowNoticeModal(true);
      } else {
        setShowNoticeModal(false);
      }
    }
  }, [employee]);

  async function loadMyShiftSwaps() {
    if (!employee) return;
    try {
      const data = await getShiftSwapsByEmployee(employee.id);
      setShiftSwaps(data);
    } catch (e) {
      console.error(e);
    }
  }

  // Chấm xanh nháy phát sáng: Chỉ hiện khi có ca vừa được duyệt/từ chối TRONG VÒNG 24 GIỜ và CHƯA ĐỌC
  const hasUnreadApprovedSwap = useMemo(() => {
    if (!employee || !shiftSwaps || shiftSwaps.length === 0) return false;
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000; // 24 giờ
    const lastRead = Number(localStorage.getItem(`chems_last_read_swaps_${employee.id}`) || '0');

    return shiftSwaps.some((s) => {
      if (s.status !== 'approved' && s.status !== 'rejected') return false;
      const updatedAt = s.updated_at ? new Date(s.updated_at).getTime() : new Date(s.created_at).getTime();
      const isRecentWithin24h = (now - updatedAt) <= oneDayMs;
      const isNewerThanLastRead = updatedAt > lastRead;
      return isRecentWithin24h && isNewerThanLastRead;
    });
  }, [employee, shiftSwaps]);

  function handleMarkSwapsAsRead() {
    if (!employee) return;
    localStorage.setItem(`chems_last_read_swaps_${employee.id}`, String(Date.now()));
  }

  function handleSnoozeEmployeeNotice4Hours() {
    if (!employee) return;
    const snoozeTime = Date.now() + 4 * 60 * 60 * 1000; // 4 tiếng
    const snoozeKey = `chems_employee_notice_snooze_${employee.id}`;
    localStorage.setItem(snoozeKey, String(snoozeTime));
    setShowNoticeModal(false);
  }

  // Luôn bắt đầu từ Màn Hình Chọn Nhân Viên (Không tự động nhảy thẳng vào app qua cache)
  useEffect(() => {
    setInitialLoading(false);
  }, []);

  // Load employee monthly hours whenever employee or selectedMonth changes
  useEffect(() => {
    if (employee) {
      loadEmployeeHours();
    }
  }, [employee, selectedMonth]);

  async function loadEmployeeHours() {
    setMonthlyShifts([]);
    try {
      let cleanMonth = selectedMonth;
      if (!cleanMonth || typeof cleanMonth !== 'string' || cleanMonth.includes('NaN') || !cleanMonth.includes('-')) {
        cleanMonth = getCurrentMonth();
        setSelectedMonth(cleanMonth);
      }

      const parts = cleanMonth.split('-').map(Number);
      const year = parts[0] || new Date().getFullYear();
      const month = parts[1] || (new Date().getMonth() + 1);
      const lastDay = new Date(year, month, 0).getDate();
      const mStr = String(month).padStart(2, '0');
      const startDate = `${year}-${mStr}-01`;
      const endDate = `${year}-${mStr}-${String(lastDay).padStart(2, '0')}`;

      const [schedData, rates, penaltiesData, holidayData] = await Promise.all([
        getScheduleByDateRange(startDate, endDate),
        getEmployeeRates(employee.id),
        getPenaltiesByEmployee(employee.id, cleanMonth),
        getHolidaySettings(),
      ]);

      const employeeSchedule = (schedData || [])
        .filter((shift) => String(shift.employee_id) === String(employee.id))
        .sort((a, b) => String(a.date).localeCompare(String(b.date)));
      const { shiftDetails: allMonthlyShiftDetails } = calculateSalaryFromShifts(
        employeeSchedule,
        rates || [],
        employee.hourly_rate || 20000,
        holidayData || []
      );
      setMonthlyShifts(allMonthlyShiftDetails);
      setEmpRates(rates || []);
      setEmpPenalties(penaltiesData || []);

      // Quy tắc tính lương chuẩn: Chỉ cộng dồn ca làm ĐÃ DIỄN RA (s.date <= getToday())
      // Các ca tương lai được xếp sẵn chưa đến ngày sẽ KHÔNG bị dồn cộng trước!
      const todayStr = getToday();
      const workedShifts = employeeSchedule.filter(
        (shift) => shift.date <= todayStr
      );

      const { totalHours, grossSalary } = calculateSalaryFromShifts(
        workedShifts,
        rates || [],
        employee.hourly_rate || 20000,
        holidayData || []
      );

      setMonthlyHours(totalHours);
      setMonthlyShiftsCount(workedShifts.length);
      setMonthlySalary(grossSalary);
    } catch (err) {
      console.error('Error loading employee hours:', err);
    }
  }

  useEffect(() => {
    if (!employee || !selectedMonth) {
      setSalaryConfirmation(null);
      return undefined;
    }
    let active = true;
    setSalaryConfirmation(null);
    setLoadingSalaryConfirmation(true);
    getMonthlySalaryConfirmation(selectedMonth)
      .then((confirmation) => {
        if (active) setSalaryConfirmation(confirmation);
      })
      .catch((error) => {
        console.error('Lỗi tải xác nhận bảng lương:', error);
        if (active) toast.error('Lỗi', error.message || 'Không thể tải xác nhận bảng lương.');
      })
      .finally(() => {
        if (active) setLoadingSalaryConfirmation(false);
      });
    return () => {
      active = false;
    };
  }, [employee?.id, selectedMonth]);

  async function handleConfirmSalary() {
    if (!employee || salaryConfirmation || savingSalaryConfirmation) return;
    setSavingSalaryConfirmation(true);
    try {
      const confirmation = await confirmMonthlySalary(selectedMonth);
      setSalaryConfirmation(confirmation);
      toast.success('Đã xác nhận', 'Xác nhận kiểm tra bảng lương đã được lưu.');
    } catch (error) {
      console.error('Lỗi lưu xác nhận bảng lương:', error);
      toast.error('Lỗi', error.message || 'Không thể lưu xác nhận bảng lương.');
    } finally {
      setSavingSalaryConfirmation(false);
    }
  }

  // Lọc danh sách khoản phạt vi phạm (không tính thưởng)
  const penaltyList = useMemo(() => {
    if (!empPenalties) return [];
    return empPenalties.filter((p) => {
      const isBonus = p.type === 'bonus' || (p.reason && (p.reason.toLowerCase().startsWith('[thưởng]') || p.reason.toLowerCase().startsWith('[bonus]')));
      return !isBonus;
    });
  }, [empPenalties]);

  const totalPenaltyAmount = useMemo(() => {
    return penaltyList.reduce((sum, p) => sum + Math.abs(p.amount || 0), 0);
  }, [penaltyList]);

  // Lọc danh sách khoản thưởng / phụ cấp
  const bonusList = useMemo(() => {
    if (!empPenalties) return [];
    return empPenalties.filter((p) => {
      const isBonus = p.type === 'bonus' || (p.reason && (p.reason.toLowerCase().startsWith('[thưởng]') || p.reason.toLowerCase().startsWith('[bonus]')));
      return isBonus;
    });
  }, [empPenalties]);

  const totalBonusAmount = useMemo(() => {
    return bonusList.reduce((sum, p) => sum + Math.abs(p.amount || 0), 0);
  }, [bonusList]);

  // Lương thực nhận = Lương ca làm + Thưởng - Phạt
  const netSalary = useMemo(() => {
    return Math.max(0, Math.round(monthlySalary + totalBonusAmount - totalPenaltyAmount));
  }, [monthlySalary, totalBonusAmount, totalPenaltyAmount]);

  // Chuỗi hiển thị Tháng an toàn 100% không bao giờ bị NaN/NaN
  const displayMonthStr = useMemo(() => {
    const clean = (selectedMonth && selectedMonth.includes('-') && !selectedMonth.includes('NaN'))
      ? selectedMonth
      : getCurrentMonth();
    const parts = clean.split('-');
    const y = parts[0] || new Date().getFullYear();
    const m = parts[1] || String(new Date().getMonth() + 1).padStart(2, '0');
    return `${m}/${y}`;
  }, [selectedMonth]);

  function handlePrevMonth() {
    const clean = (!selectedMonth || selectedMonth.includes('NaN') || !selectedMonth.includes('-'))
      ? getCurrentMonth()
      : selectedMonth;
    const parts = clean.split('-').map(Number);
    let y = parts[0] || new Date().getFullYear();
    let m = parts[1] || (new Date().getMonth() + 1);
    m -= 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    setSelectedMonth(`${y}-${String(m).padStart(2, '0')}`);
  }

  function handleNextMonth() {
    const clean = (!selectedMonth || selectedMonth.includes('NaN') || !selectedMonth.includes('-'))
      ? getCurrentMonth()
      : selectedMonth;
    const parts = clean.split('-').map(Number);
    let y = parts[0] || new Date().getFullYear();
    let m = parts[1] || (new Date().getMonth() + 1);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    setSelectedMonth(`${y}-${String(m).padStart(2, '0')}`);
  }

  function handleOpenNicknameModal() {
    const cooldown = checkNicknameCooldown(employee?.nickname_updated_at);
    if (cooldown.isLocked) {
      toast.info(
        'Giới hạn đổi biệt danh',
        `Bạn vừa đổi biệt danh gần đây. Bạn có thể đổi lại sau ${cooldown.daysLeft} ngày nữa (${cooldown.unlockDateStr}).`
      );
      return;
    }
    setNicknameInput(employee?.nickname || '');
    setShowNicknameModal(true);
  }

  async function handleSaveNickname(e) {
    if (e) e.preventDefault();
    if (!employee) return;

    const cooldown = checkNicknameCooldown(employee?.nickname_updated_at);
    if (cooldown.isLocked) {
      toast.warning(
        'Chưa đến hạn đổi',
        `Bạn cần đợi thêm ${cooldown.daysLeft} ngày nữa (${cooldown.unlockDateStr}) mới được đổi biệt danh tiếp!`
      );
      return;
    }

    const valRes = validateNickname(nicknameInput);
    if (!valRes.isValid) {
      toast.warning('Biệt danh không hợp lệ', valRes.error);
      return;
    }

    setSavingNickname(true);
    try {
      const clean = nicknameInput.trim();
      const updated = await updateEmployeeNickname(employee.id, clean);
      const updatedNick = updated?.nickname !== undefined ? updated.nickname : clean;
      const updatedTime = updated?.nickname_updated_at || new Date().toISOString();

      setEmployee((prev) => ({
        ...prev,
        nickname: clean,
        nickname_updated_at: updatedTime,
      }));
      setEmployees((prev) =>
        prev.map((emp) =>
          emp.id === employee.id
            ? { ...emp, nickname: clean, nickname_updated_at: updatedTime }
            : emp
        )
      );
      setShowNicknameModal(false);
      if (clean) {
        toast.success(
          'Đã đặt biệt danh thành công!',
          `Biệt danh: "${clean}". Bạn có thể đổi lại sau 2 tháng!`
        );
      } else {
        toast.info('Đã xóa biệt danh', 'Đã quay lại hiển thị tên thật');
      }
    } catch (err) {
      console.error(err);
      toast.error('Lỗi', 'Không thể lưu biệt danh');
    } finally {
      setSavingNickname(false);
    }
  }

  async function handleLogin(name, showToast = true) {
    setAuthLoading(true);
    try {
      const emp = await getEmployeeByName(name);
      if (!emp) {
        toast.error('Tài khoản đã bị xóa', 'Không tìm thấy tài khoản nhân viên này.');
        localStorage.removeItem('chemshoa_employee_name');
        setEmployee(null);
      } else if (emp.status === 'off' || emp.is_active === false) {
        toast.error('Tài khoản ngưng hoạt động', `Tài khoản của ${emp.name} đã ngưng hoạt động.`);
        localStorage.removeItem('chemshoa_employee_name');
        localStorage.removeItem(`chemshoa_saved_pin_${emp.id}`);
        setEmployee(null);
      } else {
        // Kiểm tra nếu PIN đã bị Admin thay đổi trên hệ thống
        const savedPin = localStorage.getItem(`chemshoa_saved_pin_${emp.id}`);

        if (savedPin) {
          const isValid = await verifyEmployeePin(emp.id, savedPin);
          if (!isValid) {
            // Mã PIN đã bị Admin đổi -> Xóa bộ nhớ cũ & yêu cầu nhập PIN mới
            localStorage.removeItem('chemshoa_employee_name');
            localStorage.removeItem(`chemshoa_saved_pin_${emp.id}`);
            setEmployee(null);
            toast.warning('Mã PIN thay đổi', 'Admin đã thay đổi mã PIN của bạn. Vui lòng nhập mã PIN mới!');
            return;
          }
        }

        setEmployee(emp);
        const todayStr = getToday();
        localStorage.setItem('chemshoa_employee_name', emp.name);
        localStorage.setItem('chemshoa_login_date', todayStr);

        // Cập nhật mảng Lịch Sử Đăng Nhập lên thiết bị này (Đưa ID vừa đăng nhập lên vị trí ĐẦU TIÊN)
        try {
          let recent = JSON.parse(localStorage.getItem('chemshoa_recent_logins') || '[]');
          recent = [emp.id, ...recent.filter((id) => id !== emp.id)].slice(0, 6);
          localStorage.setItem('chemshoa_recent_logins', JSON.stringify(recent));
        } catch (e) { }

        if (showToast) toast.success('Đăng nhập', `Xin chào ${emp.name}!`);
      }
    } catch (err) {
      console.error(err);
      toast.error('Lỗi', 'Không thể kết nối máy chủ để đăng nhập');
      localStorage.removeItem('chemshoa_employee_name');
      setEmployee(null);
    } finally {
      setAuthLoading(false);
      setInitialLoading(false);
    }
  }

  async function handleSelectEmployee(name) {
    await handleLogin(name, true);
  }

  async function handleLogout() {
    try {
      await logoutDataSession();
    } catch (error) {
      console.error('Google Sheets logout error:', error);
    }
    setEmployee(null);
    localStorage.removeItem('chemshoa_employee_name');
  }

  // Mức lương hiệu lực hiện tại (tính tới ngày hôm nay)
  const currentRate = useMemo(() => {
    if (!employee) return 20000;
    const todayStr = getToday();
    const sortedRates = [...empRates].sort((a, b) => a.effective_date.localeCompare(b.effective_date));
    let rate = employee.hourly_rate || 20000;
    for (let i = sortedRates.length - 1; i >= 0; i--) {
      if (sortedRates[i].effective_date <= todayStr) {
        rate = Number(sortedRates[i].hourly_rate);
        break;
      }
    }
    return rate;
  }, [employee, empRates]);

  if (initialLoading) {
    return (
      <div className="min-h-screen flex flex-col px-4 relative z-10">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-5xl mb-4 animate-bounce-in">🍵</div>
            <div className="inline-block w-8 h-8 border-3 border-[var(--color-surface-3)] border-t-amber-500 rounded-full animate-spin" />
          </div>
        </div>
        <CopyrightFooter />
      </div>
    );
  }

  if (!employee) {
    return (
      <EmployeeSelector onSelect={handleSelectEmployee} loading={authLoading} />
    );
  }

  return (
    <div className="min-h-screen flex flex-col w-full max-w-full overflow-x-hidden relative">
      <Navbar
        title="Salary & Timekeeping Management System"
        icon="🍵"
        employeeName={employee.name}
        showRulesLink={true}
        onRulesClick={() => setShowNewsCenter(true)}
        onNoticeClick={() => setShowNoticeModal(true)}
        onBackClick={handleLogout}
        homeIcon="🚪"
        homeTitle="Đăng Xuất"
      />
      {showNewsCenter && <NewsCenter onClose={() => setShowNewsCenter(false)} />}

      <main className="flex-1 px-3 sm:px-4 md:px-6 py-3 sm:py-4 w-full">
        <div className="max-w-5xl mx-auto space-y-3 w-full">
          {/* Top Header Row: Greeting & Xem Lương Button */}
          <div className="py-1">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-sm sm:text-base font-extrabold text-purple-950 truncate flex items-center gap-1.5 flex-wrap">
                  <span>Xin chào,</span>
                  <span className="text-purple-700 font-black">
                    {employee.nickname ? `${employee.nickname} (${employee.name})` : employee.name}
                  </span>
                </h1>

                {(() => {
                  const cooldown = checkNicknameCooldown(employee?.nickname_updated_at);
                  if (cooldown.isLocked) {
                    return (
                      <button
                        type="button"
                        onClick={() =>
                          toast.info(
                            'Giới hạn đổi biệt danh',
                            `Bạn vừa đổi biệt danh gần đây. Bạn có thể đổi lại sau ${cooldown.daysLeft} ngày nữa (${cooldown.unlockDateStr}).`
                          )
                        }
                        className="px-2.5 py-0.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] font-black border border-slate-300 cursor-pointer transition-all active:scale-95 flex items-center gap-1 shadow-2xs"
                        title={`Đang khóa: Bạn được đổi lại vào ngày ${cooldown.unlockDateStr}`}
                      >
                        <span>🔒</span>
                        <span>Đổi lại sau {cooldown.daysLeft} ngày</span>
                      </button>
                    );
                  }
                  return (
                    <button
                      type="button"
                      onClick={handleOpenNicknameModal}
                      className="px-2.5 py-0.5 rounded-full bg-purple-100 hover:bg-purple-200 text-purple-900 text-[11px] font-black border border-purple-300 cursor-pointer transition-all active:scale-95 flex items-center gap-1 shadow-2xs"
                      title="Bấm để đặt hoặc đổi biệt danh hiển thị trên bảng xếp ca (Giới hạn 2 tháng/lần)"
                    >
                      <span>🎭</span>
                      <span>{employee.nickname ? 'Đổi Biệt Danh' : '+ Đặt Biệt Danh'}</span>
                    </button>
                  );
                })()}
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsIncomeExpanded(!isIncomeExpanded)}
                  className="px-3 sm:px-4 py-1.5 rounded-full bg-purple-700 hover:bg-purple-800 text-white text-xs sm:text-sm font-black border border-purple-800 cursor-pointer transition-all active:scale-95 flex items-center justify-center shadow-2xs whitespace-nowrap"
                  title="Bấm để xem thu nhập cá nhân"
                >
                  <span>{isIncomeExpanded ? 'Thu nhỏ' : 'Xem Lương'}</span>
                </button>
              </div>
            </div>

            {/* Segmented Tab Switcher (Lịch Phân Công / Đăng Ký Làm / Đổi Ca) - 3 Nút To Rõ Cực Đẹp */}
            <div className="flex bg-purple-100/90 p-1.5 rounded-2xl border border-purple-200 shadow-xs gap-1.5 sm:gap-2 mt-1 max-w-2xl mx-auto w-full">
              <button
                type="button"
                onClick={() => setView('schedule')}
                className={`flex-1 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-black cursor-pointer transition-all flex items-center justify-center gap-1 sm:gap-1.5 active:scale-95 ${view === 'schedule'
                  ? 'bg-purple-700 text-white shadow-md font-black scale-[1.01]'
                  : 'bg-white/80 text-purple-950 hover:bg-white font-extrabold border border-purple-200/60'
                  }`}
              >
                <span className="tracking-tight whitespace-nowrap">Lịch Phân Công</span>
              </button>
              <button
                type="button"
                onClick={() => setView('availability')}
                className={`flex-1 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-black cursor-pointer transition-all flex items-center justify-center gap-1 sm:gap-1.5 active:scale-95 ${view === 'availability'
                  ? 'bg-orange-600 text-white shadow-md font-black scale-[1.01] border border-orange-700'
                  : 'bg-orange-500 text-white font-black hover:bg-orange-600 border border-orange-600 shadow-2xs'
                  }`}
              >
                <span className="tracking-tight whitespace-nowrap">Đăng Ký Làm</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setView('swap');
                  loadMyShiftSwaps();
                  handleMarkSwapsAsRead();
                }}
                className={`flex-1 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-black cursor-pointer transition-all flex items-center justify-center gap-1 sm:gap-1.5 active:scale-95 relative ${view === 'swap'
                  ? 'bg-emerald-600 text-white shadow-md font-black scale-[1.01] border border-emerald-700'
                  : 'bg-emerald-700 text-white font-black hover:bg-emerald-800 border border-emerald-800 shadow-2xs'
                  }`}
              >
                <span className="tracking-tight whitespace-nowrap">Đổi Ca & Báo Giờ</span>
                {hasUnreadApprovedSwap && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full border-2 border-white animate-ping" />
                )}
              </button>
            </div>
          </div>

          {/* THÔNG TIN THU NHẬP CÁ NHÂN (BRAND PURPLE CARD) */}
          {isIncomeExpanded && (
            <div className="bg-white rounded-2xl p-4 border border-purple-200/90 shadow-2xs animate-fade-in space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2 border-b border-purple-100 pb-2.5">
                <h3 className="font-black text-base md:text-lg text-purple-950">Thu Nhập Cá Nhân</h3>
                {/* Bộ chọn tháng */}
                <div className="flex items-center gap-2 bg-purple-50 px-3 py-1 rounded-xl border border-purple-200/80">
                  <button onClick={handlePrevMonth} className="text-purple-800 hover:text-purple-950 font-black text-xs">◀</button>
                  <span className="text-xs sm:text-sm font-black text-purple-900">
                    Tháng {displayMonthStr}
                  </span>
                  <button onClick={handleNextMonth} className="text-purple-800 hover:text-purple-950 font-black text-xs">▶</button>
                </div>
              </div>

              {/* 2 Ô Khoanh Nhỏ Phía Trên (Đã làm & Lương thỏa thuận) */}
              <div className="grid grid-cols-2 gap-2 pt-0.5">
                <div className="p-2 sm:p-2.5 bg-purple-50/70 rounded-xl border border-purple-200/80 text-center">
                  <div className="text-[10px] sm:text-xs text-purple-700 font-bold mb-0.5">
                    Đã làm (tính đến hôm nay)
                  </div>
                  <div className="text-xs sm:text-sm font-extrabold text-purple-900">
                    {monthlyHours} tiếng <span className="font-bold text-purple-700">({monthlyShiftsCount} ca)</span>
                  </div>
                </div>

                <div className="p-2 sm:p-2.5 bg-purple-50/70 rounded-xl border border-purple-200/80 text-center">
                  <div className="text-[10px] sm:text-xs text-purple-700 font-bold mb-0.5">
                    Lương thỏa thuận
                  </div>
                  <div className="text-xs sm:text-sm font-extrabold text-purple-900">
                    {formatCurrency(currentRate)}<span className="text-[10px] font-bold text-purple-600">/giờ</span>
                  </div>
                </div>
              </div>

              {/* Ô Khoanh Giữa (THỰC NHẬN TÍCH LŨY HÔM NAY) — TO NỔI BẬT RỰC RỠ ⚡ */}
              <div className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-br from-emerald-50 via-emerald-100/90 to-teal-50 border-2 border-emerald-400 shadow-md text-center space-y-1">
                <div className="text-xs sm:text-sm text-emerald-900 font-black uppercase tracking-wider">
                  THỰC NHẬN TÍCH LŨY HÔM NAY
                </div>
                <div className="text-2xl sm:text-4xl font-black text-emerald-700 tracking-tight drop-shadow-xs">
                  {formatCurrency(netSalary)}
                </div>
                {(totalBonusAmount > 0 || totalPenaltyAmount > 0) && (
                  <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1 text-[11px] font-bold text-slate-600">
                    <span className="text-purple-900 bg-purple-100/80 px-2 py-0.5 rounded-full">
                      Lương ca: {formatCurrency(monthlySalary)}
                    </span>
                    {totalBonusAmount > 0 && (
                      <span className="text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded-full">
                        +Thưởng: {formatCurrency(totalBonusAmount)}
                      </span>
                    )}
                    {totalPenaltyAmount > 0 && (
                      <span className="text-rose-800 bg-rose-100/80 px-2 py-0.5 rounded-full">
                        -Phạt: {formatCurrency(totalPenaltyAmount)}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Ô Khoanh Dưới Cùng (THƯỞNG & PHẠT LỖI DỰ KIẾN) */}
              <div className={`grid gap-2 ${totalBonusAmount > 0 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {totalBonusAmount > 0 && (
                  <div
                    onClick={() => setShowBonusDetailModal(true)}
                    className="p-2.5 sm:p-3 bg-emerald-50/80 hover:bg-emerald-100/90 rounded-xl border border-emerald-200/90 text-center space-y-0.5 cursor-pointer transition-all active:scale-95 hover:scale-[1.01] hover:shadow-xs group"
                    title="Bấm để xem danh sách chi tiết các khoản thưởng"
                  >
                    <div className="text-[10px] sm:text-xs text-emerald-800 font-black uppercase tracking-wider">
                      Tiền thưởng / Phụ cấp:
                    </div>
                    <div className="text-xs sm:text-sm font-extrabold text-emerald-600">
                      +{formatCurrency(totalBonusAmount)}
                    </div>
                  </div>
                )}

                <div
                  onClick={() => setShowPenaltyDetailModal(true)}
                  className="p-2.5 sm:p-3 bg-rose-50/80 hover:bg-rose-100/90 rounded-xl border border-rose-200/90 text-center space-y-0.5 cursor-pointer transition-all active:scale-95 hover:scale-[1.01] hover:shadow-xs group"
                  title="Bấm để xem danh sách chi tiết các lỗi phạt"
                >
                  <div className="text-[10px] sm:text-xs text-rose-800 font-black uppercase tracking-wider">
                    Tiền phạt lỗi dự kiến:
                  </div>
                  <div className="text-xs sm:text-sm font-extrabold text-rose-600">
                    {totalPenaltyAmount > 0 ? `-${formatCurrency(totalPenaltyAmount)}` : formatCurrency(0)}
                  </div>
                </div>
              </div>

              <section className="space-y-2 border-t border-purple-100 pt-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h4 className="text-sm font-black text-purple-950">
                    📅 Các ca làm tháng {displayMonthStr}
                  </h4>
                  <span className="rounded-full bg-purple-100 px-2.5 py-1 text-[11px] font-black text-purple-800">
                    {monthlyShifts.length} ca làm
                  </span>
                </div>

                {monthlyShifts.length === 0 ? (
                  <div className="rounded-xl border border-purple-200 bg-purple-50/60 p-4 text-center text-xs font-bold text-purple-700">
                    Chưa có ca làm được xếp trong tháng này.
                  </div>
                ) : (
                  <div className="max-h-[258px] overflow-y-auto pr-1 sm:max-h-[420px]">
                    <div className="grid auto-rows-[82px] grid-cols-3 gap-1.5 sm:auto-rows-auto sm:gap-2">
                      {monthlyShifts.map((shift) => {
                        const branchStyle = getBranchColorStyle(shift.branches?.name, shift.branches?.color);
                        const isFutureShift = shift.date > getToday();
                        return (
                          <article
                            key={shift.id || `${shift.date}-${shift.start_time}-${shift.branch_id}`}
                            className="h-full min-w-0 overflow-hidden rounded-xl border border-purple-200 bg-white p-1.5 shadow-2xs sm:h-auto sm:p-2.5"
                          >
                            <div className="flex min-w-0 items-center justify-between gap-1">
                              <span className="shrink-0 rounded-md border border-purple-200 bg-purple-50 px-1 py-0.5 text-[9px] font-black leading-tight text-purple-900 sm:rounded-lg sm:px-2 sm:text-[11px]">
                                {shift.date?.slice(8, 10)}/{shift.date?.slice(5, 7)} {getDayOfWeekLabel(shift.date)}
                              </span>
                              <span
                                className="max-w-[45%] truncate rounded px-1 py-0.5 text-[9px] font-black leading-tight sm:rounded-md sm:px-1.5 sm:text-[10px]"
                                style={branchStyle.badgeStyle}
                                title={shift.branches?.name || 'Chi nhánh'}
                              >
                                {shift.branches?.name || 'Chi nhánh'}
                              </span>
                            </div>
                            <div className="mt-1 grid min-w-0 gap-0.5 text-[9px] font-bold leading-tight text-slate-700 sm:mt-1.5 sm:text-[11px]">
                              <span className="truncate">
                                🕒 {shift.start_time?.slice(0, 5) || '--:--'}–{shift.end_time?.slice(0, 5) || '--:--'}
                              </span>
                              <span className="truncate">{shift.hours} giờ · {isFutureShift ? 'Dự kiến' : 'Tiền ca'}</span>
                              <span className="truncate text-[10px] font-black text-emerald-800 sm:text-xs">
                                {formatCurrency(shift.shiftSalary)}
                              </span>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>

              <section className={`flex items-start gap-3 rounded-2xl border-2 p-3 sm:p-4 ${
                salaryConfirmation ? 'border-emerald-300 bg-emerald-50' : 'border-indigo-200 bg-indigo-50/60'
              }`}>
                <input
                  id="monthly-salary-confirmation"
                  type="checkbox"
                  checked={Boolean(salaryConfirmation)}
                  disabled={loadingSalaryConfirmation || savingSalaryConfirmation || Boolean(salaryConfirmation)}
                  onChange={(event) => {
                    if (event.target.checked) handleConfirmSalary();
                  }}
                  className="mt-1 h-7 w-7 shrink-0 cursor-pointer accent-emerald-600 disabled:cursor-not-allowed"
                  aria-label="Xác nhận đã kiểm tra bảng lương"
                />
                <div className="min-w-0 space-y-2">
                  <label
                    htmlFor="monthly-salary-confirmation"
                    className="cursor-pointer text-xs sm:text-sm font-black leading-relaxed text-indigo-800"
                  >
                    Tôi đã kiểm tra kỹ bảng lương, giờ làm, mức lương và đồng ý với bảng lương tháng {displayMonthStr}.
                  </label>
                  <p className="text-xs font-black text-indigo-800">
                    Ký tên:{' '}
                    {salaryConfirmation ? (
                      <span className="text-rose-600">
                        {salaryConfirmation.employee_name || employee.name}
                        {salaryConfirmation.confirmed_at && (
                          <span className="ml-1 font-bold text-slate-600">
                            · {new Date(salaryConfirmation.confirmed_at).toLocaleString('vi-VN')}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-slate-500">
                        {savingSalaryConfirmation
                          ? 'Đang lưu xác nhận...'
                          : loadingSalaryConfirmation
                            ? 'Đang kiểm tra trạng thái...'
                            : 'Tích vào ô để xác nhận bằng tên của bạn.'}
                      </span>
                    )}
                  </p>
                </div>
              </section>
            </div>
          )}

          {/* SCHEDULE VIEW */}
          {view === 'schedule' && (
            <div className="animate-fade-in space-y-3">
              <WeeklyMatrixBoard employees={employees} highlightEmployeeId={employee.id} readOnly={true} />
            </div>
          )}

          {/* AVAILABILITY VIEW */}
          {view === 'availability' && (
            <div className="animate-fade-in">
              <WeeklyAvailability employee={employee} />
            </div>
          )}

          {/* SHIFT SWAP & TIME CHANGE VIEW (YÊU CẦU CA LÀM & BÁO ĐỔI GIỜ) */}
          {view === 'swap' && (
            <div className="animate-fade-in space-y-4">
              {/* Header Box & Add Button */}
              <div className="bg-white rounded-3xl p-4 sm:p-5 border border-purple-200 shadow-2xs space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <h2 className="text-base sm:text-lg font-black text-purple-950">
                      Yêu Cầu Ca Làm
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSwapModal(true)}
                    className="px-4 py-2 rounded-2xl bg-purple-700 hover:bg-purple-800 text-white text-xs sm:text-sm font-black transition-all cursor-pointer shadow-md active:scale-95 border-0 shrink-0"
                  >
                    + Tạo Yêu Cầu
                  </button>
                </div>

                {/* BỘ LỌC THEO THÁNG */}
                <div className="flex items-center justify-between gap-2 bg-purple-50 px-3 py-2 rounded-2xl border border-purple-200/80">
                  <button
                    type="button"
                    onClick={() => {
                      const [y, m] = swapFilterMonth.split('-').map(Number);
                      const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
                      setSwapFilterMonth(prev);
                    }}
                    className="w-7 h-7 rounded-lg bg-white hover:bg-purple-100 text-purple-800 font-black text-xs flex items-center justify-center border border-purple-200 cursor-pointer transition-all active:scale-90"
                  >
                    ◀
                  </button>
                  <span className="text-xs sm:text-sm font-black text-purple-900">
                    Tháng {swapFilterMonth.split('-')[1]}/{swapFilterMonth.split('-')[0]}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const [y, m] = swapFilterMonth.split('-').map(Number);
                      const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
                      setSwapFilterMonth(next);
                    }}
                    className="w-7 h-7 rounded-lg bg-white hover:bg-purple-100 text-purple-800 font-black text-xs flex items-center justify-center border border-purple-200 cursor-pointer transition-all active:scale-90"
                  >
                    ▶
                  </button>
                </div>
              </div>

              {/* THẺ HIỂN THỊ DANH SÁCH YÊU CẦU */}
              <div className="space-y-3">
                {(() => {
                  const filteredSwaps = shiftSwaps.filter((s) => {
                    if (!s.shift_date) return false;
                    return s.shift_date.startsWith(swapFilterMonth);
                  });

                  if (filteredSwaps.length === 0) {
                    return (
                      <div className="p-8 bg-white rounded-3xl border border-purple-200 text-center text-purple-600 text-xs font-bold space-y-2.5">
                        <p className="font-extrabold text-purple-900 text-sm">
                          Chưa có yêu cầu nào trong tháng {swapFilterMonth.split('-')[1]}/{swapFilterMonth.split('-')[0]}.
                        </p>
                        <button
                          type="button"
                          onClick={() => setShowSwapModal(true)}
                          className="px-5 py-2.5 rounded-2xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-black cursor-pointer border-0 shadow-sm transition-all"
                        >
                          + Tạo Yêu Cầu
                        </button>
                      </div>
                    );
                  }

                  const sortByNewest = (a, b) => {
                    const dateA = new Date(a.shift_date || a.created_at).getTime();
                    const dateB = new Date(b.shift_date || b.created_at).getTime();
                    return dateB - dateA;
                  };

                  const pendingList = filteredSwaps.filter((s) => s.status === 'pending').sort(sortByNewest);
                  const approvedList = filteredSwaps.filter((s) => s.status === 'approved').sort(sortByNewest);
                  const rejectedList = filteredSwaps.filter((s) => s.status === 'rejected').sort(sortByNewest);

                  // Helper function render thẻ Yêu Cầu
                  function renderTicketCard(swap, statusType) {
                    const isTimeChange = swap.request_type === 'time_change';
                    let typeBadgeText = 'ĐỔI CA';
                    let typeBadgeClass = 'bg-purple-700 text-white';

                    if (isTimeChange) {
                      if (swap.time_change_type === 'overtime') {
                        typeBadgeText = `TĂNG CA ${swap.extra_hours ? `(+${swap.extra_hours}h)` : ''}`;
                        typeBadgeClass = 'bg-emerald-700 text-white';
                      } else if (swap.time_change_type === 'early_leave') {
                        typeBadgeText = `VỀ SỚM ${swap.extra_hours ? `(${swap.extra_hours}h)` : ''}`;
                        typeBadgeClass = 'bg-amber-600 text-white';
                      } else if (swap.time_change_type === 'late_arrival') {
                        typeBadgeText = `ĐI TRỄ ${swap.extra_hours ? `(${swap.extra_hours}h)` : ''}`;
                        typeBadgeClass = 'bg-sky-600 text-white';
                      } else {
                        typeBadgeText = `ĐỔI GIỜ ${swap.extra_hours ? `(${swap.extra_hours > 0 ? `+${swap.extra_hours}` : swap.extra_hours}h)` : ''}`;
                        typeBadgeClass = 'bg-purple-800 text-white';
                      }
                    }

                    const cardBg =
                      statusType === 'pending'
                        ? 'bg-amber-50/90 border-2 border-amber-300'
                        : statusType === 'approved'
                        ? 'bg-emerald-50/90 border-2 border-emerald-400'
                        : 'bg-rose-50/90 border-2 border-rose-400';

                    return (
                      <div key={swap.id} className={`p-4 rounded-3xl shadow-2xs space-y-2.5 transition-all ${cardBg}`}>
                        {/* Header của Thẻ */}
                        <div className="flex items-center justify-between gap-2 border-b pb-2 border-black/10 flex-wrap">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase shadow-2xs ${typeBadgeClass}`}>
                              {typeBadgeText}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                                statusType === 'pending'
                                  ? 'bg-amber-200 text-amber-900'
                                  : statusType === 'approved'
                                  ? 'bg-emerald-200 text-emerald-900'
                                  : 'bg-rose-200 text-rose-900'
                              }`}
                            >
                              {statusType === 'pending' ? 'Chờ Duyệt' : statusType === 'approved' ? 'Đã Duyệt' : 'Từ Chối'}
                            </span>
                          </div>
                          <span className="text-xs text-purple-950 font-black bg-white px-2.5 py-0.5 rounded-xl border border-purple-200 shadow-2xs">
                            {formatDateWithDayVN(swap.shift_date)}
                          </span>
                        </div>

                        {/* Nội dung chi tiết */}
                        <div className="space-y-1 text-xs text-purple-950 font-bold">
                          {isTimeChange ? (
                            <>
                              <p><strong>Nhân viên:</strong> <span className="font-black text-purple-950">{swap.requester_name}</span></p>
                              <p><strong>Ca gốc:</strong> <span className="text-purple-700 font-extrabold">{swap.original_time || swap.my_shift_info || 'Không rõ'}</span></p>
                              <p><strong>Thực tế:</strong> <span className="text-emerald-800 font-black">{swap.adjusted_time || swap.target_shift_info || 'Chưa nhập'}</span></p>
                            </>
                          ) : (
                            <>
                              <p><strong>Nhờ đổi:</strong> <span className="font-black text-purple-950">{swap.requester_name}</span> (Ca: <span className="text-purple-700 font-extrabold">{swap.my_shift_info}</span>)</p>
                              <p><strong>Đổi với:</strong> <span className="font-black text-orange-700">{swap.target_employee_name}</span> (Ca: <span className="text-orange-800 font-extrabold">{swap.target_shift_info}</span>)</p>
                            </>
                          )}
                          <p className="text-purple-900 italic pt-1 border-t border-black/5">
                            <strong>Lý do:</strong> &quot;{swap.reason}&quot;
                          </p>

                          {statusType === 'rejected' && swap.rejection_reason && (
                            <div className="p-2.5 bg-rose-100 rounded-2xl border border-rose-300 text-rose-950 text-xs font-black mt-2 space-y-0.5">
                              <p className="text-rose-900 font-black">
                                Lý do từ chối:
                              </p>
                              <p className="text-rose-800 italic">&quot;{swap.rejection_reason}&quot;</p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-5">
                      {/* NHÓM 1: ĐANG CHỜ DUYỆT */}
                      {pendingList.length > 0 && (
                        <div className="space-y-2.5">
                          <h3 className="text-xs sm:text-sm font-black text-amber-950 uppercase tracking-wider bg-amber-100/90 px-3.5 py-1.5 rounded-2xl border border-amber-300 w-fit">
                            Chờ Duyệt ({pendingList.length})
                          </h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {pendingList.map((swap) => renderTicketCard(swap, 'pending'))}
                          </div>
                        </div>
                      )}

                      {/* NHÓM 2: ĐÃ ĐƯỢC PHÊ DUYỆT */}
                      <div className="space-y-2.5">
                        <h3 className="text-xs sm:text-sm font-black text-emerald-950 uppercase tracking-wider bg-emerald-100/90 px-3.5 py-1.5 rounded-2xl border border-emerald-300 w-fit">
                          Đã Duyệt ({approvedList.length})
                        </h3>
                        {approvedList.length === 0 ? (
                          <div className="p-4 bg-white rounded-2xl border border-purple-200 text-center text-purple-600 text-xs font-bold">
                            Chưa có yêu cầu nào được duyệt trong tháng.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {approvedList.map((swap) => renderTicketCard(swap, 'approved'))}
                          </div>
                        )}
                      </div>

                      {/* NHÓM 3: ĐÃ BỊ TỪ CHỐI */}
                      <div className="space-y-2.5">
                        <h3 className="text-xs sm:text-sm font-black text-rose-950 uppercase tracking-wider bg-rose-100/90 px-3.5 py-1.5 rounded-2xl border border-rose-300 w-fit">
                          Bị Từ Chối ({rejectedList.length})
                        </h3>
                        {rejectedList.length === 0 ? (
                          <div className="p-4 bg-white rounded-2xl border border-purple-200 text-center text-purple-600 text-xs font-bold">
                            Không có yêu cầu nào bị từ chối.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {rejectedList.map((swap) => renderTicketCard(swap, 'rejected'))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Modal Đổi Ca 3 Bước */}
              {showSwapModal && (
                <ModalShiftSwap
                  employee={employee}
                  onClose={() => setShowSwapModal(false)}
                  onRefresh={loadMyShiftSwaps}
                />
              )}
            </div>
          )}

          {/* =========================================================================
             POPUP THÔNG BÁO QUAN TRỌNG DÀNH CHO NHÂN VIÊN (TỪ CHỦ QUÁN / ADMIN)
             ========================================================================= */}
          {showNoticeModal && typeof document !== 'undefined' && createPortal(
            <div className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs animate-fade-in">
              <div className="relative max-w-lg w-full bg-white rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 border-2 border-purple-300 animate-scale-in">
                {/* Header Popup */}
                <div className="flex items-center justify-between border-b border-purple-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center text-xl font-black shadow-2xs">
                      🔔
                    </div>
                    <div>
                      <h3 className="font-black text-base sm:text-lg text-purple-950">
                        ALO ALO ALO!!!!!
                      </h3>
                      <p className="text-[11px] text-purple-700 font-extrabold">
                        Thông Báo Hệ Thống Chấm Công
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowNoticeModal(false)}
                    className="w-8 h-8 rounded-full bg-purple-50 text-purple-700 hover:bg-purple-100 flex items-center justify-center border-0 cursor-pointer text-sm font-black"
                    title="Đóng"
                  >
                    ✕
                  </button>
                </div>

                {/* Nội dung Thông báo */}
                <div className="space-y-3">
                  <div className="p-4 rounded-2xl bg-amber-50/90 border border-amber-300/90 text-purple-950 text-xs sm:text-sm font-extrabold whitespace-pre-wrap leading-relaxed shadow-2xs">
                    {noticeText}
                  </div>

                  {/* Nút bấm tác vụ */}
                  <div className="space-y-2 pt-1">
                    <button
                      type="button"
                      onClick={handleSnoozeEmployeeNotice4Hours}
                      className="w-full py-2.5 px-4 rounded-xl font-black text-xs sm:text-sm bg-purple-100 hover:bg-purple-200 text-purple-950 border border-purple-300 cursor-pointer transition-all shadow-2xs flex items-center justify-center gap-2 active:scale-95"
                    >
                      <span>⏱</span> Ẩn thông báo này trong 4 giờ
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowNoticeModal(false)}
                      className="w-full py-2.5 rounded-xl text-xs sm:text-sm font-black bg-purple-700 hover:bg-purple-800 text-white border-0 cursor-pointer shadow-2xs"
                    >
                      Đã Hiểu / Đóng
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )}

          {/* ================= MODAL XEM CHI TIẾT NỘI DUNG LỖI PHẠT ================= */}
          {showPenaltyDetailModal && typeof document !== 'undefined' && createPortal(
            <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fade-in">
              <div className="bg-white rounded-3xl p-5 sm:p-6 max-w-md w-full border border-rose-200 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
                {/* Header Modal */}
                <div className="flex items-center justify-between border-b border-rose-100 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center font-black text-lg">
                      ⚠️
                    </div>
                    <div>
                      <h3 className="font-black text-base text-rose-950">Chi Tiết Tiền Phạt Lỗi Dự Kiến</h3>
                      <p className="text-xs text-purple-700 font-bold">
                        Tháng {displayMonthStr} • {employee.name}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPenaltyDetailModal(false)}
                    className="w-8 h-8 rounded-full bg-rose-50 text-rose-700 hover:bg-rose-100 flex items-center justify-center border-0 cursor-pointer text-sm font-black"
                    title="Đóng"
                  >
                    ✕
                  </button>
                </div>

                {/* Nội dung danh sách các khoản phạt */}
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1 custom-scrollbar">
                  {penaltyList.length === 0 ? (
                    <div className="py-8 text-center space-y-2 bg-emerald-50/60 rounded-2xl border border-emerald-200 p-4">
                      <div className="text-3xl">🎉</div>
                      <p className="text-xs sm:text-sm font-black text-emerald-900">
                        Tuyệt vời! Bạn không có tiền phạt hay lỗi vi phạm nào trong Tháng {displayMonthStr}.
                      </p>
                    </div>
                  ) : (
                    penaltyList.map((item, idx) => (
                      <div
                        key={item.id || idx}
                        className="p-3 bg-rose-50/60 rounded-2xl border border-rose-200/80 flex items-center justify-between gap-3 shadow-2xs"
                      >
                        <div className="space-y-0.5">
                          <div className="text-[11px] font-black text-rose-950 flex items-center gap-1">
                            <span>📅</span> {item.date ? item.date.split('-').reverse().join('/') : 'Trong tháng'}
                          </div>
                          <div className="text-xs font-extrabold text-purple-950 leading-snug">
                            {item.reason || 'Vi phạm quy định / Trừ phạt'}
                          </div>
                        </div>
                        <div className="text-xs sm:text-sm font-black text-rose-600 shrink-0 bg-white px-2.5 py-1 rounded-xl border border-rose-200 shadow-2xs">
                          -{formatCurrency(Math.abs(item.amount || 0))}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Footer Tổng Tiền & Nút Đóng */}
                <div className="pt-2 border-t border-purple-100 flex items-center justify-between gap-2">
                  <div className="text-xs font-black text-purple-950">
                    Tổng tiền phạt: <span className="text-rose-600 font-black text-sm">-{formatCurrency(totalPenaltyAmount)}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPenaltyDetailModal(false)}
                    className="px-5 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-black border-0 cursor-pointer shadow-2xs active:scale-95 transition-all"
                  >
                    ✕ Đóng Màn Hình
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}

          {/* ================= MODAL XEM CHI TIẾT NỘI DUNG THƯỞNG / PHỤ CẤP ================= */}
          {showBonusDetailModal && typeof document !== 'undefined' && createPortal(
            <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fade-in">
              <div className="bg-white rounded-3xl p-5 sm:p-6 max-w-md w-full border border-emerald-200 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
                {/* Header Modal */}
                <div className="flex items-center justify-between border-b border-emerald-100 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center font-black text-lg">
                      🎁
                    </div>
                    <div>
                      <h3 className="font-black text-base text-emerald-950">Chi Tiết Tiền Thưởng & Phụ Cấp</h3>
                      <p className="text-xs text-purple-700 font-bold">
                        Tháng {displayMonthStr} • {employee.name}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowBonusDetailModal(false)}
                    className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-700 hover:bg-emerald-100 flex items-center justify-center border-0 cursor-pointer text-sm font-black"
                    title="Đóng"
                  >
                    ✕
                  </button>
                </div>

                {/* Nội dung danh sách các khoản thưởng */}
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1 custom-scrollbar">
                  {bonusList.length === 0 ? (
                    <div className="py-8 text-center space-y-2 bg-purple-50/60 rounded-2xl border border-purple-200 p-4">
                      <div className="text-3xl">✨</div>
                      <p className="text-xs sm:text-sm font-black text-purple-900">
                        Chưa có khoản thưởng hay phụ cấp nào trong Tháng {displayMonthStr}.
                      </p>
                    </div>
                  ) : (
                    bonusList.map((item, idx) => (
                      <div
                        key={item.id || idx}
                        className="p-3 bg-emerald-50/60 rounded-2xl border border-emerald-200/80 flex items-center justify-between gap-3 shadow-2xs"
                      >
                        <div className="space-y-0.5">
                          <div className="text-[11px] font-black text-emerald-950 flex items-center gap-1">
                            <span>📅</span> {item.date ? item.date.split('-').reverse().join('/') : 'Trong tháng'}
                          </div>
                          <div className="text-xs font-extrabold text-purple-950 leading-snug">
                            {item.reason || 'Khen thưởng / Phụ cấp'}
                          </div>
                        </div>
                        <div className="text-xs sm:text-sm font-black text-emerald-600 shrink-0 bg-white px-2.5 py-1 rounded-xl border border-emerald-200 shadow-2xs">
                          +{formatCurrency(Math.abs(item.amount || 0))}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Footer Tổng Tiền & Nút Đóng */}
                <div className="pt-2 border-t border-purple-100 flex items-center justify-between gap-2">
                  <div className="text-xs font-black text-purple-950">
                    Tổng tiền thưởng: <span className="text-emerald-600 font-black text-sm">+{formatCurrency(totalBonusAmount)}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowBonusDetailModal(false)}
                    className="px-5 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-black border-0 cursor-pointer shadow-2xs active:scale-95 transition-all"
                  >
                    ✕ Đóng Màn Hình
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}
          {/* MODAL ĐẶT BIỆT DANH CHO NHÂN VIÊN */}
          {showNicknameModal && typeof document !== 'undefined' && createPortal(
            <div
              onClick={(e) => {
                if (e.target === e.currentTarget) setShowNicknameModal(false);
              }}
              className="fixed inset-0 z-[99999] bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in"
            >
              <div className="bg-white rounded-3xl max-w-sm w-full p-5 sm:p-6 shadow-2xl border border-purple-200/90 space-y-4 animate-scale-in">
                <div className="flex items-center justify-between border-b border-purple-100 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">🎭</span>
                    <div>
                      <h3 className="text-base sm:text-lg font-black text-purple-950 tracking-tight">
                        Đặt Biệt Danh
                      </h3>
                      <p className="text-[11px] text-purple-700 font-bold">
                        Hiển thị trên Bảng Xếp Lịch Làm Việc
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowNicknameModal(false)}
                    className="w-7 h-7 rounded-full bg-purple-100 text-purple-700 hover:bg-rose-600 hover:text-white border-0 flex items-center justify-center cursor-pointer text-xs font-black transition-all"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleSaveNickname} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-black text-purple-950 uppercase mb-1">
                      Tên Thật Của Bạn
                    </label>
                    <div className="px-3 py-2 bg-slate-100 rounded-xl text-xs sm:text-sm font-black text-slate-700 border border-slate-200">
                      {employee.name} <span className="text-[10px] text-slate-500 font-bold block mt-0.5">(Tên gốc dùng để tính lương & quản lý)</span>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-black text-purple-950 uppercase">
                        Biệt Danh Muốn Gọi (2 - 12 ký tự)
                      </label>
                      <span className={`text-[10px] font-black ${nicknameInput.trim().length > 12 ? 'text-rose-600' : 'text-purple-600'}`}>
                        {nicknameInput.trim().length}/12
                      </span>
                    </div>
                    <input
                      type="text"
                      maxLength={12}
                      value={nicknameInput}
                      onChange={(e) => setNicknameInput(e.target.value)}
                      placeholder="VD: Bé Heo, Cún, Mèo, Sam, Bin..."
                      className="w-full px-3 py-2 bg-white border border-purple-200 rounded-xl text-purple-950 text-xs sm:text-sm font-black outline-none focus:border-purple-600 placeholder:text-purple-400 shadow-2xs"
                      autoFocus
                    />
                    <span className="text-[10px] text-purple-600 font-bold block mt-1">
                      ✨ Yêu cầu: Tên lịch sự, không tục tĩu, tối đa 12 ký tự để vừa đẹp ô bảng lịch.
                    </span>
                  </div>

                  {/* Thông báo quy định thời gian khóa 2 tháng */}
                  <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-[11px] font-bold space-y-1">
                    <div className="font-black text-amber-900 flex items-center gap-1">
                      <span>⏳</span>
                      <span>Quy định thời gian đổi biệt danh:</span>
                    </div>
                    <p className="text-amber-800 leading-snug">
                      Sau khi bấm <strong>&quot;Lưu Biệt Danh&quot;</strong>, bạn sẽ <strong>không thể đổi lại trong vòng 2 tháng (60 ngày)</strong> tiếp theo. Hãy chọn biệt danh thật ưng ý nhé!
                    </p>
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    {employee.nickname && (
                      <button
                        type="button"
                        onClick={() => {
                          setNicknameInput('');
                          updateEmployeeNickname(employee.id, '').then(() => {
                            setEmployee((prev) => ({ ...prev, nickname: '' }));
                            setEmployees((prev) =>
                              prev.map((emp) => (emp.id === employee.id ? { ...emp, nickname: '' } : emp))
                            );
                            setShowNicknameModal(false);
                            toast.success('Đã bỏ biệt danh', 'Đã quay lại hiển thị tên thật');
                          });
                        }}
                        className="py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-700 font-black text-xs border border-slate-200 cursor-pointer transition-all active:scale-95"
                      >
                        Xóa
                      </button>
                    )}
                    <button
                      type="submit"
                      disabled={savingNickname}
                      className="flex-1 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-black text-xs sm:text-sm border-0 shadow-md cursor-pointer transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                      <span>{savingNickname ? '⏳ Đang lưu...' : '✓ Lưu Biệt Danh'}</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body
          )}
        </div>
      </main>
      <CopyrightFooter />
    </div>
  );
}

export default function NhanVienPage() {
  return (
    <ToastProvider>
      <EmployeeContent />
    </ToastProvider>
  );
}
