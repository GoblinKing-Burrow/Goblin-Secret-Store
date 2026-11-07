import { vaultSession } from './session.js';
/** Operator-facing vault. Sensitive inputs live in this mount; the local session lives in scoped module memory. */
export function mountManagement({ root, detailRoot = null, api, section = 'credentials', runtimeScope, modId, setDraft, navigate, confirm }) {
  const abort = new AbortController();
  const session = vaultSession(runtimeScope, modId);
  let draftScope = null, lastError = '', authGeneration = 0;
  let live = true, status, records = [], templates = [], agents = [], selected = null, busy = false, loadGeneration = 0;
  function clearManagementState() {
    records = []; templates = []; agents = []; selected = null;
    draftScope = null; publishDraft();
    content?.replaceChildren(); detailRoot?.replaceChildren();
  }
  function invalidateManagementState() {
    authGeneration++; loadGeneration++;
    clearManagementState();
  }
  const el = (tag, text, className) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (className) n.className = className; return n; };
  const button = (text, fn, className) => { const n = el('button', text, className || 'secondary'); n.style.justifySelf = 'start'; n.type = 'button'; n.addEventListener('click', fn); return n; };
  const label = (text, input) => { const n = el('label', text, 'field'); n.append(input); return n; };
  const input = (type = 'text') => { const n = el('input'); n.type = type; return n; };
  const notice = el('p', '', 'settings-status'); notice.setAttribute('role', 'status');
  const view = el('div', null, 'gss-settings settings-stack');
  // Secret masking and the file-picker button are module-specific. The host owns layout and shared controls.
  const style = el('style');
  style.textContent = `.gss-masked-value{-webkit-text-security:disc;text-security:disc}
.gss-backup-file::file-selector-button{margin-right:10px;padding:6px 10px;border:1px solid var(--line);border-radius:4px;background:var(--surface-hover,var(--surface-input));color:var(--text);font:inherit;font-weight:600;cursor:pointer}.gss-backup-file:hover::file-selector-button{border-color:var(--accent-border)}`;
  view.append(style);
  const content = el('div', null, 'settings-stack'); view.append(content, notice); root.replaceChildren(view);
  const unsubscribe = session.subscribe(() => { if (!live) return; invalidateManagementState(); void load(); });
  const message = (text, error = false) => { lastError = error ? text : ''; notice.textContent = text; notice.setAttribute('role', error ? 'alert' : 'status'); notice.className = error ? 'settings-request-error' : 'settings-status'; };
  const err = e => e?.message || 'Request failed';
  async function request(path, options = {}) {
    if (!live) throw new DOMException('Vault view closed.', 'AbortError');
    const headers = { ...options.headers };
    const sentToken = session.current();
    const sentGeneration = authGeneration;
    if (sentToken) headers['X-GSS-Session'] = sentToken;
    if (options.body !== undefined) headers['content-type'] = 'application/json';
    try {
      const result = await api(path, { ...options, headers, signal: abort.signal });
      if (path === '/status') {
        if (session.current() !== sentToken) return request('/status');
        session.observe(result, sentToken);
      }
      if (!['/status', '/login', '/bootstrap'].includes(path) && sentGeneration !== authGeneration) throw new DOMException('Vault session changed. Retry after unlocking.', 'AbortError');
      return result;
    } catch (e) {
      if ((e?.status === 401 || e?.statusCode === 401) && path !== '/login' && path !== '/bootstrap') {
        session.invalidate(sentToken);
        clearManagementState();
      }
      throw e;
    }
  }
  const write = (path, method, body) => request(path, { method, body: JSON.stringify(body) });
  function publishDraft() {
    if (!live || typeof setDraft !== 'function') return;
    setDraft({ dirty: Boolean(draftScope?.dirty()), busy, save: () => draftScope?.save() ?? Promise.resolve(false),
      discard: () => { if (!busy && live) { draftScope = null; render(); } } });
  }
  function bindDraft(form, snapshot, save, action) {
    const baseline = snapshot();
    const dirty = () => snapshot() !== baseline;
    draftScope = { dirty, save };
    const changed = () => { if (!live) return; if (action) action.disabled = busy || !dirty(); publishDraft(); };
    form.addEventListener('input', changed);
    form.addEventListener('change', changed);
    draftScope.changed = changed;
    changed();
    return changed;
  }
  function controlsDisabled(disabled) {
    for (const surface of [root, detailRoot]) {
      for (const control of surface?.querySelectorAll?.('input, select, textarea, button') ?? []) control.disabled = disabled;
    }
  }
  async function operation(action, success) {
    if (!live || busy) return false;
    busy = true; controlsDisabled(true); publishDraft(); message('Working…');
    try { await action(); if (!live) return false; if (lastError) message(`${success} ${lastError}`, true); else message(success); return true; }
    catch (e) { if (live) message(err(e), true); return false; }
    finally { if (live) { busy = false; controlsDisabled(false); draftScope?.changed?.(); publishDraft(); } }
  }
  const guarded = proceed => {
    if (!live || busy) return;
    navigate(() => { if (live && !busy) proceed(); });
  };
  function logoutButton() {
    return button('Log out', () => guarded(() => void operation(async () => {
      const token = session.current();
      try { await request('/logout', { method: 'POST' }); }
      finally { session.invalidate(token); if (live) await load(); }
    }, 'Logged out.')), 'secondary');
  }
  function locked() {
    content.className = 'setting-section settings-stack';
    content.replaceChildren(el('h2', 'Unlock vault'));
    const first = status.authMode === 'local' && !status.initialized;
    if (first) content.append(el('p', 'First visitor on this trusted network can claim the vault. Isolate the service until the intended operator sets its password. Minimum 12 characters.'));
    else content.append(el('p', status.authMode === 'core' ? 'Sign in to Burrow with a verified operator login to manage this vault.' : 'Unlock this vault with its local password. Sessions stay in memory and expire after one hour.'));
    if (status.authMode !== 'local') return;
    const form = el('form', null, 'settings-form settings-stack'), password = input('password'); password.required = true; password.minLength = first ? 12 : 1; password.autocomplete = first ? 'new-password' : 'current-password';
    form.append(label(first ? 'Set vault password' : 'Vault password', password));
    let confirm;
    if (first) { confirm = input('password'); confirm.required = true; confirm.minLength = 12; confirm.autocomplete = 'new-password'; form.append(label('Confirm password', confirm)); }
    const submit = el('button', first ? 'Claim vault' : 'Unlock vault', 'primary'); submit.type = 'submit'; form.append(submit); content.append(form);
    form.addEventListener('submit', async e => {
      e.preventDefault(); if (busy) return;
      if (confirm && password.value !== confirm.value) { message('Passwords do not match.', true); return; }
      const secret = password.value; password.value = ''; if (confirm) confirm.value = '';
      submit.disabled = true;
      await operation(async () => { const result = await write(first ? '/bootstrap' : '/login', 'POST', { password: secret }); if (!live) return; session.set(result); await load(); }, 'Vault unlocked.');
      if (live) submit.disabled = false;
    });
  }
  async function load() {
    const generation = ++loadGeneration;
    const current = () => live && generation === loadGeneration;
    try {
      const nextStatus = await request('/status'); if (!current()) return;
      status = nextStatus;
      if (!status.authenticated || !session.authenticated()) { clearManagementState(); locked(); return; }
      const [r, t, a] = await Promise.all([request('/records'), request('/templates'), request('/agents')]);
      if (!current() || !session.authenticated()) return;
      records = r.records; templates = t.templates; agents = Array.isArray(a) ? a : a.agents || [];
      if (selected && !records.some(record => record.id === selected)) selected = null;
      render(); return true;
    } catch (e) { if (current()) { clearManagementState(); content.replaceChildren(el('h2', 'Vault unavailable'), button('Retry', () => void load())); message(`Could not load vault: ${err(e)}`, true); } }
  }
  function render() {
    draftScope = null; publishDraft();
    content.className = 'settings-stack';
    if (!session.authenticated()) { clearManagementState(); return; }
    if (section === 'backup') {
      content.replaceChildren();
      detailRoot?.replaceChildren();
      extras(content, detailRoot);
      if (status.authMode === 'local') content.append(logoutButton());
      return;
    }
    const sidebar = el('section', null, 'setting-section settings-stack');
    sidebar.append(el('h2', 'Credentials'));
    const list = el('div', null, 'memory-connection-list');
    list.setAttribute('aria-label', 'Credentials');
    list.style.maxHeight = 'min(480px, 60dvh)';
    list.style.overflowY = 'auto';
    if (!records.length) list.append(el('p', section === 'sharing' ? 'No credentials to share yet. Create one under Credentials first.' : 'No credentials yet. Create one to get started.', 'settings-empty'));
    for (const record of records) {
      const row = el('div', null, 'memory-connection');
      const b = button(record.name, () => {
        if (!session.authenticated()) { clearManagementState(); return; }
        if (selected === record.id) return;
        guarded(() => { selected = record.id; render(); });
      }, 'memory-connection-select');
      b.setAttribute('aria-pressed', String(selected === record.id));
      b.style.overflowWrap = 'anywhere'; b.style.whiteSpace = 'normal';
      row.append(b);
      if (selected === record.id) row.append(el('span', 'Selected', 'settings-help'));
      list.append(row);
    }
    sidebar.append(list);
    if (status.authMode === 'local') sidebar.append(logoutButton());
    const panel = el('div', null, 'settings-stack');
    const record = records.find(r => r.id === selected);
    if (section === 'sharing' && record) access(panel, record);
    else if (section === 'credentials') editor(panel, record);
    else {
      const empty = el('section', null, 'setting-section');
      empty.append(el('h2', 'Select a credential'), el('p', 'Choose a credential to manage agent access.', 'settings-empty'));
      panel.append(empty);
    }
    content.replaceChildren(panel);
    if (detailRoot) detailRoot.replaceChildren(sidebar);
    else {
      const fallback = el('details', null, 'settings-disclosure');
      fallback.open = !record;
      fallback.append(el('summary', 'Choose a credential'), sidebar);
      content.replaceChildren(fallback, panel);
    }
  }
  function editor(panel, record) {
    const form = el('form', null, 'setting-section'); form.append(el('h2', record ? 'Edit credential' : 'New credential'));
    const body = el('div', null, 'settings-form settings-stack'); form.append(body);
    const name = input(); name.required = true; name.maxLength = 256; name.value = record?.name || '';
    const template = el('select'); for (const t of templates) { const option = el('option', t.id.replaceAll('-', ' ')); option.value = t.id; template.append(option); } template.value = record?.template || templates[0]?.id || 'custom';
    const basics = el('div', null, 'settings-field-pair'); basics.append(label('Credential name (public)', name), label('Credential template', template)); body.append(basics);
    const serviceUrl = input('url'); serviceUrl.value = record?.serviceUrl || ''; serviceUrl.autocomplete = 'off';
    body.append(label('Service URL (public, optional)', serviceUrl));
    const fields = el('div', null, 'settings-stack'); body.append(el('h3', 'Fields'), el('p', 'Public fields are visible to authorized agents. Protected fields are write-only here. Leave an existing protected field blank to keep its value.', 'settings-help'), fields);
    let draft = record ? record.fields.map(f => ({ ...f })) : templates.find(t => t.id === template.value)?.fields.map(f => ({ ...f })) || [];
    function captureFields() {
      for (const field of draft) {
        if (!field._nodes) continue;
        const { fieldName, fieldType, protectedBox, value, clear } = field._nodes;
        field.name = fieldName.value;
        field.type = fieldType.value;
        field.protected = protectedBox.checked;
        field.editValue = value.value;
        field.clear = clear?.checked || false;
      }
    }
    let changed = () => {};
    function drawFields() {
      fields.replaceChildren();
      for (const [index, field] of draft.entries()) {
        const row = el('div', null, 'settings-field-pair');
        const fieldName = input(); fieldName.value = field.name; fieldName.required = true; fieldName.maxLength = 128;
        const fieldType = el('select'); for (const type of ['text','url','username','credential','secret','token','password','private-key']) { const opt = el('option', type); opt.value = type; fieldType.append(opt); } fieldType.value = field.type;
        const protectedBox = input('checkbox'); protectedBox.checked = field.protected;
        // Keep private-key drafts in a textarea in both modes: password inputs normalize away line breaks.
        const privateKey = field.protected && field.type === 'private-key';
        const multiline = privateKey && field.keyVisible;
        const value = privateKey ? el('textarea') : input(field.protected ? 'password' : 'text');
        if (privateKey && !multiline) { value.className = 'gss-masked-value'; value.autocomplete = 'off'; value.spellcheck = false; }
        value.value = field.editValue ?? (field.protected ? '' : field.value || '');
        value.placeholder = field.protected && field.hasValue ? 'Stored — leave blank to keep' : '';
        row.append(label('Field key (public)', fieldName), label('Field type', fieldType), label(multiline ? 'Field value (visible while editing)' : 'Field value', value));
        if (privateKey) row.append(button(multiline ? 'Mask private key' : 'Enter multiline key (visible)', () => { captureFields(); field.keyVisible = !field.keyVisible; drawFields(); }));
        let clear; if (field.protected && field.hasValue) { clear = input('checkbox'); clear.checked = field.clear || false; const clearLabel = el('label', null, 'settings-checkbox-row'); clearLabel.append(clear, el('span', 'Replace stored value with an empty string')); row.append(clearLabel); }
        const toggle = el('label', null, 'settings-checkbox-row'); toggle.append(protectedBox, el('span', 'Protected (write-only)')); row.append(toggle);
        row.append(button('Remove field', () => { captureFields(); draft.splice(index, 1); drawFields(); })); fields.append(row);
        field._nodes = { fieldName, fieldType, protectedBox, value, clear };
        fieldType.addEventListener('change', () => { captureFields(); field.keyVisible = false; drawFields(); });
        protectedBox.addEventListener('change', () => { captureFields(); field.keyVisible = false; drawFields(); });
      }
      changed();
    }
    drawFields();
    template.addEventListener('change', () => { if (record) { message('Changing a template retains the existing fields; adjust fields explicitly.'); changed(); return; } draft = templates.find(t => t.id === template.value)?.fields.map(f => ({ ...f })) || []; drawFields(); });
    body.append(button('Add field', () => { captureFields(); draft.push({ name: '', type: 'text', protected: false }); drawFields(); }));
    const actions = el('div', null, 'model-actions'), save = el('button', 'Save credential', 'primary'); save.type = 'submit'; actions.append(save);
    if (record) actions.append(button('Create another credential', () => guarded(() => { selected = null; render(); })));
    if (record) {
      const danger = el('div', null, 'settings-danger-actions');
      danger.append(button('Delete credential', async () => {
        if (!live || busy) return;
        const confirmationGeneration = authGeneration;
        busy = true; controlsDisabled(true); publishDraft();
        let accepted = false;
        try { accepted = await confirm({ title: 'Delete credential?', message: `Permanently delete “${record.name}”? Existing references will be revoked and unsaved edits discarded.`, confirmLabel: 'Delete credential', tone: 'danger' }); }
        finally { if (live) { busy = false; controlsDisabled(false); draftScope?.changed?.(); publishDraft(); } }
        if (!accepted || !live || confirmationGeneration !== authGeneration) return;
        await operation(async () => { await write(`/records/${encodeURIComponent(record.id)}`, 'DELETE', { version: record.version }); if (!live) return; selected = null; draftScope = null; await load(); }, 'Credential deleted.');
      }, 'danger'));
      body.append(actions, danger);
    }
    if (!record) body.append(actions);
    async function saveCredential() {
      if (!live || busy) return false;
      if (form.reportValidity && !form.reportValidity()) return false;
      captureFields();
      const fieldData = draft.map(f => {
        const next = { name: f.name.trim(), type: f.type, protected: f.protected };
        // Only the same protected field may omit value. Blank on a changed/new field is a literal blank.
        const unchanged = record?.fields.some(old => old.name === next.name && old.type === next.type && old.protected === next.protected && old.hasValue);
        if (!next.protected || f.editValue !== '' || f.clear || !unchanged) next.value = f.editValue ?? '';
        return next;
      });
      if (new Set(fieldData.map(f => f.name)).size !== fieldData.length || fieldData.some(f => !f.name)) { message('Each field needs a unique name.', true); return false; }
      save.disabled = true;
      const saved = await operation(async () => {
        const result = await write(record ? `/records/${encodeURIComponent(record.id)}` : '/records', record ? 'PUT' : 'POST', { ...(record ? { version: record.version } : {}), name: name.value.trim(), serviceUrl: serviceUrl.value.trim(), template: template.value, fields: fieldData, acl: record?.acl || { mode: 'none', agents: [], active: true } });
        if (!live) return; selected = result.record.id; draftScope = null; publishDraft(); await load();
      }, 'Credential saved. Protected values cannot be viewed here.');
      return saved;
    }
    form.addEventListener('submit', e => { e.preventDefault(); return saveCredential(); });
    changed = bindDraft(form, () => {
      captureFields();
      return JSON.stringify([name.value, serviceUrl.value, template.value, draft.map(f => [f.name, f.type, f.protected, f.editValue, f.clear])]);
    }, saveCredential, save);
    panel.append(form);
  }
  function access(panel, record) {
    const box = el('section', null, 'setting-section settings-stack'); box.append(el('h2', `Agent access · ${record.name}`), el('p', record.acl.active ? 'Explicit access is independent of Burrow tool grants.' : 'Restored assignment inactive. Regrant access explicitly; editing the record does not reactivate it.', 'settings-help'));
    const mode = el('select'); for (const [value, text] of [['none', 'No agents'], ['agents', 'Selected agents'], ['all', 'All agents']]) { const option = el('option', text); option.value = value; mode.append(option); } mode.value = record.acl.mode; box.append(label('Access scope', mode));
    const choices = el('div', null, 'settings-stack'); choices.style.maxHeight = 'min(360px, 45dvh)'; choices.style.overflowY = 'auto'; const chosen = new Map(); const disabledIds = new Set(agents.filter(agent => agent.enabled === false).map(agent => agent.id));
    for (const agent of agents) { if (agent.enabled === false) continue; const checkbox = input('checkbox'); checkbox.checked = record.acl.agents.includes(agent.id); chosen.set(agent.id, checkbox); const item = el('label', null, 'settings-checkbox-row'); item.append(checkbox, el('span', agent.name || agent.id)); choices.append(item); }
    for (const id of record.acl.agents) if (!chosen.has(id) && !disabledIds.has(id)) choices.append(el('p', `${id} · unavailable; reassign access to remove this stale ID`, 'settings-help'));
    box.append(choices);
    const sync = () => { choices.hidden = mode.value !== 'agents'; choices.style.display = choices.hidden ? 'none' : ''; }; mode.addEventListener('change', sync); sync();
    async function saveAccess() {
      if (!live || busy) return false;
      const ids = [...chosen].filter(([, checkbox]) => checkbox.checked).map(([id]) => id);
      ids.push(...record.acl.agents.filter(id => disabledIds.has(id)));
      if (mode.value === 'agents' && !ids.length) { message('Choose at least one available agent.', true); return false; }
      return operation(async () => { await write(`/records/${encodeURIComponent(record.id)}/acl`, 'PUT', { version: record.version, acl: { mode: mode.value, agents: mode.value === 'agents' ? ids : [], active: true } }); if (!live) return; draftScope = null; publishDraft(); await load(); }, 'Agent access saved.');
    }
    const actions = el('div', null, 'model-actions');
    const save = button(record.acl.active ? 'Save access' : 'Regrant access', () => void saveAccess(), 'primary');
    actions.append(save); box.append(actions); panel.append(box);
    bindDraft(box, () => JSON.stringify([mode.value, [...chosen].map(([id, checkbox]) => [id, checkbox.checked])]), saveAccess, record.acl.active && record.acl.agents.every(id => chosen.has(id) || disabledIds.has(id)) ? save : null);
  }
  function extras(container, restoreContainer = null) {
    const portability = el('section', null, 'setting-section settings-stack'); portability.append(el('h2', 'Encrypted backup'));
    portability.append(el('p', 'Choose a separate backup passphrase (at least 12 characters). Keep the downloaded file and passphrase somewhere safe. Backups do not include this installation’s login password or audit history.', 'settings-help'));
    const pass = input('password'); pass.minLength = 12; pass.autocomplete = 'new-password'; portability.append(label('Backup passphrase', pass));
    portability.append(button('Download encrypted backup', () => {
      if (pass.value.length < 12) { message('Backup passphrase must be at least 12 characters.', true); return; }
      const phrase = pass.value; pass.value = '';
      void operation(async () => {
        const { backup } = await write('/backup', 'POST', { passphrase: phrase }); if (!live) return;
        const url = URL.createObjectURL(new Blob([backup], { type: 'application/json' }));
        try { const link = el('a'); link.href = url; link.download = 'goblin-secret-store-backup.json'; link.style.display = 'none'; view.append(link); link.click(); link.remove(); } finally { setTimeout(() => URL.revokeObjectURL(url), 60000); }
      }, 'Encrypted backup downloaded.');
    }, 'primary'));
    const restore = el('section', null, 'setting-section settings-stack'); restore.append(el('h2', 'Restore backup'));
    restore.append(el('p', 'Restore permanently replaces every current credential. All restored agent assignments will be inactive until you explicitly regrant them, including assignments to matching IDs. The current login password remains unchanged.', 'settings-help'));
    const file = input('file'); file.className = 'gss-backup-file'; file.accept = '.json,application/json'; restore.append(label('Encrypted backup file', file));
    const restorePass = input('password'); restorePass.autocomplete = 'off'; restore.append(label('Backup passphrase', restorePass));
    const confirm = input(); confirm.autocomplete = 'off'; restore.append(label('Type RESTORE to replace all credentials', confirm));
    restore.append(button('Replace credentials from backup', () => {
      if (!file.files?.[0] || !restorePass.value || confirm.value !== 'RESTORE') { message('Choose a backup, enter its passphrase, and type RESTORE.', true); return; }
      const phrase = restorePass.value, selectedFile = file.files[0]; restorePass.value = ''; confirm.value = ''; file.value = '';
      void operation(async () => { const backup = await selectedFile.text(); const result = await write('/restore', 'POST', { backup, passphrase: phrase }); selected = null; await load(); return result.restored; }, 'Restore completed. Regrant agent access explicitly.');
    }, 'danger')); container.append(portability); (restoreContainer || container).append(restore);
  }
  content.replaceChildren(el('p', 'Loading vault…'));
  void load();
  return () => { if (typeof setDraft === 'function') setDraft(null); live = false; unsubscribe(); abort.abort(); clearManagementState(); root.replaceChildren(); };
}
