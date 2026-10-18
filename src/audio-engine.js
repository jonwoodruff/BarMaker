import abcjs from 'abcjs';
import {midiFrequency} from './music.js';
export function sequenceFromABC(abc) {
  const tunes=abcjs.parseOnly(abc);
  if(!tunes.length)throw new Error('Enter an ABC snippet before playback.');
  const warnings=tunes[0].warnings || [];
  const audio=tunes[0].setUpAudio({});
  const quarterTempo=audio.tempo*tunes[0].getBeatLength()*4;
  const secondsPerWhole=240/quarterTempo;
  const notes=audio.tracks.flat().filter(note=>note.cmd==='note').map(note=>({midi:note.pitch,start:note.start*secondsPerWhole,duration:note.duration*secondsPerWhole}));
  if(notes.length>4096||audio.totalDuration*secondsPerWhole>600)throw new Error('Keep playback to a short snippet (under ten minutes).');
  return {notes,duration:audio.totalDuration*secondsPerWhole,tempo:quarterTempo,warnings};
}
export class AudioEngine {
  constructor(){this.context=null;this.voices=new Set();this.pending=new Set();}
  async ready() {
    const Constructor=globalThis.AudioContext||globalThis.webkitAudioContext;
    if(!Constructor)throw new Error('This browser does not support Web Audio.');
    if(!this.context||this.context.state==='closed')this.context=new Constructor();
    await this.context.resume();return this.context;
  }
  tone(midi,when=this.context.currentTime,duration=null,{volume=.13,type='triangle'}={}) {
    const context=this.context,osc=context.createOscillator(),gain=context.createGain();
    osc.type=type;osc.frequency.value=midiFrequency(midi);gain.gain.setValueAtTime(0,when);
    gain.gain.linearRampToValueAtTime(volume,when+.008);osc.connect(gain);gain.connect(context.destination);
    osc.start(when);let stopped=false;
    const stop=(at=context.currentTime)=>{
      if(stopped)return;stopped=true;
      const end=Math.max(at,when+.01);
      gain.gain.cancelScheduledValues(end);gain.gain.setValueAtTime(volume,end);
      gain.gain.exponentialRampToValueAtTime(.0001,end+.018);osc.stop(end+.02);
    };
    this.voices.add(osc);osc.onended=()=>{this.voices.delete(osc);osc.disconnect();gain.disconnect();};
    if(duration!==null)stop(when+Math.max(.02,duration-.02));
    return ()=>stop();
  }
  click(when,accent){this.tone(accent?90:83,when,.035,{volume:accent?.075:.035,type:'sine'});}
  stop(){for(const osc of this.voices){try{osc.stop();}catch{}}this.voices.clear();for(const timer of this.pending)clearTimeout(timer);this.pending.clear();}
  async play(abc,onEnd=()=>{}) {
    const sequence=sequenceFromABC(abc);await this.ready();this.stop();
    const start=this.context.currentTime+.06;
    for(const note of sequence.notes)this.tone(note.midi,start+note.start,note.duration);
    const timer=setTimeout(()=>{this.pending.delete(timer);onEnd();},(sequence.duration+.09)*1000);this.pending.add(timer);
    return ()=>this.stop();
  }
  close(){this.stop();if(this.context&&this.context.state!=='closed')this.context.close();this.context=null;}
}
const sharedPlayback=new AudioEngine();
export async function playABC(abc){return sharedPlayback.play(abc);}
