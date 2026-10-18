import {defineConfig} from 'vite';
export default defineConfig({
  build:{lib:{entry:'src/index.js',name:'BarMaker',formats:['es','iife'],fileName:format=>format==='es'?'bar-maker.js':'bar-maker.iife.js'},sourcemap:true},
  server:{host:'127.0.0.1',fs:{strict:true}},
});
