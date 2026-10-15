#!/usr/bin/env python3
"""
Minerador solo de Bitcoin em Python puro - versao didatica.

Feito para SER LIDO: cada etapa do protocolo aparece explicita, sem otimizacao
que atrapalhe o entendimento. E lento de proposito (usa hashlib direto, sem
midstate nem SIMD) - serve para ver o algoritmo acontecendo, nao para competir.

Roda num terminal normal. NAO tem nada a ver com carteira: usa apenas o
endereco publico, que so serve para receber.

Uso (PowerShell):
    cd C:\\solo-miner
    $env:BTC_USER="bc1qseuendereco.python"
    python miner-python.py

Variaveis: POOL_HOST (solo.ckpool.org)  POOL_PORT (3333)
           BTC_USER  (obrigatorio)      PROCESSOS (padrao: nucleos)
           SUG_DIFF  (dificuldade sugerida ao pool, 0 = deixa o pool decidir)
"""

import hashlib
import json
import os
import socket
import struct
import sys
import time
import multiprocessing as mp

POOL_HOST = os.environ.get('POOL_HOST', 'solo.ckpool.org')
POOL_PORT = int(os.environ.get('POOL_PORT', '3333'))
BTC_USER  = os.environ.get('BTC_USER', '')
PROCESSOS = int(os.environ.get('PROCESSOS', str(mp.cpu_count())))
SUG_DIFF  = float(os.environ.get('SUG_DIFF', '0.05'))

LOTE = 50000          # nonces por rodada antes de checar se chegou job novo


# ----------------------------------------------------------------------------
# Blocos basicos
# ----------------------------------------------------------------------------
def sha256d(b):
    """Hash duplo: a operacao que define a mineracao de Bitcoin."""
    return hashlib.sha256(hashlib.sha256(b).digest()).digest()


def swap32(hex_str):
    """Inverte os bytes dentro de cada palavra de 4 bytes.

    O pool manda version, prevhash, ntime e nbits nesse formato trocado.
    A merkle root NAO passa por aqui: ela sai do sha256d ja na ordem certa.
    """
    b = bytearray(bytes.fromhex(hex_str))
    for i in range(0, len(b), 4):
        b[i:i+4] = b[i:i+4][::-1]
    return bytes(b).hex()


def alvo_da_dificuldade(diff):
    """Dificuldade -> alvo de 32 bytes. Quanto menor o alvo, mais dificil."""
    alvo1 = 0xFFFF << 208                      # alvo da dificuldade 1
    valor = (alvo1 * 1000000) // max(1, round(diff * 1e6))
    return min(valor, (1 << 256) - 1).to_bytes(32, 'big')


def alvo_dos_bits(bits_hex):
    """Campo 'bits' compacto do cabecalho -> alvo real da rede."""
    b = bytes.fromhex(bits_hex)
    expoente, mantissa = b[0], int.from_bytes(b[1:4], 'big')
    return (mantissa * (1 << (8 * (expoente - 3)))).to_bytes(32, 'big')


def montar_prefixo(job, extranonce1, extranonce2):
    """Monta os 76 bytes do cabecalho (tudo menos o nonce)."""
    coinbase = bytes.fromhex(job['coinb1'] + extranonce1 + extranonce2 + job['coinb2'])
    merkle = sha256d(coinbase)
    for ramo in job['branch']:
        merkle = sha256d(merkle + bytes.fromhex(ramo))

    return bytes.fromhex(
        swap32(job['version'])
        + swap32(job['prevhash'])
        + merkle.hex()              # sem swap - conferido contra o bloco genesis
        + swap32(job['ntime'])
        + swap32(job['nbits'])
    )


def guarda_genesis():
    """Trava de seguranca: se a montagem estiver errada, nem comeca.

    Reproduz o bloco genesis do Bitcoin, cujo hash e publico e imutavel.
    """
    esperado = '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f'
    merkle = bytes.fromhex('4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b')[::-1]
    prefixo = bytes.fromhex(
        swap32('00000001') + swap32('00' * 32) + merkle.hex()
        + swap32('495fab29') + swap32('1d00ffff')
    )
    cabecalho = prefixo + struct.pack('<I', 2083236893)
    obtido = sha256d(cabecalho)[::-1].hex()
    if obtido != esperado:
        print('FALHA: a montagem do cabecalho nao reproduz o bloco genesis.')
        sys.exit(1)
    print('guarda do bloco genesis: OK')


# ----------------------------------------------------------------------------
# Processo trabalhador: varre nonces
# ----------------------------------------------------------------------------
def trabalhador(idx, fila_jobs, fila_saida):
    prefixo = None
    alvo_share = alvo_rede = None
    nonce = 0

    while True:
        # pega job novo, se houver
        novo = None
        while not fila_jobs.empty():
            try:
                novo = fila_jobs.get_nowait()
            except Exception:
                break
        if novo is not None:
            if novo == 'PARE':
                return
            prefixo, alvo_share, alvo_rede, nonce = novo

        if prefixo is None:
            time.sleep(0.05)
            continue

        # ---- o laco de mineracao propriamente dito ----
        feitos = 0
        for _ in range(LOTE):
            cabecalho = prefixo + struct.pack('<I', nonce & 0xFFFFFFFF)
            h = sha256d(cabecalho)[::-1]        # convencao Bitcoin: bytes invertidos
            feitos += 1
            if h < alvo_share:                   # bateu o alvo do pool?
                e_bloco = h < alvo_rede          # bateu tambem o alvo REAL da rede?
                fila_saida.put(('achou', idx, nonce & 0xFFFFFFFF, e_bloco))
            nonce += 1

        fila_saida.put(('progresso', idx, feitos, False))


# ----------------------------------------------------------------------------
# Processo principal: fala Stratum com o pool
# ----------------------------------------------------------------------------
def principal():
    if not BTC_USER:
        print('Defina BTC_USER com seu endereco Bitcoin. Exemplo:')
        print('  $env:BTC_USER="bc1qseuendereco.python"')
        sys.exit(1)

    guarda_genesis()
    print(f'Conectando em {POOL_HOST}:{POOL_PORT} com {PROCESSOS} processos...')

    sock = socket.create_connection((POOL_HOST, POOL_PORT), timeout=30)
    sock.settimeout(0.2)
    arquivo = sock.makefile('rw', encoding='utf-8', newline='\n')

    msg_id = [1]
    def enviar(metodo, params):
        ident = msg_id[0]; msg_id[0] += 1
        arquivo.write(json.dumps({'id': ident, 'method': metodo, 'params': params}) + '\n')
        arquivo.flush()
        return ident

    id_subscribe = enviar('mining.subscribe', ['miner-python/1.0'])
    id_authorize = id_suggest = -1

    extranonce1, extranonce2_size = None, 4
    job = None
    dif_pool = 1.0
    aceitos = rejeitados = 0
    pendentes = {}

    fila_jobs = [mp.Queue() for _ in range(PROCESSOS)]
    fila_saida = mp.Queue()
    processos = [mp.Process(target=trabalhador, args=(i, fila_jobs[i], fila_saida), daemon=True)
                 for i in range(PROCESSOS)]
    for p in processos:
        p.start()

    extranonce2_por_processo = {}

    def distribuir():
        if job is None or extranonce1 is None:
            return
        a_share = alvo_da_dificuldade(dif_pool)
        a_rede = alvo_dos_bits(job['nbits'])
        for i in range(PROCESSOS):
            en2 = format(i, 'x').zfill(extranonce2_size * 2)
            extranonce2_por_processo[i] = en2
            prefixo = montar_prefixo(job, extranonce1, en2)
            fila_jobs[i].put((prefixo, a_share, a_rede, (0xFFFFFFFF // PROCESSOS) * i))

    hashes = 0
    ultimo_print = time.time()
    buffer = ''

    while True:
        # ---------- rede ----------
        try:
            dados = sock.recv(65536).decode('utf-8')
            if dados:
                buffer += dados
        except socket.timeout:
            pass
        except OSError:
            print('\nConexao perdida.')
            break

        while '\n' in buffer:
            linha, buffer = buffer.split('\n', 1)
            if not linha.strip():
                continue
            m = json.loads(linha)

            if m.get('id') == id_subscribe and m.get('result'):
                extranonce1 = m['result'][1]
                extranonce2_size = m['result'][2]
                print(f'Inscrito. extranonce1={extranonce1} size={extranonce2_size}')
                id_authorize = enviar('mining.authorize', [BTC_USER, 'x'])

            elif m.get('id') == id_authorize:
                print('Autorizado pelo pool.' if m.get('result') is True
                      else f'Pool NAO autorizou: {m.get("error")}')
                if SUG_DIFF > 0:
                    id_suggest = enviar('mining.suggest_difficulty', [SUG_DIFF])
                    print(f'Sugerindo dificuldade {SUG_DIFF}')

            elif m.get('id') == id_suggest:
                if m.get('error'):
                    print('Pool recusou a sugestao de dificuldade.')

            elif m.get('method') == 'mining.notify':
                p = m['params']
                job = {'id': p[0], 'prevhash': p[1], 'coinb1': p[2], 'coinb2': p[3],
                       'branch': p[4], 'version': p[5], 'nbits': p[6], 'ntime': p[7]}
                distribuir()

            elif m.get('method') == 'mining.set_difficulty':
                dif_pool = m['params'][0]
                print(f'Dificuldade do pool: {dif_pool}')
                distribuir()

            elif m.get('id') in pendentes:
                e_bloco = pendentes.pop(m['id'])
                if m.get('result') is True:
                    aceitos += 1
                    if e_bloco:
                        print('\n*** BLOCO ENCONTRADO! Hash abaixo do alvo REAL da rede. ***')
                    else:
                        print(f'\nShare aceito ({aceitos})')
                else:
                    rejeitados += 1
                    print(f'\nShare REJEITADO: {m.get("error")}')

        # ---------- resultados dos trabalhadores ----------
        while not fila_saida.empty():
            try:
                tipo, idx, valor, e_bloco = fila_saida.get_nowait()
            except Exception:
                break
            if tipo == 'progresso':
                hashes += valor
            elif tipo == 'achou' and job is not None:
                ident = enviar('mining.submit',
                               [BTC_USER, job['id'], extranonce2_por_processo[idx],
                                job['ntime'], format(valor, '08x')])
                pendentes[ident] = e_bloco

        # ---------- taxa ----------
        agora = time.time()
        if agora - ultimo_print >= 2:
            taxa = hashes / (agora - ultimo_print)
            unidade = f'{taxa/1e6:.2f} MH/s' if taxa >= 1e6 else f'{taxa/1e3:.1f} kH/s'
            print(f'\r  {unidade}  |  aceitos: {aceitos}  rejeitados: {rejeitados}'
                  f'  |  dif. pool: {dif_pool}     ', end='', flush=True)
            hashes = 0
            ultimo_print = agora


if __name__ == '__main__':
    try:
        principal()
    except KeyboardInterrupt:
        print('\nEncerrado.')
