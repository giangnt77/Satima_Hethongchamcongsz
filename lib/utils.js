import { googleSheets } from './google-sheets';

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Format số tiền VNĐ
 */
export function formatCurrency(amount) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Tính số giờ giữa 2 mốc thời gian an toàn 100%
 */
export function calculateHours(startTime, endTime) {
  if (!startTime || !endTime) return 0;
  const sParts = String(startTime).split(':');
  const eParts = String(endTime).split(':');
  const sh = Number(sParts[0]) || 0;
  const sm = Number(sParts[1]) || 0;
  const eh = Number(eParts[0]) || 0;
  const em = Number(eParts[1]) || 0;
  let hours = (eh * 60 + em - (sh * 60 + sm)) / 60;
  if (hours < 0) hours += 24; // qua ngày
  return Math.round(hours * 100) / 100;
}

/**
 * Format date string sang tiếng Việt an toàn chống lệch múi giờ
 */
export function formatDate(dateStr) {
  if (!dateStr) return '';
  const cleanStr = String(dateStr).split('T')[0];
  const parts = cleanStr.split('-');
  if (parts.length === 3) {
    const y = Number(parts[0]);
    const m = Number(parts[1]) - 1;
    const d = Number(parts[2]);
    const date = new Date(y, m, d);
    const dayOfWeekNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    const dayName = dayOfWeekNames[date.getDay()] || '';
    return `${dayName}, ${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return String(dateStr);
}

/**
 * Format date ngắn gọn an toàn (DD/MM)
 */
export function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const cleanStr = String(dateStr).split('T')[0];
  const parts = cleanStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}`;
  }
  return String(dateStr);
}

/**
 * Format ngày đầy đủ (DD/MM/YYYY)
 */
export function formatDateFull(dateStr) {
  if (!dateStr) return '';
  const cleanStr = String(dateStr).split('T')[0];
  const parts = cleanStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return String(dateStr);
}

/**
 * Format ngày kèm Thứ tiếng Việt đầy đủ (VD: Thứ 6, 07/08/2026)
 */
export function formatDateWithDayVN(dateStr) {
  if (!dateStr) return '';
  const cleanStr = String(dateStr).split('T')[0];
  const parts = cleanStr.split('-');
  if (parts.length === 3) {
    const y = Number(parts[0]);
    const m = Number(parts[1]) - 1;
    const d = Number(parts[2]);
    const date = new Date(y, m, d);
    const dayOfWeekNames = ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
    const dayName = dayOfWeekNames[date.getDay()] || '';
    return `${dayName}, ${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return String(dateStr);
}

/**
 * Lấy tháng hiện tại dạng YYYY-MM theo chuẩn giờ Việt Nam (GMT+7)
 * Sử dụng toán học UTC+7 thuần túy, an toàn 100% trên mọi thiết bị và hệ điều hành (kể cả iPhone 7/8, iOS cũ)
 */
export function getCurrentMonth() {
  try {
    const now = new Date();
    // Chuyển sang giờ Việt Nam (UTC+7)
    const vnTime = new Date(now.getTime() + 7 * 3600000);
    const y = vnTime.getUTCFullYear();
    const m = String(vnTime.getUTCMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  } catch (e) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
}

/**
 * Lấy ngày hiện tại dạng YYYY-MM-DD theo chuẩn giờ Việt Nam (GMT+7)
 * Sử dụng toán học UTC+7 thuần túy, an toàn 100% trên mọi thiết bị và hệ điều hành (kể cả iPhone 7/8, iOS cũ)
 */
export function getToday() {
  try {
    const now = new Date();
    // Chuyển sang giờ Việt Nam (UTC+7)
    const vnTime = new Date(now.getTime() + 7 * 3600000);
    const y = vnTime.getUTCFullYear();
    const m = String(vnTime.getUTCMonth() + 1).padStart(2, '0');
    const d = String(vnTime.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  } catch (e) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

/**
 * Chuyển ngày YYYY-MM-DD sang chuỗi ISO an toàn giữ nguyên ngày tại Việt Nam (GMT+7)
 */
export function toVNISOString(dateStr) {
  if (!dateStr) return new Date().toISOString();
  const cleanDate = String(dateStr).split('T')[0].trim();
  return `${cleanDate}T12:00:00+07:00`;
}

export function formatDateISO(date) {
  if (!date) return '';
  if (typeof date === 'string') {
    const clean = date.split('T')[0].trim();
    const parts = clean.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      const y = parts[0];
      const m = parts[1].padStart(2, '0');
      const d = parts[2].padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getMondayOfCurrentWeek() {
  const todayStr = getToday();
  const [y, m, d] = todayStr.split('-').map(Number);
  const todayDate = new Date(y, m - 1, d);
  const day = todayDate.getDay(); // 0=CN, 1=T2...
  const daysToSub = day === 0 ? 6 : day - 1;
  const monday = new Date(y, m - 1, d - daysToSub);
  return formatDateISO(monday);
}

export function getWeekDaysFromMonday(mondayStr) {
  const days = [];
  if (!mondayStr) return days;
  const [y, m, d] = mondayStr.split('-').map(Number);
  for (let i = 0; i < 7; i++) {
    const dayObj = new Date(y, m - 1, d + i);
    days.push(formatDateISO(dayObj));
  }
  return days;
}

/**
 * Format tên tháng tiếng Việt
 */
export function getMonthName(monthStr) {
  const [year, month] = monthStr.split('-');
  const monthNames = [
    'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4',
    'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8',
    'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
  ];
  return `${monthNames[parseInt(month) - 1]} ${year}`;
}

/**
 * Lấy thông tin calendar cho 1 tháng
 */
export function getCalendarDays(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();

  // Bắt đầu từ thứ Hai (1) thay vì CN (0)
  let startDayOfWeek = firstDay.getDay();
  if (startDayOfWeek === 0) startDayOfWeek = 7;
  startDayOfWeek -= 1; // 0-indexed from Monday

  const days = [];

  // Ngày tháng trước
  const prevMonth = new Date(year, month, 0);
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    days.push({
      day: prevMonth.getDate() - i,
      isCurrentMonth: false,
      date: null,
    });
  }

  // Ngày tháng hiện tại
  for (let i = 1; i <= daysInMonth; i++) {
    const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
    days.push({
      day: i,
      isCurrentMonth: true,
      date,
    });
  }

  // Ngày tháng sau
  const remaining = 7 - (days.length % 7);
  if (remaining < 7) {
    for (let i = 1; i <= remaining; i++) {
      days.push({
        day: i,
        isCurrentMonth: false,
        date: null,
      });
    }
  }

  return days;
}

/**
 * Lấy avatar initials từ tên tiếng Việt
 */
export function getInitials(name) {
  if (!name) return 'NV';
  const parts = name.trim().split(' ');
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Lấy style chuẩn màu sắc động của chi nhánh dựa trên mã color lưu trong Database 100% (Zero Hardcode)
 */
export function getBranchColorStyle(name = '', colorFromDb = '') {
  // Lấy màu hex từ DB, nếu không có thì mặc định màu tím nhã nhặn #7e22ce
  const hex = colorFromDb && String(colorFromDb).startsWith('#') ? colorFromDb : '#7e22ce';

  // Kiểm tra độ sáng của màu hex để quyết định màu chữ (Trắng hoặc Đen)
  let isLight = false;
  try {
    const cleanHex = hex.replace('#', '');
    const r = parseInt(cleanHex.substring(0, 2), 16) || 0;
    const g = parseInt(cleanHex.substring(2, 4), 16) || 0;
    const b = parseInt(cleanHex.substring(4, 6), 16) || 0;
    // Công thức tính độ sáng YIQ
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    isLight = yiq >= 180;
  } catch (e) {
    isLight = false;
  }

  return {
    hex: hex,
    badgeStyle: {
      backgroundColor: hex,
      borderColor: hex,
      color: isLight ? '#0f172a' : '#ffffff',
    },
    text: hex,
    bg: `${hex}18`,
    border: `${hex}40`,
  };
}

/**
 * Send shift-swap notifications through the authenticated Apps Script email service.
 */
export async function sendShiftSwapEmailNotification(swapData) {
  if (!swapData) return { ok: false, error: 'Thiếu dữ liệu yêu cầu đổi ca.' };
  try {
    return await googleSheets.sendShiftSwapEmail(swapData);
  } catch (err) {
    console.error('Lỗi khi gửi thông báo email đổi ca:', err);
    return { ok: false, error: err?.message };
  }
}

/**
 * Tạo ID ngẫu nhiên
 */
export function generateId() {
  return crypto.randomUUID();
}

/**
 * Debounce function
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// ============================================
// BỘ LỌC TỪ NGỮ VÀ KIỂM TRA TÍNH HỢP LỆ CỦA BIỆT DANH
// ============================================

const FORBIDDEN_WORDS = [
  // 1. Chửi thề, tục tĩu tiếng Việt (và viết tắt / teencode)
  'dm', 'dmm', 'dcm', 'dcmm', 'dcmd', 'cl', 'clgt', 'clm', 'clme', 'cmn', 'cmnl',
  'vcl', 'vl', 'vkl', 'vcc', 'vlon', 'vloz', 'vrot', 'vch', 'vlin', 'vleu', 'vai lon', 'vai lol', 'vai cut',
  'cc', 'ccl', 'cacc', 'cac', 'cax', 'cặc', 'cu', 'chim', 'buoi', 'buồi', 'dái', 'dai', 'bi', 'bìu', 'biu',
  'lon', 'lồn', 'loz', 'lozz', 'lol', 'lols', 'buom', 'bướm', 'hot le', 'hột le', 'mong doc', 'mồng đốc',
  'dit', 'địt', 'djt', 'đjt', 'det', 'đệt', 'dit me', 'địt mẹ', 'dit cha', 'địt cha', 'dit cu', 'địt cụ', 'dit ba', 'địt bà',
  'du', 'đụ', 'du ma', 'đụ má', 'du me', 'đụ mẹ', 'du cha', 'đụ cha', 'du ba', 'đụ bà', 'du cay', 'đụ cây',
  'chich', 'chịch', 'xoac', 'xoạc', 'nen', 'nện', 'phich', 'phịch', 'nhun', 'nhún', 'thit', 'thịt',
  'bu liem', 'bú liếm', 'bu cu', 'bú cu', 'bu cac', 'bú cặc', 'bu mut', 'bú mút', 'vet mang', 'vét máng',
  'thoi ken', 'thổi kèn', 'banh hang', 'banh háng', 'chong mong', 'chổng mông', 'lot do', 'lột đồ',
  'suc cac', 'sục cặc', 'suc cu', 'sục cu', 'quay tay', 'thu dam', 'thủ dâm', 'tu suong', 'tự sướng',
  'dam', 'dâm', 'dam duc', 'dâm dục', 'dam dang', 'dâm đãng', 'dam de', 'dâm dê', 'bien thai', 'biến thái',
  'benh hoan', 'bệnh hoạn', 'au dam', 'ấu dâm', 'bao ram', 'bạo dâm', 'cuong dam', 'cuồng dâm', 'dam loan', 'dâm loạn',

  // 2. Mại dâm, lăng loàn, xúc phạm nhân phẩm
  'di', 'đĩ', 'con di', 'con đĩ', 'thang di', 'thằng đĩ', 'di diem', 'đĩ điếm', 'di ngua', 'đĩ ngựa', 'di thoa', 'đĩ thoã',
  'di but', 'đĩ bút', 'pho', 'phò', 'cave', 'gai goi', 'gái gọi', 'gai nganh', 'gái ngành', 'gai bao', 'gái bao',
  'diem', 'điếm', 'trai bao', 'ma mi', 'má mì', 'tu ba', 'tú bà', 'chan dat', 'chăn dắt', 'lam tien', 'làm tiền',

  // 3. Xúc phạm, nguyền rủa, lăng mạ
  'chet', 'chết', 'chet me', 'chết mẹ', 'chet cha', 'chết cha', 'chet ba', 'chết bà', 'chet tiet', 'chết tiệt',
  'me kiep', 'mẹ kiếp', 'to cha', 'tổ cha', 'to su', 'tổ sư', 'su cha', 'sư cha', 'tam bien', 'tổ bà',
  'mat day', 'mất dạy', 'vo hoc', 'vô học', 'vo lai', 'vô lại', 'vo dao duc', 'vô đạo đức', 'khon nan', 'khốn nạn',
  'khon kiep', 'khốn kiếp', 'don mat', 'đốn mạt', 'rac ruoi', 'rác rưởi', 'can ba', 'cặn bã', 're rach', 'rẻ rách',
  're tien', 'rẻ tiền', 'do ban', 'dơ bẩn', 'ban thiu', 'bẩn thỉu', 'tien ti', 'tiện tì', 'khau nghiep', 'khẩu nghiệp',

  // 4. Động vật hóa, sỉ nhục trí tuệ
  'cho', 'chó', 'cho de', 'chó đẻ', 'cho chet', 'chó chết', 'cho dai', 'chó dại', 'cho hua', 'chó hùa', 'cho tha', 'chó tha',
  'cho ma', 'chó má', 'thang cho', 'thằng chó', 'con cho', 'con chó', 'do cho', 'đồ chó', 'cun chet', 'cún chết',
  'suc vat', 'súc vật', 'suc sinh', 'súc sinh', 'suc sanh', 'súc sanh', 'cam thu', 'cầm thú', 'suc no', 'súc nô',
  'do heo', 'đồ heo', 'do lon', 'đồ lợn', 'heo noc', 'heo nọc', 'lon loi', 'lợn lòi',
  'ngu', 'ngu si', 'ngu ngoc', 'ngu ngốc', 'ngu xuan', 'ngu xuẩn', 'ngu dan', 'ngu đần', 'ngu lon', 'ngu loz', 'ngu vcl',
  'dan don', 'đần độn', 'dan', 'đần', 'oc cho', 'óc chó', 'oc heo', 'óc heo', 'oc bo', 'óc bò', 'oc trau', 'óc trâu',
  'nao tan', 'não tàn', 'nao phang', 'não phẳng', 'bai nao', 'bại não', 'thieu nang', 'thiểu năng',
  'khung', 'khùng', 'dien', 'điên', 'ham', 'hâm', 'do nguoi', 'dở người', 'chap mach', 'chập mạch', 'tam than', 'tâm thần',

  // 5. Chất thải, nhơ nhớp
  'cut', 'cứt', 'an cut', 'ăn cứt', 'boc cut', 'bốc cứt', 'nhu cut', 'như cứt', 'dong cut', 'đống cứt', 'cut dai', 'cứt đái',
  'ia', 'ỉa', 'i', 'ị', 'dai', 'đái', 'ia chay', 'ỉa chảy', 'ia dun', 'ỉa đùn', 'dai dam', 'đái dầm',
  'thoi tha', 'thối tha', 'thoi hoac', 'thối hoắc', 'tanh tuoi', 'tanh tưởi', 'hoi nach', 'hôi nách', 'hoi ham', 'hôi hám',

  // 6. Tiếng Anh lăng mạ, khiêu dâm
  'fuck', 'fucker', 'fucking', 'motherfucker', 'fck', 'fuk', 'shit', 'bullshit', 'bitch', 'bitches',
  'ass', 'asshole', 'arse', 'dick', 'dickhead', 'pussy', 'cock', 'cunt', 'bastard', 'slut', 'whore', 'twat', 'prick', 'wanker',
  'porn', 'porno', 'hentai', 'sex', 'sexy', 'xxx', 'nude', 'naked', 'boobs', 'tits', 'blowjob', 'handjob', 'cum', 'sperm',
  'anal', 'dildo', 'horny', 'idiot', 'stupid', 'moron', 'loser',

  // 7. Mạo danh chức vụ, quản lý, hệ thống, thương hiệu
  'admin', 'ad', 'administrator', 'quan ly', 'quản lý', 'manager', 'owner', 'chu quan', 'chủ quán',
  'boss', 'sep', 'sếp', 'giam doc', 'giám đốc', 'tong dai', 'tổng đài', 'cskh', 'hotline', 'support',
  'he thong', 'hệ thống', 'system', 'root', 'bot', 'moderator', 'mod',
  'che ms hoa', 'chè ms hoa', 'ms hoa', 'mshoa', 'tiem che', 'tiệm chè', 'quan che', 'quán chè',
  'ban quan tri', 'ban quản trị', 'thu ngan', 'thu ngân', 'ke toan', 'kế toán',
];

function normalizeTextForFilter(text) {
  let s = String(text || '').toLowerCase();

  // Thay thế các ký tự leetspeak / số viết lách thông dụng
  s = s.replace(/0/g, 'o')
       .replace(/1/g, 'i')
       .replace(/3/g, 'e')
       .replace(/4/g, 'a')
       .replace(/5/g, 's')
       .replace(/7/g, 't')
       .replace(/8/g, 'b')
       .replace(/@/g, 'a')
       .replace(/\$/g, 's');

  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Kiểm tra tính hợp lệ của Biệt Danh (độ dài 2-12 ký tự, không chứa từ bậy bạ / mạo danh)
 * @param {string} nickname
 * @returns {{ isValid: boolean, error: string | null }}
 */
export function validateNickname(nickname) {
  const clean = String(nickname || '').trim();

  // 1. Nếu để trống (trường hợp xóa biệt danh quay về tên thật) -> hợp lệ
  if (!clean) {
    return { isValid: true, error: null };
  }

  // 2. Kiểm tra độ dài: từ 2 đến 12 ký tự
  if (clean.length < 2) {
    return { isValid: false, error: 'Biệt danh quá ngắn! Vui lòng nhập từ 2 đến 12 ký tự.' };
  }
  if (clean.length > 12) {
    return { isValid: false, error: 'Biệt danh quá dài! Tối đa 12 ký tự để không làm vỡ ô bảng xếp lịch.' };
  }

  // 3. Kiểm tra ký tự không hợp lệ (chặn code, script, html, link, ký tự lạ)
  if (/[<>{}[\]\\\/@#$%^&*~`|=+;:"_]/.test(clean)) {
    return { isValid: false, error: 'Biệt danh không được chứa các ký tự đặc biệt như @, #, $, <, >, /, \\...' };
  }

  // 4. Kiểm tra từ cấm & từ ngữ thô tục / mạo danh
  const normalized = normalizeTextForFilter(clean);
  const words = normalized.split(' ');
  const condensed = normalized.replace(/\s+/g, '');

  for (const bad of FORBIDDEN_WORDS) {
    const badNorm = normalizeTextForFilter(bad);
    const badCondensed = badNorm.replace(/\s+/g, '');

    // Kiểm tra từng từ đơn
    if (words.includes(badNorm)) {
      return {
        isValid: false,
        error: `Biệt danh chứa từ ngữ không phù hợp hoặc nhạy cảm ("${clean}"). Vui lòng chọn tên văn minh lịch sự!`,
      };
    }

    // Kiểm tra cụm từ dính liền
    if (badCondensed.length >= 3 && condensed.includes(badCondensed)) {
      return {
        isValid: false,
        error: 'Biệt danh chứa từ ngữ không phù hợp hoặc nhạy cảm. Vui lòng chọn tên văn minh lịch sự!',
      };
    }
  }

  return { isValid: true, error: null };
}
