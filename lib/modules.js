import * as routeConfigs from '@etc/routes.js';

// modules.json describes the app's module map at the business level
// (accounting, master, system, ...) — this file cross-checks it against
// what actually exists on disk/in routes.js, and separately makes the
// raw data available for anything that wants to render it (a nav menu).

// a jsconfig @alias only ever resolves for an import()/import specifier —
// new URL() has no idea what an alias is, it just does plain relative-URL
// resolution against import.meta.url, so every file-system read below
// (not a module import) stays on a real relative path on purpose.
export async function loadModules() {
  const file = Bun.file(new URL('../etc/modules.json', import.meta.url));
  return JSON.parse(await file.text());
}

function lastSegment(path) {
  return path.split('/').filter(Boolean).pop();
}

// a sub's value is either the old plain-string shorthand ("ledger/") or
// the richer { path, ops } form — ops is how an admin-configurable
// permission catalog and this integrity check both learn what's actually
// grantable for that sub, without that list being hardcoded in a Logic
// class file anywhere. the plain-string form still works; it just has no
// ops to check.
function subPath(value) {
  return typeof value === 'string' ? value : value.path;
}

function subOps(value) {
  return typeof value === 'string' ? undefined : value.ops;
}

// shapes modules.json into [{ name, subs: { path: label, ... } }, ...] —
// plain array for the outer {#each menu as mod} loop, Object.entries for
// the inner {#each Object.entries(mod.subs) as [link, name]} loop. subs is
// flipped from modules.json's authored { label: path } to { path: label }
// so [link, name] destructuring lines up with what the names say: link is
// the href, name is the display text.
export function moduleList(modules) {
  return modules.map((entry) => {
    const [, mod] = Object.entries(entry)[0];
    const subs = {};
    for (const sub of mod.subs) {
      const [label, value] = Object.entries(sub)[0];
      subs[`/${subPath(value)}`] = label;
    }
    return { name: mod.name, subs };
  });
}

// flattens modules.json into one row per grantable (module, sub, op) —
// the catalog a role's permission grid renders and checks boxes against.
// a sub with no declared ops contributes nothing (there's nothing to
// grant yet), same as the integrity check treats it.
export async function permissionCatalog() {
  const modules = await loadModules();
  const catalog = [];
  for (const entry of modules) {
    const [modKey, mod] = Object.entries(entry)[0];
    for (const sub of mod.subs) {
      const [label, value] = Object.entries(sub)[0];
      for (const op of subOps(value) ?? []) {
        catalog.push({ module: modKey, moduleName: mod.name, sub: label, op });
      }
    }
  }
  return catalog;
}

function capitalize(name) {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

async function fileExists(relativeUrl) {
  return Bun.file(new URL(relativeUrl, import.meta.url)).exists();
}

async function schemaExists(name) {
  return (await fileExists(`../etc/schema/table/${name}.js`)) ||
    (await fileExists(`../etc/schema/view/${name}.js`));
}

// resolves straight to the Logic class (not just a boolean) so the op
// check below can inspect its prototype without importing it a second
// time — services takes priority over ui since that's where the real ops
// policy (static ops) normally lives.
async function resolveLogicClass(name) {
  const Name = capitalize(name);
  for (const dir of ['services', 'ui']) {
    const relativeUrl = `../etc/modules/${dir}/${Name}.js`;
    if (await fileExists(relativeUrl)) {
      const mod = await import(relativeUrl);
      return mod.default;
    }
  }
  return null;
}

// a route string is 'modules/path/Class/method' — strip the trailing
// /method the same way router.js's resolveDef does, then check whether
// what's left points at this name's Logic class.
function routeExists(name) {
  const needle = `/${capitalize(name)}`;
  for (const config of Object.values(routeConfigs)) {
    if (!config?.ep) continue;
    for (const raw of Object.values(config.ep)) {
      const logicPath = typeof raw === 'string' ? raw.slice(0, raw.lastIndexOf('/')) : raw.logic;
      if (logicPath?.endsWith(needle)) return true;
    }
  }
  return false;
}

// ansi codes — bold for headers, green/red for the pass/fail of each check.
// streamed as each item is checked (not batched) so the check's own
// progress is visible if a step is ever slow (e.g. a future disk-heavy one).
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';

function status(ok) {
  return ok ? `${GREEN}exists${RESET}` : `${RED}missing${RESET}`;
}

function opStatus(ok) {
  return ok ? `${GREEN}implemented${RESET}` : `${RED}missing${RESET}`;
}

export async function checkIntegrity() {
  const modules = await loadModules();

  for (const entry of modules) {
    const [modKey, mod] = Object.entries(entry)[0];
    console.log(` ${BOLD}${modKey}:${RESET}`);
    for (const sub of mod.subs) {
      const [label, value] = Object.entries(sub)[0];
      console.log(`   ${BOLD}${label}:${RESET}`);
      const path = subPath(value);
      const ops = subOps(value);
      const name = lastSegment(path);

      const hasRoute = routeExists(name);
      const hasSchema = await schemaExists(name);
      const Logic = await resolveLogicClass(name);
      console.log( `    route ${status(hasRoute)},    schema ${status(hasSchema)},    module ${status(Logic !== null)}` );

      // an op is only worth checking once the class itself exists —
      // without it every op is trivially "missing", which is just noise
      // on top of what "module missing" above already said. this is the
      // same check a permission catalog derived from modules.json would
      // need, so a declared op never silently assumes a method that was
      // never actually written.
      if (Logic !== null && ops?.length) {
        for (const op of ops) {
          console.log(`      ${op}: ${opStatus(typeof Logic.prototype[op] === 'function')}`);
        }
      }
    }
  }
}
