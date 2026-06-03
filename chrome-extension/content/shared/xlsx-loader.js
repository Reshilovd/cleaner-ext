"use strict";

(function (global) {
    var contentXlsxMissingWarned = false;

    function isContentXlsxLibraryReady() {
        return typeof XLSX !== "undefined" && typeof XLSX.read === "function";
    }

    /**
     * XLSX в content script подключается только через manifest (без eval/fetch:
     * CSP страницы и расширения запрещают unsafe-eval).
     * См. второй content_scripts-блок в manifest.json для VerifyMain и Project/Edit.
     */
    function ensureContentXlsxLibraryLoaded() {
        if (isContentXlsxLibraryReady()) {
            return Promise.resolve(true);
        }

        if (!contentXlsxMissingWarned) {
            contentXlsxMissingWarned = true;
            console.warn(
                "[QGA] Библиотека XLSX не подключена в content bundle этой страницы. " +
                    "Используйте background-парсинг или откройте VerifyMain / Project Edit."
            );
        }

        return Promise.resolve(false);
    }

    global.ensureContentXlsxLibraryLoaded = ensureContentXlsxLibraryLoaded;
    global.isContentXlsxLibraryReady = isContentXlsxLibraryReady;
})(typeof globalThis !== "undefined" ? globalThis : window);
