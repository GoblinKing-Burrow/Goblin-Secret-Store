import { createHash } from "node:crypto";
import { Store, templates, fail } from "./store.mjs";
// Adapt accepted metadata to Core's bounded reference/label grammar, not vice versa.
// Keep existing short references stable; hash UTF-16 code units for every JS name,
// including names containing lone surrogates that URI encoding cannot represent.
const fieldKey = (name) => createHash("sha256").update(Buffer.from(name, "utf16le")).digest("hex");
const credentialReference = (record, field) => {
  try {
    const path = `${record.id}/${encodeURIComponent(field.name)}`;
    if (path.length <= 512) return `{{gss:${path}}}`;
  } catch (error) {
    if (!(error instanceof URIError)) throw error;
  }
  return `{{gss:${record.id}/sha256/${fieldKey(field.name)}}}`;
};
const shorten = (text, max) => {
  if (text.length <= max) return text;
  // Do not split a surrogate pair at the display boundary.
  let end = max - 1;
  if (/[\uD800-\uDBFF]/.test(text[end - 1])) end--;
  return `${text.slice(0, end)}…`;
};
const credentialLabel = (record, field) => {
  const label = `${record.name} — ${field.name}`;
  return label.length <= 240 ? label : `${shorten(record.name, 240 - 3 - field.name.length)} — ${field.name}`;
};
export function activate(context) {
  let limits = {};
  if (process.env.GSS_LIMITS_JSON) {
    try {
      limits = JSON.parse(process.env.GSS_LIMITS_JSON);
      for (const [k, v] of Object.entries(limits))
        if (
          ![
            "records",
            "fields",
            "valueBytes",
            "bodyBytes",
            "audit",
            "refs",
            "sessionMs",
            "refMs",
          ].includes(k) ||
          !Number.isSafeInteger(v) ||
          v < 1
        )
          throw Error();
    } catch {
      fail("invalid_limits", 500);
    }
  }
  const store = new Store({ limits });
  const route = (method, path, handler, publicRoute = false) =>
    context.api[method](path, async (req) => {
      try {
        if (
          Buffer.byteLength(JSON.stringify(req.body ?? {})) >
          store.limits.bodyBytes
        )
          fail("body_limit", 413);
        if (publicRoute) store.observe(req.auth);
        else store.require(req);
        return {
          status: 200,
          headers: { "cache-control": "no-store" },
          body: await handler(req),
        };
      } catch (e) {
        return {
          status: e.statusCode || 500,
          headers: { "cache-control": "no-store" },
          body: { error: e.statusCode ? e.message : "internal_error" },
        };
      }
    });
  route(
    "get",
    "/status",
    (r) => ({
      authMode: store.mode,
      initialized: !!store.config("password"),
      authenticated: store.authenticated(r),
    }),
    true,
  );
  route("post", "/bootstrap", (r) => store.login(r, true), true);
  route("post", "/login", (r) => store.login(r), true);
  route("post", "/logout", (r) => {
    store.sessions.delete(
      r.headers?.["x-gss-session"] || r.headers?.["X-GSS-Session"],
    );
    return { ok: true };
  });
  route("get", "/templates", () => ({ templates }));
  route("get", "/agents", () => context.agents.list());
  route("get", "/records", () => ({
    records: store.all().map((r) => store.view(r)),
  }));
  route("post", "/records", (r) => ({ record: store.put(r.body) }));
  route("get", "/records/:id", (r) => ({
    record: store.view(store.raw(r.params.id)),
  }));
  route("put", "/records/:id", (r) => ({
    record: store.put(r.body, r.params.id),
  }));
  route("put", "/records/:id/acl", (r) => ({
    record: store.setAcl(r.params.id, r.body),
  }));
  route("delete", "/records/:id", (r) =>
    store.remove(r.params.id, r.body?.version),
  );
  route("get", "/audit", (r) => store.auditPage(r.query));
  route("post", "/backup", (r) => store.backup(r.body?.passphrase));
  route("post", "/restore", (r) =>
    store.restore(r.body?.passphrase, r.body?.backup),
  );
  context.secretReferences?.register({
    scheme: "gss",
    list: () => ({
      references: store.all().flatMap((record) => record.fields
        .filter((field) => field.protected)
        .map((field) => ({
          reference: credentialReference(record, field),
          label: credentialLabel(record, field),
          type: ["credential", "secret", "token", "password", "private-key"].includes(field.type) ? field.type : "secret",
          ...Object.fromEntries(record.fields.filter((candidate) => !candidate.protected && ["username", "url", "service"].includes(candidate.type)).map((candidate) => [candidate.type, candidate.value])),
        }))),
    }),
    resolve: (reference) => {
      const match = typeof reference === "string" ? reference.match(/^\{\{gss:([a-f0-9-]{36})\/(?:(sha256)\/([a-f0-9]{64})|([^{}]+))\}\}$/) : null;
      if (!match) fail("invalid_reference", 400);
      const record = store.raw(match[1]);
      let name;
      try { if (!match[2]) name = decodeURIComponent(match[4]); }
      catch { fail("invalid_reference", 400); }
      const field = record.fields.find((candidate) => candidate.protected &&
        (match[2] ? fieldKey(candidate.name) === match[3] : candidate.name === name));
      if (!field) fail("invalid_reference", 400);
      return { value: store.protectedValue(record, field) };
    },
  });
  for (const action of ["list", "read", "use"])
    context.tools.register({
      name: `gss_${action}`,
      availability: "mod-authorized",
      description: `${action} authorized Goblin Secret Store records; protected values are managed runtime references, never plaintext.`,
      inputSchema: {
        type: "object",
        properties:
          action === "list"
            ? {}
            : {
                id: { type: "string" },
                ...(action === "use" ? { field: { type: "string" } } : {}),
              },
        required:
          action === "list" ? [] : action === "use" ? ["id", "field"] : ["id"],
        additionalProperties: false,
      },
      handler: (args, caller) => store.agent(action, args, caller),
      ...(action === "use"
        ? {
            resolveProtectedReference: (ref, caller) =>
              store.resolve(ref, caller),
          }
        : {}),
    });
  return () => store.close();
}
