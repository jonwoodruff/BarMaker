/** Pure performance-to-ABC conversion. Times are seconds from the first recorded beat. */
export const METERS=['2/4','3/4','4/4','5/4','6/8','7/8','9/8','12/8'];
export function configuration({meter='4/4',tempo=96,bars=2,grid=8,countIn=true}={}) {
  if(!METERS.includes(meter))throw new RangeError('Choose a supported meter.');
  tempo=Number(tempo);bars=Number(bars);grid=Number(grid);
  if(!Number.isFinite(tempo)||tempo<40||tempo>240)throw new RangeError('Tempo must be between 40 and 240 quarter notes per minute.');
  if(!Number.isInteger(bars)||bars<1||bars>8)throw new RangeError('Record between one and eight bars.');
  if(![8,16].includes(grid))throw new RangeError('Choose an eighth-note or sixteenth-note grid.');
  return {meter,tempo,bars,grid,countIn:Boolean(countIn)};
}
export function timing(config) {
  const c=configuration(config),[beats,denominator]=c.meter.split('/').map(Number);
  const pulse=60/c.tempo*4/denominator;
  return {...c,beats,denominator,pulse,barSeconds:beats*pulse,tickSeconds:60/c.tempo*4/c.grid,ticksPerBar:beats*c.grid/denominator};
}
const NAMES=['C','^C','D','^D','E','F','^F','G','^G','A','^A','B'];
export function midiName(midi) {
  if(!Number.isInteger(midi)||midi<36||midi>95)throw new RangeError('Notes must be in C2–B6.');
  const octave=Math.floor(midi/12)-1,pitch=NAMES[midi%12];
  const accidental=pitch.startsWith('^')?'^':'';const letter=pitch.at(-1);
  return accidental+(octave>=5?letter.toLowerCase():letter)+(octave>=6?"'".repeat(octave-5):octave<4?','.repeat(4-octave):'');
}
export function noteLabel(midi) {
  return ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][((midi%12)+12)%12]+(Math.floor(midi/12)-1);
}
export function frequencyToMidi(hz){return 69+12*Math.log2(hz/440);}
export function midiFrequency(midi){return 440*2**((midi-69)/12);}
/** Quantize without overlaps. A later onset wins; retriggers of the same pitch stay separate. */
export function quantize(events,config) {
  const t=timing(config),total=t.bars*t.ticksPerBar;
  const ordered=events.filter(e=>Number.isFinite(e.start)&&Number.isFinite(e.end)&&e.end>e.start&&Number.isInteger(e.midi)&&e.midi>=36&&e.midi<=95&&e.end>0&&e.start<t.barSeconds*t.bars)
    .map(e=>({midi:e.midi,start:Math.max(0,Math.min(total-1,Math.round(e.start/t.tickSeconds))),end:Math.max(0,Math.min(total,Math.round(e.end/t.tickSeconds)))}))
    .sort((a,b)=>a.start-b.start);
  const notes=[];
  for(const event of ordered) {
    event.end=Math.min(total,Math.max(event.start+1,event.end));
    while(notes.length&&notes.at(-1).start===event.start)notes.pop();
    if(notes.length&&notes.at(-1).end>event.start)notes.at(-1).end=event.start;
    notes.push(event);
  }
  const segments=[];let cursor=0;
  for(const note of notes){if(note.start>cursor)segments.push({midi:null,start:cursor,end:note.start});if(note.end>note.start)segments.push(note);cursor=note.end;}
  if(cursor<total)segments.push({midi:null,start:cursor,end:total});
  return segments;
}
/** Spell durations across beats/bar lines; carry accidentals correctly within each bar. */
export function performanceToABC(events,config) {
  const t=timing(config),segments=quantize(events,t),bars=Array.from({length:t.bars},()=>[]);
  const accidentalStates=Array.from({length:t.bars},()=>new Map());
  const ticksPerBeat=t.grid/t.denominator;
  for(const segment of segments) {
    let cursor=segment.start;
    while(cursor<segment.end) {
      const bar=Math.floor(cursor/t.ticksPerBar),barEnd=(bar+1)*t.ticksPerBar;
      const nextBeat=(Math.floor(cursor/ticksPerBeat)+1)*ticksPerBeat;
      // Split at beats for clear notation, preserving long notes with ties.
      const remaining=Math.min(segment.end,barEnd)-cursor;
      const durations=[1,2,3,4,6,8,12,16,24,32,48,64];
      const limit=cursor%ticksPerBeat?Math.min(remaining,nextBeat-cursor):remaining;
      const duration=durations.filter(value=>value<=limit).at(-1),end=cursor+duration;
      let token='z';
      if(segment.midi!==null) {
        const name=midiName(segment.midi),sharp=name.startsWith('^'),letter=name.replace('^','');
        const state=accidentalStates[bar];const previous=state.get(letter)||false;
        token=(sharp?'^':previous?'=':'')+letter;state.set(letter,sharp);
      }
      token+=duration===1?'':String(duration);
      if(segment.midi!==null&&end<segment.end)token+='-';
      bars[bar].push(token);cursor=end;
    }
  }
  return `X:1\nT:BarMaker snippet\nM:${t.meter}\nL:1/${t.grid}\nQ:1/4=${t.tempo}\nK:C\n${bars.map(bar=>bar.join(' ')).join(' | ')} |`;
}
export function abcBody(abc){return abc.split(/\r?\n/).filter(line=>!/^\s*[A-Za-z]:/.test(line)&&!/^\s*%/.test(line)).join('\n').trim();}
export function inlineABC(abc) {
  const fields={};for(const line of abc.split(/\r?\n/)){const match=line.match(/^([MLQK]):\s*(.*)$/);if(match)fields[match[1]]=match[2];}
  return ['M','L','Q','K'].filter(key=>fields[key]).map(key=>`[${key}:${fields[key]}]`).join('')+' '+abcBody(abc);
}
