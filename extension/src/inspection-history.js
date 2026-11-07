"use strict";

/** Bounded, per-tab snapshots. Navigation never requests or executes native data. */
class InspectionHistory {
  constructor(limit = 100) {
    this.limit = limit;
    this.entries = [];
    this.position = -1;
  }
  current() { return this.entries[this.position]; }
  visit(snapshot) {
    const previous = this.current();
    if (previous?.object.oid === snapshot.object.oid) {
      this.entries[this.position] = { ...snapshot, view: previous.view };
      return;
    }
    this.entries.splice(this.position + 1);
    this.entries.push(snapshot);
    if (this.entries.length > this.limit) this.entries.shift();
    this.position = this.entries.length - 1;
  }
  saveView(view) {
    if (this.current()) this.current().view = {
      scrollY: Math.max(0, Math.min(10000000, Number(view.scrollY) || 0)),
      selection: typeof view.selection === "string" ? view.selection.slice(0, 500) : "",
      propertiesFilter: String(view.propertiesFilter || "").slice(0, 1000),
      entriesFilter: String(view.entriesFilter || "").slice(0, 1000),
      entriesSort: String(view.entriesSort || "native"),
    };
  }
  select(position) {
    if (!Number.isInteger(position) || position < 0 || position >= this.entries.length) return;
    this.position = position;
    return this.current();
  }
  back() { return this.select(this.position - 1); }
  forward() { return this.select(this.position + 1); }
}
module.exports = { InspectionHistory };
