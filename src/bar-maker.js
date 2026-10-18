import abcjs from 'abcjs';
import {styles} from './styles.js';
import {METERS,configuration,timing,noteLabel,frequencyToMidi,performanceToABC,abcBody,inlineABC} from './music.js';
import {AudioEngine,sequenceFromABC} from './audio-engine.js';
import {PitchyInput,PitchTracker} from './pitch-input.js';
const CODES=['KeyA','KeyW','KeyS','KeyE','KeyD','KeyF','KeyT','KeyG','KeyY','KeyH','KeyU','KeyJ','KeyK','KeyO','KeyL','KeyP','Semicolon'];
const LABELS=['A','W','S','E','D','F','T','G','Y','H','U','J','K','O','L','P',';'];
const COLORS=['#a95f38','#548879','#5678a3','#8c6ca3','#9d7241','#527d89','#8a6471','#637d4c','#625c92','#8e6849','#426e74','#8d5361'];
const Base=globalThis.HTMLElement||class{};
export class BarMakerElement extends Base {
  static get observedAttributes(){return ['meter','tempo','bars','grid','input-mode','count-in'];}
  constructor() {
    super();this.attachShadow({mode:'open'});this._config=configuration();this._engine=new AudioEngine();this._phase='idle';
    this._generation=0;this._events=[];this._activeNote=null;this._manual=null;this._pressed=new Set();this._source=null;this._raf=null;this._scheduler=null;
    this.pitchSourceFactory=()=>new PitchyInput();
    this._keyDown=event=>this._handleKey(event,true);this._keyUp=event=>this._handleKey(event,false);
    this._pageHide=()=>this.cancel();this._blur=()=>this._releaseAll();this._visibility=()=>{if(document.hidden&&this._phase!=='idle')this.cancel();};
  }
  connectedCallback() {
    if(!this.hasAttribute('tabindex'))this.tabIndex=0;
    if(!this._built){this._build();this._built=true;this._fromAttributes();this.setABC(performanceToABC([],this._config),false);}
    document.addEventListener('keydown',this._keyDown);document.addEventListener('keyup',this._keyUp);
    window.addEventListener('blur',this._blur);window.addEventListener('pagehide',this._pageHide);document.addEventListener('visibilitychange',this._visibility);
  }
  disconnectedCallback() {
    this.cancel();this._engine.close();document.removeEventListener('keydown',this._keyDown);document.removeEventListener('keyup',this._keyUp);
    window.removeEventListener('blur',this._blur);window.removeEventListener('pagehide',this._pageHide);document.removeEventListener('visibilitychange',this._visibility);
  }
  attributeChangedCallback(){if(this._built)this._fromAttributes();}
  _fromAttributes() {
    const values={};for(const name of ['meter','tempo','bars','grid'])if(this.hasAttribute(name))values[name]=this.getAttribute(name);
    if(this.hasAttribute('count-in'))values.countIn=this.getAttribute('count-in')!=='false';
    this.configure(values);if(this.hasAttribute('input-mode'))this._ui.mode.value=this.getAttribute('input-mode');this._keyboard();
  }
  _build() {
    this.shadowRoot.innerHTML=`<style>${styles}</style><section class="bar-maker" aria-label="BarMaker melody recorder"><div class="heading"><div><p class="eyebrow">A FEW BARS AT A TIME</p><h2>BarMaker</h2></div><p class="hint">Perform a phrase. Keep the notes.</p></div>
    <div class="settings"><label>Input<select data-ui="mode" aria-label="Input method"><option value="screen">Onscreen keyboard</option><option value="computer">Computer keyboard</option><option value="microphone">Sing or hum</option></select></label>
    <label>Meter<select data-ui="meter">${METERS.map(m=>`<option>${m}</option>`).join('')}</select></label>
    <label>Tempo ♩/min<input data-ui="tempo" type="number" min="40" max="240" value="96"></label>
    <label>Bars<select data-ui="bars">${[1,2,3,4,6,8].map(n=>`<option>${n}</option>`).join('')}</select></label>
    <label>Snap to<select data-ui="grid"><option value="8">Eighth notes</option><option value="16">Sixteenth notes</option></select></label>
    <label>Keyboard range<select data-ui="octave"><option value="48">C3–C5</option><option value="60" selected>C4–C6</option><option value="72">C5–B6</option></select></label>
    <label class="checkbox"><input data-ui="countIn" type="checkbox" checked>One-bar count-in</label><label class="checkbox"><input data-ui="clicks" type="checkbox" checked>Audible clicks</label></div>
    <div class="transport"><button type="button" data-ui="record">● Record performance</button><button type="button" data-ui="stop" disabled>■ Stop</button><button type="button" data-ui="cancel" class="quiet" disabled>Cancel take</button><button type="button" data-ui="play">▶ Play snippet</button></div>
    <p class="status" data-ui="status" role="status">Choose your settings, then record a short phrase.</p>
    <div class="beat-strip" data-ui="beats" aria-label="Beats in the measure"></div><div class="progress" aria-hidden="true"><span data-ui="progress"></span></div>
    <div class="live"><span data-ui="position">Ready</span><span data-ui="pitch">No microphone active</span><meter class="level" data-ui="level" aria-label="Microphone input level" min="0" max="1" value="0"></meter></div>
    <div class="piano-scroll"><div class="piano" data-ui="piano" role="group" aria-label="Piano keyboard"></div></div><p class="hint" data-ui="help"></p>
    <label class="output-label">ABC snippet<textarea class="output" data-ui="output" spellcheck="false" aria-label="ABC snippet"></textarea></label><div class="errors" data-ui="errors" role="status"></div>
    <div class="notation" data-ui="notation" aria-label="Snippet sheet music"></div>
    <div class="output-actions"><button type="button" data-ui="copyNotes" class="quiet">Copy notes</button><button type="button" data-ui="copyABC" class="quiet">Copy full ABC</button></div></section>`;
    this._ui=Object.fromEntries([...this.shadowRoot.querySelectorAll('[data-ui]')].map(el=>[el.dataset.ui,el]));
    for(const name of ['meter','tempo','bars','grid','countIn'])this._ui[name].addEventListener('change',()=>{
      try{this.configure(this._read());this._status('Settings apply to your next take.');}catch(error){this._status(error.message);}
    });
    for(const name of ['mode','octave'])this._ui[name].onchange=()=>{this._releaseAll();this._keyboard();};
    this._ui.record.onclick=()=>this.record();this._ui.stop.onclick=()=>this.stop();this._ui.cancel.onclick=()=>this.cancel();this._ui.play.onclick=()=>this.play();
    this._ui.output.oninput=()=>{if(this._phase==='playing')this.stop();this._render();this._emit();};
    this._ui.copyNotes.onclick=()=>this._copy(this.getNotes());this._ui.copyABC.onclick=()=>this._copy(this.getABC());
    this._keyboard();
  }
  _read(){return {meter:this._ui.meter.value,tempo:this._ui.tempo.value,bars:this._ui.bars.value,grid:this._ui.grid.value,countIn:this._ui.countIn.checked};}
  configure(values={}) {
    if(this._phase!=='idle')throw new Error('Stop the current take before changing settings.');
    this._config=configuration({...this._config,...values});if(!this._ui)return;
    for(const name of ['meter','tempo','bars','grid'])this._ui[name].value=this._config[name];this._ui.countIn.checked=this._config.countIn;
    this._beats();
  }
  get settings(){return {...this._config};}
  get state(){return this._phase;}
  getABC(){return this._ui?.output.value||'';}
  getNotes(){return abcBody(this.getABC());}
  getInsertableABC(){return inlineABC(this.getABC());}
  setABC(abc,emit=true){if(this._phase!=='idle')throw new Error('Stop the current take before replacing the snippet.');if(this._ui){this._ui.output.value=String(abc);this._render();if(emit)this._emit();}}
  _emit(){this.dispatchEvent(new CustomEvent('snippet-change',{bubbles:true,composed:true,detail:{abc:this.getABC(),notes:this.getNotes(),inlineABC:this.getInsertableABC(),settings:this.settings}}));}
  _status(message){if(this._ui)this._ui.status.textContent=message;}
  _controls() {
    const busy=this._phase!=='idle';this._ui.record.disabled=busy;this._ui.play.disabled=busy;
    this._ui.stop.disabled=!busy;this._ui.cancel.disabled=!['preparing','count-in','recording'].includes(this._phase);
    for(const el of this.shadowRoot.querySelectorAll('.settings input,.settings select'))el.disabled=busy;
    this._ui.output.readOnly=['preparing','count-in','recording'].includes(this._phase);
  }
  _beats(t=timing(this._config)){this._ui.beats.innerHTML=Array.from({length:t.beats},(_,i)=>`<span class="beat ${i===0?'downbeat':''}" style="--beat-color:${COLORS[i]}" data-beat="${i}">${i+1}</span>`).join('');}
  _keyboard() {
    const base=Number(this._ui.octave.value),mode=this._ui.mode.value;this._ui.piano.replaceChildren();
    // Keep the upper key in the advertised supported range (B6).
    const pitches=Array.from({length:Math.min(25,96-base)},(_,i)=>base+i);const white=pitches.filter(m=>![1,3,6,8,10].includes(m%12));const width=100/white.length;
    let whiteIndex=0;
    for(const midi of pitches){
      const black=[1,3,6,8,10].includes(midi%12),button=document.createElement('button');button.type='button';button.className=`key ${black?'black':'white'}`;
      button.dataset.midi=midi;button.setAttribute('aria-label',noteLabel(midi));button.disabled=mode==='microphone';
      button.style.width=`${width*(black?.62:1)}%`;button.style.left=`${black?whiteIndex*width-width*.31:whiteIndex++*width}%`;
      const name=document.createElement('span');name.textContent=noteLabel(midi);button.append(name);
      if(CODES[midi-base]){const mapping=document.createElement('span');mapping.className='mapping';mapping.textContent=LABELS[midi-base];button.append(mapping);}
      button.onpointerdown=event=>{event.preventDefault();button.focus({preventScroll:true});button.setPointerCapture(event.pointerId);this._press(midi,`pointer-${event.pointerId}`);};
      button.onpointerup=event=>this._release(`pointer-${event.pointerId}`);button.onpointercancel=button.onlostpointercapture=event=>this._release(`pointer-${event.pointerId}`);
      this._ui.piano.append(button);
    }
    this._ui.help.textContent=mode==='microphone'?'Sing one clear note at a time. Use headphones or turn off audible clicks so the microphone hears your voice. Pitch detection is an estimate; check the snippet afterwards.':mode==='computer'?'Focus this widget, then play A W S E D F T G Y H U J K O L P ;. Hold each key for its duration; release for a rest. Short taps snap to one grid step.':'Press and hold the piano keys to perform. Release for rests. Record starts the metronome and, by default, a one-bar count-in.';
  }
  _handleKey(event,down) {
    if(!down){if(CODES.includes(event.code))this._release(event.code);return;}
    if(this._ui.mode.value!=='computer'||document.activeElement!==this||event.repeat||event.ctrlKey||event.metaKey||event.altKey)return;
    const target=this.shadowRoot.activeElement;if(target?.matches('input,textarea,select,[contenteditable=true]'))return;
    const index=CODES.indexOf(event.code);if(index<0)return;
    event.preventDefault();this._press(Number(this._ui.octave.value)+index,event.code);
  }
  async _press(midi,token) {
    if(this._ui.mode.value==='microphone'||this._phase==='playing'||midi>95)return;
    this._pressed.add(token);
    try {
      await this._engine.ready();if(!this._pressed.has(token)||!this.isConnected)return;
      if(this._manual)this._manual.stop();
      this._manual={midi,token,stop:this._engine.tone(midi)};this._highlight(midi);this._transition(midi,this._engine.context.currentTime);
    }catch(error){this._status(error.message);}
  }
  _release(token) {
    this._pressed.delete(token);if(this._manual?.token!==token)return;
    this._manual.stop();this._manual=null;this._highlight(null);if(this._engine.context)this._transition(null,this._engine.context.currentTime);
  }
  _releaseAll(){for(const token of [...this._pressed])this._release(token);}
  _highlight(midi){for(const key of this._ui.piano.children)key.classList.toggle('active',Number(key.dataset.midi)===midi);}
  _transition(midi,time) {
    if(!['count-in','recording'].includes(this._phase)||time<this._recordStart||time>this._end)return;
    const relative=Math.max(0,Math.min(this._end-this._recordStart,time-this._recordStart));
    if(this._activeNote){this._events.push({...this._activeNote,end:relative});this._activeNote=null;}
    if(midi!==null)this._activeNote={midi,start:relative};
  }
  async record() {
    if(this._phase!=='idle')return;
    const generation=++this._generation;
    try {
      this._config=configuration(this._read());this._time=timing(this._config);this._phase='preparing';this._controls();this._releaseAll();this._status('Preparing…');
      const context=await this._engine.ready();if(generation!==this._generation)return;
      this._engine.stop();this._lastPitch=null;
      if(this._ui.mode.value==='microphone') {
        this._status('Allow microphone access to sing or hum your snippet.');
        const source=this.pitchSourceFactory();this._source=source;
        const tracker=new PitchTracker((midi,time)=>{this._lastPitch=midi;this._highlight(midi);this._transition(midi,time);});
        await source.start(context,frame=>{
          if(generation!==this._generation)return;
          tracker.push(frame);this._ui.level.value=Math.min(1,frame.rms*5);
          if(frame.frequency>65&&frame.frequency<2000&&frame.clarity>.8&&frame.rms>.008){const value=frequencyToMidi(frame.frequency),midi=Math.round(value);this._ui.pitch.textContent=`${noteLabel(midi)} · ${Math.round((value-midi)*100)} cents`;}
          else this._ui.pitch.textContent='Listening…';
        });
        if(generation!==this._generation){source.stop();return;}
      }
      this._events=[];this._activeNote=null;
      this._start=context.currentTime+.16;this._recordStart=this._start+(this._config.countIn?this._time.barSeconds:0);this._end=this._recordStart+this._time.barSeconds*this._config.bars;
      this._nextClick=this._start;this._clickIndex=0;this._phase=this._config.countIn?'count-in':'recording';this._begun=false;this._beats();this._controls();if(this._ui.mode.value==='computer')this.focus({preventScroll:true});
      this._status(this._config.countIn?'Count in with the metronome.':'Perform your snippet now.');
      const schedule=()=>{
        if(!this._engine.context)return;
        const horizon=this._engine.context.currentTime+.12;
        while(this._nextClick<horizon&&this._nextClick<this._end-.001){if(this._ui.clicks.checked)this._engine.click(this._nextClick,this._clickIndex%this._time.beats===0);this._nextClick+=this._time.pulse;this._clickIndex++;}
      };
      schedule();this._scheduler=setInterval(schedule,25);this._animate();
    }catch(error){if(generation===this._generation){this.cancel();this._status(error.name==='NotAllowedError'?'Microphone permission was not granted. Choose a keyboard input or allow access in site settings.':error.message);}}
  }
  _animate() {
    if(!['count-in','recording','playing'].includes(this._phase))return;
    const now=this._engine.context.currentTime;
    if(this._phase!=='playing'&&now>=this._end){this.stop();return;}
    const counting=this._phase==='count-in'&&now<this._recordStart;
    if(!counting&&!this._begun&&this._phase!=='playing'&&now>=this._recordStart){this._begun=true;this._phase='recording';this._status('Recording your performance…');const held=this._manual?.midi??this._lastPitch;if(held!==null&&held!==undefined)this._activeNote={midi:held,start:0};}
    const t=this._time||timing(this._config),origin=counting?this._start:this._recordStart;
    const elapsed=Math.max(0,now-origin),bar=Math.floor(elapsed/t.barSeconds),beat=Math.floor(elapsed/t.pulse)%t.beats;
    for(const el of this._ui.beats.children){const active=Number(el.dataset.beat)===beat&&now>=this._start;el.classList.toggle('active',active);if(active)el.setAttribute('aria-current','true');else el.removeAttribute('aria-current');}
    this._ui.position.textContent=counting?`Count-in · Beat ${beat+1} of ${t.beats}`:`Bar ${bar+1} · Beat ${beat+1} of ${t.beats}`;
    this._ui.progress.style.width=`${(elapsed%t.barSeconds)/t.barSeconds*100}%`;this._raf=requestAnimationFrame(()=>this._animate());
  }
  _cleanup() {
    clearInterval(this._scheduler);this._scheduler=null;cancelAnimationFrame(this._raf);this._raf=null;
    this._source?.stop();this._source=null;this._releaseAll();this._engine.stop();this._activeNote=null;this._lastPitch=null;
    this._ui.level.value=0;this._ui.pitch.textContent='No microphone active';this._highlight(null);
    for(const beat of this._ui.beats.children){beat.classList.remove('active');beat.removeAttribute('aria-current');}
    this._phase='idle';this._controls();
  }
  stop() {
    if(this._phase==='idle')return;
    if(['preparing','playing'].includes(this._phase)||this._engine.context.currentTime<this._recordStart){this.cancel();return;}
    const end=Math.min(this._engine.context.currentTime,this._end);
    this._transition(null,end);const events=this._events.slice();this._generation++;this._cleanup();
    this.setABC(performanceToABC(events,this._config));this._status('Take ready. Check the notes, edit the ABC, or copy this phrase into your tune.');this._ui.position.textContent='Take complete';this._ui.progress.style.width='100%';
  }
  cancel() {
    this._generation++;if(!this._ui)return;this._cleanup();this._ui.position.textContent='Ready';this._ui.progress.style.width='0%';this._status('Stopped. Your previous snippet is kept.');
  }
  async play() {
    if(this._phase!=='idle')return;
    const generation=++this._generation;
    try {
      const abc=this.getABC(),sequence=sequenceFromABC(abc);this._phase='preparing';this._controls();this._status('Preparing playback…');
      await this._engine.ready();if(generation!==this._generation)return;
      await this._engine.play(abc,()=>{if(generation===this._generation){this._cleanup();this._status('Playback finished.');this._ui.position.textContent='Ready';}});
      if(generation!==this._generation){this._engine.stop();return;}
      const meter=abc.match(/^M:\s*(.+)$/m)?.[1]||this._config.meter;
      this._time=timing({...this._config,meter:METERS.includes(meter)?meter:this._config.meter});
      this._time.pulse=240/sequence.tempo/this._time.denominator;this._time.barSeconds=this._time.pulse*this._time.beats;
      this._start=this._recordStart=this._engine.context.currentTime+.06;this._phase='playing';this._controls();this._beats(this._time);this._status('Playing your ABC snippet.');this._animate();
    }catch(error){if(generation===this._generation){this.cancel();this._status(error.message);}}
  }
  _render() {
    try{const result=abcjs.renderAbc(this._ui.notation,this.getABC(),{responsive:'resize',add_classes:true});this._ui.errors.textContent=(result[0]?.warnings||[]).map(w=>String(w).replace(/<[^>]*>/g,'')).join(' ');}
    catch(error){this._ui.errors.textContent=error.message;}
  }
  async _copy(text) {
    try{await navigator.clipboard.writeText(text);this._status('Copied. Paste this snippet into your composition.');}
    catch{this._ui.output.focus();this._ui.output.select();this._status('Select and copy the ABC text here; clipboard access was unavailable.');}
  }
}
