"use strict";

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
