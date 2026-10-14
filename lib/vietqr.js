// ============================================
// VIETNAM BANKS & VIETQR SMART HELPER
// ============================================

export const VIETNAM_BANKS = [
  { code: '970454', shortName: 'BVB', name: 'BVBank (Bản Việt)', fullName: 'Ngân hàng TMCP Bản Việt', aliases: ['bvbank', 'banviet', 'bvb', 'vietcapitalbank', 'ban viet', 'bản việt', 'bv'] },
  { code: '970422', shortName: 'MB', name: 'MB Bank (Quân Đội)', fullName: 'Ngân hàng TMCP Quân Đội', aliases: ['mbbank', 'mb', 'quan doi', 'quân đội', 'mb bank'] },
  { code: '970436', shortName: 'VCB', name: 'Vietcombank', fullName: 'Ngân hàng TMCP Ngoại Thương Việt Nam', aliases: ['vietcombank', 'vcb', 'vietcom', 'ngoai thuong'] },
  { code: '970407', shortName: 'TCB', name: 'Techcombank', fullName: 'Ngân hàng TMCP Kỹ Thương Việt Nam', aliases: ['techcombank', 'tcb', 'techcom', 'ky thuong'] },
  { code: '970415', shortName: 'ICB', name: 'VietinBank', fullName: 'Ngân hàng TMCP Công Thương Việt Nam', aliases: ['vietinbank', 'ctg', 'icb', 'vietin', 'cong thuong'] },
  { code: '970418', shortName: 'BIDV', name: 'BIDV', fullName: 'Ngân hàng TMCP Đầu Tư và Phát Triển Việt Nam', aliases: ['bidv', 'dau tu', 'đầu tư'] },
  { code: '970405', shortName: 'VBA', name: 'Agribank', fullName: 'Ngân hàng Nông nghiệp và PTNT Việt Nam', aliases: ['agribank', 'vba', 'nong nghiep', 'nông nghiệp', 'agri'] },
  { code: '970416', shortName: 'ACB', name: 'ACB (Á Châu)', fullName: 'Ngân hàng TMCP Á Châu', aliases: ['acb', 'a chau', 'á châu'] },
  { code: '970432', shortName: 'VPB', name: 'VPBank', fullName: 'Ngân hàng TMCP Việt Nam Thịnh Vượng', aliases: ['vpbank', 'vpb', 'thinh vuong', 'thịnh vượng', 'vp'] },
  { code: '970423', shortName: 'TPB', name: 'TPBank', fullName: 'Ngân hàng TMCP Tiên Phong', aliases: ['tpbank', 'tpb', 'tien phong', 'tiên phong', 'tp'] },
  { code: '970403', shortName: 'STB', name: 'Sacombank', fullName: 'Ngân hàng TMCP Sài Gòn Thương Tín', aliases: ['sacombank', 'stb', 'sacom', 'sai gon thuong tin'] },
  { code: '970437', shortName: 'HDB', name: 'HDBank', fullName: 'Ngân hàng TMCP Phát Triển TP.HCM', aliases: ['hdbank', 'hdb', 'phat trien'] },
  { code: '970441', shortName: 'VIB', name: 'VIB (Quốc Tế)', fullName: 'Ngân hàng TMCP Quốc Tế Việt Nam', aliases: ['vib', 'quoc te', 'quốc tế'] },
  { code: '970448', shortName: 'OCB', name: 'OCB (Phương Đông)', fullName: 'Ngân hàng TMCP Phương Đông', aliases: ['ocb', 'phuong dong', 'phương đông'] },
  { code: '970426', shortName: 'MSB', name: 'MSB (Hàng Hải)', fullName: 'Ngân hàng TMCP Hàng Hải Việt Nam', aliases: ['msb', 'hang hai', 'hàng hải', 'maritimebank'] },
  { code: '970443', shortName: 'SHB', name: 'SHB', fullName: 'Ngân hàng TMCP Sài Gòn - Hà Nội', aliases: ['shb', 'sai gon ha noi'] },
  { code: '970449', shortName: 'LPB', name: 'LPBank (Lộc Phát)', fullName: 'Ngân hàng TMCP Lộc Phát Việt Nam', aliases: ['lpbank', 'lpb', 'lienvietpostbank', 'loc phat', 'lộc phát', 'lien viet'] },
  { code: '970440', shortName: 'SEAB', name: 'SeABank', fullName: 'Ngân hàng TMCP Đông Nam Á', aliases: ['seabank', 'seab', 'dong nam a', 'đông nam á'] },
  { code: '970409', shortName: 'BAB', name: 'Bac A Bank (Bắc Á)', fullName: 'Ngân hàng TMCP Bắc Á', aliases: ['bacabank', 'bab', 'bac a', 'bắc á'] },
  { code: '970412', shortName: 'PVB', name: 'PVcomBank', fullName: 'Ngân hàng TMCP Đại Chúng Việt Nam', aliases: ['pvcombank', 'pvb', 'pvcom', 'dai chung'] },
  { code: '970419', shortName: 'NCB', name: 'NCB (Quốc Dân)', fullName: 'Ngân hàng TMCP Quốc Dân', aliases: ['ncb', 'quoc dan', 'quốc dân', 'navibank'] },
  { code: '970425', shortName: 'ABB', name: 'ABBANK (An Bình)', fullName: 'Ngân hàng TMCP An Bình', aliases: ['abbank', 'abb', 'an binh', 'an bình'] },
  { code: '970428', shortName: 'NAB', name: 'Nam A Bank (Nam Á)', fullName: 'Ngân hàng TMCP Nam Á', aliases: ['namabank', 'nab', 'nam a', 'nam á'] },
  { code: '970427', shortName: 'VAB', name: 'VietABank (Việt Á)', fullName: 'Ngân hàng TMCP Việt Á', aliases: ['vietabank', 'vab', 'viet a', 'việt á'] },
  { code: '970438', shortName: 'BVBANK_BV', name: 'BaoViet Bank (Bảo Việt)', fullName: 'Ngân hàng TMCP Bảo Việt', aliases: ['baovietbank', 'baoviet', 'bảo việt'] },
  { code: '970400', shortName: 'SGB', name: 'Saigonbank', fullName: 'Ngân hàng TMCP Sài Gòn Công Thương', aliases: ['saigonbank', 'sgb', 'sai gon cong thuong'] },
  { code: '970430', shortName: 'PGB', name: 'PGBank', fullName: 'Ngân hàng TMCP Thịnh vượng và Phát triển', aliases: ['pgbank', 'pgb', 'xang dau'] },
  { code: '970452', shortName: 'KLB', name: 'Kienlongbank', fullName: 'Ngân hàng TMCP Kiên Long', aliases: ['kienlongbank', 'klb', 'kien long', 'kiên long'] },
  { code: '546034', shortName: 'CAKE', name: 'CAKE by VPBank', fullName: 'Ngân hàng số CAKE by VPBank', aliases: ['cake', 'cake by vpbank'] },
  { code: '963388', shortName: 'TIMO', name: 'Timo by BanVietBank', fullName: 'Ngân hàng số Timo', aliases: ['timo', 'timo bank', 'timo by banvietbank'] },
  { code: '970424', shortName: 'SHBVN', name: 'Shinhan Bank', fullName: 'Ngân hàng TNHH MTV Shinhan Việt Nam', aliases: ['shinhan', 'shinhanbank', 'shbvn'] },
  { code: '970457', shortName: 'WOO', name: 'Woori Bank', fullName: 'Ngân hàng TNHH MTV Woori Việt Nam', aliases: ['woori', 'wooribank', 'woo'] },
  { code: '971005', shortName: 'VTLMONEY', name: 'Viettel Money', fullName: 'Tổng Công ty Dịch vụ Số Viettel', aliases: ['viettelmoney', 'viettel', 'viettelpay', 'vtlmoney'] },
  { code: '971011', shortName: 'VNPTMONEY', name: 'VNPT Money', fullName: 'Tập đoàn Bưu chính Viễn thông Việt Nam', aliases: ['vnptmoney', 'vnpt', 'vnptpay'] },
  { code: '970462', shortName: 'KBANK', name: 'KBank (Kasikornbank)', fullName: 'Ngân hàng Đại chúng TNHH Kasikornbank', aliases: ['kbank', 'kasikornbank'] },
  { code: '970429', shortName: 'SCB', name: 'SCB (Sài Gòn)', fullName: 'Ngân hàng TMCP Sài Gòn', aliases: ['scb'] },
];

/**
 * Tìm mã định danh BIN chuẩn của ngân hàng để sinh VietQR chính xác 100%
 * @param {string} inputName - Tên hoặc mã ngân hàng người dùng nhập
 * @returns {string} - Mã BIN hoặc ShortName chuẩn của VietQR (ví dụ: '970454' cho BVBank)
 */
export function getVietQRBankCode(inputName) {
  if (!inputName) return '';
  const raw = String(inputName).trim();
  const normalized = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]/g, '');

  // 1. Kiểm tra trực tiếp theo Code (BIN) hoặc ShortName
  const matchCode = VIETNAM_BANKS.find(
    (b) => b.code.toLowerCase() === normalized || b.shortName.toLowerCase() === normalized
  );
  if (matchCode) return matchCode.code;

  // 2. Tìm chính xác trong aliases
  for (const b of VIETNAM_BANKS) {
    if (
      b.aliases.some((a) => {
        const aNorm = a.toLowerCase().replace(/[^a-z0-9]/g, '');
        return aNorm === normalized;
      })
    ) {
      return b.code;
    }
  }

  // 3. Tìm tương đối trong aliases
  for (const b of VIETNAM_BANKS) {
    if (
      b.aliases.some((a) => {
        const aNorm = a.toLowerCase().replace(/[^a-z0-9]/g, '');
        return aNorm.includes(normalized) || normalized.includes(aNorm);
      })
    ) {
      return b.code;
    }
  }

  // 4. Nếu không tìm thấy, trả về chuỗi gốc đã bỏ dấu cách
  return raw.replace(/\s+/g, '');
}

/**
 * Lấy thông tin hiển thị đẹp mắt của Ngân Hàng
 * @param {string} inputName
 * @returns {{ name: string, code: string, shortName: string }}
 */
export function getBankDisplayInfo(inputName) {
  if (!inputName) return { name: 'Chưa chọn ngân hàng', code: '', shortName: '' };
  const bankCode = getVietQRBankCode(inputName);
  const found = VIETNAM_BANKS.find((b) => b.code === bankCode);
  if (found) {
    return { name: found.name, code: found.code, shortName: found.shortName };
  }
  return { name: inputName, code: bankCode, shortName: inputName };
}

/**
 * Sinh URL VietQR chuẩn chất lượng cao
 */
export function generateVietQRUrl({ bankName, accountNumber, accountHolder, amount = 0, memo = '' }) {
  if (!bankName || !accountNumber) return '';
  const bankCode = getVietQRBankCode(bankName);
  const cleanAcc = encodeURIComponent(String(accountNumber).trim().replace(/\s+/g, ''));
  const cleanAmount = Number(amount) > 0 ? Math.round(Number(amount)) : 0;
  const cleanMemo = encodeURIComponent(String(memo || '').trim());
  const cleanHolder = encodeURIComponent(String(accountHolder || '').trim().toUpperCase());

  return `https://img.vietqr.io/image/${bankCode}-${cleanAcc}-compact2.png?amount=${cleanAmount}&addInfo=${cleanMemo}&accountName=${cleanHolder}`;
}
