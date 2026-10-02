import { appendFile } from 'node:fs/promises';
import { toList } from './types.js';
import { loadModules, moduleList } from './modules.js';
import * as flash from './flash.js';
import * as identity from '@schema/view/identity.js';
import * as role from '@schema/table/role.js';

// sample rows — stand-ins until there's a real DB layer to read these
// from. shape matches user.js/role.js exactly, so swapping this for a
// real query later doesn't change anything downstream.
const sampleUsers = [{ id: 'u1', name: 'Asa', company: 'IAS', roleid: 'r1' }];
const sampleRoles = [{ id: 'r1', name: 'Admin' }, { id: 'r2', name: 'Editor' }];

export default class Pre {
  constructor(req, cls, opr) {
    this.req = req;
    this.cls = cls;
    this.opr = opr;
    this.authed = new URL(req.url).searchParams.get('auth') === 'yes';
    // populated by the layoutData step (see etc/schema/view/identity.js
    // for Identity's shape) — Page.layoutData() reads this back.
    this.context = {};
    // whatever a previous request flashed for this one (see redirect()
    // below) — read once, up front, so prepResp() can hand it to
    // layoutData() regardless of whether "authentication" even runs.
    this.messages = flash.read(req);
  }

  // empty when authenticated. unauthenticated behavior depends on the
  // *type* of this step's `fail` config — a number is a hard gate, a
  // string is a soft one:
  //   { authentication: { fail: 401 } }                   — hard: router.js
  //     sees the returned Response and stops the request right here,
  //     def.op and every later step never run.
  //   { authentication: { fail: 'Unauthenticated access' } } — soft: the
  //     text is pushed onto this.messages (the same array a redirect's
  //     flash cookie feeds into — see redirect() below), then falls
  //     through to '' so the pipeline continues normally. prepResp() ->
  //     layoutData() -> the messages widget picks it up same as any
  //     other message, rendered in this same response — no redirect or
  //     cookie needed, since there's no next request to carry it to.
  // no `fail` at all keeps the old plain-HTML-notice behavior.
  authentication(config) {
    if (this.authed) return '';
    if (typeof config?.fail === 'number') return new Response('Unauthorized', { status: config.fail });
    if (typeof config?.fail === 'string') {
      this.messages.push(config.fail);
      return '';
    }
    return '<p class="notice">You are browsing as a guest. <a href="?auth=yes">Sign in</a>.</p>';
  }

  // for a Logic method that just finished a submit and wants the *next*
  // page to say so — e.g. `return this.pre.redirect('/journal', 'Posted
  // successfully')`. router.js passes a returned Response straight
  // through, so this bypasses the normal view/layout render entirely; the
  // message rides in a cookie to the page the browser lands on next,
  // where it's read back by the constructor above and rendered by the
  // messages widget.
  redirect(url, message) {
    const headers = { Location: url };
    if (message) headers['set-cookie'] = flash.setHeader([message]);
    return new Response(null, { status: 303, headers });
  }

  async layoutData() {
    this.context.Identity = this.authed ? identity.resolve(sampleUsers[0], sampleRoles) : null;
    // toList() reduces role's rows to { id: label } — this is what the
    // README's "some of it can be registered to KV_Vars" means: a
    // standard schema's rows, shaped for a dropdown/lookup.
    this.context.KV_Vars = { roles: toList(role, sampleRoles) };
    // raw modules.json, plus the nested [{name, subs}] shape cnav renders
    // via {#each menu as mod} / {#each Object.entries(mod.subs) as ...}.
    const modules = await loadModules();
    this.context.Modules = modules;
    this.context.menu = moduleList(modules);
  }

  // two Log steps (console + file) run in parallel — see router.js,
  // which fires every Log step without waiting on the previous one.
  log(target, entry) {
    const line = `[${new Date().toISOString()}] ${entry}`;
    if (target === 'console') {
      console.log(line);
      return;
    }
    if (typeof target === 'string' && target.startsWith('file:')) {
      return appendFile(target.slice('file:'.length), line + '\n');
    }
  }

  prepResp() {
    return this.messages;
  }

  getACL(role) { }

  allowCors() { }
  startTrace() { }
  logAccess() { }
  partyHealth() { }

}
