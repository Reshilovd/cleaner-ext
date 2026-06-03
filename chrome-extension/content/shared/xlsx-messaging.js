(function (global) {
    "use strict";

    /**
     * Нормализует payload XLSX из chrome.runtime.sendMessage (structured clone).
     * @returns {ArrayBuffer|null}
     */
    function normalizeQgaXlsxArrayBuffer(payload) {
        if (payload instanceof ArrayBuffer) {
            return payload.byteLength > 0 ? payload : null;
        }
        if (ArrayBuffer.isView(payload)) {
            if (payload.byteLength === 0) {
                return null;
            }
            return payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength);
        }
        return null;
    }

    global.normalizeQgaXlsxArrayBuffer = normalizeQgaXlsxArrayBuffer;
})(typeof globalThis !== "undefined" ? globalThis : self);
