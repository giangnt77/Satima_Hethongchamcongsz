'use client';

import { useState, useEffect } from 'react';
import { getEmployees, verifyEmployeePin } from '@/lib/supabase';
import { getInitials } from '@/lib/utils';
import { useToast } from '@/components/Toast';
import CopyrightFooter from '@/components/CopyrightFooter';

/**
 * EmployeeSelector — Màn hình Chọn Nhân Viên + Bảo mật PIN 4 số.
 * - Tự động nhận diện thiết bị chính chủ từ localStorage (không phải nhập lại).
 * - Bàn phím số PIN 4 số siêu to dễ bấm cho cả người già.
 * - Hỗ trợ khởi tạo PIN lần đầu tiên nếu chưa có.
 */
export default function EmployeeSelector({ onSelect, loading: parentLoading }) {
  const toast = useToast();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  // Flow State
  const [searchQuery, setSearchQuery] = useState('');

  // Selected Employee for PIN Auth
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);
  const [rememberPin, setRememberPin] = useState(false); // Checkbox Ghi nhớ mật khẩu (Mặc định LUÔN TẮT)

  useEffect(() => {
    // 1. Nạp tức thì từ Cache trước (0.001s)
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('chems_employees_cache');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setEmployees(parsed);
            setLoading(false);
          }
        }
      } catch (e) {}
    }
    // 2. Nạp danh sách mới nhất từ Google Sheets
    loadEmployees();
  }, []);

  async function loadEmployees() {
    setLoading(true);
    try {
      const data = await getEmployees();
      if (Array.isArray(data) && data.length > 0) {
        setEmployees(data);
        try {
          localStorage.setItem('chems_employees_cache', JSON.stringify(data));
        } catch (e) {}
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }

  // Khi bấm chọn 1 Nhân viên từ danh sách
  async function handleSelectEmployeeCard(emp) {
    const savedPin = localStorage.getItem(`chemshoa_saved_pin_${emp.id}`);

    if (savedPin) {
      // Xác thực an toàn với Database mà không cần tải PIN về máy
      const isValid = await verifyEmployeePin(emp.id, savedPin);
      if (isValid) {
        // Đúng máy chính chủ -> Vào thẳng không cần nhập PIN!
        onSelect(emp.name, false);
        return;
      } else {
        // PIN đã bị Admin đổi trên hệ thống -> Xóa cache PIN cũ
        localStorage.removeItem(`chemshoa_saved_pin_${emp.id}`);
      }
    }

    // Yêu cầu nhập PIN 6 số do Admin cấp
    setSelectedEmp(emp);
    setPinInput('');
    setPinError(false);
    setRememberPin(false);
  }

  // Hủy ghi nhớ PIN trên máy này đối với nhân viên mượn thiết bị
  function handleClearSavedPin(empId, e) {
    e.stopPropagation();
    localStorage.removeItem(`chemshoa_saved_pin_${empId}`);
    toast.info('Đã xóa ghi nhớ', 'Đã xóa mật khẩu ghi nhớ trên thiết bị này!');
    // Render lại giao diện
    setEmployees([...employees]);
  }

  // Bàn phím bấm số PIN 6 số
  function handleKeypadPress(num) {
    setPinError(false);
    if (pinInput.length < 6) {
      const nextPin = pinInput + num;
      setPinInput(nextPin);
      if (nextPin.length === 6) {
        verifyPin(nextPin);
      }
    }
  }

  function handleKeypadDelete() {
    setPinError(false);
    setPinInput((prev) => prev.slice(0, -1));
  }

  // Xác thực mã PIN 6 số an toàn
  async function verifyPin(inputPin) {
    if (!selectedEmp) return;
    const isValid = await verifyEmployeePin(selectedEmp.id, inputPin);
    if (isValid) {
      if (rememberPin) {
        localStorage.setItem(`chemshoa_saved_pin_${selectedEmp.id}`, inputPin);
      } else {
        localStorage.removeItem(`chemshoa_saved_pin_${selectedEmp.id}`);
      }
      onSelect(selectedEmp.name, false);
    } else {
      setPinError(true);
      setTimeout(() => setPinInput(''), 400);
    }
  }


  if (loading) {
    return (
      <div className="min-h-screen flex flex-col px-4 relative z-10">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-20 h-20 mx-auto mb-3">
              <img src="/logo.png" alt="SATIMA - Salary & Timekeeping Management System" className="w-52 h-auto mx-auto animate-pulse" />
            </div>
            <div className="inline-block w-8 h-8 border-3 border-purple-200 border-t-purple-700 rounded-full animate-spin mt-2" />
            <p className="mt-2 text-xs font-black text-purple-800 uppercase tracking-widest">Đang tải danh sách...</p>
          </div>
        </div>
        <CopyrightFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col px-4 py-8 relative z-10">
      <div className="w-full max-w-md my-auto mx-auto">
        {/* Header Branding */}
        <div className="text-center mb-6 sm:mb-8 animate-fade-in-up">
          <div className="w-72 max-w-full mx-auto mb-4 relative flex items-center justify-center">
            <img
              src="/logo.png"
              alt="SATIMA - Salary & Timekeeping Management System"
              className="w-full h-auto object-contain drop-shadow-md hover:scale-[1.02] transition-transform"
            />
          </div>
          <p className="text-purple-700 text-xs sm:text-sm font-black">
            Chọn tên để đăng nhập
          </p>
        </div>

        {/* =========================================================================
           POPUP / POP-OVER NHẬP MÃ PIN 6 SỐ (BRAND PURPLE THEME)
           ========================================================================= */}
        {selectedEmp ? (
          <div className="bg-white rounded-2xl p-6 md:p-8 animate-scale-in shadow-xs border border-purple-200">
            <div className="flex items-center justify-between mb-4 border-b border-purple-100 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-purple-700 text-white flex items-center justify-center font-black text-lg shadow-2xs">
                  {getInitials(selectedEmp.name)}
                </div>
                <div>
                  <h3 className="font-black text-purple-950 text-lg">{selectedEmp.name}</h3>
                  <p className="text-xs text-purple-700 font-black">
                    🔐 Nhập mã PIN 6 số do Admin cấp
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEmp(null)}
                className="w-8 h-8 rounded-full bg-purple-50 text-purple-700 hover:text-purple-950 hover:bg-purple-100 flex items-center justify-center border-0 cursor-pointer text-sm font-black"
              >
                ✕
              </button>
            </div>

            {/* Hiển thị 6 Ô Tròn PIN */}
            <div className="space-y-6">
              <div className="text-center">
                <p className="text-xs text-purple-900 mb-3 font-extrabold">
                  Nhập 6 số PIN bảo mật của bạn:
                </p>
                <div className="flex justify-center gap-2.5 sm:gap-3">
                  {[0, 1, 2, 3, 4, 5].map((idx) => {
                    const filled = pinInput.length > idx;
                    return (
                      <div
                        key={idx}
                        className={`w-10 h-11 sm:w-11 sm:h-12 rounded-xl border-2 flex items-center justify-center text-xl font-black transition-all ${
                          filled
                            ? 'border-purple-600 bg-purple-100 text-purple-950 shadow-2xs'
                            : pinError
                            ? 'border-rose-500 bg-rose-100 text-rose-900 animate-shake'
                            : 'border-purple-200 bg-purple-50/50 text-purple-950'
                        }`}
                      >
                        {filled ? '●' : ''}
                      </div>
                    );
                  })}
                </div>
                {pinError && (
                  <p className="text-xs text-rose-600 font-black mt-2 animate-bounce">
                    ❌ Mã PIN không đúng! Vui lòng thử lại.
                  </p>
                )}

                {/* Checkbox Tùy Chọn Ghi Nhớ Mật Khẩu PIN */}
                <div className="mt-3.5 p-2.5 rounded-xl bg-purple-50 border border-purple-200/80">
                  <label className="flex items-center justify-center gap-2 cursor-pointer text-xs font-black text-purple-950 select-none">
                    <input
                      type="checkbox"
                      checked={rememberPin}
                      onChange={(e) => setRememberPin(e.target.checked)}
                      className="w-4 h-4 rounded text-purple-700 focus:ring-purple-500 cursor-pointer accent-purple-700"
                    />
                    <span>Ghi nhớ mật khẩu PIN trên máy này</span>
                  </label>
                  <p className="text-[10px] text-purple-700 font-bold mt-1 text-center">
                    {rememberPin
                      ? '💡 Lần sau bấm vào tên bạn sẽ vào thẳng không cần nhập PIN.'
                      : '⚠️ Bỏ tích nếu đang mượn máy người khác để tránh lưu PIN!'}
                  </p>
                </div>
              </div>

              {/* Bàn Phím Số 0-9 */}
              <div className="grid grid-cols-3 gap-2.5 sm:gap-3 pt-2">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => handleKeypadPress(String(num))}
                    className="py-3.5 bg-purple-50 hover:bg-purple-100 active:scale-95 rounded-xl font-black text-2xl text-purple-950 border border-purple-200/80 cursor-pointer transition-all shadow-2xs"
                  >
                    {num}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    toast.info('Quên PIN 6 số?', 'Hãy nhờ Admin / Owner đặt lại mã PIN 6 số mới cho bạn!');
                  }}
                  className="py-3 bg-transparent text-purple-600 hover:text-purple-950 rounded-xl text-[11px] font-bold border-0 cursor-pointer flex items-center justify-center text-center"
                >
                  Quên PIN?
                </button>
                <button
                  type="button"
                  onClick={() => handleKeypadPress('0')}
                  className="py-3.5 bg-purple-50 hover:bg-purple-100 active:scale-95 rounded-xl font-black text-2xl text-purple-950 border border-purple-200/80 cursor-pointer transition-all shadow-2xs"
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={handleKeypadDelete}
                  className="py-3 text-rose-700 bg-rose-50 hover:bg-rose-100 active:scale-95 rounded-xl font-black text-xl border border-rose-200 cursor-pointer transition-all flex items-center justify-center"
                >
                  ⌫
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* =========================================================================
             DANH SÁCH THẺ NHÂN VIÊN (TOUCH CARDS PURPLE BRAND THEME)
             ========================================================================= */
          <div className="space-y-3 animate-fade-in-up-delay-1">
            {/* Ô TÌM KIẾM NHANH TÊN NHÂN VIÊN */}
            {employees.length > 3 && (
              <div className="relative mb-3">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="🔍 Gõ tên của bạn để tìm nhanh..."
                  className="w-full px-4 py-3 bg-white border border-purple-200 focus:border-purple-600 rounded-xl text-purple-950 text-sm font-bold outline-none transition-all placeholder:text-purple-400 shadow-2xs"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-purple-600 hover:text-purple-950 bg-purple-100 w-6 h-6 rounded-full flex items-center justify-center border-0 cursor-pointer font-black"
                  >
                    ✕
                  </button>
                )}
              </div>
            )}

            {(() => {
              let recentIds = [];
              try {
                recentIds = JSON.parse(localStorage.getItem('chemshoa_recent_logins') || '[]');
              } catch (e) {}

              // Lọc bỏ tài khoản Admin & lọc theo ô tìm kiếm (vẫn giữ nguyên nhân viên xin nghỉ ngắn ngày status === 'leave')
              const filtered = employees.filter((e) => {
                if (e.role === 'owner' || e.role === 'manager') return false;
                return e.name.toLowerCase().includes(searchQuery.trim().toLowerCase());
              });

              // Sắp xếp: Ưu tiên tài khoản ĐÃ TỪNG ĐĂNG NHẬP LÊN ĐẦU DANH SÁCH!
              const sortedFiltered = [...filtered].sort((a, b) => {
                const idxA = recentIds.indexOf(a.id);
                const idxB = recentIds.indexOf(b.id);
                if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                if (idxA !== -1) return -1;
                if (idxB !== -1) return 1;
                return 0;
              });

              if (sortedFiltered.length === 0) {
                return (
                  <div className="text-center py-8 px-4 bg-white rounded-2xl border border-purple-200 text-purple-600 space-y-3">
                    <div className="text-3xl">👥</div>
                    <p className="text-sm font-bold">
                      {searchQuery ? `Không tìm thấy "${searchQuery}"` : 'Đang kết nối hoặc chưa tải được danh sách nhân viên'}
                    </p>
                    <div className="flex items-center justify-center gap-3 flex-wrap">
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => setSearchQuery('')}
                          className="px-3 py-1.5 rounded-xl bg-purple-100 text-purple-900 text-xs font-black cursor-pointer"
                        >
                          Xóa tìm kiếm
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={loadEmployees}
                        className="px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-black shadow-xs cursor-pointer active:scale-95 transition-all flex items-center gap-1.5 mx-auto"
                      >
                        <span>🔄</span>
                        <span>Tải lại danh sách nhân viên</span>
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div className="space-y-2.5 max-h-[55vh] overflow-y-auto pr-1 custom-scrollbar">
                  {sortedFiltered.map((emp, idx) => {
                    const isRecent = recentIds.includes(emp.id);
                    const isShortLeave = emp.status === 'leave';
                    const hasSavedPin = typeof window !== 'undefined' && !!localStorage.getItem(`chemshoa_saved_pin_${emp.id}`);
                    const badgeBgs = [
                      'bg-purple-700 text-white',
                      'bg-amber-600 text-white',
                      'bg-emerald-700 text-white',
                      'bg-rose-600 text-white',
                      'bg-blue-600 text-white',
                    ];
                    const badgeBg = badgeBgs[idx % badgeBgs.length];

                    return (
                      <div
                        key={emp.id}
                        onClick={() => handleSelectEmployeeCard(emp)}
                        className={`w-full flex items-center gap-3.5 p-3.5 rounded-2xl cursor-pointer border transition-all text-left group shadow-2xs ${
                          isRecent
                            ? 'bg-amber-50/90 hover:bg-amber-100/90 border-amber-300 shadow-xs'
                            : 'bg-white hover:bg-purple-50/70 border-purple-200/90 hover:border-purple-500'
                        }`}
                      >
                        <div className={`w-12 h-12 rounded-xl ${badgeBg} flex items-center justify-center font-black text-base flex-shrink-0 shadow-2xs group-hover:scale-105 transition-transform`}>
                          {getInitials(emp.name)}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-base sm:text-lg font-black text-purple-950 truncate">
                              {emp.name}
                            </span>
                            {isShortLeave && (
                              <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-950 text-[10px] font-black border border-amber-300">
                                🟡 Xin nghỉ ngắn ngày
                              </span>
                            )}
                            {isRecent && !hasSavedPin && (
                              <span className="px-2 py-0.5 rounded-md bg-amber-400 text-purple-950 text-[10px] font-black tracking-tight border border-amber-500/50 shadow-2xs">
                                ⭐ Đã từng đăng nhập
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-purple-700 font-extrabold block mt-0.5">
                            {hasSavedPin ? '🔑 Đã ghi nhớ PIN • Bấm để vào thẳng →' : '🔒 Bấm để chọn & nhập PIN xem lịch →'}
                          </span>
                        </div>

                        {/* NÚT HỦY LƯU PIN DỜI RA NGOÀI CÙNG BÊN PHẢI - TRÁNH BẤM NHẦM KHI CHỌN TÊN */}
                        {hasSavedPin && (
                          <button
                            type="button"
                            onClick={(e) => handleClearSavedPin(emp.id, e)}
                            className="ml-auto shrink-0 px-2.5 py-1.5 rounded-xl bg-rose-100 text-rose-900 hover:bg-rose-600 hover:text-white text-[11px] font-black border border-rose-300 transition-all cursor-pointer shadow-2xs active:scale-95 z-10"
                            title="Bấm để xóa mật khẩu ghi nhớ PIN trên máy này"
                          >
                            🔓 Hủy lưu PIN
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {employees.length === 0 && (
              <div className="text-center py-10 bg-white rounded-2xl border border-purple-200 text-purple-500">
                <div className="text-4xl mb-2 opacity-60">👥</div>
                <p className="text-sm font-bold">Chưa có nhân viên nào trong danh sách</p>
              </div>
            )}

            {/* Ghi chú bảo mật Admin */}
            <div className="pt-2 text-center text-xs text-purple-700 font-bold border-t border-purple-200/70">
              💡 <span className="text-purple-900 font-black">Lưu ý:</span> Mã PIN do Admin cấp. Nếu chưa có tài khoản, vui lòng báo Admin.
            </div>
          </div>
        )}
        {!selectedEmp && (
          <div className="mt-4 text-center">
            <a
              href={typeof window !== 'undefined' && window.__GAS_WEB_APP_URL
                ? `${window.__GAS_WEB_APP_URL}?page=admin`
                : '/adchemshoa'}
              target={typeof window !== 'undefined' && window.google?.script?.run ? '_top' : undefined}
              className="inline-flex items-center justify-center px-4 py-2 rounded-xl border border-purple-200 bg-white/80 text-purple-800 hover:bg-purple-50 text-sm font-bold shadow-2xs transition-colors"
            >
              Đăng nhập quản trị
            </a>
          </div>
        )}
      </div>
      <CopyrightFooter />
    </div>
  );
}
