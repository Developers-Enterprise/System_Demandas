/* ─────────────── DATA & SUPABASE INIT ─────────────── */
// Insira aqui as credenciais do NOVO banco Supabase (ou outro BaaS) da nova prefeitura
const SUPABASE_URL = 'SUA_NOVA_URL_AQUI';
const SUPABASE_ANON_KEY = 'SUA_NOVA_CHAVE_AQUI';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let editingDemandId = null;
let deletingDemandId = null; 
let demands = [];
let isPasswordRecovery = false;

/* ─────────────── MOTOR DE REGRAS OBRAS 4.0 — CATEGORIAS E ANEXOS ─────────────── */
const DOC_TYPES = {
  pdf: '.pdf,application/pdf',
  pdfDwg: '.pdf,.dwg,application/pdf,application/acad,application/x-acad,application/autocad_dwg,image/vnd.dwg',
  pdfDoc: '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  planilha: '.pdf,.xls,.xlsx,.csv,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv',
  imagemPdf: '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png'
};

const DFD_ETP_GROUPS = [
  {
    area: 'DFD/ETP',
    title: 'DFD — Engenharia/Arquitetura',
    desc: 'Documento de Formalização de Demanda em PDF, anexado pelo usuário técnico.',
    docs: [
      { id: 'dfd_pdf', label: 'DFD em PDF', accept: DOC_TYPES.pdf }
    ]
  },
  {
    area: 'DFD/ETP',
    title: 'ETP — Engenharia/Arquitetura',
    desc: 'Estudo Técnico Preliminar em PDF, anexado pelo usuário técnico.',
    docs: [
      { id: 'etp_pdf', label: 'ETP em PDF', accept: DOC_TYPES.pdf }
    ]
  }
];

function arqGroup(prefix = 'arq') {
  return {
    area: 'Arquitetura',
    title: 'Projeto Arquitetônico',
    desc: 'Todos os itens abaixo ficam na mesma seção de Arquitetura.',
    docs: [
      { id: `${prefix}_projeto_arquitetonico`, label: 'Projeto Arquitetônico', children: ['Cortes', 'Planta baixa', '3D'], accept: DOC_TYPES.pdfDwg },
      { id: `${prefix}_especificacoes_tecnicas`, label: 'Especificações técnicas', accept: DOC_TYPES.pdfDoc },
      { id: `${prefix}_memorial_descritivo`, label: 'Memorial descritivo', accept: DOC_TYPES.pdfDoc },
      { id: `${prefix}_rrt`, label: 'RRT/ART', accept: DOC_TYPES.pdf },
      { id: `${prefix}_relatorio_fotografico`, label: 'Relatório Fotográfico', accept: DOC_TYPES.imagemPdf }
    ]
  };
}

function engGroup(prefix, title, options = {}) {
  const docs = [
    { id: `${prefix}_pranchas`, label: 'Pranchas', children: ['PDF', 'DWG'], accept: DOC_TYPES.pdfDwg },
    { id: `${prefix}_art`, label: 'ART', accept: DOC_TYPES.pdf },
  ];
  if (options.quantitativos !== false) docs.push({ id: `${prefix}_quantitativos`, label: 'Quadro de Quantitativos de Materiais', accept: DOC_TYPES.planilha });
  docs.push(
    { id: `${prefix}_memorial_descritivo`, label: 'Memorial descritivo', accept: DOC_TYPES.pdfDoc },
    { id: `${prefix}_especificacoes_tecnicas`, label: 'Especificações técnicas', accept: DOC_TYPES.pdfDoc }
  );
  if (options.relatorioFotografico) docs.push({ id: `${prefix}_relatorio_fotografico`, label: 'Relatório Fotográfico', accept: DOC_TYPES.imagemPdf });
  if (options.licencaAmbiental) docs.push({ id: `${prefix}_licenca_ambiental`, label: 'Licença ambiental', accept: DOC_TYPES.pdf });
  return { area: 'Engenharia', title, desc: 'Itens anexados separadamente dentro da mesma seção técnica.', docs };
}

const ORCAMENTO_GROUP = {
  area: 'Engenharia',
  title: 'Orçamento',
  desc: 'Documentos orçamentários anexados por item.',
  docs: [
    { id: 'orc_planilha_orcamentaria', label: 'Planilha orçamentária', accept: DOC_TYPES.planilha },
    { id: 'orc_memoria_calculo', label: 'Memória de cálculo', accept: DOC_TYPES.pdfDoc },
    { id: 'orc_cronograma', label: 'Cronograma físico-financeiro', accept: DOC_TYPES.planilha },
    { id: 'orc_bdi', label: 'BDI', accept: DOC_TYPES.pdfDoc },
    { id: 'orc_composicoes', label: 'Composições com preços unitários', accept: DOC_TYPES.planilha },
    { id: 'orc_encargos_sociais', label: 'Encargos sociais', accept: DOC_TYPES.pdfDoc },
    { id: 'orc_curva_abc', label: 'Curva ABC', accept: DOC_TYPES.planilha }
  ]
};

// Grupo de Orçamento específico da Pavimentação — intencionalmente mais simples que ORCAMENTO_GROUP:
// aqui é um único slot para arquivos orçamentários em geral, sem quebrar em sub-itens.
const PAVIMENTACAO_ORCAMENTO_GROUP = {
  area: 'Engenharia',
  title: 'Orçamento',
  desc: 'Arquivos orçamentários da obra de pavimentação, anexados de forma geral.',
  docs: [
    { id: 'pavimentacao_orcamento_geral', label: 'Orçamento', accept: `${DOC_TYPES.planilha},${DOC_TYPES.pdfDoc}` }
  ]
};

// Grupo "Outros" da Pavimentação — slot livre para arquivos variados que a equipe usa (ou não).
const PAVIMENTACAO_OUTROS_GROUP = {
  area: 'Engenharia',
  title: 'Outros',
  desc: 'Arquivos variados que não se enquadram nas demais categorias.',
  docs: [
    { id: 'pavimentacao_outros', label: 'Outros documentos' } // sem "accept": aceita qualquer tipo de arquivo
  ]
};

const TR_GROUP = {
  area: 'Engenharia',
  title: 'Termo de Referência',
  desc: 'Termo de Referência em PDF.',
  docs: [{ id: 'tr_pdf', label: 'Termo de Referência', accept: DOC_TYPES.pdfDoc }]
};

const RISK_GROUP = {
  area: 'Engenharia',
  title: 'Matriz de Riscos',
  desc: 'Matriz de riscos do processo.',
  docs: [{ id: 'matriz_riscos_pdf', label: 'Matriz de Riscos', accept: DOC_TYPES.pdfDoc }]
};

const OBRAS_RULES = {
  'Proposta do Projeto': {
    label: 'Arquitetura — Apresentação da Proposta do Projeto',
    phase: 'Arquitetura',
    desc: 'Apresentação inicial da proposta de arquitetura, sem criar DFD e ETP automaticamente.',
    groups: [{
      area: 'Arquitetura',
      title: 'Apresentação da Proposta de Arquitetura',
      desc: 'Arquivo de apresentação da proposta do projeto arquitetônico.',
      docs: [
        { id: 'proposta_arquitetura_pdf', label: 'Apresentação da proposta de arquitetura', accept: DOC_TYPES.pdfDoc }
      ]
    }]
  },
  'Projeto de Ponte': {
    label: 'Engenharia — Projeto de Ponte',
    phase: 'Engenharia',
    desc: 'Pacote técnico de engenharia para projeto de ponte.',
    groups: [engGroup('ponte', 'Projeto de Ponte', { relatorioFotografico: true })]
  },
  'DFD': {
    label: 'DFD — Engenharia/Arquitetura',
    phase: 'DFD/ETP',
    desc: 'Documento de Formalização de Demanda.',
    groups: [DFD_ETP_GROUPS[0]]
  },
  'ETP': {
    label: 'ETP — Engenharia/Arquitetura',
    phase: 'DFD/ETP',
    desc: 'Estudo Técnico Preliminar.',
    groups: [DFD_ETP_GROUPS[1]]
  },
  'DFD/ETP': {
    label: 'DFD + ETP — Engenharia/Arquitetura',
    phase: 'DFD/ETP',
    desc: 'Categoria inicial do fluxo para anexação do DFD e do ETP.',
    groups: [...DFD_ETP_GROUPS]
  },
  'Arquitetônico': {
    label: 'Arquitetura — Projeto Arquitetônico',
    phase: 'Arquitetura',
    desc: 'Pacote arquitetônico completo, sem criar DFD e ETP automaticamente.',
    groups: [arqGroup('arq')]
  },
  'Estrutural': {
    label: 'Engenharia — Projeto Estrutural',
    phase: 'Engenharia',
    desc: 'Projeto estrutural com pranchas, ART, quantitativos, memorial e especificações.',
    groups: [engGroup('estrutural', 'Projeto Estrutural')]
  },
  'Elétrico': {
    label: 'Engenharia — Projeto Elétrico',
    phase: 'Engenharia',
    desc: 'Projeto elétrico com pranchas, ART, quantitativos, memorial e especificações.',
    groups: [engGroup('eletrico', 'Projeto Elétrico')]
  },
  'Hidrossanitário': {
    label: 'Engenharia — Projeto Hidrossanitário',
    phase: 'Engenharia',
    desc: 'Projeto hidrossanitário com pranchas, ART, quantitativos, memorial e especificações.',
    groups: [engGroup('hidrossanitario', 'Projeto Hidrossanitário')]
  },
  'Drenagem': {
    label: 'Engenharia — Projeto de Drenagem Pluvial',
    phase: 'Engenharia',
    desc: 'Drenagem pluvial com pranchas, ART, quantitativos, memorial e especificações.',
    groups: [engGroup('drenagem', 'Projeto de Drenagem Pluvial')]
  },
  'Pavimentação': {
    label: 'Pavimentação — Engenharia',
    phase: 'Engenharia',
    desc: 'Projeto de Pavimentação + Orçamento + Outros.',
    groups: [engGroup('pavimentacao', 'Projeto de Pavimentação', { quantitativos: false, relatorioFotografico: true }), PAVIMENTACAO_ORCAMENTO_GROUP, PAVIMENTACAO_OUTROS_GROUP]
  },
  'Passagem Molhada': {
    label: 'Engenharia — Projeto de Passagem Molhada',
    phase: 'Engenharia',
    desc: 'Passagem molhada com pranchas, ART, memorial, especificações e relatório fotográfico.',
    groups: [engGroup('passagem_molhada', 'Projeto de Passagem Molhada', { quantitativos: false, relatorioFotografico: true })]
  },
  'SPDA': {
    label: 'Engenharia — SPDA',
    phase: 'Engenharia',
    desc: 'SPDA com pranchas, ART, memorial e especificações.',
    groups: [engGroup('spda', 'SPDA', { quantitativos: false })]
  },
  'PCI': {
    label: 'Engenharia — PCI',
    phase: 'Engenharia',
    desc: 'PCI com pranchas, ART, memorial e especificações.',
    groups: [engGroup('pci', 'PCI', { quantitativos: false })]
  },
  'Orçamento': {
    label: 'Engenharia — Orçamento',
    phase: 'Orçamento',
    desc: 'Pacote orçamentário completo.',
    groups: [ORCAMENTO_GROUP]
  },
  'Termo de Referência': {
    label: 'Engenharia — Termo de Referência',
    phase: 'Termo/Riscos',
    desc: 'Termo de Referência.',
    groups: [TR_GROUP]
  },

  'Matriz de Riscos': {
    label: 'Engenharia — Matriz de Riscos',
    phase: 'Termo/Riscos',
    desc: 'Matriz de Riscos.',
    groups: [RISK_GROUP]
  },

  'SUDEMA': {
  label: 'SUDEMA — Licenciamento Ambiental',
  phase: 'Engenharia',
  desc: 'Itens de licenciamento ambiental exigidos pela SUDEMA.',
  groups: [
    {
      area: 'Engenharia',
      title: 'Licenciamento Ambiental — SUDEMA',
      desc: 'Anexe apenas a Licença Ambiental (SUDEMA).',
      docs: [
        {
          id: 'sudema_licenca_ambiental',
          label: 'Licença Ambiental (SUDEMA)',
          accept: DOC_TYPES.pdf
        }
      ]
    }
  ]
},

  'Revisão de Projetos': {
    label: 'Engenharia — Revisão de Projetos',
    phase: 'Engenharia',
    desc: 'Análise técnica, detalhada e independente de documentos, plantas e cálculos antes ou durante a execução da obra.',
    groups: []
  },

  
  'Obra Completa': {
    label: 'Obra Completa — Arquitetura + Engenharias + Orçamento',
    phase: 'Fluxo Completo',
    desc: 'Fluxo completo com DFD, ETP, arquitetura, engenharias, orçamento, termo e matriz de riscos.',
    groups: [
      ...DFD_ETP_GROUPS,
      arqGroup('obra_arq'),
      engGroup('obra_estrutural', 'Projeto Estrutural'),
      engGroup('obra_eletrico', 'Projeto Elétrico'),
      engGroup('obra_hidrossanitario', 'Projeto Hidrossanitário'),
      engGroup('obra_drenagem', 'Projeto de Drenagem Pluvial'),
      ORCAMENTO_GROUP,
      TR_GROUP,
      RISK_GROUP
    ]
  }
};

const statusMap = {
  'Triagem': 's-gray',
  'DFD/ETP': 's-blue',
  'Arquitetura': 's-purple',
  'Engenharia': 's-yellow',
  'Orçamento': 's-orange',
  'Termo/Riscos': 's-blue',
  'Licenciamento Ambiental': 's-purple',
  'Concluído': 's-green',
  'Pendente': 's-yellow',
  'Atrasado': 's-red',
  'Em Revisão': 's-blue',
  'Correção': 's-orange',
  'Aguardando': 's-purple',
};

const statusColors = {
  'Triagem': '#6b7280',
  'DFD/ETP': '#3b82f6',
  'Arquitetura': '#a855f7',
  'Engenharia': '#eab308',
  'Orçamento': '#f97316',
  'Termo/Riscos': '#3b82f6',
  'Licenciamento Ambiental': '#a855f7',
  'Concluído': '#22c55e',
  'Pendente': '#eab308',
  'Atrasado': '#ef4444',
  'Em Revisão': '#3b82f6',
  'Correção': '#f97316',
  'Aguardando': '#a855f7',
};

/* ─────────────── HELPERS ─────────────── */
const utils = {
  formatDate: (dateStr) => {
    if (!dateStr) return '';
    return dateStr.split('-').reverse().join('/');
  },
  getInitials: (name) => {
    if (!name) return '??';
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  },
  getDiffHours: (dateStr) => {
    if (!dateStr) return 0;
    return (new Date(dateStr) - new Date()) / (1000 * 60 * 60);
  }
};

// Formata strings/números dinamicamente no padrão monetário BRL (R$ 0.000,00).
// Preenchimento da direita para a esquerda (padrão de app bancário). Suporta de centavos a trilhões.

function formatCurrencyBRL(value) {
  // Remove qualquer caractere que não seja número puro
  let numericValue = String(value).replace(/\D/g, '');
  
  if (!numericValue) return '';

  // Divide por 100 para forçar o preenchimento a partir dos centavos
  numericValue = parseInt(numericValue, 10) / 100;

  // Delega a formatação para o motor de internacionalização nativo (Intl) do navegador
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(numericValue);
}

// Higieniza o valor formatado com "R$" limpando-o para float puro antes de enviar ao banco de dados.

const parseCurrencyToNumber = (val) => parseFloat(String(val).replace(/[^\d,]/g, '').replace(',', '.')) || 0;


function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function setText(id, value, fallback = '-') {
  const el = document.getElementById(id);
  if (el) el.textContent = value || fallback;
}

function getFieldValue(id) {
  return document.getElementById(id)?.value?.trim() || '';
}

function getDemandRule(esp) {
  return OBRAS_RULES[esp] || OBRAS_RULES['Arquitetônico'];
}

function getDemandMetadata(demand) {
  if (!demand) return {};
  if (demand.metadata && typeof demand.metadata === 'object') return demand.metadata;
  if (typeof demand.metadata === 'string') {
    try { return JSON.parse(demand.metadata); } catch (e) { return {}; }
  }
  return {};
}

function flattenDocs(ruleOrEsp) {
  const rule = typeof ruleOrEsp === 'string' ? getDemandRule(ruleOrEsp) : ruleOrEsp;
  return (rule.groups || []).flatMap(group => (group.docs || []).map(doc => ({ ...doc, groupTitle: group.title, area: group.area })));
}

function calculatePackageProgress(rule, demand = null) {
  const docs = flattenDocs(rule);
  const attachments = demand ? readDemandAttachments(demand) : {};
  const total = docs.length;
  const done = docs.filter(doc => attachments[doc.id]?.url).length;
  return { total, done, percent: total ? Math.round((done / total) * 100) : 0 };
}

function buildPackageHtml(esp, compact = false, demand = null) {
  const rule = getDemandRule(esp);
  const { total, done, percent } = calculatePackageProgress(rule, demand);
  return `
    <div class="package-head">
      <div>
        <div class="package-title">${escapeHtml(rule.label)}</div>
        <div class="package-desc">${escapeHtml(rule.desc)}</div>
      </div>
      <span class="status-badge s-blue">${demand ? `${done}/${total} anexados` : `${total} itens`}</span>
    </div>
    <div class="package-groups ${compact ? 'compact' : ''}">
      ${(rule.groups || []).map(group => `
        <div class="package-group-card ${group.area === 'DFD/ETP' ? 'is-priority-section' : ''}">
          <div class="package-group-title"><span class="esp-tag">${escapeHtml(group.area)}</span>${group.area === 'DFD/ETP' ? '<span class="priority-pill">Início do fluxo</span>' : ''} ${escapeHtml(group.title)}</div>
          ${group.desc ? `<div class="package-group-desc">${escapeHtml(group.desc)}</div>` : ''}
          <ul class="package-doc-list">
            ${(group.docs || []).map(doc => `<li><i class="fa-regular fa-square-check"></i><span>${escapeHtml(doc.label || doc)}${doc.children ? `<small>${doc.children.map(escapeHtml).join(' · ')}</small>` : ''}</span></li>`).join('')}
          </ul>
        </div>
      `).join('')}
    </div>
    ${demand ? `<div class="progress-mini"><div style="width:${percent}%"></div></div>` : ''}
  `;
}

function findDocDefinition(esp, docId) {
  return flattenDocs(esp).find(doc => doc.id === docId) || null;
}

function readDemandAttachments(demand) {
  const md = getDemandMetadata(demand);
  const raw = demand?.anexos || md.anexos || {};
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch (e) { return {}; }
  }
  return raw && typeof raw === 'object' ? raw : {};
}

function getDemandResponsaveis(demand) {
  const md = getDemandMetadata(demand);
  const raw = demand?.responsaveis || md.responsaveis || [];
  if (Array.isArray(raw) && raw.length) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch(e) {}
  }
  if (demand?.resp_id || demand?.resp) {
    return [{ id: demand.resp_id, name: demand.resp, label: demand.resp }].filter(r => r.id || r.name);
  }
  return [];
}

function isAssignedToDemand(demand, userId = currentUser?.id) {
  if (!demand || !userId) return false;
  if (demand.resp_id === userId) return true;
  return getDemandResponsaveis(demand).some(r => r.id === userId || r.user_id === userId);
}

function canCurrentUserUpload(demand) {
  return currentUser?.role === 'colab' && isAssignedToDemand(demand);
}

function getResponsibleDisplay(demand) {
  const people = getDemandResponsaveis(demand);
  if (!people.length) return demand?.resp || 'Sem responsável';
  return people.map(p => p.label || p.name || p.email || 'Técnico').join(', ');
}

function renderResponsibleChips(demand) {
  const people = getDemandResponsaveis(demand);
  if (!people.length) return `<span class="responsible-chip">${escapeHtml(demand?.resp || 'Sem responsável')}</span>`;
  return people.map(p => `<span class="responsible-chip"><i class="fa-solid fa-user-hard-hat"></i>${escapeHtml(p.label || p.name || 'Técnico')}</span>`).join('');
}

function getSelectedResponsaveis() {
  const select = document.getElementById('new-demand-resp');
  if (!select) return [];
  return Array.from(select.selectedOptions || [])
    .filter(opt => opt.value)
    .map(opt => ({
      id: opt.value,
      name: opt.dataset.name || opt.textContent.replace(/^(Eng\.|Arq\.)\s+/g, '').trim(),
      prof_type: opt.dataset.profType || '',
      label: opt.textContent.trim()
    }));
}

function buildAttachmentManager(demand) {
  const rule = getDemandRule(demand.esp);
  const attachments = readDemandAttachments(demand);
  const canUpload = canCurrentUserUpload(demand);
  const summary = calculatePackageProgress(rule, demand);
  const intro = currentUser?.role === 'admin'
    ? 'Acompanhamento dos documentos anexados pelos responsáveis técnicos.'
    : (canUpload ? 'Envie o arquivo correspondente a cada item da categoria.' : 'Consulta dos anexos desta demanda.');

  return `
    <div class="attachment-summary">
      <div>
        <strong>${summary.done}/${summary.total}</strong> itens anexados
        <span>${escapeHtml(intro)}</span>
      </div>
      <div class="attachment-progress"><div style="width:${summary.percent}%"></div></div>
    </div>
    <div class="attachment-section-list">
      ${(rule.groups || []).map(group => `
        <div class="attachment-section-card ${group.area === 'DFD/ETP' ? 'is-priority-section' : ''}">
          <div class="attachment-section-head">
            <div>
              <div class="attachment-head-row"><span class="esp-tag">${escapeHtml(group.area)}</span>${group.area === 'DFD/ETP' ? '<span class="priority-pill">Início do fluxo</span>' : ''}</div>
              <h4>${escapeHtml(group.title)}</h4>
              ${group.desc ? `<p>${escapeHtml(group.desc)}</p>` : ''}
            </div>
            <span class="status-badge s-gray">${(group.docs || []).length} item(ns)</span>
          </div>
          <div class="attachment-items">
            ${(group.docs || []).map(doc => {
              const item = attachments[doc.id] || {};
              const hasFile = !!item.url;
              return `
                <div class="attachment-item ${hasFile ? 'is-done' : ''}">
                  <div class="attachment-item-info">
                    <div class="attachment-item-title">
                      <i class="fa-solid ${hasFile ? 'fa-circle-check' : 'fa-circle'}"></i>
                      ${escapeHtml(doc.label)}
                    </div>
                    ${doc.children ? `<div class="attachment-subitems">${doc.children.map(c => `<span>${escapeHtml(c)}</span>`).join('')}</div>` : ''}
                    ${hasFile ? `
                      <div class="attachment-file-info">
                        <a href="${escapeHtml(item.url)}" target="_blank"><i class="fa-solid fa-arrow-up-right-from-square"></i> ${escapeHtml(item.fileName || 'Abrir anexo')}</a>
                        <small>${escapeHtml(item.uploadedBy || 'Usuário')} • ${item.uploadedAt ? new Date(item.uploadedAt).toLocaleDateString('pt-BR') : ''}</small>
                      </div>` : `<div class="attachment-file-info muted">Nenhum arquivo anexado ainda.</div>`}
                  </div>
                  ${canUpload ? `
                    <div class="attachment-actions">
                      <input type="file" id="file-${doc.id}" class="form-input attachment-file-input" accept="${escapeHtml(doc.accept || '')}">
                      <input type="url" id="link-${doc.id}" class="form-input attachment-link-input" placeholder="ou cole um link externo...">
                      <button class="btn btn-primary btn-sm" onclick="saveDemandAttachment(${demand.id}, '${doc.id}')"><i class="fa-solid fa-upload"></i> Salvar</button>
                    </div>` : ''}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderNewDemandPackagePreview() {
  const select = document.getElementById('new-demand-esp');
  const preview = document.getElementById('new-demand-package-preview');
  if (!select || !preview) return;
  if (!select.value) {
    preview.innerHTML = '<div class="package-empty"><i class="fa-solid fa-layer-group"></i> Selecione o tipo de demanda para visualizar automaticamente o pacote de entregáveis exigido.</div>';
    return;
  }
  preview.innerHTML = buildPackageHtml(select.value);
  const statusSelect = document.getElementById('new-demand-status');
  const rule = getDemandRule(select.value);
  if (statusSelect) {
    if (rule.phase === 'Arquitetura + Engenharia' || rule.phase === 'Fluxo Completo') statusSelect.value = 'Arquitetura';
    else if (['DFD/ETP', 'Arquitetura', 'Engenharia', 'Orçamento', 'Termo/Riscos'].includes(rule.phase)) statusSelect.value = rule.phase;
  }
}

function buildMetadataFromForm() {
  const responsaveis = getSelectedResponsaveis();
  return {
    prioridade: getFieldValue('new-demand-prioridade') || 'Normal',
    processo: getFieldValue('new-demand-processo'),
    vistoria: getFieldValue('new-demand-vistoria'),
    alteracaoEstrutural: !!document.getElementById('new-demand-structural-change')?.checked,
    termoReferencia: getFieldValue('new-tr-resumo'),
    matrizRiscos: getFieldValue('new-risk-resumo'),
    pacoteLabel: getDemandRule(getFieldValue('new-demand-esp')).label,
    responsaveis,
    anexos: {},
    createdClientAt: new Date().toISOString()
  };
}

function extendedColumnsFromMetadata(metadata) {
  return {
    metadata,
    prioridade: metadata.prioridade || 'Normal',
    processo_numero: metadata.processo || '',
    termo_referencia: metadata.termoReferencia || '',
    matriz_riscos: metadata.matrizRiscos || '',
    alteracao_estrutural: !!metadata.alteracaoEstrutural,
    responsaveis: metadata.responsaveis || [],
    anexos: metadata.anexos || {}
  };
}

function readDemandExtended(demand, key, fallback = '') {
  const md = getDemandMetadata(demand);
  const map = {
    prioridade: demand.prioridade || md.prioridade,
    processo: demand.processo_numero || md.processo,
    termoReferencia: demand.termo_referencia || md.termoReferencia,
    matrizRiscos: demand.matriz_riscos || md.matrizRiscos,
    alteracaoEstrutural: demand.alteracao_estrutural ?? md.alteracaoEstrutural,
    responsaveis: demand.responsaveis || md.responsaveis,
    anexos: demand.anexos || md.anexos,
    vistoria: md.vistoria
  };
  return map[key] ?? fallback;
}

const DEMAND_OPTIONAL_COLUMNS = [
  'metadata',
  'prioridade',
  'processo_numero',
  'termo_referencia',
  'matriz_riscos',
  'alteracao_estrutural',
  'responsaveis',
  'anexos',
  // Campos antigos que podem existir em versões anteriores, mas NÃO são usados na v4.
  'dfd_demandante',
  'dfd_justificativa',
  'dfd_local',
  'dfd_prazo_est',
  'dfd_recursos',
  'etp_necessidade',
  'etp_mercado',
  'etp_requisitos',
  'etp_custo',
  'etp_riscos',
  'etp_conclusao'
];

function appendFallbackExtras(obs, extras) {
  if (!extras || Object.keys(extras).length === 0) return obs || '';
  return `${obs || ''}

[DADOS COMPLEMENTARES]
O banco ainda não possui todas as colunas novas. Execute o arquivo atualizacao_supabase.sql.
${JSON.stringify(extras, null, 2)}`.trim();
}

async function insertDemandWithFallback(payload) {
  const { data, error } = await _supabase.from('demands').insert([payload]).select();
  if (!error) return { data, error };

  const msg = String(error.message || '').toLowerCase();
  const isSchemaError = msg.includes('column') || msg.includes('schema cache') || msg.includes('could not find');
  if (!isSchemaError) return { data, error };

  const basePayload = { ...payload };
  const extras = {};

  DEMAND_OPTIONAL_COLUMNS.forEach(column => {
    if (Object.prototype.hasOwnProperty.call(basePayload, column)) {
      extras[column] = basePayload[column];
      delete basePayload[column];
    }
  });

  basePayload.obs = appendFallbackExtras(basePayload.obs, extras);
  return await _supabase.from('demands').insert([basePayload]).select();
}

function getDeadlineClass(dateStr, status) {
  if (!dateStr) return { cls: 'ok', label: 'Sem prazo' };
  const label = utils.formatDate(dateStr);
  if (status === 'Concluído') return { cls: 'ok', label };
  
  const diff = utils.getDiffHours(dateStr);
  if (diff < 0) return { cls: 'overdue', label, extra: '⚠' };
  if (diff <= 72) return { cls: 'due-soon', label, extra: '⏱ 72h' };
  
  return { cls: 'ok', label };
}

/* ─────────────── CORE DATA FETCHING ─────────────── */
async function fetchDemands() {
  const { data, error } = await _supabase
    .from('demands')
    .select('*')
    .order('id', { ascending: false });

  if (error) {
    console.error('Erro ao buscar demandas:', error.message);
    return [];
  }
  demands = data || [];
  return demands;
}

async function loadTeamMembersLegacy() {
  const { data, error } = await _supabase
    .from('profiles')
    .select('id, name, prof_type, role')
    .order('name');

  if (error) {
    console.error('Erro ao carregar equipe técnica:', error.message);
    return;
  }

  const selectResp = document.getElementById('new-demand-resp');
  if (!selectResp) return;

  selectResp.innerHTML = '';

  (data || []).forEach(user => {
    if (user.role === 'colab') {
      const opt = document.createElement('option');
      opt.value = user.id;
      opt.dataset.name = user.name;
      opt.dataset.profType = user.prof_type || '';
      const prefix = user.prof_type === 'Arquitetura' ? 'Arq.' : 'Eng.';
      opt.textContent = `${prefix} ${user.name}`;
      selectResp.appendChild(opt);
    }
  });
}

/* ─────────────── RENDER FUNCTIONS ─────────────── */
function renderTable(data) {
  // Filtro de segurança por UUID
  const displayData = currentUser.role === 'admin' ? data : data.filter(d => isAssignedToDemand(d));

  const tbody = document.getElementById('table-body');
  if (!tbody) return;
  tbody.innerHTML = '';
  
  displayData.forEach(d => {
    const dl = getDeadlineClass(d.prazo, d.status);
    const urgent = dl.cls === 'overdue' || dl.cls === 'due-soon';
    const tr = document.createElement('tr');
    if (urgent) tr.className = 'urgent-row row-urgent-glow';
    
    tr.innerHTML = `
      <td>
        <div class="td-title" onclick="openDemandDetail(${d.id})">${d.title}</div>
        ${dl.extra ? `<div class="urgent-badge"><i class="fa-solid fa-triangle-exclamation"></i> ${dl.cls==='overdue'?'Prazo vencido':'Vence em 72h'}</div>` : ''}
      </td>
      <td><span class="esp-tag">${d.esp}</span></td>
      <td class="td-muted" style="font-size:0.78rem">${escapeHtml(getResponsibleDisplay(d))}</td>
      <td><span class="kcard-deadline ${dl.cls}">${dl.label}</span></td>
      <td><span class="status-badge ${statusMap[d.status] || 's-gray'}">${d.status}</span></td>
      <td><a href="${d.drive || '#'}" target="_blank" style="color:var(--accent);font-size:0.78rem;text-decoration:none"><i class="fa-brands fa-google-drive" style="color:#4285f4;margin-right:3px"></i>Abrir</a></td>
      <td>
        <div style="display:flex;gap:4px">
          <button class="btn btn-ghost btn-sm" onclick="openDemandDetail(${d.id})"><i class="fa-solid fa-eye"></i></button>
          ${currentUser.role === 'admin' ? `<button class="btn btn-ghost btn-sm" onclick="openStatusModal(${d.id})"><i class="fa-solid fa-pen"></i></button>` : ''}
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function filterTable() {
  const searchInput = document.getElementById('search-all');
  const statusSelect = document.getElementById('filter-status');
  const espSelect = document.getElementById('filter-esp');
  
  const search = searchInput ? searchInput.value.toLowerCase() : '';
  const status = statusSelect ? statusSelect.value : '';
  const esp = espSelect ? espSelect.value : '';
  
  if (demands.length === 0) await fetchDemands();
  
  const filtered = demands.filter(d => {
    const matchSearch = !search || d.title.toLowerCase().includes(search) || getResponsibleDisplay(d).toLowerCase().includes(search);
    const matchStatus = !status || d.status === status || d.status.includes(status.replace('Aguardando Terceiros','Aguardando'));
    const matchEsp = !esp || (d.esp && d.esp.includes(esp));
    return matchSearch && matchStatus && matchEsp;
  });
  renderTable(filtered); // Renderiza a tabela com os dados filtrados

  // Atualiza a contagem de registros no cabeçalho da seção
  const sectionCountEl = document.getElementById('admin-demand-count');
  if (sectionCountEl) sectionCountEl.textContent = `${filtered.length} registros`;

  renderAdminDashboardStats(); // Atualiza os cards de estatísticas
}

async function renderWorkProgress() {
  const container = document.getElementById('progress-container');
  if (!container) return;
  container.innerHTML = '';
  
  if (demands.length === 0) await fetchDemands();

  demands.forEach(d => {
    const rule = getDemandRule(d.esp);
    const hasArquitetura = (rule.groups || []).some(g => g.area === 'Arquitetura');
    const hasOrcamento = (rule.groups || []).some(g => g.title?.includes('Orçamento'));
    const steps = [
      { label: 'Triagem', status: ['Triagem'] },
      { label: 'DFD/ETP', status: ['DFD/ETP'] },
      ...(hasArquitetura ? [{ label: 'Arquitetura', status: ['Arquitetura'] }] : []),
      { label: 'Engenharia', status: ['Engenharia', 'Pendente', 'Atrasado'] },
      ...(hasOrcamento ? [{ label: 'Orçamento', status: ['Orçamento'] }] : []),
      { label: 'TR/Riscos', status: ['Termo/Riscos', 'Em Revisão', 'Correção', 'Aguardando'] },
      { label: 'Finalizado', status: ['Concluído'] }
    ];

    let currentIdx = steps.findIndex(step => step.status.includes(d.status));
    if (currentIdx === -1) currentIdx = Math.min(2, steps.length - 1);
    if (d.status === 'Atrasado') currentIdx = Math.max(1, currentIdx);

    const docTotal = calculatePackageProgress(rule).total;
    const card = document.createElement('div');
    card.className = 'progress-item-card';
    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:1rem;">
        <div>
          <h4 style="font-size:0.9rem; margin-bottom:4px; cursor:pointer;" onclick="openDemandDetail(${d.id})">${escapeHtml(d.title)}</h4>
          <span class="esp-tag">${escapeHtml(rule.phase)}</span> • <span style="font-size:0.75rem; color:var(--text3)">${escapeHtml(getResponsibleDisplay(d))}</span>
          <div style="font-size:0.72rem;color:var(--text3);margin-top:5px">${docTotal} entregáveis previstos no pacote técnico.</div>
        </div>
        <span class="status-badge ${statusMap[d.status] || 's-gray'}">${escapeHtml(d.status)}</span>
      </div>
      <div class="stepper">
        ${steps.map((s, idx) => {
          let state = '';
          if (idx < currentIdx) state = 'completed';
          else if (idx === currentIdx) state = 'active';
          let icon = idx < currentIdx ? '<i class="fa-solid fa-check"></i>' : (idx + 1);
          if (d.status === 'Atrasado' && idx === currentIdx) icon = '<i class="fa-solid fa-clock"></i>';
          return `
            <div class="step ${state}">
              <div class="step-dot">${icon}</div>
              <div class="step-label">${escapeHtml(s.label)}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
    container.appendChild(card);
  });
}

async function renderKanban() {
  const board = document.getElementById('kanban-board');
  if(!board) return;
  const cols = ['Triagem','DFD/ETP','Arquitetura','Engenharia','Orçamento','Termo/Riscos','Correção','Aguardando','Concluído','Atrasado'];
  const colLabels = {'Triagem':'Triagem Técnica','DFD/ETP':'DFD/ETP','Arquitetura':'Arquitetura','Engenharia':'Engenharia','Orçamento':'Orçamento','Termo/Riscos':'Termo/Riscos','Correção':'Correção','Aguardando':'Aguardando Terceiros','Concluído':'Concluído','Atrasado':'Atrasado'};
  board.innerHTML = '';

  if (demands.length === 0) await fetchDemands();

  cols.forEach(col => {
    const items = demands.filter(d => d.status === col);
    const color = statusColors[col];
    const div = document.createElement('div');
    div.className = 'kanban-col';
    div.innerHTML = `
      <div class="kanban-col-header">
        <div class="kanban-col-dot" style="background:${color}"></div>
        <div class="kanban-col-title">${colLabels[col]}</div>
        <div class="kanban-col-count">${items.length}</div>
      </div>
      <div class="kanban-cards">
        ${items.length === 0 ? '<div style="text-align:center;padding:1rem;color:var(--text3);font-size:0.75rem">Nenhuma demanda</div>' : ''}
        ${items.map(d => {
          const dl = getDeadlineClass(d.prazo, d.status);
          return `<div class="kcard" onclick="openDemandDetail(${d.id})">
            <div class="kcard-title">${d.title}</div>
            <span class="esp-tag">${d.esp}</span>
            <div class="kcard-meta">
              <span class="kcard-person"><i class="fa-solid fa-user" style="margin-right:3px;opacity:0.5"></i>${escapeHtml(getResponsibleDisplay(d).split(',')[0].split(' ').slice(-1)[0])}</span>
              <span class="kcard-deadline ${dl.cls}" style="margin-left:auto"><i class="fa-regular fa-calendar" style="margin-right:3px"></i>${dl.label}</span>
            </div>
          </div>`;
        }).join('')}
      </div>
    `;
    board.appendChild(div);
  });
}

function renderAdminDashboardStats() {
  // Se não houver demandas na memória, não faz nada (evita erros)
  if (!demands) return;

  // 1. Cálculos Estatísticos
  const totalAtivas = demands.filter(d => d.status !== 'Concluído').length;
  const atrasadas = demands.filter(d => d.status === 'Atrasado').length;
  const pendentes = demands.filter(d => !['Concluído','Atrasado','Aguardando'].includes(d.status)).length;
  const concluidas = demands.filter(d => d.status === 'Concluído').length;
  const aguardando = demands.filter(d => d.status === 'Aguardando').length;

  // Identifica quais estão vencendo em 72h usando a nossa função getDeadlineClass
  const demandas72h = demands.filter(d => getDeadlineClass(d.prazo, d.status).cls === 'due-soon');
  
  // 2. Atualiza os Cards do HTML
  const elTotal = document.getElementById('stat-total');
  if(elTotal) elTotal.textContent = totalAtivas;
  
  const elAtrasadas = document.getElementById('stat-atrasadas');
  if(elAtrasadas) elAtrasadas.textContent = atrasadas;
  
  const elPendentes = document.getElementById('stat-pendentes');
  if(elPendentes) elPendentes.textContent = pendentes;
  
  const elConcluidas = document.getElementById('stat-concluidas');
  if(elConcluidas) elConcluidas.textContent = concluidas;
  
  const el72h = document.getElementById('stat-72h');
  if(el72h) el72h.textContent = demandas72h.length;
  
  const elAguardando = document.getElementById('stat-aguardando');
  if(elAguardando) elAguardando.textContent = aguardando;

  // 3. Atualiza o Banner de Alerta Dinâmico
  const banner = document.getElementById('admin-alert-banner');
  const content = document.getElementById('admin-alert-content');

  if (banner && content) {
    if (demandas72h.length > 0) {
      banner.style.display = 'flex';
      
      // Monta os "chips" (botões pequenos) com os nomes reais das demandas
      const chipsHtml = demandas72h.map(d => 
        `<span class="alert-chip" onclick="openDemandDetail(${d.id})">${d.esp} — ${d.title}</span>`
      ).join('');

      content.innerHTML = `
        <strong>⚡ Regra dos 3 Dias — ${demandas72h.length} demanda(s) crítica(s)</strong> vencem nas próximas 72 horas.
        <div class="alert-chips">
          ${chipsHtml}
        </div>
      `;
    } else {
      banner.style.display = 'none'; // Esconde se estiver tudo tranquilo
    }
  }
}

/* ─────────────── COLAB DASHBOARD ─────────────── */
async function renderColabDashboard() {
  if (demands.length === 0) await fetchDemands();
  
  const userDemands = demands.filter(d => isAssignedToDemand(d));
  
  const elAvatar = document.getElementById('colab-header-avatar');
  const elName = document.getElementById('colab-header-name');
  const elCount = document.getElementById('colab-demand-count');
  
  if(elAvatar) elAvatar.textContent = currentUser.initial;
  if(elName) elName.textContent = currentUser.name;
  if(elCount) elCount.textContent = `${userDemands.length} registros`;

  const atrasadas = userDemands.filter(d => d.status === 'Atrasado').length;
  const pendentes = userDemands.filter(d => !['Concluído', 'Atrasado'].includes(d.status)).length;
  const concluidas = userDemands.filter(d => d.status === 'Concluído').length;
  const criticas72h = userDemands.filter(d => getDeadlineClass(d.prazo, d.status).cls === 'due-soon').length;

  const stAtrasadas = document.getElementById('colab-stat-atrasadas');
  const stPendentes = document.getElementById('colab-stat-pendentes');
  const stConcluidas = document.getElementById('colab-stat-concluidas');
  
  if(stAtrasadas) stAtrasadas.textContent = atrasadas;
  if(stPendentes) stPendentes.textContent = pendentes;
  if(stConcluidas) stConcluidas.textContent = concluidas;

  const alertBanner = document.getElementById('colab-alert-banner');
  if (alertBanner) {
    if (atrasadas > 0 || criticas72h > 0) {
      alertBanner.style.display = 'flex';
      document.getElementById('colab-alert-text').innerHTML = `
        <strong>Atenção!</strong> Você possui <strong>${atrasadas} demanda(s) atrasada(s)</strong> e <strong>${criticas72h} vencendo em 72h</strong>.
      `;
    } else {
      alertBanner.style.display = 'none';
    }
  }

  renderColabTable(userDemands);
}

function renderColabTable(data) {
  const tbody = document.getElementById('colab-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  data.forEach(d => {
    const dl = getDeadlineClass(d.prazo, d.status);
    const tr = document.createElement('tr');
    if (dl.cls === 'overdue' || dl.cls === 'due-soon') tr.className = 'urgent-row row-urgent-glow';

    tr.innerHTML = `
      <td>
        <div class="td-title" onclick="openDemandDetail(${d.id})">${d.title}</div>
        ${dl.extra ? `<div class="urgent-badge">${dl.cls==='overdue'?'<i class="fa-solid fa-triangle-exclamation"></i> ATRASADO':'<i class="fa-solid fa-clock"></i> Vence em 72h'}</div>` : ''}
      </td>
      <td><span class="esp-tag">${d.esp}</span></td>
      <td class="kcard-deadline ${dl.cls}">${dl.label}</td>
      <td><span class="status-badge ${statusMap[d.status]}">${d.status}</span></td>
      <td><a href="${d.drive}" target="_blank" style="color:var(--accent);font-size:0.8rem;text-decoration:none"><i class="fa-brands fa-google-drive" style="color:#4285f4;margin-right:3px"></i>Abrir pasta</a></td>
      <td>
        <button class="btn btn-ghost btn-sm" onclick="openStatusModal(${d.id})"><i class="fa-solid fa-pen"></i> Status</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

/* ─────────────── SCREEN ROUTING ─────────────── */

function voltarTelaAnterior() {
  // Se o usuário entrou pelos detalhes de uma Obra específica, volta para a Obra
  if (typeof currentWorkId !== 'undefined' && currentWorkId) {
    openWorkDetail(currentWorkId);
  } 
  // Se for um colaborador avulso, volta para o painel dele
  else if (currentUser?.role === 'colab') {
    showScreen('colab-dashboard'); 
  } 
  // Se for admin, volta para o painel geral de obras
  else {
    showScreen('works-dashboard');
  }
}

const screenTitles = {
  'admin-dashboard': ['Dashboard', 'Visão Geral da Gestão'],
  'admin-kanban': ['Kanban', 'Visualização por Colunas'],
  'create-demand': ['Nova Demanda', 'DFD, ETP e Pacote Técnico'],
  'admin-team': ['Equipe Técnica', 'Supervisão de Profissionais'],
  'work-progress': ['Fluxo Técnico', 'DFD · ETP · Projetos · Orçamento'],
  'demand-detail': ['Detalhe do Projeto', 'Visualização Técnica'],
  'colab-dashboard': ['Minhas Demandas', 'Visão do Técnico'],
};

async function showScreen(name, navItem) {
  const adminScreens = ['admin-dashboard', 'admin-kanban', 'work-progress', 'create-demand', 'admin-team'];
  if (currentUser.role !== 'admin' && adminScreens.includes(name)) {
    alert("Acesso restrito a administradores.");
    return;
  }

  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById('screen-' + name);
  if (target) target.classList.add('active');
  
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (navItem) navItem.classList.add('active');

  const titles = screenTitles[name] || [name, ''];
  const titleEl = document.getElementById('topbar-title');
  if(titleEl) titleEl.innerHTML = titles[0] + ' <span id="topbar-sub">' + titles[1] + '</span>';
  
  await fetchDemands();
  
  if (name === 'admin-dashboard') filterTable(); 
  if (name === 'admin-kanban') renderKanban();
  if (name === 'work-progress') renderWorkProgress();
  if (name === 'colab-dashboard') renderColabDashboard();
  if (name === 'admin-team') renderTeamScreen();
  
  const notifPanel = document.getElementById('notif-panel');
  if(notifPanel) notifPanel.classList.remove('open');
}

async function openDemandDetail(id) {

  editingDemandId = id;

  // 1. Verifica se já temos as demandas na memória. Se não, busca no banco.
  if (demands.length === 0) await fetchDemands();
  
  // 2. Encontra a demanda exata em que o usuário clicou usando o ID
  const demand = demands.find(d => d.id === id);
  if (!demand) return;

  // 3. Regra de Segurança: Trava o acesso se o colaborador tentar ver uma obra que não é dele
  if (currentUser.role !== 'admin' && !isAssignedToDemand(demand)) {
    alert("Você não tem permissão para ver detalhes deste projeto.");
    return;
  }

  // ==========================================
  // INJETANDO OS DADOS NA TELA (O Mapeamento)
  // ==========================================

  // Dados Básicos da Demanda
  document.getElementById('detail-title').textContent = demand.title;
  document.getElementById('detail-esp').textContent = getDemandRule(demand.esp).label || demand.esp;
  setText('detail-prioridade', readDemandExtended(demand, 'prioridade', 'Normal'));
  setText('detail-processo', readDemandExtended(demand, 'processo', '-'));
  document.getElementById('detail-resp-name').innerHTML = renderResponsibleChips(demand);
  document.getElementById('detail-resp-initial').textContent = utils.getInitials(getResponsibleDisplay(demand));
  // Atualiza o prazo atual dinamicamente com cores e ícones
  const dl = getDeadlineClass(demand.prazo, demand.status);
  const prazoAtualEl = document.getElementById('detail-prazo-atual');
  if (prazoAtualEl) {
    prazoAtualEl.innerHTML = `${dl.extra ? `<i class="fa-solid fa-circle-exclamation" style="margin-right:4px"></i>` : ''}${dl.label}`;
    prazoAtualEl.style.color = dl.cls === 'overdue' ? 'var(--status-red)' : (dl.cls === 'due-soon' ? 'var(--status-yellow)' : 'var(--text1)');
  }
  
  // Prazo Original Real
  const prazoOriginalEl = document.getElementById('detail-prazo-original');
  if (prazoOriginalEl) prazoOriginalEl.textContent = utils.formatDate(demand.prazo);

  // Observações Reais
  const obsEl = document.getElementById('detail-obs');
  if (obsEl) obsEl.textContent = demand.obs || "Nenhuma observação registrada.";

  // Quem criou? (Consulta Dinâmica)
  let creatorName = "Sistema";
  // O demand.created_by guarda apenas o UUID (ex: 81e5-431a...). 
  // Precisamos de ir rapidamente à tabela de perfis perguntar de quem é este UUID.
  if (demand.created_by) {
    const { data: adminProfile } = await _supabase
      .from('profiles')
      .select('name')
      .eq('id', demand.created_by)
      .single();

    if (adminProfile) creatorName = adminProfile.name;
  }

  // Formata a data de criação padrão americana (YYYY-MM-DD) para o padrão brasileiro
  const dataCriacao = new Date(demand.created_at).toLocaleDateString('pt-BR');
  
  // Junta a Data e o Nome do Administrador (Ex: 09/06/2026 — por Eng. Arielle Arruda)
  const createdInfoEl = document.getElementById('detail-created-info');
  if (createdInfoEl) createdInfoEl.textContent = `${dataCriacao} — por ${creatorName}`;

  // ==========================================
  // ATUALIZAÇÃO DOS LINKS E BOTÕES.
  // ==========================================
  const driveLink = document.getElementById('detail-drive-link');
  if (driveLink) driveLink.href = demand.drive || '#';

  const statusBadge = document.getElementById('detail-status-badge');
  if (statusBadge) {
    statusBadge.className = `status-badge ${statusMap[demand.status] || 's-gray'}`;
    statusBadge.textContent = demand.status;
  }

  // Prepara os botões de ação para alterar o status ou excluir ESTA demanda específica.
  const btnStatus = document.getElementById('detail-status-btn');
  const btnDelete = document.getElementById('detail-delete-btn');
  if (btnStatus) { btnStatus.onclick = () => openStatusModal(id); btnStatus.style.display = currentUser.role === 'admin' ? 'inline-flex' : 'none'; }
  if (btnDelete) { btnDelete.onclick = () => openDeleteModal(id); btnDelete.style.display = currentUser.role === 'admin' ? 'inline-flex' : 'none'; }
  const structuralBtn = document.getElementById('detail-structural-btn');
  if (structuralBtn) structuralBtn.style.display = currentUser.role === 'admin' ? 'inline-flex' : 'none';

  // Botão da ZIPAGEM
  
  const btnZip = document.getElementById('detail-zip-btn');
if (btnZip) {
    btnZip.style.display = isAdminRole() ? 'inline-flex' : 'none';
    btnZip.onclick = () => baixarTodosAnexosEmZip(id);
}

  // ==========================================
  // MOTOR DE DEPENDÊNCIAS OBRAS 2.0
  // ==========================================
  const attachmentsContainer = document.getElementById('detail-attachments-container');
  const alertEstrutural = document.getElementById('structural-alert');
  
  if (attachmentsContainer) {
    attachmentsContainer.innerHTML = buildAttachmentManager(demand);
    const structuralReturn = readDemandExtended(demand, 'alteracaoEstrutural', false) || demand.status === 'Correção' || demand.status === 'Arquitetura';
    if (alertEstrutural) alertEstrutural.style.display = structuralReturn ? 'flex' : 'none';
  }

  // Carrega o histórico real e alertas
  loadDemandHistory(id);
  loadDemandAlerts(demand);

  // Por fim, muda para a tela de detalhes
  showScreen('demand-detail');
}

/* ─────────────── GESTÃO DE EQUIPE (V2.0) ─────────────── */
async function renderTeamScreen() {
  const { data: profiles, error } = await _supabase
    .from('profiles')
    .select('id, name, prof_type, role, initial')
    .eq('role', 'colab')
    .order('name');

  if (error) {
    console.error("Erro ao carregar equipe:", error.message);
    return;
  }

  if (demands.length === 0) await fetchDemands();

  const gridEng = document.getElementById('team-grid-eng');
  const gridArq = document.getElementById('team-grid-arq');
  if (!gridEng || !gridArq) return;

  gridEng.innerHTML = ''; 
  gridArq.innerHTML = '';

  profiles.forEach(user => {
    // Calcula estatísticas reais deste usuário
    const userDemands = demands.filter(d => isAssignedToDemand(d, user.id));
    const ativas = userDemands.filter(d => d.status !== 'Concluído').length;
    const atrasadas = userDemands.filter(d => d.status === 'Atrasado').length;

    // Constrói o Card interativo
    const card = document.createElement('div');
    card.className = 'stat-card';
    card.style.cursor = 'pointer';
    card.style.borderTop = '3px solid var(--accent)';
    card.onclick = () => filterByUser(user.name); // O clique mágico da supervisão

    card.innerHTML = `
      <div style="display:flex; align-items:center; gap: 10px; margin-bottom: 12px;">
        <div class="profile-avatar avatar-colab">${user.initial}</div>
        <div>
          <div style="font-weight: 500; font-size: 0.9rem; color: var(--text1);">${user.name}</div>
          <div style="font-size: 0.65rem; color: var(--text3); font-family: var(--font-mono);">${userDemands.length} PROJETOS TOTAIS</div>
        </div>
      </div>
      <div style="display:flex; gap: 1rem; border-top: 1px solid var(--border); padding-top: 10px;">
        <div>
          <div style="font-size: 1.1rem; font-weight: 600; color: var(--text1);">${ativas}</div>
          <div style="font-size: 0.65rem; color: var(--text3);">ATIVAS</div>
        </div>
        <div>
          <div style="font-size: 1.1rem; font-weight: 600; color: ${atrasadas > 0 ? 'var(--status-red)' : 'var(--status-green)'};">${atrasadas}</div>
          <div style="font-size: 0.65rem; color: var(--text3);">ATRASADAS</div>
        </div>
      </div>
    `;

    // Separa os perfis nos grids corretos
    if (user.prof_type === 'Arquitetura') {
      gridArq.appendChild(card);
    } else {
      gridEng.appendChild(card);
    }
  });
}

// Filtra o painel pelo profissional selecionado
function filterByUser(userName) {
  // Navega para o Dashboard
  showScreen('admin-dashboard');
  
  // Preenche a barra de busca automaticamente com o nome do profissional e filtra
  const searchInput = document.getElementById('search-all');
  if (searchInput) {
    searchInput.value = userName;
    filterTable(); // Roda a tabela para mostrar APENAS o que é dele
  }
}

/* ─────────────── CRUD LOGIC ─────────────── */
async function saveDemand(assign) {
  const responsaveisSelecionados = getSelectedResponsaveis();
  const formFields = [
    { id: 'new-demand-title', value: getFieldValue('new-demand-title'), required: true, name: 'Título da Demanda' },
    { id: 'new-demand-esp', value: getFieldValue('new-demand-esp'), required: true, name: 'Categoria Principal da Demanda' },
    { id: 'new-demand-resp', value: responsaveisSelecionados.length ? 'ok' : '', required: true, name: 'Responsáveis Técnicos' },
    { id: 'new-demand-prazo', value: getFieldValue('new-demand-prazo'), required: true, name: 'Prazo Final' },
    { id: 'new-demand-drive', value: getFieldValue('new-demand-drive'), required: false, name: 'Pasta de apoio Google Drive' },
    { id: 'new-demand-status', value: getFieldValue('new-demand-status'), required: false, name: 'Fase Inicial' },
  ];

  let isValid = true;
  let firstInvalidField = null;

  formFields.forEach(field => {
    const inputElement = document.getElementById(field.id);
    const errorElement = document.getElementById(`error-${field.id}`);
    if (inputElement) inputElement.classList.remove('is-invalid');
    if (errorElement) errorElement.style.display = 'none';

    if (field.required && !field.value) {
      if (isValid) {
        firstInvalidField = inputElement;
        isValid = false;
      }
      if (inputElement) inputElement.classList.add('is-invalid');
      if (errorElement) {
        errorElement.textContent = `${field.name} é obrigatório.`;
        errorElement.style.display = 'block';
      }
    }
  });

  if (!isValid) {
    if (firstInvalidField) {
      firstInvalidField.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => firstInvalidField.focus(), 600);
    }
    alert('Preencha os campos obrigatórios antes de registrar a demanda.');
    return;
  }

  const primaryResp = responsaveisSelecionados[0];
  const metadata = buildMetadataFromForm();
  const obsText = getFieldValue('new-demand-obs');

  const newDemandData = {
    title: getFieldValue('new-demand-title'),
    esp: getFieldValue('new-demand-esp'),
    resp: responsaveisSelecionados.map(r => r.name).join(', '),
    resp_id: primaryResp.id,
    prazo: getFieldValue('new-demand-prazo'),
    status: assign ? getFieldValue('new-demand-status') : 'Triagem',
    drive: getFieldValue('new-demand-drive'),
    obs: obsText,
    created_by: currentUser.id,

    // DFD e ETP são categorias de anexo no início do fluxo.
    ...extendedColumnsFromMetadata(metadata)
  };

  const { data, error } = await insertDemandWithFallback(newDemandData);

  if (error) {
    console.error('Erro ao salvar nova demanda:', error.message);
    alert('Erro ao salvar nova demanda: ' + error.message);
    return;
  }

  if (data && data[0]) {
    await _supabase.from('demand_history').insert([{
      demand_id: data[0].id,
      user_id: currentUser.id,
      action_type: 'Demanda registrada',
      note: `Cadastro inicial no pacote ${getDemandRule(data[0].esp).label}. Responsáveis: ${responsaveisSelecionados.map(r => r.label).join(', ')}.`
    }]);
    demands.unshift(data[0]);
  }

  const idsToClear = [
    'new-demand-title','new-demand-esp','new-demand-prazo','new-demand-drive','new-demand-obs','new-demand-processo'
  ];
  idsToClear.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const respEl = document.getElementById('new-demand-resp');
  if (respEl) Array.from(respEl.options).forEach(opt => opt.selected = false);
  const statusEl = document.getElementById('new-demand-status');
  if (statusEl) statusEl.value = 'Triagem';
  const prioridadeEl = document.getElementById('new-demand-prioridade');
  if (prioridadeEl) prioridadeEl.value = 'Normal';
  const structural = document.getElementById('new-demand-structural-change');
  if (structural) structural.checked = false;
  renderNewDemandPackagePreview();

  document.getElementById('save-modal').classList.add('open');
}

async function updateDemandStatus() {
  if (editingDemandId === null) return;

  const newStatus = document.getElementById('status-modal-select').value;
  const demandIndex = demands.findIndex(d => d.id === editingDemandId);

  if (demandIndex !== -1) {
    const updatedDemand = { ...demands[demandIndex], status: newStatus };

    const { error } = await _supabase
      .from('demands')
      .update({ status: newStatus })
      .eq('id', editingDemandId);

    if (error) {
      alert('Erro ao atualizar status da demanda: ' + error.message);
      return;
    }

    // Captura a observação do usuário ou usa um fallback padrão
    const noteInput = document.getElementById('status-modal-note');
    const userNote = noteInput ? noteInput.value.trim() : '';
    const historyNote = userNote || `Status atualizado para ${newStatus}.`;

    // Registra a alteração no histórico
    await _supabase.from('demand_history').insert([{
      demand_id: editingDemandId, 
      user_id: currentUser.id,
      action_type: 'Atualização de Status',
      note: historyNote
    }]);

    demands[demandIndex] = updatedDemand;

    const activeScreenObj = document.querySelector('.screen.active');
    if (activeScreenObj) {
      const activeScreen = activeScreenObj.id;
      if (activeScreen === 'screen-admin-dashboard') filterTable();
      else if (activeScreen === 'screen-admin-kanban') renderKanban();
      else if (activeScreen === 'screen-work-progress') renderWorkProgress();
      else if (activeScreen === 'screen-colab-dashboard') renderColabDashboard();
      else if (activeScreen === 'screen-demand-detail') openDemandDetail(editingDemandId);
    }
  }
  
  // Limpa o textarea do modal após a conclusão da operação
  if (document.getElementById('status-modal-note')) document.getElementById('status-modal-note').value = '';

  closeModal('status-modal');
  editingDemandId = null;
}

async function deleteDemand() {
  if (deletingDemandId === null) return;
  
  const { error } = await _supabase.from('demands').delete().eq('id', deletingDemandId);

  if (error) {
    alert('Erro ao excluir demanda: ' + error.message);
    return;
  }

  demands = demands.filter(d => d.id !== deletingDemandId);
  closeModal('delete-modal');
  deletingDemandId = null;

  const activeScreenObj = document.querySelector('.screen.active');
  if (activeScreenObj) {
    const activeScreen = activeScreenObj.id;
    if (activeScreen === 'screen-demand-detail' || activeScreen === 'screen-admin-dashboard') {
      showScreen('admin-dashboard'); 
    } else if (activeScreen === 'screen-admin-kanban') {
      renderKanban();
    } else if (activeScreen === 'screen-work-progress') {
      renderWorkProgress();
    }
  }
}

/* ─────────────── MODALS & UTILS ─────────────── */
async function openStatusModal(id) {
  if (demands.length === 0) await fetchDemands();
  
  const demand = demands.find(d => d.id === id);
  if (!demand) return;

  editingDemandId = id;
  document.getElementById('status-modal-title').textContent = demand.title;
  
  const currentBadge = document.getElementById('status-modal-current-badge');
  currentBadge.innerHTML = `<span class="status-badge ${statusMap[demand.status]}">${demand.status}</span>`;
  
  const select = document.getElementById('status-modal-select');
  select.value = demand.status === 'Aguardando' ? 'Aguardando' : demand.status;

  document.getElementById('status-modal').classList.add('open');
}

async function openDeleteModal(id) {
  if (demands.length === 0) await fetchDemands();
  const demand = demands.find(d => d.id === id);
  if (!demand) return;
  deletingDemandId = id;
  document.getElementById('delete-modal-title').textContent = demand.title;
  document.getElementById('delete-modal').classList.add('open');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

function toggleNotif() {
  const panel = document.getElementById('notif-panel');
  if(panel) {
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) renderNotificacoesGerais();
  }
}

document.addEventListener('click', function(e) {
  const notif = document.getElementById('notif-panel');
  if (notif && notif.classList.contains('open') && !notif.contains(e.target) && !e.target.closest('.btn-icon')) {
    notif.classList.remove('open');
  }
});


/* ─────────────── ANEXOS TÉCNICOS POR CATEGORIA ─────────────── */
async function saveDemandAttachment(demandId, docId) {
  if (demands.length === 0) await fetchDemands();
  const demandIndex = demands.findIndex(d => d.id === demandId);
  const demand = demands[demandIndex];
  if (!demand) return;

  if (!canCurrentUserUpload(demand)) {
    alert('Apenas usuário técnico atribuído a esta demanda pode anexar documentos.');
    return;
  }

  const doc = findDocDefinition(demand.esp, docId);
  if (!doc) {
    alert('Item de documento não encontrado nesta categoria.');
    return;
  }

  const fileInput = document.getElementById(`file-${docId}`);
  const linkInput = document.getElementById(`link-${docId}`);
  const file = fileInput?.files?.[0] || null;
  const manualLink = linkInput?.value?.trim() || '';

  if (!file && !manualLink) {
    alert('Selecione um arquivo ou cole um link do documento.');
    return;
  }

  let fileUrl = manualLink;
  let fileName = manualLink ? 'Link externo' : '';
  let mimeType = '';
  let size = 0;

  if (file) {
    fileName = file.name;
    mimeType = file.type || '';
    size = file.size || 0;
    const safeName = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_');
    const path = `${demandId}/${docId}/${Date.now()}_${safeName}`;
    const { error: uploadError } = await _supabase.storage
      .from('demand-files')
      .upload(path, file, { upsert: true, contentType: file.type || undefined });

    if (uploadError) {
      alert('Erro ao enviar arquivo. Verifique se o bucket demand-files foi criado no Supabase. Detalhe: ' + uploadError.message);
      return;
    }

    const { data: publicData } = _supabase.storage.from('demand-files').getPublicUrl(path);
    fileUrl = publicData?.publicUrl || '';
  }

  const attachments = { ...readDemandAttachments(demand) };
  attachments[docId] = {
    docId,
    label: doc.label,
    groupTitle: doc.groupTitle,
    area: doc.area,
    fileName,
    url: fileUrl,
    mimeType,
    size,
    source: file ? 'upload' : 'link',
    uploadedBy: currentUser.name,
    uploadedById: currentUser.id,
    uploadedAt: new Date().toISOString()
  };

  const metadata = { ...getDemandMetadata(demand), anexos: attachments };
  let updatePayload = { metadata, anexos: attachments };
  let { error } = await _supabase.from('demands').update(updatePayload).eq('id', demandId);
  if (error) {
    // Fallback para bases sem a coluna anexos.
    const fallback = await _supabase.from('demands').update({ metadata }).eq('id', demandId);
    if (fallback.error) {
      alert('Erro ao salvar anexo: ' + fallback.error.message);
      return;
    }
  }

  await _supabase.from('demand_history').insert([{
    demand_id: demandId,
    user_id: currentUser.id,
    action_type: 'Anexo técnico',
    note: `${doc.label} anexado em ${doc.groupTitle}.`
  }]);

  demands[demandIndex] = { ...demands[demandIndex], metadata, anexos: attachments };
  alert('Documento salvo no Supabase.');
  openDemandDetail(demandId);
}

function printDemandDossier() {
  if (editingDemandId === null) return;
  const demand = demands.find(d => d.id === editingDemandId);
  if (!demand) return;

  const rule = getDemandRule(demand.esp);
  const attachments = readDemandAttachments(demand);
  const created = demand.created_at ? new Date(demand.created_at).toLocaleDateString('pt-BR') : '-';
  const summary = calculatePackageProgress(rule, demand);
  const packageHtml = (rule.groups || []).map(group => `
    <h3>${escapeHtml(group.area)} — ${escapeHtml(group.title)}</h3>
    ${group.desc ? `<p class="muted">${escapeHtml(group.desc)}</p>` : ''}
    <ul>${(group.docs || []).map(doc => {
      const item = attachments[doc.id] || {};
      const children = doc.children ? ` <span class="muted">(${doc.children.map(escapeHtml).join(' · ')})</span>` : '';
      const link = item.url ? ` — <a href="${escapeHtml(item.url)}">${escapeHtml(item.fileName || 'Abrir anexo')}</a>` : ' — pendente';
      return `<li><strong>${escapeHtml(doc.label)}</strong>${children}${link}</li>`;
    }).join('')}</ul>
  `).join('');

  const html = `
    <html><head><title>Dossiê Técnico</title>
    <style>
      body{font-family:Arial,sans-serif;color:#111;line-height:1.45;margin:32px} h1{font-size:22px;margin-bottom:4px} h2{font-size:16px;border-bottom:1px solid #ddd;padding-bottom:6px;margin-top:22px} h3{font-size:14px;margin-bottom:4px}.muted{color:#555;font-size:12px}.row{margin:6px 0}.label{font-weight:bold}.box{border:1px solid #ddd;padding:12px;border-radius:8px;margin:10px 0} ul{margin-top:4px} a{color:#0645ad} @media print{button{display:none}}
    </style></head><body>
      <button onclick="window.print()" style="float:right;padding:8px 12px">Imprimir</button>
      <h1>${escapeHtml(demand.title)}</h1>
      <div class="muted">Dossiê técnico gerado pelo InfraGestor em ${new Date().toLocaleDateString('pt-BR')}</div>
      <div class="box">
        <div class="row"><span class="label">Pacote:</span> ${escapeHtml(rule.label)}</div>
        <div class="row"><span class="label">Responsáveis:</span> ${escapeHtml(getResponsibleDisplay(demand))}</div>
        <div class="row"><span class="label">Prazo:</span> ${escapeHtml(utils.formatDate(demand.prazo) || '-')}</div>
        <div class="row"><span class="label">Status:</span> ${escapeHtml(demand.status || '-')}</div>
        <div class="row"><span class="label">Prioridade:</span> ${escapeHtml(readDemandExtended(demand, 'prioridade', 'Normal'))}</div>
        <div class="row"><span class="label">Processo:</span> ${escapeHtml(readDemandExtended(demand, 'processo', '-'))}</div>
        <div class="row"><span class="label">Criado em:</span> ${created}</div>
        <div class="row"><span class="label">Anexos:</span> ${summary.done}/${summary.total} concluídos</div>
      </div>
      <h2>Anexos Técnicos por Categoria</h2>
      ${packageHtml}
      <h2>Observações gerais</h2>
      <div class="box">${escapeHtml(demand.obs || '-')}</div>
    </body></html>`;

  const printWindow = window.open('', '_blank');
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

/* ─────────────── VISIBILIDADE DE SENHA ─────────────── */
function togglePasswordVisibility() {
  const passwordInput = document.getElementById('login-pass');
  const toggleIcon = document.getElementById('toggle-password-icon');
  if (passwordInput.type === 'password') {
    passwordInput.type = 'text';
    toggleIcon.classList.replace('fa-eye', 'fa-eye-slash');
  } else {
    passwordInput.type = 'password';
    toggleIcon.classList.replace('fa-eye-slash', 'fa-eye');
  }
}

/* ─────────────── AUTHENTICATION & INIT ─────────────── */
const formLogin = document.getElementById('form-login');
if (formLogin) {
  formLogin.addEventListener('submit', async (event) => {
    event.preventDefault(); 
    const userVal = document.getElementById('login-user').value.toLowerCase();
    const passVal = document.getElementById('login-pass').value;
    const errorEl = document.getElementById('login-error');
    if(errorEl) errorEl.style.display = 'none'; 

    try {
      const { data, error } = await _supabase.auth.signInWithPassword({
        email: userVal,
        password: passVal,
      });

      if (error) throw error;
      if (!data.user) throw new Error("Falha na autenticação.");

      const { data: profile, error: profileError } = await _supabase
        .from('profiles')
        .select('name, role, initial')
        .eq('id', data.user.id)
        .single();

      if (profileError) throw new Error("Perfil não encontrado no sistema.");

      currentUser = {
        id: data.user.id,
        name: profile.name,
        role: profile.role,
        initial: profile.initial,
        email: data.user.email
      };

      document.body.classList.replace('is-logged-out', 'is-logged-in');
      const sb = document.querySelector('.sidebar');
      const mn = document.querySelector('.main');
      if(sb) sb.style.display = 'flex';
      if(mn) mn.style.display = 'flex';
      
      await setupUserInterface();

    } catch (error) {
      if(errorEl) {
        errorEl.textContent = error.message; 
        errorEl.style.display = 'block';
      }
    }
  });
}

async function handleLogout() {
  await _supabase.auth.signOut();
  currentUser = null;
  document.body.classList.replace('is-logged-in', 'is-logged-out');
  const sb = document.querySelector('.sidebar');
  const mn = document.querySelector('.main');
  const sl = document.getElementById('screen-login');
  if(sb) sb.style.display = 'none';
  if(mn) mn.style.display = 'none';
  if(sl) sl.style.display = 'flex';
  
  const lu = document.getElementById('login-user');
  const lp = document.getElementById('login-pass');
  if(lu) lu.value = '';
  if(lp) lp.value = '';
}

async function setupUserInterface() {
  if (!currentUser) {
    document.body.classList.replace('is-logged-in', 'is-logged-out');
    return;
  }

  const avatar = document.getElementById('sb-avatar');
  const name = document.getElementById('sb-name');
  const role = document.getElementById('sb-role');
  
  if(avatar) {
    avatar.textContent = currentUser.initial || '??';
    avatar.className = `profile-avatar ${currentUser.role === 'admin' ? 'avatar-admin' : 'avatar-colab'}`;
  }
  if(name) name.textContent = currentUser.name;
  if(role) role.textContent = currentUser.role === 'admin' ? "Gestão" : "Membro Técnico";
  
  document.querySelectorAll('.admin-only').forEach(el => el.style.display = currentUser.role === 'admin' ? 'flex' : 'none');
  document.querySelectorAll('.colab-only').forEach(el => el.style.display = currentUser.role === 'colab' ? 'flex' : 'none');
  
  await fetchDemands();
  renderNotificacoesGerais();
  await loadTeamMembers(); // Carrega V2.0 da equipe

  const sb = document.querySelector('.sidebar');
  const mn = document.querySelector('.main');
  if(sb) sb.style.display = 'flex';
  if(mn) mn.style.display = 'flex';

  if (currentUser.role === 'admin') {
    await showScreen('admin-dashboard');
  } else {
    await showScreen('colab-dashboard');
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  _supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || !session) {
      currentUser = null;
      document.body.classList.replace('is-logged-in', 'is-logged-out');
    }
    if (event === 'PASSWORD_RECOVERY') {
      // Usuário voltou do e-mail de confirmação: mostra a tela de nova senha
      // em vez de deixar o fluxo normal cair no dashboard.
      isPasswordRecovery = true;
      abrirTelaNovaSenha();
    }
  });

  const { data: { session } } = await _supabase.auth.getSession();

  if (session) {
    const { data: profile, error: profileError } = await _supabase
      .from('profiles')
      .select('name, role, initial')
      .eq('id', session.user.id)
      .single();

    if (profileError) {
      document.body.classList.add('is-logged-out');
      return;
    }

    currentUser = {
      id: session.user.id,
      name: profile.name,
      role: profile.role,
      initial: profile.initial,
      email: session.user.email
    };

    document.body.classList.replace('is-logged-out', 'is-logged-in');
    await setupUserInterface();
  } else {
    document.body.classList.add('is-logged-out');
  }

  // Listener para máscara de moeda em tempo real
  document.getElementById('obra-valor')?.addEventListener('input', (e) => {
    e.target.value = formatCurrencyBRL(e.target.value);
  });
});

/* ─────────────── RECUPERAÇÃO DE SENHA ─────────────── */
async function recuperarSenha() {
  const emailInput = document.getElementById('login-user').value.trim();
  
  if (!emailInput) {
    alert('Por favor, digite seu e-mail no campo "Usuário" primeiro e depois clique em "Esqueci minha senha".');
    document.getElementById('login-user').focus();
    return;
  }

  // O Supabase envia o e-mail automaticamente baseado no template configurado no painel deles
  const { error } = await _supabase.auth.resetPasswordForEmail(emailInput, {
    // URL para onde o usuário será redirecionado após clicar no e-mail
    redirectTo: window.location.origin, 
  });

  if (error) {
    alert('Erro ao solicitar recuperação: ' + error.message);
  } else {
    alert('Se este e-mail estiver cadastrado, você receberá um link de redefinição de senha em instantes.');
  }
}

// Exibe a tela de "criar nova senha", escondendo a tela de login normal.
// Chamada automaticamente quando o Supabase detecta o link de recuperação vindo do e-mail.
function abrirTelaNovaSenha() {
  const loginScreen = document.getElementById('screen-login');
  const resetScreen = document.getElementById('screen-reset-password');
  if (loginScreen) loginScreen.style.display = 'none';
  if (resetScreen) resetScreen.style.display = 'flex';
}

// Chamada pelo formulário da tela de nova senha (form-reset-password).
async function salvarNovaSenha() {
  const novaSenha = document.getElementById('reset-nova-senha').value;
  const confirmaSenha = document.getElementById('reset-confirma-senha').value;
  const errorEl = document.getElementById('reset-password-error');
  if (errorEl) errorEl.style.display = 'none';

  if (!novaSenha || !confirmaSenha) {
    alert('Preencha a nova senha e a confirmação.');
    return;
  }
  if (novaSenha.length < 6) {
    alert('A nova senha deve ter pelo menos 6 caracteres.');
    return;
  }
  if (novaSenha !== confirmaSenha) {
    alert('As senhas digitadas não coincidem. Digite a mesma senha nos dois campos.');
    return;
  }

  const { error } = await _supabase.auth.updateUser({ password: novaSenha });

  if (error) {
    alert('Erro ao salvar a nova senha: ' + error.message);
    return;
  }

  alert('Senha alterada com sucesso! Você será redirecionado para o login — entre novamente com a nova senha.');

  isPasswordRecovery = false;
  await _supabase.auth.signOut();
  // Recarrega a página do zero: garante estado limpo e volta para a tela de login padrão.
  window.location.href = window.location.origin;
}

/* ─────────────── INTEGRAÇÃO DE HISTÓRICO E ALERTAS ─────────────── */

async function loadDemandHistory(demandId) {
  // 1. Busca o histórico no banco ordenado por data
  const { data: history, error } = await _supabase
    .from('demand_history')
    .select('action_type, note, created_at, profiles(name)')
    .eq('demand_id', demandId)
    .order('created_at', { ascending: false });

  if (error) return;

  const container = document.getElementById('detail-timeline-container');
  container.innerHTML = ''; // Limpa os dados de teste

  if (history && history.length > 0) {
    history.forEach(item => {
      const date = new Date(item.created_at).toLocaleDateString('pt-BR');
      const div = document.createElement('div');
      div.className = 'timeline-item';
      div.innerHTML = `
        <div class="timeline-dot"></div>
        <div class="timeline-content">
          <div class="timeline-title">${item.action_type}</div>
          <div class="timeline-meta">${date} — por ${item.profiles?.name || 'Sistema'}</div>
          <div class="timeline-note">${item.note}</div>
        </div>
      `;
      container.appendChild(div);
    });
  } else {
    container.innerHTML = '<p style="color:var(--text3); font-size: 0.8rem;">Nenhuma alteração registrada.</p>';
  }
}

/* ─────────────── NOTIFICAÇÕES / SINO ─────────────── */

function updateNotificationBadge(count) {
  const badge = document.getElementById('notif-badge');
  if (!badge) return;
  badge.style.display = count > 0 ? 'block' : 'none';
}

function renderNotificacoesGerais() {
  if (!demands || demands.length === 0) { fetchDemands().then(renderNotificacoesGerais); return; }
  const panel = document.querySelector('.notif-list');
  if (!panel) return;

  const ativas = demands.filter(d => d.status !== 'Concluído');
  const alertas = ativas.map(d => {
    const diff = new Date(d.prazo) - new Date();
    const diffDias = Math.floor(diff / (1000 * 60 * 60 * 24));
    const diffHoras = diff / (1000 * 60 * 60);
    const atrasado = diffHoras < 0;
    const vencendo72h = diffHoras >= 0 && diffHoras <= 72;
    return { demand: d, atrasado, vencendo72h, diffDias: Math.abs(Math.floor(diffDias)) };
  }).filter(a => a.atrasado || a.vencendo72h);

  if (alertas.length === 0) {
    panel.innerHTML = '<p style="color:var(--text3);font-size:0.8rem;font-style:italic;padding:10px 1.25rem;">Nenhum alerta pendente.</p>';
    updateNotificationBadge(0);
    return;
  }

  panel.innerHTML = alertas.map(a => {
    const d = a.demand;
    const isRed = a.atrasado;
    const iconClass = isRed ? 'fa-circle-exclamation red' : 'fa-clock yellow';
    const severityClass = isRed ? 'red' : 'yellow';
    const label = isRed ? `Atrasado ${a.diffDias} dia(s)` : `Vence em até ${a.diffDias} dia(s)`;
    return `
      <div class="notif-item unread" onclick="openDemandDetail(${d.id})">
        <div class="notif-icon ${severityClass}"><i class="fa-solid ${iconClass.split(' ')[0]}"></i></div>
        <div class="notif-body">
          <div class="notif-title">${d.title}</div>
          <div class="notif-desc">${d.esp} — ${label}</div>
          <div class="notif-time">Prazo: ${d.prazo ? new Date(d.prazo).toLocaleDateString('pt-BR') : '—'}</div>
        </div>
      </div>
    `;
  }).join('');

  updateNotificationBadge(alertas.length);
}

/* ─────────────── ALERTAS DE PRAZO ─────────────── */
function loadDemandAlerts(demand) {
  const container = document.getElementById('detail-alerts-container');
  if (!container) return;
  
  container.innerHTML = ''; // Limpa alertas anteriores
  let hasAlerts = false;

  // REGRA 1: Status Atrasado (Alerta Vermelho Crítico)
  if (demand.status === 'Atrasado') {
    container.innerHTML += `
      <div class="alert-banner" style="background: rgba(239,68,68,0.1); border-color: var(--status-red); margin-bottom: 10px;">
        <i class="fa-solid fa-clock alert-icon" style="color: var(--status-red)"></i>
        <div class="alert-text">
          <strong>Prazo vencido:</strong> O prazo estimado para esta demanda foi excedido. Verificar andamento da demanda.
        </div>
      </div>
    `;
    hasAlerts = true;
  }

  // REGRA 2: Retorno Estrutural ou Correção (Alerta Amarelo)
  if (demand.status === 'Correção') {
    container.innerHTML += `
      <div class="alert-banner" style="background: rgba(245,158,11,0.1); border-color: var(--status-yellow); margin-bottom: 10px;">
        <i class="fa-solid fa-rotate-left alert-icon" style="color: var(--status-yellow)"></i>
        <div class="alert-text">
          <strong>ATENÇÃO:</strong> Projeto em fase de readequação/correção. Priorize a revisão estrutural ou arquitetônica.
        </div>
      </div>
    `;
    hasAlerts = true;
  }

  // Se o sistema não encontrar motivos para alertar:
  if (!hasAlerts) {
    container.innerHTML = '<p style="color:var(--text3); font-size: 0.8rem; font-style: italic; padding: 10px 0;">Nenhum alerta crítico ativo para este projeto no momento.</p>';
  }
}

/* ─────────────── REGRA DE RETORNO ESTRUTURAL ─────────────── */
async function triggerStructuralReturn() {
  if (editingDemandId === null) return;
  
  const confirmacao = confirm('ATENÇÃO: Confirmar que houve alteração estrutural? A obra retornará totalmente para a Arquitetura.');
  if (!confirmacao) return;

  const demandIndex = demands.findIndex(d => d.id === editingDemandId);
  const demand = demands[demandIndex];
  const metadata = { ...getDemandMetadata(demand), alteracaoEstrutural: true, retornoArquiteturaEm: new Date().toISOString() };

  const updatePayload = { status: 'Arquitetura', metadata, alteracao_estrutural: true };
  let { error } = await _supabase.from('demands').update(updatePayload).eq('id', editingDemandId);
  if (error) {
    // Fallback para bancos que ainda não executaram a migração de colunas extras.
    await _supabase.from('demands').update({ status: 'Arquitetura' }).eq('id', editingDemandId);
  }

  await _supabase.from('demand_history').insert([{
    demand_id: editingDemandId,
    user_id: currentUser.id,
    action_type: 'Readequação Estrutural',
    note: 'Obra sofreu alteração estrutural. Retorno obrigatório para o setor de Arquitetura.'
  }]);

  if (demandIndex !== -1) {
    demands[demandIndex] = { ...demands[demandIndex], status: 'Arquitetura', metadata, alteracao_estrutural: true };
  }

  const alertBox = document.getElementById('structural-alert');
  if (alertBox) alertBox.style.display = 'flex';
  alert("Regra aplicada com sucesso. A demanda foi marcada como 'Arquitetura' e retornou para readequação arquitetônica.");
  openDemandDetail(editingDemandId);
}

/* ─────────────── SIEDU v8 — MODELO OBRA > DEMANDAS ─────────────── */
let works = [];
let currentWorkId = null;
let editingWorkId = null;
let editingDemandFormId = null;
let teamProfilesCache = [];

function isExecutiveRole() {
  return currentUser && ['admin', 'prefeito'].includes(currentUser.role);
}

function isAdminRole() {
  return currentUser?.role === 'admin';
}

function isMayorRole() {
  return currentUser?.role === 'prefeito';
}

function normalizeId(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isNaN(n) ? String(value) : n;
}

function getDemandWorkId(demand) {
  return normalizeId(demand?.work_id || getDemandMetadata(demand).work_id || getDemandMetadata(demand).obra_id || null);
}

async function fetchWorks() {
  const { data, error } = await _supabase
    .from('works')
    .select('*')
    .order('id', { ascending: false });

  if (error) {
    console.error('Erro ao buscar obras:', error.message);
    works = [];
    return [];
  }
  works = data || [];
  return works;
}

function getWorkDemands(workId) {
  const id = normalizeId(workId);
  return demands.filter(d => getDemandWorkId(d) == id);
}

function canSeeWork(workId) {
  if (!currentUser) return false;
  if (isExecutiveRole()) return true;
  return getWorkDemands(workId).some(d => isAssignedToDemand(d));
}

function canSeeDemandByWork(demand) {
  if (!currentUser || !demand) return false;
  if (isExecutiveRole()) return true;
  if (isAssignedToDemand(demand)) return true;
  const wid = getDemandWorkId(demand);
  return wid ? canSeeWork(wid) : false;
}

function getVisibleWorks() {
  return works.filter(w => canSeeWork(w.id));
}

function calculateWorkDocuments(workId) {
  const list = getWorkDemands(workId);
  let total = 0;
  let done = 0;
  list.forEach(d => {
    const rule = getDemandRule(d.esp);
    const progress = calculatePackageProgress(rule, d);
    total += progress.total;
    done += progress.done;
  });
  return { total, done, percent: total ? Math.round((done / total) * 100) : 0 };
}

function getWorkTeam(workId) {
  const map = new Map();
  getWorkDemands(workId).forEach(d => {
    getDemandResponsaveis(d).forEach(p => {
      const key = p.id || p.name || p.label;
      if (key) map.set(key, p.label || p.name || 'Técnico');
    });
  });
  return Array.from(map.values());
}

function getWorkStage(workId) {
  const list = getWorkDemands(workId);
  if (!list.length) return 'Sem demandas';
  const open = list.find(d => !['Concluído'].includes(d.status));
  return open ? `${open.status} · ${open.esp}` : 'Concluída';
}

function getWorkDeadlineAlerts(workId) {
  return getWorkDemands(workId).filter(d => ['overdue', 'due-soon'].includes(getDeadlineClass(d.prazo, d.status).cls)).length;
}

async function loadWorksSelect(selectedId = null) {
  if (!works.length) await fetchWorks();
  const select = document.getElementById('new-demand-work');
  if (!select) return;
  const visible = isAdminRole() ? works : getVisibleWorks();
  select.innerHTML = '<option value="">Selecione a obra…</option>';
  visible.forEach(w => {
    const opt = document.createElement('option');
    opt.value = w.id;
    opt.textContent = `${w.title || 'Obra sem título'}${w.bairro ? ' — ' + w.bairro : ''}`;
    if (selectedId && String(selectedId) === String(w.id)) opt.selected = true;
    select.appendChild(opt);
  });
}

async function loadTeamMembers() {
  const { data, error } = await _supabase
    .from('profiles')
    .select('id, name, prof_type, role, initial')
    .order('name');

  if (error) {
    console.error('Erro ao carregar equipe técnica:', error.message);
    return;
  }

  teamProfilesCache = data || [];
  const selectResp = document.getElementById('new-demand-resp');
  if (selectResp) {
    selectResp.innerHTML = '';
    teamProfilesCache.forEach(user => {
      if (user.role === 'colab') {
        const opt = document.createElement('option');
        opt.value = user.id;
        opt.dataset.name = user.name;
        opt.dataset.profType = user.prof_type || '';
        const prefix = user.prof_type === 'Arquitetura' ? 'Arq.' : 'Eng.';
        opt.textContent = `${prefix} ${user.name}`;
        selectResp.appendChild(opt);
      }
    });
  }
  await loadWorksSelect(currentWorkId);
}

function renderWorksTable(items) {
  const tbody = document.getElementById('works-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="padding:2rem;text-align:center;color:var(--text3)">Nenhuma obra encontrada.</td></tr>`;
    return;
  }

  items.forEach(w => {
    const linked = getWorkDemands(w.id);
    const docs = calculateWorkDocuments(w.id);
    const team = getWorkTeam(w.id);
    const alerts = getWorkDeadlineAlerts(w.id);
    const tr = document.createElement('tr');
    if (alerts) tr.className = 'urgent-row row-urgent-glow';
    tr.innerHTML = `
      <td>
        <div class="td-title" onclick="openWorkDetail(${w.id})">${escapeHtml(w.title || 'Obra sem título')}</div>
        <div class="td-muted">${escapeHtml(w.processo || w.processo_numero || 'Sem processo informado')}</div>
        ${alerts ? `<div class="urgent-badge"><i class="fa-solid fa-triangle-exclamation"></i> ${alerts} alerta(s) de prazo</div>` : ''}
      </td>
      <td class="td-muted">${escapeHtml(w.bairro || w.localizacao || '-')}</td>
      <td><span class="status-badge s-purple">${linked.length} demanda(s)</span><div class="td-muted">${escapeHtml(getWorkStage(w.id))}</div></td>
      <td style="min-width:160px"><strong>${docs.done}/${docs.total}</strong><div class="progress-mini"><div style="width:${docs.percent}%"></div></div></td>
      <td>${team.length ? team.slice(0,3).map(n => `<span class="responsible-chip"><i class="fa-solid fa-user-hard-hat"></i>${escapeHtml(n)}</span>`).join('') : '<span class="td-muted">Sem responsáveis</span>'}${team.length > 3 ? `<span class="responsible-chip">+${team.length - 3}</span>` : ''}</td>
      <td><span class="status-badge s-blue">${escapeHtml(w.status || 'Em planejamento')}</span></td>
      <td><button class="btn btn-ghost btn-sm" onclick="openWorkDetail(${w.id})"><i class="fa-solid fa-eye"></i> Abrir</button></td>
    `;
    tbody.appendChild(tr);
  });
}

async function renderWorksDashboard() {
  await fetchDemands();
  await fetchWorks();
  const search = (document.getElementById('search-works')?.value || '').toLowerCase();
  const status = document.getElementById('filter-work-status')?.value || '';
  let visible = getVisibleWorks();
  if (search) {
    visible = visible.filter(w => [w.title, w.bairro, w.localizacao, w.processo, w.processo_numero, w.objeto].join(' ').toLowerCase().includes(search));
  }
  if (status) visible = visible.filter(w => (w.status || '') === status);

  const visibleDemandIds = new Set(visible.flatMap(w => getWorkDemands(w.id).map(d => d.id)));
  const visibleDemands = demands.filter(d => visibleDemandIds.has(d.id));
  let docsTotal = 0, docsDone = 0;
  visible.forEach(w => { const p = calculateWorkDocuments(w.id); docsTotal += p.total; docsDone += p.done; });
  const avg = docsTotal ? Math.round((docsDone / docsTotal) * 100) : 0;
  const alerts = visible.reduce((acc, w) => acc + getWorkDeadlineAlerts(w.id), 0);

  setText('work-stat-total', visible.length, '0');
  setText('work-stat-demandas', visibleDemands.length, '0');
  setText('work-stat-docs', `${avg}%`, '0%');
  setText('work-stat-alertas', alerts, '0');
  setText('works-count', `${visible.length} registro(s)`, '0 registros');

  renderWorksTable(visible);
}

function renderWorkSummary(work) {
  return `
    <div class="info-row"><span class="info-label">Bairro/local</span><span class="info-value">${escapeHtml(work.bairro || work.localizacao || '-')}</span></div>
    <div class="info-row"><span class="info-label">Processo</span><span class="info-value">${escapeHtml(work.processo || work.processo_numero || '-')}</span></div>
    <div class="info-row"><span class="info-label">Prioridade</span><span class="info-value">${escapeHtml(work.prioridade || 'Normal')}</span></div>
    <div class="info-row"><span class="info-label">Prazo previsto</span><span class="info-value">${work.prazo_previsto ? utils.formatDate(work.prazo_previsto) : '-'}</span></div>
    <div class="info-row"><span class="info-label">Valor previsto</span><span class="info-value">${work.valor_estimado ? formatCurrencyBRL(Number(work.valor_estimado).toFixed(2).replace('.', '')) : '-'}</span></div>
    <div class="info-row"><span class="info-label">Objeto</span><span class="info-value">${escapeHtml(work.objeto || '-')}</span></div>
    <div class="info-row"><span class="info-label">Observações</span><span class="info-value">${escapeHtml(work.obs || '-')}</span></div>
  `;
}

function renderWorkDemandCards(workId) {
  const container = document.getElementById('work-demands-list');
  if (!container) return;
  const linked = getWorkDemands(workId).sort((a,b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  if (!linked.length) {
    container.innerHTML = '<div class="package-empty"><i class="fa-solid fa-list-check"></i> Nenhuma demanda técnica criada para esta obra.</div>';
    return;
  }
  container.innerHTML = linked.map(d => {
    const docs = calculatePackageProgress(getDemandRule(d.esp), d);
    const dl = getDeadlineClass(d.prazo, d.status);
    return `
      <div class="work-demand-card">
        <div class="work-demand-head">
          <div><span class="esp-tag">${escapeHtml(d.esp)}</span><h4>${escapeHtml(d.title)}</h4><p>${escapeHtml(d.obs || 'Sem observações.')}</p></div>
          <span class="status-badge ${statusMap[d.status] || 's-gray'}">${escapeHtml(d.status)}</span>
        </div>
        <div class="work-demand-meta">
          <span><i class="fa-solid fa-users"></i> ${escapeHtml(getResponsibleDisplay(d))}</span>
          <span><i class="fa-solid fa-calendar"></i> ${escapeHtml(dl.label)}</span>
          <span><i class="fa-solid fa-paperclip"></i> ${docs.done}/${docs.total} anexos</span>
        </div>
        <div class="progress-mini"><div style="width:${docs.percent}%"></div></div>
        <div class="work-demand-actions"><button class="btn btn-ghost btn-sm" onclick="openDemandDetail(${d.id})"><i class="fa-solid fa-folder-open"></i> Ver demanda e anexos</button></div>
      </div>
    `;
  }).join('');
}

function renderWorkDocuments(workId) {
  const container = document.getElementById('work-documents-list');
  if (!container) return;
  const linked = getWorkDemands(workId);
  const docs = [];
  linked.forEach(d => {
    const attachments = readDemandAttachments(d);
    Object.values(attachments || {}).forEach(item => {
      if (item?.url) docs.push({ ...item, demandTitle: d.title, demandEsp: d.esp, demandId: d.id });
    });
  });
  if (!docs.length) {
    container.innerHTML = '<div class="package-empty"><i class="fa-solid fa-folder-open"></i> Nenhum documento anexado nesta obra até o momento.</div>';
    return;
  }
  container.innerHTML = docs.map(item => `
    <div class="work-doc-item">
      <div>
        <strong>${escapeHtml(item.label || item.fileName || 'Documento')}</strong>
        <span>${escapeHtml(item.demandEsp)} · ${escapeHtml(item.demandTitle)}</span>
        <small>${escapeHtml(item.uploadedBy || 'Usuário')} ${item.uploadedAt ? '· ' + new Date(item.uploadedAt).toLocaleDateString('pt-BR') : ''}</small>
      </div>
      <a class="btn btn-ghost btn-sm" href="${escapeHtml(item.url)}" target="_blank"><i class="fa-solid fa-arrow-up-right-from-square"></i> Abrir</a>
    </div>
  `).join('');
}

function renderWorkTimeline(workId) {
  const container = document.getElementById('work-timeline-list');
  if (!container) return;
  const linked = getWorkDemands(workId).sort((a,b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  if (!linked.length) {
    container.innerHTML = '<div class="timeline-note">A obra ainda não possui demandas.</div>';
    return;
  }
  container.innerHTML = linked.map(d => `
    <div class="timeline-item">
      <div class="timeline-dot"></div>
      <div class="timeline-content">
        <div class="timeline-title">${escapeHtml(d.esp)} · ${escapeHtml(d.status)}</div>
        <div class="timeline-meta">${d.created_at ? new Date(d.created_at).toLocaleDateString('pt-BR') : '-'} — ${escapeHtml(getResponsibleDisplay(d))}</div>
        <div class="timeline-note">${escapeHtml(d.title)}</div>
      </div>
    </div>
  `).join('');
}

async function openWorkDetail(id) {
  currentWorkId = id;
  await fetchDemands();
  await fetchWorks();
  const work = works.find(w => String(w.id) === String(id));
  if (!work) return alert('Obra não encontrada.');
  if (!canSeeWork(id)) return alert('Você não tem permissão para acessar esta obra.');

  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-work-detail')?.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const titleEl = document.getElementById('topbar-title');
  if (titleEl) titleEl.innerHTML = 'Detalhe da Obra <span id="topbar-sub">Fluxo completo e documentos</span>';

  setText('work-detail-title', work.title || 'Obra sem título');
  setText('work-detail-status', work.status || 'Em planejamento');
  const status = document.getElementById('work-detail-status');
  if (status) status.className = 'status-badge s-purple';
  const team = getWorkTeam(id);
  setText('work-detail-team', team.length ? team.join(', ') : 'Sem responsáveis');
  const flow = getWorkDemands(id).map(d => d.esp).filter(Boolean);
  setText('work-detail-flow', flow.length ? flow.join(' → ') : 'Aguardando criação das demandas');
  const summary = document.getElementById('work-detail-summary');
  if (summary) summary.innerHTML = renderWorkSummary(work);

  const btn = document.getElementById('work-detail-new-demand');
  if (btn) {
    btn.style.display = isAdminRole() ? 'inline-flex' : 'none';
    btn.onclick = () => startDemandForWork(id);
  }

  renderWorkDemandCards(id);
  renderWorkDocuments(id);
  renderWorkTimeline(id);
}

async function startDemandForWork(id) {
  currentWorkId = id;
  await showScreen('create-demand');
  await loadWorksSelect(id);
  const select = document.getElementById('new-demand-work');
  if (select) select.value = id;
}

async function saveWork() {
  if (!isAdminRole()) return alert('Apenas a gestão pode cadastrar obras.');
  const title = getFieldValue('new-work-title');
  if (!title) {
    const el = document.getElementById('new-work-title');
    el?.classList.add('is-invalid');
    document.getElementById('error-new-work-title').textContent = 'Nome da obra é obrigatório.';
    document.getElementById('error-new-work-title').style.display = 'block';
    return;
  }
  const payload = {
    title,
    bairro: getFieldValue('new-work-bairro'),
    processo: getFieldValue('new-work-processo'),
    status: getFieldValue('new-work-status') || 'Em planejamento',
    prioridade: getFieldValue('new-work-prioridade') || 'Normal',
    prazo_previsto: getFieldValue('new-work-prazo') || null,
    valor_estimado: parseCurrencyToNumber(document.getElementById('obra-valor')?.value),
    objeto: getFieldValue('new-work-objeto'),
    obs: getFieldValue('new-work-obs'),
    created_by: currentUser.id,
    metadata: {}
  };
  const { data, error } = await _supabase.from('works').insert([payload]).select();
  if (error) return alert('Erro ao cadastrar obra: ' + error.message + '\n\nExecute o SQL da versão v8 no Supabase.');
  works.unshift(data[0]);
  ['new-work-title','new-work-bairro','new-work-processo','new-work-prazo','obra-valor','new-work-objeto','new-work-obs'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  await loadWorksSelect(data[0].id);
  await openWorkDetail(data[0].id);
}

saveDemand = async function(assign) {
  const responsaveisSelecionados = getSelectedResponsaveis();
  const selectedWorkId = getFieldValue('new-demand-work');
  const formFields = [
    { id: 'new-demand-work', value: selectedWorkId, required: true, name: 'Obra vinculada' },
    { id: 'new-demand-title', value: getFieldValue('new-demand-title'), required: true, name: 'Título da Demanda' },
    { id: 'new-demand-esp', value: getFieldValue('new-demand-esp'), required: true, name: 'Categoria Principal da Demanda' },
    { id: 'new-demand-resp', value: responsaveisSelecionados.length ? 'ok' : '', required: true, name: 'Responsáveis Técnicos' },
    { id: 'new-demand-prazo', value: getFieldValue('new-demand-prazo'), required: true, name: 'Prazo Final' }
  ];

  let isValid = true;
  let firstInvalidField = null;
  formFields.forEach(field => {
    const inputElement = document.getElementById(field.id);
    const errorElement = document.getElementById(`error-${field.id}`);
    inputElement?.classList.remove('is-invalid');
    if (errorElement) errorElement.style.display = 'none';
    if (field.required && !field.value) {
      if (isValid) firstInvalidField = inputElement;
      isValid = false;
      inputElement?.classList.add('is-invalid');
      if (errorElement) { errorElement.textContent = `${field.name} é obrigatório.`; errorElement.style.display = 'block'; }
    }
  });
  if (!isValid) {
    firstInvalidField?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => firstInvalidField?.focus(), 400);
    alert('Preencha os campos obrigatórios antes de registrar a demanda.');
    return;
  }

  const primaryResp = responsaveisSelecionados[0];
  const metadata = { ...buildMetadataFromForm(), work_id: Number(selectedWorkId), obra_id: Number(selectedWorkId) };
  const obsText = getFieldValue('new-demand-obs');
  const newDemandData = {
    title: getFieldValue('new-demand-title'),
    esp: getFieldValue('new-demand-esp'),
    resp: responsaveisSelecionados.map(r => r.name).join(', '),
    resp_id: primaryResp.id,
    prazo: getFieldValue('new-demand-prazo'),
    status: assign ? getFieldValue('new-demand-status') : 'Triagem',
    drive: getFieldValue('new-demand-drive'),
    obs: obsText,
    created_by: currentUser.id,
    work_id: Number(selectedWorkId),
    ...extendedColumnsFromMetadata(metadata)
  };

  const { data, error } = await insertDemandWithFallback(newDemandData);
  if (error) {
    console.error('Erro ao salvar nova demanda:', error.message);
    alert('Erro ao salvar nova demanda: ' + error.message + '\n\nConfira se o SQL v8 foi executado.');
    return;
  }

  if (data && data[0]) {
    await _supabase.from('demand_history').insert([{
      demand_id: data[0].id,
      user_id: currentUser.id,
      action_type: 'Demanda registrada',
      note: `Demanda vinculada à obra #${selectedWorkId}. Categoria: ${getDemandRule(data[0].esp).label}. Responsáveis: ${responsaveisSelecionados.map(r => r.label).join(', ')}.`
    }]);
    demands.unshift(data[0]);
  }

  ['new-demand-title','new-demand-esp','new-demand-prazo','new-demand-drive','new-demand-obs','new-demand-processo'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const respEl = document.getElementById('new-demand-resp');
  if (respEl) Array.from(respEl.options).forEach(opt => opt.selected = false);
  const statusEl = document.getElementById('new-demand-status');
  if (statusEl) statusEl.value = 'Triagem';
  const prioridadeEl = document.getElementById('new-demand-prioridade');
  if (prioridadeEl) prioridadeEl.value = 'Normal';
  const structural = document.getElementById('new-demand-structural-change');
  if (structural) structural.checked = false;
  renderNewDemandPackagePreview();

  if (selectedWorkId) await openWorkDetail(selectedWorkId);
};

const originalInsertDemandWithFallbackV8 = insertDemandWithFallback;
insertDemandWithFallback = async function(payload) {
  const { data, error } = await _supabase.from('demands').insert([payload]).select();
  if (!error) return { data, error };
  const msg = String(error.message || '').toLowerCase();
  const isSchemaError = msg.includes('column') || msg.includes('schema cache') || msg.includes('could not find');
  if (!isSchemaError) return { data, error };
  const basePayload = { ...payload };
  const extras = {};
  [...DEMAND_OPTIONAL_COLUMNS, 'work_id'].forEach(column => {
    if (Object.prototype.hasOwnProperty.call(basePayload, column)) {
      extras[column] = basePayload[column];
      delete basePayload[column];
    }
  });
  basePayload.obs = appendFallbackExtras(basePayload.obs, extras);
  return await _supabase.from('demands').insert([basePayload]).select();
};

const originalRenderTableV8 = renderTable;
renderTable = function(data) {
  const displayData = isExecutiveRole() ? data : data.filter(d => isAssignedToDemand(d));
  const tbody = document.getElementById('table-body');
  if (!tbody) return;
  tbody.innerHTML = '';
  displayData.forEach(d => {
    const work = works.find(w => String(w.id) === String(getDemandWorkId(d)));
    const dl = getDeadlineClass(d.prazo, d.status);
    const urgent = dl.cls === 'overdue' || dl.cls === 'due-soon';
    const tr = document.createElement('tr');
    if (urgent) tr.className = 'urgent-row row-urgent-glow';
    tr.innerHTML = `
      <td><div class="td-title" onclick="openDemandDetail(${d.id})">${escapeHtml(d.title)}</div><div class="td-muted">${work ? escapeHtml(work.title) : 'Sem obra vinculada'}</div>${dl.extra ? `<div class="urgent-badge"><i class="fa-solid fa-triangle-exclamation"></i> ${dl.cls==='overdue'?'Prazo vencido':'Vence em 72h'}</div>` : ''}</td>
      <td><span class="esp-tag">${escapeHtml(d.esp)}</span></td>
      <td class="td-muted" style="font-size:0.78rem">${escapeHtml(getResponsibleDisplay(d))}</td>
      <td><span class="kcard-deadline ${dl.cls}">${dl.label}</span></td>
      <td><span class="status-badge ${statusMap[d.status] || 's-gray'}">${escapeHtml(d.status)}</span></td>
      <td>${work ? `<button class="btn btn-ghost btn-sm" onclick="openWorkDetail(${work.id})"><i class="fa-solid fa-building-circle-check"></i> Obra</button>` : `<a href="${d.drive || '#'}" target="_blank" style="color:var(--accent);font-size:0.78rem;text-decoration:none"><i class="fa-brands fa-google-drive" style="color:#4285f4;margin-right:3px"></i>Abrir</a>`}</td>
      <td><div style="display:flex;gap:4px"><button class="btn btn-ghost btn-sm" onclick="openDemandDetail(${d.id})"><i class="fa-solid fa-eye"></i></button>${isAdminRole() ? `<button class="btn btn-ghost btn-sm" onclick="openStatusModal(${d.id})"><i class="fa-solid fa-pen"></i></button>` : ''}</div></td>
    `;
    tbody.appendChild(tr);
  });
};

const originalRenderColabDashboardV8 = renderColabDashboard;
renderColabDashboard = async function() {
  await fetchDemands();
  await fetchWorks();
  const userDemands = demands.filter(d => isAssignedToDemand(d));
  const elAvatar = document.getElementById('colab-header-avatar');
  const elName = document.getElementById('colab-header-name');
  const elCount = document.getElementById('colab-demand-count');
  if(elAvatar) elAvatar.textContent = currentUser.initial;
  if(elName) elName.textContent = currentUser.name;
  if(elCount) elCount.textContent = `${userDemands.length} demandas em ${getVisibleWorks().length} obra(s)`;
  const atrasadas = userDemands.filter(d => d.status === 'Atrasado').length;
  const pendentes = userDemands.filter(d => !['Concluído', 'Atrasado'].includes(d.status)).length;
  const concluidas = userDemands.filter(d => d.status === 'Concluído').length;
  setText('colab-stat-atrasadas', atrasadas, '0');
  setText('colab-stat-pendentes', pendentes, '0');
  setText('colab-stat-concluidas', concluidas, '0');
  renderColabTable(userDemands);
};

showScreen = async function(name, navItem) {
  const adminScreens = ['admin-dashboard', 'admin-kanban', 'work-progress', 'create-demand', 'admin-team', 'create-work'];
  const executiveScreens = ['works-dashboard'];
  if (!isAdminRole() && adminScreens.includes(name)) {
    alert('Acesso restrito à gestão.');
    return;
  }
  if (!currentUser && executiveScreens.includes(name)) return;

  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById('screen-' + name);
  if (target) target.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (navItem) navItem.classList.add('active');

  const titles = {
    ...screenTitles,
    'works-dashboard': ['Obras', 'Fluxo completo por obra'],
    'create-work': ['Nova Obra', 'Cadastro do processo principal'],
    'work-detail': ['Detalhe da Obra', 'Demandas, responsáveis e documentos']
  }[name] || [name, ''];
  const titleEl = document.getElementById('topbar-title');
  if(titleEl) titleEl.innerHTML = titles[0] + ' <span id="topbar-sub">' + titles[1] + '</span>';

  await fetchDemands();
  await fetchWorks();
  if (name === 'works-dashboard') renderWorksDashboard();
  if (name === 'admin-dashboard') filterTable();
  if (name === 'admin-kanban') renderKanban();
  if (name === 'work-progress') renderWorkProgress();
  if (name === 'colab-dashboard') renderColabDashboard();
  if (name === 'admin-team') renderTeamScreen();
  if (name === 'create-demand') loadWorksSelect(currentWorkId);
  const notifPanel = document.getElementById('notif-panel');
  if(notifPanel) notifPanel.classList.remove('open');
};

openDemandDetail = async function(id) {
  editingDemandId = id;
  if (demands.length === 0) await fetchDemands();
  if (works.length === 0) await fetchWorks();
  const demand = demands.find(d => String(d.id) === String(id));
  if (!demand) return;
  if (!canSeeDemandByWork(demand)) {
    alert('Você não tem permissão para ver detalhes desta demanda.');
    return;
  }

  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById('screen-demand-detail');
  if (target) target.classList.add('active');
  const titleEl = document.getElementById('topbar-title');
  if(titleEl) titleEl.innerHTML = 'Detalhe da Demanda <span id="topbar-sub">Documentos e histórico técnico</span>';

  const work = works.find(w => String(w.id) === String(getDemandWorkId(demand)));
  setText('detail-title', demand.title || '--');
  setText('detail-esp', demand.esp || '-');
  setText('detail-prioridade', readDemandExtended(demand, 'prioridade', demand.prioridade || 'Normal'));
  setText('detail-processo', readDemandExtended(demand, 'processo', demand.processo_numero || '-'));
  const workBtn = document.getElementById('detail-work-link');
  if (workBtn) {
    workBtn.style.display = work ? 'inline-flex' : 'none';
    workBtn.onclick = () => work && openWorkDetail(work.id);
    workBtn.innerHTML = `<i class="fa-solid fa-building-circle-check"></i> ${escapeHtml(work?.title || 'Abrir obra')}`;
  }
  document.getElementById('detail-resp-name').innerHTML = renderResponsibleChips(demand);
  document.getElementById('detail-resp-initial').textContent = utils.getInitials(getResponsibleDisplay(demand));
  const dl = getDeadlineClass(demand.prazo, demand.status);
  const prazoAtualEl = document.getElementById('detail-prazo-atual');
  if (prazoAtualEl) {
    prazoAtualEl.innerHTML = `${dl.extra ? `<i class="fa-solid fa-circle-exclamation" style="margin-right:4px"></i>` : ''}${dl.label}`;
    prazoAtualEl.style.color = dl.cls === 'overdue' ? 'var(--status-red)' : (dl.cls === 'due-soon' ? 'var(--status-yellow)' : 'var(--text1)');
  }
  setText('detail-prazo-original', utils.formatDate(demand.prazo));
  setText('detail-obs', demand.obs || 'Nenhuma observação registrada.');
  const dataCriacao = demand.created_at ? new Date(demand.created_at).toLocaleDateString('pt-BR') : '-';
  setText('detail-created-info', `${dataCriacao} — ${work ? work.title : 'sem obra vinculada'}`);
  const driveLink = document.getElementById('detail-drive-link');
  if (driveLink) driveLink.href = demand.drive || '#';
  const statusBadge = document.getElementById('detail-status-badge');
  if (statusBadge) { statusBadge.className = `status-badge ${statusMap[demand.status] || 's-gray'}`; statusBadge.textContent = demand.status; }
  const btnStatus = document.getElementById('detail-status-btn');
  const btnDelete = document.getElementById('detail-delete-btn');
  if (btnStatus) { btnStatus.onclick = () => openStatusModal(id); btnStatus.style.display = isAdminRole() ? 'inline-flex' : 'none'; }
  if (btnDelete) { btnDelete.onclick = () => openDeleteModal(id); btnDelete.style.display = isAdminRole() ? 'inline-flex' : 'none'; }
  const structuralBtn = document.getElementById('detail-structural-btn');
  if (structuralBtn) structuralBtn.style.display = isAdminRole() ? 'inline-flex' : 'none';
  const attachmentsContainer = document.getElementById('detail-attachments-container');
  const alertEstrutural = document.getElementById('structural-alert');
  if (attachmentsContainer) {
    attachmentsContainer.innerHTML = buildAttachmentManager(demand);
    const structuralReturn = readDemandExtended(demand, 'alteracaoEstrutural', false) || demand.status === 'Correção' || demand.status === 'Arquitetura';
    if (alertEstrutural) alertEstrutural.style.display = structuralReturn ? 'flex' : 'none';
  }
  loadDemandHistory(id);
  loadDemandAlerts(demand);
};

setupUserInterface = async function() {
  if (!currentUser) {
    document.body.classList.replace('is-logged-in', 'is-logged-out');
    return;
  }
  const avatar = document.getElementById('sb-avatar');
  const name = document.getElementById('sb-name');
  const role = document.getElementById('sb-role');
  const badge = document.getElementById('sb-badge');
  if(avatar) {
    avatar.textContent = currentUser.initial || '??';
    avatar.className = `profile-avatar ${isAdminRole() || isMayorRole() ? 'avatar-admin' : 'avatar-colab'}`;
  }
  if(name) name.textContent = currentUser.name;
  const roleLabel = isAdminRole() ? 'Gestão' : (isMayorRole() ? 'Prefeito' : 'Membro Técnico');
  if(role) role.textContent = roleLabel;
  if(badge) { badge.textContent = roleLabel; badge.className = `profile-badge ${isAdminRole() || isMayorRole() ? 'badge-admin' : 'badge-colab'}`; }
  document.querySelectorAll('.admin-only').forEach(el => el.style.display = isAdminRole() ? 'flex' : 'none');
  document.querySelectorAll('.prefeito-only').forEach(el => el.style.display = isMayorRole() ? 'flex' : 'none');
  document.querySelectorAll('.colab-only').forEach(el => el.style.display = currentUser.role === 'colab' ? 'flex' : 'none');

  await fetchDemands();
  await fetchWorks();
  await loadTeamMembers();
  const sb = document.querySelector('.sidebar');
  const mn = document.querySelector('.main');
  if(sb) sb.style.display = 'flex';
  if(mn) mn.style.display = 'flex';
  await showScreen('works-dashboard');
};

// Reorganiza uploads no Storage por obra/demanda, mantendo a regra de acesso da demanda.
const originalSaveDemandAttachmentV8 = saveDemandAttachment;
saveDemandAttachment = async function(demandId, docId) {
  if (demands.length === 0) await fetchDemands();
  const demandIndex = demands.findIndex(d => String(d.id) === String(demandId));
  const demand = demands[demandIndex];
  if (!demand) return;
  if (!canCurrentUserUpload(demand)) return alert('Apenas usuário técnico atribuído a esta demanda pode anexar documentos.');
  const doc = findDocDefinition(demand.esp, docId);
  if (!doc) return alert('Item de documento não encontrado nesta categoria.');
  const fileInput = document.getElementById(`file-${docId}`);
  const linkInput = document.getElementById(`link-${docId}`);
  const file = fileInput?.files?.[0] || null;
  const manualLink = linkInput?.value?.trim() || '';
  if (!file && !manualLink) return alert('Selecione um arquivo ou cole um link do documento.');
  let fileUrl = manualLink;
  let fileName = manualLink ? 'Link externo' : '';
  let mimeType = '';
  let size = 0;
  if (file) {
    fileName = file.name;
    mimeType = file.type || '';
    size = file.size || 0;
    const safeName = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_');
    const wid = getDemandWorkId(demand) || 'sem_obra';
    const path = `obra_${wid}/demanda_${demandId}/${docId}/${Date.now()}_${safeName}`;
    const { error: uploadError } = await _supabase.storage.from('demand-files').upload(path, file, { upsert: true, contentType: file.type || undefined });
    if (uploadError) return alert('Erro ao enviar arquivo. Verifique o bucket demand-files no Supabase. Detalhe: ' + uploadError.message);
    const { data: publicData } = _supabase.storage.from('demand-files').getPublicUrl(path);
    fileUrl = publicData?.publicUrl || '';
  }
  const attachments = { ...readDemandAttachments(demand) };
  attachments[docId] = { docId, label: doc.label, groupTitle: doc.groupTitle, area: doc.area, fileName, url: fileUrl, mimeType, size, source: file ? 'upload' : 'link', uploadedBy: currentUser.name, uploadedById: currentUser.id, uploadedAt: new Date().toISOString() };
  const metadata = { ...getDemandMetadata(demand), anexos: attachments };
  let updatePayload = { metadata, anexos: attachments };
  let { error } = await _supabase.from('demands').update(updatePayload).eq('id', demandId);
  if (error) {
    const fallback = await _supabase.from('demands').update({ metadata }).eq('id', demandId);
    if (fallback.error) return alert('Erro ao salvar anexo: ' + fallback.error.message);
  }
  demands[demandIndex] = { ...demands[demandIndex], metadata, anexos: attachments };
  openDemandDetail(demandId);
};


/* ─────────────── CORREÇÕES SOLICITADAS — 2026-07-01 ───────────────
   1) Projeto Arquitetônico sem DFD/ETP automático.
   2) Nome da obra no painel "Minhas Demandas".
   3) Múltiplos arquivos por item de anexo, sem substituir o anterior.
   4) Edição posterior de obras e demandas pela gestão.
──────────────────────────────────────────────────────────────────── */

function normalizeAttachmentEntries(item) {
  if (!item) return [];
  if (Array.isArray(item)) return item.filter(entry => entry && entry.url);
  if (Array.isArray(item.files)) return item.files.filter(entry => entry && entry.url);
  if (item.url) return [item];
  return [];
}

function getAttachmentEntries(attachments, docId) {
  return normalizeAttachmentEntries((attachments || {})[docId]);
}

function flattenDemandAttachmentEntries(demand) {
  const attachments = readDemandAttachments(demand);
  const entries = [];
  Object.values(attachments || {}).forEach(value => {
    normalizeAttachmentEntries(value).forEach(item => entries.push(item));
  });
  return entries;
}

// Mantém compatibilidade com anexos antigos em objeto único e com o novo formato em lista.
readDemandAttachments = function(demand) {
  const md = getDemandMetadata(demand);
  const raw = demand?.anexos || md.anexos || {};
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch (e) { return {}; }
  }
  return raw && typeof raw === 'object' ? raw : {};
};

calculatePackageProgress = function(rule, demand = null) {
  const docs = flattenDocs(rule);
  const attachments = demand ? readDemandAttachments(demand) : {};
  const total = docs.length;
  const done = docs.filter(doc => getAttachmentEntries(attachments, doc.id).length > 0).length;
  return { total, done, percent: total ? Math.round((done / total) * 100) : 0 };
};

buildAttachmentManager = function(demand) {
  const rule = getDemandRule(demand.esp);
  const attachments = readDemandAttachments(demand);
  const canUpload = canCurrentUserUpload(demand);
  const summary = calculatePackageProgress(rule, demand);
  const intro = currentUser?.role === 'admin'
    ? 'Acompanhamento dos documentos anexados pelos responsáveis técnicos.'
    : (canUpload ? 'Envie um ou mais arquivos para cada item da categoria. Novos arquivos não substituem os anteriores.' : 'Consulta dos anexos desta demanda.');

  return `
    <div class="attachment-summary">
      <div>
        <strong>${summary.done}/${summary.total}</strong> itens com anexo
        <span>${escapeHtml(intro)}</span>
      </div>
      <div class="attachment-progress"><div style="width:${summary.percent}%"></div></div>
    </div>
    <div class="attachment-section-list">
      ${(rule.groups || []).map(group => `
        <div class="attachment-section-card ${group.area === 'DFD/ETP' ? 'is-priority-section' : ''}">
          <div class="attachment-section-head">
            <div>
              <div class="attachment-head-row"><span class="esp-tag">${escapeHtml(group.area)}</span>${group.area === 'DFD/ETP' ? '<span class="priority-pill">Início do fluxo</span>' : ''}</div>
              <h4>${escapeHtml(group.title)}</h4>
              ${group.desc ? `<p>${escapeHtml(group.desc)}</p>` : ''}
            </div>
            <span class="status-badge s-gray">${(group.docs || []).length} item(ns)</span>
          </div>
          <div class="attachment-items">
            ${(group.docs || []).map(doc => {
              const entries = getAttachmentEntries(attachments, doc.id);
              const hasFile = entries.length > 0;
              const listHtml = hasFile ? entries.map((item, idx) => `
                <div class="attachment-file-line">
                  <a href="${escapeHtml(item.url)}" target="_blank"><i class="fa-solid fa-arrow-up-right-from-square"></i> ${escapeHtml(item.fileName || `Arquivo ${idx + 1}`)}</a>
                  <small>${escapeHtml(item.uploadedBy || 'Usuário')} • ${item.uploadedAt ? new Date(item.uploadedAt).toLocaleDateString('pt-BR') : ''}</small>
                </div>
              `).join('') : '<div class="attachment-file-info muted">Nenhum arquivo anexado ainda.</div>';
              return `
                <div class="attachment-item ${hasFile ? 'is-done' : ''}">
                  <div class="attachment-item-info">
                    <div class="attachment-item-title">
                      <i class="fa-solid ${hasFile ? 'fa-circle-check' : 'fa-circle'}"></i>
                      ${escapeHtml(doc.label)}
                    </div>
                    ${doc.children ? `<div class="attachment-subitems">${doc.children.map(c => `<span>${escapeHtml(c)}</span>`).join('')}</div>` : ''}
                    <div class="attachment-file-info ${hasFile ? 'attachment-file-list' : 'muted'}">${listHtml}</div>
                  </div>
                  ${canUpload ? `
                    <div class="attachment-actions">
                      <input type="file" id="file-${doc.id}" class="form-input attachment-file-input" accept="${escapeHtml(doc.accept || '')}" multiple>
                      <input type="url" id="link-${doc.id}" class="form-input attachment-link-input" placeholder="ou cole um link externo...">
                      <button class="btn btn-primary btn-sm" onclick="saveDemandAttachment(${demand.id}, '${doc.id}')"><i class="fa-solid fa-upload"></i> Adicionar arquivo(s)</button>
                      <small class="form-hint">Você pode selecionar vários arquivos. Os anexos antigos serão preservados.</small>
                    </div>` : ''}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `;
};

saveDemandAttachment = async function(demandId, docId) {
  if (demands.length === 0) await fetchDemands();
  const demandIndex = demands.findIndex(d => String(d.id) === String(demandId));
  const demand = demands[demandIndex];
  if (!demand) return;
  if (!canCurrentUserUpload(demand)) return alert('Apenas usuário técnico atribuído a esta demanda pode anexar documentos.');

  const doc = findDocDefinition(demand.esp, docId);
  if (!doc) return alert('Item de documento não encontrado nesta categoria.');

  const fileInput = document.getElementById(`file-${docId}`);
  const linkInput = document.getElementById(`link-${docId}`);
  const files = Array.from(fileInput?.files || []);
  const manualLink = linkInput?.value?.trim() || '';
  if (!files.length && !manualLink) return alert('Selecione um arquivo ou cole um link do documento.');

  const newEntries = [];
  for (const file of files) {
    const safeName = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_');
    const wid = getDemandWorkId(demand) || 'sem_obra';
    const path = `obra_${wid}/demanda_${demandId}/${docId}/${Date.now()}_${safeName}`;
    const { error: uploadError } = await _supabase.storage
      .from('demand-files')
      .upload(path, file, { upsert: true, contentType: file.type || undefined });
    if (uploadError) return alert('Erro ao enviar arquivo. Verifique o bucket demand-files no Supabase. Detalhe: ' + uploadError.message);
    const { data: publicData } = _supabase.storage.from('demand-files').getPublicUrl(path);
    newEntries.push({
      docId,
      label: doc.label,
      groupTitle: doc.groupTitle,
      area: doc.area,
      fileName: file.name,
      url: publicData?.publicUrl || '',
      mimeType: file.type || '',
      size: file.size || 0,
      source: 'upload',
      uploadedBy: currentUser.name,
      uploadedById: currentUser.id,
      uploadedAt: new Date().toISOString()
    });
  }

  if (manualLink) {
    newEntries.push({
      docId,
      label: doc.label,
      groupTitle: doc.groupTitle,
      area: doc.area,
      fileName: 'Link externo',
      url: manualLink,
      mimeType: '',
      size: 0,
      source: 'link',
      uploadedBy: currentUser.name,
      uploadedById: currentUser.id,
      uploadedAt: new Date().toISOString()
    });
  }

  const attachments = { ...readDemandAttachments(demand) };
  const existingEntries = getAttachmentEntries(attachments, docId);
  attachments[docId] = [...existingEntries, ...newEntries];
  const metadata = { ...getDemandMetadata(demand), anexos: attachments };
  let updatePayload = { metadata, anexos: attachments };
  let { error } = await _supabase.from('demands').update(updatePayload).eq('id', demandId);
  if (error) {
    const fallback = await _supabase.from('demands').update({ metadata }).eq('id', demandId);
    if (fallback.error) return alert('Erro ao salvar anexo: ' + fallback.error.message);
  }

  await _supabase.from('demand_history').insert([{
    demand_id: demandId,
    user_id: currentUser.id,
    action_type: 'Anexo técnico',
    note: `${newEntries.length} arquivo(s)/link(s) adicionado(s) em ${doc.label}.`
  }]);

  demands[demandIndex] = { ...demands[demandIndex], metadata, anexos: attachments };
  alert(`${newEntries.length} arquivo(s)/link(s) salvo(s).`);
  openDemandDetail(demandId);
};

renderWorkDocuments = function(workId) {
  const container = document.getElementById('work-documents-list');
  if (!container) return;
  const linked = getWorkDemands(workId);
  const docs = [];
  linked.forEach(d => {
    flattenDemandAttachmentEntries(d).forEach(item => {
      if (item?.url) docs.push({ ...item, demandTitle: d.title, demandEsp: d.esp, demandId: d.id });
    });
  });
  if (!docs.length) {
    container.innerHTML = '<div class="package-empty"><i class="fa-solid fa-folder-open"></i> Nenhum documento anexado nesta obra até o momento.</div>';
    return;
  }
  container.innerHTML = docs.map(item => `
    <div class="work-doc-item">
      <div>
        <strong>${escapeHtml(item.label || item.fileName || 'Documento')}</strong>
        <span>${escapeHtml(item.demandEsp)} · ${escapeHtml(item.demandTitle)}</span>
        <small>${escapeHtml(item.uploadedBy || 'Usuário')} ${item.uploadedAt ? '· ' + new Date(item.uploadedAt).toLocaleDateString('pt-BR') : ''}</small>
      </div>
      <a class="btn btn-ghost btn-sm" href="${escapeHtml(item.url)}" target="_blank"><i class="fa-solid fa-arrow-up-right-from-square"></i> Abrir</a>
    </div>
  `).join('');
};

renderColabTable = function(data) {
  const tbody = document.getElementById('colab-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';
  data.forEach(d => {
    const work = works.find(w => String(w.id) === String(getDemandWorkId(d)));
    const dl = getDeadlineClass(d.prazo, d.status);
    const docs = calculatePackageProgress(getDemandRule(d.esp), d);
    const tr = document.createElement('tr');
    if (dl.cls === 'overdue' || dl.cls === 'due-soon') tr.className = 'urgent-row row-urgent-glow';
    tr.innerHTML = `
      <td>
        <div class="td-title" onclick="openDemandDetail(${d.id})">${escapeHtml(d.title)}</div>
        <div class="td-muted"><i class="fa-solid fa-building-circle-check"></i> ${work ? escapeHtml(work.title) : 'Sem obra vinculada'}</div>
        ${dl.extra ? `<div class="urgent-badge">${dl.cls==='overdue'?'<i class="fa-solid fa-triangle-exclamation"></i> ATRASADO':'<i class="fa-solid fa-clock"></i> Vence em 72h'}</div>` : ''}
      </td>
      <td><span class="esp-tag">${escapeHtml(d.esp)}</span></td>
      <td class="kcard-deadline ${dl.cls}">${escapeHtml(dl.label)}</td>
      <td><span class="status-badge ${statusMap[d.status] || 's-gray'}">${escapeHtml(d.status)}</span></td>
      <td>${work ? `<button class="btn btn-ghost btn-sm" onclick="openWorkDetail(${work.id})"><i class="fa-solid fa-folder-open"></i> ${docs.done}/${docs.total} anexos</button>` : `<a href="${escapeHtml(d.drive || '#')}" target="_blank" style="color:var(--accent);font-size:0.8rem;text-decoration:none"><i class="fa-brands fa-google-drive" style="color:#4285f4;margin-right:3px"></i>Abrir pasta</a>`}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="openDemandDetail(${d.id})"><i class="fa-solid fa-folder-open"></i> Abrir</button></td>
    `;
    tbody.appendChild(tr);
  });
};

function resetWorkFormMode() {
  editingWorkId = null;
  const title = document.querySelector('#screen-create-work h1');
  const desc = document.querySelector('#screen-create-work .hero-copy p');
  const btn = document.getElementById('save-work-btn');
  if (title) title.textContent = 'Nova obra';
  if (desc) desc.textContent = 'Cadastre a obra uma única vez. Depois, abra as demandas técnicas dentro dela.';
  if (btn) btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Cadastrar Obra';
}

async function openEditWork(id) {
  if (!isAdminRole()) return alert('Apenas a gestão pode editar obras.');
  await fetchWorks();
  const work = works.find(w => String(w.id) === String(id));
  if (!work) return alert('Obra não encontrada.');
  editingWorkId = id;
  await showScreen('create-work');
  const title = document.querySelector('#screen-create-work h1');
  const desc = document.querySelector('#screen-create-work .hero-copy p');
  const btn = document.getElementById('save-work-btn');
  if (title) title.textContent = 'Editar obra';
  if (desc) desc.textContent = 'Atualize as informações da obra cadastrada.';
  if (btn) btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar alterações';
  const setVal = (idField, value) => { const el = document.getElementById(idField); if (el) el.value = value ?? ''; };
  setVal('new-work-title', work.title);
  setVal('new-work-bairro', work.bairro || work.localizacao || '');
  setVal('new-work-processo', work.processo || work.processo_numero || '');
  setVal('new-work-status', work.status || 'Em planejamento');
  setVal('new-work-prioridade', work.prioridade || 'Normal');
  setVal('new-work-prazo', work.prazo_previsto || '');
  setVal('obra-valor', work.valor_estimado ? formatCurrencyBRL(String(work.valor_estimado).replace(/\D/g, '') || Number(work.valor_estimado).toFixed(2).replace('.', '')) : '');
  setVal('new-work-objeto', work.objeto || '');
  setVal('new-work-obs', work.obs || '');
}

saveWork = async function() {
  if (!isAdminRole()) return alert('Apenas a gestão pode cadastrar ou editar obras.');
  const title = getFieldValue('new-work-title');
  const titleEl = document.getElementById('new-work-title');
  const titleError = document.getElementById('error-new-work-title');
  titleEl?.classList.remove('is-invalid');
  if (titleError) titleError.style.display = 'none';
  if (!title) {
    titleEl?.classList.add('is-invalid');
    if (titleError) { titleError.textContent = 'Nome da obra é obrigatório.'; titleError.style.display = 'block'; }
    return;
  }
  const payload = {
    title,
    bairro: getFieldValue('new-work-bairro'),
    processo: getFieldValue('new-work-processo'),
    status: getFieldValue('new-work-status') || 'Em planejamento',
    prioridade: getFieldValue('new-work-prioridade') || 'Normal',
    prazo_previsto: getFieldValue('new-work-prazo') || null,
    valor_estimado: parseCurrencyToNumber(document.getElementById('obra-valor')?.value),
    objeto: getFieldValue('new-work-objeto'),
    obs: getFieldValue('new-work-obs')
  };

  if (editingWorkId) {
    const { data, error } = await _supabase.from('works').update(payload).eq('id', editingWorkId).select();
    if (error) return alert('Erro ao atualizar obra: ' + error.message);
    const idx = works.findIndex(w => String(w.id) === String(editingWorkId));
    if (idx !== -1 && data?.[0]) works[idx] = data[0];
    const id = editingWorkId;
    resetWorkFormMode();
    await openWorkDetail(id);
    return;
  }

  const insertPayload = { ...payload, created_by: currentUser.id, metadata: {} };
  const { data, error } = await _supabase.from('works').insert([insertPayload]).select();
  if (error) return alert('Erro ao cadastrar obra: ' + error.message + '\n\nExecute o SQL da versão v8 no Supabase.');
  works.unshift(data[0]);
  ['new-work-title','new-work-bairro','new-work-processo','new-work-prazo','obra-valor','new-work-objeto','new-work-obs'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  await loadWorksSelect(data[0].id);
  await openWorkDetail(data[0].id);
};

function resetDemandFormMode() {
  editingDemandFormId = null;
  const title = document.querySelector('#screen-create-demand h1');
  const desc = document.querySelector('#screen-create-demand .hero-copy p');
  const draftBtn = document.getElementById('save-demand-draft-btn');
  const assignBtn = document.getElementById('save-demand-assign-btn');
  if (title) title.textContent = 'Nova demanda técnica';
  if (desc) desc.textContent = 'Preencha os dados da solicitação, defina responsáveis e acompanhe os anexos por categoria.';
  if (draftBtn) draftBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar Rascunho';
  if (assignBtn) assignBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Criar e Atribuir';
}

async function openEditDemand(id) {
  if (!isAdminRole()) return alert('Apenas a gestão pode editar demandas.');
  await fetchDemands();
  await fetchWorks();
  const demand = demands.find(d => String(d.id) === String(id));
  if (!demand) return alert('Demanda não encontrada.');
  editingDemandFormId = id;
  const workId = getDemandWorkId(demand);
  currentWorkId = workId;
  await showScreen('create-demand');
  await loadTeamMembers();
  await loadWorksSelect(workId);

  const setVal = (idField, value) => { const el = document.getElementById(idField); if (el) el.value = value ?? ''; };
  setVal('new-demand-work', workId || '');
  setVal('new-demand-title', demand.title || '');
  setVal('new-demand-esp', demand.esp || '');
  setVal('new-demand-prioridade', readDemandExtended(demand, 'prioridade', demand.prioridade || 'Normal'));
  setVal('new-demand-processo', readDemandExtended(demand, 'processo', demand.processo_numero || ''));
  setVal('new-demand-prazo', demand.prazo || '');
  setVal('new-demand-status', demand.status || 'Triagem');
  setVal('new-demand-drive', demand.drive || '');
  setVal('new-demand-obs', demand.obs || '');
  const structural = document.getElementById('new-demand-structural-change');
  if (structural) structural.checked = !!readDemandExtended(demand, 'alteracaoEstrutural', false);
  const selectedRespIds = new Set(getDemandResponsaveis(demand).map(r => String(r.id || r.user_id || '')));
  const respEl = document.getElementById('new-demand-resp');
  if (respEl) Array.from(respEl.options).forEach(opt => opt.selected = selectedRespIds.has(String(opt.value)));
  renderNewDemandPackagePreview();
  setVal('new-demand-status', demand.status || 'Triagem');
  const title = document.querySelector('#screen-create-demand h1');
  const desc = document.querySelector('#screen-create-demand .hero-copy p');
  const draftBtn = document.getElementById('save-demand-draft-btn');
  const assignBtn = document.getElementById('save-demand-assign-btn');
  if (title) title.textContent = 'Editar demanda técnica';
  if (desc) desc.textContent = 'Atualize categoria, prazo, responsáveis e demais informações da demanda.';
  if (draftBtn) draftBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar alterações';
  if (assignBtn) assignBtn.innerHTML = '<i class="fa-solid fa-check"></i> Atualizar demanda';
}

async function updateDemandWithFallback(demandId, payload) {
  const { data, error } = await _supabase.from('demands').update(payload).eq('id', demandId).select();
  if (!error) return { data, error };
  const msg = String(error.message || '').toLowerCase();
  const isSchemaError = msg.includes('column') || msg.includes('schema cache') || msg.includes('could not find');
  if (!isSchemaError) return { data, error };
  const basePayload = { ...payload };
  const extras = {};
  [...DEMAND_OPTIONAL_COLUMNS, 'work_id'].forEach(column => {
    if (Object.prototype.hasOwnProperty.call(basePayload, column)) {
      extras[column] = basePayload[column];
      delete basePayload[column];
    }
  });
  basePayload.obs = appendFallbackExtras(basePayload.obs, extras);
  return await _supabase.from('demands').update(basePayload).eq('id', demandId).select();
}

saveDemand = async function(assign) {
  const responsaveisSelecionados = getSelectedResponsaveis();
  const selectedWorkId = getFieldValue('new-demand-work');
  const formFields = [
    { id: 'new-demand-work', value: selectedWorkId, required: true, name: 'Obra vinculada' },
    { id: 'new-demand-title', value: getFieldValue('new-demand-title'), required: true, name: 'Título da Demanda' },
    { id: 'new-demand-esp', value: getFieldValue('new-demand-esp'), required: true, name: 'Categoria Principal da Demanda' },
    { id: 'new-demand-resp', value: responsaveisSelecionados.length ? 'ok' : '', required: true, name: 'Responsáveis Técnicos' },
    { id: 'new-demand-prazo', value: getFieldValue('new-demand-prazo'), required: true, name: 'Prazo Final' }
  ];
  let isValid = true;
  let firstInvalidField = null;
  formFields.forEach(field => {
    const inputElement = document.getElementById(field.id);
    const errorElement = document.getElementById(`error-${field.id}`);
    inputElement?.classList.remove('is-invalid');
    if (errorElement) errorElement.style.display = 'none';
    if (field.required && !field.value) {
      if (isValid) firstInvalidField = inputElement;
      isValid = false;
      inputElement?.classList.add('is-invalid');
      if (errorElement) { errorElement.textContent = `${field.name} é obrigatório.`; errorElement.style.display = 'block'; }
    }
  });
  if (!isValid) {
    firstInvalidField?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => firstInvalidField?.focus(), 400);
    alert('Preencha os campos obrigatórios antes de salvar a demanda.');
    return;
  }

  const primaryResp = responsaveisSelecionados[0];
  const existing = editingDemandFormId ? demands.find(d => String(d.id) === String(editingDemandFormId)) : null;
  const existingAttachments = existing ? readDemandAttachments(existing) : {};
  const metadata = {
    ...(existing ? getDemandMetadata(existing) : {}),
    ...buildMetadataFromForm(),
    work_id: Number(selectedWorkId),
    obra_id: Number(selectedWorkId),
    anexos: existingAttachments
  };
  const payload = {
    title: getFieldValue('new-demand-title'),
    esp: getFieldValue('new-demand-esp'),
    resp: responsaveisSelecionados.map(r => r.name).join(', '),
    resp_id: primaryResp.id,
    prazo: getFieldValue('new-demand-prazo'),
    status: editingDemandFormId ? getFieldValue('new-demand-status') : (assign ? getFieldValue('new-demand-status') : 'Triagem'),
    drive: getFieldValue('new-demand-drive'),
    obs: getFieldValue('new-demand-obs'),
    work_id: Number(selectedWorkId),
    ...extendedColumnsFromMetadata(metadata)
  };

  if (editingDemandFormId) {
    const { data, error } = await updateDemandWithFallback(editingDemandFormId, payload);
    if (error) return alert('Erro ao atualizar demanda: ' + error.message);
    const idx = demands.findIndex(d => String(d.id) === String(editingDemandFormId));
    if (idx !== -1 && data?.[0]) demands[idx] = data[0];
    await _supabase.from('demand_history').insert([{
      demand_id: editingDemandFormId,
      user_id: currentUser.id,
      action_type: 'Demanda editada',
      note: `Dados da demanda atualizados pela gestão. Categoria: ${getDemandRule(payload.esp).label}. Responsáveis: ${responsaveisSelecionados.map(r => r.label).join(', ')}.`
    }]);
    const workId = Number(selectedWorkId);
    resetDemandFormMode();
    await openWorkDetail(workId);
    return;
  }

  const insertPayload = { ...payload, created_by: currentUser.id };
  const { data, error } = await insertDemandWithFallback(insertPayload);
  if (error) {
    console.error('Erro ao salvar nova demanda:', error.message);
    alert('Erro ao salvar nova demanda: ' + error.message + '\n\nConfira se o SQL v8 foi executado.');
    return;
  }
  if (data && data[0]) {
    await _supabase.from('demand_history').insert([{
      demand_id: data[0].id,
      user_id: currentUser.id,
      action_type: 'Demanda registrada',
      note: `Demanda vinculada à obra #${selectedWorkId}. Categoria: ${getDemandRule(data[0].esp).label}. Responsáveis: ${responsaveisSelecionados.map(r => r.label).join(', ')}.`
    }]);
    demands.unshift(data[0]);
  }
  ['new-demand-title','new-demand-esp','new-demand-prazo','new-demand-drive','new-demand-obs','new-demand-processo'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const respEl = document.getElementById('new-demand-resp');
  if (respEl) Array.from(respEl.options).forEach(opt => opt.selected = false);
  const statusEl = document.getElementById('new-demand-status');
  if (statusEl) statusEl.value = 'Triagem';
  const prioridadeEl = document.getElementById('new-demand-prioridade');
  if (prioridadeEl) prioridadeEl.value = 'Normal';
  const structural = document.getElementById('new-demand-structural-change');
  if (structural) structural.checked = false;
  renderNewDemandPackagePreview();
  if (selectedWorkId) await openWorkDetail(selectedWorkId);
};

// Reabre detalhe da obra com botão de edição da gestão.
const openWorkDetailWithEdit = openWorkDetail;
openWorkDetail = async function(id) {
  await openWorkDetailWithEdit(id);
  const editBtn = document.getElementById('work-detail-edit');
  if (editBtn) {
    editBtn.style.display = isAdminRole() ? 'inline-flex' : 'none';
    editBtn.onclick = () => openEditWork(id);
  }
};

// Reabre detalhe da demanda com botão de edição da gestão.
const openDemandDetailWithEdit = openDemandDetail;
openDemandDetail = async function(id) {
  await openDemandDetailWithEdit(id);
  const editBtn = document.getElementById('detail-edit-btn');
  if (editBtn) {
    editBtn.style.display = isAdminRole() ? 'inline-flex' : 'none';
    editBtn.onclick = () => openEditDemand(id);
  }
};

printDemandDossier = function() {
  if (editingDemandId === null) return;
  const demand = demands.find(d => d.id === editingDemandId);
  if (!demand) return;
  const rule = getDemandRule(demand.esp);
  const attachments = readDemandAttachments(demand);
  const created = demand.created_at ? new Date(demand.created_at).toLocaleDateString('pt-BR') : '-';
  const summary = calculatePackageProgress(rule, demand);
  const packageHtml = (rule.groups || []).map(group => `
    <h3>${escapeHtml(group.area)} — ${escapeHtml(group.title)}</h3>
    ${group.desc ? `<p class="muted">${escapeHtml(group.desc)}</p>` : ''}
    <ul>${(group.docs || []).map(doc => {
      const entries = getAttachmentEntries(attachments, doc.id);
      const children = doc.children ? ` <span class="muted">(${doc.children.map(escapeHtml).join(' · ')})</span>` : '';
      const links = entries.length ? ' — ' + entries.map((item, idx) => `<a href="${escapeHtml(item.url)}">${escapeHtml(item.fileName || `Arquivo ${idx + 1}`)}</a>`).join(' | ') : ' — pendente';
      return `<li><strong>${escapeHtml(doc.label)}</strong>${children}${links}</li>`;
    }).join('')}</ul>
  `).join('');
  const html = `
    <html><head><title>Dossiê Técnico</title>
    <style>body{font-family:Arial,sans-serif;color:#111;line-height:1.45;margin:32px} h1{font-size:22px;margin-bottom:4px} h2{font-size:16px;border-bottom:1px solid #ddd;padding-bottom:6px;margin-top:22px} h3{font-size:14px;margin-bottom:4px}.muted{color:#555;font-size:12px}.row{margin:6px 0}.label{font-weight:bold}.box{border:1px solid #ddd;padding:12px;border-radius:8px;margin:10px 0} ul{margin-top:4px} a{color:#0645ad} @media print{button{display:none}}</style>
    </head><body>
      <button onclick="window.print()" style="float:right;padding:8px 12px">Imprimir</button>
      <h1>${escapeHtml(demand.title)}</h1>
      <div class="muted">Dossiê técnico gerado pela SIEDU em ${new Date().toLocaleDateString('pt-BR')}</div>
      <div class="box">
        <div class="row"><span class="label">Pacote:</span> ${escapeHtml(rule.label)}</div>
        <div class="row"><span class="label">Responsáveis:</span> ${escapeHtml(getResponsibleDisplay(demand))}</div>
        <div class="row"><span class="label">Prazo:</span> ${escapeHtml(utils.formatDate(demand.prazo) || '-')}</div>
        <div class="row"><span class="label">Status:</span> ${escapeHtml(demand.status || '-')}</div>
        <div class="row"><span class="label">Prioridade:</span> ${escapeHtml(readDemandExtended(demand, 'prioridade', 'Normal'))}</div>
        <div class="row"><span class="label">Processo:</span> ${escapeHtml(readDemandExtended(demand, 'processo', '-'))}</div>
        <div class="row"><span class="label">Criado em:</span> ${created}</div>
        <div class="row"><span class="label">Anexos:</span> ${summary.done}/${summary.total} itens com anexo</div>
      </div>
      <h2>Anexos Técnicos por Categoria</h2>${packageHtml}
      <h2>Observações gerais</h2><div class="box">${escapeHtml(demand.obs || '-')}</div>
    </body></html>`;
  const printWindow = window.open('', '_blank');
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
};

// Garante que uma nova demanda aberta pela tela da obra não reaproveite modo de edição anterior.
const startDemandForWorkBaseFinal = startDemandForWork;
startDemandForWork = async function(id) {
  resetDemandFormMode();
  await startDemandForWorkBaseFinal(id);
};

/* ─────────────── CORREÇÃO — PERMISSÕES PARA ARQUITETOS/ENGENHEIROS ───────────────
   Permite que técnicos atribuídos à demanda façam edição de dados, status e anexos.
   A exclusão da demanda inteira continua restrita à gestão para evitar perda acidental.
──────────────────────────────────────────────────────────────────────────────── */
function isTechnicalRole() {
  return currentUser?.role === 'colab';
}

function canCurrentUserManageDemand(demand) {
  if (!currentUser || !demand) return false;
  if (isAdminRole()) return true;
  return isTechnicalRole() && isAssignedToDemand(demand, currentUser.id);
}

function canCurrentUserManageWork(workId) {
  if (!currentUser || !workId) return false;
  if (isAdminRole()) return true;
  return isTechnicalRole() && getWorkDemands(workId).some(d => isAssignedToDemand(d, currentUser.id));
}

function canCurrentUserDeleteDemand(demand) {
  return isAdminRole();
}

canCurrentUserUpload = function(demand) {
  return canCurrentUserManageDemand(demand);
};

function getStoragePathFromAttachment(item) {
  if (!item) return '';
  if (item.path) return item.path;
  if (!item.url) return '';
  try {
    const url = new URL(item.url);
    const marker = '/storage/v1/object/public/demand-files/';
    const idx = url.pathname.indexOf(marker);
    if (idx >= 0) return decodeURIComponent(url.pathname.slice(idx + marker.length));
  } catch (e) {}
  return '';
}

function updateDemandAttachmentLocal(demandId, attachments) {
  const demandIndex = demands.findIndex(d => String(d.id) === String(demandId));
  if (demandIndex === -1) return;
  const demand = demands[demandIndex];
  const metadata = { ...getDemandMetadata(demand), anexos: attachments };
  demands[demandIndex] = { ...demand, metadata, anexos: attachments };
}

async function persistDemandAttachments(demandId, attachments, historyNote) {
  const demandIndex = demands.findIndex(d => String(d.id) === String(demandId));
  const demand = demands[demandIndex];
  if (!demand) return { error: { message: 'Demanda não encontrada.' } };
  const metadata = { ...getDemandMetadata(demand), anexos: attachments };
  let { error } = await _supabase.from('demands').update({ metadata, anexos: attachments }).eq('id', demandId);
  if (error) {
    const fallback = await _supabase.from('demands').update({ metadata }).eq('id', demandId);
    if (fallback.error) return { error: fallback.error };
  }
  updateDemandAttachmentLocal(demandId, attachments);
  if (historyNote) {
    await _supabase.from('demand_history').insert([{
      demand_id: demandId,
      user_id: currentUser.id,
      action_type: 'Anexo alterado',
      note: historyNote
    }]);
  }
  return { error: null };
}

async function deleteDemandAttachment(demandId, docId, index) {
  if (demands.length === 0) await fetchDemands();
  const demand = demands.find(d => String(d.id) === String(demandId));
  if (!demand) return alert('Demanda não encontrada.');
  if (!canCurrentUserManageDemand(demand)) return alert('Você não tem permissão para excluir arquivos desta demanda.');
  const attachments = { ...readDemandAttachments(demand) };
  const entries = getAttachmentEntries(attachments, docId);
  const item = entries[index];
  if (!item) return alert('Arquivo não encontrado.');
  const ok = confirm(`Excluir o arquivo/link "${item.fileName || 'Anexo'}" desta demanda?`);
  if (!ok) return;

  const storagePath = getStoragePathFromAttachment(item);
  if (storagePath && item.source !== 'link') {
    await _supabase.storage.from('demand-files').remove([storagePath]);
  }

  const remaining = entries.filter((_, idx) => idx !== index);
  if (remaining.length) attachments[docId] = remaining;
  else delete attachments[docId];
  const result = await persistDemandAttachments(demandId, attachments, `Arquivo removido: ${item.fileName || 'Anexo'}.`);
  if (result.error) return alert('Erro ao excluir anexo: ' + result.error.message);
  alert('Arquivo removido com sucesso.');
  openDemandDetail(demandId);
}

async function renameDemandAttachment(demandId, docId, index) {
  if (demands.length === 0) await fetchDemands();
  const demand = demands.find(d => String(d.id) === String(demandId));
  if (!demand) return alert('Demanda não encontrada.');
  if (!canCurrentUserManageDemand(demand)) return alert('Você não tem permissão para alterar arquivos desta demanda.');
  const attachments = { ...readDemandAttachments(demand) };
  const entries = getAttachmentEntries(attachments, docId);
  const item = entries[index];
  if (!item) return alert('Arquivo não encontrado.');
  const newName = prompt('Novo nome para exibição do arquivo:', item.fileName || '');
  if (newName === null) return;
  const trimmed = newName.trim();
  if (!trimmed) return alert('Informe um nome válido.');
  entries[index] = { ...item, fileName: trimmed, editedBy: currentUser.name, editedById: currentUser.id, editedAt: new Date().toISOString() };
  attachments[docId] = entries;
  const result = await persistDemandAttachments(demandId, attachments, `Nome do anexo alterado para: ${trimmed}.`);
  if (result.error) return alert('Erro ao renomear anexo: ' + result.error.message);
  openDemandDetail(demandId);
}

async function editDemandAttachmentLink(demandId, docId, index) {
  if (demands.length === 0) await fetchDemands();
  const demand = demands.find(d => String(d.id) === String(demandId));
  if (!demand) return alert('Demanda não encontrada.');
  if (!canCurrentUserManageDemand(demand)) return alert('Você não tem permissão para alterar links desta demanda.');
  const attachments = { ...readDemandAttachments(demand) };
  const entries = getAttachmentEntries(attachments, docId);
  const item = entries[index];
  if (!item) return alert('Link não encontrado.');
  const newUrl = prompt('Novo link do documento:', item.url || '');
  if (newUrl === null) return;
  const trimmed = newUrl.trim();
  if (!trimmed) return alert('Informe um link válido.');
  entries[index] = { ...item, url: trimmed, source: 'link', editedBy: currentUser.name, editedById: currentUser.id, editedAt: new Date().toISOString() };
  attachments[docId] = entries;
  const result = await persistDemandAttachments(demandId, attachments, `Link do anexo alterado: ${item.fileName || 'Link externo'}.`);
  if (result.error) return alert('Erro ao editar link: ' + result.error.message);
  openDemandDetail(demandId);
}

buildAttachmentManager = function(demand) {
  const rule = getDemandRule(demand.esp);
  const attachments = readDemandAttachments(demand);
  const canManage = canCurrentUserManageDemand(demand);
  const summary = calculatePackageProgress(rule, demand);
  const intro = canManage
    ? 'Você pode adicionar, renomear, editar links e excluir anexos desta demanda.'
    : 'Consulta dos anexos desta demanda.';

  return `
    <div class="attachment-summary">
      <div>
        <strong>${summary.done}/${summary.total}</strong> itens com anexo
        <span>${escapeHtml(intro)}</span>
      </div>
      <div class="attachment-progress"><div style="width:${summary.percent}%"></div></div>
    </div>
    <div class="attachment-section-list">
      ${(rule.groups || []).map(group => `
        <div class="attachment-section-card ${group.area === 'DFD/ETP' ? 'is-priority-section' : ''}">
          <div class="attachment-section-head">
            <div>
              <div class="attachment-head-row"><span class="esp-tag">${escapeHtml(group.area)}</span>${group.area === 'DFD/ETP' ? '<span class="priority-pill">Início do fluxo</span>' : ''}</div>
              <h4>${escapeHtml(group.title)}</h4>
              ${group.desc ? `<p>${escapeHtml(group.desc)}</p>` : ''}
            </div>
            <span class="status-badge s-gray">${(group.docs || []).length} item(ns)</span>
          </div>
          <div class="attachment-items">
            ${(group.docs || []).map(doc => {
              const entries = getAttachmentEntries(attachments, doc.id);
              const hasFile = entries.length > 0;
              const listHtml = hasFile ? entries.map((item, idx) => `
                <div class="attachment-file-line">
                  <div class="attachment-file-main">
                    <a href="${escapeHtml(item.url)}" target="_blank"><i class="fa-solid fa-arrow-up-right-from-square"></i> ${escapeHtml(item.fileName || `Arquivo ${idx + 1}`)}</a>
                    <small>${escapeHtml(item.uploadedBy || 'Usuário')} • ${item.uploadedAt ? new Date(item.uploadedAt).toLocaleDateString('pt-BR') : ''}${item.editedAt ? ' • editado em ' + new Date(item.editedAt).toLocaleDateString('pt-BR') : ''}</small>
                  </div>
                  ${canManage ? `
                    <div class="attachment-file-actions">
                      <button class="btn btn-ghost btn-xs" onclick="renameDemandAttachment(${demand.id}, '${doc.id}', ${idx})"><i class="fa-solid fa-i-cursor"></i> Renomear</button>
                      ${item.source === 'link' ? `<button class="btn btn-ghost btn-xs" onclick="editDemandAttachmentLink(${demand.id}, '${doc.id}', ${idx})"><i class="fa-solid fa-link"></i> Editar link</button>` : ''}
                      <button class="btn btn-ghost btn-xs btn-danger" onclick="deleteDemandAttachment(${demand.id}, '${doc.id}', ${idx})"><i class="fa-solid fa-trash"></i> Excluir</button>
                    </div>` : ''}
                </div>
              `).join('') : '<div class="attachment-file-info muted">Nenhum arquivo anexado ainda.</div>';
              return `
                <div class="attachment-item ${hasFile ? 'is-done' : ''}">
                  <div class="attachment-item-info">
                    <div class="attachment-item-title">
                      <i class="fa-solid ${hasFile ? 'fa-circle-check' : 'fa-circle'}"></i>
                      ${escapeHtml(doc.label)}
                    </div>
                    ${doc.children ? `<div class="attachment-subitems">${doc.children.map(c => `<span>${escapeHtml(c)}</span>`).join('')}</div>` : ''}
                    <div class="attachment-file-info ${hasFile ? 'attachment-file-list' : 'muted'}">${listHtml}</div>
                  </div>
                  ${canManage ? `
                    <div class="attachment-actions">
                      <input type="file" id="file-${doc.id}" class="form-input attachment-file-input" accept="${escapeHtml(doc.accept || '')}" multiple>
                      <input type="url" id="link-${doc.id}" class="form-input attachment-link-input" placeholder="ou cole um link externo...">
                      <button class="btn btn-primary btn-sm" onclick="saveDemandAttachment(${demand.id}, '${doc.id}')"><i class="fa-solid fa-upload"></i> Adicionar arquivo(s)</button>
                      <small class="form-hint">Arquitetos/engenheiros atribuídos podem adicionar, alterar ou remover anexos.</small>
                    </div>` : ''}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `;
};

const saveDemandAttachmentTechBase = saveDemandAttachment;
saveDemandAttachment = async function(demandId, docId) {
  if (demands.length === 0) await fetchDemands();
  const demand = demands.find(d => String(d.id) === String(demandId));
  if (!demand) return alert('Demanda não encontrada.');
  if (!canCurrentUserManageDemand(demand)) return alert('Você não tem permissão para anexar documentos nesta demanda.');

  const doc = findDocDefinition(demand.esp, docId);
  if (!doc) return alert('Item de documento não encontrado nesta categoria.');

  const fileInput = document.getElementById(`file-${docId}`);
  const linkInput = document.getElementById(`link-${docId}`);
  const files = Array.from(fileInput?.files || []);
  const manualLink = linkInput?.value?.trim() || '';
  if (!files.length && !manualLink) return alert('Selecione um arquivo ou cole um link do documento.');

  const newEntries = [];
  for (const file of files) {
    const safeName = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_');
    const wid = getDemandWorkId(demand) || 'sem_obra';
    const path = `obra_${wid}/demanda_${demandId}/${docId}/${Date.now()}_${safeName}`;
    const { error: uploadError } = await _supabase.storage
      .from('demand-files')
      .upload(path, file, { upsert: true, contentType: file.type || undefined });
    if (uploadError) return alert('Erro ao enviar arquivo. Verifique o bucket demand-files no Supabase. Detalhe: ' + uploadError.message);
    const { data: publicData } = _supabase.storage.from('demand-files').getPublicUrl(path);
    newEntries.push({
      docId,
      label: doc.label,
      groupTitle: doc.groupTitle,
      area: doc.area,
      fileName: file.name,
      url: publicData?.publicUrl || '',
      path,
      mimeType: file.type || '',
      size: file.size || 0,
      source: 'upload',
      uploadedBy: currentUser.name,
      uploadedById: currentUser.id,
      uploadedAt: new Date().toISOString()
    });
  }

  if (manualLink) {
    newEntries.push({
      docId,
      label: doc.label,
      groupTitle: doc.groupTitle,
      area: doc.area,
      fileName: 'Link externo',
      url: manualLink,
      mimeType: '',
      size: 0,
      source: 'link',
      uploadedBy: currentUser.name,
      uploadedById: currentUser.id,
      uploadedAt: new Date().toISOString()
    });
  }

  const attachments = { ...readDemandAttachments(demand) };
  const existingEntries = getAttachmentEntries(attachments, docId);
  attachments[docId] = [...existingEntries, ...newEntries];
  const result = await persistDemandAttachments(demandId, attachments, `${newEntries.length} arquivo(s)/link(s) adicionado(s) em ${doc.label}.`);
  if (result.error) return alert('Erro ao salvar anexo: ' + result.error.message);
  alert(`${newEntries.length} arquivo(s)/link(s) salvo(s).`);
  openDemandDetail(demandId);
};

const showScreenRestrictedBase = showScreen;
showScreen = async function(name, navItem) {
  const editingDemandAllowed = name === 'create-demand'
    && editingDemandFormId
    && demands.some(d => String(d.id) === String(editingDemandFormId) && canCurrentUserManageDemand(d));
  const editingWorkAllowed = name === 'create-work'
    && editingWorkId
    && canCurrentUserManageWork(editingWorkId);

  if ((name === 'create-demand' && editingDemandAllowed) || (name === 'create-work' && editingWorkAllowed)) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById('screen-' + name);
    if (target) target.classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    if (navItem) navItem.classList.add('active');
    const titles = {
      ...screenTitles,
      'create-demand': ['Editar Demanda', 'Atualização técnica da solicitação'],
      'create-work': ['Editar Obra', 'Atualização das informações gerais']
    }[name] || [name, ''];
    const titleEl = document.getElementById('topbar-title');
    if(titleEl) titleEl.innerHTML = titles[0] + ' <span id="topbar-sub">' + titles[1] + '</span>';
    await fetchDemands();
    await fetchWorks();
    if (name === 'create-demand') await loadWorksSelect(currentWorkId);
    const notifPanel = document.getElementById('notif-panel');
    if(notifPanel) notifPanel.classList.remove('open');
    return;
  }

  return showScreenRestrictedBase(name, navItem);
};

openEditWork = async function(id) {
  await fetchDemands();
  await fetchWorks();
  if (!canCurrentUserManageWork(id)) return alert('Você não tem permissão para editar esta obra.');
  const work = works.find(w => String(w.id) === String(id));
  if (!work) return alert('Obra não encontrada.');
  editingWorkId = id;
  await showScreen('create-work');
  const title = document.querySelector('#screen-create-work h1');
  const desc = document.querySelector('#screen-create-work .hero-copy p');
  const btn = document.getElementById('save-work-btn');
  if (title) title.textContent = 'Editar obra';
  if (desc) desc.textContent = 'Atualize as informações da obra cadastrada.';
  if (btn) btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar alterações';
  const setVal = (idField, value) => { const el = document.getElementById(idField); if (el) el.value = value ?? ''; };
  setVal('new-work-title', work.title);
  setVal('new-work-bairro', work.bairro || work.localizacao || '');
  setVal('new-work-processo', work.processo || work.processo_numero || '');
  setVal('new-work-status', work.status || 'Em planejamento');
  setVal('new-work-prioridade', work.prioridade || 'Normal');
  setVal('new-work-prazo', work.prazo_previsto || '');
  setVal('obra-valor', work.valor_estimado ? formatCurrencyBRL(String(work.valor_estimado).replace(/\D/g, '') || Number(work.valor_estimado).toFixed(2).replace('.', '')) : '');
  setVal('new-work-objeto', work.objeto || '');
  setVal('new-work-obs', work.obs || '');
};

const saveWorkTechBase = saveWork;
saveWork = async function() {
  if (editingWorkId && !canCurrentUserManageWork(editingWorkId)) {
    return alert('Você não tem permissão para editar esta obra.');
  }
  if (!editingWorkId && !isAdminRole()) {
    return alert('Apenas a gestão pode cadastrar novas obras.');
  }
  if (editingWorkId) {
    const title = getFieldValue('new-work-title');
    const titleEl = document.getElementById('new-work-title');
    const titleError = document.getElementById('error-new-work-title');
    titleEl?.classList.remove('is-invalid');
    if (titleError) titleError.style.display = 'none';
    if (!title) {
      titleEl?.classList.add('is-invalid');
      if (titleError) { titleError.textContent = 'Nome da obra é obrigatório.'; titleError.style.display = 'block'; }
      return;
    }
    const payload = {
      title,
      bairro: getFieldValue('new-work-bairro'),
      processo: getFieldValue('new-work-processo'),
      status: getFieldValue('new-work-status') || 'Em planejamento',
      prioridade: getFieldValue('new-work-prioridade') || 'Normal',
      prazo_previsto: getFieldValue('new-work-prazo') || null,
      valor_estimado: parseCurrencyToNumber(document.getElementById('obra-valor')?.value),
      objeto: getFieldValue('new-work-objeto'),
      obs: getFieldValue('new-work-obs')
    };
    const { data, error } = await _supabase.from('works').update(payload).eq('id', editingWorkId).select();
    if (error) return alert('Erro ao atualizar obra: ' + error.message);
    const idx = works.findIndex(w => String(w.id) === String(editingWorkId));
    if (idx !== -1 && data?.[0]) works[idx] = data[0];
    const id = editingWorkId;
    resetWorkFormMode();
    await openWorkDetail(id);
    return;
  }
  return saveWorkTechBase();
};

openEditDemand = async function(id) {
  await fetchDemands();
  await fetchWorks();
  const demand = demands.find(d => String(d.id) === String(id));
  if (!demand) return alert('Demanda não encontrada.');
  if (!canCurrentUserManageDemand(demand)) return alert('Você não tem permissão para editar esta demanda.');
  editingDemandFormId = id;
  const workId = getDemandWorkId(demand);
  currentWorkId = workId;
  await showScreen('create-demand');
  await loadTeamMembers();
  await loadWorksSelect(workId);

  const setVal = (idField, value) => { const el = document.getElementById(idField); if (el) el.value = value ?? ''; };
  setVal('new-demand-work', workId || '');
  setVal('new-demand-title', demand.title || '');
  setVal('new-demand-esp', demand.esp || '');
  setVal('new-demand-prioridade', readDemandExtended(demand, 'prioridade', demand.prioridade || 'Normal'));
  setVal('new-demand-processo', readDemandExtended(demand, 'processo', demand.processo_numero || ''));
  setVal('new-demand-prazo', demand.prazo || '');
  setVal('new-demand-status', demand.status || 'Triagem');
  setVal('new-demand-drive', demand.drive || '');
  setVal('new-demand-obs', demand.obs || '');
  const structural = document.getElementById('new-demand-structural-change');
  if (structural) structural.checked = !!readDemandExtended(demand, 'alteracaoEstrutural', false);
  const selectedRespIds = new Set(getDemandResponsaveis(demand).map(r => String(r.id || r.user_id || '')));
  const respEl = document.getElementById('new-demand-resp');
  if (respEl) Array.from(respEl.options).forEach(opt => opt.selected = selectedRespIds.has(String(opt.value)));
  renderNewDemandPackagePreview();
  const title = document.querySelector('#screen-create-demand h1');
  const desc = document.querySelector('#screen-create-demand .hero-copy p');
  const draftBtn = document.getElementById('save-demand-draft-btn');
  const assignBtn = document.getElementById('save-demand-assign-btn');
  if (title) title.textContent = 'Editar demanda técnica';
  if (desc) desc.textContent = 'Atualize categoria, prazo, responsáveis, status e demais informações da demanda.';
  if (draftBtn) draftBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar alterações';
  if (assignBtn) assignBtn.innerHTML = '<i class="fa-solid fa-check"></i> Atualizar demanda';
};

const saveDemandTechBase = saveDemand;
saveDemand = async function(assign) {
  if (editingDemandFormId) {
    if (demands.length === 0) await fetchDemands();
    const existing = demands.find(d => String(d.id) === String(editingDemandFormId));
    if (!canCurrentUserManageDemand(existing)) return alert('Você não tem permissão para editar esta demanda.');
  } else if (!isAdminRole()) {
    return alert('Apenas a gestão pode criar novas demandas.');
  }
  return saveDemandTechBase(assign);
};

const openStatusModalTechBase = openStatusModal;
openStatusModal = async function(id) {
  if (demands.length === 0) await fetchDemands();
  const demand = demands.find(d => String(d.id) === String(id));
  if (!canCurrentUserManageDemand(demand)) return alert('Você não tem permissão para alterar o status desta demanda.');
  return openStatusModalTechBase(id);
};

const updateDemandStatusTechBase = updateDemandStatus;
updateDemandStatus = async function() {
  if (editingDemandId === null) return;
  if (demands.length === 0) await fetchDemands();
  const demand = demands.find(d => String(d.id) === String(editingDemandId));
  if (!canCurrentUserManageDemand(demand)) return alert('Você não tem permissão para alterar o status desta demanda.');
  return updateDemandStatusTechBase();
};

const deleteDemandTechBase = deleteDemand;
deleteDemand = async function() {
  if (deletingDemandId === null) return;
  const demand = demands.find(d => String(d.id) === String(deletingDemandId));
  if (!canCurrentUserDeleteDemand(demand)) return alert('A exclusão da demanda inteira continua restrita à gestão. Técnicos podem editar dados e excluir anexos.');
  return deleteDemandTechBase();
};

const openDemandDetailTechActionsBase = openDemandDetail;
openDemandDetail = async function(id) {
  await openDemandDetailTechActionsBase(id);
  const demand = demands.find(d => String(d.id) === String(id));
  const canManage = canCurrentUserManageDemand(demand);
  const editBtn = document.getElementById('detail-edit-btn');
  const btnStatus = document.getElementById('detail-status-btn');
  const btnDelete = document.getElementById('detail-delete-btn');
  const structuralBtn = document.getElementById('detail-structural-btn');
  if (editBtn) { editBtn.style.display = canManage ? 'inline-flex' : 'none'; editBtn.onclick = () => openEditDemand(id); }
  if (btnStatus) { btnStatus.style.display = canManage ? 'inline-flex' : 'none'; btnStatus.onclick = () => openStatusModal(id); }
  if (btnDelete) { btnDelete.style.display = canCurrentUserDeleteDemand(demand) ? 'inline-flex' : 'none'; btnDelete.onclick = () => openDeleteModal(id); }
  if (structuralBtn) structuralBtn.style.display = canManage ? 'inline-flex' : 'none';
};

const openWorkDetailTechActionsBase = openWorkDetail;
openWorkDetail = async function(id) {
  await openWorkDetailTechActionsBase(id);
  const editBtn = document.getElementById('work-detail-edit');
  if (editBtn) {
    editBtn.style.display = canCurrentUserManageWork(id) ? 'inline-flex' : 'none';
    editBtn.onclick = () => openEditWork(id);
  }
};

renderColabTable = function(data) {
  const tbody = document.getElementById('colab-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';
  data.forEach(d => {
    const work = works.find(w => String(w.id) === String(getDemandWorkId(d)));
    const dl = getDeadlineClass(d.prazo, d.status);
    const docs = calculatePackageProgress(getDemandRule(d.esp), d);
    const canManage = canCurrentUserManageDemand(d);
    const tr = document.createElement('tr');
    if (dl.cls === 'overdue' || dl.cls === 'due-soon') tr.className = 'urgent-row row-urgent-glow';
    tr.innerHTML = `
      <td>
        <div class="td-title" onclick="openDemandDetail(${d.id})">${escapeHtml(d.title)}</div>
        <div class="td-muted"><i class="fa-solid fa-building-circle-check"></i> ${work ? escapeHtml(work.title) : 'Sem obra vinculada'}</div>
        ${dl.extra ? `<div class="urgent-badge">${dl.cls==='overdue'?'<i class="fa-solid fa-triangle-exclamation"></i> ATRASADO':'<i class="fa-solid fa-clock"></i> Vence em 72h'}</div>` : ''}
      </td>
      <td><span class="esp-tag">${escapeHtml(d.esp)}</span></td>
      <td class="kcard-deadline ${dl.cls}">${escapeHtml(dl.label)}</td>
      <td><span class="status-badge ${statusMap[d.status] || 's-gray'}">${escapeHtml(d.status)}</span></td>
      <td>${work ? `<button class="btn btn-ghost btn-sm" onclick="openWorkDetail(${work.id})"><i class="fa-solid fa-folder-open"></i> ${docs.done}/${docs.total} anexos</button>` : `<a href="${escapeHtml(d.drive || '#')}" target="_blank" style="color:var(--accent);font-size:0.8rem;text-decoration:none"><i class="fa-brands fa-google-drive" style="color:#4285f4;margin-right:3px"></i>Abrir pasta</a>`}</td>
      <td>
        <div style="display:flex;gap:4px;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm" onclick="openDemandDetail(${d.id})"><i class="fa-solid fa-folder-open"></i> Abrir</button>
          ${canManage ? `<button class="btn btn-ghost btn-sm" onclick="openEditDemand(${d.id})"><i class="fa-solid fa-pen-to-square"></i> Editar</button><button class="btn btn-ghost btn-sm" onclick="openStatusModal(${d.id})"><i class="fa-solid fa-pen"></i> Status</button>` : ''}
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
};

renderWorkDocuments = function(workId) {
  const container = document.getElementById('work-documents-list');
  if (!container) return;
  const linked = getWorkDemands(workId);
  const docs = [];
  linked.forEach(d => {
    const attachments = readDemandAttachments(d);
    Object.entries(attachments || {}).forEach(([docId, value]) => {
      normalizeAttachmentEntries(value).forEach((item, idx) => {
        if (item?.url) docs.push({ ...item, docId, attachmentIndex: idx, demandTitle: d.title, demandEsp: d.esp, demandId: d.id, canManage: canCurrentUserManageDemand(d) });
      });
    });
  });
  if (!docs.length) {
    container.innerHTML = '<div class="package-empty"><i class="fa-solid fa-folder-open"></i> Nenhum documento anexado nesta obra até o momento.</div>';
    return;
  }
  container.innerHTML = docs.map(item => `
    <div class="work-doc-item">
      <div>
        <strong>${escapeHtml(item.label || item.fileName || 'Documento')}</strong>
        <span>${escapeHtml(item.demandEsp)} · ${escapeHtml(item.demandTitle)}</span>
        <small>${escapeHtml(item.uploadedBy || 'Usuário')} ${item.uploadedAt ? '· ' + new Date(item.uploadedAt).toLocaleDateString('pt-BR') : ''}</small>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">
        <a class="btn btn-ghost btn-sm" href="${escapeHtml(item.url)}" target="_blank"><i class="fa-solid fa-arrow-up-right-from-square"></i> Abrir</a>
        ${item.canManage ? `<button class="btn btn-ghost btn-sm btn-danger" onclick="deleteDemandAttachment(${item.demandId}, '${item.docId}', ${item.attachmentIndex})"><i class="fa-solid fa-trash"></i> Excluir</button>` : ''}
      </div>
    </div>
  `).join('');
};

async function baixarTodosAnexosEmZip() {
    if (editingDemandId === null) return alert('Nenhuma demanda selecionada.');
    if (demands.length === 0) await fetchDemands();
    const demand = demands.find(d => String(d.id) === String(editingDemandId));
    if (!demand) return alert('Demanda não encontrada.');

    const anexosAgrupados = readDemandAttachments(demand);
    let arquivosParaBaixar = [];

    // Mapeia todos os arquivos que têm URL preenchida
    Object.values(anexosAgrupados || {}).forEach(value => {
        normalizeAttachmentEntries(value).forEach(item => {
            if (item && item.url) {
                arquivosParaBaixar.push(item);
            }
        });
    });

    if (arquivosParaBaixar.length === 0) {
        return alert("Não há documentos anexados nesta demanda para baixar.");
    }

    const zip = new JSZip();
    const pasta = zip.folder(`Anexos_${demand.title.replace(/\s+/g, '_')}`);
    
    // Alerta visual para a gestão aguardar
    alert(`Preparando arquivo ZIP com ${arquivosParaBaixar.length} documentos. Por favor, aguarde...`);

    // Baixa cada arquivo pelo URL público e insere na pasta do ZIP
    for (let arquivo of arquivosParaBaixar) {
        try {
            const resposta = await fetch(arquivo.url);
            const blob = await resposta.blob();
            // Garante que arquivos com mesmo nome não se sobrescrevam
            const nomeFinal = `${arquivo.label.replace(/\s+/g, '_')}_${arquivo.fileName}`;
            pasta.file(nomeFinal, blob);
        } catch (erro) {
            console.error(`Erro ao baixar ${arquivo.fileName}:`, erro);
        }
    }

    // Gera o ZIP e força o download
    zip.generateAsync({ type: "blob" }).then(function(conteudoZip) {
        saveAs(conteudoZip, `Dossie_${demand.esp}_${demand.id}.zip`);
    });
}
