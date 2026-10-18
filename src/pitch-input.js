import {PitchDetector} from 'pitchy';
import {frequencyToMidi} from './music.js';
/** Stable monophonic note transitions, rather than treating every detector frame as a note. */
export class PitchTracker {
  constructor(onNote,{clarity=.9,rms=.012,stable=.04,silence=.06}={}) {
    Object.assign(this,{onNote,clarity,rms,stable,silence});this.current=null;this.candidate=undefined;this.since=0;
  }
  push(frame) {
    const {frequency,clarity,rms,time}=frame;
    const midi=frequency>65&&frequency<2000&&clarity>=this.clarity&&rms>=this.rms?Math.round(frequencyToMidi(frequency)):null;
    if(midi===this.current){this.candidate=undefined;return;}
    if(midi!==this.candidate){this.candidate=midi;this.since=time;return;}
    if(time-this.since>=(midi===null?this.silence:this.stable)) {
      this.current=midi;this.candidate=undefined;this.onNote(midi,this.since);
    }
  }
}
/** Plugin contract: start(audioContext, onFrame) -> Promise; stop() releases all capture. */
export class PitchyInput {
  constructor(){this.stream=null;this.frame=null;this.source=null;this.analyser=null;this.generation=0;}
  async start(context,onFrame) {
    if(!globalThis.isSecureContext||!navigator.mediaDevices?.getUserMedia)throw new Error('Microphone input needs HTTPS or localhost.');
    const generation=++this.generation;
    const stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:{ideal:1},echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
    if(generation!==this.generation){stream.getTracks().forEach(track=>track.stop());throw new Error('Microphone request cancelled.');}
    this.stream=stream;this.source=context.createMediaStreamSource(stream);this.analyser=context.createAnalyser();this.analyser.fftSize=2048;
    this.source.connect(this.analyser);
    const detector=PitchDetector.forFloat32Array(this.analyser.fftSize),data=new Float32Array(this.analyser.fftSize);
    const update=()=>{
      if(generation!==this.generation)return;
      this.analyser.getFloatTimeDomainData(data);
      let power=0;for(const sample of data)power+=sample*sample;
      const rms=Math.sqrt(power/data.length);const [frequency,clarity]=rms>.003?detector.findPitch(data,context.sampleRate):[0,0];
      onFrame({frequency,clarity,rms,time:context.currentTime-data.length/(2*context.sampleRate)});
      this.frame=requestAnimationFrame(update);
    };update();
  }
  stop() {
    this.generation++;cancelAnimationFrame(this.frame);
    this.stream?.getTracks().forEach(track=>track.stop());this.stream=null;
    this.source?.disconnect();this.analyser?.disconnect();this.source=null;this.analyser=null;
  }
}
