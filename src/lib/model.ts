export type Speech = {
  id: string; title: string; event: string; date: string; content: string;
  targetMinutes: number; status: 'draft' | 'ready'; updatedAt: number;
  archived: boolean; sample?: boolean; deleted?: boolean;
};
export type Rehearsal = { id: string; speechId: string; title: string; seconds: number; date: number; completed: boolean };
export type Preferences = { pace: number; fontSize: number; autoAdvance: boolean };
export type Document = { version: 1; speeches: Speech[]; rehearsals: Rehearsal[]; preferences: Preferences; preferencesUpdatedAt: number };
export const defaultPreferences: Preferences = { pace: 130, fontSize: 42, autoAdvance: false };
export function wordCount(text: string) { return text.replace(/\[[^\]]*\]/g, '').trim().split(/\s+/).filter(Boolean).length; }
export function cues(text: string) { return text.split(/\n\s*\n/).map(x => x.trim()).filter(Boolean); }
export function duration(text: string, pace = 130) { return Math.max(1, Math.ceil(wordCount(text) / pace)); }
export function clock(seconds: number) { const s = Math.max(0, Math.floor(seconds)); return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`; }
export function createSpeech(): Speech { return { id: crypto.randomUUID(), title: '', event: '', date: '', content: '', targetMinutes: 5, status: 'draft', archived: false, updatedAt: Date.now() }; }
export function validateDocument(value: unknown): Document {
  if (!value || typeof value !== 'object') throw new Error('This is not a Speakeasy backup.');
  const d = value as Document;
  if (d.version !== 1 || !Array.isArray(d.speeches) || d.speeches.length > 100 || !Array.isArray(d.rehearsals) || d.rehearsals.length > 500) throw new Error('Unsupported or oversized backup.');
  const text = (v: unknown, max: number) => typeof v === 'string' && v.length <= max;
  const num = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
  const ids = new Set<string>();
  const speeches = d.speeches.map(s => {
    if (!s || !text(s.id, 100) || !s.id || ids.has(s.id) || !text(s.title, 150) || !text(s.event, 200) || !text(s.date, 20) || !text(s.content, 50000) || !num(s.targetMinutes, 1, 180) || !num(s.updatedAt, 0, 1e15) || !['ready', 'draft'].includes(s.status) || typeof s.archived !== 'boolean') throw new Error('Invalid speech in backup.');
    ids.add(s.id);
    return { id: s.id, title: s.title, event: s.event, date: s.date, content: s.content, targetMinutes: s.targetMinutes, status: s.status, updatedAt: s.updatedAt, archived: s.archived, sample: !!s.sample, deleted: !!s.deleted };
  });
  const rehearsals = d.rehearsals.map(r => {
    if (!r || !text(r.id, 100) || !text(r.speechId, 100) || !text(r.title, 150) || !num(r.seconds, 0, 86400) || !num(r.date, 0, 1e15) || typeof r.completed !== 'boolean') throw new Error('Invalid rehearsal in backup.');
    return { id: r.id, speechId: r.speechId, title: r.title, seconds: r.seconds, date: r.date, completed: r.completed };
  });
  const p = d.preferences;
  if (!p || !num(p.pace, 80, 200) || !num(p.fontSize, 28, 64) || typeof p.autoAdvance !== 'boolean' || !num(d.preferencesUpdatedAt, 0, 1e15)) throw new Error('Invalid preferences in backup.');
  return { version: 1, speeches, rehearsals, preferences: { pace: p.pace, fontSize: p.fontSize, autoAdvance: p.autoAdvance }, preferencesUpdatedAt: d.preferencesUpdatedAt };
}
const same = (a: Speech | undefined, b: Speech | undefined) => JSON.stringify(a) === JSON.stringify(b);
export function mergeDocuments(local: Document, remote: Document, base: Document | null): Document {
  local = validateDocument(local); remote = validateDocument(remote); base = base ? validateDocument(base) : null;
  const l = new Map(local.speeches.map(s => [s.id, s]));
  const r = new Map(remote.speeches.map(s => [s.id, s]));
  const b = new Map(base?.speeches.map(s => [s.id, s]) ?? []);
  const speeches: Speech[] = [];
  for (const id of new Set([...l.keys(), ...r.keys()])) {
    const left = l.get(id), right = r.get(id), before = b.get(id);
    if (!left) { speeches.push(right!); continue; }
    if (!right || same(left, right) || same(right, before)) { speeches.push(left); continue; }
    if (same(left, before)) { speeches.push(right); continue; }
    // Preserve concurrent edits instead of silently overwriting a speaker's words.
    if (left.deleted !== right.deleted) { speeches.push(left.deleted ? right : left); continue; }
    speeches.push(right);
    if (!left.deleted) speeches.push({ ...left, id: crypto.randomUUID(), title: `${left.title.slice(0, 130)} (recovered copy)`, updatedAt: Date.now() });
  }
  const rehearsals = [...new Map([...remote.rehearsals, ...local.rehearsals].map(r => [r.id, r])).values()].sort((a,b) => b.date - a.date).slice(0,500);
  const pref = local.preferencesUpdatedAt >= remote.preferencesUpdatedAt ? local : remote;
  return validateDocument({ version: 1, speeches, rehearsals, preferences: pref.preferences, preferencesUpdatedAt: pref.preferencesUpdatedAt });
}
export function initialDocument(): Document {
  const seed = (id: string, title: string, event: string, content: string, targetMinutes: number, status: 'ready' | 'draft'): Speech => ({ id, title, event, date: '', content, targetMinutes, status, archived: false, sample: true, updatedAt: 1 });
  return { version: 1, preferences: { ...defaultPreferences }, preferencesUpdatedAt: 1, rehearsals: [], speeches: [
    seed('sample-keynote', 'The future is built together.', 'Annual leadership summit', `[LOOK UP · TAKE A BREATH]\nGood morning, everyone. Before we talk about where we’re going, I want to recognize the people who brought us here. Every person in this room has helped build something worth believing in.\n\nWe often describe the future as something that happens to us. A new technology. A shift in our industry. A challenge we didn’t see coming. But the most important part of the future is the part we choose to build.\n\n[PAUSE]\nThink about the best work you’ve ever done. Chances are, you didn’t do it alone. There was someone who asked a better question. Someone who saw something you missed. Someone who believed in an idea before it was obvious. That is the power we have in this room.\n\nOur opportunity is simple: make it easier for good people to do extraordinary work. That means listening before we decide. Being clear about what matters. And having the courage to stop doing the things that no longer serve our purpose.\n\n[SLOW DOWN]\nI’m asking three things of us. First, stay curious. The next great idea may come from the person who speaks last. Second, make space for each other. Progress is a team effort. And third, take the next step. We don’t need every answer to begin.\n\n[LOOK UP]\nThe future isn’t waiting for us. It’s waiting to be built by us. Together. Thank you.`, 3, 'ready'),
    seed('sample-team', 'Small wins. Real momentum.', 'Team all-hands', `[SMILE]\nBefore we get into the numbers, let’s talk about the work behind them. This team has made real progress, one thoughtful decision at a time.\n\nThe small wins matter. A problem solved for a customer. A teammate who stepped in to help. A process made a little simpler. None of these moments makes the headlines. Together, they change everything.\n\n[PAUSE]\nThis week, pick one thing you can make better. Not ten things. One. Give it your attention, ask for help when you need it, and share what you learn.\n\nThat’s how we build momentum. Thank you for showing up for the work, and for each other.`, 2, 'ready'),
    seed('sample-toast', 'To the people who make it possible.', 'A note of appreciation', `[TAKE A BREATH]\nI want to take a moment to recognize the people who rarely ask for recognition.\n\nThe ones who notice the details. Who stay curious when things get difficult. Who make the people around them better.\n\n[ADD A PERSONAL STORY HERE]\nThink of one specific moment that captures what this person or team means to you.\n\nThank you for everything you bring to this work. We are better because you are here.`, 2, 'draft'),
  ] };
}
