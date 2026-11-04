import { mountManagement } from './management.js';

export const settingsSections = [
  { id: 'credentials', label: 'Credentials', layout: 'form-inventory' },
  { id: 'sharing', label: 'Agent sharing', layout: 'form-inventory' },
  { id: 'backup', label: 'Backup & restore', layout: 'form' },
];

export function mountSettings({ section, primary, overflow, api, runtimeScope, modId, setDraft, navigate, confirm }) {
  // Opt owned surfaces into the existing normalized section/action grammar.
  // Do not modify host targets or add settings-content-workspace: the host
  // continues to own tracks, scrolling and responsive layout.
  const surface = () => {
    const node = document.createElement('div');
    node.className = 'settings-content-normalized settings-content-standard';
    node.style.overflow = 'visible';
    return node;
  };
  const root = surface();
  primary.replace(root);
  const detailRoot = overflow ? surface() : null;
  if (detailRoot) overflow.replace(detailRoot);
  if (![setDraft, navigate, confirm].every(method => typeof method === 'function')) {
    const error = document.createElement('p');
    error.className = 'settings-request-error'; error.setAttribute('role', 'alert');
    error.textContent = 'Update Burrow UI to use shared draft protection for GSS settings.';
    root.append(error);
    return () => { primary.clear(); overflow?.clear(); };
  }
  const cleanup = mountManagement({ root, detailRoot, api, section, runtimeScope, modId, setDraft, navigate, confirm });
  return () => { cleanup(); primary.clear(); overflow?.clear(); };
}
