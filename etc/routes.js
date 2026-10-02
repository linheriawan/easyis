// crude CRUD (list/get/create/update/delete) is not declared here —
// it's auto-derived from the presence of a schema/*.js file.
// this file only declares extended operations: ones that don't map
// 1:1 to a single table and instead run through a Logic class.
//
// each entry is 'modules/path/Class/method' — split on the last '/' into
// the file to import and the method to call. use { logic, op } instead
// of a string on any entry that needs more fields later. a process gets
// its own subfolder when it needs one (modules/api/incoming_payment/,
// modules/api/sales_order/, ...) — the module (finance, sales, ...) is
// never its own directory, just implied by the process name.
const ui_pfx = '';
const ui_loc = 'etc/modules/ui/';

const api_pfx = '/api/v1';
const api_loc = 'etc/modules/services/';
const mcp_loc = 'etc/modules/mcp/';

/*Finance & Accounting Module*/
const accounting = {
  '/journal/:id/post': `${api_loc}Journal/posting`,
  '/journal/:id/reverse': `${api_loc}Journal/reverse`,
  // General Ledger inquiry submodule — ledger is a derived, read-only
  // table (see schema/table/ledger.js's ops), so only list/get exist.
  '/ledger': `${api_loc}Ledger/list`,
  '/ledger/:id': `${api_loc}Ledger/get`,
};

// master data — shared reference data other modules depend on, not owned
// by any one business module. COA is accounting's own dependency on it;
// other modules will add their own master entries here the same way.
const master = {
  '/coa': `${api_loc}Coa/list`,
  '/coa/:id': `${api_loc}Coa/get`,
  // same-path, verb-dispatched REST (GET /coa = list, POST /coa = create)
  // isn't something the router supports yet — distinct paths per op, same
  // as journal's :id/post vs :id/reverse, until that's built.
  '/coa/create': `${api_loc}Coa/create`,
  '/coa/:id/update': `${api_loc}Coa/update`,
  // coa.js's companyid relation needs a real company table/service behind
  // it — no UI of its own yet, just the same crude CRUD shape.
  '/company': `${api_loc}Company/list`,
  '/company/:id': `${api_loc}Company/get`,
  '/company/create': `${api_loc}Company/create`,
  '/company/:id/update': `${api_loc}Company/update`,
};

// system — user/role/permission administration.
const system = {
  '/role': `${api_loc}Role/list`,
  '/role/:id': `${api_loc}Role/get`,
  '/role/create': `${api_loc}Role/create`,
  '/role/:id/update': `${api_loc}Role/update`,
};

const others = {
  '/:name': "etc/modules/dummy/hello",
};

export const api = {
  name:'REST API', serve: 3000,
  type: 'json',
  ep: { ...accounting, ...master, ...system, ...others }
};

export const webui = {
  name:'WEB UI', serve: 8008,
  type: 'html',
  pre: 'Pre',
  static: 'static',
  // ordered — only steps listed here run, in this exact order. api/mcp
  // below declare no config_flow at all, so none of this runs for them,
  // even though mcp still sets `pre`.
  config_flow: [
    { authentication: { fail: 'Unauthenticated access' } },
    { layoutData: {} },
    { log: 'console' },
    { log: 'file:access.log' },
  ],
  ep: {
    '/home': `${ui_loc}Home/index`,
    '/journal/:id/post': `${ui_loc}Journal/posting`,
    '/journal/:id/reverse': `${ui_loc}Journal/reverse`,
    // :id doubles as the literal "new" for a blank create form — the same
    // page (and the same save route below) handles create and edit.
    '/system/role': `${ui_loc}Role/index`,
    '/system/role/:id': `${ui_loc}Role/form`,
    '/system/role/:id/save': `${ui_loc}Role/save`,
    '/master/coa': `${ui_loc}Coa/index`,
    '/master/coa/:id': `${ui_loc}Coa/form`,
    '/master/coa/:id/save': `${ui_loc}Coa/save`,
  }
};

export const mcp = {
  name:'MCP Server', serve: 1001,
  type: 'json',
  pre: 'Pre',
  ep: {
    '/fs_read': `${mcp_loc}fs/read`,
  }
};
