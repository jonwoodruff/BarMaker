import test from 'node:test';
import assert from 'node:assert/strict';
import {METERS,configuration,timing,quantize,performanceToABC,midiName,abcBody,inlineABC} from '../src/music.js';
import {sequenceFromABC} from '../src/audio-engine.js';
const config={meter:'4/4',tempo:120,bars:1,grid:8,countIn:false};
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<.001,`${actual} != ${expected}`);
test('meter is exact, with quarter-note tempo in compound meters',()=>{
  near(timing(config).barSeconds,2);near(timing({...config,meter:'6/8'}).barSeconds,1.5);
  assert.equal(timing({...config,meter:'6/8',grid:16}).ticksPerBar,12);
});
test('configuration rejects invalid and excessive values',()=>{
  for(const invalid of [{meter:'0/4'},{tempo:0},{tempo:NaN},{tempo:241},{bars:0},{bars:1.5},{grid:32}])assert.throws(()=>configuration({...config,...invalid}));
});
test('note onsets and endings snap to the chosen grid and leave rests',()=>{
  assert.deepEqual(quantize([{midi:60,start:.03,end:.48},{midi:64,start:1.01,end:1.49}],config),[
    {midi:60,start:0,end:2},{midi:null,start:2,end:4},{midi:64,start:4,end:6},{midi:null,start:6,end:8},
  ]);
});
test('short taps have a minimum duration, overlaps are monophonic and later onset wins',()=>{
  const result=quantize([{midi:60,start:0,end:1},{midi:62,start:.5,end:.51},{midi:64,start:.51,end:.53}],config);
  assert.deepEqual(result.slice(0,2),[{midi:60,start:0,end:2},{midi:64,start:2,end:3}]);
});
test('empty performance has a complete measure of rests in every supported meter',()=>{
  for(const meter of METERS){const abc=performanceToABC([],{...config,meter});near(sequenceFromABC(abc).duration,timing({...config,meter}).barSeconds);assert.equal(sequenceFromABC(abc).notes.length,0);}
});
test('captured pitches, silence and durations survive ABC engraving/audio parsing',()=>{
  const abc=performanceToABC([{midi:60,start:0,end:.5},{midi:62,start:1,end:2}],config);
  const {notes,duration}=sequenceFromABC(abc);assert.deepEqual(notes.map(n=>n.midi),[60,62]);near(notes[1].start,1);near(notes[1].duration,1);near(duration,2);
});
test('notes crossing bar lines are tied and play as one note',()=>{
  const abc=performanceToABC([{midi:67,start:1.5,end:3}],{...config,bars:2});assert.match(abc,/- \|/);
  const notes=sequenceFromABC(abc).notes;assert.equal(notes.length,1);near(notes[0].start,1.5);near(notes[0].duration,1.5);
});
test('a whole bar is a whole note rather than unnecessary ties',()=>{
  assert.match(abcBody(performanceToABC([{midi:60,start:0,end:2}],config)),/^C8 \|$/);
});
test('sharp then natural within a bar does not inherit the accidental',()=>{
  const abc=performanceToABC([{midi:61,start:0,end:.5},{midi:60,start:.5,end:1},{midi:60,start:1,end:1.5}],config);
  assert.match(abc,/\^C2 =C2 C2/);assert.deepEqual(sequenceFromABC(abc).notes.map(n=>n.midi),[61,60,60]);
});
test('octaves, range limits and invalid events are handled',()=>{
  assert.equal(midiName(48),'C,');assert.equal(midiName(60),'C');assert.equal(midiName(72),'c');assert.equal(midiName(84),"c'");assert.throws(()=>midiName(96));
  assert.equal(quantize([{midi:100,start:0,end:1},{midi:60,start:NaN,end:1},{midi:60,start:0,end:0}],config).length,1);
});
test('output copies as raw notes or an inline snippet without headers duplicating the song',()=>{
  const abc=performanceToABC([{midi:60,start:0,end:.5}],config);assert.ok(!abcBody(abc).includes('X:'));
  const inline=inlineABC(abc);assert.match(inline,/^\[M:4\/4\]\[L:1\/8\]\[Q:1\/4=120\]\[K:C\]/);
  assert.equal(sequenceFromABC('X:1\nM:4/4\nL:1/16\nK:G\n'+inline).notes[0].midi,60);
});
test('playback follows edited ABC accidentals, rests, ties and tempo',()=>{
  const sequence=sequenceFromABC('X:1\nM:3/4\nL:1/8\nQ:1/4=60\nK:C\n^F2 =F2 z2 | c3-c3 |');
  assert.deepEqual(sequence.notes.map(n=>n.midi),[66,65,72]);near(sequence.notes[2].start,3);near(sequence.notes[2].duration,3);near(sequence.duration,6);
});
