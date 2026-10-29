import { useEffect, useRef, useState } from 'react';
import {
  FU_OPTS,
  baseOf,
  tierName,
  rup,
  settleRon,
  settleTsumo,
  settleNoten,
  settleChombo,
  advance,
  finalScores,
  shouldEnd,
  type Mode,
  type RoundContext,
  type Outcome,
  type RonWinner,
  type SettleItem,
} from '@riichi/rules';
import { UMA_OPTIONS, RULE_FIELDS, toRuleSnapshot, umaArray, CUSTOM_UMA } from '../ruleConfig';
import { games, players, me, type AuthUser } from '../api';

const SEATS: Record<Mode, [string, number][]> = {
  4: [['top', 180], ['left', 90], ['bottom', 0], ['right', -90]],
  3: [['top', 180], ['left', 90], ['right', -90]],
  2: [['top', 180], ['bottom', 0]],
};
const WIND: Record<Mode, string[]> = { 4: ['東', '南', '西', '北'], 3: ['東', '南', '西'], 2: ['東', '西'] };
const POS_LABEL: Record<string, string> = { top: '上', left: '左', bottom: '下', right: '右' };
const MODE_LABEL: Record<Mode, string> = { 4: '四人', 3: '三人', 2: '二人' };
const NAMES = ['张三', '李四', '王五', '赵六'];
const AMOUNTS = [8000, 12000, 16000, 24000, 32000];

const honbaStick = (m: Mode) => (m === 3 ? 200 : 300);
const HAN_MIN_OPTIONS = ['一番缚', '二番缚', '三番缚', '四番缚', '五番缚'];

type SheetType = '荣和' | '自摸' | '流局' | '罚符';

function useRolling(value: number) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    prevRef.current = value;
    if (from === to) return;
    const start = performance.now();
    const dur = 1000;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return display;
}

function RollingNumber({ value }: { value: number }) {
  const display = useRolling(value);
  return <>{display}</>;
}

function Diff({ value }: { value: number }) {
  const display = useRolling(value);
  return <span className="diff">{display > 0 ? `+${display}` : display}</span>;
}

const DICE_DOTS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [[0.25, 0.25], [0.75, 0.75]],
  3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
  4: [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]],
  5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]],
  6: [[0.25, 0.25], [0.25, 0.5], [0.25, 0.75], [0.75, 0.25], [0.75, 0.5], [0.75, 0.75]],
};

function Die({ value, rolling }: { value: number; rolling: boolean }) {
  return (
    <span className={`die ${rolling ? 'rolling' : ''}`}>
      {DICE_DOTS[value].map(([x, y], i) => (
        <span key={i} className="dot" style={{ left: `${x * 100}%`, top: `${y * 100}%` }} />
      ))}
    </span>
  );
}
interface SeatState { name: string; points: number; }
interface SheetState {
  type: SheetType;
  angle: number;
  han: number;
  fu: number;
  ronWinners: RonWinner[];
  discarder: number | null;
  winner: number | null;
  sub: '不听罚符' | '途中流局' | '流局满贯';
  tenpai: boolean[];
  chombo: number | null;
  amount: number;
  dealerTenpai: boolean;
}

export default function Score({ user, resume, onResumeDone, onShowNav, onGameStateChange }: { user: AuthUser | null; resume?: any | null; onResumeDone?: () => void; onShowNav: () => void; onGameStateChange: (started: boolean) => void }) {
  const [mode, setMode] = useState<Mode>(4);
  const [seats, setSeats] = useState<SeatState[]>(() => NAMES.slice(0, 4).map((name) => ({ name, points: 25000 })));
  const [dealer, setDealer] = useState(0);
  const [initialDealer, setInitialDealer] = useState(0);
  const [honba, setHonba] = useState(0);
  const [wind, setWind] = useState(0);
  const [hand, setHand] = useState(1);
  const [riichi, setRiichi] = useState<Set<number>>(new Set());
  const [pot, setPot] = useState(0);
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [game, setGame] = useState<any | null>(null);
  const [seq, setSeq] = useState(1);
  const [saveMsg, setSaveMsg] = useState('');
  const [gameOver, setGameOver] = useState(false);
  const [endConfirm, setEndConfirm] = useState(false);
  const [setup, setSetup] = useState<{ names: string[]; selections: (string | null)[]; startPoints: number[] } | null>(null);
  const [allPlayers, setAllPlayers] = useState<any[]>([]);
  const [rule, setRule] = useState<Record<string, any>>(() => ({ ...RULE_FIELDS[4] }));
  const [started, setStarted] = useState(false);
  const [handLog, setHandLog] = useState<{ seq: number; label: string; deltas: number[] }[]>([]);
  const [endInfo, setEndInfo] = useState<{ raw: number[]; results: { score: number; rank: number }[] } | null>(null);
  const [dice, setDice] = useState({ a: 1, b: 1 });
  const [rolling, setRolling] = useState(false);

  useEffect(() => {
    if (!resume) return;
    const ls = resume.liveState ?? {};
    const base = resume.mode === 2 ? 50000 : 25000;
    setMode(resume.mode as Mode);
    setSeats(resume.participants.map((p: any, i: number) => ({
      name: p.tempName ?? p.player?.name ?? NAMES[i] ?? `玩家${i + 1}`,
      points: ls.points?.[i] ?? base,
    })));
    setDealer(ls.dealer ?? 0);
    setInitialDealer(ls.initialDealer ?? ls.dealer ?? 0);
    setHonba(ls.honba ?? 0);
    setWind(ls.wind ?? 0);
    setHand(ls.hand ?? 1);
    setPot(ls.pot ?? 0);
    setSeq(ls.seq ?? 1);
    setRiichi(new Set());
    setGame(resume);
    setStarted(true);
    setHandLog([]);
    setEndInfo(null);
    setGameOver(false);
    setSaveMsg('已恢复进行中的牌局');
    onResumeDone?.();
  }, [resume]);

  useEffect(() => { onGameStateChange(started); }, [started]);

  const n = mode;
  const seatsActive = seats.slice(0, n);

  const applyDeltas = (deltas: number[]) =>
    setSeats((s) => s.map((x, i) => ({ ...x, points: x.points + (deltas[i] ?? 0) })));

  const toggleRiichi = (i: number) => {
    if (riichi.has(i)) {
      setRiichi((r) => { const n = new Set(r); n.delete(i); return n; });
      setPot((p) => p - 1);
      setSeats((s) => s.map((x, idx) => (idx === i ? { ...x, points: x.points + 1000 } : x)));
    } else {
      setRiichi((r) => new Set(r).add(i));
      setPot((p) => p + 1);
      setSeats((s) => s.map((x, idx) => (idx === i ? { ...x, points: x.points - 1000 } : x)));
    }
  };

  const rollDice = () => {
    if (rolling) return;
    setRolling(true);
    const endA = 1 + Math.floor(Math.random() * 6);
    const endB = 1 + Math.floor(Math.random() * 6);
    let count = 0;
    const id = window.setInterval(() => {
      setDice({ a: 1 + Math.floor(Math.random() * 6), b: 1 + Math.floor(Math.random() * 6) });
      if (++count >= 10) {
        window.clearInterval(id);
        setDice({ a: endA, b: endB });
        setRolling(false);
      }
    }, 90);
  };

  const reset = (m: Mode) => {
    setMode(m);
    setSeats(NAMES.slice(0, m).map((name) => ({ name, points: m === 2 ? 50000 : 25000 })));
    setDealer(0); setInitialDealer(0); setHonba(0); setWind(0); setHand(1);
    setRiichi(new Set()); setPot(0); setGame(null); setSeq(1); setSaveMsg('');
    setRule({ ...RULE_FIELDS[m] }); setGameOver(false);
    setStarted(false); setHandLog([]); setEndInfo(null);
  };

  const openSetup = async () => {
    setGameOver(false);
    if (user) {
      try { setAllPlayers(await players.list()); } catch { /* ignore */ }
      try {
        const saved = await me.rules();
        const s = saved?.[String(mode)];
        if (s) setRule({ ...RULE_FIELDS[mode], ...(s as any) });
      } catch { /* ignore */ }
    }
    setSetup({ names: Array(mode).fill(''), selections: Array(mode).fill(null), startPoints: Array(mode).fill(Number(rule.startPoints) || 25000) });
  };

  const startGameFromSetup = async (dealerIdx: number) => {
    if (!setup) return;
    const startPoints = setup.startPoints;
    const names = setup.names.map((name, i) => name || `玩家${i + 1}`);
    const participants = setup.names.map((name, i) => {
      const sel = setup.selections[i];
      const p = sel ? allPlayers.find((x) => x.id === sel) : null;
      return p ? { seat: i, playerId: p.id } : { seat: i, tempName: name || `玩家${i + 1}` };
    });
    const freshLive = { dealer: dealerIdx, initialDealer: dealerIdx, honba: 0, wind: 0, hand: 1, points: startPoints, pot: 0, seq: 1 };
    // 本地开局（游客与登录通用）
    setSeats(names.map((name, i) => ({ name, points: startPoints[i] })));
    setDealer(dealerIdx); setInitialDealer(dealerIdx); setHonba(0); setWind(0); setHand(1);
    setRiichi(new Set()); setPot(0); setSeq(1);
    setHandLog([]); setGameOver(false); setEndInfo(null); setStarted(true);
    setSaveMsg(''); setSetup(null);
    if (user) {
      try {
        const g = await games.create({ mode, ruleSnapshot: toRuleSnapshot(rule), liveState: freshLive, participants });
        setGame(g);
      } catch (e) { setSaveMsg((e as Error).message); }
    }
  };

  const computeEnd = () => {
    const raw = seatsActive.map((s) => s.points);
    // 完场剩余供托归第一名
    const topIdx = raw.indexOf(Math.max(...raw));
    const adjusted = raw.map((r, i) => (i === topIdx ? r + pot * 1000 : r));
    const results = finalScores(adjusted, toRuleSnapshot(rule), initialDealer);
    return { raw: adjusted, results };
  };

  const resetToStart = () => {
    setStarted(false); setGame(null); setGameOver(false); setEndInfo(null); setHandLog([]); setSaveMsg('');
  };

  const finishGame = async () => {
    if (!game) return;
    try {
      const end = endInfo ?? computeEnd();
      await games.finish(game.id, {
        status: 'FINISHED',
        participants: game.participants.map((p: any, i: number) => ({
          id: p.id, finalRawScore: end.raw[i], finalScore: end.results[i].score, rank: end.results[i].rank,
        })),
      });
      resetToStart();
    } catch (e) { setSaveMsg((e as Error).message); }
  };

  const requestEnd = () => setEndConfirm(true);

  const confirmEnd = () => {
    setEndConfirm(false);
    setEndInfo(computeEnd());
    setGameOver(true);
  };

  const confirm = async () => {
    if (!sheet) return;
    const kiriage = !!rule.kiriage;
    const ctx: RoundContext = { mode, dealer, honba, riichiSticks: pot, honbaStick: honbaStick(mode) };
    let deltas: number[] = new Array(n).fill(0);
    let outcome: Outcome;
    let winnerIdx: number | null = null;

    if (sheet.type === '荣和' && sheet.discarder != null && sheet.ronWinners.length > 0) {
      deltas = settleRon(ctx, sheet.ronWinners, sheet.discarder, kiriage).deltas;
      winnerIdx = sheet.ronWinners[0].seat;
      outcome = { kind: 'win', winnerIsDealer: sheet.ronWinners.some((w) => w.seat === dealer) };
    } else if (sheet.type === '自摸' && sheet.winner != null) {
      deltas = settleTsumo(ctx, sheet.winner, sheet.han, sheet.fu, kiriage).deltas;
      winnerIdx = sheet.winner;
      outcome = { kind: 'win', winnerIsDealer: sheet.winner === dealer };
    } else if (sheet.type === '流局') {
      if (sheet.sub === '不听罚符') {
        deltas = settleNoten(ctx, sheet.tenpai).deltas;
        outcome = { kind: 'draw', dealerTenpai: sheet.tenpai[dealer] === true };
      } else {
        winnerIdx = sheet.sub === '流局满贯' && sheet.winner != null ? sheet.winner : null;
        if (winnerIdx != null) deltas = settleTsumo(ctx, winnerIdx, 5, 0).deltas;
        outcome = { kind: 'draw', dealerTenpai: sheet.sub === '途中流局' ? true : sheet.dealerTenpai };
      }
    } else {
      deltas = settleChombo(ctx, sheet.chombo ?? 0, sheet.amount).deltas;
      outcome = { kind: 'chombo' };
    }

    applyDeltas(deltas);
    const newPoints = seats.map((s, i) => s.points + (deltas[i] ?? 0));
    const next = advance({ mode, dealer, honba, wind, hand }, outcome);
    setDealer(next.dealer); setHonba(next.honba); setWind(next.wind); setHand(next.hand);

    // 记录每局数据变化
    let label: string = sheet.type;
    if (sheet.type === '自摸') label = `自摸 ${sheet.han}番${sheet.fu}符`;
    else if (sheet.type === '流局') label = `流局·${sheet.sub}`;
    else if (sheet.type === '罚符') label = `罚符 ${sheet.amount}`;
    setHandLog((log) => [...log, { seq, label, deltas }]);

    if (shouldEnd(next, toRuleSnapshot(rule), newPoints, outcome)) {
      const leftoverPot = winnerIdx != null ? 0 : pot;
      const topIdx = newPoints.indexOf(Math.max(...newPoints));
      const adjusted = newPoints.map((p, i) => (i === topIdx ? p + leftoverPot * 1000 : p));
      setEndInfo({ raw: adjusted, results: finalScores(adjusted, toRuleSnapshot(rule), initialDealer) });
      setGameOver(true);
    }
    if (winnerIdx != null) { setRiichi(new Set()); setPot(0); } else { setRiichi(new Set()); }

    if (game) {
      const body: any = {
        type: sheet.type === '荣和' ? 'RON' : sheet.type === '自摸' ? 'TSUMO' : sheet.type === '流局' ? 'DRAW' : 'CHOMBO',
        dealer, honba, riichiSticks: pot, riichi: [...riichi], seq, kiriage,
      };
      if (sheet.type === '荣和') Object.assign(body, { winners: sheet.ronWinners, discarder: sheet.discarder });
      else if (sheet.type === '自摸') Object.assign(body, { winner: sheet.winner, han: sheet.han, fu: sheet.fu });
      else if (sheet.type === '流局') {
        body.subType = sheet.sub === '不听罚符' ? 'NOTEN' : sheet.sub === '途中流局' ? 'ABORTIVE' : 'NAGASHI_MANGAN';
        if (sheet.sub === '不听罚符') body.tenpai = sheet.tenpai;
        if (sheet.sub === '流局满贯') body.winner = sheet.winner;
      } else Object.assign(body, { chombo: sheet.chombo, amount: sheet.amount });
      body.liveState = { dealer: next.dealer, honba: next.honba, wind: next.wind, hand: next.hand, points: newPoints, pot: winnerIdx != null ? 0 : pot, seq: seq + 1 };
      try { await games.addSettlement(game.id, body); setSeq((s) => s + 1); } catch (e) { setSaveMsg((e as Error).message); }
    }

    setSheet(null);
  };

  const openSheet = (type: SheetType, seat?: number) =>
    setSheet({
      type, angle: seat != null ? SEATS[mode][seat][1] : 0, han: 1, fu: 30,
      ronWinners: type === '荣和' && seat != null ? [{ seat, han: 1, fu: 30 }] : [],
      discarder: null,
      winner: type === '自摸' && seat != null ? seat : null,
      chombo: type === '罚符' && seat != null ? seat : null,
      sub: '不听罚符', tenpai: seatsActive.map(() => false), amount: 8000, dealerTenpai: true,
    });

  return (
    <div className="score">
      {started && (
        <header className="score-top">
          <button className="back" onClick={onShowNav} aria-label="返回">←</button>
          <div className="top-mode">{MODE_LABEL[mode]} · {rule.length}</div>
          <div className="top-right">
            <button className="end-btn" onClick={requestEnd}>终局</button>
          </div>
        </header>
      )}

      {!started ? (
        <div className="start-screen">
          <div className="start-title">立直麻将计分</div>
          <button className="btn-primary" onClick={openSetup}>开局</button>
          {saveMsg && <div className="save-msg">{saveMsg}</div>}
        </div>
      ) : (
        <div className="felt">
          {SEATS[mode].map(([pos, angle], i) => {
            const windOf = WIND[mode][(i - dealer + n) % n];
            const isDealer = i === dealer;
            const opp = n % 2 === 0 ? (i + n / 2) % n : -1; // 对家（四人/二人）
            const kamicha = n >= 3 ? (i - 1 + n) % n : -1; // 上家（左）
            const shimocha = n >= 3 ? (i + 1) % n : -1; // 下家（右）
            const d = (j: number) => seats[i].points - seats[j].points;
            return (
              <div key={pos} className={`band band-${pos}`}>
                <div className={`bar ${isDealer ? 'dealer' : ''} ${riichi.has(i) ? 'riichi' : ''}`} style={{ transform: `rotate(${angle}deg)` }}>
                  <div className="bar-head">
                    <span className="badge wind">{windOf}</span>
                    <div className="name-row">
                      <span className="avatar">{seats[i].name[0]}</span>
                      <span className="name">{seats[i].name}</span>
                    </div>
                  </div>
                  <div className="bar-score" onClick={() => toggleRiichi(i)}>
                    <div className="points-wrap">
                      {opp >= 0 && <Diff value={d(opp)} />}
                      <div className="points-row">
                        {kamicha >= 0 && <Diff value={d(kamicha)} />}
                        <div className="points"><RollingNumber value={seats[i].points} /></div>
                        {shimocha >= 0 && <Diff value={d(shimocha)} />}
                      </div>
                    </div>
                  </div>
                  <div className="bar-actions">
                    <button className="act" onClick={() => openSheet('荣和', i)}>荣和</button>
                    <button className="act" onClick={() => openSheet('自摸', i)}>自摸</button>
                    <button className="act" onClick={() => openSheet('罚符', i)}>罚符</button>
                  </div>
                </div>
              </div>
            );
          })}

          <div className="center-block">
            <div className="round">{WIND[mode][wind % WIND[mode].length]}{hand}局</div>
            <div className="sub">{honba}本场·供托{pot}</div>
            <div className="dice-row" onClick={rollDice}>
              <Die value={dice.a} rolling={rolling} />
              <Die value={dice.b} rolling={rolling} />
            </div>
            <button className="draw-btn" onClick={() => openSheet('流局')}>流局</button>
          </div>
        </div>
      )}

      {sheet && <Sheet sheet={sheet} setSheet={setSheet} n={n} dealer={dealer} honba={honba} pot={pot} mode={mode} names={seatsActive.map((s) => s.name)} riichi={riichi} kiriage={!!rule.kiriage} onConfirm={confirm} />}
      {setup && <Setup setup={setup} setSetup={setSetup} allPlayers={allPlayers} user={user} mode={mode} setMode={reset} onConfirm={startGameFromSetup} rule={rule} setRule={setRule} />}
      {gameOver && endInfo && <EndPanel endInfo={endInfo} names={seatsActive.map((s) => s.name)} handLog={handLog} user={user} saveMsg={saveMsg} rule={rule} onSave={finishGame} onClose={resetToStart} />}
      {endConfirm && (
        <div className="sheet-mask" onClick={() => setEndConfirm(false)}>
          <div className="sheet end-confirm" onClick={(e) => e.stopPropagation()}>
            <div className="sh-head"><span className="sh-title">终局确认</span></div>
            <div className="end-confirm-text">确认结束本局并计算顺位？</div>
            <div className="sh-foot">
              <button className="btn-cancel" onClick={() => setEndConfirm(false)}>取消</button>
              <button className="btn-ok" onClick={confirmEnd}>确认</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type HanFuType = '荣和' | '自摸';

function hanFuScore(han: number, fu: number, isDealer: boolean, type: HanFuType, mode: Mode, kiriage: boolean): string {
  const base = baseOf(han, fu, kiriage);
  if (type === '荣和' || mode === 2) {
    const mult = isDealer ? 6 : 4;
    return String(rup(base * mult));
  }
  if (isDealer) return `${rup(base * 2)} all`;
  return `${rup(base)},${rup(base * 2)}`;
}

function hanFuValid(han: number, fu: number, type: HanFuType): boolean {
  if (fu === 20) return type === '自摸' && han >= 2;
  if (fu === 25) return han >= 2;
  return true;
}

function hanFuLabel(han: number, fu: number, kiriage: boolean): string {
  if (han <= 4) {
    if (baseOf(han, fu, kiriage) === 2000) return `${han}番 满贯`;
    return `${han}番${fu}符`;
  }
  return `${han}番 ${tierName(han)}`;
}

interface HfCell {
  kind: 'cell' | 'mangan' | 'invalid';
  han: number;
  fu: number;
  fuLabel: string;
  score: string;
}

function cellsFor(han: number, type: HanFuType, isDealer: boolean, mode: Mode, kiriage: boolean): HfCell[] {
  const fus = type === '荣和' ? FU_OPTS.filter((f) => f !== 20) : [...FU_OPTS];
  const cells: HfCell[] = [];
  const mangan: number[] = [];
  for (const fu of fus) {
    if (!hanFuValid(han, fu, type)) {
      cells.push({ kind: 'invalid', han, fu, fuLabel: `${fu}符`, score: '-' });
    } else if (baseOf(han, fu, kiriage) === 2000) {
      mangan.push(fu);
    } else {
      cells.push({ kind: 'cell', han, fu, fuLabel: `${fu}符`, score: hanFuScore(han, fu, isDealer, type, mode, kiriage) });
    }
  }
  if (mangan.length > 0) {
    cells.push({ kind: 'mangan', han, fu: mangan[0], fuLabel: '满贯', score: hanFuScore(han, mangan[0], isDealer, type, mode, kiriage) });
  }
  return cells;
}

function HanFuTable({ type, isDealer, mode, kiriage, angle, onSelect, onClose }: {
  type: HanFuType;
  isDealer: boolean;
  mode: Mode;
  kiriage: boolean;
  angle: number;
  onSelect: (han: number, fu: number) => void;
  onClose: () => void;
}) {
  const tiers = [
    { han: 5, label: '5番', name: '满贯' },
    { han: 6, label: '6~7番', name: '跳满' },
    { han: 8, label: '8~10番', name: '倍满' },
    { han: 11, label: '11~12番', name: '三倍满' },
    { han: 13, label: '13番', name: '役满' },
    { han: 26, label: '26番', name: '双倍役满' },
  ];
  return (
    <div className="hf-mask" onClick={onClose}>
      <div className={`hf-table ${angle === 90 || angle === -90 ? 'rot90' : ''}`} style={{ transform: `rotate(${angle}deg)` }} onClick={(e) => e.stopPropagation()}>
        <div className="hf-title">番符得点 · {isDealer ? '亲家' : '子家'} · {type}</div>
        <div className="hf-grid">
          {[1, 2, 3, 4].map((han) => (
            <div key={han} className="hf-col">
              <div className="hf-col-title">{han}番</div>
              {cellsFor(han, type, isDealer, mode, kiriage).map((c, i) => (
                <button key={i} className={`hf-cell ${c.kind}`} disabled={c.kind === 'invalid'} onClick={() => onSelect(c.han, c.fu)}>
                  <span className="hf-fu">{c.fuLabel}</span>
                  <span className="hf-score">{c.score}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="hf-tiers">
          {tiers.map((t) => (
            <button key={t.han} className="hf-tier" onClick={() => onSelect(t.han, 0)}>
              <span className="hf-tier-name">{t.label} {t.name}</span>
              <span className="hf-tier-score">{hanFuScore(t.han, 0, isDealer, type, mode, kiriage)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Sheet({ sheet, setSheet, n, dealer, honba, pot, mode, names, riichi, kiriage, onConfirm }: {
  sheet: SheetState;
  setSheet: (s: SheetState | null) => void;
  n: number;
  dealer: number;
  honba: number;
  pot: number;
  mode: Mode;
  names: string[];
  riichi: Set<number>;
  kiriage: boolean;
  onConfirm: () => void;
}) {
  const set = (patch: Partial<SheetState>) => setSheet({ ...sheet, ...patch });
  const ctx: RoundContext = { mode, dealer, honba, riichiSticks: pot, honbaStick: honbaStick(mode) };
  const [editSeat, setEditSeat] = useState<number | null>(null);

  const toggleRonWinner = (seat: number) => {
    const exists = sheet.ronWinners.some((w) => w.seat === seat);
    set({ ronWinners: exists ? sheet.ronWinners.filter((w) => w.seat !== seat) : [...sheet.ronWinners, { seat, han: 1, fu: 30 }] });
  };
  const setRonWinner = (seat: number, hf: { han: number; fu: number }) =>
    set({ ronWinners: sheet.ronWinners.map((w) => (w.seat === seat ? { ...w, ...hf } : w)) });

  const applyHanFu = (han: number, fu: number) => {
    if (editSeat == null) return;
    if (sheet.type === '自摸') set({ han, fu });
    else setRonWinner(editSeat, { han, fu });
    setEditSeat(null);
  };

  // 结算明细：结算项 + 立直者说明性回顾
  let items: SettleItem[] = [];
  let hint = '';
  if (sheet.type === '荣和') {
    if (sheet.discarder == null || sheet.ronWinners.length === 0) hint = '选择放铳者、和牌者';
    else items = settleRon(ctx, sheet.ronWinners, sheet.discarder, kiriage).items;
  } else if (sheet.type === '自摸') {
    if (sheet.winner == null) hint = '选择和牌者';
    else items = settleTsumo(ctx, sheet.winner, sheet.han, sheet.fu, kiriage).items;
  } else if (sheet.type === '流局') {
    if (sheet.sub === '不听罚符') items = settleNoten(ctx, sheet.tenpai).items;
    else if (sheet.sub === '流局满贯') {
      if (sheet.winner == null) hint = '选择流局满贯获得者';
      else items = settleTsumo(ctx, sheet.winner, 5, 0).items;
    } else hint = '途中流局：不结算，本场 +1、连庄';
  } else {
    if (sheet.chombo == null) hint = '选择被罚雀士';
    else items = settleChombo(ctx, sheet.chombo, sheet.amount).items;
  }
  const recap = [...items];
  for (const seat of riichi) recap.push({ seat, label: '立直', amount: -1000 });

  const chip = (label: string, active: boolean, onClick: () => void, key?: string) => (
    <button key={key ?? label} className={`chip ${active ? 'on' : ''}`} onClick={onClick}>{label}</button>
  );

  return (
    <>
      <div className="sheet-mask" onClick={() => setSheet(null)}>
        <div className={`sheet ${sheet.angle === 90 || sheet.angle === -90 ? 'rot90' : ''}`} style={{ transform: `rotate(${sheet.angle}deg)` }} onClick={(e) => e.stopPropagation()}>
        <div className="sh-head">
          <span className="sh-title">{sheet.type}</span>
          <button className="sh-close" onClick={() => setSheet(null)}>✕</button>
        </div>

        {sheet.type === '自摸' && (
          <>
            <div className="sec-label">和牌者</div>
            <div className="chips">{names.map((nm, i) => chip(nm, sheet.winner === i, () => set({ winner: sheet.winner === i ? null : i }), 'w' + i))}</div>
            <div className="hanfu">
              <div className="sec-label">番符</div>
              <button className="hanfu-field" disabled={sheet.winner == null} onClick={() => sheet.winner != null && setEditSeat(sheet.winner)}>{hanFuLabel(sheet.han, sheet.fu, kiriage)}</button>
            </div>
          </>
        )}

        {sheet.type === '荣和' && (
          <>
            <div className="sec-label">放铳者（先选）</div>
            <div className="chips">{names.map((nm, i) => !sheet.ronWinners.some((w) => w.seat === i) && chip(nm, sheet.discarder === i, () => set({ discarder: sheet.discarder === i ? null : i, ronWinners: sheet.ronWinners.filter((w) => w.seat !== i) }), 'd' + i))}</div>
            {sheet.discarder != null && (
              <>
                <div className="sec-label">和牌者（点选，可多家）</div>
                <div className="chips">{names.map((nm, i) => i !== sheet.discarder && chip(nm, sheet.ronWinners.some((w) => w.seat === i), () => toggleRonWinner(i), 'w' + i))}</div>
                {[...sheet.ronWinners].sort((a, b) => a.seat - b.seat).map((w) => (
                  <div key={w.seat} className="hanfu">
                    <div className="sec-label">{names[w.seat]} · 番符</div>
                    <button className="hanfu-field" onClick={() => setEditSeat(w.seat)}>{hanFuLabel(w.han, w.fu, kiriage)}</button>
                  </div>
                ))}
              </>
            )}
          </>
        )}

        {sheet.type === '流局' && (
          <>
            <div className="sec-label">流局类型</div>
            <div className="chips">{(['不听罚符', '途中流局', '流局满贯'] as const).map((s) => chip(s, sheet.sub === s, () => set({ sub: s }), s))}</div>
            {sheet.sub === '不听罚符' && (
              <>
                <div className="sec-label">各家听牌状态（默认不听，点切换）</div>
                <div className="chips">
                  {names.map((nm, i) => {
                    const v = sheet.tenpai[i];
                    return <button key={i} className={`chip ${v ? 't' : 'n'}`} onClick={() => { const a = [...sheet.tenpai]; a[i] = !a[i]; set({ tenpai: a }); }}>{`${nm}·${v ? '听' : '不听'}`}</button>;
                  })}
                </div>
              </>
            )}
            {sheet.sub === '流局满贯' && (
              <>
                <div className="sec-label">获得者</div>
                <div className="chips">{names.map((nm, i) => chip(nm, sheet.winner === i, () => set({ winner: sheet.winner === i ? null : i }), 'w' + i))}</div>
                <div className="sec-label">庄家听牌（决定连庄）</div>
                <div className="chips">
                  {chip('听牌', sheet.dealerTenpai, () => set({ dealerTenpai: true }), 'dt1')}
                  {chip('不听', !sheet.dealerTenpai, () => set({ dealerTenpai: false }), 'dt0')}
                </div>
              </>
            )}
          </>
        )}

        {sheet.type === '罚符' && (
          <>
            <div className="sec-label">被罚雀士</div>
            <div className="chips">{names.map((nm, i) => chip(nm, sheet.chombo === i, () => set({ chombo: sheet.chombo === i ? null : i }), 'c' + i))}</div>
            <div className="sec-label">罚点数</div>
            <div className="chips">{AMOUNTS.map((a) => chip(String(a), sheet.amount === a, () => set({ amount: a }), String(a)))}</div>
          </>
        )}

        <div className="preview">
          {hint
            ? <div>{hint}</div>
            : names.map((nm, i) => {
                const my = recap.filter((it) => it.seat === i);
                const total = my.reduce((s, it) => s + it.amount, 0);
                const detail = my.map((it) => `${it.label}${it.amount >= 0 ? '+' : ''}${it.amount}`).join(' ');
                return <div key={i}>{nm}：{total}{detail ? `(${detail})` : ''}</div>;
              })}
        </div>
        <div className="sh-foot">
          <button className="btn-cancel" onClick={() => setSheet(null)}>取消</button>
          <button className="btn-ok" onClick={onConfirm}>确认</button>
        </div>
        </div>
      </div>
      {editSeat != null && (
        <HanFuTable
          type={sheet.type === '荣和' ? '荣和' : '自摸'}
          isDealer={editSeat === dealer}
          mode={mode}
          kiriage={kiriage}
          angle={sheet.angle}
          onSelect={applyHanFu}
          onClose={() => setEditSeat(null)}
        />
      )}
    </>
  );
}

function Setup({ setup, setSetup, allPlayers, user, mode, setMode, onConfirm, rule, setRule }: {
  setup: { names: string[]; selections: (string | null)[]; startPoints: number[] };
  setSetup: (s: { names: string[]; selections: (string | null)[]; startPoints: number[] } | null) => void;
  allPlayers: any[];
  user: AuthUser | null;
  mode: Mode;
  setMode: (m: Mode) => void;
  onConfirm: (dealerIdx: number) => void;
  rule: Record<string, any>;
  setRule: (r: Record<string, any>) => void;
}) {
  const [pickerSeat, setPickerSeat] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [tempName, setTempName] = useState('');
  const [dealerIdx, setDealerIdx] = useState(0);

  const set = (i: number, name: string, selection: string | null) =>
    setSetup({
      names: setup.names.map((n, k) => (k === i ? name : n)),
      selections: setup.selections.map((s, k) => (k === i ? selection : s)),
      startPoints: setup.startPoints,
    });

  const setStartPoint = (i: number, v: number) =>
    setSetup({ ...setup, startPoints: setup.startPoints.map((sp, k) => (k === i ? v : sp)) });

  const myPlayers = allPlayers.filter((p) => p.boundUserId === user?.id);
  const q = search.trim().toLowerCase();
  const searched = q ? allPlayers.filter((p) => (p.name || '').toLowerCase().includes(q)) : [];
  const isTaken = (id: string) => setup.selections.some((s, i) => i !== pickerSeat && s === id);
  const totalOffset = setup.startPoints.reduce((a, b) => a + b, 0) - Number(rule.startPoints) * mode;

  const openPicker = (i: number) => { setSearch(''); setTempName(''); setPickerSeat(i); };
  const pick = (p: any) => { if (pickerSeat != null) set(pickerSeat, p.name, p.id); setPickerSeat(null); };
  const pickTemp = () => { if (pickerSeat != null) set(pickerSeat, tempName.trim() || `玩家${pickerSeat + 1}`, null); setPickerSeat(null); };

  const playerRow = (p: any) => {
    const taken = isTaken(p.id);
    return (
      <div key={p.id} className={`row ${taken ? 'disabled' : ''}`} onClick={() => !taken && pick(p)}>
        <span className="avatar">{p.name[0]}</span>
        <div className="row-body"><div className="row-name">{p.name}</div>{taken && <div className="row-sub">已选</div>}</div>
      </div>
    );
  };

  return (
    <div className="sheet-mask" onClick={() => setSetup(null)}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sh-head">
          <span className="sh-title">{pickerSeat != null ? `座位 ${pickerSeat + 1} · 选人` : '开局'}</span>
          <button className="sh-close" onClick={() => (pickerSeat != null ? setPickerSeat(null) : setSetup(null))}>✕</button>
        </div>

        {pickerSeat != null ? (
          <>
            {myPlayers.length > 0 && (
              <>
                <div className="sec-label">我的雀士</div>
                <div className="list">{myPlayers.map(playerRow)}</div>
              </>
            )}
            <div className="sec-label">搜索雀士</div>
            <div className="field"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="输入名称搜索全局雀士" /></div>
            {q && (
              <div className="list">
                {searched.map(playerRow)}
                {searched.length === 0 && <div className="placeholder">无匹配雀士</div>}
              </div>
            )}
            <div className="sec-label">临时雀士（手填名称，局终即弃）</div>
            <div className="seat-edit">
              <input value={tempName} onChange={(e) => setTempName(e.target.value)} placeholder={`玩家${pickerSeat + 1}`} />
              <button className="btn-mini" onClick={pickTemp}>使用</button>
            </div>
          </>
        ) : (
          <>
            <div className="sec-label">模式</div>
            <div className="chips">
              {[4, 3, 2].map((m) => (
                <button key={m} className={`chip ${mode === m ? 'on' : ''}`} onClick={() => { setMode(m as Mode); setDealerIdx(0); setSetup({ names: Array(m).fill(''), selections: Array(m).fill(null), startPoints: Array(m).fill(m === 2 ? 50000 : 25000) }); }}>{m}人</button>
              ))}
            </div>
            <div className="sec-label">各家雀士（点击位置选人）</div>
            <div className="table">
              {SEATS[mode].map(([pos, angle], i) => (
                <div key={pos} className="seat" style={{ gridArea: pos }}>
                  <div className={`card ${dealerIdx === i ? 'dealer' : ''}`} style={{ transform: `rotate(${angle}deg)`, cursor: 'pointer' }} onClick={() => openPicker(i)}>
                    <button className={`dealer-toggle ${dealerIdx === i ? 'on' : ''}`} onClick={(e) => { e.stopPropagation(); setDealerIdx(i); }}>庄</button>
                    <div className="name-row">
                      <span className="avatar">{setup.names[i]?.[0] || '?'}</span>
                      <span className="name">{setup.names[i] || '选人'}</span>
                    </div>
                    <span className="badge">{POS_LABEL[pos]}</span>
                  </div>
                </div>
              ))}
              <div className="center" style={{ gridArea: 'center' }}>
                <div className="sub">点击位置选人</div>
              </div>
            </div>
            <div className="rule-hint">临时雀士（手填名称）仅本局有效，不计入数据统计。</div>
            <div className="sec-label">各家基础分（默认 {rule.startPoints}）</div>
            <div className="form">
              {setup.startPoints.map((sp, i) => (
                <div key={i} className="form-row">
                  <span className="fl">{POS_LABEL[SEATS[mode][i][0]]}</span>
                  <input type="number" value={sp} onChange={(e) => setStartPoint(i, Number(e.target.value))} />
                </div>
              ))}
              <div className="form-row">
                <span className="fl">总分偏移</span>
                <span className="fl" style={{ fontWeight: 700 }}>{totalOffset >= 0 ? '+' : ''}{totalOffset}</span>
              </div>
            </div>
            <div className="sec-label">规则（本局有效，不存默认）</div>
            <div className="form">
              <div className="form-row"><span className="fl">局数</span><select value={rule.length} onChange={(e) => setRule({ ...rule, length: e.target.value })}>{['东风战', '半庄战', '一庄战', '无限庄战'].map((o) => <option key={o}>{o}</option>)}</select></div>
              <div className="form-row"><span className="fl">基础分</span><input type="number" value={rule.startPoints} onChange={(e) => { const v = Number(e.target.value); setRule({ ...rule, startPoints: v }); setSetup({ ...setup, startPoints: setup.startPoints.map(() => v) }); }} /></div>
              <div className="form-row"><span className="fl">返点</span><input type="number" value={rule.oka} onChange={(e) => setRule({ ...rule, oka: Number(e.target.value) })} /></div>
              <div className="form-row"><span className="fl">本场点棒</span><input type="number" value={rule.honbaStick} onChange={(e) => setRule({ ...rule, honbaStick: Number(e.target.value) })} /></div>
              <div className="form-row"><span className="fl">不听罚符</span><input type="number" value={rule.notenBappu} onChange={(e) => setRule({ ...rule, notenBappu: Number(e.target.value) })} /></div>
              <div className="form-row"><span className="fl">不满返点延局</span><button className={`tgl ${rule.extendBelowOka ? 'on' : ''}`} onClick={() => setRule({ ...rule, extendBelowOka: !rule.extendBelowOka })}>{rule.extendBelowOka ? '是' : '否'}</button></div>
              <div className="form-row"><span className="fl">番缚</span><select value={rule.hanMin} onChange={(e) => setRule({ ...rule, hanMin: e.target.value })}>{HAN_MIN_OPTIONS.map((o) => <option key={o}>{o}</option>)}</select></div>
              <div className="form-row"><span className="fl">马点</span>
                <select value={rule.uma} onChange={(e) => setRule({ ...rule, uma: e.target.value })}>
                  {UMA_OPTIONS[mode].map((o) => <option key={o} value={o}>{o}</option>)}
                  <option value={CUSTOM_UMA}>自定义…</option>
                </select>
              </div>
              {rule.uma === CUSTOM_UMA && (
                <div className="field">
                  <input value={rule.umaCustom ?? ''} onChange={(e) => setRule({ ...rule, umaCustom: e.target.value })} placeholder={`${mode} 个整数，逗号分隔，如 ${mode === 4 ? '30,10,-10,-30' : mode === 3 ? '30,0,-30' : '30,-30'}`} />
                </div>
              )}
              <div className="form-row"><span className="fl">切上满贯</span><button className={`tgl ${rule.kiriage ? 'on' : ''}`} onClick={() => setRule({ ...rule, kiriage: !rule.kiriage })}>{rule.kiriage ? '是' : '否'}</button></div>
              <div className="form-row"><span className="fl">击飞</span><button className={`tgl ${rule.hakoshita ? 'on' : ''}`} onClick={() => setRule({ ...rule, hakoshita: !rule.hakoshita })}>{rule.hakoshita ? '是' : '否'}</button></div>
              <div className="form-row"><span className="fl">终局第一无限连庄</span><button className={`tgl ${rule.unlimitedTopRenchan ? 'on' : ''}`} onClick={() => setRule({ ...rule, unlimitedTopRenchan: !rule.unlimitedTopRenchan })}>{rule.unlimitedTopRenchan ? '是' : '否'}</button></div>
              <div className="form-row"><span className="fl">得点保留一位小数</span><button className={`tgl ${rule.keepDecimal ? 'on' : ''}`} onClick={() => setRule({ ...rule, keepDecimal: !rule.keepDecimal })}>{rule.keepDecimal ? '是' : '否'}</button></div>
            </div>
            <div className="sh-foot">
              <button className="btn-cancel" onClick={() => setDealerIdx(Math.floor(Math.random() * mode))}>随机庄家</button>
              <button className="btn-ok" onClick={() => onConfirm(dealerIdx)}>开局</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function EndPanel({ endInfo, names, handLog, user, saveMsg, rule, onSave, onClose }: {
  endInfo: { raw: number[]; results: { score: number; rank: number }[] };
  names: string[];
  handLog: { seq: number; label: string; deltas: number[] }[];
  user: AuthUser | null;
  saveMsg: string;
  rule: Record<string, any>;
  onSave: () => void;
  onClose: () => void;
}) {
  const order = endInfo.results.map((r, i) => ({ i, ...r })).sort((a, b) => a.rank - b.rank);
  const oka = Number(rule.oka);
  const startPoints = Number(rule.startPoints);
  const uma = umaArray(rule);
  const topBonus = ((oka - startPoints) * endInfo.results.length) / 1000;
  return (
    <div className="sheet-mask">
      <div className="sheet">
        <div className="sh-head">
          <span className="sh-title">对局结束</span>
        </div>
        <div className="sec-label">终局顺位</div>
        <div className="list">
          {order.map((o) => {
            const raw = endInfo.raw[o.i];
            const net = Math.round((raw - oka) / 100) / 10;
            const umaVal = uma[(o.rank - 1)] ?? 0;
            const topVal = o.rank === 1 ? topBonus : 0;
            return (
              <div key={o.i} className="row">
                <span className="rank-num">{o.rank}</span>
                <span className="avatar">{names[o.i]?.[0]}</span>
                <div className="row-body">
                  <div className="row-name">{names[o.i]}</div>
                  <div className="row-sub">素点 {raw} · 净 {net >= 0 ? '+' : ''}{net} · TOP {topVal > 0 ? '+' + topVal : topVal} · 马 {umaVal >= 0 ? '+' : ''}{umaVal}</div>
                </div>
                <div className="row-val">{o.score > 0 ? '+' : ''}{o.score}</div>
              </div>
            );
          })}
        </div>
        <div className="sec-label" style={{ marginTop: 14 }}>逐局结算</div>
        <div className="list">
          {handLog.map((h, i) => (
            <div key={i} className="row">
              <span className="rank-num">{h.seq}</span>
              <div className="row-body">
                <div className="row-name">{h.label}</div>
                <div className="row-sub">{h.deltas.map((d, s) => d !== 0 ? `${names[s]}${d > 0 ? '+' : ''}${d}` : null).filter(Boolean).join(' · ')}</div>
              </div>
            </div>
          ))}
          {handLog.length === 0 && <div className="placeholder">暂无结算记录</div>}
        </div>
        {saveMsg && <div className="save-msg">{saveMsg}</div>}
        <div className="sh-foot">
          <button className="btn-ok" onClick={user ? onSave : onClose}>{user ? '终局并保存' : '关闭'}</button>
        </div>
      </div>
    </div>
  );
}
