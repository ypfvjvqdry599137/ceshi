const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const ROOT_DIR = __dirname;
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT_DIR, "data");
const DATA_FILE = process.env.DATA_FILE
  ? path.resolve(process.env.DATA_FILE)
  : path.join(DATA_DIR, "bookmarks.json");

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 3080);
const BASIC_USER = process.env.BASIC_USER || "";
const BASIC_PASS = process.env.BASIC_PASS || "";
const WRITE_TOKEN = process.env.WRITE_TOKEN || "";

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_FETCH_BYTES = 256 * 1024;
const FETCH_TIMEOUT_MS = 7000;
const DEFAULT_CATEGORY = "未分类";

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

async function ensureDataFile() {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await writeStore([]);
  }
}

async function readStore() {
  await ensureDataFile();
  const raw = await fs.readFile(DATA_FILE, "utf8");
  let parsed = null;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return { bookmarks: [] };
  }

  const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed.bookmarks) ? parsed.bookmarks : [];
  return { bookmarks: sortByCreatedAt(normalizeBookmarkList(list, { keepId: true })) };
}

async function writeStore(bookmarks) {
  await ensureDataFile();
  const payload = {
    version: 1,
    updatedAt: new Date().toISOString(),
    bookmarks,
  };
  await fs.writeFile(DATA_FILE, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function normalizeBookmarkList(list, options = {}) {
  return list
    .map((item) => normalizeBookmark(item, options))
    .filter(Boolean);
}

function normalizeBookmark(item, options = {}) {
  if (!item || typeof item !== "object") return null;

  const title = String(item.title || "").trim();
  const url = normalizeUrl(String(item.url || item.href || "").trim());
  if (!title || !isValidHttpUrl(url)) return null;

  const category = String(item.category || DEFAULT_CATEGORY).trim() || DEFAULT_CATEGORY;
  const tags = normalizeTags(item.tags);
  const createdAt = normalizeDate(item.createdAt);
  const id = options.keepId && item.id ? String(item.id) : createId();

  return { id, title, url, category, tags, createdAt };
}

function normalizeTags(input) {
  if (Array.isArray(input)) {
    return parseTags(input.join(","));
  }
  if (typeof input === "string") {
    return parseTags(input);
  }
  return [];
}

function parseTags(input) {
  return Array.from(
    new Set(
      String(input)
        .split(/[,，]/)
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  );
}

function normalizeDate(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }
  return date.toISOString();
}

function normalizeUrl(url) {
  if (!url) return "";
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function isValidHttpUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function getHostName(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

function decodeHtmlEntities(input) {
  if (!input) return "";
  const entityMap = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };

  return input.replace(/&(#\d+|#x[0-9a-fA-F]+|\w+);/g, (match, token) => {
    if (token[0] === "#") {
      const codePoint =
        token[1].toLowerCase() === "x" ? Number.parseInt(token.slice(2), 16) : Number.parseInt(token.slice(1), 10);
      if (Number.isFinite(codePoint)) return String.fromCodePoint(codePoint);
      return match;
    }

    const mapped = entityMap[token.toLowerCase()];
    return mapped || match;
  });
}

function cleanTitle(value) {
  return decodeHtmlEntities(String(value || ""))
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function findMetaContent(html, attrName, attrValue) {
  const regex = new RegExp(
    `<meta[^>]*${attrName}\\s*=\\s*["']${attrValue}["'][^>]*content\\s*=\\s*["']([\\s\\S]*?)["'][^>]*>`,
    "i"
  );
  const match = html.match(regex);
  if (match && match[1]) return cleanTitle(match[1]);

  const reverseRegex = new RegExp(
    `<meta[^>]*content\\s*=\\s*["']([\\s\\S]*?)["'][^>]*${attrName}\\s*=\\s*["']${attrValue}["'][^>]*>`,
    "i"
  );
  const reverseMatch = html.match(reverseRegex);
  return reverseMatch && reverseMatch[1] ? cleanTitle(reverseMatch[1]) : "";
}

function extractTitleFromHtml(html) {
  if (!html) return "";
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch && titleMatch[1]) return cleanTitle(titleMatch[1]);

  const ogTitle = findMetaContent(html, "property", "og:title");
  if (ogTitle) return ogTitle;

  const twitterTitle = findMetaContent(html, "name", "twitter:title");
  if (twitterTitle) return twitterTitle;

  return "";
}

function normalizeCharset(label) {
  const value = String(label || "")
    .trim()
    .toLowerCase()
    .replace(/^["']|["']$/g, "");

  if (!value) return "";
  if (value === "utf8") return "utf-8";
  if (value === "gbk" || value === "gb2312") return "gb18030";
  return value;
}

function detectCharset(contentType, htmlBytes) {
  const headerMatch = String(contentType || "").match(/charset\s*=\s*([^;]+)/i);
  const fromHeader = normalizeCharset(headerMatch ? headerMatch[1] : "");
  if (fromHeader) return fromHeader;

  const probe = htmlBytes.subarray(0, Math.min(htmlBytes.length, 8192)).toString("latin1");
  const metaCharset = probe.match(/<meta[^>]*charset\s*=\s*["']?\s*([a-zA-Z0-9._-]+)/i);
  const fromMetaCharset = normalizeCharset(metaCharset ? metaCharset[1] : "");
  if (fromMetaCharset) return fromMetaCharset;

  const metaContentType = probe.match(
    /<meta[^>]*content\s*=\s*["'][^"']*charset\s*=\s*([a-zA-Z0-9._-]+)[^"']*["'][^>]*>/i
  );
  const fromMetaContentType = normalizeCharset(metaContentType ? metaContentType[1] : "");
  if (fromMetaContentType) return fromMetaContentType;

  return "utf-8";
}

function decodeHtmlBuffer(buffer, charset) {
  try {
    const decoder = new TextDecoder(charset || "utf-8");
    return decoder.decode(buffer);
  } catch {
    try {
      return buffer.toString("utf8");
    } catch {
      return "";
    }
  }
}

async function readResponsePreview(response, limitBytes) {
  if (!response.body || typeof response.body.getReader !== "function") {
    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.subarray(0, limitBytes);
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;

  try {
    while (total < limitBytes) {
      const { done, value } = await reader.read();
      if (done || !value) break;

      const remaining = limitBytes - total;
      const sliced = value.byteLength > remaining ? value.slice(0, remaining) : value;
      chunks.push(Buffer.from(sliced));
      total += sliced.byteLength;

      if (total >= limitBytes) break;
    }
  } finally {
    try {
      await reader.cancel();
    } catch {}
  }

  return Buffer.concat(chunks);
}

async function fetchTitleFromUrl(url) {
  const fallback = getHostName(url) || "未命名链接";
  const candidates = buildFetchCandidates(url);
  let best = {
    title: fallback,
    fallback: true,
    status: 0,
    reason: "network_unreachable",
    error: "unable_to_fetch",
    tried: candidates,
  };

  for (const candidate of candidates) {
    const current = await fetchTitleAttempt(candidate, fallback);

    if (!current.fallback) {
      return {
        ...current,
        tried: candidates,
      };
    }

    if (current.status > best.status) {
      best = {
        ...current,
        tried: candidates,
      };
    } else if (best.status === 0 && current.error) {
      best = {
        ...current,
        tried: candidates,
      };
    }
  }

  return best;
}

function buildFetchCandidates(inputUrl) {
  const set = new Set();
  const list = [];

  function add(url) {
    if (!url || set.has(url)) return;
    set.add(url);
    list.push(url);
  }

  add(inputUrl);

  try {
    const parsed = new URL(inputUrl);
    const httpVariant = new URL(parsed.toString());
    httpVariant.protocol = "http:";
    const httpsVariant = new URL(parsed.toString());
    httpsVariant.protocol = "https:";

    if (parsed.protocol === "https:") {
      add(httpVariant.toString());
    } else if (parsed.protocol === "http:") {
      add(httpsVariant.toString());
    }

    const rootUrl = `${parsed.protocol}//${parsed.host}/`;
    if (`${parsed.protocol}//${parsed.host}${parsed.pathname}` !== rootUrl || parsed.search || parsed.hash) {
      add(rootUrl);
    }

    if (parsed.hostname.includes(".") && parsed.hostname !== "localhost") {
      const toggled = new URL(parsed.toString());
      toggled.hostname = parsed.hostname.startsWith("www.")
        ? parsed.hostname.replace(/^www\./i, "")
        : `www.${parsed.hostname}`;
      add(toggled.toString());

      const toggledRoot = `${toggled.protocol}//${toggled.host}/`;
      add(toggledRoot);
    }
  } catch {}

  return list;
}

async function fetchTitleAttempt(url, fallbackTitle) {
  if (typeof fetch !== "function") {
    return {
      title: fallbackTitle,
      fallback: true,
      status: 0,
      url,
      reason: "fetch_unavailable",
      error: "global fetch is not available. Please use Node.js >= 18.",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "OneNavLite/1.0 (+self-hosted)",
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      },
    });

    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    const maybeHtml =
      !contentType || contentType.includes("text/html") || contentType.includes("application/xhtml+xml");

    if (!maybeHtml) {
      return {
        title: fallbackTitle,
        fallback: true,
        status: response.status,
        url,
        reason: "non_html_response",
      };
    }

    const htmlBytes = await readResponsePreview(response, MAX_FETCH_BYTES);
    const charset = detectCharset(contentType, htmlBytes);
    const html = decodeHtmlBuffer(htmlBytes, charset);
    const extracted = extractTitleFromHtml(html);

    if (extracted) {
      return {
        title: extracted,
        fallback: false,
        status: response.status,
        url,
        reason: "ok",
      };
    }

    return {
      title: fallbackTitle,
      fallback: true,
      status: response.status,
      url,
      reason: "title_not_found",
    };
  } catch (error) {
    return {
      title: fallbackTitle,
      fallback: true,
      status: 0,
      url,
      reason: "network_unreachable",
      error: String(error && error.message ? error.message : error),
    };
  } finally {
    clearTimeout(timer);
  }
}

function sortByCreatedAt(bookmarks) {
  return [...bookmarks].sort((a, b) => {
    const at = new Date(a.createdAt).getTime();
    const bt = new Date(b.createdAt).getTime();
    return bt - at;
  });
}

function mergeBookmarksByUrl(existing, incoming) {
  const map = new Map();

  existing.forEach((bookmark) => {
    map.set(getBookmarkKey(bookmark.url), bookmark);
  });

  let inserted = 0;
  let updated = 0;

  incoming.forEach((bookmark) => {
    const key = getBookmarkKey(bookmark.url);
    const current = map.get(key);
    if (!current) {
      map.set(key, bookmark);
      inserted += 1;
      return;
    }

    map.set(key, {
      ...current,
      title: bookmark.title || current.title,
      category: bookmark.category || current.category,
      tags: bookmark.tags.length ? bookmark.tags : current.tags,
      url: bookmark.url || current.url,
      createdAt: current.createdAt || bookmark.createdAt,
    });
    updated += 1;
  });

  return {
    bookmarks: sortByCreatedAt(Array.from(map.values())),
    inserted,
    updated,
  };
}

function getBookmarkKey(url) {
  return normalizeUrl(url).toLowerCase();
}

function createId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `bookmark_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, message) {
  response.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(message);
}

async function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];

    request.on("data", (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new Error("Body too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });

    request.on("end", () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }

      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve(JSON.parse(text));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });

    request.on("error", (error) => {
      reject(error);
    });
  });
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function hasAuthConfig() {
  return BASIC_USER.length > 0 || BASIC_PASS.length > 0;
}

function isAuthorized(request) {
  if (!hasAuthConfig()) return true;

  const header = request.headers.authorization || "";
  if (!header.startsWith("Basic ")) return false;

  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const separator = decoded.indexOf(":");
  if (separator < 0) return false;

  const user = decoded.slice(0, separator);
  const pass = decoded.slice(separator + 1);

  return safeEqual(user, BASIC_USER) && safeEqual(pass, BASIC_PASS);
}

function requireAuth(response) {
  response.writeHead(401, {
    "WWW-Authenticate": 'Basic realm="OneNav Lite"',
    "Content-Type": "text/plain; charset=utf-8",
  });
  response.end("Authentication required");
}

function hasWriteTokenConfig() {
  return WRITE_TOKEN.length > 0;
}

function verifyWriteToken(request) {
  if (!hasWriteTokenConfig()) return { ok: true };

  const rawToken = request.headers["x-write-token"];
  const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;
  if (!token) return { ok: false, code: "WRITE_TOKEN_REQUIRED" };

  return safeEqual(token, WRITE_TOKEN) ? { ok: true } : { ok: false, code: "WRITE_TOKEN_INVALID" };
}

function requireWriteToken(response, code) {
  sendJson(response, 403, { ok: false, error: "Write access denied", code });
}

function getPublicFilePath(pathname) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const resolved = path.resolve(ROOT_DIR, `.${safePath}`);
  if (!resolved.startsWith(ROOT_DIR)) return null;
  return resolved;
}

async function serveStatic(request, response, pathname) {
  if (!["GET", "HEAD"].includes(request.method)) {
    sendText(response, 405, "Method Not Allowed");
    return;
  }

  const filePath = getPublicFilePath(pathname);
  if (!filePath) {
    sendText(response, 403, "Forbidden");
    return;
  }

  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      sendText(response, 403, "Forbidden");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || "application/octet-stream";
    const content = await fs.readFile(filePath);

    response.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=300",
    });

    if (request.method === "HEAD") {
      response.end();
      return;
    }

    response.end(content);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      sendText(response, 404, "Not Found");
      return;
    }
    console.error("Static serve error:", error);
    sendText(response, 500, "Internal Server Error");
  }
}

async function handleApi(request, response, parsedUrl) {
  const pathname = decodeURIComponent(parsedUrl.pathname);

  if (pathname === "/api/health" && request.method === "GET") {
    sendJson(response, 200, { ok: true, now: new Date().toISOString() });
    return;
  }

  if (pathname === "/api/resolve-title" && request.method === "GET") {
    const rawUrl = String(parsedUrl.searchParams.get("url") || "").trim();
    const normalizedUrl = normalizeUrl(rawUrl);

    if (!isValidHttpUrl(normalizedUrl)) {
      sendJson(response, 400, { ok: false, error: "Invalid URL" });
      return;
    }

    const resolved = await fetchTitleFromUrl(normalizedUrl);
    sendJson(response, 200, {
      ok: true,
      url: normalizedUrl,
      title: resolved.title,
      fallback: resolved.fallback,
      status: resolved.status,
      reason: resolved.reason || "",
      error: resolved.error || "",
      tried: Array.isArray(resolved.tried) ? resolved.tried : [],
    });
    return;
  }

  if (pathname === "/api/bookmarks" && request.method === "GET") {
    const store = await readStore();
    sendJson(response, 200, { bookmarks: store.bookmarks });
    return;
  }

  if (pathname === "/api/bookmarks" && request.method === "PUT") {
    const writeAuth = verifyWriteToken(request);
    if (!writeAuth.ok) {
      requireWriteToken(response, writeAuth.code);
      return;
    }

    try {
      const body = await readJsonBody(request);
      const incoming = Array.isArray(body.bookmarks) ? body.bookmarks : [];
      const bookmarks = sortByCreatedAt(normalizeBookmarkList(incoming, { keepId: true }));

      await writeStore(bookmarks);
      sendJson(response, 200, { ok: true, count: bookmarks.length, bookmarks });
      return;
    } catch (error) {
      const code = error.message === "Body too large" ? 413 : 400;
      sendJson(response, code, { ok: false, error: error.message });
      return;
    }
  }

  if (pathname === "/api/bookmarks/import" && request.method === "POST") {
    const writeAuth = verifyWriteToken(request);
    if (!writeAuth.ok) {
      requireWriteToken(response, writeAuth.code);
      return;
    }

    try {
      const body = await readJsonBody(request);
      const mode = body.mode === "replace" ? "replace" : "merge";
      const incoming = sortByCreatedAt(normalizeBookmarkList(Array.isArray(body.bookmarks) ? body.bookmarks : []));

      const store = await readStore();
      const merged =
        mode === "replace"
          ? { bookmarks: incoming, inserted: incoming.length, updated: 0 }
          : mergeBookmarksByUrl(store.bookmarks, incoming);

      await writeStore(merged.bookmarks);
      sendJson(response, 200, {
        ok: true,
        mode,
        inserted: merged.inserted,
        updated: merged.updated,
        count: merged.bookmarks.length,
        bookmarks: merged.bookmarks,
      });
      return;
    } catch (error) {
      const code = error.message === "Body too large" ? 413 : 400;
      sendJson(response, code, { ok: false, error: error.message });
      return;
    }
  }

  sendJson(response, 404, { ok: false, error: "Not Found" });
}

const server = http.createServer(async (request, response) => {
  if (!isAuthorized(request)) {
    requireAuth(response);
    return;
  }

  let parsed = null;
  try {
    parsed = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  } catch {
    sendText(response, 400, "Bad Request");
    return;
  }

  const pathname = decodeURIComponent(parsed.pathname);
  if (pathname.startsWith("/api/")) {
    await handleApi(request, response, parsed);
    return;
  }

  await serveStatic(request, response, pathname);
});

async function bootstrap() {
  await ensureDataFile();
  server.listen(PORT, HOST, () => {
    console.log(`[OneNav Lite] server running at http://${HOST}:${PORT}`);
    console.log(`[OneNav Lite] data file: ${DATA_FILE}`);
    console.log(`[OneNav Lite] basic auth: ${hasAuthConfig() ? "enabled" : "disabled"}`);
    console.log(`[OneNav Lite] write token: ${hasWriteTokenConfig() ? "enabled" : "disabled"}`);
  });
}

bootstrap().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
