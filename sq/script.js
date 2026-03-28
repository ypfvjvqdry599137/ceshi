const APP_CONFIG = {
  appName: "OneNav Lite",
  defaultCategory: "未分类",
  faviconService: "https://www.google.com/s2/favicons?sz=64&domain_url=",
  apiBookmarks: "/api/bookmarks",
  apiResolveTitle: "/api/resolve-title",
  cacheKey: "onenav_lite_snapshot_v1",
  writeTokenKey: "onenav_lite_write_token_v1",
  writeTokenHeader: "X-Write-Token",
};

const CATEGORY_ALL = "__ALL__";

const state = {
  bookmarks: [],
  searchKeyword: "",
  activeCategory: CATEGORY_ALL,
  editingId: "",
  manageMode: false,
  selectedIds: new Set(),
};

const el = {};
let titleResolveTask = null;
let lastPersistErrorMessage = "";

document.addEventListener("DOMContentLoaded", init);

async function init() {
  cacheElements();
  bindEvents();
  setSyncStatus("loading", "连接中");

  const list = await loadBookmarksFromServer();
  if (list) {
    state.bookmarks = list;
    renderAll();
    updateListMessage("数据已从服务器加载。", "success");
    return;
  }

  const fallback = loadSnapshotCache();
  state.bookmarks = fallback;
  renderAll();
  updateListMessage(fallback.length ? "服务器不可达，已加载本地缓存。" : "服务器不可达，请检查服务状态。", "error");
}

function cacheElements() {
  el.openAddModalBtn = document.getElementById("openAddModalBtn");
  el.categoryCount = document.getElementById("categoryCount");
  el.categoryList = document.getElementById("categoryList");
  el.searchInput = document.getElementById("searchInput");
  el.clearSearchBtn = document.getElementById("clearSearchBtn");
  el.resultCount = document.getElementById("resultCount");
  el.listMessage = document.getElementById("listMessage");
  el.mobileQuickCategories = document.getElementById("mobileQuickCategories");

  el.bookmarkSections = document.getElementById("bookmarkSections");
  el.bookmarkTableWrap = document.getElementById("bookmarkTableWrap");
  el.bookmarkTableBody = document.getElementById("bookmarkTableBody");
  el.batchPanel = document.getElementById("batchPanel");
  el.selectAllVisible = document.getElementById("selectAllVisible");
  el.selectedCount = document.getElementById("selectedCount");
  el.batchCategoryInput = document.getElementById("batchCategoryInput");
  el.batchMoveBtn = document.getElementById("batchMoveBtn");
  el.batchTagsInput = document.getElementById("batchTagsInput");
  el.batchTagBtn = document.getElementById("batchTagBtn");
  el.batchDeleteBtn = document.getElementById("batchDeleteBtn");
  el.clearSelectionBtn = document.getElementById("clearSelectionBtn");
  el.viewToggleBtn = document.getElementById("viewToggleBtn");

  el.refreshBtn = document.getElementById("refreshBtn");
  el.syncStatus = document.getElementById("syncStatus");
  el.importBtn = document.getElementById("importBtn");
  el.exportBtn = document.getElementById("exportBtn");
  el.importFile = document.getElementById("importFile");

  el.modal = document.getElementById("bookmarkModal");
  el.modalTitle = document.getElementById("modalTitle");
  el.closeModalBtn = document.getElementById("closeModalBtn");
  el.form = document.getElementById("bookmarkForm");
  el.editIdInput = document.getElementById("editIdInput");
  el.titleInput = document.getElementById("titleInput");
  el.urlInput = document.getElementById("urlInput");
  el.categoryInput = document.getElementById("categoryInput");
  el.tagsInput = document.getElementById("tagsInput");
  el.formMessage = document.getElementById("formMessage");
  el.manageOnly = Array.from(document.querySelectorAll(".manage-only"));
}

function bindEvents() {
  el.openAddModalBtn.addEventListener("click", openCreateModal);
  el.closeModalBtn.addEventListener("click", closeModal);
  el.modal.addEventListener("click", (e) => {
    if (e.target === el.modal) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !el.modal.classList.contains("hidden")) closeModal();
  });

  el.form.addEventListener("submit", handleSaveBookmark);
  el.urlInput.addEventListener("blur", handleUrlBlurAutoFillTitle);

  el.searchInput.addEventListener("input", handleSearchInput);
  el.clearSearchBtn.addEventListener("click", handleClearSearch);
  el.categoryList.addEventListener("click", handleCategoryClick);
  el.mobileQuickCategories.addEventListener("click", handleMobileCategoryClick);
  el.refreshBtn.addEventListener("click", handleRefreshFromServer);
  el.viewToggleBtn.addEventListener("click", handleToggleViewMode);

  el.bookmarkTableBody.addEventListener("click", handleTableBodyClick);
  el.bookmarkTableBody.addEventListener("change", handleTableBodyChange);
  el.selectAllVisible.addEventListener("change", handleSelectAllVisible);
  el.batchMoveBtn.addEventListener("click", handleBatchMoveCategory);
  el.batchTagBtn.addEventListener("click", handleBatchAddTags);
  el.batchDeleteBtn.addEventListener("click", handleBatchDelete);
  el.clearSelectionBtn.addEventListener("click", handleClearSelection);

  el.exportBtn.addEventListener("click", handleExportHtml);
  el.importBtn.addEventListener("click", handleImportClick);
  el.importFile.addEventListener("change", handleImportChange);
}

async function handleRefreshFromServer() {
  setSyncStatus("loading", "刷新中");
  const list = await loadBookmarksFromServer();
  if (!list) {
    updateListMessage("刷新失败：无法连接到服务器。", "error");
    return;
  }
  state.bookmarks = list;
  pruneSelectedIds();
  renderAll();
  updateListMessage("已从服务器刷新最新数据。", "success");
}

function handleSearchInput(e) {
  state.searchKeyword = e.target.value.trim().toLowerCase();
  renderContent();
}

function handleClearSearch() {
  if (!el.searchInput.value) return;
  el.searchInput.value = "";
  state.searchKeyword = "";
  renderContent();
}

function handleCategoryClick(e) {
  const target = e.target.closest("button[data-category]");
  if (!target) return;
  state.activeCategory = target.dataset.category;
  renderAll();
}

function handleMobileCategoryClick(e) {
  const target = e.target.closest("button[data-category]");
  if (!target) return;
  state.activeCategory = target.dataset.category;
  renderAll();
}

function handleToggleViewMode() {
  state.manageMode = !state.manageMode;
  if (!state.manageMode) state.selectedIds.clear();
  renderAll();
  updateListMessage(state.manageMode ? "已进入管理模式：可批量整理与编辑删除。" : "已切换为浏览模式：专注导航浏览。", "success");
}

function openCreateModal() {
  state.editingId = "";
  el.modalTitle.textContent = "添加链接";
  el.form.reset();
  if (state.activeCategory !== CATEGORY_ALL) el.categoryInput.value = state.activeCategory;
  updateFormMessage("", "");
  showModal();
}

function openEditModal(bookmark) {
  state.editingId = bookmark.id;
  el.modalTitle.textContent = "编辑链接";
  el.titleInput.value = bookmark.title;
  el.urlInput.value = bookmark.url;
  el.categoryInput.value = bookmark.category;
  el.tagsInput.value = bookmark.tags.join(", ");
  updateFormMessage("", "");
  showModal();
}

function showModal() {
  el.modal.classList.remove("hidden");
  el.titleInput.focus();
}

function closeModal() {
  el.modal.classList.add("hidden");
  updateFormMessage("", "");
}
async function handleSaveBookmark(event) {
  event.preventDefault();

  let title = el.titleInput.value.trim();
  const rawUrl = el.urlInput.value.trim();
  const category = el.categoryInput.value.trim() || APP_CONFIG.defaultCategory;
  const tags = parseTags(el.tagsInput.value);

  if (!rawUrl) {
    updateFormMessage("请先填写链接。", "error");
    return;
  }

  const url = normalizeUrl(rawUrl);
  if (!isValidHttpUrl(url)) {
    updateFormMessage("链接格式无效，请输入正确的 http/https 地址。", "error");
    return;
  }

  if (!title) title = await autoFillTitleFromUrl(url, { silent: false });
  if (!title) {
    updateFormMessage("无法自动获取名称，请手动填写标题。", "error");
    return;
  }

  const next = deepCopy(state.bookmarks);
  if (state.editingId) {
    const idx = next.findIndex((x) => x.id === state.editingId);
    if (idx >= 0) {
      next[idx] = { ...next[idx], title, url, category, tags };
    }
  } else {
    next.unshift({ id: createId(), title, url, category, tags, createdAt: new Date().toISOString() });
  }

  const ok = await commitBookmarks(next, state.editingId ? "链接已更新。" : "链接已添加。");
  if (ok) closeModal();
}

async function handleUrlBlurAutoFillTitle() {
  if (el.titleInput.value.trim()) return;
  const rawUrl = el.urlInput.value.trim();
  if (!rawUrl) return;
  await autoFillTitleFromUrl(rawUrl, { silent: true });
}

async function deleteBookmark(bookmark) {
  const confirmed = window.confirm(`确认删除「${bookmark.title}」吗？`);
  if (!confirmed) return;
  const list = state.bookmarks.filter((x) => x.id !== bookmark.id);
  await commitBookmarks(list, "链接已删除。");
}

async function commitBookmarks(nextBookmarks, successMessage) {
  const backup = deepCopy(state.bookmarks);
  state.bookmarks = sortByCreatedAt(nextBookmarks);

  const ok = await persistBookmarksToServer();
  if (!ok) {
    state.bookmarks = backup;
    pruneSelectedIds();
    renderAll();
    updateListMessage(lastPersistErrorMessage || "保存失败：服务器不可写，请稍后重试。", "error");
    return false;
  }

  lastPersistErrorMessage = "";
  pruneSelectedIds();
  renderAll();
  updateListMessage(successMessage, "success");
  return true;
}

function pruneSelectedIds() {
  const valid = new Set(state.bookmarks.map((x) => x.id));
  Array.from(state.selectedIds).forEach((id) => {
    if (!valid.has(id)) state.selectedIds.delete(id);
  });
}

function renderAll() {
  renderCategorySidebar();
  renderMobileQuickCategories();
  renderContent();
  renderViewModeControls();
}

function renderContent() {
  const filtered = getFilteredBookmarks();
  el.resultCount.textContent = `显示 ${filtered.length} / ${state.bookmarks.length} 条`;

  if (state.manageMode) {
    el.bookmarkSections.classList.add("hidden");
    el.bookmarkTableWrap.classList.remove("hidden");
    el.batchPanel.classList.remove("hidden");
    renderTable(filtered);
    updateBatchSelectionMeta(filtered);
    return;
  }

  el.bookmarkSections.classList.remove("hidden");
  el.bookmarkTableWrap.classList.add("hidden");
  el.batchPanel.classList.add("hidden");
  renderCardSections(filtered);
}

function renderViewModeControls() {
  el.viewToggleBtn.textContent = state.manageMode ? "退出管理模式" : "进入管理模式";
  el.viewToggleBtn.classList.toggle("active", state.manageMode);
  el.viewToggleBtn.setAttribute("aria-pressed", String(state.manageMode));
  el.manageOnly.forEach((node) => {
    node.classList.toggle("hidden", !state.manageMode);
  });
}

function renderCategorySidebar() {
  const counts = countByCategory(state.bookmarks);
  const categories = Object.keys(counts).sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
  if (state.activeCategory !== CATEGORY_ALL && !categories.includes(state.activeCategory)) {
    state.activeCategory = CATEGORY_ALL;
  }

  el.categoryCount.textContent = String(categories.length);
  el.categoryList.innerHTML = "";
  const frag = document.createDocumentFragment();
  frag.appendChild(createCategoryItem("全部", CATEGORY_ALL, state.bookmarks.length));
  categories.forEach((c) => frag.appendChild(createCategoryItem(c, c, counts[c])));
  el.categoryList.appendChild(frag);
}

function createCategoryItem(label, value, count) {
  const li = document.createElement("li");
  li.className = "category-item";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.dataset.category = value;
  if (state.activeCategory === value) btn.classList.add("active");

  const t = document.createElement("span");
  t.textContent = label;
  const c = document.createElement("span");
  c.className = "count";
  c.textContent = String(count);

  btn.append(t, c);
  li.appendChild(btn);
  return li;
}

function renderMobileQuickCategories() {
  const counts = countByCategory(state.bookmarks);
  const categories = Object.keys(counts).sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
  el.mobileQuickCategories.innerHTML = "";

  const frag = document.createDocumentFragment();
  frag.appendChild(createChip("全部", CATEGORY_ALL, state.bookmarks.length));
  categories.forEach((c) => frag.appendChild(createChip(c, c, counts[c])));
  el.mobileQuickCategories.appendChild(frag);
}

function createChip(label, value, count) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "chip";
  btn.dataset.category = value;
  btn.textContent = `${label} (${count})`;
  if (state.activeCategory === value) btn.classList.add("active");
  return btn;
}

function renderCardSections(filtered) {
  el.bookmarkSections.innerHTML = "";
  if (filtered.length === 0) {
    el.bookmarkSections.appendChild(createEmptyState());
    return;
  }

  const groups = groupByCategory(filtered);
  const categories = Object.keys(groups).sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
  const frag = document.createDocumentFragment();
  categories.forEach((category) => frag.appendChild(createCategorySection(category, groups[category])));
  el.bookmarkSections.appendChild(frag);
}

function createCategorySection(category, bookmarks) {
  const section = document.createElement("section");
  section.className = "section-group";

  const head = document.createElement("div");
  head.className = "section-head";
  const title = document.createElement("h3");
  title.textContent = category;
  const count = document.createElement("span");
  count.textContent = `${bookmarks.length} 条链接`;
  head.append(title, count);

  const grid = document.createElement("div");
  grid.className = "card-grid";
  bookmarks.forEach((bm) => grid.appendChild(createSiteCard(bm)));

  section.append(head, grid);
  return section;
}

function createSiteCard(bookmark) {
  const card = document.createElement("article");
  card.className = "site-card";

  const link = document.createElement("a");
  link.className = "site-link";
  link.href = bookmark.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";

  const main = document.createElement("div");
  main.className = "card-main";

  const icon = document.createElement("img");
  icon.className = "site-icon";
  icon.src = getFaviconUrl(bookmark.url);
  icon.alt = "";

  const info = document.createElement("div");
  info.className = "site-info";
  const title = document.createElement("h4");
  title.className = "site-title";
  title.textContent = bookmark.title;
  const url = document.createElement("div");
  url.className = "site-url";
  url.textContent = getHostName(bookmark.url);
  info.append(title, url);

  main.append(icon, info);
  link.appendChild(main);

  const tagRow = document.createElement("div");
  tagRow.className = "tag-row";
  (bookmark.tags.length ? bookmark.tags : ["未打标签"]).slice(0, 4).forEach((text) => {
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = text;
    tagRow.appendChild(tag);
  });

  const actions = document.createElement("div");
  if (state.manageMode) {
    actions.className = "card-actions";
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "card-action-btn";
    editBtn.textContent = "编辑";
    editBtn.addEventListener("click", () => openEditModal(bookmark));

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "card-action-btn danger";
    deleteBtn.textContent = "删除";
    deleteBtn.addEventListener("click", async () => deleteBookmark(bookmark));

    actions.append(editBtn, deleteBtn);
    card.append(link, tagRow, actions);
    return card;
  }

  card.append(link, tagRow);
  return card;
}
function renderTable(filtered) {
  el.bookmarkTableBody.innerHTML = "";

  if (filtered.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 7;
    td.innerHTML = '<div class="empty-state"><strong>没有匹配结果</strong><p>试试调整搜索词或分类。</p></div>';
    tr.appendChild(td);
    el.bookmarkTableBody.appendChild(tr);
    return;
  }

  const frag = document.createDocumentFragment();
  filtered.forEach((bm) => frag.appendChild(createTableRow(bm)));
  el.bookmarkTableBody.appendChild(frag);
}

function createTableRow(bookmark) {
  const tr = document.createElement("tr");

  const tdSelect = document.createElement("td");
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.dataset.selectId = bookmark.id;
  cb.checked = state.selectedIds.has(bookmark.id);
  tdSelect.appendChild(cb);

  const tdTitle = document.createElement("td");
  tdTitle.innerHTML = `<div class="table-title" title="${escapeHtml(bookmark.title)}">${escapeHtml(bookmark.title)}</div>`;

  const tdUrl = document.createElement("td");
  const link = document.createElement("a");
  link.className = "table-url";
  link.href = bookmark.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = bookmark.url;
  tdUrl.appendChild(link);

  const tdCat = document.createElement("td");
  tdCat.innerHTML = `<span class="table-category">${escapeHtml(bookmark.category)}</span>`;

  const tdTags = document.createElement("td");
  const tagsWrap = document.createElement("div");
  tagsWrap.className = "table-tags";
  (bookmark.tags.length ? bookmark.tags : ["无标签"]).slice(0, 3).forEach((text) => {
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = text;
    tagsWrap.appendChild(tag);
  });
  tdTags.appendChild(tagsWrap);

  const tdTime = document.createElement("td");
  tdTime.textContent = formatDate(bookmark.createdAt);

  const tdAction = document.createElement("td");
  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "card-action-btn";
  editBtn.dataset.action = "edit";
  editBtn.dataset.id = bookmark.id;
  editBtn.textContent = "编辑";

  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "card-action-btn danger";
  delBtn.dataset.action = "delete";
  delBtn.dataset.id = bookmark.id;
  delBtn.textContent = "删除";

  tdAction.append(editBtn, delBtn);
  tr.append(tdSelect, tdTitle, tdUrl, tdCat, tdTags, tdTime, tdAction);
  return tr;
}

async function handleTableBodyClick(event) {
  const btn = event.target.closest("button[data-action]");
  if (!btn) return;
  const bookmark = state.bookmarks.find((x) => x.id === btn.dataset.id);
  if (!bookmark) return;

  if (btn.dataset.action === "edit") {
    openEditModal(bookmark);
  } else if (btn.dataset.action === "delete") {
    await deleteBookmark(bookmark);
  }
}

function handleTableBodyChange(event) {
  const checkbox = event.target.closest("input[data-select-id]");
  if (!checkbox) return;

  const id = checkbox.dataset.selectId;
  if (checkbox.checked) state.selectedIds.add(id);
  else state.selectedIds.delete(id);

  updateBatchSelectionMeta(getFilteredBookmarks());
}

function handleSelectAllVisible(event) {
  const filtered = getFilteredBookmarks();
  filtered.forEach((bm) => {
    if (event.target.checked) state.selectedIds.add(bm.id);
    else state.selectedIds.delete(bm.id);
  });
  renderContent();
}

async function handleBatchMoveCategory() {
  const selected = getSelectedBookmarks();
  if (!selected.length) return updateListMessage("请先勾选要整理的书签。", "error");

  const category = el.batchCategoryInput.value.trim();
  if (!category) return updateListMessage("请先填写要移动到的分类。", "error");

  const next = state.bookmarks.map((bm) => (state.selectedIds.has(bm.id) ? { ...bm, category } : bm));
  const ok = await commitBookmarks(next, `批量整理完成：${selected.length} 条已移动到「${category}」。`);
  if (ok) el.batchCategoryInput.value = "";
}

async function handleBatchAddTags() {
  const selected = getSelectedBookmarks();
  if (!selected.length) return updateListMessage("请先勾选要加标签的书签。", "error");

  const appendTags = parseTags(el.batchTagsInput.value);
  if (!appendTags.length) return updateListMessage("请先输入要追加的标签（逗号分隔）。", "error");

  const next = state.bookmarks.map((bm) => {
    if (!state.selectedIds.has(bm.id)) return bm;

    // 关键逻辑：批量追加标签时保留原标签，并对结果做去重。
    const currentTags = Array.isArray(bm.tags) ? parseTags(bm.tags.join(",")) : parseTags(bm.tags);
    const mergedTags = Array.from(new Set([...currentTags, ...appendTags]));
    return { ...bm, tags: mergedTags };
  });

  const ok = await commitBookmarks(next, `批量加标签完成：${selected.length} 条书签已更新。`);
  if (ok) el.batchTagsInput.value = "";
}

async function handleBatchDelete() {
  const selected = getSelectedBookmarks();
  if (!selected.length) return updateListMessage("请先勾选要删除的书签。", "error");
  if (!window.confirm(`确认批量删除 ${selected.length} 条书签吗？`)) return;

  const selectedSet = new Set(selected.map((x) => x.id));
  const next = state.bookmarks.filter((bm) => !selectedSet.has(bm.id));
  await commitBookmarks(next, `批量删除完成：已删除 ${selected.length} 条书签。`);
}

function handleClearSelection() {
  state.selectedIds.clear();
  renderContent();
}

function getSelectedBookmarks() {
  return state.bookmarks.filter((bm) => state.selectedIds.has(bm.id));
}

function updateBatchSelectionMeta(filtered) {
  const visibleIds = filtered.map((x) => x.id);
  const visibleSelected = visibleIds.filter((id) => state.selectedIds.has(id)).length;
  el.selectedCount.textContent = `已选 ${state.selectedIds.size} 项`;

  el.selectAllVisible.indeterminate = visibleSelected > 0 && visibleSelected < visibleIds.length;
  el.selectAllVisible.checked = visibleIds.length > 0 && visibleSelected === visibleIds.length;
}

function createEmptyState() {
  const box = document.createElement("div");
  box.className = "empty-state";
  box.innerHTML = "<strong>没有匹配到任何链接</strong><p>试试更换关键词，或点击左侧按钮添加新链接。</p>";
  return box;
}

function getFilteredBookmarks() {
  const keyword = state.searchKeyword;
  return state.bookmarks.filter((bm) => {
    if (state.activeCategory !== CATEGORY_ALL && bm.category !== state.activeCategory) return false;
    if (!keyword) return true;
    const text = `${bm.title} ${bm.tags.join(" ")} ${bm.url}`.toLowerCase();
    return text.includes(keyword);
  });
}

function handleExportHtml() {
  const content = buildBookmarksHtml(state.bookmarks);
  const fileName = buildExportFileName();
  downloadFile(content, fileName, "text/html;charset=utf-8");
  updateListMessage(`导出完成：${state.bookmarks.length} 条链接。`, "success");
}

function handleImportClick() {
  el.importFile.value = "";
  el.importFile.click();
}

async function handleImportChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const htmlText = await file.text();
    const parsed = parseBookmarksFromHtml(htmlText);
    if (!parsed.length) return updateListMessage("导入失败：文件中没有可用链接。", "error");

    const replaceAll = window.confirm("点击“确定”覆盖现有数据；点击“取消”按 URL 去重合并。");
    const next = replaceAll ? sortByCreatedAt(parsed) : mergeBookmarksByUrl(state.bookmarks, parsed).bookmarks;
    await commitBookmarks(next, `导入完成：当前共 ${next.length} 条链接。`);
  } catch (error) {
    console.error(error);
    updateListMessage("导入失败：HTML 文件格式异常。", "error");
  } finally {
    event.target.value = "";
  }
}

function buildBookmarksHtml(bookmarks) {
  const groups = groupByCategory(bookmarks);
  const categories = Object.keys(groups).sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));

  const lines = [
    "<!DOCTYPE NETSCAPE-Bookmark-file-1>",
    "<!-- This is an automatically generated file. -->",
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    `<TITLE>${escapeHtml(APP_CONFIG.appName)}</TITLE>`,
    `<H1>${escapeHtml(APP_CONFIG.appName)}</H1>`,
    "<DL><p>",
  ];

  categories.forEach((category) => {
    lines.push(`  <DT><H3>${escapeHtml(category)}</H3>`);
    lines.push("  <DL><p>");

    groups[category].forEach((bm) => {
      const tags = bm.tags.join(",");
      const addDate = toUnixTimestamp(bm.createdAt);
      const tagsAttr = tags ? ` DATA-TAGS="${escapeHtml(tags)}"` : "";
      lines.push(`    <DT><A HREF="${escapeHtml(bm.url)}" ADD_DATE="${addDate}" DATA-CATEGORY="${escapeHtml(bm.category)}"${tagsAttr}>${escapeHtml(bm.title)}</A>`);
      if (tags) lines.push(`    <DD>TAGS: ${escapeHtml(tags)}`);
    });

    lines.push("  </DL><p>");
  });

  lines.push("</DL><p>");
  return lines.join("\n");
}
function parseBookmarksFromHtml(htmlText) {
  const doc = new DOMParser().parseFromString(htmlText, "text/html");
  const anchors = Array.from(doc.querySelectorAll("a[href]"));
  const list = anchors.map(convertAnchorToBookmark).filter(Boolean);
  return dedupeByUrl(list);
}

function convertAnchorToBookmark(anchor) {
  const url = normalizeUrl((anchor.getAttribute("href") || "").trim());
  if (!isValidHttpUrl(url)) return null;

  return {
    id: createId(),
    title: (anchor.textContent || "").trim() || getHostName(url) || "未命名链接",
    url,
    category: getCategoryFromAnchor(anchor) || APP_CONFIG.defaultCategory,
    tags: getTagsFromAnchor(anchor),
    createdAt: getCreatedAtFromAnchor(anchor),
  };
}

function getCategoryFromAnchor(anchor) {
  const direct = (anchor.getAttribute("data-category") || "").trim();
  if (direct) return direct;

  let node = anchor.parentElement;
  while (node) {
    if (node.tagName === "DL") {
      const prev = node.previousElementSibling;
      if (prev) {
        const heading = prev.querySelector("h3");
        const text = heading ? heading.textContent.trim() : prev.textContent.trim();
        if (text) return text;
      }
    }
    node = node.parentElement;
  }
  return "";
}

function getTagsFromAnchor(anchor) {
  const dataTags = (anchor.getAttribute("data-tags") || anchor.getAttribute("tags") || "").trim();
  if (dataTags) return parseTags(dataTags);

  const dd = anchor.parentElement ? anchor.parentElement.nextElementSibling : null;
  if (!dd || dd.tagName !== "DD") return [];

  const matched = dd.textContent.trim().match(/^(?:tags|标签)\s*[:：]\s*(.+)$/i);
  return matched ? parseTags(matched[1]) : [];
}

function getCreatedAtFromAnchor(anchor) {
  const unix = (anchor.getAttribute("add_date") || "").trim();
  if (!/^\d+$/.test(unix)) return new Date().toISOString();

  const date = new Date(Number(unix) * 1000);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function mergeBookmarksByUrl(existing, incoming) {
  const map = new Map(existing.map((x) => [getBookmarkKey(x.url), x]));
  incoming.forEach((bm) => {
    const key = getBookmarkKey(bm.url);
    const current = map.get(key);
    map.set(
      key,
      current
        ? { ...current, title: bm.title || current.title, category: bm.category || current.category, tags: bm.tags.length ? bm.tags : current.tags, url: bm.url || current.url }
        : bm
    );
  });
  return { bookmarks: sortByCreatedAt(Array.from(map.values())) };
}

function dedupeByUrl(bookmarks) {
  const map = new Map();
  bookmarks.forEach((bm) => {
    const key = getBookmarkKey(bm.url);
    if (!map.has(key)) map.set(key, bm);
  });
  return sortByCreatedAt(Array.from(map.values()));
}

async function autoFillTitleFromUrl(rawUrl, options = {}) {
  const silent = Boolean(options.silent);
  const normalized = normalizeUrl(rawUrl.trim());
  if (!isValidHttpUrl(normalized)) return "";

  if (!silent) updateFormMessage("正在自动获取网站名称...", "");

  const resolved = await resolveTitleByApi(normalized);
  const finalTitle = (resolved.title || getHostName(normalized) || "未命名链接").trim();

  if (!el.titleInput.value.trim() && finalTitle) el.titleInput.value = finalTitle;

  if (!silent) {
    if (resolved.title && !resolved.fallback) updateFormMessage("已自动填充名称。", "success");
    else if (resolved.reason === "fetch_unavailable") updateFormMessage("服务器 Node 版本过低（需 >= 18）。", "error");
    else if (resolved.reason === "network_unreachable") updateFormMessage("服务器无法访问目标网站，已使用域名。", "error");
    else updateFormMessage("未抓取到页面标题，已使用域名。", "success");
  }

  return finalTitle;
}

async function resolveTitleByApi(url) {
  if (titleResolveTask && titleResolveTask.url === url) return titleResolveTask.promise;

  const task = (async () => {
    try {
      const resp = await fetch(`${APP_CONFIG.apiResolveTitle}?url=${encodeURIComponent(url)}`, { cache: "no-store" });
      if (!resp.ok) return { title: "", fallback: true, reason: "network_unreachable", error: `HTTP ${resp.status}` };
      const payload = await resp.json();
      return {
        title: typeof payload.title === "string" ? payload.title.trim() : "",
        fallback: Boolean(payload.fallback),
        reason: String(payload.reason || ""),
        error: String(payload.error || ""),
        tried: Array.isArray(payload.tried) ? payload.tried : [],
      };
    } catch (error) {
      return { title: "", fallback: true, reason: "network_unreachable", error: String(error && error.message ? error.message : error) };
    }
  })();

  titleResolveTask = { url, promise: task };
  try {
    return await task;
  } finally {
    if (titleResolveTask && titleResolveTask.url === url) titleResolveTask = null;
  }
}

async function loadBookmarksFromServer() {
  try {
    const resp = await fetch(APP_CONFIG.apiBookmarks, { cache: "no-store" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const payload = await resp.json();
    const list = Array.isArray(payload.bookmarks) ? payload.bookmarks : [];
    const normalized = sortByCreatedAt(normalizeBookmarkList(list, { keepId: true }));
    saveSnapshotCache(normalized);
    setSyncStatus("online", "已连接");
    return normalized;
  } catch (error) {
    console.error(error);
    setSyncStatus("offline", "离线");
    return null;
  }
}

async function persistBookmarksToServer() {
  setSyncStatus("loading", "同步中");
  lastPersistErrorMessage = "";

  let token = loadWriteToken();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const resp = await fetch(APP_CONFIG.apiBookmarks, {
        method: "PUT",
        headers: buildWriteHeaders(token),
        body: JSON.stringify({ bookmarks: state.bookmarks }),
      });

      if (resp.ok) {
        const payload = await resp.json();
        const list = Array.isArray(payload.bookmarks) ? payload.bookmarks : state.bookmarks;
        state.bookmarks = sortByCreatedAt(normalizeBookmarkList(list, { keepId: true }));
        saveSnapshotCache(state.bookmarks);
        if (token) saveWriteToken(token);
        setSyncStatus("online", "已连接");
        return true;
      }

      const payload = await readJsonSafe(resp);
      const code = payload && payload.code ? String(payload.code) : "";
      if (resp.status === 403 && (code === "WRITE_TOKEN_REQUIRED" || code === "WRITE_TOKEN_INVALID")) {
        if (attempt === 0) {
          const input = requestWriteToken(code === "WRITE_TOKEN_INVALID");
          if (!input) {
            setSyncStatus("online", "只读");
            lastPersistErrorMessage = "保存失败：未提供管理口令。";
            return false;
          }
          token = input;
          continue;
        }

        clearWriteToken();
        setSyncStatus("online", "只读");
        lastPersistErrorMessage = "保存失败：管理口令错误。";
        return false;
      }

      setSyncStatus("online", "已连接");
      lastPersistErrorMessage = `保存失败：服务器返回 HTTP ${resp.status}。`;
      return false;
    } catch (error) {
      console.error(error);
      setSyncStatus("offline", "离线");
      lastPersistErrorMessage = "保存失败：服务器不可达，请稍后重试。";
      return false;
    }
  }

  clearWriteToken();
  setSyncStatus("online", "只读");
  lastPersistErrorMessage = "保存失败：管理口令校验未通过。";
  return false;
}

function saveSnapshotCache(list) {
  try { localStorage.setItem(APP_CONFIG.cacheKey, JSON.stringify(list)); } catch {}
}

function loadSnapshotCache() {
  try {
    const raw = localStorage.getItem(APP_CONFIG.cacheKey);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? sortByCreatedAt(normalizeBookmarkList(list, { keepId: true })) : [];
  } catch {
    return [];
  }
}

function loadWriteToken() {
  try { return String(localStorage.getItem(APP_CONFIG.writeTokenKey) || "").trim(); } catch { return ""; }
}

function saveWriteToken(token) {
  try { localStorage.setItem(APP_CONFIG.writeTokenKey, String(token || "").trim()); } catch {}
}

function clearWriteToken() {
  try { localStorage.removeItem(APP_CONFIG.writeTokenKey); } catch {}
}

function buildWriteHeaders(token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers[APP_CONFIG.writeTokenHeader] = token;
  return headers;
}

function requestWriteToken(isRetry) {
  const message = isRetry ? "管理口令错误，请重新输入：" : "此操作需要管理口令：";
  const value = window.prompt(message, "");
  return value ? value.trim() : "";
}

async function readJsonSafe(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function normalizeBookmarkList(list, options = {}) {
  return list.map((item) => normalizeBookmark(item, options)).filter(Boolean);
}

function normalizeBookmark(item, options = {}) {
  if (!item || typeof item !== "object") return null;

  const title = String(item.title || "").trim();
  const url = normalizeUrl(String(item.url || item.href || "").trim());
  if (!title || !isValidHttpUrl(url)) return null;

  return {
    id: options.keepId && item.id ? String(item.id) : createId(),
    title,
    url,
    category: String(item.category || APP_CONFIG.defaultCategory).trim() || APP_CONFIG.defaultCategory,
    tags: normalizeTags(item.tags),
    createdAt: normalizeDate(item.createdAt),
  };
}

function normalizeTags(input) {
  if (Array.isArray(input)) return parseTags(input.join(","));
  if (typeof input === "string") return parseTags(input);
  return [];
}

function normalizeDate(value) {
  const date = value ? new Date(value) : null;
  return !date || Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function sortByCreatedAt(list) {
  return [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function groupByCategory(list) {
  return list.reduce((acc, bm) => {
    const c = bm.category || APP_CONFIG.defaultCategory;
    if (!acc[c]) acc[c] = [];
    acc[c].push(bm);
    return acc;
  }, {});
}

function countByCategory(list) {
  return list.reduce((acc, bm) => {
    const c = bm.category || APP_CONFIG.defaultCategory;
    acc[c] = (acc[c] || 0) + 1;
    return acc;
  }, {});
}

function parseTags(input) {
  return Array.from(new Set(String(input).split(/[,，]/).map((x) => x.trim()).filter(Boolean)));
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
  try { return new URL(url).hostname.replace(/^www\./i, ""); } catch { return url; }
}

function getFaviconUrl(url) {
  return `${APP_CONFIG.faviconService}${encodeURIComponent(url)}`;
}

function getBookmarkKey(url) {
  return normalizeUrl(url).toLowerCase();
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未知";
  return date.toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function buildExportFileName() {
  const now = new Date();
  const stamp = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}_${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;
  return `onenav_lite_${stamp}.html`;
}

function toUnixTimestamp(isoString) {
  const time = new Date(isoString).getTime();
  return Number.isNaN(time) ? Math.floor(Date.now() / 1000) : Math.floor(time / 1000);
}

function downloadFile(content, fileName, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

function setSyncStatus(mode, text) {
  el.syncStatus.textContent = text;
  el.syncStatus.classList.toggle("offline", mode === "offline");
}

function updateFormMessage(message, type) {
  el.formMessage.textContent = message;
  el.formMessage.className = type ? `form-message ${type}` : "form-message";
}

function updateListMessage(message, type) {
  el.listMessage.textContent = message;
  el.listMessage.className = type ? `list-message ${type}` : "list-message";
}

function escapeHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
}

function pad2(value) { return String(value).padStart(2, "0"); }
function deepCopy(value) { return JSON.parse(JSON.stringify(value)); }
function createId() { return window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : `bookmark_${Date.now()}_${Math.random().toString(16).slice(2)}`; }
