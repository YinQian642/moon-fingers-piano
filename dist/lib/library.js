// Archived performances already contain an editor-selected melody. Never extract it again.
export function archivedSong(data, entry) {
  const fail = () => { throw Error('曲库乐谱格式不完整，请重新同步档案。'); };
  if (!data || data.schemaVersion !== 1 || data.songId !== entry.id ||
      typeof data.title !== 'string' || typeof data.key !== 'string' ||
      !Number.isFinite(data.duration) || data.duration <= 0 || data.duration > 3600 ||
      !Number.isFinite(data.bpm) || data.bpm <= 0) fail();
  const {notes, cues, accompaniment} = data;
  if (![notes, cues, accompaniment].every(Array.isArray) || !notes.length ||
      notes.length > 60000 || !cues.length || cues.length + accompaniment.length !== notes.length) fail();
  const byId = new Map();
  for (const [i, note] of notes.entries()) {
    if (typeof note.id !== 'string' || byId.has(note.id) ||
        !Number.isInteger(note.midi) || note.midi < 0 || note.midi > 127 ||
        !Number.isFinite(note.time) || note.time < 0 ||
        !Number.isFinite(note.duration) || note.duration <= 0 ||
        note.time + note.duration > data.duration + 1e-5 ||
        !Number.isFinite(note.velocity) || note.velocity < 0 || note.velocity > 1 ||
        (i && note.time < notes[i - 1].time)) fail();
    byId.set(note.id, note);
  }
  const used = new Set();
  for (const sequence of [cues, accompaniment]) {
    for (const [i, note] of sequence.entries()) {
      const original = byId.get(note.id);
      if (!original || used.has(note.id) ||
          ['midi', 'time', 'duration', 'velocity'].some(key => note[key] !== original[key]) ||
          (i && note.time < sequence[i - 1].time)) fail();
      if (sequence === cues && (!Number.isInteger(note.slot) || note.slot < 0 || note.slot > 7 ||
          typeof note.pitch !== 'string' || typeof note.tonic !== 'string' ||
          !['major', 'minor'].includes(note.scale))) fail();
      used.add(note.id);
    }
  }
  return {...data, builtin: false, revision: entry.revision};
}
