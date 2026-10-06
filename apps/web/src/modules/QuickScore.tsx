import { useEffect, useState } from 'react';
import { finalScores, type Mode, type RuleSnapshot } from '@riichi/rules';
import { games, players, type AuthUser } from '../api';
import { UMA_OPTIONS, RULE_FIELDS, CUSTOM_UMA, umaArray } from '../ruleConfig';

const MODE_LABEL: Record<Mode, string> = { 4: '四人', 3: '三人', 2: '二人' };
const START_PRESETS = [25000, 27000, 30000, 50000];
const OKA_PRESETS = [30000, 25000, 50000];

export default function QuickScore({ user }: { user: AuthUser }) {
  const [mode, setMode] = useState<Mode>(4);
  const [allPlayers, setAllPlayers] = useState<any[]>([]);
  const [seatPlayers, setSeatPlayers] = useState<(string | null)[]>(Array(4).fill(null));
  const [scores, setScores] = useState<number[]>(Array(4).fill(25000));
  const [startPoints, setStartPoints] = useState(25000);
  const [oka, setOka] = useState(30000);
  const [umaLabel, setUmaLabel] = useState('10-5');
  const [customUma, setCustomUma] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<any | null>(null);
  const [pickerSeat, setPickerSeat] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    players.list().then(setAllPlayers).catch(() => {});
  }, []);

  const switchMode = (m: Mode) => {
    const r = RULE_FIELDS[m];
    setMode(m);
    setSeatPlayers(Array(m).fill(null));
    setScores(Array(m).fill(Number(r.startPoints)));
    setStartPoints(Number(r.startPoints));
    setOka(Number(r.oka));
    setUmaLabel(r.uma);
    setCustomUma('');
    setError('');
    setSaved(null);
  };

  const umaArr = umaArray({ uma: umaLabel, umaCustom: customUma });

  const total = scores.reduce((a, b) => a + b, 0);
  const expect = startPoints * mode;
  const diff = total - expect;

  const dupId = new Set(seatPlayers.filter(Boolean)).size !== seatPlayers.filter(Boolean).length;
  const seatsFilled = seatPlayers.every((p) => !!p) && !dupId;
  const scoresOk = scores.every((s) => Number.isInteger(s) && s % 100 === 0);
  const ptsOk = Number.isInteger(startPoints) && startPoints % 100 === 0 && Number.isInteger(oka) && oka % 100 === 0;
  const umaOk = umaArr.length === mode && umaArr.every((v) => Number.isInteger(v));
  const valid = seatsFilled && scoresOk && ptsOk && umaOk && total === expect;

  const buildRule = (): RuleSnapshot => ({
    length: '半庄战', startPoints, oka,
    honbaStick: mode === 3 ? 200 : 300, notenBappu: 3000,
    extendBelowOka: true, hanMin: '一番缚', kiriage: false,
    hakoshita: true, unlimitedTopRenchan: false,
    uma: umaArr, keepDecimal: true,
  });

  const results = umaOk ? finalScores(scores, buildRule(), 0) : null;

  const save = async () => {
    setError('');
    if (!valid) return;
    const participants = seatPlayers.map((pid, i) => ({ seat: i, playerId: pid!, finalRawScore: scores[i] }));
    try {
      const g = await games.quick({ mode, ruleSnapshot: buildRule(), participants });
      setSaved(g);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const nameOf = (id: string | null) => allPlayers.find((p) => p.id === id)?.name ?? '';
  const previewOrder = results ? results.map((r, i) => ({ i, ...r })).sort((a, b) => a.rank - b.rank) : [];
  const myPlayers = allPlayers.filter((p) => p.boundUserId === user.id);
  const q = search.trim().toLowerCase();
  const searched = q ? allPlayers.filter((p) => (p.name || '').toLowerCase().includes(q)) : [];
  const taken = (id: string) => seatPlayers.some((pid, k) => k !== pickerSeat && pid === id);
  const pick = (p: any) => { if (pickerSeat != null) setSeatPlayers(seatPlayers.map((pid, k) => (k === pickerSeat ? p.id : pid))); setPickerSeat(null); };

  return (
    <div className="quick">
      <div className="sec-label">游戏模式</div>
      <div className="chips">
        {([4, 3, 2] as Mode[]).map((m) => (
          <button key={m} className={`chip ${mode === m ? 'on' : ''}`} onClick={() => switchMode(m)}>{MODE_LABEL[m]}</button>
        ))}
      </div>

      <div className="sec-label">各家雀士与终局素点</div>
      <div className="list">
        {Array.from({ length: mode }).map((_, i) => (
          <div key={i} className="row">
            <span className="rank-num">{i + 1}</span>
            <button
              className="grow"
              style={{ textAlign: 'left', cursor: 'pointer' }}
              onClick={() => { setSearch(''); setPickerSeat(i); }}
            >
              {nameOf(seatPlayers[i]) || '选择雀士'}
            </button>
            <input
              type="number"
              step={100}
              style={{ width: 96, textAlign: 'right' }}
              value={scores[i]}
              onChange={(e) => setScores(scores.map((s, k) => (k === i ? Number(e.target.value) : s)))}
            />
          </div>
        ))}
      </div>
      {allPlayers.length === 0 && <div className="save-msg">暂无雀士，请先到「个人中心 → 雀士管理」创建。</div>}

      <div className="sec-label">基础分（校验总分用）</div>
      <div className="chips">
        {START_PRESETS.map((v) => (
          <button key={v} className={`chip ${startPoints === v ? 'on' : ''}`} onClick={() => setStartPoints(v)}>{v}</button>
        ))}
      </div>
      <div className="form">
        <div className="form-row"><span className="fl">基础分</span><input type="number" step={100} value={startPoints} onChange={(e) => setStartPoints(Number(e.target.value))} /></div>
      </div>

      <div className="sec-label">返点（算得点用）</div>
      <div className="chips">
        {OKA_PRESETS.map((v) => (
          <button key={v} className={`chip ${oka === v ? 'on' : ''}`} onClick={() => setOka(v)}>{v}</button>
        ))}
      </div>
      <div className="form">
        <div className="form-row"><span className="fl">返点</span><input type="number" step={100} value={oka} onChange={(e) => setOka(Number(e.target.value))} /></div>
      </div>

      <div className="sec-label">马点（算得点用）</div>
      <div className="form">
        <div className="form-row">
          <span className="fl">马点</span>
          <select
            value={umaLabel}
            onChange={(e) => { setUmaLabel(e.target.value); if (e.target.value !== CUSTOM_UMA) setCustomUma(''); }}
          >
            {UMA_OPTIONS[mode].map((o) => <option key={o} value={o}>{o}</option>)}
            <option value={CUSTOM_UMA}>自定义…</option>
          </select>
        </div>
      </div>
      {umaLabel === CUSTOM_UMA && (
        <div className="field">
          <input
            value={customUma}
            onChange={(e) => setCustomUma(e.target.value)}
            placeholder={`${mode} 个整数，逗号分隔，如 ${mode === 4 ? '30,10,-10,-30' : mode === 3 ? '30,0,-30' : '30,-30'}`}
          />
        </div>
      )}

      <div className="preview">
        <div>总分 {total} · 应为 {expect}</div>
        <div className={total === expect ? '' : 'error'}>{total === expect ? '✓ 总分正确' : `✗ ${diff > 0 ? `多 ${diff}` : `少 ${-diff}`}`}</div>
        {!scoresOk && <div className="error">素点需为 100 的整数倍</div>}
        {!ptsOk && <div className="error">基础分/返点需为 100 的整数倍</div>}
        {!umaOk && <div className="error">马点需为 {mode} 个整数</div>}
        {dupId && <div className="error">同一雀士不能占多个座位</div>}
      </div>

      {previewOrder.length > 0 && (
        <>
          <div className="sec-label">得点预览</div>
          <div className="list">
            {previewOrder.map((o) => (
              <div key={o.i} className="row">
                <span className="rank-num">{o.rank}</span>
                <span className="avatar">{nameOf(seatPlayers[o.i])[0] || '?'}</span>
                <div className="row-body">
                  <div className="row-name">{nameOf(seatPlayers[o.i]) || `座位 ${o.i + 1}`}</div>
                  <div className="row-sub">素点 {scores[o.i]}</div>
                </div>
                <div className="row-val">{o.score > 0 ? '+' : ''}{o.score}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {saved ? (
        <div className="preview">
          <div>已保存 · {MODE_LABEL[mode]} · 得点与顺位已计入统计</div>
          <button className="btn-primary" onClick={() => switchMode(mode)}>再录一局</button>
        </div>
      ) : (
        <button className="btn-primary" disabled={!valid} onClick={save}>保存并计入统计</button>
      )}
      {error && <div className="error">{error}</div>}

      {pickerSeat != null && (
        <div className="sheet-mask" onClick={() => setPickerSeat(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sh-head">
              <span className="sh-title">座位 {pickerSeat + 1} · 选择雀士</span>
              <button className="sh-close" onClick={() => setPickerSeat(null)}>✕</button>
            </div>
            {myPlayers.length > 0 && (
              <>
                <div className="sec-label">我的雀士</div>
                <div className="list">
                  {myPlayers.map((p) => (
                    <div key={p.id} className={`row ${taken(p.id) ? 'disabled' : ''}`} onClick={() => !taken(p.id) && pick(p)}>
                      <span className="avatar">{p.name[0]}</span>
                      <div className="row-body"><div className="row-name">{p.name}</div>{taken(p.id) && <div className="row-sub">已选</div>}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
            <div className="sec-label">搜索雀士</div>
            <div className="field"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="输入名称搜索全局雀士" /></div>
            {q && (
              <div className="list">
                {searched.map((p) => (
                  <div key={p.id} className={`row ${taken(p.id) ? 'disabled' : ''}`} onClick={() => !taken(p.id) && pick(p)}>
                    <span className="avatar">{p.name[0]}</span>
                    <div className="row-body"><div className="row-name">{p.name}</div>{taken(p.id) && <div className="row-sub">已选</div>}</div>
                  </div>
                ))}
                {searched.length === 0 && <div className="placeholder">无匹配雀士</div>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
