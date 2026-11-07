"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {setup,fixture}=require("./fixtures/class-view.cjs");

test("class member tree identities remain stable when preceding source text shifts", async () => {
  const s = setup();
  try {
    const schemas = await s.api.provider.getChildren(),
      pets = schemas.find((row) => row.name === "Pets"),
      cls = (await s.api.provider.getChildren(pets))[0],
      group = (await s.api.provider.getChildren(cls)).find(
        (g) => g.label === "Methods",
      ),
      before = group.items[0],
      id = s.api.provider.getTreeItem(before).id;
    s.first.text = "// inserted comment\n" + s.first.text;
    s.index.document(s.first);
    const nextClass = (await s.api.provider.getChildren(pets))[0],
      next = (await s.api.provider.getChildren(nextClass)).find(
        (g) => g.label === "Methods",
      ).items[0];
    assert.notEqual(next.selection, before.selection);
    assert.equal(s.api.provider.getTreeItem(next).id, id);
    const other = (
      await s.api.provider.getChildren(
        schemas.find((row) => row.name === "Other"),
      )
    )[0];
    assert.notEqual(
      s.api.provider.getTreeItem(other).id,
      s.api.provider.getTreeItem(nextClass).id,
    );
  } finally {
    s.dispose();
  }
});
test('source lookup cannot fall through to another project when runtime context names a project',async()=>{
 const s=setup();try{
   const first={uri:s.vscode.Uri.file('/workspace/arbitrary'),name:'One'},second={uri:s.vscode.Uri.file('/workspace/different'),name:'Two'};
   s.vscode.workspace.workspaceFolders=[first,second];
   s.vscode.workspace.getWorkspaceFolder=uri=>uri.fsPath.startsWith(first.uri.fsPath)?first:second;
   const result=await s.commands.get('jadeNative.findSourceClass')('Fish','Pets',second.uri.fsPath);
   assert.equal(result.opened,false);assert.equal(s.panels.length,0);
 }finally{s.dispose();}
});
test('same-schema classes in different projects have distinct visible labels and group identities',async()=>{
 const s=setup();try{
   s.second.text=fixture('Pets','Fish','two');
   const first={uri:s.vscode.Uri.file('/workspace/arbitrary'),name:'One'},second={uri:s.vscode.Uri.file('/workspace/different'),name:'Two'};
   s.vscode.workspace.workspaceFolders=[first,second];s.vscode.workspace.getWorkspaceFolder=uri=>uri.fsPath.startsWith(first.uri.fsPath)?first:second;
   const schema=(await s.api.provider.getChildren())[0],classes=await s.api.provider.getChildren(schema);
   assert.equal(classes.length,2);
   const labels=classes.map(row=>s.api.provider.getTreeItem(row).description);assert.deepEqual(new Set(labels),new Set(['One','Two']));
   const a=await s.api.provider.getChildren(classes[0]),b=await s.api.provider.getChildren(classes[1]);
   assert.notEqual(s.api.provider.getTreeItem(a[0]).id,s.api.provider.getTreeItem(b[0]).id);
 }finally{s.dispose();}
});
test('method-only edits retain the warm class catalogue instead of rebuilding and sorting it',async()=>{
 const s=setup();try{
   await s.api.syncBrowser();const before=s.api.browser.rows;
   s.first.text=s.first.text.replace('"one"','"changed"');s.first.version=2;s.index.document(s.first);
   await s.api.syncBrowser();assert.equal(s.api.browser.rows,before);
   assert.equal(s.api.browser.rows.find(row=>row.schema==='Pets').entries[0].model.text,s.first.text);
 }finally{s.dispose();}
});
test('Open Original Source without a tree argument uses the active class workspace',async()=>{
 const s=setup();try{
   const schema=(await s.api.provider.getChildren()).find(row=>row.name==='Pets');
   const row=(await s.api.provider.getChildren(schema))[0];
   await s.commands.get('jadeNative.openClassWorkspace')(row);
   await s.commands.get('jadeNative.openOriginalSource')();
   assert.equal(s.vscode.window.activeTextEditor.document.uri.toString(),s.first.uri.toString());
 }finally{s.dispose();}
});
test('original-source navigation resolves normalized type-method members',async()=>{
 const s=setup();try{
   s.first.text=s.first.text.replaceAll('getName() : String;','getName() : String typeMethod;');
   const schema=(await s.api.provider.getChildren()).find(row=>row.name==='Pets'),row=(await s.api.provider.getChildren(schema))[0];
   const method=(await s.api.provider.getChildren(row)).find(group=>group.label==='Type methods').items[0];
   await s.commands.get('jadeNative.showClassMember')({...method,kind:'typeMethod'});
   assert.equal(s.vscode.window.activeTextEditor?.document.uri.toString(),s.first.uri.toString());
 }finally{s.dispose();}
});
test('Back to Classes restores the tree filter instead of opening another catalogue tab',async()=>{
 const s=setup();try{
   s.vscode.window.showInputBox=async()=> 'Fish';
   await s.commands.get('jadeNative.filterSourceClasses')({schema:'Pets'});
   const schema=(await s.api.provider.getChildren()).find(row=>row.name==='Pets'),row=(await s.api.provider.getChildren(schema))[0];
   await s.commands.get('jadeNative.openClassWorkspace')(row);
   s.vscode.window.showInputBox=async()=> 'not-a-class';await s.commands.get('jadeNative.filterSourceClasses')({schema:'Pets'});
   assert.equal((await s.api.provider.getChildren(schema)).length,0);
   await s.panels[0].receive({command:'backToClasses'});
   assert.equal((await s.api.provider.getChildren(schema))[0].name,'Fish');assert.equal(s.panels.length,1);
 }finally{s.dispose();}
});
test('Back to Classes reopens native class search with the accepted query',async()=>{
 const s=setup(),pickers=[];try{
   s.vscode.window.createQuickPick=()=>{const picker={selectedItems:[],onDidChangeValue(fn){this.change=fn;return {dispose(){}};},onDidAccept(fn){this.accept=fn;return {dispose(){}};},onDidHide(fn){this.hide=fn;return {dispose(){}};},show(){pickers.push(this);},dispose(){}};return picker;};
   const opening=s.commands.get('jadeNative.findSourceClass')();
   for(let i=0;i<100&&!pickers.length;i++)await new Promise(resolve=>setTimeout(resolve,5));assert.equal(pickers.length,1);
   pickers[0].value='Pets::Fish';pickers[0].change(pickers[0].value);pickers[0].selectedItems=[pickers[0].items[0]];pickers[0].accept();await opening;
   const returning=s.panels[0].receive({command:'backToClasses'});
   for(let i=0;i<100&&pickers.length<2;i++)await new Promise(resolve=>setTimeout(resolve,5));assert.equal(pickers.length,2);
   assert.equal(pickers[1].value,'Pets::Fish');pickers[1].hide();await returning;assert.equal(s.panels.length,1);
 }finally{s.dispose();}
});
test("two schema-qualified member previews both update after interleaved unsaved edits", async () => {
  const s = setup();
  try {
    const roots = await s.api.provider.getChildren(),
      rows = [];
    for (const schema of roots) {
      const cls = (await s.api.provider.getChildren(schema))[0],
        group = (await s.api.provider.getChildren(cls)).find(
          (g) => g.label === "Methods",
        );
      rows.push(group.items[0]);
    }
    const previews = [];
    for (const row of rows) {
      await s.commands.get("jadeNative.previewClassMember")(row);
      previews.push(s.panels.at(-1));
    }
    assert.notEqual(previews[0].title, previews[1].title);
    s.first.text = s.first.text.replace('"one"', '"changed one"');
    s.index.document(s.first);
    s.changes.fire({ document: s.first,contentChanges:[] });
    s.second.text = s.second.text.replace('"two"', '"changed two"');
    s.index.document(s.second);
    s.changes.fire({ document: s.second,contentChanges:[] });
    for (
      let i = 0;
      i < 25 &&
      (!previews.some((p) => JSON.stringify(p.messages).includes("changed one")) ||
        !previews.some((p) => JSON.stringify(p.messages).includes("changed two")));
      i++
    )
      await new Promise((r) => setTimeout(r, 20));
    assert.ok(previews.some((p) => JSON.stringify(p.messages).includes("changed one")));
    assert.ok(previews.some((p) => JSON.stringify(p.messages).includes("changed two")));
  } finally {
    s.dispose();
  }
});
test("clicking a method or property opens its focused preview while explicit original navigation stays available", async () => {
  const s = setup();
  try {
    const schema = (await s.api.provider.getChildren()).find(
        (row) => row.name === "Pets",
      ),
      cls = (await s.api.provider.getChildren(schema))[0],
      groups = await s.api.provider.getChildren(cls);
    assert.equal(s.api.provider.getTreeItem(cls).command.command, 'jadeNative.openClassWorkspace');
    for (const label of ["Methods", "Properties"]) {
      const row = groups.find((group) => group.label === label).items[0],
        item = s.api.provider.getTreeItem(row);
      assert.equal(item.command.command, "jadeNative.previewClassMember");
      await s.vscode.commands.executeCommand(
        item.command.command,
        ...item.command.arguments,
      );
      const preview = s.panels.at(-1);
      assert.equal(preview.type, "jade.classWorkspace");
      assert.ok(!preview.webview.html.includes('typeHeaders'));
      await s.commands.get("jadeNative.openOriginalSource")(row);
      assert.equal(
        s.vscode.window.activeTextEditor.document.uri.toString(),
        s.first.uri.toString(),
      );
    }
  } finally {
    s.dispose();
  }
});
test("large source schemas render at most100 class rows, replace pages and reveal exact off-page classes without loading all rows", async () => {
  const s = setup();
  try {
    await s.index.ready();
    for (let i = 0; i < 250; i++) {
      const owner = "Type" + String(i).padStart(5, "0"),
        uri = s.vscode.Uri.from({
          scheme: "file",
          path: "/workspace/" + owner + ".cls",
        }),
        doc = s.doc(uri, fixture("Large", owner, "v"));
      s.index.document(doc);
    }
    const schema = (await s.api.provider.getChildren()).find(
      (row) => row.name === "Large",
    );
    let rows = await s.api.provider.getChildren(schema);
    assert.equal(rows.filter((row) => row.kind === "class").length, 100);
    const firstId = s.api.provider.getTreeItem(
        rows.find((row) => row.kind === "class"),
      ).id,
      next = rows.find((row) => row.kind === "classPage" && row.offset === 100);
    assert.ok(next);
    await s.commands.get("jadeNative.pageSourceClasses")(next);
    rows = await s.api.provider.getChildren(schema);
    assert.equal(rows.filter((row) => row.kind === "class").length, 100);
    assert.equal(rows.find((row) => row.kind === "class").name, "Type00100");
    assert.notEqual(
      s.api.provider.getTreeItem(rows.find((row) => row.kind === "class")).id,
      firstId,
    );
    await s.commands.get("jadeNative.findSourceClass")("Type00249", "Large");
    rows = await s.api.provider.getChildren(schema);
    assert.equal(rows.filter((row) => row.kind === "class").length, 50);
    assert.ok(rows.some((row) => row.name === "Type00249"));
    assert.ok(rows.length < 105);
  } finally {
    s.dispose();
  }
});
test("source catalogue searches every class with bounded rows and opens an exact off-page class in the lazy tree", async () => {
  const s = setup();
  try {
    await s.index.ready();
    for (let i = 0; i < 250; i++) {
      const owner = "GridType" + String(i).padStart(5, "0"),
        uri = s.vscode.Uri.from({
          scheme: "file",
          path: "/workspace/" + owner + ".cls",
        }),
        doc = s.doc(uri, fixture("Grid", owner, "v"));
      s.index.document(doc);
    }
    await s.commands.get("jadeNative.browseSourceClasses")();
    assert.equal(s.api.catalogue.snapshot().page.items.length, 100);
    assert.ok(
      s.api.catalogue
        .snapshot()
        .page.items.every((row) => row.entries === undefined),
    );
    await s.api.catalogue.setFilter({ query: "GridType00249", schema: "Grid" });
    const page = s.api.catalogue.snapshot().page;
    assert.equal(page.total, 1);
    await s.api.catalogue.open(page.items[0].browserId);
    const schema = (await s.api.provider.getChildren()).find(
        (row) => row.name === "Grid",
      ),
      rows = await s.api.provider.getChildren(schema);
    assert.ok(rows.some((row) => row.name === "GridType00249"));
    assert.ok(rows.filter((row) => row.kind === "class").length <= 100);
    assert.equal(
      s.vscode.window.activeTextEditor,
      undefined,
      "Opening a catalogue class reveals its tree rather than opening the full CLS.",
    );
  } finally {
    s.dispose();
  }
});
