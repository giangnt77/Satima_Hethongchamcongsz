'use client';

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { getEmployees, getScheduleByDateRange, createShiftSwap } from '@/lib/supabase';
import { getToday, formatDateFull, formatDateWithDayVN, calculateHours, sendShiftSwapEmailNotification, getInitials } from '@/lib/utils';
import { useToast } from '@/components/Toast';
import VnDatePicker from './VnDatePicker';

export default function ModalShiftSwap({ employee, onClose, onRefresh }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const toast = useToast();

  // Mode: 'time_change' (Báo làm thêm / về sớm / đi trễ) | 'swap' (Đổi ca / nhờ làm hộ)
  const [requestType, setRequestType] = useState('time_change');
  const [step, setStep] = useState(1); // 1: Cấu hình thông tin, 2: Nhập lý do & Xác nhận gửi
  const [allEmployees, setAllEmployees] = useState([]);
  const [daySchedules, setDaySchedules] = useState([]);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Chung: Ngày diễn ra
  const [shiftDate, setShiftDate] = useState(getToday());
  const [reason, setReason] = useState('');

  // ----------------------------------------------------
  // STATE CHO: ⏱️ BÁO THAY ĐỔI GIỜ LÀM (Làm thêm / Về sớm)
  // ----------------------------------------------------
  // 'overtime': Làm thêm giờ (+h), 'early_leave': Về sớm (-h), 'late_arrival': Đi trễ (-h), 'custom': Giờ tùy chỉnh
  const [timeChangeType, setTimeChangeType] = useState('overtime');
  const [detectedShift, setDetectedShift] = useState(null); // Ca gốc trong ngày
  const [origStartTime, setOrigStartTime] = useState('13:00');
  const [origEndTime, setOrigEndTime] = useState('18:00');
  const [origBranch, setOrigBranch] = useState('56');
  const [actualStartTime, setActualStartTime] = useState('13:00');
  const [actualEndTime, setActualEndTime] = useState('20:00');

  // ----------------------------------------------------
  // STATE CHO: 🔄 ĐỔI CA / NHỜ LÀM HỘ
  // ----------------------------------------------------
  const [myShiftInfo, setMyShiftInfo] = useState('');
  const [targetEmpId, setTargetEmpId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Tải danh sách nhân viên ban đầu
  useEffect(() => {
    loadInitialData();
  }, []);

  async function loadInitialData() {
    try {
      const all = await getEmployees();
      const staffOnly = all.filter((e) => e.id !== employee.id && e.role !== 'owner' && e.role !== 'manager');
      setAllEmployees(staffOnly);
    } catch (e) {
      console.error(e);
    }
  }

  // Khi thay đổi Ngày chọn, tự động tải Lịch phân công trong ngày đó
  useEffect(() => {
    if (shiftDate) {
      loadScheduleForDate(shiftDate);
    }
  }, [shiftDate]);

  async function loadScheduleForDate(dateStr) {
    if (!dateStr) return;
    setLoadingSchedule(true);
    try {
      const cleanDate = String(dateStr).trim();
      const sched = await getScheduleByDateRange(cleanDate, cleanDate);
      setDaySchedules(sched || []);

      // Tìm ca làm của chính nhân viên trong ngày hôm đó
      const myScheds = (sched || []).filter(
        (s) =>
          String(s.employee_id || '').trim() === String(employee.id || '').trim() ||
          (s.employees?.name && employee.name && s.employees.name.trim().toLowerCase() === employee.name.trim().toLowerCase())
      );

      if (myScheds.length > 0) {
        const first = myScheds[0];
        const bName = first.branches?.name || first.branch_name || '56';
        const sTime = first.start_time ? String(first.start_time).slice(0, 5) : '13:00';
        const eTime = first.end_time ? String(first.end_time).slice(0, 5) : '18:00';
        
        setDetectedShift(first);
        setOrigStartTime(sTime);
        setOrigEndTime(eTime);
        setOrigBranch(bName);

        // Khởi tạo giờ thực tế ban đầu tùy theo timeChangeType
        applyTimeChangeDefaults(sTime, eTime, timeChangeType);
        setMyShiftInfo(`[CN ${bName}] ${sTime} - ${eTime}`);
      } else {
        // Không có ca làm trong ngày này (Đang nghỉ)
        setDetectedShift(null);
        setOrigStartTime('');
        setOrigEndTime('');
        setOrigBranch('');
        setActualStartTime('13:00');
        setActualEndTime('18:00');
        setTimeChangeType('overtime');
        setMyShiftInfo('Không có ca làm (Ngày nghỉ)');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingSchedule(false);
    }
  }

  function applyTimeChangeDefaults(sTime, eTime, type) {
    if (!sTime || !eTime) {
      setActualStartTime('13:00');
      setActualEndTime('18:00');
      return;
    }

    setActualStartTime(sTime);
    if (type === 'overtime') {
      // Mặc định tăng ca thêm 2 tiếng
      const [eh, em] = eTime.split(':').map(Number);
      const newEh = Math.min(23, eh + 2);
      setActualEndTime(`${String(newEh).padStart(2, '0')}:${String(em).padStart(2, '0')}`);
    } else if (type === 'early_leave') {
      // Mặc định về sớm 1 tiếng
      const [eh, em] = eTime.split(':').map(Number);
      const newEh = Math.max(0, eh - 1);
      setActualEndTime(`${String(newEh).padStart(2, '0')}:${String(em).padStart(2, '0')}`);
    } else if (type === 'late_arrival') {
      // Mặc định đi trễ 1 tiếng
      const [sh, sm] = sTime.split(':').map(Number);
      const newSh = Math.min(23, sh + 1);
      setActualStartTime(`${String(newSh).padStart(2, '0')}:${String(sm).padStart(2, '0')}`);
      setActualEndTime(eTime);
    } else {
      setActualEndTime(eTime);
    }
  }

  // Khi người dùng chuyển đổi Loại Báo Giờ (Overtime / Early leave / Late arrival)
  function handleSelectTimeChangeType(newType) {
    setTimeChangeType(newType);
    applyTimeChangeDefaults(origStartTime, origEndTime, newType);
  }

  // Tính số tiếng ca gốc và ca thực tế
  const hoursCalculation = useMemo(() => {
    const origH = (origStartTime && origEndTime) ? calculateHours(origStartTime, origEndTime) : 0;
    const actualH = (actualStartTime && actualEndTime) ? calculateHours(actualStartTime, actualEndTime) : 0;
    const diff = Math.round((actualH - origH) * 100) / 100;
    return {
      origHours: origH,
      actualHours: actualH,
      diffHours: diff,
      isIncrease: diff > 0,
      isDecrease: diff < 0,
    };
  }, [origStartTime, origEndTime, actualStartTime, actualEndTime]);

  // ----------------------------------------------------
  // LOGIC LỌC ĐỒNG NGHIỆP CHO ĐỔI CA
  // ----------------------------------------------------
  const availableEmployees = useMemo(() => {
    if (!allEmployees || allEmployees.length === 0) return [];

    let myStart = 16 * 60;
    let myEnd = 22 * 60;
    if (myShiftInfo.includes('-')) {
      const match = myShiftInfo.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
      if (match) {
        const [sh, sm] = match[1].split(':').map(Number);
        const [eh, em] = match[2].split(':').map(Number);
        myStart = sh * 60 + sm;
        myEnd = eh * 60 + em;
      }
    }

    return allEmployees
      .filter((emp) => {
        if (emp.role === 'owner' || emp.role === 'manager') return false;
        const nLower = (emp.name || '').toLowerCase();
        if (nLower.includes('chủ quán') || nLower.includes('quản lý')) return false;

        const targetDate = shiftDate ? String(shiftDate).slice(0, 10) : '';
        // 1. Kiểm tra ngày bắt đầu vào làm
        if (targetDate && emp.created_at) {
          const empStartDate = emp.created_at.slice(0, 10);
          if (targetDate < empStartDate) return false;
        }
        // 2. Kiểm tra ngày nghỉ việc
        if (emp.status === 'off' || emp.is_active === false) {
          const resignedDate = emp.resigned_at || emp.off_date || (emp.created_at ? emp.created_at.slice(0, 10) : '1970-01-01');
          if (targetDate >= resignedDate) return false;
        }
        return true;
      })
      .map((emp) => {
        const empScheds = daySchedules.filter(
          (s) =>
            String(s.employee_id || '').trim() === String(emp.id || '').trim() ||
            (s.employees?.name && emp.name && s.employees.name.trim().toLowerCase() === emp.name.trim().toLowerCase())
        );

        let isOverlap = false;
        let currentShiftLabel = '🟢 Rảnh (Chưa có ca)';
        let statusPriority = 1;

        if (empScheds.length > 0) {
          const shiftInfoList = empScheds.map((s) => {
            const bName = s.branches?.name ? `CN ${s.branches.name}` : '';
            const sTime = s.start_time ? String(s.start_time).slice(0, 5) : '';
            const eTime = s.end_time ? String(s.end_time).slice(0, 5) : '';
            const timeStr = sTime && eTime ? `${sTime} - ${eTime}` : 'Có ca';

            if (sTime && eTime) {
              const [sh, sm] = sTime.split(':').map(Number);
              const [eh, em] = eTime.split(':').map(Number);
              const eStart = sh * 60 + sm;
              const eEnd = eh * 60 + em;
              if (eStart < myEnd && eEnd > myStart) isOverlap = true;
            }
            return bName ? `[${bName}] ${timeStr}` : timeStr;
          });

          const formattedShifts = shiftInfoList.join(', ');
          if (!isOverlap) {
            statusPriority = 2;
            currentShiftLabel = `🟡 Đã có ca ${formattedShifts}`;
          } else {
            statusPriority = 3;
            currentShiftLabel = `🟠 Trùng ca ${formattedShifts} (Gộp ca)`;
          }
        }

        let empShiftDetail = '🟢 Chưa có ca (Sẽ nhận làm giúp)';
        if (empScheds.length > 0) {
          const firstS = empScheds[0];
          const bName = firstS.branches?.name ? `CN ${firstS.branches.name}` : '';
          const sTime = firstS.start_time ? String(firstS.start_time).slice(0, 5) : '09:00';
          const eTime = firstS.end_time ? String(firstS.end_time).slice(0, 5) : '12:00';
          empShiftDetail = bName ? `[${bName}] ${sTime} - ${eTime}` : `${sTime} - ${eTime}`;
        }

        return {
          ...emp,
          statusPriority,
          shiftSummary: currentShiftLabel,
          targetShiftInfo: empShiftDetail,
        };
      })
      .sort((a, b) => {
        if (a.statusPriority !== b.statusPriority) return a.statusPriority - b.statusPriority;
        return a.name.localeCompare(b.name);
      });
  }, [allEmployees, daySchedules, myShiftInfo]);

  const filteredEmployees = useMemo(() => {
    if (!searchTerm.trim()) return availableEmployees;
    const kw = searchTerm.trim().toLowerCase();
    return availableEmployees.filter((emp) => (emp.name || '').toLowerCase().includes(kw));
  }, [availableEmployees, searchTerm]);

  useEffect(() => {
    if (availableEmployees.length > 0 && !targetEmpId) {
      setTargetEmpId(availableEmployees[0].id);
    }
  }, [availableEmployees]);

  const selectedTargetEmp = useMemo(() => {
    return availableEmployees.find((e) => e.id === targetEmpId) || null;
  }, [availableEmployees, targetEmpId]);

  function handleNextToStep2() {
    if (requestType === 'swap' && !targetEmpId) {
      toast.warning('Chưa chọn người đổi', 'Vui lòng chọn một bạn để đổi ca!');
      return;
    }
    setStep(2);
  }

  async function handleSubmitTicket() {
    if (!reason.trim()) {
      toast.warning('Chưa nhập lý do', 'Vui lòng nhập lý do!');
      return;
    }

    // ---------------------------------------------------------
    // CẢNH BÁO 2 LỚP: XÁC MINH ĐÃ XIN PHÉP CHỦ QUÁN TRƯỚC KHI GỬI
    // ---------------------------------------------------------
    const actionLabel = requestType === 'time_change' ? 'báo giờ làm' : 'đổi ca';

    // Popup Xác Nhận Lớp 1
    const confirm1 = window.confirm(
      `Thí chủ đã xin phép Owner chưa?\n\nVui lòng xác nhận bạn đã trực tiếp trao đổi và xin phép Owner về yêu cầu ${actionLabel} này!`
    );
    if (!confirm1) {
      toast.info('Chưa gửi yêu cầu', 'Bạn cần xin phép Owner trước khi gửi yêu cầu!');
      return;
    }

    // Popup Xác Nhận Lớp 2
    const confirm2 = window.confirm(
      `Xác nhận lần 2: Thí chủ đã xin phép Owner thật chưa?\n\n* Lưu ý nghiêm ngặt: Mọi trường hợp tự ý gửi yêu cầu khi chưa có sự đồng ý của Owner sẽ bị xử lý kỷ luật theo nội quy của quán!`
    );
    if (!confirm2) {
      toast.warning('Đã hủy', 'Yêu cầu chưa được gửi do chưa có sự đồng ý của Owner!');
      return;
    }

    setSubmitting(true);

    let ticketPayload = {};

    if (requestType === 'time_change') {
      const origTimeStr = detectedShift
        ? `[CN ${origBranch}] ${origStartTime} - ${origEndTime} (${hoursCalculation.origHours}h)`
        : 'Không có ca (Làm thêm ngày nghỉ)';
      const adjustedTimeStr = `${origBranch ? `[CN ${origBranch}] ` : ''}${actualStartTime} - ${actualEndTime} (${hoursCalculation.actualHours}h)`;
      
      ticketPayload = {
        requester_id: employee.id,
        requester_name: employee.name,
        target_employee_id: employee.id,
        target_employee_name: 'Quản Lý Quán',
        shift_date: shiftDate,
        request_type: 'time_change',
        time_change_type: timeChangeType,
        original_time: origTimeStr,
        adjusted_time: adjustedTimeStr,
        extra_hours: hoursCalculation.diffHours,
        my_shift_info: origTimeStr,
        target_shift_info: adjustedTimeStr,
        branch_name: origBranch || '56',
        reason: reason.trim(),
      };
    } else {
      ticketPayload = {
        requester_id: employee.id,
        requester_name: employee.name,
        target_employee_id: selectedTargetEmp?.id || employee.id,
        target_employee_name: selectedTargetEmp?.name || 'Đồng nghiệp',
        shift_date: shiftDate,
        request_type: 'swap',
        time_change_type: 'swap',
        original_time: myShiftInfo,
        adjusted_time: selectedTargetEmp?.targetShiftInfo || '',
        my_shift_info: myShiftInfo,
        target_shift_info: selectedTargetEmp?.targetShiftInfo || '',
        reason: reason.trim(),
      };
    }

    try {
      const savedSwap = await createShiftSwap(ticketPayload);
      const notification = await sendShiftSwapEmailNotification(savedSwap);
      if (!notification?.ok) {
        toast.warning(
          'Đã lưu yêu cầu, email chưa gửi được',
          notification?.error || 'Kiểm tra địa chỉ email nhận trong Cấu Hình Email.'
        );
      }

      toast.success(
        'Đã Gửi Thành Công',
        requestType === 'time_change'
          ? 'Đã lưu báo giờ làm cho Quản Lý!'
          : 'Đã lưu yêu cầu đổi ca cho Quản Lý!'
      );
      if (onRefresh) onRefresh();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Lỗi', 'Không thể gửi yêu cầu. Vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-fade-in overflow-y-auto">
      <div className="relative max-w-lg w-full bg-white rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 border-2 border-purple-300 animate-scale-in my-auto max-h-[92vh] flex flex-col">
        {/* Header Modal */}
        <div className="flex items-center justify-between border-b border-purple-100 pb-3 shrink-0">
          <div>
            <h3 className="font-black text-base sm:text-lg text-purple-950">
              {requestType === 'time_change' ? 'Báo Giờ Làm' : 'Đổi Ca'}
            </h3>
            <p className="text-xs text-purple-700 font-extrabold">
              Bước {step}/2: {step === 1 ? 'Chọn Giờ' : 'Nhập Lý Do'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-purple-100 text-purple-900 font-black text-sm flex items-center justify-center hover:bg-purple-200 transition-all border-0 cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* NỘI DUNG FORM SCROLLABLE */}
        <div className="overflow-y-auto pr-1 space-y-4 flex-1 custom-scrollbar">
          {step === 1 ? (
            <div className="space-y-4 animate-fade-in">
              {/* CHỌN NHÓM YÊU CẦU */}
              <div>
                <label className="block text-xs font-black text-purple-950 uppercase mb-1.5">
                  1. Bạn muốn làm gì:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRequestType('time_change')}
                    className={`p-3 rounded-2xl border-2 text-left cursor-pointer transition-all flex flex-col justify-between gap-1 shadow-2xs ${
                      requestType === 'time_change'
                        ? 'bg-purple-50 border-purple-700 text-purple-950 ring-2 ring-purple-400/50'
                        : 'bg-white border-purple-200 text-slate-700 hover:bg-purple-50/50'
                    }`}
                  >
                    <div className="font-black text-xs sm:text-sm">
                      Báo Giờ Làm
                    </div>
                    <p className="text-[10.5px] font-bold text-purple-700/80 leading-tight">
                      Tăng ca, về sớm, đi trễ
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRequestType('swap')}
                    className={`p-3 rounded-2xl border-2 text-left cursor-pointer transition-all flex flex-col justify-between gap-1 shadow-2xs ${
                      requestType === 'swap'
                        ? 'bg-purple-50 border-purple-700 text-purple-950 ring-2 ring-purple-400/50'
                        : 'bg-white border-purple-200 text-slate-700 hover:bg-purple-50/50'
                    }`}
                  >
                    <div className="font-black text-xs sm:text-sm">
                      Đổi Ca
                    </div>
                    <p className="text-[10.5px] font-bold text-purple-700/80 leading-tight">
                      Đổi ca với người khác
                    </p>
                  </button>
                </div>
              </div>

              {/* Ô CHỌN NGÀY LÀM VIỆC */}
              <div>
                <label className="block text-xs font-black text-purple-950 uppercase mb-1">
                  2. Chọn Ngày:
                </label>
                <VnDatePicker value={shiftDate} onChange={setShiftDate} />
              </div>

              {/* KHU VỰC CHI TIẾT TÙY THEO LOẠI YÊU CẦU */}
              {requestType === 'time_change' ? (
                <div className="space-y-3.5 pt-1">
                  {/* Thẻ Ca Gốc / Thông Báo Ngày Nghỉ */}
                  {detectedShift ? (
                    <div className="p-3 bg-purple-50 border border-purple-200 rounded-2xl space-y-1">
                      <div className="flex items-center justify-between text-xs font-black text-purple-950">
                        <span>Ca gốc của bạn:</span>
                        <span className="px-2 py-0.5 rounded-full bg-purple-200 text-purple-900 text-[10px] font-black">
                          CN {origBranch}
                        </span>
                      </div>
                      <div className="text-sm font-black text-purple-800">
                        {origStartTime} — {origEndTime}{' '}
                        <span className="text-xs font-extrabold text-purple-600">({hoursCalculation.origHours}h)</span>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl space-y-1">
                      <div className="flex items-center justify-between text-xs font-black text-amber-950">
                        <span>Lịch làm việc:</span>
                        <span className="px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 text-[10px] font-black">
                          Không có ca
                        </span>
                      </div>
                      <p className="text-xs font-bold text-amber-900">
                        Bạn không có lịch làm trong ngày này. Giờ làm thực tế sẽ được tính là tăng ca (làm thêm ngày nghỉ).
                      </p>
                    </div>
                  )}

                  {/* 4 Nút Chọn Nhanh Loại Thay Đổi */}
                  <div>
                    <label className="block text-xs font-black text-purple-950 uppercase mb-1.5">
                      3. Thay Đổi Giờ:
                    </label>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => handleSelectTimeChangeType('overtime')}
                        className={`p-2.5 rounded-xl font-black border transition-all text-left flex flex-col justify-center cursor-pointer shadow-2xs ${
                          timeChangeType === 'overtime'
                            ? 'bg-emerald-600 text-white border-emerald-700'
                            : 'bg-emerald-50 text-emerald-950 border-emerald-200 hover:bg-emerald-100'
                        }`}
                      >
                        <div>Tăng ca</div>
                        <div className={`text-[10px] font-bold ${timeChangeType === 'overtime' ? 'text-emerald-100' : 'text-emerald-700'}`}>
                          {detectedShift ? 'Làm thêm giờ' : 'Làm ngày nghỉ'}
                        </div>
                      </button>

                      <button
                        type="button"
                        disabled={!detectedShift}
                        onClick={() => handleSelectTimeChangeType('early_leave')}
                        className={`p-2.5 rounded-xl font-black border transition-all text-left flex flex-col justify-center shadow-2xs ${
                          !detectedShift
                            ? 'opacity-40 bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                            : timeChangeType === 'early_leave'
                            ? 'bg-amber-600 text-white border-amber-700 cursor-pointer'
                            : 'bg-amber-50 text-amber-950 border-amber-200 hover:bg-amber-100 cursor-pointer'
                        }`}
                      >
                        <div>Về sớm</div>
                        <div className={`text-[10px] font-bold ${timeChangeType === 'early_leave' ? 'text-amber-100' : 'text-amber-700'}`}>Nghỉ sớm hơn</div>
                      </button>

                      <button
                        type="button"
                        disabled={!detectedShift}
                        onClick={() => handleSelectTimeChangeType('late_arrival')}
                        className={`p-2.5 rounded-xl font-black border transition-all text-left flex flex-col justify-center shadow-2xs ${
                          !detectedShift
                            ? 'opacity-40 bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                            : timeChangeType === 'late_arrival'
                            ? 'bg-sky-600 text-white border-sky-700 cursor-pointer'
                            : 'bg-sky-50 text-sky-950 border-sky-200 hover:bg-sky-100 cursor-pointer'
                        }`}
                      >
                        <div>Đi trễ</div>
                        <div className={`text-[10px] font-bold ${timeChangeType === 'late_arrival' ? 'text-sky-100' : 'text-sky-700'}`}>Vào trễ hơn</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSelectTimeChangeType('custom')}
                        className={`p-2.5 rounded-xl font-black border transition-all text-left flex flex-col justify-center cursor-pointer shadow-2xs ${
                          timeChangeType === 'custom'
                            ? 'bg-purple-700 text-white border-purple-800'
                            : 'bg-purple-50 text-purple-950 border-purple-200 hover:bg-purple-100'
                        }`}
                      >
                        <div>Tự chọn</div>
                        <div className={`text-[10px] font-bold ${timeChangeType === 'custom' ? 'text-purple-100' : 'text-purple-700'}`}>Nhập giờ khác</div>
                      </button>
                    </div>
                  </div>

                  {/* Nhập Khung Giờ Thực Tế */}
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                    <label className="block text-xs font-black text-purple-950 uppercase">
                      4. Giờ Thực Tế:
                    </label>
                    <div className="grid grid-cols-2 gap-3 items-center">
                      <div>
                        <span className="block text-[11px] font-bold text-slate-600 mb-1">Giờ Vào:</span>
                        <input
                          type="time"
                          value={actualStartTime}
                          onChange={(e) => setActualStartTime(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl bg-white border border-purple-300 font-black text-purple-950 text-sm outline-none focus:border-purple-600 shadow-2xs"
                        />
                      </div>
                      <div>
                        <span className="block text-[11px] font-bold text-slate-600 mb-1">Giờ Ra:</span>
                        <input
                          type="time"
                          value={actualEndTime}
                          onChange={(e) => setActualEndTime(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl bg-white border border-purple-300 font-black text-purple-950 text-sm outline-none focus:border-purple-600 shadow-2xs"
                        />
                      </div>
                    </div>

                    {/* Thống kê chênh lệch giờ */}
                    <div className="mt-2 pt-2 border-t border-slate-200 flex items-center justify-between text-xs font-black">
                      <span className="text-slate-700">Tổng giờ: <strong>{hoursCalculation.actualHours}h</strong></span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full font-black text-xs ${
                          hoursCalculation.isIncrease
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : hoursCalculation.isDecrease
                            ? 'bg-amber-100 text-amber-900 border border-amber-300'
                            : 'bg-slate-200 text-slate-800'
                        }`}
                      >
                        {hoursCalculation.isIncrease
                          ? `Tăng ca: +${hoursCalculation.diffHours}h`
                          : hoursCalculation.isDecrease
                          ? `Chênh lệch: ${hoursCalculation.diffHours}h`
                          : 'Giữ nguyên'}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                /* ĐỔI CA */
                <div className="space-y-3 pt-1">
                  <div className="p-3 bg-purple-50 border border-purple-200 rounded-2xl text-xs space-y-1">
                    <span className="font-black text-purple-950 block">Ca của bạn ({formatDateWithDayVN(shiftDate)}):</span>
                    <span className="font-black text-purple-700 text-sm">{myShiftInfo}</span>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-black text-purple-950 uppercase">
                        3. Chọn Người Đổi Cùng:
                      </label>
                      <span className="text-[10px] text-purple-700 font-bold">
                        ({filteredEmployees.length} bạn rảnh)
                      </span>
                    </div>

                    {/* Ô tìm kiếm */}
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Tìm tên..."
                      className="w-full px-3 py-1.5 mb-2 bg-purple-50/70 border border-purple-200 rounded-xl text-purple-950 text-xs font-bold outline-none focus:border-purple-500"
                    />

                    {/* Danh sách đồng nghiệp */}
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                      {loadingSchedule ? (
                        <div className="py-4 text-center text-xs text-purple-700 font-bold animate-pulse">
                          Đang tải...
                        </div>
                      ) : filteredEmployees.length === 0 ? (
                        <div className="p-3 rounded-xl bg-amber-50 text-amber-900 text-xs font-bold text-center">
                          Không tìm thấy bạn nào phù hợp.
                        </div>
                      ) : (
                        filteredEmployees.map((emp) => {
                          const isSelected = targetEmpId === emp.id;
                          return (
                            <div
                              key={emp.id}
                              onClick={() => setTargetEmpId(emp.id)}
                              className={`p-2.5 rounded-2xl border cursor-pointer transition-all flex items-center justify-between gap-2 ${
                                isSelected
                                  ? 'bg-purple-900 text-white border-purple-800 shadow-md ring-2 ring-purple-400/50'
                                  : 'bg-white text-purple-950 border-purple-200 hover:bg-purple-50'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <div
                                  className={`w-7 h-7 rounded-xl flex items-center justify-center font-black text-xs shrink-0 shadow-2xs ${
                                    isSelected ? 'bg-amber-400 text-purple-950' : 'bg-purple-700 text-white'
                                  }`}
                                >
                                  {getInitials(emp.name)}
                                </div>
                                <div className="min-w-0 truncate">
                                  <div className="font-black text-xs truncate">
                                    {emp.nickname ? `${emp.nickname} (${emp.name})` : emp.name}
                                  </div>
                                  <div className={`text-[10px] font-bold truncate ${isSelected ? 'text-purple-200' : 'text-purple-700'}`}>
                                    {emp.shiftSummary}
                                  </div>
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                {isSelected ? (
                                  <span className="text-amber-300 font-black text-sm">✓</span>
                                ) : (
                                  <span className="text-purple-300 text-xs">○</span>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* BƯỚC 2: NHẬP LÝ DO & XÁC NHẬN */
            <div className="space-y-3.5 animate-fade-in">
              {/* Thẻ Review Tóm Tắt */}
              <div className="p-4 rounded-3xl bg-purple-950 text-white space-y-2.5 shadow-md border border-purple-800">
                <div className="flex items-center justify-between border-b border-purple-800/80 pb-2">
                  <span className="text-xs font-black text-amber-300 uppercase tracking-wider">
                    XÁC NHẬN YÊU CẦU
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-purple-800 text-purple-200 text-[10px] font-black">
                    {formatDateWithDayVN(shiftDate)}
                  </span>
                </div>

                <div className="text-xs space-y-1.5">
                  <div>
                    <span className="text-purple-300">Nhân viên:</span> <strong>{employee.name}</strong>
                  </div>

                  {requestType === 'time_change' ? (
                    <>
                      <div>
                        <span className="text-purple-300">Loại:</span>{' '}
                        <strong className="text-amber-300">
                          {timeChangeType === 'overtime'
                            ? (detectedShift ? 'Tăng ca' : 'Làm thêm ngày nghỉ')
                            : timeChangeType === 'early_leave'
                            ? 'Về sớm'
                            : timeChangeType === 'late_arrival'
                            ? 'Đi trễ'
                            : 'Tự chọn'}
                        </strong>
                      </div>
                      <div>
                        <span className="text-purple-300">Ca gốc:</span>{' '}
                        <span>
                          {detectedShift
                            ? `[CN ${origBranch}] ${origStartTime} - ${origEndTime} (${hoursCalculation.origHours}h)`
                            : 'Không có ca (Làm thêm ngày nghỉ)'}
                        </span>
                      </div>
                      <div>
                        <span className="text-purple-300">Thực tế:</span>{' '}
                        <strong className="text-emerald-300">
                          {origBranch ? `[CN ${origBranch}] ` : ''}{actualStartTime} - {actualEndTime} ({hoursCalculation.actualHours}h)
                        </strong>
                      </div>
                      <div className="pt-1">
                        <span className="text-purple-300">Chênh lệch:</span>{' '}
                        <span className="font-black px-2 py-0.5 rounded-md bg-purple-800 text-amber-300">
                          {hoursCalculation.diffHours > 0 ? `+${hoursCalculation.diffHours}h` : `${hoursCalculation.diffHours}h`}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <span className="text-purple-300">Đổi với:</span>{' '}
                        <strong className="text-amber-300">{selectedTargetEmp?.name}</strong>
                      </div>
                      <div>
                        <span className="text-purple-300">Ca của bạn:</span> {myShiftInfo}
                      </div>
                      <div>
                        <span className="text-purple-300">Ca của bạn đổi:</span> {selectedTargetEmp?.targetShiftInfo}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Cảnh Báo Quy Định: Xác Minh Đã Xin Phép Owner */}
              <div className="p-3 bg-amber-50 border-2 border-amber-300 rounded-2xl flex items-start gap-2.5 text-xs text-amber-950 font-bold animate-fade-in shadow-2xs">
                <span className="text-base leading-none">⚠️</span>
                <div className="space-y-0.5">
                  <p className="font-black text-amber-950 uppercase text-[11px] tracking-wide">
                    Quy định bắt buộc: Phải xin phép Owner
                  </p>
                  <p className="text-amber-900 font-extrabold text-[11px] leading-relaxed">
                    Bạn bắt buộc phải trực tiếp xin phép và được sự đồng ý của <strong>Owner</strong> trước khi gửi. Hệ thống sẽ kích hoạt xác minh 2 lớp trước khi gửi yêu cầu!
                  </p>
                </div>
              </div>

              {/* Ô Nhập Lý Do */}
              <div>
                <label className="block text-xs font-black text-purple-950 uppercase mb-1">
                  Lý do <span className="text-rose-500">*</span>:
                </label>
                <textarea
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={
                    requestType === 'time_change'
                      ? 'VD: Quán đông khách ở lại phụ thêm giờ, hoặc xin về sớm...'
                      : 'VD: Có việc bận nên nhờ bạn đổi ca giúp...'
                  }
                  className="w-full px-3.5 py-2.5 bg-purple-50/60 border-2 border-purple-200 focus:border-purple-600 rounded-2xl text-purple-950 text-xs font-bold outline-none resize-none shadow-2xs"
                  autoFocus
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="pt-3 border-t border-purple-100 flex items-center justify-between gap-2 shrink-0">
          {step === 1 ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-2xl bg-purple-100 hover:bg-purple-200 text-purple-950 font-bold text-xs border-0 cursor-pointer transition-all"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={handleNextToStep2}
                className="px-6 py-2.5 rounded-2xl bg-purple-700 hover:bg-purple-800 text-white font-black text-xs sm:text-sm border-0 cursor-pointer shadow-md active:scale-95 transition-all flex items-center gap-1"
              >
                <span>Tiếp tục</span>
                <span>➔</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-4 py-2.5 rounded-2xl bg-purple-100 hover:bg-purple-200 text-purple-950 font-bold text-xs border-0 cursor-pointer transition-all"
              >
                ← Quay lại
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleSubmitTicket}
                className="px-6 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs sm:text-sm border-0 cursor-pointer shadow-md active:scale-95 transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                <span>{submitting ? 'Đang gửi...' : 'Gửi Yêu Cầu'}</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
