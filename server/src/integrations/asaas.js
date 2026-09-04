/**
 * Integracao com o Asaas (gateway de pagamento brasileiro) para emissao de
 * boletos vinculados a lancamentos do Financeiro.
 *
 * Por que Asaas: tem plano gratuito de conta (cobra só por transação/boleto
 * emitido), API bem documentada, e sandbox para testar sem custo. Não é a
 * única opção (Iugu, PagSeguro também funcionam), mas é a mais comum para
 * escritórios pequenos no Brasil.
 *
 * STATUS: não configurado por padrão - não foi possível testar contra a API
 * real neste ambiente (sem credenciais, rede restrita). A estrutura abaixo
 * segue a documentação pública da Asaas (v3), mas deve ser validada na
 * primeira emissão real.
 *
 * Pre-requisito (feito por voce, uma vez):
 *   1. Criar conta em https://www.asaas.com (tem ambiente sandbox em
 *      https://sandbox.asaas.com para testar sem gerar boleto real).
 *   2. Gerar uma API Key em Configurações > Integrações > API.
 *   3. Definir no .env: ASAAS_API_KEY e ASAAS_ENV=sandbox (ou "production").
 */

const db = require('../db');

const API_KEY = process.env.ASAAS_API_KEY || '';
const ENV = process.env.ASAAS_ENV || 'sandbox';
const BASE_URL = ENV === 'production' ? 'https://api.asaas.com/v3' : 'https://sandbox.asaas.com/api/v3';

function isConfigured() {
  return Boolean(API_KEY);
}

async function apiRequest(method, path, body) {
  const resp = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      access_token: API_KEY
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = data.errors ? data.errors.map((e) => e.description).join('; ') : `HTTP ${resp.status}`;
    throw new Error(`Erro na API do Asaas: ${msg}`);
  }
  return data;
}

async function ensureCustomer(client) {
  if (client.asaas_customer_id) return client.asaas_customer_id;
  const customer = await apiRequest('POST', '/customers', {
    name: client.name,
    cpfCnpj: (client.document || '').replace(/\D/g, '') || undefined,
    email: client.email || undefined,
    phone: (client.phone || '').replace(/\D/g, '') || undefined
  });
  db.prepare('UPDATE clients SET asaas_customer_id = ? WHERE id = ?').run(customer.id, client.id);
  return customer.id;
}

/** Cria uma cobranca (boleto) para um lancamento do Financeiro. */
async function createBoleto(financeEntry, client) {
  if (!isConfigured()) {
    const err = new Error('Integração com o Asaas não configurada (defina ASAAS_API_KEY no servidor).');
    err.code = 'ASAAS_NOT_CONFIGURED';
    throw err;
  }
  const customerId = await ensureCustomer(client);
  const charge = await apiRequest('POST', '/payments', {
    customer: customerId,
    billingType: 'BOLETO',
    value: financeEntry.amount,
    dueDate: financeEntry.due_date || new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    description: financeEntry.description
  });
  db.prepare('UPDATE finance_entries SET asaas_charge_id = ?, boleto_url = ? WHERE id = ?')
    .run(charge.id, charge.bankSlipUrl || charge.invoiceUrl, financeEntry.id);
  return { chargeId: charge.id, boletoUrl: charge.bankSlipUrl || charge.invoiceUrl };
}

module.exports = { isConfigured, createBoleto };
