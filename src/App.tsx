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
  buyIn: number;
  joinCount: number;
  selectedForBatch: boolean;
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
}

const TABLE_COUNT = 4;
const SEATS_PER_TABLE = 9;
const STORAGE_KEY = 'everwin_poker_tables_v3';

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
  const ampm = d.getHours() >= 12 ? '下午' : '上午';
  return `${y}/${m}/${day} ${ampm}${h}:${min}:${sec}`;
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
    buyIn: 0,
    joinCount: 0,
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
  };
}

function loadInitialTables(): TableState[] {
  if (typeof window === 'undefined') return Array.from({ length: TABLE_COUNT }, (_, i) => createInitialTable(i + 1));
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return Array.from({ length: TABLE_COUNT }, (_, i) => createInitialTable(i + 1));
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
  stop: '關桌',
  exportCsv: '匯出本局 CSV',
  resetTable: 'Reset 本桌',
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
  todayTotal: '今日總上桌',
  todayCount: '今日上桌次數',
  restSeconds: '休息秒數',
  buyIn: '買碼',
  memberId: '會員ID',
  batchLabel: '批次選取',
  btnSeat: '上桌',
  btnRest: '休息',
  btnLeave: '下桌',
  btnAddBuyIn: '加買籌碼',
  tableHasPlayers: '仍有玩家在桌上（非休息），請先讓所有玩家下桌。',
  tableNotRunning: '請先運行開桌，再為玩家上桌。',
  needMemberId: '請先輸入會員號碼再上桌。',
  duplicateMember: '同一位會員已在其他位置上桌，請確認。',
  batchNoSelection: '請先勾選要批次上桌的席次。',
  batchMissingMember: '批次上桌的每個席次都必須先輸入會員號。',
  batchPromptChips: '請輸入本次上桌每位玩家的買入籌碼（金額，可為 0）',
  invalidNumber: '請輸入正確的數字。',
};

const enTexts = {
  tableLabel: 'Table',
  running: 'Running',
  stopped: 'Stopped',
  startOrResume: 'Start / Resume',
  pause: 'Pause',
  stop: 'Close Table',
  exportCsv: 'Export CSV',
  resetTable: 'Reset Table',
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
  todayTotal: 'Total Seated Today',
  todayCount: 'Seat Count Today',
  restSeconds: 'Rest Seconds',
  buyIn: 'Buy-in',
  memberId: 'Member ID',
  batchLabel: 'Batch',
  btnSeat: 'Seat',
  btnRest: 'Rest',
  btnLeave: 'Leave',
  btnAddBuyIn: 'Add Chips',
  tableHasPlayers: 'There are still players seated (not resting). Please let them leave first.',
  tableNotRunning: 'Please start the table clock before seating players.',
  needMemberId: 'Please enter a member ID before seating.',
  duplicateMember: 'This member is already seated at another position.',
  batchNoSelection: 'Please select seats for batch seating first.',
  batchMissingMember: 'Every batch seat must have a member ID.',
  batchPromptChips: 'Enter buy-in amount for each selected player (can be 0).',
  invalidNumber: 'Please enter a valid number.',
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

  const currentTableIndex = useMemo(
    () => tables.findIndex((t) => t.id === currentTableId) ?? 0,
    [tables, currentTableId],
  );
  const currentTable = tables[currentTableIndex] ?? tables[0];

  const langToggleLabel = lang === 'zh' ? 'English' : '中文';

  const updateTable = (tableId: number, updater: (t: TableState) => TableState) => {
    setTables((prev) => prev.map((tbl) => (tbl.id === tableId ? updater(tbl) : tbl)));
  };

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

  const hasActivePlayers = (tbl: TableState): boolean =>
    tbl.seats.some((s) => s.status === 'seated');

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

  const exportCsvForTable = (tbl: TableState, closedAtOverride?: string) => {
    const closedAt = closedAtOverride ?? tbl.closedAt ?? '';
    const elapsed = getTableElapsedSeconds(tbl, nowMs);
    const headerLines = [
      ['Table', tbl.name],
      ['Date', todayText],
      ['Blinds', tbl.blinds ?? ''],
      [t.openedAt, tbl.openedAt ?? ''],
      [t.closedAt, closedAt],
      [t.currentTableTime, formatHMS(elapsed)],
      [''],
    ];

    const columns = [
      lang === 'zh' ? '日期' : 'Date',
      'Seat',
      lang === 'zh' ? '會員號碼' : 'Member ID',
      lang === 'zh' ? '上桌時間(秒)' : 'Active Seconds',
      lang === 'zh' ? '休息秒數' : 'Rest Seconds',
      lang === 'zh' ? '時長(格式)' : 'Duration (H:M:S)',
      lang === 'zh' ? '買碼' : 'Buy-in',
      lang === 'zh' ? '上桌次數' : 'Seat Count',
    ];

    const rows = tbl.seats.map((seat) => {
      const active = getSeatActiveSeconds(seat, nowMs);
      const rest = getSeatRestSeconds(seat, nowMs);
      const duration = formatHMS(active);
      return [
        todayText,
        seat.id.toString(),
        seat.memberId,
        active.toString(),
        rest.toString(),
        duration,
        seat.buyIn.toString(),
        seat.joinCount.toString(),
      ];
    });

    const allLines = [...headerLines, columns, ...rows];
    const csvContent = allLines
      .map((line) => line.map((v) => `"${(v ?? '').replace(/"/g, '""')}"`).join(','))
      .join('
');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const fileName = `PokerSessions_${todayText.replace(/-/g, '')}_${tbl.name.replace(/\s+/g, '')}.csv`;
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
    const tableSnapshot: TableState = {
      ...currentTable,
      elapsedSeconds: getTableElapsedSeconds(currentTable, now),
      closedAt: closedAtStr,
    };
    exportCsvForTable(tableSnapshot, closedAtStr);

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
    exportCsvForTable(currentTable);
  };

  const handleResetTable = () => {
    if (!currentTable) return;
    if (!window.confirm('確定要重置本桌所有資料嗎？This will clear all data for this table.')) return;
    updateTable(currentTable.id, (tbl) => createInitialTable(tbl.id));
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

  const checkDuplicateMember = (tbl: TableState, seatId: number, memberId: string): boolean => {
    if (!memberId) return false;
    return tbl.seats.some(
      (s) =>
        s.id !== seatId &&
        s.memberId === memberId &&
        (s.status === 'seated' || s.status === 'rest'),
    );
  };

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

    if (checkDuplicateMember(tbl, seatId, memberId)) {
      window.alert(t.duplicateMember);
      return;
    }

    const now = Date.now();
    updateTable(tbl.id, (prevTbl) => {
      const seats = prevTbl.seats.map((s) => {
        if (s.id !== seatId) return s;
        if (s.status === 'seated') return s;
        let activeSeconds = s.activeSeconds;
        let restSeconds = s.restSeconds;
        let joinCount = s.joinCount;
        if (s.status === 'rest' && s.lastRestStart != null) {
          const delta = Math.floor((now - s.lastRestStart) / 1000);
          restSeconds += Math.max(0, delta);
        }
        if (s.status === 'idle') {
          joinCount = s.joinCount + 1;
          activeSeconds = 0;
          restSeconds = 0;
        }
        return {
          ...s,
          status: 'seated' as SeatStatus,
          lastActiveStart: now,
          lastRestStart: null,
          activeSeconds,
          restSeconds,
          joinCount,
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
    updateTable(currentTable.id, (tbl) => {
      const seats = tbl.seats.map((s) => {
        if (s.id !== seatId) return s;
        let activeSeconds = s.activeSeconds;
        let restSeconds = s.restSeconds;
        if (s.status === 'seated' && s.lastActiveStart != null) {
          const delta = Math.floor((now - s.lastActiveStart) / 1000);
          activeSeconds += Math.max(0, delta);
        } else if (s.status === 'rest' && s.lastRestStart != null) {
          const delta = Math.floor((now - s.lastRestStart) / 1000);
          restSeconds += Math.max(0, delta);
        }
        return {
          ...s,
          status: 'idle' as SeatStatus,
          lastActiveStart: null,
          lastRestStart: null,
          activeSeconds,
          restSeconds,
          selectedForBatch: false,
          memberId: '',
        };
      });
      return { ...tbl, seats };
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
        s.id === seatId ? { ...s, buyIn: s.buyIn + Math.max(0, amt) } : s,
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
      if (checkDuplicateMember(tbl, s.id, s.memberId.trim())) {
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
      const seats = prevTbl.seats.map((s) => {
        if (!s.selectedForBatch) return s;
        if (s.status === 'seated') return s;
        let activeSeconds = s.activeSeconds;
        let restSeconds = s.restSeconds;
        let joinCount = s.joinCount;
        if (s.status === 'rest' && s.lastRestStart != null) {
          const delta = Math.floor((now - s.lastRestStart) / 1000);
          restSeconds += Math.max(0, delta);
        }
        if (s.status === 'idle') {
          joinCount = s.joinCount + 1;
          activeSeconds = 0;
          restSeconds = 0;
        }
        return {
          ...s,
          status: 'seated' as SeatStatus,
          lastActiveStart: now,
          lastRestStart: null,
          activeSeconds,
          restSeconds,
          joinCount,
          buyIn: s.buyIn + buyInDelta,
        };
      });
      return { ...prevTbl, seats };
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
              <span className="app-title-badge">Poker Table Manager</span>
            </div>
            <div className="app-subtitle">
              多桌中央牌桌時間 + 9 座位上桌計時，適用於現場牌桌經理玩家時數與買碼籌碼紀錄。本機儲存：每台裝置各自獨立紀錄。
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
                        <div className="meta-label">{t.todayCount}</div>
                        <div className="meta-value">{seat.joinCount}</div>
                      </div>
                      <div>
                        <div className="meta-label">{t.restSeconds}</div>
                        <div className="meta-value">{restSeconds}</div>
                      </div>
                      <div>
                        <div className="meta-label">{t.buyIn}</div>
                        <div className="meta-value">{seat.buyIn}</div>
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
                {lang === 'zh' ? '批次上桌' : 'Batch Seat'}
              </button>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
};

export default App;
