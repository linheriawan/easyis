import { readdir } from 'node:fs/promises';
import { render } from './template.js';

// ---- file reading ----
// views and widgets are plain HTML text, not JS modules — read, not
// imported, so a file can be pure HTML with nothing else to learn.
//
// cached by mtime — a layout/widget/view is read from disk once and
// reused across requests until its file actually changes, so a live edit
// is picked up on the very next request with no restart needed, but an
// unchanged file isn't re-read on every single request either.
const cache = new Map();

async function read(name, dir) {
  const key = `${dir}/${name}`;
  // @etc only resolves for an import()/import specifier — new URL() does
  // plain relative-URL resolution and has no idea an alias even exists,
  // so a real file read like this one stays on a relative path.
  const file = Bun.file(new URL(`../etc/${dir}/${name}.html`, import.meta.url));
  const mtime = file.lastModified;

  const cached = cache.get(key);
  if (cached && cached.mtime === mtime) return cached.text;

  const text = await file.text();
  cache.set(key, { text, mtime });
  return text;
}

// ---- widget resolution ----
// an attribute value like "obj.name" is a dotted reference into ambient
// data, not a literal string, whenever its first segment matches a known
// data key — walked here rather than substituted verbatim. anything else
// (a plain "Name") is just a literal, unchanged.
function resolveExpr(expr, data) {
  const parts = expr.split('.');
  if (!data || !Object.prototype.hasOwnProperty.call(data, parts[0])) return expr;

  let value = data[parts[0]];
  for (const part of parts.slice(1)) {
    if (value == null) return '';
    value = value[part];
  }
  return value ?? '';
}

// a widget is plain markup, optionally with {#each}...{/each} (driven by
// ambient data — whatever the page/layout declared) and {attr}
// placeholders (driven by the usage tag's own attributes, which may
// themselves be dotted references into that same ambient data) — never a
// real custom element, never sent to the browser as a tag at all. a
// self-closing usage like <Inp type="text" /> is replaced in place with the
// widget's own rendered content. tag matching is case-insensitive and
// driven by whatever .html files exist in etc/widget/ — a widget never
// has to be declared, just used.
async function resolveWidgets(text, data) {
  const files = await readdir(new URL('../etc/widget/', import.meta.url));

  for (const file of files) {
    if (!file.endsWith('.html')) continue;
    const tag = file.slice(0, -'.html'.length);

    const usage = new RegExp(`<${tag}\\s*([^>]*?)/>`, 'gi');
    const matches = [...text.matchAll(usage)];
    if (!matches.length) continue;

    const template = await read(tag, 'widget');

    for (const [fullMatch, attrString] of matches) {
      const attrs = {};
      for (const [, key, value] of attrString.matchAll(/(\w+)="([^"]*)"/g)) {
        attrs[key] = resolveExpr(value, data);
      }
      // sensible defaults so a usage never leaves a literal {token} showing:
      // name/label can each fall back from the other, type defaults to
      // text, value defaults to empty.
      if (attrs.name === undefined && attrs.label !== undefined) attrs.name = String(attrs.label).toLowerCase();
      if (attrs.label === undefined && attrs.name !== undefined) attrs.label = attrs.name;
      if (attrs.type === undefined) attrs.type = 'text';
      if (attrs.value === undefined) attrs.value = '';

      // a usage with a values array (<Sel values="companies"
      // value="coa.companyid"/>) gets each item decorated with its own
      // `selected` flag right here — the template language has no
      // comparison operator to do this itself, so this is the one place
      // that logic can live without every caller recomputing it by hand
      // for every option in every list it builds. keyed off the
      // values/value attribute shape, not the widget's name — any future
      // widget built the same way gets this for free.
      if (Array.isArray(attrs.values)) {
        attrs.values = attrs.values.map((item) => ({
          ...item,
          selected: String(item.id) === String(attrs.value) ? 'selected' : '',
        }));
      }

      // attrs are merged into the scope a widget's OWN {#each} resolves
      // against — not just the flat replaceAll below. that's what lets a
      // usage like <Sel values="companies"/> work: resolveExpr above
      // already turned "companies" into the real array (not a string),
      // so the widget's own {#each values as c} finds it under the name
      // ITS template uses, same mechanism cnav uses for "menu" — just
      // sourced from an attribute instead of a fixed ambient key. safe
      // for every existing widget too: none of them have a {#each}, and
      // render()'s top-level (non-loop) text is never touched by scope
      // contents at all, only by the replaceAll pass below.
      let rendered = render(template, { ...data, ...attrs });
      for (const [key, value] of Object.entries(attrs)) {
        rendered = rendered.replaceAll(`{${key}}`, value);
      }
      text = text.replace(fullMatch, rendered);
    }
  }

  return text;
}

// `data` is whatever a Logic class hands in, e.g. html('home/index',
// { obj }) — the key you give it ({ obj }) is the name a view/widget
// references (obj.name). no scanning the file for embedded data — the
// caller is always the explicit source.
export async function html(name, data) {
  let text = await read(name, 'views');
  text = render(text, data ?? {});

  // a plain {key} in the view's own markup substitutes directly from a
  // matching top-level string/number in data — same idea as layout()'s
  // sections, just for a view rendered standalone (header.html's
  // {Account}, not something used as a widget).
  for (const [key, value] of Object.entries(data ?? {})) {
    if (typeof value === 'string' || typeof value === 'number') {
      text = text.replaceAll(`{${key}}`, value);
    }
  }

  return resolveWidgets(text, data ?? {});
}

// direct, PHP-style composition: the Logic class loads a layout and
// assigns each section's value itself — no markup scanning, no implicit
// wiring. sections is { name: renderedHtml }; data is whatever the layout's
// own widgets need (e.g. cnav's menu) — also always explicit, e.g.
//   layout('layout', { main: await html('home/index', { obj }) }, { menu })
export async function layout(name, sections, data) {
  let text = await read(name, 'views');
  for (const [section, content] of Object.entries(sections)) {
    text = text.replace(`{${section}}`, content);
  }
  // a slot not explicitly supplied (header, footer, ...) defaults to
  // empty rather than leaving a literal {token} visible in the page.
  text = text.replace(/\{(\w+)\}/g, '');
  return resolveWidgets(text, data ?? {});
}

// ---- base class for UI Logic classes ----
// this.render(name, data) renders a view and wraps it in this class's
// layout, so a method doesn't repeat the same lines every time. override
// `static layout` for a different shell, or skip this.render() and call
// html()/layout() directly to opt out of wrapping entirely for one method
// (an AJAX fragment, say).
export class Page {
  static layout = 'layout';

  // name defaults to ClassName(lowercase)/methodName — Router.resolve()
  // sets this.op to the method it's about to call, so Journal.reverse()
  // can just do `this.render()` and get journal/reverse for free, since
  // that's the view it would have named explicitly anyway.
  defaultView() {
    return `${this.constructor.name.toLowerCase()}/${this.op}`;
  }

  // override in a subclass to feed this class's own layout — call
  // super.layoutData() and merge in your own additions. return one flat
  // object: any STRING value becomes a layout section ({head}, {foot}, an
  // already-rendered html() fragment, ...); anything else (an object or
  // array, like menu) becomes ambient data for the layout's own widgets.
  // render() sorts that out automatically — a subclass never has to know
  // or care which bucket something belongs in.
  //
  // header/footer are rendered here, not per-subclass: cnav lives inside
  // header.html, and header.html only sees whatever data THIS html() call
  // hands it — menu has to be threaded in right here. every subclass used
  // to repeat this same call (and had to remember the menu part too —
  // easy to forget, since a page renders fine either way, just with a
  // silently empty nav). one copy means one place that can get it wrong.
  async layoutData() {
    const context = this.pre?.context ?? {};
    return {
      messages: this.pre?.prepResp() ?? [],
      ...context,
      header: await html('header', { Account: 'Asa', menu: context.menu }),
      footer: await html('footer', { version: 'v 0.0.1' }),
    };
  }

  async render(name, data) {
    const main = await html(name ?? this.defaultView(), data);
    const extra = await this.layoutData();

    const sections = { main };
    const ambient = {};
    for (const [key, value] of Object.entries(extra)) {
      if (typeof value === 'string') sections[key] = value;
      else ambient[key] = value;
    }

    return layout(this.constructor.layout, sections, ambient);
  }
}

export default Page;
