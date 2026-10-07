import React, { useEffect, useMemo, useState } from 'react';
import { Icon } from './icons';

const bridge = window.relay || {
  getSessions: async () => [], renameSession: async () => {}, saveNotes: async () => {},
  saveTags: async () => {}, deleteSession: async () => true, resumeSession: async () => {},
  getContextPacket: async s => `# Context handoff\n\nContinue “${s.displayName || s.title}” from the last checkpoint.`,
  switchContext: async () => {}, openUrl: url => window.open(url, '_blank'),
  hideWindow: () => {}, getAutoLaunch: async () => false, setAutoLaunch: async () => {},
  getAppInfo: async () => ({ version: '1.4.0', arch: 'x64', packaged: false }),
  savePin: async () => {}, onSessionsChanged: () => () => {},
  getSystemStatus: async () => ({ terminal: false, claude: false, codex: false, sessionRoots: [] }),
  getDiagnostics: async () => ({}), exportUserData: async () => ({ok:false}), importUserData: async () => ({ok:false}),
  copyText: async value => { await navigator.clipboard.writeText(value); return true; },
};

const ago = value => {
  const mins = Math.max(0, Math.floor((Date.now() - value) / 60000));
  if (mins < 1) return 'now'; if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60); if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};
const projectName = s => (s.projectPath || s.projectDirName || 'Workspace').split(/[\\/]/).filter(Boolean).pop();
const accentFor = tool => tool === 'codex' ? '#69dbb8' : '#c3a7ff';

function App() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('sessions');
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState('all');
  const [panel, setPanel] = useState(null);
  const [toast, setToast] = useState('');
  const [autoLaunch, setAutoLaunch] = useState(false);
  const [appInfo, setAppInfo] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [systemStatus, setSystemStatus] = useState(null);
  const [onboarding, setOnboarding] = useState(() => localStorage.getItem('relay-onboarded-v1') !== '1');
  const [diagnostics, setDiagnostics] = useState(null);
  const [webHandoff, setWebHandoff] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try { setSessions(await bridge.getSessions()); setLoadError(''); }
    catch (error) { setLoadError('Relay could not read your session folders.'); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    refresh();
    bridge.getAutoLaunch().then(setAutoLaunch);
    bridge.getAppInfo().then(setAppInfo);
    bridge.getSystemStatus().then(setSystemStatus);
    const stopWatching = bridge.onSessionsChanged(refresh);
    const timer = setInterval(refresh, 30000);
    const onVisible = () => !document.hidden && refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(timer); stopWatching?.(); document.removeEventListener('visibilitychange', onVisible); };
  }, []);
  useEffect(() => {
    const key = e => { if (e.key === 'Escape') panel ? setPanel(null) : bridge.hideWindow(); if (e.key === '/' && !/INPUT|TEXTAREA/.test(e.target.tagName)) { e.preventDefault(); document.querySelector('#search')?.focus(); } };
    addEventListener('keydown', key); return () => removeEventListener('keydown', key);
  }, [panel]);
  const notify = msg => { setToast(msg); setTimeout(() => setToast(''), 2200); };
  const tags = [...new Set(sessions.flatMap(s => s.tags || []))];
  const visible = useMemo(() => sessions.filter(s => {
    const haystack = `${s.displayName || s.title} ${projectName(s)} ${(s.tags || []).join(' ')}`.toLowerCase();
    return haystack.includes(query.toLowerCase()) && (tag === 'all' || s.tags?.includes(tag));
  }).sort((a,b) => Number(b.pinned) - Number(a.pinned) || b.modifiedAt - a.modifiedAt), [sessions, query, tag]);

  const openPanel = async (type, session) => {
    setPanel({ type, session, value: type === 'notes' ? session.notes || '' : type === 'rename' ? session.displayName || session.title : '', packet: type === 'context' ? 'Preparing context…' : '' });
    if (type === 'context') setPanel(p => ({ ...p, packet: '' }));
    if (type === 'context') {
      const packet = await bridge.getContextPacket(session);
      setPanel(p => p?.session.id === session.id ? { ...p, packet } : p);
    }
  };
  const saveNote = async () => { await bridge.saveNotes(panel.session.id, panel.value); setSessions(v => v.map(s => s.id === panel.session.id ? { ...s, notes: panel.value } : s)); setPanel(null); notify('Note saved'); };
  const addTag = async value => { const clean = value.trim().replace(/^#/, '').toLowerCase(); if (!clean) return; const next = [...new Set([...(panel.session.tags || []), clean])]; await bridge.saveTags(panel.session.id, next); setSessions(v => v.map(s => s.id === panel.session.id ? { ...s, tags: next } : s)); setPanel(p => ({ ...p, session: { ...p.session, tags: next }, value: '' })); };
  const removeTag = async value => { const next = panel.session.tags.filter(t => t !== value); await bridge.saveTags(panel.session.id, next); setSessions(v => v.map(s => s.id === panel.session.id ? { ...s, tags: next } : s)); setPanel(p => ({ ...p, session: { ...p.session, tags: next } })); };

  return <div className="shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark"><Icon name="bolt" size={15}/></span><span>relay</span><i>beta</i></div>
      <div className="top-actions"><span className="live"><b/>LIVE</span><button className="icon-btn" onClick={() => bridge.hideWindow()} aria-label="Close"><Icon name="close" size={17}/></button></div>
    </header>

    <main>
      {tab === 'sessions' && <SessionsView {...{ loading, loadError, visible, query, setQuery, tags, tag, setTag, openPanel, refresh, notify, setSessions, openWebHandoff: () => setWebHandoff(true) }} />}
      {tab === 'focus' && <FocusView sessions={sessions} openPanel={openPanel} notify={notify} />}
      {tab === 'stats' && <StatsView sessions={sessions} />}
      {tab === 'settings' && <SettingsView appInfo={appInfo} systemStatus={systemStatus} refreshStatus={() => bridge.getSystemStatus().then(setSystemStatus)} showOnboarding={() => setOnboarding(true)} showDiagnostics={async () => setDiagnostics(await bridge.getDiagnostics())} exportData={async () => { const r=await bridge.exportUserData(); if(!r.canceled) notify(r.ok?'Backup exported':r.error||'Export failed'); }} importData={async () => { const r=await bridge.importUserData(); if(!r.canceled){notify(r.ok?'Backup restored':r.error||'Restore failed'); if(r.ok) refresh();} }} autoLaunch={autoLaunch} setAutoLaunch={async v => { setAutoLaunch(v); await bridge.setAutoLaunch(v); notify(v ? 'Launch at login enabled' : 'Launch at login disabled'); }} />}
    </main>

    <nav>{[['sessions','sessions','Sessions'],['focus','focus','Focus'],['stats','stats','Insights'],['settings','settings','Settings']].map(([id,icon,label]) => <button className={tab === id ? 'active' : ''} key={id} onClick={() => setTab(id)}><Icon name={icon}/><span>{label}</span></button>)}</nav>
    {panel && <Drawer panel={panel} setPanel={setPanel} saveNote={saveNote} addTag={addTag} removeTag={removeTag} refresh={refresh} notify={notify}/>} 
    {diagnostics && <Diagnostics data={diagnostics} close={() => setDiagnostics(null)} />}
    {webHandoff && <WebHandoff close={() => setWebHandoff(false)} notify={notify} />}
    {onboarding && <Onboarding status={systemStatus} sessionCount={sessions.length} finish={() => { localStorage.setItem('relay-onboarded-v1','1'); setOnboarding(false); }} />}
    {toast && <div className="toast"><Icon name="check" size={15}/>{toast}</div>}
  </div>;
}

function SessionsView({ loading, loadError, visible, query, setQuery, tags, tag, setTag, openPanel, refresh, notify, setSessions, openWebHandoff }) {
  const togglePin = async session => { const pinned = !session.pinned; await bridge.savePin(session.id, pinned); setSessions(rows => rows.map(s => s.id === session.id ? {...s,pinned} : s)); notify(pinned ? 'Added to Focus Queue' : 'Removed from Focus Queue'); };
  return <>
    <section className="hero"><p className="eyebrow">YOUR WORKSTREAM</p><h1>Pick up the thread.</h1><p>Every AI session, one calm place.</p></section>
    <div className="search"><Icon name="search" size={17}/><input id="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search sessions or projects…"/><kbd>/</kbd></div>
    <button className="web-handoff-cta" onClick={openWebHandoff}><span><Icon name="globe" size={18}/></span><span><b>Free AI handoff</b><small>Continue in Claude, ChatGPT, Gemini or Perplexity</small></span><Icon name="arrow" size={16}/></button>
    {tags.length > 0 && <div className="chips"><button className={tag === 'all' ? 'selected' : ''} onClick={() => setTag('all')}>All</button>{tags.map(t => <button key={t} className={tag === t ? 'selected' : ''} onClick={() => setTag(t)}>#{t}</button>)}</div>}
    <div className="section-head"><span>{visible.length} {visible.length === 1 ? 'THREAD' : 'THREADS'}</span><button onClick={refresh}>Refresh</button></div>
    <div className="session-list">
      {loading ? [1,2,3].map(i => <div className="skeleton" key={i}/>) : loadError ? <div className="empty error"><h3>Session scan paused</h3><p>{loadError}</p><button className="secondary" onClick={refresh}>Try again</button></div> : visible.length ? visible.map(s => <SessionCard key={s.id} session={s} openPanel={openPanel} notify={notify} togglePin={togglePin}/>) : <EmptyState hasQuery={!!query || tag !== 'all'}/>} 
    </div>
  </>;
}

function SessionCard({ session: s, openPanel, notify, togglePin }) {
  const resume = async () => { const result = await bridge.resumeSession(s); notify(result?.ok ? 'Opening session' : result?.error || 'Could not open session'); };
  return <article className="session" style={{ '--accent': accentFor(s.tool) }}>
    <button className="session-main" onClick={resume}>
      <span className="tool-avatar">{s.tool === 'codex' ? 'CX' : 'CL'}</span>
      <span className="session-copy"><strong>{s.displayName || s.title}</strong><small><span>{projectName(s)}</span><i/> {s.messageCount || 0} events <i/> {ago(s.modifiedAt)} ago</small>{s.tags?.length > 0 && <span className="tag-row">{s.tags.slice(0,3).map(t => <em key={t}>#{t}</em>)}</span>}</span>
      <span className="go"><Icon name="arrow" size={16}/></span>
    </button>
    <div className="card-actions"><button onClick={() => openPanel('context', s)}><Icon name="switch" size={15}/> Handoff</button><button className={s.pinned?'pinned':''} title="Focus Queue" onClick={() => togglePin(s)}><Icon name="pin" size={15}/></button><button title="Rename" onClick={() => openPanel('rename', s)}><Icon name="edit" size={15}/></button><button title="Notes" onClick={() => openPanel('notes', s)}><Icon name="note" size={15}/></button><button title="Tags" onClick={() => openPanel('tags', s)}><Icon name="tag" size={15}/></button></div>
  </article>;
}

function EmptyState({ hasQuery }) { return <div className="empty"><span><Icon name="spark" size={22}/></span><h3>{hasQuery ? 'No matching threads' : 'Your next thread starts here'}</h3><p>{hasQuery ? 'Try a different keyword or filter.' : 'Use Free AI Handoff or continue a local coding session.'}</p></div>; }

function FocusView({ sessions, openPanel, notify }) {
  const latest = sessions.find(s => s.pinned) || sessions[0];
  const resume = async () => { const result=await bridge.resumeSession(latest); notify(result?.ok?'Opening session':result?.error||'Could not open session'); };
  return <section className="page"><p className="eyebrow">FOCUS MODE</p><h1>One thread. No noise.</h1><p className="lead">Return to the work with the strongest momentum.</p>{latest ? <div className="focus-card" style={{ '--accent': accentFor(latest.tool) }}><div className="focus-orbit"><span>{latest.tool === 'codex' ? 'CX' : 'CL'}</span></div><p>{latest.pinned ? 'PINNED IN FOCUS QUEUE' : 'READY TO CONTINUE'}</p><h2>{latest.displayName || latest.title}</h2><small>{projectName(latest)} · active {ago(latest.modifiedAt)} ago</small><button className="primary" onClick={resume}><Icon name="play" size={17}/> Resume thread</button><button className="secondary" onClick={() => openPanel('context', latest)}><Icon name="switch" size={16}/> Start a clean handoff</button></div> : <EmptyState/>}</section>;
}

function StatsView({ sessions }) {
  const now = Date.now(), today = sessions.filter(s => now - s.modifiedAt < 86400000).length, week = sessions.filter(s => now - s.modifiedAt < 604800000).length;
  const projects = Object.entries(sessions.reduce((a,s) => { const p=projectName(s); a[p]=(a[p]||0)+1; return a; },{})).sort((a,b)=>b[1]-a[1]).slice(0,4);
  const max = Math.max(1, ...projects.map(x=>x[1]));
  return <section className="page"><p className="eyebrow">WORK RHYTHM</p><h1>Momentum, not metrics.</h1><p className="lead">A lightweight view of where your attention goes.</p><div className="metric-grid"><div><b>{sessions.length}</b><span>Total threads</span></div><div><b>{today}</b><span>Active today</span></div><div><b>{week}</b><span>This week</span></div></div><div className="insight-card"><div className="section-head"><span>PROJECT PULSE</span><small>Last activity</small></div>{projects.length ? projects.map(([p,n]) => <div className="bar-row" key={p}><div><span>{p}</span><b>{n}</b></div><i><em style={{width:`${n/max*100}%`}}/></i></div>) : <p className="muted">Activity will appear once sessions are detected.</p>}</div></section>;
}

function SettingsView({ autoLaunch, setAutoLaunch, appInfo, systemStatus, refreshStatus, showOnboarding, showDiagnostics, exportData, importData }) { const health=[['Windows Terminal',systemStatus?.terminal],['Claude CLI',systemStatus?.claude],['Codex CLI',systemStatus?.codex]]; return <section className="page"><p className="eyebrow">PREFERENCES</p><h1>Make Relay yours.</h1><p className="lead">Quiet defaults. Fast when you need it.</p><div className="settings-card"><Setting title="Launch at sign-in" detail="Keep Relay ready in the system tray"><Toggle value={autoLaunch} onChange={setAutoLaunch}/></Setting><Setting title="Global shortcut" detail="Open Relay from anywhere"><kbd>Ctrl Shift Space</kbd></Setting><Setting title="Local-first data" detail="Session metadata stays on this device"><span className="status-pill">Protected</span></Setting><Setting title="Release channel" detail={appInfo?.packaged ? 'Installed Windows build' : 'Development build'}><span className="status-pill neutral">Manual</span></Setting></div><div className="health-card"><div className="section-head"><span>INTEGRATION HEALTH</span><button onClick={refreshStatus}>Recheck</button></div>{health.map(([name,ready])=><div className="health-row" key={name}><span><i className={ready?'ready':''}/>{name}</span><b className={ready?'ready':''}>{ready?'Ready':'Not found'}</b></div>)}</div><div className="data-card"><p>DATA & SUPPORT</p><div><button onClick={exportData}>Export backup</button><button onClick={importData}>Restore backup</button><button onClick={showDiagnostics}>Diagnostics</button><button onClick={showOnboarding}>Setup guide</button></div></div><div className="quick"><p>QUICK LAUNCH</p><div>{[['Claude','https://claude.ai'],['ChatGPT','https://chatgpt.com'],['Perplexity','https://perplexity.ai'],['Gemini','https://gemini.google.com']].map(([n,u])=><button key={n} onClick={()=>bridge.openUrl(u)}>{n}<Icon name="arrow" size={14}/></button>)}</div></div><p className="version">Relay {appInfo?.version || '1.1.0'} · {appInfo?.arch || 'x64'} · Built for flow</p></section>; }
function Setting({title,detail,children}) { return <div className="setting"><div><strong>{title}</strong><small>{detail}</small></div>{children}</div>; }
function Toggle({value,onChange}) { return <button aria-label="Toggle" className={`toggle ${value?'on':''}`} onClick={()=>onChange(!value)}><i/></button>; }

function WebHandoff({ close, notify }) {
  const [title,setTitle]=useState(''); const [context,setContext]=useState(''); const [next,setNext]=useState('');
  const [provider,setProvider]=useState('claude');
  const [recent]=useState(()=>{try{return JSON.parse(localStorage.getItem('relay-web-handoffs')||'[]').slice(0,3)}catch(e){return[]}});
  const providers={claude:{name:'Claude',url:'https://claude.ai'},chatgpt:{name:'ChatGPT',url:'https://chatgpt.com'},gemini:{name:'Gemini',url:'https://gemini.google.com'},perplexity:{name:'Perplexity',url:'https://perplexity.ai'}};
  const makePacket=()=>`# Relay Context Handoff\n\n## Project\n${title.trim()||'Untitled project'}\n\n## Context so far\n${context.trim()||'(No context supplied)'}\n\n## What to do next\n${next.trim()||'Continue helping me from this context.'}\n\nPlease continue directly. Ask only for information that is genuinely missing.`;
  const saveMemory=packet=>{ try { const old=JSON.parse(localStorage.getItem('relay-web-handoffs')||'[]'); localStorage.setItem('relay-web-handoffs',JSON.stringify([{id:Date.now(),title:title.trim()||'Untitled project',provider,packet,createdAt:Date.now()},...old].slice(0,20))); } catch(e){} };
  const launch=async()=>{ const packet=makePacket(); await bridge.copyText(packet); saveMemory(packet); await bridge.openUrl(providers[provider].url); notify(`Copied — paste into ${providers[provider].name}`); close(); };
  return <div className="overlay web-overlay" onMouseDown={e=>e.target===e.currentTarget&&close()}><section className="drawer web-drawer"><div className="grab"/><header><div><p>UNIVERSAL FREE MODE</p><h2>Carry context anywhere</h2></div><button className="icon-btn" onClick={close}><Icon name="close" size={17}/></button></header><p className="web-intro">No API key or paid plan needed. Relay copies a clean handoff, then opens your chosen free AI.</p>{recent.length>0&&<div className="recent-handoffs"><span>RECENT</span>{recent.map(item=><button key={item.id} onClick={()=>{setTitle(item.title);setContext(item.packet);setProvider(item.provider||'claude')}}>{item.title}<Icon name="arrow" size={12}/></button>)}</div>}<label className="field-label">PROJECT OR TASK<input maxLength="120" value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Portfolio website"/></label><label className="field-label">CONTEXT SO FAR<textarea maxLength="30000" value={context} onChange={e=>setContext(e.target.value)} placeholder="Paste the useful part of your conversation, decisions, code notes or summary…"/></label><label className="field-label">NEXT MOVE<textarea className="short" maxLength="5000" value={next} onChange={e=>setNext(e.target.value)} placeholder="What should the next AI do?"/></label><div className="provider-grid">{Object.entries(providers).map(([id,p])=><button className={provider===id?'selected':''} key={id} onClick={()=>setProvider(id)}><span>{p.name.slice(0,2).toUpperCase()}</span>{p.name}</button>)}</div><button className="primary wide" onClick={launch}><Icon name="copy" size={16}/> Copy context & open {providers[provider].name}</button><p className="hint center">After the website opens, paste with Ctrl + V.</p></section></div>;
}

function Onboarding({ status, sessionCount, finish }) {
  return <div className="onboarding"><div className="onboard-card"><div className="onboard-mark"><Icon name="bolt" size={24}/></div><p className="eyebrow">WELCOME TO RELAY</p><h2>Your AI work has a home.</h2><p className="onboard-lead">Move context between free AI websites, or resume supported local coding sessions.</p><div className="setup-list"><div className="done"><Icon name="check"/><span><b>Free web mode</b><small>Claude, ChatGPT, Gemini and Perplexity ready</small></span></div><div className="done"><Icon name="check"/><span><b>Local memory</b><small>{sessionCount} coding thread{sessionCount===1?'':'s'} found · handoffs stay private</small></span></div><div className={status?.codex||status?.claude?'done':''}><Icon name={status?.codex||status?.claude?'check':'spark'}/><span><b>Enhanced CLI mode</b><small>{[status?.codex&&'Codex',status?.claude&&'Claude'].filter(Boolean).join(' + ')||'Optional — free web mode is ready'}</small></span></div></div><button className="primary" onClick={finish}>Enter Relay</button><small className="privacy-note">No API key required. Your context stays on this device.</small></div></div>;
}

function Diagnostics({ data, close }) {
  const rows = [
    ['Relay', data.app?.version], ['Build', data.app?.packaged?'Packaged':'Development'],
    ['Platform', `${data.app?.platform || 'unknown'} · ${data.app?.arch || 'unknown'}`],
    ['Sessions', data.sessionCount], ['Windows Terminal', data.integrations?.terminal?'Ready':'Not found'],
    ['Claude CLI', data.integrations?.claude?'Ready':'Not found'], ['Codex CLI', data.integrations?.codex?'Ready':'Not found'],
  ];
  return <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&close()}><section className="drawer diagnostics"><div className="grab"/><header><div><p>SYSTEM SNAPSHOT</p><h2>Relay diagnostics</h2></div><button className="icon-btn" onClick={close}><Icon name="close" size={17}/></button></header><div className="diag-grid">{rows.map(([k,v])=><div key={k}><span>{k}</span><b>{String(v ?? 'Checking…')}</b></div>)}</div><div className="diag-path"><span>LOCAL DATA DIRECTORY</span><code>{data.dataDirectory}</code></div><p className="hint">This snapshot contains system status only. It does not include conversation content.</p><button className="primary wide" onClick={close}>Done</button></section></div>;
}

function Drawer({ panel, setPanel, saveNote, addTag, removeTag, refresh, notify }) {
  const { type, session } = panel;
  const deleteIt = async () => { if (!confirm('Move this session to the Recycle Bin?')) return; await bridge.deleteSession(session.filePath); setPanel(null); await refresh(); notify('Session moved to Recycle Bin'); };
  const rename = async e => { e.preventDefault(); const value=panel.value.trim(); if(!value)return; await bridge.renameSession(session.id,value); setPanel(null); await refresh(); notify('Thread renamed'); };
  const startHandoff = async () => { const result=await bridge.switchContext(session); if(result?.ok){setPanel(null);notify('Starting handoff');} else notify(result?.error||'Could not start handoff'); };
  return <div className="overlay" onMouseDown={e => e.target === e.currentTarget && setPanel(null)}><section className="drawer"><div className="grab"/><header><div><p>{type === 'context' ? 'SMART HANDOFF' : type === 'notes' ? 'SESSION NOTE' : type === 'rename' ? 'RENAME THREAD' : 'ORGANIZE'}</p><h2>{session.displayName || session.title}</h2></div><button className="icon-btn" onClick={() => setPanel(null)}><Icon name="close" size={17}/></button></header>{type === 'rename' && <form className="rename-form" onSubmit={rename}><input autoFocus maxLength="120" value={panel.value} onChange={e=>setPanel({...panel,value:e.target.value})}/><button className="primary">Save name</button></form>}{type === 'notes' && <><textarea autoFocus value={panel.value} onChange={e => setPanel({...panel,value:e.target.value})} placeholder="Capture the decision, blocker, or next move…"/><button className="primary wide" onClick={saveNote}>Save note</button></>}{type === 'tags' && <><div className="tag-editor">{session.tags?.map(t=><button onClick={()=>removeTag(t)} key={t}>#{t} ×</button>)}</div><form className="tag-input" onSubmit={e=>{e.preventDefault();addTag(panel.value)}}><input autoFocus value={panel.value} onChange={e=>setPanel({...panel,value:e.target.value})} placeholder="Add a tag…"/><button><Icon name="plus" size={17}/></button></form><p className="hint">Tags are private and stored only on this device.</p><button className="danger" onClick={deleteIt}><Icon name="trash" size={16}/> Move session to Recycle Bin</button></>}{type === 'context' && <><div className="context-box"><span><Icon name="spark" size={16}/> CONTEXT PACKET</span><pre>{panel.packet || 'Preparing context…'}</pre></div><p className="hint">Starts a fresh AI session with the recent decisions and conversation attached.</p><button className="primary wide" disabled={!panel.packet} onClick={startHandoff}><Icon name="switch" size={17}/> Start handoff</button></>}</section></div>;
}

export default App;
