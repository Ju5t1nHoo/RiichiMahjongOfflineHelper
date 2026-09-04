import { useEffect, useState } from 'react';
import { games, stats } from '../api';

const fmtTime = (s: string) => {
  const d = new Date(s);
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

type Block = 'mine' | 'feed' | 'rank';
const BLOCKS: { key: Block; label: string }[] = [
  { key: 'mine', label: '我的创建' },
  { key: 'feed', label: '数据广场' },
  { key: 'rank', label: '雀士数据' },
];

export default function Stats({ onResume }: { onResume?: (game: any) => void }) {
  const [block, setBlock] = useState<Block>('mine');
  const [mode, setMode] = useState(4);
  const [sort, setSort] = useState('total');
  const [data, setData] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<{ type: 'game'; data: any } | { type: 'player'; playerId: string; mode: number } | null>(null);

  useEffect(() => {
    let cancel = false;
    setData([]);
    setError('');
    (async () => {
      try {
        let d: any[];
        if (block === 'mine') d = await games.mine(mode);
        else if (block === 'feed') d = await games.feed(mode);
        else d = await stats.players(mode, sort);
        if (!cancel) setData(d);
      } catch (e) {
        if (!cancel) setError((e as Error).message);
      }
    })();
    return () => { cancel = true; };
  }, [block, mode, sort]);

  if (detail) return <Detail detail={detail} back={() => setDetail(null)} />;

  const openGame = async (id: string) => { setDetail({ type: 'game', data: await games.get(id) }); };
  const openPlayer = (id: string) => { setDetail({ type: 'player', playerId: id, mode }); };

  return (
    <div>
      <div className="tabs2">
        {BLOCKS.map((b) => (
          <button key={b.key} className={`tab2 ${block === b.key ? 'on' : ''}`} onClick={() => setBlock(b.key)}>{b.label}</button>
        ))}
      </div>
      <div className="segment">
        {[4, 3, 2].map((m) => (
          <button key={m} className={`seg ${mode === m ? 'on' : ''}`} onClick={() => setMode(m)}>{m}人</button>
        ))}
      </div>

      {block === 'rank' && (
        <div className="sort-row">
          {[['total', '总得点'], ['avgRank', '平均顺位'], ['games', '牌局数']].map(([k, l]) => (
            <button key={k} className={`sort ${sort === k ? 'on' : ''}`} onClick={() => setSort(k)}>{l}</button>
          ))}
        </div>
      )}

      {error && <div className="error">{error}</div>}
      {!error && data.length === 0 && <div className="placeholder">暂无数据</div>}
      <div className="list">
        {data.map((item, i) => {
          if (block === 'rank') {
            const val = sort === 'avgRank' ? item.avgRank?.toFixed(2) : sort === 'games' ? item.games : (item.total >= 0 ? '+' : '') + item.total?.toFixed(1);
            return (
              <div key={i} className="row" onClick={() => openPlayer(item.playerId)}>
                <span className="rank-num">{i + 1}</span>
                <span className="avatar">{item.name?.[0]}</span>
                <div className="row-body">
                  <div className="row-name">{item.name}</div>
                  <div className="row-sub">局数 {item.games} · 平均顺位 {item.avgRank?.toFixed(2)}</div>
                </div>
                <div className="row-val">{val}</div>
              </div>
            );
          }
          const modeLabel = ({ 4: '4人', 3: '3人', 2: '2人' } as Record<number, string>)[item.mode] ?? `${item.mode}人`;
          const lengthLabel = item.ruleSnapshot?.length ?? '';
          const title = `${modeLabel}${lengthLabel}`;
          const finished = item.status === 'FINISHED';
          const timeStr = finished && item.endedAt ? fmtTime(item.endedAt) : '进行中';
          const host = block === 'feed' ? `创建用户：${item.creator?.username ?? '—'} · ` : '';
          return (
            <div key={i} className="row" onClick={() => finished ? openGame(item.id) : onResume?.(item)}>
              <div className="row-body">
                <div className="row-name">{title}</div>
                <div className="row-sub">{host}{timeStr}</div>
                {finished && (
                  <div className="score-line">
                    {item.participants?.map((p: any) => {
                      const nm = p.player?.name ?? p.tempName;
                      const sc = p.finalScore;
                      const cls = sc > 0 ? 'pos' : sc < 0 ? 'neg' : 'zero';
                      return <span key={p.seat ?? p.id} className={cls}>{nm} {sc > 0 ? '+' + sc : sc}</span>;
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Detail({ detail, back }: { detail: { type: 'game'; data: any } | { type: 'player'; playerId: string; mode: number }; back: () => void }) {
  if (detail.type === 'game') {
    const d = detail.data;
    const namesBySeat = d.participants?.map((p: any) => p.player?.name ?? p.tempName) ?? [];
    const oka = d.ruleSnapshot?.oka ?? 30000;
    const uma: number[] = d.ruleSnapshot?.uma ?? [];
    const topBonus = ((oka - (d.ruleSnapshot?.startPoints ?? 25000)) * (d.participants?.length ?? 0)) / 1000;
    const sorted = (d.participants ?? []).slice().sort((a: any, b: any) => (a.rank ?? 99) - (b.rank ?? 99));
    const parts = sorted.map((p: any) => {
      const nm = p.player?.name ?? p.tempName;
      const raw = p.finalRawScore;
      const net = raw != null ? Math.round((raw - oka) / 100) / 10 : null;
      const umaVal = uma[(p.rank ?? 1) - 1] ?? 0;
      const topVal = (p.rank ?? 99) === 1 ? topBonus : 0;
      const score = p.finalScore != null ? (p.finalScore >= 0 ? '+' : '') + p.finalScore : '';
      return (
        <div key={p.id} className="row">
          <span className="rank-num">{p.rank}</span>
          <span className="avatar">{nm?.[0]}</span>
          <div className="row-body">
            <div className="row-name">{nm}</div>
            <div className="row-sub">素点 {raw} · 净 {net != null ? (net >= 0 ? '+' : '') + net : '—'} · TOP {topVal > 0 ? '+' + topVal : topVal} · 马 {umaVal >= 0 ? '+' : ''}{umaVal}</div>
          </div>
          <div className="row-val">{score}</div>
        </div>
      );
    });
    const settle = d.settlements?.map((s: any) => {
      const deltas: number[] = s.detail?.deltas ?? [];
      const changes = deltas.map((dd: number, sIdx: number) => dd !== 0 ? `${namesBySeat[sIdx]}${dd > 0 ? '+' : ''}${dd}` : null).filter(Boolean).join(' · ');
      return (
        <div key={s.id} className="row">
          <span className="rank-num">{s.seq}</span>
          <div className="row-body">
            <div className="row-name">{({ RON: '荣和', TSUMO: '自摸', DRAW: '流局', CHOMBO: '罚符' } as Record<string, string>)[s.type] ?? s.type}{s.han ? ` ${s.han}番` : ''}{s.fu ? ` ${s.fu}符` : ''}</div>
            <div className="row-sub">{changes}</div>
          </div>
        </div>
      );
    }) ?? [];
    return (
      <div>
        <div className="sub-head">牌局 · {d.mode}人 · {d.status === 'FINISHED' ? '已终局' : '进行中'}</div>
        <div className="section-title">终局顺位</div>
        <div className="list">{parts}</div>
        <div className="section-title" style={{ marginTop: 14 }}>逐局结算</div>
        <div className="list">{settle}</div>
        <button className="btn-primary" onClick={back}>返回</button>
      </div>
    );
  }
  return <PlayerDetail playerId={detail.playerId} initialMode={detail.mode} back={back} />;
}

function PlayerDetail({ playerId, initialMode, back }: { playerId: string; initialMode: number; back: () => void }) {
  const [mode, setMode] = useState(initialMode);
  const [d, setD] = useState<any>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancel = false;
    setD(null); setError('');
    stats.player(playerId, mode).then((r) => { if (!cancel) setD(r); }).catch((e) => { if (!cancel) setError((e as Error).message); });
    return () => { cancel = true; };
  }, [playerId, mode]);

  if (!d) return <div className="placeholder">{error || '加载中…'}</div>;

  const pct = (n?: number) => (n == null ? '—' : n + '%');
  return (
    <div>
      <div className="segment">
        {[4, 3, 2].map((m) => (
          <button key={m} className={`seg ${mode === m ? 'on' : ''}`} onClick={() => setMode(m)}>{m}人</button>
        ))}
      </div>
      <div className="profile-head">
        <span className="avatar-lg">{d.name?.[0]}</span>
        <div>
          <div className="uname">{d.name}</div>
          <div className="sig">牌局数 {d.games} · 平均顺位 {d.avgRank?.toFixed(2)}</div>
          {d.boundUser ? (
            <div className="sig">绑定用户：{d.boundUser.username}{d.boundUser.signature ? ` · ${d.boundUser.signature}` : ''}</div>
          ) : (
            <div className="sig">未绑定用户</div>
          )}
        </div>
      </div>
      <div className="section-title">牌局级</div>
      <div className="list">
        <div className="row"><div className="row-body"><div className="row-name">总得点</div></div><div className="row-val">{(d.total >= 0 ? '+' : '') + d.total?.toFixed(1)}</div></div>
        <div className="row"><div className="row-body"><div className="row-name">净得点</div></div><div className="row-val">{(d.net >= 0 ? '+' : '') + d.net?.toFixed(1)}</div></div>
        <div className="row"><div className="row-body"><div className="row-name">击飞次数</div></div><div className="row-val">{d.tobi}</div></div>
      </div>
      <div className="section-title" style={{ marginTop: 14 }}>顺位分布</div>
      <div className="list">{d.dist?.slice(0, mode).map((c: number, i: number) => <div key={i} className="row"><div className="row-body"><div className="row-name">{i + 1}位</div></div><div className="row-val">{c} 次</div></div>)}</div>
      <div className="section-title" style={{ marginTop: 14 }}>手级</div>
      <div className="list">
        <div className="row"><div className="row-body"><div className="row-name">和牌率</div></div><div className="row-val">{pct(d.winRate)}</div></div>
        <div className="row"><div className="row-body"><div className="row-name">自摸率</div></div><div className="row-val">{pct(d.tsumoRate)}</div></div>
        <div className="row"><div className="row-body"><div className="row-name">荣和数</div></div><div className="row-val">{d.ron}</div></div>
        <div className="row"><div className="row-body"><div className="row-name">放铳率</div></div><div className="row-val">{pct(d.dealInRate)}</div></div>
        <div className="row"><div className="row-body"><div className="row-name">立直率</div></div><div className="row-val">{pct(d.riichiRate)}</div></div>
        <div className="row"><div className="row-body"><div className="row-name">平均番数</div></div><div className="row-val">{d.avgHan}</div></div>
      </div>
      <button className="btn-primary" onClick={back}>返回</button>
    </div>
  );
}
