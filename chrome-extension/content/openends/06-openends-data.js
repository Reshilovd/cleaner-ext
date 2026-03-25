"use strict";

    function extractItems() {
        const root = findRootElement();
        let rows = [];
        try {
            rows = Array.from(root.querySelectorAll(state.settings.itemSelector));
        } catch (error) {
            console.warn("[QGA] Некорректный селектор строк:", state.settings.itemSelector, error);
            return [];
        }

        const items = [];
        const totalRows = rows.length;
        for (let i = 0; i < rows.length; i += 1) {
            const node = rows[i];
            const questionText = extractQuestionText(node);
            const normalizedQuestion = normalizeText(questionText || "");
            const variablePrefix = extractVariablePrefix(node);

            let rawText = "";
            let normalized = "";
            let tokens = [];
            let matchSource = "text";

            if (normalizedQuestion) {
                rawText = questionText;
                let groupingKey = normalizedQuestion;

                if (state.settings.splitByVariableInBulk && variablePrefix) {
                    const normalizedPrefix = normalizeText(variablePrefix);
                    if (normalizedPrefix) {
                        groupingKey = `${normalizedQuestion}|var:${normalizedPrefix}`;
                    }
                }

                normalized = groupingKey;
                tokens = tokenize(normalizedQuestion);
            } else if (variablePrefix) {
                const normalizedPrefix = normalizeText(variablePrefix);
                if (!normalizedPrefix) {
                    continue;
                }
                rawText = `Префикс переменной: ${variablePrefix}`;
                normalized = `__var_prefix__:${normalizedPrefix}`;
                tokens = [normalizedPrefix];
                matchSource = "variable_prefix";
            } else {
                continue;
            }

            items.push({
                id: String(i),
                node,
                rawText,
                normalized,
                tokens,
                matchSource,
                variablePrefix,
                selectControl: findSelectControl(node)
            });
        }

        return { items, totalRows };
    }

    function extractQuestionText(node) {
        return extractTextBySelector(node, state.settings.textSelector);
    }

    function extractVariablePrefix(node) {
        const variableText = extractTextBySelector(node, state.settings.variableSelector);
        const fromVariableCell = parseVariablePrefix(variableText);
        if (fromVariableCell) {
            return fromVariableCell;
        }

        const rowText = ((node.innerText || node.textContent || "").trim()).replace(/\s+/g, " ");
        return parseVariablePrefix(rowText);
    }

    function extractTextBySelector(node, selector) {
        if (!selector) {
            return "";
        }
        try {
            const targetNode = node.querySelector(selector);
            if (!targetNode) {
                return "";
            }
            return ((targetNode.innerText || targetNode.textContent || "").trim()).replace(/\s+/g, " ");
        } catch (error) {
            return "";
        }
    }

    function parseVariablePrefix(value) {
        if (!value) {
            return "";
        }

        const chunks = value
            .split(/[,;]+/)
            .map((chunk) => chunk.trim())
            .filter(Boolean);

        for (const chunk of chunks) {
            const match = chunk.match(/\b([A-Za-z0-9]+)_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*\b/);
            if (match && match[1]) {
                return match[1].toUpperCase();
            }
        }

        const fallbackMatch = value.match(/\b([A-Za-z0-9]+)_[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*\b/);
        if (fallbackMatch && fallbackMatch[1]) {
            return fallbackMatch[1].toUpperCase();
        }

        return "";
    }

    function findSelectControl(node) {
        if (!state.settings.selectControlSelector) {
            return null;
        }
        try {
            if (node.matches(state.settings.selectControlSelector)) {
                return node;
            }
            return node.querySelector(state.settings.selectControlSelector);
        } catch (error) {
            return null;
        }
    }

    function normalizeText(value) {
        return value
            .toLowerCase()
            .replace(/ё/g, "е")
            .replace(/[^\p{L}\p{N}\s]/gu, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    function tokenize(value) {
        return value
            .split(" ")
            .map((token) => token.trim())
            .filter((token) => token.length > 1)
            .filter((token) => !STOP_WORDS.has(token))
            .filter((token) => !/^\d+$/.test(token));
    }

    function createGroups(items, mode, threshold) {
        if (mode === "similar") {
            if (items.length > state.settings.maxItemsForSimilarMode) {
                console.warn(`[QGA] Режим похожести пропущен: строк=${items.length}, лимит=${state.settings.maxItemsForSimilarMode}.`);
                return buildExactGroups(items);
            }
            return buildSimilarGroups(items, threshold);
        }
        return buildExactGroups(items);
    }

    function buildExactGroups(items) {
        const grouped = new Map();
        for (const item of items) {
            if (!grouped.has(item.normalized)) {
                grouped.set(item.normalized, []);
            }
            grouped.get(item.normalized).push(item);
        }

        const groups = [];
        for (const [key, members] of grouped.entries()) {
            groups.push({
                key,
                sample: members[0].rawText,
                members
            });
        }
        return groups;
    }

    function buildSimilarGroups(items, threshold) {
        const dsu = new DisjointSet(items.length);
        const tokenBuckets = new Map();
        const normalizedIndex = new Map();

        for (let i = 0; i < items.length; i += 1) {
            const item = items[i];
            for (const token of item.tokens) {
                if (!tokenBuckets.has(token)) {
                    tokenBuckets.set(token, []);
                }
                tokenBuckets.get(token).push(i);
            }
            if (normalizedIndex.has(item.normalized)) {
                dsu.union(i, normalizedIndex.get(item.normalized));
            } else {
                normalizedIndex.set(item.normalized, i);
            }
        }

        const seenPairs = new Set();
        for (const bucket of tokenBuckets.values()) {
            if (bucket.length < 2) {
                continue;
            }
            for (let a = 0; a < bucket.length - 1; a += 1) {
                for (let b = a + 1; b < bucket.length; b += 1) {
                    const i = bucket[a];
                    const j = bucket[b];
                    const pairKey = i < j ? `${i}:${j}` : `${j}:${i}`;
                    if (seenPairs.has(pairKey)) {
                        continue;
                    }
                    seenPairs.add(pairKey);
                    if (isSimilar(items[i], items[j], threshold)) {
                        dsu.union(i, j);
                    }
                }
            }
        }

        const grouped = new Map();
        for (let i = 0; i < items.length; i += 1) {
            const root = dsu.find(i);
            if (!grouped.has(root)) {
                grouped.set(root, []);
            }
            grouped.get(root).push(items[i]);
        }

        const groups = [];
        for (const members of grouped.values()) {
            const sorted = members.slice().sort((a, b) => a.rawText.length - b.rawText.length);
            groups.push({
                key: sorted[0].normalized,
                sample: sorted[0].rawText,
                members: sorted
            });
        }
        return groups;
    }

    function isSimilar(a, b, threshold) {
        if (a.normalized === b.normalized) {
            return true;
        }
        if (a.matchSource === "variable_prefix" || b.matchSource === "variable_prefix") {
            return false;
        }
        const lenRatio = Math.min(a.normalized.length, b.normalized.length) / Math.max(a.normalized.length, b.normalized.length);
        if (lenRatio < 0.72) {
            return false;
        }
        if (a.tokens.length === 0 || b.tokens.length === 0) {
            return false;
        }

        const aSet = new Set(a.tokens);
        const bSet = new Set(b.tokens);
        let intersection = 0;
        for (const token of aSet) {
            if (bSet.has(token)) {
                intersection += 1;
            }
        }
        const union = aSet.size + bSet.size - intersection;
        if (union === 0) {
            return false;
        }
        return (intersection / union) >= threshold;
    }


var DisjointSet = class DisjointSet {
        constructor(size) {
            this.parent = Array.from({ length: size }, (_, index) => index);
            this.rank = Array.from({ length: size }, () => 0);
        }

        find(index) {
            if (this.parent[index] !== index) {
                this.parent[index] = this.find(this.parent[index]);
            }
            return this.parent[index];
        }

        union(a, b) {
            const rootA = this.find(a);
            const rootB = this.find(b);
            if (rootA === rootB) {
                return;
            }
            if (this.rank[rootA] < this.rank[rootB]) {
                this.parent[rootA] = rootB;
            } else if (this.rank[rootA] > this.rank[rootB]) {
                this.parent[rootB] = rootA;
            } else {
                this.parent[rootB] = rootA;
                this.rank[rootA] += 1;
            }
        }
    }
