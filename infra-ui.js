
/* =========================================================
   InfraGestor UI — microinterações e componentes visuais
   ========================================================= */
(function () {
  const nativeAlert = window.alert ? window.alert.bind(window) : null;

  document.addEventListener('DOMContentLoaded', () => {
    document.body.classList.add('infra-ui-ready');
    createToastRoot();
    enhanceCategorySelect();
    installRevealObserver();
    installTopbarShadow();
    installCommandPalette();
    installFileInputFeedback();
    replaceAlertWithToast();
  });

  function createToastRoot() {
    if (document.querySelector('.infra-toast-wrap')) return;
    const wrap = document.createElement('div');
    wrap.className = 'infra-toast-wrap';
    document.body.appendChild(wrap);
  }

  function showToast(message, icon = 'fa-circle-info', timeout = 4200) {
    createToastRoot();
    const wrap = document.querySelector('.infra-toast-wrap');
    const toast = document.createElement('div');
    toast.className = 'infra-toast';
    toast.innerHTML = `<i class="fa-solid ${icon}"></i><p>${escapeText(message)}</p>`;
    wrap.appendChild(toast);
    window.setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px)';
      window.setTimeout(() => toast.remove(), 180);
    }, timeout);
  }

  function replaceAlertWithToast() {
    window.alert = function (message) {
      showToast(String(message || ''), 'fa-circle-check');
    };
    window.infraToast = showToast;
    window.infraNativeAlert = nativeAlert;
  }

  function enhanceCategorySelect() {
    const select = document.querySelector('#new-demand-esp.js-smart-select');
    if (!select || select.dataset.enhanced === 'true') return;
    select.dataset.enhanced = 'true';
    select.classList.add('smart-select-hidden');

    const wrapper = document.createElement('div');
    wrapper.className = 'smart-select';
    wrapper.innerHTML = `
      <button type="button" class="smart-select-trigger" aria-haspopup="listbox" aria-expanded="false">
        <span>Selecionar categoria</span>
        <i class="fa-solid fa-chevron-down"></i>
      </button>
      <div class="smart-select-panel" role="listbox">
        <input class="smart-select-search" type="text" placeholder="Buscar categoria..." autocomplete="off">
        <div class="smart-select-options"></div>
      </div>
    `;
    select.insertAdjacentElement('afterend', wrapper);

    const trigger = wrapper.querySelector('.smart-select-trigger');
    const triggerText = trigger.querySelector('span');
    const search = wrapper.querySelector('.smart-select-search');
    const optionsBox = wrapper.querySelector('.smart-select-options');

    const options = Array.from(select.options).map(opt => ({ value: opt.value, label: opt.textContent.trim() }));

    function render(filter = '') {
      const term = normalize(filter);
      optionsBox.innerHTML = '';
      options
        .filter(opt => !term || normalize(opt.label).includes(term))
        .forEach(opt => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'smart-select-option' + (select.value === opt.value ? ' is-selected' : '');
          btn.dataset.value = opt.value;
          const isStart = ['DFD', 'ETP', 'DFD/ETP'].includes(opt.value);
          btn.innerHTML = `<span>${escapeText(opt.label || 'Selecionar...')}</span>${isStart ? '<span class="option-badge">Início</span>' : ''}`;
          btn.addEventListener('click', () => {
            select.value = opt.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            update();
            close();
          });
          optionsBox.appendChild(btn);
        });
    }

    function update() {
      const selected = select.options[select.selectedIndex];
      triggerText.textContent = selected && selected.value ? selected.textContent.trim() : 'Selecionar categoria';
      render(search.value);
    }

    function open() {
      wrapper.classList.add('open');
      trigger.setAttribute('aria-expanded', 'true');
      render('');
      search.value = '';
      setTimeout(() => search.focus(), 40);
    }

    function close() {
      wrapper.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
    }

    trigger.addEventListener('click', () => wrapper.classList.contains('open') ? close() : open());
    search.addEventListener('input', () => render(search.value));
    select.addEventListener('change', update);
    document.addEventListener('click', event => { if (!wrapper.contains(event.target)) close(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
    update();
  }

  function installRevealObserver() {
    const selector = '.stat-card,.detail-card,.form-section,.kanban-col,.progress-item-card,.attachment-section-card,.package-group-card,.my-demand-header,.screen-hero';
    const prepare = () => {
      document.querySelectorAll(selector).forEach(el => {
        if (!el.hasAttribute('data-reveal')) el.setAttribute('data-reveal', '');
      });
    };
    prepare();
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: .08 });
    document.querySelectorAll('[data-reveal]').forEach(el => io.observe(el));
    const mo = new MutationObserver(() => {
      prepare();
      document.querySelectorAll('[data-reveal]:not(.is-visible)').forEach(el => io.observe(el));
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  function installTopbarShadow() {
    const topbar = document.querySelector('.topbar');
    if (!topbar) return;
    const refresh = () => topbar.classList.toggle('is-scrolled', window.scrollY > 6);
    refresh();
    window.addEventListener('scroll', refresh, { passive: true });
  }

  function installCommandPalette() {
    if (document.querySelector('.infra-command-overlay')) return;
    const overlay = document.createElement('div');
    overlay.className = 'infra-command-overlay';
    overlay.innerHTML = `
      <div class="infra-command-box" role="dialog" aria-modal="true">
        <input type="text" placeholder="Buscar ação ou tela..." autocomplete="off">
        <div class="infra-command-list"></div>
      </div>
    `;
    document.body.appendChild(overlay);

    const input = overlay.querySelector('input');
    const list = overlay.querySelector('.infra-command-list');
    const actions = [
      { label: 'Tela Principal', hint: 'Resumo das demandas', icon: 'fa-chart-pie', run: () => go('admin-dashboard') },
      { label: 'Nova Demanda', hint: 'Abrir cadastro de demanda', icon: 'fa-plus', run: () => go('create-demand') },
      { label: 'Em Projeto', hint: 'Quadro kanban', icon: 'fa-table-columns', run: () => go('admin-kanban') },
      { label: 'Fluxo', hint: 'Acompanhamento técnico', icon: 'fa-diagram-project', run: () => go('work-progress') },
      { label: 'Equipe Técnica', hint: 'Engenharia e arquitetura', icon: 'fa-users', run: () => go('admin-team') },
      { label: 'Minhas Demandas', hint: 'Área do técnico', icon: 'fa-user-hard-hat', run: () => go('colab-dashboard') },
    ];

    function go(screen) {
      close();
      if (typeof window.showScreen === 'function') window.showScreen(screen);
    }

    function render() {
      const term = normalize(input.value);
      const filtered = actions.filter(a => !term || normalize(`${a.label} ${a.hint}`).includes(term));
      list.innerHTML = filtered.map((a, i) => `
        <button class="infra-command-item" type="button" data-index="${i}">
          <i class="fa-solid ${a.icon}"></i>
          <span><strong>${escapeText(a.label)}</strong><small>${escapeText(a.hint)}</small></span>
        </button>
      `).join('') || '<div style="padding:1rem;color:#8a7497;font-size:.9rem">Nenhuma ação encontrada.</div>';
      list.querySelectorAll('[data-index]').forEach((btn, index) => {
        btn.addEventListener('click', () => filtered[index].run());
      });
    }

    function open() {
      overlay.classList.add('open');
      input.value = '';
      render();
      setTimeout(() => input.focus(), 40);
    }
    function close() { overlay.classList.remove('open'); }

    input.addEventListener('input', render);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    document.querySelectorAll('[data-open-command]').forEach(btn => btn.addEventListener('click', open));
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        open();
      }
      if (e.key === 'Escape') close();
    });
  }

  function installFileInputFeedback() {
    document.addEventListener('change', event => {
      const input = event.target;
      if (!input.matches('.attachment-file-input')) return;
      const item = input.closest('.attachment-item');
      if (item) item.classList.toggle('has-file-selected', !!input.files?.length);
      if (input.files?.[0]) showToast(`Arquivo selecionado: ${input.files[0].name}`, 'fa-paperclip', 2600);
    });
  }

  function normalize(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  function escapeText(value) {
    return String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }
})();
