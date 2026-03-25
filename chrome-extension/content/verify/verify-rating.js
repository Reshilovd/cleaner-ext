"use strict";

    function parseOpenEndsFromXlsxSync(arrayBuffer) {
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
    function parseRatingXlsxSync(arrayBuffer) {
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

    var verifyXlsxBackgroundFallbackWarned =
        typeof verifyXlsxBackgroundFallbackWarned !== "undefined" ? verifyXlsxBackgroundFallbackWarned : false;

    function warnVerifyXlsxBackgroundFallback(reason, error) {
        if (verifyXlsxBackgroundFallbackWarned) {
            return;
        }
        verifyXlsxBackgroundFallbackWarned = true;
        if (error) {
            console.warn("[QGA] XLSX background parse unavailable, fallback to main thread:", reason, error);
            return;
        }
        console.warn("[QGA] XLSX background parse unavailable, fallback to main thread:", reason);
    }

    function deserializeVerifyBackgroundParseResult(parserName, result) {
        if (!result || typeof result !== "object") {
            return { ok: false, error: `Background parser returned empty result for ${parserName}.` };
        }

        if (parserName !== "openends") {
            return result;
        }

        return {
            ok: true,
            respondentIdsByOpenEndId: new Map(result.respondentIdsByOpenEndIdEntries || []),
            answersByRespondentId: new Map(result.answersByRespondentIdEntries || []),
            respondentIdsByQuestionAndValue: new Map(result.respondentIdsByQuestionAndValueEntries || []),
            respondentIdsByValueOnly: new Map(result.respondentIdsByValueOnlyEntries || [])
        };
    }

    function serializeVerifyArrayBufferForBackground(arrayBuffer) {
        return new Promise((resolve, reject) => {
            if (!(arrayBuffer instanceof ArrayBuffer)) {
                reject(new Error("Неверный формат данных (ожидался ArrayBuffer)."));
                return;
            }

            if (typeof Blob === "undefined" || typeof FileReader === "undefined") {
                reject(new Error("Blob/FileReader is unavailable."));
                return;
            }

            const reader = new FileReader();
            reader.onload = () => {
                if (typeof reader.result === "string" && reader.result) {
                    resolve(reader.result);
                    return;
                }
                reject(new Error("FileReader returned empty payload."));
            };
            reader.onerror = () => {
                reject(reader.error || new Error("FileReader failed to serialize XLSX payload."));
            };

            reader.readAsDataURL(
                new Blob([arrayBuffer], {
                    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                })
            );
        });
    }

    async function requestVerifyXlsxBackgroundParse(parserName, arrayBuffer) {
        if (
            typeof chrome === "undefined" ||
            !chrome.runtime ||
            typeof chrome.runtime.sendMessage !== "function"
        ) {
            return { ok: false, error: "chrome.runtime.sendMessage is unavailable." };
        }

        let dataUrl = "";
        try {
            dataUrl = await serializeVerifyArrayBufferForBackground(arrayBuffer);
        } catch (error) {
            return {
                ok: false,
                error: String(error && error.message ? error.message : error)
            };
        }

        return await new Promise((resolve) => {
            try {
                chrome.runtime.sendMessage(
                    {
                        target: "qga",
                        type: "parse_xlsx",
                        parser: parserName,
                        dataUrl
                    },
                    (response) => {
                        const runtimeError =
                            chrome.runtime && chrome.runtime.lastError
                                ? chrome.runtime.lastError
                                : null;
                        if (runtimeError) {
                            resolve({
                                ok: false,
                                error: runtimeError.message || "runtime.sendMessage failed."
                            });
                            return;
                        }
                        if (!response || response.ok !== true) {
                            resolve({
                                ok: false,
                                error:
                                    response && response.error
                                        ? response.error
                                        : `Background parser failed for ${parserName}.`
                            });
                            return;
                        }
                        resolve({
                            ok: true,
                            result: deserializeVerifyBackgroundParseResult(parserName, response.result)
                        });
                    }
                );
            } catch (error) {
                resolve({
                    ok: false,
                    error: String(error && error.message ? error.message : error)
                });
            }
        });
    }

    async function parseVerifyXlsxOffMainThread(parserName, arrayBuffer, fallbackParser) {
        if (!(arrayBuffer instanceof ArrayBuffer)) {
            return fallbackParser(arrayBuffer);
        }

        const response = await requestVerifyXlsxBackgroundParse(parserName, arrayBuffer);
        if (response.ok && response.result && response.result.ok) {
            return response.result;
        }

        warnVerifyXlsxBackgroundFallback(
            `background parse failed for ${parserName}`,
            response && response.error ? response.error : null
        );
        return fallbackParser(arrayBuffer);
    }

    async function parseOpenEndsFromXlsx(arrayBuffer) {
        return await parseVerifyXlsxOffMainThread(
            "openends",
            arrayBuffer,
            parseOpenEndsFromXlsxSync
        );
    }

    async function parseRatingXlsx(arrayBuffer) {
        return await parseVerifyXlsxOffMainThread(
            "rating",
            arrayBuffer,
            parseRatingXlsxSync
        );
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
            const parsed = await parseRatingXlsx(buffer);
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
