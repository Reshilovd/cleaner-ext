"use strict";

    var verifyHeaderIndexesCache =
        typeof verifyHeaderIndexesCache !== "undefined" && verifyHeaderIndexesCache
            ? verifyHeaderIndexesCache
            : new WeakMap();

    function getVerifyHeaderIndexes(gridRoot) {
        const fallback = { incorrectIndex: -1, postponeIndex: -1 };
        if (!gridRoot || !(gridRoot instanceof HTMLElement)) {
            return fallback;
        }

        const headerRow = gridRoot.querySelector(".k-grid-header thead tr[role='row']");
        if (!headerRow) {
            return fallback;
        }

        const headerCells = headerRow.querySelectorAll("th[role='columnheader']");
        if (!headerCells || !headerCells.length) {
            return fallback;
        }

        const headerSignature = Array.from(headerCells)
            .map((cell) => String(cell.textContent || "").trim().toLowerCase())
            .join("|");

        const cached = verifyHeaderIndexesCache.get(gridRoot);
        if (cached && cached.signature === headerSignature) {
            return cached.indexes;
        }

        let incorrectIndex = -1;
        let postponeIndex = -1;
        for (let i = 0; i < headerCells.length; i += 1) {
            const text = String(headerCells[i].textContent || "").trim().toLowerCase();
            if (!text) {
                continue;
            }
            if (incorrectIndex === -1 && text.includes("некоррект")) {
                incorrectIndex = i;
            }
            if (postponeIndex === -1 && text.includes("отлож")) {
                postponeIndex = i;
            }
        }

        const indexes = { incorrectIndex, postponeIndex };
        verifyHeaderIndexesCache.set(gridRoot, { signature: headerSignature, indexes });
        return indexes;
    }

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

    function getVerifyRespondentIdsLookupCache() {
        if (!(state.verifyRespondentIdsLookupCache instanceof Map)) {
            state.verifyRespondentIdsLookupCache = new Map();
        }
        return state.verifyRespondentIdsLookupCache;
    }

    function buildVerifyRespondentLookupCacheKey(context) {
        if (!context || (!context.openEndId && !context.valueText)) {
            return null;
        }

        const projectKey = String(getProjectIdForVerify() || "").trim();
        const openEndId = String(context.openEndId || "").trim();
        const valueKey = buildVerifyValueOnlyKey(context.valueText || "");
        const codes = getVerifyCodesForContext(context)
            .map((code) => String(code || "").trim())
            .filter(Boolean)
            .sort();

        return [projectKey, openEndId, valueKey, codes.join(";")].join("||");
    }

    /** Возвращает { incorrect, postpone } по чекбоксам строки. */
    function getVerifyRowIncorrectPostpone(gridRoot, row) {
        const out = { incorrect: false, postpone: false };
        if (!gridRoot || !row || !(row instanceof HTMLTableRowElement)) return out;
        const { incorrectIndex, postponeIndex } = getVerifyHeaderIndexes(gridRoot);
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
        const cacheKey = buildVerifyRespondentLookupCacheKey(context);
        const lookupCache = getVerifyRespondentIdsLookupCache();
        if (cacheKey && lookupCache.has(cacheKey)) {
            return lookupCache.get(cacheKey).slice();
        }
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
        const uniqueIds = Array.from(new Set(respondentIds.map((id) => String(id))));
        if (cacheKey) {
            lookupCache.set(cacheKey, uniqueIds);
        }
        return uniqueIds.slice();
    }

    /** Возвращает массив respondent IDs для строки (читает контекст из DOM строки). */
    function getRespondentIdsForVerifyRow(row) {
        const context = resolveVerifyRowContext(row);
        return getRespondentIdsForContext(context);
    }
