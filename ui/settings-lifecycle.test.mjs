import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mountSettings, settingsSections } from './settings.js';
import { vaultSession } from './session.js';

class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.listeners = new Map(); this.value = ''; this.style = {}; this.textContent = ''; }
  append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  setAttribute(key, value) { this[key] = value; }
  addEventListener(key, callback) { this.listeners.set(key, callback); }
  descendants() { return this.children.flatMap(node => [node, ...node.descendants()]); }
  querySelectorAll() { return this.descendants().filter(node => ['input', 'select', 'textarea', 'button'].includes(node.tagName)); }
  fire(event) { this.listeners.get(event)?.({ preventDefault() {} }); if (['input', 'change'].includes(event)) this.parent?.fire(event); }
  click() { if (!this.disabled) return this.listeners.get('click')?.(); }
}
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); };
const record = { id: 'r1', name: 'Credential one', version: 'version-1', template: 'token', serviceUrl: '', fields: [{ name: 'token', type: 'token', protected: true, hasValue: true }], acl: { mode: 'none', agents: [], active: true } };
async function fixture(run, { handler, confirm = async () => false, overflow: hasOverflow = true, missingHost = false, section = 'credentials' } = {}) {
  const previous = globalThis.document; globalThis.document = { createElement: tag => new Element(tag) };
  const primary = { replace(node) { this.node = node; }, clear() { this.node = null; } };
  const overflow = hasOverflow ? { ...primary } : null;
  let draft, proceed;
  const calls = [];
  const api = async (path, init) => {
    calls.push([path, init]);
    const override = handler?.(path, init); if (override !== undefined) return override;
    if (path === '/status') return { authMode: 'core', authenticated: true };
    if (path === '/records') return { records: [structuredClone(record)] };
    if (path === '/templates') return { templates: [{ id: 'token', fields: [{ name: 'token', type: 'token', protected: true }] }] };
    if (path === '/agents') return [];
    if (path === '/records/r1') return { record: structuredClone(record) };
    throw new Error(`Unexpected ${path}`);
  };
  const cleanup = mountSettings({ section, primary, overflow, api, runtimeScope: 'local', modId: 'gss-lifecycle', ...(missingHost ? {} : { setDraft(next) { draft = next; }, navigate(next) { if (draft?.dirty) proceed = next; else next(); }, confirm }) });
  const nodes = () => [...(primary.node?.descendants() ?? []), ...(overflow?.node?.descendants() ?? [])];
  const find = text => nodes().find(node => node.textContent === text);
  try {
    await flush();
    await run({ find, calls, nodes, primary, overflow, cleanup, draft: () => draft, proceed: () => proceed?.() });
  } finally { cleanup(); globalThis.document = previous; }
}

test('Settings explicitly declares collection families and single backup scope', () => {
  assert.deepEqual(settingsSections.map(({ id, layout }) => [id, layout]), [['credentials', 'form-inventory'], ['sharing', 'form-inventory'], ['backup', undefined]]);
});
test('old host fails closed before fetching vault metadata', async () => fixture(({ calls, nodes }) => {
  assert.equal(calls.length, 0);
  assert.ok(nodes().some(node => /Update Burrow UI/.test(node.textContent)));
}, { missingHost: true }));
test('inventory uses selected native controls, bounded scrolling and a disclosed no-overflow fallback', async () => fixture(({ find, nodes }) => {
  const picker = find('Credential one'); picker.click();
  assert.equal(find('Credential one')['aria-pressed'], 'true');
  assert.ok(nodes().some(node => node.tagName === 'details' && node.className === 'settings-disclosure'));
  assert.ok(nodes().some(node => node.className === 'memory-connection-list' && node.style.overflowY === 'auto'));
}, { overflow: false }));
test('draft becomes clean again when edited values are reverted', async () => fixture(({ find, draft }) => {
  find('Credential one').click();
  const name = find('Credential name (public)').children[0];
  name.value = 'changed'; name.fire('input'); assert.equal(draft().dirty, true);
  name.value = record.name; name.fire('input'); assert.equal(draft().dirty, false);
  assert.equal(find('Save credential').disabled, true);
}));
test('rejected save keeps dirty draft and protected value and permits retry', async () => fixture(async ({ find, draft }) => {
  find('Credential one').click();
  const value = find('Field value').children[0]; value.value = 'synthetic-test-secret'; value.fire('input');
  assert.equal(await draft().save(), false);
  assert.equal(draft().dirty, true); assert.equal(draft().busy, false);
  assert.equal(value.value, 'synthetic-test-secret'); assert.equal(find('Save credential').disabled, false);
}, { handler: (path, init) => path === '/records/r1' && init.method === 'PUT' ? Promise.reject(new Error('Version conflict; reload required.')) : undefined }));
test('delete uses shared confirmation and cancellation does not write or discard edits', async () => fixture(async ({ find, calls, draft }) => {
  find('Credential one').click(); const name = find('Credential name (public)').children[0]; name.value = 'changed'; name.fire('input');
  await find('Delete credential').click();
  assert.equal(calls.some(([, init]) => init.method === 'DELETE'), false);
  assert.equal(draft().dirty, true); assert.equal(name.value, 'changed');
}));
test('late confirmed delete after disposal cannot issue a mutation', async () => {
  let resolve;
  await fixture(async ({ find, cleanup, calls }) => {
    find('Credential one').click(); const pending = find('Delete credential').click();
    cleanup(); resolve(true); await pending;
    assert.equal(calls.some(([, init]) => init.method === 'DELETE'), false);
  }, { confirm: () => new Promise(done => { resolve = done; }) });
});
test('busy writes are deduplicated, disable controls and cannot re-register after disposal', async () => {
  let resolve;
  await fixture(async ({ find, calls, draft, cleanup }) => {
    find('Credential one').click(); const value = find('Field value').children[0]; value.value = 'synthetic-test-secret'; value.fire('input');
    const save = draft().save; const pending = save();
    assert.equal(draft().busy, true); assert.equal(value.disabled, true); assert.equal(await save(), false);
    assert.equal(calls.filter(([, init]) => init.method === 'PUT').length, 1);
    cleanup(); resolve({ record }); await pending; assert.equal(draft(), null);
  }, { handler: (path, init) => path === '/records/r1' && init.method === 'PUT' ? new Promise(done => { resolve = done; }) : undefined });
});
test('successful commit followed by refresh failure stays clean and reports both outcomes', async () => {
  let wrote = false;
  await fixture(async ({ find, draft, nodes }) => {
    find('Credential one').click(); const name = find('Credential name (public)').children[0]; name.value = 'changed'; name.fire('input');
    assert.equal(await draft().save(), true); assert.equal(draft().dirty, false);
    assert.ok(nodes().some(node => node.role === 'alert' && /Credential saved.*Could not load vault/.test(node.textContent)));
  }, { handler: (path, init) => {
    if (path === '/records/r1' && init.method === 'PUT') { wrote = true; return { record }; }
    if (path === '/records' && wrote) return Promise.reject(new Error('Refresh failed.'));
  } });
});

test('confirmation from an invalidated session cannot delete after a fresh authenticated load', async () => {
  let resolve;
  await fixture(async ({ find, calls }) => {
    find('Credential one').click(); const pending = find('Delete credential').click();
    vaultSession('local', 'gss-lifecycle').invalidate(''); await flush();
    resolve(true); await pending;
    assert.equal(calls.some(([, init]) => init.method === 'DELETE'), false);
  }, { confirm: () => new Promise(done => { resolve = done; }) });
});
test('stale-only ACL cleanup remains an explicit enabled action without editing another grant', async () => fixture(async ({ find, calls }) => {
  find('Credential one').click();
  const save = find('Save access'); assert.equal(Boolean(save.disabled), false); await save.click(); await flush();
  assert.deepEqual(JSON.parse(calls.find(([path]) => path.endsWith('/acl'))[1].body).acl, { mode: 'agents', agents: ['disabled'], active: true });
}, { section: 'sharing', handler: (path) => {
  if (path === '/records') return { records: [{ ...structuredClone(record), acl: { mode: 'agents', agents: ['disabled', 'missing'], active: true } }] };
  if (path === '/agents') return [{ id: 'disabled', enabled: false }];
  if (path.endsWith('/acl')) return { record };
} }));
test('none/all sharing scopes hide agent choice container even with shared grid styles', async () => fixture(({ find, nodes }) => {
  find('Credential one').click(); const scope = find('Access scope').children[0];
  const choices = nodes().find(node => node.style.maxHeight === 'min(360px, 45dvh)');
  assert.equal(choices.hidden, true); assert.equal(choices.style.display, 'none');
  scope.value = 'agents'; scope.fire('change'); assert.equal(choices.hidden, false); assert.equal(choices.style.display, '');
  scope.value = 'all'; scope.fire('change'); assert.equal(choices.hidden, true); assert.equal(choices.style.display, 'none');
}, { section: 'sharing' }));

test('owned Settings surfaces opt into shared normalization without replacing host layout or scroll ownership', async () => fixture(({ primary, overflow }) => {
  for (const surface of [primary.node, overflow.node]) {
    assert.equal(surface.className, 'settings-content-normalized settings-content-standard');
    assert.equal(surface.style.overflow, 'visible');
    assert.equal(surface.className.includes('settings-content-workspace'), false);
  }
}));
