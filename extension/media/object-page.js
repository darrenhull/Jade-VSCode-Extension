(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.JadeObjectPage = api;
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";
  function fieldText(field) {
    const value = field?.value;
    if (value === null || value === undefined) return "null";
    return typeof value === "object" ? JSON.stringify(value) : String(value);
  }
  const collator = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: "base",
  });
  function visibleRows(items, query = "", sort = "native") {
    const search = String(query).toLocaleLowerCase(),
      rows = items
        .map((item, index) => ({ item, index }))
        .filter(({ item }) =>
          [
            item.name,
            item.key,
            item.index,
            item.type,
            item.value,
            item.oid,
            item.error,
          ].some((value) =>
            String(value ?? "")
              .toLocaleLowerCase()
              .includes(search),
          ),
        );
    const [field, direction] = String(sort).split("-");
    if (
      !["key", "value", "type", "name"].includes(field) ||
      !["asc", "desc"].includes(direction)
    )
      return rows;
    return rows.sort((a, b) => {
      const left =
          field === "key" ? (a.item.key ?? a.item.index) : a.item[field],
        right = field === "key" ? (b.item.key ?? b.item.index) : b.item[field];
      return (
        collator.compare(String(left ?? ""), String(right ?? "")) *
          (direction === "desc" ? -1 : 1) || a.index - b.index
      );
    });
  }
  function pageSummary(page, visibleCount) {
    const count = page?.items?.length || 0;
    if (!count) return "Empty collection";
    const first = page.items[0].index,
      last = page.items[count - 1].index,
      range =
        Number.isInteger(first) && Number.isInteger(last)
          ? `Entries ${first}–${last} · `
          : "";
    return (
      range +
      visibleCount +
      " of " +
      count +
      " shown on this page" +
      (page.hasMore ? " · More entries available" : " · End of collection")
    );
  }
  return { visibleRows, pageSummary, fieldText };
});
