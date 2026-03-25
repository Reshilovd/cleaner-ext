"use strict";

    function escapeRegExp(value) {
        return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    function uniqStrings(values) {
        const seen = new Set();
        const result = [];

        for (const value of values) {
            if (!value || seen.has(value)) {
                continue;
            }
            seen.add(value);
            result.push(value);
        }

        return result;
    }

    function loadStoredState() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) {
                return;
            }
            const stored = JSON.parse(raw);
            if (!stored || typeof stored !== "object") {
                return;
            }
            if (stored.settings && typeof stored.settings === "object") {
                state.settings = { ...DEFAULT_SETTINGS, ...stored.settings };
            }
            if (stored.mode === "exact" || stored.mode === "similar") {
                state.mode = stored.mode;
            }
            if (typeof stored.threshold === "number") {
                state.threshold = clamp(stored.threshold, 0.5, 1);
            }
            if (Array.isArray(stored.processedKeys)) {
                state.processedKeys = new Set(stored.processedKeys);
            }
        } catch (error) {
            console.warn("[QGA] РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ СЃРѕСЃС‚РѕСЏРЅРёРµ:", error);
        }
    }

    function saveStoredState() {
        const payload = {
            settings: state.settings,
            mode: state.mode,
            threshold: state.threshold,
            processedKeys: Array.from(state.processedKeys)
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }
