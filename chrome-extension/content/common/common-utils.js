"use strict";

    function normalizeSingleLine(value) {
        return String(value || "")
            .replace(/\s+/g, " ")
            .trim();
    }

    function normalizeSearchText(value) {
        return normalizeSingleLine(value)
            .toLowerCase()
            .replace(/С‘/g, "Рµ")
            .replace(/[^\p{L}\p{N}\s:.-]/gu, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    function wait(ms) {
        const timeout = Number.isFinite(ms) ? Math.max(0, ms) : 0;
        return new Promise((resolve) => setTimeout(resolve, timeout));
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function clampInt(value, min, max, fallback) {
        if (!Number.isFinite(value)) {
            return fallback;
        }
        const intValue = Math.round(value);
        return Math.min(max, Math.max(min, intValue));
    }
