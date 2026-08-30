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

### Google Agenda — sincronização de audiências/compromissos

Ao marcar uma tarefa como "audiência ou compromisso com hora marcada" na aba
Gestão, o sistema cria automaticamente um evento na sua Google Agenda (e
atualiza/remove se a tarefa for editada/excluída). Isso exige uma conexão
OAuth autorizada por você — não existe uma "chave simples" que crie eventos
numa agenda pessoal sem essa autorização explícita do dono da conta.

**Passo a passo para configurar (uma vez só), no [Google Cloud Console](https://console.cloud.google.com/):**

1. Crie um projeto novo (ou use um existente).
2. Vá em **"APIs e serviços" → "Biblioteca"**, procure por **"Google Calendar API"** e clique em **Ativar**.
3. Vá em **"APIs e serviços" → "Tela de consentimento OAuth"**:
   - Tipo de usuário: **Externo**.
   - Preencha nome do app (ex: "Sistema Filipe Ferreira Advogados") e seu e-mail.
   - Em "Escopos", não precisa adicionar nada manualmente.
   - Em "Usuários de teste", adicione o seu próprio e-mail do Google (enquanto o app estiver em modo de teste, só e-mails cadastrados aqui conseguem autorizar).
4. Vá em **"APIs e serviços" → "Credenciais" → "Criar credenciais" → "ID do cliente OAuth"**:
   - Tipo de aplicativo: **Aplicativo da Web**.
   - Em "URIs de redirecionamento autorizados", adicione:
     `https://<seu-app>.onrender.com/api/integrations/google/callback`
     (troque pela URL real do seu serviço no Render).
5. O Google mostra um **Client ID** e um **Client Secret** — copie os dois.
6. No Render, vá em **Environment** do seu serviço e adicione:
   ```
   GOOGLE_CLIENT_ID=<o Client ID copiado>
   GOOGLE_CLIENT_SECRET=<o Client Secret copiado>
   GOOGLE_REDIRECT_URI=https://<seu-app>.onrender.com/api/integrations/google/callback
   ```
7. Salve (o Render reinicia o serviço sozinho).
8. No sistema, vá na aba **Gestão** e clique em **"Conectar Google Agenda"** — você será levado à tela de permissão do Google; autorize com a mesma conta cadastrada como usuário de teste no passo 3.

Depois disso, toda audiência marcada como tal (com data e horário) cria um
evento na sua agenda automaticamente, com um link para você conferir e,
opcionalmente, avisar o cliente pelo WhatsApp com esse mesmo link.

**Limite do modo de teste**: enquanto a tela de consentimento OAuth do Google
estiver em modo "Teste" (o padrão, sem submeter para verificação do Google),
o token de acesso deste tipo de app pode expirar a cada ~7 dias, exigindo
reconectar. Para uso contínuo sem essa limitação, é possível publicar o app
(Google pode pedir uma verificação, dependendo do escopo usado).

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
