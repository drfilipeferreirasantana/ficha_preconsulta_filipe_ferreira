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
      notifications: loadNotifications
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

    const processes = await api('/processes');
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

  function feeFieldsHtml() {
    return `
      <div class="section-title">Valor da causa e honorários</div>
      <div class="g2">
        <div class="field"><label>Valor da causa (R$)</label><input type="number" step="0.01" id="f-case_value"></div>
        <div class="field"><label>Entrada recebida (R$)</label><input type="number" step="0.01" id="f-down_payment">
          <span class="muted">Se preenchido, gera lançamento "pago" no financeiro + recibo para enviar ao cliente.</span>
        </div>
      </div>
      <div class="field">
        <label>Honorários</label>
        <div class="rr" style="display:flex;gap:10px;margin-top:4px">
          <label style="display:flex;align-items:center;gap:6px;font-size:12px"><input type="radio" name="fee_type" value="percentual" checked> % sobre o valor da causa/êxito</label>
          <label style="display:flex;align-items:center;gap:6px;font-size:12px"><input type="radio" name="fee_type" value="fixo"> Valor(es) fixo(s) a receber</label>
        </div>
      </div>
      <div id="fee-percentual-block" class="field">
        <label>Percentual (%)</label>
        <input type="number" step="0.1" id="f-fee_percentage" placeholder="ex: 20">
        <span class="muted">Gera um lançamento "a receber" pendente, com valor estimado, até a confirmação do êxito.</span>
      </div>
      <div id="fee-fixo-block" class="field" style="display:none">
        <label>Valores a receber</label>
        <div id="fixed-fees-list"></div>
        <button type="button" class="btn btn-outline" id="btn-add-fee-row" style="margin-top:6px">+ Adicionar valor</button>
      </div>
    `;
  }

  function fixedFeeRowHtml(idx) {
    return `
      <div class="g2 fee-row" data-idx="${idx}" style="align-items:end;margin-bottom:6px">
        <div class="field" style="margin-bottom:0"><label>Descrição</label><input type="text" class="fee-desc" placeholder="ex: 1ª parcela dos honorários"></div>
        <div class="field" style="margin-bottom:0"><label>Valor (R$) / Vencimento</label>
          <div style="display:flex;gap:6px">
            <input type="number" step="0.01" class="fee-amount" style="flex:1">
            <input type="date" class="fee-due" style="flex:1">
          </div>
        </div>
      </div>`;
  }

  function wireFeeFieldEvents(container) {
    const radios = container.querySelectorAll('input[name="fee_type"]');
    const percBlock = container.querySelector('#fee-percentual-block');
    const fixoBlock = container.querySelector('#fee-fixo-block');
    radios.forEach((r) => r.addEventListener('change', () => {
      percBlock.style.display = r.value === 'percentual' && r.checked ? 'block' : percBlock.style.display;
      if (r.checked) {
        percBlock.style.display = r.value === 'percentual' ? 'block' : 'none';
        fixoBlock.style.display = r.value === 'fixo' ? 'block' : 'none';
      }
    }));
    const list = container.querySelector('#fixed-fees-list');
    let feeRowCount = 0;
    function addFeeRow() {
      const div = document.createElement('div');
      div.innerHTML = fixedFeeRowHtml(feeRowCount++);
      list.appendChild(div.firstElementChild);
    }
    container.querySelector('#btn-add-fee-row').addEventListener('click', addFeeRow);
    addFeeRow();
  }

  function readFeeFields(container) {
    const feeType = container.querySelector('input[name="fee_type"]:checked').value;
    const result = {
      case_value: parseFloat(container.querySelector('#f-case_value').value) || null,
      down_payment: parseFloat(container.querySelector('#f-down_payment').value) || null,
      fee_type: feeType
    };
    if (feeType === 'percentual') {
      result.fee_percentage = parseFloat(container.querySelector('#f-fee_percentage').value) || null;
    } else {
      result.fixed_fees = Array.from(container.querySelectorAll('.fee-row')).map((row) => ({
        description: row.querySelector('.fee-desc').value.trim(),
        amount: parseFloat(row.querySelector('.fee-amount').value) || null,
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
              <div class="field"><label>Nome completo</label><input id="f-new-name"></div>
              <div class="field"><label>WhatsApp</label><input id="f-new-phone" placeholder="(27) 99999-9999"></div>
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
        ${id ? '' : feeFieldsHtml()}
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
    } else {
      const existingBlock = document.getElementById('client-existing-block');
      existingBlock.innerHTML = `<select id="f-client_id" required>${await clientOptions()}</select>`;
      const newBlock = document.getElementById('client-new-block');
      form.querySelectorAll('input[name="client_mode"]').forEach((r) => r.addEventListener('change', () => {
        existingBlock.style.display = r.value === 'existing' && r.checked ? 'block' : existingBlock.style.display;
        if (r.checked) {
          existingBlock.style.display = r.value === 'existing' ? 'block' : 'none';
          newBlock.style.display = r.value === 'new' ? 'block' : 'none';
        }
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
          <div class="field"><label>Valor (R$)</label><input type="number" step="0.01" id="f-amount" required></div>
          <div class="field"><label>Vencimento</label><input type="date" id="f-due_date"></div>
        </div>
        <div class="field"><label>Cliente (opcional)</label><select id="f-client_id"><option value="">—</option>${options}</select></div>
        <div class="modal-foot">
          <button type="button" class="btn btn-outline" id="modal-cancel">Cancelar</button>
          <button type="submit" class="btn btn-gold">Salvar</button>
        </div>
      </form>
    `);
    document.getElementById('modal-cancel').addEventListener('click', closeModal);
    document.getElementById('finance-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        type: document.getElementById('f-type').value,
        category: document.getElementById('f-category').value.trim(),
        description: document.getElementById('f-description').value.trim(),
        amount: parseFloat(document.getElementById('f-amount').value),
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
    const tasks = await api('/tasks');
    const tbody = document.querySelector('#tbl-tasks tbody');
    tbody.innerHTML = tasks.length ? tasks.map((t) => `
      <tr>
        <td>${esc(t.title)}${t.description ? `<div class="muted">${esc(t.description)}</div>` : ''}</td>
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
        <div class="field"><label>Título</label><input id="f-title" required></div>
        <div class="field"><label>Descrição</label><textarea id="f-description" rows="2"></textarea></div>
        <div class="g2">
          <div class="field"><label>Prazo</label><input type="date" id="f-due_date"></div>
          <div class="field"><label>Prioridade</label>
            <select id="f-priority"><option value="baixa">Baixa</option><option value="media" selected>Média</option><option value="alta">Alta</option><option value="urgente">Urgente</option></select>
          </div>
        </div>
        <div class="field"><label>Cliente relacionado (opcional)</label><select id="f-client_id"><option value="">—</option>${options}</select></div>
        <div class="modal-foot">
          <button type="button" class="btn btn-outline" id="modal-cancel">Cancelar</button>
          <button type="submit" class="btn btn-gold">Salvar</button>
        </div>
      </form>
    `);
    document.getElementById('modal-cancel').addEventListener('click', closeModal);
    document.getElementById('task-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        title: document.getElementById('f-title').value.trim(),
        description: document.getElementById('f-description').value.trim(),
        due_date: document.getElementById('f-due_date').value || null,
        priority: document.getElementById('f-priority').value,
        client_id: document.getElementById('f-client_id').value || null
      };
      await api('/tasks', { method: 'POST', body: JSON.stringify(payload) });
      closeModal();
      loadTasks();
    });
  });

  // ---------- NOTIFICAÇÕES ----------
  async function loadNotifications() {
    const list = await api('/notifications');
    const unread = list.filter((n) => !n.is_read).length;
    const badgeEl = document.getElementById('notif-badge');
    badgeEl.style.display = unread ? 'inline-block' : 'none';
    badgeEl.textContent = unread;

    const status = await api('/integrations/status').catch(() => null);
    const syncBtnHtml = status && status.djen.configured
      ? '<button class="btn btn-outline" id="btn-sync-djen" style="margin-bottom:1rem">Buscar novas intimações agora (DJEN)</button>'
      : '<div class="notice">Integração automática com o DJEN não configurada neste servidor (variáveis ADVOGADO_OAB_NUMERO / ADVOGADO_OAB_UF). Notificações abaixo são geradas pelo próprio sistema (ex: novos leads).</div>';

    const listHtml = list.length ? list.map((n) => `
      <div style="padding:12px 0;border-bottom:1px solid #f0eee8;${n.is_read ? 'opacity:.6' : ''}">
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

    document.getElementById('notifications-list').innerHTML = syncBtnHtml + listHtml;

    const syncBtn = document.getElementById('btn-sync-djen');
    if (syncBtn) syncBtn.addEventListener('click', async () => {
      syncBtn.disabled = true;
      syncBtn.textContent = 'Buscando...';
      try {
        const r = await api('/integrations/djen/sync', { method: 'POST' });
        alert(`Sincronização concluída: ${r.fetched} comunicações encontradas, ${r.created} novas, ${r.matched} vinculadas a processos cadastrados.`);
        loadNotifications();
      } catch (err) {
        alert('Erro ao sincronizar: ' + err.message);
      } finally {
        syncBtn.disabled = false;
      }
    });

    document.querySelectorAll('[data-mark-read]').forEach((el) => el.addEventListener('click', async () => {
      await api('/notifications/' + el.dataset.markRead + '/read', { method: 'POST' });
      loadNotifications();
    }));
  }

  document.getElementById('btn-read-all').addEventListener('click', async () => {
    await api('/notifications/read-all', { method: 'POST' });
    loadNotifications();
  });

  // ---------- boot ----------
  tryAutoLogin();
})();
