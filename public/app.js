const form = document.getElementById('add-form');
const labelInput = document.getElementById('label-input');
const typeRadios = document.querySelectorAll('input[name="type"]');
const pendingParentBanner = document.getElementById('pending-parent');
const pendingParentName = document.getElementById('pending-parent-name');
const clearPendingParentBtn = document.getElementById('clear-pending-parent');
const textArea = document.getElementById('text-input-area');
const imageArea = document.getElementById('image-input-area');
const textValue = document.getElementById('text-value');
const pasteZone = document.getElementById('paste-zone');
const pastePreview = document.getElementById('paste-preview');
const pasteHint = pasteZone.querySelector('.paste-hint');
const clearImageBtn = document.getElementById('clear-image');
const submitBtn = document.getElementById('submit-btn');
const itemsList = document.getElementById('items-list');
const viewer = document.getElementById('viewer');
const viewerImage = document.getElementById('viewer-image');
const viewerClose = document.getElementById('viewer-close');
const openSettingsBtn = document.getElementById('open-settings');
const settingsModal = document.getElementById('settings-modal');
const settingsCloseBtn = document.getElementById('settings-close');
const confirmRevealToggle = document.getElementById('confirm-reveal-toggle');
const confirmModal = document.getElementById('confirm-modal');
const confirmItemName = document.getElementById('confirm-item-name');
const confirmCancelBtn = document.getElementById('confirm-cancel');
const confirmOkBtn = document.getElementById('confirm-ok');

const COLLAPSED_KEY = 'myself.collapsed';
const SETTINGS_KEY = 'myself.settings';

const collapsed = new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) || '[]'));
const saveCollapsed = () => localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed]));

const defaultSettings = { confirmReveal: true };
const settings = { ...defaultSettings, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
const saveSettings = () => localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));

const revealedThisSession = new Set();

let items = [];
let pendingImageDataUrl = null;
let pendingParentId = null;
let confirmResolver = null;

const setPendingParent = (item) => {
  pendingParentId = item.id;
  pendingParentName.textContent = itemPath(item);
  pendingParentBanner.classList.remove('hidden');
};

const clearPendingParent = () => {
  pendingParentId = null;
  pendingParentName.textContent = '';
  pendingParentBanner.classList.add('hidden');
};

clearPendingParentBtn.addEventListener('click', clearPendingParent);

const currentType = () => document.querySelector('input[name="type"]:checked').value;

const updateTypeVisibility = () => {
  const type = currentType();
  textArea.classList.toggle('hidden', type !== 'text');
  imageArea.classList.toggle('hidden', type !== 'image');
};

typeRadios.forEach((r) => r.addEventListener('change', updateTypeVisibility));
updateTypeVisibility();

const setPreview = (dataUrl) => {
  pendingImageDataUrl = dataUrl;
  if (dataUrl) {
    pastePreview.src = dataUrl;
    pastePreview.classList.remove('hidden');
    pasteHint.classList.add('hidden');
    clearImageBtn.classList.remove('hidden');
  } else {
    pastePreview.removeAttribute('src');
    pastePreview.classList.add('hidden');
    pasteHint.classList.remove('hidden');
    clearImageBtn.classList.add('hidden');
  }
};

pasteZone.addEventListener('focus', () => pasteZone.classList.add('focused'));
pasteZone.addEventListener('blur', () => pasteZone.classList.remove('focused'));
pasteZone.addEventListener('click', () => pasteZone.focus());

const handlePaste = (event) => {
  if (currentType() !== 'image') return;
  const clipboardItems = event.clipboardData && event.clipboardData.items;
  if (!clipboardItems) return;
  for (const item of clipboardItems) {
    if (item.type && item.type.startsWith('image/')) {
      event.preventDefault();
      const file = item.getAsFile();
      const reader = new FileReader();
      reader.onload = () => setPreview(reader.result);
      reader.readAsDataURL(file);
      return;
    }
  }
};

pasteZone.addEventListener('paste', handlePaste);
document.addEventListener('paste', (event) => {
  if (currentType() !== 'image') return;
  if (document.activeElement === pasteZone) return;
  handlePaste(event);
});

clearImageBtn.addEventListener('click', () => setPreview(null));

const itemPath = (item) => {
  const parts = [];
  let cur = item;
  const safety = new Set();
  while (cur) {
    if (safety.has(cur.id)) break;
    safety.add(cur.id);
    parts.unshift(cur.label);
    cur = cur.parentId ? items.find((i) => i.id === cur.parentId) : null;
  }
  return parts.join(' / ');
};

const childrenOf = (parentId) => items.filter((i) => i.parentId === parentId);

const descendantIdsOf = (rootId) => {
  const result = new Set();
  const queue = [rootId];
  while (queue.length) {
    const cur = queue.shift();
    for (const it of items) {
      if (it.parentId === cur) {
        result.add(it.id);
        queue.push(it.id);
      }
    }
  }
  return result;
};

const askConfirmReveal = (item) => new Promise((resolve) => {
  if (!settings.confirmReveal) {
    resolve(true);
    return;
  }
  confirmItemName.textContent = item.label;
  confirmModal.classList.remove('hidden');
  confirmResolver = resolve;
});

const closeConfirmModal = (result) => {
  confirmModal.classList.add('hidden');
  if (confirmResolver) {
    confirmResolver(result);
    confirmResolver = null;
  }
};

confirmCancelBtn.addEventListener('click', () => closeConfirmModal(false));
confirmOkBtn.addEventListener('click', () => closeConfirmModal(true));
confirmModal.addEventListener('click', (event) => {
  if (event.target === confirmModal) closeConfirmModal(false);
});

const openSettings = () => {
  confirmRevealToggle.checked = settings.confirmReveal;
  settingsModal.classList.remove('hidden');
};
const closeSettings = () => settingsModal.classList.add('hidden');

openSettingsBtn.addEventListener('click', openSettings);
settingsCloseBtn.addEventListener('click', closeSettings);
settingsModal.addEventListener('click', (event) => {
  if (event.target === settingsModal) closeSettings();
});
confirmRevealToggle.addEventListener('change', () => {
  settings.confirmReveal = confirmRevealToggle.checked;
  saveSettings();
});

const toggleHidden = async (item) => {
  const newHidden = !item.hidden;
  const res = await fetch(`/api/items/${item.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hidden: newHidden }),
  });
  if (!res.ok) {
    alert('変更に失敗しました');
    return;
  }
  revealedThisSession.delete(item.id);
  await fetchItems();
};

const revealItem = async (item) => {
  const ok = await askConfirmReveal(item);
  if (!ok) return;
  revealedThisSession.add(item.id);
  render();
};

const remaskItem = (item) => {
  revealedThisSession.delete(item.id);
  render();
};

const renderNormalContent = (item, contentEl) => {
  if (item.type === 'text') {
    const p = document.createElement('p');
    p.className = 'item-text';
    p.textContent = item.value;
    if (item.value === '') p.classList.add('empty-value');
    contentEl.appendChild(p);
  } else if (item.type === 'image') {
    const imageRow = document.createElement('div');
    imageRow.className = 'item-image-row';

    const url = `/images/${item.filename}`;
    const img = document.createElement('img');
    img.className = 'item-thumb';
    img.src = url;
    img.alt = item.label;
    img.addEventListener('click', () => openViewer(url));

    const actions = document.createElement('div');
    actions.className = 'item-image-actions';

    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = item.filename;
    downloadLink.className = 'btn-secondary';
    downloadLink.textContent = 'ダウンロード';

    const viewBtn = document.createElement('button');
    viewBtn.type = 'button';
    viewBtn.className = 'btn-secondary';
    viewBtn.textContent = '画像を確認';
    viewBtn.addEventListener('click', () => openViewer(url));

    actions.appendChild(downloadLink);
    actions.appendChild(viewBtn);
    imageRow.appendChild(img);
    imageRow.appendChild(actions);
    contentEl.appendChild(imageRow);
  }
};

const renderRow = (item, depth) => {
  const row = document.createElement('div');
  row.className = 'item';
  row.dataset.id = item.id;
  row.style.paddingLeft = `${16 + depth * 24}px`;

  const children = childrenOf(item.id);
  const hasChildren = children.length > 0;
  const isCollapsed = collapsed.has(item.id);

  const chevron = document.createElement('button');
  chevron.type = 'button';
  chevron.className = `chevron ${hasChildren ? '' : 'invisible'} ${isCollapsed ? 'collapsed' : ''}`;
  chevron.textContent = '▾';
  chevron.setAttribute('aria-label', isCollapsed ? '展開' : '折りたたみ');
  chevron.addEventListener('click', () => {
    if (!hasChildren) return;
    if (collapsed.has(item.id)) collapsed.delete(item.id);
    else collapsed.add(item.id);
    saveCollapsed();
    render();
  });

  const labelEl = document.createElement('div');
  labelEl.className = 'item-label';
  labelEl.textContent = item.label;
  if (hasChildren) {
    labelEl.classList.add('clickable');
    labelEl.addEventListener('click', () => chevron.click());
    const count = document.createElement('span');
    count.className = 'child-count';
    count.textContent = `(${children.length})`;
    labelEl.appendChild(count);
  }
  if (item.hidden) {
    const lockBadge = document.createElement('span');
    lockBadge.className = 'lock-badge';
    lockBadge.textContent = '🔒';
    lockBadge.title = '隠してある';
    labelEl.appendChild(lockBadge);
  }

  const contentEl = document.createElement('div');
  contentEl.className = 'item-content';

  const isRevealed = revealedThisSession.has(item.id);
  if (item.hidden && !isRevealed) {
    const masked = document.createElement('div');
    masked.className = 'masked-content';
    const dots = document.createElement('span');
    dots.className = 'mask-dots';
    dots.textContent = item.type === 'image' ? '🔒 隠されている画像' : '••••••';
    const revealBtn = document.createElement('button');
    revealBtn.type = 'button';
    revealBtn.className = 'btn-secondary small';
    revealBtn.textContent = '表示';
    revealBtn.addEventListener('click', () => revealItem(item));
    masked.appendChild(dots);
    masked.appendChild(revealBtn);
    contentEl.appendChild(masked);
  } else {
    renderNormalContent(item, contentEl);
    if (item.hidden && isRevealed) {
      const remaskBtn = document.createElement('button');
      remaskBtn.type = 'button';
      remaskBtn.className = 'link-button';
      remaskBtn.textContent = '再度隠す';
      remaskBtn.addEventListener('click', () => remaskItem(item));
      contentEl.appendChild(remaskBtn);
    }
  }

  const meta = document.createElement('div');
  meta.className = 'item-meta';

  const addChildBtn = document.createElement('button');
  addChildBtn.type = 'button';
  addChildBtn.className = 'btn-secondary small';
  addChildBtn.textContent = '＋子を追加';
  addChildBtn.title = `「${item.label}」の下に追加`;
  addChildBtn.addEventListener('click', () => {
    setPendingParent(item);
    labelInput.focus();
    document.querySelector('.card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  const hideBtn = document.createElement('button');
  hideBtn.type = 'button';
  hideBtn.className = 'btn-secondary small';
  hideBtn.textContent = item.hidden ? '隠す解除' : '隠す';
  hideBtn.title = item.hidden ? 'hide設定を解除する' : 'この項目を隠す';
  hideBtn.addEventListener('click', () => toggleHidden(item));

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'btn-danger small';
  delBtn.textContent = '削除';
  delBtn.addEventListener('click', () => deleteItem(item));

  meta.appendChild(addChildBtn);
  meta.appendChild(hideBtn);
  meta.appendChild(delBtn);

  row.appendChild(chevron);
  row.appendChild(labelEl);
  row.appendChild(contentEl);
  row.appendChild(meta);
  return row;
};

const renderTree = (parentId, depth, container) => {
  const children = childrenOf(parentId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const child of children) {
    container.appendChild(renderRow(child, depth));
    if (!collapsed.has(child.id)) {
      renderTree(child.id, depth + 1, container);
    }
  }
};

const render = () => {
  itemsList.innerHTML = '';
  if (items.length === 0) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = 'まだ項目はありません。';
    itemsList.appendChild(p);
  } else {
    renderTree(null, 0, itemsList);
  }
  if (pendingParentId && !items.find((i) => i.id === pendingParentId)) {
    clearPendingParent();
  } else if (pendingParentId) {
    const parent = items.find((i) => i.id === pendingParentId);
    pendingParentName.textContent = itemPath(parent);
  }
};

const fetchItems = async () => {
  const res = await fetch('/api/items');
  if (!res.ok) throw new Error(`failed to fetch items: ${res.status}`);
  items = await res.json();
  render();
};

const deleteItem = async (item) => {
  const descCount = descendantIdsOf(item.id).size;
  const msg = descCount > 0
    ? `「${item.label}」とその配下 ${descCount} 項目を削除しますか? この操作は取り消せません。`
    : `「${item.label}」を削除しますか?`;
  if (!confirm(msg)) return;
  const res = await fetch(`/api/items/${item.id}`, { method: 'DELETE' });
  if (!res.ok) {
    alert('削除に失敗しました');
    return;
  }
  collapsed.delete(item.id);
  saveCollapsed();
  await fetchItems();
};

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const label = labelInput.value.trim();
  if (!label) return;
  const type = currentType();
  const payload = { label, type, parentId: pendingParentId };
  if (type === 'text') {
    payload.value = textValue.value;
  } else {
    if (!pendingImageDataUrl) {
      alert('画像をペーストしてください');
      return;
    }
    payload.dataUrl = pendingImageDataUrl;
  }

  submitBtn.disabled = true;
  try {
    const res = await fetch('/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(`追加に失敗しました: ${err.error || res.status}`);
      return;
    }
    labelInput.value = '';
    textValue.value = '';
    setPreview(null);
    clearPendingParent();
    await fetchItems();
  } finally {
    submitBtn.disabled = false;
  }
});

const openViewer = (url) => {
  viewerImage.src = url;
  viewer.classList.remove('hidden');
};

const closeViewer = () => {
  viewer.classList.add('hidden');
  viewerImage.removeAttribute('src');
};

viewerClose.addEventListener('click', closeViewer);
viewer.addEventListener('click', (event) => {
  if (event.target === viewer) closeViewer();
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (!viewer.classList.contains('hidden')) closeViewer();
  else if (!settingsModal.classList.contains('hidden')) closeSettings();
  else if (!confirmModal.classList.contains('hidden')) closeConfirmModal(false);
});

fetchItems();
