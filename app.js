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

// ---------- i18n ----------
let lang = sessionStorage.getItem('reshaperLang') === 'zh' ? 'zh' : 'en';
const langToggleButton = document.querySelector('#langToggleButton');

const I18N = {
  en: {
    editStyles: 'Edit Styles',
    apiSettings: 'API settings  ↗',
    backToStudio: 'Back to studio',
    sourceStep: '01 Source',
    uploadPhoto: 'Upload Photo',
    uploadHint: 'PNG, JPG, WebP<br>Max 12 MB',
    styleLabel: 'Style',
    chooseStyleStep: '02 Choose a Style',
    resultStep: '03 Result',
    customizePrompt: 'Customize prompt',
    hidePrompt: 'Hide prompt',
    generateImage: 'Generate image',
    generateAgain: 'Generate again',
    connectToGenerate: provider => `Connect ${provider} to generate`,
    resultEmptyTitle: 'Your result <br>appears here',
    resultEmptyHint: 'Add a photo, choose a style, then generate.',
    original: 'Original',
    generated: 'Generated',
    loaderTitle: 'Reshaping your moment…',
    loaderHint: 'Usually under a minute',
    connectEngine: 'Connect your creative engine.',
    byokDescription: 'Bring your own Gemini or OpenAI API key. You remain responsible for usage and charges billed by the provider.',
    privacyNoteTitle: 'Privacy note',
    privacyNoteBody: "This testing build stores keys in this tab's browser session so they survive reloads. Keys are forwarded through the local backend, never written to disk, and cleared when the browser session ends.",
    modelConnection: 'Model connection',
    notConnected: 'Not connected',
    connected: 'Connected',
    keySavedTest: 'Key saved — test connection',
    geminiDesc: 'Nano Banana image models',
    openaiDesc: 'GPT Image models',
    imageModel: 'Image model',
    imageQuality: 'Image quality',
    geminiApiKey: 'Gemini API key',
    openaiApiKey: 'OpenAI API key',
    show: 'Show',
    hide: 'Hide',
    keyPrivacyNote: 'Your key is never included in exported images or analytics.',
    testConnection: 'Test connection',
    saveSettings: 'Save settings',
    couldntLoadStyles: 'Couldn’t load styles.',
    retry: 'Retry',
    allCategories: 'All',
    chooseImageFile: 'Please choose an image file.',
    chooseSmallerImage: 'Please choose an image smaller than 12 MB.',
    preparingPhoto: 'Preparing photo…',
    unsupportedFormat: 'This photo format cannot be opened here. Please choose a JPEG, PNG, or WebP.',
    loadingPrompt: 'Loading…',
    checkConnection: 'Check your connection or try again.',
    generationFailed: 'Image generation failed.',
    couldNotDecode: 'The generated image could not be decoded.',
    sharingNotSupported: 'Sharing is not supported in this browser. Try downloading the image instead.',
    unableToShare: msg => `Unable to share: ${msg}`,
    testingConnection: 'Testing…',
    connectionFailed: 'Connection failed',
    savedConnectSettings: 'Connected — save settings to use it',
    keySavedSettings: provider => `${provider} key saved · Settings`,
    connectedSettings: provider => `${provider} connected · Settings`
  },
  zh: {
    editStyles: '編輯樣式',
    apiSettings: 'API 設定  ↗',
    backToStudio: '返回工作室',
    sourceStep: '01 素材',
    uploadPhoto: '上傳照片',
    uploadHint: 'PNG、JPG、WebP<br>最大 12 MB',
    styleLabel: '風格',
    chooseStyleStep: '02 選擇風格',
    resultStep: '03 結果',
    customizePrompt: '自訂提示詞',
    hidePrompt: '隱藏提示詞',
    generateImage: '生成圖片',
    generateAgain: '重新生成',
    connectToGenerate: provider => `連接 ${provider} 以生成`,
    resultEmptyTitle: '生成結果<br>將顯示在這裡',
    resultEmptyHint: '上傳照片、選擇風格，然後生成。',
    original: '原圖',
    generated: '生成圖',
    loaderTitle: '正在重塑你的瞬間…',
    loaderHint: '通常不到一分鐘',
    connectEngine: '連接你的創作引擎。',
    byokDescription: '使用你自己的 Gemini 或 OpenAI API 金鑰。你需自行承擔服務商產生的使用費用。',
    privacyNoteTitle: '隱私提示',
    privacyNoteBody: '此測試版本會將金鑰儲存在此分頁的瀏覽器工作階段中，以便重新整理後仍然保留。金鑰僅透過本機後端轉發，不會寫入磁碟，並會在瀏覽器工作階段結束時清除。',
    modelConnection: '模型連接',
    notConnected: '尚未連接',
    connected: '已連接',
    keySavedTest: '金鑰已儲存 — 請測試連接',
    geminiDesc: 'Nano Banana 圖片模型',
    openaiDesc: 'GPT Image 圖片模型',
    imageModel: '圖片模型',
    imageQuality: '圖片品質',
    geminiApiKey: 'Gemini API 金鑰',
    openaiApiKey: 'OpenAI API 金鑰',
    show: '顯示',
    hide: '隱藏',
    keyPrivacyNote: '你的金鑰不會出現在匯出的圖片或分析資料中。',
    testConnection: '測試連接',
    saveSettings: '儲存設定',
    couldntLoadStyles: '無法載入風格。',
    retry: '重試',
    allCategories: '全部',
    chooseImageFile: '請選擇一個圖片檔案。',
    chooseSmallerImage: '請選擇小於 12 MB 的圖片。',
    preparingPhoto: '正在準備照片…',
    unsupportedFormat: '無法開啟此照片格式，請選擇 JPEG、PNG 或 WebP。',
    loadingPrompt: '載入中…',
    checkConnection: '請檢查你的網路連接或再試一次。',
    generationFailed: '圖片生成失敗。',
    couldNotDecode: '無法解碼生成的圖片。',
    sharingNotSupported: '此瀏覽器不支援分享功能，請改用下載。',
    unableToShare: msg => `無法分享：${msg}`,
    testingConnection: '測試中…',
    connectionFailed: '連接失敗',
    savedConnectSettings: '已連接 — 請儲存設定以套用',
    keySavedSettings: provider => `${provider} 金鑰已儲存．設定`,
    connectedSettings: provider => `${provider} 已連接．設定`
  }
};

function t(key, ...args) {
  const entry = I18N[lang][key];
  return typeof entry === 'function' ? entry(...args) : entry;
}

function applyStaticTranslations() {
  document.documentElement.lang = lang === 'zh' ? 'zh-Hant' : 'en';
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-html]').forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
  langToggleButton.textContent = lang === 'zh' ? 'EN' : '中文';
}

function setLang(next) {
  lang = next;
  sessionStorage.setItem('reshaperLang', lang);
  applyStaticTranslations();
  loadStyles();
  renderModels();
  renderQuality();
  loadProviderKey();
  if (selectedStyleId) selectedStylePreviewImage.alt = `${selectedStyleTitle} style preview`;
  keyLabel.textContent = t(selectedProvider === 'Gemini' ? 'geminiApiKey' : 'openaiApiKey');
  promptToggleButton.textContent = promptTextarea.hidden ? t('customizePrompt') : t('hidePrompt');
  promptLoadedForStyleId = '';
  if (!promptTextarea.hidden) loadPromptForSelectedStyle();
}

langToggleButton.addEventListener('click', () => setLang(lang === 'zh' ? 'en' : 'zh'));

function updateGenerateAvailability() {
  const readyToGenerate = Boolean(uploadedFile && selectedStyleId);
  generate.disabled = !readyToGenerate;
  if (!readyToGenerate) {
    generate.textContent = t('generateImage');
  } else if (!hasApiKey) {
    generate.textContent = t('connectToGenerate', selectedProvider);
  } else if (!generatedBlob) {
    generate.textContent = t('generateImage');
  }
}

async function loadStyles() {
  try {
    const response = await fetch(`/api/styles?lang=${lang}`);
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
    message.append(t('couldntLoadStyles'));
    const retry = document.createElement('button');
    retry.className = 'retry-styles';
    retry.type = 'button';
    retry.textContent = t('retry');
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
  const pills = [{ value: '', label: t('allCategories') }, ...categories.map(name => ({ value: name, label: name }))].map(({ value, label }) => {
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
    uploadStatus.textContent = t('chooseImageFile');
    return;
  }
  if (file.size > 12 * 1024 * 1024) {
    uploadStatus.textContent = t('chooseSmallerImage');
    input.value = '';
    return;
  }
  uploadStatus.textContent = t('preparingPhoto');
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
    uploadStatus.textContent = t('unsupportedFormat');
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
  promptTextarea.value = t('loadingPrompt');
  try {
    const response = await fetch(`/api/styles/${encodeURIComponent(selectedStyleId)}/prompt?lang=${lang}`);
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
  promptToggleButton.textContent = opening ? t('hidePrompt') : t('customizePrompt');
  if (opening) loadPromptForSelectedStyle();
});

applyStaticTranslations();
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
      'X-Reshaper-Quality': qualitySelect.value,
      'X-Reshaper-Lang': lang
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
      throw new Error(payload.error || t('generationFailed'));
    }
    generatedBlob = await response.blob();
    if (!generatedBlob.type.startsWith('image/')) throw new Error(t('couldNotDecode'));
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
    generate.textContent = t('generateAgain');
  } catch (error) {
    resultError.textContent = `${error.message} ${t('checkConnection')}`;
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
      alert(t('sharingNotSupported'));
    }
  } catch (error) {
    alert(t('unableToShare', error.message));
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
    { id: 'gemini-3.1-flash-lite-image', name: 'Nano Banana 2 Lite', help: 'Fastest and lowest-cost option for high-volume generation.', helpZh: '速度最快、成本最低的選項，適合大量生成。' },
    { id: 'gemini-3.1-flash-image', name: 'Nano Banana 2', help: 'Balanced quality, speed, and cost. Recommended default.', helpZh: '在品質、速度與成本之間取得平衡，建議預設使用。' },
    { id: 'gemini-3-pro-image', name: 'Nano Banana Pro', help: 'Highest-quality Gemini option for demanding edits.', helpZh: 'Gemini 中品質最高的選項，適合要求較高的編輯。' }
  ],
  OpenAI: [
    { id: 'gpt-image-2', name: 'GPT Image 2', help: 'OpenAI’s current state-of-the-art image generation and editing model.', helpZh: 'OpenAI 目前最先進的圖片生成與編輯模型。' }
  ]
};
// Resolution support differs per Gemini model (confirmed against Google's docs) —
// the Lite model only supports 1K, so quality options are keyed by model id,
// not just provider, to avoid offering a resolution a given model can't produce.
const qualityCatalog = {
  'gemini-3.1-flash-lite-image': {
    default: '1K',
    levels: [
      { id: '1K', name: '1K', help: 'The only resolution this model supports.', helpZh: '此模型僅支援此解析度。' }
    ]
  },
  'gemini-3.1-flash-image': {
    default: '1K',
    levels: [
      { id: '1K', name: '1K', help: 'Fastest and lowest cost. Recommended default.', helpZh: '速度最快、成本最低，建議預設使用。' },
      { id: '2K', name: '2K', help: 'Sharper detail. Slower and higher cost.', helpZh: '細節更清晰，速度較慢、成本較高。' },
      { id: '4K', name: '4K', help: 'Maximum detail. Slowest and highest cost.', helpZh: '細節最豐富，速度最慢、成本最高。' }
    ]
  },
  'gemini-3-pro-image': {
    default: '1K',
    levels: [
      { id: '1K', name: '1K', help: 'Fastest and lowest cost. Recommended default.', helpZh: '速度最快、成本最低，建議預設使用。' },
      { id: '2K', name: '2K', help: 'Sharper detail. Slower and higher cost.', helpZh: '細節更清晰，速度較慢、成本較高。' },
      { id: '4K', name: '4K', help: 'Maximum detail. Slowest and highest cost.', helpZh: '細節最豐富，速度最慢、成本最高。' }
    ]
  },
  'gpt-image-2': {
    default: 'medium',
    levels: [
      { id: 'low', name: 'Low', nameZh: '低', help: 'Fastest and lowest cost.', helpZh: '速度最快、成本最低。' },
      { id: 'medium', name: 'Medium', nameZh: '中', help: 'Balanced quality, speed, and cost. Recommended default.', helpZh: '在品質、速度與成本之間取得平衡，建議預設使用。' },
      { id: 'high', name: 'High', nameZh: '高', help: 'Highest quality. Slowest and highest cost.', helpZh: '品質最高，速度最慢、成本最高。' }
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
  const activeModel = models.find(model => model.id === modelSelect.value);
  modelHelp.textContent = (lang === 'zh' ? activeModel?.helpZh : activeModel?.help) || '';
}

function renderQuality() {
  const catalogEntry = qualityCatalog[modelSelect.value] || qualityCatalog['gemini-3.1-flash-image'];
  qualitySelect.replaceChildren(...catalogEntry.levels.map(level => {
    const option = document.createElement('option');
    option.value = level.id;
    option.textContent = (lang === 'zh' && level.nameZh) || level.name;
    return option;
  }));
  const saved = modelQuality[modelSelect.value];
  qualitySelect.value = catalogEntry.levels.some(level => level.id === saved) ? saved : catalogEntry.default;
  const activeLevel = catalogEntry.levels.find(level => level.id === qualitySelect.value);
  qualityHelp.textContent = (lang === 'zh' ? activeLevel?.helpZh : activeLevel?.help) || '';
}

function loadProviderKey() {
  apiKey.value = providerKeys[selectedProvider] || '';
  hasApiKey = Boolean(apiKey.value);
  const isVerified = hasApiKey && Boolean(verifiedProviders[selectedProvider]);
  connectionStatus.textContent = isVerified ? t('connected') : hasApiKey ? t('keySavedTest') : t('notConnected');
  connectionStatus.classList.toggle('connected', isVerified);
  settingsButton.classList.toggle('connected', isVerified);
  settingsButton.textContent = isVerified ? t('connectedSettings', selectedProvider) : hasApiKey ? t('keySavedSettings', selectedProvider) : t('apiSettings');
  updateGenerateAvailability();
}

renderModels();
renderQuality();
loadProviderKey();

if (location.hash === '#settings') showPage('settings');

modelSelect.addEventListener('change', () => {
  const model = modelCatalog[selectedProvider].find(item => item.id === modelSelect.value);
  modelHelp.textContent = (lang === 'zh' ? model?.helpZh : model?.help) || '';
  renderQuality();
});

qualitySelect.addEventListener('change', () => {
  const catalogEntry = qualityCatalog[modelSelect.value];
  const activeLevel = catalogEntry?.levels.find(level => level.id === qualitySelect.value);
  qualityHelp.textContent = (lang === 'zh' ? activeLevel?.helpZh : activeLevel?.help) || '';
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
  keyLabel.textContent = t(selectedProvider === 'Gemini' ? 'geminiApiKey' : 'openaiApiKey');
  apiKey.placeholder = selectedProvider === 'Gemini' ? 'AIza…' : 'sk-…';
  renderModels();
  renderQuality();
  loadProviderKey();
});

document.querySelector('#revealKey').addEventListener('click', event => {
  const showing = apiKey.type === 'text';
  apiKey.type = showing ? 'password' : 'text';
  event.currentTarget.textContent = showing ? t('show') : t('hide');
});

document.querySelector('#testButton').addEventListener('click', async () => {
  if (!apiKey.value.trim()) return apiKey.reportValidity();
  connectionStatus.textContent = t('testingConnection');
  connectionStatus.classList.remove('connected');
  try {
    const response = await fetch('/api/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: selectedProvider, apiKey: apiKey.value.trim() })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || t('connectionFailed'));
    testedKey = apiKey.value.trim();
    connectionStatus.textContent = t('savedConnectSettings');
    connectionStatus.classList.add('connected');
  } catch (error) {
    connectionStatus.textContent = t('connectionFailed');
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
