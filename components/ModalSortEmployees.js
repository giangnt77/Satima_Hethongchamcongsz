'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { updateEmployeesSortOrders } from '@/lib/supabase';

export default function ModalSortEmployees({ isOpen, onClose, employees = [], onSaveSuccess }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const [items, setItems] = useState([]);
  const [draggedIdx, setDraggedIdx] = useState(null);

  useEffect(() => {
    if (employees && employees.length > 0) {
      const activeEmps = employees.filter((e) => {
        if (e.role === 'owner' || e.role === 'manager') return false;
        if (e.status === 'off' || e.is_active === false) return false;
        return true;
      });
      const sorted = [...activeEmps].sort((a, b) => {
        const orderA = a.sort_order ?? 999;
        const orderB = b.sort_order ?? 999;
        if (orderA !== orderB) return orderA - orderB;
        return a.name.localeCompare(b.name);
      });
      setItems(sorted);
    }
  }, [employees, isOpen]);

  if (!isOpen || !mounted) return null;

  // Lưu ngầm thứ tự mới lên Google Sheets.
  async function persistOrdersToGoogleSheets(newItems) {
    try {
      const orders = newItems.map((emp, idx) => ({
        id: emp.id,
        sort_order: idx + 1,
      }));
      await updateEmployeesSortOrders(orders);
    } catch (err) {
      console.error('Lỗi đồng bộ Realtime thứ tự:', err);
    }
  }

  // Di chuyển đến vị trí cụ thể (Direct position jump) REAL-TIME TỨC THÌ
  function jumpToPosition(fromIndex, toIndex) {
    if (toIndex < 0 || toIndex >= items.length || fromIndex === toIndex) return;
    const newItems = [...items];
    const [movedItem] = newItems.splice(fromIndex, 1);
    newItems.splice(toIndex, 0, movedItem);
    
    // 1. Cập nhật state Modal ngay lập tức
    setItems(newItems);

    // 2. Phát tín hiệu Real-time cho Bảng bên ngoài nhảy vị trí tức thì trong 0.01s!
    if (onSaveSuccess) {
      onSaveSuccess(newItems);
    }

    // 3. Tự động lưu ngầm lên Google Sheets.
    persistOrdersToGoogleSheets(newItems);
  }

  // Di chuyển lên 1 nấc
  function moveUp(index) {
    if (index === 0) return;
    jumpToPosition(index, index - 1);
  }

  // Di chuyển xuống 1 nấc
  function moveDown(index) {
    if (index === items.length - 1) return;
    jumpToPosition(index, index + 1);
  }

  // Mouse Drag & Drop Handlers (Cho Máy Tính)
  function handleDragStart(e, index) {
    setDraggedIdx(index);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e, index) {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === index) return;
    jumpToPosition(draggedIdx, index);
    setDraggedIdx(index);
  }

  function handleDragEnd() {
    setDraggedIdx(null);
  }

  // Touch Handlers (Cho Điện Thoại Cảm Ứng)
  function handleTouchStart(e, index) {
    setDraggedIdx(index);
  }

  function handleTouchMove(e) {
    if (draggedIdx === null) return;
    const touch = e.touches[0];
    const targetElement = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!targetElement) return;
    const rowElement = targetElement.closest('[data-sort-index]');
    if (rowElement) {
      const targetIdx = Number(rowElement.getAttribute('data-sort-index'));
      if (!isNaN(targetIdx) && targetIdx !== draggedIdx) {
        jumpToPosition(draggedIdx, targetIdx);
        setDraggedIdx(targetIdx);
      }
    }
  }

  function handleTouchEnd() {
    setDraggedIdx(null);
  }

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-3xl p-4 sm:p-6 w-full max-w-xl border border-purple-200 shadow-2xl space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-purple-100 pb-3">
          <div>
            <h3 className="font-black text-base sm:text-lg text-purple-950 flex items-center gap-2">
              <span>↕️</span> Sắp Xếp Thứ Tự Nhân Viên (Real-Time)
            </h3>
            <p className="text-[11px] sm:text-xs text-purple-700 font-bold mt-0.5">
              ⚡ Mỗi thay đổi sẽ cập nhật trực tiếp Google Sheets ngay lập tức!
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold flex items-center justify-center cursor-pointer border-0 shrink-0"
          >
            ✕
          </button>
        </div>

        {/* Danh Sách Nhân Viên */}
        <div className="max-h-[62vh] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
          {items.map((emp, index) => (
            <div
              key={emp.id}
              data-sort-index={index}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              onTouchStart={(e) => handleTouchStart(e, index)}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              className={`p-2.5 bg-purple-50/70 border rounded-2xl flex items-center justify-between gap-2 transition-all ${
                draggedIdx === index ? 'border-purple-600 bg-purple-200/90 shadow-lg scale-98 z-10' : 'border-purple-200/80 hover:bg-purple-100/60 shadow-2xs'
              }`}
            >
              {/* Tay kéo ≡ + Select chọn vị trí STT nhanh */}
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-purple-600 cursor-grab active:cursor-grabbing font-black text-base px-1 select-none touch-none" title="Chạm giữ để kéo thả">
                  ≡
                </span>
                
                {/* Select Số Vị Trí Dropdown Chọn Nhanh */}
                <select
                  value={index}
                  onChange={(e) => jumpToPosition(index, Number(e.target.value))}
                  className="bg-purple-700 text-white font-black text-xs py-1 px-1.5 rounded-xl border-0 outline-none cursor-pointer hover:bg-purple-800 shadow-2xs"
                  title="Chọn vị trí STT muốn chuyển đến"
                >
                  {items.map((_, i) => (
                    <option key={i} value={i} className="bg-white text-purple-950 font-bold">
                      #{i + 1}
                    </option>
                  ))}
                </select>

                <span className="font-black text-xs sm:text-sm text-purple-950 truncate flex items-center gap-1.5">
                  <span>{emp.name}</span>
                  {emp.status === 'off' && (
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-black text-red-600 bg-red-100 border border-red-200">
                      OFF (Nghỉ)
                    </span>
                  )}
                </span>
              </div>

              {/* Các Nút Di Chuyển Siêu Tốc: Top 🔝, Up ▲, Down ▼, Bottom 🔻 */}
              <div className="flex items-center gap-1 shrink-0">
                {/* Nút Lên Đầu 🔝 */}
                <button
                  type="button"
                  onClick={() => jumpToPosition(index, 0)}
                  disabled={index === 0}
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl font-black text-xs cursor-pointer border flex items-center justify-center transition-all ${
                    index === 0
                      ? 'bg-slate-100 text-slate-300 border-slate-200 cursor-not-allowed'
                      : 'bg-white text-purple-900 border-purple-300 hover:bg-purple-700 hover:text-white active:scale-95 shadow-2xs'
                  }`}
                  title="Nhảy thẳng lên Vị Trí Đầu (#1)"
                >
                  🔝
                </button>
                {/* Nút Lên 1 Nấc ▲ */}
                <button
                  type="button"
                  onClick={() => moveUp(index)}
                  disabled={index === 0}
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl font-black text-xs cursor-pointer border flex items-center justify-center transition-all ${
                    index === 0
                      ? 'bg-slate-100 text-slate-300 border-slate-200 cursor-not-allowed'
                      : 'bg-white text-purple-900 border-purple-300 hover:bg-purple-700 hover:text-white active:scale-95 shadow-2xs'
                  }`}
                  title="Di chuyển lên 1 nấc"
                >
                  ▲
                </button>
                {/* Nút Xuống 1 Nấc ▼ */}
                <button
                  type="button"
                  onClick={() => moveDown(index)}
                  disabled={index === items.length - 1}
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl font-black text-xs cursor-pointer border flex items-center justify-center transition-all ${
                    index === items.length - 1
                      ? 'bg-slate-100 text-slate-300 border-slate-200 cursor-not-allowed'
                      : 'bg-white text-purple-900 border-purple-300 hover:bg-purple-700 hover:text-white active:scale-95 shadow-2xs'
                  }`}
                  title="Di chuyển xuống 1 nấc"
                >
                  ▼
                </button>
                {/* Nút Xuống Cuối 🔻 */}
                <button
                  type="button"
                  onClick={() => jumpToPosition(index, items.length - 1)}
                  disabled={index === items.length - 1}
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl font-black text-xs cursor-pointer border flex items-center justify-center transition-all ${
                    index === items.length - 1
                      ? 'bg-slate-100 text-slate-300 border-slate-200 cursor-not-allowed'
                      : 'bg-white text-purple-900 border-purple-300 hover:bg-purple-700 hover:text-white active:scale-95 shadow-2xs'
                  }`}
                  title="Nhảy thẳng xuống Vị Trí Cuối"
                >
                  🔻
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-purple-100">
          <div className="flex items-center gap-1.5 text-xs font-black text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Đồng bộ Real-Time tức thì</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-black text-xs cursor-pointer shadow-md border-0 transition-all active:scale-95"
          >
            ✓ Đã Xong
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
