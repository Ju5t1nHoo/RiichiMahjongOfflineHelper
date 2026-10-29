import { useEffect, useState } from 'react';
import { auth, type AuthUser } from './api';
import Score from './modules/Score';
import QuickScore from './modules/QuickScore';
import Stats from './modules/Stats';
import Profile from './modules/Profile';

type Tab = 'score' | 'quick' | 'stats' | 'profile';

const TABS: { key: Tab; label: string; icon: string; needsAuth: boolean }[] = [
  { key: 'score', label: '计分风盘', icon: '🀄', needsAuth: false },
  { key: 'quick', label: '牌局录分', icon: '📝', needsAuth: true },
  { key: 'stats', label: '数据统计', icon: '📊', needsAuth: true },
  { key: 'profile', label: '个人中心', icon: '👤', needsAuth: true },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('score');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const [resume, setResume] = useState<any | null>(null);
  const [scoreInGame, setScoreInGame] = useState(false); // 计分风盘是否牌局进行中
  const [navRevealed, setNavRevealed] = useState(false); // 进行中是否已用「返回」唤出标签栏

  useEffect(() => {
    auth.me().then(setUser).catch(() => setUser(null)).finally(() => setReady(true));
  }, []);

  const goTab = (t: Tab) => {
    setTab(t);
    if (t !== 'score') setScoreInGame(false);
    setNavRevealed(false);
  };

  const current = TABS.find((t) => t.key === tab)!;
  if (ready && current.needsAuth && !user) {
    return <Auth onAuthed={setUser} />;
  }

  const immersive = tab === 'score' && scoreInGame && !navRevealed;
  const showTabbar = !immersive;

  return (
    <div className={`app ${immersive ? 'immersive' : ''}`}>
      {tab === 'score' ? (
        <Score
          user={user}
          resume={resume}
          onResumeDone={() => setResume(null)}
          onShowNav={() => setNavRevealed(true)}
          onGameStateChange={setScoreInGame}
        />
      ) : (
        <main className="content">
          {tab === 'quick' && <QuickScore user={user!} />}
          {tab === 'stats' && <Stats onResume={(g) => { setResume(g); goTab('score'); }} />}
          {tab === 'profile' && <Profile user={user!} onLogout={() => setUser(null)} />}
        </main>
      )}
      {showTabbar && (
        <nav className="tabbar">
          {TABS.map((t) => (
            <button key={t.key} className={`tab ${tab === t.key ? 'on' : ''}`} onClick={() => goTab(t.key)}>
              <span className="t-ico">{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}

function Auth({ onAuthed }: { onAuthed: (u: AuthUser) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    if (mode === 'register' && password !== confirm) {
      setError('两次密码不一致');
      return;
    }
    try {
      const fn = mode === 'login' ? auth.login : auth.register;
      const u = await fn(username, password);
      onAuthed(u);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="auth">
      <div className="auth-title">立直麻将计分</div>
      <div className="auth-tabs">
        <button className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>登录</button>
        <button className={mode === 'register' ? 'on' : ''} onClick={() => setMode('register')}>注册</button>
      </div>
      <div className="field">
        <label>用户名</label>
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="用户名" />
      </div>
      <div className="field">
        <label>密码</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="密码" />
      </div>
      {mode === 'register' && (
        <div className="field">
          <label>确认密码</label>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="再次输入密码" />
        </div>
      )}
      <button className="btn-primary" onClick={submit}>{mode === 'login' ? '登录' : '注册'}</button>
      {error && <div className="error">{error}</div>}
    </div>
  );
}

