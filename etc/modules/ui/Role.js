import { Page } from '@lib/view.js';
import { permissionCatalog } from '@lib/modules.js';
import RoleApi from '@services/Role.js';
import PermissionApi, { grantKey } from '@services/Permission.js';

const roleApi = new RoleApi();
const permissionApi = new PermissionApi();

export default class Role extends Page {

  // DataTable-style list: params.q filters, params.page paginates — both
  // plain query-string values, picked up by router.js same as a :id path
  // segment would be. rows are shaped (and keyed) in display order so the
  // generic datatable widget can render them with no per-page code of
  // its own — see etc/widget/datatable.html.
  async index(params) {
    const { rows, pages, q } = await roleApi.list(params);

    const tableRows = rows.map((row) => ({
      ID: row.id,
      Name: row.name,
      '': `<a href="/system/role/${row.id}">Edit</a>`,
    }));

    return this.render(undefined, {
      rows: tableRows,
      columns: ['ID', 'Name', ''],
      pages: Array.from({ length: pages }, (_, i) => i + 1),
      q,
    });
  }

  // id === "new" is a blank header-detail form (create); any other id
  // loads that role's name plus its current grants, so the same page and
  // the same save() below serve both create and edit.
  async form({ id }) {
    const role = id === 'new' ? { id: 'new', name: '' } : await roleApi.get({ id });
    const granted = id === 'new' ? new Set() : await permissionApi.forRole(id);

    // module -> sub (one group per Logic class, e.g. "Journals") -> op —
    // three levels, so a sub's own checkbox loop only ever iterates its
    // method/op list, never re-walks (and re-labels) the sub itself.
    const catalog = await permissionCatalog();
    const groups = [];
    for (const entry of catalog) {
      let group = groups.find((g) => g.module === entry.moduleName);
      if (!group) {
        group = { module: entry.moduleName, subs: [] };
        groups.push(group);
      }
      let sub = group.subs.find((s) => s.sub === entry.sub);
      if (!sub) {
        sub = { sub: entry.sub, items: [] };
        group.subs.push(sub);
      }
      const key = grantKey(entry);
      sub.items.push({ op: entry.op, key, checkedAttr: granted.has(key) ? 'checked' : '' });
    }

    // template.js's {#each} engine only interpolates dotted paths inside
    // a loop body — plain top-level text (the form's own action="...")
    // never goes through that pass, so roleId is handed in flat: a plain
    // top-level string, which html()'s own substitution loop does catch.
    return this.render(undefined, { role, roleId: role.id, groups });
  }

  // one submit saves both the header (role.name) and the whole detail
  // grid (every box checked right now, not a diff) — role.id doesn't
  // exist yet for a new role until create() runs, so permission.save()
  // always runs second, against whichever id is now real.
  async save(params) {
    const role = params.id === 'new'
      ? await roleApi.create({ name: params.name })
      : await roleApi.update({ id: params.id, name: params.name });

    await permissionApi.save({ role_id: role.id, grants: params.grant });

    return this.pre.redirect('/system/role', 'Role saved successfully');
  }
}
