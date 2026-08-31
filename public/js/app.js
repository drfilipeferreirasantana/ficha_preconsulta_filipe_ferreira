/* Sistema Filipe Ferreira Advogados - frontend SPA (vanilla JS) */
(function () {
  const API = '/api';
  let TOKEN = localStorage.getItem('ffa_token') || null;
  let ME = null;
  let CLIENTS_CACHE = [];

  // ---------- helpers ----------
  async function api(path, opts = {}) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    if (TOKEN) headers.Authorization = 'Bearer ' + TOKEN;
    const resp = await fetch(API + path, Object.assign({}, opts, { headers }));
    if (resp.status === 401) { logout(); throw new Error('Sessao expirada.'); }
    if (resp.status === 204) return null;
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || 'Erro na requisicao.');
    return data;
  }

  function money(v) {
    return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  function dateBR(d) {
    if (!d) return '—';
    const s = String(d).slice(0, 10);
    const [y, m, day] = s.split('-');
    return y && m && day ? `${day}/${m}/${y}` : s;
  }
  function badge(text, cls) {
    return `<span class="badge badge-${cls}">${text}</span>`;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------- máscara de moeda (R$ 1.234,56) para inputs de valor ----------
  // O input fica type="text": digita-se só números e o valor é formatado da
  // direita para a esquerda (como em caixas eletrônicos/apps bancários).
  function attachMoneyMask(el) {
    el.addEventListener('input', () => {
      const digits = el.value.replace(/\D/g, '');
      if (!digits) { el.value = ''; return; }
      el.value = (parseInt(digits, 10) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    });
  }
  function getMoneyValue(el) {
    if (!el || !el.value) return null;
    const digits = el.value.replace(/\D/g, '');
    return digits ? parseInt(digits, 10) / 100 : null;
  }
  function setMoneyValue(el, num) {
    el.value = (num === null || num === undefined || num === '') ? '' : Number(num).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // ---------- auth ----------
  function logout() {
    TOKEN = null; ME = null;
    localStorage.removeItem('ffa_token');
    document.getElementById('app').classList.remove('active');
    document.getElementById('login-screen').style.display = 'flex';
  }

  async function tryAutoLogin() {
    if (!TOKEN) return;
    try {
      const r = await api('/auth/me');
      ME = r.user;
      enterApp();
    } catch (e) {
      logout();
    }
  }

  function enterApp() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').classList.add('active');
    document.getElementById('who-am-i').textContent = `${ME.name} · ${ME.role}`;
    loadPage('dashboard');
  }

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const errBox = document.getElementById('login-error');
    errBox.style.display = 'none';
    try {
      const r = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      TOKEN = r.token; ME = r.user;
      localStorage.setItem('ffa_token', TOKEN);
      enterApp();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.style.display = 'block';
    }
  });

  document.getElementById('logout-btn').addEventListener('click', logout);

  // ---------- navigation ----------
  document.querySelectorAll('.nav-item').forEach((el) => {
    el.addEventListener('click', () => loadPage(el.dataset.page));
  });

  function loadPage(page) {
    document.querySelectorAll('.nav-item').forEach((el) => el.classList.toggle('active', el.dataset.page === page));
    document.querySelectorAll('.page').forEach((el) => el.classList.remove('active'));
    document.getElementById('page-' + page).classList.add('active');
    const loaders = {
      dashboard: loadDashboard,
      clients: loadClients,
      processes: loadProcesses,
      finance: loadFinance,
      tasks: loadTasks,
      notifications: loadNotifications,
      backup: loadBackup
    };
    loaders[page] && loaders[page]();
  }

  // ---------- modal ----------
  const overlay = document.getElementById('modal-overlay');
  const modalContent = document.getElementById('modal-content');
  function openModal(html) {
    modalContent.innerHTML = html;
    overlay.classList.add('active');
  }
  function closeModal() { overlay.classList.remove('active'); modalContent.innerHTML = ''; }
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

  async function clientOptions(selectedId) {
    if (!CLIENTS_CACHE.length) CLIENTS_CACHE = await api('/clients');
    return CLIENTS_CACHE.map((c) => `<option value="${c.id}" ${String(c.id) === String(selectedId) ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  }

  // ---------- DASHBOARD ----------
  async function loadDashboard() {
    const [clients, processesUpcoming, financeSummary] = await Promise.all([
      api('/clients'),
      api('/processes?upcoming=7'),
      api('/finance/summary')
    ]);
    const ativos = clients.filter((c) => c.status === 'ativo').length;
    const leads = clients.filter((c) => c.status === 'lead').length;

    document.getElementById('kpi-grid').innerHTML = `
      <div class="kpi"><div class="lbl">Clientes ativos</div><div class="val">${ativos}</div></div>
      <div class="kpi"><div class="lbl">Leads em aberto</div><div class="val">${leads}</div></div>
      <div class="kpi danger"><div class="lbl">A receber (pendente)</div><div class="val">${money(financeSummary.receivable)}</div></div>
      <div class="kpi danger"><div class="lbl">Em atraso</div><div class="val">${money(financeSummary.overdue)}</div></div>
      <div class="kpi success"><div class="lbl">Recebido no mês</div><div class="val">${money(financeSummary.receivedThisMonth)}</div></div>
    `;

    const tbody = document.querySelector('#tbl-deadlines tbody');
    tbody.innerHTML = processesUpcoming.length ? processesUpcoming.map((p) => `
      <tr>
        <td>${esc(p.client_name)}</td>
        <td>${esc(p.number || '—')} <span class="muted">${esc(p.court || '')}</span></td>
        <td>${dateBR(p.next_deadline)}</td>
        <td>${esc(p.next_deadline_desc || '—')}</td>
      </tr>`).join('') : '<tr class="empty-row"><td colspan="4">Nenhum prazo nos próximos 7 dias.</td></tr>';
  }

  // ---------- CLIENTES ----------
  async function loadClients() {
    const q = document.getElementById('client-search').value.trim();
    const clients = await api('/clients' + (q ? `?q=${encodeURIComponent(q)}` : ''));
    CLIENTS_CACHE = clients;
    const tbody = document.querySelector('#tbl-clients tbody');
    tbody.innerHTML = clients.length ? clients.map((c) => `
      <tr>
        <td><strong>${esc(c.name)}</strong>${c.city ? `<div class="muted">${esc(c.city)}</div>` : ''}</td>
        <td>${esc(c.phone || '—')}${c.email ? `<div class="muted">${esc(c.email)}</div>` : ''}</td>
        <td>${esc(c.case_type || '—')}</td>
        <td>${badge(c.status, c.status)}</td>
        <td class="muted">${esc(c.origin)}</td>
        <td class="row-actions">
          <span class="link-btn" data-edit-client="${c.id}">editar</span>
          <span class="link-btn" data-del-client="${c.id}" style="color:var(--danger)">excluir</span>
        </td>
      </tr>`).join('') : '<tr class="empty-row"><td colspan="6">Nenhum cliente encontrado.</td></tr>';

    tbody.querySelectorAll('[data-edit-client]').forEach((el) => el.addEventListener('click', () => openClientModal(el.dataset.editClient)));
    tbody.querySelectorAll('[data-del-client]').forEach((el) => el.addEventListener('click', async () => {
      if (confirm('Excluir este cliente? Os processos e lançamentos vinculados também serão removidos.')) {
        await api('/clients/' + el.dataset.delClient, { method: 'DELETE' });
        loadClients();
      }
    }));
  }

  let searchTimer;
  document.getElementById('client-search').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadClients, 300);
  });

  document.getElementById('btn-new-client').addEventListener('click', () => openClientModal());

  let processSearchTimer;
  document.getElementById('process-search').addEventListener('input', () => {
    clearTimeout(processSearchTimer);
    processSearchTimer = setTimeout(loadProcesses, 300);
  });

  async function openClientModal(id) {
    const c = id ? await api('/clients/' + id) : {};
    openModal(`
      <h3>${id ? 'Editar cliente' : 'Novo cliente'}</h3>
      <form id="client-form">
        <div class="field"><label>Nome completo</label><input required id="f-name" value="${esc(c.name || '')}"></div>
        <div class="g2">
          <div class="field"><label>CPF/CNPJ</label><input id="f-document" value="${esc(c.document || '')}"></div>
          <div class="field"><label>WhatsApp</label><input id="f-phone" value="${esc(c.phone || '')}"></div>
        </div>
        <div class="g2">
          <div class="field"><label>E-mail</label><input type="email" id="f-email" value="${esc(c.email || '')}"></div>
          <div class="field"><label>Cidade</label><input id="f-city" value="${esc(c.city || '')}"></div>
        </div>
        <div class="g2">
          <div class="field"><label>Tipo de caso</label><input id="f-case_type" value="${esc(c.case_type || '')}"></div>
          <div class="field"><label>Status</label>
            <select id="f-status">
              ${['lead', 'ativo', 'inativo', 'ex_cliente'].map((s) => `<option value="${s}" ${c.status === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="field"><label>Observações</label><textarea id="f-notes" rows="3">${esc(c.notes || '')}</textarea></div>
        <div class="modal-foot">
          <button type="button" class="btn btn-outline" id="modal-cancel">Cancelar</button>
          <button type="submit" class="btn btn-gold">Salvar</button>
        </div>
      </form>
    `);
    document.getElementById('modal-cancel').addEventListener('click', closeModal);
    document.getElementById('client-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        name: document.getElementById('f-name').value.trim(),
        document: document.getElementById('f-document').value.trim(),
        phone: document.getElementById('f-phone').value.trim(),
        email: document.getElementById('f-email').value.trim(),
        city: document.getElementById('f-city').value.trim(),
        case_type: document.getElementById('f-case_type').value.trim(),
        status: document.getElementById('f-status').value,
        notes: document.getElementById('f-notes').value.trim()
      };
      if (id) await api('/clients/' + id, { method: 'PUT', body: JSON.stringify(payload) });
      else await api('/clients', { method: 'POST', body: JSON.stringify(payload) });
      closeModal();
      CLIENTS_CACHE = [];
      loadClients();
    });
  }

  // ---------- PROCESSOS ----------
  async function loadProcesses() {
    const status = await api('/integrations/status');
    document.getElementById('pje-notice').innerHTML = status.djen.configured
      ? 'Monitoramento automático via DJEN ativo — novas intimações de qualquer tribunal do país aparecem aqui e em Notificações.'
      : 'Monitoramento automático de tribunais ainda não configurado (defina ADVOGADO_OAB_NUMERO/UF no servidor). Por enquanto, os andamentos são cadastrados manualmente.';

    const q = document.getElementById('process-search').value.trim();
    const processes = await api('/processes' + (q ? `?q=${encodeURIComponent(q)}` : ''));
    const tbody = document.querySelector('#tbl-processes tbody');
    tbody.innerHTML = processes.length ? processes.map((p) => `
      <tr>
        <td>${esc(p.client_name)}</td>
        <td>${esc(p.number || '—')}<div class="muted">${esc(p.court || '')}</div></td>
        <td>${esc(p.phase || '—')}</td>
        <td>${badge(p.status, p.status === 'ativo' ? 'ativo' : 'inativo')}</td>
        <td>${p.next_deadline ? dateBR(p.next_deadline) + (p.next_deadline_desc ? `<div class="muted">${esc(p.next_deadline_desc)}</div>` : '') : '—'}</td>
        <td class="muted">${p.monitoring_mode === 'automatico' ? 'automático' : 'manual'}</td>
        <td class="row-actions">
          <span class="link-btn" data-view-process="${p.id}">ver</span>
          <span class="link-btn" data-edit-process="${p.id}">editar</span>
        </td>
      </tr>`).join('') : '<tr class="empty-row"><td colspan="7">Nenhum processo cadastrado ainda.</td></tr>';

    tbody.querySelectorAll('[data-edit-process]').forEach((el) => el.addEventListener('click', () => openProcessModal(el.dataset.editProcess)));
    tbody.querySelectorAll('[data-view-process]').forEach((el) => el.addEventListener('click', () => openProcessDetail(el.dataset.viewProcess)));
  }

  document.getElementById('btn-new-process').addEventListener('click', () => openProcessModal());

  function feeFieldsHtml(p) {
    p = p || {};
    const isEdit = Boolean(p.id);
    return `
      <div class="section-title">Valor da causa e honorários</div>
      <div class="g2">
        <div class="field"><label>Valor da causa (R$)</label><input type="text" inputmode="decimal" id="f-case_value" placeholder="0,00"></div>
        <div class="field"><label>Entrada ${isEdit ? 'recebida' : 'recebida no fechamento'} (R$)</label><input type="text" inputmode="decimal" id="f-down_payment" placeholder="0,00">
          <span class="muted">${isEdit ? 'Só corrige o valor guardado no processo; não recria o lançamento no financeiro.' : 'Se preenchido, gera lançamento "pago" no financeiro + recibo para enviar ao cliente.'}</span>
        </div>
      </div>
      <div class="field">
        <label>Honorários</label>
        <div class="rr" style="display:flex;gap:10px;margin-top:4px">
          <label style="display:flex;align-items:center;gap:6px;font-size:12px"><input type="radio" name="fee_type" value="percentual" ${p.fee_type !== 'fixo' ? 'checked' : ''}> % sobre o valor da causa/êxito</label>
          <label style="display:flex;align-items:center;gap:6px;font-size:12px"><input type="radio" name="fee_type" value="fixo" ${p.fee_type === 'fixo' ? 'checked' : ''}> Valor(es) fixo(s) a receber</label>
        </div>
      </div>
      <div id="fee-percentual-block" class="field" style="display:${p.fee_type === 'fixo' ? 'none' : 'block'}">
        <label>Percentual (%)</label>
        <input type="number" step="0.1" id="f-fee_percentage" placeholder="ex: 20" value="${p.fee_percentage != null ? p.fee_percentage : ''}">
        <span class="muted">${isEdit ? 'Corrige o percentual guardado no processo.' : 'Gera um lançamento "a receber" pendente, com valor estimado, até a confirmação do êxito.'}</span>
      </div>
      <div id="fee-fixo-block" class="field" style="display:${p.fee_type === 'fixo' ? 'block' : 'none'}">
        ${isEdit ? `
          <span class="muted">Para lançar novos valores fixos a receber ou corrigir os já criados, use a aba Financeiro (cada lançamento pode ser editado ou excluído lá).</span>
        ` : `
          <label>Valores a receber</label>
          <div id="fixed-fees-list"></div>
          <button type="button" class="btn btn-outline" id="btn-add-fee-row" style="margin-top:6px">+ Adicionar valor</button>
        `}
      </div>
    `;
  }

  function fixedFeeRowHtml(idx) {
    return `
      <div class="fee-row" data-idx="${idx}" style="border:1px solid var(--border);border-radius:4px;padding:10px;margin-bottom:8px">
        <div class="field" style="margin-bottom:8px"><label>Descrição</label><input type="text" class="fee-desc" placeholder="ex: 1ª parcela dos honorários"></div>
        <div class="g2">
          <div class="field" style="margin-bottom:0"><label>Valor (R$)</label><input type="text" inputmode="decimal" class="fee-amount" placeholder="0,00"></div>
          <div class="field" style="margin-bottom:0"><label>Vencimento</label><input type="date" class="fee-due"></div>
        </div>
      </div>`;
  }

  function wireFeeFieldEvents(container) {
    attachMoneyMask(container.querySelector('#f-case_value'));
    attachMoneyMask(container.querySelector('#f-down_payment'));
    const radios = container.querySelectorAll('input[name="fee_type"]');
    const percBlock = container.querySelector('#fee-percentual-block');
    const fixoBlock = container.querySelector('#fee-fixo-block');
    radios.forEach((r) => r.addEventListener('change', () => {
      if (r.checked) {
        percBlock.style.display = r.value === 'percentual' ? 'block' : 'none';
        fixoBlock.style.display = r.value === 'fixo' ? 'block' : 'none';
      }
    }));
    const list = container.querySelector('#fixed-fees-list');
    if (list) {
      let feeRowCount = 0;
      function addFeeRow() {
        const div = document.createElement('div');
        div.innerHTML = fixedFeeRowHtml(feeRowCount++);
        const row = div.firstElementChild;
        list.appendChild(row);
        attachMoneyMask(row.querySelector('.fee-amount'));
      }
      container.querySelector('#btn-add-fee-row').addEventListener('click', addFeeRow);
      addFeeRow();
    }
  }

  function readFeeFields(container) {
    const feeType = container.querySelector('input[name="fee_type"]:checked').value;
    const result = {
      case_value: getMoneyValue(container.querySelector('#f-case_value')),
      down_payment: getMoneyValue(container.querySelector('#f-down_payment')),
      fee_type: feeType
    };
    if (feeType === 'percentual') {
      result.fee_percentage = parseFloat(container.querySelector('#f-fee_percentage').value) || null;
    } else if (container.querySelector('.fee-row')) {
      result.fixed_fees = Array.from(container.querySelectorAll('.fee-row')).map((row) => ({
        description: row.querySelector('.fee-desc').value.trim(),
        amount: getMoneyValue(row.querySelector('.fee-amount')),
        due_date: row.querySelector('.fee-due').value || null
      })).filter((f) => f.amount);
    }
    return result;
  }

  async function openProcessModal(id) {
    const p = id ? await api('/processes/' + id) : {};
    const options = id ? await clientOptions(p.client_id) : null;
    openModal(`
      <h3>${id ? 'Editar processo' : 'Novo processo'}</h3>
      <form id="process-form">
        ${id ? `
          <div class="field"><label>Cliente</label><select id="f-client_id" required>${options}</select></div>
        ` : `
          <div class="field">
            <label>Cliente</label>
            <div class="rr" style="display:flex;gap:10px;margin-bottom:8px">
              <label style="display:flex;align-items:center;gap:6px;font-size:12px"><input type="radio" name="client_mode" value="existing" checked> Cliente já cadastrado</label>
              <label style="display:flex;align-items:center;gap:6px;font-size:12px"><input type="radio" name="client_mode" value="new"> Cadastrar novo cliente junto</label>
            </div>
          </div>
          <div id="client-existing-block" class="field"><select id="f-client_id"></select></div>
          <div id="client-new-block" style="display:none">
            <div class="g2">
              <div class="field"><label>Nome completo</label><input id="f-new-name" required></div>
              <div class="field"><label>WhatsApp</label><input id="f-new-phone" placeholder="(27) 99999-9999" required></div>
            </div>
            <div class="g2">
              <div class="field"><label>E-mail</label><input type="email" id="f-new-email"></div>
              <div class="field"><label>CPF/CNPJ</label><input id="f-new-document"></div>
            </div>
          </div>
        `}
        <div class="g2">
          <div class="field"><label>Número do processo (CNJ)</label><input id="f-number" value="${esc(p.number || '')}" placeholder="0000000-00.0000.0.00.0000"></div>
          <div class="field"><label>Tribunal / Vara</label><input id="f-court" value="${esc(p.court || '')}"></div>
        </div>
        <div class="g2">
          <div class="field"><label>Sistema</label>
            <select id="f-court_system">
              ${['pje', 'puma', 'esaj', 'fisico', 'outro'].map((s) => `<option value="${s}" ${p.court_system === s ? 'selected' : ''}>${s.toUpperCase()}</option>`).join('')}
            </select>
          </div>
          <div class="field"><label>Fase atual</label><input id="f-phase" value="${esc(p.phase || '')}"></div>
        </div>
        <div class="field"><label>Assunto</label><input id="f-subject" value="${esc(p.subject || '')}"></div>
        <div class="g2">
          <div class="field"><label>Status</label>
            <select id="f-status">${['ativo', 'suspenso', 'arquivado', 'encerrado'].map((s) => `<option value="${s}" ${p.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
          </div>
          <div class="field"><label>Responsável</label><input id="f-responsible" value="${esc(p.responsible || '')}"></div>
        </div>
        <div class="g2">
          <div class="field"><label>Próximo prazo</label><input type="date" id="f-next_deadline" value="${p.next_deadline ? String(p.next_deadline).slice(0, 10) : ''}"></div>
          <div class="field"><label>Descrição do prazo</label><input id="f-next_deadline_desc" value="${esc(p.next_deadline_desc || '')}"></div>
        </div>
        ${feeFieldsHtml(id ? { ...p, id } : {})}
        <div class="modal-foot">
          <button type="button" class="btn btn-outline" id="modal-cancel">Cancelar</button>
          <button type="submit" class="btn btn-gold">Salvar</button>
        </div>
      </form>
    `);
    document.getElementById('modal-cancel').addEventListener('click', closeModal);
    const form = document.getElementById('process-form');

    if (id) {
      // edicao: select ja populado com options
      setMoneyValue(form.querySelector('#f-case_value'), p.case_value);
      setMoneyValue(form.querySelector('#f-down_payment'), p.down_payment);
      wireFeeFieldEvents(form);
    } else {
      const existingBlock = document.getElementById('client-existing-block');
      existingBlock.innerHTML = `<select id="f-client_id" required>${await clientOptions()}</select>`;
      const newBlock = document.getElementById('client-new-block');
      const existingSelect = document.getElementById('f-client_id');
      const newNameInput = document.getElementById('f-new-name');
      const newPhoneInput = document.getElementById('f-new-phone');
      // Importante: um campo "required" escondido (display:none) trava o
      // envio do formulário sem nenhum aviso visível ao usuário - por isso
      // alternamos o atributo required junto com a visibilidade dos blocos.
      form.querySelectorAll('input[name="client_mode"]').forEach((r) => r.addEventListener('change', () => {
        if (!r.checked) return;
        const isExisting = r.value === 'existing';
        existingBlock.style.display = isExisting ? 'block' : 'none';
        newBlock.style.display = isExisting ? 'none' : 'block';
        existingSelect.required = isExisting;
        newNameInput.required = !isExisting;
        newPhoneInput.required = !isExisting;
      }));
      wireFeeFieldEvents(form);
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        number: document.getElementById('f-number').value.trim(),
        court: document.getElementById('f-court').value.trim(),
        court_system: document.getElementById('f-court_system').value,
        phase: document.getElementById('f-phase').value.trim(),
        subject: document.getElementById('f-subject').value.trim(),
        status: document.getElementById('f-status').value,
        responsible: document.getElementById('f-responsible').value.trim(),
        next_deadline: document.getElementById('f-next_deadline').value || null,
        next_deadline_desc: document.getElementById('f-next_deadline_desc').value.trim()
      };

      if (id) {
        payload.client_id = document.getElementById('f-client_id').value;
        Object.assign(payload, readFeeFields(form));
        delete payload.fixed_fees; // edicao nao gera novos lancamentos automaticamente
        await api('/processes/' + id, { method: 'PUT', body: JSON.stringify(payload) });
        closeModal();
        loadProcesses();
        return;
      }

      const clientMode = form.querySelector('input[name="client_mode"]:checked').value;
      if (clientMode === 'new') {
        payload.new_client = {
          name: document.getElementById('f-new-name').value.trim(),
          phone: document.getElementById('f-new-phone').value.trim(),
          email: document.getElementById('f-new-email').value.trim(),
          document: document.getElementById('f-new-document').value.trim()
        };
      } else {
        payload.client_id = document.getElementById('f-client_id').value;
      }
      Object.assign(payload, readFeeFields(form));

      let result;
      try {
        result = await api('/processes', { method: 'POST', body: JSON.stringify(payload) });
      } catch (err) {
        alert(err.message);
        return;
      }
      CLIENTS_CACHE = [];
      loadProcesses();
      openProcessCreatedModal(result);
    });
  }

  function openProcessCreatedModal(result) {
    const { client, process, finance, whatsapp_link, receipt_url } = result;
    openModal(`
      <h3>Processo cadastrado</h3>
      <p class="muted">Cliente: <strong>${esc(client.name)}</strong>${process.number ? ' · ' + esc(process.number) : ''}</p>
      ${finance.length ? `
        <div class="section-title">Lançamentos criados no financeiro</div>
        ${finance.map((f) => `<div style="font-size:13px;padding:4px 0">${esc(f.description)} — ${money(f.amount)} <span class="muted">(${f.status})</span></div>`).join('')}
      ` : ''}
      <div class="section-title">Avisar o cliente</div>
      ${whatsapp_link ? `<a class="btn btn-gold" style="display:inline-block;margin-bottom:8px" target="_blank" href="${whatsapp_link}">Enviar mensagem no WhatsApp</a>` : '<p class="muted">Cliente sem telefone cadastrado — não é possível gerar o link do WhatsApp.</p>'}
      ${receipt_url ? `<div><a class="link-btn" target="_blank" href="${receipt_url}${receipt_url.includes('?') ? '&' : '?'}token=${encodeURIComponent(TOKEN)}">Abrir recibo da entrada (imprimir/salvar como PDF)</a></div>
        <p class="muted" style="margin-top:6px">O WhatsApp não permite anexar arquivo por este link — abra o recibo, salve/imprima e anexe manualmente na conversa.</p>` : ''}
      <div class="modal-foot">
        <button type="button" class="btn btn-outline" id="modal-cancel">Fechar</button>
      </div>
    `);
    document.getElementById('modal-cancel').addEventListener('click', closeModal);
  }

  async function openProcessDetail(id) {
    const p = await api('/processes/' + id);
    openModal(`
      <h3>${esc(p.client_name)}</h3>
      <p class="muted">${esc(p.number || 'sem número')} · ${esc(p.court || '')}</p>
      <div class="section-title">Andamentos</div>
      <div id="updates-list">
        ${p.updates.length ? p.updates.map((u) => `
          <div style="padding:8px 0;border-bottom:1px solid #f0eee8">
            <div style="font-size:11px;color:var(--muted)">${dateBR(u.date)} · ${esc(u.source)}</div>
            <div style="font-size:13px">${esc(u.description)}</div>
          </div>`).join('') : '<p class="muted">Nenhum andamento registrado.</p>'}
      </div>
      <form id="update-form" style="margin-top:1rem">
        <div class="field"><label>Adicionar andamento</label><textarea id="f-update-desc" rows="2" required></textarea></div>
        <div class="modal-foot">
          <button type="button" class="btn btn-outline" id="modal-cancel">Fechar</button>
          <button type="submit" class="btn btn-gold">Adicionar</button>
        </div>
      </form>
    `);
    document.getElementById('modal-cancel').addEventListener('click', closeModal);
    document.getElementById('update-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const description = document.getElementById('f-update-desc').value.trim();
      if (!description) return;
      const result = await api(`/processes/${id}/updates`, { method: 'POST', body: JSON.stringify({ description }) });
      if (result.whatsapp_link) {
        const go = confirm('Andamento adicionado. Deseja avisar o cliente agora pelo WhatsApp?');
        if (go) window.open(result.whatsapp_link, '_blank');
      }
      openProcessDetail(id);
    });
  }

  // ---------- FINANCEIRO ----------
  async function loadFinance() {
    const [entries, summary] = await Promise.all([api('/finance'), api('/finance/summary')]);
    document.getElementById('finance-kpi-grid').innerHTML = `
      <div class="kpi"><div class="lbl">A receber</div><div class="val">${money(summary.receivable)}</div></div>
      <div class="kpi danger"><div class="lbl">Em atraso</div><div class="val">${money(summary.overdue)}</div></div>
      <div class="kpi"><div class="lbl">A pagar</div><div class="val">${money(summary.payable)}</div></div>
      <div class="kpi success"><div class="lbl">Recebido no mês</div><div class="val">${money(summary.receivedThisMonth)}</div></div>
    `;
    const tbody = document.querySelector('#tbl-finance tbody');
    tbody.innerHTML = entries.length ? entries.map((f) => `
      <tr>
        <td>${esc(f.description)}${f.category ? `<div class="muted">${esc(f.category)}</div>` : ''}</td>
        <td>${esc(f.client_name || '—')}</td>
        <td>${f.type === 'receber' ? 'a receber' : 'a pagar'}</td>
        <td>${money(f.amount)}</td>
        <td>${dateBR(f.due_date)}</td>
        <td>${badge(f.status, f.status)}</td>
        <td class="row-actions">
          ${f.status !== 'pago' ? `<span class="link-btn" data-pay="${f.id}">marcar pago</span>` : ''}
          ${f.client_id ? `<a class="link-btn" target="_blank" href="/api/finance/${f.id}/receipt?token=${encodeURIComponent(TOKEN)}">recibo</a>` : ''}
          <span class="link-btn" data-del-fin="${f.id}" style="color:var(--danger)">excluir</span>
        </td>
      </tr>`).join('') : '<tr class="empty-row"><td colspan="7">Nenhum lançamento financeiro.</td></tr>';

    tbody.querySelectorAll('[data-pay]').forEach((el) => el.addEventListener('click', async () => {
      await api('/finance/' + el.dataset.pay, { method: 'PUT', body: JSON.stringify({ status: 'pago', paid_date: new Date().toISOString().slice(0, 10) }) });
      loadFinance();
    }));
    tbody.querySelectorAll('[data-del-fin]').forEach((el) => el.addEventListener('click', async () => {
      if (confirm('Excluir este lançamento?')) { await api('/finance/' + el.dataset.delFin, { method: 'DELETE' }); loadFinance(); }
    }));
  }

  document.getElementById('btn-new-finance').addEventListener('click', async () => {
    const options = await clientOptions();
    openModal(`
      <h3>Novo lançamento financeiro</h3>
      <form id="finance-form">
        <div class="g2">
          <div class="field"><label>Tipo</label><select id="f-type"><option value="receber">A receber</option><option value="pagar">A pagar</option></select></div>
          <div class="field"><label>Categoria</label><input id="f-category" placeholder="honorários, custas, despesa fixa..."></div>
        </div>
        <div class="field"><label>Descrição</label><input id="f-description" required></div>
        <div class="g2">
          <div class="field"><label>Valor (R$)</label><input type="text" inputmode="decimal" id="f-amount" placeholder="0,00" required></div>
          <div class="field"><label>Vencimento</label><input type="date" id="f-due_date"></div>
        </div>
        <div class="field"><label>Cliente (opcional)</label><select id="f-client_id"><option value="">—</option>${options}</select></div>
        <div class="modal-foot">
          <button type="button" class="btn btn-outline" id="modal-cancel">Cancelar</button>
          <button type="submit" class="btn btn-gold">Salvar</button>
        </div>
      </form>
    `);
    attachMoneyMask(document.getElementById('f-amount'));
    document.getElementById('modal-cancel').addEventListener('click', closeModal);
    document.getElementById('finance-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        type: document.getElementById('f-type').value,
        category: document.getElementById('f-category').value.trim(),
        description: document.getElementById('f-description').value.trim(),
        amount: getMoneyValue(document.getElementById('f-amount')),
        due_date: document.getElementById('f-due_date').value || null,
        client_id: document.getElementById('f-client_id').value || null
      };
      await api('/finance', { method: 'POST', body: JSON.stringify(payload) });
      closeModal();
      loadFinance();
    });
  });

  // ---------- TAREFAS / GESTÃO ----------
  async function loadTasks() {
    const [tasks, status] = await Promise.all([api('/tasks'), api('/integrations/status').catch(() => null)]);

    const noticeEl = document.getElementById('google-calendar-notice');
    if (status && status.google_calendar.configured) {
      if (status.google_calendar.connected) {
        noticeEl.innerHTML = `Google Agenda conectado — toda tarefa com prazo vira evento na sua agenda automaticamente (audiências com horário exato, as demais como evento de dia inteiro). <span class="link-btn" id="btn-google-disconnect" style="margin-left:10px;color:var(--danger)">desconectar</span>`;
      } else {
        noticeEl.innerHTML = `<button class="btn btn-outline" id="btn-google-connect">Conectar Google Agenda</button> — depois de conectado, toda tarefa com prazo cria um evento automaticamente na sua agenda.`;
      }
    } else {
      noticeEl.innerHTML = `Integração com o Google Agenda ainda não configurada neste servidor (faltam as credenciais OAuth do Google — ver README). As tarefas continuam sendo registradas normalmente no sistema, só não sincronizam com o Google por enquanto.`;
    }
    const connectBtn = document.getElementById('btn-google-connect');
    if (connectBtn) connectBtn.addEventListener('click', async () => {
      try {
        const r = await api('/integrations/google/auth-url');
        window.open(r.url, '_blank');
      } catch (err) { alert(err.message); }
    });
    const disconnectBtn = document.getElementById('btn-google-disconnect');
    if (disconnectBtn) disconnectBtn.addEventListener('click', async () => {
      if (confirm('Desconectar o Google Agenda? Audiências futuras deixarão de ser criadas automaticamente na sua agenda.')) {
        await api('/integrations/google/disconnect', { method: 'POST' });
        loadTasks();
      }
    });

    const tbody = document.querySelector('#tbl-tasks tbody');
    tbody.innerHTML = tasks.length ? tasks.map((t) => `
      <tr>
        <td>${esc(t.title)}${t.description ? `<div class="muted">${esc(t.description)}</div>` : ''}${t.is_hearing ? '<div class="muted">📅 audiência/compromisso' + (t.google_event_link ? ` · <a href="${t.google_event_link}" target="_blank">ver na agenda</a>` : '') + '</div>' : ''}</td>
        <td>${esc(t.client_name || '—')}</td>
        <td>${dateBR(t.due_date)}</td>
        <td>${badge(t.priority, t.priority)}</td>
        <td>
          <select data-status="${t.id}">
            ${['pendente', 'em_andamento', 'concluida'].map((s) => `<option value="${s}" ${t.status === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </td>
        <td><span class="link-btn" data-del-task="${t.id}" style="color:var(--danger)">excluir</span></td>
      </tr>`).join('') : '<tr class="empty-row"><td colspan="6">Nenhuma tarefa cadastrada.</td></tr>';

    tbody.querySelectorAll('[data-status]').forEach((el) => el.addEventListener('change', async () => {
      await api('/tasks/' + el.dataset.status, { method: 'PUT', body: JSON.stringify({ status: el.value }) });
    }));
    tbody.querySelectorAll('[data-del-task]').forEach((el) => el.addEventListener('click', async () => {
      if (confirm('Excluir esta tarefa?')) { await api('/tasks/' + el.dataset.delTask, { method: 'DELETE' }); loadTasks(); }
    }));
  }

  document.getElementById('btn-new-task').addEventListener('click', async () => {
    const options = await clientOptions();
    openModal(`
      <h3>Nova tarefa</h3>
      <form id="task-form">
        <div class="field"><label>Título</label><input id="f-title" required placeholder="ex: Audiência de conciliação João (Eletrobom)"></div>
        <div class="field"><label>Descrição</label><textarea id="f-description" rows="2"></textarea></div>
        <div class="field"><label>Cliente relacionado</label><select id="f-client_id"><option value="">—</option>${options}</select></div>
        <div class="field">
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
            <input type="checkbox" id="f-is_hearing" style="width:16px;height:16px"> É uma audiência ou compromisso com hora marcada
          </label>
        </div>
        <div id="hearing-fields" style="display:none">
          <div class="g2">
            <div class="field"><label>Data</label><input type="date" id="f-event_date"></div>
            <div class="field"><label>Horário (início – fim)</label>
              <div style="display:flex;gap:6px;align-items:center">
                <input type="time" id="f-event_start_time" style="flex:1">
                <span class="muted">até</span>
                <input type="time" id="f-event_end_time" style="flex:1">
              </div>
            </div>
          </div>
          <div class="field">
            <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
              <input type="checkbox" id="f-notify_client" style="width:16px;height:16px"> Avisar o cliente por WhatsApp sobre este compromisso
            </label>
          </div>
        </div>
        <div class="g2">
          <div class="field"><label>Prazo (para tarefas sem hora marcada)</label><input type="date" id="f-due_date"></div>
          <div class="field"><label>Prioridade</label>
            <select id="f-priority"><option value="baixa">Baixa</option><option value="media" selected>Média</option><option value="alta">Alta</option><option value="urgente">Urgente</option></select>
          </div>
        </div>
        <div class="modal-foot">
          <button type="button" class="btn btn-outline" id="modal-cancel">Cancelar</button>
          <button type="submit" class="btn btn-gold">Salvar</button>
        </div>
      </form>
    `);
    document.getElementById('modal-cancel').addEventListener('click', closeModal);

    const hearingCheckbox = document.getElementById('f-is_hearing');
    const hearingFields = document.getElementById('hearing-fields');
    hearingCheckbox.addEventListener('change', () => {
      hearingFields.style.display = hearingCheckbox.checked ? 'block' : 'none';
    });

    document.getElementById('task-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const isHearing = hearingCheckbox.checked;
      const payload = {
        title: document.getElementById('f-title').value.trim(),
        description: document.getElementById('f-description').value.trim(),
        due_date: document.getElementById('f-due_date').value || null,
        priority: document.getElementById('f-priority').value,
        client_id: document.getElementById('f-client_id').value || null,
        is_hearing: isHearing
      };
      if (isHearing) {
        const date = document.getElementById('f-event_date').value;
        const startTime = document.getElementById('f-event_start_time').value;
        const endTime = document.getElementById('f-event_end_time').value;
        if (!date || !startTime || !endTime) { alert('Preencha data e horário de início/fim da audiência.'); return; }
        payload.event_start = `${date}T${startTime}:00`;
        payload.event_end = `${date}T${endTime}:00`;
        payload.notify_client = document.getElementById('f-notify_client').checked;
      }
      const result = await api('/tasks', { method: 'POST', body: JSON.stringify(payload) });
      closeModal();
      loadTasks();
      if (result.whatsapp_link) {
        if (confirm('Compromisso salvo. Deseja avisar o cliente agora pelo WhatsApp?')) window.open(result.whatsapp_link, '_blank');
      } else if (isHearing && payload.notify_client && !result.task.client_phone) {
        alert('Cliente sem telefone cadastrado — não foi possível gerar o link do WhatsApp.');
      }
    });
  });

  // ---------- NOTIFICAÇÕES ----------
  async function loadNotifications() {
    const list = await api('/notifications');
    const unread = list.filter((n) => !n.is_read).length;
    const badgeEl = document.getElementById('notif-badge');
    badgeEl.style.display = unread ? 'inline-block' : 'none';
    badgeEl.textContent = unread;

    const listHtml = list.length ? list.map((n) => `
      <div style="padding:12px 0;border-bottom:1px solid var(--border);${n.is_read ? 'opacity:.6' : ''}">
        <div style="display:flex;justify-content:space-between;gap:1rem">
          <strong style="font-size:13px">${esc(n.title)}</strong>
          <span class="muted" style="white-space:nowrap;font-size:11px">${dateBR(n.created_at)}</span>
        </div>
        ${n.message ? `<div style="font-size:12px;color:var(--muted);margin-top:4px">${esc(n.message)}</div>` : ''}
        ${n.process_number ? `<div style="font-size:11px;color:var(--slate-light);margin-top:4px">Processo ${esc(n.process_number)} · ${esc(n.client_name || '')}</div>` : ''}
        <div style="margin-top:6px;display:flex;gap:14px">
          ${!n.is_read ? `<span class="link-btn" data-mark-read="${n.id}">marcar como lida</span>` : ''}
          ${n.whatsapp_link ? `<a class="link-btn" target="_blank" href="${n.whatsapp_link}">avisar cliente no WhatsApp</a>` : ''}
        </div>
      </div>`).join('') : '<p class="muted">Nenhuma notificação até o momento.</p>';

    document.getElementById('notifications-list').innerHTML = listHtml;

    document.querySelectorAll('[data-mark-read]').forEach((el) => el.addEventListener('click', async () => {
      await api('/notifications/' + el.dataset.markRead + '/read', { method: 'POST' });
      loadNotifications();
    }));

    await loadDjenPanel();
  }

  document.getElementById('btn-read-all').addEventListener('click', async () => {
    await api('/notifications/read-all', { method: 'POST' });
    loadNotifications();
  });

  // ---------- DJEN (intimações/publicações) ----------
  function djenSummaryRow(item) {
    return `
      <div style="padding:12px 0;border-bottom:1px solid var(--border);${item.is_read ? 'opacity:.55' : ''}">
        <div style="display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap">
          <strong style="font-size:13px">${esc(item.court || '—')} · ${esc(item.communication_type || 'Comunicação')}${item.sigiloso ? ' 🔒' : ''}</strong>
          <span class="muted" style="white-space:nowrap;font-size:11px">${dateBR(item.disponibilizacao_date)}</span>
        </div>
        <div style="font-size:12px;color:var(--slate-light);margin-top:4px">
          ${item.process_number ? `Processo ${esc(item.process_number)}` : 'Processo não identificado'}${item.class_name ? ' · ' + esc(item.class_name) : ''}${item.org_name ? ' · ' + esc(item.org_name) : ''}
        </div>
        ${item.client_name ? `<div style="font-size:11px;color:var(--muted);margin-top:2px">Cliente vinculado: ${esc(item.client_name)}</div>` : ''}
        ${item.content ? `<div style="font-size:12px;color:var(--muted);margin-top:6px">${esc(item.content.slice(0, 250))}${item.content.length > 250 ? '…' : ''}</div>` : ''}
        <div style="margin-top:6px;display:flex;gap:14px">
          ${!item.is_read ? `<span class="link-btn" data-mark-djen-read="${item.id}">marcar como lida</span>` : ''}
          ${item.link ? `<a class="link-btn" target="_blank" href="${esc(item.link)}">ver íntegra</a>` : ''}
        </div>
      </div>`;
  }

  async function loadDjenPanel() {
    const status = await api('/integrations/status').catch(() => null);
    const noticeEl = document.getElementById('djen-notice');
    if (status && status.djen.configured) {
      noticeEl.innerHTML = `Configurado para OAB ${esc(status.djen.numeroOab)}/${esc(status.djen.ufOab)}. Se "Buscar pelo servidor" falhar (a API do DJEN pode bloquear IPs fora do Brasil, dependendo de onde o servidor está hospedado), use "Buscar agora (pelo navegador)" — funciona sempre, mas só busca enquanto esta aba estiver aberta.`;
    } else {
      noticeEl.innerHTML = `Não configurado neste servidor (faltam ADVOGADO_OAB_NUMERO / ADVOGADO_OAB_UF).`;
    }

    const showRead = document.getElementById('djen-show-read').checked;
    const items = await api('/integrations/djen/communications' + (showRead ? '' : '?unread=1')).catch(() => []);
    document.getElementById('djen-list').innerHTML = items.length
      ? items.map(djenSummaryRow).join('')
      : '<p class="muted">Nenhuma intimação para exibir.</p>';

    document.querySelectorAll('[data-mark-djen-read]').forEach((el) => el.addEventListener('click', async () => {
      await api('/integrations/djen/communications/' + el.dataset.markDjenRead + '/read', { method: 'POST' });
      loadDjenPanel();
    }));
  }

  document.getElementById('djen-show-read').addEventListener('change', loadDjenPanel);

  document.getElementById('btn-djen-test').addEventListener('click', async (e) => {
    const btn = e.target;
    btn.disabled = true; btn.textContent = 'Testando...';
    try {
      const r = await api('/integrations/djen/test');
      if (r.ok) alert('Conexão OK — o servidor conseguiu acessar a API do DJEN (status ' + r.status + ').');
      else alert('Falha: ' + (r.error || `HTTP ${r.status}` || r.reason) + '\n\nUse "Buscar agora (pelo navegador)" como alternativa.');
    } catch (err) {
      alert('Erro ao testar: ' + err.message);
    } finally {
      btn.disabled = false; btn.textContent = 'Testar conexão do servidor';
    }
  });

  document.getElementById('btn-djen-sync-server').addEventListener('click', async (e) => {
    const btn = e.target;
    btn.disabled = true; btn.textContent = 'Buscando...';
    try {
      const r = await api('/integrations/djen/sync', { method: 'POST' });
      alert(`Sincronização concluída: ${r.fetched} comunicações encontradas, ${r.created} novas, ${r.matched} vinculadas a processos cadastrados.`);
      loadDjenPanel();
    } catch (err) {
      alert('Falha ao buscar pelo servidor: ' + err.message + '\n\nTente "Buscar agora (pelo navegador)".');
    } finally {
      btn.disabled = false; btn.textContent = 'Buscar pelo servidor';
    }
  });

  document.getElementById('btn-djen-sync-browser').addEventListener('click', async (e) => {
    const btn = e.target;
    btn.disabled = true; btn.textContent = 'Buscando...';
    try {
      const status = await api('/integrations/status');
      if (!status.djen.configured) throw new Error('OAB não configurada no servidor.');
      const params = new URLSearchParams({
        numeroOab: status.djen.numeroOab, ufOab: status.djen.ufOab,
        itensPorPagina: '50', pagina: '1'
      });
      const resp = await fetch(`https://comunicaapi.pje.jus.br/api/v1/comunicacao?${params.toString()}`, {
        headers: { Accept: 'application/json' }
      });
      if (!resp.ok) throw new Error(`A API do DJEN respondeu HTTP ${resp.status} direto do seu navegador.`);
      const data = await resp.json();
      const items = Array.isArray(data) ? data : (data.items || data.data || []);
      const r = await api('/integrations/djen/ingest', { method: 'POST', body: JSON.stringify({ items }) });
      alert(`Busca pelo navegador concluída: ${r.fetched} comunicações encontradas, ${r.created} novas, ${r.matched} vinculadas a processos cadastrados.`);
      loadDjenPanel();
    } catch (err) {
      alert('Falha ao buscar pelo navegador: ' + err.message);
    } finally {
      btn.disabled = false; btn.textContent = 'Buscar agora (pelo navegador)';
    }
  });

  // ---------- BACKUP ----------
  function loadBackup() {
    document.getElementById('btn-backup-export').href = API + '/backup/export?token=' + encodeURIComponent(TOKEN);
  }

  document.getElementById('btn-backup-import').addEventListener('click', async () => {
    const input = document.getElementById('backup-file-input');
    const file = input.files[0];
    if (!file) { alert('Selecione um arquivo de backup (.json) primeiro.'); return; }
    if (!confirm('Isso vai apagar e substituir TODOS os dados atuais pelos do arquivo selecionado. Continuar?')) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const result = await api('/backup/import', { method: 'POST', body: JSON.stringify(data) });
      const resumo = Object.entries(result.restored).map(([k, v]) => `${k}: ${v}`).join('\n');
      alert('Backup restaurado com sucesso:\n\n' + resumo);
    } catch (err) {
      alert('Erro ao restaurar backup: ' + err.message);
    }
  });

  // ---------- boot ----------
  tryAutoLogin();
})();
