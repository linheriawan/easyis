import * as flash from './flash.js';

// a route entry is either a plain string ('modules/path/Class/method', split
// on the last '/') or an explicit { logic, op } object for routes that need
// more fields later — both are supported so most entries can stay terse.
function resolveDef(raw) {
  if (typeof raw !== 'string') return raw;
  const i = raw.lastIndexOf('/');
  return { logic: raw.slice(0, i), op: raw.slice(i + 1) };
}

// more literal segments = more specific — sorted once per table (at
// Router construction, not per-request) so a specific route always wins
// over a generic :param one at the same position, regardless of
// declaration order. e.g. /coa/create vs /coa/:id: without this, whichever
// was declared first would shadow the other for any path they both match.
function literalSegmentCount(pattern) {
  return pattern.split('/').filter((p) => p && !p.startsWith(':')).length;
}

function sortBySpecificity(table) {
  return Object.entries(table).sort((a, b) => literalSegmentCount(b[0]) - literalSegmentCount(a[0]));
}

function matchRoute(entries, pathname) {
  for (const [pattern, raw] of entries) {
    const patternParts = pattern.split('/').filter(Boolean);
    const pathParts = pathname.split('/').filter(Boolean);
    if (patternParts.length !== pathParts.length) continue;

    const params = {};
    const matched = patternParts.every((part, i) => {
      if (part.startsWith(':')) {
        params[part.slice(1)] = pathParts[i];
        return true;
      }
      return part === pathParts[i];
    });

    if (matched) return { def: resolveDef(raw), params };
  }
  return null;
}

// distinguishes "no route / method denied" from "route matched and the
// Logic method legitimately returned null" — collapsing both to the same
// value would make .json()/.html() 404 on a real, empty-but-valid result.
const NO_MATCH = Symbol('no-match');

// a GET's filter/pagination (?q=&page=) and a POST's form fields both end
// up as plain values on `params`, same as a :id path segment — a Logic
// method never has to know whether something came from the path, the
// query string, or the body, it just reads params.whatever. formData()
// handles both x-www-form-urlencoded and multipart without extra parsing;
// a repeated field name (a detail grid's checkboxes, say) comes back as
// an array instead of overwriting itself.
async function parseBody(req) {
  const contentType = req.headers.get('content-type') ?? '';
  if (!/form|multipart/.test(contentType)) return {};

  const form = await req.formData();
  const body = {};
  for (const key of new Set(form.keys())) {
    const values = form.getAll(key);
    body[key] = values.length > 1 ? values : values[0];
  }
  return body;
}

// created fresh per request by Router.handle() — never shared, so
// concurrent requests can't see each other's result.
class PendingRoute {
  constructor(tables, req, preprocess, configFlow) {
    this.tables = tables;
    this.req = req;
    this.preprocess = preprocess;
    this.configFlow = configFlow ?? [];
  }

  async resolve() {
    const { pathname, searchParams } = new URL(this.req.url);

    let match = null;
    for (const table of this.tables) {
      match = matchRoute(table, pathname);
      if (match) break;
    }
    if (!match) return NO_MATCH;

    const { def } = match;
    // precedence low -> high: query string, then body — a form resubmit
    // can override a stray query param, but a path segment (:id) always
    // wins over both, since that's the one piece of the URL a client
    // can't accidentally shadow with a form field named the same thing.
    const params = { ...Object.fromEntries(searchParams), ...(await parseBody(this.req)), ...match.params };

    const module = await import(`../${def.logic}.js`);
    const Logic = module.default;

    // verb policy lives on the Logic class itself, not the route table —
    // entity-backed classes import `ops` from their schema, standalone
    // classes declare `static ops` inline. undeclared class or undeclared
    // op = unrestricted; only an explicit `false`, or a method that doesn't
    // match the declared one, denies.
    const rule = Logic.ops?.[def.op];
    if (rule === false || (rule && rule !== this.req.method)) return NO_MATCH;

    const instance = new Logic();
    instance.op = def.op;

    // config_flow is an ORDERED list of { stepName: stepConfig } — only
    // steps actually listed here run at all, in this exact order. a route
    // group with no "authentication" entry never runs it, full stop.
    // multiple Log steps fire in parallel (console + file don't block
    // each other); every other step runs in sequence, awaited before the
    // next one starts. a step is a soft pipeline by default (def.op still
    // runs no matter what it returns) UNLESS it returns a real Response
    // (e.g. authentication's `fail` status) — that's a hard gate: this
    // request stops right here, def.op and every later step never run.
    let notice = '';
    if (this.preprocess !== null) {
      const preModule = await import(`./${this.preprocess}.js`);
      const Pre = preModule.default;
      instance.pre = new Pre(this.req, def, params);

      const logJobs = [];
      for (const step of this.configFlow) {
        const [stepName, stepConfig] = Object.entries(step)[0];
        const handler = instance.pre[stepName];
        if (typeof handler !== 'function') continue;

        if (stepName === 'log') {
          logJobs.push(handler.call(instance.pre, stepConfig, `${this.req.method} ${pathname}`));
          continue;
        }

        const stepResult = stepName === 'authentication'
          ? await handler.call(instance.pre, stepConfig)
          : await handler.call(instance.pre, stepConfig, params);

        if (stepResult instanceof Response) {
          if (logJobs.length) await Promise.all(logJobs);
          return stepResult;
        }
        if (stepName === 'authentication') notice += stepResult ?? '';
      }
      if (logJobs.length) await Promise.all(logJobs);
    }

    const result = await instance[def.op](params);
    // a Logic method can take full control the same way — e.g.
    // `return this.pre.redirect('/journal', 'Posted successfully')` after
    // a submit — passed straight through, bypassing notice/HTML
    // composition entirely.
    if (result instanceof Response) return result;

    // notice is left un-concatenated here on purpose — it's HTML text,
    // and `result` isn't always: an api route with pre/config_flow (once
    // one exists) returns JSON data, and `notice + {...}` would silently
    // corrupt it into "[object Object]". html() below is the only place
    // that actually stitches notice onto result; json() ignores notice
    // entirely (its own soft-fail messages still reach the client via
    // instance.pre.messages / the messages widget, just not this way).
    return { result, notice, pre: instance.pre };
  }

  async json() {
    const resolved = await this.resolve();
    if (resolved === NO_MATCH) return null;
    if (resolved instanceof Response) return resolved;
    // '*' unblocks local dev across ports (3000 api / 8008 ui count as
    // different origins to the browser) — scope this to a real allowlist
    // before anything but localhost can reach it.
    return Response.json(resolved.result ?? null, {
      headers: { 'access-control-allow-origin': '*' },
    });
  }

  async html() {
    const resolved = await this.resolve();
    if (resolved === NO_MATCH) return null;
    if (resolved instanceof Response) return resolved;

    const headers = { 'content-type': 'text/html' };
    // a flash message is only meant to show once — clear it the moment
    // it's been read into this response, so reloading the page (or any
    // later request) doesn't show it again.
    if (resolved.pre?.messages?.length) headers['set-cookie'] = flash.clearHeader();

    return new Response((resolved.notice ?? '') + (resolved.result ?? ''), { headers });
  }
}

export class Router {
  constructor(tables, preprocess = null, configFlow = []) {
    this.tables = tables.map(sortBySpecificity);
    this.preprocess = preprocess;
    this.configFlow = configFlow;
  }

  // synchronous — returns a PendingRoute immediately so callers can chain
  // straight onto .json()/.html() with a single await at the end:
  //   await apiRoute.handle(req).json()
  handle(req) {
    return new PendingRoute(this.tables, req, this.preprocess, this.configFlow);
  }
}
