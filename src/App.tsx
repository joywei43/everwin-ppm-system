import Queue from './Queue';
import MemberInput from './MemberInput';
import CashOutDialog, { CashOutSeat, CashOutResult } from './CashOutDialog';
import UpdateBanner from './UpdateBanner';
import LevelDialog, { GAME_TYPES, BLINDS } from './LevelDialog';
import { useCloudTables, CloudLogin, resolveMember, closeCheck, memberPhoto, MemberBrief } from './cloud';
import NameCheckDialog from './NameCheckDialog';
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
  cashOutAmount?: number | null;
  busted?: boolean;
}

export interface TableState {
  gameType: string;
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
    name: `T${[1,2,3,5][id-1]}`,
    gameType: 'NLH',
    blinds: '50 / 100',
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
  memberId: '會員號碼或暱稱',
  batchLabel: '批次',
  btnSeat: '上桌',
  btnRest: '休息',
  btnLeave: '下桌',
  btnAddBuyIn: '+ 加買',
  btnChangeSeat: '換位',
  btnChangeLevel: '換級別',
  promptChangeSeat: (who: string, here: string) => `${who} 目前在 ${here}。\n要換到幾號位？輸入 1–9。\n換到別桌請輸入桌號加位號，例如 T3 5`,
  badSeat: '請輸入 1–9 的位號，換桌請輸入例如 T3 5。',
  noSuchTable: (n: string) => `找不到 ${n} 這張桌。`,
  targetNotRunning: (n: string) => `${n} 還沒開桌，請先開桌再換過去。`,
  seatTaken: (where: string, who: string) => `${where} 已經有人（${who}），請選其他位置。`,
  confirmSwap: (a: string, ha: string, b: string, hb: string) => `${hb} 有人（${b}）。\n要把 ${a}（${ha}）和 ${b}（${hb}）對調位置嗎？\n兩人的時數和買碼都不變。`,
  promptMoveChips: (where: string) => `換到 ${where}。\n請輸入帶過去的總碼（玩家目前的籌碼）。`,
  btnBatchSeat: '批次上桌',
  btnBatchLeave: '批次下桌',
  tableHasPlayers: '仍有玩家在桌上（非休息），請先讓所有玩家下桌。',
  tableNotRunning: '請先運行開桌，再為玩家上桌。',
  needMemberId: '請先輸入名稱或會員號碼再上桌。',
  duplicateMember: '同一位會員已在本桌其他位置上桌，請先處理座位移動。',
  batchNoSelection: '請先勾選要批次操作的席次。',
  batchMissingMember: '批次上桌的每個席次都必須先輸入會員號。',
  batchPromptChips: '請輸入本次上桌每位玩家的買入籌碼（金額，可為 0）',
  invalidNumber: '請輸入正確的數字。',
  confirmMove: (memberId: string, fromSeat: number, toSeat: number) =>
    `⚠ ${memberId} 已經坐在 ${fromSeat} 號位。\n確定要把他移到 ${toSeat} 號位嗎？\n\n如果 ${toSeat} 號位是另一位客人，請按取消，確認名字後再上桌。`,
  confirmReset: '確定要重置本桌所有資料嗎？系統會先自動匯出一份 CSV。',
  closeCheckTitle: (tb: string) => `${tb} 關桌前請先確認：`,
  closeUnmatched: '沒有對到會員（請到後台 Unmatched PPM 連結）：',
  closeMissingCash: '還沒有結碼金額：',
  closeAnyway: '\n按「確定」照樣關桌，按「取消」先去處理。',
  batchUnknown: (names: string) => `下面的名字對不到會員：\n${names}\n\n按「確定」以訪客身分上桌，按「取消」回去改名字。`,
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
  csvHeaderCashOut: '結碼金額',
  csvHeaderWinLoss: '輸贏',
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
  memberId: 'Member no. or nickname',
  batchLabel: 'Batch',
  btnSeat: 'Seat',
  btnRest: 'Rest',
  btnLeave: 'Leave',
  btnAddBuyIn: '+ Chips',
  btnChangeSeat: 'Change Seat',
  btnChangeLevel: 'Change level',
  promptChangeSeat: (who: string, here: string) => `${who} is at ${here}.\nMove to which seat? Enter 1–9.\nFor another table, enter the table and seat, e.g. T3 5`,
  badSeat: 'Enter a seat 1–9, or a table and seat such as T3 5.',
  noSuchTable: (n: string) => `There is no table ${n}.`,
  targetNotRunning: (n: string) => `${n} is not open yet. Open it first.`,
  seatTaken: (where: string, who: string) => `${where} is taken (${who}). Choose another seat.`,
  confirmSwap: (a: string, ha: string, b: string, hb: string) => `${hb} is taken by ${b}.\nSwap ${a} (${ha}) and ${b} (${hb})?\nBoth keep their time and buy-in.`,
  promptMoveChips: (where: string) => `Moving to ${where}.\nEnter the total chips the player brings (their current stack).`,
  btnBatchSeat: 'Batch Seat',
  btnBatchLeave: 'Batch Leave',
  tableHasPlayers: 'There are still players seated (not resting). Please let them leave first.',
  tableNotRunning: 'Please start the table clock before seating players.',
  needMemberId: 'Please enter a name or member ID before seating.',
  duplicateMember: 'This member is already seated at another position. Please handle seat move first.',
  batchNoSelection: 'Please select seats for batch operation first.',
  batchMissingMember: 'Every batch seat must have a member ID.',
  batchPromptChips: 'Enter buy-in amount for each selected player (can be 0).',
  invalidNumber: 'Please enter a valid number.',
  confirmMove: (memberId: string, fromSeat: number, toSeat: number) =>
    `⚠ ${memberId} is already at Seat ${fromSeat}.\nMove them to Seat ${toSeat}?\n\nIf Seat ${toSeat} is a different player, press Cancel and check the name.`,
  confirmReset: 'Reset this table and clear all data? A CSV will be exported first.',
  closeCheckTitle: (tb: string) => `Before closing ${tb}, please check:`,
  closeUnmatched: 'Not matched to a member (link them in Unmatched PPM):',
  closeMissingCash: 'No cash-out yet:',
  closeAnyway: '\nOK = close anyway, Cancel = fix first.',
  batchUnknown: (names: string) => `These names are not members:\n${names}\n\nOK = seat them as guests, Cancel = fix the names.`,
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
  csvHeaderCashOut: 'Cash-out',
  csvHeaderWinLoss: 'Win/Loss',
  csvSummaryTotalBuyIn: 'Total Buy-in',
  csvSummaryUniquePlayers: 'Unique Members',
  csvSummaryTotalSessions: 'Total Sessions',
};

const App: React.FC = () => {
  const cloud = useCloudTables(() => Array.from({length:4},(_,i)=>createInitialTable(i+1)));
  const { tables, setTables } = cloud;
  const [currentTableId, setCurrentTableId] = useState(1);
  const [lang, setLang] = useState<Lang>('zh');
  const [nowMs, setNowMs] = useState(Date.now());
  const [names, setNames] = useState<Record<string,string>>({});
  const [levelOpen, setLevelOpen] = useState(false);
  const [cashOut, setCashOut] = useState<null | { seats: CashOutSeat[]; onConfirm: (r: Record<number, CashOutResult>) => void }>(null);
  const withNames = (tbl: TableState): TableState => ({...tbl,seats:tbl.seats.map(seat=>seat.status === 'idle' ? {...seat,memberId:names[tbl.id+':'+seat.id] ?? seat.memberId}:seat)});

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
  const currentTable = withNames(tables[currentTableIndex] ?? tables[0]);

  const updateTable = (tableId: number, updater: (t: TableState) => TableState) => {
    setTables((prev) => prev.map((tbl) => (tbl.id === tableId ? updater(withNames(tbl)) : tbl)));
  };

  const hasActivePlayers = (tbl: TableState): boolean =>
    tbl.seats.some((s) => s.status !== 'idle');

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
      t.csvHeaderCashOut,
      t.csvHeaderWinLoss,
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
      row.cashOutAmount == null ? '' : (row.busted ? '0 (Busted)' : row.cashOutAmount.toString()),
      row.cashOutAmount == null || row.buyInAmount == null ? '' : (row.cashOutAmount - row.buyInAmount).toString(),
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

  const handleStop = async () => {
    if (!currentTable) return;
    if (hasActivePlayers(currentTable)) {
      window.alert(t.tableHasPlayers);
      return;
    }
    const check = await closeCheck(currentTable.name);
    if (check && (check.unmatched.length || check.missing_cash_out.length)) {
      const lines = [t.closeCheckTitle(currentTable.name)];
      if (check.unmatched.length) lines.push('', t.closeUnmatched, ...check.unmatched.map((x) => `· ${t.seat} ${x.seat}: ${x.ref}`));
      if (check.missing_cash_out.length) lines.push('', t.closeMissingCash, ...check.missing_cash_out.map((x) => `· ${t.seat} ${x.seat}: ${x.ref}`));
      lines.push(t.closeAnyway);
      if (!window.confirm(lines.join('\n'))) return;
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
      blinds: value.trim().replace(/\s*[-/]\s*/g, ' / '),
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
    setNames(prev=>({...prev,[currentTableId+':'+seatId]:value}));
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
    cashOut?: CashOutResult,
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
      ...(cashOut ? { cashOutAmount: cashOut.amount, busted: cashOut.busted } : {}),
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

  // Seat-up asks first when the typed name is not a member (typos like "NSH" for NASH).
  const [nameCheck, setNameCheck] = useState<null | { ref: string; suggestions: MemberBrief[]; done: (v: string | null) => void }>(null);
  const askName = (ref: string, suggestions: MemberBrief[]) => new Promise<string | null>((done) => setNameCheck({ ref, suggestions, done }));
  const handleSeatUp = async (seatId: number) => {
    if (!currentTable) return;
    const tbl = currentTable;
    const seat = tbl.seats.find((s) => s.id === seatId);
    if (!seat || seat.status !== 'idle' || !tbl.isRunning || !seat.memberId.trim()) { seatUp(seatId); return; }
    let name = seat.memberId.trim();
    const r = await resolveMember(name);
    if (r && !r.member) {
      const choice = await askName(name, r.suggestions);
      if (choice === null) return;
      if (choice !== '\u0000guest') { name = choice; setNames((prev) => ({ ...prev, [tbl.id + ':' + seatId]: choice })); }
    }
    seatUp(seatId, name);
  };
  const seatUp = (seatId: number, nameOverride?: string) => {
    if (!currentTable) return;
    const tbl = currentTable;

    if (!tbl.isRunning) {
      window.alert(t.tableNotRunning);
      return;
    }

    const seat = tbl.seats.find((s) => s.id === seatId);
    if (!seat) return;

    const memberId = (nameOverride ?? seat.memberId).trim();
    if (!memberId) {
      window.alert(t.needMemberId);
      return;
    }

    if (seat.status === 'seated') return;
    let buyIn = seat.buyInAmount;
    if (seat.status === 'idle') {
      const raw = window.prompt(lang === 'zh' ? '請輸入買碼金額（PHP，可為 0）' : 'Enter buy-in amount (PHP, can be 0)', '0');
      if (raw === null) return;
      if (!raw.trim() || !Number.isFinite(Number(raw)) || Number(raw) < 0) { window.alert(t.invalidNumber); return; }
      buyIn = Number(raw);
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
            memberId,
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
          memberId,
          buyInAmount: buyIn,
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

  // Leaving asks for the cash-out amount (or Busted) before the session is written.
  const leaveSeats = (tableId: number, results: Record<number, CashOutResult>) => {
    const now = Date.now();
    const endTimeStr = formatDateTime(new Date());
    setNames(prev => { const next = { ...prev }; Object.keys(results).forEach((id) => { next[tableId + ':' + id] = ''; }); return next; });
    updateTable(tableId, (tbl) => {
      const sessions: SessionRow[] = [...tbl.sessions];
      const seats = tbl.seats.map((s) => {
        const r = results[s.id];
        if (!r || s.status === 'idle') return s;
        const session = appendSessionRow(tbl, s, endTimeStr, now, r);
        if (session) sessions.push(session);
        return clearSeat(s);
      });
      return { ...tbl, seats, sessions };
    });
  };

  const handleLeave = (seatId: number) => {
    if (!currentTable) return;
    const leaving = currentTable.seats.find(s=>s.id===seatId);
    if (!leaving || leaving.status === 'idle') return;
    const tableId = currentTable.id;
    setCashOut({ seats: [{ id: leaving.id, memberId: leaving.memberId, buyInAmount: leaving.buyInAmount }], onConfirm: (r) => leaveSeats(tableId, r) });
  };

  // Change Seat: the session continues at the new seat (same start time, play time and buy-in), on this table or another open table.
  const handleChangeSeat = (seatId: number) => {
    if (!currentTable) return;
    const from = currentTable;
    const seat = from.seats.find((s) => s.id === seatId);
    if (!seat || seat.status === 'idle') return;
    const here = `${from.name} #${seat.id}`;
    const raw = window.prompt(t.promptChangeSeat(seat.memberId, here), '');
    if (raw == null || !raw.trim()) return;
    const m = /^\s*(?:([A-Za-z]*\d+)\s*[-#\s/]\s*)?(\d)\s*$/.exec(raw);
    if (!m || Number(m[2]) < 1 || Number(m[2]) > 9) { window.alert(t.badSeat); return; }
    const tableKey = m[1] ? m[1].toUpperCase() : '';
    const to = !tableKey ? from : tables.find((tb) => tb.name.toUpperCase() === tableKey || tb.name.toUpperCase() === 'T' + tableKey);
    if (!to) { window.alert(t.noSuchTable(tableKey)); return; }
    const toSeatId = Number(m[2]);
    if (to.id === from.id && toSeatId === seat.id) return;
    if (!to.isRunning) { window.alert(t.targetNotRunning(to.name)); return; }
    const target = to.seats.find((s) => s.id === toSeatId)!;
    const there = `${to.name} #${toSeatId}`;
    const sameTable = to.id === from.id;
    if (target.status !== 'idle') {
      // Same table: offer to swap the two players; each keeps their own time and buy-in.
      if (!sameTable) { window.alert(t.seatTaken(there, target.memberId)); return; }
      if (!window.confirm(t.confirmSwap(seat.memberId, here, target.memberId, there))) return;
      setNames((prev) => ({ ...prev, [from.id + ':' + seat.id]: '', [from.id + ':' + toSeatId]: '' }));
      setTables((prev) => prev.map((tb) => {
        if (tb.id !== from.id) return tb;
        const a = tb.seats.find((x) => x.id === seat.id), b = tb.seats.find((x) => x.id === toSeatId);
        if (!a || !b || a.status === 'idle' || b.status === 'idle') return tb;
        return { ...tb, seats: tb.seats.map((x) => x.id === seat.id ? { ...b, id: seat.id, selectedForBatch: false } : x.id === toSeatId ? { ...a, id: toSeatId, selectedForBatch: false } : x) };
      }));
      return;
    }
    // Another table: the player cashes out here with their stack and buys in there with the same chips,
    // so each table's records are right and the member's overall W/L still adds up.
    let stack = 0;
    if (!sameTable) {
      const chipsRaw = window.prompt(t.promptMoveChips(there), '');
      if (chipsRaw == null) return;
      stack = Number(chipsRaw.replace(/[,\s]/g, ''));
      if (!chipsRaw.trim() || !Number.isFinite(stack) || stack < 0) { window.alert(t.invalidNumber); return; }
      stack = Math.round(stack);
    }
    setNames((prev) => ({ ...prev, [to.id + ':' + toSeatId]: '', [from.id + ':' + seat.id]: '' }));
    setTables((prev) => {
      const fromTbl = prev.find((tb) => tb.id === from.id);
      const live = fromTbl?.seats.find((s) => s.id === seat.id);
      const dest = prev.find((tb) => tb.id === to.id)?.seats.find((s) => s.id === toSeatId);
      if (!fromTbl || !live || live.status === 'idle' || !dest || dest.status !== 'idle') return prev;
      const now = Date.now();
      let closed: SessionRow | null = null;
      let moved: SeatState;
      if (sameTable) {
        moved = { ...live, id: toSeatId, selectedForBatch: false };
      } else {
        closed = appendSessionRow(fromTbl, live, formatDateTime(new Date(now)), now, { amount: stack, busted: false });
        moved = { ...clearSeat(dest), id: toSeatId, memberId: live.memberId, status: 'seated', lastActiveStart: now, buyInAmount: stack, sessionStart: formatDateTime(new Date(now)) };
      }
      return prev.map((tb) => {
        if (tb.id !== from.id && tb.id !== to.id) return tb;
        return { ...tb, sessions: tb.id === from.id && closed ? [...tb.sessions, closed] : tb.sessions, seats: tb.seats.map((s) => {
          if (tb.id === to.id && s.id === toSeatId) return moved;
          if (tb.id === from.id && s.id === seat.id) return clearSeat(s);
          return s;
        }) };
      });
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

  const handleBatchSeat = async () => {
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
    const idleNames = selected.filter((s) => s.status === 'idle').map((s) => ({ seat: s.id, name: s.memberId.trim() }));
    const unknown: string[] = [];
    for (const x of idleNames) {
      const r = await resolveMember(x.name);
      if (r && !r.member) unknown.push(`${t.seat} ${x.seat}: ${x.name}${r.suggestions[0] ? ` → ${r.suggestions[0].nickname || r.suggestions[0].name} (${r.suggestions[0].member_no})?` : ''}`);
    }
    if (unknown.length && !window.confirm(t.batchUnknown(unknown.join('\n')))) return;
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
    setCashOut({ seats: selected.map((s) => ({ id: s.id, memberId: s.memberId, buyInAmount: s.buyInAmount })), onConfirm: (r) => leaveSeats(tbl.id, r) });
  };

  const tableElapsed = currentTable ? getTableElapsedSeconds(currentTable, nowMs) : 0;

  if (!cloud.ready) return <CloudLogin cloud={cloud} />;
  return (
    <div className="app-root">
      <div role="status">{cloud.message} <button onClick={cloud.logout}>Sign out</button></div>
      <UpdateBanner lang={lang} />
      {cloud.notice && <div className={'sync-notice ' + cloud.notice.kind} role="status">{cloud.notice.text}</div>}
      {levelOpen && currentTable && <LevelDialog table={currentTable.name} gameType={currentTable.gameType} blinds={currentTable.blinds} lang={lang} onCancel={() => setLevelOpen(false)}
        onConfirm={(g, b) => { const id = currentTable.id; setLevelOpen(false); updateTable(id, (tb) => ({ ...tb, gameType: g, blinds: b })); }} />}
      {nameCheck && <NameCheckDialog refName={nameCheck.ref} suggestions={nameCheck.suggestions} lang={lang}
        onPick={(label) => { const d = nameCheck.done; setNameCheck(null); d(label); }} onGuest={() => { const d = nameCheck.done; setNameCheck(null); d('\u0000guest'); }} onCancel={() => { const d = nameCheck.done; setNameCheck(null); d(null); }} />}
      {cashOut && <CashOutDialog seats={cashOut.seats} lang={lang} onCancel={() => setCashOut(null)} onConfirm={(r) => { const done = cashOut.onConfirm; setCashOut(null); done(r); }} />}
      <fieldset disabled={cloud.busy} style={{border:0,padding:0,margin:0}}>
      <div className="app-shell">
        <header className="app-header">
          <div className="app-header-main">
            <div className="app-title">
              <span>EVERWIN 撲克桌邊管理系統</span>
              <span className="app-title-badge">Poker Table Manager · Online</span>
            </div>
            <div className="app-subtitle">
              多桌中央牌桌時間 + 9 座位上桌計時，適用於現場牌桌經理玩家時數與買碼紀錄。雲端同步 · Live Update 自動更新。
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
                  <select className="info-input" aria-label={t.blinds} disabled={currentTable.isRunning} value={currentTable.gameType} onChange={e=>updateTable(currentTable.id,t=>({...t,gameType:e.target.value}))}>{GAME_TYPES.map(v=><option key={v}>{v}</option>)}</select>
                  <select className="info-input" aria-label={t.blinds} disabled={currentTable.isRunning} value={currentTable.blinds} onChange={e=>handleBlindsChange(e.target.value)}>{BLINDS.map(v=><option key={v}>{v}</option>)}</select>
                  <button type="button" className="seat-btn btn-xs-yellow level-btn" onClick={()=>setLevelOpen(true)}>{t.btnChangeLevel}</button>
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
                      {seat.status !== 'idle' && <SeatPhoto memberId={seat.memberId} rest={seat.status === 'rest'} />}
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
                    </div>
                    {seat.status !== 'idle' && (
                      <div className="seat-mini-row">
                        <button type="button" className="seat-mini" onClick={() => handleChangeSeat(seat.id)}>
                          ⇄ {t.btnChangeSeat}
                        </button>
                        <button type="button" className="seat-mini" onClick={() => handleAddBuyIn(seat.id)}>
                          {t.btnAddBuyIn}
                        </button>
                      </div>
                    )}
                    <div className="seat-extra-row">
                      <MemberInput
                        placeholder={t.memberId}
                        value={seat.memberId}
                        disabled={seat.status !== 'idle'}
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
        <Queue />
      </div>
      </fieldset>
    </div>
  );
};

export default App;

// Member photo on an occupied seat card, so staff can match the face to the seat.
function SeatPhoto(props: { memberId: string; rest: boolean }) {
  const m = /\((?:EV-?)?(\d{6})\)\s*$/i.exec(props.memberId) || /^(?:EV-?)?(\d{6})$/i.exec(props.memberId.trim());
  const no = m ? 'EV-' + m[1] : '';
  const [src, setSrc] = React.useState<string | null>(null);
  React.useEffect(() => { let live = true; setSrc(null); if (no) memberPhoto(no).then((p) => { if (live) setSrc(p); }); return () => { live = false; }; }, [no]);
  if (!src) return null;
  return <img className={'seat-photo' + (props.rest ? ' rest' : '')} src={src} alt="" />;
}
