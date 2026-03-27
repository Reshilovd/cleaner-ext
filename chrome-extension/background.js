chrome.action.onClicked.addListener((tab) => {
    if (!tab || !tab.id) {
        return;
    }

    chrome.tabs.sendMessage(tab.id, { target: "qga", type: "toggle_panel" }, () => {
        // If there is no receiver on this page, ignore the runtime error.
        void chrome.runtime.lastError;
    });
});

let qgaXlsxLibraryLoaded = false;
let qgaXlsxLibraryLoadError = null;

try {
    importScripts(chrome.runtime.getURL("xlsx.full.min.js"));
    qgaXlsxLibraryLoaded = typeof XLSX !== "undefined" && typeof XLSX.read === "function";
    if (!qgaXlsxLibraryLoaded) {
        qgaXlsxLibraryLoadError = new Error("XLSX global is unavailable after importScripts.");
        console.error("[QGA] Failed to initialize XLSX library in background:", qgaXlsxLibraryLoadError);
    }
} catch (error) {
    qgaXlsxLibraryLoadError = error;
    console.error("[QGA] Failed to initialize XLSX library in background:", error);
}

function ensureQgaXlsxLibraryLoaded() {
    if (qgaXlsxLibraryLoaded) {
        return true;
    }
    if (qgaXlsxLibraryLoadError) {
        console.error("[QGA] XLSX library is unavailable in background:", qgaXlsxLibraryLoadError);
    }
    return false;
}

function injectProjectEditPenaltyBridgeInTab(tabId) {
    return new Promise((resolve, reject) => {
        if (!tabId) {
            reject(new Error("tab id is unavailable"));
            return;
        }

        if (!chrome.scripting || typeof chrome.scripting.executeScript !== "function") {
            reject(new Error("chrome.scripting.executeScript is unavailable"));
            return;
        }

        try {
            chrome.scripting.executeScript(
                {
                    target: { tabId, allFrames: false },
                    files: ["content/verify/project-edit-penalty-bridge.js"],
                    world: "MAIN"
                },
                () => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message || "Failed to inject penalty bridge"));
                        return;
                    }

                    resolve(true);
                }
            );
        } catch (error) {
            reject(error);
        }
    });
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

function parseOpenEndsFromXlsxInBackground(arrayBuffer) {
    if (!(arrayBuffer instanceof ArrayBuffer)) {
        return { ok: false, error: "Неверный формат данных при загрузке OpenEnds (ожидался ArrayBuffer)." };
    }

    if (typeof XLSX === "undefined" || typeof XLSX.read !== "function") {
        return {
            ok: false,
            error:
                "Для разбора файла OpenEnds (XLSX) не найдена библиотека XLSX. " +
                "Убедитесь, что xlsx.full.min.js доступен в extension background."
        };
    }

    let workbook = null;
    try {
        workbook = XLSX.read(arrayBuffer, { type: "array" });
    } catch (error) {
        console.error("[QGA] Ошибка XLSX.read при разборе OpenEnds в background:", error);
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
        console.error("[QGA] Ошибка XLSX.utils.sheet_to_json при разборе OpenEnds в background:", error);
        return { ok: false, error: "Не удалось преобразовать XLSX в строки (sheet_to_json)." };
    }

    if (!Array.isArray(rows) || rows.length < 2) {
        return { ok: false, error: "Выгрузка OpenEnds пуста или содержит только заголовок." };
    }

    const headerCells = rows[0].map((cell) => String(cell || "").trim());
    const headerNormalized = headerCells.map((cell) => cell.toLowerCase());

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

        if (question && value) {
            const fullKey = buildVerifyQuestionValueKey(question, value);
            if (!respondentIdsByOpenEndId.has(fullKey)) {
                respondentIdsByOpenEndId.set(fullKey, []);
            }
            const fullArr = respondentIdsByOpenEndId.get(fullKey);
            if (!fullArr.includes(respondentId)) {
                fullArr.push(respondentId);
            }
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
        respondentIdsByOpenEndIdEntries: Array.from(respondentIdsByOpenEndId.entries()),
        answersByRespondentIdEntries: Array.from(answersByRespondentId.entries()),
        respondentIdsByQuestionAndValueEntries: Array.from(respondentIdsByQuestionAndValue.entries()),
        respondentIdsByValueOnlyEntries: Array.from(respondentIdsByValueOnly.entries())
    };
}

function parseRatingXlsxInBackground(arrayBuffer) {
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
        console.warn("[QGA] Ошибка XLSX.read при разборе рейтинга в background:", error);
        return { ok: false, error: "Не удалось прочитать XLSX рейтинга." };
    }

    if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
        return { ok: false, error: "Файл рейтинга пуст или некорректен." };
    }

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) {
        return { ok: false, error: "Лист не найден." };
    }

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
        if (reasonRaw == null || String(reasonRaw).trim() === "") {
            continue;
        }
        const codes = String(reasonRaw)
            .trim()
            .split(/\s+/)
            .map(Number)
            .filter((n) => n > 0 && Number.isFinite(n));
        if (codes.length === 0) {
            continue;
        }
        const token = String(row[tokenCol] || "").trim();
        if (token) {
            tokenReasonCodes[token] = codes;
        }
    }

    return { ok: true, tokenReasonCodes };
}

async function restoreQgaArrayBufferFromDataUrl(dataUrl) {
    const payload = typeof dataUrl === "string" ? dataUrl.trim() : "";
    if (!payload) {
        return { ok: false, error: "Empty XLSX payload." };
    }

    try {
        const response = await fetch(payload);
        if (!response.ok) {
            return { ok: false, error: `Failed to read XLSX payload: ${response.status}` };
        }
        return { ok: true, arrayBuffer: await response.arrayBuffer() };
    } catch (error) {
        return {
            ok: false,
            error: String(error && error.message ? error.message : error)
        };
    }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.target !== "qga") {
        return;
    }

    if (message.type === "inject_project_edit_penalty_bridge") {
        Promise.resolve()
            .then(async () => {
                const tabId = _sender && _sender.tab && _sender.tab.id ? _sender.tab.id : null;
                await injectProjectEditPenaltyBridgeInTab(tabId);
                sendResponse({ ok: true });
            })
            .catch((error) => {
                sendResponse({
                    ok: false,
                    error: String(error && error.message ? error.message : error)
                });
            });

        return true;
    }

    if (message.type === "parse_xlsx") {
        Promise.resolve().then(async () => {
            if (!ensureQgaXlsxLibraryLoaded()) {
                sendResponse({ ok: false, error: "Failed to load XLSX library in background." });
                return;
            }

            const parser = typeof message.parser === "string" ? message.parser.trim() : "";
            const restored = await restoreQgaArrayBufferFromDataUrl(message.dataUrl);
            if (!restored.ok) {
                sendResponse({ ok: false, error: restored.error || "Failed to restore XLSX payload." });
                return;
            }
            const arrayBuffer = restored.arrayBuffer;

            let result = null;
            if (parser === "openends") {
                result = parseOpenEndsFromXlsxInBackground(arrayBuffer);
            } else if (parser === "rating") {
                result = parseRatingXlsxInBackground(arrayBuffer);
            } else {
                result = { ok: false, error: `Unsupported XLSX parser: ${parser}` };
            }

            if (result && result.ok) {
                sendResponse({ ok: true, result });
                return;
            }

            sendResponse({
                ok: false,
                error: result && result.error ? result.error : "Background XLSX parse failed."
            });
        }).catch((error) => {
            sendResponse({
                ok: false,
                error: String(error && error.message ? error.message : error)
            });
        });

        return true;
    }

    if (message.type !== "open_new_tab") {
        return;
    }

    const url = typeof message.url === "string" ? message.url.trim() : "";
    if (!url) {
        sendResponse({ ok: false, error: "empty url" });
        return;
    }

    try {
        chrome.tabs.create({ url, active: true }, () => {
            if (chrome.runtime.lastError) {
                sendResponse({ ok: false, error: chrome.runtime.lastError.message || "tabs.create failed" });
                return;
            }
            sendResponse({ ok: true });
        });
    } catch (error) {
        sendResponse({ ok: false, error: String(error && error.message ? error.message : error) });
    }

    return true;
});
