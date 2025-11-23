import React, { useEffect, useMemo, useState } from 'react';

type SeatStatus = 'idle' | 'seated' | 'rest';
type Lang = 'zh' | 'en';

interface SeatState {
  id: number;
  memberId: string;
  status: SeatStatus;
  activeSeconds: number;
  restSeconds: number;
  lastActiveStart: number | null;
  lastRestStart: number | null;
  buyInAmount: number;
  transferNote: string | null;
  sessionStart: string | null;
  selectedForBatch: boolean;
}

interface SessionRow {
  date: string;
  tableId: number;
  tableName: string;
  seatId: number;
  memberId: string;
  startTime: string;
  endTime: string;
  activeSeconds: number;
  restSeconds: number;
  durationHMS: string;
  buyInDisplay: string;
  buyInAmount: number | null;
  transferNote: string | null;
}

interface TableState {
  id: number;
  name: string;
  blinds: string;
  openedAt: string | null;
  closedAt: string | null;
  elapsedSeconds: number;
  lastStartTime: number | null;
  isRunning: boolean;
  seats: SeatState[];
  sessions: SessionRow[];
}

const TABLE_COUNT = 4;
const SEATS_PER_TABLE = 9;
const STORAGE_KEY = 'everwin_poker_tables_v5';

function formatHMS(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

function formatDateTime(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  const h = d.getHours().toString().padStart(2, '0');
  const min = d.getMinutes().toString().padStart(2, '0');
  const sec = d.getSeconds().toString().padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}:${sec}`;
}

function formatToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function createInitialSeat(id: number): SeatState {
  return {
    id,
    memberId: '',
    status: 'idle',
    activeSeconds: 0,
    restSeconds: 0,
    lastActiveStart: null,
    lastRestStart: null,
    buyInAmount: 0,
    transferNote: null,
    sessionStart: null,
    selectedForBatch: false,
  };
}

function createInitialTable(id: number): TableState {
  return {
    id,
    name: `Table ${id}`,
    blinds: '',
    openedAt: null,
    closedAt: null,
    elapsedSeconds: 0,
    lastStartTime: null,
    isRunning: false,
    seats: Array.from({ length: SEATS_PER_TABLE }, (_, i) => createInitialSeat(i + 1)),
    sessions: [],
  };
}

function loadInitialTables(): TableState[] {
  if (typeof window === 'undefined') {
    return Array.from({ length: TABLE_COUNT }, (_, i) => createInitialTable(i + 1));
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return Array.from({ length: TABLE_COUNT }, (_, i) => createInitialTable(i + 1));
    }
    const parsed = JSON.parse(raw) as TableState[];
    return parsed.map((t, idx) => ({
      ...createInitialTable(idx + 1),
      ...t,
      id: idx + 1,
      seats: t.seats
        ? t.seats.map((s, seatIdx) => ({
            ...createInitialSeat(seatIdx + 1),
            ...s,
            id: seatIdx + 1,
          }))
        : Array.from({ length: SEATS_PER_TABLE }, (_, i) => createInitialSeat(i + 1)),
      sessions: Array.isArray(t.sessions) ? t.sessions : [],
    }));
  } catch {
    return Array.from({ length: TABLE_COUNT }, (_, i) => createInitialTable(i + 1));
  }
}

function usePersistentTables(): [TableState[], React.Dispatch<React.SetStateAction<TableState[]>>] {
  const [tables, setTables] = useState<TableState[]>(() => loadInitialTables());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tables));
  }, [tables]);

  return [tables, setTables];
}

function getTableElapsedSeconds(table: TableState, nowMs: number): number {
  if (table.isRunning && table.lastStartTime != null) {
    const delta = Math.floor((nowMs - table.lastStartTime) / 1000);
    return table.elapsedSeconds + Math.max(0, delta);
  }
  return table.elapsedSeconds;
}

function getSeatActiveSeconds(seat: SeatState, nowMs: number): number {
  if (seat.status === 'seated' && seat.lastActiveStart != null) {
    const delta = Math.floor((nowMs - seat.lastActiveStart) / 1000);
    return seat.activeSeconds + Math.max(0, delta);
  }
  return seat.activeSeconds;
}

function getSeatRestSeconds(seat: SeatState, nowMs: number): number {
  if (seat.status === 'rest' && seat.lastRestStart != null) {
    const delta = Math.floor((nowMs - seat.lastRestStart) / 1000);
    return seat.restSeconds + Math.max(0, delta);
  }
  return seat.restSeconds;
}

const zhTexts = {
  tableLabel: '桌號',
  running: '運行中',
  stopped: '未開桌',
  startOrResume: '開桌 / 繼續',
  pause: '暫停牌桌',
  stop: '關桌（輸出本局）',
  exportCsv: '手動匯出 CSV',
  resetTable: 'Reset 本桌（匯出後清除）',
  today: '今天',
  currentTableTime: '牌桌時間',
  openedAt: '開桌時間',
  closedAt: '關桌時間',
  blinds: '盲注級別',
  blindsPlaceholder: '例如 25-50 / 50-100',
  seat: '席次',
  statusIdle: '空位 / 未上桌',
  statusSeated: '上桌中',
  statusRest: '休息中',
  todayTotal: '本局上桌時間',
  todayCount: '本局上桌次數',
  restSeconds: '休息秒數',
  buyIn: '買碼總額',
  memberId: '會員 ID',
  batchLabel: '批次',
  btnSeat: '上桌',
  btnRest: '休息',
  btnLeave: '下桌',
  btnAddBuyIn: '加買籌碼',
  btnBatchSeat: '批次上桌',
  btnBatchLeave: '批次下桌',
  tableHasPlayers: '仍有玩家在桌上（非休息），請先讓所有玩家下桌。',
  tableNotRunning: '請先運行開桌，再為玩家上桌。',
  needMemberId: '請先輸入會員號碼再上桌。',
  duplicateMember: '同一位會員已在本桌其他位置上桌，請先處理座位移動。',
  batchNoSelection: '請先勾選要批次操作的席次。',
  batchMissingMember: '批次上桌的每個席次都必須先輸入會員號。',
  batchPromptChips: '請輸入本次上桌每位玩家的買入籌碼（金額，可為 0）',
  invalidNumber: '請輸入正確的數字。',
  confirmMove: (memberId: string, fromSeat: number, toSeat: number) =>
    `會員 ${memberId} 目前在席次 ${fromSeat}，要移動到席次 ${toSeat} 嗎？`,
  confirmReset: '確定要重置本桌所有資料嗎？系統會先自動匯出一份 CSV。',
  confirmBatchLeave: '確定要將勾選的席次全部下桌並寫入紀錄嗎？',
  csvHeaderDate: '日期',
  csvHeaderTable: '桌號',
  csvHeaderSeat: '席次',
  csvHeaderMember: '會員 ID',
  csvHeaderStart: '上桌時間',
  csvHeaderEnd: '下桌時間',
  csvHeaderActiveSec: '上桌秒數',
  csvHeaderRestSec: '休息秒數',
  csvHeaderDuration: '上桌時間(HH:MM:SS)',
  csvHeaderBuyIn: '買碼',
  csvHeaderTransfer: '轉席註記',
  csvSummaryTotalBuyIn: '本局總買碼',
  csvSummaryUniquePlayers: '不重複會員數',
  csvSummaryTotalSessions: '本局紀錄筆數',
};

const enTexts = {
  tableLabel: 'Table',
  running: 'Running',
  stopped: 'Stopped',
  startOrResume: 'Start / Resume',
  pause: 'Pause Table',
  stop: 'Close Table (Export)',
  exportCsv: 'Export CSV (manual)',
  resetTable: 'Reset Table (export & clear)',
  today: 'Today',
  currentTableTime: 'Table Time',
  openedAt: 'Opened At',
  closedAt: 'Closed At',
  blinds: 'Blinds',
  blindsPlaceholder: 'e.g. 25-50 / 50-100',
  seat: 'Seat',
  statusIdle: 'Empty / Idle',
  statusSeated: 'Seated',
  statusRest: 'Resting',
  todayTotal: 'Session Time',
  todayCount: 'Seat Count',
  restSeconds: 'Rest Seconds',
  buyIn: 'Total Buy-in',
  memberId: 'Member ID',
  batchLabel: 'Batch',
  btnSeat: 'Seat',
  btnRest: 'Rest',
  btnLeave: 'Leave',
  btnAddBuyIn: 'Add Chips',
  btnBatchSeat: 'Batch Seat',
  btnBatchLeave: 'Batch Leave',
  tableHasPlayers: 'There are still players seated (not resting). Please let them leave first.',
  tableNotRunning: 'Please start the table clock before seating players.',
  needMemberId: 'Please enter a member ID before seating.',
  duplicateMember: 'This member is already seated at another position. Please handle seat move first.',
  batchNoSelection: 'Please select seats for batch operation first.',
  batchMissingMember: 'Every batch seat must have a member ID.',
  batchPromptChips: 'Enter buy-in amount for each selected player (can be 0).',
  invalidNumber: 'Please enter a valid number.',
  confirmMove: (memberId: string, fromSeat: number, toSeat: number) =>
    `Member ${memberId} is currently seated at Seat ${fromSeat}. Move to Seat ${toSeat}?`,
  confirmReset: 'Reset this table and clear all data? A CSV will be exported first.',
  confirmBatchLeave: 'Leave all selected seats and write their sessions?',
  csvHeaderDate: 'Date',
  csvHeaderTable: 'Table',
  csvHeaderSeat: 'Seat',
  csvHeaderMember: 'Member ID',
  csvHeaderStart: 'Start Time',
  csvHeaderEnd: 'End Time',
  csvHeaderActiveSec: 'Active Seconds',
  csvHeaderRestSec: 'Rest Seconds',
  csvHeaderDuration: 'Duration (HH:MM:SS)',
  csvHeaderBuyIn: 'Buy-in',
  csvHeaderTransfer: 'Transfer Note',
  csvSummaryTotalBuyIn: 'Total Buy-in',
  csvSummaryUniquePlayers: 'Unique Members',
  csvSummaryTotalSessions: 'Total Sessions',
};

const App: React.FC = () => {
  const [tables, setTables] = usePersistentTables();
  const [currentTableId, setCurrentTableId] = useState(1);
  const [lang, setLang] = useState<Lang>('zh');
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const t = lang === 'zh' ? zhTexts : enTexts;
  const todayText = formatToday();
  const langToggleLabel = lang === 'zh' ? 'English' : '中文';

  const currentTableIndex = useMemo(
    () => tables.findIndex((tbl) => tbl.id === currentTableId),
    [tables, currentTableId],
  );
  const currentTable = tables[currentTableIndex] ?? tables[0];

  const updateTable = (tableId: number, updater: (t: TableState) => TableState) => {
    setTables((prev) => prev.map((tbl) => (tbl.id === tableId ? updater(tbl) : tbl)));
  };

  const hasActivePlayers = (tbl: TableState): boolean =>
    tbl.seats.some((s) => s.status === 'seated');

  const handleStartOrResume = () => {
    if (!currentTable) return;
    const now = Date.now();
    updateTable(currentTable.id, (tbl) => {
      if (tbl.isRunning) return tbl;
      const openedAt = tbl.openedAt ?? formatDateTime(new Date());
      return {
        ...tbl,
        openedAt,
        isRunning: true,
        lastStartTime: now,
        closedAt: null,
      };
    });
  };

  const handlePause = () => {
    if (!currentTable) return;
    if (hasActivePlayers(currentTable)) {
      window.alert(t.tableHasPlayers);
      return;
    }
    const now = Date.now();
    updateTable(currentTable.id, (tbl) => {
      if (!tbl.isRunning || tbl.lastStartTime == null) return tbl;
      const elapsedSeconds = getTableElapsedSeconds(tbl, now);
      return {
        ...tbl,
        isRunning: false,
        lastStartTime: null,
        elapsedSeconds,
      };
    });
  };

  const computeTableSummary = (tbl: TableState, nowMsSnapshot: number) => {
    const elapsed = getTableElapsedSeconds(tbl, nowMsSnapshot);
    const totalBuyIn = tbl.sessions.reduce((sum, s) => (s.buyInAmount ?? 0) + sum, 0);
    const uniqueMembers = Array.from(new Set(tbl.sessions.map((s) => s.memberId))).filter(
      (id) => id.trim() !== '',
    ).length;
    return { elapsed, totalBuyIn, uniqueMembers, totalSessions: tbl.sessions.length };
  };

  const exportCsvForTable = (tbl: TableState, nowMsSnapshot: number, closedAtOverride?: string) => {
    const closedAt = closedAtOverride ?? tbl.closedAt ?? '';
    const { elapsed, totalBuyIn, uniqueMembers, totalSessions } = computeTableSummary(
      tbl,
      nowMsSnapshot,
    );

    const headerLines: string[][] = [
      ['Table', tbl.name],
      ['Date', todayText],
      ['Blinds', tbl.blinds ?? ''],
      [t.openedAt, tbl.openedAt ?? ''],
      [t.closedAt, closedAt],
      [t.currentTableTime, formatHMS(elapsed)],
      [t.csvSummaryTotalBuyIn, totalBuyIn.toString()],
      [t.csvSummaryUniquePlayers, uniqueMembers.toString()],
      [t.csvSummaryTotalSessions, totalSessions.toString()],
      [''],
    ];

    const columns = [
      t.csvHeaderDate,
      t.csvHeaderTable,
      t.csvHeaderSeat,
      t.csvHeaderMember,
      t.csvHeaderStart,
      t.csvHeaderEnd,
      t.csvHeaderActiveSec,
      t.csvHeaderRestSec,
      t.csvHeaderDuration,
      t.csvHeaderBuyIn,
      t.csvHeaderTransfer,
    ];

    const rows = tbl.sessions.map((row) => [
      row.date,
      row.tableName,
      row.seatId.toString(),
      row.memberId,
      row.startTime,
      row.endTime,
      row.activeSeconds.toString(),
      row.restSeconds.toString(),
      row.durationHMS,
      row.buyInDisplay,
      row.transferNote ?? '',
    ]);

    const allLines = [...headerLines, columns, ...rows];
    const csvContent = allLines
      .map((line) => line.map((v) => `"${(v ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const fileName = `PokerSessions_${todayText.replace(/-/g, '')}_${tbl.name.replace(
      /\s+/g,
      '',
    )}.csv`;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleStop = () => {
    if (!currentTable) return;
    if (hasActivePlayers(currentTable)) {
      window.alert(t.tableHasPlayers);
      return;
    }
    const now = Date.now();
    const closedAtStr = formatDateTime(new Date());
    const snapshot: TableState = {
      ...currentTable,
      elapsedSeconds: getTableElapsedSeconds(currentTable, now),
      closedAt: closedAtStr,
    };
    exportCsvForTable(snapshot, now, closedAtStr);

    updateTable(currentTable.id, (tbl) => {
      const elapsedSeconds = getTableElapsedSeconds(tbl, now);
      return {
        ...tbl,
        isRunning: false,
        lastStartTime: null,
        elapsedSeconds,
        closedAt: closedAtStr,
      };
    });
  };

  const handleExportCsv = () => {
    if (!currentTable) return;
    const now = Date.now();
    const snapshot: TableState = {
      ...currentTable,
      elapsedSeconds: getTableElapsedSeconds(currentTable, now),
    };
    exportCsvForTable(snapshot, now);
  };

  const handleResetTable = () => {
    if (!currentTable) return;
    if (!window.confirm(t.confirmReset)) return;
    const now = Date.now();
    if (currentTable.sessions.length > 0) {
      const snapshot: TableState = {
        ...currentTable,
        elapsedSeconds: getTableElapsedSeconds(currentTable, now),
      };
      exportCsvForTable(snapshot, now);
    }
    updateTable(currentTable.id, (tbl) => {
      const fresh = createInitialTable(tbl.id);
      return {
        ...fresh,
        name: tbl.name,
      };
    });
  };

  const handleBlindsChange = (value: string) => {
    if (!currentTable) return;
    updateTable(currentTable.id, (tbl) => ({
      ...tbl,
      blinds: value,
    }));
  };

  const handleToggleBatchSeat = (seatId: number) => {
    if (!currentTable) return;
    updateTable(currentTable.id, (tbl) => ({
      ...tbl,
      seats: tbl.seats.map((s) =>
        s.id === seatId ? { ...s, selectedForBatch: !s.selectedForBatch } : s,
      ),
    }));
  };

  const handleMemberChange = (seatId: number, value: string) => {
    if (!currentTable) return;
    updateTable(currentTable.id, (tbl) => ({
      ...tbl,
      seats: tbl.seats.map((s) => (s.id === seatId ? { ...s, memberId: value.trim() } : s)),
    }));
  };

  const findSeatByMember = (tbl: TableState, memberId: string): SeatState | undefined => {
    const id = memberId.trim();
    if (!id) return undefined;
    return tbl.seats.find(
      (s) => s.memberId === id && (s.status === 'seated' || s.status === 'rest'),
    );
  };

  const appendSessionRow = (
    tbl: TableState,
    seat: SeatState,
    endTimeStr: string,
    nowMsSnapshot: number,
  ): SessionRow | null => {
    if (!seat.memberId || !seat.sessionStart) return null;
    const activeSeconds = getSeatActiveSeconds(seat, nowMsSnapshot);
    const restSeconds = getSeatRestSeconds(seat, nowMsSnapshot);
    const durationHMS = formatHMS(activeSeconds);
    const buyInDisplay = seat.transferNote
      ? seat.transferNote
      : seat.buyInAmount.toString();
    const buyInAmount = seat.transferNote ? null : seat.buyInAmount;
    return {
      date: formatToday(),
      tableId: tbl.id,
      tableName: tbl.name,
      seatId: seat.id,
      memberId: seat.memberId,
      startTime: seat.sessionStart,
      endTime: endTimeStr,
      activeSeconds,
      restSeconds,
      durationHMS,
      buyInDisplay,
      buyInAmount,
      transferNote: seat.transferNote,
    };
  };

  const clearSeat = (seat: SeatState): SeatState => ({
    ...seat,
    status: 'idle',
    activeSeconds: 0,
    restSeconds: 0,
    lastActiveStart: null,
    lastRestStart: null,
    buyInAmount: 0,
    transferNote: null,
    sessionStart: null,
    selectedForBatch: false,
    memberId: '',
  });

  const handleSeatUp = (seatId: number) => {
    if (!currentTable) return;
    const tbl = currentTable;

    if (!tbl.isRunning) {
      window.alert(t.tableNotRunning);
      return;
    }

    const seat = tbl.seats.find((s) => s.id === seatId);
    if (!seat) return;

    const memberId = seat.memberId.trim();
    if (!memberId) {
      window.alert(t.needMemberId);
      return;
    }

    const existing = findSeatByMember(tbl, memberId);
    const now = Date.now();

    if (existing && existing.id !== seatId) {
      const ok = window.confirm(t.confirmMove(memberId, existing.id, seatId));
      if (!ok) return;

      updateTable(tbl.id, (prevTbl) => {
        const closedAtStr = formatDateTime(new Date());
        const nowSnap = now;
        const sessions: SessionRow[] = [...prevTbl.sessions];
        const newSeats = prevTbl.seats.map((s) => {
          if (s.id === existing.id) {
            const session = appendSessionRow(prevTbl, s, closedAtStr, nowSnap);
            if (session) sessions.push(session);
            return clearSeat(s);
          }
          return s;
        });

        const updatedSeats = newSeats.map((s) => {
          if (s.id !== seatId) return s;
          return {
            ...s,
            status: 'seated' as SeatStatus,
            lastActiveStart: nowSnap,
            lastRestStart: null,
            activeSeconds: 0,
            restSeconds: 0,
            sessionStart: formatDateTime(new Date()),
            transferNote: `Transfer-Seat${existing.id}`,
          };
        });

        return {
          ...prevTbl,
          seats: updatedSeats,
          sessions,
        };
      });
      return;
    }

    updateTable(tbl.id, (prevTbl) => {
      const nowSnap = now;
      const seats = prevTbl.seats.map((s) => {
        if (s.id !== seatId) return s;
        if (s.status === 'seated') return s;
        let activeSeconds = s.activeSeconds;
        let restSeconds = s.restSeconds;
        let sessionStart = s.sessionStart;
        if (s.status === 'rest' && s.lastRestStart != null) {
          const delta = Math.floor((nowSnap - s.lastRestStart) / 1000);
          restSeconds += Math.max(0, delta);
        }
        if (s.status === 'idle') {
          activeSeconds = 0;
          restSeconds = 0;
          sessionStart = formatDateTime(new Date());
        }
        return {
          ...s,
          status: 'seated' as SeatStatus,
          lastActiveStart: nowSnap,
          lastRestStart: null,
          activeSeconds,
          restSeconds,
          sessionStart,
          transferNote: s.transferNote,
        };
      });
      return { ...prevTbl, seats };
    });
  };

  const handleRest = (seatId: number) => {
    if (!currentTable) return;
    const now = Date.now();
    updateTable(currentTable.id, (tbl) => {
      const seats = tbl.seats.map((s) => {
        if (s.id !== seatId) return s;
        if (s.status !== 'seated' || s.lastActiveStart == null) return s;
        const delta = Math.floor((now - s.lastActiveStart) / 1000);
        const activeSeconds = s.activeSeconds + Math.max(0, delta);
        return {
          ...s,
          status: 'rest' as SeatStatus,
          lastActiveStart: null,
          lastRestStart: now,
          activeSeconds,
        };
      });
      return { ...tbl, seats };
    });
  };

  const handleLeave = (seatId: number) => {
    if (!currentTable) return;
    const now = Date.now();
    const endTimeStr = formatDateTime(new Date());
    updateTable(currentTable.id, (tbl) => {
      const nowSnap = now;
      const sessions: SessionRow[] = [...tbl.sessions];
      const seats = tbl.seats.map((s) => {
        if (s.id !== seatId) return s;
        const session = appendSessionRow(tbl, s, endTimeStr, nowSnap);
        if (session) sessions.push(session);
        return clearSeat(s);
      });
      return { ...tbl, seats, sessions };
    });
  };

  const handleAddBuyIn = (seatId: number) => {
    if (!currentTable) return;
    const seat = currentTable.seats.find((s) => s.id === seatId);
    if (!seat) return;
    const raw = window.prompt(
      lang === 'zh'
        ? '請輸入加買籌碼數量（金額，可為 0）'
        : 'Enter additional buy-in amount (can be 0)',
      '0',
    );
    if (raw == null) return;
    const amt = Number(raw);
    if (!Number.isFinite(amt)) {
      window.alert(t.invalidNumber);
      return;
    }
    updateTable(currentTable.id, (tbl) => ({
      ...tbl,
      seats: tbl.seats.map((s) =>
        s.id === seatId ? { ...s, buyInAmount: s.buyInAmount + Math.max(0, amt) } : s,
      ),
    }));
  };

  const handleBatchSeat = () => {
    if (!currentTable) return;
    const tbl = currentTable;
    if (!tbl.isRunning) {
      window.alert(t.tableNotRunning);
      return;
    }
    const selected = tbl.seats.filter((s) => s.selectedForBatch);
    if (selected.length === 0) {
      window.alert(t.batchNoSelection);
      return;
    }
    if (selected.some((s) => !s.memberId.trim())) {
      window.alert(t.batchMissingMember);
      return;
    }
    for (const s of selected) {
      const existing = findSeatByMember(tbl, s.memberId);
      if (existing && existing.id !== s.id) {
        window.alert(t.duplicateMember);
        return;
      }
    }
    const raw = window.prompt(t.batchPromptChips, '0');
    if (raw == null) return;
    const amt = Number(raw);
    if (!Number.isFinite(amt)) {
      window.alert(t.invalidNumber);
      return;
    }
    const buyInDelta = Math.max(0, amt);
    const now = Date.now();
    updateTable(tbl.id, (prevTbl) => {
      const nowSnap = now;
      const seats = prevTbl.seats.map((s) => {
        if (!s.selectedForBatch) return s;
        if (s.status === 'seated') {
          return {
            ...s,
            buyInAmount: s.buyInAmount + buyInDelta,
          };
        }
        let activeSeconds = s.activeSeconds;
        let restSeconds = s.restSeconds;
        let sessionStart = s.sessionStart;
        if (s.status === 'rest' && s.lastRestStart != null) {
          const delta = Math.floor((nowSnap - s.lastRestStart) / 1000);
          restSeconds += Math.max(0, delta);
        }
        if (s.status === 'idle') {
          activeSeconds = 0;
          restSeconds = 0;
          sessionStart = formatDateTime(new Date());
        }
        return {
          ...s,
          status: 'seated' as SeatStatus,
          lastActiveStart: nowSnap,
          lastRestStart: null,
          activeSeconds,
          restSeconds,
          sessionStart,
          buyInAmount: s.buyInAmount + buyInDelta,
          transferNote: s.transferNote,
        };
      });
      return { ...prevTbl, seats };
    });
  };

  const handleBatchLeave = () => {
    if (!currentTable) return;
    const tbl = currentTable;
    const selected = tbl.seats.filter((s) => s.selectedForBatch && s.status !== 'idle');
    if (selected.length === 0) {
      window.alert(t.batchNoSelection);
      return;
    }
    const ok = window.confirm(t.confirmBatchLeave);
    if (!ok) return;
    const now = Date.now();
    const endTimeStr = formatDateTime(new Date());
    updateTable(tbl.id, (prevTbl) => {
      const nowSnap = now;
      const sessions: SessionRow[] = [...prevTbl.sessions];
      const seats = prevTbl.seats.map((s) => {
        if (!s.selectedForBatch || s.status === 'idle') return s;
        const session = appendSessionRow(prevTbl, s, endTimeStr, nowSnap);
        if (session) sessions.push(session);
        return clearSeat(s);
      });
      return { ...prevTbl, seats, sessions };
    });
  };

  const tableElapsed = currentTable ? getTableElapsedSeconds(currentTable, nowMs) : 0;

  return (
    <div className="app-root">
      <div className="app-shell">
        <header className="app-header">
          <div className="app-header-main">
            <div className="app-title">
              <span>EVERWIN 撲克桌邊管理系統</span>
              <span className="app-title-badge">Poker Table Manager v5</span>
            </div>
            <div className="app-subtitle">
              多桌中央牌桌時間 + 9 座位上桌計時，適用於現場牌桌經理玩家時數與買碼紀錄。本機儲存：每台裝置各自獨立紀錄。
            </div>
          </div>
          <div className="app-header-right">
            <button
              type="button"
              className="lang-toggle-btn"
              onClick={() => setLang((prev) => (prev === 'zh' ? 'en' : 'zh'))}
            >
              {langToggleLabel}
            </button>
            <div className="today-text">
              {t.today}：{todayText}
            </div>
          </div>
        </header>

        <main className="app-body">
          <section className="left-panel">
            <div className="left-top-row">
              <div className="table-selector-group">
                <span className="label-pill">{t.tableLabel}</span>
                <select
                  className="table-select"
                  value={currentTableId}
                  onChange={(e) => setCurrentTableId(Number(e.target.value))}
                >
                  {tables.map((tbl) => (
                    <option key={tbl.id} value={tbl.id}>
                      {tbl.name}
                    </option>
                  ))}
                </select>

                <div className="table-tabs">
                  {tables.map((tbl) => (
                    <button
                      key={tbl.id}
                      type="button"
                      className={
                        'table-tab ' + (tbl.id === currentTableId ? 'table-tab-active' : '')
                      }
                      onClick={() => setCurrentTableId(tbl.id)}
                    >
                      {tbl.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="table-clock-wrapper">
              <div className="clock-title-row">
                <div className="clock-title">{currentTable?.name ?? 'Table 1'}</div>
                <div
                  className={
                    'clock-status-text ' + (currentTable?.isRunning ? '' : 'stopped')
                  }
                >
                  {currentTable?.isRunning ? t.running : t.stopped}
                </div>
              </div>
              <div className="clock-display">{formatHMS(tableElapsed)}</div>
              <div className="clock-meta-row">
                <span>
                  {t.openedAt}：{currentTable?.openedAt ?? '-'}
                </span>
                <span>
                  {t.closedAt}：{currentTable?.closedAt ?? '-'}
                </span>
                <span>
                  {t.currentTableTime}：{formatHMS(tableElapsed)}
                </span>
              </div>

              <div className="left-info-extra">
                <div className="info-row">
                  <span className="info-label">{t.blinds}</span>
                  <input
                    className="info-input"
                    value={currentTable?.blinds ?? ''}
                    placeholder={t.blindsPlaceholder}
                    onChange={(e) => handleBlindsChange(e.target.value)}
                  />
                </div>
              </div>

              <div className="clock-actions">
                <button
                  type="button"
                  className="btn-pill btn-green"
                  onClick={handleStartOrResume}
                >
                  {t.startOrResume}
                </button>
                <button
                  type="button"
                  className="btn-pill btn-yellow"
                  onClick={handlePause}
                >
                  {t.pause}
                </button>
                <button type="button" className="btn-pill btn-red" onClick={handleStop}>
                  {t.stop}
                </button>
              </div>

              <div className="csv-reset-row">
                <button
                  type="button"
                  className="btn-pill btn-outline"
                  onClick={handleExportCsv}
                >
                  {t.exportCsv}
                </button>
                <button
                  type="button"
                  className="btn-pill btn-outline"
                  onClick={handleResetTable}
                >
                  {t.resetTable}
                </button>
              </div>
            </div>
          </section>

          <section className="right-panel">
            <div className="seat-grid">
              {currentTable?.seats.map((seat) => {
                const activeSeconds = getSeatActiveSeconds(seat, nowMs);
                const restSeconds = getSeatRestSeconds(seat, nowMs);
                const statusLabel =
                  seat.status === 'idle'
                    ? t.statusIdle
                    : seat.status === 'seated'
                    ? t.statusSeated
                    : t.statusRest;
                const statusClass =
                  seat.status === 'idle'
                    ? 'status-idle'
                    : seat.status === 'seated'
                    ? 'status-seated'
                    : 'status-rest';

                return (
                  <div key={seat.id} className="seat-card">
                    <div className="seat-header">
                      <div>
                        <span className="seat-id">
                          {t.seat} {seat.id}
                        </span>
                      </div>
                      <div className={`seat-status-tag ${statusClass}`}>{statusLabel}</div>
                    </div>
                    <div className="seat-timer">{formatHMS(activeSeconds)}</div>
                    <div className="seat-meta">
                      <div>
                        <div className="meta-label">{t.todayTotal}</div>
                        <div className="meta-value">{formatHMS(activeSeconds)}</div>
                      </div>
                      <div>
                        <div className="meta-label">{t.restSeconds}</div>
                        <div className="meta-value">{restSeconds}</div>
                      </div>
                      <div>
                        <div className="meta-label">{t.buyIn}</div>
                        <div className="meta-value">{seat.buyInAmount}</div>
                      </div>
                      <div>
                        <div className="meta-label">{t.memberId}</div>
                        <div className="meta-value">{seat.memberId || '-'}</div>
                      </div>
                    </div>
                    <div className="seat-actions-row">
                      <div className="seat-actions">
                        <button
                          type="button"
                          className="seat-btn btn-xs-green"
                          onClick={() => handleSeatUp(seat.id)}
                        >
                          {t.btnSeat}
                        </button>
                        <button
                          type="button"
                          className="seat-btn btn-xs-yellow"
                          onClick={() => handleRest(seat.id)}
                        >
                          {t.btnRest}
                        </button>
                        <button
                          type="button"
                          className="seat-btn btn-xs-red"
                          onClick={() => handleLeave(seat.id)}
                        >
                          {t.btnLeave}
                        </button>
                      </div>
                      <button
                        type="button"
                        className="seat-btn btn-xs-yellow"
                        onClick={() => handleAddBuyIn(seat.id)}
                      >
                        {t.btnAddBuyIn}
                      </button>
                    </div>
                    <div className="seat-extra-row">
                      <input
                        className="member-input"
                        placeholder={t.memberId}
                        value={seat.memberId}
                        onChange={(e) => handleMemberChange(seat.id, e.target.value)}
                      />
                      <label className="batch-checkbox">
                        <input
                          type="checkbox"
                          checked={seat.selectedForBatch}
                          onChange={() => handleToggleBatchSeat(seat.id)}
                        />
                        {t.batchLabel}
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="app-footer-batch">
              <button
                type="button"
                className="seat-btn btn-xs-green"
                onClick={handleBatchSeat}
              >
                {t.btnBatchSeat}
              </button>
              <button
                type="button"
                className="seat-btn btn-xs-red"
                onClick={handleBatchLeave}
              >
                {t.btnBatchLeave}
              </button>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
};

export default App;
