import test from 'node:test';
import assert from 'node:assert/strict';
import {PitchDetector} from 'pitchy';
import {PitchTracker} from '../src/pitch-input.js';
import {midiFrequency,frequencyToMidi} from '../src/music.js';
test('Pitchy detects synthetic low and high sung fundamentals with harmonics',()=>{
  for(const midi of [48,60,69,76,84]){
    const rate=48000,hz=midiFrequency(midi),samples=Float32Array.from({length:4096},(_,i)=>.3*Math.sin(2*Math.PI*hz*i/rate)+.08*Math.sin(4*Math.PI*hz*i/rate));
    const [pitch,clarity]=PitchDetector.forFloat32Array(samples.length).findPitch(samples,rate);
    assert.ok(clarity>.9);assert.ok(Math.abs(frequencyToMidi(pitch)-midi)<.08);
  }
});
test('stable notes do not split on every frame, silence permits same-pitch rearticulation',()=>{
  const changes=[],tracker=new PitchTracker((midi,time)=>changes.push({midi,time}));
  const frame=(time,frequency=440)=>tracker.push({time,frequency,clarity:.99,rms:frequency?.1:0});
  frame(0);frame(.025);frame(.05);frame(.1);frame(.15);frame(.2,0);frame(.27,0);frame(.3);frame(.36);
  assert.deepEqual(changes.map(c=>c.midi),[69,null,69]);assert.equal(changes[0].time,0);assert.equal(changes[1].time,.2);
});
test('noise and brief octave errors do not become notes',()=>{
  const changes=[],tracker=new PitchTracker(midi=>changes.push(midi));
  for(const time of [0,.1,.2])tracker.push({time,frequency:440,clarity:.4,rms:.2});
  tracker.push({time:.3,frequency:440,clarity:1,rms:.1});tracker.push({time:.35,frequency:440,clarity:1,rms:.1});
  tracker.push({time:.4,frequency:880,clarity:1,rms:.1});tracker.push({time:.42,frequency:440,clarity:1,rms:.1});
  assert.deepEqual(changes,[69]);
});
