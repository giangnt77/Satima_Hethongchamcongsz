const TABLE_HEADERS = {
  system_settings: ['key', 'value', 'updated_at'],
  branches: ['id', 'name', 'color', 'is_active', 'sort_order', 'created_at'],
  employees: [
    'id', 'name', 'nickname', 'nickname_updated_at', 'role', 'hourly_rate', 'pin',
    'status', 'is_active', 'sort_order', 'phone', 'relative_phone', 'address',
    'cccd_url', 'bank_name', 'bank_account_number', 'bank_account_holder',
    'bank_qr_code_url', 'off_start_date', 'off_end_date', 'resigned_at', 'note', 'created_at',
  ],
  employee_rates: ['id', 'employee_id', 'hourly_rate', 'effective_date', 'created_at'],
  availability: ['id', 'employee_id', 'date', 'type', 'note', 'is_admin_assigned', 'created_at'],
  schedule: [
    'id', 'employee_id', 'branch_id', 'date', 'start_time', 'end_time', 'hours', 'note', 'created_at',
  ],
  penalties: ['id', 'employee_id', 'month', 'date', 'type', 'amount', 'reason', 'created_at'],
  shift_swaps: [
    'id', 'requester_id', 'requester_name', 'target_employee_id', 'target_employee_name',
    'shift_date', 'request_type', 'time_change_type', 'original_time', 'adjusted_time',
    'extra_hours', 'branch_name', 'my_shift_info', 'target_shift_info', 'reason', 'status',
    'rejection_reason', 'created_at', 'updated_at',
  ],
  news_articles: ['id', 'title', 'content', 'status', 'created_at', 'updated_at', 'published_at'],
};

const UNIQUE_KEYS = {
  employees: [['id'], ['name']],
  branches: [['id'], ['name']],
  availability: [['id'], ['employee_id', 'date']],
  schedule: [['id'], ['employee_id', 'date']],
  system_settings: [['key']],
  employee_rates: [['id']],
  penalties: [['id']],
  shift_swaps: [['id']],
  news_articles: [['id']],
};

const BACKUP_TABLES = [
  'system_settings',
  'branches',
  'employees',
  'employee_rates',
  'availability',
  'schedule',
  'penalties',
  'shift_swaps',
];

const JSON_COLUMNS = new Set(['value']);
const BOOLEAN_COLUMNS = new Set(['is_active', 'is_admin_assigned']);
const NULL_MARKER = '__GOOGLE_SHEETS_NULL__';
// Replaced at build time for community releases; the owner's own build keeps it disabled.
const LICENSE_CONFIG = { enabled: false, url: '', secret: [], version: '' };
const LICENSE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

function getLicenseState_() {
  if (!LICENSE_CONFIG.enabled) return { ok: true };
  const cache = CacheService.getScriptCache();
  const cached = cache.get('license_state');
  if (cached) return JSON.parse(cached);
  const state = refreshLicense_();
  cache.put('license_state', JSON.stringify(state), state.ok ? 120 : 60);
  return state;
}

function refreshLicense_() {
  const properties = PropertiesService.getScriptProperties();
  const key = String(properties.getProperty('LICENSE_KEY') || '').trim();
  if (!key) {
    return { ok: false, message: 'Chưa có mã giấy phép. Mở menu SATIMA > Nhập mã giấy phép trong Google Sheet để kích hoạt.' };
  }

  const nonce = Utilities.getUuid();
  let reply = null;
  let reason = '';
  try {
    const query = 'key=' + encodeURIComponent(key)
      + '&scid=' + encodeURIComponent(ScriptApp.getScriptId())
      + '&ver=' + encodeURIComponent(LICENSE_CONFIG.version)
      + '&nonce=' + encodeURIComponent(nonce);
    const response = UrlFetchApp.fetch(LICENSE_CONFIG.url + '?' + query, { muteHttpExceptions: true, followRedirects: true });
    if (response.getResponseCode() === 200) reply = JSON.parse(response.getContentText());
    else reason = 'máy chủ giấy phép trả mã HTTP ' + response.getResponseCode();
  } catch (error) {
    reply = null;
    reason = /permission|authoriz|UrlFetchApp/i.test(String(error && error.message))
      ? 'thiếu quyền gọi dịch vụ ngoài, hãy chạy hàm doGet trong trình soạn Apps Script để cấp quyền'
      : 'lỗi khi gọi máy chủ giấy phép: ' + String(error && error.message).slice(0, 80);
  }

  if (reply && !verifyLicenseReply_(reply, key, nonce)) reason = 'chữ ký không khớp, khoá ký khi build có thể sai';
  if (reply && verifyLicenseReply_(reply, key, nonce)) {
    if (reply.status === 'active') {
      properties.setProperty('LICENSE_LAST_OK', String(Date.now()));
      return { ok: true };
    }
    properties.deleteProperty('LICENSE_LAST_OK');
    return { ok: false, message: licenseStatusMessage_(reply.status) };
  }

  const lastOk = Number(properties.getProperty('LICENSE_LAST_OK') || 0);
  if (lastOk && Date.now() - lastOk < LICENSE_GRACE_MS) return { ok: true, grace: true };
  return { ok: false, message: 'Không kết nối được máy chủ giấy phép' + (reason ? ' (' + reason + ')' : '') + '. Hãy kiểm tra Internet hoặc liên hệ tác giả.' };
}

function verifyLicenseReply_(reply, key, nonce) {
  if (!reply || reply.nonce !== nonce || Math.abs(Date.now() - Number(reply.ts)) > 10 * 60 * 1000) return false;
  const secret = LICENSE_CONFIG.secret.map((code) => String.fromCharCode(code)).reverse().join('');
  const message = [reply.status, reply.expiresAt, reply.nonce, reply.ts, key].join('|');
  const expected = Utilities.base64Encode(Utilities.computeHmacSha256Signature(message, secret));
  return expected === reply.sig;
}

function licenseStatusMessage_(status) {
  if (status === 'expired') return 'Giấy phép đã hết hạn. Hãy liên hệ tác giả để gia hạn. Bạn vẫn có thể đăng nhập Admin để xuất dữ liệu.';
  if (status === 'suspended') return 'Giấy phép đang bị tạm ngưng. Bạn vẫn có thể đăng nhập Admin để xuất dữ liệu.';
  if (status === 'mismatch') return 'Mã giấy phép này đã gắn với bản triển khai khác. Hãy liên hệ tác giả.';
  return 'Giấy phép không hợp lệ hoặc đã bị thu hồi. Bạn vẫn có thể đăng nhập Admin để xuất dữ liệu.';
}

function enterLicenseKey() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt('Kích hoạt giấy phép', 'Nhập mã giấy phép do tác giả cấp:', ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) return;
  const key = response.getResponseText().trim();
  if (!key) return;
  PropertiesService.getScriptProperties().setProperty('LICENSE_KEY', key);
  CacheService.getScriptCache().remove('license_state');
  const state = getLicenseState_();
  ui.alert(state.ok ? 'Giấy phép hợp lệ. SATIMA đã được kích hoạt.' : state.message);
}

function licenseBlockMessage_(payload) {
  const state = getLicenseState_();
  if (state.ok) return null;
  const session = getAppSession_(payload.sessionToken);
  const canExport = payload.operation === 'select' && session && (session.role === 'owner' || session.role === 'admin');
  return canExport ? null : state.message;
}

function doGet(event) {
  const page = event && event.parameter && event.parameter.page === 'admin' ? 'admin' : 'employee';
  const exportMode = page === 'admin' && event.parameter.export === '1';
  const license = getLicenseState_();
  if (!license.ok && !exportMode) {
    const lockTemplate = HtmlService.createTemplateFromFile('LicenseLock');
    lockTemplate.message = license.message;
    lockTemplate.adminUrl = ScriptApp.getService().getUrl() + '?page=admin&export=1';
    return lockTemplate.evaluate()
      .setTitle('SATIMA - Giấy phép')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1');
  }
  const template = HtmlService.createTemplateFromFile('Index');
  template.webAppUrl = ScriptApp.getService().getUrl();
  template.page = page;
  return template.evaluate()
    .setTitle('Salary & Timekeeping Management System')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover');
}

function checkLicenseNow() {
  CacheService.getScriptCache().remove('license_state');
  const state = getLicenseState_();
  const text = state.ok ? 'HỢP LỆ' + (state.grace ? ' (đang dùng thời gian ân hạn)' : '') : 'BỊ KHOÁ: ' + state.message;
  Logger.log(text);
  return text;
}

function activateLicense(key, pin) {
  const cache = CacheService.getScriptCache();
  const attempts = Number(cache.get('license_activate_attempts') || 0);
  if (attempts >= 10) return { ok: false, message: 'Nhập sai quá nhiều lần. Hãy đợi 5 phút rồi thử lại.' };
  if (!executeRpc_('verify_admin_pin', { p_role_or_id: 'owner', p_input_pin: String(pin || '') })) {
    cache.put('license_activate_attempts', String(attempts + 1), 300);
    return { ok: false, message: 'PIN chủ doanh nghiệp không đúng.' };
  }
  const cleanKey = String(key || '').trim();
  if (!cleanKey) return { ok: false, message: 'Hãy nhập mã giấy phép.' };
  cache.remove('license_activate_attempts');
  PropertiesService.getScriptProperties().setProperty('LICENSE_KEY', cleanKey);
  cache.remove('license_state');
  const state = getLicenseState_();
  return state.ok ? { ok: true } : { ok: false, message: state.message };
}


function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('SATIMA')
    .addItem('Cài đặt doanh nghiệp mới', 'setupSatimaForBusiness')
    .addItem('Cấp quyền gửi thông báo email', 'authorizeEmailNotifications')
    .addItem('Nhập mã giấy phép', 'enterLicenseKey')
    .addToUi();
}

function authorizeEmailNotifications() {
  MailApp.getRemainingDailyQuota();
  SpreadsheetApp.getUi().alert('Đã cấp quyền gửi email cho thông báo đổi ca của SATIMA.');
}

function setupSatimaForBusiness() {
  const ui = SpreadsheetApp.getUi();
  const ownerPrompt = ui.prompt(
    'Cài đặt SATIMA',
    'Nhập PIN chủ doanh nghiệp (ít nhất 6 ký tự):',
    ui.ButtonSet.OK_CANCEL
  );
  if (ownerPrompt.getSelectedButton() !== ui.Button.OK) return;

  const ownerPin = ownerPrompt.getResponseText().trim();
  if (ownerPin.length < 6) {
    ui.alert('PIN chủ doanh nghiệp phải có ít nhất 6 ký tự. Hãy chạy cài đặt lại.');
    return;
  }

  const managerPrompt = ui.prompt(
    'PIN quản lý dự phòng',
    'Nhập PIN quản lý (ít nhất 6 ký tự), hoặc để trống nếu chưa cần:',
    ui.ButtonSet.OK_CANCEL
  );
  if (managerPrompt.getSelectedButton() !== ui.Button.OK) return;

  const managerPin = managerPrompt.getResponseText().trim();
  if (managerPin && managerPin.length < 6) {
    ui.alert('PIN quản lý phải có ít nhất 6 ký tự hoặc để trống. Hãy chạy cài đặt lại.');
    return;
  }

  initializeGoogleSheets();
  const properties = PropertiesService.getScriptProperties();
  properties.setProperty('OWNER_PIN', ownerPin);
  if (managerPin) {
    properties.setProperty('MANAGER_PIN', managerPin);
  } else {
    properties.deleteProperty('MANAGER_PIN');
  }

  ui.alert(
    'Đã cài đặt SATIMA cho doanh nghiệp này. Hãy mở Apps Script và triển khai Web App để bắt đầu sử dụng.'
  );
}

function doPost(event) {
  try {
    if (!event || !event.postData || typeof event.postData.contents !== 'string') {
      throw new Error('doPost must be called by an HTTP POST request. Run initializeGoogleSheets() manually to set up the tabs.');
    }
    const payload = JSON.parse(event.postData.contents || '{}');
    validateToken_(payload.token);
    if (!getLicenseState_().ok) {
      const blocked = new Error(getLicenseState_().message);
      blocked.code = 'LICENSE_LOCKED';
      throw blocked;
    }

    if (payload.operation === 'logout') return jsonOutput_({ ok: true, data: true });
    let data;
    if (payload.operation === 'rpc') {
      data = executeRpc_(payload.name, payload.params || {});
    } else if (payload.operation === 'upload_cccd') {
      data = uploadCccd_(payload);
    } else if (payload.operation === 'get_cccd') {
      data = getCccd_(payload.file_id);
    } else if (payload.operation === 'bulk_upsert') {
      data = bulkUpsert_(payload.table, payload.values);
    } else {
      data = executeQuery_(payload);
    }
    if (data && Array.isArray(data.rows) && Number.isInteger(data.count)) {
      return jsonOutput_({ ok: true, data: data.rows, count: data.count });
    }
    return jsonOutput_({ ok: true, data });
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return jsonOutput_({
      ok: false,
      error: error && error.message ? error.message : 'Unexpected Apps Script error.',
      code: error && error.code ? error.code : 'SCRIPT_ERROR',
    });
  }
}

function apiRequest(payload) {
  try {
    if (!payload || typeof payload !== 'object') throw new Error('Invalid request.');

    if (payload.operation === 'logout') {
      if (payload.sessionToken) CacheService.getScriptCache().remove(sessionCacheKey_(payload.sessionToken));
      return { data: true, error: null };
    }

    if (payload.operation === 'rpc') {
      return authenticateRequest_(payload);
    }

    const licenseMessage = licenseBlockMessage_(payload);
    if (licenseMessage) return { data: null, error: { message: licenseMessage, code: 'LICENSE_LOCKED' } };

    const session = getAppSession_(payload.sessionToken);
    if (payload.operation === 'salary_confirmation') {
      if (!session || session.role !== 'employee') {
        return { data: null, error: { message: 'Not authorized.', code: 'FORBIDDEN' } };
      }
      return { data: handleSalaryConfirmation_(payload, session), error: null };
    }
    if (payload.operation === 'restore_backup') {
      if (!session || (session.role !== 'owner' && session.role !== 'admin')) {
        return { data: null, error: { message: 'Not authorized.', code: 'FORBIDDEN' } };
      }
      return { data: restoreBackup_(payload.backup), error: null };
    }
    if (payload.operation === 'send_shift_swap_email') {
      if (!session) return { data: null, error: { message: 'Please sign in first.', code: 'FORBIDDEN' } };
      if (payload.is_test && session.role !== 'owner' && session.role !== 'admin') {
        return { data: null, error: { message: 'Not authorized.', code: 'FORBIDDEN' } };
      }
      const swap = payload.is_test ? {} : getEmployeeShiftSwapForEmail_(payload.swap?.id, session);
      return { data: sendShiftSwapEmail_(swap, Boolean(payload.is_test)), error: null };
    }
    const authorizationError = authorizeAppRequest_(payload, session);
    if (authorizationError) return { data: null, error: { message: authorizationError, code: 'FORBIDDEN' } };

    let data;
    if (payload.operation === 'upload_cccd') {
      data = uploadCccd_(payload);
    } else if (payload.operation === 'upload_news_image') {
      data = uploadNewsImage_(payload);
    } else if (payload.operation === 'get_cccd') {
      data = getCccd_(payload.file_id);
    } else {
      data = executeQuery_(payload);
    }

    if (payload.table === 'employees') {
      if (!session) data = sanitizePublicEmployees_(data);
      else if (session.role === 'manager') data = sanitizeManagerEmployees_(data);
      else if (session.role === 'employee') data = sanitizeEmployee_(data);
    }
    if (data && Array.isArray(data.rows) && Number.isInteger(data.count)) {
      return { data: data.rows, count: data.count, error: null };
    }
    return { data: data === undefined ? null : data, error: null };
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return {
      data: null,
      error: {
        message: error && error.message ? error.message : 'Unexpected Apps Script error.',
        code: error && error.code ? error.code : 'SCRIPT_ERROR',
      },
    };
  }
}

function handleSalaryConfirmation_(payload, session) {
  const month = String(payload.month || '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new Error('Tháng xác nhận bảng lương không hợp lệ.');
  }
  if (payload.action !== 'get' && payload.action !== 'confirm') {
    throw new Error('Thao tác xác nhận bảng lương không hợp lệ.');
  }

  const key = `employee_salary_confirmation:${session.id}:${month}`;
  const settingsSheet = getTableSheet_('system_settings');
  const headers = getHeaders_(settingsSheet);
  if (payload.action === 'get') {
    return readRows_(settingsSheet, headers).find((row) => row.key === key)?.value || null;
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const existing = readRows_(settingsSheet, headers).find((row) => row.key === key);
    if (existing?.value) return existing.value;

    const employeesSheet = getTableSheet_('employees');
    const employee = readRows_(employeesSheet, getHeaders_(employeesSheet))
      .find((row) => String(row.id) === String(session.id));
    if (!employee?.name) throw new Error('Không tìm thấy tên nhân viên đang đăng nhập.');

    const confirmation = {
      employee_id: String(session.id),
      employee_name: String(employee.name),
      month,
      confirmed_at: new Date().toISOString(),
    };
    upsertRows_(settingsSheet, headers, [{
      key,
      value: confirmation,
      updated_at: confirmation.confirmed_at,
    }], 'key');
    return confirmation;
  } finally {
    lock.releaseLock();
  }
}

function authenticateRequest_(payload) {
  const params = payload.params || {};
  const cache = CacheService.getScriptCache();
  const identity = payload.name === 'verify_employee_pin'
    ? String(params.p_employee_id || '')
    : String(params.p_role_or_id || '');
  if (!identity) return { data: false, error: null };

  const attemptKey = `pin_attempt_${Utilities.base64EncodeWebSafe(identity).slice(0, 80)}`;
  const attempts = Number(cache.get(attemptKey) || 0);
  if (attempts >= 10) {
    return { data: false, error: { message: 'Too many PIN attempts. Wait five minutes and try again.' } };
  }

  const verified = executeRpc_(payload.name, params);
  if (!verified) {
    cache.put(attemptKey, String(attempts + 1), 300);
    return { data: false, error: null };
  }
  cache.remove(attemptKey);

  const role = payload.name === 'verify_employee_pin'
    ? 'employee'
    : (params.p_role_or_id === 'manager' ? 'manager' : 'owner');
  const id = role === 'employee' ? String(params.p_employee_id) : 'admin';
  const sessionToken = Utilities.getUuid() + Utilities.getUuid();
  const session = { id, role, expiresAt: Date.now() + 6 * 60 * 60 * 1000 };
  cache.put(sessionCacheKey_(sessionToken), JSON.stringify(session), 21600);
  return { data: true, error: null, sessionToken };
}

function getAppSession_(token) {
  if (!token) return null;
  const serialized = CacheService.getScriptCache().get(sessionCacheKey_(token));
  if (!serialized) return null;
  try {
    const session = JSON.parse(serialized);
    if (!session.id || !session.role || session.expiresAt < Date.now()) return null;
    return session;
  } catch (error) {
    return null;
  }
}

function sessionCacheKey_(token) {
  return `app_session_${Utilities.base64EncodeWebSafe(String(token)).slice(0, 120)}`;
}

function authorizeAppRequest_(payload, session) {
  const operation = payload.operation;
  const table = payload.table;
  if (operation === 'upload_news_image') {
    return session && (session.role === 'owner' || session.role === 'admin')
      ? null
      : 'Not authorized.';
  }
  if (operation === 'upload_cccd' || operation === 'get_cccd') {
    return session && (session.role === 'owner' || session.role === 'admin')
      ? null
      : 'Not authorized.';
  }
  if (!Object.prototype.hasOwnProperty.call(TABLE_HEADERS, table)
    || !['select', 'insert', 'upsert', 'update', 'delete'].includes(operation)) {
    return 'Unsupported table or operation.';
  }

  if (session && (session.role === 'owner' || session.role === 'admin')) return null;

  if (session && session.role === 'manager') {
    if (operation === 'select') {
      if (table === 'employees') payload.columns = 'id, name, nickname, role, hourly_rate, status, is_active, sort_order, off_start_date, off_end_date';
      if (['employees', 'schedule', 'availability', 'branches'].includes(table)) return null;
      if (table === 'system_settings') {
        return isPublicEmployeeSetting_(payload) ? null : 'Not authorized.';
      }
      return 'Not authorized.';
    }
    if (table === 'system_settings' && operation === 'upsert') {
      const values = Array.isArray(payload.values) ? payload.values : [payload.values];
      return values.length && values.every((row) =>
        row &&
        row.key === 'weekly_registration_lock_day' &&
        isValidWeeklyRegistrationLockDay_(row.value)
      ) ? null : 'Not authorized.';
    }
    return ['schedule', 'availability'].includes(table) ? null : 'Not authorized.';
  }

  if (!session) {
    if (operation !== 'select' || table !== 'employees') return 'Please sign in to access this data.';
    payload.columns = 'id, name, nickname, role, status, is_active, sort_order';
    payload.filters = Array.isArray(payload.filters) ? payload.filters : [];
    payload.anyFilters = [];
    return null;
  }

  const employeeId = session.id;
  if (operation === 'select') {
    if (table === 'news_articles') {
      payload.filters = [{ column: 'status', operator: 'eq', value: 'published' }];
      payload.anyFilters = [];
      payload.columns = 'id, title, content, status, created_at, updated_at, published_at';
    } else if (table === 'employees') {
      payload.filters = Array.isArray(payload.filters) ? payload.filters : [];
      if (payload.filters.length === 0) {
        payload.columns = 'id, name, nickname, role, status, is_active, sort_order, off_start_date, off_end_date, resigned_at, created_at';
        payload.anyFilters = [];
      } else {
        payload.filters = [...payload.filters, { column: 'id', operator: 'eq', value: employeeId }];
      }
    } else if (table === 'schedule') {
      return null;
    } else if (['employee_rates', 'penalties'].includes(table)) {
      payload.filters = [...(payload.filters || []), { column: 'employee_id', operator: 'eq', value: employeeId }];
    } else if (table === 'shift_swaps') {
      payload.employee_id_scope = employeeId;
    } else if (table === 'system_settings') {
      if (!isPublicEmployeeSetting_(payload)) return 'Not authorized.';
    } else if (!['availability', 'branches'].includes(table)) {
      return 'Not authorized.';
    }
    return null;
  }

  if (table === 'availability' && ['insert', 'upsert', 'delete'].includes(operation)) {
    if (operation === 'delete') {
      payload.filters = [...(payload.filters || []), { column: 'employee_id', operator: 'eq', value: employeeId }];
      return null;
    }
    const values = Array.isArray(payload.values) ? payload.values : [payload.values];
    return values.length && values.every((row) => row && row.employee_id === employeeId)
      ? null
      : 'Not authorized.';
  }

  if (table === 'shift_swaps' && operation === 'insert') {
    const values = Array.isArray(payload.values) ? payload.values : [payload.values];
    return values.length && values.every((row) => row && row.requester_id === employeeId)
      ? null
      : 'Not authorized.';
  }

  if (table === 'employees' && operation === 'update') {
    const allowedFields = new Set(['pin', 'nickname', 'nickname_updated_at']);
    if (Object.keys(payload.values || {}).some((field) => !allowedFields.has(field))) return 'Not authorized.';
    payload.filters = [...(payload.filters || []), { column: 'id', operator: 'eq', value: employeeId }];
    return null;
  }

  return 'Not authorized.';
}

function isPublicEmployeeSetting_(payload) {
  const keys = new Set([
    'announcement_notice',
    'blocked_off_days',
    'holiday_rates',
    'special_event_mode',
    'weekly_registration_lock_day',
  ]);
  return (payload.filters || []).some((filter) =>
    filter.column === 'key' &&
    filter.operator === 'eq' &&
    (keys.has(String(filter.value)) || /^locked_week_\d{4}-\d{2}-\d{2}$/.test(String(filter.value)))
  );
}

function isValidWeeklyRegistrationLockDay_(value) {
  if (value === 'disabled') return true;
  if (typeof value === 'number') return Number.isInteger(value) && value >= 0 && value <= 6;
  return typeof value === 'string' && /^[0-6]$/.test(value);
}

function sanitizePublicEmployees_(data) {
  const allowed = new Set(['id', 'name', 'nickname', 'role', 'status', 'is_active', 'sort_order']);
  return sanitizeRows_(data, allowed);
}

function sanitizeManagerEmployees_(data) {
  const allowed = new Set([
    'id', 'name', 'nickname', 'role', 'hourly_rate', 'status', 'is_active',
    'sort_order', 'off_start_date', 'off_end_date',
  ]);
  return sanitizeRows_(data, allowed);
}

function sanitizeEmployee_(data) {
  return sanitizeRows_(data, null, new Set(['pin', 'cccd_url']));
}

function sanitizeRows_(data, allowed, denied) {
  const clean = (row) => {
    if (!row || typeof row !== 'object') return row;
    return Object.keys(row).reduce((result, key) => {
      if ((allowed && !allowed.has(key)) || (denied && denied.has(key))) return result;
      result[key] = row[key];
      return result;
    }, {});
  };
  if (Array.isArray(data)) return data.map(clean);
  if (data && Array.isArray(data.rows)) return { ...data, rows: data.rows.map(clean) };
  return clean(data);
}

function sendShiftSwapEmail_(swap, isTest) {
  const settingsSheet = getTableSheet_('system_settings');
  const settings = readRows_(settingsSheet, getHeaders_(settingsSheet));
  const saved = settings.find((row) => row.key === 'shift_swap_email_config');
  const config = saved && saved.value && typeof saved.value === 'object' ? saved.value : {};
  const recipient = String(config.email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    throw new Error('Chưa cấu hình email nhận thông báo hợp lệ trong tab Đổi Ca.');
  }

  let subject;
  let body;
  if (isTest) {
    subject = '[SATIMA] Email kiểm tra cấu hình thông báo';
    body = 'Email kiểm tra từ hệ thống SATIMA.\n\nNếu bạn nhận được thư này, cấu hình email đổi ca đã hoạt động.';
  } else {
    const cache = CacheService.getScriptCache();
    const sentKey = `shift_email_sent_${Utilities.base64EncodeWebSafe(String(swap.id)).slice(0, 100)}`;
    if (cache.get(sentKey)) throw new Error('Email cho yêu cầu này đã được gửi trước đó.');
    const requestType = String(swap.request_type || '');
    const isTimeChange = requestType === 'time_change';
    const timeChangeLabels = {
      overtime: 'Báo tăng ca',
      early_leave: 'Xin về sớm',
      late_arrival: 'Báo đi trễ',
    };
    const typeLabel = isTimeChange
      ? (timeChangeLabels[String(swap.time_change_type || '')] || 'Báo thay đổi giờ làm')
      : 'Yêu cầu đổi ca';
    const requester = String(swap.requester_name || 'Nhân viên').slice(0, 120);
    const date = String(swap.shift_date || 'Chưa xác định').slice(0, 40);
    const subjectDate = date === 'Chưa xác định' ? '' : ` — ${date}`;
    subject = `[SATIMA] ${typeLabel} — ${requester}${subjectDate}`.slice(0, 250);
    const lines = [
      `${typeLabel.toUpperCase()} — SATIMA`,
      '',
      `Nhân viên: ${requester}`,
      `Ngày: ${date}`,
    ];

    if (isTimeChange) {
      lines.push(
        `Ca gốc: ${String(swap.original_time || swap.my_shift_info || 'Không rõ').slice(0, 300)}`,
        `Thực tế / thời gian đề xuất: ${String(swap.adjusted_time || 'Chưa nhập').slice(0, 300)}`
      );
      if (swap.extra_hours !== undefined && swap.extra_hours !== null && swap.extra_hours !== '') {
        lines.push(`Chênh lệch: ${String(swap.extra_hours).slice(0, 40)} giờ`);
      }
    } else {
      lines.push(
        `Đổi với: ${String(swap.target_employee_name || 'Đồng nghiệp').slice(0, 120)}`,
        `Ca của nhân viên gửi yêu cầu: ${String(swap.my_shift_info || 'Có ca làm').slice(0, 300)}`,
        `Ca của đồng nghiệp: ${String(swap.target_shift_info || 'Không có ca').slice(0, 300)}`
      );
    }
    lines.push(
      `Lý do: ${String(swap.reason || 'Không có').slice(0, 1000)}`,
      '',
      'Vui lòng mở SATIMA để xem và xử lý yêu cầu.'
    );
    body = lines.join('\n');
  }

  MailApp.sendEmail({
    to: recipient,
    subject,
    body,
    name: 'SATIMA - Chấm công',
  });
  if (!isTest) {
    CacheService.getScriptCache().put(
      `shift_email_sent_${Utilities.base64EncodeWebSafe(String(swap.id)).slice(0, 100)}`,
      '1',
      21600
    );
  }
  return { ok: true };
}

function getEmployeeShiftSwapForEmail_(swapId, session) {
  if (session.role !== 'employee' || !swapId) throw new Error('Not authorized.');
  const sheet = getTableSheet_('shift_swaps');
  const row = readRows_(sheet, getHeaders_(sheet))
    .find((item) => String(item.id) === String(swapId));
  if (!row || String(row.requester_id) !== String(session.id)) {
    throw new Error('Không tìm thấy yêu cầu đổi ca thuộc tài khoản nhân viên này.');
  }
  return row;
}

function initializeGoogleSheets() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(TABLE_HEADERS).forEach((table) => {
    let sheet = spreadsheet.getSheetByName(table);
    if (!sheet) sheet = spreadsheet.insertSheet(table);
    const headers = TABLE_HEADERS[table];
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
    } else {
      const currentHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
      if (JSON.stringify(currentHeaders) !== JSON.stringify(headers)) {
        throw new Error(`Header mismatch on "${table}". Back up and align its first row before setup.`);
      }
    }
  });
}

function validateToken_(provided) {
  const expected = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
  if (!expected) throw new Error('Missing API_TOKEN in Apps Script project properties.');
  const actual = String(provided || '');
  if (actual.length !== expected.length) throw new Error('Unauthorized.');
  let difference = 0;
  for (let i = 0; i < expected.length; i += 1) {
    difference |= expected.charCodeAt(i) ^ actual.charCodeAt(i);
  }
  if (difference !== 0) throw new Error('Unauthorized.');
}

function executeQuery_(query) {
  const table = query.table;
  const operation = query.operation;
  const sheet = getTableSheet_(table);
  const headers = getHeaders_(sheet);
  const rows = readRows_(sheet, headers);

  if (operation === 'select') {
    let matching = rows.filter((row) =>
      matchesFilters_(row, query.filters, query.anyFilters, query.employee_id_scope)
    );
    matching = applyOrders_(matching, query.orders || []);
    const count = matching.length;
    const offset = Number.isInteger(query.offset) && query.offset >= 0 ? query.offset : 0;
    if (Number.isInteger(query.limit) && query.limit >= 0) {
      matching = matching.slice(offset, offset + query.limit);
    } else if (offset > 0) {
      matching = matching.slice(offset);
    }
    if (query.head) return { rows: [], count };
    const selected = applyRelations_(matching, query.columns || '*');
    const data = query.cardinality === 'one' || query.cardinality === 'maybe-one'
      ? oneResult_(selected, query.cardinality)
      : selected;
    return query.count ? { rows: data, count } : data;
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (operation === 'insert' || operation === 'upsert') {
      const values = Array.isArray(query.values) ? query.values : [query.values];
      const changed = operation === 'insert'
        ? insertRows_(sheet, headers, rows, values)
        : upsertRows_(sheet, headers, values, query.conflict);
      return query.returning ? returningRows_(changed, query) : null;
    }

    const matchingIndexes = [];
    rows.forEach((row, index) => {
      if (matchesFilters_(row, query.filters, query.anyFilters, query.employee_id_scope)) matchingIndexes.push(index);
    });

    if (operation === 'update') {
      const update = query.values || {};
      const changed = matchingIndexes.map((index) => ({ ...rows[index], ...update }));
      matchingIndexes.forEach((index, offset) => writeRow_(sheet, headers, index + 2, changed[offset]));
      return query.returning ? returningRows_(changed, query) : null;
    }

    if (operation === 'delete') {
      matchingIndexes.reverse().forEach((index) => sheet.deleteRow(index + 2));
      return query.returning ? [] : null;
    }

    throw new Error(`Unsupported operation: ${operation}`);
  } finally {
    lock.releaseLock();
  }
}

function bulkUpsert_(table, values) {
  const rows = Array.isArray(values) ? values : [];
  if (rows.length > 500) throw new Error('Bulk import batch cannot exceed 500 rows.');
  const sheet = getTableSheet_(table);
  const headers = getHeaders_(sheet);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const conflict = table === 'system_settings' ? 'key' : 'id';
    const written = upsertRows_(sheet, headers, rows, conflict);
    return { imported: written.length };
  } finally {
    lock.releaseLock();
  }
}

function restoreBackup_(backup) {
  if (!backup || typeof backup !== 'object' || Array.isArray(backup)
    || backup.version !== '1.0' || !backup.tables || typeof backup.tables !== 'object') {
    throw new Error('File backup không đúng định dạng SATIMA JSON version 1.0.');
  }

  const preparedTables = {};
  let totalRows = 0;
  BACKUP_TABLES.forEach((table) => {
    const inputRows = backup.tables[table];
    if (!Array.isArray(inputRows)) {
      throw new Error(`File backup thiếu bảng "${table}" hoặc dữ liệu bảng không hợp lệ.`);
    }
    if (inputRows.length > 20000) throw new Error(`Bảng "${table}" vượt quá giới hạn số dòng cho phép.`);
    totalRows += inputRows.length;

    const uniqueKeys = UNIQUE_KEYS[table] || [['id']];
    const seen = uniqueKeys.map(() => new Set());
    preparedTables[table] = inputRows.map((input, index) => {
      if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new Error(`Dòng ${index + 1} của bảng "${table}" không hợp lệ.`);
      }
      const unknownColumns = Object.keys(input).filter((column) => !TABLE_HEADERS[table].includes(column));
      if (unknownColumns.length) {
        throw new Error(`Bảng "${table}" có cột không hỗ trợ: ${unknownColumns.join(', ')}.`);
      }
      const row = prepareRow_(table, input, false);
      uniqueKeys.forEach((columns, keyIndex) => {
        const parts = columns.map((column) => String(row[column] ?? '').trim().toLowerCase());
        if (parts.some((part) => !part)) return;
        const key = JSON.stringify(parts);
        if (seen[keyIndex].has(key)) {
          throw new Error(`Bảng "${table}" có dữ liệu trùng khóa tại dòng ${index + 1}.`);
        }
        seen[keyIndex].add(key);
      });
      return row;
    });
  });
  if (totalRows > 30000) throw new Error('File backup vượt quá giới hạn tổng số bản ghi cho phép.');

  const sheets = {};
  BACKUP_TABLES.forEach((table) => {
    const sheet = getTableSheet_(table);
    const headers = getHeaders_(sheet);
    sheets[table] = { sheet, headers, rows: preparedTables[table] };
  });

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  const snapshots = {};
  let writeStarted = false;
  try {
    BACKUP_TABLES.forEach((table) => {
      const { sheet, headers } = sheets[table];
      const lastRow = sheet.getLastRow();
      snapshots[table] = lastRow > 1
        ? sheet.getRange(2, 1, lastRow - 1, headers.length).getValues()
        : [];
    });
    writeStarted = true;
    BACKUP_TABLES.forEach((table) => {
      const { sheet, headers, rows } = sheets[table];
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        sheet.getRange(2, 1, lastRow - 1, headers.length).clearContent();
      }
      if (rows.length) appendRows_(sheet, headers, rows);
    });
  } catch (error) {
    const rollbackErrors = [];
    if (writeStarted) {
      BACKUP_TABLES.forEach((table) => {
        try {
          const { sheet, headers } = sheets[table];
          const lastRow = sheet.getLastRow();
          if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, headers.length).clearContent();
          const values = snapshots[table];
          if (values.length) {
            const range = sheet.getRange(2, 1, values.length, headers.length);
            range.setNumberFormat('@');
            range.setValues(values);
          }
        } catch (rollbackError) {
          rollbackErrors.push(`${table}: ${rollbackError.message || rollbackError}`);
        }
      });
    }
    if (rollbackErrors.length) {
      console.error(`Backup restore rollback errors: ${rollbackErrors.join('; ')}`);
      throw new Error(
        `Khôi phục backup thất bại: ${error.message || error}. ` +
        `Không khôi phục được đầy đủ các bảng: ${rollbackErrors.join('; ')}.`
      );
    }
    throw error;
  } finally {
    lock.releaseLock();
  }

  return {
    imported: Object.fromEntries(BACKUP_TABLES.map((table) => [table, preparedTables[table].length])),
    backup_date: backup.backup_date || '',
    preserved_tables: ['news_articles'],
  };
}

function executeRpc_(name, params) {
  const employees = readRows_(getTableSheet_('employees'), getHeaders_(getTableSheet_('employees')));
  if (name === 'verify_employee_pin') {
    const employee = employees.find((row) => sameValue_(row.id, params.p_employee_id));
    return Boolean(employee && String(employee.pin || '123456') === String(params.p_input_pin || ''));
  }
  if (name === 'verify_admin_pin') {
    const inputPin = String(params.p_input_pin || '');
    const roleOrId = String(params.p_role_or_id || '');
    const accounts = employees.filter((employee) =>
      roleOrId === 'owner' || roleOrId === 'manager'
        ? employee.role === roleOrId
        : sameValue_(employee.id, roleOrId)
    );
    const fallbackPin = PropertiesService.getScriptProperties().getProperty(
      roleOrId === 'manager' ? 'MANAGER_PIN' : 'OWNER_PIN'
    );
    if (!accounts.length) {
      return Boolean(fallbackPin && inputPin === fallbackPin);
    }
    return accounts.some((employee) => {
      return String(employee.pin || fallbackPin || '') === inputPin;
    });
  }
  throw new Error(`Unsupported RPC: ${name}`);
}

function uploadCccd_(payload) {
  const employeeId = String(payload.employee_id || '');
  const mimeType = String(payload.mime_type || '');
  const encoded = String(payload.base64 || '');
  if (!employeeId || !/^image\/(jpeg|png)$/.test(mimeType) || !encoded) {
    throw new Error('Invalid CCCD image upload.');
  }
  if (encoded.length > 3 * 1024 * 1024) throw new Error('CCCD image exceeds the 2 MB upload limit.');

  const bytes = Utilities.base64Decode(encoded);
  const extension = mimeType === 'image/png' ? 'png' : 'jpg';
  const blob = Utilities.newBlob(bytes, mimeType, `cccd_${employeeId}_${Date.now()}.${extension}`);
  const folderId = PropertiesService.getScriptProperties().getProperty('CCCD_DRIVE_FOLDER_ID');
  const file = folderId
    ? DriveApp.getFolderById(folderId).createFile(blob)
    : DriveApp.createFile(blob);
  return { fileId: file.getId() };
}

function uploadNewsImage_(payload) {
  const mimeType = String(payload.mime_type || '');
  const encoded = String(payload.base64 || '');
  const allowedTypes = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };
  if (!Object.prototype.hasOwnProperty.call(allowedTypes, mimeType) || !encoded) {
    throw new Error('Ảnh phải có định dạng JPG, PNG hoặc WebP.');
  }
  if (encoded.length > 4 * 1024 * 1024) {
    throw new Error('Mỗi ảnh không được vượt quá 3 MB.');
  }

  const properties = PropertiesService.getScriptProperties();
  let folderId = properties.getProperty('NEWS_IMAGE_DRIVE_FOLDER_ID');
  let folder;
  if (folderId) {
    folder = DriveApp.getFolderById(folderId);
  } else {
    folder = DriveApp.createFolder('SATIMA News Images');
    properties.setProperty('NEWS_IMAGE_DRIVE_FOLDER_ID', folder.getId());
  }
  const blob = Utilities.newBlob(
    Utilities.base64Decode(encoded),
    mimeType,
    `news_${Date.now()}.${allowedTypes[mimeType]}`
  );
  const file = folder.createFile(blob);
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (error) {
    file.setTrashed(true);
    throw new Error(`Không thể cấp quyền xem ảnh qua liên kết Google Drive: ${error.message || error}`);
  }
  return { fileId: file.getId() };
}

function getCccd_(fileId) {
  if (!fileId) throw new Error('Missing CCCD Drive file ID.');
  const blob = DriveApp.getFileById(String(fileId)).getBlob();
  return {
    mimeType: blob.getContentType(),
    base64: Utilities.base64Encode(blob.getBytes()),
  };
}

function insertRows_(sheet, headers, existing, values) {
  const rules = UNIQUE_KEYS[sheet.getName()] || [['id']];
  const prepared = values.map((item) => prepareRow_(sheet.getName(), item));
  prepared.forEach((candidate) => {
    assertUnique_(candidate, existing.concat(prepared.filter((row) => row !== candidate)), rules);
  });
  appendRows_(sheet, headers, prepared);
  return prepared;
}

function upsertRows_(sheet, headers, values, conflict) {
  const table = sheet.getName();
  const rules = conflict
    ? [String(conflict).split(',').map((column) => column.trim())]
    : UNIQUE_KEYS[table] || [['id']];
  const prepared = (Array.isArray(values) ? values : [values]).map((item) => prepareRow_(table, item, false));
  const current = readRows_(sheet, headers);
  const changed = [];
  const added = [];
  const updatedIndexes = [];

  prepared.forEach((candidate) => {
    const index = current.findIndex((row) => rules.some((keys) =>
      keys.every((key) => candidate[key] !== undefined && sameValue_(row[key], candidate[key]))
    ));
    if (index < 0) {
      const newRow = prepareRow_(table, candidate, true);
      assertUnique_(newRow, current, UNIQUE_KEYS[table] || [['id']]);
      current.push(newRow);
      added.push(newRow);
      changed.push(newRow);
    } else {
      const merged = { ...current[index], ...candidate };
      if (table === 'system_settings' && candidate.updated_at === undefined) {
        merged.updated_at = new Date().toISOString();
      }
      assertUnique_(merged, current.filter((_, rowIndex) => rowIndex !== index), UNIQUE_KEYS[table] || [['id']]);
      current[index] = merged;
      updatedIndexes.push(index);
      changed.push(merged);
    }
  });

  if (added.length) appendRows_(sheet, headers, added);
  updatedIndexes.forEach((index) => writeRow_(sheet, headers, index + 2, current[index]));
  return changed;
}

function assertUnique_(candidate, rows, rules) {
  rules.forEach((keys) => {
    if (keys.some((key) => candidate[key] === undefined || candidate[key] === null || candidate[key] === '')) {
      return;
    }
    if (rows.some((row) => keys.every((key) => sameValue_(row[key], candidate[key])))) {
      const error = new Error(`Duplicate value for unique key: ${keys.join(', ')}`);
      error.code = '23505';
      throw error;
    }
  });
}

function returningRows_(rows, query) {
  let selected = applyOrders_(rows, query.orders || []);
  const offset = Number.isInteger(query.offset) && query.offset >= 0 ? query.offset : 0;
  if (Number.isInteger(query.limit) && query.limit >= 0) {
    selected = selected.slice(offset, offset + query.limit);
  } else if (offset > 0) {
    selected = selected.slice(offset);
  }
  selected = applyRelations_(selected, query.columns || '*');
  return query.cardinality === 'one' || query.cardinality === 'maybe-one'
    ? oneResult_(selected, query.cardinality)
    : selected;
}

function oneResult_(rows, cardinality) {
  if (rows.length > 1 || (cardinality === 'one' && rows.length === 0)) {
    const error = new Error('Expected one row, but found a different number of rows.');
    error.code = 'PGRST116';
    throw error;
  }
  return rows[0] || null;
}

function readRows_(sheet, headers) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, headers.length).getValues()
    .filter((values) => values.some((value) => value !== '' && value !== null))
    .map((values) => {
      const row = {};
      headers.forEach((header, index) => {
        row[header] = normalizeReadValue_(header, values[index]);
      });
      return row;
    });
}

function normalizeReadValue_(column, value) {
  if (value === NULL_MARKER) return null;
  if (value instanceof Date) {
    if (column === 'start_time' || column === 'end_time') {
      return Utilities.formatDate(value, Session.getScriptTimeZone(), 'HH:mm:ss');
    }
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  if (JSON_COLUMNS.has(column) && typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (error) {
      return value;
    }
  }
  if (BOOLEAN_COLUMNS.has(column) && typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }
  return value;
}

function prepareRow_(table, input, includeGeneratedFields = true) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Row must be an object.');
  const headers = TABLE_HEADERS[table];
  const row = {};
  headers.forEach((header) => {
    if (Object.prototype.hasOwnProperty.call(input, header)) row[header] = input[header];
  });
  if (includeGeneratedFields && table !== 'system_settings' && !row.id) row.id = Utilities.getUuid();
  if (includeGeneratedFields && table !== 'system_settings' && !row.created_at) row.created_at = new Date().toISOString();
  if (includeGeneratedFields && table === 'system_settings' && !row.updated_at) row.updated_at = new Date().toISOString();
  if (table === 'employees') {
    if (row.role === undefined) row.role = 'staff';
    if (row.hourly_rate === undefined) row.hourly_rate = 20000;
    if (row.pin === undefined) row.pin = '1234';
    if (row.status === undefined) row.status = 'active';
    if (row.is_active === undefined) row.is_active = true;
    if (row.nickname === undefined) row.nickname = '';
  }
  if (table === 'branches') {
    if (row.color === undefined) row.color = '#f59e0b';
    if (row.is_active === undefined) row.is_active = true;
  }
  if (table === 'availability') {
    if (row.type === undefined) row.type = 'full';
    if (row.is_admin_assigned === undefined) row.is_admin_assigned = false;
  }
  if (table === 'penalties' && row.type === undefined) row.type = 'penalty';
  if (table === 'shift_swaps') {
    if (row.status === undefined) row.status = 'pending';
    if (row.updated_at === undefined) row.updated_at = row.created_at;
  }
  return row;
}

function appendRows_(sheet, headers, rows) {
  if (!rows.length) return;
  const startRow = sheet.getLastRow() + 1;
  const values = rows.map((row) => headers.map((header) => normalizeWriteValue_(header, row[header])));
  const range = sheet.getRange(startRow, 1, values.length, headers.length);
  range.setNumberFormat('@');
  range.setValues(values);
}

function writeRow_(sheet, headers, rowNumber, row) {
  const values = headers.map((header) => normalizeWriteValue_(header, row[header]));
  const range = sheet.getRange(rowNumber, 1, 1, headers.length);
  range.setNumberFormat('@');
  range.setValues([values]);
}

function normalizeWriteValue_(column, value) {
  if (value === undefined) return '';
  if (value === null) return NULL_MARKER;
  if (JSON_COLUMNS.has(column) && typeof value !== 'string') return JSON.stringify(value);
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

function applyRelations_(rows, columns) {
  const relations = parseRelations_(columns);
  if (!relations.length) return rows;
  let result = rows.map((row) => ({ ...row }));
  relations.forEach((relation) => {
    const foreignKey = relation.table === 'employees' ? 'employee_id'
      : relation.table === 'branches' ? 'branch_id'
        : null;
    if (!foreignKey) return;
    const relatedSheet = getTableSheet_(relation.table);
    const relatedHeaders = getHeaders_(relatedSheet);
    const relatedRows = readRows_(relatedSheet, relatedHeaders);
    const relatedById = new Map(relatedRows.map((item) => [String(item.id), item]));
    result = result.map((row) => {
      const related = relatedById.get(String(row[foreignKey]));
      const projection = {};
      relation.columns.forEach((column) => {
        projection[column] = related ? related[column] : null;
      });
      return { ...row, [relation.table]: related ? projection : null };
    });
  });
  return result;
}

function parseRelations_(columns) {
  const result = [];
  const matcher = /([a-z_]+)\(([^()]*)\)/g;
  let match;
  while ((match = matcher.exec(columns)) !== null) {
    result.push({
      table: match[1],
      columns: match[2].split(',').map((column) => column.trim()).filter(Boolean),
    });
  }
  return result;
}

function matchesFilters_(row, filters, anyFilters, employeeScope) {
  const required = filters || [];
  if (!required.every((filter) => matchesFilter_(row, filter))) return false;
  if (employeeScope && row.employee_id !== employeeScope &&
      row.requester_id !== employeeScope && row.target_employee_id !== employeeScope) return false;
  const alternatives = anyFilters || [];
  return alternatives.length === 0 || alternatives.some((filter) => matchesFilter_(row, filter));
}

function matchesFilter_(row, filter) {
  const actual = row[filter.column];
  const expected = filter.value;
  switch (filter.operator) {
    case 'eq': return sameValue_(actual, expected);
    case 'neq': return !sameValue_(actual, expected);
    case 'is': return expected === null || expected === 'null'
      ? actual === null || actual === undefined || actual === ''
      : sameValue_(actual, expected);
    case 'ilike': {
      const pattern = String(expected || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*');
      return new RegExp(`^${pattern}$`, 'i').test(String(actual || ''));
    }
    case 'gte': return compareValues_(actual, expected) >= 0;
    case 'lte': return compareValues_(actual, expected) <= 0;
    default: throw new Error(`Unsupported filter operator: ${filter.operator}`);
  }
}

function applyOrders_(rows, orders) {
  return rows.slice().sort((left, right) => {
    for (const order of orders) {
      const a = left[order.column];
      const b = right[order.column];
      if (a === b) continue;
      if (a === null || a === undefined || a === '') return order.nullsFirst ? -1 : 1;
      if (b === null || b === undefined || b === '') return order.nullsFirst ? 1 : -1;
      const compared = compareValues_(a, b);
      if (compared !== 0) return order.ascending ? compared : -compared;
    }
    return 0;
  });
}

function compareValues_(left, right) {
  const a = left instanceof Date ? left.getTime() : left;
  const b = right instanceof Date ? right.getTime() : right;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  const numberA = Number(a);
  const numberB = Number(b);
  if (String(a).trim() !== '' && String(b).trim() !== '' && Number.isFinite(numberA) && Number.isFinite(numberB)) {
    return numberA - numberB;
  }
  return String(a).localeCompare(String(b));
}

function sameValue_(left, right) {
  if (left === null || left === undefined) return right === null || right === undefined || right === 'null';
  if (right === null || right === undefined) return false;
  if (typeof left === 'boolean') return left === (right === true || String(right).toLowerCase() === 'true');
  if (typeof right === 'boolean') return (left === true || String(left).toLowerCase() === 'true') === right;
  return String(left).trim().toLowerCase() === String(right).trim().toLowerCase();
}

function getTableSheet_(table) {
  if (!Object.prototype.hasOwnProperty.call(TABLE_HEADERS, table)) throw new Error(`Unsupported table: ${table}`);
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(table);
  if (!sheet && table === 'news_articles') {
    sheet = spreadsheet.insertSheet(table);
    sheet.getRange(1, 1, 1, TABLE_HEADERS[table].length).setValues([TABLE_HEADERS[table]]);
    sheet.setFrozenRows(1);
  }
  if (!sheet) throw new Error(`Sheet "${table}" not found. Run initializeGoogleSheets() first.`);
  return sheet;
}

function getHeaders_(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  if (JSON.stringify(headers) !== JSON.stringify(TABLE_HEADERS[sheet.getName()])) {
    throw new Error(`Header mismatch on "${sheet.getName()}".`);
  }
  return headers;
}

function jsonOutput_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
