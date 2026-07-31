const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const MAX_BODY_BYTES = 18 * 1024 * 1024;
const MAX_STYLE_IMAGE_BYTES = 5 * 1024 * 1024;
const MODEL_ALLOWLIST = {
  Gemini: new Set([
    'gemini-3.1-flash-lite-image',
    'gemini-3.1-flash-image',
    'gemini-3-pro-image'
  ]),
  OpenAI: new Set(['gpt-image-2'])
};
// Resolution support differs per Gemini model — confirmed against Google's
// docs: the Lite model only supports 1K, the other two support up to 4K.
const GEMINI_IMAGE_SIZES_BY_MODEL = {
  'gemini-3.1-flash-lite-image': new Set(['1K']),
  'gemini-3.1-flash-image': new Set(['1K', '2K', '4K']),
  'gemini-3-pro-image': new Set(['1K', '2K', '4K'])
};
const OPENAI_QUALITY_LEVELS = new Set(['low', 'medium', 'high']);

const DATA_DIR = path.join(__dirname, 'data');
const STYLES_FILE = path.join(DATA_DIR, 'styles.json');
const STYLES_BACKUP_FILE = path.join(DATA_DIR, 'styles.json.bak');
const CATEGORIES_FILE = path.join(DATA_DIR, 'categories.json');
const CATEGORIES_BACKUP_FILE = path.join(DATA_DIR, 'categories.json.bak');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

// Last-resort safety net only — used solely if a generate request arrives
// with a styleId that matches no enabled style (e.g. styles.json is empty
// or corrupted). Not shown or selectable anywhere in the UI.
const FALLBACK_STYLE = {
  id: 'fallback',
  title: 'Fallback',
  prompt: 'Transform this photo into a refined editorial photograph with restrained color, confident composition, soft directional studio light, natural texture, and premium magazine art direction.',
  identityMode: 'generic'
};

const UPLOAD_FILENAME_RE = /^[0-9a-f-]{36}\.(jpe?g|png|webp)$/;
const EXT_BY_MIME = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const CONTENT_TYPE_BY_EXT = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

const GEMINI_RATIOS = [
  ['9:16', 9 / 16], ['2:3', 2 / 3], ['3:4', 3 / 4], ['4:5', 4 / 5],
  ['1:1', 1], ['5:4', 5 / 4], ['4:3', 4 / 3], ['3:2', 3 / 2],
  ['16:9', 16 / 9], ['21:9', 21 / 9]
];

function closestGeminiRatio(aspectRatio) {
  return GEMINI_RATIOS.reduce((closest, candidate) =>
    Math.abs(candidate[1] - aspectRatio) < Math.abs(closest[1] - aspectRatio) ? candidate : closest
  )[0];
}

function openAIImageSize(aspectRatio) {
  if (aspectRatio < 0.9) return '1024x1536';
  if (aspectRatio > 1.1) return '1536x1024';
  return '1024x1024';
}

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  response.end(body);
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    request.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('The uploaded image is too large.'));
        request.destroy();
        return;
      }
      body += chunk;
    });
    request.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch { reject(new Error('Invalid request body.')); }
    });
    request.on('error', reject);
  });
}

function readBinary(request, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', chunk => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('The uploaded image is too large.'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

function parseDataUrl(dataUrl) {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
  if (!match) throw new Error('Please upload a PNG, JPEG, or WebP image.');
  return { mimeType: match[1], base64: match[2], bytes: Buffer.from(match[2], 'base64') };
}

function sendImage(response, dataUrl) {
  const image = parseDataUrl(dataUrl);
  response.writeHead(200, {
    'Content-Type': image.mimeType,
    'Content-Length': image.bytes.length,
    'Cache-Control': 'no-store'
  });
  response.end(image.bytes);
}

function providerError(payload, fallback) {
  return payload?.error?.message || payload?.message || payload?.error || fallback;
}

function findGeminiImage(value) {
  if (!value || typeof value !== 'object') return null;
  if (value.type === 'image' && typeof value.data === 'string') {
    return { data: value.data, mimeType: value.mime_type || value.mimeType || 'image/png' };
  }
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) {
      for (const item of child) {
        const found = findGeminiImage(item);
        if (found) return found;
      }
    } else if (child && typeof child === 'object') {
      const found = findGeminiImage(child);
      if (found) return found;
    }
  }
  return null;
}

async function validateKey(provider, apiKey) {
  const isGemini = provider === 'Gemini';
  const url = isGemini
    ? 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1'
    : 'https://api.openai.com/v1/models';
  const headers = isGemini
    ? { 'x-goog-api-key': apiKey }
    : { Authorization: `Bearer ${apiKey}` };
  const response = await fetch(url, { headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(providerError(payload, `${provider} rejected this API key.`));
}

async function generateWithGemini(apiKey, model, image, prompt, aspectRatio, imageSize) {
  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      model,
      input: [
        { type: 'text', text: prompt },
        { type: 'image', mime_type: image.mimeType, data: image.base64 }
      ],
      response_format: {
        type: 'image',
        mime_type: 'image/jpeg',
        image_size: imageSize,
        ...(aspectRatio ? { aspect_ratio: aspectRatio } : {})
      }
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(providerError(payload, 'Gemini could not generate the image.'));
  const output = findGeminiImage(payload);
  if (!output) throw new Error('Gemini returned no image. Try a different photo or style.');
  return `data:${output.mimeType};base64,${output.data}`;
}

async function generateWithOpenAI(apiKey, model, image, prompt, size, quality) {
  const form = new FormData();
  form.append('model', model);
  form.append('prompt', prompt);
  form.append('quality', quality);
  form.append('size', size);
  form.append('image[]', new Blob([image.bytes], { type: image.mimeType }), `source.${image.mimeType.split('/')[1]}`);
  const response = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(providerError(payload, 'OpenAI could not generate the image.'));
  const base64 = payload?.data?.[0]?.b64_json;
  if (!base64) throw new Error('OpenAI returned no image. Try a different photo or style.');
  return `data:image/png;base64,${base64}`;
}

// ---------- Styles store (JSON file + uploaded feature images) ----------

let stylesWriteQueue = Promise.resolve();
function withStylesLock(fn) {
  const result = stylesWriteQueue.then(fn, fn);
  stylesWriteQueue = result.then(() => {}, () => {});
  return result;
}

function loadStyles() {
  try {
    const raw = fs.readFileSync(STYLES_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('styles.json does not contain an array');
    return parsed;
  } catch (error) {
    console.error('Failed to read styles.json:', error.message);
    return null;
  }
}

function saveStyles(records) {
  return withStylesLock(() => {
    const json = JSON.stringify(records, null, 2);
    try { fs.copyFileSync(STYLES_FILE, STYLES_BACKUP_FILE); } catch { /* no existing file yet */ }
    const tmpFile = `${STYLES_FILE}.tmp`;
    fs.writeFileSync(tmpFile, json);
    fs.renameSync(tmpFile, STYLES_FILE);
  });
}

// ---------- Categories store (JSON file) ----------

let categoriesWriteQueue = Promise.resolve();
function withCategoriesLock(fn) {
  const result = categoriesWriteQueue.then(fn, fn);
  categoriesWriteQueue = result.then(() => {}, () => {});
  return result;
}

function loadCategories() {
  try {
    const raw = fs.readFileSync(CATEGORIES_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('categories.json does not contain an array');
    return parsed;
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    console.error('Failed to read categories.json:', error.message);
    return null;
  }
}

function saveCategories(records) {
  return withCategoriesLock(() => {
    const json = JSON.stringify(records, null, 2);
    try { fs.copyFileSync(CATEGORIES_FILE, CATEGORIES_BACKUP_FILE); } catch { /* no existing file yet */ }
    const tmpFile = `${CATEGORIES_FILE}.tmp`;
    fs.writeFileSync(tmpFile, json);
    fs.renameSync(tmpFile, CATEGORIES_FILE);
  });
}

function categoryNameById(categories, categoryId, lang) {
  if (!categoryId) return '';
  const found = (categories || []).find(category => category.id === categoryId);
  if (!found) return '';
  if (lang === 'zh') return found.nameZh || found.name;
  return found.name;
}

function resolveStyleForGenerate(styleId) {
  const styles = loadStyles();
  if (styles) {
    const requested = styles.find(style => style.id === styleId && style.enabled);
    if (requested) return requested;
  }
  return FALLBACK_STYLE;
}

const MAX_CUSTOM_PROMPT_CHARS = 4000;

const IDENTITY_SUFFIXES = {
  en: {
    none: 'Do not add stray text, logos, or watermarks beyond what is described above.',
    reinforced: 'Above all, the rendered face must remain instantly recognizable as the exact same individual from the source photo — match their true bone structure, eye shape and spacing, nose and lip shape, eyebrow shape, and skin tone before applying any stylization. Do not invent a different-looking person. Do not add stray text, logos, or watermarks beyond what is described above.',
    generic: 'Preserve the identity, pose, important facial features, subject count, and recognizable composition of the supplied photo. Do not add words, logos, watermarks, or extra people.'
  },
  zh: {
    none: '不要添加除上述内容之外的多余文字、标志或水印。',
    reinforced: '最重要的是，生成的面部必须让人一眼就能认出与原照片中是同一个人——在进行任何风格化处理之前，需先匹配其真实的骨骼结构、眼形与眼距、鼻唇形状、眉形以及肤色。不要生成成另一个长相不同的人。不要添加除上述内容之外的多余文字、标志或水印。',
    generic: '保留原照片中的身份特征、姿势、重要面部特征、人物数量以及可识别的构图。不要添加文字、标志、水印或多余的人物。'
  }
};

function buildGenerationPrompt(styleRecord, promptOverride, lang) {
  const useZh = lang === 'zh';
  const basePrompt = promptOverride || (useZh && styleRecord.promptZh ? styleRecord.promptZh : styleRecord.prompt);
  const suffixes = IDENTITY_SUFFIXES[useZh ? 'zh' : 'en'];
  const suffix = suffixes[styleRecord.identityMode] || suffixes.generic;
  return `${basePrompt} ${suffix}`;
}

function safeUploadPath(filename) {
  if (!UPLOAD_FILENAME_RE.test(filename)) return null;
  const resolved = path.join(UPLOADS_DIR, filename);
  if (!resolved.startsWith(UPLOADS_DIR + path.sep)) return null;
  return resolved;
}

function saveStyleImage(dataUrl) {
  const image = parseDataUrl(dataUrl);
  if (image.bytes.length > MAX_STYLE_IMAGE_BYTES) {
    throw new Error('Feature image must be smaller than 5 MB.');
  }
  const filename = `${crypto.randomUUID()}.${EXT_BY_MIME[image.mimeType]}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), image.bytes);
  return filename;
}

function deleteStyleImage(filename) {
  if (!filename) return;
  const resolved = safeUploadPath(filename);
  if (!resolved) return;
  try { fs.unlinkSync(resolved); } catch { /* already gone */ }
}

// ---------- Public / BYOK generation API (unchanged behavior, style lookup swapped) ----------

async function handleApi(request, response) {
  try {
    if (request.url === '/api/validate') {
      const payload = await readJson(request);
      const provider = payload.provider === 'OpenAI' ? 'OpenAI' : 'Gemini';
      const apiKey = String(payload.apiKey || '').trim();
      if (!apiKey) return sendJson(response, 400, { error: 'Enter an API key in Settings.' });
      await validateKey(provider, apiKey);
      return sendJson(response, 200, { ok: true });
    }

    if (request.url === '/api/generate') {
      const contentType = String(request.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      if (!EXT_BY_MIME[contentType]) return sendJson(response, 400, { error: 'Please upload a PNG, JPEG, or WebP image.' });
      const bytes = await readBinary(request, 12 * 1024 * 1024);
      if (!bytes.length) return sendJson(response, 400, { error: 'Please choose an image file.' });
      const image = { mimeType: contentType, bytes, base64: bytes.toString('base64') };
      const provider = request.headers['x-reshaper-provider'] === 'OpenAI' ? 'OpenAI' : 'Gemini';
      const apiKey = String(request.headers['x-reshaper-api-key'] || '').trim();
      if (!apiKey) return sendJson(response, 400, { error: 'Enter an API key in Settings.' });
      const styleRecord = resolveStyleForGenerate(String(request.headers['x-reshaper-style-id'] || ''));
      const requestedModel = String(request.headers['x-reshaper-model'] || '');
      const defaultModel = provider === 'Gemini' ? 'gemini-3.1-flash-image' : 'gpt-image-2';
      const model = MODEL_ALLOWLIST[provider].has(requestedModel) ? requestedModel : defaultModel;
      const sourceAspectRatio = Number(request.headers['x-reshaper-aspect-ratio']);
      const safeAspectRatio = Number.isFinite(sourceAspectRatio) && sourceAspectRatio > 0.2 && sourceAspectRatio < 5
        ? sourceAspectRatio
        : 1;
      let customPrompt = '';
      const rawCustomPrompt = request.headers['x-reshaper-custom-prompt'];
      if (rawCustomPrompt) {
        try { customPrompt = decodeURIComponent(String(rawCustomPrompt)).trim().slice(0, MAX_CUSTOM_PROMPT_CHARS); }
        catch { customPrompt = ''; }
      }
      const lang = request.headers['x-reshaper-lang'] === 'zh' ? 'zh' : 'en';
      const prompt = buildGenerationPrompt(styleRecord, customPrompt || undefined, lang);
      const aspectRatio = closestGeminiRatio(safeAspectRatio);
      const requestedQuality = String(request.headers['x-reshaper-quality'] || '');
      const allowedGeminiSizes = GEMINI_IMAGE_SIZES_BY_MODEL[model] || GEMINI_IMAGE_SIZES_BY_MODEL['gemini-3.1-flash-image'];
      const geminiImageSize = allowedGeminiSizes.has(requestedQuality) ? requestedQuality : '1K';
      const openAIQuality = OPENAI_QUALITY_LEVELS.has(requestedQuality) ? requestedQuality : 'medium';
      const result = provider === 'OpenAI'
        ? await generateWithOpenAI(apiKey, model, image, prompt, openAIImageSize(safeAspectRatio), openAIQuality)
        : await generateWithGemini(apiKey, model, image, prompt, aspectRatio, geminiImageSize);
      return sendImage(response, result);
    }

    sendJson(response, 404, { error: 'API route not found.' });
  } catch (error) {
    sendJson(response, 500, { error: error.message || 'Unexpected server error.' });
  }
}

function handlePublicStyles(response, lang) {
  const styles = loadStyles();
  const categories = loadCategories() || [];
  const list = (styles || [])
    .filter(style => style.enabled)
    .sort((a, b) => a.order - b.order)
    .map(style => ({
      id: style.id,
      title: lang === 'zh' && style.titleZh ? style.titleZh : style.title,
      imageUrl: style.imageFile ? `/uploads/${style.imageFile}` : null,
      category: categoryNameById(categories, style.categoryId, lang)
    }));
  sendJson(response, 200, list);
}

const MAX_CATEGORY_NAME_CHARS = 60;
function normalizeCategoryName(value) {
  return String(value || '').trim().slice(0, MAX_CATEGORY_NAME_CHARS);
}

// Accepts a categoryId and returns it only if that category still exists;
// otherwise falls back (e.g. the category was deleted since the client loaded the form).
function validateCategoryId(categories, categoryId, fallback) {
  if (categoryId === undefined) return fallback;
  if (!categoryId) return null;
  return (categories || []).some(category => category.id === categoryId) ? categoryId : null;
}

// Opt-in only: a visitor must explicitly open "Customize prompt" in the UI
// before this is ever called. Prompt text is otherwise never sent to the
// public page (see handlePublicStyles above).
function handlePublicStylePrompt(response, id, lang) {
  const styles = loadStyles();
  if (!styles) return sendJson(response, 500, { error: 'Styles are temporarily unavailable.' });
  const style = styles.find(item => item.id === id && item.enabled);
  if (!style) return sendJson(response, 404, { error: 'Style not found.' });
  const prompt = lang === 'zh' && style.promptZh ? style.promptZh : style.prompt;
  sendJson(response, 200, { prompt });
}

async function handleUploadFile(filename, response) {
  const resolved = safeUploadPath(filename);
  if (!resolved) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return response.end('Not found');
  }
  try {
    const body = await fs.promises.readFile(resolved);
    const ext = filename.split('.').pop().toLowerCase();
    response.writeHead(200, {
      'Content-Type': CONTENT_TYPE_BY_EXT[ext] || 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': 'public, max-age=31536000, immutable'
    });
    response.end(body);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
}

// ---------- Admin API (no authentication — open to anyone who can reach it) ----------

function validateIdentityMode(value, fallback) {
  return ['generic', 'reinforced', 'none'].includes(value) ? value : fallback;
}

async function handleAdminCreateStyle(request, response) {
  const payload = await readJson(request);
  const title = String(payload.title || '').trim();
  if (!title) return sendJson(response, 400, { error: 'Title is required.' });
  const prompt = String(payload.prompt || '').trim();
  if (!prompt) return sendJson(response, 400, { error: 'Prompt is required.' });
  const identityMode = validateIdentityMode(payload.identityMode, 'reinforced');
  const titleZh = payload.titleZh !== undefined ? String(payload.titleZh).trim() : '';
  const promptZh = payload.promptZh !== undefined ? String(payload.promptZh).trim() : '';
  const categories = loadCategories();
  if (!categories) return sendJson(response, 500, { error: 'categories.json is corrupted. Restore data/categories.json.bak.' });
  const categoryId = validateCategoryId(categories, payload.categoryId, null);

  const styles = loadStyles();
  if (!styles) return sendJson(response, 500, { error: 'styles.json is corrupted. Restore data/styles.json.bak before adding styles.' });

  let imageFile = null;
  if (payload.image) imageFile = saveStyleImage(payload.image);

  const now = new Date().toISOString();
  const record = {
    id: crypto.randomUUID(),
    title,
    prompt,
    titleZh,
    promptZh,
    identityMode,
    categoryId,
    imageFile,
    enabled: true,
    // Newly added styles default to the top of the list (lowest order sorts
    // first), not the bottom — matches admin's expectation that "just added" shows first.
    order: styles.length ? Math.min(...styles.map(style => style.order)) - 1 : 0,
    createdAt: now,
    updatedAt: now
  };
  styles.push(record);
  await saveStyles(styles);
  sendJson(response, 200, record);
}

async function handleAdminUpdateStyle(request, response, id) {
  const payload = await readJson(request);
  const styles = loadStyles();
  if (!styles) return sendJson(response, 500, { error: 'styles.json is corrupted. Restore data/styles.json.bak before editing styles.' });
  const index = styles.findIndex(style => style.id === id);
  if (index === -1) return sendJson(response, 404, { error: 'Style not found.' });
  const existing = styles[index];

  const title = payload.title !== undefined ? String(payload.title).trim() : existing.title;
  if (!title) return sendJson(response, 400, { error: 'Title is required.' });
  const prompt = payload.prompt !== undefined ? String(payload.prompt).trim() : existing.prompt;
  if (!prompt) return sendJson(response, 400, { error: 'Prompt is required.' });
  const identityMode = validateIdentityMode(payload.identityMode, existing.identityMode);
  const titleZh = payload.titleZh !== undefined ? String(payload.titleZh).trim() : (existing.titleZh || '');
  const promptZh = payload.promptZh !== undefined ? String(payload.promptZh).trim() : (existing.promptZh || '');
  const categories = loadCategories();
  if (!categories) return sendJson(response, 500, { error: 'categories.json is corrupted. Restore data/categories.json.bak.' });
  const categoryId = validateCategoryId(categories, payload.categoryId, existing.categoryId || null);
  const enabled = payload.enabled !== undefined ? Boolean(payload.enabled) : existing.enabled;
  const order = Number.isFinite(payload.order) ? payload.order : existing.order;

  let imageFile = existing.imageFile;
  if (payload.image) {
    imageFile = saveStyleImage(payload.image);
    deleteStyleImage(existing.imageFile);
  }

  const updated = { ...existing, title, prompt, titleZh, promptZh, identityMode, categoryId, enabled, order, imageFile, updatedAt: new Date().toISOString() };
  styles[index] = updated;
  await saveStyles(styles);
  sendJson(response, 200, updated);
}

async function handleAdminReorderStyles(request, response) {
  const payload = await readJson(request);
  const ids = Array.isArray(payload.ids) ? payload.ids : null;
  const styles = loadStyles();
  if (!styles) return sendJson(response, 500, { error: 'styles.json is corrupted. Restore data/styles.json.bak before reordering styles.' });
  if (!ids || ids.length !== styles.length || new Set(ids).size !== styles.length) {
    return sendJson(response, 400, { error: 'The style order is invalid.' });
  }
  const stylesById = new Map(styles.map(style => [style.id, style]));
  if (ids.some(id => !stylesById.has(id))) return sendJson(response, 400, { error: 'The style order includes an unknown style.' });

  const now = new Date().toISOString();
  const reordered = ids.map((id, index) => ({ ...stylesById.get(id), order: index + 1, updatedAt: now }));
  await saveStyles(reordered);
  sendJson(response, 200, reordered);
}

async function handleAdminDeleteStyle(response, id) {
  const styles = loadStyles();
  if (!styles) return sendJson(response, 500, { error: 'styles.json is corrupted. Restore data/styles.json.bak before editing styles.' });
  const index = styles.findIndex(style => style.id === id);
  if (index === -1) return sendJson(response, 404, { error: 'Style not found.' });
  const [removed] = styles.splice(index, 1);
  deleteStyleImage(removed.imageFile);
  await saveStyles(styles);
  sendJson(response, 200, { ok: true });
}

async function handleAdminListCategories(response) {
  const categories = loadCategories();
  if (!categories) return sendJson(response, 500, { error: 'categories.json is corrupted. Restore data/categories.json.bak.' });
  const styles = loadStyles() || [];
  const counts = new Map();
  styles.forEach(style => {
    if (style.categoryId) counts.set(style.categoryId, (counts.get(style.categoryId) || 0) + 1);
  });
  const withCounts = [...categories]
    .sort((a, b) => a.order - b.order)
    .map(category => ({ ...category, styleCount: counts.get(category.id) || 0 }));
  sendJson(response, 200, withCounts);
}

async function handleAdminCreateCategory(request, response) {
  const payload = await readJson(request);
  const name = normalizeCategoryName(payload.name);
  if (!name) return sendJson(response, 400, { error: 'Category name is required.' });

  const categories = loadCategories();
  if (!categories) return sendJson(response, 500, { error: 'categories.json is corrupted. Restore data/categories.json.bak.' });
  if (categories.some(category => category.name.toLowerCase() === name.toLowerCase())) {
    return sendJson(response, 400, { error: 'A category with this name already exists.' });
  }

  const nameZh = normalizeCategoryName(payload.nameZh);
  const now = new Date().toISOString();
  const record = {
    id: crypto.randomUUID(),
    name,
    nameZh,
    order: categories.length ? Math.max(...categories.map(category => category.order)) + 1 : 0,
    createdAt: now,
    updatedAt: now
  };
  categories.push(record);
  await saveCategories(categories);
  sendJson(response, 200, { ...record, styleCount: 0 });
}

async function handleAdminRenameCategory(request, response, id) {
  const payload = await readJson(request);
  const name = normalizeCategoryName(payload.name);
  if (!name) return sendJson(response, 400, { error: 'Category name is required.' });

  const categories = loadCategories();
  if (!categories) return sendJson(response, 500, { error: 'categories.json is corrupted. Restore data/categories.json.bak.' });
  const index = categories.findIndex(category => category.id === id);
  if (index === -1) return sendJson(response, 404, { error: 'Category not found.' });
  if (categories.some(category => category.id !== id && category.name.toLowerCase() === name.toLowerCase())) {
    return sendJson(response, 400, { error: 'A category with this name already exists.' });
  }

  const nameZh = payload.nameZh !== undefined ? normalizeCategoryName(payload.nameZh) : (categories[index].nameZh || '');
  const updated = { ...categories[index], name, nameZh, updatedAt: new Date().toISOString() };
  categories[index] = updated;
  await saveCategories(categories);
  sendJson(response, 200, updated);
}

// Deleting a category never deletes styles — any style referencing it just
// falls back to uncategorized, same as WordPress reassigning posts to
// "Uncategorized" when their category is removed.
async function handleAdminDeleteCategory(response, id) {
  const categories = loadCategories();
  if (!categories) return sendJson(response, 500, { error: 'categories.json is corrupted. Restore data/categories.json.bak.' });
  const index = categories.findIndex(category => category.id === id);
  if (index === -1) return sendJson(response, 404, { error: 'Category not found.' });
  categories.splice(index, 1);
  await saveCategories(categories);

  const styles = loadStyles();
  if (styles) {
    const now = new Date().toISOString();
    let changed = false;
    const updatedStyles = styles.map(style => {
      if (style.categoryId !== id) return style;
      changed = true;
      return { ...style, categoryId: null, updatedAt: now };
    });
    if (changed) await saveStyles(updatedStyles);
  }
  sendJson(response, 200, { ok: true });
}

async function handleAdminApi(request, response, pathname) {
  try {
    if (pathname === '/admin/api/styles' && request.method === 'GET') {
      const styles = loadStyles();
      if (!styles) return sendJson(response, 500, { error: 'styles.json is corrupted. Restore data/styles.json.bak.' });
      const categories = loadCategories() || [];
      const withCategoryName = [...styles]
        .sort((a, b) => a.order - b.order)
        .map(style => ({ ...style, category: categoryNameById(categories, style.categoryId) }));
      return sendJson(response, 200, withCategoryName);
    }
    if (pathname === '/admin/api/styles' && request.method === 'POST') {
      return await handleAdminCreateStyle(request, response);
    }
    if (pathname === '/admin/api/styles/reorder' && request.method === 'POST') {
      return await handleAdminReorderStyles(request, response);
    }
    if (pathname === '/admin/api/categories' && request.method === 'GET') {
      return await handleAdminListCategories(response);
    }
    if (pathname === '/admin/api/categories' && request.method === 'POST') {
      return await handleAdminCreateCategory(request, response);
    }
    const categoryMatch = pathname.match(/^\/admin\/api\/categories\/([^/]+)$/);
    if (categoryMatch && request.method === 'PUT') {
      return await handleAdminRenameCategory(request, response, decodeURIComponent(categoryMatch[1]));
    }
    if (categoryMatch && request.method === 'DELETE') {
      return await handleAdminDeleteCategory(response, decodeURIComponent(categoryMatch[1]));
    }
    const styleMatch = pathname.match(/^\/admin\/api\/styles\/([^/]+)$/);
    if (styleMatch && request.method === 'PUT') {
      return await handleAdminUpdateStyle(request, response, decodeURIComponent(styleMatch[1]));
    }
    if (styleMatch && request.method === 'DELETE') {
      return await handleAdminDeleteStyle(response, decodeURIComponent(styleMatch[1]));
    }
  } catch (error) {
    return sendJson(response, 500, { error: error.message || 'Unexpected server error.' });
  }

  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end('Not found');
}

// ---------- Static files ----------

const STATIC_FILES = {
  '/': { file: 'index.html', type: 'text/html; charset=utf-8', cache: 'no-store' },
  '/index.html': { file: 'index.html', type: 'text/html; charset=utf-8', cache: 'no-store' },
  '/styles.css': { file: 'styles.css', type: 'text/css; charset=utf-8' },
  '/admin.css': { file: 'admin.css', type: 'text/css; charset=utf-8' },
  '/images/image-up.png': { file: 'images/image-up.png', type: 'image/png' },
  '/images/chevron-left.png': { file: 'images/chevron-left.png', type: 'image/png' },
  '/images/x.png': { file: 'images/x.png', type: 'image/png' },
  '/images/image-down.png': { file: 'images/image-down.png', type: 'image/png' },
  '/images/share-2.png': { file: 'images/share-2.png', type: 'image/png' },
  '/app.js': { file: 'app.js', type: 'text/javascript; charset=utf-8' },
  '/admin': { file: 'admin.html', type: 'text/html; charset=utf-8', cache: 'no-store' },
  '/admin.js': { file: 'admin.js', type: 'text/javascript; charset=utf-8' }
};

function serveStaticFile(request, response, file, type, cache = 'public, max-age=0, must-revalidate') {
  const resolved = path.join(__dirname, file);
  const stats = fs.statSync(resolved);
  const etag = `"${stats.size}-${Math.floor(stats.mtimeMs)}"`;
  if (request.headers['if-none-match'] === etag) {
    response.writeHead(304, { ETag: etag, 'Cache-Control': cache });
    return response.end();
  }
  const body = fs.readFileSync(resolved);
  response.writeHead(200, { 'Content-Type': type, 'Content-Length': body.length, 'Cache-Control': cache, ETag: etag });
  response.end(body);
}

const server = http.createServer(async (request, response) => {
  const { pathname, searchParams } = new URL(request.url, 'http://internal');
  const lang = searchParams.get('lang') === 'zh' ? 'zh' : 'en';

  if (request.method === 'POST' && pathname.startsWith('/api/')) {
    return handleApi(request, response);
  }

  if (request.method === 'GET' && pathname === '/api/styles') {
    return handlePublicStyles(response, lang);
  }

  const publicPromptMatch = pathname.match(/^\/api\/styles\/([^/]+)\/prompt$/);
  if (request.method === 'GET' && publicPromptMatch) {
    return handlePublicStylePrompt(response, decodeURIComponent(publicPromptMatch[1]), lang);
  }

  if (request.method === 'GET' && pathname.startsWith('/uploads/')) {
    return handleUploadFile(pathname.slice('/uploads/'.length), response);
  }

  if (pathname.startsWith('/admin/api/')) {
    return handleAdminApi(request, response, pathname);
  }

  const staticFile = request.method === 'GET' ? STATIC_FILES[pathname] : null;
  if (!staticFile) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return response.end('Not found');
  }
  return serveStaticFile(request, response, staticFile.file, staticFile.type, staticFile.cache);
});

server.listen(PORT, HOST, () => {
  console.log(`Reshaper is running at http://${HOST}:${PORT}`);
});
