import { googleSheets } from './google-sheets';

export const supabase = googleSheets;

export async function logoutDataSession() {
  const { error } = await googleSheets.logout();
  if (error) throw new Error(error.message || 'Không thể đăng xuất phiên dữ liệu.');
}

export async function getMonthlySalaryConfirmation(month) {
  const { data, error } = await googleSheets.getSalaryConfirmation(month);
  if (error) throw new Error(error.message || 'Không thể tải xác nhận bảng lương.');
  return data;
}

export async function confirmMonthlySalary(month) {
  const { data, error } = await googleSheets.confirmSalary(month);
  if (error) throw new Error(error.message || 'Không thể lưu xác nhận bảng lương.');
  return data;
}

export async function getWeeklyRegistrationLockDay() {
  checkSupabase();
  const { data, error } = await supabase
    .from('system_settings')
    .select('*')
    .eq('key', 'weekly_registration_lock_day')
    .maybeSingle();
  if (error) throw error;

  const value = data?.value;
  if (value === undefined || value === null) return 0;
  if (value === 'disabled' || value === false) return null;

  const day = Number(value);
  if (Number.isInteger(day) && day >= 0 && day <= 6) return day;
  throw new Error('Ngày khóa đăng ký tuần trong cấu hình không hợp lệ.');
}

export async function saveWeeklyRegistrationLockDay(day) {
  if (day !== null && (!Number.isInteger(day) || day < 0 || day > 6)) {
    throw new RangeError('Ngày khóa đăng ký phải là một thứ trong tuần hoặc tắt.');
  }

  checkSupabase();
  const { error } = await supabase
    .from('system_settings')
    .upsert({
      key: 'weekly_registration_lock_day',
      value: day === null ? 'disabled' : day,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' });
  if (error) throw error;
}

function checkSupabase() {
  if (!supabase) throw new Error('Google Sheets chưa được cấu hình.');
}

// ============================================
// BASE SELECT & CLIENT CACHING UTILITIES (GIẢM 99% SUPABASE EGRESS)
// ============================================

// Cột select công khai cho nhân viên & client (KHÔNG chứa mã PIN để chống rò rỉ mã PIN bảo mật)
export const EMP_PUBLIC_SELECT =
  'id, name, nickname, nickname_updated_at, role, hourly_rate, status, is_active, sort_order, phone, relative_phone, address, bank_name, bank_account_number, bank_account_holder, bank_qr_code_url, off_start_date, off_end_date, resigned_at, note, created_at';

// Cột select đầy đủ cho trang Admin quản lý (chứa pin)
export const EMP_BASE_SELECT =
  'id, name, nickname, nickname_updated_at, role, hourly_rate, pin, status, is_active, sort_order, phone, relative_phone, address, bank_name, bank_account_number, bank_account_holder, bank_qr_code_url, off_start_date, off_end_date, resigned_at, note, created_at';

const CACHE_TTL_MS = 5 * 60 * 1000; // Bộ nhớ đệm 5 phút cho dữ liệu cấu hình ít thay đổi

function getCache(key) {
  if (typeof window === 'undefined') return null;
  try {
    const itemStr = localStorage.getItem(`chems_cache_${key}`);
    if (!itemStr) return null;
    const item = JSON.parse(itemStr);
    if (Date.now() - item.time < CACHE_TTL_MS) {
      return item.data;
    }
  } catch (e) {}
  return null;
}

function setCache(key, data) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`chems_cache_${key}`, JSON.stringify({ data, time: Date.now() }));
  } catch (e) {}
}

function clearCache(key) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(`chems_cache_${key}`);
  } catch (e) {}
}

// ============================================
// SYSTEM SETTINGS / RULES FOR BLOCKED OFF DAYS
// ============================================

export async function getBlockedOffDays() {
  const cached = getCache('blocked_off_days');
  if (cached) return cached;

  let localFallback = {};
  if (typeof window !== 'undefined') {
    try {
      const localData = localStorage.getItem('chems_blocked_off_days');
      if (localData) localFallback = JSON.parse(localData);
    } catch (e) {}
  }

  try {
    if (supabase) {
      const { data, error } = await supabase
        .from('system_settings')
        .select('*')
        .eq('key', 'blocked_off_days')
        .maybeSingle();
      if (!error && data && data.value !== undefined && data.value !== null) {
        setCache('blocked_off_days', data.value);
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('chems_blocked_off_days', JSON.stringify(data.value));
          } catch (e) {}
        }
        return data.value;
      }
    }
  } catch (err) {
    console.error('getBlockedOffDays error:', err);
  }

  return localFallback;
}

export async function saveBlockedOffDays(daysList) {
  setCache('blocked_off_days', daysList);
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('chems_blocked_off_days', JSON.stringify(daysList));
    } catch (e) {}
  }

  try {
    if (supabase) {
      const { error } = await supabase
        .from('system_settings')
        .upsert({ key: 'blocked_off_days', value: daysList, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (error) console.error('saveBlockedOffDays error:', error);
    }
  } catch (err) {
    console.error('saveBlockedOffDays error:', err);
  }
  return daysList;
}

// ============================================
// SYSTEM ANNOUNCEMENT NOTICES (TỰ ĐỘNG LƯU SUPABASE)
// ============================================

export async function getAnnouncementNotice() {
  const DEFAULT_NOTICE = '📌 THÔNG BÁO TỪ QUẢN LÝ:\n- Hãy chốt và đăng ký lịch rảnh tuần tới trước 22:00 Chủ Nhật hàng tuần.\n- Kiểm tra các ngày Cao Điểm cấm Off trước khi gửi yêu cầu xin nghỉ!';

  const cached = getCache('announcement_notice');
  if (cached) return cached;

  try {
    if (supabase) {
      const { data, error } = await supabase
        .from('system_settings')
        .select('*')
        .eq('key', 'announcement_notice')
        .single();
      if (!error && data?.value) {
        setCache('announcement_notice', String(data.value));
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('chems_admin_notice_content', String(data.value));
          } catch (e) {}
        }
        return String(data.value);
      }
    }
  } catch (err) {}

  if (typeof window !== 'undefined') {
    try {
      const localData = localStorage.getItem('chems_admin_notice_content');
      if (localData) return localData;
    } catch (e) {}
  }
  return DEFAULT_NOTICE;
}

export async function saveAnnouncementNotice(content) {
  const cleanText = String(content || '').trim();
  setCache('announcement_notice', cleanText);
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('chems_admin_notice_content', cleanText);
    } catch (e) {}
  }

  try {
    if (supabase) {
      await supabase
        .from('system_settings')
        .upsert({ key: 'announcement_notice', value: cleanText }, { onConflict: 'key' });
    }
  } catch (err) {}
  return cleanText;
}

// ============================================
// CHẾ ĐỘ ĐĂNG KÝ DỊP ĐẶC BIỆT (TẾT/LỄ 1 THÁNG)
// ============================================

export async function getSpecialEventMode() {
  const cached = getCache('special_event_mode');
  if (cached !== null && cached !== undefined) return Boolean(cached);

  try {
    if (supabase) {
      const { data, error } = await supabase
        .from('system_settings')
        .select('*')
        .eq('key', 'special_event_mode')
        .single();
      if (!error && data?.value !== undefined) {
        const val = Boolean(data.value);
        setCache('special_event_mode', val);
        return val;
      }
    }
  } catch (err) {}

  if (typeof window !== 'undefined') {
    try {
      const localMode = localStorage.getItem('chems_special_event_mode');
      if (localMode !== null) return localMode === 'true';
    } catch (e) {}
  }
  return false;
}

export async function saveSpecialEventMode(enabled) {
  const isEnabled = Boolean(enabled);
  setCache('special_event_mode', isEnabled);
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('chems_special_event_mode', String(isEnabled));
    } catch (e) {}
  }

  try {
    if (supabase) {
      await supabase
        .from('system_settings')
        .upsert({ key: 'special_event_mode', value: isEnabled }, { onConflict: 'key' });
    }
  } catch (err) {}
  return isEnabled;
}

// ============================================
// SHIFT SWAP EMAIL NOTIFICATIONS
// ============================================

export async function getShiftSwapEmailConfig() {
  const { data, error } = await supabase
    .from('system_settings')
    .select('*')
    .eq('key', 'shift_swap_email_config')
    .maybeSingle();
  if (error) throw error;
  const value = data?.value && typeof data.value === 'object' ? data.value : {};
  return { email: String(value.email || '') };
}

export async function saveShiftSwapEmailConfig(email) {
  const emailClean = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailClean)) {
    throw new Error('Vui lòng nhập địa chỉ email hợp lệ.');
  }
  const { error } = await supabase
    .from('system_settings')
    .upsert({
      key: 'shift_swap_email_config',
      value: { email: emailClean },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' });
  if (error) throw error;

  const { error: legacyError } = await supabase
    .from('system_settings')
    .delete()
    .eq('key', 'telegram_config');
  if (legacyError) throw legacyError;
  if (typeof window !== 'undefined') {
    localStorage.removeItem('chems_telegram_bot_token');
    localStorage.removeItem('chems_telegram_chat_id');
  }
  return { email: emailClean };
}

// ============================================
// CHỐT LỊCH TUẦN / KHÓA LỊCH GỐC
// ============================================

export async function getWeekLockStatus(mondayStr) {
  if (!mondayStr) return false;
  const key = `locked_week_${mondayStr}`;
  checkSupabase();
  const { data, error } = await supabase
    .from('system_settings')
    .select('*')
    .eq('key', key)
    .maybeSingle();
  if (error) throw error;

  const isLocked = data?.value === true || data?.value === 'true';
  setCache(key, isLocked);
  return isLocked;
}

export async function saveWeekLockStatus(mondayStr, isLocked) {
  if (!mondayStr) return false;
  const key = `locked_week_${mondayStr}`;
  const val = Boolean(isLocked);
  setCache(key, val);

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(`chems_${key}`, String(val));
    } catch (e) {}
  }

  checkSupabase();
  const { error } = await supabase
    .from('system_settings')
    .upsert({ key, value: val }, { onConflict: 'key' });
  if (error) throw error;
  return val;
}

// ============================================
// CẤU HÌNH NGÀY LỄ / TẾT & HỆ SỐ LƯƠNG (x2, x3...)
// ============================================

export async function getHolidaySettings() {
  const cached = getCache('holiday_rates');
  if (cached) return cached;

  let localFallback = [];
  if (typeof window !== 'undefined') {
    try {
      const localData = localStorage.getItem('chems_holiday_rates');
      if (localData) {
        localFallback = JSON.parse(localData);
        if (!Array.isArray(localFallback)) localFallback = [];
      }
    } catch (e) {}
  }

  try {
    if (supabase) {
      const { data, error } = await supabase
        .from('system_settings')
        .select('*')
        .eq('key', 'holiday_rates')
        .maybeSingle();
      if (!error && data && data.value !== undefined && data.value !== null) {
        const val = Array.isArray(data.value) ? data.value : [];
        setCache('holiday_rates', val);
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('chems_holiday_rates', JSON.stringify(val));
          } catch (e) {}
        }
        return val;
      }
    }
  } catch (err) {
    console.error('getHolidaySettings error:', err);
  }

  return localFallback;
}

export async function saveHolidaySettings(holidaysList) {
  const cleanList = Array.isArray(holidaysList) ? holidaysList : [];
  setCache('holiday_rates', cleanList);
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('chems_holiday_rates', JSON.stringify(cleanList));
    } catch (e) {}
  }

  try {
    if (supabase) {
      const { error } = await supabase
        .from('system_settings')
        .upsert({ key: 'holiday_rates', value: cleanList, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (error) console.error('saveHolidaySettings error:', error);
    }
  } catch (err) {
    console.error('saveHolidaySettings error:', err);
  }
  return cleanList;
}

/**
 * Tìm thông tin ngày lễ cho một ngày cụ thể (nếu có)
 */
export function getHolidayForDate(dateStr, holidaysList = []) {
  if (!dateStr || !Array.isArray(holidaysList) || holidaysList.length === 0) return null;
  const targetDate = String(dateStr).slice(0, 10);
  return holidaysList.find((h) => {
    if (!h) return false;
    if (h.date && String(h.date).slice(0, 10) === targetDate) return true;
    if (h.startDate && h.endDate) {
      const s = String(h.startDate).slice(0, 10);
      const e = String(h.endDate).slice(0, 10);
      return targetDate >= s && targetDate <= e;
    }
    return false;
  }) || null;
}

// ============================================
// EMPLOYEE OPERATIONS
// ============================================

export async function getEmployees() {
  checkSupabase();
  try {
    const { data, error } = await supabase
      .from('employees')
      .select(EMP_PUBLIC_SELECT)
      .order('sort_order', { ascending: true, nullsFirst: false });
    if (error) throw error;
    const list = (data || []).map((e) => {
      let ext = {};
      if (typeof window !== 'undefined') {
        try {
          const cached = localStorage.getItem(`chems_emp_status_ext_${e.id}`);
          if (cached) ext = JSON.parse(cached);
          const cachedNick = localStorage.getItem(`chems_emp_nickname_${e.id}`);
          if (cachedNick !== null) ext.nickname = cachedNick;
          const cachedNickTime = localStorage.getItem(`chems_emp_nick_time_${e.id}`);
          if (cachedNickTime) ext.nickname_updated_at = cachedNickTime;
        } catch (err) {}
      }
      if (e.note && e.note.startsWith('{')) {
        try {
          const parsed = JSON.parse(e.note);
          ext = { ...ext, ...parsed };
        } catch (err) {}
      }
      const finalNick = e.nickname !== undefined && e.nickname !== null ? e.nickname : ext.nickname || '';
      const finalNickTime = e.nickname_updated_at || ext.nickname_updated_at || null;
      return { ...e, ...ext, nickname: finalNick, nickname_updated_at: finalNickTime };
    });

    // GIỮ LẠI CÁC NHÂN VIÊN ĐANG LÀM ('active') VÀ XIN OFF TẠM THỜI ('leave'), chỉ lọc bỏ người đã nghỉ hẳn ('off')
    const res = list.filter((e) => e.status !== 'off' && e.is_active !== false);

    if (res.length > 0 && typeof window !== 'undefined') {
      try {
        localStorage.setItem('chems_employees_cache', JSON.stringify(res));
      } catch (e) {}
    }
    return res;
  } catch (err) {
    console.error('getEmployees Error:', err);
    // Try fallback to local storage cache if Network/Safari Fetch throws
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('chems_employees_cache');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch (e) {}
    }
    return [];
  }
}

function getLocalTodayStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Cờ chống chạy trùng lặp: chỉ auto-reactivate 1 lần mỗi phiên trình duyệt
let _reactivatedThisSession = false;

/**
 * Tự động chuyển trạng thái 'leave' → 'active' cho nhân viên đã hết ngày Off.
 * Chỉ chạy 1 lần duy nhất mỗi phiên trình duyệt để tránh race condition.
 */
async function autoReactivateExpiredLeaves(employeeList) {
  if (_reactivatedThisSession) return;
  _reactivatedThisSession = true;

  const todayStr = getLocalTodayStr();
  const toReactivate = employeeList.filter((e) => {
    if (e.status !== 'leave') return false;
    const offEnd = e.off_end_date || e.off_date || e.off_start_date;
    return offEnd && todayStr > offEnd;
  });

  if (toReactivate.length === 0) return;

  // Đồng bộ lên DB 1 lần duy nhất cho tất cả nhân viên cần reactivate
  try {
    await Promise.all(
      toReactivate.map((e) =>
        supabase.from('employees').update({ status: 'active' }).eq('id', e.id)
      )
    );
  } catch (err) {
    console.warn('autoReactivateExpiredLeaves error:', err);
  }
}

export async function getAllEmployees(includePin = false) {
  checkSupabase();
  const selectQuery = includePin ? EMP_BASE_SELECT : EMP_PUBLIC_SELECT;
  try {
    const { data, error } = await supabase
      .from('employees')
      .select(selectQuery)
      .order('sort_order', { ascending: true, nullsFirst: false });
    if (error) throw error;
    const todayStr = getLocalTodayStr();
    const list = (data || []).map((e) => {
      let ext = {};
      if (typeof window !== 'undefined') {
        try {
          const cached = localStorage.getItem(`chems_emp_status_ext_${e.id}`);
          if (cached) ext = JSON.parse(cached);
          const cachedNick = localStorage.getItem(`chems_emp_nickname_${e.id}`);
          if (cachedNick !== null) ext.nickname = cachedNick;
          const cachedNickTime = localStorage.getItem(`chems_emp_nick_time_${e.id}`);
          if (cachedNickTime) ext.nickname_updated_at = cachedNickTime;
        } catch (err) {}
      }
      if (e.note && e.note.startsWith('{')) {
        try {
          const parsed = JSON.parse(e.note);
          ext = { ...ext, ...parsed };
        } catch (err) {}
      }

      const finalNick = e.nickname !== undefined && e.nickname !== null ? e.nickname : ext.nickname || '';
      const finalNickTime = e.nickname_updated_at || ext.nickname_updated_at || null;
      let empObj = { ...e, ...ext, nickname: finalNick, nickname_updated_at: finalNickTime };

      // Chuyển trạng thái leave -> active trên UI (DB sẽ sync bởi autoReactivateExpiredLeaves)
      if (empObj.status === 'leave') {
        const offEnd = empObj.off_end_date || empObj.off_date || empObj.off_start_date;
        if (offEnd && todayStr > offEnd) {
          empObj.status = 'active';
        }
      }

      return empObj;
    });

    // Trigger auto-reactivate 1 lần duy nhất (không block UI)
    autoReactivateExpiredLeaves(data || []);

    return list.sort((a, b) => {
      const isOffA = a.status === 'off';
      const isOffB = b.status === 'off';
      if (isOffA !== isOffB) return isOffA ? 1 : -1;
      return 0;
    });
  } catch (err) {
    const { data, error } = await supabase
      .from('employees')
      .select(selectQuery)
      .order('name');
    if (error) throw error;
    const todayStr = getLocalTodayStr();
    const list = (data || []).map((e) => {
      let ext = {};
      if (typeof window !== 'undefined') {
        try {
          const cached = localStorage.getItem(`chems_emp_status_ext_${e.id}`);
          if (cached) ext = JSON.parse(cached);
        } catch (err) {}
      }

      let empObj = { ...e, ...ext };

      if (empObj.status === 'leave') {
        const offEnd = empObj.off_end_date || empObj.off_date || empObj.off_start_date;
        if (offEnd && todayStr > offEnd) {
          empObj.status = 'active';
        }
      }

      return empObj;
    });

    autoReactivateExpiredLeaves(data || []);

    return list.sort((a, b) => {
      const isOffA = a.status === 'off';
      const isOffB = b.status === 'off';
      if (isOffA !== isOffB) return isOffA ? 1 : -1;
      return 0;
    });
  }
}

export async function updateEmployeesSortOrders(employeeOrders) {
  checkSupabase();
  const promises = employeeOrders.map(({ id, sort_order }) =>
    supabase
      .from('employees')
      .update({ sort_order })
      .eq('id', id)
  );
  const results = await Promise.all(promises);
  return results;
}

/**
 * Tải ảnh CCCD on-demand chỉ khi cần xem chi tiết để tiết kiệm 99% Egress
 */
export async function getEmployeeCccd(id) {
  checkSupabase();
  try {
    const { data, error } = await supabase
      .from('employees')
      .select('cccd_url')
      .eq('id', id)
      .single();
    if (error) return '';
    const imageUrl = data?.cccd_url || '';
    if (imageUrl.startsWith('drive:')) {
      const { data: image, error: imageError } = await googleSheets.downloadEmployeeCccd(imageUrl.slice(6));
      if (imageError) throw new Error(imageError.message || 'Không thể tải ảnh CCCD từ Google Drive.');
      if (!image?.mimeType || !image?.base64) return '';
      return `data:${image.mimeType};base64,${image.base64}`;
    }
    return imageUrl;
  } catch (err) {
    console.error('getEmployeeCccd error:', err);
    return '';
  }
}

export async function updateEmployeeContactInfo(id, contactData = {}) {
  checkSupabase();
  const payload = {};
  if (contactData.phone !== undefined) payload.phone = contactData.phone;
  if (contactData.relative_phone !== undefined) payload.relative_phone = contactData.relative_phone;
  if (contactData.address !== undefined) payload.address = contactData.address;
  if (contactData.cccd_url !== undefined) payload.cccd_url = contactData.cccd_url;

  const { data, error } = await supabase
    .from('employees')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Lưu ảnh CCCD trong Google Drive và chỉ lưu URL vào bảng employees.
 */
export async function uploadEmployeeCccdToStorage(employeeId, file) {
  checkSupabase();
  try {
    // 1. Nén ảnh qua Canvas Blob trước khi upload (giảm file xuống ~60KB)
    const blob = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const maxWidth = 900;
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Lỗi chuyển đổi Blob'))), 'image/jpeg', 0.7);
        };
        img.onerror = (err) => reject(err);
        img.src = e.target.result;
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });

    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('Không thể đọc ảnh CCCD.'));
      reader.readAsDataURL(blob);
    });
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw new Error('Định dạng ảnh CCCD không hợp lệ.');

    const { data, error } = await googleSheets.uploadEmployeeCccd(employeeId, match[2], match[1]);
    if (error) throw new Error(error.message || 'Không thể lưu ảnh CCCD lên Google Drive.');
    const fileId = data?.fileId || '';
    if (!fileId) throw new Error('Apps Script không trả về mã tệp CCCD.');

    const storedReference = `drive:${fileId}`;
    const updated = await updateEmployeeContactInfo(employeeId, { cccd_url: storedReference });
    return { publicUrl: dataUrl, updated: { ...updated, cccd_url: dataUrl } };
  } catch (err) {
    console.error('uploadEmployeeCccdToStorage error:', err);
    throw err;
  }
}

/**
 * Chuyển ảnh CCCD dạng Base64 hiện có sang Google Drive.
 */
export async function migrateExistingCccdImagesToStorage() {
  checkSupabase();
  try {
    const { data: employees, error } = await supabase
      .from('employees')
      .select('id, name, cccd_url');

    if (error || !employees) throw error || new Error('Không thể tải danh sách nhân viên');

    let migratedCount = 0;
    for (const emp of employees) {
      if (emp.cccd_url && emp.cccd_url.startsWith('data:image/')) {
        try {
          const matches = emp.cccd_url.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
          if (matches) {
            const mimeType = matches[1];
            const base64Data = matches[2];

            const { data, error: uploadError } = await googleSheets.uploadEmployeeCccd(
              emp.id,
              base64Data,
              mimeType
            );
            if (uploadError) throw new Error(uploadError.message);
            if (data?.fileId) {
              const { error: updateError } = await supabase
                .from('employees')
                .update({ cccd_url: `drive:${data.fileId}` })
                .eq('id', emp.id);
              if (updateError) throw new Error(updateError.message);
              migratedCount++;
            }
          }
        } catch (subErr) {
          console.error(`Lỗi chuyển đổi ảnh của ${emp.name}:`, subErr);
        }
      }
    }
    return { success: true, count: migratedCount };
  } catch (err) {
    console.error('migrateExistingCccdImagesToStorage error:', err);
    throw err;
  }
}

export async function updateEmployeeBankInfo(id, bankData = {}) {
  checkSupabase();
  const payload = {};
  if (bankData.bank_name !== undefined) payload.bank_name = bankData.bank_name;
  if (bankData.bank_account_number !== undefined) payload.bank_account_number = bankData.bank_account_number;
  if (bankData.bank_account_holder !== undefined) payload.bank_account_holder = bankData.bank_account_holder;
  if (bankData.bank_qr_code_url !== undefined) payload.bank_qr_code_url = bankData.bank_qr_code_url;

  const { data, error } = await supabase
    .from('employees')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getEmployeeByName(name) {
  checkSupabase();
  const { data, error } = await supabase
    .from('employees')
    .select(EMP_PUBLIC_SELECT)
    .ilike('name', name.trim())
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  if (!data) return null;

  let ext = {};
  if (typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem(`chems_emp_status_ext_${data.id}`);
      if (cached) ext = JSON.parse(cached);
      const cachedNick = localStorage.getItem(`chems_emp_nickname_${data.id}`);
      if (cachedNick !== null) ext.nickname = cachedNick;
      const cachedNickTime = localStorage.getItem(`chems_emp_nick_time_${data.id}`);
      if (cachedNickTime) ext.nickname_updated_at = cachedNickTime;
    } catch (err) {}
  }
  if (data.note && data.note.startsWith('{')) {
    try {
      const parsed = JSON.parse(data.note);
      ext = { ...ext, ...parsed };
    } catch (err) {}
  }
  const finalNick = data.nickname !== undefined && data.nickname !== null ? data.nickname : ext.nickname || '';
  const finalNickTime = data.nickname_updated_at || ext.nickname_updated_at || null;
  return { ...data, ...ext, nickname: finalNick, nickname_updated_at: finalNickTime };
}

export const NICKNAME_COOLDOWN_DAYS = 60;

/**
 * Kiểm tra xem nhân viên có đang trong thời gian khóa đổi biệt danh (2 tháng = 60 ngày) không
 * @param {string|null} updatedAt - Thời điểm đổi biệt danh gần nhất
 * @returns {{ isLocked: boolean, daysLeft: number, unlockDateStr: string }}
 */
export function checkNicknameCooldown(updatedAt) {
  if (!updatedAt) return { isLocked: false, daysLeft: 0, unlockDateStr: '' };

  const lastTime = new Date(updatedAt).getTime();
  if (isNaN(lastTime)) return { isLocked: false, daysLeft: 0, unlockDateStr: '' };

  const unlockTime = lastTime + NICKNAME_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
  const now = Date.now();

  if (now >= unlockTime) {
    return { isLocked: false, daysLeft: 0, unlockDateStr: '' };
  }

  const msLeft = unlockTime - now;
  const daysLeft = Math.ceil(msLeft / (24 * 60 * 60 * 1000));

  const d = new Date(unlockTime);
  const dayStr = String(d.getDate()).padStart(2, '0');
  const monthStr = String(d.getMonth() + 1).padStart(2, '0');
  const yearStr = d.getFullYear();
  const unlockDateStr = `${dayStr}/${monthStr}/${yearStr}`;

  return { isLocked: true, daysLeft, unlockDateStr };
}

export async function updateEmployeeNickname(id, nickname) {
  checkSupabase();
  const cleanNick = String(nickname || '').trim();

  if (cleanNick) {
    const { validateNickname } = await import('./utils');
    const val = validateNickname(cleanNick);
    if (!val.isValid) {
      throw new Error(val.error);
    }
  }

  const nowISO = new Date().toISOString();

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(`chems_emp_nickname_${id}`, cleanNick);
      localStorage.setItem(`chems_emp_nick_time_${id}`, nowISO);
    } catch (e) {}
  }

  // Cố gắng update trực tiếp trường nickname và nickname_updated_at
  try {
    const { data, error } = await supabase
      .from('employees')
      .update({ nickname: cleanNick, nickname_updated_at: nowISO })
      .eq('id', id)
      .select()
      .single();
    if (!error && data) {
      return { ...data, nickname: cleanNick, nickname_updated_at: nowISO };
    }
  } catch (err) {}

  // Fallback lưu vào trường note JSON
  try {
    const { data: emp } = await supabase.from('employees').select('note').eq('id', id).single();
    let currentExt = {};
    if (emp?.note && emp.note.startsWith('{')) {
      try { currentExt = JSON.parse(emp.note); } catch (e) {}
    }
    currentExt.nickname = cleanNick;
    currentExt.nickname_updated_at = nowISO;
    const { data, error } = await supabase
      .from('employees')
      .update({ note: JSON.stringify(currentExt) })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return { ...data, nickname: cleanNick, nickname_updated_at: nowISO };
  } catch (fallbackErr) {
    console.error('updateEmployeeNickname fallback error:', fallbackErr);
    return { id, nickname: cleanNick, nickname_updated_at: nowISO };
  }
}

export async function adminUpdateEmployeeNickname(id, nickname, resetCooldown = false) {
  checkSupabase();
  const cleanNick = String(nickname || '').trim();
  const nowISO = resetCooldown ? null : new Date().toISOString();

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(`chems_emp_nickname_${id}`, cleanNick);
      if (resetCooldown) {
        localStorage.removeItem(`chems_emp_nick_time_${id}`);
      } else {
        localStorage.setItem(`chems_emp_nick_time_${id}`, nowISO);
      }
    } catch (e) {}
  }

  // Cố gắng update trực tiếp trường nickname và nickname_updated_at
  try {
    const updatePayload = { nickname: cleanNick };
    if (resetCooldown) {
      updatePayload.nickname_updated_at = null;
    } else if (cleanNick) {
      updatePayload.nickname_updated_at = nowISO;
    }
    const { data, error } = await supabase
      .from('employees')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();
    if (!error && data) {
      return { ...data, nickname: cleanNick, nickname_updated_at: resetCooldown ? null : (cleanNick ? nowISO : null) };
    }
  } catch (err) {}

  // Fallback lưu vào trường note JSON
  try {
    const { data: emp } = await supabase.from('employees').select('note').eq('id', id).single();
    let currentExt = {};
    if (emp?.note && emp.note.startsWith('{')) {
      try { currentExt = JSON.parse(emp.note); } catch (e) {}
    }
    currentExt.nickname = cleanNick;
    if (resetCooldown) {
      delete currentExt.nickname_updated_at;
    } else if (cleanNick) {
      currentExt.nickname_updated_at = nowISO;
    }
    const { data, error } = await supabase
      .from('employees')
      .update({ note: JSON.stringify(currentExt) })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return { ...data, nickname: cleanNick, nickname_updated_at: resetCooldown ? null : (cleanNick ? nowISO : null) };
  } catch (fallbackErr) {
    console.error('adminUpdateEmployeeNickname fallback error:', fallbackErr);
    return { id, nickname: cleanNick, nickname_updated_at: resetCooldown ? null : (cleanNick ? nowISO : null) };
  }
}

export async function createEmployee(name, pin = '123456', hourlyRate = 20000, createdAt = null) {
  checkSupabase();
  const cleanName = String(name || '').trim();
  if (!cleanName) throw new Error('Tên nhân viên không được để trống!');
  if (cleanName.length < 2) throw new Error('Tên nhân viên phải từ 2 ký tự trở lên!');

  const cleanPin = String(pin || '123456').trim();
  if (cleanPin.length < 4 || cleanPin.length > 6) throw new Error('Mã PIN phải từ 4-6 số!');
  if (!/^\d+$/.test(cleanPin)) throw new Error('Mã PIN chỉ được chứa số!');

  const rate = Number(hourlyRate) || 20000;
  if (rate <= 0 || rate > 1000000) throw new Error('Mức lương/giờ không hợp lệ (1đ - 1.000.000đ)!');

  const payload = { name: cleanName, pin: cleanPin, hourly_rate: rate };
  if (createdAt) {
    const cleanDate = String(createdAt).split('T')[0].trim();
    payload.created_at = `${cleanDate}T12:00:00+07:00`;
  }
  try {
    const { data, error } = await supabase
      .from('employees')
      .insert(payload)
      .select()
      .single();
    if (error) {
      if (error.code === '23505' || (error.message && error.message.includes('unique'))) {
        throw new Error(`Nhân viên "${cleanName}" đã tồn tại! Vui lòng chọn tên khác.`);
      }
      throw error;
    }
    return data;
  } catch (err) {
    if (err.message && (err.message.includes('Nhân viên') || err.message.includes('Tên') || err.message.includes('PIN') || err.message.includes('lương'))) {
      throw err;
    }
    throw new Error(err.message || 'Không thể tạo nhân viên mới');
  }
}

export async function updateEmployeeRate(id, hourlyRate) {
  checkSupabase();
  const { data, error } = await supabase
    .from('employees')
    .update({ hourly_rate: hourlyRate })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateEmployeeName(id, name) {
  checkSupabase();
  const { data, error } = await supabase
    .from('employees')
    .update({ name: name.trim() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateEmployeeCreatedAt(id, createdAt) {
  checkSupabase();
  const cleanDate = String(createdAt).split('T')[0].trim();
  const isoDate = `${cleanDate}T12:00:00+07:00`;
  const { data, error } = await supabase
    .from('employees')
    .update({ created_at: isoDate })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateEmployeeStatus(id, status, extraFields = {}) {
  checkSupabase();
  const isActive = status !== 'off';

  // Always save extraFields to local storage as fallback cache
  if (typeof window !== 'undefined' && Object.keys(extraFields).length > 0) {
    try {
      const existingStr = localStorage.getItem(`chems_emp_status_ext_${id}`);
      const existing = existingStr ? JSON.parse(existingStr) : {};
      const merged = { ...existing, ...extraFields };
      localStorage.setItem(`chems_emp_status_ext_${id}`, JSON.stringify(merged));
    } catch (e) {}
  }

  // Try updating DB with full fields if schema supports them
  try {
    const payload = {
      status: status,
      is_active: isActive,
      ...extraFields,
    };
    const { data, error } = await supabase
      .from('employees')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (!error && data) return data;
  } catch (err) {}

  // Safe Fallback: Update default fields only to avoid PostgREST PGRST204 missing column error
  const { data, error } = await supabase
    .from('employees')
    .update({ status: status, is_active: isActive })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return { ...data, status: status, is_active: isActive, ...extraFields };
}

// ============================================
// EMPLOYEE RATES HISTORY & DYNAMIC SALARY CALCULATOR
// ============================================

export async function getEmployeeRates(employeeId) {
  checkSupabase();
  try {
    const { data, error } = await supabase
      .from('employee_rates')
      .select('*')
      .eq('employee_id', employeeId)
      .order('effective_date', { ascending: false });
    if (error) {
      if (error.code === '42P01') return [];
      throw error;
    }
    return data || [];
  } catch (err) {
    console.warn('getEmployeeRates fallback:', err);
    return [];
  }
}

export async function getAllEmployeeRates() {
  checkSupabase();
  try {
    const { data, error } = await supabase
      .from('employee_rates')
      .select('*')
      .order('effective_date', { ascending: true })
      .limit(5000);
    if (error) {
      if (error.code === '42P01') return [];
      throw error;
    }
    return data || [];
  } catch (err) {
    console.warn('getAllEmployeeRates fallback:', err);
    return [];
  }
}

export async function addEmployeeRate(employeeId, hourlyRate, effectiveDate) {
  checkSupabase();
  try {
    const { data: existing, error: findError } = await supabase
      .from('employee_rates')
      .select('id')
      .eq('employee_id', employeeId)
      .eq('effective_date', effectiveDate)
      .maybeSingle();

    if (findError) {
      if (findError.code === 'PGRST205' || findError.code === '42P01') {
        throw new Error("Vui lòng chạy SQL tạo bảng 'employee_rates' trong Supabase SQL Editor trước!");
      }
    }

    if (existing && existing.id) {
      const { data, error } = await supabase
        .from('employee_rates')
        .update({ hourly_rate: Number(hourlyRate) })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    } else {
      const { data, error } = await supabase
        .from('employee_rates')
        .insert({
          employee_id: employeeId,
          hourly_rate: Number(hourlyRate),
          effective_date: effectiveDate,
        })
        .select()
        .single();
      if (error) {
        if (error.code === 'PGRST205' || error.code === '42P01') {
          throw new Error("Vui lòng chạy SQL tạo bảng 'employee_rates' trong Supabase SQL Editor trước!");
        }
        throw error;
      }
      return data;
    }
  } catch (err) {
    if (err.message && err.message.includes('SQL Editor')) {
      throw err;
    }
    if (err.code === 'PGRST205' || err.code === '42P01') {
      throw new Error("Vui lòng chạy SQL tạo bảng 'employee_rates' trong Supabase SQL Editor trước!");
    }
    throw err;
  }
}

export async function deleteEmployeeRate(id) {
  checkSupabase();
  const { error } = await supabase
    .from('employee_rates')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

/**
 * Tính tổng lương cho danh sách ca làm việc dựa trên mốc lương lịch sử và hệ số ngày Lễ an toàn 100%
 */
export function calculateSalaryFromShifts(shifts = [], rates = [], defaultRate = 20000, holidays = []) {
  if (!Array.isArray(shifts) || shifts.length === 0) return { totalHours: 0, grossSalary: 0, shiftDetails: [] };

  const sortedRates = [...(rates || [])].sort((a, b) => (a.effective_date || '').localeCompare(b.effective_date || ''));

  let totalHours = 0;
  let grossSalary = 0;
  const shiftDetails = [];

  shifts.forEach((shift) => {
    if (!shift) return;
    let hours = Number(shift.hours);
    if (!Number.isFinite(hours) || hours <= 0) {
      if (shift.start_time && shift.end_time) {
        const sParts = String(shift.start_time).split(':');
        const eParts = String(shift.end_time).split(':');
        const sh = Number(sParts[0]) || 0;
        const sm = Number(sParts[1]) || 0;
        const eh = Number(eParts[0]) || 0;
        const em = Number(eParts[1]) || 0;
        let calcH = (eh * 60 + em - (sh * 60 + sm)) / 60;
        if (calcH < 0) calcH += 24;
        hours = Math.round(calcH * 100) / 100;
      } else {
        hours = 0;
      }
    }

    const shiftDate = shift.date || '';

    let applicableRate = Number(defaultRate) || 20000;
    for (let i = sortedRates.length - 1; i >= 0; i--) {
      if (sortedRates[i].effective_date && sortedRates[i].effective_date <= shiftDate) {
        const rVal = Number(sortedRates[i].hourly_rate);
        if (Number.isFinite(rVal) && rVal > 0) {
          applicableRate = rVal;
          break;
        }
      }
    }

    // Kiểm tra Ngày Lễ & Hệ số nhân (x2, x3...)
    const holiday = getHolidayForDate(shiftDate, holidays);
    const multiplier = holiday && Number(holiday.multiplier) > 0 ? Number(holiday.multiplier) : 1;
    const effectiveRate = Math.round(applicableRate * multiplier);

    const shiftSalary = Math.round(hours * effectiveRate);
    totalHours += hours;
    grossSalary += shiftSalary;

    shiftDetails.push({
      ...shift,
      hours,
      applicableRate,
      effectiveRate,
      multiplier,
      holidayName: holiday?.name || null,
      shiftSalary,
    });
  });

  return {
    totalHours: Math.round(totalHours * 100) / 100,
    grossSalary: Math.round(grossSalary),
    shiftDetails,
  };
}

export async function updateEmployee(id, employeeData) {
  checkSupabase();
  const { data, error } = await supabase
    .from('employees')
    .update(employeeData)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateEmployeePin(id, pin) {
  checkSupabase();
  const cleanPin = String(pin || '').trim();
  if (cleanPin.length < 4 || cleanPin.length > 6) {
    throw new Error('Mã PIN phải từ 4-6 số!');
  }
  if (!/^\d+$/.test(cleanPin)) {
    throw new Error('Mã PIN chỉ được chứa số!');
  }
  const { data, error } = await supabase
    .from('employees')
    .update({ pin: cleanPin })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Xác thực mã PIN cá nhân của Nhân viên trực tiếp với Database (Không gửi mã PIN đồng nghiệp về máy client)
 */
export async function verifyEmployeePin(employeeId, inputPin) {
  checkSupabase();
  if (!employeeId || !inputPin) return false;
  const cleanPin = String(inputPin).trim();
  try {
    const { data, error } = await supabase.rpc('verify_employee_pin', {
      p_employee_id: employeeId,
      p_input_pin: cleanPin,
    });
    if (error) throw new Error(error.message || 'Không thể xác thực PIN.');
    return data === true;
  } catch (err) {
    console.error('verifyEmployeePin error:', err);
    return false;
  }
}

/**
 * Xác thực mã PIN Admin (Quản Lý / Chủ Quán) an toàn
 */
export async function verifyAdminPin(accountRoleOrId, inputPin) {
  checkSupabase();
  const cleanPin = String(inputPin).trim();
  try {
    const { data, error } = await supabase.rpc('verify_admin_pin', {
      p_role_or_id: String(accountRoleOrId),
      p_input_pin: cleanPin,
    });
    if (error) throw new Error(error.message || 'Không thể xác thực PIN quản trị.');
    return data === true;
  } catch (err) {
    console.error('verifyAdminPin error:', err);
    return false;
  }
}

export async function deleteEmployee(id) {
  checkSupabase();
  // Soft Delete: Chuyển status = 'off' và is_active = false trong DB Supabase
  // Giữ lại 100% dữ liệu lịch sử ca làm, chấm công, tính lương trong Database để tra cứu 3-4 năm sau!
  const { error } = await supabase
    .from('employees')
    .update({ status: 'off', is_active: false })
    .eq('id', id);
  if (error) throw error;
  return true;
}

// ============================================
// BRANCH OPERATIONS
// ============================================

export async function getBranches(includeInactive = false) {
  checkSupabase();
  const cacheKey = includeInactive ? 'branches_all' : 'branches_active';
  const cached = getCache(cacheKey);
  if (cached) return cached;

  let query = supabase
    .from('branches')
    .select('*')
    .order('sort_order');

  if (!includeInactive) {
    // Chỉ lấy các chi nhánh đang hoạt động (loại bỏ chi nhánh đã xóa mềm)
    query = query.or('is_active.is.null,is_active.eq.true');
  }

  const { data, error } = await query;
  if (error) {
    // Fallback nếu schema cũ chưa có cột is_active
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('branches')
      .select('*')
      .order('sort_order');
    if (fallbackError) throw fallbackError;
    const list = fallbackData || [];
    setCache(cacheKey, list);
    return list;
  }
  const list = data || [];
  setCache(cacheKey, list);
  return list;
}

export async function createBranch(branchData) {
  checkSupabase();
  clearCache('branches_active');
  clearCache('branches_all');
  clearCache('branches');
  const { data, error } = await supabase
    .from('branches')
    .insert([{ ...branchData, is_active: true }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateBranch(id, branchData) {
  checkSupabase();
  clearCache('branches_active');
  clearCache('branches_all');
  clearCache('branches');
  const { data, error } = await supabase
    .from('branches')
    .update(branchData)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function restoreBranch(id) {
  checkSupabase();
  clearCache('branches_active');
  clearCache('branches_all');
  clearCache('branches');

  const { data, error } = await supabase
    .from('branches')
    .update({ is_active: true })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteBranch(id) {
  checkSupabase();
  clearCache('branches_active');
  clearCache('branches_all');
  clearCache('branches');

  // SOFT DELETE: Chuyển is_active = false
  // Chi nhánh sẽ biến mất hoàn toàn khỏi danh sách chi nhánh hoạt động & dropdown xếp lịch,
  // nhưng vẫn được lưu trong DB để các ca làm cũ trong quá khứ giữ nguyên 100% Tên chi nhánh & Màu sắc!
  try {
    const { data, error } = await supabase
      .from('branches')
      .update({ is_active: false })
      .eq('id', id)
      .select()
      .single();

    if (!error && data) {
      return true;
    }
  } catch (err) {}

  // Fallback: nếu DB cũ chưa có cột is_active thì kiểm tra an toàn trước khi xóa cứng
  const { count, error: countErr } = await supabase
    .from('schedule')
    .select('*', { count: 'exact', head: true })
    .eq('branch_id', id);

  if (!countErr && count && count > 0) {
    throw new Error(
      `Không thể xóa chi nhánh này vì đã có ${count} ca làm việc liên kết. Hãy đổi tên thay vì xóa để không làm mất dữ liệu tính lương lịch sử!`
    );
  }

  const { error } = await supabase
    .from('branches')
    .delete()
    .eq('id', id);
  if (error) throw error;
  return true;
}

// ============================================
// AVAILABILITY OPERATIONS (nhân viên đăng ký rảnh)
// ============================================

export async function getAvailabilityByDateRange(startDate, endDate) {
  checkSupabase();
  const { data, error } = await supabase
    .from('availability')
    .select('*, employees(name)')
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date');
  if (error) throw error;
  return data || [];
}

export async function getAvailabilityByEmployee(employeeId, startDate, endDate) {
  checkSupabase();
  const { data, error } = await supabase
    .from('availability')
    .select('*')
    .eq('employee_id', employeeId)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date');
  if (error) throw error;
  return data || [];
}

export async function upsertAvailability(employeeId, date, type, note = '', isAdminAssigned = false) {
  checkSupabase();
  try {
    const payload = {
      employee_id: employeeId,
      date,
      type: type || 'off',
      note: note || '',
      is_admin_assigned: Boolean(isAdminAssigned),
    };

    const { data, error } = await supabase
      .from('availability')
      .upsert(payload, { onConflict: 'employee_id,date' })
      .select()
      .single();

    if (error) {
      console.error('upsertAvailability error:', error);
      throw error;
    }
    return data;
  } catch (err) {
    console.error('upsertAvailability error:', err);
    throw err;
  }
}

export async function deleteAvailability(employeeId, date) {
  checkSupabase();
  const { error } = await supabase
    .from('availability')
    .delete()
    .eq('employee_id', employeeId)
    .eq('date', date);
  if (error) throw error;
}

// ============================================
// SCHEDULE OPERATIONS (chủ quán xếp lịch)
// ============================================

export async function getScheduleByDateRange(startDate, endDate) {
  checkSupabase();
  const { data, error } = await supabase
    .from('schedule')
    .select('*, employees(name), branches(name, color)')
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date');
  if (error) throw error;
  return data || [];
}

export async function getScheduleByEmployee(employeeId) {
  checkSupabase();
  const { data, error } = await supabase
    .from('schedule')
    .select('*, employees(name), branches(name, color)')
    .eq('employee_id', employeeId)
    .order('date', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function upsertSchedule({ employeeId, branchId, date, startTime, endTime, hours, note }) {
  checkSupabase();
  let calcHours = hours;
  if ((!calcHours || calcHours <= 0) && startTime && endTime) {
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    const diffMins = (eh * 60 + em) - (sh * 60 + sm);
    calcHours = diffMins > 0 ? Math.round((diffMins / 60) * 100) / 100 : 0;
  }
  const row = {
    employee_id: employeeId,
    branch_id: branchId,
    date,
    start_time: startTime || null,
    end_time: endTime || null,
    hours: calcHours || null,
    note: note || '',
  };
  try {
    const { data, error } = await supabase
      .from('schedule')
      .upsert(row, { onConflict: 'employee_id,date' })
      .select('*, employees(name), branches(name, color)')
      .single();
    if (error) {
      if (error.code === '23505') {
        throw new Error(`Đã có ca làm việc được phân công cho nhân viên này trong ngày ${date}!`);
      }
      throw error;
    }
    return data;
  } catch (err) {
    console.error('upsertSchedule error:', err);
    throw err;
  }
}

export async function deleteSchedule(id) {
  checkSupabase();
  const { error } = await supabase.from('schedule').delete().eq('id', id);
  if (error) throw error;
}

// ============================================
// PENALTY OPERATIONS
// ============================================

export async function getPenaltiesByEmployee(employeeId, month) {
  checkSupabase();
  let query = supabase
    .from('penalties')
    .select('*')
    .eq('employee_id', employeeId)
    .order('created_at', { ascending: false });

  if (month) {
    query = query.eq('month', month);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/**
 * Lấy tất cả thưởng/phạt của toàn bộ nhân viên theo tháng (dùng cho bảng báo cáo lương tổng)
 */
export async function getAllPenaltiesByMonth(month) {
  checkSupabase();
  try {
    const { data, error } = await supabase
      .from('penalties')
      .select('*')
      .eq('month', month)
      .order('created_at', { ascending: false });
    if (error) {
      if (error.code === '42P01') return [];
      throw error;
    }
    return data || [];
  } catch (err) {
    console.warn('getAllPenaltiesByMonth fallback:', err);
    return [];
  }
}

export async function createPenalty(penalty) {
  checkSupabase();
  try {
    // Đảm bảo số tiền nằm trong giới hạn Integer an toàn của Postgres (tối đa 1 Tỷ đồng)
    const sanitizedAmount = Math.min(Math.max(Math.round(Number(penalty.amount) || 0), 0), 1000000000);
    const safePenalty = {
      ...penalty,
      amount: sanitizedAmount,
    };

    const { data, error } = await supabase
      .from('penalties')
      .insert(safePenalty)
      .select()
      .single();

    if (error) {
      // Nếu cơ sở dữ liệu cũ chưa nâng cấp cột 'date' hoặc 'type', tự động thử loại bỏ từng trường thiếu
      if (
        error.code === 'PGRST204' ||
        (error.message && (error.message.includes('date') || error.message.includes('type')))
      ) {
        const { date, type, ...cleanPenalty } = safePenalty;
        const { data: retryData, error: retryError } = await supabase
          .from('penalties')
          .insert(cleanPenalty)
          .select()
          .single();
        if (retryError) throw retryError;
        return retryData;
      }
      throw error;
    }
    return data;
  } catch (err) {
    console.error('Error creating penalty:', err);
    throw err;
  }
}

export async function deletePenalty(id) {
  checkSupabase();
  try {
    const { error } = await supabase.from('penalties').delete().eq('id', id);
    if (error) throw error;
  } catch (err) {
    console.error('Error deleting penalty:', err);
    throw err;
  }
}

// ============================================
// SHIFT SWAP OPERATIONS (QUẢN LÝ ĐỔI CA)
// ============================================

export async function getShiftSwapsByEmployee(employeeId) {
  checkSupabase();
  try {
    const { data, error } = await supabase
      .from('shift_swaps')
      .select('*')
      .or(`requester_id.eq.${employeeId},target_employee_id.eq.${employeeId}`)
      .order('created_at', { ascending: false });

    if (!error && data) return data;
  } catch (err) {
    console.error('Error fetching shift swaps:', err);
  }

  // Fallback LocalStorage
  if (typeof window !== 'undefined') {
    try {
      const local = localStorage.getItem('chems_shift_swaps');
      if (local) {
        const parsed = JSON.parse(local);
        return parsed.filter(
          (s) => s.requester_id === employeeId || s.target_employee_id === employeeId
        );
      }
    } catch (e) {}
  }
  return [];
}

export async function getAllShiftSwaps() {
  checkSupabase();
  try {
    const { data, error } = await supabase
      .from('shift_swaps')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(2000);

    if (!error && data) return data;
  } catch (err) {
    console.error('Error fetching all shift swaps:', err);
  }

  // Fallback LocalStorage
  if (typeof window !== 'undefined') {
    try {
      const local = localStorage.getItem('chems_shift_swaps');
      if (local) return JSON.parse(local);
    } catch (e) {}
  }
  return [];
}

export async function createShiftSwap(swapData) {
  checkSupabase();

  try {
    const { data, error } = await supabase
      .from('shift_swaps')
      .insert(swapData)
      .select()
      .single();

    if (!error && data) {
      syncShiftSwapToLocalStorage(data);
      return data;
    } else if (error) {
      console.warn('Shift swap insert retry with fallback:', error.message);
      // Fallback cho database cũ nếu chưa thêm các cột mới
      const basePayload = {
        requester_id: swapData.requester_id,
        requester_name: swapData.requester_name,
        target_employee_id: swapData.target_employee_id || swapData.requester_id,
        target_employee_name: swapData.target_employee_name || (swapData.request_type === 'time_change' ? 'Báo Giờ Làm' : ''),
        shift_date: swapData.shift_date,
        my_shift_info: swapData.my_shift_info || swapData.original_time || '',
        target_shift_info: swapData.target_shift_info || swapData.adjusted_time || '',
        reason: swapData.reason || '',
      };
      const { data: retryData, error: retryErr } = await supabase
        .from('shift_swaps')
        .insert(basePayload)
        .select()
        .single();
      if (!retryErr && retryData) {
        syncShiftSwapToLocalStorage(retryData);
        return retryData;
      }
    }
  } catch (err) {
    console.error('Error inserting shift swap into DB:', err);
  }

  // Fallback LocalStorage khi DB không khả dụng
  const fallbackSwap = {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    ...swapData,
    status: 'pending',
    created_at: new Date().toISOString(),
  };
  syncShiftSwapToLocalStorage(fallbackSwap);
  return fallbackSwap;
}

function syncShiftSwapToLocalStorage(swapItem) {
  if (typeof window === 'undefined') return;
  try {
    const local = JSON.parse(localStorage.getItem('chems_shift_swaps') || '[]');
    const filtered = local.filter((s) => s.id !== swapItem.id);
    const updated = [swapItem, ...filtered];
    localStorage.setItem('chems_shift_swaps', JSON.stringify(updated));
  } catch (e) {}
}

export async function updateShiftSwapStatus(swapId, status, rejectionReason = '') {
  checkSupabase();
  const updateData = {
    status,
    rejection_reason: rejectionReason,
    updated_at: new Date().toISOString(),
  };

  try {
    const { data, error } = await supabase
      .from('shift_swaps')
      .update(updateData)
      .eq('id', swapId)
      .select()
      .single();

    if (!error && data) {
      syncShiftSwapToLocalStorage(data);
      return data;
    }
  } catch (err) {
    console.error('Error updating shift swap status:', err);
  }

  // LocalStorage Fallback Sync
  if (typeof window !== 'undefined') {
    try {
      const local = JSON.parse(localStorage.getItem('chems_shift_swaps') || '[]');
      const idx = local.findIndex((s) => s.id === swapId);
      if (idx !== -1) {
        local[idx] = { ...local[idx], ...updateData };
        localStorage.setItem('chems_shift_swaps', JSON.stringify(local));
        return local[idx];
      }
    } catch (e) {}
  }
  return { id: swapId, ...updateData };
}

// ============================================
// SYSTEM BACKUP UTILITY (SAO LƯU DỮ LIỆU TOÀN BỘ)
// ============================================

export async function exportAllDataToJSON() {
  checkSupabase();
  const tables = [
    'system_settings',
    'branches',
    'employees',
    'employee_rates',
    'availability',
    'schedule',
    'penalties',
    'shift_swaps'
  ];

  const backup = {
    version: '1.0',
    backup_date: new Date().toISOString(),
    tables: {}
  };

  for (const t of tables) {
    let allRows = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from(t)
        .select('*')
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) {
        console.warn(`Lỗi khi sao lưu bảng ${t}:`, error.message);
        break;
      }
      if (data && data.length > 0) {
        allRows = allRows.concat(data);
        if (data.length < pageSize) {
          hasMore = false;
        } else {
          page++;
        }
      } else {
        hasMore = false;
      }
    }
    backup.tables[t] = allRows;
  }
  return backup;
}
