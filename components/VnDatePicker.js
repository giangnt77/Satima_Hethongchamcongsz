'use client';

/**
 * VnDatePicker — Bộ chọn ngày tiếng Việt 3 ô Ngày / Tháng / Năm siêu dễ dùng
 * Thay thế hoàn toàn ô input type="date" mặc định của trình duyệt.
 */
export default function VnDatePicker({ value, onChange, className = '' }) {
  const safeValue = value && value.includes('-') ? value : '2026-08-01';
  const parts = safeValue.split('-');
  const y = Number(parts[0]) || 2026;
  const m = Number(parts[1]) || 8;
  const d = Number(parts[2]) || 1;

  const handleSelect = (newD, newM, newY) => {
    // Tự động điều chỉnh nếu số ngày vượt quá tối đa của tháng đó
    const maxDays = new Date(newY, newM, 0).getDate();
    const validD = Math.min(newD, maxDays);

    const padD = String(validD).padStart(2, '0');
    const padM = String(newM).padStart(2, '0');
    onChange(`${newY}-${padM}-${padD}`);
  };

  const years = Array.from({ length: 15 }, (_, i) => 2022 + i);

  return (
    <div className={`flex w-full items-center gap-1 bg-white p-1 rounded-xl border border-purple-200 shadow-2xs ${className}`}>
      {/* Chọn Ngày */}
      <div className="flex-1 min-w-0">
        <select
          value={d}
          onChange={(e) => handleSelect(Number(e.target.value), m, y)}
          className="w-full text-center px-1 py-1.5 bg-purple-50 hover:bg-purple-100/80 rounded-lg text-purple-950 text-xs font-black outline-none border border-purple-200/80 cursor-pointer shadow-2xs transition-colors"
          title="Chọn ngày"
        >
          {Array.from({ length: 31 }, (_, i) => i + 1).map((dayNum) => (
            <option key={dayNum} value={dayNum} className="text-purple-950 font-bold bg-white text-left">
              Ngày {String(dayNum).padStart(2, '0')}
            </option>
          ))}
        </select>
      </div>

      <span className="text-purple-400 font-black text-xs select-none">/</span>

      {/* Chọn Tháng */}
      <div className="flex-[1.2] min-w-0">
        <select
          value={m}
          onChange={(e) => handleSelect(d, Number(e.target.value), y)}
          className="w-full text-center px-1 py-1.5 bg-purple-50 hover:bg-purple-100/80 rounded-lg text-purple-950 text-xs font-black outline-none border border-purple-200/80 cursor-pointer shadow-2xs transition-colors"
          title="Chọn tháng"
        >
          {Array.from({ length: 12 }, (_, i) => i + 1).map((monthNum) => (
            <option key={monthNum} value={monthNum} className="text-purple-950 font-bold bg-white text-left">
              Tháng {monthNum}
            </option>
          ))}
        </select>
      </div>

      <span className="text-purple-400 font-black text-xs select-none">/</span>

      {/* Chọn Năm */}
      <div className="flex-1 min-w-0">
        <select
          value={y}
          onChange={(e) => handleSelect(d, m, Number(e.target.value))}
          className="w-full text-center px-1 py-1.5 bg-purple-50 hover:bg-purple-100/80 rounded-lg text-purple-950 text-xs font-black outline-none border border-purple-200/80 cursor-pointer shadow-2xs transition-colors"
          title="Chọn năm"
        >
          {years.map((yearNum) => (
            <option key={yearNum} value={yearNum} className="text-purple-950 font-bold bg-white text-left">
              {yearNum}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
