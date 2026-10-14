# SATIMA License Server

Một Apps Script Web App riêng trong tài khoản Google của tác giả, dùng để kiểm tra giấy phép cho các bản cộng đồng.

## Cài đặt (làm một lần)

1. Tạo Google Sheet mới, ví dụ `SATIMA License`.
2. Mở **Tiện ích mở rộng > Apps Script**. Dán `Code.gs` và `appsscript.json` (bật "Show appsscript.json" trong Project Settings), rồi tạo thêm file HTML tên `Admin` và dán nội dung `Admin.html`.
3. Tải lại Sheet, dùng menu **SATIMA License > Khởi tạo bảng LICENSES + khoá ký**, rồi cấp quyền.
4. **Deploy > New deployment > Web app**: Execute as **Me**, Who has access **Anyone**. Copy URL kết thúc bằng `/exec`.
5. Menu **Hiện khoá ký** để lấy `SATIMA_LICENSE_SECRET`. Giữ bí mật, không đưa vào git.

## Cấp và quản lý giấy phép

Dùng menu **SATIMA License > 📋 Mở bảng quản lý giấy phép**. Bảng này mở ngay trong Sheet nên chỉ chủ Sheet dùng được:
- Cấp mã mới (nhập tên, liên hệ, số ngày), mã tự được chép vào clipboard.
- Tìm kiếm, lọc theo trạng thái, xem thống kê.
- Nút **Tạm ngưng / Kích hoạt / Gia hạn / Gỡ gắn máy / Thu hồi** cho từng mã.
- Bấm vào mã để chép.

Chi tiết dữ liệu (cột trong tab `LICENSES`):
- Trạng thái trong cột `status`: `active`, `suspended`, `revoked`. Giấy phép quá `expires_at` tự thành `expired`.
- Mã gắn với Script ID lần đầu nó được dùng. Dùng ở Script ID khác sẽ báo `mismatch` và ghi vào cột `note`.
- `last_check_at` và `last_seen_version` cho biết bản nào đang chạy.
- Thay đổi có hiệu lực sau tối đa 6 giờ (thời gian cache của client).

## Build bản cộng đồng có kiểm tra

PowerShell, ở thư mục gốc dự án:

```powershell
$env:SATIMA_LICENSE_URL = 'https://script.google.com/macros/s/<ID>/exec'
$env:SATIMA_LICENSE_SECRET = '<khoá ký>'
npm run release:gas
Remove-Item Env:SATIMA_LICENSE_URL, Env:SATIMA_LICENSE_SECRET
```

Không đặt hai biến này thì bản build không có kiểm tra giấy phép (dùng cho bản GỐC).

## Hành vi phía người dùng

- Người dùng nhập mã ở menu **SATIMA > Nhập mã giấy phép** trong Google Sheet của họ.
- Hợp lệ: chạy bình thường. Không gọi được server: tiếp tục chạy tối đa 7 ngày kể từ lần kiểm tra thành công cuối.
- Hết hạn, tạm ngưng, thu hồi hoặc chưa nhập mã: khoá hẳn. Chỉ chủ/admin đăng nhập được và đọc dữ liệu để xuất.
- Chỉ gửi mã, Script ID, phiên bản. Không gửi dữ liệu nhân viên, chấm công hay lương.
- Bản build có kiểm tra thêm scope `script.external_request`, người dùng phải cấp quyền lại một lần.
