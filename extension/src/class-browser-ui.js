"use strict";
// Native QuickPick controls backed by full metadata search. Never give the
// control all 30,000 rows and rely on its own visible-list filtering.
function pickClass(vscode, browser, { schema, query = "", title = "Find Jade class", onAccept } = {}) {
  const picker = vscode.window.createQuickPick();
  picker.placeholder = "Type a class name or schema::class — searches all classes";
  picker.matchOnDescription = false;
  picker.matchOnDetail = false;
  picker.canSelectMany = false;
  return new Promise(resolve => {
    let finished = false;
    const subscriptions = [];
    const finish = value => {
      if (finished) return;
      finished = true;
      for (const subscription of subscriptions) subscription.dispose();
      picker.dispose();
      resolve(value);
    };
    function update(value) {
      const result = browser.search(value, { schema });
      picker.title = title + " · " + result.label;
      // Our full-catalog matcher has already filtered the query. alwaysShow
      // prevents QuickPick's second fuzzy pass from hiding qualified matches.
      picker.items = result.items.map(row => ({ label: row.schema + "::" + row.name,
        description: [row.projectName,row.detail || row.description].filter(Boolean).join(' · '), alwaysShow: true, row }));
      picker.placeholder = result.total > result.items.length
        ? "Type to narrow " + result.total.toLocaleString("en-US") + " classes — first " + result.items.length + " shown"
        : "Type a class name or schema::class — searches all classes";
    }
    subscriptions.push(picker.onDidChangeValue(update),
      picker.onDidAccept(() => {
        const selected = picker.selectedItems[0];
        if (selected) {onAccept?.(selected.row,{query:picker.value,schema});finish(selected.row);}
      }), picker.onDidHide(() => finish(undefined)));
    picker.value = query;
    update(query);
    picker.show();
  });
}
module.exports = { pickClass };
