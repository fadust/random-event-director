export function mountDiagnosticsUI(host, diagnostics, doc = document) {
    host.innerHTML = `<p class="red-settings-intro">Runtime diagnostics: queries Tavern Helper scripts in global, preset and current character card scope automatically, and records actual requests and injection. Updates on startup, chat switch and script changes; when a script call is captured, its name and call number are recorded. The enabled list and concurrent candidates do not indicate the request source, let alone evidence of interference; unidentifiable sources are marked unknown. Last 1000 entries, cleared on reload; script code, variables, keys and chat text are never recorded.</p>
      <div class="red-log-controls"><label><input type="checkbox" data-log="record" checked>Record log</label><label><input type="checkbox" data-log="current" checked>Current chat only</label><label><input type="checkbox" data-log="follow" checked>Auto-scroll</label></div>
      <div class="red-window-actions"><button type="button" data-log-action="copy">Copy log</button><button type="button" data-log-action="export">Export JSON</button><button type="button" data-log-action="report">View report</button><button type="button" data-log-action="clear">Clear log</button></div>
      <p class="red-log-status" data-log-role="status" role="status"></p><textarea data-log-role="report" aria-label="Copyable diagnostic report" rows="8" readonly hidden></textarea><div class="red-log-list" data-log-role="list" role="log" aria-label="Director diagnostic log" tabindex="0"></div>`;
    const field = key => host.querySelector(`[data-log="${key}"]`), list = host.querySelector('[data-log-role="list"]');
    const status = host.querySelector('[data-log-role="status"]');
    const report = host.querySelector('[data-log-role="report"]');
    const labels = { success: 'Pass', info: 'Record', skip: 'Skip', warn: 'Note', error: 'Error' };
    let disposed = false, notice = '', fingerprint = '';
    function refresh() {
        if (disposed || host.hidden || host.closest('[hidden]')) return;
        const rows = diagnostics?.list(field('current').checked) || [], key = JSON.stringify(rows);
        status.textContent = notice || `${diagnostics?.scope() || 'No chat selected'} · ${rows.length} records${diagnostics?.enabled === false ? ' · paused' : ''}`;
        field('record').checked = diagnostics?.enabled !== false;
        if (!report.hidden) report.value = diagnostics?.export(field('current').checked) || '';
        if (key === fingerprint) return; fingerprint = key;
        const following = field('follow').checked, previous = list.scrollTop;
        list.replaceChildren();
        for (const row of rows) {
            const item = doc.createElement('article'); item.className = `red-log-row red-log-${row.status}`;
            const meta = doc.createElement('small'), title = doc.createElement('strong'), message = doc.createElement('p');
            meta.textContent = `${new Date(row.time).toLocaleTimeString()} · ${row.scope}${row.run ? ` · ${row.run}` : ''}`;
            title.textContent = `${labels[row.status] || 'Record'} · ${row.stage}`; message.textContent = row.message;
            item.append(meta, title, message);
            if (Object.keys(row.details).length) { const detail = doc.createElement('code'); detail.textContent = JSON.stringify(row.details); item.append(detail); }
            list.append(item);
        }
        if (!rows.length) { const empty = doc.createElement('p'); empty.textContent = 'No records yet. Turn on the director for this chat, prepare an event, then send a message as usual.'; list.append(empty); }
        list.scrollTop = following ? list.scrollHeight : previous;
    }
    const change = event => {
        notice = '';
        if (event.target === field('record') && diagnostics) {
            diagnostics.enabled = event.target.checked;
            if (diagnostics.enabled) diagnostics.refreshScripts?.();
        }
        fingerprint = ''; refresh();
    };
    const click = async event => {
        const action = event.target.closest('[data-log-action]')?.dataset.logAction;
        if (!action || !diagnostics) return;
        try {
            notice = '';
            if (action === 'clear') { diagnostics.clear(field('current').checked); diagnostics.refreshScripts?.(); }
            else if (action === 'report') { report.hidden = !report.hidden; if (!report.hidden) { report.value = diagnostics.export(field('current').checked); report.focus(); report.select(); } }
            else if (action === 'copy') {
                await doc.defaultView.navigator.clipboard.writeText(diagnostics.export(field('current').checked)); notice = 'Diagnostic log copied.';
            } else if (action === 'export') {
                const url = URL.createObjectURL(new Blob([diagnostics.export(field('current').checked)], { type: 'application/json' }));
                const link = doc.createElement('a'); link.href = url; link.download = 'Chuyue-diagnostic-log.json'; doc.body.append(link); link.click(); link.remove();
                setTimeout(() => URL.revokeObjectURL(url), 1000); notice = 'JSON download started; you can also copy the log or view the report.';
            }
        } catch { report.hidden = false; report.value = diagnostics.export(field('current').checked); report.focus(); report.select(); notice = 'The browser did not finish the action; copy manually from the report box.'; }
        refresh();
    };
    host.addEventListener('change', change); host.addEventListener('click', click);
    const unsubscribe = diagnostics?.subscribe(refresh); refresh();
    return { refresh, dispose() { disposed = true; unsubscribe?.(); host.removeEventListener('change', change); host.removeEventListener('click', click); } };
}
