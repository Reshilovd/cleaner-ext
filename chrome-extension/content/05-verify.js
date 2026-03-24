"use strict";

    function getVerifyGridRootByRow(row) {
        if (!row || !(row instanceof HTMLElement)) return null;
        return row.closest("#grid, #gridOpenEnds, [data-role='grid']") || null;
    }

    function findVerifyRowCellByHeader(row, headerMatchers) {
        if (!row || !(row instanceof HTMLTableRowElement) || !Array.isArray(headerMatchers) || !headerMatchers.length) {
            return null;
        }
        const gridRoot = getVerifyGridRootByRow(row);
        const headerRow = gridRoot
            ? gridRoot.querySelector(".k-grid-header thead tr[role='row']")
            : null;
        const headerCells = headerRow ? headerRow.querySelectorAll("th[role='columnheader']") : null;
        const cells = row.querySelectorAll("td[role='gridcell']");
        if (!headerCells || !headerCells.length || !cells.length) {
            return null;
        }
        for (let i = 0; i < headerCells.length && i < cells.length; i += 1) {
            const text = String(headerCells[i].textContent || "").trim().toLowerCase();
            if (!text) continue;
            if (headerMatchers.some((matcher) => text.includes(matcher))) {
                return cells[i];
            }
        }
        return null;
    }

    function resolveVerifyRowContext(row) {
        let openEndId = null;
        let valueText = "";
        let variableText = "";

        const questionElement = getVerifyQuestionElement();
        if (questionElement && questionElement.textContent) {
            const questionText = questionElement.textContent.trim();
            const parsedCodes = parseVerifyVariableCodes(questionText);
            if (parsedCodes.length > 0) {
                const groupedCodes = getVerifyGroupedVariableCodes(parsedCodes[0]);
                if (groupedCodes.length > 0) {
                    variableText = groupedCodes.join("; ");
                } else {
                    variableText = parsedCodes.join("; ");
                }
            }
        }

        if (!valueText) {
            const valueCell =
                row.querySelector("td[role='gridcell'][data-field='Value']") ||
                findVerifyRowCellByHeader(row, ["значен", "value", "ответ", "answer", "openend", "текст"]);
            if (valueCell && valueCell.textContent) {
                valueText = valueCell.textContent.trim();
            }
        }

        if (openEndId == null) {
            const idCell = row.querySelector("td[role='gridcell'][data-field='Id']");
            if (idCell && idCell.textContent) {
                const raw = idCell.textContent.trim();
                if (raw) {
                    openEndId = raw;
                }
            }
        }

        return {
            openEndId,
            valueText,
            variableText,
            variableCodes: parseVerifyVariableCodes(variableText)
        };
    }

    function buildVerifyRowKey(context) {
        if (!context) {
            return null;
        }
        const idPart =
            context.openEndId != null && context.openEndId !== ""
                ? String(context.openEndId).trim()
                : "";
        const valuePart =
            context.valueText && context.valueText !== ""
                ? String(context.valueText).trim().toLowerCase()
                : "";
        if (!idPart && !valuePart) {
            return null;
        }
        return idPart + "||" + valuePart;
    }

    /** Возвращает число N (кол-во ID по ответу) из первой ячейки строки или null. */
    function getVerifyRowN(gridRoot, row) {
        if (!gridRoot || !row) return null;
        const headerRow = gridRoot.querySelector(".k-grid-header thead tr[role='row']");
        const headerCells = headerRow ? headerRow.querySelectorAll("th[role='columnheader']") : null;
        const firstHeaderText = headerCells && headerCells.length
            ? (headerCells[0].textContent || "").trim().toLowerCase()
            : "";
        const cells = row.querySelectorAll("td[role='gridcell']");
        if (!cells.length) return null;
        const firstCell = cells[0];
        const text = (firstCell.textContent || "").trim();
        const num = parseInt(text, 10);
        if (firstHeaderText === "n" || /^\d+$/.test(text)) {
            return Number.isFinite(num) ? num : null;
        }
        return Number.isFinite(num) ? num : null;
    }

    /** Возвращает { incorrect, postpone } по чекбоксам строки. */
    function getVerifyRowIncorrectPostpone(gridRoot, row) {
        const out = { incorrect: false, postpone: false };
        if (!gridRoot || !row || !(row instanceof HTMLTableRowElement)) return out;
        const headerRow = gridRoot.querySelector(".k-grid-header thead tr[role='row']");
        const headerCells = headerRow ? headerRow.querySelectorAll("th[role='columnheader']") : null;
        let incorrectIndex = -1;
        let postponeIndex = -1;
        if (headerCells && headerCells.length) {
            for (let i = 0; i < headerCells.length; i += 1) {
                const text = (headerCells[i].textContent || "").trim().toLowerCase();
                if (incorrectIndex === -1 && text.includes("некоррект")) incorrectIndex = i;
                if (postponeIndex === -1 && text.includes("отлож")) postponeIndex = i;
            }
        }
        const cells = row.querySelectorAll("td[role='gridcell']");
        const incorrectCell = incorrectIndex >= 0 && incorrectIndex < cells.length ? cells[incorrectIndex] : null;
        const postponeCell = postponeIndex >= 0 && postponeIndex < cells.length ? cells[postponeIndex] : null;
        const incorrectCheckbox = incorrectCell ? incorrectCell.querySelector("input[type='checkbox']") : null;
        const postponeCheckbox = postponeCell ? postponeCell.querySelector("input[type='checkbox']") : null;
        out.incorrect = !!(incorrectCheckbox && incorrectCheckbox.checked);
        out.postpone = !!(postponeCheckbox && postponeCheckbox.checked);
        return out;
    }

    /** Возвращает массив respondent IDs по контексту строки (после загрузки индекса). */
    function getRespondentIdsForContext(context) {
        if (!context || (!context.openEndId && !context.valueText)) return [];
        const respondentIdsByOpenEndId = state.verifyRespondentIdsByOpenEndId;
        const idsByQuestionAndValue = state.verifyRespondentIdsByQuestionAndValue;
        const idsByValueOnly = state.verifyRespondentIdsByValueOnly;
        if (!respondentIdsByOpenEndId && !idsByQuestionAndValue && !idsByValueOnly) return [];
        let respondentIds = [];
        if (respondentIdsByOpenEndId && respondentIdsByOpenEndId.size > 0) {
            if (respondentIds.length === 0) {
                const valueText = context.valueText || "";
                const contextCodes = getVerifyCodesForContext(context);
                if (contextCodes.length > 0 && valueText) {
                    if (contextCodes.length > 1) {
                        const collected = new Set();
                        for (const code of contextCodes) {
                            for (const variant of getVerifyQuestionCodeVariants(code)) {
                                const key = buildVerifyQuestionValueKey(variant, valueText);
                                const arr = respondentIdsByOpenEndId.get(key) || [];
                                if (Array.isArray(arr)) arr.forEach((id) => collected.add(String(id)));
                            }
                        }
                        if (collected.size > 0) respondentIds = Array.from(collected);
                    }
                    if (respondentIds.length === 0) {
                        const singleCode = contextCodes[0];
                        for (const variant of getVerifyQuestionCodeVariants(singleCode)) {
                            const compositeKey = buildVerifyQuestionValueKey(variant, valueText);
                            const fromMap = respondentIdsByOpenEndId.get(compositeKey);
                            if (Array.isArray(fromMap) && fromMap.length > 0) {
                                respondentIds = fromMap.slice();
                                break;
                            }
                        }
                    }
                }
            }
            if (respondentIds.length === 0 && context.openEndId != null) {
                const key = String(context.openEndId).trim();
                const idsFromMap =
                    respondentIdsByOpenEndId.get(key) ||
                    respondentIdsByOpenEndId.get(String(context.openEndId)) ||
                    [];
                if (Array.isArray(idsFromMap) && idsFromMap.length > 0) respondentIds = idsFromMap.slice();
            }
        }
        if (respondentIds.length === 0 && idsByQuestionAndValue) {
            const valueText = context.valueText || "";
            const contextCodes = getVerifyCodesForContext(context);
            if (contextCodes.length > 0 && valueText) {
                if (contextCodes.length > 1) {
                    const collected = new Set();
                    for (const code of contextCodes) {
                        for (const variant of getVerifyQuestionCodeVariants(code)) {
                            const key = buildVerifyQuestionValueKey(variant, valueText);
                            const arr = idsByQuestionAndValue.get(key) || [];
                            if (Array.isArray(arr)) arr.forEach((id) => collected.add(String(id)));
                        }
                    }
                    if (collected.size > 0) respondentIds = Array.from(collected);
                }
                if (respondentIds.length === 0) {
                    const singleCode = contextCodes[0];
                    for (const variant of getVerifyQuestionCodeVariants(singleCode)) {
                        const key = buildVerifyQuestionValueKey(variant, valueText);
                        const fromIndex = idsByQuestionAndValue.get(key);
                        if (Array.isArray(fromIndex) && fromIndex.length > 0) {
                            respondentIds = fromIndex.slice();
                            break;
                        }
                    }
                }
            }
        }
        if (respondentIds.length === 0 && idsByValueOnly && context.valueText) {
            const key = buildVerifyValueOnlyKey(context.valueText);
            const fromIndex = idsByValueOnly.get(key);
            if (Array.isArray(fromIndex) && fromIndex.length > 0) {
                const allowedCodes = getVerifyCodesForContext(context);
                if (allowedCodes.length > 0) {

                    const allowedCodeSet = new Set(
                        allowedCodes.flatMap((code) => getVerifyQuestionCodeVariants(code))
                    );
                    const allowedIds = new Set();
                    const answersMap = state.verifyAnswersByRespondentId || new Map();
                    for (const rawId of fromIndex) {
                        const idStr = String(rawId).trim();
                        if (!idStr) continue;
                        const answersForId =
                            answersMap.get(idStr) ||
                            answersMap.get(idStr.trim()) ||
                            [];
                        const hasAnswerInGroup = answersForId.some((ans) => {
                            const q = String(ans && ans.question ? ans.question : "").trim();
                            const answerValueKey = buildVerifyValueOnlyKey(
                                ans && ans.value ? ans.value : ""
                            );
                            return q && allowedCodeSet.has(q) && answerValueKey === key;
                        });
                        if (hasAnswerInGroup) {
                            allowedIds.add(idStr);
                        }
                    }
                    if (allowedIds.size > 0) {
                        respondentIds = Array.from(allowedIds);
                    }
                } else {
                    respondentIds = fromIndex.slice();
                }
            }
        }
        return Array.from(new Set(respondentIds.map((id) => String(id))));
    }

    /** Возвращает массив respondent IDs для строки (читает контекст из DOM строки). */
    function getRespondentIdsForVerifyRow(row) {
        const context = resolveVerifyRowContext(row);
        return getRespondentIdsForContext(context);
    }

    /**
     * Подсвечивает строки, где N=1, цветом по приоритетному ReasonCode:
     * 1 — некорректный (красный), 2 — спорное интервью (фиолетовый),
     * 3 — одинаковые ответы (синий), 4 — спидстер (оранжевый),
     * 6 — технический брак (жёлтый).
     */
    function applyVerifyRowVisibility(gridRoot) {
        if (!gridRoot) return;
        const projectId = getProjectIdForVerify();
        const alreadyInManualSet = projectId ? getManualBfridsSetForProject(projectId) : new Set();
        const verifyIncorrectSet = projectId ? getVerifyIncorrectIdsSetForProject(projectId) : new Set();
        const ratingReasonMap = projectId ? getRatingReasonCodesForProject(projectId) : {};
        const rows = gridRoot.querySelectorAll("tr.k-master-row");
        const REASON_ICON_CONFIG = {
            1: { url: chrome.runtime.getURL("icons/inc.png"), alt: "Некорректный ответ" },
            3: { url: chrome.runtime.getURL("icons/table.png"), alt: "Одинаковые табличные ответы" },
            4: { url: chrome.runtime.getURL("icons/speed.png"), alt: "Спидстер" },
            6: { url: chrome.runtime.getURL("icons/manual.png"), alt: "Ручная чистка" }
        };

        const ROW_BG_COLOR = {
            1: "#fee2e2",
            2: "#f3e8ff",
            3: "#dbeafe",
            4: "#ffedd5",
            6: "#fef9c3"
        };

        for (const row of rows) {
            if (!(row instanceof HTMLTableRowElement)) continue;
            row.classList.remove("qga-verify-row-hidden");
            ALL_ROW_REASON_CLASSES.forEach((cls) => row.classList.remove(cls));

            const { incorrect, postpone } = getVerifyRowIncorrectPostpone(gridRoot, row);
            const hasManualOverride = incorrect || postpone;

            if (hasManualOverride) {
                if (row.dataset.qgaRowGradient === "1") {
                    delete row.dataset.qgaRowGradient;
                }
                // Не трогаем background: стандартная чистилка сама перекрасит строку
                continue;
            }

            let allCodes = [];
            let topCode = 0;

            if (state.verifyRespondentIndexLoaded) {
                const ids = getRespondentIdsForVerifyRow(row);
                if (ids && ids.length > 0) {
                    const codesSet = [];
                    let hasAnyReasons = false;
                    let hasCleanRespondent = false;

                    for (const respondentId of ids) {
                        const codes = getRespondentAllReasonCodes(
                            respondentId,
                            verifyIncorrectSet,
                            ratingReasonMap,
                            alreadyInManualSet
                        );

                        if (Array.isArray(codes) && codes.length > 0) {
                            hasAnyReasons = true;
                            for (const c of codes) {
                                if (codesSet.indexOf(c) === -1) {
                                    codesSet.push(c);
                                }
                            }
                        } else {
                            hasCleanRespondent = true;
                        }
                    }

                    if (hasAnyReasons && !hasCleanRespondent) {
                        allCodes = codesSet;
                        topCode = getTopReasonCode(allCodes);
                    }
                }
            }

            let appliedGradient = false;
            if (allCodes.length > 1) {
                const colors = allCodes.map((c) => ROW_BG_COLOR[c]).filter(Boolean);
                if (colors.length > 1) {
                    row.style.background = "linear-gradient(to right, " + colors.join(", ") + ")";
                    row.dataset.qgaRowGradient = "1";
                    appliedGradient = true;
                }
            }

            if (!appliedGradient) {
                if (row.dataset.qgaRowGradient === "1") {
                    row.style.removeProperty("background");
                    delete row.dataset.qgaRowGradient;
                }
                const rowClass = REASON_CODE_ROW_CLASS[topCode];
                if (rowClass) {
                    row.classList.add(rowClass);
                }
            }

            const firstCell = row.querySelector("td[role='gridcell']");
            if (firstCell) {
                let textWrap = firstCell.querySelector(".qga-cell-text");
                if (!textWrap) {
                    textWrap = document.createElement("span");
                    textWrap.className = "qga-cell-text";
                    while (firstCell.childNodes.length) {
                        textWrap.appendChild(firstCell.childNodes[0]);
                    }
                    firstCell.appendChild(textWrap);
                }

                let iconsWrap = textWrap.querySelector(".qga-reason-icons");
                const neededCodes = allCodes.filter((c) => REASON_ICON_CONFIG[c]);

                if (neededCodes.length > 0) {
                    if (!iconsWrap) {
                        iconsWrap = document.createElement("span");
                        iconsWrap.className = "qga-reason-icons";
                        textWrap.appendChild(iconsWrap);
                    }

                    const currentSrcs = new Set(
                        Array.from(iconsWrap.querySelectorAll("img")).map((img) => img.src)
                    );
                    const neededSrcs = new Set(neededCodes.map((c) => REASON_ICON_CONFIG[c].url));

                    if (currentSrcs.size !== neededSrcs.size || ![...currentSrcs].every((s) => neededSrcs.has(s))) {
                        iconsWrap.innerHTML = "";
                        for (const code of neededCodes) {
                            const cfg = REASON_ICON_CONFIG[code];
                            const icon = document.createElement("img");
                            icon.src = cfg.url;
                            icon.alt = cfg.alt;
                            icon.title = cfg.alt;
                            iconsWrap.appendChild(icon);
                        }
                    }
                } else if (iconsWrap) {
                    iconsWrap.remove();
                }
            }

        }
    }

    /**
     * @param {HTMLElement | null} [triggerButton] — кнопка, по которой кликнули (например «Посмотреть»); на ней показывается анимация загрузки
     */
    async function ensureVerifyRespondentIndexLoaded(triggerButton) {
        if (state.verifyRespondentIndexLoaded) {
            return true;
        }

        if (state.verifyRespondentIndexLoading) {
            return false;
        }

        const projectId = getProjectIdForVerify();
        if (!projectId) {
            state.verifyRespondentIndexError =
                "Не удалось определить идентификатор проекта (ProjectId) на странице VerifyMain.";
            console.warn("[QGA] VerifyMain: не найден ProjectId для загрузки выгрузки OpenEnds.");
            return false;
        }

        state.verifyRespondentIndexLoading = true;
        state.verifyRespondentIndexError = null;
        if (triggerButton) {
            triggerButton.disabled = true;
        }

        try {
            const url = `/lk/OpenEnds2/DownloadOpenEnds/${encodeURIComponent(String(projectId))}`;
            console.info("[QGA] VerifyMain: загрузка выгрузки OpenEnds (XLSX) с", url);

            const response = await fetch(url, { credentials: "include" });
            if (!response.ok) {
                state.verifyRespondentIndexError = `Сервер вернул статус ${response.status} при загрузке OpenEnds.`;
                console.warn("[QGA] VerifyMain: ошибка ответа при загрузке OpenEnds:", response.status);
                return false;
            }

            const buffer = await response.arrayBuffer();
            const parsed = parseOpenEndsFromXlsx(buffer);
            if (!parsed.ok) {
                state.verifyRespondentIndexError = parsed.error || "Не удалось разобрать выгрузку OpenEnds.";
                console.warn("[QGA] VerifyMain: ошибка разбора выгрузки OpenEnds:", parsed.error);
                return false;
            }

            state.verifyRespondentIdsByOpenEndId = parsed.respondentIdsByOpenEndId;
            state.verifyAnswersByRespondentId = parsed.answersByRespondentId;
            state.verifyRespondentIdsByQuestionAndValue = parsed.respondentIdsByQuestionAndValue;
            state.verifyRespondentIdsByValueOnly = parsed.respondentIdsByValueOnly;
            state.verifyRespondentIndexLoaded = true;
            console.info("[QGA] VerifyMain: индекс ответов респондентов успешно построен.");
            return true;
        } catch (error) {
            console.error("[QGA] VerifyMain: исключение при загрузке/разборе OpenEnds:", error);
            state.verifyRespondentIndexError = "Ошибка сети или формата при загрузке выгрузки OpenEnds.";
            return false;
        } finally {
            state.verifyRespondentIndexLoading = false;
            if (triggerButton) {
                triggerButton.disabled = false;
            }
        }
    }

    /** Отправить выбранные respondent ID в ручную чистку (вызывается из модалки «Другие ответы»). */
    async function sendRespondentIdsToManualCleanup(idsArray) {
        if (!idsArray || idsArray.length === 0) {
            return;
        }
        const projectId = getProjectIdForVerify();
        if (!projectId) {
            alert("Не удалось определить проект.");
            return;
        }
        const ok = await ensureVerifyRespondentIndexLoaded();
        if (!ok) {
            if (state.verifyRespondentIndexError) {
                console.warn("[QGA]", state.verifyRespondentIndexError);
            }
            return;
        }
        const normalized = idsArray.map((id) => String(id).trim()).filter(Boolean);
        if (normalized.length === 0) {
            return;
        }
        addManualBfridsForProject(projectId, normalized);
        try {
            await sendManualBfridsToServer(projectId, normalized);
        } catch (error) {
            console.error("[QGA] Ошибка при отправке bfrid в ручную чистку через API:", error);
            alert("Ошибка при отправке в ручную чистку. Подробности в консоли.");
            return;
        }
        console.info(
            "[QGA] Добавлено bfrid в буфер ручной чистки для проекта",
            projectId,
            "кол-во:",
            normalized.length
        );
    }

    function getProjectIdForVerify() {
        const byId = document.getElementById("ProjectId");
        if (byId && "value" in byId && byId.value) {
            return byId.value;
        }

        const input = document.querySelector("input[name='ProjectId']");
        if (input && "value" in input && input.value) {
            return input.value;
        }

        return null;
    }

    /** ProjectId на странице редактирования проекта (/lk/Project/Edit/123). */
    function getProjectIdFromEditPage() {
        const path = (window.location.pathname || "").trim();
        const match = path.match(/\/lk\/project\/edit\/([^/]+)/i);
        return match && match[1] ? match[1] : null;
    }

    /** ID проекта для поиска сохранённых группировок: на странице проверки это ключ из localStorage (из URL Edit), а не ProjectId из формы. Ищем ссылку на /Project/Edit/ или путь. */
    function getProjectIdForGroupsLookup() {
        const path = (window.location.pathname || "").trim();
        let match = path.match(/\/lk\/project\/edit\/([^/]+)/i);
        if (match && match[1]) return match[1];
        const link = document.querySelector('a[href*="/Project/Edit/"], a[href*="/project/edit/"]');
        if (link && link.href) {
            match = link.href.match(/\/project\/edit\/([^/?#]+)/i);
            if (match && match[1]) return match[1];
        }
        return getProjectIdForVerify();
    }

    function loadOpenEndsGroups() {
        try {
            const raw = localStorage.getItem(OPENENDS_GROUPS_STORAGE_KEY);
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === "object" ? parsed : {};
        } catch (e) {
            return {};
        }
    }

    function saveOpenEndsGroups(allProjectsGroups) {
        try {
            localStorage.setItem(OPENENDS_GROUPS_STORAGE_KEY, JSON.stringify(allProjectsGroups || {}));
        } catch (e) {}
    }

    /** Собрать с текущей страницы (Project Edit #openEnds) список сгруппированных переменных из колонки «переменная» (Q1_1_other; Q1_2_other; …) и сохранить по projectId. */
    function collectOpenEndsGroupsFromPage() {
        if (!isOpenEndsHash()) return;
        const projectId = getProjectIdFromEditPage();
        if (!projectId) return;
        const root = document.querySelector("#divOpenEnds");
        if (!root) return;
        const rows = root.querySelectorAll("#gridOpenEnds .k-grid-content tbody tr.k-master-row");
        const variableSelector = state.settings.variableSelector || "td:nth-child(5)";
        const groupByCode = {};
        for (const row of rows) {
            const cell = row.querySelector(variableSelector);
            const text = (cell && (cell.textContent || cell.innerText || "").trim()) || "";
            const codes = parseVerifyVariableCodes(text);
            if (codes.length > 1) {
                for (const code of codes) {
                    groupByCode[code] = codes.slice();
                }
            }
        }
        const all = loadOpenEndsGroups();
        all[projectId] = groupByCode;
        saveOpenEndsGroups(all);
        ensureManualGroupButtonHooked();
    }

    function loadManualBfridsState() {
        try {
            const raw = localStorage.getItem(MANUAL_BFRIDS_STORAGE_KEY);
            if (!raw) {
                return {};
            }
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== "object") {
                return {};
            }
            return parsed;
        } catch (error) {
            console.warn("[QGA] Не удалось прочитать состояние bfrid для ручной чистки из localStorage:", error);
            return {};
        }
    }

    function saveManualBfridsState(stateObject) {
        try {
            localStorage.setItem(MANUAL_BFRIDS_STORAGE_KEY, JSON.stringify(stateObject || {}));
        } catch (error) {
            console.warn("[QGA] Не удалось сохранить состояние bfrid для ручной чистки в localStorage:", error);
        }
    }

    function loadManualApiState() {
        try {
            const raw = localStorage.getItem(MANUAL_API_STATE_STORAGE_KEY);
            if (!raw) {
                return {};
            }
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== "object") {
                return {};
            }
            return parsed;
        } catch (error) {
            console.warn("[QGA] Не удалось прочитать состояние API ручной чистки из localStorage:", error);
            return {};
        }
    }

    function saveManualApiState(stateObject) {
        try {
            localStorage.setItem(MANUAL_API_STATE_STORAGE_KEY, JSON.stringify(stateObject || {}));
        } catch (error) {
            console.warn("[QGA] Не удалось сохранить состояние API ручной чистки в localStorage:", error);
        }
    }

    function loadRatingIncorrectIdsState() {
        try {
            const raw = localStorage.getItem(RATING_INCORRECT_IDS_STORAGE_KEY);
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === "object" ? parsed : {};
        } catch (error) {
            console.warn("[QGA] Не удалось прочитать рейтинг некорректных ID из localStorage:", error);
            return {};
        }
    }

    function saveRatingIncorrectIdsState(stateObject) {
        try {
            localStorage.setItem(RATING_INCORRECT_IDS_STORAGE_KEY, JSON.stringify(stateObject || {}));
        } catch (error) {
            console.warn("[QGA] Не удалось сохранить рейтинг некорректных ID в localStorage:", error);
        }
    }

    function loadVerifyIncorrectIdsState() {
        try {
            const raw = localStorage.getItem(VERIFY_INCORRECT_IDS_STORAGE_KEY);
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === "object" ? parsed : {};
        } catch (error) {
            console.warn("[QGA] Не удалось прочитать локальные некорректные ID из localStorage:", error);
            return {};
        }
    }

    function saveVerifyIncorrectIdsState(stateObject) {
        try {
            localStorage.setItem(VERIFY_INCORRECT_IDS_STORAGE_KEY, JSON.stringify(stateObject || {}));
        } catch (error) {
            console.warn("[QGA] Не удалось сохранить локальные некорректные ID в localStorage:", error);
        }
    }

    /** Множество ID, помеченных как некорректные (чекбокс + «Проверить страницу») по проекту. */
    function getVerifyIncorrectIdsSetForProject(projectId) {
        const set = new Set();
        if (!projectId) return set;
        const key = String(projectId);
        const arr = Array.isArray(verifyIncorrectIdsState[key]) ? verifyIncorrectIdsState[key] : [];
        arr.forEach((t) => {
            const s = String(t).trim();
            if (s) set.add(s);
        });
        return set;
    }

    /** Собирает ID со строк, где отмечен чекбокс «Некорректный», и сохраняет в локальное хранилище (вызывается перед verifyValues()). */
    function collectVerifyIncorrectIdsAndSave() {
        const projectId = getProjectIdForVerify();
        const gridRoot = document.querySelector("#grid, #gridOpenEnds");
        if (!projectId || !gridRoot || !state.verifyRespondentIndexLoaded) return;
        const rows = gridRoot.querySelectorAll("tr.k-master-row");
        const collected = new Set();
        for (const row of rows) {
            if (!(row instanceof HTMLTableRowElement)) continue;
            const { incorrect } = getVerifyRowIncorrectPostpone(gridRoot, row);
            if (!incorrect) continue;
            const ids = getRespondentIdsForVerifyRow(row);
            ids.forEach((id) => collected.add(String(id).trim()));
        }
        if (collected.size === 0) return;
        const key = String(projectId);
        const existing = Array.isArray(verifyIncorrectIdsState[key]) ? verifyIncorrectIdsState[key] : [];
        const merged = new Set([...existing.map((x) => String(x).trim()), ...collected].filter(Boolean));
        verifyIncorrectIdsState[key] = Array.from(merged);
        saveVerifyIncorrectIdsState(verifyIncorrectIdsState);
        console.info("[QGA] Локально сохранены некорректные ID (Проверить страницу), добавлено:", collected.size, "всего:", merged.size);
    }

    function addManualBfridsForProject(projectId, bfrids) {
        if (!projectId || !Array.isArray(bfrids) || bfrids.length === 0) {
            return;
        }
        const merged = Array.from(getManualBfridsSetForProject(projectId));
        for (const id of bfrids) {
            const normalized = String(id).trim();
            if (normalized) {
                merged.push(normalized);
            }
        }
        const uniq = Array.from(new Set(merged));
        syncManualBfridsStores(projectId, uniq);
    }

    function consumeManualBfridsForProject(projectId) {
        if (!projectId) {
            return [];
        }
        const key = String(projectId);
        const current = Array.isArray(manualBfridsState[key]) ? manualBfridsState[key] : [];
        if (!current.length) {
            return [];
        }
        delete manualBfridsState[key];
        saveManualBfridsState(manualBfridsState);
        return current.map((x) => String(x).trim()).filter(Boolean);
    }

    /** Множество ID респондентов, уже находящихся в ручной чистке по проекту (буфер + сохранённое поле Bfrids). */
    function getManualBfridsSetForProject(projectId) {
        const set = new Set();
        if (!projectId) {
            return set;
        }
        const key = String(projectId);
        const fromBuffer = Array.isArray(manualBfridsState[key]) ? manualBfridsState[key] : [];
        for (const id of fromBuffer) {
            const n = String(id).trim();
            if (n) set.add(n);
        }
        const apiEntry = manualApiState && manualApiState[key];
        const bfridsStr = apiEntry && typeof apiEntry.bfrids === "string" ? apiEntry.bfrids : "";
        if (bfridsStr) {
            const fromApi = bfridsStr.split(/[\s,;]+/).map((x) => String(x).trim()).filter(Boolean);
            for (const id of fromApi) {
                set.add(id);
            }
        }
        return set;
    }

    /** Есть ли сохранённый верификационный токен для ручной чистки по проекту (получен после открытия вкладки «Ручная чистка» и сохранения). */
    function hasVerificationTokenForProject(projectId) {
        if (!projectId) return false;
        const key = String(projectId);
        const entry = manualApiState && manualApiState[key];
        return !!(entry && typeof entry.token === "string" && entry.token.trim() !== "");
    }

    /**
     * Записывает один и тот же список bfrid в оба хранилища (manualBfridsState и manualApiState.bfrids),
     * чтобы кол-во и состав всегда совпадали.
     */
    function syncManualBfridsStores(projectId, bfridsArray) {
        if (!projectId || !Array.isArray(bfridsArray)) {
            return;
        }
        const key = String(projectId);
        const list = bfridsArray.map((x) => String(x).trim()).filter(Boolean);

        manualBfridsState[key] = list.slice();
        saveManualBfridsState(manualBfridsState);

        const prev =
            manualApiState && typeof manualApiState[key] === "object" ? manualApiState[key] : {};
        manualApiState[key] = {
            token: prev.token || "",
            bfrids: list.join("\n")
        };
        saveManualApiState(manualApiState);
    }

    /**
     * Синхронизирует локальное хранилище (manualApiState и manualBfridsState)
     * с текущим содержимым поля ручной чистки (#Bfrids).
     * Вызывается при ручном удалении/изменении айдишек в textarea.
     */
    function syncManualBfridsFromTextarea(projectId) {
        if (!projectId) {
            return;
        }
        const textarea = document.getElementById("Bfrids");
        if (!textarea) {
            return;
        }
        manualApiState = loadManualApiState();
        manualBfridsState = loadManualBfridsState();
        const raw = (textarea.value || "").trim();
        const idsInTextarea = raw
            .split(/[\s,;]+/)
            .map((x) => String(x).trim())
            .filter(Boolean);

        const key = String(projectId);

        const token = findVerificationTokenInDocument(document);
        const prev =
            manualApiState && typeof manualApiState[key] === "object" ? manualApiState[key] : {};
        manualApiState[key] = {
            token: token || prev.token || "",
            bfrids: idsInTextarea.join("\n")
        };
        saveManualApiState(manualApiState);

        manualBfridsState[key] = idsInTextarea.slice();
        saveManualBfridsState(manualBfridsState);
    }

    function attachManualBfridsTextareaSync(projectId) {
        const textarea = document.getElementById("Bfrids");
        if (!textarea || !projectId || textarea.dataset.qgaBfridsSyncAttached === "1") {
            return;
        }
        textarea.dataset.qgaBfridsSyncAttached = "1";
        const sync = () => syncManualBfridsFromTextarea(projectId);
        textarea.addEventListener("input", sync);
        textarea.addEventListener("blur", sync);
        textarea.addEventListener("change", sync);
    }

    function setupManualPageIntegration() {
        const projectId = getProjectIdForVerify();
        if (!projectId) {
            return;
        }

        const attach = () => {
            const button = document.getElementById("btnEditManual");
            if (!button) {
                return;
            }
            if (button.dataset.qgaManualBfridBound === "1") {
                return;
            }
            button.dataset.qgaManualBfridBound = "1";

            button.addEventListener("click", () => {
                // Даём штатной логике editManual() переключить режим и показать textarea,
                // затем подставляем bfrid из буфера.
                setTimeout(() => {
                    try {
                        applyManualBfridsToTextarea(projectId);
                    } catch (error) {
                        console.error("[QGA] Ошибка при применении bfrid к ручной чистке:", error);
                    }
                }, 0);
            });
            attachManualBfridsTextareaSync(projectId);
        };

        attach();

        // Синхронизация в localStorage при нажатии «Сохранить» (отправка формы), даже если пользователь не вводил ничего в поле Bfrids
        if (!document.body.dataset.qgaManualSubmitSyncAttached) {
            document.body.dataset.qgaManualSubmitSyncAttached = "1";
            document.body.addEventListener("submit", (e) => {
                const form = e.target;
                if (!form || form.tagName !== "FORM") return;
                const textarea = form.querySelector("#Bfrids");
                if (!textarea) return;
                const pid = getProjectIdForVerify();
                if (!pid) return;
                syncManualBfridsFromTextarea(pid);
            }, true);
        }

        let manualAttachTimer = null;
        const observer = new MutationObserver(() => {
            clearTimeout(manualAttachTimer);
            manualAttachTimer = setTimeout(attach, 200);
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function applyManualBfridsToTextarea(projectId) {
        const textarea = document.getElementById("Bfrids");
        if (!textarea) {
            return;
        }

        const bfrids = consumeManualBfridsForProject(projectId);
        if (!bfrids.length) {
            return;
        }

        const existingRaw = textarea.value || "";
        const existingSet = new Set(
            existingRaw
                .split(/[\s,;]+/)
                .map((x) => x.trim())
                .filter(Boolean)
        );

        for (const id of bfrids) {
            existingSet.add(String(id).trim());
        }

        const mergedArray = Array.from(existingSet);
        const merged = mergedArray.join("\n");
        textarea.value = merged;

        try {
            const token = findVerificationTokenInDocument(document);
            const key = String(projectId);
            const prev =
                manualApiState && typeof manualApiState[key] === "object" ? manualApiState[key] : {};
            manualApiState[key] = {
                token: token || prev.token || "",
                bfrids: merged
            };
            saveManualApiState(manualApiState);
            manualBfridsState[key] = mergedArray.slice();
            saveManualBfridsState(manualBfridsState);
        } catch (error) {
            console.warn("[QGA] Не удалось сохранить состояние API ручной чистки:", error);
        }
        attachManualBfridsTextareaSync(projectId);
    }

    async function sendManualBfridsToServer(projectId, bfrids) {
        if (!projectId || !Array.isArray(bfrids) || bfrids.length === 0) {
            return;
        }

        const manualUrl = buildManualEditPostUrl(projectId);
        if (!manualUrl) {
            console.warn("[QGA] Не удалось определить URL для ручной чистки.");
            return;
        }

        const key = String(projectId);
        const stored =
            manualApiState && typeof manualApiState[key] === "object" ? manualApiState[key] : null;

        const existingBfridsRaw =
            stored && typeof stored.bfrids === "string" ? stored.bfrids : "";

        let verificationToken =
            (stored && typeof stored.token === "string" ? stored.token : "") ||
            findVerificationTokenInDocument(document);

        if (!verificationToken) {
            console.warn(
                "[QGA] Не удалось найти __RequestVerificationToken для проекта",
                projectId
            );
            alert(
                "Не удалось найти токен для ручной чистки. " +
                    "Откройте вкладку «Ручная чистка» этого проекта хотя бы один раз, " +
                    "а затем попробуйте снова."
            );
            return;
        }

        const mergedSet = new Set(
            existingBfridsRaw
                .split(/[\s,;]+/)
                .map((x) => x.trim())
                .filter(Boolean)
        );

        for (const id of bfrids) {
            const normalized = String(id).trim();
            if (normalized) {
                mergedSet.add(normalized);
            }
        }

        const mergedBfrids = Array.from(mergedSet).join("\n");

        const body = new URLSearchParams();
        body.set("ProjectId", String(projectId));
        body.set("Bfrids", mergedBfrids);
        body.set("__RequestVerificationToken", verificationToken);

        try {
            const response = await fetch(manualUrl, {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                    "X-Requested-With": "XMLHttpRequest"
                },
                body: body.toString()
            });

            if (!response.ok) {
                console.error(
                    "[QGA] Не удалось сохранить данные ручной чистки через API:",
                    response.status,
                    response.statusText
                );
                return;
            }

            try {
                const key = String(projectId);
                const prev =
                    manualApiState && typeof manualApiState[key] === "object"
                        ? manualApiState[key]
                        : {};
                manualApiState[key] = {
                    token: verificationToken || prev.token || "",
                    bfrids: mergedBfrids
                };
                saveManualApiState(manualApiState);
                const mergedArray = mergedBfrids.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
                manualBfridsState[key] = mergedArray;
                saveManualBfridsState(manualBfridsState);
            } catch (updateError) {
                console.warn("[QGA] Не удалось обновить локальный снимок API ручной чистки:", updateError);
            }

            console.info(
                "[QGA] Успешно обновлена ручная чистка через API для проекта",
                projectId,
                "кол-во новых bfrid:",
                bfrids.length
            );
        } catch (error) {
            console.error("[QGA] Ошибка при запросе сохранения ручной чистки:", error);
        }
    }

    function findVerificationTokenInDocument(doc) {
        if (!doc || typeof doc.querySelector !== "function") {
            return "";
        }

        const selectors = [
            "input[name='__RequestVerificationToken']",
            "input[name$='RequestVerificationToken']",
            "input[name*='RequestVerificationToken']"
        ];

        for (const selector of selectors) {
            const input = doc.querySelector(selector);
            if (input && "value" in input && input.value) {
                return String(input.value);
            }
        }

        return "";
    }

    function buildManualEditPostUrl(projectId) {
        if (!projectId) {
            return null;
        }
        const origin = window.location.origin || "";
        const base = origin.replace(/\/+$/, "");
        // POST /api/Project/Manual/{ProjectId} — как в стандартном запросе.
        return base + "/api/Project/Manual/" + encodeURIComponent(String(projectId));
    }

    function buildProjectEditUrl(projectId) {
        if (!projectId) {
            return null;
        }
        const origin = window.location.origin || "";
        const base = origin.replace(/\/+$/, "");
        // Страница редактирования проекта, где есть вкладка «Ручная чистка» и форма с токеном.
        return base + "/lk/Project/Edit/" + encodeURIComponent(String(projectId));
    }

    function parseOpenEndsFromXlsx(arrayBuffer) {
        if (!(arrayBuffer instanceof ArrayBuffer)) {
            return { ok: false, error: "Неверный формат данных при загрузке OpenEnds (ожидался ArrayBuffer)." };
        }

        if (typeof XLSX === "undefined" || typeof XLSX.read !== "function") {
            return {
                ok: false,
                error:
                    "Для разбора файла OpenEnds (XLSX) не найдена библиотека XLSX. " +
                    "Убедитесь, что на страницу подключён XLSX (например, xlsx.full.min.js) и доступен глобальный объект XLSX."
            };
        }

        let workbook = null;
        try {
            workbook = XLSX.read(arrayBuffer, { type: "array" });
        } catch (error) {
            console.error("[QGA] Ошибка XLSX.read при разборе OpenEnds:", error);
            return { ok: false, error: "Не удалось прочитать XLSX-файл OpenEnds (ошибка XLSX.read)." };
        }

        if (!workbook || !Array.isArray(workbook.SheetNames) || workbook.SheetNames.length === 0) {
            return { ok: false, error: "Файл OpenEnds не содержит листов или имеет некорректный формат." };
        }

        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) {
            return { ok: false, error: "Не удалось найти первый лист в файле OpenEnds." };
        }

        let rows;
        try {
            rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });
        } catch (error) {
            console.error("[QGA] Ошибка XLSX.utils.sheet_to_json при разборе OpenEnds:", error);
            return { ok: false, error: "Не удалось преобразовать XLSX в строки (sheet_to_json)." };
        }

        if (!Array.isArray(rows) || rows.length < 2) {
            return { ok: false, error: "Выгрузка OpenEnds пуста или содержит только заголовок." };
        }

        const headerCells = rows[0].map((cell) => String(cell || "").trim());
        const headerNormalized = headerCells.map((cell) => cell.toLowerCase());
        console.info("[QGA] VerifyMain: заголовок OpenEnds XLSX:", headerCells);

        const respondentIndex = headerNormalized.findIndex((name) => {
            return name === "bfrid" || name.includes("respondent") || name.includes("респондент");
        });

        const questionIndex = headerNormalized.findIndex((name) => {
            return (
                name === "имя переменной" ||
                name === "variable" ||
                name.includes("question") ||
                name.includes("qcode") ||
                name.includes("var") ||
                name.includes("variable") ||
                name.includes("вопрос")
            );
        });

        const valueIndex = headerNormalized.findIndex((name) => {
            return (
                name === "значение" ||
                name === "value" ||
                name.includes("text") ||
                name.includes("answer") ||
                name.includes("ответ") ||
                name.includes("openend")
            );
        });

        if (respondentIndex === -1 || questionIndex === -1 || valueIndex === -1) {
            return {
                ok: false,
                error:
                    "Не удалось автоматически определить столбцы респондента/переменной/значения в выгрузке OpenEnds. " +
                    "Проверьте формат файла и, при необходимости, обновите логику парсинга в расширении."
            };
        }

        /** Один openEndId в выгрузке может соответствовать многим респондентам (один и тот же ответ у нескольких человек). */
        const respondentIdsByOpenEndId = new Map();
        const answersByRespondentId = new Map();
        const respondentIdsByQuestionAndValue = new Map();
        const respondentIdsByValueOnly = new Map();

        for (let i = 1; i < rows.length; i += 1) {
            const row = Array.isArray(rows[i]) ? rows[i] : [];
            if (row.length === 0) {
                continue;
            }

            const respondentIdRaw = String(row[respondentIndex] || "").trim();
            if (!respondentIdRaw) {
                continue;
            }

            const respondentId = respondentIdRaw;
            const openEndIdCell = row.find((_, idx) => {
                const name = headerNormalized[idx];
                if (!name) {
                    return false;
                }
                return (
                    name === "id" ||
                    name === "openid" ||
                    name === "openend_id" ||
                    name.includes("openendid") ||
                    (name.endsWith("id") && name.includes("open"))
                );
            });
            const openEndId = openEndIdCell != null ? String(openEndIdCell).trim() || null : null;

            let question = "";
            let value = "";

            if (questionIndex >= 0 && questionIndex < row.length) {
                question = String(row[questionIndex] || "").trim();
            }
            if (valueIndex >= 0 && valueIndex < row.length) {
                value = String(row[valueIndex] || "").trim();
            }

            if (openEndId) {
                if (!respondentIdsByOpenEndId.has(openEndId)) {
                    respondentIdsByOpenEndId.set(openEndId, []);
                }
                respondentIdsByOpenEndId.get(openEndId).push(respondentId);
            }

            // Ключ только по полному коду переменной (Q1_1_other||значение). При сгруппированном вопросе поиск идёт по списку переменных из заголовка.
            if (question && value) {
                const fullKey = buildVerifyQuestionValueKey(question, value);
                if (!respondentIdsByOpenEndId.has(fullKey)) {
                    respondentIdsByOpenEndId.set(fullKey, []);
                }
                const fullArr = respondentIdsByOpenEndId.get(fullKey);
                if (!fullArr.includes(respondentId)) fullArr.push(respondentId);
            }

            if (!answersByRespondentId.has(respondentId)) {
                answersByRespondentId.set(respondentId, []);
            }

            answersByRespondentId.get(respondentId).push({
                openEndId,
                question,
                value
            });

            if (question && value) {
                const fullKey = buildVerifyQuestionValueKey(question, value);
                if (!respondentIdsByQuestionAndValue.has(fullKey)) {
                    respondentIdsByQuestionAndValue.set(fullKey, []);
                }
                respondentIdsByQuestionAndValue.get(fullKey).push(respondentId);
            }

            if (value) {
                const valueKey = buildVerifyValueOnlyKey(value);
                if (!respondentIdsByValueOnly.has(valueKey)) {
                    respondentIdsByValueOnly.set(valueKey, []);
                }
                respondentIdsByValueOnly.get(valueKey).push(respondentId);
            }
        }

        return {
            ok: true,
            respondentIdsByOpenEndId,
            answersByRespondentId,
            respondentIdsByQuestionAndValue,
            respondentIdsByValueOnly
        };
    }

    /**
     * Парсит Excel рейтинга (кнопка «Рейтинг»): колонки Token, ReasonCodes.
     * ReasonCodes может содержать несколько кодов через пробел (например "1 3 6").
     * Возвращает { ok: true, tokenReasonCodes: { [token]: number[] } } или { ok: false, error }.
     */
    function parseRatingXlsx(arrayBuffer) {
        if (!(arrayBuffer instanceof ArrayBuffer)) {
            return { ok: false, error: "Неверный формат данных (ожидался ArrayBuffer)." };
        }
        if (typeof XLSX === "undefined" || typeof XLSX.read !== "function") {
            return { ok: false, error: "Библиотека XLSX недоступна." };
        }
        let workbook;
        try {
            workbook = XLSX.read(arrayBuffer, { type: "array" });
        } catch (error) {
            console.warn("[QGA] Ошибка XLSX.read при разборе рейтинга:", error);
            return { ok: false, error: "Не удалось прочитать XLSX рейтинга." };
        }
        if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
            return { ok: false, error: "Файл рейтинга пуст или некорректен." };
        }
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        if (!sheet) return { ok: false, error: "Лист не найден." };
        let rows;
        try {
            rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });
        } catch (error) {
            return { ok: false, error: "Не удалось преобразовать лист рейтинга в данные." };
        }
        if (!Array.isArray(rows) || rows.length < 2) {
            return { ok: true, tokenReasonCodes: {} };
        }
        const headerCells = rows[0].map((cell) => String(cell || "").trim());
        const headerLower = headerCells.map((h) => h.toLowerCase());
        const tokenCol = headerLower.findIndex((h) => h === "token");
        const reasonCol = headerLower.findIndex((h) => h === "reasoncodes" || h === "reason codes");
        if (tokenCol === -1 || reasonCol === -1) {
            return { ok: false, error: "В рейтинге не найдены колонки Token или ReasonCodes." };
        }
        const tokenReasonCodes = {};
        for (let i = 1; i < rows.length; i += 1) {
            const row = Array.isArray(rows[i]) ? rows[i] : [];
            const reasonRaw = row[reasonCol];
            if (reasonRaw == null || String(reasonRaw).trim() === "") continue;
            const codes = String(reasonRaw).trim().split(/\s+/).map(Number).filter((n) => n > 0 && Number.isFinite(n));
            if (codes.length === 0) continue;
            const token = String(row[tokenCol] || "").trim();
            if (token) tokenReasonCodes[token] = codes;
        }
        return { ok: true, tokenReasonCodes };
    }

    /** Маппинг token → reason codes из рейтинга для проекта. */
    function getRatingReasonCodesForProject(projectId) {
        if (!projectId) return {};
        const key = String(projectId);
        const data = ratingIncorrectIdsState[key];
        if (!data || typeof data !== "object") return {};
        if (Array.isArray(data)) {
            const map = {};
            data.forEach((t) => { const s = String(t).trim(); if (s) map[s] = [1]; });
            return map;
        }
        return data;
    }

    var REASON_CODE_PRIORITY = typeof REASON_CODE_PRIORITY !== "undefined" && REASON_CODE_PRIORITY ? REASON_CODE_PRIORITY : [1, 6, 3, 4, 2];

    var REASON_CODE_ROW_CLASS = typeof REASON_CODE_ROW_CLASS !== "undefined" && REASON_CODE_ROW_CLASS ? REASON_CODE_ROW_CLASS : {
        1: "qga-verify-row-incorrect",
        2: "qga-verify-row-disputed",
        3: "qga-verify-row-duplicate",
        4: "qga-verify-row-speedster",
        6: "qga-verify-row-tech-defect"
    };

    var REASON_CODE_ITEM_CLASS = typeof REASON_CODE_ITEM_CLASS !== "undefined" && REASON_CODE_ITEM_CLASS ? REASON_CODE_ITEM_CLASS : {
        1: "qga-verify-modal__item--incorrect",
        2: "qga-verify-modal__item--disputed",
        3: "qga-verify-modal__item--duplicate",
        4: "qga-verify-modal__item--speedster",
        6: "qga-verify-modal__item--tech-defect"
    };

    var REASON_CODE_MODAL_CLASS = typeof REASON_CODE_MODAL_CLASS !== "undefined" && REASON_CODE_MODAL_CLASS ? REASON_CODE_MODAL_CLASS : {
        1: "qga-verify-modal--row-incorrect",
        2: "qga-verify-modal--row-disputed",
        3: "qga-verify-modal--row-duplicate",
        4: "qga-verify-modal--row-speedster",
        6: "qga-verify-modal--tech-defect"
    };

    var ALL_ROW_REASON_CLASSES =
        typeof ALL_ROW_REASON_CLASSES !== "undefined" && ALL_ROW_REASON_CLASSES ? ALL_ROW_REASON_CLASSES : Object.values(REASON_CODE_ROW_CLASS);
    var ALL_MODAL_REASON_CLASSES =
        typeof ALL_MODAL_REASON_CLASSES !== "undefined" && ALL_MODAL_REASON_CLASSES ? ALL_MODAL_REASON_CLASSES : Object.values(REASON_CODE_MODAL_CLASS);
    var ALL_ITEM_REASON_CLASSES =
        typeof ALL_ITEM_REASON_CLASSES !== "undefined" && ALL_ITEM_REASON_CLASSES ? ALL_ITEM_REASON_CLASSES : Object.values(REASON_CODE_ITEM_CLASS);

    /**
     * Определяет приоритетный ReasonCode для респондента.
     * Приоритет: 1 (некорректный) > 6 (тех. брак) > 3 (одинаковые) > 4 (спидстер) > 2 (спорный).
     * Возвращает номер кода или 0, если кодов нет.
     */
    function getTopReasonCode(reasonCodes) {
        if (!reasonCodes || !Array.isArray(reasonCodes) || reasonCodes.length === 0) return 0;
        for (const code of REASON_CODE_PRIORITY) {
            if (reasonCodes.includes(code)) return code;
        }
        return reasonCodes[0] || 0;
    }

    /**
     * Определяет приоритетный ReasonCode для респондента по всем источникам.
     * Учитывает: локальную пометку (код 1), рейтинг, технический брак (код 6).
     */
    function getRespondentAllReasonCodes(respondentId, verifyIncorrectSet, ratingReasonMap, manualSet) {
        const id = String(respondentId).trim();
        const codes = [];
        if (verifyIncorrectSet && verifyIncorrectSet.has(id)) codes.push(1);
        if (ratingReasonMap && ratingReasonMap[id]) {
            codes.push(...ratingReasonMap[id]);
        }
        if (manualSet && manualSet.has(id)) codes.push(6);
        return [...new Set(codes)];
    }

    function getRespondentTopReasonCode(respondentId, projectId, verifyIncorrectSet, ratingReasonMap, manualSet) {
        const codes = getRespondentAllReasonCodes(respondentId, verifyIncorrectSet, ratingReasonMap, manualSet);
        return getTopReasonCode(codes);
    }

    /** Загружает Excel рейтинга по projectId (URL: /lk/Project/Ratings/{id}), парсит все ReasonCodes. */
    async function ensureRatingIncorrectIdsLoaded(projectId) {
        if (!projectId) return false;
        const key = String(projectId);
        const url = `/lk/Project/Ratings/${encodeURIComponent(key)}`;
        const referrerUrl = `${window.location.origin}/lk/Project/Edit/${encodeURIComponent(key)}`;
        const acceptHeader = "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7";
        try {
            const response = await fetch(url, {
                credentials: "include",
                referrer: referrerUrl,
                referrerPolicy: "unsafe-url",
                headers: {
                    Accept: acceptHeader
                }
            });
            if (!response.ok) {
                console.warn("[QGA] Рейтинг: ответ сервера", response.status, response.statusText);
                return false;
            }
            const buffer = await response.arrayBuffer();
            const parsed = parseRatingXlsx(buffer);
            if (!parsed.ok) {
                console.warn("[QGA] Рейтинг: не удалось разобрать файл", parsed.error);
                return false;
            }
            ratingIncorrectIdsState[key] = parsed.tokenReasonCodes || {};
            saveRatingIncorrectIdsState(ratingIncorrectIdsState);
            const count = Object.keys(parsed.tokenReasonCodes || {}).length;
            console.info("[QGA] Рейтинг: загружены ID с ReasonCodes, кол-во:", count);
            return true;
        } catch (e) {
            console.warn("[QGA] Рейтинг: ошибка загрузки", e);
            return false;
        }
    }

    function buildVerifyQuestionValueKey(questionCode, valueText) {
        const q = String(questionCode || "").trim();
        const v = String(valueText || "")
            .replace(/\s+/g, " ")
            .trim();
        return `${q}||${v}`;
    }

    function buildVerifyValueOnlyKey(valueText) {
        return String(valueText || "")
            .replace(/\s+/g, " ")
            .trim();
    }

    function getVerifyCodesForContext(context) {
        if (context && Array.isArray(context.variableCodes) && context.variableCodes.length > 0) {
            const directCodes = context.variableCodes
                .map((code) => String(code || "").trim())
                .filter(Boolean);
            if (directCodes.length > 1) {
                return directCodes;
            }
            if (directCodes.length === 1) {
                const groupedCodes = getVerifyGroupedVariableCodes(directCodes[0]);
                if (groupedCodes.length > 1) {
                    return groupedCodes.map((code) => String(code || "").trim()).filter(Boolean);
                }
            }
            return directCodes;
        }
        const questionCode = getVerifyQuestionCode();
        if (!questionCode) return [];
        const groupedCodes = getVerifyGroupedVariableCodes(questionCode);
        if (groupedCodes.length > 1) {
            return groupedCodes.map((code) => String(code || "").trim()).filter(Boolean);
        }
        const baseCode = getVerifyQuestionBaseCode(questionCode);
        return baseCode ? [String(baseCode).trim()] : [];
    }

    function getVerifyQuestionCodeVariants(questionCode) {
        const code = String(questionCode || "").trim();
        if (!code) return [];
        const variants = new Set([code]);
        variants.add(code.replace(/\.(?=\d)/g, "_"));
        variants.add(code.replace(/_(?=\d)/g, "."));
        return Array.from(variants).filter(Boolean);
    }

    function parseVerifyVariableCodes(text) {
        const parts = String(text || "")
            .split(/[;\n]+/)
            .map((s) => s.trim())
            .filter(Boolean);
        const codes = [];
        for (const part of parts) {
            // Поддерживаем переменные, начинающиеся не только с Q,
            // а с любой буквы (A-Z), далее цифры/буквы/._ и опциональный суффикс _other.
            const m = part.match(/^([A-Za-z]+[0-9A-Za-z_.]*(_other)?)/);
            if (!m || !m[1]) continue;
            const normalized = String(m[1]).trim();
            if (normalized) codes.push(normalized);
        }
        return Array.from(new Set(codes));
    }

    /** Список переменных группы для questionCode. Сначала из данных, собранных на странице Project Edit #openEnds (ключ — ID из URL Edit); иначе из заголовка на странице проверки. */
    function getVerifyGroupedVariableCodes(questionCode) {
        const code = String(questionCode || "").trim();
        const projectKey = getProjectIdForGroupsLookup();
        if (projectKey && code) {
            const all = loadOpenEndsGroups();
            const projectGroups = all[projectKey];
            if (projectGroups) {
                for (const variant of getVerifyQuestionCodeVariants(code)) {
                    if (
                        projectGroups[variant] &&
                        Array.isArray(projectGroups[variant]) &&
                        projectGroups[variant].length > 1
                    ) {
                        return Array.from(new Set(projectGroups[variant]));
                    }
                }
            }
        }
        const questionElement = getVerifyQuestionElement();
        const text = questionElement && questionElement.textContent ? questionElement.textContent : "";
        const variableCodes = parseVerifyVariableCodes(text);
        return variableCodes.length > 1 ? variableCodes : [];
    }

    /** Есть ли на странице список переменных через «;» (Q1_1_other; Q1_2_other; …) — тогда вопрос сгруппирован. */
    function isVerifyQuestionGrouped(questionCode) {
        const code = String(questionCode || "").trim();
        if (!code) return false;
        const variableCodes = getVerifyGroupedVariableCodes(code);
        return variableCodes.length > 1 && variableCodes.includes(code);
    }

    /** Код вопроса для ключа: если не сгруппирован — целиком (Q1_3_other, Q13.1); при сгруппированном поиск идёт по списку переменных из заголовка. */
    function getVerifyQuestionBaseCode(questionCode) {
        return String(questionCode || "").trim();
    }

    function getVerifyQuestionCode() {
        if (typeof state.verifyQuestionCode === "string" && state.verifyQuestionCode) {
            return state.verifyQuestionCode;
        }

        let candidate = "";
        const questionElement = getVerifyQuestionElement();
        const questionText = questionElement && questionElement.textContent ? questionElement.textContent : "";
        const parsedCodes = parseVerifyVariableCodes(questionText);
        if (parsedCodes.length > 0) {
            candidate = parsedCodes[0];
        }

        const sources = [];
        if (questionText) {
            sources.push(questionText);
        }
        const titleNode = document.querySelector("body");
        if (titleNode && titleNode.textContent) {
            sources.push(titleNode.textContent);
        }

        if (!candidate) {
            const combined = sources.join("\n");
            // Код вопроса также может начинаться не только с Q.
            const match = combined.match(/([A-Za-z][0-9A-Za-z_.]*(?:_other)?)/);
            if (match && match[1]) {
                candidate = match[1];
            }
        }

        state.verifyQuestionCode = candidate || null;
        return state.verifyQuestionCode;
    }

    function getVerifyQuestionElement() {
        return (
            document.querySelector("#divVerifyOpenEnds > div.row > div:nth-child(1) > div") ||
            document.querySelector("#divVerifyOpenEnds .row > div:first-child > div") ||
            document.querySelector("#grid, #gridOpenEnds")?.previousElementSibling ||
            null
        );
    }

    function showVerifyRespondentModal(respondentId, answers, context, rowState) {
        let modal = document.querySelector(".qga-verify-modal");
        if (!modal) {
            modal = document.createElement("aside");
            modal.className = "qga-verify-modal";
            modal.innerHTML = `
                <div class="qga-verify-modal__header">
                    <div class="qga-verify-modal__title"></div>
                    <button type="button" class="qga-verify-modal__close" aria-label="Закрыть">×</button>
                </div>
                <div class="qga-verify-modal__body">
                    <ul class="qga-verify-modal__list"></ul>
                    <div class="qga-verify-modal__footer"></div>
                </div>
            `;

            const closeButton = modal.querySelector(".qga-verify-modal__close");
            if (closeButton) {
                closeButton.addEventListener("click", () => {
                    modal.style.display = "none";
                });
            }

            document.addEventListener("click", function closeOnClickOutside(e) {
                if (modal.style.display !== "flex") return;
                if (modal.contains(e.target)) return;
                modal.style.display = "none";
            });

            document.documentElement.appendChild(modal);

            const bodyEl = modal.querySelector(".qga-verify-modal__body");
            if (bodyEl) {
                const scrollbarZone = 20;
                bodyEl.addEventListener("mousemove", (e) => {
                    const rect = bodyEl.getBoundingClientRect();
                    const isNearScrollbar = (rect.right - e.clientX) <= scrollbarZone;
                    bodyEl.classList.toggle("qga-verify-modal__body--scrollbar-hover", isNearScrollbar);
                });
                bodyEl.addEventListener("mouseleave", () => {
                    bodyEl.classList.remove("qga-verify-modal__body--scrollbar-hover");
                });
            }
        }

        const titleNode = modal.querySelector(".qga-verify-modal__title");
        const listNode = modal.querySelector(".qga-verify-modal__list");

        let footerNode = modal.querySelector(".qga-verify-modal__footer");
        if (!footerNode) {
            const bodyNode = modal.querySelector(".qga-verify-modal__body");
            footerNode = document.createElement("div");
            footerNode.className = "qga-verify-modal__footer";
            if (bodyNode && bodyNode.appendChild) {
                bodyNode.appendChild(footerNode);
            }
        }

        if (titleNode) {
            titleNode.textContent = String(respondentId);
        }

        const respondentIdStr = String(respondentId).trim();
        const projectIdForModal = getProjectIdForVerify();
        const verifyIncorrectSetForModal = projectIdForModal ? getVerifyIncorrectIdsSetForProject(projectIdForModal) : new Set();
        const ratingReasonMapForModal = projectIdForModal ? getRatingReasonCodesForProject(projectIdForModal) : {};
        const manualSetForModal = projectIdForModal ? getManualBfridsSetForProject(projectIdForModal) : new Set();
        const allCodesForModal = getRespondentAllReasonCodes(respondentIdStr, verifyIncorrectSetForModal, ratingReasonMapForModal, manualSetForModal);
        const topReasonCode = getTopReasonCode(allCodesForModal);
        const isIncorrectFromRating = topReasonCode > 0;

        const MODAL_BG_COLOR = {
            1: "#fee2e2",
            2: "#f3e8ff",
            3: "#dbeafe",
            4: "#ffedd5",
            6: "#fef9c3"
        };

        ALL_MODAL_REASON_CLASSES.forEach((cls) => modal.classList.remove(cls));
        const bodyEl = modal.querySelector(".qga-verify-modal__body");
        const footerEl = modal.querySelector(".qga-verify-modal__footer");
        if (bodyEl) bodyEl.style.removeProperty("background");
        if (footerEl) footerEl.style.removeProperty("background");

        if (allCodesForModal.length > 1) {
            const colors = allCodesForModal.map((c) => MODAL_BG_COLOR[c]).filter(Boolean);
            if (colors.length > 1) {
                const gradient = "linear-gradient(to right, " + colors.join(", ") + ")";
                if (bodyEl) bodyEl.style.background = gradient;
                if (footerEl) footerEl.style.background = gradient;
            }
        } else {
            const modalReasonClass = REASON_CODE_MODAL_CLASS[topReasonCode];
            if (modalReasonClass) {
                modal.classList.add(modalReasonClass);
            }
        }

        if (listNode) {
            listNode.innerHTML = "";

            if (!answers || answers.length === 0) {
                const empty = document.createElement("li");
                empty.className = "qga-verify-modal__item";
                empty.textContent = "Другие ответы этого респондента в выгрузке не найдены.";
                listNode.appendChild(empty);
            } else {
                for (const answer of answers) {
                    const item = document.createElement("li");
                    item.className = "qga-verify-modal__item";

                    const q = document.createElement("div");
                    q.className = "qga-verify-modal__q";
                    q.textContent = answer.question || `OpenEnd Id: ${answer.openEndId}`;

                    const text = document.createElement("div");
                    text.className = "qga-verify-modal__text";
                    text.textContent = answer.value || "";

                    item.appendChild(q);
                    item.appendChild(text);
                    listNode.appendChild(item);
                }
            }
        }

        manualBfridsState = loadManualBfridsState();
        manualApiState = loadManualApiState();
        const alreadyInManualSet = getManualBfridsSetForProject(projectIdForModal);
        const isAlreadyInManual = alreadyInManualSet.has(respondentIdStr);
        const hasManualToken = hasVerificationTokenForProject(projectIdForModal);

        modal.classList.remove("qga-verify-modal--candidates");
        if (isAlreadyInManual) {
            modal.classList.add("qga-verify-modal--tech-defect");
        } else {
            modal.classList.remove("qga-verify-modal--tech-defect");
        }

        if (footerNode) {
            footerNode.innerHTML = "";
            const manualCheckbox = document.createElement("input");
            manualCheckbox.type = "checkbox";
            manualCheckbox.className = "qga-verify-modal-manual-checkbox";
            manualCheckbox.title = isAlreadyInManual
                ? "Уже в ручной чистке"
                : "Добавить в ручную чистку (по нажатию «Проверить страницу»)";
            manualCheckbox.dataset.respondentId = respondentIdStr;
            manualCheckbox.checked = isAlreadyInManual || state.verifyPendingManualBfrids.has(respondentIdStr);
            manualCheckbox.disabled = isAlreadyInManual || isIncorrectFromRating || !hasManualToken;
            if (!isAlreadyInManual && !isIncorrectFromRating && hasManualToken) {
                manualCheckbox.addEventListener("change", () => {
                    const id = manualCheckbox.dataset.respondentId;
                    if (!id) return;
                    if (manualCheckbox.checked) {
                        state.verifyPendingManualBfrids.add(id);
                    } else {
                        state.verifyPendingManualBfrids.delete(id);
                    }
                    updateVerifyMainManualCounter();
                });
            }
            const manualLabel = document.createElement("label");
            manualLabel.className = "qga-verify-modal__footer-label";
            manualLabel.appendChild(manualCheckbox);
            manualLabel.appendChild(document.createTextNode(" В ручную чистку"));
            footerNode.appendChild(manualLabel);
            if (!hasManualToken) {
                const manualHint = document.createElement("div");
                manualHint.className = "qga-verify-modal__manual-hint";
                manualHint.style.marginTop = "6px";
                manualHint.style.fontSize = "12px";
                manualHint.style.color = "#6b7280";
                manualHint.textContent = "Чтобы добавить в ручную чистку, откройте вкладку «Ручная чистка» этого проекта, нажмите «Добавить брак» и сохраните.";
                footerNode.appendChild(manualHint);
            }
        }

        modal.style.display = "flex";
        return context;
    }

    function showVerifyRespondentCandidates(respondentIds, answersMap, context, rowState) {
        let modal = document.querySelector(".qga-verify-modal");
        if (!modal) {
            modal = document.createElement("aside");
            modal.className = "qga-verify-modal";
            modal.innerHTML = `
                <div class="qga-verify-modal__header">
                    <div class="qga-verify-modal__title"></div>
                    <button type="button" class="qga-verify-modal__close" aria-label="Закрыть">×</button>
                </div>
                <div class="qga-verify-modal__body">
                    <ul class="qga-verify-modal__list"></ul>
                </div>
            `;

            const closeButton = modal.querySelector(".qga-verify-modal__close");
            if (closeButton) {
                closeButton.addEventListener("click", () => {
                    modal.style.display = "none";
                });
            }

            document.addEventListener("click", function closeOnClickOutside(e) {
                if (modal.style.display !== "flex") return;
                if (modal.contains(e.target)) return;
                modal.style.display = "none";
            });

            document.documentElement.appendChild(modal);

            const bodyEl = modal.querySelector(".qga-verify-modal__body");
            if (bodyEl) {
                const scrollbarZone = 20;
                bodyEl.addEventListener("mousemove", (e) => {
                    const rect = bodyEl.getBoundingClientRect();
                    const isNearScrollbar = (rect.right - e.clientX) <= scrollbarZone;
                    bodyEl.classList.toggle("qga-verify-modal__body--scrollbar-hover", isNearScrollbar);
                });
                bodyEl.addEventListener("mouseleave", () => {
                    bodyEl.classList.remove("qga-verify-modal__body--scrollbar-hover");
                });
            }
        }

        const projectIdCandidates = getProjectIdForVerify();
        const verifyIncorrectSetCandidates = projectIdCandidates ? getVerifyIncorrectIdsSetForProject(projectIdCandidates) : new Set();
        const ratingReasonMapCandidates = projectIdCandidates ? getRatingReasonCodesForProject(projectIdCandidates) : {};

        ALL_MODAL_REASON_CLASSES.forEach((cls) => modal.classList.remove(cls));
        modal.classList.add("qga-verify-modal--candidates");

        const titleNode = modal.querySelector(".qga-verify-modal__title");
        const bodyNode = modal.querySelector(".qga-verify-modal__body");
        if (bodyNode) {
            bodyNode.innerHTML = "<ul class=\"qga-verify-modal__list\"></ul>";
        }
        const listNode = modal.querySelector(".qga-verify-modal__list");

        if (titleNode) {
            titleNode.textContent = "Респонденты с данным ответом";
        }

        if (listNode) {
            manualBfridsState = loadManualBfridsState();
            manualApiState = loadManualApiState();
            const alreadyInManualSet = getManualBfridsSetForProject(projectIdCandidates);
            const hasManualTokenCandidates = hasVerificationTokenForProject(projectIdCandidates);

            if (!hasManualTokenCandidates && bodyNode) {
                const manualHint = document.createElement("div");
                manualHint.className = "qga-verify-modal__manual-hint";
                manualHint.style.padding = "8px 12px";
                manualHint.style.marginBottom = "8px";
                manualHint.style.fontSize = "12px";
                manualHint.style.color = "#6b7280";
                manualHint.style.background = "#f3f4f6";
                manualHint.style.borderRadius = "4px";
                manualHint.textContent = "Чтобы добавлять респондентов в ручную чистку, откройте вкладку «Ручная чистка» этого проекта, нажмите «Добавить брак» и сохраните.";
                bodyNode.insertBefore(manualHint, listNode);
            }

            const REASON_CODE_BG_COLOR = {
                1: "#fee2e2",
                2: "#f3e8ff",
                3: "#dbeafe",
                4: "#ffedd5",
                6: "#fef9c3"
            };
            const REASON_CODE_TEXT_COLOR = {
                1: "#b91c1c",
                2: "#6b21a8",
                3: "#1e40af",
                4: "#9a3412",
                6: "#854d0e"
            };

            const CANDIDATE_ICON_CONFIG = {
                1: { url: chrome.runtime.getURL("icons/inc.png"), alt: "Некорректный ответ" },
                4: { url: chrome.runtime.getURL("icons/speed.png"), alt: "Спидстер" },
                6: { url: chrome.runtime.getURL("icons/manual.png"), alt: "Ручная чистка" }
            };

            for (const respondentId of respondentIds) {
                const answers =
                    answersMap.get(String(respondentId)) ||
                    answersMap.get(String(respondentId).trim()) ||
                    [];

                const respondentIdStr = String(respondentId).trim();
                const isAlreadyInManual = alreadyInManualSet.has(respondentIdStr);
                const candidateAllCodes = getRespondentAllReasonCodes(respondentIdStr, verifyIncorrectSetCandidates, ratingReasonMapCandidates, alreadyInManualSet);
                const candidateTopCode = getTopReasonCode(candidateAllCodes);
                const isIncorrectFromRating = candidateTopCode > 0;

                const headerItem = document.createElement("li");
                headerItem.className = "qga-verify-modal__item";

                if (candidateAllCodes.length > 1) {
                    const colors = candidateAllCodes.map((c) => REASON_CODE_BG_COLOR[c]).filter(Boolean);
                    if (colors.length > 1) {
                        const gradient = "linear-gradient(to right, " + colors.join(", ") + ")";
                        headerItem.style.background = gradient;
                    }
                } else {
                    const itemReasonClass = REASON_CODE_ITEM_CLASS[candidateTopCode];
                    if (itemReasonClass) {
                        headerItem.classList.add(itemReasonClass);
                    }
                }

                const header = document.createElement("div");
                header.className = "qga-verify-modal__q qga-verify-modal__respondent-header";
                header.style.display = "flex";
                header.style.alignItems = "center";
                header.style.gap = "8px";
                header.style.flexWrap = "wrap";

                if (candidateAllCodes.length > 1) {
                    header.style.background = "transparent";
                    const textColor = REASON_CODE_TEXT_COLOR[candidateTopCode];
                    if (textColor) header.style.color = textColor;
                }

                const manualCheckbox = document.createElement("input");
                manualCheckbox.type = "checkbox";
                manualCheckbox.className = "qga-verify-modal-manual-checkbox";
                manualCheckbox.title = isAlreadyInManual
                    ? "Уже в ручной чистке"
                    : "Добавить в ручную чистку (по нажатию «Проверить страницу»)";
                manualCheckbox.dataset.respondentId = respondentIdStr;
                manualCheckbox.checked = isAlreadyInManual || state.verifyPendingManualBfrids.has(respondentIdStr);
                manualCheckbox.disabled = isAlreadyInManual || isIncorrectFromRating || !hasManualTokenCandidates;
                if (!isAlreadyInManual && !isIncorrectFromRating && hasManualTokenCandidates) {
                    manualCheckbox.addEventListener("change", () => {
                        const id = manualCheckbox.dataset.respondentId;
                        if (!id) return;
                        if (manualCheckbox.checked) {
                            state.verifyPendingManualBfrids.add(id);
                        } else {
                            state.verifyPendingManualBfrids.delete(id);
                        }
                        updateVerifyMainManualCounter();
                    });
                }

                const idSpan = document.createElement("span");
                idSpan.textContent = `${respondentId}`;

                header.appendChild(idSpan);

                for (const code of candidateAllCodes) {
                    const iconCfg = CANDIDATE_ICON_CONFIG[code];
                    if (iconCfg) {
                        const icon = document.createElement("img");
                        icon.src = iconCfg.url;
                        icon.alt = iconCfg.alt;
                        icon.title = iconCfg.alt;
                        icon.style.width = "16px";
                        icon.style.height = "16px";
                        icon.style.verticalAlign = "middle";
                        header.appendChild(icon);
                    }
                }

                headerItem.appendChild(header);

                if (!answers || answers.length === 0) {
                    const empty = document.createElement("div");
                    empty.className = "qga-verify-modal__text";
                    empty.textContent = "Другие ответы этого респондента в выгрузке не найдены.";
                    headerItem.appendChild(empty);
                } else {
                    for (const answer of answers) {
                        const q = document.createElement("div");
                        q.className = "qga-verify-modal__q";
                        q.textContent = answer.question || `OpenEnd Id: ${answer.openEndId}`;

                        const text = document.createElement("div");
                        text.className = "qga-verify-modal__text";
                        text.textContent = answer.value || "";

                        headerItem.appendChild(q);
                        headerItem.appendChild(text);
                    }
                }

                const manualRow = document.createElement("div");
                manualRow.className = "qga-verify-modal__manual-row";
                manualRow.style.marginTop = "8px";
                manualRow.style.paddingTop = "8px";
                manualRow.style.borderTop = "1px solid #e5e7eb";
                manualRow.style.display = "flex";
                manualRow.style.alignItems = "center";
                manualRow.style.gap = "6px";
                manualRow.appendChild(manualCheckbox);
                manualRow.appendChild(document.createTextNode("В ручную чистку"));
                headerItem.appendChild(manualRow);

                listNode.appendChild(headerItem);
            }
        }

        modal.style.display = "flex";
        return context;
    }

    function decorateVerifyRows(gridRoot) {
        const headerRow = gridRoot.querySelector(".k-grid-header thead tr[role='row']");
        if (headerRow) {
            const headerCells = headerRow.querySelectorAll("th[role='columnheader']");
            const lastHeaderCell =
                headerCells[headerCells.length - 1] || headerRow.querySelector("th:last-child");

            if (!headerRow.querySelector(".qga-resp-header")) {
                const respHeader = document.createElement("th");
                respHeader.scope = "col";
                respHeader.role = "columnheader";
                respHeader.className = "k-header qga-resp-header";
                respHeader.style.textAlign = "center";
                respHeader.textContent = "Другие ответы";

                headerRow.appendChild(respHeader);
            }

            // Обновляем colgroup: добавляем колонку «Другие ответы» и сужаем «Отложить».
            const updateColgroup = (root) => {
                const colgroup = root ? root.querySelector("colgroup") : null;
                if (!colgroup) {
                    return;
                }
                if (colgroup.querySelector("col.qga-resp-col")) {
                    return;
                }
                const cols = colgroup.querySelectorAll("col");
                if (!cols.length) {
                    return;
                }
                const lastCol = cols[cols.length - 1];

                const respCol = document.createElement("col");
                respCol.className = "qga-resp-col";
                respCol.style.width = "170px";
                colgroup.appendChild(respCol);

                lastCol.style.width = "110px";
            };

            const headerWrap = gridRoot.querySelector(".k-grid-header-wrap");
            const contentWrap = gridRoot.querySelector(".k-grid-content");
            updateColgroup(headerWrap);
            updateColgroup(contentWrap);
        }

        const rows = gridRoot.querySelectorAll("tr.k-master-row");
        for (const row of rows) {
            if (!(row instanceof HTMLTableRowElement)) {
                continue;
            }

            const cells = row.querySelectorAll("td[role='gridcell']");
            const lastCell =
                cells[cells.length - 1] ||
                row.querySelector("td:last-child") ||
                (row.lastElementChild instanceof HTMLTableCellElement ? row.lastElementChild : null);
            if (!lastCell) {
                continue;
            }

            // Добавляем колонку "Другие ответы" (кнопка «Посмотреть»).
            if (!row.querySelector("td.qga-resp-cell")) {
                const respCell = document.createElement("td");
                respCell.className = "qga-resp-cell qga-verify-cell";
                respCell.setAttribute("role", "gridcell");
                respCell.style.textAlign = "center";
                respCell.style.verticalAlign = "middle";
                respCell.style.padding = "0";

                const wrap = document.createElement("div");
                wrap.className = "qga-verify-cell-wrap";
                wrap.style.display = "flex";
                wrap.style.alignItems = "center";
                wrap.style.justifyContent = "center";
                wrap.style.width = "100%";
                wrap.style.height = "100%";

                const button = document.createElement("button");
                button.type = "button";
                button.className = "qga-verify-show-respondent";
                button.textContent = "Посмотреть";

                wrap.appendChild(button);
                respCell.appendChild(wrap);

                const afterLast = lastCell.nextSibling;
                row.insertBefore(respCell, afterLast || null);
            }

            setupVerifyRowExclusiveCheckboxes(gridRoot, row);
        }
        applyVerifyRowVisibility(gridRoot);
    }

    function setupVerifyRowExclusiveCheckboxes(gridRoot, row) {
        if (!gridRoot || !row || !(row instanceof HTMLTableRowElement)) {
            return;
        }
        if (row.dataset.qgaExclusiveCheckboxesBound === "1") {
            return;
        }
        row.dataset.qgaExclusiveCheckboxesBound = "1";

        const headerRow = gridRoot.querySelector(".k-grid-header thead tr[role='row']");
        const headerCells = headerRow
            ? headerRow.querySelectorAll("th[role='columnheader']")
            : null;

        let incorrectIndex = -1;
        let postponeIndex = -1;

        if (headerCells && headerCells.length) {
            for (let i = 0; i < headerCells.length; i += 1) {
                const text = (headerCells[i].textContent || "").trim().toLowerCase();
                if (incorrectIndex === -1 && text.includes("некоррект")) {
                    incorrectIndex = i;
                }
                if (postponeIndex === -1 && text.includes("отлож")) {
                    postponeIndex = i;
                }
            }
        }

        const cells = row.querySelectorAll("td[role='gridcell']");
        if (!cells.length) {
            return;
        }

        const incorrectCell =
            incorrectIndex >= 0 && incorrectIndex < cells.length ? cells[incorrectIndex] : null;
        const incorrectCheckbox = incorrectCell
            ? incorrectCell.querySelector("input[type='checkbox']")
            : null;

        const postponeCell =
            postponeIndex >= 0 && postponeIndex < cells.length ? cells[postponeIndex] : null;
        const postponeCheckbox = postponeCell
            ? postponeCell.querySelector("input[type='checkbox']")
            : null;

        const group = [incorrectCheckbox, postponeCheckbox].filter(
            (cb) => cb instanceof HTMLInputElement
        );
        if (group.length <= 1) {
            return;
        }

        const handleChange = (changed) => {
            if (!(changed instanceof HTMLInputElement)) {
                return;
            }
            const isChecked = !!changed.checked;
            if (!isChecked) {
                return;
            }
            for (const cb of group) {
                if (cb === changed) {
                    continue;
                }
                if (!(cb instanceof HTMLInputElement)) {
                    continue;
                }
                if (!cb.checked) {
                    continue;
                }
                cb.checked = false;
                cb.dispatchEvent(
                    new Event("change", {
                        bubbles: true
                    })
                );
            }
        };

        for (const cb of group) {
            if (!(cb instanceof HTMLInputElement)) {
                continue;
            }
            cb.addEventListener("change", () => handleChange(cb));
        }
    }

