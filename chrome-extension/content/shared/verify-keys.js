"use strict";

(function (global) {
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

    global.buildVerifyQuestionValueKey = buildVerifyQuestionValueKey;
    global.buildVerifyValueOnlyKey = buildVerifyValueOnlyKey;
})(typeof globalThis !== "undefined" ? globalThis : window);
