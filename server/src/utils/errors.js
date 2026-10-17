/**
 * Tratamento de erros do servidor.
 *
 * 1) O Express 4 nao captura erros de rotas "async": uma consulta ao banco
 *    que falhasse virava uma promise rejeitada sem dono, e o Node encerrava
 *    o servidor inteiro (o site "caia" para todos). installAsyncErrorHandling
 *    faz toda rota async repassar o erro ao tratador central, como as rotas
 *    comuns ja fazem.
 * 2) friendlyError traduz erros do banco em mensagens que o usuario entende
 *    ("O campo X ficou longo demais") em vez de textos tecnicos em ingles.
 */

const Layer = require('express/lib/router/layer');

function installAsyncErrorHandling() {
  if (Layer.prototype.__asyncPatched) return;
  const original = Layer.prototype.handle_request;
  Layer.prototype.handle_request = function handleRequest(req, res, next) {
    const fn = this.handle;
    if (fn.length > 3) return original.call(this, req, res, next); // tratador de erro
    try {
      const result = fn(req, res, next);
      if (result && typeof result.catch === 'function') result.catch(next);
    } catch (err) {
      next(err);
    }
  };
  Layer.prototype.__asyncPatched = true;
}

const FIELD_LABELS = {
  name: 'Nome', document: 'CPF/CNPJ', phone: 'WhatsApp/telefone', email: 'E-mail',
  city: 'Cidade/endereço', case_type: 'Tipo de caso', notes: 'Observações',
  number: 'Número do processo', court: 'Tribunal / Vara', subject: 'Assunto',
  phase: 'Fase atual', responsible: 'Responsável', next_deadline_desc: 'Descrição do prazo',
  category: 'Categoria', description: 'Descrição', title: 'Título'
};

function friendlyError(err) {
  const msg = String((err && err.message) || '');
  if (err && err.code === 'ER_DATA_TOO_LONG') {
    const col = (msg.match(/column '([^']+)'/) || [])[1];
    const label = FIELD_LABELS[col] || col || 'informado';
    return { status: 400, message: `O campo "${label}" ficou longo demais. Abrevie o texto e salve de novo.` };
  }
  if (err && err.code === 'ER_DUP_ENTRY') {
    return { status: 400, message: 'Já existe um cadastro com esses dados (ex: e-mail repetido).' };
  }
  if (err && (err.code === 'ER_TRUNCATED_WRONG_VALUE' || err.code === 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD' || err.code === 'WARN_DATA_TRUNCATED')) {
    return { status: 400, message: 'Algum campo tem um valor em formato inválido (ex: data ou número). Confira e salve de novo.' };
  }
  if (err && err.code === 'ER_NO_REFERENCED_ROW_2') {
    return { status: 400, message: 'O cliente, processo ou usuário escolhido não existe mais. Atualize a página e escolha de novo.' };
  }
  if (err && (err.code === 'PROTOCOL_SEQUENCE_TIMEOUT' || err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED' || err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET')) {
    return { status: 503, message: 'O banco de dados demorou para responder. Tente salvar de novo em alguns segundos.' };
  }
  if (err && err.type === 'entity.too.large') {
    return { status: 413, message: 'O conteúdo enviado é grande demais.' };
  }
  return { status: 500, message: 'Erro interno do servidor. Tente de novo; se continuar, avise o suporte.' };
}

module.exports = { installAsyncErrorHandling, friendlyError };
