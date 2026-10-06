import { useEffect, useState } from 'react';
import { auth, players, feedback, me, type AuthUser } from '../api';
import { RULE_FIELDS, UMA_OPTIONS } from '../ruleConfig';
import type { Mode } from '@riichi/rules';

type View = 'hub' | 'signature' | 'players' | 'rules' | 'password' | 'feedback';

const HAN_MIN_OPTIONS = ['一番缚', '二番缚', '三番缚', '四番缚', '五番缚'];

export default function Profile({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const [view, setView] = useState<View>('hub');
  const [signature, setSignature] = useState(user.signature);

  if (view === 'hub') {
    return (
      <div>
        <div className="profile-head">
          <span className="avatar-lg">{user.username[0]}</span>
          <div>
            <div className="uname">{user.username}</div>
            <div className="sig" onClick={() => setView('signature')}>{signature || '点击添加个性签名'}</div>
          </div>
        </div>
        <div className="menu">
          <div className="menu-item" onClick={() => setView('players')}>雀士管理<span className="arrow">›</span></div>
          <div className="menu-item" onClick={() => setView('rules')}>规则默认设置<span className="arrow">›</span></div>
          <div className="menu-item" onClick={() => setView('password')}>修改密码<span className="arrow">›</span></div>
          <div className="menu-item" onClick={() => setView('feedback')}>意见反馈<span className="arrow">›</span></div>
        </div>
        <button className="btn-primary" onClick={onLogout}>退出登录</button>
      </div>
    );
  }
  if (view === 'signature') return <Signature value={signature} back={(s) => { setSignature(s); setView('hub'); }} />;
  if (view === 'players') return <Players user={user} back={() => setView('hub')} />;
  if (view === 'rules') return <Rules back={() => setView('hub')} />;
  if (view === 'password') return <Password back={() => setView('hub')} />;
  return <Feedback back={() => setView('hub')} />;
}

function Signature({ value, back }: { value: string; back: (s: string) => void }) {
  const [sig, setSig] = useState(value);
  const [err, setErr] = useState('');
  const save = async () => {
    try { await me.signature(sig); back(sig); } catch (e) { setErr((e as Error).message); }
  };
  return (
    <div>
      <div className="sub-head">个性签名（≤100 字）</div>
      <textarea maxLength={100} value={sig} onChange={(e) => setSig(e.target.value)} />
      <div className="count">{sig.length}/100</div>
      {err && <div className="error">{err}</div>}
      <button className="btn-primary" onClick={save}>保存</button>
    </div>
  );
}

function Players({ user, back }: { user: AuthUser; back: () => void }) {
  const [list, setList] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const reload = () => players.list().then(setList).catch((e) => setErr(e.message));
  useEffect(() => { reload(); }, []);

  const create = async () => {
    if (!name) return;
    try { await players.create(name); setName(''); reload(); } catch (e) { setErr((e as Error).message); }
  };

  const mine = list.filter((p) => p.boundUserId === user.id);
  const unbound = list.filter((p) => p.boundUserId == null);

  return (
    <div>
      <div className="sub-head">我的雀士</div>
      {mine.map((p) => (
        <div key={p.id} className="row">
          <span className="avatar">{p.name[0]}</span>
          <div className="row-body"><div className="row-name">{p.name}</div></div>
          <button className="btn-mini danger" onClick={() => players.unbind(p.id).then(reload)}>解绑</button>
        </div>
      ))}
      <div className="row">
        <input className="grow" value={name} onChange={(e) => setName(e.target.value)} placeholder="新雀士名称" />
        <button className="btn-mini" onClick={create}>创建</button>
      </div>
      <div className="sub-head" style={{ marginTop: 16 }}>绑定未绑定的雀士</div>
      {unbound.map((p) => (
        <div key={p.id} className="row">
          <span className="avatar">{p.name[0]}</span>
          <div className="row-body"><div className="row-name">{p.name}</div></div>
          <button className="btn-mini" onClick={() => players.bind(p.id).then(reload)}>绑定</button>
        </div>
      ))}
      {err && <div className="error">{err}</div>}
      <button className="btn-primary" onClick={back}>返回</button>
    </div>
  );
}

function Rules({ back }: { back: () => void }) {
  const [mode, setMode] = useState<Mode>(4);
  const [rules, setRules] = useState<Record<string, Record<string, any>>>({ 4: { ...RULE_FIELDS[4] }, 3: { ...RULE_FIELDS[3] }, 2: { ...RULE_FIELDS[2] } });
  const [err, setErr] = useState('');

  useEffect(() => {
    me.rules().then((r) => setRules((cur) => ({ 4: { ...RULE_FIELDS[4], ...(r[4] as any) }, 3: { ...RULE_FIELDS[3], ...(r[3] as any) }, 2: { ...RULE_FIELDS[2], ...(r[2] as any) } }))).catch(() => {});
  }, []);

  const set = (k: string, v: any) => setRules((r) => ({ ...r, [mode]: { ...r[mode], [k]: v } }));
  const save = async () => {
    try { await me.rulesPut(rules); back(); } catch (e) { setErr((e as Error).message); }
  };
  const cur = rules[mode];

  const row = (label: string, key: string, control: React.ReactNode) => (
    <div className="form-row" key={key}><span className="fl">{label}</span>{control}</div>
  );
  const sel = (key: string, opts: string[]) => (
    <select value={cur[key]} onChange={(e) => set(key, e.target.value)}>{opts.map((o) => <option key={o}>{o}</option>)}</select>
  );
  const num = (key: string) => <input type="number" value={cur[key]} onChange={(e) => set(key, Number(e.target.value))} />;
  const tgl = (key: string) => <button className={`tgl ${cur[key] ? 'on' : ''}`} onClick={() => set(key, !cur[key])}>{cur[key] ? '是' : '否'}</button>;

  return (
    <div>
      <div className="segment">
        {([4, 3, 2] as Mode[]).map((m) => <button key={m} className={`seg ${mode === m ? 'on' : ''}`} onClick={() => setMode(m)}>{m}人</button>)}
      </div>
      <div className="form">
        {row('局数', 'length', sel('length', ['东风战', '半庄战', '一庄战', '无限庄战']))}
        {row('基础分', 'startPoints', num('startPoints'))}
        {row('返点', 'oka', num('oka'))}
        {row('本场点棒', 'honbaStick', num('honbaStick'))}
        {row('不听罚符', 'notenBappu', num('notenBappu'))}
        {row('不满返点延局', 'extendBelowOka', tgl('extendBelowOka'))}
        {row('番缚', 'hanMin', sel('hanMin', HAN_MIN_OPTIONS))}
        {row('切上满贯', 'kiriage', tgl('kiriage'))}
        {row('击飞', 'hakoshita', tgl('hakoshita'))}
        {row('终局第一无限连庄', 'unlimitedTopRenchan', tgl('unlimitedTopRenchan'))}
        {row('马点', 'uma', sel('uma', UMA_OPTIONS[mode]))}
        {row('得点保留一位小数', 'keepDecimal', tgl('keepDecimal'))}
      </div>
      {err && <div className="error">{err}</div>}
      <button className="btn-primary" onClick={save}>保存</button>
    </div>
  );
}

function Password({ back }: { back: () => void }) {
  const [old, setOld] = useState('');
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [msg, setMsg] = useState('');
  const submit = async () => {
    if (p1 !== p2) { setMsg('两次新密码不一致'); return; }
    try { await me.password(old, p1); setMsg('已修改'); back(); } catch (e) { setMsg((e as Error).message); }
  };
  return (
    <div>
      <div className="field"><label>旧密码</label><input type="password" value={old} onChange={(e) => setOld(e.target.value)} /></div>
      <div className="field"><label>新密码</label><input type="password" value={p1} onChange={(e) => setP1(e.target.value)} /></div>
      <div className="field"><label>确认新密码</label><input type="password" value={p2} onChange={(e) => setP2(e.target.value)} /></div>
      {msg && <div className="error">{msg}</div>}
      <button className="btn-primary" onClick={submit}>确认修改</button>
    </div>
  );
}

function Feedback({ back }: { back: () => void }) {
  const [content, setContent] = useState('');
  const [contact, setContact] = useState('');
  const [msg, setMsg] = useState('');
  return (
    <div>
      <div className="field"><label>建议内容（必填）</label><textarea value={content} onChange={(e) => setContent(e.target.value)} /></div>
      <div className="field"><label>联系方式（选填）</label><input value={contact} onChange={(e) => setContact(e.target.value)} /></div>
      <button className="btn-primary" onClick={async () => { if (!content) return; await feedback.submit(content, contact); setMsg('已提交'); }}>提交</button>
      {msg && <div className="error">{msg}</div>}
      <button className="btn-primary" onClick={back}>返回</button>
    </div>
  );
}
