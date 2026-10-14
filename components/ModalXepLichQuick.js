'use client';

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { getBranchColorStyle } from '@/lib/utils';

/**
 * ModalXepLichQuick — Pop-up gán/chỉnh sửa giờ làm cho nhân viên trực quan, tinh gọn.
 * Phân định rõ 2 trạng thái theo quy trình quản lý quán:
 * 1. Khi CHƯA CHỐT LỊCH (!isWeekLocked): Form chỉnh việc tinh gọn 1 trang (không rườm rà).
 * 2. Khi ĐÃ CHỐT LỊCH (isWeekLocked): Các form thay đổi chuyên biệt (Đổi Giờ, Chuyển Ca, Báo Nghỉ kèm lý do).
 */

const QUICK_PRESET_SHIFTS = [
  { label: 'Bếp 7:30-14:30', s: '07:30', e: '14:30', icon: '🍳' },
  { label: 'Cả ngày 8:30-22h', s: '08:30', e: '22:00', icon: '⚡' },
];

const QUICK_START_TIMES = [
  { val: '07:30', label: '07:30' },
  { val: '08:30', label: '08:30' },
  { val: '09:00', label: '9h' },
  { val: '13:00', label: '13h' },
  { val: '14:00', label: '14h' },
  { val: '15:00', label: '15h' },
  { val: '16:00', label: '16h' },
  { val: '17:00', label: '17h' },
  { val: '18:00', label: '18h' },
];

const QUICK_END_TIMES = [
  { val: '15:00', label: '15h' },
  { val: '16:00', label: '16h' },
  { val: '17:00', label: '17h' },
  { val: '18:00', label: '18h' },
  { val: '19:00', label: '19h' },
  { val: '20:00', label: '20h' },
  { val: '21:00', label: '21h' },
  { val: '21:45', label: '21:45' },
  { val: '22:00', label: '22h' },
];

export default function ModalXepLichQuick({
  isOpen,
  onClose,
  date,
  branch,
  branches = [],
  employees = [],
  availabilities = [],
  daySchedule = [],
  onSave,
  onDelete,
  onAssignOff,
  onRemoveOff,
  editItem = null,
  initialEmployee = null,
  isWeekLocked = false,
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const isEditing = !!editItem;

  // Khi đã chốt lịch: Cho phép chọn 3 chế độ thay đổi ('time': Đổi giờ | 'transfer': Chuyển ca | 'off': Báo nghỉ)
  const [activeChangeTab, setActiveChangeTab] = useState('time');

  // Selected values
  const [selectedEmpId, setSelectedEmpId] = useState(
    editItem ? editItem.employee_id : (initialEmployee ? initialEmployee.id : '')
  );
  const [selectedBranchId, setSelectedBranchId] = useState(
    editItem ? editItem.branch_id : (branch?.id || (branches[0]?.id || ''))
  );
  const [startTime, setStartTime] = useState(
    editItem?.start_time ? editItem.start_time.slice(0, 5) : '08:30'
  );
  const [endTime, setEndTime] = useState(
    editItem?.end_time ? editItem.end_time.slice(0, 5) : '14:30'
  );
  const [note, setNote] = useState(editItem?.note || '');
  const [submitting, setSubmitting] = useState(false);

  // States hỗ trợ tìm kiếm / đổi nhân viên
  const [showEmpSelector, setShowEmpSelector] = useState(!selectedEmpId);
  const [empSearchTerm, setEmpSearchTerm] = useState('');

  // States hỗ trợ chuyển ca (khi đã chốt lịch)
  const [transferType, setTransferType] = useState('full'); // 'full': Chuyển cả ca | 'peer': Làm thay bạn khác
  const [transferTargetId, setTransferTargetId] = useState('');

  // States hỗ trợ Báo OFF (khi đã chốt lịch)
  const [offReason, setOffReason] = useState('Bận việc riêng');

  // States hỗ trợ làm thay khi về sớm / tăng ca làm thay
  const [selectedPeerId, setSelectedPeerId] = useState('');
  const [syncPeerShift, setSyncPeerShift] = useState(true);
  const [coverStartTime, setCoverStartTime] = useState('19:00');
  const [coverEndTime, setCoverEndTime] = useState('22:00');
  const [peerCoverMode, setPeerCoverMode] = useState('partial'); // 'partial': Làm thay 1 phần (Về sớm) | 'full_off': Nghỉ cả ngày (Gán OFF)
  const [peerOffReason, setPeerOffReason] = useState('Bận việc riêng');
  const [peerSearchQuery, setPeerSearchQuery] = useState('');

  if (!isOpen) return null;

  // Tính số giờ (Bắt buộc giờ ra > giờ vào)
  function calcHours(st, et) {
    if (!st || !et || st === et) return 0;
    const [sh, sm] = st.split(':').map(Number);
    const [eh, em] = et.split(':').map(Number);
    const startMins = sh * 60 + sm;
    const endMins = eh * 60 + em;
    if (endMins <= startMins) return 0;
    const h = (endMins - startMins) / 60;
    return Math.round(h * 100) / 100;
  }

  // Nếu ca đang sửa (editItem) không bị thay đổi giờ vào/ra, ưu tiên giữ nguyên số giờ thực làm đã lưu (đặc biệt quan trọng cho Ca Gãy!)
  const isTimeUnchanged = Boolean(
    editItem &&
    editItem.hours &&
    Number(editItem.hours) > 0 &&
    startTime === (editItem.start_time ? editItem.start_time.slice(0, 5) : '') &&
    endTime === (editItem.end_time ? editItem.end_time.slice(0, 5) : '')
  );

  const hours = isTimeUnchanged ? Number(editItem.hours) : calcHours(startTime, endTime);
  const isTimeInvalid = useMemo(() => {
    if (!startTime || !endTime) return true;
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    return (eh * 60 + em) <= (sh * 60 + sm);
  }, [startTime, endTime]);

  // Lọc danh sách nhân viên thực sự (loại bỏ Owner/Manager và người đã nghỉ việc trước ngày này)
  const staffOnlyEmployees = useMemo(() => {
    if (!employees) return [];
    const targetDate = date ? String(date).slice(0, 10) : '';

    return employees.filter((e) => {
      if (e.role === 'owner' || e.role === 'manager') return false;
      const nLower = (e.name || '').toLowerCase();
      if (
        nLower.includes('chủ quán') ||
        nLower.includes('quản lý') ||
        nLower.includes('owner') ||
        nLower.includes('manager')
      ) {
        return false;
      }

      if (targetDate && e.created_at) {
        const empStartDate = e.created_at.slice(0, 10);
        if (targetDate < empStartDate) return false;
      }

      if (e.status === 'off' || e.is_active === false) {
        const hasShiftOnThisDay = (daySchedule || []).some((s) => s.employee_id === e.id);
        if (hasShiftOnThisDay) return true;
        const resignedDate = e.resigned_at || e.off_date || (e.created_at ? e.created_at.slice(0, 10) : '1970-01-01');
        if (targetDate >= resignedDate) return false;
      }

      return true;
    });
  }, [employees, date, daySchedule]);

  const currentEmp = staffOnlyEmployees.find((e) => e.id === selectedEmpId);
  const currentBranch = branches.find((b) => b.id === selectedBranchId) || branch || branches[0];
  const currentAvail = availabilities.find((a) => a.employee_id === selectedEmpId);

  // 1. Trích xuất ca gốc ban đầu (nếu có)
  const origShiftInfo = useMemo(() => {
    if (!editItem) return null;
    const currentStart = editItem.start_time ? editItem.start_time.slice(0, 5) : '';
    const currentEnd = editItem.end_time ? editItem.end_time.slice(0, 5) : '';
    const noteStr = editItem.note || '';

    const match = noteStr.match(/\[(?:Ca gốc|Gốc):\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/i);
    if (match) {
      const s = match[1];
      const e = match[2];
      return {
        startTime: s,
        endTime: e,
        hours: calcHours(s, e),
        isPreserved: true,
      };
    }

    if (currentStart && currentEnd) {
      return {
        startTime: currentStart,
        endTime: currentEnd,
        hours: calcHours(currentStart, currentEnd),
        isPreserved: false,
      };
    }
    return null;
  }, [editItem]);

  // 2. Chênh lệch giờ so với ca gốc
  const timeDiff = useMemo(() => {
    if (!origShiftInfo) return { diffHours: 0, isChanged: false };
    const diffHours = Math.round((hours - origShiftInfo.hours) * 100) / 100;
    const isChanged = startTime !== origShiftInfo.startTime || endTime !== origShiftInfo.endTime;
    return { diffHours, isChanged };
  }, [origShiftInfo, hours, startTime, endTime]);

  // 3. Danh sách đồng nghiệp trong ngày (để phục vụ Chuyển Ca và Nhận Làm Thay)
  const peerStaffOnDay = useMemo(() => {
    if (!staffOnlyEmployees) return [];
    return staffOnlyEmployees
      .filter((e) => e.id !== selectedEmpId)
      .map((emp) => {
        const s = (daySchedule || []).find((shift) => shift.employee_id === emp.id);
        const branchObj = s ? (branches.find((b) => b.id === s.branch_id) || s.branches) : null;
        const curStart = s?.start_time ? s.start_time.slice(0, 5) : '';
        const curEnd = s?.end_time ? s.end_time.slice(0, 5) : '';

        let origStart = curStart;
        let origEnd = curEnd;
        if (s?.note) {
          const match = s.note.match(/\[(?:Ca gốc|Gốc):\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/i);
          if (match) {
            origStart = match[1];
            origEnd = match[2];
          }
        }

        return {
          id: s?.id || null,
          employeeId: emp.id,
          name: emp.name || 'Nhân viên',
          nickname: emp.nickname || '',
          hasShift: Boolean(s),
          branchId: s?.branch_id || null,
          branchName: branchObj?.name || '',
          startTime: curStart,
          endTime: curEnd,
          origStartTime: origStart,
          origEndTime: origEnd,
          hours: s?.hours || (curStart && curEnd ? calcHours(curStart, curEnd) : 0),
        };
      })
      .sort((a, b) => {
        // Ưu tiên nhân viên ĐANG CÓ CA lên đầu danh sách để dễ chọn làm hộ
        if (a.hasShift && !b.hasShift) return -1;
        if (!a.hasShift && b.hasShift) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [daySchedule, staffOnlyEmployees, selectedEmpId, branches]);

  // Lọc đồng nghiệp theo từ khóa tìm kiếm
  const filteredPeers = useMemo(() => {
    if (!peerSearchQuery.trim()) return peerStaffOnDay;
    const q = peerSearchQuery.toLowerCase().trim();
    return peerStaffOnDay.filter((p) => {
      const name = (p.name || '').toLowerCase();
      const nick = (p.nickname || '').toLowerCase();
      return name.includes(q) || nick.includes(q);
    });
  }, [peerStaffOnDay, peerSearchQuery]);

  // Áp dụng ca mẫu nhanh (1-chạm điền giờ chuẩn)
  function applyPreset(st, et) {
    setStartTime(st);
    setEndTime(et);
  }

  const coverHours = useMemo(() => {
    return calcHours(coverStartTime, coverEndTime);
  }, [coverStartTime, coverEndTime]);

  // Hợp nhất ca ban đầu của người đang mở modal với khung giờ làm thay
  const mergedShiftForPeer = useMemo(() => {
    if (!origShiftInfo) {
      return {
        startTime: coverStartTime,
        endTime: coverEndTime,
        hours: coverHours,
        hasGap: false,
        gapHours: 0,
        gapStart: '',
        gapEnd: '',
      };
    }

    const [osh, osm] = origShiftInfo.startTime.split(':').map(Number);
    const [oeh, oem] = origShiftInfo.endTime.split(':').map(Number);
    const origStartMin = osh * 60 + osm;
    const origEndMin = oeh * 60 + oem;
    const origH = origShiftInfo.hours || Math.round(((origEndMin - origStartMin) / 60) * 100) / 100;

    const [csh, csm] = coverStartTime.split(':').map(Number);
    const [ceh, cem] = coverEndTime.split(':').map(Number);
    const coverStartMin = csh * 60 + csm;
    const coverEndMin = ceh * 60 + cem;

    // Giờ bắt đầu là sớm nhất, giờ kết thúc là muộn nhất
    const finalStart = origShiftInfo.startTime < coverStartTime ? origShiftInfo.startTime : coverStartTime;
    const finalEnd = origShiftInfo.endTime > coverEndTime ? origShiftInfo.endTime : coverEndTime;

    // Kiểm tra xem 2 ca có giao nhau hoặc chạm nhau không
    const isOverlappingOrTouching = (
      (coverStartMin <= origEndMin && origStartMin <= coverEndMin) ||
      origEndMin === coverStartMin ||
      coverEndMin === origStartMin
    );

    let finalH = 0;
    let hasGap = false;
    let gapHours = 0;
    let gapStart = '';
    let gapEnd = '';

    if (isOverlappingOrTouching) {
      // Hai ca chạm nhau hoặc gối đầu nhau liên tục: số giờ = khoảng cách từ start đến end
      finalH = calcHours(finalStart, finalEnd);
    } else {
      // Có khoảng nghỉ ở giữa (ca gãy):
      // Số giờ thực làm = Giờ ca gốc + Giờ làm thay (KHÔNG cộng giờ nghỉ ở giữa)
      hasGap = true;
      finalH = Math.round((origH + coverHours) * 100) / 100;

      if (coverStartMin > origEndMin) {
        gapStart = origShiftInfo.endTime;
        gapEnd = coverStartTime;
        gapHours = Math.round(((coverStartMin - origEndMin) / 60) * 100) / 100;
      } else {
        gapStart = coverEndTime;
        gapEnd = origShiftInfo.startTime;
        gapHours = Math.round(((origStartMin - coverEndMin) / 60) * 100) / 100;
      }
    }

    return {
      startTime: finalStart,
      endTime: finalEnd,
      hours: finalH,
      hasGap,
      gapHours,
      gapStart,
      gapEnd,
    };
  }, [origShiftInfo, coverStartTime, coverEndTime, coverHours]);

  // Xử lý chọn đồng nghiệp làm thay
  function handleSelectPeerHandover(peerId) {
    setSelectedPeerId(peerId);
    if (!peerId) {
      setPeerCoverMode('partial');
      return;
    }

    const peer = peerStaffOnDay.find((p) => p.employeeId === peerId);
    if (!peer) return;

    setPeerCoverMode('partial');
    setPeerOffReason('Bận việc riêng');

    // Tự động gợi ý khung làm thay thông minh:
    let defaultCoverStart = '19:00';
    let defaultCoverEnd = '22:00';

    if (origShiftInfo && peer.hasShift) {
      const peerEnd = peer.origEndTime || peer.endTime || '22:00';
      const myEnd = origShiftInfo.endTime;
      const myStart = origShiftInfo.startTime;

      if (myEnd < peerEnd) {
        // Khoa (13:00-19:00) làm thay cho Vân (14:00-22:00) phần sau: 19:00 -> 22:00
        defaultCoverStart = myEnd;
        defaultCoverEnd = peerEnd;
      } else if (myStart > (peer.origStartTime || peer.startTime)) {
        // Khoa (13:00-19:00) làm thay cho bạn ca sáng (09:00-13:00) phần trước: 09:00 -> 13:00
        defaultCoverStart = peer.origStartTime || peer.startTime;
        defaultCoverEnd = myStart;
      } else {
        defaultCoverStart = peer.origStartTime || peer.startTime;
        defaultCoverEnd = peerEnd;
      }
    } else if (peer.hasShift) {
      defaultCoverStart = peer.origStartTime || peer.startTime || '14:00';
      defaultCoverEnd = peer.origEndTime || peer.endTime || '22:00';
    }

    setCoverStartTime(defaultCoverStart);
    setCoverEndTime(defaultCoverEnd);
  }

  // Chuyển đổi giữa 2 hình thức: Làm thay 1 phần (Về sớm) vs Nghỉ cả ngày (Gán OFF)
  function handleChangePeerCoverMode(mode) {
    setPeerCoverMode(mode);
    if (!selectedPeerId) return;
    const peer = peerStaffOnDay.find((p) => p.employeeId === selectedPeerId);
    if (!peer || !peer.hasShift) return;

    if (mode === 'full_off') {
      // Nhận làm thay trọn ca của bạn
      const pStart = peer.origStartTime || peer.startTime || '14:00';
      const pEnd = peer.origEndTime || peer.endTime || '22:00';
      setCoverStartTime(pStart);
      setCoverEndTime(pEnd);
    } else {
      // Quay về làm thay 1 phần
      handleSelectPeerHandover(selectedPeerId);
    }
  }

  // SUBMIT ĐẶC BIỆT CHO LÀM THAY (TỰ ĐỘNG GỘP CA VÀ ĐỒNG BỘ 2 CHIỀU)
  async function handleSavePeerCover() {
    if (!selectedEmpId || !selectedPeerId) return;

    if (coverHours <= 0 || coverStartTime >= coverEndTime) {
      alert(`⚠️ Giờ kết thúc làm thay (${coverEndTime}) phải lớn hơn giờ bắt đầu (${coverStartTime})!`);
      return;
    }

    setSubmitting(true);

    // Tự động gỡ cờ OFF nếu nhân viên này đang bị gán OFF mà lại nhận làm thay
    if (currentAvail?.is_admin_assigned && onRemoveOff) {
      try {
        await onRemoveOff(selectedEmpId, date);
      } catch (err) {
        console.error('Lỗi khi gỡ cờ OFF:', err);
      }
    }

    const peer = peerStaffOnDay.find((p) => p.employeeId === selectedPeerId);
    const peerName = peer?.name || 'đồng nghiệp';
    const finalStart = mergedShiftForPeer.startTime;
    const finalEnd = mergedShiftForPeer.endTime;
    const finalHours = mergedShiftForPeer.hours;
    const targetBranchId = (peer && peer.branchId) ? peer.branchId : selectedBranchId;

    let finalNote = '';
    const cleanedNote = (note || '').replace(/\[(?:Ca gốc|Gốc):\s*[^\]]+\]/g, '').trim();
    if (peerCoverMode === 'full_off') {
      const tag = origShiftInfo ? `[Gốc: ${origShiftInfo.startTime}-${origShiftInfo.endTime}] ` : '';
      finalNote = `${tag}Làm thay trọn ca cho ${peerName} (${coverStartTime}-${coverEndTime})${cleanedNote && !cleanedNote.includes('làm thay') ? ' ' + cleanedNote : ''}`;
    } else {
      const tag = origShiftInfo ? `[Gốc: ${origShiftInfo.startTime}-${origShiftInfo.endTime}] ` : '';
      const gapDetail = mergedShiftForPeer.hasGap ? ` | Nghỉ ${mergedShiftForPeer.gapStart}-${mergedShiftForPeer.gapEnd}` : '';
      finalNote = `${tag}+${coverHours}h làm thay ${peerName} (${coverStartTime}-${coverEndTime}${gapDetail})${cleanedNote && !cleanedNote.includes('làm thay') ? ' ' + cleanedNote : ''}`;
    }

    const cleanPeerOffReason = (peerOffReason || '')
      .replace(/\[(?:Ca gốc|Gốc):\s*[^\]]+\]/g, '')
      .trim() || 'Bận việc riêng';

    // Thông tin đồng bộ ca cho peer
    let peerAdjustment = null;
    if (syncPeerShift && coverHours > 0) {
      peerAdjustment = {
        peerEmployeeId: selectedPeerId,
        type: peerCoverMode === 'full_off' ? 'full_off' : 'reduce',
        hoursDiff: coverHours,
        peerHasShift: Boolean(peer?.hasShift),
        remainingStartTime: coverStartTime,
        remainingEndTime: coverEndTime,
        remainingHours: coverHours,
        peerOffReason: cleanPeerOffReason,
        peerOrigStart: peer?.origStartTime || peer?.startTime,
        peerOrigEnd: peer?.origEndTime || peer?.endTime,
      };
    }

    await onSave({
      employeeId: selectedEmpId,
      branchId: targetBranchId,
      date,
      startTime: finalStart,
      endTime: finalEnd,
      hours: finalHours,
      note: finalNote,
      editId: editItem?.id || null,
      peerAdjustment,
      swapEmployeeId: null,
    });

    setSubmitting(false);
    onClose();
  }

  // Preset gán lý do nhanh vào ghi chú (Khi đã chốt lịch)
  function applyAdjustmentReason(type) {
    if (!origShiftInfo) {
      if (type === 'ot') setNote('Tăng ca');
      else if (type === 'early') setNote(`Về sớm ${endTime}`);
      return;
    }
    const { startTime: os, endTime: oe } = origShiftInfo;
    const diff = timeDiff.diffHours;
    const diffSign = diff > 0 ? `+${diff}h` : `${diff}h`;

    if (type === 'ot') {
      setSelectedPeerId('');
      setNote(`[Gốc: ${os}-${oe}] ${diffSign} tăng ca`);
    } else if (type === 'early') {
      setSelectedPeerId('');
      setNote(`[Gốc: ${os}-${oe}] Về sớm ${endTime}`);
    } else if (type === 'clear') {
      setSelectedPeerId('');
      const cleaned = note.replace(/\[(?:Ca gốc|Gốc):\s*[^\]]+\]/g, '').trim();
      setNote(cleaned);
    }
  }

  // SUBMIT 1: CẬP NHẬT / LƯU GIỜ LÀM
  async function handleSaveShift(e) {
    if (e) e.preventDefault();
    if (!selectedEmpId) return;

    if (isTimeInvalid || hours <= 0) {
      alert(`⚠️ Giờ ra (${endTime}) phải lớn hơn giờ vào (${startTime})! Vui lòng chọn lại giờ.`);
      return;
    }

    setSubmitting(true);

    // Tự động gỡ cờ OFF nếu nhân viên này đang bị gán OFF mà lại được xếp đi làm
    if (currentAvail?.is_admin_assigned && onRemoveOff) {
      try {
        await onRemoveOff(selectedEmpId, date);
      } catch (err) {
        console.error('Lỗi khi gỡ cờ OFF:', err);
      }
    }

    // Tự động thêm tag ca gốc khi sửa giờ trong lịch đã chốt
    let finalNote = note;
    if (isWeekLocked && isEditing && origShiftInfo && timeDiff.isChanged) {
      if (!finalNote.includes('[Gốc:') && !finalNote.includes('[Ca gốc:')) {
        const diffSign = timeDiff.diffHours > 0 ? `+${timeDiff.diffHours}h` : `${timeDiff.diffHours}h`;
        const caGocTag = `[Gốc: ${origShiftInfo.startTime}-${origShiftInfo.endTime} | ${diffSign}]`;
        finalNote = caGocTag + (finalNote ? ' ' + finalNote : '');
      }
    } else if (!isWeekLocked) {
      finalNote = finalNote.replace(/\[(?:Ca gốc|Gốc):\s*[^\]]+\]/g, '').trim();
    }

    // Đồng bộ ca cho bạn làm thay nếu có
    let peerAdjustment = null;
    if (isWeekLocked && selectedPeerId && syncPeerShift && timeDiff.diffHours !== 0) {
      const peer = peerStaffOnDay.find((p) => p.employeeId === selectedPeerId);
      peerAdjustment = {
        peerEmployeeId: selectedPeerId,
        type: timeDiff.diffHours > 0 ? 'reduce' : 'increase',
        hoursDiff: Math.abs(timeDiff.diffHours),
        peerHasShift: Boolean(peer?.hasShift),
        remainingStartTime: endTime,
        remainingEndTime: origShiftInfo ? origShiftInfo.endTime : '22:00',
        remainingHours: origShiftInfo ? calcHours(endTime, origShiftInfo.endTime) : Math.abs(timeDiff.diffHours),
      };
    }

    await onSave({
      employeeId: selectedEmpId,
      branchId: selectedBranchId,
      date,
      startTime,
      endTime,
      hours,
      note: finalNote,
      editId: editItem?.id || null,
      peerAdjustment,
      swapEmployeeId: null,
    });

    setSubmitting(false);
    onClose();
  }

  // SUBMIT 2: CHUYỂN TOÀN BỘ CA CHO NGƯỜI KHÁC (Khi đã chốt lịch)
  async function handleConfirmTransfer() {
    if (!selectedEmpId || !transferTargetId) return;

    setSubmitting(true);
    const targetEmp = staffOnlyEmployees.find((e) => e.id === transferTargetId);
    const targetPeer = peerStaffOnDay.find((p) => p.employeeId === transferTargetId);

    let transferNote = '';
    if (isWeekLocked) {
      if (targetPeer?.hasShift) {
        transferNote = `[Gốc: ${startTime}-${endTime}] Đổi ca với ${targetEmp?.name || 'đồng nghiệp'} (${targetPeer.startTime}-${targetPeer.endTime})`;
      } else {
        transferNote = `[Gốc: ${startTime}-${endTime}] Nhường ca cho ${targetEmp?.name || 'đồng nghiệp'}`;
      }
    }

    await onSave({
      employeeId: selectedEmpId,
      branchId: selectedBranchId,
      date,
      startTime,
      endTime,
      hours,
      note: transferNote,
      editId: editItem?.id || null,
      peerAdjustment: null,
      swapEmployeeId: transferTargetId,
    });

    setSubmitting(false);
    onClose();
  }

  // SUBMIT 3: BÁO NGHỈ / GÁN CA OFF
  function handleConfirmOff() {
    if (!selectedEmpId) return;
    const cleanReason = (offReason || '').trim() || 'Bận việc riêng';
    let finalNote = cleanReason;

    if (isWeekLocked) {
      if (origShiftInfo && !cleanReason.includes('[Gốc:')) {
        finalNote = `[Gốc: ${origShiftInfo.startTime}-${origShiftInfo.endTime}] ${cleanReason}`;
      }
    } else {
      // Khi lịch chưa chốt: không gắn lý do phức tạp
      finalNote = '';
    }

    if (onAssignOff) {
      onAssignOff(selectedEmpId, date, finalNote);
    } else if (onDelete && editItem) {
      onDelete(editItem.id);
    }
    onClose();
  }

  // SUBMIT 4: XÓA CA (QUAY VỀ TRẠNG THÁI BAN ĐẦU)
  async function handleDeleteShiftOnly() {
    if (!selectedEmpId) return;
    try {
      const shiftToDelete = editItem || (daySchedule && daySchedule.find((s) => s.employee_id === selectedEmpId));
      if (shiftToDelete && onDelete) {
        await onDelete(shiftToDelete.id);
      }
      if (onRemoveOff) {
        await onRemoveOff(selectedEmpId, date);
      }
    } catch (err) {
      console.error('Lỗi khi xóa ca:', err);
    }
    onClose();
  }

  if (!isOpen || !mounted) return null;

  const branchStyle = getBranchColorStyle(currentBranch?.name, currentBranch?.color);

  return createPortal(
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs animate-fade-in"
    >
      <div className="bg-white rounded-3xl max-w-md w-full max-h-[92vh] flex flex-col border border-purple-200 shadow-2xl overflow-hidden relative">
        {/* =========================================================================
            HEADER GỌN GÀNG, ĐẦY ĐỦ THÔNG TIN CA & CHI NHÁNH
            ========================================================================= */}
        <div className="p-3.5 sm:p-4 border-b border-purple-200 bg-purple-100/90 flex-shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-black text-sm sm:text-base text-purple-950 truncate">
                  {isWeekLocked
                    ? (isEditing ? '✏️ Điều Chỉnh Lịch' : '➕ Phân Công Ca')
                    : (isEditing ? '✏️ Chỉnh Ca Làm Việc' : '➕ Xếp Lịch Làm')}
                </span>

                {/* Badge trạng thái Chốt Lịch */}
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border shadow-2xs ${
                  isWeekLocked
                    ? 'bg-purple-900 text-amber-300 border-purple-800'
                    : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                }`}>
                  {isWeekLocked ? '🔒 Lịch Đã Chốt' : '🟢 Đang Xếp Nháp'}
                </span>

                {/* Huy hiệu Chi nhánh */}
                <span
                  className="px-2 py-0.5 rounded-lg text-[11px] font-black flex items-center gap-1 border shadow-2xs"
                  style={branchStyle.badgeStyle}
                >
                  🏢 {currentBranch?.name}
                </span>
              </div>

              {/* Dòng phụ: Tên Nhân viên & Ngày & Trạng thái ĐK */}
              <div className="text-xs text-purple-900 font-extrabold mt-1 flex items-center gap-1.5 flex-wrap">
                <span className="text-purple-950 font-black">👤 {currentEmp?.name || 'Nhân viên'}</span>
                <span>•</span>
                <span>{date.split('-').reverse().join('/')}</span>
                {currentAvail && (
                  <span className={`text-[10.5px] px-1.5 py-0.2 rounded-md font-black ${
                    currentAvail.is_admin_assigned
                      ? 'bg-rose-100 text-rose-800 border border-rose-300'
                      : currentAvail.type === 'off'
                      ? 'bg-rose-100 text-rose-800'
                      : currentAvail.type === 'full'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-900'
                  }`}>
                    {currentAvail.is_admin_assigned
                      ? (currentAvail.type === 'off'
                          ? (currentAvail.note ? `🛑 Đang gán OFF (ĐK Xin nghỉ: ${currentAvail.note})` : '🛑 Đang gán OFF (ĐK: Xin nghỉ)')
                          : currentAvail.type === 'full'
                          ? '🛑 Đang gán OFF (ĐK: Cả ngày)'
                          : `🛑 Đang gán OFF (ĐK: ${currentAvail.note || 'Tùy ca'})`)
                      : currentAvail.type === 'off'
                      ? (currentAvail.note ? `🛑 Xin nghỉ: ${currentAvail.note}` : '🛑 ĐK: Nghỉ')
                      : currentAvail.type === 'full'
                      ? '💪 ĐK: Cả ngày'
                      : `📝 ${currentAvail.note || 'Tùy ca'}`}
                  </span>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-rose-100 text-rose-700 hover:bg-rose-600 hover:text-white border border-rose-200 flex items-center justify-center cursor-pointer text-sm font-black transition-all flex-shrink-0 active:scale-90"
              title="Đóng hộp thoại"
            >
              ✕
            </button>
          </div>

          {/* =========================================================================
              CHỈ KHI ĐÃ CHỐT LỊCH: HIỆN THANH CHỌN 3 FORM THAY ĐỔI (SEGMENTED SWITCHER)
              ========================================================================= */}
          {isWeekLocked && (
            <div className="grid grid-cols-3 gap-1 bg-white/90 p-1 rounded-2xl border border-purple-200 mt-2.5 shadow-2xs">
              <button
                type="button"
                onClick={() => setActiveChangeTab('time')}
                className={`py-1.5 rounded-xl font-black text-xs flex items-center justify-center gap-1 transition-all cursor-pointer ${
                  activeChangeTab === 'time'
                    ? 'bg-purple-900 text-white shadow-sm scale-101'
                    : 'text-purple-950 hover:bg-purple-100/80 font-bold'
                }`}
              >
                <span>⏰</span>
                <span>{isEditing ? 'Đổi Giờ' : 'Thêm Giờ'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveChangeTab('transfer');
                  if (!isEditing) {
                    setTransferType('peer');
                  }
                }}
                className={`py-1.5 rounded-xl font-black text-xs flex items-center justify-center gap-1 transition-all cursor-pointer ${
                  activeChangeTab === 'transfer'
                    ? 'bg-purple-900 text-white shadow-sm scale-101'
                    : 'text-purple-950 hover:bg-purple-100/80 font-bold'
                }`}
              >
                <span>🔄</span>
                <span>Chuyển Ca</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveChangeTab('off')}
                className={`py-1.5 rounded-xl font-black text-xs flex items-center justify-center gap-1 transition-all cursor-pointer ${
                  activeChangeTab === 'off'
                    ? 'bg-rose-600 text-white shadow-sm scale-101'
                    : 'text-rose-900 hover:bg-rose-50 font-bold'
                }`}
              >
                <span>🛑</span>
                <span>Báo OFF</span>
              </button>
            </div>
          )}
        </div>

        {/* =========================================================================
            PHẦN NỘI DUNG FORM
            ========================================================================= */}
        <div className="overflow-y-auto p-4 flex-1 space-y-3.5 custom-scrollbar">
          {/* =======================================================================
              TRƯỜNG HỢP 1: LỊCH CHƯA CHỐT (!isWeekLocked) -> FORM CHỈNH VIỆC GỌN GÀNG 1 TRANG
              ======================================================================= */}
          {!isWeekLocked && (
            <div className="space-y-3 animate-fade-in">
              {/* Nếu chưa chọn nhân viên (hoặc muốn đổi người) */}
              {(!selectedEmpId || showEmpSelector) && (
                <div className="space-y-1.5 bg-purple-50/80 p-2.5 rounded-2xl border border-purple-200">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-black text-purple-950 uppercase">
                      Chọn nhân viên phân công:
                    </label>
                    {selectedEmpId && (
                      <button
                        type="button"
                        onClick={() => setShowEmpSelector(false)}
                        className="text-[10.5px] font-black text-purple-700 hover:underline cursor-pointer"
                      >
                        Đóng lại
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={empSearchTerm}
                    onChange={(e) => setEmpSearchTerm(e.target.value)}
                    placeholder="🔍 Tìm nhanh tên nhân viên..."
                    className="w-full px-2.5 py-1.5 bg-white border border-purple-200 rounded-xl text-xs font-bold text-purple-950 outline-none placeholder:text-gray-400"
                  />
                  <div className="max-h-28 overflow-y-auto flex flex-wrap gap-1 pr-1">
                    {staffOnlyEmployees
                      .filter((e) => !empSearchTerm || e.name.toLowerCase().includes(empSearchTerm.toLowerCase()))
                      .map((emp) => (
                        <button
                          key={emp.id}
                          type="button"
                          onClick={() => {
                            setSelectedEmpId(emp.id);
                            setShowEmpSelector(false);
                          }}
                          className={`px-2.5 py-1 rounded-xl text-xs font-black cursor-pointer border transition-all ${
                            selectedEmpId === emp.id
                              ? 'bg-purple-900 text-white border-purple-800'
                              : 'bg-white hover:bg-purple-100 text-purple-950 border-purple-200'
                          }`}
                        >
                          {emp.name}
                        </button>
                      ))}
                  </div>
                </div>
              )}

              {/* BỘ CHỌN CHI NHÁNH PHÂN CÔNG (THIẾT KẾ RÕ RÀNG, NÚT BẤM TO DỄ CHẠM CHO MOBILE & DESKTOP) */}
              {branches.length > 0 && (
                <div className="space-y-1.5 bg-purple-50/70 p-2.5 rounded-2xl border border-purple-200 shadow-2xs">
                  <div className="flex items-center justify-between text-[11px] font-black text-purple-950 uppercase">
                    <span className="flex items-center gap-1.5">
                      <span>🏢</span>
                      <span>Chi Nhánh Phân Công:</span>
                    </span>
                    <span className="text-[11px] text-purple-800 font-extrabold normal-case">
                      Đang chọn: <b className="text-purple-950 font-black">{currentBranch?.name}</b>
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {branches.map((b) => {
                      const isSelected = selectedBranchId === b.id;
                      const style = getBranchColorStyle(b.name, b.color);
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setSelectedBranchId(b.id)}
                          className={`py-2 px-2.5 rounded-xl font-black text-xs border transition-all cursor-pointer shadow-2xs flex items-center justify-between gap-1.5 active:scale-95 ${
                            isSelected
                              ? 'bg-purple-900 text-white border-purple-800 shadow-sm ring-2 ring-purple-400 scale-[1.02]'
                              : 'bg-white hover:bg-purple-100/80 text-purple-950 border-purple-200 font-bold'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 min-w-0 truncate">
                            <span
                              className="w-3.5 h-3.5 rounded-full border border-white/50 flex-shrink-0 shadow-2xs"
                              style={{ backgroundColor: style.hex }}
                            />
                            <span className="truncate">{b.name}</span>
                          </div>
                          {isSelected ? (
                            <span className="w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px] font-black shrink-0">
                              ✓
                            </span>
                          ) : (
                            <span className="text-[10px] text-purple-400 font-bold shrink-0">
                              Chọn
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Mốc ca mẫu nhanh */}
              <div className="space-y-1">
                <label className="text-[11px] font-black text-purple-950 uppercase tracking-wide flex items-center justify-between">
                  <span>Mốc ca:</span>
                  {!showEmpSelector && (
                    <button
                      type="button"
                      onClick={() => setShowEmpSelector(true)}
                      className="text-[10px] text-purple-700 hover:underline font-bold cursor-pointer"
                    >
                      Đổi NV khác
                    </button>
                  )}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {QUICK_PRESET_SHIFTS.map((p) => {
                    const isActive = startTime === p.s && endTime === p.e;
                    return (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => applyPreset(p.s, p.e)}
                        className={`py-2 px-2.5 rounded-xl text-xs font-black border transition-all cursor-pointer text-center active:scale-95 ${
                          isActive
                            ? 'bg-purple-900 text-white border-purple-900 shadow-2xs'
                            : 'bg-purple-50 hover:bg-purple-100 text-purple-950 border-purple-200 font-bold'
                        }`}
                      >
                        <div>{p.icon} {p.label}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Bộ chọn giờ Vào & Ra 2 cột trực quan */}
              <div className="bg-purple-50/70 p-3 rounded-2xl border border-purple-200 space-y-2.5 shadow-2xs">
                <div className="grid grid-cols-2 gap-2 sm:gap-3 divide-x divide-purple-200">
                  {/* Cột Giờ Vào */}
                  <div className="space-y-1.5 pr-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-black text-emerald-800 flex items-center gap-1">
                        <span>🟢 Vào:</span>
                      </span>
                      <input
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="px-2 py-0.5 bg-white border border-purple-300 rounded-lg text-purple-950 text-xs font-black outline-none cursor-pointer"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      {QUICK_START_TIMES.map((t) => (
                        <button
                          key={t.val}
                          type="button"
                          onClick={() => setStartTime(t.val)}
                          className={`py-1.5 rounded-lg text-[10.5px] font-black cursor-pointer border transition-all active:scale-95 text-center ${
                            startTime === t.val
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                              : 'bg-white text-purple-950 border-purple-200 hover:bg-purple-100 font-bold'
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Cột Giờ Ra */}
                  <div className="space-y-1.5 pl-2 sm:pl-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-black text-rose-800 flex items-center gap-1">
                        <span>🔴 Ra:</span>
                      </span>
                      <input
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        className="px-2 py-0.5 bg-white border border-purple-300 rounded-lg text-purple-950 text-xs font-black outline-none cursor-pointer"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      {QUICK_END_TIMES.map((t) => (
                        <button
                          key={t.val}
                          type="button"
                          onClick={() => setEndTime(t.val)}
                          className={`py-1.5 rounded-lg text-[10.5px] font-black cursor-pointer border transition-all active:scale-95 text-center ${
                            endTime === t.val
                              ? 'bg-rose-600 text-white border-rose-600 shadow-2xs'
                              : 'bg-white text-purple-950 border-purple-200 hover:bg-purple-100 font-bold'
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="pt-1 border-t border-purple-200 text-center flex items-center justify-between text-xs px-1">
                  <span className="font-extrabold text-purple-900">
                    ⏱️ Số giờ tự tính: <b className="text-purple-950 font-black text-sm">{hours} tiếng</b>
                  </span>
                </div>
              </div>

              {/* Ghi chú */}
              <div>
                <label className="block text-[11px] font-black text-purple-950 uppercase mb-1">
                  Ghi chú ca làm (tùy chọn):
                </label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ví dụ: Phụ bếp, Trực quầy..."
                  className="w-full px-3 py-2 bg-white border border-purple-200 rounded-xl text-xs font-bold text-purple-950 outline-none focus:border-purple-600 placeholder:text-gray-400"
                />
              </div>

              {/* Cụm nút hành động khi chưa chốt lịch */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 py-2.5 rounded-xl bg-purple-100 hover:bg-purple-200 text-purple-950 font-black text-xs cursor-pointer border-0 transition-all"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveShift}
                    disabled={submitting || !selectedEmpId || isTimeInvalid || hours <= 0}
                    className={`flex-2 py-2.5 rounded-xl font-black text-xs cursor-pointer border-0 shadow-md transition-all active:scale-95 ${
                      isTimeInvalid || hours <= 0
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-purple-900 hover:bg-purple-950 text-white'
                    }`}
                  >
                    {submitting ? '⏳ Đang lưu...' : isEditing ? '✅ Cập Nhật Giờ' : '✅ Lưu Ca Làm'}
                  </button>
                </div>

                {/* Bố cục cân đối 2 cột: [🗑️ Xóa ca (Về ban đầu)] & [🛑 Gán ca OFF (Cho nghỉ)] */}
                <div className="pt-0.5">
                  {currentAvail?.is_admin_assigned ? (
                    <button
                      type="button"
                      onClick={handleDeleteShiftOnly}
                      className="w-full py-2.5 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-950 font-black text-xs border border-amber-300 cursor-pointer transition-all active:scale-95 flex items-center justify-center gap-1.5 shadow-2xs"
                      title="Xóa trạng thái OFF, đưa nhân viên trở về đúng phiếu đăng ký ban đầu"
                    >
                      <span>↩️</span>
                      <span>Xóa ca OFF (Quay về trạng thái ban đầu)</span>
                    </button>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={handleDeleteShiftOnly}
                        className="py-2.5 px-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-950 font-black text-xs border border-amber-300 cursor-pointer transition-all active:scale-95 flex items-center justify-center gap-1 text-center shadow-2xs"
                        title="Xóa ca phân công, đưa nhân viên trở về đúng phiếu đăng ký ban đầu"
                      >
                        <span>🗑️</span>
                        <span className="truncate">Xóa ca (Về ban đầu)</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleConfirmOff}
                        className="py-2.5 px-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-black text-xs border border-rose-200 cursor-pointer transition-all active:scale-95 flex items-center justify-center gap-1 text-center shadow-2xs"
                        title="Gán ca OFF (Cho nghỉ) cho nhân viên này"
                      >
                        <span>🛑</span>
                        <span className="truncate">Gán ca OFF (Cho nghỉ)</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* =======================================================================
              TRƯỜNG HỢP 2: LỊCH ĐÃ CHỐT (isWeekLocked === true) -> CÁC FORM THAY ĐỔI
              ======================================================================= */}
          {isWeekLocked && (
            <div>
              {/* --- FORM THAY ĐỔI 1: ĐỔI GIỜ LÀM --- */}
              {activeChangeTab === 'time' && (
                <div className="space-y-3 animate-fade-in">
                  {/* BỘ CHỌN CHI NHÁNH PHÂN CÔNG (TỐI ƯU CHO MOBILE) */}
                  {branches.length > 0 && (
                    <div className="space-y-1.5 bg-purple-50/70 p-2.5 rounded-2xl border border-purple-200 shadow-2xs">
                      <div className="flex items-center justify-between text-[11px] font-black text-purple-950 uppercase">
                        <span className="flex items-center gap-1.5">
                          <span>🏢</span>
                          <span>Chi Nhánh Phân Công:</span>
                        </span>
                        <span className="text-[11px] text-purple-800 font-extrabold normal-case">
                          Đang chọn: <b className="text-purple-950 font-black">{currentBranch?.name}</b>
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                        {branches.map((b) => {
                          const isSelected = selectedBranchId === b.id;
                          const style = getBranchColorStyle(b.name, b.color);
                          return (
                            <button
                              key={b.id}
                              type="button"
                              onClick={() => setSelectedBranchId(b.id)}
                              className={`py-2 px-2.5 rounded-xl font-black text-xs border transition-all cursor-pointer shadow-2xs flex items-center justify-between gap-1.5 active:scale-95 ${
                                isSelected
                                  ? 'bg-purple-900 text-white border-purple-800 shadow-sm ring-2 ring-purple-400 scale-[1.02]'
                                  : 'bg-white hover:bg-purple-100/80 text-purple-950 border-purple-200 font-bold'
                              }`}
                            >
                              <div className="flex items-center gap-1.5 min-w-0 truncate">
                                <span
                                  className="w-3.5 h-3.5 rounded-full border border-white/50 flex-shrink-0 shadow-2xs"
                                  style={{ backgroundColor: style.hex }}
                                />
                                <span className="truncate">{b.name}</span>
                              </div>
                              {isSelected ? (
                                <span className="w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px] font-black shrink-0">
                                  ✓
                                </span>
                              ) : (
                                <span className="text-[10px] text-purple-400 font-bold shrink-0">
                                  Chọn
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Mốc ca mẫu nhanh */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-black text-purple-950 uppercase tracking-wide">
                      Mốc ca:
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {QUICK_PRESET_SHIFTS.map((p) => {
                        const isActive = startTime === p.s && endTime === p.e;
                        return (
                          <button
                            key={p.label}
                            type="button"
                            onClick={() => applyPreset(p.s, p.e)}
                            className={`py-2 px-2.5 rounded-xl text-xs font-black border transition-all cursor-pointer text-center active:scale-95 ${
                              isActive
                                ? 'bg-purple-900 text-white border-purple-900 shadow-2xs'
                                : 'bg-purple-50 hover:bg-purple-100 text-purple-950 border-purple-200 font-bold'
                            }`}
                          >
                            <div>{p.icon} {p.label}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Bộ chọn giờ Vào & Ra */}
                  <div className="bg-purple-50/70 p-3 rounded-2xl border border-purple-200 space-y-2.5 shadow-2xs">
                    <div className="grid grid-cols-2 gap-2 sm:gap-3 divide-x divide-purple-200">
                      <div className="space-y-1.5 pr-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-black text-emerald-800">🟢 Vào:</span>
                          <input
                            type="time"
                            value={startTime}
                            onChange={(e) => setStartTime(e.target.value)}
                            className="px-2 py-0.5 bg-white border border-purple-300 rounded-lg text-purple-950 text-xs font-black outline-none cursor-pointer"
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                          {QUICK_START_TIMES.map((t) => (
                            <button
                              key={t.val}
                              type="button"
                              onClick={() => setStartTime(t.val)}
                              className={`py-1.5 rounded-lg text-[10.5px] font-black cursor-pointer border transition-all active:scale-95 text-center ${
                                startTime === t.val
                                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                                  : 'bg-white text-purple-950 border-purple-200 hover:bg-purple-100 font-bold'
                              }`}
                            >
                              {t.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1.5 pl-2 sm:pl-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-black text-rose-800">🔴 Ra:</span>
                          <input
                            type="time"
                            value={endTime}
                            onChange={(e) => setEndTime(e.target.value)}
                            className="px-2 py-0.5 bg-white border border-purple-300 rounded-lg text-purple-950 text-xs font-black outline-none cursor-pointer"
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                          {QUICK_END_TIMES.map((t) => (
                            <button
                              key={t.val}
                              type="button"
                              onClick={() => setEndTime(t.val)}
                              className={`py-1.5 rounded-lg text-[10.5px] font-black cursor-pointer border transition-all active:scale-95 text-center ${
                                endTime === t.val
                                  ? 'bg-rose-600 text-white border-rose-600 shadow-2xs'
                                  : 'bg-white text-purple-950 border-purple-200 hover:bg-purple-100 font-bold'
                              }`}
                            >
                              {t.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="pt-1 border-t border-purple-200 text-center flex items-center justify-between text-xs px-1">
                      <span className="font-extrabold text-purple-900">
                        ⏱️ Số giờ tính lương: <b className="text-purple-950 font-black text-sm">{hours} tiếng</b>
                      </span>
                      {origShiftInfo && timeDiff.isChanged && (
                        <span className={`px-2 py-0.5 rounded-lg text-[11px] font-black text-white ${
                          timeDiff.diffHours > 0 ? 'bg-emerald-600' : 'bg-rose-600'
                        }`}>
                          {timeDiff.diffHours > 0 ? `+${timeDiff.diffHours}h tăng ca` : `${timeDiff.diffHours}h về sớm`}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Gợi ý ghi chú nhanh tăng ca / về sớm cá nhân (Nếu có chênh lệch giờ so với ca gốc) */}
                  {origShiftInfo && timeDiff.diffHours !== 0 && (
                    <div className="flex items-center justify-between gap-1.5 bg-purple-50/70 p-2 rounded-xl border border-purple-200 text-xs">
                      <span className="font-extrabold text-purple-950">Gợi ý lý do cá nhân:</span>
                      <button
                        type="button"
                        onClick={() => {
                          if (timeDiff.diffHours > 0) applyAdjustmentReason('ot');
                          else applyAdjustmentReason('early');
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-black cursor-pointer border transition-all active:scale-95 flex items-center gap-1 ${
                          note.includes('tăng ca') || note.includes('Về sớm')
                            ? 'bg-purple-900 text-white border-purple-800 shadow-2xs'
                            : 'bg-white text-purple-900 border-purple-300 hover:bg-purple-100 font-bold'
                        }`}
                      >
                        <span>⚡</span>
                        <span>{timeDiff.diffHours > 0 ? `Tăng ca (+${timeDiff.diffHours}h)` : `Về sớm (${endTime})`}</span>
                      </button>
                    </div>
                  )}

                  {/* Ghi chú */}
                  <div>
                    <label className="block text-[11px] font-black text-purple-950 uppercase mb-1">
                      Ghi chú ca làm (tùy chọn):
                    </label>
                    <input
                      type="text"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Ví dụ: Phụ bếp, Trực quầy..."
                      className="w-full px-3 py-2 bg-white border border-purple-200 rounded-xl text-xs font-bold text-purple-950 outline-none focus:border-purple-600 placeholder:text-gray-400"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={onClose}
                      className="flex-1 py-2.5 rounded-xl bg-purple-100 hover:bg-purple-200 text-purple-950 font-black text-xs cursor-pointer border-0 transition-all"
                    >
                      Hủy
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveShift}
                      disabled={submitting || !selectedEmpId || isTimeInvalid || hours <= 0}
                      className={`flex-2 py-2.5 rounded-xl font-black text-xs cursor-pointer border-0 shadow-md transition-all active:scale-95 ${
                        isTimeInvalid || hours <= 0
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          : 'bg-purple-900 hover:bg-purple-950 text-white'
                      }`}
                    >
                      {submitting ? '⏳ Đang lưu...' : '✅ Cập Nhật Giờ'}
                    </button>
                  </div>
                </div>
              )}

              {/* --- FORM THAY ĐỔI 2: CHUYỂN CA / LÀM THAY --- */}
              {activeChangeTab === 'transfer' && (
                <div className="space-y-3 animate-fade-in">
                  {/* Tóm tắt ca hiện tại */}
                  {isEditing ? (
                    <div className="bg-purple-50 p-2.5 rounded-2xl border border-purple-200 text-xs space-y-1 shadow-2xs">
                      <div className="font-extrabold text-purple-900">
                        Ca làm hiện tại của <b className="text-purple-950">{currentEmp?.name}</b>:
                      </div>
                      <div className="font-black text-purple-950 text-sm">
                        🕒 {startTime} - {endTime} ({hours} tiếng) • CN {currentBranch?.name}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-rose-50 p-2.5 rounded-2xl border border-rose-200 text-xs space-y-1 shadow-2xs">
                      <div className="font-extrabold text-rose-900">
                        Trạng thái hiện tại của <b className="text-rose-950">{currentEmp?.name}</b>:
                      </div>
                      <div className="font-black text-rose-950 text-sm flex items-center gap-1.5 flex-wrap">
                        <span>🛑 Đang OFF (Chưa có ca làm)</span>
                        <span className="text-xs font-bold text-rose-800 bg-rose-100 px-2 py-0.5 rounded-md">
                          👉 Chọn đồng nghiệp bên dưới để làm hộ ca
                        </span>
                      </div>
                    </div>
                  )}

                  {/* LÝ DO & HÌNH THỨC ĐỔI CA */}
                  {isEditing ? (
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-black text-purple-950 uppercase tracking-wide">
                        Hình thức / Lý do đổi ca:
                      </label>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => setTransferType('full')}
                          className={`py-2 px-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs active:scale-95 ${
                            transferType === 'full'
                              ? 'bg-purple-900 text-white border-purple-800 shadow-sm ring-2 ring-purple-400 scale-[1.02]'
                              : 'bg-white text-purple-950 border border-purple-200 hover:bg-purple-50 font-bold'
                          }`}
                        >
                          <span>🔄</span>
                          <span>Đổi Ca</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setTransferType('peer')}
                          className={`py-2 px-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs active:scale-95 ${
                            transferType === 'peer'
                              ? 'bg-purple-900 text-white border-purple-800 shadow-sm ring-2 ring-purple-400 scale-[1.02]'
                              : 'bg-white text-purple-950 border border-purple-200 hover:bg-purple-50 font-bold'
                          }`}
                        >
                          <span>👥</span>
                          <span>Làm thay bạn khác</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 p-2.5 rounded-xl bg-purple-100/70 border border-purple-200 text-xs font-bold text-purple-950">
                      <span className="text-base">👥</span>
                      <span>Chế độ: <b>Làm hộ ca cho đồng nghiệp</b> (Tự động đồng bộ ca cả 2 người)</span>
                    </div>
                  )}

                  {/* =========================================================
                      HÌNH THỨC 1: CHUYỂN TOÀN BỘ CA CHO ĐỒNG NGHIỆP
                      ========================================================= */}
                  {transferType === 'full' && (() => {
                    const selectedTargetPeer = peerStaffOnDay.find((p) => p.employeeId === transferTargetId);
                    return (
                      <div className="space-y-2.5 animate-fade-in">
                        <div className="flex items-center justify-between text-[11px] font-black text-purple-950 uppercase">
                          <span>Chọn nhân viên đổi / nhận ca:</span>
                          {transferTargetId && (
                            <button
                              type="button"
                              onClick={() => setTransferTargetId('')}
                              className="text-[10.5px] text-rose-700 hover:underline font-bold cursor-pointer normal-case"
                            >
                              ✕ Bỏ chọn
                            </button>
                          )}
                        </div>

                        <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                          {peerStaffOnDay.map((p) => {
                            const isSelected = transferTargetId === p.employeeId;
                            return (
                              <div
                                key={p.employeeId}
                                onClick={() => setTransferTargetId(p.employeeId)}
                                className={`p-2.5 rounded-xl border-2 cursor-pointer transition-all flex items-center justify-between gap-2 ${
                                  isSelected
                                    ? 'bg-purple-900 text-white border-purple-800 shadow-sm'
                                    : 'bg-purple-50/60 hover:bg-purple-100 text-purple-950 border-purple-200'
                                }`}
                              >
                                <div className="min-w-0">
                                  <div className="font-black text-xs truncate">{p.name}</div>
                                  <div className={`text-[10.5px] font-bold ${isSelected ? 'text-purple-200' : 'text-purple-700'}`}>
                                    {p.hasShift
                                      ? `🔄 Đang có ca: ${p.startTime} - ${p.endTime} (${p.hours}h) • Hoán đổi ca`
                                      : '🟢 Đang OFF (Rảnh cả ngày) • Nhường ca'}
                                  </div>
                                </div>
                                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-black ${
                                  isSelected ? 'bg-amber-400 text-purple-950' : 'border border-purple-300'
                                }`}>
                                  {isSelected ? '✓' : ''}
                                </span>
                              </div>
                            );
                          })}
                        </div>

                        {/* KHUNG HIỂN THỊ XÁC NHẬN CHÍNH XÁC THEO TRẠNG THÁI: HOÁN ĐỔI CA vs NHƯỜNG CA */}
                        {selectedTargetPeer && (
                          selectedTargetPeer.hasShift ? (
                            <div className="bg-purple-50 p-3 rounded-2xl border-2 border-purple-300 text-xs text-purple-950 font-bold space-y-1.5 animate-fade-in shadow-2xs">
                              <div className="flex items-center gap-1.5 text-purple-900 font-black text-xs uppercase tracking-wide">
                                <span className="text-base">🔄</span>
                                <span>Hoán đổi 2 ca làm việc cho nhau:</span>
                              </div>
                              <div className="bg-white p-2 rounded-xl border border-purple-200 space-y-1 text-xs">
                                <div className="flex items-center justify-between">
                                  <span>👤 <b>{currentEmp?.name}</b>:</span>
                                  <span className="font-black text-purple-950 bg-purple-100 px-2 py-0.5 rounded-md">
                                    Nhận ca {selectedTargetPeer.startTime} - {selectedTargetPeer.endTime} ({selectedTargetPeer.hours}h)
                                  </span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span>👤 <b>{selectedTargetPeer.name}</b>:</span>
                                  <span className="font-black text-purple-950 bg-purple-100 px-2 py-0.5 rounded-md">
                                    Nhận ca {startTime} - {endTime} ({hours}h)
                                  </span>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="bg-emerald-50 p-3 rounded-2xl border-2 border-emerald-300 text-xs text-emerald-950 font-bold space-y-1.5 animate-fade-in shadow-2xs">
                              <div className="flex items-center gap-1.5 text-emerald-900 font-black text-xs uppercase tracking-wide">
                                <span className="text-base">👉</span>
                                <span>Nhường ca cho đồng nghiệp đang OFF:</span>
                              </div>
                              <div className="bg-white p-2 rounded-xl border border-emerald-200 space-y-1 text-xs">
                                <div className="flex items-center justify-between">
                                  <span>👤 <b>{selectedTargetPeer.name}</b>:</span>
                                  <span className="font-black text-emerald-950 bg-emerald-100 px-2 py-0.5 rounded-md">
                                    Đi làm {startTime} - {endTime} ({hours} tiếng)
                                  </span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span>👤 <b>{currentEmp?.name}</b>:</span>
                                  <span className="font-black text-rose-700 bg-rose-100 px-2 py-0.5 rounded-md">
                                    Chuyển sang Nghỉ (OFF)
                                  </span>
                                </div>
                              </div>
                              <div className="text-[11px] text-purple-900 font-bold flex items-center gap-1 pt-0.5">
                                <span>ℹ️</span>
                                <span>{currentEmp?.name} sẽ được chuyển sang trạng thái OFF trong ngày này.</span>
                              </div>
                            </div>
                          )
                        )}

                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => setActiveChangeTab('time')}
                            className="flex-1 py-2.5 rounded-xl bg-purple-100 hover:bg-purple-200 text-purple-950 font-black text-xs cursor-pointer border-0 transition-all"
                          >
                            Quay lại
                          </button>
                          <button
                            type="button"
                            onClick={handleConfirmTransfer}
                            disabled={submitting || !transferTargetId}
                            className={`flex-2 py-2.5 rounded-xl font-black text-xs cursor-pointer border-0 shadow-md transition-all active:scale-95 ${
                              !transferTargetId
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                : 'bg-purple-900 hover:bg-purple-950 text-white'
                            }`}
                          >
                            {submitting
                              ? '⏳ Đang xử lý...'
                              : selectedTargetPeer?.hasShift
                              ? `✅ Hoán Đổi Ca Với ${selectedTargetPeer.name}`
                              : `✅ Nhường Ca & Báo OFF`}
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  {/* =========================================================
                      HÌNH THỨC 2: LÀM THAY BẠN KHÁC (TỰ ĐỘNG ĐỒNG BỘ 2 CHIỀU)
                      ========================================================= */}
                  {transferType === 'peer' && (
                    <div className="space-y-2.5 animate-fade-in">
                      {/* Chọn bạn làm thay */}
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-bold text-purple-900 flex items-center justify-between">
                          <span>👉 Chọn đồng nghiệp làm thay:</span>
                          {selectedPeerId && (
                            <button
                              type="button"
                              onClick={() => handleSelectPeerHandover('')}
                              className="text-[10.5px] text-rose-700 hover:underline font-bold cursor-pointer"
                            >
                              ✕ Bỏ chọn
                            </button>
                          )}
                        </div>

                        {/* Thanh tìm kiếm nhanh tên đồng nghiệp */}
                        <div className="relative flex items-center">
                          <span className="absolute left-2.5 text-xs text-purple-500">🔍</span>
                          <input
                            type="text"
                            value={peerSearchQuery}
                            onChange={(e) => setPeerSearchQuery(e.target.value)}
                            placeholder="Tìm nhanh theo tên đồng nghiệp..."
                            className="w-full pl-7 pr-7 py-1.5 bg-purple-50/80 hover:bg-purple-100/60 focus:bg-white border border-purple-200 rounded-xl text-xs font-bold text-purple-950 outline-none focus:border-purple-500 placeholder:text-purple-400 placeholder:font-normal transition-all"
                          />
                          {peerSearchQuery && (
                            <button
                              type="button"
                              onClick={() => setPeerSearchQuery('')}
                              className="absolute right-2 text-xs text-purple-400 hover:text-purple-900 font-black cursor-pointer p-0.5"
                              title="Xóa tìm kiếm"
                            >
                              ✕
                            </button>
                          )}
                        </div>

                        {/* Danh sách đồng nghiệp: Giới hạn hiển thị đúng 2 hàng (max-h-[72px]) */}
                        <div className="flex flex-wrap gap-1.5 max-h-[72px] overflow-y-auto pr-1 custom-scrollbar">
                          {filteredPeers.length > 0 ? (
                            filteredPeers.map((p) => {
                              const isSelected = selectedPeerId === p.employeeId;
                              const shiftStr = p.hasShift
                                ? `${p.origStartTime || p.startTime}-${p.origEndTime || p.endTime}`
                                : 'Đang OFF';
                              return (
                                <button
                                  key={p.employeeId}
                                  type="button"
                                  onClick={() => handleSelectPeerHandover(p.employeeId)}
                                  className={`px-2.5 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs active:scale-95 ${
                                    isSelected
                                      ? 'bg-purple-900 text-white border-2 border-purple-700 ring-2 ring-purple-300'
                                      : 'bg-white hover:bg-purple-100 text-purple-950 border border-purple-200'
                                  }`}
                                >
                                  <span
                                    className={`w-2 h-2 rounded-full ${
                                      p.hasShift ? 'bg-emerald-400' : 'bg-gray-400'
                                    } shrink-0`}
                                  />
                                  <span>{p.name}</span>
                                  <span
                                    className={`text-[10px] font-bold ${
                                      isSelected
                                        ? 'text-purple-200'
                                        : p.hasShift
                                        ? 'text-purple-600'
                                        : 'text-amber-700'
                                    }`}
                                  >
                                    ({shiftStr})
                                  </span>
                                </button>
                              );
                            })
                          ) : (
                            <div className="w-full text-center py-2 text-xs text-purple-500 italic font-bold">
                              Không tìm thấy đồng nghiệp "{peerSearchQuery}"
                            </div>
                          )}
                        </div>
                      </div>

                      {/* BỘ CHỌN HÌNH THỨC: LÀM THAY 1 PHẦN vs NGHỈ CẢ NGÀY (GÁN OFF) */}
                      {(() => {
                        const selectedPeer = peerStaffOnDay.find((p) => p.employeeId === selectedPeerId);
                        return (
                          <>
                            {selectedPeer && selectedPeer.hasShift && (
                              <div className="bg-purple-100/70 p-2.5 rounded-2xl border border-purple-200 space-y-1.5 shadow-2xs animate-fade-in">
                                <div className="text-[11px] font-black text-purple-950 uppercase tracking-wide flex items-center justify-between">
                                  <span>Hình thức làm thay cho {selectedPeer.name}:</span>
                                  <span className="text-[10px] font-bold text-purple-800 bg-white px-2 py-0.5 rounded-md border border-purple-200">
                                    {peerCoverMode === 'partial' ? '⏱️ Làm 1 phần (Về sớm)' : '🛑 Nghỉ cả ngày (Gán OFF)'}
                                  </span>
                                </div>

                                <div className="grid grid-cols-2 gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleChangePeerCoverMode('partial')}
                                    className={`py-2 px-2 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs active:scale-95 ${
                                      peerCoverMode === 'partial'
                                        ? 'bg-purple-900 text-white shadow-sm ring-2 ring-purple-400 scale-[1.02]'
                                        : 'bg-white text-purple-950 border border-purple-200 hover:bg-purple-50 font-bold'
                                    }`}
                                  >
                                    <span>⏱️</span>
                                    <span>Làm thay 1 phần (Về sớm)</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleChangePeerCoverMode('full_off')}
                                    className={`py-2 px-2 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs active:scale-95 ${
                                      peerCoverMode === 'full_off'
                                        ? 'bg-rose-600 text-white shadow-sm ring-2 ring-rose-400 scale-[1.02]'
                                        : 'bg-white text-rose-900 border border-rose-200 hover:bg-rose-50 font-bold'
                                    }`}
                                  >
                                    <span>🛑</span>
                                    <span>Nghỉ cả ngày (Gán OFF)</span>
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* CHỌN LÝ DO OFF CHO BẠN ĐƯỢC LÀM THAY KHI CHỌN NGHỈ CẢ NGÀY */}
                            {selectedPeer && selectedPeer.hasShift && peerCoverMode === 'full_off' && (
                              <div className="bg-rose-50 p-2.5 rounded-2xl border-2 border-rose-300 space-y-2 shadow-2xs animate-fade-in">
                                <div className="text-[11px] font-black text-rose-950 uppercase flex items-center justify-between">
                                  <span>🛑 Lý do nghỉ OFF cho {selectedPeer.name}:</span>
                                </div>

                                <div className="flex flex-wrap gap-1">
                                  {['Bận việc riêng', 'Sức khỏe / Ốm', 'Việc gia đình', 'Thi cử / Đi học', 'Được trực thay'].map((r) => (
                                    <button
                                      key={r}
                                      type="button"
                                      onClick={() => setPeerOffReason(r)}
                                      className={`px-2 py-1 rounded-lg text-[10.5px] font-black cursor-pointer border transition-all active:scale-95 ${
                                        peerOffReason === r
                                          ? 'bg-rose-600 text-white border-rose-600 shadow-2xs'
                                          : 'bg-white text-rose-900 border-rose-200 hover:bg-rose-100 font-bold'
                                      }`}
                                    >
                                      {r}
                                    </button>
                                  ))}
                                </div>

                                <input
                                  type="text"
                                  value={peerOffReason}
                                  onChange={(e) => setPeerOffReason(e.target.value)}
                                  placeholder="Nhập lý do nghỉ của bạn..."
                                  className="w-full px-2.5 py-1.5 bg-white border border-rose-200 rounded-xl text-xs font-bold text-rose-950 outline-none focus:border-rose-500 placeholder:text-gray-400"
                                />
                              </div>
                            )}

                            {/* Khung giờ làm thay */}
                            <div className="bg-purple-50/70 p-2.5 rounded-2xl border border-purple-200 space-y-2">
                              <div className="text-[11px] font-black text-purple-950 uppercase flex items-center justify-between">
                                <span>Khung giờ nhận làm thay:</span>
                                <span className="text-purple-950 font-black text-xs bg-purple-200/80 px-2 py-0.5 rounded-md">
                                  +{coverHours} tiếng {peerCoverMode === 'full_off' ? 'làm thay trọn ca' : 'làm thay'}
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-xl border border-purple-200">
                                  <span className="text-[11px] font-black text-emerald-800">🟢 Từ:</span>
                                  <input
                                    type="time"
                                    value={coverStartTime}
                                    onChange={(e) => setCoverStartTime(e.target.value)}
                                    className="text-xs font-black text-purple-950 outline-none cursor-pointer"
                                  />
                                </div>
                                <div className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-xl border border-purple-200">
                                  <span className="text-[11px] font-black text-rose-800">🔴 Đến:</span>
                                  <input
                                    type="time"
                                    value={coverEndTime}
                                    onChange={(e) => setCoverEndTime(e.target.value)}
                                    className="text-xs font-black text-purple-950 outline-none cursor-pointer"
                                  />
                                </div>
                              </div>



                              {/* HIỂN THỊ TRỰC QUAN CA TỔNG HỢP CỦA NHÂN VIÊN */}
                              <div className="pt-2 border-t border-purple-200 text-xs space-y-1 font-bold text-purple-900">
                                {origShiftInfo && (
                                  <div className="flex items-center justify-between">
                                    <span>Ca ban đầu của {currentEmp?.name}:</span>
                                    <span>{origShiftInfo.startTime} - {origShiftInfo.endTime} ({origShiftInfo.hours}h)</span>
                                  </div>
                                )}
                                <div className="flex items-center justify-between text-purple-950 font-black pt-1 border-t border-purple-200/60 flex-wrap gap-1">
                                  <span className="text-emerald-800">
                                    {origShiftInfo ? '👉 Ca tổng sau khi gộp:' : `👉 Ca làm của ${currentEmp?.name || 'bạn'}:`}
                                  </span>
                                  <span className="text-xs sm:text-sm bg-emerald-100 text-emerald-950 px-2 py-0.5 rounded-lg border border-emerald-300">
                                    {mergedShiftForPeer.hasGap && origShiftInfo ? (
                                      <>
                                        <span>{origShiftInfo.startTime}-{origShiftInfo.endTime} & {coverStartTime}-{coverEndTime}</span>
                                        <span className="ml-1.5 font-black text-emerald-900">({mergedShiftForPeer.hours} tiếng)</span>
                                      </>
                                    ) : (
                                      <span>{mergedShiftForPeer.startTime} - {mergedShiftForPeer.endTime} ({mergedShiftForPeer.hours} tiếng)</span>
                                    )}
                                  </span>
                                </div>

                                {mergedShiftForPeer.hasGap && origShiftInfo && (
                                  <div className="p-2 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-950 font-extrabold space-y-0.5">
                                    <div className="flex items-center justify-between text-amber-900 font-black">
                                      <span>☕ Ca gãy có giờ nghỉ ({mergedShiftForPeer.gapStart} - {mergedShiftForPeer.gapEnd}):</span>
                                      <span className="bg-amber-200/80 text-amber-950 px-1.5 py-0.2 rounded font-black">Nghỉ {mergedShiftForPeer.gapHours} tiếng</span>
                                    </div>
                                    <div className="text-[10.5px] text-amber-900">
                                      👉 Giờ tính lương: {origShiftInfo.hours}h (ca gốc) + {coverHours}h (làm thay) = <span className="font-black text-emerald-800 underline">{mergedShiftForPeer.hours} tiếng thực làm</span> (không cộng {mergedShiftForPeer.gapHours}h nghỉ).
                                    </div>
                                  </div>
                                )}

                                {selectedPeer && selectedPeer.hasShift && peerCoverMode === 'full_off' && (
                                  <div className="flex items-center justify-between text-rose-900 font-black pt-1 border-t border-purple-200/60">
                                    <span className="text-rose-800">🛑 Trạng thái của {selectedPeer.name}:</span>
                                    <span className="text-xs bg-rose-100 text-rose-900 px-2 py-0.5 rounded-lg border border-rose-300">
                                      Nghỉ cả ngày (OFF) • {peerOffReason || 'Bận việc riêng'}
                                    </span>
                                  </div>
                                )}

                                {selectedPeer && selectedPeer.hasShift && peerCoverMode === 'partial' && (() => {
                                  const pStart = selectedPeer.origStartTime || selectedPeer.startTime || '08:30';
                                  const pEnd = selectedPeer.origEndTime || selectedPeer.endTime || '22:00';
                                  let counterpartText = '';
                                  if (coverStartTime <= pStart && coverEndTime < pEnd) {
                                    counterpartText = `${coverEndTime} - ${pEnd} (Vào trễ lúc ${coverEndTime})`;
                                  } else if (coverStartTime > pStart && coverEndTime >= pEnd) {
                                    counterpartText = `${pStart} - ${coverStartTime} (Về sớm lúc ${coverStartTime})`;
                                  } else {
                                    counterpartText = `${pStart} - ${coverStartTime} (Về sớm)`;
                                  }
                                  return (
                                    <div className="flex items-center justify-between text-purple-950 font-black pt-1 border-t border-purple-200/60">
                                      <span className="text-purple-800">⏱️ Ca đối ứng của {selectedPeer.name}:</span>
                                      <span className="text-xs bg-purple-100 text-purple-950 px-2 py-0.5 rounded-lg border border-purple-200 font-black">
                                        {counterpartText}
                                      </span>
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>

                            {/* Checkbox tự động đồng bộ ca đối ứng */}
                            {selectedPeerId && coverHours > 0 && (
                              <label className="flex items-center gap-2 p-2 rounded-xl bg-purple-50 border border-purple-200 cursor-pointer text-xs font-bold text-purple-900">
                                <input
                                  type="checkbox"
                                  checked={syncPeerShift}
                                  onChange={(e) => setSyncPeerShift(e.target.checked)}
                                  className="rounded text-purple-600 focus:ring-purple-500 w-4 h-4 cursor-pointer"
                                />
                                <span>
                                  {peerCoverMode === 'full_off'
                                    ? `⚡ Tự động gán trạng thái OFF cho ${selectedPeer?.name || 'đồng nghiệp'}`
                                    : `⚡ Tự động cập nhật giờ ca đối ứng cho ${selectedPeer?.name || 'bạn làm thay'}`}
                                </span>
                              </label>
                            )}

                            {/* Ghi chú ca làm thay */}
                            <div>
                              <label className="block text-[11px] font-black text-purple-950 uppercase mb-1">
                                Ghi chú ca làm thay:
                              </label>
                              <input
                                type="text"
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                placeholder="Ví dụ: Làm thay phần ca còn lại..."
                                className="w-full px-3 py-2 bg-white border border-purple-200 rounded-xl text-xs font-bold text-purple-950 outline-none focus:border-purple-600 placeholder:text-gray-400"
                              />
                            </div>

                            <div className="flex items-center gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => setActiveChangeTab('time')}
                                className="flex-1 py-2.5 rounded-xl bg-purple-100 hover:bg-purple-200 text-purple-950 font-black text-xs cursor-pointer border-0 transition-all"
                              >
                                Quay lại
                              </button>
                              <button
                                type="button"
                                onClick={handleSavePeerCover}
                                disabled={submitting || !selectedPeerId || coverHours <= 0 || coverStartTime >= coverEndTime}
                                className={`flex-2 py-2.5 rounded-xl font-black text-xs cursor-pointer border-0 shadow-md transition-all active:scale-95 ${
                                  !selectedPeerId || coverHours <= 0 || coverStartTime >= coverEndTime
                                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                    : 'bg-purple-900 hover:bg-purple-950 text-white'
                                }`}
                              >
                                {submitting
                                  ? '⏳ Đang lưu...'
                                  : peerCoverMode === 'full_off'
                                  ? `✅ Lưu Ca & Gán OFF Cho ${selectedPeer?.name || 'Bạn'}`
                                  : '✅ Lưu Làm Thay'}
                              </button>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}

              {/* --- FORM THAY ĐỔI 3: BÁO NGHỈ (OFF) KÈM LÝ DO --- */}
              {activeChangeTab === 'off' && (
                <div className="space-y-3 animate-fade-in">
                  {currentAvail?.is_admin_assigned ? (
                    <div className="bg-emerald-50 p-3 rounded-2xl border border-emerald-200 text-xs space-y-2 text-center">
                      <div className="text-emerald-950 font-black text-sm">
                        Nhân viên này đang ở trạng thái OFF (Báo nghỉ)
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (onRemoveOff) onRemoveOff(selectedEmpId, date);
                          onClose();
                        }}
                        className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs cursor-pointer border-0 shadow-sm transition-all active:scale-95"
                      >
                        ↩️ Xóa OFF (Quay Lại Đi Làm)
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="bg-rose-50 p-3 rounded-2xl border border-rose-200 text-xs space-y-1">
                        <div className="font-extrabold text-rose-900">
                          Xác nhận cho <b className="text-rose-950">{currentEmp?.name}</b> nghỉ ca ngày này:
                        </div>
                        <div className="font-black text-rose-950 text-sm">
                          🛑 Ngày {date.split('-').reverse().join('/')} {isEditing ? `(Ca gốc: ${startTime} - ${endTime})` : ''}
                        </div>
                      </div>

                      <div className="space-y-2.5">
                        <div className="space-y-1">
                          <label className="block text-[11px] font-black text-purple-950 uppercase">
                            Chọn nhanh lý do nghỉ:
                          </label>
                          <div className="flex flex-wrap gap-1.5">
                            {['Bận việc riêng', 'Nghỉ ốm', 'Việc gia đình', 'Đột xuất', 'Nghỉ bù'].map((r) => (
                              <button
                                key={r}
                                type="button"
                                onClick={() => setOffReason(r)}
                                className={`px-2.5 py-1 rounded-xl text-xs font-black cursor-pointer border transition-all active:scale-95 ${
                                  offReason === r
                                    ? 'bg-rose-600 text-white border-rose-600 shadow-2xs'
                                    : 'bg-white hover:bg-rose-50 text-rose-900 border-rose-200 font-bold'
                                }`}
                              >
                                {r}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="block text-[11px] font-black text-purple-950 uppercase">
                            Ghi chú lý do chi tiết:
                          </label>
                          <input
                            type="text"
                            value={offReason}
                            onChange={(e) => setOffReason(e.target.value)}
                            placeholder="Nhập lý do nghỉ ca này..."
                            className="w-full px-3 py-2 bg-white border border-rose-300 focus:border-rose-600 rounded-xl text-xs font-bold text-rose-950 outline-none"
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setActiveChangeTab('time')}
                          className="flex-1 py-2.5 rounded-xl bg-purple-100 hover:bg-purple-200 text-purple-950 font-black text-xs cursor-pointer border-0 transition-all"
                        >
                          Quay lại
                        </button>
                        <button
                          type="button"
                          onClick={handleConfirmOff}
                          className="flex-2 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs cursor-pointer border-0 shadow-md transition-all active:scale-95 flex items-center justify-center gap-1.5"
                        >
                          <span>🛑</span>
                          <span>Xác Nhận Báo OFF</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
