"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
function ui(initialMembership = "Fish") {
  const nodes = new Map(),
    messages = [];
  class Node {
    constructor(tag = "div") {
      this.tagName = tag;
      this.children = [];
      this.value = "";
      this.checked = false;
      this.attributes = {};
      this.classList = { add() {}, remove() {}, toggle() {} };
    }
    set id(value) {
      this._id = value;
      nodes.set(value, this);
    }
    get id() {
      return this._id;
    }
    append(...children) {
      for (const child of children) {
        child.parentElement = this;
        this.children.push(child);
      }
      if (this.tagName === "select" && !this.value && children[0])
        this.value = children[0].value;
    }
    replaceChildren(...children) {
      this.children = [];
      this.append(...children);
    }
    setAttribute(name, value) {
      this.attributes[name] = value;
    }
    addEventListener(name, fn) {
      this["on" + name] = fn;
    }
    select() {
      this.selected = true;
    }
  }
  const document = {
    getElementById: (id) => nodes.get(id),
    createElement: (tag) => new Node(tag),
    createTextNode: (text) => ({ textContent: text }),
  };
  for (const id of [
    "schema",
    "name",
    "kind",
    "membership",
    "browse-members",
    "membership-info",
    "lifetime",
    "duplicates",
    "load-factor",
    "superclass",
    "create",
    "copy-source",
    "path-note",
    "add",
    "error",
    "preview",
    "members",
    "superclasses",
    "keys",
    "designer",
  ]) {
    const n = new Node(id === "schema" ? "select" : "div");
    n.id = id;
  }
  nodes.get("kind").value = "member";
  nodes.get("lifetime").value = "transient";
  let receive;
  const context = vm.createContext({
    document,
    acquireVsCodeApi: () => ({ postMessage: (value) => messages.push(value) }),
    JadeCollectionChoices: require("../extension/media/collection-choices"),
    window: { addEventListener: (name, fn) => (receive = fn) },
    setTimeout: () => 1,
    clearTimeout() {},
  });
  vm.runInContext(
    fs.readFileSync(
      path.join(__dirname, "../extension/media/collections.js"),
      "utf8",
    ),
    context,
  );
  const catalog = {
    schemas: [
      {
        name: "Pets",
        locales: [
          { id: 2057, name: "English (United Kingdom)", schemaDefault: true },
        ],
        members: [
          { name: "BaseUnitTest", schema: "Pets", properties: [] },
          { name: "Sheep", schema: "Base", properties: [] },
          {
            name: "Fish",
            properties: [
              { name: "name", type: "String" },
              { name: "rank", type: "Integer" },
            ],
          },
        ],
      },
    ],
  };
  receive({
    data: {
      command: "catalog",
      initial: { schema: "Pets", membership: initialMembership },
      catalog,
    },
  });
  receive({
    data: {
      command: "properties",
      schema: "Pets",
      member: "Fish",
      properties: [
        { name: "name", type: "String" },
        { name: "rank", type: "Integer" },
      ],
    },
  });
  return {
    nodes,
    messages,
    context,
    receive,
    request: () => vm.runInContext("request()", context),
  };
}
test("designer locale control starts at schema default, offers native workspace LCIDs, and preserves an explicit per-key selection", () => {
  const s = ui(),
    locale = s.nodes.get("key-locale-0");
  assert.ok(locale, "Per-key locale input is rendered.");
  assert.equal(s.request().keys[0].locale, undefined);
  assert.match(locale.placeholder, /default/i);
  const choices = s.nodes.get("key-locales-0");
  assert.equal(choices.children[0].value, "2057");
  assert.match(choices.children[0].textContent, /United Kingdom/);
  locale.value = "2057";
  locale.oninput();
  assert.equal(s.request().keys[0].locale, 2057);
  locale.value = "";
  locale.oninput();
  assert.equal(s.request().keys[0].locale, undefined);
});
test("choosing a non-text key disables and clears an old locale selection", () => {
  const s = ui(),
    locale = s.nodes.get("key-locale-0");
  locale.value = "2057";
  locale.oninput();
  vm.runInContext("keys[0].name='rank';renderKeys();", s.context);
  assert.equal(s.nodes.get("key-locale-0").disabled, true);
  assert.equal(s.request().keys[0].locale, undefined);
});
test("a preselected BaseUnitTest can open the all-visible-classes chooser and accept an inherited member", () => {
  const s = ui("BaseUnitTest");
  assert.equal(s.request().membership, "BaseUnitTest");
  s.nodes.get("browse-members").onclick();
  const asked = s.messages.at(-1);
  assert.equal(asked.command, "chooseMember");
  assert.equal(asked.schema, "Pets");
  s.receive({
    data: { command: "memberSelected", schema: "Pets", member: "Sheep" },
  });
  assert.equal(s.request().membership, "Sheep");
  assert.match(s.nodes.get("membership-info").textContent, /3 visible/);
  assert.ok(
    s.messages.some(
      (message) =>
        message.command === "properties" && message.member === "Sheep",
    ),
  );
});
test("primary class autocomplete shows all on focus, filters typing, resets stale keys and populates the newly chosen class properties", () => {
  const s = ui("BaseUnitTest"),
    input = s.nodes.get("membership");
  input.onfocus();
  assert.equal(input.selected, true);
  assert.equal(s.nodes.get("members").children.length, 3);
  input.value = "She";
  input.oninput();
  assert.deepEqual(
    Array.from(s.nodes.get("members").children, (row) => row.value),
    ["Sheep"],
  );
  s.nodes.get("members").children[0].onclick();
  assert.equal(s.request().membership, "Sheep");
  assert.equal(s.request().keys[0].name, undefined);
  s.receive({
    data: {
      command: "properties",
      schema: "Pets",
      member: "Sheep",
      properties: [
        { name: "name", type: "String", schema: "Base" },
        { name: "wool", type: "String" },
        { name: "rank", type: "Integer" },
      ],
    },
  });
  const property = s.nodes.get("key-property-0");
  property.onfocus();
  assert.deepEqual(
    Array.from(s.nodes.get("key-properties-0").children, (row) => row.value),
    ["name", "wool", "rank"],
  );
  s.receive({
    data: {
      command: "properties",
      schema: "Pets",
      member: "BaseUnitTest",
      properties: [{ name: "stale", type: "String" }],
    },
  });
  property.onfocus();
  assert.ok(
    !Array.from(
      s.nodes.get("key-properties-0").children,
      (row) => row.value,
    ).includes("stale"),
  );
});
test("class autocomplete supports keyboard selection and closes its suggestion list", () => {
  const s = ui("BaseUnitTest"),
    input = s.nodes.get("membership"),
    key = (value) => input.onkeydown({ key: value, preventDefault() {} });
  input.onfocus();
  key("ArrowDown");
  key("ArrowDown");
  key("Enter");
  assert.equal(s.request().membership, "Sheep");
  assert.equal(s.nodes.get("members").hidden, true);
  assert.equal(input.attributes["aria-expanded"], "false");
});
test("clicking an already focused selected class reopens all autocomplete choices", () => {
  const s = ui("BaseUnitTest"),
    input = s.nodes.get("membership");
  input.onfocus();
  input.onkeydown({ key: "Escape", preventDefault() {} });
  assert.equal(s.nodes.get("members").hidden, true);
  input.onclick();
  assert.equal(s.nodes.get("members").hidden, false);
  assert.equal(s.nodes.get("members").children.length, 3);
});
