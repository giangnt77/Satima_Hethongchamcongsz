'use client';

import Link from 'next/link';

export default function Navbar({
  employeeName,
  backHref = '/nhanvien',
  onBackClick,
  onNoticeClick,
  onRulesClick,
  homeIcon = '🏠',
  homeTitle = 'Về trang chủ',
  showRulesLink = false,
}) {
  return (
    <nav className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-purple-100 shadow-2xs overflow-hidden">
      <div className="max-w-7xl mx-auto px-2.5 sm:px-6 py-2 flex items-center justify-between gap-2">
        {/* Brand Logo & Title (LÀM TO RA HƠN CHUẨN ĐẸP) */}
        <Link
          href={backHref}
          onClick={(e) => {
            if (onBackClick) {
              e.preventDefault();
              onBackClick();
            }
          }}
          className="flex items-center gap-2 sm:gap-2.5 no-underline group shrink-0"
        >
          <img
            src="/logo.png"
            alt="SATIMA - Salary & Timekeeping Management System"
            className="w-28 sm:w-44 h-auto max-h-12 object-contain group-hover:scale-[1.02] transition-transform"
          />
        </Link>

        {/* Nút Nội Quy & Nút Thông Báo NẰM CÙNG 1 HÀNG KỀ NHAU */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {showRulesLink && (
            <button
              type="button"
              onClick={onRulesClick}
              className="relative px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs sm:text-sm font-black cursor-pointer transition-all active:scale-95 flex items-center gap-1.5 shadow-md border border-rose-700 whitespace-nowrap ring-2 ring-rose-200 ring-offset-1 animate-pulse"
              title="Bấm để xem nội quy, quy định và hướng dẫn"
            >
              <span aria-hidden="true">📣</span>
              <span>Nội Quy</span>
            </button>
          )}

          {onNoticeClick && (
            <button
              type="button"
              onClick={onNoticeClick}
              className="px-2.5 py-1 sm:px-3.5 sm:py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-purple-950 text-xs font-black cursor-pointer transition-all active:scale-95 flex items-center gap-1 shadow-2xs border border-amber-500/50 whitespace-nowrap"
              title="Bấm để xem Thông Báo Quan Trọng"
            >
              <span>🔔</span>
              <span>Thông Báo</span>
            </button>
          )}

          {employeeName && (
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-purple-100/80 rounded-xl text-xs font-black text-purple-950 border border-purple-200 whitespace-nowrap shadow-2xs">
              <div className="w-5 h-5 rounded-md bg-purple-700 text-white flex items-center justify-center text-[10px] font-black shrink-0">
                {employeeName.charAt(0).toUpperCase()}
              </div>
              <span className="font-black text-purple-950">
                {employeeName}
              </span>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
