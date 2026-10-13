import { UpdateChecker, ExtensionUpdater, CURRENT_VERSION } from './updates.js';

export function mountUpdateUI(window, entry, context, doc) {
    const section = doc.createElement('section'); section.className = 'red-update-settings';
    section.innerHTML = `<strong>Version and updates</strong><p>Current version v${CURRENT_VERSION}</p>
        <label><input type="checkbox" data-update="auto"> Check for updates automatically when opening the director window</label>
        <p class="red-help">Only checks public version information; no chat or API settings are sent. Works fine without a network.</p>
        <div class="red-update-actions"><button type="button" data-update="check">Check for updates</button><button type="button" data-update="install">Update</button></div>
        <p data-update="status" role="status"></p><small>Click "Update" to update this extension directly; reload the page afterwards for it to take effect.</small>`;
    window.querySelector('[data-page="settings"]').prepend(section);
    const banner = doc.createElement('div'); banner.className = 'red-update-banner'; banner.hidden = true;
    banner.innerHTML = `<span data-update="message" role="status"></span><button type="button" data-update="install">Update</button><button type="button" data-update="dismiss" aria-label="Dismiss update reminder for now">×</button>`;
    window.querySelector('.red-owner').before(banner);
    const badge = doc.createElement('small'); badge.className = 'red-update-badge'; badge.hidden = true; badge.textContent = 'Update available';
    entry.querySelector('b').append(badge);
    const settingsTab = window.querySelector('[data-view="settings"]');
    const automatic = section.querySelector('[data-update="auto"]'), check = section.querySelector('[data-update="check"]');
    let dismissed = '', disposed = false;
    const checker = new UpdateChecker({ context, changed: refresh });
    const updater = new ExtensionUpdater({ context, changed: refresh });
    const installButtons = [section, banner].map(node => node.querySelector('[data-update="install"]'));
    function refresh() {
        if (disposed) return;
        const s = checker.state;
        automatic.checked = checker.autoEnabled(); automatic.disabled = !context().extensionSettings;
        check.disabled = s.checking || updater.state.updating || updater.state.done; check.textContent = s.checking ? 'Checking…' : 'Check for updates';
        for (const button of installButtons) {
            button.disabled = updater.state.updating || s.checking;
            button.textContent = updater.state.updating ? 'Updating…' : updater.state.done ? 'Reload page' : 'Update';
        }
        badge.hidden = !s.available; settingsTab.classList.toggle('red-has-update', s.available);
        banner.hidden = (!s.available && !updater.state.message) || dismissed === (s.latest || 'update');
        banner.querySelector('[data-update="message"]').textContent = updater.state.message || (s.available ? `Chuyue has a new version v${s.latest}` : '');
        section.querySelector('[data-update="status"]').textContent = updater.state.message || (s.checking ? 'Checking for updates…'
            : s.manualError ? 'Cannot check for updates right now; try again later, or open the repository.'
                : s.available ? `New version found v${s.latest}`
                    : s.checked ? 'You are on the latest version.' : '');
    }
    const onAuto = () => checker.setAuto(automatic.checked);
    const onCheck = () => { dismissed = ''; updater.state.message = ''; void checker.check({ manual: true }); };
    const onInstall = () => {
        if (updater.state.updating || checker.state.checking) return;
        if (updater.state.done) { doc.defaultView.location.reload(); return; }
        dismissed = ''; void updater.update();
    };
    const onBanner = event => {
        const action = event.target.closest('[data-update]')?.dataset.update;
        if (action === 'dismiss') { dismissed = checker.state.latest || 'update'; refresh(); }
        if (action === 'install') onInstall();
    };
    automatic.addEventListener('change', onAuto); check.addEventListener('click', onCheck); banner.addEventListener('click', onBanner);
    installButtons[0].addEventListener('click', onInstall);
    refresh();
    return { opened() { void checker.check(); }, dispose() {
        disposed = true; checker.dispose(); updater.dispose();
        automatic.removeEventListener('change', onAuto); check.removeEventListener('click', onCheck); banner.removeEventListener('click', onBanner);
        installButtons[0].removeEventListener('click', onInstall);
        settingsTab.classList.remove('red-has-update'); section.remove(); banner.remove(); badge.remove();
    } };
}
