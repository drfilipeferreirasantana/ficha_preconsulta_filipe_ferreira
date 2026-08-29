/**
 * Integracao com o PJe (Processo Judicial Eletronico) via webservice MNI
 * (Modelo Nacional de Interoperabilidade - Comunicacao de Dados Processuais).
 *
 * NOTA: para o caso de uso principal do sistema (saber quando sai uma
 * intimacao/publicacao nova), prefira a integracao com o DJEN
 * (integrations/djen.js) - ela e publica, nao exige certificado digital e ja
 * cobre todos os tribunais do pais. Este modulo (MNI) so e necessario se, alem
 * disso, voce quiser puxar dados adicionais direto de um processo especifico
 * no PJe de um tribunal (ex: detalhes de autos, partes, documentos).
 *
 * STATUS ATUAL: nao configurada. Este modulo e o ponto unico de entrada para
 * consultar dados processuais adicionais diretamente no PJe. Ele fica pronto para ligar,
 * mas requer autenticacao com certificado digital que este servidor nao possui.
 *
 * Por que nao funciona "out of the box":
 *  - O MNI exige autenticacao mutual TLS com certificado digital ICP-Brasil do
 *    advogado (ou do escritorio) cadastrado no tribunal.
 *  - Certificado A3 (token USB / cartao) so pode ser usado em uma maquina com o
 *    dispositivo fisico conectado - nao funciona em automacao de servidor/nuvem.
 *  - Certificado A1 (arquivo .pfx) PODE ser usado aqui: basta configurar
 *    PJE_CERT_PFX_PATH e PJE_CERT_PASSWORD no .env e implementar a chamada SOAP
 *    abaixo (endpoint MNI varia por tribunal, ex: TJES, TRF2).
 *
 * Duas formas de ativar isso de verdade:
 *  1) Migrar para certificado A1 e preencher as variaveis de ambiente do PJe;
 *     implementar aqui a chamada SOAP `consultarProcesso` do MNI usando o pfx.
 *  2) Rodar um "agente-ponte": um pequeno programa na maquina local (com o
 *     token A3 conectado) que consulta o PJe periodicamente e envia os
 *     andamentos novos para POST /api/processes/:id/updates deste sistema,
 *     usando um token de API dedicado. Nesse caso este arquivo nao precisa
 *     mudar - a sincronizacao chega "de fora" como se fosse manual.
 *
 * Enquanto nenhuma das duas opcoes estiver configurada, syncProcess() retorna
 * um erro amigavel e a tela de Processos permanece 100% funcional no modo manual.
 */

const configured = Boolean(process.env.PJE_CERT_PFX_PATH && process.env.PJE_CERT_PASSWORD);

async function syncProcess(process_) {
  if (!configured) {
    const err = new Error(
      'Integracao com o PJe ainda nao configurada. Configure um certificado A1 (.pfx) ' +
      'nas variaveis PJE_CERT_PFX_PATH/PJE_CERT_PASSWORD, ou use o agente-ponte local ' +
      'para enviar andamentos automaticamente. Ate la, cadastre os andamentos manualmente.'
    );
    err.code = 'PJE_NOT_CONFIGURED';
    throw err;
  }

  // TODO: implementar chamada SOAP ao MNI do tribunal correspondente
  // (process_.court_system: 'pje', endpoint definido por process_.court).
  // Ex: usar um cliente SOAP (ex: 'soap' ou 'strong-soap') com httpsAgent
  // carregando o pfx via `tls.createSecureContext({ pfx, passphrase })`.
  throw new Error('Chamada ao MNI ainda nao implementada para este tribunal.');
}

module.exports = { syncProcess, configured };
