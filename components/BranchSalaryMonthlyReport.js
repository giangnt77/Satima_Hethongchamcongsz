'use client';

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  getScheduleByDateRange,
  getHolidaySettings,
  getEmployeeRates,
  getAllEmployeeRates,
  calculateSalaryFromShifts,
} from '@/lib/supabase';
import { formatCurrency, getBranchColorStyle, getCurrentMonth } from '@/lib/utils';

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

export default function BranchSalaryMonthlyReport({ branches = [], employees = [], toast }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Chọn tháng xem báo cáo (Mặc định: Tháng hiện tại YYYY-MM theo giờ VN)
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth);

  const [loading, setLoading] = useState(false);
  const [shifts, setShifts] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [ratesMap, setRatesMap] = useState({});
  const [selectedBranchDetail, setSelectedBranchDetail] = useState(null);

  // Tính khoảng ngày của tháng
  const { monthStartDate, monthEndDate, monthLabel } = useMemo(() => {
    const [yStr, mStr] = selectedMonth.split('-');
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10);
    const lastDay = new Date(y, m, 0).getDate();
    return {
      monthStartDate: `${y}-${String(m).padStart(2, '0')}-01`,
      monthEndDate: `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
      monthLabel: `Tháng ${m}/${y}`,
    };
  }, [selectedMonth]);

  // Tải dữ liệu ca làm và bảng lương trong tháng
  async function loadData() {
    setLoading(true);
    try {
      const [schedData, holidayData, allRatesData] = await Promise.all([
        getScheduleByDateRange(monthStartDate, monthEndDate),
        getHolidaySettings(),
        getAllEmployeeRates(),
      ]);

      setShifts(Array.isArray(schedData) ? schedData : []);
      setHolidays(Array.isArray(holidayData) ? holidayData : []);

      // Tạo map mốc tăng lương lịch sử của tất cả nhân viên (1 query duy nhất)
      const rMap = {};
      (allRatesData || []).forEach((r) => {
        if (!rMap[r.employee_id]) rMap[r.employee_id] = [];
        rMap[r.employee_id].push(r);
      });
      setRatesMap(rMap);
    } catch (err) {
      console.error('Lỗi khi tải báo cáo chi phí chi nhánh:', err);
      if (toast) toast.error('Lỗi', 'Không thể tải dữ liệu chi phí lương chi nhánh!');
    }
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, [monthStartDate, monthEndDate, employees]);

  // Điều hướng tháng
  function handlePrevMonth() {
    const [yStr, mStr] = selectedMonth.split('-');
    let y = parseInt(yStr, 10);
    let m = parseInt(mStr, 10) - 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    setSelectedMonth(`${y}-${String(m).padStart(2, '0')}`);
  }

  function handleNextMonth() {
    const [yStr, mStr] = selectedMonth.split('-');
    let y = parseInt(yStr, 10);
    let m = parseInt(mStr, 10) + 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    setSelectedMonth(`${y}-${String(m).padStart(2, '0')}`);
  }

  function handleCurrentMonth() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    setSelectedMonth(`${y}-${m}`);
  }

  // Map nhân viên theo ID để tra cứu nhanh
  const empMap = useMemo(() => {
    const map = {};
    (employees || []).forEach((e) => {
      map[e.id] = e;
    });
    return map;
  }, [employees]);

  // TÍNH TOÁN TỔNG LƯƠNG THEO TỪNG CHI NHÁNH CHÍNH XÁC 100%
  const { branchStats, grandTotalCost, grandTotalHours, grandTotalShifts } = useMemo(() => {
    const shiftsByBranch = {};
    const branchNameLookup = {};

    // Khởi tạo các chi nhánh chính thức từ DB (Dùng String(id) để chống lệch kiểu Number/UUID)
    (branches || []).forEach((b) => {
      const bKey = String(b.id);
      shiftsByBranch[bKey] = {
        branch: b,
        shifts: [],
      };
      if (b.name) {
        branchNameLookup[b.name.trim().toLowerCase()] = bKey;
      }
    });

    // Gom ca chuẩn xác từng ca vào đúng chi nhánh
    (shifts || []).forEach((s) => {
      if (!s) return;
      const rawBId = s.branch_id ? String(s.branch_id) : null;
      let matchedBranchKey = null;

      if (rawBId && shiftsByBranch[rawBId]) {
        matchedBranchKey = rawBId;
      } else if (s.branches?.name) {
        const byNameKey = branchNameLookup[s.branches.name.trim().toLowerCase()];
        if (byNameKey) matchedBranchKey = byNameKey;
      }

      if (matchedBranchKey) {
        shiftsByBranch[matchedBranchKey].shifts.push(s);
      } else if (rawBId) {
        // Chi nhánh cũ trong lịch sử ca
        if (!shiftsByBranch[rawBId]) {
          shiftsByBranch[rawBId] = {
            branch: s.branches || { id: rawBId, name: `CN #${rawBId}`, color: '#8b5cf6' },
            shifts: [],
          };
        }
        shiftsByBranch[rawBId].shifts.push(s);
      } else {
        // Ca chưa gán chi nhánh
        if (!shiftsByBranch['unassigned']) {
          shiftsByBranch['unassigned'] = {
            branch: { id: 'unassigned', name: 'Chưa gán chi nhánh', color: '#94a3b8' },
            shifts: [],
          };
        }
        shiftsByBranch['unassigned'].shifts.push(s);
      }
    });

    let gTotalCost = 0;
    let gTotalHours = 0;
    let gTotalShifts = 0;

    const stats = Object.keys(shiftsByBranch).map((bKey) => {
      const { branch, shifts: bShifts } = shiftsByBranch[bKey];

      // Gom ca theo từng nhân viên để tính lương chuẩn xác (kèm mốc lương & hệ số lễ)
      const empShiftsMap = {};
      bShifts.forEach((s) => {
        if (!s || !s.employee_id) return;
        const emp = empMap[s.employee_id] || { id: s.employee_id, name: s.employees?.name || 'Nhân viên' };
        if (isManagementAccount(emp)) return; // Bỏ qua tài khoản Quản Lý / Owner

        if (!empShiftsMap[s.employee_id]) {
          empShiftsMap[s.employee_id] = [];
        }
        empShiftsMap[s.employee_id].push(s);
      });

      let branchTotalCost = 0;
      let branchTotalHours = 0;
      const staffList = [];

      Object.keys(empShiftsMap).forEach((empId) => {
        const emp = empMap[empId] || { id: empId, name: empShiftsMap[empId][0]?.employees?.name || 'Nhân viên', hourly_rate: 20000 };
        const empRates = ratesMap[empId] || [];
        const empShifts = empShiftsMap[empId];

        const { totalHours, grossSalary } = calculateSalaryFromShifts(
          empShifts,
          empRates,
          emp.hourly_rate || 20000,
          holidays
        );

        branchTotalCost += grossSalary;
        branchTotalHours += totalHours;

        staffList.push({
          employeeId: empId,
          name: emp.name || 'Nhân viên',
          nickname: emp.nickname || '',
          shiftsCount: empShifts.length,
          totalHours: Math.round(totalHours * 100) / 100,
          totalSalary: Math.round(grossSalary),
        });
      });

      // Sắp xếp nhân viên theo số ca làm việc giảm dần
      staffList.sort((a, b) => b.shiftsCount - a.shiftsCount || b.totalHours - a.totalHours);

      gTotalCost += branchTotalCost;
      gTotalHours += branchTotalHours;
      gTotalShifts += bShifts.length;

      return {
        branchId: bKey,
        branch,
        shiftsCount: bShifts.length,
        totalHours: Math.round(branchTotalHours * 100) / 100,
        totalCost: Math.round(branchTotalCost),
        staffCount: staffList.length,
        staffList,
      };
    });

    // 1. Lọc bỏ các chi nhánh ĐÃ ẨN (is_active === false) mà KHÔNG có ca làm / chi phí nào trong tháng
    const filteredStats = stats.filter((s) => {
      const isHiddenBranch = s.branch?.is_active === false;
      if (isHiddenBranch && s.shiftsCount === 0) return false;
      return true;
    });

    // 2. Sắp xếp chi nhánh:
    // - Chi nhánh có phát sinh ca & lương (> 0đ) luôn đứng TRƯỚC chi nhánh 0đ
    // - Các chi nhánh cùng nhóm sắp xếp theo thứ tự sort_order
    // - Chi nhánh chưa gán luôn nằm ở cuối cùng
    filteredStats.sort((a, b) => {
      if (a.branchId === 'unassigned') return 1;
      if (b.branchId === 'unassigned') return -1;

      const hasCostA = a.totalCost > 0 || a.shiftsCount > 0 ? 1 : 0;
      const hasCostB = b.totalCost > 0 || b.shiftsCount > 0 ? 1 : 0;
      if (hasCostA !== hasCostB) return hasCostB - hasCostA;

      const orderA = a.branch?.sort_order ?? 999;
      const orderB = b.branch?.sort_order ?? 999;
      if (orderA !== orderB) return orderA - orderB;
      return b.totalCost - a.totalCost;
    });

    return {
      branchStats: filteredStats,
      grandTotalCost: gTotalCost,
      grandTotalHours: Math.round(gTotalHours * 100) / 100,
      grandTotalShifts: gTotalShifts,
    };
  }, [branches, shifts, empMap, ratesMap, holidays]);

  return (
    <div className="bg-white rounded-3xl p-5 sm:p-6 border border-purple-200/90 shadow-2xs space-y-5">
      {/* HEADER: TIÊU ĐỀ & BỘ CHỌN THÁNG */}
      <div className="flex items-center justify-between gap-3 flex-wrap border-b border-purple-100 pb-4">
        <div>
          <h2 className="font-black text-lg sm:text-xl text-purple-950 flex items-center gap-2">
            <span>💰</span> Tổng Chi Phí Lương Từng Chi Nhánh
          </h2>
          <p className="text-xs font-bold text-purple-700 mt-0.5">
            Tổng hợp tiền lương phải chi trả cho từng chi nhánh trong {monthLabel}
          </p>
        </div>

        {/* Nút Điều hướng Tháng */}
        <div className="flex items-center gap-1.5 bg-purple-50 p-1.5 rounded-2xl border border-purple-200/80 shadow-2xs">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="w-8 h-8 rounded-xl bg-white hover:bg-purple-200 text-purple-950 font-black text-xs border border-purple-200/60 cursor-pointer transition-all active:scale-90 flex items-center justify-center shadow-2xs"
            title="Tháng trước"
          >
            ◀
          </button>

          <div className="px-3 py-1 bg-white rounded-xl border border-purple-200 text-xs sm:text-sm font-black text-purple-950 flex items-center gap-1.5 shadow-2xs">
            <span>📅</span>
            <span>{monthLabel}</span>
          </div>

          <button
            type="button"
            onClick={handleNextMonth}
            className="w-8 h-8 rounded-xl bg-white hover:bg-purple-200 text-purple-950 font-black text-xs border border-purple-200/60 cursor-pointer transition-all active:scale-90 flex items-center justify-center shadow-2xs"
            title="Tháng sau"
          >
            ▶
          </button>

          <button
            type="button"
            onClick={handleCurrentMonth}
            className="px-2.5 py-1.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-black text-xs cursor-pointer border-0 transition-all active:scale-95 shadow-2xs"
          >
            Tháng Này
          </button>
        </div>
      </div>

      {/* BANNER TỔNG QUAN HỆ THỐNG */}
      <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-purple-900 via-purple-800 to-indigo-900 text-white shadow-xs flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xs font-black text-purple-200 uppercase tracking-wider flex items-center gap-1.5">
            <span>💳</span> TỔNG QUỸ LƯƠNG TOÀN BỘ HỆ THỐNG ({monthLabel})
          </div>
          <div className="text-2xl sm:text-3xl font-black tracking-tight text-white mt-1">
            {formatCurrency(grandTotalCost)}
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs font-extrabold text-purple-200">
          <div className="text-right">
            <div className="text-[11px] text-purple-300">Tổng Giờ Làm:</div>
            <div className="text-sm font-black text-white">{grandTotalHours.toLocaleString('vi-VN')} tiếng</div>
          </div>
          <div className="h-8 w-px bg-purple-700" />
          <div className="text-right">
            <div className="text-[11px] text-purple-300">Tổng Số Ca:</div>
            <div className="text-sm font-black text-white">{grandTotalShifts} ca</div>
          </div>
        </div>
      </div>

      {/* LƯỚI TỔNG LƯƠNG TỪNG CHI NHÁNH */}
      {loading ? (
        <div className="p-8 text-center bg-purple-50/50 rounded-2xl border border-purple-200">
          <div className="inline-block w-7 h-7 border-3 border-purple-200 border-t-purple-700 rounded-full animate-spin" />
          <p className="text-xs font-bold text-purple-700 mt-2">Đang tính toán chi phí lương các chi nhánh...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
          {branchStats.map((item) => {
            const { branchId, branch, shiftsCount, totalHours, totalCost, staffCount } = item;
            const style = getBranchColorStyle(branch.name, branch.color);
            const percentage = grandTotalCost > 0 ? Math.round((totalCost / grandTotalCost) * 1000) / 10 : 0;

            return (
              <div
                key={branchId}
                onClick={() => setSelectedBranchDetail(item)}
                className="p-4 sm:p-5 rounded-2xl bg-white border border-purple-200 shadow-2xs space-y-3 relative overflow-hidden transition-all hover:border-purple-400 hover:shadow-md cursor-pointer group"
                title="Bấm để xem danh sách nhân viên làm việc tại chi nhánh này"
              >
                {/* Header Card: Tên CN & Màu */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-4 h-4 rounded-full border border-purple-300 flex-shrink-0 shadow-2xs"
                      style={{ backgroundColor: style.hex }}
                    />
                    <h3 className="font-black text-base text-purple-950 group-hover:text-purple-700 transition-colors">
                      {branch.name}
                    </h3>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {branch.sort_order && (
                      <span className="text-[10px] font-black text-purple-900 bg-purple-100 px-2 py-0.5 rounded-md border border-purple-200">
                        Thứ tự #{branch.sort_order}
                      </span>
                    )}
                    <span className="text-xs text-purple-400 group-hover:text-purple-700 transition-colors">🔍</span>
                  </div>
                </div>

                {/* SỐ TIỀN LƯƠNG TO NỔI BẬT */}
                <div className="bg-purple-50/80 p-3 rounded-xl border border-purple-100 text-center space-y-0.5 group-hover:bg-purple-100/70 transition-colors">
                  <div className="text-[10.5px] font-extrabold text-purple-700 uppercase tracking-wide">
                    Tổng Tiền Lương Tháng
                  </div>
                  <div className="text-xl sm:text-2xl font-black text-purple-950 tracking-tight">
                    {formatCurrency(totalCost)}
                  </div>
                </div>

                {/* Thanh Tỷ Trọng Quỹ Lương */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-extrabold text-purple-900">
                    <span>Tỷ trọng:</span>
                    <span className="font-black text-purple-950">{percentage}% tổng quỹ</span>
                  </div>
                  <div className="w-full h-2 bg-purple-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(100, Math.max(0, percentage))}%`,
                        backgroundColor: style.hex || '#8b5cf6',
                      }}
                    />
                  </div>
                </div>

                {/* Các chỉ số phụ */}
                <div className="flex items-center justify-between text-[11.5px] font-extrabold text-purple-800 pt-2 border-t border-purple-100">
                  <span>⏱️ {totalHours}h</span>
                  <span>📋 {shiftsCount} ca</span>
                  <span className="bg-purple-100/90 text-purple-900 px-2 py-0.5 rounded-lg border border-purple-200/80 font-black">
                    👥 {staffCount} bạn
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL CHI TIẾT DANH SÁCH NHÂN VIÊN LÀM VIỆC TẠI CHI NHÁNH */}
      {mounted &&
        selectedBranchDetail &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-purple-950/60 backdrop-blur-xs animate-fade-in">
            <div
              className="bg-white rounded-3xl w-full max-w-xl max-h-[85vh] flex flex-col shadow-2xl border border-purple-200 overflow-hidden animate-scale-up"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header Modal */}
              <div className="p-4 sm:p-5 border-b border-purple-100 bg-gradient-to-r from-purple-900 to-indigo-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span
                    className="w-5 h-5 rounded-full border-2 border-white flex-shrink-0"
                    style={{ backgroundColor: selectedBranchDetail.branch?.color || '#8b5cf6' }}
                  />
                  <div>
                    <h3 className="text-base sm:text-lg font-black leading-tight">
                      Chi Nhánh {selectedBranchDetail.branch?.name} ({monthLabel})
                    </h3>
                    <p className="text-xs text-purple-200 font-semibold mt-0.5">
                      Danh sách {selectedBranchDetail.staffCount} nhân viên có ca làm tại chi nhánh này
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedBranchDetail(null)}
                  className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center text-sm font-black cursor-pointer transition-all active:scale-90 border-0"
                >
                  ✕
                </button>
              </div>

              {/* Thống kê nhanh */}
              <div className="grid grid-cols-3 gap-2 p-3.5 bg-purple-50/80 border-b border-purple-100 text-center text-xs font-bold text-purple-950">
                <div className="bg-white p-2 rounded-xl border border-purple-200/60">
                  <div className="text-[10px] text-purple-600 font-extrabold uppercase">Tổng Chi Phí</div>
                  <div className="font-black text-purple-900 text-sm mt-0.5">
                    {formatCurrency(selectedBranchDetail.totalCost)}
                  </div>
                </div>
                <div className="bg-white p-2 rounded-xl border border-purple-200/60">
                  <div className="text-[10px] text-purple-600 font-extrabold uppercase">Tổng Giờ Làm</div>
                  <div className="font-black text-purple-900 text-sm mt-0.5">
                    {selectedBranchDetail.totalHours}h
                  </div>
                </div>
                <div className="bg-white p-2 rounded-xl border border-purple-200/60">
                  <div className="text-[10px] text-purple-600 font-extrabold uppercase">Tổng Số Ca</div>
                  <div className="font-black text-purple-900 text-sm mt-0.5">
                    {selectedBranchDetail.shiftsCount} ca
                  </div>
                </div>
              </div>

              {/* Danh sách nhân viên */}
              <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-2 divide-y divide-purple-50">
                {selectedBranchDetail.staffList && selectedBranchDetail.staffList.length > 0 ? (
                  selectedBranchDetail.staffList.map((st, idx) => (
                    <div
                      key={st.employeeId || idx}
                      className="pt-2 first:pt-0 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-900 font-black text-[10px] flex items-center justify-center flex-shrink-0">
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="font-black text-purple-950 truncate text-sm">
                            {st.name}
                            {st.nickname && (
                              <span className="ml-1.5 text-[11px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.2 rounded border border-amber-200">
                                {st.nickname}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] font-bold text-purple-600">
                            {st.shiftsCount} ca • {st.totalHours} tiếng
                          </div>
                        </div>
                      </div>

                      <div className="text-right flex-shrink-0">
                        <div className="font-black text-purple-950 text-sm">
                          {formatCurrency(st.totalSalary)}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-6 text-xs text-purple-500 font-bold">
                    Không có nhân viên nào có ca làm tại chi nhánh này trong tháng.
                  </div>
                )}
              </div>

              {/* Footer Modal */}
              <div className="p-3 bg-purple-50/50 border-t border-purple-100 flex justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedBranchDetail(null)}
                  className="px-4 py-2 bg-purple-900 hover:bg-purple-950 text-white text-xs font-black rounded-xl cursor-pointer transition-all active:scale-95 border-0"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
