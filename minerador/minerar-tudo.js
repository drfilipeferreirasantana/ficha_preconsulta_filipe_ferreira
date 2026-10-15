/**
 * Liga as DUAS forcas de hash ao mesmo tempo, numa janela so:
 *
 *   [PC ] miner-pc.js        - mina direto no notebook, por TCP
 *   [CEL] stratum-ws-proxy   - serve o miner.html e faz a ponte para o celular
 *
 * Os dois mineram para o MESMO endereco Bitcoin, com nomes de trabalhador
 * distintos (.pc e .cel), de modo que o pool os conta separadamente mas paga
 * no mesmo lugar. Sao duas conexoes Stratum independentes - e assim deve ser.
 *
 * Nao altera nenhum dos dois programas: apenas os executa e le a saida deles.
 *
 * Uso (PowerShell):
 *     cd C:\solo-miner
 *     $env:BTC_USER="bc1qseuendereco"
 *     node minerar-tudo.js
 *
 * Variaveis: POOL_HOST (solo.ckpool.org)  POOL_PORT (3333)
 *            BTC_USER  (obrigatorio, SEM sufixo - ele e acrescentado)
 *            LISTEN_PORT (8081)           THREADS (padrao: nucleos - 1)
 */

const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const POOL_HOST   = process.env.POOL_HOST || 'solo.ckpool.org';
const POOL_PORT   = process.env.POOL_PORT || '3333';
const LISTEN_PORT = process.env.LISTEN_PORT || '8081';
const THREADS     = process.env.THREADS || '';
const SILENCIOSO  = process.env.SILENCIOSO === '1';   // esconde a saida detalhada

// o endereco vem sem sufixo; cada minerador ganha o seu
let base = (process.env.BTC_USER || '').trim();
if (!base) {
  console.error('\nDefina BTC_USER com seu endereco Bitcoin, SEM sufixo. Exemplo:');
  console.error('   $env:BTC_USER="bc1qsynd3t4h72wfk9xyspr78cuekevfggf7c9sc5d"');
  console.error('   node minerar-tudo.js\n');
  process.exit(1);
}
if (base.includes('.')) base = base.split('.')[0];   // tolera sufixo colado por engano
const USER_PC  = base + '.pc';
const USER_CEL = base + '.cel';

for (const arq of ['miner-pc.js', 'stratum-ws-proxy.js', 'miner.html']) {
  if (!fs.existsSync(path.join(__dirname, arq))) {
    console.error(`\nFalta o arquivo ${arq} nesta pasta (${__dirname}).`);
    console.error('Os quatro precisam estar juntos: minerar-tudo.js, miner-pc.js,');
    console.error('stratum-ws-proxy.js e miner.html.\n');
    process.exit(1);
  }
}

function ips() {
  const fora = [];
  for (const [nome, lista] of Object.entries(os.networkInterfaces() || {})) {
    for (const i of lista || []) {
      if (i.family === 'IPv4' && !i.internal) fora.push({ nome, ip: i.address });
    }
  }
  // o IP da rede local costuma comecar com 192.168 ou 10.
  fora.sort((a, b) => {
    const p = x => /^192\.168\./.test(x.ip) ? 0 : /^10\./.test(x.ip) ? 1 : /^172\./.test(x.ip) ? 2 : 3;
    return p(a) - p(b);
  });
  return fora;
}

// Com dificuldade 1, cada share exige 2^32 hashes em media. A 8 MH/s isso da
// cerca de 9 minutos. Sem este aviso, "shares 0" parece defeito quando e so
// o relogio.
function esperaShare() {
  if ((pc.aceitos + cel.aceitos) > 0) return '';
  const taxa = pc.taxa + (cel.taxaReal || cel.taxaEstimada);
  const dif = pc.dif || cel.dif;
  if (!taxa || !dif) return '';
  const seg = (dif * 4294967296) / taxa;
  const decorrido = (Date.now() - inicio) / 1000;
  if (decorrido > seg * 3) return ' (demorando mais que o previsto)';
  return ' (1o em ~' + Math.ceil(seg / 60) + ' min)';
}

function fmt(h) {
  if (!isFinite(h) || h <= 0) return '---';
  if (h >= 1e9) return (h / 1e9).toFixed(2) + ' GH/s';
  if (h >= 1e6) return (h / 1e6).toFixed(2) + ' MH/s';
  if (h >= 1e3) return (h / 1e3).toFixed(2) + ' kH/s';
  return h.toFixed(0) + ' H/s';
}

// ---------------------------------------------------------------------------
// Estado de cada frente
// ---------------------------------------------------------------------------
const pc  = { taxa: 0, aceitos: 0, rejeitados: 0, dif: null, ligado: false };
const cel = { conectado: false, aceitos: 0, rejeitados: 0, dif: null,
              desde: null, taxaEstimada: 0, taxaReal: 0, taxaRealEm: 0 };
let blocos = 0;
const inicio = Date.now();

const listaIps = ips();
const ipSugerido = listaIps.length ? listaIps[0].ip : 'SEU_IP';

console.log('='.repeat(64));
console.log('  SOLO MINER - as duas forcas juntas');
console.log('='.repeat(64));
console.log('  pool ........: ' + POOL_HOST + ':' + POOL_PORT);
console.log('  notebook ....: ' + USER_PC);
console.log('  celular .....: ' + USER_CEL);
console.log('-'.repeat(64));
if (listaIps.length) {
  console.log('  IPs deste computador:');
  for (const i of listaIps) console.log('    ' + i.ip.padEnd(16) + i.nome);
} else {
  console.log('  Nenhum IP de rede encontrado - confira a conexao Wi-Fi.');
}
console.log('-'.repeat(64));
console.log('  No celular, abra no navegador:');
console.log('     http://' + ipSugerido + ':' + LISTEN_PORT + '/');
console.log('  No campo "proxy" da pagina:');
console.log('     ws://' + ipSugerido + ':' + LISTEN_PORT + '/ws');
console.log('  No campo do endereco, use:');
console.log('     ' + USER_CEL);
console.log('='.repeat(64));
console.log('  NAO FECHE esta janela. Ctrl+C encerra os dois.');
console.log('');

// ---------------------------------------------------------------------------
// Sobe os dois processos
// ---------------------------------------------------------------------------
let encerrando = false;

function subir(nome, arquivo, env) {
  const p = spawn(process.execPath, [path.join(__dirname, arquivo)], {
    env: Object.assign({}, process.env, env),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  p.stdout.setEncoding('utf8');
  p.stderr.setEncoding('utf8');
  p.on('error', e => console.log(`\n[${nome}] nao consegui iniciar: ${e.message}`));
  p.on('exit', c => {
    if (!encerrando) {
      console.log(`\n[${nome}] encerrou (codigo ${c}). O outro continua minerando.`);
    }
    if (nome === 'PC ') pc.ligado = false;
  });
  return p;
}

const proc = {};
proc.pc = subir('PC ', 'miner-pc.js', {
  POOL_HOST, POOL_PORT, BTC_USER: USER_PC,
  THREADS: THREADS || String(Math.max(1, os.cpus().length - 1))
});
proc.proxy = subir('CEL', 'stratum-ws-proxy.js', {
  POOL_HOST, POOL_PORT, LISTEN_PORT
});

// ---------------------------------------------------------------------------
// Le a saida de cada um, sem alterar os programas
// ---------------------------------------------------------------------------
// Duas leituras da mesma saida, com propositos distintos:
//
//   onLinha - so linhas COMPLETAS, para exibir. Nunca metade de frase.
//   onTexto - a cauda acumulada, para extrair numeros. Independe de onde o
//             fluxo cortou o pedaco, porque os campos sao buscados no texto
//             corrido e simplesmente reaparecem quando o resto chega.
//
// A separacao existe porque o minerador do PC redesenha a taxa com \r, sem
// quebra de linha, e o fluxo pode cortar no meio de "aceitos: 1|06".
function escutar(p, onLinha, onTexto) {
  let resto = '';
  let cauda = '';
  const trata = (d) => {
    const txt = String(d);

    // --- exibicao: apenas linhas inteiras ---
    resto += txt;
    const partes = resto.split(/[\r\n]/);
    resto = partes.pop();
    for (const l of partes) if (l.trim()) onLinha(l.trim());

    // --- extracao: cauda corrida, sem depender de fronteira ---
    if (onTexto) {
      cauda = (cauda + txt).slice(-600);
      onTexto(cauda);
    }
  };
  p.stdout.on('data', trata);
  p.stderr.on('data', trata);
}

// Le o ULTIMO valor de um campo na cauda. O ultimo, e nao o primeiro, porque
// a linha de estado e reescrita a cada atualizacao e a mais recente fica no fim.
function ultimo(texto, re) {
  let m, achado = null;
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  while ((m = g.exec(texto)) !== null) achado = m;
  return achado;
}

escutar(proc.pc,
  (l) => {   // exibicao
    const ehEstado = /(GH|MH|kH|H)\/s/.test(l) && /aceitos:/.test(l);
    if (/BLOCO ENCONTRADO/i.test(l)) { blocos++; alarme('PC', l); }
    if (!SILENCIOSO && !ehEstado && l.trim()) console.log('[PC ] ' + l);
  },
  (cauda) => {   // extracao: "  12.34 MH/s  |  aceitos: 3  rejeitados: 0  |  dif. pool: 0.05"
    const t = ultimo(cauda, /([\d.]+)\s*(GH|MH|kH|H)\/s/);
    if (t) {
      pc.taxa = parseFloat(t[1]) * ({ GH: 1e9, MH: 1e6, kH: 1e3, H: 1 })[t[2]];
      pc.ligado = true;
    }
    const a = ultimo(cauda, /aceitos:\s*(\d+)/);       if (a) pc.aceitos = +a[1];
    const r = ultimo(cauda, /rejeitados:\s*(\d+)/);    if (r) pc.rejeitados = +r[1];
    const d = ultimo(cauda, /dif\. pool:\s*([\d.]+)/); if (d) pc.dif = parseFloat(d[1]);
  });

escutar(proc.proxy, (l) => {
  if (/celular conectado/i.test(l)) {
    cel.conectado = true;
    cel.desde = Date.now();
    cel.aceitos = 0;
  }
  if (/celular desconectou/i.test(l)) cel.conectado = false;
  const d = l.match(/dificuldade do pool:\s*([\d.]+)/i);
  if (d) cel.dif = parseFloat(d[1]);
  // taxa informada pela propria pagina: exata, e nao estimativa
  const t = l.match(/taxa do celular:\s*(\d+)\s*H\/s/i);
  if (t) { cel.taxaReal = +t[1]; cel.taxaRealEm = Date.now(); }
  if (/share aceito/i.test(l)) cel.aceitos++;
  if (/REJEITADO/i.test(l)) cel.rejeitados++;
  if (/BLOCO ENCONTRADO/i.test(l)) { blocos++; alarme('CELULAR', l); }
  if (!SILENCIOSO) console.log('[CEL] ' + l);
});

function alarme(onde, linha) {
  console.log('\n' + '*'.repeat(64));
  console.log('***  B L O C O   E N C O N T R A D O   -   ' + onde);
  console.log('***  ' + linha);
  console.log('***  NAO FECHE NADA. Confira o painel do pool pelo seu endereco.');
  console.log('*'.repeat(64) + '\n');
  // bipe do console, repetido - funciona em Windows, Linux e macOS
  for (let i = 0; i < 10; i++) setTimeout(() => process.stdout.write('\x07'), i * 400);
}

// ---------------------------------------------------------------------------
// Painel somado
// ---------------------------------------------------------------------------
const painel = setInterval(() => {
  // Estimativa da taxa do celular: cada share aceito representa, em media,
  // dificuldade x 2^32 hashes. E so uma estimativa, e precisa de tempo para
  // ficar estavel - por isso vem rotulada como aproximada.
  if (cel.conectado && cel.desde && cel.aceitos > 0 && cel.dif) {
    const seg = (Date.now() - cel.desde) / 1000;
    if (seg > 5) cel.taxaEstimada = (cel.aceitos * cel.dif * 4294967296) / seg;
  }
  if (!cel.conectado) { cel.taxaEstimada = 0; cel.taxaReal = 0; }
  // a taxa informada vence a estimada; se parar de chegar, envelhece em 30 s
  if (cel.taxaReal && Date.now() - cel.taxaRealEm > 30000) cel.taxaReal = 0;

  const taxaCel = cel.taxaReal || cel.taxaEstimada;
  const total = pc.taxa + taxaCel;
  const horas = (Date.now() - inicio) / 3600000;

  const linha =
    '  TOTAL ' + fmt(total).padEnd(11) +
    '|  PC ' + fmt(pc.taxa).padEnd(11) +
    '|  CEL ' + (cel.conectado
        ? (cel.taxaReal ? fmt(cel.taxaReal)
          : cel.taxaEstimada ? '~' + fmt(cel.taxaEstimada) : 'ligado')
        : 'desligado').padEnd(12) +
    '|  shares ' + (pc.aceitos + cel.aceitos) + esperaShare() +
    (blocos ? '  |  BLOCOS ' + blocos : '') +
    '  |  ' + horas.toFixed(1) + 'h   ';
  process.stdout.write('\r' + linha);
}, 3000);

// ---------------------------------------------------------------------------
function encerrar() {
  if (encerrando) return;            // Ctrl+C repetido nao atropela o desligamento
  encerrando = true;
  clearInterval(painel);

  // escrita sincrona: garante que a mensagem saia antes de qualquer saida
  try { fs.writeSync(1, '\n\nEncerrando os dois mineradores...\n'); }
  catch (e) { console.log('\n\nEncerrando os dois mineradores...'); }

  let vivos = 0;
  for (const p of [proc.pc, proc.proxy]) {
    if (p && p.exitCode === null && !p.killed) {
      vivos++;
      p.once('exit', () => { if (--vivos === 0) sair(); });
      try { p.kill('SIGTERM'); } catch (e) { vivos--; }
    }
  }
  if (vivos === 0) sair();
  // quem nao sair por bem, sai por mal
  setTimeout(() => {
    for (const p of [proc.pc, proc.proxy]) { try { p.kill('SIGKILL'); } catch (e) {} }
    sair();
  }, 3000).unref();
}
function sair() {
  try { fs.writeSync(1, 'Encerrado.\n'); } catch (e) {}
  process.exit(0);
}
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
