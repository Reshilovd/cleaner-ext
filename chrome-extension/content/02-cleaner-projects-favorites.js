"use strict";

    function setupCleanerProjectsFavorites() {
        if (state.cleanerProjectsFavoritesBound) {
            syncCleanerProjectsFavoritesUI();
            return;
        }

        state.cleanerProjectsFavoritesBound = true;
        state.cleanerProjectsFavoritesSet = loadCleanerProjectsFavoritesSet();

        // Первичная синхронизация сразу после инициализации.
        syncCleanerProjectsFavoritesUI();

        const observer = new MutationObserver((mutations) => {
            if (!Array.isArray(mutations) || mutations.length === 0) return;

            // Обновляем UI только если в гриде появились/заменились строки.
            const isRelevant = mutations.some((m) => {
                const target = m && m.target instanceof Element ? m.target : null;
                if (!target) return false;
                if (target.closest(".k-grid-content")) return true;
                if (target.closest(".k-grid-header")) return true;
                if (Array.isArray(m.addedNodes) && m.addedNodes.length > 0) {
                    for (const node of m.addedNodes) {
                        const el = node instanceof Element ? node : null;
                        if (!el) continue;
                        if (el.closest(".k-grid-content")) return true;
                        if (el.closest(".k-grid-header")) return true;
                    }
                }
                return false;
            });

            if (!isRelevant) return;

            if (state.cleanerProjectsFavoritesUiScheduled) return;
            state.cleanerProjectsFavoritesUiScheduled = true;

            const delay = Number.isFinite(state.cleanerProjectsFavoritesObserverThrottleMs)
                ? Math.max(0, state.cleanerProjectsFavoritesObserverThrottleMs)
                : 160;

            setTimeout(() => {
                state.cleanerProjectsFavoritesUiScheduled = false;
                syncCleanerProjectsFavoritesUI();
            }, delay);
        });

        observer.observe(document.body, { childList: true, subtree: true });
        state.cleanerProjectsFavoritesObserver = observer;
    }

    function loadCleanerProjectsFavoritesOnlyEnabled() {
        try {
            const raw = localStorage.getItem(CLEANER_PROJECTS_FAVORITES_ONLY_STORAGE_KEY);
            if (raw === "1") return true;
            if (raw === "0") return false;
            return false;
        } catch (e) {
            return false;
        }
    }

    function saveCleanerProjectsFavoritesOnlyEnabled(enabled) {
        try {
            localStorage.setItem(CLEANER_PROJECTS_FAVORITES_ONLY_STORAGE_KEY, enabled ? "1" : "0");
        } catch (e) {
            console.warn("[QGA] Не удалось сохранить only-favorites настройку:", e);
        }
    }

    function findCleanerProjectsNameSearchInput() {
        const candidates = Array.from(document.querySelectorAll("input"));
        for (const input of candidates) {
            if (!(input instanceof HTMLInputElement)) continue;
            if (!isElementVisible(input)) continue;

            const placeholder = input.getAttribute("placeholder") || "";
            const aria = input.getAttribute("aria-label") || "";
            const title = input.getAttribute("title") || "";
            const text = normalizeSingleLine(`${placeholder} ${aria} ${title}`)
                .toLowerCase()
                .replace(/ё/g, "е");

            if (!text) continue;
            if (text.includes("наимен") && text.includes("по")) return input;
            if (text.includes("наимен")) return input;
            if (text.includes("project") && text.includes("name")) return input;
        }
        return null;
    }

    function applyCleanerProjectsFavoritesOnlyFilter() {
        const gridRoot = getCleanerProjectsGridRootForFavorites();
        if (!gridRoot) return;

        if (state.cleanerProjectsIdColumnIndex < 0) {
            state.cleanerProjectsIdColumnIndex = findCleanerProjectsIdHeaderIndex(gridRoot);
        }
        const idColumnIndex = state.cleanerProjectsIdColumnIndex;
        if (idColumnIndex < 0) return;

        const favorites = getCleanerProjectsFavoritesSet();
        const enabled = state.cleanerProjectsFavoritesOnlyEnabled;
        const rows = gridRoot.querySelectorAll(".k-grid-content tbody tr");

        for (const row of Array.from(rows)) {
            if (!(row instanceof HTMLTableRowElement)) continue;

            const projectId = getCleanerProjectsProjectIdByRow(row, idColumnIndex);
            if (!projectId) {
                row.classList.remove("qga-cleaner-project-fav-only-hidden-row");
                continue;
            }

            const isFav = favorites.has(projectId);
            row.classList.toggle("qga-cleaner-project-fav-only-hidden-row", enabled && !isFav);
        }
    }

    window.onFavoritesOnlyChange = function(checked) {
        state.cleanerProjectsFavoritesOnlyEnabled = Boolean(checked);
        saveCleanerProjectsFavoritesOnlyEnabled(state.cleanerProjectsFavoritesOnlyEnabled);
        applyCleanerProjectsFavoritesOnlyFilter();
    };

    function syncFavoritesOnlySwitchUI(root, checked) {
        if (!(root instanceof HTMLElement)) return;
        const switchBox = root.querySelector("#qga-favorites-only-switch") || root;
        const isChecked = Boolean(checked);
        switchBox.className = isChecked ? "k-switch k-widget k-switch-on" : "k-switch k-widget k-switch-off";
        switchBox.setAttribute("aria-checked", String(isChecked));
        const input = root.querySelector("input[type='checkbox']");
        if (input instanceof HTMLInputElement) {
            input.checked = isChecked;
        }
    }

    function setupCleanerProjectsFavoritesOnlyToggle() {
        if (state.cleanerProjectsFavoritesOnlyToggleBound) {
            applyCleanerProjectsFavoritesOnlyFilter();
            return;
        }

        state.cleanerProjectsFavoritesOnlyToggleBound = true;
        state.cleanerProjectsFavoritesOnlyEnabled = loadCleanerProjectsFavoritesOnlyEnabled();

        const searchInput = findCleanerProjectsNameSearchInput();
        if (!searchInput) {
            // Если пока не успело подгрузиться — попробуем позже ещё пару раз.
            let attempts = 0;
            const tryLater = () => {
                attempts += 1;
                const again = findCleanerProjectsNameSearchInput();
                if (!again || attempts > 20) {
                    return;
                }
                setupCleanerProjectsFavoritesOnlyToggle();
            };
            setTimeout(tryLater, 400);
            return;
        }

        const existing = document.getElementById("qga-cleaner-only-favorites-toggle");
        if (existing) {
            syncFavoritesOnlySwitchUI(existing, state.cleanerProjectsFavoritesOnlyEnabled);
            applyCleanerProjectsFavoritesOnlyFilter();
            return;
        }

        const filterText = document.createElement("span");
        filterText.id = "qga-cleaner-only-favorites-toggle";
        filterText.className = "filter_text";

        const switchSpan = document.createElement("span");
        switchSpan.id = "qga-favorites-only-switch";
        switchSpan.className = "k-switch k-widget";
        switchSpan.setAttribute("role", "switch");
        switchSpan.setAttribute("tabindex", "0");

        const input = document.createElement("input");
        input.type = "checkbox";
        input.style.display = "none";

        const container = document.createElement("span");
        container.className = "k-switch-container";

        const labelOn = document.createElement("span");
        labelOn.className = "k-switch-label-on";
        labelOn.textContent = "On";

        const labelOff = document.createElement("span");
        labelOff.className = "k-switch-label-off";
        labelOff.textContent = "Off";

        const handle = document.createElement("span");
        handle.className = "k-switch-handle";

        container.appendChild(labelOn);
        container.appendChild(labelOff);
        container.appendChild(handle);

        switchSpan.appendChild(input);
        switchSpan.appendChild(container);

        const text = document.createElement("span");
        text.textContent = "Только избранные";

        filterText.appendChild(switchSpan);
        filterText.appendChild(document.createTextNode("\u00A0\u00A0"));
        filterText.appendChild(text);

        const dropdownRight = document.querySelector(".dropdown.float-right");
        if (dropdownRight instanceof HTMLElement) {
            dropdownRight.insertBefore(filterText, dropdownRight.firstElementChild);
        } else {
            const myProjectsElement = Array.from(document.querySelectorAll("label, span, div, a, p")).find((el) => {
                const txt = (el.textContent || "").trim();
                return txt === "Мои проекты" || txt === "Мои проекты:" || txt.startsWith("Мои проекты");
            });

            if (myProjectsElement && myProjectsElement.parentElement) {
                myProjectsElement.parentElement.insertBefore(filterText, myProjectsElement);
            } else {
                searchInput.insertAdjacentElement("afterend", filterText);
            }
        }

        const toggleSwitchState = () => {
            const checked = !state.cleanerProjectsFavoritesOnlyEnabled;
            window.onFavoritesOnlyChange(checked);
            syncFavoritesOnlySwitchUI(switchSpan, checked);
        };

        switchSpan.addEventListener("click", toggleSwitchState);
        switchSpan.addEventListener("keydown", (evt) => {
            if (evt.key === "Enter" || evt.key === " ") {
                evt.preventDefault();
                toggleSwitchState();
            }
        });

        syncFavoritesOnlySwitchUI(filterText, state.cleanerProjectsFavoritesOnlyEnabled);

        applyCleanerProjectsFavoritesOnlyFilter();
    }
    function getCleanerProjectsFavoritesSet() {
        if (!state.cleanerProjectsFavoritesSet) {
            state.cleanerProjectsFavoritesSet = loadCleanerProjectsFavoritesSet();
        }
        return state.cleanerProjectsFavoritesSet;
    }

    function loadCleanerProjectsFavoritesSet() {
        try {
            const raw = localStorage.getItem(CLEANER_PROJECTS_FAVORITES_STORAGE_KEY);
            if (!raw) return new Set();
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return new Set();
            const set = new Set();
            for (const v of parsed) {
                const id = sanitizeProjectId(v);
                if (id) set.add(id);
            }
            return set;
        } catch (e) {
            console.warn("[QGA] Не удалось прочитать favorites проектов:", e);
            return new Set();
        }
    }

    function saveCleanerProjectsFavoritesSet(set) {
        try {
            if (!set || !(set instanceof Set)) return;
            localStorage.setItem(
                CLEANER_PROJECTS_FAVORITES_STORAGE_KEY,
                JSON.stringify(Array.from(set).sort((a, b) => String(a).localeCompare(String(b))))
            );
        } catch (e) {
            console.warn("[QGA] Не удалось сохранить favorites проектов:", e);
        }
    }

    function getCleanerProjectsGridRootForFavorites() {
        // Для простоты используем тот же грид, что и для фильтра авторов.
        const binding = findCleanerProjectsAuthorHeaderBinding();
        if (!binding) return null;
        return binding.gridRoot;
    }

    function findCleanerProjectsIdHeaderIndex(gridRoot) {
        if (!gridRoot) return -1;
        const headerCells = gridRoot.querySelectorAll(".k-grid-header th[role='columnheader']");
        if (!headerCells || !headerCells.length) return -1;
        for (let i = 0; i < headerCells.length; i += 1) {
            const t = normalizeSearchText(headerCells[i].textContent || "");
            if (!t) continue;
            if (t === "id" || t.includes("id") || t.includes("номер")) {
                return i;
            }
        }
        return -1;
    }

    function getCleanerProjectsProjectIdByRow(row, idColumnIndex) {
        if (!(row instanceof HTMLTableRowElement)) return "";
        if (idColumnIndex < 0) return "";

        const extractNumeric = (value) => {
            if (!value) return "";
            const normalized = normalizeSingleLine(String(value));
            if (!normalized) return "";
            const m = normalized.match(/\d+/);
            return m ? m[0] : "";
        };

        const editLink = row.querySelector("a[href*='/Project/Edit/'], a[href*='/project/edit/']");
        if (editLink && editLink instanceof HTMLAnchorElement) {
            const rawHref = editLink.getAttribute("href") || editLink.href || "";
            const match = rawHref.match(/\/Project\/Edit\/(\d+)/i);
            if (match && match[1]) {
                return match[1];
            }

            const linkId = extractNumeric(rawHref);
            if (linkId) return linkId;
        }

        const anyLink = row.querySelector("a[href*='/project/'], a[href*='/Project/']");
        if (anyLink && anyLink instanceof HTMLAnchorElement) {
            const rawHref = anyLink.getAttribute("href") || anyLink.href || "";
            const linkId = extractNumeric(rawHref);
            if (linkId) return linkId;
        }

        const cells = row.querySelectorAll("td");
        if (!cells.length) return "";

        if (idColumnIndex < cells.length) {
            const idValue = extractNumeric(cells[idColumnIndex].textContent || "");
            if (idValue) return idValue;
        }

        // Резервный вариант: ищем номер внутри всей строки
        const wholeText = row.textContent || "";
        const allMatch = wholeText.match(/(\d+)/);
        if (allMatch && allMatch[1]) {
            return allMatch[1];
        }

        return "";
    }

    function syncCleanerProjectsFavoritesUI() {
        const gridRoot = getCleanerProjectsGridRootForFavorites();
        if (!gridRoot) return;

        if (state.cleanerProjectsIdColumnIndex < 0) {
            state.cleanerProjectsIdColumnIndex = findCleanerProjectsIdHeaderIndex(gridRoot);
        }

        const idColumnIndex = state.cleanerProjectsIdColumnIndex;
        if (idColumnIndex < 0) return;

        const favorites = getCleanerProjectsFavoritesSet();

        const rows = gridRoot.querySelectorAll(".k-grid-content tbody tr");
        for (const row of Array.from(rows)) {
            if (!(row instanceof HTMLTableRowElement)) continue;
            const projectId = getCleanerProjectsProjectIdByRow(row, idColumnIndex);
            if (!projectId) {
                row.classList.remove("qga-cleaner-project-fav-only-hidden-row");
                continue;
            }

            const isFav = favorites.has(projectId);
            // row.classList.toggle("qga-cleaner-project-fav-row", isFav);
            if (state.cleanerProjectsFavoritesOnlyEnabled) {
                row.classList.toggle("qga-cleaner-project-fav-only-hidden-row", !isFav);
            } else {
                row.classList.remove("qga-cleaner-project-fav-only-hidden-row");
            }

            let btn = row.querySelector(".qga-cleaner-project-fav-btn");
            if (!(btn instanceof HTMLElement)) {
                const cells = row.querySelectorAll("td");
                const firstCell = cells.length > 0 ? cells[0] : null;

                btn = document.createElement("div");
                btn.className = "qga-cleaner-project-fav-btn";
                btn.dataset.qgaCleanerProjectId = projectId;
                btn.setAttribute("aria-label", isFav ? "Убрать из избранного" : "Добавить в избранное");
                btn.setAttribute("role", "button");
                btn.setAttribute("tabindex", "0");

                const handleFavToggle = (event) => {
                    if (!(event instanceof Event)) return;
                    event.preventDefault();
                    event.stopPropagation();

                    const rawProjectId = event.currentTarget instanceof HTMLElement ? event.currentTarget.dataset.qgaCleanerProjectId : "";
                    const pid = sanitizeProjectId(rawProjectId || "");
                    if (!pid) return;

                    const favSet = getCleanerProjectsFavoritesSet();
                    if (favSet.has(pid)) {
                        favSet.delete(pid);
                    } else {
                        favSet.add(pid);
                    }
                    saveCleanerProjectsFavoritesSet(favSet);

                    const currentRow = (event.currentTarget instanceof HTMLElement ? event.currentTarget.closest("tr") : null);
                    if (currentRow instanceof HTMLTableRowElement) {
                        currentRow.classList.toggle("qga-cleaner-project-fav-row", favSet.has(pid));
                        if (state.cleanerProjectsFavoritesOnlyEnabled) {
                            currentRow.classList.toggle(
                                "qga-cleaner-project-fav-only-hidden-row",
                                !favSet.has(pid)
                            );
                        } else {
                            currentRow.classList.remove("qga-cleaner-project-fav-only-hidden-row");
                        }
                    }

                    const currentBtn = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
                    if (currentBtn) {
                        currentBtn.classList.add("qga-cleaner-project-fav-btn-clicked");
                        setTimeout(() => currentBtn.classList.remove("qga-cleaner-project-fav-btn-clicked"), 150);

                        currentBtn.textContent = favSet.has(pid) ? "\u2605" : "\u2606";
                        currentBtn.setAttribute(
                            "aria-label",
                            favSet.has(pid) ? "Убрать из избранного" : "Добавить в избранное"
                        );
                        currentBtn.classList.toggle("qga-cleaner-project-fav-btn--fav", favSet.has(pid));
                    }
                };

                btn.addEventListener("click", handleFavToggle);
                btn.addEventListener("keydown", (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                        handleFavToggle(event);
                    }
                });

                if (firstCell) {
                    // Убираем картинку из первой ячейки
                    const img = firstCell.querySelector("img");
                    if (img) {
                        img.remove();
                    }
                    firstCell.appendChild(btn);
                } else {
                    // Fallback: если не нашли первую ячейку, вставим к первому найденному editLink.
                    const editLink = row.querySelector("a[href*='/Project/Edit/'], a[href*='/project/edit/']");
                    if (editLink && editLink instanceof HTMLAnchorElement) {
                        const wrap = document.createElement("span");
                        wrap.className = "qga-cleaner-project-fav-btn-wrap";
                        editLink.insertAdjacentElement("afterend", wrap);
                        wrap.appendChild(btn);
                    } else {
                        row.appendChild(btn);
                    }
                }
            }

            btn.dataset.qgaCleanerProjectId = projectId;
            btn.textContent = isFav ? "\u2605" : "\u2606";
            btn.setAttribute("aria-label", isFav ? "Убрать из избранного" : "Добавить в избранное");
            btn.classList.toggle("qga-cleaner-project-fav-btn--fav", isFav);
        }
    }
 "use strict";

