import { useEffect, useState } from 'react';
import { YAKUMAN_TYPES, YAKUMAN_OTHER } from '@riichi/rules';
import { auth, players, yakuman, type AuthUser } from '../api';

const fmtTime = (s: string) => {
  const d = new Date(s);
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const photoUrl = (f: string) => `/api/yakuman/photos/${f}`;
const nowLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

/** 前端压缩：等比缩到最长边 ≤1600，输出 jpeg data URL */
function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 1600;
        let { width, height } = img;
        if (width > max || height > max) {
          const r = Math.min(max / width, max / height);
          width = Math.round(width * r);
          height = Math.round(height * r);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function YakumanWall() {
  const [me, setMe] = useState<AuthUser | null>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [skip, setSkip] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);

  const load = async (s: number) => {
    try {
      const d = await yakuman.list(s);
      setRecords((r) => (s === 0 ? d : [...r, ...d]));
      setHasMore(d.length === 20);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    auth.me().then(setMe).catch(() => {});
    load(0);
  }, []);

  const remove = async (id: string) => {
    try {
      await yakuman.remove(id);
      setRecords((r) => r.filter((x) => x.id !== id));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div>
      <div className="sub-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>役满墙</span>
        <button className="btn-mini" onClick={() => setFormOpen(true)}>记录役满</button>
      </div>
      {error && <div className="error">{error}</div>}
      {records.length === 0 && !error && <div className="placeholder">暂无役满记录</div>}
      <div className="list">
        {records.map((r) => (
          <div key={r.id} className="row">
            <span className="avatar">{r.player?.name?.[0]}</span>
            <div className="row-body">
              <div className="row-name">{r.player?.name}</div>
              <div className="row-sub">
                {r.yakumanType === YAKUMAN_OTHER ? `其它 · ${r.yakumanTypeCustom}` : r.yakumanType} · {fmtTime(r.occurredAt)}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                {r.photos?.map((f: string) => (
                  <img key={f} src={photoUrl(f)} style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 6 }} />
                ))}
              </div>
            </div>
            {me && r.creatorUserId === me.id && <button className="btn-mini" onClick={() => remove(r.id)}>删除</button>}
          </div>
        ))}
      </div>
      {hasMore && (
        <button className="btn-primary" onClick={() => { const s = skip + 20; setSkip(s); load(s); }}>加载更多</button>
      )}
      {formOpen && (
        <YakumanForm
          onClose={() => setFormOpen(false)}
          onSaved={(rec) => { setRecords((r) => [rec, ...r]); setFormOpen(false); }}
        />
      )}
    </div>
  );
}

function YakumanForm({ onClose, onSaved }: { onClose: () => void; onSaved: (rec: any) => void }) {
  const [allPlayers, setAllPlayers] = useState<any[]>([]);
  const [myId, setMyId] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [yakumanType, setYakumanType] = useState<string>(YAKUMAN_TYPES[0]);
  const [custom, setCustom] = useState('');
  const [occurredAt, setOccurredAt] = useState(nowLocal());
  const [photos, setPhotos] = useState<string[]>([]);
  const [picker, setPicker] = useState(false);
  const [search, setSearch] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    players.list().then(setAllPlayers).catch(() => {});
    auth.me().then((u) => setMyId(u.id)).catch(() => {});
  }, []);

  const nameOf = (id: string | null) => allPlayers.find((p) => p.id === id)?.name ?? '';
  const myPlayers = allPlayers.filter((p) => p.boundUserId === myId);
  const q = search.trim().toLowerCase();
  const searched = q ? allPlayers.filter((p) => (p.name || '').toLowerCase().includes(q)) : [];

  const onFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).slice(0, 3 - photos.length);
    for (const f of files) {
      if (f.size > 8 * 1024 * 1024) { setErr('单张照片不能超过 5MB（压缩后）'); continue; }
      const data = await compressImage(f);
      setPhotos((p) => (p.length < 3 ? [...p, data] : p));
    }
    e.target.value = '';
  };

  const submit = async () => {
    setErr('');
    if (!playerId) return setErr('请选择雀士');
    if (photos.length < 1) return setErr('请上传至少 1 张照片');
    if (yakumanType === YAKUMAN_OTHER && !custom.trim()) return setErr('「其它」需填写具体役满名称');
    setBusy(true);
    try {
      const rec = await yakuman.create({
        playerId,
        yakumanType,
        yakumanTypeCustom: yakumanType === YAKUMAN_OTHER ? custom.trim() : undefined,
        occurredAt: new Date(occurredAt).toISOString(),
        photos,
      });
      onSaved(rec);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (picker) {
    return (
      <div className="sheet-mask" onClick={() => setPicker(false)}>
        <div className="sheet" onClick={(e) => e.stopPropagation()}>
          <div className="sh-head">
            <span className="sh-title">选择雀士</span>
            <button className="sh-close" onClick={() => setPicker(false)}>✕</button>
          </div>
          {myPlayers.length > 0 && (
            <>
              <div className="sec-label">我的雀士</div>
              <div className="list">
                {myPlayers.map((p) => (
                  <div key={p.id} className="row" onClick={() => { setPlayerId(p.id); setPicker(false); }}>
                    <span className="avatar">{p.name[0]}</span>
                    <div className="row-body"><div className="row-name">{p.name}</div></div>
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
                <div key={p.id} className="row" onClick={() => { setPlayerId(p.id); setPicker(false); }}>
                  <span className="avatar">{p.name[0]}</span>
                  <div className="row-body"><div className="row-name">{p.name}</div></div>
                </div>
              ))}
              {searched.length === 0 && <div className="placeholder">无匹配雀士</div>}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="sheet-mask" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sh-head">
          <span className="sh-title">记录役满</span>
          <button className="sh-close" onClick={onClose}>✕</button>
        </div>

        <div className="sec-label">雀士</div>
        <button className="btn-mini" onClick={() => setPicker(true)}>{playerId ? nameOf(playerId) : '选择雀士'}</button>

        <div className="sec-label">役满役种</div>
        <select value={yakumanType} onChange={(e) => setYakumanType(e.target.value)}>
          {YAKUMAN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          <option value={YAKUMAN_OTHER}>{YAKUMAN_OTHER}</option>
        </select>
        {yakumanType === YAKUMAN_OTHER && (
          <div className="field"><input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="填写具体役满名称" /></div>
        )}

        <div className="sec-label">发生时刻</div>
        <input type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />

        <div className="sec-label">照片（1~3 张，jpg/png）</div>
        <input type="file" accept="image/*" multiple onChange={onFiles} />
        {photos.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            {photos.map((p, i) => (
              <img key={i} src={p} style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 6 }} />
            ))}
          </div>
        )}

        {err && <div className="error">{err}</div>}
        <button className="btn-primary" disabled={busy} onClick={submit}>{busy ? '上传中…' : '发布'}</button>
      </div>
    </div>
  );
}
