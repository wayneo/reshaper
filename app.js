const input = document.querySelector('#photoInput');
const uploadStatus = document.querySelector('#uploadStatus');
const preview = document.querySelector('#preview');
const resultImage = document.querySelector('#resultImage');
const empty = document.querySelector('#emptyState');
const resultEmpty = document.querySelector('#resultEmpty');
const generate = document.querySelector('#generateButton');
const download = document.querySelector('#downloadButton');
const share = document.querySelector('#shareButton');
const resultActions = document.querySelector('#resultActions');
const loader = document.querySelector('#loader');
const resultError = document.querySelector('#resultError');
const comparison = document.querySelector('#comparison');
const comparisonBefore = document.querySelector('#comparisonBefore');
const comparisonAfterImage = document.querySelector('#comparisonAfterImage');
const comparisonRange = document.querySelector('#comparisonRange');
const resultStage = document.querySelector('#resultStage');
const selectedStylePreview = document.querySelector('#selectedStylePreview');
const selectedStylePreviewImage = document.querySelector('#selectedStylePreviewImage');
const selectedStylePreviewName = document.querySelector('#selectedStylePreviewName');
const stylesContainer = document.querySelector('#styles');
const categoryFilters = document.querySelector('#categoryFilters');
let activeCategory = '';
const promptCustomize = document.querySelector('#promptCustomize');
const promptToggleButton = document.querySelector('#promptToggleButton');
const promptTextarea = document.querySelector('#promptTextarea');
let hasApiKey = false;
let uploadedFile = null;
let uploadedImageUrl = '';
let generatedImageUrl = '';
let generatedBlob = null;
let sourceAspectRatio = 1;
let selectedStyleId = '';
let selectedStyleTitle = '';
let promptLoadedForStyleId = '';

function updateGenerateAvailability() {
  const readyToGenerate = Boolean(uploadedFile && selectedStyleId);
  generate.disabled = !readyToGenerate;
  if (!readyToGenerate) {
    generate.textContent = 'Generate image';
  } else if (!hasApiKey) {
    generate.textContent = `Connect ${selectedProvider} to generate`;
  } else if (!generatedBlob) {
    generate.textContent = 'Generate image';
  }
}

async function loadStyles() {
  try {
    const response = await fetch('/api/styles');
    if (!response.ok) throw new Error('Could not load styles.');
    const styles = await response.json();
    stylesContainer.replaceChildren(...styles.map(style => {
      const button = document.createElement('button');
      button.className = 'style';
      button.dataset.id = style.id;
      button.dataset.name = style.title;
      button.dataset.imageUrl = style.imageUrl || '';
      button.dataset.category = style.category || '';
      const swatch = document.createElement('span');
      swatch.className = 'style-swatch';
      if (style.imageUrl) swatch.style.backgroundImage = `url('${style.imageUrl}')`;
      button.appendChild(swatch);
      button.append(style.title);
      return button;
    }));
    renderCategoryFilters(styles);
    applyCategoryFilter();
  } catch {
    const message = document.createElement('div');
    message.className = 'styles-error';
    message.append('Couldn’t load styles.');
    const retry = document.createElement('button');
    retry.className = 'retry-styles';
    retry.type = 'button';
    retry.textContent = 'Retry';
    retry.addEventListener('click', loadStyles);
    message.appendChild(retry);
    stylesContainer.replaceChildren(message);
  }
}

function renderCategoryFilters(styles) {
  const categories = [...new Set(styles.map(style => style.category).filter(Boolean))];
  if (!categories.length) {
    categoryFilters.hidden = true;
    categoryFilters.replaceChildren();
    activeCategory = '';
    return;
  }
  if (activeCategory && !categories.includes(activeCategory)) activeCategory = '';
  categoryFilters.hidden = false;
  const pills = ['All', ...categories].map(label => {
    const value = label === 'All' ? '' : label;
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'category-pill';
    pill.textContent = label;
    pill.classList.toggle('active', value === activeCategory);
    pill.addEventListener('click', () => {
      activeCategory = value;
      categoryFilters.querySelectorAll('.category-pill').forEach(item => item.classList.remove('active'));
      pill.classList.add('active');
      applyCategoryFilter();
    });
    return pill;
  });
  categoryFilters.replaceChildren(...pills);
}

function applyCategoryFilter() {
  stylesContainer.querySelectorAll('.style').forEach(button => {
    button.hidden = Boolean(activeCategory) && button.dataset.category !== activeCategory;
  });
}

function prepareFile(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    uploadStatus.textContent = 'Please choose an image file.';
    return;
  }
  if (file.size > 12 * 1024 * 1024) {
    uploadStatus.textContent = 'Please choose an image smaller than 12 MB.';
    input.value = '';
    return;
  }
  uploadStatus.textContent = 'Preparing photo…';
  if (uploadedImageUrl) URL.revokeObjectURL(uploadedImageUrl);
  uploadedImageUrl = URL.createObjectURL(file);
  const source = new Image();
  source.onload = () => {
    sourceAspectRatio = source.naturalWidth / source.naturalHeight;
    uploadedFile = file;
    generatedBlob = null;
    if (generatedImageUrl) URL.revokeObjectURL(generatedImageUrl);
    generatedImageUrl = '';
    preview.src = uploadedImageUrl;
    preview.hidden = false;
    comparisonBefore.src = uploadedImageUrl;
    comparison.hidden = true;
    resultStage.classList.remove('has-result');
    empty.hidden = true;
    resultImage.hidden = true;
    resultEmpty.hidden = false;
    updateGenerateAvailability();
    resultActions.hidden = true;
    uploadStatus.textContent = '';
  };
  source.onerror = () => {
    URL.revokeObjectURL(uploadedImageUrl);
    uploadedImageUrl = '';
    uploadStatus.textContent = 'This photo format cannot be opened here. Please choose a JPEG, PNG, or WebP.';
  };
  source.src = uploadedImageUrl;
}

input.addEventListener('change', () => prepareFile(input.files[0]));

const stage = document.querySelector('#stage');
['dragenter', 'dragover'].forEach(type => stage.addEventListener(type, event => {
  event.preventDefault();
  stage.classList.add('dragging');
}));
['dragleave', 'drop'].forEach(type => stage.addEventListener(type, event => {
  event.preventDefault();
  stage.classList.remove('dragging');
}));
stage.addEventListener('drop', event => prepareFile(event.dataTransfer.files[0]));

stylesContainer.addEventListener('click', (event) => {
  const button = event.target.closest('.style');
  if (!button) return;
  document.querySelectorAll('.style').forEach(item => item.classList.remove('active'));
  button.classList.add('active');
  selectedStyleId = button.dataset.id;
  selectedStyleTitle = button.dataset.name;
  selectedStylePreviewImage.src = button.dataset.imageUrl;
  selectedStylePreviewImage.alt = `${button.dataset.name} style preview`;
  selectedStylePreviewName.textContent = button.dataset.name;
  selectedStylePreview.hidden = false;
  promptCustomize.hidden = false;
  if (!promptTextarea.hidden) loadPromptForSelectedStyle();
  updateGenerateAvailability();
});

async function loadPromptForSelectedStyle() {
  if (!selectedStyleId || promptLoadedForStyleId === selectedStyleId) return;
  promptTextarea.value = 'Loading…';
  try {
    const response = await fetch(`/api/styles/${encodeURIComponent(selectedStyleId)}/prompt`);
    if (!response.ok) throw new Error();
    const payload = await response.json();
    promptTextarea.value = payload.prompt;
    promptLoadedForStyleId = selectedStyleId;
  } catch {
    promptTextarea.value = '';
    promptLoadedForStyleId = '';
  }
}

promptToggleButton.addEventListener('click', () => {
  const opening = promptTextarea.hidden;
  promptTextarea.hidden = !opening;
  promptToggleButton.setAttribute('aria-expanded', String(opening));
  promptToggleButton.textContent = opening ? 'Hide prompt' : 'Customize prompt';
  if (opening) loadPromptForSelectedStyle();
});

loadStyles();

generate.addEventListener('click', async () => {
  if (!uploadedFile || !selectedStyleId) return;
  if (!hasApiKey) {
    showPage('settings');
    apiKey.focus();
    return;
  }
  loader.classList.add('show');
  resultError.hidden = true;
  generate.disabled = true;
  input.disabled = true;
  stage.classList.add('is-generating');
  stylesContainer.querySelectorAll('.style').forEach(button => { button.disabled = true; });
  try {
    const headers = {
      'Content-Type': uploadedFile.type,
      'X-Reshaper-Provider': selectedProvider,
      'X-Reshaper-Model': modelSelect.value,
      'X-Reshaper-Api-Key': apiKey.value.trim(),
      'X-Reshaper-Aspect-Ratio': String(sourceAspectRatio),
      'X-Reshaper-Style-Id': selectedStyleId,
      'X-Reshaper-Quality': qualitySelect.value
    };
    if (!promptTextarea.hidden && promptTextarea.value.trim()) {
      headers['X-Reshaper-Custom-Prompt'] = encodeURIComponent(promptTextarea.value.trim());
    }
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers,
      body: uploadedFile
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || 'Image generation failed.');
    }
    generatedBlob = await response.blob();
    if (!generatedBlob.type.startsWith('image/')) throw new Error('The generated image could not be decoded.');
    if (generatedImageUrl) URL.revokeObjectURL(generatedImageUrl);
    generatedImageUrl = URL.createObjectURL(generatedBlob);
    comparisonAfterImage.src = generatedImageUrl;
    comparisonRange.value = '50';
    comparison.style.setProperty('--comparison-position', '50%');
    comparison.hidden = false;
    resultStage.classList.add('has-result');
    resultImage.hidden = true;
    resultEmpty.hidden = true;
    resultActions.hidden = false;
    generate.textContent = 'Generate again';
  } catch (error) {
    resultError.textContent = `${error.message} Check your connection or try again.`;
    resultError.hidden = false;
  } finally {
    loader.classList.remove('show');
    input.disabled = false;
    stage.classList.remove('is-generating');
    stylesContainer.querySelectorAll('.style').forEach(button => { button.disabled = false; });
    updateGenerateAvailability();
  }
});

download.addEventListener('click', () => {
  const link = document.createElement('a');
  const extension = generatedBlob?.type === 'image/jpeg' ? 'jpg' : generatedBlob?.type === 'image/webp' ? 'webp' : 'png';
  link.download = `reshaper-${selectedStyleTitle.toLowerCase().replace(/\s+/g, '-')}.${extension}`;
  link.href = generatedImageUrl;
  link.click();
});

share.addEventListener('click', async () => {
  try {
    const file = new File([generatedBlob], 'reshaper.png', { type: generatedBlob.type || 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ title: 'Made with Reshaper', files: [file] });
    } else {
      alert('Sharing is not supported in this browser. Try downloading the image instead.');
    }
  } catch (error) {
    alert(`Unable to share: ${error.message}`);
  }
});

comparisonRange.addEventListener('input', () => {
  comparison.style.setProperty('--comparison-position', `${comparisonRange.value}%`);
});

const createPage = document.querySelector('#createPage');
const settingsPage = document.querySelector('#settingsPage');
const settingsButton = document.querySelector('#settingsButton');
const backButton = document.querySelector('#backButton');
const apiKey = document.querySelector('#apiKey');
const keyLabel = document.querySelector('#keyLabel');
const modelSelect = document.querySelector('#modelSelect');
const modelHelp = document.querySelector('#modelHelp');
const qualitySelect = document.querySelector('#qualitySelect');
const qualityHelp = document.querySelector('#qualityHelp');
const connectionStatus = document.querySelector('#connectionStatus');
let selectedProvider = 'Gemini';
let providerKeys = {};
let providerModels = {};
let modelQuality = {};
let verifiedProviders = {};
let testedKey = '';
const modelCatalog = {
  Gemini: [
    { id: 'gemini-3.1-flash-lite-image', name: 'Nano Banana 2 Lite', help: 'Fastest and lowest-cost option for high-volume generation.' },
    { id: 'gemini-3.1-flash-image', name: 'Nano Banana 2', help: 'Balanced quality, speed, and cost. Recommended default.' },
    { id: 'gemini-3-pro-image', name: 'Nano Banana Pro', help: 'Highest-quality Gemini option for demanding edits.' }
  ],
  OpenAI: [
    { id: 'gpt-image-2', name: 'GPT Image 2', help: 'OpenAI’s current state-of-the-art image generation and editing model.' }
  ]
};
// Resolution support differs per Gemini model (confirmed against Google's docs) —
// the Lite model only supports 1K, so quality options are keyed by model id,
// not just provider, to avoid offering a resolution a given model can't produce.
const qualityCatalog = {
  'gemini-3.1-flash-lite-image': {
    default: '1K',
    levels: [
      { id: '1K', name: '1K', help: 'The only resolution this model supports.' }
    ]
  },
  'gemini-3.1-flash-image': {
    default: '1K',
    levels: [
      { id: '1K', name: '1K', help: 'Fastest and lowest cost. Recommended default.' },
      { id: '2K', name: '2K', help: 'Sharper detail. Slower and higher cost.' },
      { id: '4K', name: '4K', help: 'Maximum detail. Slowest and highest cost.' }
    ]
  },
  'gemini-3-pro-image': {
    default: '1K',
    levels: [
      { id: '1K', name: '1K', help: 'Fastest and lowest cost. Recommended default.' },
      { id: '2K', name: '2K', help: 'Sharper detail. Slower and higher cost.' },
      { id: '4K', name: '4K', help: 'Maximum detail. Slowest and highest cost.' }
    ]
  },
  'gpt-image-2': {
    default: 'medium',
    levels: [
      { id: 'low', name: 'Low', help: 'Fastest and lowest cost.' },
      { id: 'medium', name: 'Medium', help: 'Balanced quality, speed, and cost. Recommended default.' },
      { id: 'high', name: 'High', help: 'Highest quality. Slowest and highest cost.' }
    ]
  }
};

try {
  providerKeys = JSON.parse(sessionStorage.getItem('reshaperApiKeys') || '{}');
  providerModels = JSON.parse(sessionStorage.getItem('reshaperModels') || '{}');
  modelQuality = JSON.parse(sessionStorage.getItem('reshaperQuality') || '{}');
  verifiedProviders = JSON.parse(sessionStorage.getItem('reshaperVerifiedProviders') || '{}');
} catch {
  providerKeys = {};
  providerModels = {};
  modelQuality = {};
  verifiedProviders = {};
}

function renderModels() {
  const models = modelCatalog[selectedProvider];
  modelSelect.replaceChildren(...models.map(model => {
    const option = document.createElement('option');
    option.value = model.id;
    option.textContent = model.name;
    return option;
  }));
  const fallback = selectedProvider === 'Gemini' ? 'gemini-3.1-flash-image' : models[0].id;
  modelSelect.value = providerModels[selectedProvider] || fallback;
  modelHelp.textContent = models.find(model => model.id === modelSelect.value)?.help || '';
}

function renderQuality() {
  const catalogEntry = qualityCatalog[modelSelect.value] || qualityCatalog['gemini-3.1-flash-image'];
  qualitySelect.replaceChildren(...catalogEntry.levels.map(level => {
    const option = document.createElement('option');
    option.value = level.id;
    option.textContent = level.name;
    return option;
  }));
  const saved = modelQuality[modelSelect.value];
  qualitySelect.value = catalogEntry.levels.some(level => level.id === saved) ? saved : catalogEntry.default;
  qualityHelp.textContent = catalogEntry.levels.find(level => level.id === qualitySelect.value)?.help || '';
}

function loadProviderKey() {
  apiKey.value = providerKeys[selectedProvider] || '';
  hasApiKey = Boolean(apiKey.value);
  const isVerified = hasApiKey && Boolean(verifiedProviders[selectedProvider]);
  connectionStatus.textContent = isVerified ? 'Connected' : hasApiKey ? 'Key saved — test connection' : 'Not connected';
  connectionStatus.classList.toggle('connected', isVerified);
  settingsButton.classList.toggle('connected', isVerified);
  settingsButton.textContent = isVerified ? `${selectedProvider} connected · Settings` : hasApiKey ? `${selectedProvider} key saved · Settings` : 'API settings ↗';
  updateGenerateAvailability();
}

renderModels();
renderQuality();
loadProviderKey();

if (location.hash === '#settings') showPage('settings');

modelSelect.addEventListener('change', () => {
  const model = modelCatalog[selectedProvider].find(item => item.id === modelSelect.value);
  modelHelp.textContent = model?.help || '';
  renderQuality();
});

qualitySelect.addEventListener('change', () => {
  const catalogEntry = qualityCatalog[modelSelect.value];
  qualityHelp.textContent = catalogEntry?.levels.find(level => level.id === qualitySelect.value)?.help || '';
});

function showPage(page) {
  createPage.hidden = page !== 'create';
  settingsPage.hidden = page !== 'settings';
  settingsButton.hidden = page === 'settings';
  backButton.hidden = page !== 'settings';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

settingsButton.addEventListener('click', () => showPage('settings'));
backButton.addEventListener('click', () => showPage('create'));

document.querySelector('#providers').addEventListener('click', event => {
  const provider = event.target.closest('.provider');
  if (!provider) return;
  document.querySelectorAll('.provider').forEach(item => item.classList.remove('active'));
  provider.classList.add('active');
  selectedProvider = provider.dataset.provider;
  keyLabel.textContent = `${selectedProvider} API key`;
  apiKey.placeholder = selectedProvider === 'Gemini' ? 'AIza…' : 'sk-…';
  renderModels();
  renderQuality();
  loadProviderKey();
});

document.querySelector('#revealKey').addEventListener('click', event => {
  const showing = apiKey.type === 'text';
  apiKey.type = showing ? 'password' : 'text';
  event.currentTarget.textContent = showing ? 'Show' : 'Hide';
});

document.querySelector('#testButton').addEventListener('click', async () => {
  if (!apiKey.value.trim()) return apiKey.reportValidity();
  connectionStatus.textContent = 'Testing…';
  connectionStatus.classList.remove('connected');
  try {
    const response = await fetch('/api/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: selectedProvider, apiKey: apiKey.value.trim() })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Connection failed.');
    testedKey = apiKey.value.trim();
    connectionStatus.textContent = 'Connected — save settings to use it';
    connectionStatus.classList.add('connected');
  } catch (error) {
    connectionStatus.textContent = 'Connection failed';
    alert(error.message);
  }
});

document.querySelector('#apiForm').addEventListener('submit', event => {
  event.preventDefault();
  if (!apiKey.value.trim()) return apiKey.reportValidity();
  providerKeys[selectedProvider] = apiKey.value.trim();
  providerModels[selectedProvider] = modelSelect.value;
  modelQuality[modelSelect.value] = qualitySelect.value;
  verifiedProviders[selectedProvider] = testedKey === apiKey.value.trim();
  sessionStorage.setItem('reshaperApiKeys', JSON.stringify(providerKeys));
  sessionStorage.setItem('reshaperModels', JSON.stringify(providerModels));
  sessionStorage.setItem('reshaperQuality', JSON.stringify(modelQuality));
  sessionStorage.setItem('reshaperVerifiedProviders', JSON.stringify(verifiedProviders));
  hasApiKey = true;
  loadProviderKey();
  updateGenerateAvailability();
  setTimeout(() => showPage('create'), 500);
});
