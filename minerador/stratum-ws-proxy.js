/**
 * Ponte WebSocket <-> Stratum (TCP) para o Solo Miner Console (miner.html).
 *
 * Por que existe: navegadores nao abrem soquete TCP bruto, so WebSocket/HTTP.
 * Pools de mineracao Bitcoin falam Stratum V1 sobre TCP puro (linhas JSON
 * terminadas em \n). Este script conecta ao pool via TCP e repassa as mesmas
 * linhas para o celular via WebSocket, nos dois sentidos, sem alterar o
 * conteudo - e uma ponte transparente, nao reimplementa o protocolo.
 *
 * Alem de repassar, ele OBSERVA o trafego e grava minerador_log.txt:
 * para cada mining.submit do celular, remonta o cabecalho de 80 bytes,
 * calcula o hash e compara com o alvo REAL da rede (campo nbits). Se o hash
 * ficar abaixo desse alvo, e bloco - e nao apenas share - e a linha
 * "BLOCO ENCONTRADO" vai para o log, que o monitorar-bloco.bat vigia.
 *
 * Uso:
 *   npm install ws
 *   POOL_HOST=solo.ckpool.org POOL_PORT=3333 LISTEN_PORT=8081 node stratum-ws-proxy.js
 *
 * No celular, abra: http://<ip-do-servidor>:8081/
 * No campo "proxy" do app, use: ws://<ip-do-servidor>:8081/ws
 */

const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws'); // npm install ws

const POOL_HOST = process.env.POOL_HOST || '';
const POOL_PORT = parseInt(process.env.POOL_PORT || '3333', 10);
const LISTEN_PORT = parseInt(process.env.LISTEN_PORT || '8081', 10);
const MINER_HTML_PATH = path.join(__dirname, 'miner.html');
const LOG_PATH = path.join(__dirname, 'minerador_log.txt');

if (!POOL_HOST) {
  console.error('Defina POOL_HOST (endereco do pool Stratum, ex: solo.ckpool.org) antes de rodar.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Log em arquivo: o monitorar-bloco.bat le daqui
// ---------------------------------------------------------------------------
function log(texto) {
  const agora = new Date();
  const hora = agora.toLocaleTimeString('pt-BR');
  const linha = `[${hora}] ${texto}`;
  console.log(linha);
  try {
    fs.appendFileSync(LOG_PATH, linha + '\r\n');  // \r\n para o findstr do Windows
  } catch (err) {
    console.error('[proxy] nao consegui gravar no log:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Primitivas Bitcoin (as mesmas convencoes verificadas no miner.html)
// ---------------------------------------------------------------------------
const sha256 = b => crypto.createHash('sha256').update(b).digest();
const sha256d = b => sha256(sha256(b));

function swap32(hex) {
  const b = Buffer.from(hex, 'hex');
  const o = Buffer.alloc(b.length);
  for (let i = 0; i < b.length; i += 4) {
    o[i] = b[i + 3]; o[i + 1] = b[i + 2]; o[i + 2] = b[i + 1]; o[i + 3] = b[i];
  }
  return o.toString('hex');
}

/** Campo 'bits' compacto -> alvo real da rede, 32 bytes big-endian. */
function alvoDosBits(bitsHex) {
  const b = Buffer.from(bitsHex, 'hex');
  const expoente = b[0];
  const mantissa = BigInt('0x' + b.slice(1, 4).toString('hex'));
  const alvo = mantissa * (1n << BigInt(8 * (expoente - 3)));
  return Buffer.from(alvo.toString(16).padStart(64, '0').slice(-64), 'hex');
}

/** Remonta os 80 bytes do cabecalho e devolve o hash na ordem de exibicao. */
function hashDoCabecalho(job, extranonce1, extranonce2, ntime, nonceHex) {
  const coinbase = Buffer.from(job.coinb1 + extranonce1 + extranonce2 + job.coinb2, 'hex');
  let merkle = sha256d(coinbase);
  for (const ramo of job.branch) {
    merkle = sha256d(Buffer.concat([merkle, Buffer.from(ramo, 'hex')]));
  }
  // merkle root entra SEM swap - conferido contra o bloco genesis
  const hex = swap32(job.version) + swap32(job.prevhash) + merkle.toString('hex') +
              swap32(ntime) + swap32(job.nbits);
  const cab = Buffer.alloc(80);
  Buffer.from(hex, 'hex').copy(cab, 0);
  cab.writeUInt32LE(parseInt(nonceHex, 16) >>> 0, 76);
  return Buffer.from(sha256d(cab)).reverse();
}

/** Trava de seguranca: se a montagem estiver errada, o proxy nem sobe. */
function guardaGenesis() {
  const esperado = '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f';
  const merkle = Buffer.from('4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b', 'hex').reverse();
  const hex = swap32('00000001') + swap32('00'.repeat(32)) + merkle.toString('hex') +
              swap32('495fab29') + swap32('1d00ffff');
  const cab = Buffer.alloc(80);
  Buffer.from(hex, 'hex').copy(cab, 0);
  cab.writeUInt32LE(2083236893, 76);
  const obtido = Buffer.from(sha256d(cab)).reverse().toString('hex');
  if (obtido !== esperado) {
    console.error('FALHA: a montagem do cabecalho nao reproduz o bloco genesis. Abortando.');
    process.exit(1);
  }
  console.log('[proxy] guarda do bloco genesis: OK');
}

let taxaCelular = 0;        // ultima taxa informada pela pagina
let taxaCelularEm = 0;     // quando foi informada, para saber se envelheceu

const server = http.createServer((req, res) => {
  // Canal SEPARADO para a pagina informar a propria taxa.
  //
  // Por que nao pelo Stratum: aquela conexao e repassada byte a byte ao pool,
  // e mensagem estranha ali poderia derrubar a sessao ou ser tratada como
  // trafego malformado. Aqui e HTTP comum, do lado do servidor, e nao toca na
  // mineracao. Se a pagina for antiga e nunca chamar, tudo segue funcionando.
  if (req.method === 'POST' && req.url === '/taxa') {
    let corpo = '';
    req.on('data', (c) => {
      corpo += c;
      if (corpo.length > 2048) { req.destroy(); }   // limite de sanidade
    });
    req.on('end', () => {
      try {
        const o = JSON.parse(corpo);
        const n = Number(o.hashrate);
        if (isFinite(n) && n >= 0) {
          taxaCelular = n;
          taxaCelularEm = Date.now();
          log('taxa do celular: ' + Math.round(n) + ' H/s' +
              (o.motor ? ' (' + String(o.motor).slice(0, 20) + ')' : ''));
        }
      } catch (e) { /* corpo invalido: ignora, nao derruba nada */ }
      res.writeHead(204); res.end();
    });
    return;
  }

  if (req.url === '/' || req.url === '/index.html' || req.url === '/miner.html') {
    fs.readFile(MINER_HTML_PATH, (err, data) => {
      if (err) { res.writeHead(500); res.end('miner.html nao encontrado ao lado deste script.'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
    return;
  }
  res.writeHead(404); res.end('not found');
});

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  log('celular conectado via WebSocket');

  // Estado desta sessao, montado a partir do trafego observado
  let extranonce1 = null;
  let job = null;
  let dificuldadePool = null;
  let idSubscribe = null;
  const pendentes = new Map();   // id do submit -> {ehBloco, hash}
  let aceitos = 0, rejeitados = 0;

  const tcp = net.connect(POOL_PORT, POOL_HOST, () => {
    log(`conectado ao pool ${POOL_HOST}:${POOL_PORT}`);
  });

  // ---- pool -> celular ----
  tcp.setEncoding('utf8');
  let tcpBuffer = '';
  tcp.on('data', (chunk) => {
    tcpBuffer += chunk;
    let idx;
    while ((idx = tcpBuffer.indexOf('\n')) >= 0) {
      const line = tcpBuffer.slice(0, idx + 1);
      tcpBuffer = tcpBuffer.slice(idx + 1);
      if (ws.readyState === ws.OPEN) ws.send(line);   // repasse intacto, sempre primeiro

      try { observarDoPool(line); } catch (e) { /* observar nunca quebra a ponte */ }
    }
  });

  function observarDoPool(line) {
    const m = JSON.parse(line);

    if (m.id !== undefined && m.id !== null && m.id === idSubscribe && Array.isArray(m.result)) {
      extranonce1 = m.result[1];
      log(`inscrito no pool (extranonce1=${extranonce1})`);
      return;
    }

    if (m.method === 'mining.notify') {
      const p = m.params;
      job = { id: p[0], prevhash: p[1], coinb1: p[2], coinb2: p[3],
              branch: p[4], version: p[5], nbits: p[6], ntime: p[7] };
      log(`job novo do pool: ${job.id} (nbits=${job.nbits})`);
      return;
    }

    if (m.method === 'mining.set_difficulty') {
      dificuldadePool = m.params[0];
      log(`dificuldade do pool: ${dificuldadePool}`);
      return;
    }

    // resposta a um mining.submit que o celular mandou
    if (m.id !== undefined && pendentes.has(m.id)) {
      const info = pendentes.get(m.id);
      pendentes.delete(m.id);
      if (m.result === true) {
        aceitos++;
        if (info.ehBloco) {
          log('================================================');
          log('BLOCO ENCONTRADO - o pool ACEITOU a submissao');
          log(`hash: ${info.hash}`);
          log('================================================');
        } else {
          log(`share aceito (total ${aceitos}, rejeitados ${rejeitados})`);
        }
      } else {
        rejeitados++;
        log(`share REJEITADO: ${JSON.stringify(m.error)} (total rejeitados ${rejeitados})`);
      }
    }
  }

  // ---- celular -> pool ----
  ws.on('message', (data) => {
    const texto = data.toString();
    tcp.write(texto);                                  // repasse intacto, sempre primeiro

    try {
      for (const line of texto.split('\n')) {
        if (line.trim()) observarDoCelular(line);
      }
    } catch (e) { /* observar nunca quebra a ponte */ }
  });

  function observarDoCelular(line) {
    const m = JSON.parse(line);

    if (m.method === 'mining.subscribe') { idSubscribe = m.id; return; }

    if (m.method === 'mining.submit') {
      const [, jobId, extranonce2, ntime, nonceHex] = m.params;

      if (!job || !extranonce1 || jobId !== job.id) {
        log(`submissao enviada (job ${jobId}) - sem dados para conferir aqui`);
        pendentes.set(m.id, { ehBloco: false, hash: '(nao conferido)' });
        return;
      }

      const hash = hashDoCabecalho(job, extranonce1, extranonce2, ntime, nonceHex);
      const alvoRede = alvoDosBits(job.nbits);
      const ehBloco = hash.compare(alvoRede) < 0;

      pendentes.set(m.id, { ehBloco, hash: hash.toString('hex') });

      if (ehBloco) {
        log('================================================');
        log('BLOCO ENCONTRADO - hash abaixo do alvo REAL da rede');
        log(`hash: ${hash.toString('hex')}`);
        log('aguardando confirmacao do pool...');
        log('================================================');
      } else {
        log(`submissao enviada (nonce ${nonceHex})`);
      }
    }
  }

  tcp.on('error', (err) => {
    log(`erro TCP com o pool: ${err.message}`);
    if (ws.readyState === ws.OPEN) ws.close();
  });
  tcp.on('close', () => {
    log('conexao com o pool encerrada');
    if (ws.readyState === ws.OPEN) ws.close();
  });
  ws.on('close', () => {
    taxaCelular = 0; taxaCelularEm = 0;
    log(`celular desconectou (aceitos ${aceitos}, rejeitados ${rejeitados})`);
    tcp.destroy();
  });
  ws.on('error', () => tcp.destroy());
});

guardaGenesis();

server.listen(LISTEN_PORT, () => {
  log(`servindo miner.html e ponte Stratum em http://0.0.0.0:${LISTEN_PORT}/`);
  log(`pool alvo: ${POOL_HOST}:${POOL_PORT}`);
  log(`log sendo gravado em: ${LOG_PATH}`);
  console.log(`[proxy] no celular, use como "endereco do proxy": ws://<ip-deste-servidor>:${LISTEN_PORT}/ws`);
});
