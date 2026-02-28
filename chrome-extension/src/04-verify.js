    function resolveVerifyRowContext(row) {
        let openEndId = null;
        let valueText = "";

        try {
            if (window.jQuery) {
                const $ = window.jQuery;
                const $row = $(row);
                const gridInstance =
                    $row.closest("[data-role='grid']").data("kendoGrid") ||
                    $("#grid").data("kendoGrid") ||
                    $("#gridOpenEnds").data("kendoGrid") ||
                    null;
                if (gridInstance && typeof gridInstance.dataItem === "function") {
                    const item = gridInstance.dataItem($row);
                    if (item) {
                        if (item.Value != null) {
                            valueText = String(item.Value);
                        }
                        if (item.Id != null || item.id != null) {
                            openEndId = item.Id != null ? item.Id : item.id;
                        } else {
                            // Попробуем найти подходящее поле Id эвристически.
                            const candidateKeys = Object.keys(item);
                            let bestKey = null;
                            for (const key of candidateKeys) {
                                const lower = key.toLowerCase();
                                if (
                                    lower === "id" ||
                                    lower === "openendid" ||
                                    lower === "openend_id" ||
                                    (lower.endsWith("id") && lower.includes("open"))
                                ) {
                                    bestKey = key;
                                    break;
                                }
                            }
                            if (!bestKey) {
                                for (const key of candidateKeys) {
                                    const lower = key.toLowerCase();
                                    if (lower.endsWith("id")) {
                                        bestKey = key;
                                        break;
                                    }
                                }
                            }
                            if (bestKey && item[bestKey] != null) {
                                openEndId = item[bestKey];
                            } else {
                                console.warn("[QGA] VerifyMain: не найдено подходящее поле Id в dataItem строки:", item);
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.warn("[QGA] Не удалось получить dataItem из kendoGrid для VerifyMain:", error);
        }

        if (!valueText) {
            const valueCell = row.querySelector("td[role='gridcell']:nth-child(3)");
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
            valueText
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

    /** Возвращает массив respondent IDs для строки по индексу (или пустой массив). */
    function getRespondentIdsForVerifyRow(row) {
        const context = resolveVerifyRowContext(row);
        if (!context || (!context.openEndId && !context.valueText)) return [];
        const respondentIdsByOpenEndId = state.verifyRespondentIdsByOpenEndId;
        const idsByQuestionAndValue = state.verifyRespondentIdsByQuestionAndValue;
        const idsByValueOnly = state.verifyRespondentIdsByValueOnly;
        if (!respondentIdsByOpenEndId && !idsByQuestionAndValue && !idsByValueOnly) return [];
        let respondentIds = [];
        if (respondentIdsByOpenEndId && respondentIdsByOpenEndId.size > 0) {
            if (context.openEndId != null) {
                const key = String(context.openEndId).trim();
                const idsFromMap = respondentIdsByOpenEndId.get(key) || respondentIdsByOpenEndId.get(String(context.openEndId)) || [];
                if (Array.isArray(idsFromMap) && idsFromMap.length > 0) respondentIds = idsFromMap.slice();
            }
            if (respondentIds.length === 0) {
                const questionCode = getVerifyQuestionCode();
                const valueText = context.valueText || "";
                if (questionCode && valueText) {
                    const groupedCodes = getVerifyGroupedVariableCodes(questionCode);
                    if (groupedCodes.length > 1) {
                        const collected = new Set();
                        for (const code of groupedCodes) {
                            const key = buildVerifyQuestionValueKey(code, valueText);
                            const arr = respondentIdsByOpenEndId.get(key) || [];
                            if (Array.isArray(arr)) arr.forEach((id) => collected.add(String(id)));
                        }
                        if (collected.size > 0) respondentIds = Array.from(collected);
                    }
                    const singleCode = getVerifyQuestionBaseCode(questionCode);
                    if (respondentIds.length === 0) {
                        const compositeKey = buildVerifyQuestionValueKey(singleCode, valueText);
                        const fromMap = respondentIdsByOpenEndId.get(compositeKey);
                        if (Array.isArray(fromMap) && fromMap.length > 0) respondentIds = fromMap.slice();
                    }
                    if (respondentIds.length === 0) {
                        const altKey = buildVerifyQuestionValueKey(singleCode.replace(/\./g, "_"), valueText);
                        const fromAlt = respondentIdsByOpenEndId.get(altKey);
                        if (Array.isArray(fromAlt) && fromAlt.length > 0) respondentIds = fromAlt.slice();
                    }
                    if (respondentIds.length === 0) {
                        const altKey2 = buildVerifyQuestionValueKey(singleCode.replace(/_/g, "."), valueText);
                        const fromAlt2 = respondentIdsByOpenEndId.get(altKey2);
                        if (Array.isArray(fromAlt2) && fromAlt2.length > 0) respondentIds = fromAlt2.slice();
                    }
                }
            }
        }
        if (respondentIds.length === 0 && idsByQuestionAndValue) {
            const questionCode = getVerifyQuestionCode();
            const valueText = context.valueText || "";
            if (questionCode && valueText) {
                const singleCode = getVerifyQuestionBaseCode(questionCode);
                const key = buildVerifyQuestionValueKey(singleCode, valueText);
                const fromIndex = idsByQuestionAndValue.get(key);
                if (Array.isArray(fromIndex) && fromIndex.length > 0) respondentIds = fromIndex.slice();
            }
        }
        if (respondentIds.length === 0 && idsByValueOnly && context.valueText) {
            const key = buildVerifyValueOnlyKey(context.valueText);
            const fromIndex = idsByValueOnly.get(key);
            if (Array.isArray(fromIndex) && fromIndex.length > 0) respondentIds = fromIndex.slice();
        }
        return Array.from(new Set(respondentIds.map((id) => String(id))));
    }

    /** Скрывает строки, где N=1 и (ID помечен некорректным локально или в рейтинге, или в ручной чистке). */
    function applyVerifyRowVisibility(gridRoot) {
        if (!gridRoot) return;
        const projectId = getProjectIdForVerify();
        const alreadyInManualSet = projectId ? getManualBfridsSetForProject(projectId) : new Set();
        const verifyIncorrectSet = projectId ? getVerifyIncorrectIdsSetForProject(projectId) : new Set();
        const ratingIncorrectSet = projectId ? getRatingIncorrectIdsSetForProject(projectId) : new Set();
        const rows = gridRoot.querySelectorAll("tr.k-master-row");
        for (const row of rows) {
            if (!(row instanceof HTMLTableRowElement)) continue;
            const n = getVerifyRowN(gridRoot, row);
            if (n !== 1) {
                row.classList.remove("qga-verify-row-hidden");
                continue;
            }
            let shouldHide = false;
            if (state.verifyRespondentIndexLoaded) {
                const ids = getRespondentIdsForVerifyRow(row);
                if (ids.length === 1) {
                    const id = ids[0];
                    shouldHide = verifyIncorrectSet.has(id) || ratingIncorrectSet.has(id) || alreadyInManualSet.has(id);
                }
            }
            if (shouldHide) {
                row.classList.add("qga-verify-row-hidden");
            } else {
                row.classList.remove("qga-verify-row-hidden");
            }
        }
    }

    async function ensureVerifyRespondentIndexLoaded() {
        if (state.verifyRespondentIndexLoaded) {
            return true;
        }

        if (state.verifyRespondentIndexLoading) {
            alert("Идёт загрузка выгрузки OpenEnds, попробуйте ещё раз через несколько секунд.");
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
            const message =
                state.verifyRespondentIndexError ||
                "Не удалось загрузить выгрузку OpenEnds. Подробности в консоли.";
            alert(message);
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
            const parts = text.split(";").map((s) => s.trim()).filter(Boolean);
            const codes = parts
                .map((p) => {
                    const m = p.match(/^(Q[0-9A-Za-z_.]+(_other)?)/);
                    return m ? m[1] : "";
                })
                .filter(Boolean);
            if (codes.length > 1) {
                for (const code of codes) {
                    groupByCode[code] = codes.slice();
                }
            }
        }
        const all = loadOpenEndsGroups();
        all[projectId] = groupByCode;
        saveOpenEndsGroups(all);
    }
