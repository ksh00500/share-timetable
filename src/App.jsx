import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight, CalendarDays, CalendarCheck2, Check, CheckCheck, ChevronLeft,
  ChevronRight, Clock3, Copy, ExternalLink, Info, KeyRound, Link2, LoaderCircle,
  Lock, LogOut, Plus, RefreshCw, ShieldCheck, Sparkles, Trash2, Unlock, UsersRound, X
} from 'lucide-react';

const DAY_NAMES = ['월', '화', '수', '목', '금', '토', '일'];
const STORAGE_PREFIX = 'share-timetable:session:';

async function api(path, options = {}) {
  const response = await fetch('/api' + path, {
    ...options,
    headers: { ...(options.body ? { 'content-type': 'application/json' } : {}), ...(options.headers || {}) },
    cache: 'no-store'
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || '요청에 실패했습니다.');
  return result;
}

function todayKST() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const find = (name) => parts.find((part) => part.type === name).value;
  return find('year') + '-' + find('month') + '-' + find('day');
}

function shiftDate(date, offset) {
  const value = new Date(date + 'T00:00:00Z');
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

function monday(date) {
  return shiftDate(date, -((new Date(date + 'T00:00:00Z').getUTCDay() + 6) % 7));
}
function dateTitle(date) {
  const [, month, day] = date.split('-');
  return Number(month) + '월 ' + Number(day) + '일';
}
function shortDate(date) {
  const [, month, day] = date.split('-');
  return Number(month) + '.' + String(Number(day)).padStart(2, '0');
}
function timeLabel(index) {
  return String(Math.floor(index / 2)).padStart(2, '0') + ':' + (index % 2 ? '30' : '00');
}
function slotKey(date, index) { return date + '|' + index; }
function getSession(key) {
  try { return JSON.parse(localStorage.getItem(STORAGE_PREFIX + key) || 'null'); }
  catch { return null; }
}
function shareLink(key) { return window.location.origin + '/' + key; }
async function copyText(value) {
  await navigator.clipboard.writeText(value);
}
function Initial({ name, index = 0 }) {
  const className = 'avatar avatar-' + (index % 4);
  return <span className={className}>{name?.slice(0, 1) || '?'}</span>;
}
function Brand({ compact = false }) {
  return <a className="brand" href="/" aria-label="Share Timetable 홈"><span className="brand-mark"><CalendarCheck2 size={20} strokeWidth={2.6} /></span>{!compact && <span>share<span className="brand-accent">time.</span></span>}</a>;
}
function Spinner({ message = '불러오는 중...' }) {
  return <div className="center-state"><LoaderCircle className="spin" size={26}/><p>{message}</p></div>;
}
function Alert({ text, onClose }) {
  if (!text) return null;
  return <div className="alert" role="alert"><Info size={17}/><span>{text}</span><button aria-label="알림 닫기" onClick={onClose}><X size={16}/></button></div>;
}

function Landing() {
  const [key, setKey] = useState('');
  const [invalid, setInvalid] = useState('');
  const go = (event) => {
    event.preventDefault();
    const normalized = key.trim().toLowerCase();
    if (!/^[a-z0-9-]{3,48}$/.test(normalized)) return setInvalid('공유받은 주소 키를 입력해주세요.');
    window.location.assign('/' + normalized);
  };
  return <div className="site-shell landing">
    <header className="simple-header"><Brand/><a className="muted-link" href="/admin"><ShieldCheck size={16}/> 관리자</a></header>
    <main className="hero">
      <div className="hero-copy">
        <div className="eyebrow"><span className="eyebrow-dot"/> TEAM SCHEDULING, MADE SIMPLE</div>
        <h1>우리 모두 되는 시간,<br/><em>한눈에 찾으세요.</em></h1>
        <p>각자 가능한 시간만 색칠하세요. 누가 언제 가능한지, 모두가 모일 수 있는 시간까지 자동으로 찾아드려요.</p>
        <form className="enter-form" onSubmit={go}>
          <div className="input-with-icon"><Link2 size={18}/><span className="input-prefix">/</span><input value={key} onChange={(e) => {setKey(e.target.value);setInvalid('');}} placeholder="팀 주소 키 입력" aria-label="팀 주소 키" /></div>
          <button className="button primary" type="submit">시간표 입장 <ArrowRight size={17}/></button>
        </form>
        {invalid && <p className="field-error">{invalid}</p>}
        <p className="tiny-muted">팀 리더가 공유한 링크로 바로 입장할 수 있어요. 로그인은 필요 없어요.</p>
      </div>
      <div className="hero-preview">
        <div className="preview-window">
          <div className="preview-title"><span className="preview-dot"/><span>우리 팀 주간 가능 시간</span><span className="preview-right">4명 참여</span></div>
          <div className="preview-grid"><span className="preview-head">시간</span>{DAY_NAMES.map((day) => <span className="preview-head" key={day}>{day}</span>)}{Array.from({length:7},(_,h)=><FragmentRow key={h} row={h}/>)}</div>
          <div className="preview-foot"><span className="wine-dot"/> 모두 가능 <span className="orange-dot"/> 일부 가능</div>
        </div>
        <span className="floating-note"><CheckCheck size={16}/> 전원 가능한 시간 발견!</span>
      </div>
    </main>
    <footer className="landing-footer">서로의 시간을 더 쉽게 맞추는 방법. <strong>Share Timetable</strong></footer>
  </div>;
}
function FragmentRow({row}) {
  const patterns = [[0,1,0,2,3,1,0],[1,2,1,3,4,2,0],[2,3,1,4,4,2,1],[1,4,2,4,3,2,0],[0,2,2,3,3,1,0],[1,1,3,4,2,0,0],[0,1,2,2,1,0,0]];
  return <><span className="preview-time">{String(9+row).padStart(2,'0')}:00</span>{patterns[row].map((n,i)=><span className={'preview-cell heat-' + (n===4?'all':n===0?'none':n===1?'low':n===2?'mid':'high')} key={i}/>)}</>;
}

function AdminPage() {
  const [password, setPassword] = useState(() => sessionStorage.getItem('share-timetable:admin') || '');
  const [authorized, setAuthorized] = useState(false);
  const [rooms, setRooms] = useState([]);
  const [title, setTitle] = useState('');
  const [key, setKey] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (pass) => {
    const {rooms: next} = await api('/admin/rooms', {headers:{'x-admin-key':pass}});
    setRooms(next);
    setAuthorized(true);
    sessionStorage.setItem('share-timetable:admin', pass);
  }, []);

  useEffect(() => {
    const saved = sessionStorage.getItem('share-timetable:admin');
    if (saved) load(saved).catch(() => {sessionStorage.removeItem('share-timetable:admin');setAuthorized(false);});
  }, [load]);

  async function signIn(event) {
    event.preventDefault(); setError('');setBusy(true);
    try {await load(password);} catch (e) {setError(e.message);} finally {setBusy(false);}
  }
  async function createRoom(event) {
    event.preventDefault();setBusy(true);setError('');setNotice('');
    try {
      const normalized = key.trim().toLowerCase();
      await api('/admin/rooms',{method:'POST',headers:{'x-admin-key':password},body:JSON.stringify({key:normalized,title:title.trim(),description:description.trim()})});
      setTitle('');setKey('');setDescription('');
      await load(password);setNotice('새 시간표를 만들었어요. 팀원에게 링크를 공유하세요.');
    } catch(e) {setError(e.message);} finally {setBusy(false);}
  }
  async function toggleLock(room) {
    setError('');
    try {await api('/admin/rooms/'+room.key,{method:'PATCH',headers:{'x-admin-key':password},body:JSON.stringify({locked:!room.locked})});await load(password);}
    catch(e) {setError(e.message);}
  }
  async function deleteRoom(room) {
    if (!window.confirm('"' + room.title + '" 방과 모든 참여 데이터를 삭제할까요? 이 작업은 되돌릴 수 없습니다.')) return;
    try {await api('/admin/rooms/'+room.key,{method:'DELETE',headers:{'x-admin-key':password}});await load(password);}
    catch(e) {setError(e.message);}
  }
  async function copyLink(room) {
    try {await copyText(shareLink(room.key));setNotice('공유 링크를 복사했어요.');}
    catch {setNotice('공유 주소: '+shareLink(room.key));}
  }

  return <div className="site-shell">
    <header className="simple-header"><Brand/><a className="muted-link" href="/"><ChevronLeft size={16}/> 홈으로</a></header>
    {!authorized ? <main className="admin-login card">
      <div className="section-icon"><KeyRound size={22}/></div><div className="eyebrow small">ADMIN ONLY</div><h1>관리자 입장</h1><p>서버에 설정된 관리자 비밀번호로 시간표를 관리합니다.</p>
      <form onSubmit={signIn}><label className="form-label" htmlFor="adminPass">관리자 비밀번호</label><input id="adminPass" className="text-input" type="password" autoComplete="current-password" value={password} onChange={(e)=>setPassword(e.target.value)} required/><button className="button primary full" disabled={busy}>{busy?'확인 중...':'관리자 입장'} <ArrowRight size={17}/></button></form>
      <Alert text={error} onClose={()=>setError('')}/>
    </main> : <main className="admin-wrap">
      <div className="page-heading"><div><div className="eyebrow small">WORKSPACE ADMIN</div><h1>시간표 관리</h1><p>시간표 링크는 관리자만 만들 수 있어요.</p></div><button className="button subtle" onClick={()=>{sessionStorage.removeItem('share-timetable:admin');setAuthorized(false);setPassword('');}}><LogOut size={16}/> 로그아웃</button></div>
      <Alert text={error} onClose={()=>setError('')}/>
      {notice && <div className="success-inline"><Check size={16}/>{notice}<button onClick={()=>setNotice('')} aria-label="닫기"><X size={15}/></button></div>}
      <div className="admin-grid">
        <section className="card create-card"><div className="card-heading"><span className="section-icon small-icon"><Plus size={20}/></span><div><h2>새 시간표 만들기</h2><p>팀마다 고유한 주소 키를 발급합니다.</p></div></div>
          <form onSubmit={createRoom} className="stacked-form">
            <label className="form-label" htmlFor="roomTitle">시간표 이름</label>
            <input id="roomTitle" className="text-input" placeholder="예: INDEX 주간 회의" value={title} onChange={e=>setTitle(e.target.value)} minLength={2} maxLength={70} required/>
            <label className="form-label" htmlFor="roomKey">URL 키</label>
            <div className="key-input"><span>/</span><input id="roomKey" className="text-input" placeholder="index-meeting" value={key} onChange={e=>setKey(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,''))} minLength={3} maxLength={48} required/></div>
            <span className="field-hint">영문 소문자·숫자·하이픈만 사용 가능</span>
            <label className="form-label" htmlFor="roomDesc">설명 <span>(선택)</span></label>
            <textarea id="roomDesc" className="text-input textarea" rows="3" placeholder="이 시간표의 용도를 적어주세요." value={description} onChange={e=>setDescription(e.target.value)} maxLength={250}/>
            <button className="button primary full" disabled={busy||!title.trim()||!key.trim()}><Plus size={17}/> 시간표 생성</button>
          </form>
        </section>
        <section className="card rooms-card"><div className="card-heading"><span className="section-icon small-icon amber"><CalendarDays size={20}/></span><div><h2>생성된 시간표 <span className="count-pill">{rooms.length}</span></h2><p>링크 공유, 잠금, 삭제를 관리해요.</p></div></div>
          {rooms.length===0 ? <div className="empty-card"><CalendarDays size={29}/><strong>아직 생성된 시간표가 없어요.</strong><span>왼쪽에서 첫 번째 시간표를 만들어보세요.</span></div> :
          <div className="room-list">{rooms.map(room=><div className="admin-room" key={room.key}>
            <div className="admin-room-top"><div><strong>{room.title}</strong><span>/{room.key}</span></div>{room.locked&&<span className="locked-badge"><Lock size={12}/> 잠김</span>}</div>
            {room.description&&<p>{room.description}</p>}
            <div className="admin-actions"><a className="button mini primary" href={'/'+room.key} target="_blank" rel="noreferrer">열기 <ExternalLink size={14}/></a><button className="button mini subtle" onClick={()=>copyLink(room)}><Copy size={14}/> 복사</button><button className="button mini subtle" onClick={()=>toggleLock(room)}>{room.locked?<Unlock size={14}/>:<Lock size={14}/>} {room.locked?'열기':'잠금'}</button><button className="button mini danger-icon" onClick={()=>deleteRoom(room)} aria-label={room.title+' 삭제'}><Trash2 size={15}/></button></div>
          </div>)}</div>}
        </section>
      </div>
    </main>}
  </div>;
}

function JoinDialog({room, onJoin, busy, error}) {
  const [name,setName]=useState('');
  return <div className="modal-backdrop">
    <div className="join-dialog card" role="dialog" aria-modal="true" aria-labelledby="join-title">
      <span className="section-icon"><UsersRound size={25}/></span>
      <div className="eyebrow small">WELCOME TO SHARETIME</div>
      <h2 id="join-title">함께할 준비 되셨나요?</h2>
      <p>이름을 입력하고 <strong>{room.title}</strong> 시간표에 참여하세요. 별도의 회원가입은 필요 없어요.</p>
      <form onSubmit={(e)=>{e.preventDefault();onJoin(name.trim());}}>
        <label className="form-label" htmlFor="joinName">참여할 이름</label>
        <input id="joinName" className="text-input" autoFocus value={name} onChange={e=>setName(e.target.value)} placeholder="이름을 입력해주세요" maxLength={24} required/>
        <button className="button primary full" disabled={busy||!name.trim()||room.locked}>{busy?<><LoaderCircle className="spin" size={16}/> 참여 중...</>:<>시간표 참여하기 <ArrowRight size={16}/></>}</button>
      </form>
      {room.locked&&<p className="field-error">관리자가 시간표를 잠갔습니다. 지금은 참여할 수 없습니다.</p>}
      <Alert text={error}/>
      <div className="modal-hint"><ShieldCheck size={15}/> 이 브라우저에 개인 수정 권한이 저장됩니다.</div>
    </div>
  </div>;
}

function RoomPage({roomKey}) {
  const [week,setWeek]=useState(()=>monday(todayKST()));
  const [data,setData]=useState(null);
  const [session,setSession]=useState(()=>getSession(roomKey));
  const [nameError,setNameError]=useState('');
  const [busyJoin,setBusyJoin]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [loading,setLoading]=useState(true);
  const [mode,setMode]=useState('all');
  const [selected,setSelected]=useState(null);
  const [pending,setPending]=useState(null);
  const [saveState,setSaveState]=useState('saved');
  const savingQueue=useRef(Promise.resolve());
  const revision=useRef(0);
  const currentWeek=useRef(week);
  const drag=useRef(null);
  const touchPointer=useRef(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const result = await api('/rooms/'+encodeURIComponent(roomKey)+'?week='+week);
      if (currentWeek.current === week) {setData(result);setError('');}
    } catch (e) { if (currentWeek.current === week) setError(e.message); }
    finally {if (currentWeek.current===week) setLoading(false);}
  }, [roomKey,week]);

  useEffect(() => {
    currentWeek.current=week;
    load();
    const timer=setInterval(()=>load(true),10000);
    return ()=>clearInterval(timer);
  },[week,load]);

  useEffect(()=>{
    const stop=()=>{drag.current=null;};
    window.addEventListener('pointerup',stop);
    window.addEventListener('pointercancel',stop);
    return ()=>{window.removeEventListener('pointerup',stop);window.removeEventListener('pointercancel',stop);};
  },[]);

  useEffect(()=>{
    if(session && data && !data.members.some(member=>member.id===session.memberId)){
      localStorage.removeItem(STORAGE_PREFIX+roomKey);
      setSession(null);setPending(null);setMode('all');
    }
  },[session,data,roomKey]);

  const days=useMemo(()=>Array.from({length:7},(_,i)=>shiftDate(week,i)),[week]);
  const members=data?.members||[];
  const baseMap=useMemo(()=>{
    const map=new Map();
    for(const row of data?.slots||[]){
      const key=slotKey(row.date,row.slotIndex);
      if(!map.has(key)) map.set(key,new Set());
      map.get(key).add(row.memberId);
    }
    return map;
  },[data]);
  const serverMine=useMemo(()=>{
    const result=new Set();
    if(session) for(const [key,ids] of baseMap) if(ids.has(session.memberId)) result.add(key);
    return result;
  },[baseMap,session]);
  const mine=pending??serverMine;
  const liveMap=useMemo(()=>{
    const result=new Map([...baseMap].map(([key,ids])=>[key,new Set(ids)]));
    if(session&&pending){
      for(const ids of result.values()) ids.delete(session.memberId);
      for(const key of pending){
        if(!result.has(key)) result.set(key,new Set());
        result.get(key).add(session.memberId);
      }
    }
    return result;
  },[baseMap,pending,session]);

  const total=members.length;
  const selectedIds=selected?liveMap.get(slotKey(selected.date,selected.index))||new Set():new Set();
  const available=members.filter(member=>selectedIds.has(member.id));
  const unavailable=members.filter(member=>!selectedIds.has(member.id));
  const allSlots=useMemo(()=>{
    if(!total)return 0;
    let count=0;
    for(const day of days)for(let i=0;i<48;i++)if((liveMap.get(slotKey(day,i))?.size||0)===total)count++;
    return count;
  },[liveMap,days,total]);

  const recommendations=useMemo(()=>{
    if(!total)return [];
    const result=[];
    for(const date of days){
      let start=null;
      for(let i=0;i<=48;i++){
        const yes=i<48&&(liveMap.get(slotKey(date,i))?.size||0)===total;
        if(yes&&start===null)start=i;
        if(!yes&&start!==null){
          if(i-start>=2)result.push({date,start,end:i,duration:(i-start)*30});
          start=null;
        }
      }
    }
    return result.sort((a,b)=>b.duration-a.duration||a.date.localeCompare(b.date)||a.start-b.start).slice(0,5);
  },[liveMap,days,total]);

  useEffect(()=>{
    if(!pending||!session)return;
    const chosen=pending;
    const thisRevision=revision.current;
    const weekOfChange=week;
    const timer=setTimeout(()=>{
      setSaveState('saving');
      savingQueue.current=savingQueue.current.catch(()=>{}).then(async()=>{
        try{
          const slots=[...chosen].map(key=>{const [date,index]=key.split('|');return {date,slotIndex:Number(index)};});
          await api('/rooms/'+roomKey+'/availability',{method:'PUT',headers:{'x-member-token':session.editToken},body:JSON.stringify({memberId:session.memberId,weekStart:weekOfChange,slots})});
          if(revision.current===thisRevision&&currentWeek.current===weekOfChange){
            setPending(null);setSaveState('saved');await load(true);
          }
        }catch(e){
          if(revision.current===thisRevision){setSaveState('error');setError('저장 실패: '+e.message);}
        }
      });
    },550);
    return ()=>clearTimeout(timer);
  },[pending,session,roomKey,week,load]);

  function changeWeek(offset){
    if(pending||saveState==='saving')return;
    setSelected(null);setPending(null);setWeek(current=>shiftDate(current,offset*7));
  }
  function chooseSlot(date,index,enabled){
    if(!session||data?.room.locked)return;
    const key=slotKey(date,index);
    const shouldEnable=typeof enabled==='boolean'?enabled:!mine.has(key);
    if(mine.has(key)===shouldEnable)return;
    revision.current++;
    setPending(previous=>{
      const next=new Set(previous??serverMine);
      if(shouldEnable)next.add(key);else next.delete(key);
      return next;
    });
    setSaveState('pending');
  }
  function startPointer(e,date,index){
    setSelected({date,index});
    touchPointer.current=e.pointerType==='touch';
    if(mode!=='mine'||!session||data?.room.locked)return;
    if(e.pointerType==='mouse'||e.pointerType==='pen'){
      e.preventDefault();
      const enabled=!mine.has(slotKey(date,index));
      drag.current={enabled};
      chooseSlot(date,index,enabled);
    }
  }
  function enterPointer(date,index){
    if(mode==='mine'&&drag.current)chooseSlot(date,index,drag.current.enabled);
  }
  async function join(name){
    setBusyJoin(true);setNameError('');
    try{
      const result=await api('/rooms/'+roomKey+'/join',{method:'POST',body:JSON.stringify({name})});
      const next={memberId:result.memberId,editToken:result.editToken,name};
      localStorage.setItem(STORAGE_PREFIX+roomKey,JSON.stringify(next));
      setSession(next);setMode('mine');await load(true);
    }catch(e){setNameError(e.message);}
    finally{setBusyJoin(false);}
  }
  async function copyRoomLink(){
    try{await copyText(shareLink(roomKey));setNotice('공유 링크를 복사했어요.');}
    catch {setNotice('복사할 링크: '+shareLink(roomKey));}
    setTimeout(()=>setNotice(''),4000);
  }
  function exitSession(){
    if(pending||saveState==='saving')return;
    if(!window.confirm('다른 이름으로 참여할까요? 기존 시간표는 남아 있으며, 현재 브라우저에서는 기존 이름으로 수정할 수 없게 됩니다.'))return;
    localStorage.removeItem(STORAGE_PREFIX+roomKey);
    setSession(null);setMode('all');setPending(null);
  }
  function slotClass(count){
    if(count===0)return 'heat-none';
    if(total>0&&count===total)return 'heat-all';
    if(count/total>=0.7)return 'heat-high';
    if(count/total>=0.4)return 'heat-mid';
    return 'heat-low';
  }

  if(loading&&!data)return <div className="site-shell"><header className="simple-header"><Brand/></header><Spinner/></div>;
  if(!data)return <div className="site-shell"><header className="simple-header"><Brand/></header><main className="not-found card"><CalendarDays size={35}/><h1>시간표를 찾을 수 없어요</h1><p>{error||'링크를 다시 확인해주세요.'}</p><a href="/" className="button primary">홈으로 돌아가기 <ArrowRight size={16}/></a></main></div>;

  const room=data.room;
  return <div className="site-shell timetable-shell">
    <header className="simple-header timetable-header"><Brand/><div className="header-actions"><span className="secure-label"><ShieldCheck size={14}/> 팀 전용 공간</span><button className="button subtle small-button" onClick={copyRoomLink}><Copy size={16}/> 링크 복사</button></div></header>
    <main className="timetable-wrap">
      <div className="room-heading">
        <div><div className="eyebrow small">SHARED TIMETABLE <span className="divider-dot">·</span> /{room.key}</div><h1>{room.title}</h1><p>{room.description||'우리 팀 모두가 모일 수 있는 시간을 찾아보세요.'}</p></div>
        <div className="heading-right"><div className="members-stack">{members.slice(0,4).map((member,i)=><Initial name={member.name} index={i} key={member.id}/>)}</div><div className="members-summary"><strong>{total}명</strong><span>참여 중</span></div></div>
      </div>
      <Alert text={error} onClose={()=>setError('')}/>
      {notice&&<div className="success-inline"><Check size={16}/>{notice}</div>}
      <section className="stats-grid">
        <div className="stat-card"><div className="stat-icon sky"><UsersRound size={20}/></div><div><span>참여 인원</span><strong>{total}<small>명</small></strong></div></div>
        <div className="stat-card"><div className="stat-icon yellow"><CalendarCheck2 size={20}/></div><div><span>전원 가능 시간</span><strong>{allSlots/2}<small>시간</small></strong></div></div>
        <div className="stat-card"><div className="stat-icon orange"><Clock3 size={20}/></div><div><span>추천 미팅 구간</span><strong>{recommendations.length}<small>개</small></strong></div></div>
      </section>
      <div className="work-area">
        <section className="calendar-card card">
          <div className="calendar-toolbar">
            <div className="week-navigator"><button aria-label="이전 주" onClick={()=>changeWeek(-1)} disabled={Boolean(pending)||saveState==='saving'}><ChevronLeft size={18}/></button><strong>{dateTitle(days[0])} – {dateTitle(days[6])}</strong><span>{week.slice(0,4)}</span><button aria-label="다음 주" onClick={()=>changeWeek(1)} disabled={Boolean(pending)||saveState==='saving'}><ChevronRight size={18}/></button><button className="today-button" onClick={()=>{if(!pending&&saveState!=='saving'){setWeek(monday(todayKST()));setSelected(null);}}} disabled={Boolean(pending)||saveState==='saving'}>이번 주</button></div>
            <div className="mode-toggle" role="group" aria-label="시간표 모드"><button className={mode==='all'?'active':''} onClick={()=>setMode('all')}>전체 현황</button><button className={mode==='mine'?'active':''} onClick={()=>setMode('mine')} disabled={!session}>내 시간 선택</button></div>
          </div>
          <div className="legend-row"><span><i className="legend-box heat-none"/>0명</span><span><i className="legend-box heat-low"/>적음</span><span><i className="legend-box heat-mid"/>보통</span><span><i className="legend-box heat-high"/>많음</span><span><i className="legend-box heat-all"/>전원 가능</span><small>30분 간격 · 00:00–24:00 (KST)</small></div>
          <div className="calendar-scroll" aria-label="주간 가능 시간표"><div className="calendar-grid">
            <div className="cal-top-left">TIME</div>
            {days.map((date,i)=><div className={'cal-day '+(date===todayKST()?'current-day':'')} key={date}><span>{DAY_NAMES[i]}</span><strong>{date.slice(8)}</strong></div>)}
            {Array.from({length:48},(_,index)=><div className="cal-row-fragment" key={index} style={{display:'contents'}}>
              <div className={'cal-time '+(index%2===0?'hour-start':'')}>{timeLabel(index)}</div>
              {days.map(date=>{
                const key=slotKey(date,index);
                const ids=liveMap.get(key)||new Set();
                const isMine=mine.has(key);
                const isSelected=selected?.date===date&&selected?.index===index;
                return <button
                  type="button"
                  key={key}
                  className={'cal-cell '+slotClass(ids.size)+(index%2===0?' hour-start':'')+(isSelected?' selected-cell':'')+(mode==='mine'&&isMine?' mine-cell':'')}
                  onPointerDown={e=>startPointer(e,date,index)}
                  onPointerEnter={()=>enterPointer(date,index)}
                  onClick={e=>{setSelected({date,index});if(mode==='mine'&&(e.detail===0||touchPointer.current))chooseSlot(date,index);}}
                  onKeyDown={e=>{if(e.key==='Enter'||e.key===' ')setSelected({date,index});}}
                  title={dateTitle(date)+' '+timeLabel(index)+' · '+ids.size+'/'+total+'명'+(ids.size?' ('+members.filter(m=>ids.has(m.id)).map(m=>m.name).join(', ')+')':'')}
                  aria-label={date+' '+timeLabel(index)+' '+ids.size+'명 가능'+(isMine?' 내 선택됨':'')}
                  aria-pressed={mode==='mine'?isMine:isSelected}
                >{mode==='mine'?isMine?<Check size={13} strokeWidth={3}/>:null:ids.size>0?<span>{ids.size}</span>:null}</button>;
              })}
            </div>)}
          </div></div>
          <div className="calendar-footer"><div className="save-indicator">{saveState==='saving'?<><LoaderCircle className="spin" size={14}/> 저장 중...</>:saveState==='pending'?<><Clock3 size={14}/> 변경 내용 저장 대기</>:saveState==='error'?<><Info size={14}/> 저장되지 않은 변경 사항</>:<><CheckCheck size={14}/> 자동 저장됨</>}</div><div><span className="desktop-hint">클릭하거나 드래그해서 선택하세요</span><span className="mobile-hint">칸을 터치해 선택하세요</span></div></div>
        </section>
        <aside className="side-panel">
          <section className="card detail-card">
            <div className="card-section-title"><span className="section-icon small-icon sky"><Info size={18}/></span><div><h2>시간 상세</h2><p>선택한 시간의 참여 현황</p></div></div>
            {selected?<><div className="selected-time"><span>{dateTitle(selected.date)} · {DAY_NAMES[days.indexOf(selected.date)]}요일</span><strong>{timeLabel(selected.index)} – {timeLabel(selected.index+1)}</strong><div className="availability-meter"><div style={{width:(total?100*available.length/total:0)+'%'}}/></div><span className="detail-count"><b>{available.length}</b> / {total}명 가능 {total>0&&available.length===total&&<span className="all-pill">전원 가능</span>}</span></div>
              <div className="people-group"><h3><Check size={14}/> 가능한 사람 <span>{available.length}</span></h3>{available.length?available.map(member=><div className="person" key={member.id}><Initial name={member.name} index={members.indexOf(member)}/><span>{member.name}</span>{member.id===session?.memberId&&<small>나</small>}</div>):<p className="empty-hint">아직 가능한 사람이 없어요.</p>}</div>
              <div className="people-group unavailable"><h3><X size={14}/> 선택하지 않은 사람 <span>{unavailable.length}</span></h3>{unavailable.map(member=><div className="person" key={member.id}><Initial name={member.name} index={members.indexOf(member)}/><span>{member.name}</span>{member.id===session?.memberId&&<small>나</small>}</div>)}</div>
            </>:<div className="empty-detail"><CalendarDays size={26}/><strong>시간을 선택해보세요</strong><span>캘린더의 칸을 누르면 누가 가능한지 확인할 수 있어요.</span></div>}
          </section>
          <section className="card recommendations"><div className="card-section-title"><span className="section-icon small-icon amber"><Sparkles size={19}/></span><div><h2>추천 미팅 시간</h2><p>모두가 1시간 이상 가능한 구간</p></div></div>
            {recommendations.length?recommendations.map((item,i)=><button className="recommendation" key={item.date+'-'+item.start} onClick={()=>{setSelected({date:item.date,index:item.start});document.querySelector('.calendar-scroll')?.scrollTo({top:Math.max(0,item.start*32-150),behavior:'smooth'});}}><span className="recommend-rank">{String(i+1).padStart(2,'0')}</span><span><strong>{dateTitle(item.date)} ({DAY_NAMES[days.indexOf(item.date)]})</strong><small>{timeLabel(item.start)} – {timeLabel(item.end)} · {item.duration/60}시간</small></span><ArrowRight size={15}/></button>):<div className="empty-recommend"><Sparkles size={22}/><p>아직 전원 가능한 1시간 이상 구간이 없어요.</p><span>팀원들이 시간을 등록하면 여기에 표시됩니다.</span></div>}
          </section>
          <section className="card roster"><div className="roster-heading"><h2>참여한 팀원 <span className="count-pill">{total}</span></h2>{session&&<button className="muted-link" onClick={exitSession}><LogOut size={14}/> 이름 변경</button>}</div><div className="roster-list">{members.map((member,i)=><div className="person" key={member.id}><Initial name={member.name} index={i}/><span>{member.name}</span>{member.id===session?.memberId&&<small>나</small>}</div>)}{!members.length&&<p className="empty-hint">아직 참여자가 없어요.</p>}</div></section>
        </aside>
      </div>
      <div className="below-note"><Info size={15}/> 모든 시간은 한국 표준시(KST) 기준입니다. 선택하지 않은 시간은 참석 가능으로 집계되지 않습니다.</div>
    </main>
    {!session&&<JoinDialog room={room} onJoin={join} busy={busyJoin} error={nameError}/>}
  </div>;
}

export default function App() {
  const path=decodeURIComponent(window.location.pathname).replace(/\/+$/,'')||'/';
  if(path==='/')return <Landing/>;
  if(path==='/admin')return <AdminPage/>;
  if(/^\/[a-z0-9-]{3,48}$/.test(path))return <RoomPage roomKey={path.slice(1)}/>;
  return <Landing/>;
}
