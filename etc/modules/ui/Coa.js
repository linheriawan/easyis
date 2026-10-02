import { Page } from '@lib/view.js';
import CoaApi from '@services/Coa.js';
import CompanyApi from '@services/Company.js';

const coaApi = new CoaApi();
const companyApi = new CompanyApi();

export default class Coa extends Page {

  // DataTable-style list, same pattern as Role's.
  async index(params) {
    const { rows, pages, q } = await coaApi.list(params);

    const tableRows = rows.map((row) => ({
      Code: row.code,
      Name: row.name,
      Type: row.type,
      '': `<a href="/master/coa/${row.id}">Edit</a>`,
    }));

    return this.render(undefined, {
      rows: tableRows,
      columns: ['Code', 'Name', 'Type', ''],
      pages: Array.from({ length: pages }, (_, i) => i + 1),
      q,
    });
  }

  // id === "new" is a blank form (create); any other id loads that
  // account's own row — same create/edit unification as Role's form.
  async form({ id }) {
    const coa = id === 'new'
      ? { id: 'new', code: '', name: '', type: '', companyid: '', normalBalance: '', parentid: '', description: '', isActive: 1 }
      : await coaApi.get({ id });

    // coa.js's column_attr.rel declares companyid -> company.id — this is
    // that relation actually being used. getKv() is Entity's dropdown-
    // shaped sibling to list(): unpaginated, already [{id, name}], ready
    // for Sel's values= attribute with no .map() needed here.
    const companies = await companyApi.getKv();

    // the second rel, coa -> coa (parentid): every OTHER account is a
    // candidate parent — a row can never be its own parent, so the
    // filter predicate excludes the current row (a new one has no id yet
    // to exclude, so nothing matches it and nothing gets filtered out).
    // getKv()'s label already uses coa.js's own column_attr.toString
    // (code — name — type), and being unpaginated this now covers every
    // account, not just the first page of them. the leading blank entry
    // is "no parent" (a top-level account) — Sel has no built-in blank
    // option, so the array itself carries one.
    const parents = [
      { id: '', name: '—' },
      ...await coaApi.getKv((row) => row.id !== coa.id),
    ];

    // fixed option lists — same {id, name} shape as the DB-backed ones
    // above, so Sel (etc/widget/sel.html) renders all four selects the
    // same way regardless of where their options came from.
    const types = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'].map((v) => ({ id: v, name: v }));
    const balances = ['Debit', 'Credit'].map((v) => ({ id: v, name: v }));

    return this.render(undefined, {
      coa,
      coaId: coa.id,
      companies,
      parents,
      types,
      balances,
      activeChecked: coa.isActive ? 'checked' : '',
    });
  }

  async save(params) {
    const fields = {
      code: params.code,
      name: params.name,
      type: params.type,
      companyid: params.companyid || null,
      normalBalance: params.normalBalance,
      parentid: params.parentid || null,
      description: params.description,
      // a checkbox sends nothing at all when unchecked — coerced to a
      // real 0/1 here rather than leaving it to land as null.
      isActive: params.isActive === 'on' ? 1 : 0,
    };
    const coa = params.id === 'new'
      ? await coaApi.create(fields)
      : await coaApi.update({ id: params.id, ...fields });

    return this.pre.redirect('/master/coa', 'Account saved successfully');
  }
}
