    function injectStyles() {
        const style = document.createElement("style");
        style.textContent = `
            #${PANEL_ID} {
                position: fixed;
                top: 12px;
                right: 12px;
                width: 410px;
                max-height: calc(100vh - 24px);
                z-index: 2147483647;
                background: #ffffff;
                color: #1f2937;
                border: 1px solid #d1d5db;
                border-radius: 12px;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
                font: 12px/1.4 "Segoe UI", Tahoma, sans-serif;
                display: flex;
                flex-direction: column;
                overflow: hidden;
            }
            #${PANEL_ID} * {
                box-sizing: border-box;
            }
            #${PANEL_ID} .qga-header {
                background: #111827;
                color: #f9fafb;
                padding: 10px 12px;
                font-size: 13px;
                font-weight: 600;
            }
            #${PANEL_ID} .qga-section {
                padding: 10px 12px;
                border-bottom: 1px solid #e5e7eb;
            }
            #${PANEL_ID} .qga-row {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 8px;
                margin-bottom: 8px;
            }
            #${PANEL_ID} label {
                display: block;
                margin-bottom: 4px;
                color: #4b5563;
                font-size: 11px;
            }
            #${PANEL_ID} input[type='text'],
            #${PANEL_ID} input[type='number'],
            #${PANEL_ID} select {
                width: 100%;
                border: 1px solid #d1d5db;
                border-radius: 6px;
                padding: 6px;
                font-size: 12px;
                background: #ffffff;
            }
            #${PANEL_ID} .qga-actions {
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
                margin-top: 6px;
            }
            #${PANEL_ID} button {
                border: 1px solid #cbd5e1;
                border-radius: 6px;
                padding: 6px 8px;
                background: #f8fafc;
                cursor: pointer;
                font-size: 11px;
            }
            #${PANEL_ID} button:hover {
                background: #eef2ff;
            }
            #${PANEL_ID} .qga-stats {
                color: #1f2937;
                font-size: 11px;
            }
            #${PANEL_ID} .qga-stats-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                margin-bottom: 4px;
                min-height: 18px;
            }
            #${PANEL_ID} .qga-progress-wrap {
                margin-bottom: 8px;
                display: none;
            }
            #${PANEL_ID} .qga-progress-wrap.qga-progress-visible {
                display: block;
            }
            #${PANEL_ID} .qga-progress-bar {
                height: 8px;
                background: #e5e7eb;
                border-radius: 4px;
                overflow: hidden;
            }
            #${PANEL_ID} .qga-progress-fill {
                height: 100%;
                background: #6366f1;
                border-radius: 4px;
                transition: width 0.2s ease;
            }
            #${PANEL_ID} .qga-progress-text {
                display: none;
            }
            #${PANEL_ID} .qga-loading {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                font-size: 11px;
                color: #6b7280;
            }
            #${PANEL_ID} .qga-spinner {
                width: 12px;
                height: 12px;
                border-radius: 999px;
                border: 2px solid #e5e7eb;
                border-top-color: #6366f1;
                animation: qga-spin 0.8s linear infinite;
            }
            @keyframes qga-spin {
                to {
                    transform: rotate(360deg);
                }
            }
            #${PANEL_ID} .qga-list {
                list-style: none;
                margin: 0;
                padding: 0;
                overflow: auto;
                max-height: 44vh;
            }
            #${PANEL_ID} .qga-group {
                border: 1px solid #e5e7eb;
                border-radius: 8px;
                padding: 8px;
                margin-bottom: 8px;
            }
            #${PANEL_ID} .qga-group.qga-group--processed .qga-group-title::before {
                content: "✓ ";
                color: #059669;
                font-weight: 700;
            }
            #${PANEL_ID} .qga-group-title {
                font-weight: 600;
                margin-bottom: 4px;
                font-size: 12px;
            }
            #${PANEL_ID} .qga-group-sample {
                margin: 0 0 6px 0;
                color: #4b5563;
                font-size: 11px;
                line-height: 1.35;
                white-space: pre-wrap;
                word-break: break-word;
            }
            #${PANEL_ID} .qga-inline-actions {
                display: flex;
                gap: 6px;
                flex-wrap: wrap;
            }
            #${PANEL_ID}.qga-bulk-running .qga-group {
                background-color: #f3f4f6;
            }
            #${PANEL_ID}.qga-bulk-running .qga-group button {
                pointer-events: none;
                opacity: 0.6;
                cursor: not-allowed;
            }
            .${HIGHLIGHT_CLASS} {
                outline: 2px solid #f59e0b !important;
                outline-offset: 2px !important;
                background-color: rgba(245, 158, 11, 0.08) !important;
                scroll-margin-top: 120px;
            }
            .qga-verify-cell {
                position: relative;
            }
            .qga-verify-show-respondent {
                position: absolute;
                left: 50%;
                top: 50%;
                transform: translate(-50%, -50%);
                border: 1px solid #e2e8f0;
                border-radius: 3px;
                padding: 2px 6px;
                margin: 0;
                background: #f8fafc;
                color: #475569;
                cursor: pointer;
                font-size: 11px;
                font-weight: normal;
                white-space: nowrap;
                box-shadow: none;
                transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
            }
            .qga-verify-show-respondent:hover {
                background: #f1f5f9;
                border-color: #cbd5e1;
                color: #334155;
            }
            .qga-verify-cell-wrap {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                white-space: nowrap;
            }
            .qga-verify-modal {
                position: fixed;
                right: 12px;
                bottom: 12px;
                width: 340px;
                max-height: 65vh;
                z-index: 2147483647;
                background: #fff;
                color: #1f2937;
                border-radius: 6px;
                box-shadow: 0 8px 24px rgba(0,0,0,0.12);
                border: 1px solid #e5e7eb;
                display: none;
                flex-direction: column;
                font: 12px/1.4 "Segoe UI", Tahoma, sans-serif;
                overflow: hidden;
            }
            .qga-verify-modal__header {
                padding: 5px 8px;
                background: #1f2937;
                color: #f9fafb;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 6px;
            }
            .qga-verify-modal__title {
                font-size: 12px;
                font-weight: 600;
            }
            .qga-verify-modal__close {
                border: none;
                background: transparent;
                color: #9ca3af;
                cursor: pointer;
                font-size: 16px;
                line-height: 1;
                padding: 0 2px;
            }
            .qga-verify-modal__close:hover {
                color: #e5e7eb;
            }
            .qga-verify-modal__body {
                padding: 6px 8px;
                overflow: auto;
            }
            .qga-verify-modal--candidates .qga-verify-modal__body {
                padding-top: 0;
            }
            .qga-verify-modal--candidates .qga-verify-modal__list {
                margin-top: 0;
                padding-top: 0;
            }
            .qga-verify-modal--candidates .qga-verify-modal__list .qga-verify-modal__item:first-child {
                padding-top: 0;
            }
            .qga-verify-modal--candidates .qga-verify-modal__list .qga-verify-modal__item:first-child .qga-verify-modal__respondent-header {
                padding-top: 0;
                margin-top: 0;
            }
            .qga-verify-modal--candidates .qga-verify-modal__footer {
                display: none;
            }
            .qga-verify-modal__list {
                list-style: none;
                margin: 0;
                padding: 0;
            }
            .qga-verify-modal__item {
                padding: 2px 0;
            }
            .qga-verify-modal__item:not(:first-child) {
                margin-top: 6px;
                padding-top: 6px;
                border-top: 1px solid #e5e7eb;
            }
            .qga-verify-modal__item--in-manual {
                background: #ecfdf5;
                margin-left: -8px;
                margin-right: -8px;
                padding-left: 8px;
                padding-right: 8px;
                padding-top: 4px;
                padding-bottom: 4px;
                border-radius: 4px;
            }
            .qga-verify-modal__item--in-manual .qga-verify-modal__respondent-header {
                background: #ecfdf5;
            }
            .qga-verify-modal__respondent-header {
                position: sticky;
                top: 0;
                z-index: 1;
                background: #fff;
                font-weight: 600;
                font-size: 14px;
                margin-bottom: 3px;
                padding: 2px 0;
                color: #111827;
            }
            .qga-verify-modal__q {
                font-weight: 600;
                font-size: 11px;
                margin-bottom: 0;
                color: #6b7280;
            }
            .qga-verify-modal__q.qga-verify-modal__respondent-header {
                color: #111827;
            }
            .qga-verify-modal__text {
                font-size: 11px;
                color: #374151;
                white-space: pre-wrap;
                word-break: break-word;
                margin-bottom: 2px;
            }
            .qga-verify-modal__item > .qga-verify-modal__text:last-child {
                margin-bottom: 0;
            }
            .qga-verify-modal__footer {
                margin-top: 10px;
                padding-top: 10px;
                border-top: 1px solid #e5e7eb;
            }
            .qga-verify-modal__footer-label {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                cursor: pointer;
                font-size: 12px;
                color: #374151;
            }
            .qga-verify-modal--in-manual .qga-verify-modal__body,
            .qga-verify-modal--in-manual .qga-verify-modal__footer {
                background: #ecfdf5;
            }
            .qga-verify-row-hidden {
                visibility: collapse !important;
                height: 0 !important;
                overflow: hidden !important;
            }
            .qga-verify-modal__item--incorrect .qga-verify-modal__respondent-header,
            .qga-verify-modal__item--incorrect {
                background-color: #fef2f2 !important;
            }
            .qga-verify-modal__item--incorrect .qga-verify-modal__respondent-header {
                color: #b91c1c !important;
            }
            .qga-verify-modal__item--in-manual .qga-verify-modal__respondent-header,
            .qga-verify-modal__item--in-manual {
                background: #fefce8 !important;
            }
            .qga-verify-modal__item--in-manual .qga-verify-modal__respondent-header {
                color: #854d0e !important;
            }
            .qga-verify-question-highlight-incorrect {
                background-color: #fef2f2 !important;
                outline: 2px solid #f87171 !important;
                outline-offset: 2px !important;
            }
            .qga-verify-modal--row-incorrect .qga-verify-modal__body,
            .qga-verify-modal--row-incorrect .qga-verify-modal__footer {
                background-color: #fef2f2 !important;
            }
        `;
        document.documentElement.appendChild(style);
    }