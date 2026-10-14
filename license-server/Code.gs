const LICENSE_SHEET = 'LICENSES';
const LICENSE_HEADERS = [
  'license_key', 'owner_name', 'contact', 'status', 'script_id',
  'issued_at', 'expires_at', 'last_check_at', 'last_seen_version', 'note',
];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('SATIMA License')
    .addItem('📋 Mở bảng quản lý giấy phép', 'openLicenseManager')
    .addSeparator()
    .addItem('Khởi tạo bảng LICENSES + khoá ký', 'setupLicenseServer')
    .addItem('Hiện khoá ký (dùng khi build)', 'showSigningSecret')
    .addToUi();
}

function openLicenseManager() {
  const html = HtmlService.createHtmlOutputFromFile('Admin').setWidth(1100).setHeight(640);
  SpreadsheetApp.getUi().showModalDialog(html, 'Quản lý giấy phép SATIMA');
}

function adminListLicenses() {
  const rows = getLicenseSheet_().getDataRange().getValues();
  const ms = (value) => (value instanceof Date ? value.getTime() : 0);
  return rows.slice(1).filter((row) => String(row[0]).trim()).map((row) => ({
    key: String(row[0]).trim(),
    name: String(row[1] || ''),
    contact: String(row[2] || ''),
    status: String(row[3] || 'active').trim().toLowerCase(),
    scriptId: String(row[4] || ''),
    issuedAt: ms(row[5]),
    expiresAt: ms(row[6]),
    lastCheck: ms(row[7]),
    version: String(row[8] || ''),
    note: String(row[9] || ''),
  })).reverse();
}

function adminCreateLicense(name, contact, days) {
  const cleanName = String(name || '').trim();
  if (!cleanName) throw new Error('Thiếu tên người nhận.');
  const count = Number(days);
  const hasExpiry = String(days || '').trim() !== '' && count > 0;
  const key = 'SATI-' + randomToken_(4) + '-' + randomToken_(4) + '-' + randomToken_(4);
  const now = new Date();
  const expiresAt = hasExpiry ? new Date(now.getTime() + count * 86400000) : '';
  getLicenseSheet_().appendRow([key, cleanName, String(contact || '').trim(), 'active', '', now, expiresAt, '', '', '']);
  return key;
}

function adminUpdateLicense(key, action, value) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getLicenseSheet_();
    const rows = sheet.getDataRange().getValues();
    for (let index = 1; index < rows.length; index += 1) {
      if (String(rows[index][0]).trim() !== String(key).trim()) continue;
      const rowNumber = index + 1;
      if (action === 'revoke') sheet.getRange(rowNumber, 4).setValue('revoked');
      else if (action === 'suspend') sheet.getRange(rowNumber, 4).setValue('suspended');
      else if (action === 'activate') sheet.getRange(rowNumber, 4, 1, 1).setValue('active');
      else if (action === 'unbind') sheet.getRange(rowNumber, 5).setValue('');
      else if (action === 'extend') {
        const extra = Number(value);
        if (!(extra > 0)) throw new Error('Số ngày không hợp lệ.');
        const current = rows[index][6] instanceof Date ? rows[index][6].getTime() : 0;
        const base = Math.max(Date.now(), current);
        sheet.getRange(rowNumber, 7).setValue(new Date(base + extra * 86400000));
        sheet.getRange(rowNumber, 4).setValue('active');
      } else throw new Error('Thao tác không hợp lệ.');
      return true;
    }
    throw new Error('Không tìm thấy giấy phép.');
  } finally {
    lock.releaseLock();
  }
}

function setupLicenseServer() {
  const sheet = getLicenseSheet_();
  const properties = PropertiesService.getScriptProperties();
  if (!properties.getProperty('SIGNING_SECRET')) {
    properties.setProperty('SIGNING_SECRET', randomToken_(48));
  }
  sheet.setFrozenRows(1);
  SpreadsheetApp.getUi().alert('Đã sẵn sàng. Dùng menu "Hiện khoá ký" để lấy SATIMA_LICENSE_SECRET khi build bản cộng đồng.');
}

function showSigningSecret() {
  const secret = PropertiesService.getScriptProperties().getProperty('SIGNING_SECRET');
  if (!secret) {
    SpreadsheetApp.getUi().alert('Chưa có khoá ký. Hãy chạy "Khởi tạo bảng LICENSES + khoá ký" trước.');
    return;
  }
  SpreadsheetApp.getUi().alert('SATIMA_LICENSE_SECRET (giữ bí mật, không đưa vào Sheet hay git):\n\n' + secret);
}

function issueLicense() {
  const ui = SpreadsheetApp.getUi();
  const nameResponse = ui.prompt('Cấp giấy phép', 'Tên người / cửa hàng nhận:', ui.ButtonSet.OK_CANCEL);
  if (nameResponse.getSelectedButton() !== ui.Button.OK) return;
  const daysResponse = ui.prompt('Thời hạn', 'Số ngày hiệu lực (để trống = không hết hạn):', ui.ButtonSet.OK_CANCEL);
  if (daysResponse.getSelectedButton() !== ui.Button.OK) return;

  const days = Number(daysResponse.getResponseText().trim());
  const hasExpiry = daysResponse.getResponseText().trim() !== '' && days > 0;
  const key = 'SATI-' + randomToken_(4) + '-' + randomToken_(4) + '-' + randomToken_(4);
  const now = new Date();
  const expiresAt = hasExpiry ? new Date(now.getTime() + days * 86400000) : '';
  getLicenseSheet_().appendRow([
    key, nameResponse.getResponseText().trim(), '', 'active', '', now, expiresAt, '', '', '',
  ]);
  ui.alert('Mã giấy phép: ' + key + '\n\nGửi mã này cho người dùng để họ nhập trong menu SATIMA của Sheet của họ.');
}

function doGet(event) {
  const params = (event && event.parameter) || {};
  const key = String(params.key || '').trim();
  const nonce = String(params.nonce || '').slice(0, 64);
  const scriptId = String(params.scid || params.sid || '').slice(0, 120);
  const version = String(params.ver || '').slice(0, 30);
  const result = evaluateLicense_(key, scriptId, version);
  return signedResponse_(result.status, result.expiresAt, nonce, key);
}

function evaluateLicense_(key, scriptId, version) {
  if (!key) return { status: 'unknown', expiresAt: '' };
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getLicenseSheet_();
    const rows = sheet.getDataRange().getValues();
    for (let index = 1; index < rows.length; index += 1) {
      if (String(rows[index][0]).trim() !== key) continue;
      const rowNumber = index + 1;
      const row = rows[index];
      let status = String(row[3] || '').trim().toLowerCase() || 'active';
      const boundScript = String(row[4] || '').trim();
      const expires = row[6] instanceof Date ? row[6] : null;

      if (status === 'active' && boundScript && scriptId && boundScript !== scriptId) {
        status = 'mismatch';
        sheet.getRange(rowNumber, 10).setValue('Script ID lạ: ' + scriptId + ' lúc ' + new Date().toISOString());
      } else if (status === 'active' && !boundScript && scriptId) {
        sheet.getRange(rowNumber, 5).setValue(scriptId);
      }
      if (status === 'active' && expires && expires.getTime() < Date.now()) status = 'expired';

      sheet.getRange(rowNumber, 8, 1, 2).setValues([[new Date(), version]]);
      return { status, expiresAt: expires ? expires.getTime() : '' };
    }
    return { status: 'unknown', expiresAt: '' };
  } finally {
    lock.releaseLock();
  }
}

function signedResponse_(status, expiresAt, nonce, key) {
  const secret = PropertiesService.getScriptProperties().getProperty('SIGNING_SECRET') || '';
  const ts = Date.now();
  const message = [status, expiresAt, nonce, ts, key].join('|');
  const sig = Utilities.base64Encode(Utilities.computeHmacSha256Signature(message, secret));
  return ContentService
    .createTextOutput(JSON.stringify({ status, expiresAt, nonce, ts, sig }))
    .setMimeType(ContentService.MimeType.JSON);
}

function getLicenseSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(LICENSE_SHEET);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(LICENSE_SHEET);
    sheet.getRange(1, 1, 1, LICENSE_HEADERS.length).setValues([LICENSE_HEADERS]);
  }
  return sheet;
}

function randomToken_(length) {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let value = '';
  while (value.length < length) {
    const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Math.random());
    for (let i = 0; i < bytes.length && value.length < length; i += 1) {
      value += alphabet.charAt((bytes[i] & 255) % alphabet.length);
    }
  }
  return value;
}
