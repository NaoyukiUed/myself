const form = document.getElementById('add-form');
const labelInput = document.getElementById('label-input');
const typeRadios = document.querySelectorAll('input[name="type"]');
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

let pendingImageDataUrl = null;

const currentType = () => document.querySelector('input[name="type"]:checked').value;

const updateTypeVisibility = () => {
  if (currentType() === 'text') {
    textArea.classList.remove('hidden');
    imageArea.classList.add('hidden');
  } else {
    textArea.classList.add('hidden');
    imageArea.classList.remove('hidden');
  }
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
  const items = event.clipboardData && event.clipboardData.items;
  if (!items) return;
  for (const item of items) {
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

const escapeHtml = (str) =>
  str.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));

const formatDate = (iso) => {
  const d = new Date(iso);
  return d.toLocaleString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
};

const renderItem = (item) => {
  const wrapper = document.createElement('div');
  wrapper.className = 'item';
  wrapper.dataset.id = item.id;

  const labelEl = document.createElement('div');
  labelEl.className = 'item-label';
  labelEl.textContent = item.label;

  const contentEl = document.createElement('div');
  contentEl.className = 'item-content';

  if (item.type === 'text') {
    const p = document.createElement('p');
    p.className = 'item-text';
    p.textContent = item.value;
    contentEl.appendChild(p);
  } else {
    const row = document.createElement('div');
    row.className = 'item-image-row';

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
    downloadLink.style.textDecoration = 'none';
    downloadLink.style.textAlign = 'center';

    const viewBtn = document.createElement('button');
    viewBtn.type = 'button';
    viewBtn.className = 'btn-secondary';
    viewBtn.textContent = '画像を確認';
    viewBtn.addEventListener('click', () => openViewer(url));

    actions.appendChild(downloadLink);
    actions.appendChild(viewBtn);

    row.appendChild(img);
    row.appendChild(actions);
    contentEl.appendChild(row);
  }

  const meta = document.createElement('div');
  meta.className = 'item-meta';

  const created = document.createElement('span');
  created.className = 'item-created';
  created.textContent = formatDate(item.createdAt);

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'btn-danger';
  delBtn.textContent = '削除';
  delBtn.addEventListener('click', () => deleteItem(item.id));

  meta.appendChild(created);
  meta.appendChild(delBtn);

  wrapper.appendChild(labelEl);
  wrapper.appendChild(contentEl);
  wrapper.appendChild(meta);

  return wrapper;
};

const renderItems = (items) => {
  itemsList.innerHTML = '';
  if (items.length === 0) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = 'まだ項目はありません。';
    itemsList.appendChild(p);
    return;
  }
  const sorted = [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  sorted.forEach((item) => itemsList.appendChild(renderItem(item)));
};

const fetchItems = async () => {
  const res = await fetch('/api/items');
  if (!res.ok) throw new Error(`failed to fetch items: ${res.status}`);
  const items = await res.json();
  renderItems(items);
};

const deleteItem = async (id) => {
  if (!confirm('この項目を削除しますか?')) return;
  const res = await fetch(`/api/items/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    alert('削除に失敗しました');
    return;
  }
  fetchItems();
};

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const label = labelInput.value.trim();
  if (!label) return;
  const type = currentType();

  const payload = { label, type };
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
  if (event.key === 'Escape' && !viewer.classList.contains('hidden')) closeViewer();
});

fetchItems();
