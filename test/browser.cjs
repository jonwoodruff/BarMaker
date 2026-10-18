const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {createServer}=require('node:net');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
(async()=>{
 const listener=createServer();await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
 const server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:'ignore'});
 let browser;
 try{
  const url=`http://127.0.0.1:${port}`;
  for(let i=0;i<100;i++){try{const r=await fetch(url);if(r.ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  const mac='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH||(fs.existsSync(mac)?mac:undefined),headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
  const context=await browser.newContext({permissions:['microphone']});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await page.waitForFunction(()=>customElements.get('bar-maker'));
  const widget=page.locator('bar-maker');
  await page.evaluate(()=>document.querySelector('bar-maker').configure({meter:'2/4',tempo:120,bars:1,countIn:false}));
  await widget.locator('[data-ui=record]').click();await page.waitForFunction(()=>document.querySelector('bar-maker').state==='recording');
  await page.waitForFunction(()=>{const w=document.querySelector('bar-maker');return w.state==='recording'&&w._begun;});await page.waitForTimeout(70);
  const key=widget.locator('[data-midi="60"]');await key.scrollIntoViewIfNeeded();const box=await key.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height-25);await page.mouse.down();await page.waitForTimeout(270);await page.mouse.up();
  await page.waitForFunction(()=>document.querySelector('bar-maker').state==='idle');
  let abc=await widget.locator('textarea').inputValue();assert.match(abc,/M:2\/4/);assert.match(abc,/[\n ]C\d?/);assert(await widget.locator('.notation svg').count());
  console.log('PASS onscreen performance, automatic stop, ABC output and notation');
  await widget.locator('[data-ui=mode]').selectOption('computer');
  await widget.locator('[data-ui=record]').click();await page.waitForFunction(()=>{const w=document.querySelector('bar-maker');return w.state==='recording'&&w._begun;});await page.waitForTimeout(70);await page.keyboard.down('KeyS');await page.waitForTimeout(280);await page.keyboard.up('KeyS');
  await page.waitForFunction(()=>document.querySelector('bar-maker').state==='idle');abc=await widget.locator('textarea').inputValue();assert.match(abc,/[\n ]D\d?/);
  const output=widget.locator('textarea');await output.focus();await page.keyboard.type('a');assert((await output.inputValue()).endsWith('a'));
  await page.keyboard.press('Backspace');
  console.log('PASS computer key mapping and normal typing inside the ABC editor');
  await widget.locator('[data-ui=play]').click();await page.waitForFunction(()=>document.querySelector('bar-maker').state==='playing');await widget.locator('[data-ui=stop]').click();assert.equal(await page.evaluate(()=>document.querySelector('bar-maker').state),'idle');
  console.log('PASS playback of editable ABC and immediate stop');
  const original=await output.inputValue();
  await page.evaluate(()=>document.querySelector('bar-maker').configure({meter:'3/4',tempo:240,bars:1,countIn:true}));
  await widget.locator('[data-ui=record]').click();await page.waitForFunction(()=>document.querySelector('bar-maker').state==='count-in');
  await page.waitForFunction(()=>document.querySelector('bar-maker').shadowRoot.querySelector('.beat.active'));
  assert.match(await widget.locator('[data-ui=position]').innerText(),/Count-in/);
  await widget.locator('[data-ui=cancel]').click();assert.equal(await output.inputValue(),original);
  console.log('PASS count-in, visible beat indicator and cancellation preserves previous snippet');
  // Deterministic plugin replaces just the pitch source, using real audio-clock timestamps.
  await widget.locator('[data-ui=mode]').selectOption('microphone');
  await page.evaluate(()=>{
   const widget=document.querySelector('bar-maker');widget.configure({meter:'2/4',tempo:120,bars:1,countIn:false});
   widget.pitchSourceFactory=()=>({async start(context,onFrame){this.timer=setInterval(()=>onFrame({frequency:440,clarity:1,rms:.2,time:context.currentTime}),12);},stop(){clearInterval(this.timer);window.pluginStopped=true;}});
  });
  await widget.locator('[data-ui=record]').click();await page.waitForFunction(()=>document.querySelector('bar-maker').state==='idle');
  assert.match(await output.inputValue(),/[\n ]A\d?/);assert(await page.evaluate(()=>window.pluginStopped));
  console.log('PASS injected microphone pitch plugin records a stable A4 and releases capture');
  // Exercise real getUserMedia + Pitchy with Chrome's fake microphone, never the user's device.
  await page.evaluate(async()=>{
    const {PitchyInput}=await import('/src/index.js');const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);window.streams=[];
    navigator.mediaDevices.getUserMedia=async constraints=>{const stream=await original(constraints);window.streams.push(stream);return stream;};
    document.querySelector('bar-maker').pitchSourceFactory=()=>new PitchyInput();
  });
  await widget.locator('[data-ui=record]').click();await page.waitForFunction(()=>document.querySelector('bar-maker').state==='recording');await page.waitForTimeout(250);await widget.locator('[data-ui=cancel]').click();
  assert(await page.evaluate(()=>window.streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))));
  console.log('PASS real microphone pipeline with simulated device and track cleanup');
  await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=()=>Promise.reject(new DOMException('Test denial','NotAllowedError'));});
  await widget.locator('[data-ui=record]').click();await page.waitForFunction(()=>document.querySelector('bar-maker').state==='idle');assert.match(await widget.locator('[data-ui=status]').innerText(),/permission was not granted/);
  console.log('PASS denied microphone permission leaves widget ready for another input');
  await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(errors,[]);console.log('PASS mobile layout and no browser errors');
 }finally{await browser?.close();server.kill();}
})().catch(error=>{console.error(error);process.exit(1);});
