'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  getScheduleByDateRange,
  getEmployeeRates,
  getPenaltiesByEmployee,
  getBranches,
  calculateSalaryFromShifts,
  updateEmployeeBankInfo,
  getHolidaySettings,
} from '@/lib/supabase';
import {
  formatCurrency,
  getCurrentMonth,
  getBranchColorStyle,
} from '@/lib/utils';
import {
  VIETNAM_BANKS,
  getVietQRBankCode,
  generateVietQRUrl,
  getBankDisplayInfo,
} from '@/lib/vietqr';
import { useToast } from '@/components/Toast';

function getDayOfWeekLabel(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  const day = dateObj.getDay();
  const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  return days[day] || '';
}

export default function ModalEmployeeSalaryDetail({
  isOpen,
  onClose,
  employee,
  initialMonth,
  onSelectPenaltyEmployee,
}) {
  const toast = useToast();
  const printableRef = useRef(null);
  const [mounted, setMounted] = useState(false);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' (thẻ gọn 5-6 cột) | 'calendar' (lịch tháng 7 cột)

  useEffect(() => {
    setMounted(true);
  }, []);

  const [selectedMonth] = useState(
    initialMonth || getCurrentMonth()
  );

  const [empData, setEmpData] = useState(employee || null);
  const [shifts, setShifts] = useState([]);
  const [payRates, setPayRates] = useState([]);
  const [penalties, setPenalties] = useState([]);
  const [branches, setBranches] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(false);

  // Bank Info state
  const [showEditBankModal, setShowEditBankModal] = useState(false);
  const [bankNameInput, setBankNameInput] = useState('');
  const [bankAccNumInput, setBankAccNumInput] = useState('');
  const [bankAccHolderInput, setBankAccHolderInput] = useState('');
  const [bankQrUrlInput, setBankQrUrlInput] = useState('');
  const [savingBank, setSavingBank] = useState(false);
  const [previewQrModal, setPreviewQrModal] = useState(false);

  useEffect(() => {
    if (employee) {
      setEmpData(employee);
      setBankNameInput(employee.bank_name || '');
      setBankAccNumInput(employee.bank_account_number || '');
      setBankAccHolderInput(employee.bank_account_holder || '');
      setBankQrUrlInput(employee.bank_qr_code_url || '');
    }
  }, [employee]);

  async function loadDataForMonth() {
    if (!empData) return;
    setLoading(true);
    try {
      const [yearStr, monthStr] = selectedMonth.split('-');
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);

      const startDate = `${selectedMonth}-01`;
      const lastDayNum = new Date(year, month, 0).getDate();
      const endDate = `${selectedMonth}-${String(lastDayNum).padStart(2, '0')}`;

      const [schedData, ratesData, penaltiesData, branchList, holidayData] = await Promise.all([
        getScheduleByDateRange(startDate, endDate),
        getEmployeeRates(empData.id),
        getPenaltiesByEmployee(empData.id, selectedMonth),
        getBranches(),
        getHolidaySettings(),
      ]);

      // Lọc ca làm của nhân viên này trong tháng
      const empShifts = (schedData || []).filter(
        (s) =>
          String(s.employee_id || '').trim() === String(empData.id || '').trim() ||
          (s.employees?.name &&
            empData.name &&
            s.employees.name.trim().toLowerCase() === empData.name.trim().toLowerCase())
      );

      // Sắp xếp ca làm theo ngày tăng dần
      empShifts.sort((a, b) => (a.date > b.date ? 1 : -1));

      setShifts(empShifts);
      setPayRates(ratesData || []);
      setPenalties(penaltiesData || []);
      setBranches(branchList || []);
      setHolidays(Array.isArray(holidayData) ? holidayData : []);
    } catch (err) {
      console.error('Lỗi khi tải chi tiết lương tháng:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isOpen && empData && selectedMonth) {
      loadDataForMonth();
    }
  }, [isOpen, empData?.id, selectedMonth]);

  // Tách riêng danh sách Phụ Cấp (Thưởng) và Khấu Trừ (Phạt)
  const { bonusList, deductionList } = useMemo(() => {
    const bonuses = [];
    const deductions = [];
    (penalties || []).forEach((p) => {
      const isBonus = p.type === 'bonus' || (p.reason && (p.reason.toLowerCase().startsWith('[thưởng]') || p.reason.toLowerCase().startsWith('[bonus]')));
      if (isBonus) {
        bonuses.push(p);
      } else {
        deductions.push(p);
      }
    });
    return { bonusList: bonuses, deductionList: deductions };
  }, [penalties]);

  // Tính toán số liệu thống kê lương tháng
  const { totalHours, grossSalary, totalBonus, totalPenalty, netSalary, shiftCalculatedList } = useMemo(() => {
    const defaultRate = empData?.hourly_rate || 20000;
    const { totalHours: hrs, grossSalary: gross, shiftDetails } = calculateSalaryFromShifts(
      shifts,
      payRates,
      defaultRate,
      holidays
    );

    let bonus = 0;
    let penalty = 0;

    penalties.forEach((p) => {
      const isBonus = p.type === 'bonus' || (p.reason && (p.reason.toLowerCase().startsWith('[thưởng]') || p.reason.toLowerCase().startsWith('[bonus]')));
      if (isBonus) {
        bonus += Math.abs(p.amount);
      } else {
        penalty += Math.abs(p.amount);
      }
    });

    const net = gross + bonus - penalty;

    return {
      totalHours: hrs,
      grossSalary: gross,
      totalBonus: bonus,
      totalPenalty: penalty,
      netSalary: net,
      shiftCalculatedList: shiftDetails || [],
    };
  }, [shifts, payRates, penalties, empData, holidays]);

  // Sinh mã QR VietQR tự động chuẩn xác 100% nếu có số tài khoản và ngân hàng
  const vietQrUrl = useMemo(() => {
    if (empData?.bank_qr_code_url) return empData.bank_qr_code_url;
    if (empData?.bank_account_number && empData?.bank_name) {
      const [y, m] = (selectedMonth || '').split('-');
      const mNum = m ? parseInt(m, 10) : '';
      const amountClean = netSalary > 0 ? netSalary : 0;
      const transferDesc = `Luong T${mNum} ${empData.name || ''}`.trim();
      const accountHolder = (empData.bank_account_holder || empData.name || '').toUpperCase();

      return generateVietQRUrl({
        bankName: empData.bank_name,
        accountNumber: empData.bank_account_number,
        accountHolder,
        amount: amountClean,
        memo: transferDesc,
      });
    }
    return '';
  }, [empData, selectedMonth, netSalary]);

  // Live QR Preview ngay trong Modal Cập nhật STK
  const livePreviewQrUrl = useMemo(() => {
    if (bankAccNumInput && bankNameInput) {
      return generateVietQRUrl({
        bankName: bankNameInput,
        accountNumber: bankAccNumInput,
        accountHolder: bankAccHolderInput || empData?.name || '',
        amount: netSalary > 0 ? netSalary : 0,
        memo: `Luong ${empData?.name || ''}`,
      });
    }
    return '';
  }, [bankNameInput, bankAccNumInput, bankAccHolderInput, netSalary, empData]);

  // Tạo danh sách các ngày trong tháng phục vụ hiển thị Dạng Lịch Tháng (7 cột T2 -> CN)
  const calendarMonthDays = useMemo(() => {
    if (!selectedMonth) return [];
    const [yStr, mStr] = selectedMonth.split('-');
    const year = parseInt(yStr, 10);
    const month = parseInt(mStr, 10);
    const daysInMonth = new Date(year, month, 0).getDate();

    const shiftsByDate = {};
    (shiftCalculatedList || []).forEach((s) => {
      if (!shiftsByDate[s.date]) shiftsByDate[s.date] = [];
      shiftsByDate[s.date].push(s);
    });

    const firstDayObj = new Date(year, month - 1, 1);
    const firstDow = firstDayObj.getDay();
    // Monday is index 0:
    const leadingBlanks = firstDow === 0 ? 6 : firstDow - 1;

    // Ngày của tháng trước
    const prevMonthLastDate = new Date(year, month - 1, 0).getDate();
    const prevMonth = month === 1 ? 12 : month - 1;

    const list = [];
    // Các ngày cuối của tháng trước để lấp đầy hàng đầu
    for (let i = leadingBlanks - 1; i >= 0; i--) {
      const prevD = prevMonthLastDate - i;
      list.push({
        isOtherMonth: true,
        key: `prev-${prevD}`,
        dayDisplay: `${String(prevD).padStart(2, '0')}/${String(prevMonth).padStart(2, '0')}`,
      });
    }

    // Các ngày trong tháng hiện tại
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${selectedMonth}-${String(d).padStart(2, '0')}`;
      const dObj = new Date(year, month - 1, d);
      const dow = dObj.getDay();
      const dowLabel = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][dow];
      const dayShifts = shiftsByDate[dateStr] || [];
      const totalDayHours = dayShifts.reduce((acc, cur) => acc + (cur.hours || 0), 0);
      const totalDaySalary = dayShifts.reduce((acc, cur) => acc + (cur.shiftSalary || 0), 0);

      list.push({
        isOtherMonth: false,
        key: dateStr,
        dayNum: d,
        dateStr,
        dateFormatted: `${String(d).padStart(2, '0')}/${String(month).padStart(2, '0')}`,
        dowLabel,
        isWeekend: dow === 0 || dow === 6,
        shifts: dayShifts,
        totalHours: totalDayHours,
        totalSalary: totalDaySalary,
      });
    }

    // Các ngày đầu tháng sau để lấp đầy hàng cuối của lịch
    const remainder = list.length % 7;
    if (remainder > 0) {
      const trailingCount = 7 - remainder;
      const nextMonth = month === 12 ? 1 : month + 1;
      for (let i = 1; i <= trailingCount; i++) {
        list.push({
          isOtherMonth: true,
          key: `next-${i}`,
          dayDisplay: `${String(i).padStart(2, '0')}/${String(nextMonth).padStart(2, '0')}`,
        });
      }
    }

    return list;
  }, [selectedMonth, shiftCalculatedList]);

  // Xử lý lưu thông tin ngân hàng & QR
  async function handleSaveBankInfo(e) {
    e.preventDefault();
    if (!empData) return;
    setSavingBank(true);
    try {
      const updated = await updateEmployeeBankInfo(empData.id, {
        bank_name: bankNameInput.trim(),
        bank_account_number: bankAccNumInput.trim(),
        bank_account_holder: bankAccHolderInput.trim(),
        bank_qr_code_url: bankQrUrlInput.trim(),
      });

      setEmpData((prev) => ({
        ...prev,
        bank_name: updated?.bank_name !== undefined ? updated.bank_name : bankNameInput.trim(),
        bank_account_number: updated?.bank_account_number !== undefined ? updated.bank_account_number : bankAccNumInput.trim(),
        bank_account_holder: updated?.bank_account_holder !== undefined ? updated.bank_account_holder : bankAccHolderInput.trim(),
        bank_qr_code_url: updated?.bank_qr_code_url !== undefined ? updated.bank_qr_code_url : bankQrUrlInput.trim(),
      }));

      toast.success('Đã lưu thông tin chuyển khoản!', `Đã cập nhật STK cho ${empData.name}`);
      setShowEditBankModal(false);
    } catch (err) {
      console.error(err);
      toast.error('Lỗi', 'Không thể lưu thông tin chuyển khoản');
    } finally {
      setSavingBank(false);
    }
  }

  // Tải ảnh QR chuyển khoản
  function handleUploadQrImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.warning('File quá lớn', 'Vui lòng chọn ảnh dung lượng dưới 5MB!');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64Str = event.target?.result;
      if (base64Str) {
        setBankQrUrlInput(base64Str);
      }
    };
    reader.readAsDataURL(file);
  }

  // Sao chép STK
  function handleCopyAccNumber(accNum) {
    if (!accNum) return;
    navigator.clipboard.writeText(accNum);
    toast.success('Đã sao chép!', `Đã chép số tài khoản: ${accNum}`);
  }

  // Chuyển nhanh tới Tab Thưởng Phạt
  function handleGoToPenaltyTab() {
    onClose();
    if (onSelectPenaltyEmployee) {
      onSelectPenaltyEmployee(empData, selectedMonth);
    }
  }




  if (!isOpen || !empData || !mounted) return null;

  const [yearStr, monthStr] = (selectedMonth || '').split('-');
  const monthNumber = monthStr ? parseInt(monthStr, 10) : '';

  const modalContent = (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[99999] flex items-center justify-center p-2 sm:p-4 bg-purple-950/80 backdrop-blur-xs animate-fade-in print:p-0 print:bg-white print:static print:inset-auto"
    >
      <div className="bg-white rounded-3xl max-w-6xl w-full max-h-[96vh] flex flex-col border-2 border-purple-300 shadow-2xl overflow-hidden relative animate-scale-in print:max-h-none print:border-none print:shadow-none print:rounded-none">
        
        {/* =========================================================================
           TOP BAR: TIÊU ĐỀ PHIẾU TÍNH LƯƠNG & CÁC NÚT THAO TÁC (IN / XUẤT ẢNH / ĐÓNG)
           ========================================================================= */}
        <div className="px-4 py-3 sm:px-6 sm:py-4 bg-gradient-to-r from-purple-950 via-purple-900 to-indigo-950 text-white flex-shrink-0 border-b-2 border-purple-800 flex items-center justify-between gap-3 print:hidden">
          {/* Tiêu Đề Trung Tâm */}
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="text-xl sm:text-2xl">📋</span>
            <div>
              <h2 className="font-black text-sm sm:text-lg text-white uppercase tracking-wider leading-tight">
                SATIMA - PHIẾU TÍNH LƯƠNG
              </h2>
              <p className="text-[11px] sm:text-xs font-black text-amber-300 tracking-wider">
                THÁNG &lt;{monthNumber}/{yearStr}&gt;
              </p>
            </div>
          </div>

          {/* Cụm Nút Thao Tác Bên Phải */}
          <div className="flex items-center gap-2">
            {/* Nút Đóng Modal */}
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-purple-800/80 text-purple-200 hover:bg-rose-600 hover:text-white border-0 flex items-center justify-center cursor-pointer text-sm font-black transition-all active:scale-90 shadow-md"
              title="Đóng phiếu lương"
            >
              ✕
            </button>
          </div>
        </div>

        {/* =========================================================================
           VÙNG NỘI DUNG PHIẾU LƯƠNG (TỐI ƯU CHIỀU CAO ĐỂ NHÌN RÕ TRỌN VẸN 30 NGÀY)
           ========================================================================= */}
        <div
          ref={printableRef}
          className="overflow-y-auto p-2.5 sm:p-4 flex-1 space-y-2.5 custom-scrollbar bg-slate-50/70"
        >
          {/* 1. THÔNG TIN NHÂN VIÊN & MÃ QR CHUYỂN KHOẢN (TRÌNH BÀY TINH TẾ, RÕ RÀNG TRÊN CẢ PC & ĐIỆN THOẠI) */}
          <div className="bg-white rounded-2xl p-3 sm:p-3.5 border border-purple-200/90 shadow-2xs">
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
              
              {/* TRÁI: Avatar + Tên + SĐT + Ngân hàng & STK */}
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-tr from-purple-700 to-indigo-600 text-white font-black text-sm sm:text-base flex items-center justify-center shadow-xs shrink-0 ring-2 ring-purple-200 uppercase">
                  {empData.name ? empData.name.trim().split(/\s+/).slice(-2).map((w) => w[0]).join('') : 'NV'}
                </div>

                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm sm:text-base font-black text-purple-950 uppercase tracking-tight truncate">
                      {empData.name}
                    </h3>
                    <span className="px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 border border-purple-200 text-[10px] font-black uppercase">
                      {empData.role ? empData.role.toUpperCase() : 'STAFF'}
                    </span>
                    <span className="text-xs font-semibold text-slate-500 font-mono">
                      📞 {empData.phone || `NV-${empData.id?.slice(0, 5)}`}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    <span className="text-purple-950 font-black flex items-center gap-1 text-[11px] sm:text-xs">
                      <span>🏛️</span> {getBankDisplayInfo(empData.bank_name).name}
                    </span>
                    <span className="font-mono text-purple-950 font-black text-xs px-2 py-0.5 rounded bg-purple-50 border border-purple-200 shadow-2xs">
                      {empData.bank_account_number || 'Chưa có STK'}
                    </span>
                    {empData.bank_account_number && (
                      <button
                        type="button"
                        onClick={() => handleCopyAccNumber(empData.bank_account_number)}
                        className="px-2 py-0.5 rounded bg-amber-400 hover:bg-amber-300 text-purple-950 text-[10.5px] font-black border-0 cursor-pointer transition-all active:scale-90 flex items-center gap-1 shadow-2xs"
                        title="Sao chép STK"
                      >
                        <span>📋</span> Sao chép
                      </button>
                    )}
                    {empData.bank_account_holder && (
                      <span className="text-slate-600 text-xs truncate">
                        Chủ TK: <strong className="text-purple-950 uppercase font-black">{empData.bank_account_holder}</strong>
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowEditBankModal(true)}
                      className="text-purple-700 hover:text-purple-950 text-[11px] font-bold underline cursor-pointer bg-transparent border-0 p-0"
                    >
                      ✏️ Sửa STK
                    </button>
                  </div>
                </div>
              </div>

              {/* PHẢI: MÃ QR CHUYỂN KHOẢN (TRỰC QUAN, TINH GỌN) */}
              <div className="shrink-0 self-start sm:self-auto flex items-center justify-end">
                {vietQrUrl ? (
                  <div
                    onClick={() => setPreviewQrModal(true)}
                    className="cursor-pointer group flex items-center gap-2.5 px-3 py-1.5 bg-purple-50/90 hover:bg-purple-100 rounded-2xl border border-purple-300 shadow-2xs transition-all"
                    title="Bấm để xem mã QR phóng to"
                  >
                    <div className="relative bg-white p-0.5 rounded-lg border border-purple-200 shadow-xs group-hover:border-purple-600 transition-colors">
                      <img
                        src={vietQrUrl}
                        alt="QR"
                        className="w-9 h-9 sm:w-10 sm:h-10 object-contain rounded"
                      />
                    </div>
                    <div className="text-left leading-tight">
                      <div className="text-[11px] font-black text-purple-950 flex items-center gap-1">
                        <span>📲</span> QR Chuyển Khoản
                      </div>
                      <div className="text-[9.5px] font-bold text-purple-700 mt-0.5 flex items-center gap-1">
                        <span>🔍</span> Bấm phóng to
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowEditBankModal(true)}
                    className="px-3 py-1.5 rounded-xl bg-purple-100 hover:bg-purple-200 text-purple-900 text-xs font-black border border-purple-300 cursor-pointer transition-all active:scale-95 shadow-2xs flex items-center gap-1.5"
                  >
                    <span>💳</span> Thêm STK & QR
                  </button>
                )}
              </div>

            </div>
          </div>

          {/* 2. 4 THẺ STAT CARDS TỔNG QUAN (2 CỘT TRÊN MOBILE, 4 CỘT TRÊN PC - GIỮ NGUYÊN CHUẨN 100% NHƯ ẢNH ĐIỆN THOẠI) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-2.5">
            {/* Card 1: CA & SỐ GIỜ LÀM */}
            <div className="p-2.5 sm:p-3 bg-white rounded-2xl border border-purple-200 shadow-2xs space-y-0.5">
              <span className="text-[10px] sm:text-[10.5px] font-black text-purple-800 uppercase block tracking-tight">
                ⌛ CA & SỐ GIỜ LÀM
              </span>
              <div className="text-base sm:text-xl font-black text-purple-950">
                {shifts.length} ca
              </div>
              <div className="text-[10.5px] sm:text-[11px] font-extrabold text-purple-700">
                Tổng: {totalHours} tiếng
              </div>
            </div>

            {/* Card 2: LƯƠNG CA LÀM */}
            <div className="p-2.5 sm:p-3 bg-white rounded-2xl border border-purple-200 shadow-2xs space-y-0.5">
              <span className="text-[10px] sm:text-[10.5px] font-black text-emerald-800 uppercase block tracking-tight">
                💵 LƯƠNG CA LÀM
              </span>
              <div className="text-base sm:text-xl font-black text-emerald-700 font-mono">
                {formatCurrency(grossSalary)}
              </div>
              <div className="text-[10px] sm:text-[10.5px] font-bold text-slate-500">
                Tính theo ca làm
              </div>
            </div>

            {/* Card 3: PHỤ CẤP / KHẤU TRỪ */}
            <div className="p-2.5 sm:p-3 bg-white rounded-2xl border border-purple-200 shadow-2xs space-y-0.5">
              <span className="text-[10px] sm:text-[10.5px] font-black text-slate-700 uppercase block tracking-tight">
                🎁 PHỤ CẤP / ⚠️ KHẤU TRỪ
              </span>
              <div className="flex items-center gap-1 text-xs sm:text-sm font-black font-mono">
                <span className="text-emerald-700">+{formatCurrency(totalBonus)}</span>
                <span className="text-slate-400">/</span>
                <span className="text-rose-700">-{formatCurrency(totalPenalty)}</span>
              </div>
              <button
                type="button"
                onClick={handleGoToPenaltyTab}
                className="text-[10px] sm:text-[10.5px] font-extrabold text-purple-700 hover:text-purple-950 flex items-center gap-0.5 bg-transparent border-0 cursor-pointer p-0 underline transition-all print:hidden"
                title="Bấm để chuyển tới tab Phụ Cấp & Khấu Trừ"
              >
                Bấm để quản lý ➔
              </button>
            </div>

            {/* Card 4: THỰC NHẬN THÁNG */}
            <div className="p-2.5 sm:p-3 bg-gradient-to-br from-purple-950 via-purple-900 to-indigo-950 text-white rounded-2xl border-2 border-purple-700 shadow-md space-y-0.5">
              <span className="text-[10px] sm:text-[10.5px] font-black text-amber-300 uppercase block tracking-tight">
                💰 THỰC NHẬN THÁNG {monthNumber}
              </span>
              <div className="text-base sm:text-xl font-black text-amber-300 font-mono tracking-tight">
                {formatCurrency(netSalary)}
              </div>
              <div className="text-[10px] sm:text-[10.5px] font-extrabold text-purple-200">
                ({totalHours}h • {shifts.length} ca)
              </div>
            </div>
          </div>

          {/* 3. KHUNG THƯỞNG PHẠT: PHỤ CẤP & KHẤU TRỪ
             - Trên Mobile: Xếp dọc 1 cột (100% khớp chuẩn ảnh điện thoại).
             - Trên PC: Chia 2 cột song song cân đối, đẹp mắt, có ngày tháng rõ ràng, không bị dồn nhồi thành đám tag xấu. */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 sm:gap-3">
            
            {/* CỘT TRÁI: 🎁 PHỤ CẤP */}
            <div className="bg-white rounded-2xl p-3 sm:p-3.5 border border-emerald-200 shadow-2xs space-y-2 flex flex-col">
              <div className="flex items-center justify-between border-b border-emerald-100 pb-1.5">
                <h4 className="font-black text-xs sm:text-sm text-emerald-950 uppercase tracking-wide flex items-center gap-1.5">
                  <span>🎁</span> PHỤ CẤP
                </h4>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-lg border border-emerald-200 font-mono shadow-2xs">
                    +{formatCurrency(totalBonus)}
                  </span>
                  <button
                    type="button"
                    onClick={handleGoToPenaltyTab}
                    className="text-[10.5px] font-extrabold text-emerald-700 hover:text-emerald-900 underline bg-transparent border-0 cursor-pointer p-0 print:hidden"
                    title="Chuyển tới quản lý phụ cấp"
                  >
                    Quản lý ➔
                  </button>
                </div>
              </div>

              <div className="space-y-1.5 max-h-[170px] sm:max-h-[185px] overflow-y-auto pr-1 custom-scrollbar flex-1">
                {bonusList.length > 0 ? (
                  bonusList.map((p) => {
                    const cleanReason = (p.reason || '')
                      .replace(/\[THƯỞNG\]/gi, '')
                      .replace(/\[PHẠT\]/gi, '')
                      .replace(/\[PHỤ CẤP\]/gi, '')
                      .replace(/\[KHẤU TRỪ\]/gi, '')
                      .trim() || 'Phụ cấp';
                    return (
                      <div
                        key={p.id}
                        className="px-3 py-1.5 bg-emerald-50/70 hover:bg-emerald-100/70 rounded-xl border border-emerald-200/80 flex items-center justify-between gap-2 text-xs transition-colors shadow-2xs"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-black text-emerald-950 text-xs truncate" title={cleanReason}>
                            {cleanReason}
                          </div>
                          <div className="text-[10px] font-bold text-emerald-700/90 flex items-center gap-1 mt-0.5">
                            <span>📅</span> {p.date ? p.date.split('-').reverse().join('/') : 'Trong tháng'}
                          </div>
                        </div>

                        <div className="font-black text-emerald-700 text-xs sm:text-sm whitespace-nowrap text-right font-mono">
                          +{formatCurrency(Math.abs(p.amount))}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-3 text-center text-xs text-slate-400 font-medium italic bg-slate-50/70 rounded-xl border border-dashed border-slate-200">
                    Chưa có khoản phụ cấp nào.
                  </div>
                )}
              </div>
            </div>

            {/* CỘT PHẢI: ⚠️ KHẤU TRỪ */}
            <div className="bg-white rounded-2xl p-3 sm:p-3.5 border border-rose-200 shadow-2xs space-y-2 flex flex-col">
              <div className="flex items-center justify-between border-b border-rose-100 pb-1.5">
                <h4 className="font-black text-xs sm:text-sm text-rose-950 uppercase tracking-wide flex items-center gap-1.5">
                  <span>⚠️</span> KHẤU TRỪ
                </h4>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-lg border border-rose-200 font-mono shadow-2xs">
                    -{formatCurrency(totalPenalty)}
                  </span>
                  <button
                    type="button"
                    onClick={handleGoToPenaltyTab}
                    className="text-[10.5px] font-extrabold text-rose-700 hover:text-rose-900 underline bg-transparent border-0 cursor-pointer p-0 print:hidden"
                    title="Chuyển tới quản lý khấu trừ"
                  >
                    Quản lý ➔
                  </button>
                </div>
              </div>

              <div className="space-y-1.5 max-h-[170px] sm:max-h-[185px] overflow-y-auto pr-1 custom-scrollbar flex-1">
                {deductionList.length > 0 ? (
                  deductionList.map((p) => {
                    const cleanReason = (p.reason || '')
                      .replace(/\[PHẠT\]/gi, '')
                      .replace(/\[THƯỞNG\]/gi, '')
                      .replace(/\[KHẤU TRỪ\]/gi, '')
                      .replace(/\[PHỤ CẤP\]/gi, '')
                      .trim() || 'Khấu trừ';
                    return (
                      <div
                        key={p.id}
                        className="px-3 py-1.5 bg-rose-50/70 hover:bg-rose-100/70 rounded-xl border border-rose-200/80 flex items-center justify-between gap-2 text-xs transition-colors shadow-2xs"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-black text-rose-950 text-xs truncate" title={cleanReason}>
                            {cleanReason}
                          </div>
                          <div className="text-[10px] font-bold text-rose-700/90 flex items-center gap-1 mt-0.5">
                            <span>📅</span> {p.date ? p.date.split('-').reverse().join('/') : 'Trong tháng'}
                          </div>
                        </div>

                        <div className="font-black text-rose-600 text-xs sm:text-sm whitespace-nowrap text-right font-mono">
                          -{formatCurrency(Math.abs(p.amount))}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-3 text-center text-xs text-slate-400 font-medium italic bg-slate-50/70 rounded-xl border border-dashed border-slate-200">
                    Chưa có khoản khấu trừ nào.
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* 3. KHUNG BẢNG TOÀN BỘ CÁC CA LÀM THÁNG (TOÀN CHIỀU NGANG, HIỂN THỊ RÕ RÀNG 30 NGÀY) */}
          <div className="bg-white rounded-2xl p-2.5 sm:p-3 border border-purple-200 shadow-2xs space-y-2">
            
            {/* Header: Tiêu đề + Nút chuyển chế độ xem (Thẻ Gọn vs Lịch Tháng 7 cột) */}
            <div className="flex items-center justify-between flex-wrap gap-2 border-b border-purple-100 pb-1.5">
              <div className="flex items-center gap-2">
                <h4 className="font-black text-xs sm:text-sm text-purple-950 flex items-center gap-1.5">
                  <span>📅</span> Các Ca Làm Tháng {monthNumber < 10 ? `0${monthNumber}` : monthNumber}/{yearStr}
                  <span className="px-2 py-0.2 rounded-full bg-purple-100 text-purple-950 text-xs font-black">
                    {shifts.length} ca làm
                  </span>
                </h4>
                {loading && <span className="text-[11px] text-purple-600 font-bold animate-pulse">⏳ Đang tải...</span>}
              </div>

              {/* Nút Toggle 2 Chế Độ Xem */}
              <div className="flex items-center gap-1 bg-purple-50 p-0.5 rounded-xl border border-purple-200 text-xs">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={`px-2.5 py-1 rounded-lg font-black text-xs transition-all cursor-pointer border-0 ${
                    viewMode === 'grid'
                      ? 'bg-purple-900 text-white shadow-xs'
                      : 'text-purple-700 hover:text-purple-950 bg-transparent'
                  }`}
                  title="Hiển thị dạng thẻ rút gọn, nhìn rõ toàn bộ 30 ngày cùng lúc"
                >
                  🗂️ Thẻ Gọn ({shifts.length} ca)
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('calendar')}
                  className={`px-2.5 py-1 rounded-lg font-black text-xs transition-all cursor-pointer border-0 ${
                    viewMode === 'calendar'
                      ? 'bg-purple-900 text-white shadow-xs'
                      : 'text-purple-700 hover:text-purple-950 bg-transparent'
                  }`}
                  title="Hiển thị theo dạng bảng lịch tháng 7 cột (T2 -> CN) có cả ngày làm và ngày nghỉ"
                >
                  📅 Lịch Tháng (7 cột)
                </button>
              </div>
            </div>

            {/* CHẾ ĐỘ 1: THẺ GỌN 5-6 CỘT (TẤT CẢ CA LÀM NẰM TRỌN TRÊN 1 MÀN HÌNH KHÔNG CẦN CUỘN) */}
            {viewMode === 'grid' && (
              shiftCalculatedList.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-1.5">
                  {shiftCalculatedList.map((s) => {
                    const branchObj = branches.find((b) => b.id === s.branch_id) || s.branches;
                    const branchStyle = getBranchColorStyle(branchObj?.name, branchObj?.color);
                    const sTime = s.start_time ? s.start_time.slice(0, 5) : '08:30';
                    const eTime = s.end_time ? s.end_time.slice(0, 5) : '22:00';
                    const splitMatch = s.note ? s.note.match(/\[(?:Ca gốc|Gốc):\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})[^\]]*\].*?\((\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/i) : null;
                    const isSplit = splitMatch && (splitMatch[2] < splitMatch[3] || splitMatch[4] < splitMatch[1]);
                    const timeRangeDisplay = isSplit ? `${splitMatch[1]}-${splitMatch[2]} & ${splitMatch[3]}-${splitMatch[4]}` : `${sTime}-${eTime}`;
                    const dow = getDayOfWeekLabel(s.date);

                    return (
                      <div
                        key={s.id}
                        className={`px-2 py-1.5 rounded-xl border text-xs transition-all shadow-2xs space-y-0.5 ${
                          s.multiplier > 1
                            ? 'bg-gradient-to-br from-amber-50 to-amber-100/90 border-amber-300 ring-1 ring-amber-300/60'
                            : 'bg-purple-50/40 hover:bg-purple-100/70 border-purple-200/80'
                        }`}
                      >
                        {/* Hàng 1: Ngày + Thứ (Khối Date Stamp tinh tế, đồng bộ tông tím thương hiệu) + Chi Nhánh + Thành Tiền */}
                        <div className="flex items-center justify-between gap-1 leading-tight">
                          <div className="flex items-center gap-1 min-w-0">
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-purple-100/90 text-purple-950 border border-purple-300 shadow-2xs shrink-0">
                              <span className="font-black text-[11px] font-mono tracking-tight">
                                {s.date.split('-').reverse().slice(0, 2).join('/')}
                              </span>
                              <span className={`text-[9.5px] font-black ${dow === 'CN' ? 'text-rose-600' : 'text-purple-700'}`}>
                                {dow}
                              </span>
                            </span>
                            <span
                              className="px-1 py-0.2 rounded text-[8.5px] font-black text-white shrink-0 shadow-2xs"
                              style={{ backgroundColor: branchStyle.hex }}
                            >
                              {branchStyle.badgeText || branchObj?.name || 'A4'}
                            </span>
                          </div>
                          <span className="font-black text-emerald-700 text-xs font-mono shrink-0">
                            ={formatCurrency(s.shiftSalary)}
                          </span>
                        </div>

                        {/* Hàng 2: Giờ Làm & Tổng Tiếng */}
                        <div className="flex items-center justify-between gap-1 text-[10.5px] font-bold text-slate-700 leading-tight">
                          <span className="truncate text-slate-600" title={timeRangeDisplay}>
                            🕒 {timeRangeDisplay}
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            {s.multiplier > 1 && (
                              <span className="text-[9px] font-black text-amber-900 bg-amber-200 px-1 rounded shadow-2xs" title={s.holidayName}>
                                x{s.multiplier}
                              </span>
                            )}
                            <span className="font-black text-purple-950 text-[11px] font-mono">
                              ⏳ {s.hours}h
                            </span>
                          </div>
                        </div>

                        {/* Ghi chú ca nếu có */}
                        {s.note && (
                          <div
                            className="text-[9px] font-bold truncate text-purple-700 leading-none pt-0.5 border-t border-purple-200/50"
                            title={s.note}
                          >
                            {s.note.includes('[Gốc:') || s.note.includes('[Ca gốc:') ? `⚡ ${s.note}` : `📝 ${s.note}`}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-6 text-center text-xs text-purple-600 font-bold italic bg-purple-50/60 rounded-xl border border-purple-200">
                  Chưa có ca làm nào trong tháng {monthNumber}/{yearStr}.
                </div>
              )
            )}

            {/* CHẾ ĐỘ 2: LỊCH THÁNG 7 CỘT (T2 -> CN) HIỂN THỊ TOÀN BỘ 30/31 NGÀY TRONG THÁNG */}
            {viewMode === 'calendar' && (
              <div className="border border-purple-200 rounded-xl overflow-hidden shadow-2xs bg-white">
                {/* Header 7 Ngày: T2 -> CN */}
                <div className="grid grid-cols-7 bg-purple-950 text-white text-center font-black text-xs py-2 border-b border-purple-800">
                  {[
                    { label: 'THỨ 2', short: 'T2' },
                    { label: 'THỨ 3', short: 'T3' },
                    { label: 'THỨ 4', short: 'T4' },
                    { label: 'THỨ 5', short: 'T5' },
                    { label: 'THỨ 6', short: 'T6' },
                    { label: 'THỨ 7', short: 'T7' },
                    { label: 'CHỦ NHẬT', short: 'CN', isSun: true },
                  ].map((d) => (
                    <div key={d.short} className={d.isSun ? 'text-amber-300' : ''}>
                      <span className="hidden sm:inline">{d.label}</span>
                      <span className="sm:hidden">{d.short}</span>
                    </div>
                  ))}
                </div>

                {/* Các Ô Ngày Trong Tháng */}
                <div className="grid grid-cols-7 gap-px bg-purple-200">
                  {calendarMonthDays.map((item) => {
                    if (item.isOtherMonth) {
                      return (
                        <div key={item.key} className="bg-slate-50/60 p-1.5 min-h-[54px] flex flex-col justify-start">
                          <span className="text-[10px] font-bold text-slate-300 font-mono">
                            {item.dayDisplay}
                          </span>
                        </div>
                      );
                    }

                    const hasShifts = item.shifts && item.shifts.length > 0;
                    return (
                      <div
                        key={item.key}
                        className={`min-h-[54px] p-1.5 flex flex-col justify-between text-xs transition-colors ${
                          hasShifts
                            ? 'bg-white hover:bg-purple-50/90'
                            : 'bg-slate-50/90 hover:bg-slate-100/80'
                        }`}
                      >
                        {/* Dòng Tiêu Đề: Badge Ngày Rõ Ràng (ví dụ: [01/08] T7) và Thành Tiền */}
                        <div className="flex items-center justify-between gap-1 leading-tight">
                          <div className="flex items-center gap-1 min-w-0">
                            <span
                              className={`px-1.5 py-0.5 rounded-md font-black text-[11px] font-mono shadow-2xs shrink-0 tracking-tight ${
                                hasShifts
                                  ? 'bg-purple-100 text-purple-950 border border-purple-300'
                                  : 'bg-slate-100 text-slate-500 border border-slate-200'
                              }`}
                            >
                              {item.dateFormatted}
                            </span>
                            <span
                              className={`text-[9.5px] font-black ${
                                item.dowLabel === 'CN' ? 'text-rose-600' : 'text-purple-800'
                              }`}
                            >
                              {item.dowLabel}
                            </span>
                          </div>

                          {hasShifts ? (
                            <span className="text-[10.5px] font-black text-emerald-700 font-mono shrink-0">
                              ={formatCurrency(item.totalSalary)}
                            </span>
                          ) : (
                            <span className="px-1 py-0.1 rounded bg-rose-50 border border-rose-200 text-[8.5px] font-black text-rose-600">
                              OFF
                            </span>
                          )}
                        </div>

                        {/* Chi tiết ca làm trong ngày */}
                        {hasShifts ? (
                          <div className="space-y-0.5 mt-1">
                            {item.shifts.map((s) => {
                              const branchObj = branches.find((b) => b.id === s.branch_id) || s.branches;
                              const branchStyle = getBranchColorStyle(branchObj?.name, branchObj?.color);
                              const sTime = s.start_time ? s.start_time.slice(0, 5) : '08:30';
                              const eTime = s.end_time ? s.end_time.slice(0, 5) : '22:00';
                              const splitMatch = s.note ? s.note.match(/\[(?:Ca gốc|Gốc):\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})[^\]]*\].*?\((\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/i) : null;
                              const isSplit = splitMatch && (splitMatch[2] < splitMatch[3] || splitMatch[4] < splitMatch[1]);
                              const timeDisplay = isSplit ? `${splitMatch[1]}-${splitMatch[2]}&${splitMatch[3]}-${splitMatch[4]}` : `${sTime}-${eTime}`;

                              return (
                                <div key={s.id} className="flex items-center justify-between gap-1 text-[10px] leading-tight">
                                  <div className="flex items-center gap-1 min-w-0">
                                    <span
                                      className="px-1 py-0.1 rounded text-[8.5px] font-black text-white shrink-0 shadow-2xs"
                                      style={{ backgroundColor: branchStyle.hex }}
                                    >
                                      {branchStyle.badgeText || branchObj?.name || 'A4'}
                                    </span>
                                    <span className="text-slate-600 font-semibold truncate" title={timeDisplay}>
                                      🕒 {timeDisplay}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-0.5 shrink-0">
                                    {s.multiplier > 1 && (
                                      <span className="text-[8.5px] font-black text-amber-900 bg-amber-200 px-0.5 rounded">
                                        x{s.multiplier}
                                      </span>
                                    )}
                                    <span className="font-black text-purple-950 font-mono text-[10.5px]">
                                      {s.hours}h
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-[9.5px] text-slate-400 font-medium italic mt-1">
                            Nghỉ làm
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          </div>

        </div>
      </div>

      {/* MODAL SỬA THÔNG TIN NGÂN HÀNG & MÃ QR */}
      {showEditBankModal && (
        <div
          onClick={() => setShowEditBankModal(false)}
          className="fixed inset-0 z-[99999] bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in print:hidden"
        >
          <div
            className="bg-white rounded-3xl p-5 max-w-md w-full space-y-3 relative border-2 border-purple-300 shadow-2xl animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-purple-100 pb-2">
              <h4 className="font-black text-sm sm:text-base text-purple-950 flex items-center gap-1.5">
                <span>💳</span> Cập Nhật STK & Mã QR - {empData.name}
              </h4>
              <button
                type="button"
                onClick={() => setShowEditBankModal(false)}
                className="w-7 h-7 rounded-full bg-purple-100 text-purple-900 font-black text-xs border-0 cursor-pointer hover:bg-rose-600 hover:text-white transition-all"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveBankInfo} className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[10px] font-black text-purple-900 uppercase">
                    Tên Ngân hàng:
                  </label>
                  {bankNameInput && (
                    <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                      ✓ Mã VietQR: {getVietQRBankCode(bankNameInput)}
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  list="vietnam-banks-list"
                  value={bankNameInput}
                  onChange={(e) => setBankNameInput(e.target.value)}
                  placeholder="Gõ hoặc chọn: BVBank, MBBank, Techcombank, VCB, Cake, Timo..."
                  className="w-full px-3 py-2 bg-purple-50/50 border border-purple-200 rounded-xl text-purple-950 text-xs font-bold outline-none focus:border-purple-600"
                />
                <datalist id="vietnam-banks-list">
                  {VIETNAM_BANKS.map((b) => (
                    <option key={b.code} value={b.name}>
                      {b.fullName} (Mã: {b.shortName})
                    </option>
                  ))}
                </datalist>

                {/* Gợi ý chọn nhanh ngân hàng phổ biến */}
                <div className="flex items-center gap-1 flex-wrap mt-1.5">
                  <span className="text-[10px] font-bold text-purple-700">Chọn nhanh:</span>
                  {[
                    { label: 'BVBank (Bản Việt)', val: 'BVBank (Bản Việt)' },
                    { label: 'MB Bank', val: 'MB Bank (Quân Đội)' },
                    { label: 'Vietcombank', val: 'Vietcombank' },
                    { label: 'Techcombank', val: 'Techcombank' },
                    { label: 'BIDV', val: 'BIDV' },
                    { label: 'VietinBank', val: 'VietinBank' },
                    { label: 'ACB', val: 'ACB (Á Châu)' },
                    { label: 'VPBank', val: 'VPBank' },
                    { label: 'TPBank', val: 'TPBank' },
                    { label: 'Cake', val: 'CAKE by VPBank' },
                    { label: 'Timo', val: 'Timo by BanVietBank' },
                  ].map((item) => (
                    <button
                      key={item.val}
                      type="button"
                      onClick={() => setBankNameInput(item.val)}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-black border cursor-pointer transition-all ${
                        bankNameInput === item.val
                          ? 'bg-purple-700 text-white border-purple-800 shadow-2xs'
                          : 'bg-white text-purple-900 border-purple-200 hover:bg-purple-100'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-purple-900 uppercase mb-1">
                  Số tài khoản (STK):
                </label>
                <input
                  type="text"
                  value={bankAccNumInput}
                  onChange={(e) => setBankAccNumInput(e.target.value)}
                  placeholder="VD: 101010101233 hoặc 99MM24132M..."
                  className="w-full px-3 py-2 bg-purple-50/50 border border-purple-200 rounded-xl text-purple-950 text-xs font-black tracking-wider outline-none focus:border-purple-600 font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-purple-900 uppercase mb-1">
                  Tên chủ tài khoản:
                </label>
                <input
                  type="text"
                  value={bankAccHolderInput}
                  onChange={(e) => setBankAccHolderInput(e.target.value.toUpperCase())}
                  placeholder="VD: MA THI THUY CHANG..."
                  className="w-full px-3 py-2 bg-purple-50/50 border border-purple-200 rounded-xl text-purple-950 text-xs font-black uppercase outline-none focus:border-purple-600"
                />
              </div>

              {/* LIVE QR PREVIEW BOX NGAY TRONG MODAL */}
              {livePreviewQrUrl && !bankQrUrlInput && (
                <div className="p-3 bg-purple-50/90 rounded-2xl border border-purple-200 flex items-center gap-3 animate-fade-in">
                  <div className="relative bg-white p-1 rounded-xl border border-purple-300 shadow-2xs shrink-0">
                    <img
                      src={livePreviewQrUrl}
                      alt="Mã QR Chuyển Khoản Tự Động"
                      className="w-16 h-16 object-contain rounded-lg"
                      onError={(e) => {
                        console.error('Lỗi tải ảnh QR:', e);
                      }}
                    />
                  </div>
                  <div className="space-y-0.5 min-w-0 flex-1">
                    <div className="text-xs font-black text-emerald-800 flex items-center gap-1">
                      <span>✓</span> Đã tạo mã QR VietQR tự động
                    </div>
                    <div className="text-[11px] font-black text-purple-950 truncate">
                      🏛️ {getBankDisplayInfo(bankNameInput).name}
                    </div>
                    <div className="text-[11px] font-mono text-purple-800 font-bold truncate">
                      STK: {bankAccNumInput}
                    </div>
                    {bankAccHolderInput && (
                      <div className="text-[10px] text-purple-600 font-bold truncate">
                        Chủ TK: {bankAccHolderInput.toUpperCase()}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-black text-purple-900 uppercase mb-1">
                  📸 Hoặc tải ảnh mã QR riêng từ ngân hàng (Nếu có):
                </label>
                <label className="w-full p-2 bg-purple-50/60 border border-dashed border-purple-300 rounded-xl flex items-center justify-center gap-2 cursor-pointer hover:bg-purple-100/60 transition-all text-xs font-bold text-purple-800">
                  <span>📸 Chọn ảnh mã QR từ máy</span>
                  <input type="file" accept="image/*" onChange={handleUploadQrImage} className="hidden" />
                </label>

                {bankQrUrlInput && (
                  <div className="mt-2 text-center relative group">
                    <img
                      src={bankQrUrlInput}
                      alt="Mã QR Chuyển Khoản"
                      className="w-24 h-24 object-contain mx-auto rounded-xl border border-purple-200 bg-white p-1 shadow-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setBankQrUrlInput('')}
                      className="mt-1 text-[10px] text-rose-600 font-bold hover:underline bg-transparent border-0 cursor-pointer"
                    >
                      ✕ Xóa ảnh QR tùy chỉnh này (để tự động sinh VietQR)
                    </button>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-purple-100">
                <button
                  type="button"
                  onClick={() => setShowEditBankModal(false)}
                  className="px-3.5 py-1.5 rounded-xl bg-purple-100 text-purple-900 text-xs font-bold border-0 cursor-pointer hover:bg-purple-200"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={savingBank}
                  className="px-4 py-1.5 rounded-xl bg-purple-700 text-white text-xs font-black border-0 cursor-pointer hover:bg-purple-800 transition-all shadow-2xs disabled:opacity-50"
                >
                  {savingBank ? 'Đang lưu...' : '💾 Lưu Thông Tin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* POPUP PHÓNG TO MÃ QR NGÂN HÀNG */}
      {previewQrModal && vietQrUrl && (
        <div
          onClick={() => setPreviewQrModal(false)}
          className="fixed inset-0 z-[99999] bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in print:hidden"
        >
          <div
            className="bg-white rounded-3xl p-5 max-w-sm w-full text-center space-y-3 relative border-2 border-purple-400 shadow-2xl animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewQrModal(false)}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-purple-100 text-purple-900 font-black text-xs border-0 cursor-pointer hover:bg-rose-600 hover:text-white transition-all"
            >
              ✕
            </button>

            <h4 className="font-black text-base text-purple-950 pr-6">
              Mã QR Ngân Hàng - {empData.name}
            </h4>

            <div className="p-3 bg-slate-50 rounded-2xl border border-purple-200 inline-block">
              <img
                src={vietQrUrl}
                alt="Mã QR Ngân Hàng Xem To"
                className="w-64 h-64 object-contain mx-auto"
              />
            </div>

            <div className="text-xs font-bold text-purple-900 bg-purple-50 p-2.5 rounded-xl border border-purple-200 space-y-0.5 text-left">
              <div>STK: <strong className="font-mono text-purple-950 text-sm font-black">{empData.bank_account_number || 'Chưa nhập'}</strong> ({empData.bank_name || 'Ngân hàng'})</div>
              <div>Chủ TK: <strong className="uppercase font-black">{empData.bank_account_holder || empData.name}</strong></div>
              <div>Số tiền chuyển: <strong className="text-emerald-700 text-sm font-black">{formatCurrency(netSalary)}</strong></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
}
