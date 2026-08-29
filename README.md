# Sistema Filipe Ferreira Advogados

Sistema de gestão para o escritório: clientes, processos com acompanhamento
de andamentos, financeiro e gestão de tarefas — com integração automática de
notificações judiciais via **DJEN** (Diário de Justiça Eletrônico Nacional).

## Estrutura

```
server/   -> backend (Node.js + Express + SQLite)
public/   -> frontend (SPA em HTML/CSS/JS puro) + ficha de pré-consulta pública
index.html -> ficha de pré-consulta original (mantida como estava)
```

## Como rodar localmente

```bash
cd server
cp .env.example .env      # edite os valores, principalmente ADMIN_PASSWORD e JWT_SECRET
npm install
npm start
```

Acesse `http://localhost:3000`. No primeiro start, um usuário administrador é
criado automaticamente com o e-mail/senha definidos em `ADMIN_EMAIL` /
`ADMIN_PASSWORD` no `.env` — **troque a senha padrão assim que possível**
(crie um novo usuário admin com senha forte e depois desative/edite o padrão).

A ficha de pré-consulta pública fica em `/ficha-preconsulta.html` — cada envio
continua abrindo o WhatsApp normalmente e, além disso, cria automaticamente um
cliente com status "lead" dentro do sistema.

## Módulos

- **Clientes**: cadastro completo, busca, status (lead / ativo / inativo / ex-cliente).
- **Processos**: número CNJ, tribunal, fase, próximo prazo, histórico de andamentos.
- **Financeiro**: contas a receber/pagar vinculadas a cliente e processo, com
  indicadores de inadimplência e recebimentos do mês.
- **Gestão do escritório**: tarefas com prazo, prioridade e responsável.
- **Notificações**: central de avisos do sistema + integração com tribunais (ver abaixo).

## Integração com tribunais (PJe, PUMA, TRF etc.)

Isso é o ponto mais delicado tecnicamente, então vale entender exatamente o
que está pronto e o que falta:

### DJEN — já implementado e funcional (recomendado)

O CNJ mantém uma **API pública** do Diário de Justiça Eletrônico Nacional
(`https://comunicaapi.pje.jus.br`, Resolução CNJ 455/2022). A consulta de
comunicações (intimações/publicações) **não exige certificado digital** — só
os endpoints de escrita, de uso exclusivo dos tribunais, são autenticados.

Isso cobre praticamente todos os tribunais do país (TJES, TRF2, TRF1, TJs
diversos) que publicam pelo PJe/DJEN, buscando pelo número da OAB do
advogado.

Para ativar, defina no `.env` do servidor:

```
ADVOGADO_OAB_NUMERO=37159
ADVOGADO_OAB_UF=ES
DJEN_SYNC_INTERVAL_HOURS=6
```

Com isso o servidor busca automaticamente novas comunicações a cada 6h (ou no
intervalo definido), tenta vincular ao processo cadastrado pelo número CNJ, e
gera uma notificação — vinculada ao processo quando reconhece o número, ou
avulsa quando o processo ainda não está cadastrado no sistema. Também é
possível disparar manualmente pela tela de Notificações ("Buscar novas
intimações agora").

**Atenção**: os nomes exatos dos campos retornados pela API
(`server/src/integrations/djen.js`) foram implementados a partir da
documentação pública conhecida da Comunica API, mas não puderam ser
confirmados por uma chamada real a partir deste ambiente de desenvolvimento
(bloqueio de rede do sandbox). Na primeira sincronização real, se algum campo
vier com nome diferente do esperado, o JSON bruto de cada item é sempre salvo
em `djen_communications.raw_json` — então nada se perde, e o ajuste fica
restrito a esse arquivo.

### PJe via webservice MNI — estrutura pronta, requer certificado A1

Para puxar detalhes adicionais diretamente de um processo específico no PJe
(além do que o DJEN já entrega), existe o módulo
`server/src/integrations/pje.js`, hoje apenas com a estrutura pronta. Ele
exige um certificado digital **A1** (arquivo `.pfx`) configurado nas
variáveis `PJE_CERT_PFX_PATH` / `PJE_CERT_PASSWORD`.

**Certificado A3 (token/cartão físico) não funciona aqui** — não há leitora
de hardware conectada a um servidor em nuvem. Duas saídas, caso essa
integração adicional seja necessária no futuro:

1. Migrar para certificado A1 (arquivo), ou
2. Rodar um "agente-ponte" local (com o token plugado) que consulta o
   tribunal e envia os dados para `POST /api/processes/:id/updates` deste
   sistema.

Para o caso de uso principal — saber quando sai uma intimação nova — o DJEN
já resolve sem certificado nenhum.

### PUMA / e-Jud (TJES) e outros sistemas próprios de tribunal

Sistemas proprietários de tribunais estaduais (como o PUMA do TJES) não têm
API pública documentada como o DJEN. Onde o próprio tribunal publica pelo
PJe/DJEN nacional, a integração acima já cobre. Um sistema realmente
proprietário exigiria engenharia adicional caso a caso (login, extração de
tela) — não incluído nesta primeira entrega.

## Próximos passos sugeridos

- Confirmar o schema real da Comunica API do DJEN em produção e ajustar
  `djen.js` se necessário.
- Adicionar upload de documentos por cliente/processo.
- Relatórios financeiros (DRE simplificado, fluxo de caixa projetado).
- Permissões mais granulares por papel de usuário (hoje: admin cria usuários; demais só usam o sistema).
