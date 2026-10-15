#!/usr/bin/env node
// Minerador solo de Bitcoin para PC: Node.js + WASM SIMD + Stratum direto por TCP.
// Nao precisa do proxy: Node abre soquete TCP nativamente.
//
// Uso:
//   node miner-pc.js
// Variaveis opcionais:
//   POOL_HOST (padrao solo.ckpool.org)  POOL_PORT (3333)
//   BTC_USER  (endereco.worker)         THREADS (padrao: nucleos - 1)
//   SUG_DIFF  (dificuldade sugerida, 0 = deixar o pool decidir)

'use strict';
const net = require('net');
const os = require('os');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

const WASM_B64 = [
  "AGFzbQEAAAABEgRgAAF/YAAAYAJ/fwF/YAF/AAMIBwAAAAABAgMEBQFwAQEBBQMBAAIGCAF/AUHglQQLB04IBm1lbW9yeQIAB2hkcl9wdHIAAA",
  "hzdGd0X3B0cgABCG50Z3RfcHRyAAIHb3V0X3B0cgADB3ByZXBhcmUABARzY2FuAAUGZGlnZXN0AAYKwkEHCABBgIqAgAALCABB0IqAgAALCABB",
  "8IqAgAALCABBkIuAgAAL8woBDH9BAEEAKAKAioCAACIAQRh0IABBgP4DcUEIdHIgAEEIdkGA/gNxIABBGHZyciIBNgKwi4CAAEEAQQAoAoSKgI",
  "AAIgBBGHQgAEGA/gNxQQh0ciAAQQh2QYD+A3EgAEEYdnJyNgK0i4CAAEEAQQAoAoiKgIAAIgBBGHQgAEGA/gNxQQh0ciAAQQh2QYD+A3EgAEEY",
  "dnJyNgK4i4CAAEEAQQAoAoyKgIAAIgBBGHQgAEGA/gNxQQh0ciAAQQh2QYD+A3EgAEEYdnJyNgK8i4CAAEEAQQAoApCKgIAAIgBBGHQgAEGA/g",
  "NxQQh0ciAAQQh2QYD+A3EgAEEYdnJyNgLAi4CAAEEAQQAoApSKgIAAIgBBGHQgAEGA/gNxQQh0ciAAQQh2QYD+A3EgAEEYdnJyNgLEi4CAAEEA",
  "QQAoApiKgIAAIgBBGHQgAEGA/gNxQQh0ciAAQQh2QYD+A3EgAEEYdnJyNgLIi4CAAEEAQQAoApyKgIAAIgBBGHQgAEGA/gNxQQh0ciAAQQh2QY",
  "D+A3EgAEEYdnJyNgLMi4CAAEEAQQAoAqCKgIAAIgBBGHQgAEGA/gNxQQh0ciAAQQh2QYD+A3EgAEEYdnJyNgLQi4CAAEEAQQAoAqSKgIAAIgBB",
  "GHQgAEGA/gNxQQh0ciAAQQh2QYD+A3EgAEEYdnJyNgLUi4CAAEEAQQAoAqiKgIAAIgBBGHQgAEGA/gNxQQh0ciAAQQh2QYD+A3EgAEEYdnJyNg",
  "LYi4CAAEEAQQAoAqyKgIAAIgBBGHQgAEGA/gNxQQh0ciAAQQh2QYD+A3EgAEEYdnJyNgLci4CAAEEAQQAoArCKgIAAIgBBGHQgAEGA/gNxQQh0",
  "ciAAQQh2QYD+A3EgAEEYdnJyNgLgi4CAAEEAQQAoArSKgIAAIgBBGHQgAEGA/gNxQQh0ciAAQQh2QYD+A3EgAEEYdnJyNgLki4CAAEEAQQAoAr",
  "iKgIAAIgBBGHQgAEGA/gNxQQh0ciAAQQh2QYD+A3EgAEEYdnJyNgLoi4CAAEEAQQAoAryKgIAAIgBBGHQgAEGA/gNxQQh0ciAAQQh2QYD+A3Eg",
  "AEEYdnJyNgLsi4CAAEHAfiEAA0AgAEGwjYCAAGogAEGUjYCAAGooAgAgAWogAEH0jICAAGooAgAiAUEZdyABQQ53cyABQQN2c2ogAEGojYCAAG",
  "ooAgAiAkEPdyACQQ13cyACQQp2c2o2AgAgASEBIABBBGoiAA0AC0GM0ZXYeSEAQauzj/wBIQNBmZqD3wUhBEH/pLmIBSEFQbrqv6p6IQZB8ua7",
  "4wMhB0GF3Z7beyEBQefMp9AGIQhBgH4hAgNAIAAhCSAHIgogASIHcyAIIgFxIAogB3FzIAFBHncgAUETd3MgAUEKd3NqIAUiAEEadyAAQRV3cy",
  "AAQQd3cyAEaiADIgsgAEF/c3FqIAkgAHFqIAJBgIqAgABqKAIAaiACQbCNgIAAaigCAGoiBWohCCAFIAZqIQUgCiEGIAshBCAJIQMgAkEEaiIC",
  "DQALQQAgBf0RIAD9HAEgCf0cAiAL/RwD/Qx/Ug5RjGgFm6vZgx8ZzeBb/a4B/QsEwI2AgABBACAI/REgAf0cASAH/RwCIAr9HAP9DGfmCWqFrm",
  "e7cvNuPDr1T6X9rgH9CwSwjYCAAEEAQQAoAsCKgIAAIgBBGHQgAEGA/gNxQQh0ciAAQQh2QYD+A3EgAEEYdnJyNgLQjYCAAEEAQQAoAsSKgIAA",
  "IgBBGHQgAEGA/gNxQQh0ciAAQQh2QYD+A3EgAEEYdnJyNgLUjYCAAEEAQQAoAsiKgIAAIgBBGHQgAEGA/gNxQQh0ciAAQQh2QYD+A3EgAEEYdn",
  "JyNgLYjYCAAAvXJAkDfwl7B38DewF/AnsBfwp7Cn9BACECAkACQAJAIAFBBEkNACABQQJ2IQNBACgC0IqAgAAhBEEA/QAEwI2AgAAiBSAF/Q0M",
  "DQ4PDA0ODwwNDg8MDQ4PIQYgBSAF/Q0ICQoLCAkKCwgJCgsICQoLIQcgBSAF/Q0EBQYHBAUGBwQFBgcEBQYHIQggBSAF/Q0AAQIDAAECAwABAg",
  "MAAQIDIQlBAP0AAryNgIAAIAX9DQABAgMAAQIDAAECAwABAgMhCkEA/QADuI2AgAAgBf0NAAECAwABAgMAAQIDAAECAyELQQD9AAK0jYCAACAF",
  "/Q0AAQIDAAECAwABAgMAAQIDIQxBAP0ABLCNgIAAIAX9DQABAgMAAQIDAAECAwABAgMhDUEAKALsioCAACEOQQAoAuiKgIAAIQ9BACgC5IqAgA",
  "AhEEEAKALgioCAACERQQAoAtyKgIAAIRJBACgC2IqAgAAhE0EAKALUioCAACEUQQD9CQLYjYCAACEVQQD9CQLUjYCAACEWQQD9CQLQjYCAACEX",
  "QQAhGANAQQD9DIACAACAAgAAgAIAAIACAAD9CwTQj4CAAEEA/QwAAAAAAAAAAAAAAAAAAAAAIhn9CwTAj4CAAEEAIBn9CwSwj4CAAEEAIBn9Cw",
  "Sgj4CAAEEAIBn9CwSQj4CAAEEAIBn9CwSAj4CAAEEAIBn9CwTwjoCAAEEAIBn9CwTgjoCAAEEAIBn9CwTQjoCAAEEAIBn9CwTAjoCAAEEAIBn9",
  "CwSwjoCAAEEA/QwAAACAAAAAgAAAAIAAAACAIhr9CwSgjoCAAEEAIBX9CwSAjoCAAEEAIBb9CwTwjYCAAEEAIBf9CwTgjYCAAEEAIBhBAnQgAG",
  "oiG0EYdCAbQYD+A3FBCHRyIBtBCHZBgP4DcSAbQRh2cnL9ESAbQQFqIgFBGHQgAUGA/gNxQQh0ciABQQh2QYD+A3EgAUEYdnJy/RwBIBtBAmoi",
  "AUEYdCABQYD+A3FBCHRyIAFBCHZBgP4DcSABQRh2cnL9HAIgG0EDaiIBQRh0IAFBgP4DcUEIdHIgAUEIdkGA/gNxIAFBGHZycv0cA/0LBJCOgI",
  "AAQYB6IQEgFyEFA0AgAUHglYCAAGogAUHwlICAAGr9AAQAIAX9rgEgAUHwk4CAAGr9AAQAIgVBGf2rASAFQQf9rQH9UCAFQQ79qwEgBUES/a0B",
  "/VD9USAFQQP9rQH9Uf2uASABQcCVgIAAav0ABAAiHEEP/asBIBxBEf2tAf1QIBxBDf2rASAcQRP9rQH9UP1RIBxBCv2tAf1R/a4B/QsEACAFIQ",
  "UgAUEQaiIBDQALQYB+IQFB4I2AgAAhAiANIR0gDCEcIAshHiAKIR8gCSEgIAYhISAHISIgCCEFA0AgBSEjIB4iJCAcIh79USAdIhz9TiAkIB79",
  "Tv1RIBxBHv2rASAcQQL9rQH9UCAcQRP9qwEgHEEN/a0B/VD9USAcQQr9qwEgHEEW/a0B/VD9Uf2uASAgIgVBGv2rASAFQQb9rQH9UCAFQRX9qw",
  "EgBUEL/a0B/VD9USAFQQf9qwEgBUEZ/a0B/VD9USAh/a4BICIiJSAF/U/9rgEgIyAF/U79rgEgAv0ABAD9rgEgAUGAioCAAGr9CQIA/a4BIiD9",
  "rgEhHSAgIB/9rgEhICACQRBqIQIgJCEfICUhISAjISIgAUEEaiIBDQALQQD9DAABAAAAAQAAAAEAAAABAAD9CwTQj4CAAEEAIBn9CwTAj4CAAE",
  "EAIBn9CwSwj4CAAEEAIBn9CwSgj4CAAEEAIBn9CwSQj4CAAEEAIBn9CwSAj4CAAEEAIBn9CwTwjoCAAEEAIBr9CwTgjoCAAEEAICUgBv2uAf0L",
  "BNCOgIAAQQAgIyAH/a4B/QsEwI6AgABBACAFIAj9rgH9CwSwjoCAAEEAICAgCf2uAf0LBKCOgIAAQQAgJCAK/a4B/QsEkI6AgABBACAeIAv9rg",
  "H9CwSAjoCAAEEAIBwgDP2uAf0LBPCNgIAAQQAgHSAN/a4BIgX9CwTgjYCAAEGAeiEBA0AgAUHglYCAAGogAUHwlICAAGr9AAQAIAX9rgEgAUHw",
  "k4CAAGr9AAQAIgVBGf2rASAFQQf9rQH9UCAFQQ79qwEgBUES/a0B/VD9USAFQQP9rQH9Uf2uASABQcCVgIAAav0ABAAiHEEP/asBIBxBEf2tAf",
  "1QIBxBDf2rASAcQRP9rQH9UP1RIBxBCv2tAf1R/a4B/QsEACAFIQUgAUEQaiIBDQAL/QyMaAWbjGgFm4xoBZuMaAWbIQX9DKvZgx+r2YMfq9mD",
  "H6vZgx8hH/0MGc3gWxnN4FsZzeBbGc3gWyEh/Qx/Ug5Rf1IOUX9SDlF/Ug5RIR39DDr1T6U69U+lOvVPpTr1T6UhIv0McvNuPHLzbjxy8248cv",
  "NuPCEe/QyFrme7ha5nu4WuZ7uFrme7IRz9DGfmCWpn5glqZ+YJamfmCWohIEGAfiEBQeCNgIAAIQIDQCAFISMgHiIkIBwiHv1RICAiHP1OICQg",
  "Hv1O/VEgHEEe/asBIBxBAv2tAf1QIBxBE/2rASAcQQ39rQH9UP1RIBxBCv2rASAcQRb9rQH9UP1R/a4BIB0iBUEa/asBIAVBBv2tAf1QIAVBFf",
  "2rASAFQQv9rQH9UP1RIAVBB/2rASAFQRn9rQH9UP1RICH9rgEgHyIlIAX9T/2uASAjIAX9Tv2uASAC/QAEAP2uASABQYCKgIAAav0JAgD9rgEi",
  "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",
  "BBACAB/QsEoI+AgABBACAB/QsEkI+AgABBACAB/QsEgI+AgABBACAB/QsE8I6AgABBACAB/QsE4I6AgABBACAB/QsE0I6AgABBACAB/QsEwI6A",
  "gABBACAB/QsEsI6AgABBAP0MAAAAgAAAAIAAAACAAAAAgCIC/QsEoI6AgABBAEEA/QkC0I2AgAAiA/0LBOCNgIAAQQBBAP0JAtSNgIAA/QsE8I",
  "2AgABBAEEA/QkC2I2AgAD9CwSAjoCAAEEAIABBGHQgAEGA/gNxQQh0ciAAQQh2QYD+A3EgAEEYdnJy/RH9CwSQjoCAAEEA/QAEwI2AgAAiBCAD",
  "/Q0MDQ4PDA0ODwwNDg8MDQ4PIQUgBCAD/Q0ICQoLCAkKCwgJCgsICQoLIQYgBCAD/Q0EBQYHBAUGBwQFBgcEBQYHIQcgBCAD/Q0AAQIDAAECAw",
  "ABAgMAAQIDIQhBAP0AAryNgIAAIAP9DQABAgMAAQIDAAECAwABAgMhCUEA/QADuI2AgAAgA/0NAAECAwABAgMAAQIDAAECAyEKQQD9AAK0jYCA",
  "ACAD/Q0AAQIDAAECAwABAgMAAQIDIQtBAP0ABLCNgIAAIAP9DQABAgMAAQIDAAECAwABAgMhDEGAeiEAA0AgAEHglYCAAGogAEHwlICAAGr9AA",
  "QAIAP9rgEgAEHwk4CAAGr9AAQAIgNBGf2rASADQQf9rQH9UCADQQ79qwEgA0ES/a0B/VD9USADQQP9rQH9Uf2uASAAQcCVgIAAav0ABAAiBEEP",
  "/asBIARBEf2tAf1QIARBDf2rASAEQRP9rQH9UP1RIARBCv2tAf1R/a4B/QsEACADIQMgAEEQaiIADQALQYB+IQBB4I2AgAAhDSAMIQ4gCyEEIA",
  "ohDyAJIRAgCCERIAUhEiAGIRMgByEDA0AgAyEUIA8iFSAEIg/9USAOIgT9TiAVIA/9Tv1RIARBHv2rASAEQQL9rQH9UCAEQRP9qwEgBEEN/a0B",
  "/VD9USAEQQr9qwEgBEEW/a0B/VD9Uf2uASARIgNBGv2rASADQQb9rQH9UCADQRX9qwEgA0EL/a0B/VD9USADQQf9qwEgA0EZ/a0B/VD9USAS/a",
  "4BIBMiFiAD/U/9rgEgFCAD/U79rgEgDf0ABAD9rgEgAEGAioCAAGr9CQIA/a4BIhH9rgEhDiARIBD9rgEhESANQRBqIQ0gFSEQIBYhEiAUIRMg",
  "AEEEaiIADQALQQD9DAABAAAAAQAAAAEAAAABAAD9CwTQj4CAAEEAIAH9CwTAj4CAAEEAIAH9CwSwj4CAAEEAIAH9CwSgj4CAAEEAIAH9CwSQj4",
  "CAAEEAIAH9CwSAj4CAAEEAIAH9CwTwjoCAAEEAIAL9CwTgjoCAAEEAIBYgBf2uAf0LBNCOgIAAQQAgFCAG/a4B/QsEwI6AgABBACADIAf9rgH9",
  "CwSwjoCAAEEAIBEgCP2uAf0LBKCOgIAAQQAgFSAJ/a4B/QsEkI6AgABBACAPIAr9rgH9CwSAjoCAAEEAIAQgC/2uAf0LBPCNgIAAQQAgDiAM/a",
  "4BIgP9CwTgjYCAAEGAeiEAA0AgAEHglYCAAGogAEHwlICAAGr9AAQAIAP9rgEgAEHwk4CAAGr9AAQAIgNBGf2rASADQQf9rQH9UCADQQ79qwEg",
  "A0ES/a0B/VD9USADQQP9rQH9Uf2uASAAQcCVgIAAav0ABAAiBEEP/asBIARBEf2tAf1QIARBDf2rASAEQRP9rQH9UP1RIARBCv2tAf1R/a4B/Q",
  "sEACADIQMgAEEQaiIADQAL/QyMaAWbjGgFm4xoBZuMaAWbIQP9DKvZgx+r2YMfq9mDH6vZgx8hEP0MGc3gWxnN4FsZzeBbGc3gWyES/Qx/Ug5R",
  "f1IOUX9SDlF/Ug5RIQ79DDr1T6U69U+lOvVPpTr1T6UhE/0McvNuPHLzbjxy8248cvNuPCEP/QyFrme7ha5nu4WuZ7uFrme7IQT9DGfmCWpn5g",
  "lqZ+YJamfmCWohEUGAfiEAQeCNgIAAIQ0DQCADIRQgDyIVIAQiD/1RIBEiBP1OIBUgD/1O/VEgBEEe/asBIARBAv2tAf1QIARBE/2rASAEQQ39",
  "rQH9UP1RIARBCv2rASAEQRb9rQH9UP1R/a4BIA4iA0Ea/asBIANBBv2tAf1QIANBFf2rASADQQv9rQH9UP1RIANBB/2rASADQRn9rQH9UP1RIB",
  "L9rgEgECIWIAP9T/2uASAUIAP9Tv2uASAN/QAEAP2uASAAQYCKgIAAav0JAgD9rgEiDv2uASERIA4gE/2uASEOIA1BEGohDSAVIRMgFiESIBQh",
  "ECAAQQRqIgANAAtBACAW/RsAQZmag98FaiIAQRh0IABBgP4DcUEIdHIgAEEIdkGA/gNxIABBGHZycjYCrIuAgABBACAU/RsAQauzj/wBaiIAQR",
  "h0IABBgP4DcUEIdHIgAEEIdkGA/gNxIABBGHZycjYCqIuAgABBACAD/RsAQYzRldh5aiIAQRh0IABBgP4DcUEIdHIgAEEIdkGA/gNxIABBGHZy",
  "cjYCpIuAgABBACAO/RsAQf+kuYgFaiIAQRh0IABBgP4DcUEIdHIgAEEIdkGA/gNxIABBGHZycjYCoIuAgABBACAV/RsAQbrqv6p6aiIAQRh0IA",
  "BBgP4DcUEIdHIgAEEIdkGA/gNxIABBGHZycjYCnIuAgABBACAP/RsAQfLmu+MDaiIAQRh0IABBgP4DcUEIdHIgAEEIdkGA/gNxIABBGHZycjYC",
  "mIuAgABBACAE/RsAQYXdntt7aiIAQRh0IABBgP4DcUEIdHIgAEEIdkGA/gNxIABBGHZycjYClIuAgABBACAR/RsAQefMp9AGaiIAQRh0IABBgP",
  "4DcUEIdHIgAEEIdkGA/gNxIABBGHZycjYCkIuAgAALC4gCAQBBgAgLgAKYL4pCkUQ3cc/7wLWl27XpW8JWOfER8Vmkgj+S1V4cq5iqB9gBW4MS",
  "voUxJMN9DFV0Xb5y/rHegKcG3Jt08ZvBwWmb5IZHvu/GncEPzKEMJG8s6S2qhHRK3KmwXNqI+XZSUT6YbcYxqMgnA7DHf1m/8wvgxkeRp9VRY8",
  "oGZykpFIUKtyc4IRsu/G0sTRMNOFNUcwpluwpqdi7JwoGFLHKSoei/oktmGqhwi0vCo1FsxxnoktEkBpnWhTUO9HCgahAWwaQZCGw3Hkx3SCe1",
  "vLA0swwcOUqq2E5Pypxb828uaO6Cj3RvY6V4FHjIhAgCx4z6/76Q62xQpPej+b7yeHHGAHMEbmFtZQAMC21pbmVyNC53YXNtAT4HAAdoZHJfcH",
  "RyAQhzdGd0X3B0cgIIbnRndF9wdHIDB291dF9wdHIEB3ByZXBhcmUFBHNjYW4GBmRpZ2VzdAcSAQAPX19zdGFja19wb2ludGVyCQoBAAcucm9k",
  "YXRhADgJcHJvZHVjZXJzAQxwcm9jZXNzZWQtYnkBDFVidW50dSBjbGFuZxExOC4xLjMgKDF1YnVudHUxKQA1D3RhcmdldF9mZWF0dXJlcwMrD2",
  "11dGFibGUtZ2xvYmFscysIc2lnbi1leHQrB3NpbWQxMjg="
].join("");

// ==================== NUCLEO (roda em cada thread) ====================
function iniciarWorker(){
  const bin = Buffer.from(WASM_B64, 'base64');
  const inst = new WebAssembly.Instance(new WebAssembly.Module(bin), {});
  const ex = inst.exports;
  const hdrPtr = ex.hdr_ptr(), stgtPtr = ex.stgt_ptr(), ntgtPtr = ex.ntgt_ptr(), outPtr = ex.out_ptr();
  const out = new Uint32Array(ex.memory.buffer, outPtr, 8);

  let rodando = false, cursor = 0, hashes = 0, fatia = 400000, ultimoAviso = Date.now();

  parentPort.on('message', (m) => {
    if(m.type === 'job'){
      new Uint8Array(ex.memory.buffer).set(m.headerPrefix, hdrPtr);
      ex.prepare();
      new Uint32Array(ex.memory.buffer, stgtPtr, 8).set(m.shareTarget);
      new Uint32Array(ex.memory.buffer, ntgtPtr, 8).set(m.networkTarget);
      cursor = m.nonceStart >>> 0;
      hashes = 0; ultimoAviso = Date.now();
      if(!rodando){ rodando = true; setImmediate(laco); }
    } else if(m.type === 'setShareTarget'){
      new Uint32Array(ex.memory.buffer, stgtPtr, 8).set(m.shareTarget);
    } else if(m.type === 'stop'){
      rodando = false;
    }
  });

  function laco(){
    if(!rodando) return;
    const t0 = Date.now();
    if(ex.scan(cursor >>> 0, fatia)){
      const nonce = out[0] >>> 0;
      parentPort.postMessage({type:'found', nonce, isBlock: out[1] === 1});
      hashes += ((nonce - cursor) >>> 0) + 1;
      cursor = (nonce + 1) >>> 0;
    } else {
      hashes += fatia;
      cursor = (cursor + fatia) >>> 0;
    }
    const dt = Date.now() - t0;
    if(dt > 0) fatia = Math.max(100000, Math.min(20000000, Math.round(fatia * (200/dt)))) & ~3;
    const agora = Date.now();
    if(agora - ultimoAviso >= 1000){
      parentPort.postMessage({type:'progress', hashes});
      hashes = 0; ultimoAviso = agora;
    }
    setImmediate(laco);
  }
  parentPort.postMessage({type:'pronto'});
}

if(!isMainThread){ iniciarWorker(); return; }

// ==================== PRINCIPAL ====================
const POOL_HOST = process.env.POOL_HOST || 'solo.ckpool.org';
const POOL_PORT = parseInt(process.env.POOL_PORT || '3333', 10);
const BTC_USER  = process.env.BTC_USER  || '';
const THREADS   = parseInt(process.env.THREADS || String(Math.max(1, os.cpus().length - 1)), 10);
const SUG_DIFF  = parseFloat(process.env.SUG_DIFF || '0.05');

if(!BTC_USER){
  console.error('Defina BTC_USER com seu endereco Bitcoin. Exemplo:');
  console.error('  set BTC_USER=bc1qseuendereco.pc');
  process.exit(1);
}

// ---- utilidades de bytes ----
const hx = (h) => Buffer.from(h, 'hex');
function swap32(hex){
  const b = hx(hex), o = Buffer.alloc(b.length);
  for(let i=0;i<b.length;i+=4){ o[i]=b[i+3]; o[i+1]=b[i+2]; o[i+2]=b[i+1]; o[i+3]=b[i]; }
  return o.toString('hex');
}
const crypto = require('crypto');
const sha256d = (b) => crypto.createHash('sha256').update(crypto.createHash('sha256').update(b).digest()).digest();

function bitsParaAlvo(bitsHex){
  const b = hx(bitsHex), exp = b[0];
  const t = Buffer.alloc(32), ini = 32 - exp;
  for(let i=0;i<3;i++){ const p = ini + i; if(p>=0 && p<32) t[p] = b[1+i]; }
  const w = new Uint32Array(8);
  for(let i=0;i<8;i++) w[i] = t.readUInt32BE(i*4);
  return w;
}
function dificuldadeParaAlvo(diff){
  const diff1 = 0xFFFFn << 208n;
  let x = (diff1 * 1000000n) / BigInt(Math.max(1, Math.round(diff * 1e6)));
  const lim = (1n << 256n) - 1n;
  if(x > lim) x = lim;
  const w = new Uint32Array(8);
  for(let i=7;i>=0;i--){ w[i] = Number(x & 0xffffffffn) >>> 0; x >>= 32n; }
  return w;
}

// ---- guarda: a montagem do cabecalho tem que reproduzir o bloco genesis ----
(function guardaGenesis(){
  const alvo = '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f';
  const merkle = hx('4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b').reverse();
  const hex = swap32('00000001') + swap32('0'.repeat(64)) + merkle.toString('hex') +
              swap32('495fab29') + swap32('1d00ffff');
  const h = Buffer.alloc(80); hx(hex).copy(h, 0); h.writeUInt32LE(2083236893, 76);
  if(Buffer.from(sha256d(h)).reverse().toString('hex') !== alvo){
    console.error('FALHA: a montagem do cabecalho nao reproduz o bloco genesis. Abortando.');
    process.exit(1);
  }
})();

// ---- estado ----
let extranonce1 = null, extranonce2Size = 4;
let jobAtual = null, msgId = 1, poolDiff = 1;
let aceitos = 0, rejeitados = 0, hashAcum = 0, ultimaTaxa = Date.now(), taxaEma = 0;
let subscribeId = -1, authorizeId = -1, suggestId = -1;
const pendentes = {};
const workers = [];

function log(...a){ console.log('[' + new Date().toLocaleTimeString('pt-BR') + ']', ...a); }
function fmt(h){
  if(h >= 1e9) return (h/1e9).toFixed(2)+' GH/s';
  if(h >= 1e6) return (h/1e6).toFixed(2)+' MH/s';
  if(h >= 1e3) return (h/1e3).toFixed(2)+' kH/s';
  return h.toFixed(0)+' H/s';
}

// ---- conexao Stratum (TCP direto, sem proxy) ----
const sock = net.connect(POOL_PORT, POOL_HOST, () => {
  log('Conectado a ' + POOL_HOST + ':' + POOL_PORT);
  subscribeId = msgId++;
  enviar({id: subscribeId, method:'mining.subscribe', params:['miner-pc/1.0']});
});
sock.setEncoding('utf8');
sock.on('error', (e) => { log('Erro de conexao:', e.message); process.exit(1); });
sock.on('close', () => { log('Conexao encerrada pelo pool.'); process.exit(1); });

function enviar(o){ sock.write(JSON.stringify(o) + '\n'); }

let buf = '';
sock.on('data', (d) => {
  buf += d;
  let i;
  while((i = buf.indexOf('\n')) >= 0){
    const linha = buf.slice(0, i); buf = buf.slice(i+1);
    if(linha.trim()) tratar(JSON.parse(linha));
  }
});

function tratar(m){
  if(m.id === subscribeId && m.result){
    extranonce1 = m.result[1];
    extranonce2Size = m.result[2];
    log('Inscrito. extranonce1=' + extranonce1 + ' size=' + extranonce2Size);
    authorizeId = msgId++;
    enviar({id: authorizeId, method:'mining.authorize', params:[BTC_USER, 'x']});
  } else if(m.id === authorizeId){
    log(m.result === true ? 'Autorizado pelo pool.' : 'Pool NAO autorizou: ' + JSON.stringify(m.error));
    if(SUG_DIFF > 0){
      suggestId = msgId++;
      enviar({id: suggestId, method:'mining.suggest_difficulty', params:[SUG_DIFF]});
      log('Sugerindo dificuldade ' + SUG_DIFF);
    }
  } else if(m.id === suggestId){
    if(m.error) log('Pool recusou a sugestao de dificuldade (usa a dele).');
  } else if(m.method === 'mining.notify'){
    jobAtual = { jobId:m.params[0], prevhash:m.params[1], coinb1:m.params[2], coinb2:m.params[3],
                 branch:m.params[4], version:m.params[5], nbits:m.params[6], ntime:m.params[7] };
    distribuirJob();
  } else if(m.method === 'mining.set_difficulty'){
    poolDiff = m.params[0];
    log('Dificuldade do pool: ' + poolDiff);
    const st = dificuldadeParaAlvo(poolDiff);
    workers.forEach(w => w.postMessage({type:'setShareTarget', shareTarget: st}));
  } else if(pendentes[m.id] !== undefined){
    const p = pendentes[m.id]; delete pendentes[m.id];
    if(m.result === true){
      aceitos++;
      if(p.isBlock) log('*** BLOCO ENCONTRADO! Hash abaixo do alvo REAL da rede. ***');
      else log('Share aceito (' + aceitos + ')');
    } else {
      rejeitados++;
      log('Share REJEITADO: ' + JSON.stringify(m.error || m.result));
    }
  }
}

function montarPrefixo(job, en2){
  const coinbase = Buffer.concat([hx(job.coinb1), hx(extranonce1), hx(en2), hx(job.coinb2)]);
  let merkle = sha256d(coinbase);
  for(const b of job.branch) merkle = sha256d(Buffer.concat([merkle, hx(b)]));
  // merkle NAO leva swap (conferido contra o bloco genesis acima)
  const hex = swap32(job.version) + swap32(job.prevhash) + merkle.toString('hex') +
              swap32(job.ntime) + swap32(job.nbits);
  return new Uint8Array(hx(hex));
}

function distribuirJob(){
  if(!jobAtual || !workers.length) return;
  const st = dificuldadeParaAlvo(poolDiff);
  const nt = bitsParaAlvo(jobAtual.nbits);
  workers.forEach((w, i) => {
    const en2 = i.toString(16).padStart(extranonce2Size*2, '0');
    w._en2 = en2;
    w.postMessage({ type:'job', headerPrefix: montarPrefixo(jobAtual, en2),
                    shareTarget: st, networkTarget: nt,
                    nonceStart: Math.floor(4294967295 / workers.length) * i });
  });
}

function submeter(idx, nonce, isBlock){
  if(!jobAtual) return;
  const id = msgId++;
  pendentes[id] = { isBlock: !!isBlock };
  enviar({ id, method:'mining.submit',
           params:[BTC_USER, jobAtual.jobId, workers[idx]._en2, jobAtual.ntime,
                   (nonce >>> 0).toString(16).padStart(8,'0')] });
}

// ---- sobe as threads ----
log('Iniciando ' + THREADS + ' threads (WASM SIMD) - usuario ' + BTC_USER);
for(let i=0;i<THREADS;i++){
  const w = new Worker(__filename);
  w.on('message', (m) => {
    if(m.type === 'progress') hashAcum += m.hashes;
    else if(m.type === 'found') submeter(i, m.nonce, m.isBlock);
    else if(m.type === 'pronto' && jobAtual) distribuirJob();
  });
  w.on('error', (e) => log('Erro na thread ' + i + ':', e.message));
  workers.push(w);
}

setInterval(() => {
  const agora = Date.now(), dt = (agora - ultimaTaxa)/1000;
  if(dt >= 1){
    const inst = hashAcum / dt;
    taxaEma = taxaEma > 0 ? taxaEma*0.6 + inst*0.4 : inst;
    hashAcum = 0; ultimaTaxa = agora;
    process.stdout.write('\r  ' + fmt(taxaEma) + '  |  aceitos: ' + aceitos +
                         '  rejeitados: ' + rejeitados + '  |  dif. pool: ' + poolDiff + '     ');
  }
}, 2000);

process.on('SIGINT', () => { console.log('\nEncerrando...'); workers.forEach(w=>w.terminate()); process.exit(0); });
