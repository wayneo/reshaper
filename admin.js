const dashboardPage = document.querySelector('#dashboardPage');
const styleEditPage = document.querySelector('#styleEditPage');
const categoriesPage = document.querySelector('#categoriesPage');
const addStyleButton = document.querySelector('#addStyleButton');
const backToStylesButton = document.querySelector('#backToStylesButton');
const styleTableBody = document.querySelector('#styleTableBody');
const styleListStatus = document.querySelector('#styleListStatus');
const styleForm = document.querySelector('#styleForm');
const styleFormTitle = document.querySelector('#styleFormTitle');
const styleFormError = document.querySelector('#styleFormError');
const styleFormSuccess = document.querySelector('#styleFormSuccess');
const styleTitleInput = document.querySelector('#styleTitleInput');
const stylePromptInput = document.querySelector('#stylePromptInput');
const styleCategorySelect = document.querySelector('#styleCategorySelect');
const styleIdentitySelect = document.querySelector('#styleIdentitySelect');
const styleImageInput = document.querySelector('#styleImageInput');
const styleImagePreview = document.querySelector('#styleImagePreview');
const cancelStyleForm = document.querySelector('#cancelStyleForm');
const stylesTabButton = document.querySelector('#stylesTabButton');
const categoriesTabButton = document.querySelector('#categoriesTabButton');
const stylesTabButtonFromCategories = document.querySelector('#stylesTabButtonFromCategories');
const categoryTableBody = document.querySelector('#categoryTableBody');
const categoryListStatus = document.querySelector('#categoryListStatus');
const addCategoryForm = document.querySelector('#addCategoryForm');
const newCategoryNameInput = document.querySelector('#newCategoryNameInput');
const categoryFormError = document.querySelector('#categoryFormError');

let editingStyleId = null;
let pendingImageDataUrl = null;
let draggedStyleId = null;

function showPage(page) {
  dashboardPage.hidden = page !== 'dashboard';
  styleEditPage.hidden = page !== 'edit';
  categoriesPage.hidden = page !== 'categories';
}

function goToDashboard() {
  showPage('dashboard');
  loadStyles();
}

function goToCategories() {
  showPage('categories');
  loadCategories();
}

stylesTabButton.addEventListener('click', goToDashboard);
categoriesTabButton.addEventListener('click', goToCategories);
stylesTabButtonFromCategories.addEventListener('click', goToDashboard);

function resizeImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const maxEdge = 1024;
        const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', .9));
      };
      image.onerror = () => reject(new Error('This image could not be opened.'));
      image.src = reader.result;
    };
    reader.onerror = () => reject(new Error('The image could not be read.'));
    reader.readAsDataURL(file);
  });
}

styleImageInput.addEventListener('change', async () => {
  const file = styleImageInput.files[0];
  if (!file) return;
  try {
    pendingImageDataUrl = await resizeImageFile(file);
    styleImagePreview.src = pendingImageDataUrl;
    styleImagePreview.hidden = false;
  } catch (error) {
    styleFormError.textContent = error.message;
  }
});

function resetStyleForm() {
  editingStyleId = null;
  pendingImageDataUrl = null;
  styleFormTitle.textContent = 'Add style';
  styleTitleInput.value = '';
  stylePromptInput.value = '';
  styleCategorySelect.value = '';
  styleIdentitySelect.value = 'reinforced';
  styleImageInput.value = '';
  styleImagePreview.hidden = true;
  styleImagePreview.src = '';
  styleFormError.textContent = '';
  styleFormSuccess.textContent = '';
}

async function populateCategorySelect(selectedId) {
  const response = await fetch('/admin/api/categories');
  const categories = response.ok ? await response.json() : [];
  styleCategorySelect.replaceChildren(...[{ id: '', name: 'None' }, ...categories].map(category => {
    const option = document.createElement('option');
    option.value = category.id;
    option.textContent = category.name;
    return option;
  }));
  styleCategorySelect.value = selectedId || '';
}

async function openStyleForm(style) {
  resetStyleForm();
  if (style) {
    editingStyleId = style.id;
    styleFormTitle.textContent = `Edit ${style.title}`;
    styleTitleInput.value = style.title;
    stylePromptInput.value = style.prompt;
    styleIdentitySelect.value = style.identityMode;
    if (style.imageUrl) {
      styleImagePreview.src = style.imageUrl;
      styleImagePreview.hidden = false;
    }
  }
  showPage('edit');
  await populateCategorySelect(style ? style.categoryId : '');
}

addStyleButton.addEventListener('click', () => openStyleForm(null));
cancelStyleForm.addEventListener('click', () => { resetStyleForm(); goToDashboard(); });
backToStylesButton.addEventListener('click', () => { resetStyleForm(); goToDashboard(); });

function renderStyles(styles) {
  styleTableBody.replaceChildren(...styles.map(style => {
    const row = document.createElement('tr');
    row.draggable = true;
    row.dataset.styleId = style.id;
    row.addEventListener('dragstart', event => {
      draggedStyleId = style.id;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', style.id);
      row.classList.add('dragging');
    });
    row.addEventListener('dragend', () => {
      draggedStyleId = null;
      styleTableBody.querySelectorAll('tr').forEach(item => item.classList.remove('dragging', 'drag-over'));
    });
    row.addEventListener('dragover', event => {
      if (!draggedStyleId || draggedStyleId === style.id) return;
      event.preventDefault();
      row.classList.add('drag-over');
    });
    row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
    row.addEventListener('drop', async event => {
      event.preventDefault();
      row.classList.remove('drag-over');
      if (!draggedStyleId || draggedStyleId === style.id) return;
      const draggedRow = styleTableBody.querySelector(`[data-style-id="${draggedStyleId}"]`);
      if (!draggedRow) return;
      const placeAfter = event.clientY > row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2;
      styleTableBody.insertBefore(draggedRow, placeAfter ? row.nextSibling : row);
      await saveStyleOrder(currentStyleIds());
    });

    const reorderCell = document.createElement('td');
    const dragHandle = document.createElement('span');
    dragHandle.className = 'drag-handle';
    dragHandle.title = 'Drag to reorder';
    dragHandle.setAttribute('aria-hidden', 'true');
    reorderCell.appendChild(dragHandle);

    const imageCell = document.createElement('td');
    if (style.imageFile) {
      const img = document.createElement('img');
      img.className = 'row-thumb';
      img.src = `/uploads/${style.imageFile}`;
      img.alt = '';
      imageCell.appendChild(img);
    } else {
      const placeholder = document.createElement('span');
      placeholder.className = 'row-thumb-empty';
      placeholder.textContent = 'None';
      imageCell.appendChild(placeholder);
    }

    const titleCell = document.createElement('td');
    titleCell.textContent = style.title;

    const categoryCell = document.createElement('td');
    categoryCell.textContent = style.category || 'None';

    const identityCell = document.createElement('td');
    identityCell.textContent = style.identityMode;

    const enabledCell = document.createElement('td');
    const enabledInput = document.createElement('input');
    enabledInput.type = 'checkbox';
    enabledInput.checked = style.enabled;
    enabledInput.addEventListener('change', () => toggleEnabled(style.id, enabledInput.checked));
    enabledCell.appendChild(enabledInput);

    const actionsCell = document.createElement('td');
    const actions = document.createElement('div');
    actions.className = 'row-actions';
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => openStyleForm({ ...style, imageUrl: style.imageFile ? `/uploads/${style.imageFile}` : null }));
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'delete-button';
    deleteBtn.setAttribute('aria-label', `Delete ${style.title}`);
    deleteBtn.title = `Delete ${style.title}`;
    const deleteIcon = document.createElement('img');
    deleteIcon.className = 'delete-icon';
    deleteIcon.src = 'images/x.png';
    deleteIcon.alt = '';
    deleteIcon.setAttribute('aria-hidden', 'true');
    deleteBtn.appendChild(deleteIcon);
    deleteBtn.addEventListener('click', () => deleteStyle(style.id, style.title));
    actions.append(editBtn, deleteBtn);
    actionsCell.appendChild(actions);

    row.append(reorderCell, imageCell, titleCell, categoryCell, identityCell, enabledCell, actionsCell);
    return row;
  }));
}

function currentStyleIds() {
  return [...styleTableBody.querySelectorAll('tr')].map(row => row.dataset.styleId);
}

async function saveStyleOrder(ids) {
  styleListStatus.textContent = 'Saving order…';
  const response = await fetch('/admin/api/styles/reorder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids })
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    styleListStatus.textContent = payload.error || 'Could not save the new order.';
    loadStyles();
    return;
  }
  styleListStatus.textContent = 'Order saved.';
  loadStyles();
}

async function loadStyles() {
  const response = await fetch('/admin/api/styles');
  if (!response.ok) return;
  const styles = await response.json();
  renderStyles(styles);
}

function renderCategories(categories) {
  categoryTableBody.replaceChildren(...categories.map(category => {
    const row = document.createElement('tr');

    const nameCell = document.createElement('td');
    nameCell.textContent = category.name;

    const countCell = document.createElement('td');
    countCell.textContent = String(category.styleCount);

    const actionsCell = document.createElement('td');
    const actions = document.createElement('div');
    actions.className = 'row-actions';
    const renameBtn = document.createElement('button');
    renameBtn.type = 'button';
    renameBtn.textContent = 'Rename';
    renameBtn.addEventListener('click', () => renameCategory(category.id, category.name));
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'delete-button';
    deleteBtn.setAttribute('aria-label', `Delete ${category.name}`);
    deleteBtn.title = `Delete ${category.name}`;
    const deleteIcon = document.createElement('img');
    deleteIcon.className = 'delete-icon';
    deleteIcon.src = 'images/x.png';
    deleteIcon.alt = '';
    deleteIcon.setAttribute('aria-hidden', 'true');
    deleteBtn.appendChild(deleteIcon);
    deleteBtn.addEventListener('click', () => deleteCategory(category.id, category.name, category.styleCount));
    actions.append(renameBtn, deleteBtn);
    actionsCell.appendChild(actions);

    row.append(nameCell, countCell, actionsCell);
    return row;
  }));
}

async function loadCategories() {
  const response = await fetch('/admin/api/categories');
  if (!response.ok) return;
  const categories = await response.json();
  renderCategories(categories);
}

addCategoryForm.addEventListener('submit', async event => {
  event.preventDefault();
  categoryFormError.textContent = '';
  const name = newCategoryNameInput.value.trim();
  if (!name) return;
  const response = await fetch('/admin/api/categories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    categoryFormError.textContent = payload.error || 'Could not create this category.';
    return;
  }
  newCategoryNameInput.value = '';
  loadCategories();
});

async function renameCategory(id, currentName) {
  const name = prompt('Rename category', currentName);
  if (name === null) return;
  const trimmed = name.trim();
  if (!trimmed || trimmed === currentName) return;
  const response = await fetch(`/admin/api/categories/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: trimmed })
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    alert(payload.error || 'Could not rename this category.');
    return;
  }
  loadCategories();
}

async function deleteCategory(id, name, styleCount) {
  const warning = styleCount > 0
    ? `Delete "${name}"? ${styleCount} style${styleCount === 1 ? '' : 's'} using it will become uncategorized. This cannot be undone.`
    : `Delete "${name}"? This cannot be undone.`;
  if (!confirm(warning)) return;
  const response = await fetch(`/admin/api/categories/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    alert(payload.error || 'Could not delete this category.');
    return;
  }
  loadCategories();
}

async function toggleEnabled(id, enabled) {
  await fetch(`/admin/api/styles/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled })
  });
  loadStyles();
}

async function deleteStyle(id, title) {
  if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
  const response = await fetch(`/admin/api/styles/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    alert(payload.error || 'Could not delete this style.');
    return;
  }
  loadStyles();
}

styleForm.addEventListener('submit', async event => {
  event.preventDefault();
  styleFormError.textContent = '';
  styleFormSuccess.textContent = '';
  const body = {
    title: styleTitleInput.value.trim(),
    prompt: stylePromptInput.value.trim(),
    categoryId: styleCategorySelect.value || null,
    identityMode: styleIdentitySelect.value
  };
  if (pendingImageDataUrl) body.image = pendingImageDataUrl;

  const url = editingStyleId ? `/admin/api/styles/${encodeURIComponent(editingStyleId)}` : '/admin/api/styles';
  const method = editingStyleId ? 'PUT' : 'POST';
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    styleFormError.textContent = payload.error || 'Could not save this style.';
    return;
  }
  // Stay on this page. Adopt the saved record's id so a second save
  // updates it instead of creating a duplicate, and clear the pending
  // image so an unrelated future save doesn't needlessly re-upload it.
  editingStyleId = payload.id;
  pendingImageDataUrl = null;
  styleFormTitle.textContent = `Edit ${payload.title}`;
  styleFormSuccess.textContent = 'Saved.';
  loadStyles();
});

showPage('dashboard');
loadStyles();
