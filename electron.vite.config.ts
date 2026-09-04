import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// banner выполняется в самом верху main-бандла — до hoisted require('telegraf'),
// поэтому успевает подавить безобидный DEP0040 (punycode из node-fetch→whatwg-url→tr46)
const suppressPunycodeWarning =
  "const __ew=process.emitWarning.bind(process);" +
  "process.emitWarning=function(w){var m=typeof w==='string'?w:w&&w.message;" +
  "if(typeof m==='string'&&m.toLowerCase().indexOf('punycode')!==-1)return;" +
  "return __ew.apply(process,arguments)};"

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        output: { banner: suppressPunycodeWarning }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    plugins: [react()]
  }
})
