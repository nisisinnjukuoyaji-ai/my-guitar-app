(() => {
  'use strict';

  const STORAGE_KEY = 'guitar-gear.items.v1';
  const TAB_KEY = 'guitar-gear.tab';

  // 円をパスで描く（fill-rule: evenodd で穴にする）
  const circle = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0Z`;

  const ICONS = {
    chevron: 'M8.6 4.6 10 3.2l8.8 8.8L10 20.8l-1.4-1.4 7.4-7.4Z',
    all: 'M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z',
    guitar: 'M19.6 2.3l2.1 2.1-1.4 1.4-.7-.7-4.9 4.9a5 5 0 0 1-1.3 6.7A5.5 5.5 0 0 1 9 21.5 5.5 5.5 0 0 1 2.5 15a5.5 5.5 0 0 1 4.8-4.4 5 5 0 0 1 6.7-1.3l4.9-4.9-.7-.7Z' + circle(9.5, 14.5, 1.8),
    amp: 'M8 3h8v3h-1.6V4.6H9.6V6H8ZM3 6.5h18a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7.5a1 1 0 0 1 1-1ZM4 11.5V19h16v-7.5Z'
      + circle(6, 9, 1) + circle(9, 9, 1) + circle(12, 9, 1) + circle(15, 9, 1),
    cabinet: 'M3 2.5h18a.5.5 0 0 1 .5.5v18a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V3a.5.5 0 0 1 .5-.5Z'
      + circle(8, 8, 3.3) + circle(16, 8, 3.3) + circle(8, 16, 3.3) + circle(16, 16, 3.3),
    effect: 'M6.5 2h11a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z'
      + circle(9, 6.5, 1.6) + circle(15, 6.5, 1.6) + circle(12, 16.5, 2.6) + 'M7 10.5h10v1.2H7Z',
  };

  const CATEGORIES = [
    { id: 'guitar', label: 'ギター', types: ['エレキギター', 'アコースティックギター', 'エレアコ', 'クラシックギター', 'ベース', 'その他'] },
    { id: 'amp', label: 'アンプ', types: ['ヘッド', 'コンボ', 'モデリング', 'プリアンプ', 'パワーアンプ', 'その他'] },
    { id: 'cabinet', label: 'キャビネット', types: ['1x12', '2x12', '4x12', '1x10', '2x10', '4x10', '1x15', 'その他'] },
    { id: 'effect', label: 'エフェクター', types: ['オーバードライブ', 'ディストーション', 'ファズ', 'ブースター', 'コンプレッサー', 'ディレイ', 'リバーブ', 'モジュレーション', 'ワウ/フィルター', 'ピッチ', 'EQ', 'ノイズゲート', 'チューナー', 'マルチエフェクター', 'その他'] },
  ];
  const CAT_BY_ID = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));
  const TABS = [{ id: 'all', label: 'すべて' }, ...CATEGORIES];

  const STATUS_LABEL = { active: '使用中', stored: '保管中', repair: '修理中', sold: '売却済み' };

  // ===== Storage =====
  function load() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      return true;
    } catch {
      toast('保存に失敗しました');
      return false;
    }
  }

  let items = load();
  let currentTab = 'all';
  try { if (TABS.some(t => t.id === localStorage.getItem(TAB_KEY))) currentTab = localStorage.getItem(TAB_KEY); } catch {}
  let query = '';
  let editingId = null;
  let formCategory = 'guitar';

  const $ = sel => document.querySelector(sel);
  const listEl = $('#list');
  const tabbarEl = $('#tabbar');
  const countEl = $('#count');
  const sheet = $('#sheet');
  const backdrop = $('#backdrop');
  const form = $('#form');
  const typeSelect = $('#typeSelect');
  const segment = $('#categorySegment');
  const formError = $('#formError');
  const deleteBtn = $('#deleteBtn');
  const confirmEl = $('#confirm');

  // ===== DOM helpers =====
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
    for (const c of [].concat(children)) if (c) node.append(c);
    return node;
  }
  function icon(name, cls) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    if (cls) svg.setAttribute('class', cls);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', ICONS[name]);
    path.setAttribute('fill-rule', 'evenodd');
    svg.append(path);
    return svg;
  }

  function toast(message) {
    document.querySelectorAll('.toast').forEach(t => t.remove());
    const t = el('div', { class: 'toast', role: 'status', text: message });
    document.body.append(t);
    setTimeout(() => t.remove(), 2100);
  }

  const yen = n => '¥' + Number(n).toLocaleString('ja-JP');

  // ===== Render =====
  function renderTabs() {
    tabbarEl.replaceChildren(...TABS.map(t => el('button', {
      class: 'tab',
      type: 'button',
      role: 'tab',
      'aria-selected': String(t.id === currentTab),
      onclick: () => {
        currentTab = t.id;
        try { localStorage.setItem(TAB_KEY, currentTab); } catch {}
        renderTabs();
        renderList();
        window.scrollTo({ top: 0 });
      },
    }, [icon(t.id), el('span', { text: t.id === 'effect' ? 'エフェクト' : t.label })])));
  }

  function matches(item) {
    if (!query) return true;
    const hay = [item.brand, item.model, item.type, item.serial, item.notes].join(' ').toLowerCase();
    return query.toLowerCase().split(/\s+/).every(q => hay.includes(q));
  }

  function byName(a, b) {
    return (a.brand || '').localeCompare(b.brand || '', 'ja') || a.model.localeCompare(b.model, 'ja');
  }

  function card(item) {
    const sub = [item.type, item.price ? yen(item.price) : '', item.purchaseDate ? item.purchaseDate.slice(0, 4) + '年' : '']
      .filter(Boolean).join(' · ');
    return el('button', { class: 'card', type: 'button', onclick: () => openSheet(item) }, [
      el('div', { class: `card-icon cat-${item.category}` }, [icon(item.category)]),
      el('div', { class: 'card-main' }, [
        el('div', { class: 'card-title', text: [item.brand, item.model].filter(Boolean).join(' ') }),
        el('div', { class: 'card-sub', text: sub || CAT_BY_ID[item.category].label }),
      ]),
      item.status && item.status !== 'active'
        ? el('span', { class: `badge ${item.status}`, text: STATUS_LABEL[item.status] })
        : null,
      icon('chevron', 'chevron'),
    ]);
  }

  function renderList() {
    const inTab = currentTab === 'all' ? items : items.filter(i => i.category === currentTab);
    const visible = inTab.filter(matches).sort(byName);
    countEl.textContent = inTab.length ? `${inTab.length}件` : '';

    if (!visible.length) {
      const label = currentTab === 'all' ? '機材' : CAT_BY_ID[currentTab].label;
      listEl.replaceChildren(el('div', { class: 'empty' }, query
        ? [icon('all'), el('h2', { text: '見つかりません' }), el('p', { text: `「${query}」に一致する${label}はありません` })]
        : [icon(currentTab), el('h2', { text: `${label}がまだありません` }), el('p', { text: '右下の ＋ ボタンから登録しましょう' })]));
      return;
    }

    const groups = currentTab === 'all'
      ? CATEGORIES.map(c => [c, visible.filter(i => i.category === c.id)]).filter(([, list]) => list.length)
      : [[CAT_BY_ID[currentTab], visible]];

    listEl.replaceChildren(...groups.flatMap(([cat, list]) => [
      el('h2', { class: 'section-title', text: `${cat.label}（${list.length}）` }),
      el('div', { class: 'cards' }, list.map(card)),
    ]));
  }

  // ===== Form =====
  function setFormCategory(catId, keepType) {
    formCategory = catId;
    segment.querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.cat === catId)));
    const types = CAT_BY_ID[catId].types;
    typeSelect.replaceChildren(
      el('option', { value: '', text: '未選択' }),
      ...types.map(t => el('option', { value: t, text: t })),
    );
    // 既存データの種類がリストにない場合も残す
    if (keepType && !types.includes(keepType)) typeSelect.append(el('option', { value: keepType, text: keepType }));
    typeSelect.value = keepType || '';
  }

  segment.replaceChildren(...CATEGORIES.map(c => el('button', {
    type: 'button',
    role: 'radio',
    'data-cat': c.id,
    text: c.label,
    onclick: () => setFormCategory(c.id),
  })));

  function openSheet(item) {
    editingId = item ? item.id : null;
    form.reset();
    formError.hidden = true;
    $('#sheetTitle').textContent = item ? '機材を編集' : '機材を追加';
    deleteBtn.hidden = !item;

    const cat = item ? item.category : (currentTab === 'all' ? 'guitar' : currentTab);
    setFormCategory(cat, item && item.type);
    if (item) {
      for (const name of ['brand', 'model', 'status', 'purchaseDate', 'serial', 'notes']) {
        form.elements[name].value = item[name] || '';
      }
      form.elements.status.value = item.status || 'active';
      form.elements.price.value = item.price ? String(item.price) : '';
    }

    backdrop.hidden = false;
    sheet.hidden = false;
    document.body.classList.add('locked');
    sheet.querySelector('.sheet-body').scrollTop = 0;
    if (!item) setTimeout(() => form.elements.brand.focus(), 300);
  }

  function closeSheet() {
    sheet.hidden = true;
    backdrop.hidden = true;
    document.body.classList.remove('locked');
    editingId = null;
  }

  form.elements.price.addEventListener('input', e => {
    // 全角数字も受け付けて半角に揃える
    const v = e.target.value.replace(/[０-９]/g, d => String.fromCharCode(d.charCodeAt(0) - 0xFEE0)).replace(/[^0-9]/g, '');
    if (v !== e.target.value) e.target.value = v;
  });

  form.addEventListener('submit', e => {
    e.preventDefault();
    const f = form.elements;
    const model = f.model.value.trim();
    if (!model) {
      formError.textContent = 'モデル名を入力してください';
      formError.hidden = false;
      f.model.focus();
      return;
    }

    const now = new Date().toISOString();
    const data = {
      category: formCategory,
      brand: f.brand.value.trim(),
      model,
      type: f.type.value,
      status: f.status.value,
      purchaseDate: f.purchaseDate.value,
      price: f.price.value ? Number(f.price.value) : null,
      serial: f.serial.value.trim(),
      notes: f.notes.value.trim(),
      updatedAt: now,
    };

    const isEdit = Boolean(editingId);
    if (isEdit) {
      items = items.map(i => (i.id === editingId ? { ...i, ...data } : i));
    } else {
      const id = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
      items = [...items, { id, createdAt: now, ...data }];
    }
    if (!save()) return;
    closeSheet();
    renderList();
    toast(isEdit ? '更新しました' : '登録しました');
  });

  $('#cancelBtn').addEventListener('click', closeSheet);
  backdrop.addEventListener('click', closeSheet);
  $('#addBtn').addEventListener('click', () => openSheet(null));

  // ===== Delete =====
  deleteBtn.addEventListener('click', () => {
    const item = items.find(i => i.id === editingId);
    if (!item) return;
    $('#confirmText').textContent = `「${[item.brand, item.model].filter(Boolean).join(' ')}」を削除します。この操作は取り消せません。`;
    confirmEl.hidden = false;
  });
  $('#confirmCancel').addEventListener('click', () => { confirmEl.hidden = true; });
  confirmEl.addEventListener('click', e => { if (e.target === confirmEl) confirmEl.hidden = true; });
  $('#confirmOk').addEventListener('click', () => {
    const prev = items;
    items = items.filter(i => i.id !== editingId);
    if (!save()) { items = prev; return; }
    confirmEl.hidden = true;
    closeSheet();
    renderList();
    toast('削除しました');
  });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!confirmEl.hidden) confirmEl.hidden = true;
    else if (!sheet.hidden) closeSheet();
  });

  // ===== Search =====
  $('#search').addEventListener('input', e => {
    query = e.target.value.trim();
    renderList();
  });

  renderTabs();
  renderList();
})();
