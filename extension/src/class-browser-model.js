"use strict";
// Metadata-only shared model. Paging bounds rendered rows, not the native
// catalog acquisition or workspace index. Every query searches the full set.
const MAX_PAGE_SIZE = 100;
function pageSize(value, fallback) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1) throw Error("Invalid class page limit");
  return Math.min(MAX_PAGE_SIZE, value);
}
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const key = (schema, name) => JSON.stringify([schema, name]);
class ClassBrowserModel {
  constructor({ scope = "workspace", pageSize: size = MAX_PAGE_SIZE } = {}) {
    this.scope = scope;
    this.pageSize = pageSize(size, MAX_PAGE_SIZE);
    this.setClasses([]);
  }
  setClasses(rows) {
    this.byIdentity = new Map();
    for (const row of rows) {
      if (typeof row.schema !== "string" || !row.schema || typeof row.name !== "string" || !row.name)
        throw Error("Class browsing requires schema-qualified class names");
      const identity = key(row.schema, row.name);
      if (!this.byIdentity.has(identity)) this.byIdentity.set(identity, {
        ...row, browserId: JSON.stringify([this.scope, row.schema, row.name]),
      });
    }
    this.rows = [...this.byIdentity.values()].sort((a, b) =>
      compare(a.schema.toLowerCase(), b.schema.toLowerCase()) ||
      compare(a.name.toLowerCase(), b.name.toLowerCase()) ||
      compare(key(a.schema, a.name), key(b.schema, b.name)));
    this.bySchema = new Map();
    this.text = new Map();
    for (const row of this.rows) {
      if (!this.bySchema.has(row.schema)) this.bySchema.set(row.schema, []);
      this.bySchema.get(row.schema).push(row);
      this.text.set(row.browserId, (row.schema + "::" + row.name).toLowerCase());
    }
    this.cache = new Map();
    return this;
  }
  schemas() {
    return [...this.bySchema].map(([name, rows]) => ({ name, total: rows.length }));
  }
  matching({ schema, query = "" } = {}) {
    const words = String(query).trim().toLowerCase().split(/\s+/).filter(Boolean);
    const cacheKey = JSON.stringify([schema || "", words]);
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);
    const rows = schema === undefined ? this.rows : this.bySchema.get(schema) || [];
    const result = words.length ? rows.filter(row => {
      const text = this.text.get(row.browserId);
      return words.every(word => text.includes(word));
    }) : rows;
    if (this.cache.size >= 8) this.cache.delete(this.cache.keys().next().value);
    this.cache.set(cacheKey, result);
    return result;
  }
  page({ schema, query = "", offset = 0, limit } = {}) {
    if (!Number.isInteger(offset) || offset < 0) throw Error("Invalid class page offset");
    limit = pageSize(limit, this.pageSize);
    const rows = this.matching({ schema, query }), total = rows.length;
    if (offset >= total) offset = total ? Math.floor((total - 1) / limit) * limit : 0;
    const end = Math.min(offset + limit, total);
    const number = value => value.toLocaleString("en-US");
    return {
      items: rows.slice(offset, end).map((row, index) => ({ ...row, position: offset + index + 1 })),
      total, offset, limit, hasMore: end < total, nextOffset: end < total ? end : null,
      hasPrevious: offset > 0, previousOffset: offset > 0 ? Math.max(0, offset - limit) : null,
      label: total ? `${number(offset + 1)}–${number(end)} of ${number(total)} classes` : "0 classes",
    };
  }
  search(query, options = {}) {
    return this.page({ ...options, query, offset: 0 });
  }
  find({ schema, name }) {
    return this.byIdentity.get(key(schema, name));
  }
  positionOf(identity, options = {}) {
    const row = this.find(identity);
    if (!row) return;
    const rows = this.matching(options), index = rows.indexOf(row);
    if (index < 0) return;
    const limit = pageSize(options.limit, this.pageSize);
    return { browserId: row.browserId, position: index + 1, offset: Math.floor(index / limit) * limit };
  }
}
module.exports = { ClassBrowserModel, MAX_PAGE_SIZE };
