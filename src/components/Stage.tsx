import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, Maximize, Pause, Play, RotateCcw, ShieldCheck, Type, X } from 'lucide-react';
import { clock, cues, wordCount, type Preferences, type Speech, type Rehearsal } from '../lib/model';
import { Modal } from './Modal';

export type StageSession = { speech: Speech; mode: 'rehearse' | 'present'; index: number; elapsed: number };
export const SESSION_KEY = 'speakeasy.stage.v1';
export function Stage({ session, preferences, offlineReady, onExit }: { session: StageSession; preferences: Preferences; offlineReady: boolean; onExit: (rehearsal?: Rehearsal) => void }) {
  const blocks = cues(session.speech.content);
  const [index, setIndex] = useState(Math.min(session.index, blocks.length - 1));
  const [elapsed, setElapsed] = useState(session.elapsed);
  const [running, setRunning] = useState(false);
  const [fontSize, setFontSize] = useState(preferences.fontSize);
  const [auto, setAuto] = useState(preferences.autoAdvance);
  const [wake, setWake] = useState(false);
  const [exitConfirm, setExitConfirm] = useState(false);
  const [finished, setFinished] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [view, setView] = useState<'cards' | 'script'>('cards');
  const start = useRef(0), accrued = useRef(session.elapsed), cueStart = useRef(session.elapsed);
  const elapsedRef = useRef(session.elapsed);
  const scroll = useRef<HTMLDivElement>(null);
  const total = session.speech.targetMinutes * 60;
  const next = () => { if (index < blocks.length - 1) { setIndex(i => i + 1); cueStart.current = elapsedRef.current; } else { setRunning(false); setFinished(true); } };
  const previous = () => { setIndex(i => Math.max(0, i - 1)); cueStart.current = elapsedRef.current; };
  useEffect(() => {
    if (!running) return;
    start.current = performance.now();
    const tick = () => { const value = accrued.current + (performance.now() - start.current) / 1000; elapsedRef.current = value; setElapsed(value); };
    const timer = setInterval(tick, 100);
    return () => { clearInterval(timer); accrued.current += (performance.now() - start.current) / 1000; elapsedRef.current = accrued.current; };
  }, [running]);
  useEffect(() => { scroll.current?.scrollTo({ top: 0 }); }, [index, view]);
  useEffect(() => {
    if (!auto || !running || view !== 'cards') return;
    const seconds = Math.max(5, wordCount(blocks[index]) / preferences.pace * 60 + 2);
    if (elapsed - cueStart.current >= seconds) {
      if (index < blocks.length - 1) { setIndex(i => i + 1); cueStart.current = elapsed; }
      else { setRunning(false); setFinished(true); }
    }
  }, [elapsed, auto, running, index, blocks, preferences.pace, view]);
  useEffect(() => {
    try { localStorage.setItem(SESSION_KEY, JSON.stringify({ ...session, index, elapsed: Math.floor(elapsed) })); setSaveFailed(false); }
    catch { setSaveFailed(true); }
  }, [session, index, Math.floor(elapsed)]);
  useEffect(() => {
    let lock: WakeLockSentinel | null = null, active = true;
    const request = async () => {
      if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
      try { const result = await navigator.wakeLock.request('screen'); if (!active) { await result.release(); return; } lock = result; setWake(true); result.addEventListener('release', () => setWake(false)); } catch { setWake(false); }
    };
    void request();
    const visible = () => { if (document.visibilityState === 'visible') void request(); };
    document.addEventListener('visibilitychange', visible);
    return () => { active = false; void lock?.release(); document.removeEventListener('visibilitychange', visible); };
  }, []);
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (exitConfirm || finished) return;
      if (['ArrowRight', 'ArrowDown', 'PageDown'].includes(e.key)) { e.preventDefault(); next(); }
      if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); previous(); }
      if (e.code === 'Space') { e.preventDefault(); setRunning(r => !r); }
      if (e.key === 'Escape') { setRunning(false); setExitConfirm(true); }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  });
  useEffect(() => {
    const prevent = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, []);
  const leave = (completed: boolean) => {
    try { localStorage.removeItem(SESSION_KEY); } catch { /* Session can be dismissed next launch. */ }
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    onExit(session.mode === 'rehearse' && elapsedRef.current >= 1 ? { id: crypto.randomUUID(), speechId: session.speech.id, title: session.speech.title, seconds: Math.round(elapsedRef.current), date: Date.now(), completed } : undefined);
  };
  const renderCue = (text: string) => text.split(/(\[[^\]]*\])/g).map((part, i) => part.startsWith('[') ? <span className="stage-direction" key={i}>{part.slice(1, -1)}</span> : <span key={i}>{part}</span>);
  return <div className={`stage ${elapsed > total ? 'stage-overtime' : ''}`}>
    <header className="stage-header">
      <button className="stage-exit" aria-label="Leave stage" onClick={() => { setRunning(false); setExitConfirm(true); }}><ArrowLeft size={18}/><span>Leave stage</span></button>
      <div className="stage-title"><span>{session.mode === 'rehearse' ? 'REHEARSAL' : 'ON STAGE'}</span><strong>{session.speech.title || 'Untitled speech'}</strong></div>
      <div className="stage-time"><span>{elapsed > total ? 'OVER BY' : 'REMAINING'}</span><strong>{clock(Math.abs(total - elapsed))}</strong></div>
    </header>
    <div className="stage-progress"><span style={{ width: `${Math.min(100, elapsed / total * 100)}%` }}/></div>
    <div className="stage-toolbar">
      <div className="stage-segments"><button className={view === 'cards' ? 'selected' : ''} onClick={() => setView('cards')}>Cue cards</button><button className={view === 'script' ? 'selected' : ''} onClick={() => setView('script')}>Full script</button></div>
      <div className="stage-tools"><button aria-label="Smaller text" disabled={fontSize <= 28} onClick={() => setFontSize(s => Math.max(28, s - 4))}><Type size={15}/><span>−</span></button><button aria-label="Larger text" disabled={fontSize >= 64} onClick={() => setFontSize(s => Math.min(64, s + 4))}><Type size={21}/><span>+</span></button><button aria-label="Full screen" onClick={() => void document.documentElement.requestFullscreen?.().catch(() => {})}><Maximize size={18}/></button></div>
    </div>
    <div ref={scroll} className={`stage-reading ${view === 'script' ? 'full-script' : ''}`} style={{ '--cue-size': `${fontSize}px` } as React.CSSProperties}>
      {view === 'cards' ? <><div className="cue-label">{String(index + 1).padStart(2, '0')} <span>/ {String(blocks.length).padStart(2, '0')}</span></div><div className="cue-text" key={index}>{renderCue(blocks[index] || 'Your next great speech starts here.')}</div>{index < blocks.length - 1 && <div className="next-cue"><span>UP NEXT</span>{blocks[index + 1].replace(/\[[^\]]*\]/g, '').slice(0, 110)}…</div>}</> : blocks.map((block, i) => <div className="script-block" key={i}><span className="cue-label">{String(i + 1).padStart(2, '0')}</span><div className="cue-text">{renderCue(block)}</div></div>)}
    </div>
    <footer className="stage-footer">
      <div className="stage-status"><ShieldCheck size={15}/><span>{saveFailed ? 'Recovery save unavailable' : offlineReady ? 'Offline ready' : 'Script loaded'}<small>{wake ? 'Screen stays awake' : 'Check your screen auto-lock'}</small></span></div>
      <div className="stage-controls"><button aria-label="Previous cue" disabled={index === 0 || view === 'script'} onClick={previous}><ChevronLeft/></button><button className="play-control" onClick={() => setRunning(r => !r)}>{running ? <Pause size={19} fill="currentColor"/> : <Play size={19} fill="currentColor"/>}<span>{running ? 'Pause' : elapsed < 1 ? 'Begin' : 'Resume'}</span></button><button className="next-control" aria-label={index === blocks.length - 1 ? 'Finish speech' : 'Next cue'} onClick={next}>{index === blocks.length - 1 ? <Check/> : <ChevronRight/>}</button></div>
      <label className="auto-control"><input type="checkbox" checked={auto} disabled={view === 'script'} onChange={e => { setAuto(e.target.checked); cueStart.current = elapsedRef.current; }}/><span>Auto advance<small>{preferences.pace} words / min</small></span></label>
    </footer>
    {(exitConfirm || finished) && <Modal title={finished ? 'A moment well spoken.' : 'Leave the stage?'} onClose={() => { setExitConfirm(false); setFinished(false); }}><p className="modal-description">{finished ? `You gave your words ${clock(elapsed)} of attention.${session.mode === 'rehearse' ? ' Your rehearsal will be saved.' : ' Take a breath. You did it.'}` : 'Your script is saved. Leaving ends this session; staying keeps your place and timer.'}</p><div className="modal-actions"><button className="button secondary" onClick={() => { setExitConfirm(false); setFinished(false); }}>{finished ? 'Keep reviewing' : 'Stay here'}</button><button className="button primary" onClick={() => leave(finished)}>{finished ? 'Back to my speeches' : 'End session'}<ArrowRight size={17}/></button></div></Modal>}
  </div>;
}
