const state = {
  user: null,
  requests: [],
  tasks: [],
  technicians: [],
  activePage: 'home'
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const labels = {
  role: {
    funcionario: 'Funcionário',
    lider: 'Líder',
    tecnico: 'Técnico'
  },
  category: {
    eletrica: 'Elétrica',
    hidraulica: 'Hidráulica',
    alvenaria: 'Alvenaria',
    jardinagem: 'Jardinagem'
  },
  priority: {
    baixa: 'Baixa',
    media: 'Média',
    alta: 'Alta',
    urgente: 'Urgente'
  },
  status: {
    aguardando_lider: 'Aguardando líder',
    encaminhada_para_tecnico: 'Encaminhada para técnico',
    em_execucao: 'Em execução',
    concluida: 'Concluída',
    enviada_para_tecnico: 'Enviada para técnico',
    em_andamento: 'Em andamento'
  }
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    credentials: 'same-origin',
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Erro inesperado.');
  return data;
}

function toast(message, type = 'success') {
  const box = $('#toast');
  box.textContent = message;
  box.className = `toast ${type}`;
  box.classList.remove('hidden');
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => box.classList.add('hidden'), 4500);
}

function formatDate(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }).format(new Date(value));
}

function statusBadge(status) {
  const color = status === 'concluida' ? 'green'
    : status === 'aguardando_lider' ? 'orange'
      : status === 'em_execucao' || status === 'em_andamento' ? 'blue'
        : '';
  return `<span class="badge ${color}">${labels.status[status] || status}</span>`;
}

function priorityBadge(priority) {
  const color = priority === 'urgente' ? 'red' : priority === 'alta' ? 'orange' : 'blue';
  return `<span class="badge ${color}">Prioridade: ${labels.priority[priority] || priority}</span>`;
}

function setTitle(title, subtitle) {
  $('#pageTitle').textContent = title;
  $('#pageSubtitle').textContent = subtitle;
}

function openSidebar() {
  $('#sidebar').classList.add('open');
  $('#sidebarBackdrop').hidden = false;
  $('#menuBtn').setAttribute('aria-expanded', 'true');
}

function closeSidebar() {
  $('#sidebar').classList.remove('open');
  $('#sidebarBackdrop').hidden = true;
  $('#menuBtn').setAttribute('aria-expanded', 'false');
}

function toggleSidebar() {
  if ($('#sidebar').classList.contains('open')) {
    closeSidebar();
  } else {
    openSidebar();
  }
}

function showAuth() {
  state.user = null;
  $('#authView').classList.remove('hidden');
  $('#dashboardView').classList.add('hidden');
  $('#logoutBtn').classList.add('hidden');
  $('#userCard').classList.add('hidden');
  $('#nav').innerHTML = '';
  setTitle('Entrar', 'Acesse sua conta cadastrada.');
}

function showDashboard() {
  $('#authView').classList.add('hidden');
  $('#dashboardView').classList.remove('hidden');
  $('#logoutBtn').classList.remove('hidden');
  $('#userCard').classList.remove('hidden');
  $('#userName').textContent = state.user.name;
  $('#userRole').textContent = labels.role[state.user.role] || state.user.role;
  $('#userInitial').textContent = state.user.name.slice(0, 1).toUpperCase();
  renderNav();
  navigate('home');
}

function renderNav() {
  const nav = $('#nav');
  const role = state.user.role;
  const items = [{ id: 'home', label: 'Painel' }];

  if (role === 'funcionario') {
    items.push({ id: 'newRequest', label: 'Solicitar serviço' });
    items.push({ id: 'myRequests', label: 'Minhas solicitações' });
  }
  if (role === 'lider') {
    items.push({ id: 'storage', label: 'Armazenamento' });
    items.push({ id: 'forwarded', label: 'Encaminhadas' });
  }
  if (role === 'tecnico') {
    items.push({ id: 'myTasks', label: 'Minhas tarefas' });
  }

  nav.innerHTML = items.map((item) => `
    <button class="${state.activePage === item.id ? 'active' : ''}" data-page="${item.id}">${item.label}</button>
  `).join('');

  $$('#nav button').forEach((button) => {
    button.addEventListener('click', () => {
      closeSidebar();
      navigate(button.dataset.page);
    });
  });
}

async function refreshData() {
  if (!state.user) return;
  const [requestsData, tasksData] = await Promise.all([
    api('/api/requests'),
    api('/api/tasks')
  ]);
  state.requests = requestsData.requests || [];
  state.tasks = tasksData.tasks || [];

  if (state.user.role === 'lider') {
    const techniciansData = await api('/api/users/technicians');
    state.technicians = techniciansData.technicians || [];
  }
}

function renderStats() {
  const totalRequests = state.requests.length;
  const waiting = state.requests.filter((request) => request.status === 'aguardando_lider').length;
  const running = state.requests.filter((request) => ['encaminhada_para_tecnico', 'em_execucao'].includes(request.status)).length;
  const done = state.requests.filter((request) => request.status === 'concluida').length;

  $('#statsGrid').innerHTML = `
    <div class="stat"><span>Total de solicitações</span><strong>${totalRequests}</strong></div>
    <div class="stat"><span>Aguardando líder</span><strong>${waiting}</strong></div>
    <div class="stat"><span>Em andamento</span><strong>${running}</strong></div>
    <div class="stat"><span>Concluídas</span><strong>${done}</strong></div>
  `;
}

async function navigate(page) {
  state.activePage = page;
  renderNav();
  await refreshData();
  renderStats();

  const role = state.user.role;

  if (page === 'home') {
    if (role === 'funcionario') renderEmployeeHome();
    if (role === 'lider') renderLeaderStorage();
    if (role === 'tecnico') renderTechnicianTasks();
    return;
  }

  if (page === 'newRequest') renderNewRequest();
  if (page === 'myRequests') renderEmployeeRequests();
  if (page === 'storage') renderLeaderStorage();
  if (page === 'forwarded') renderLeaderTasks();
  if (page === 'myTasks') renderTechnicianTasks();
}

function renderEmployeeHome() {
  setTitle('Painel do funcionário', 'Solicite serviços e acompanhe o andamento.');
  $('#roleContent').innerHTML = `
    <div class="grid-2">
      <div class="panel">
        <h2 class="section-title">Nova solicitação</h2>
        ${newRequestFormHtml()}
      </div>
      <div class="panel">
        <h2 class="section-title">Últimas solicitações</h2>
        <div class="card-list">${requestCards(state.requests.slice(0, 6))}</div>
      </div>
    </div>
  `;
  bindRequestForm();
}

function renderNewRequest() {
  setTitle('Solicitar serviço', 'A solicitação será enviada para o armazenamento do líder.');
  $('#roleContent').innerHTML = `
    <div class="panel">
      <h2 class="section-title">Abrir solicitação</h2>
      ${newRequestFormHtml()}
    </div>
  `;
  bindRequestForm();
}

function renderEmployeeRequests() {
  setTitle('Minhas solicitações', 'Acompanhe tudo o que você enviou ao líder.');
  $('#roleContent').innerHTML = `
    <div class="panel">
      <h2 class="section-title">Solicitações enviadas</h2>
      <div class="card-list">${requestCards(state.requests)}</div>
    </div>
  `;
}

function renderLeaderStorage() {
  setTitle('Armazenamento do líder', 'Solicitações recebidas dos funcionários para encaminhamento.');
  const waiting = state.requests.filter((request) => request.status === 'aguardando_lider');
  $('#roleContent').innerHTML = `
    <div class="panel">
      <h2 class="section-title">Solicitações aguardando encaminhamento</h2>
      <div class="card-list">${waiting.length ? waiting.map(leaderRequestCard).join('') : empty('Nenhuma solicitação aguardando encaminhamento.')}</div>
    </div>
  `;
  bindAssignForms();
}

function renderLeaderTasks() {
  setTitle('Serviços encaminhados', 'Acompanhe as tarefas enviadas aos técnicos.');
  $('#roleContent').innerHTML = `
    <div class="panel">
      <h2 class="section-title">Encaminhamentos realizados</h2>
      <div class="card-list">${state.tasks.length ? state.tasks.map(taskCard).join('') : empty('Nenhum serviço foi encaminhado ainda.')}</div>
    </div>
  `;
}

function renderTechnicianTasks() {
  setTitle('Painel do técnico', 'Veja as tarefas encaminhadas pelo líder e atualize o status.');
  $('#roleContent').innerHTML = `
    <div class="panel">
      <h2 class="section-title">Minhas tarefas</h2>
      <div class="card-list">${state.tasks.length ? state.tasks.map(technicianTaskCard).join('') : empty('Nenhuma tarefa encaminhada para você.')}</div>
    </div>
  `;
  bindTaskStatusForms();
}

function newRequestFormHtml() {
  return `
    <form id="requestForm" class="form">
      <label>Categoria</label>
      <select name="category" required>
        <option value="eletrica">Elétrica</option>
        <option value="hidraulica">Hidráulica</option>
        <option value="alvenaria">Alvenaria</option>
        <option value="jardinagem">Jardinagem</option>
      </select>
      <label>Prioridade</label>
      <select name="priority" required>
        <option value="baixa">Baixa</option>
        <option value="media" selected>Média</option>
        <option value="alta">Alta</option>
        <option value="urgente">Urgente</option>
      </select>
      <label>Título do serviço</label>
      <input name="title" placeholder="Ex: Trocar tomada da sala 2" required>
      <label>Local</label>
      <input name="location" placeholder="Ex: Bloco A, sala 2" required>
      <label>Descrição</label>
      <textarea name="description" placeholder="Descreva o problema para o líder encaminhar corretamente." required></textarea>
      <button class="primary" type="submit">Enviar para o líder</button>
    </form>
  `;
}

function requestCards(requests) {
  if (!requests.length) return empty('Nenhuma solicitação encontrada.');
  return requests.map((request) => `
    <article class="service-card">
      <header>
        <div>
          <h3>${escapeHtml(request.title)}</h3>
          <p>${escapeHtml(request.description)}</p>
        </div>
        ${statusBadge(request.status)}
      </header>
      <div class="meta">
        <span class="badge">${labels.category[request.category] || request.category}</span>
        ${priorityBadge(request.priority)}
        <span class="badge">Local: ${escapeHtml(request.location)}</span>
        <span class="badge">Criada: ${formatDate(request.createdAt)}</span>
      </div>
      ${request.technician ? `<p><strong>Técnico:</strong> ${escapeHtml(request.technician.name)}</p>` : ''}
    </article>
  `).join('');
}

function leaderRequestCard(request) {
  const technicianOptions = state.technicians.length
    ? state.technicians.map((tech) => `<option value="${tech.id}">${escapeHtml(tech.name)} - ${escapeHtml(tech.area || 'sem área')}</option>`).join('')
    : '<option value="">Nenhum técnico cadastrado e confirmado</option>';

  return `
    <article class="service-card">
      <header>
        <div>
          <h3>${escapeHtml(request.title)}</h3>
          <p>${escapeHtml(request.description)}</p>
        </div>
        ${priorityBadge(request.priority)}
      </header>
      <div class="meta">
        <span class="badge blue">${labels.category[request.category] || request.category}</span>
        <span class="badge">Solicitante: ${escapeHtml(request.employee?.name || 'Funcionário')}</span>
        <span class="badge">Local: ${escapeHtml(request.location)}</span>
        <span class="badge">Recebida: ${formatDate(request.createdAt)}</span>
      </div>
      <form class="form assign-form" data-request-id="${request.id}" style="margin-top:14px">
        <label>Encaminhar para técnico</label>
        <select name="technicianId" required>${technicianOptions}</select>
        <label>Observação do líder</label>
        <textarea name="leaderNote" placeholder="Orientação para o técnico."></textarea>
        <button class="primary" type="submit" ${state.technicians.length ? '' : 'disabled'}>Encaminhar tarefa</button>
      </form>
    </article>
  `;
}

function taskCard(task) {
  const request = task.request || {};
  return `
    <article class="service-card">
      <header>
        <div>
          <h3>${escapeHtml(request.title || 'Serviço')}</h3>
          <p>${escapeHtml(request.description || '')}</p>
        </div>
        ${statusBadge(task.status)}
      </header>
      <div class="meta">
        <span class="badge blue">${labels.category[request.category] || request.category || '-'}</span>
        <span class="badge">Funcionário: ${escapeHtml(task.employee?.name || '-')}</span>
        <span class="badge">Técnico: ${escapeHtml(task.technician?.name || '-')}</span>
        <span class="badge">Criada: ${formatDate(task.createdAt)}</span>
      </div>
      ${task.leaderNote ? `<p><strong>Observação do líder:</strong> ${escapeHtml(task.leaderNote)}</p>` : ''}
      ${task.technicianNote ? `<p><strong>Observação do técnico:</strong> ${escapeHtml(task.technicianNote)}</p>` : ''}
    </article>
  `;
}

function technicianTaskCard(task) {
  const request = task.request || {};
  const canWork = task.status !== 'concluida';
  return `
    <article class="service-card">
      <header>
        <div>
          <h3>${escapeHtml(request.title || 'Serviço')}</h3>
          <p>${escapeHtml(request.description || '')}</p>
        </div>
        ${statusBadge(task.status)}
      </header>
      <div class="meta">
        <span class="badge blue">${labels.category[request.category] || request.category || '-'}</span>
        <span class="badge">Local: ${escapeHtml(request.location || '-')}</span>
        <span class="badge">Líder: ${escapeHtml(task.leader?.name || '-')}</span>
        <span class="badge">Recebida: ${formatDate(task.createdAt)}</span>
      </div>
      ${task.leaderNote ? `<p><strong>Orientação:</strong> ${escapeHtml(task.leaderNote)}</p>` : ''}
      ${canWork ? `
        <form class="form status-form" data-task-id="${task.id}" style="margin-top:14px">
          <label>Atualizar status</label>
          <select name="status" required>
            <option value="em_andamento">Em andamento</option>
            <option value="concluida">Concluída</option>
          </select>
          <label>Observação do técnico</label>
          <textarea name="technicianNote" placeholder="Descreva o que foi feito ou o andamento.">${escapeHtml(task.technicianNote || '')}</textarea>
          <button class="primary" type="submit">Salvar status</button>
        </form>
      ` : `<p><strong>Finalizada em:</strong> ${formatDate(task.finishedAt)}</p>`}
    </article>
  `;
}

function empty(message) {
  return `<div class="empty">${escapeHtml(message)}</div>`;
}

function bindRequestForm() {
  const form = $('#requestForm');
  if (!form) return;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(form));
    try {
      await api('/api/requests', { method: 'POST', body: JSON.stringify(body) });
      toast('Solicitação enviada para o líder.');
      form.reset();
      await navigate('myRequests');
    } catch (error) {
      toast(error.message, 'error');
    }
  });
}

function bindAssignForms() {
  $$('.assign-form').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const body = Object.fromEntries(new FormData(form));
      try {
        await api(`/api/requests/${form.dataset.requestId}/assign`, { method: 'POST', body: JSON.stringify(body) });
        toast('Serviço encaminhado para o técnico.');
        await navigate('storage');
      } catch (error) {
        toast(error.message, 'error');
      }
    });
  });
}

function bindTaskStatusForms() {
  $$('.status-form').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const body = Object.fromEntries(new FormData(form));
      try {
        await api(`/api/tasks/${form.dataset.taskId}/status`, { method: 'PATCH', body: JSON.stringify(body) });
        toast('Status atualizado.');
        await navigate('myTasks');
      } catch (error) {
        toast(error.message, 'error');
      }
    });
  });
}

function bindAuthTabs() {
  $$('[data-auth-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      const tab = button.dataset.authTab;
      $$('[data-auth-tab]').forEach((item) => item.classList.toggle('active', item.dataset.authTab === tab));
      $$('.auth-tab-content').forEach((content) => content.classList.remove('active'));
      $(`#${tab}Form`).classList.add('active');
      setTitle(tab === 'login' ? 'Entrar' : tab === 'register' ? 'Cadastro' : 'Confirmar email',
        tab === 'login' ? 'Acesse sua conta cadastrada.' : tab === 'register' ? 'Crie uma conta e escolha a função.' : 'Digite o código recebido no email.');
    });
  });
}

function activateAuthTab(tab) {
  const btn = $(`[data-auth-tab="${tab}"]`);
  if (btn) btn.click();
}

function bindAuthForms() {
  $('#loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(body) });
      state.user = data.user;
      toast('Login realizado com sucesso.');
      showDashboard();
    } catch (error) {
      toast(error.message, 'error');
    }
  });

  $('#registerForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form));
    try {
      const data = await api('/api/auth/register', { method: 'POST', body: JSON.stringify(body) });
      toast(data.emailSent ? 'Código enviado para seu email.' : 'Cadastro criado. Configure SMTP para envio real; no modo local o código aparece no terminal.');
      $('#verifyForm input[name="email"]').value = body.email;
      form.reset();
      activateAuthTab('verify');
    } catch (error) {
      toast(error.message, 'error');
    }
  });

  $('#verifyForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await api('/api/auth/verify', { method: 'POST', body: JSON.stringify(body) });
      toast('Email confirmado. Agora você pode entrar.');
      $('#loginForm input[name="email"]').value = body.email;
      event.currentTarget.reset();
      activateAuthTab('login');
    } catch (error) {
      toast(error.message, 'error');
    }
  });

  $('#resendCodeBtn').addEventListener('click', async () => {
    const email = $('#verifyForm input[name="email"]').value;
    try {
      const data = await api('/api/auth/resend-code', { method: 'POST', body: JSON.stringify({ email }) });
      toast(data.emailSent ? 'Novo código enviado para seu email.' : 'Novo código gerado. Em modo local, veja o terminal.');
    } catch (error) {
      toast(error.message, 'error');
    }
  });

  $('#logoutBtn').addEventListener('click', async () => {
    await api('/api/auth/logout', { method: 'POST', body: '{}' });
    closeSidebar();
    showAuth();
    toast('Você saiu do sistema.');
  });
}

async function boot() {
  bindAuthTabs();
  bindAuthForms();
  $('#menuBtn').addEventListener('click', toggleSidebar);
  $('#sidebarBackdrop').addEventListener('click', closeSidebar);
  window.addEventListener('resize', () => {
    if (window.innerWidth > 980) closeSidebar();
  });

  try {
    const data = await api('/api/me');
    state.user = data.user;
    showDashboard();
  } catch {
    showAuth();
  }
}

boot();
