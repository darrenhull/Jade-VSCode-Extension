"use strict";
const vscode = acquireVsCodeApi(),
  $ = (id) => document.getElementById(id);
let catalog,
  sequence = 0,
  manualName = false,
  keys = [{}],
  timer,
  selectedMemberIdentity;
const option = (value, label = value) => {
  const o = document.createElement("option");
  o.value = value;
  o.textContent = label;
  return o;
};
const schema = () => catalog?.schemas.find((s) => s.name === $("schema").value);
const member = () =>
  schema()?.members.find((m) => m.name === $("membership").value);
const request = () => ({
  schema: $("schema").value,
  name: $("name").value,
  kind: $("kind").value,
  membership: $("membership").value,
  lifetime: $("lifetime").value,
  duplicatesAllowed: $("duplicates").checked,
  loadFactor:
    $("load-factor").value === "" ? undefined : Number($("load-factor").value),
  superclass: $("superclass").value,
  keys,
});
function update() {
  if (!manualName && $("membership").value)
    $("name").value =
      $("membership").value +
      "By" +
      (keys[0]?.name
        ? keys[0].name
            .split(".")
            .map((part) => part[0]?.toUpperCase() + part.slice(1))
            .join("")
        : "Key");
  $("create").disabled = true;
  $("copy-source").disabled = true;
  $("path-note").hidden = !keys.some((key) => key.name?.includes("."));
  $("add").disabled = keys.length >= 16;
  clearTimeout(timer);
  const id = ++sequence;
  $("error").classList.remove("invalid");
  if (!member() || !keys.length || keys.some((key) => !key.name)) {
    $("error").textContent = !member()
      ? "Choose a member class to get started."
      : "Choose at least one sort key.";
    $("preview").textContent =
      "Your native CLS source will appear here as you define the collection.";
    return;
  }
  timer = setTimeout(
    () =>
      vscode.postMessage({
        command: "preview",
        sequence: id,
        request: request(),
      }),
    100,
  );
}
function memberOptions() {
  const query = $("membership").value.toLowerCase();
  const visible = schema()?.members || [];
  $("membership-info").textContent =
    "The class of objects stored in this collection (member type). " +
    visible.length +
    " visible workspace classes in " +
    (schema()?.name || "the selected schema") +
    " and its ancestors. Click the field to browse or type to filter.";
  $("browse-members").disabled = !visible.length;
  memberCombo.render(query);
}
function bindChoices(input, list, records, pick) {
  let rows = [],
    active = -1,
    blurTimer;
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-haspopup", "listbox");
  input.setAttribute("aria-controls", list.id);
  input.setAttribute("aria-expanded", "false");
  function close() {
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-activedescendant", "");
    active = -1;
  }
  function select(row) {
    input.value = row.name;
    pick(row);
    input.focus?.();
    close();
  }
  function render(query = "", show = !list.hidden) {
    rows = JadeCollectionChoices.choices(records(), query);
    active = -1;
    list.replaceChildren(
      ...rows.map((row, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.value = row.name;
        button.id = list.id + "-option-" + index;
        button.setAttribute("role", "option");
        button.tabIndex = -1;
        button.textContent = row.name + (row.type ? " : " + row.type : "");
        button.onmousedown = (event) => event.preventDefault();
        button.onclick = () => select(row);
        return button;
      }),
    );
    list.hidden = !show || !rows.length;
    input.setAttribute("aria-expanded", String(!list.hidden));
    input.setAttribute("aria-activedescendant", "");
  }
  input.addEventListener("focus", () => {
    clearTimeout(blurTimer);
    input.select?.();
    render("", true);
  });
  input.addEventListener("click", () => {
    clearTimeout(blurTimer);
    if (list.hidden) {
      input.select?.();
      render("", true);
    }
  });
  input.addEventListener("blur", () => {
    blurTimer = setTimeout(close, 120);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      close();
      event.preventDefault();
      return;
    }
    if (event.key === "Tab") {
      close();
      return;
    }
    if (["ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      if (list.hidden) render("", true);
      if (!rows.length) return;
      active = Math.max(
        0,
        Math.min(
          rows.length - 1,
          active + (event.key === "ArrowDown" ? 1 : -1),
        ),
      );
      for (const [index, node] of Array.from(list.children).entries()) {
        node.classList.toggle("active", index === active);
        node.setAttribute("aria-selected", String(index === active));
      }
      const node = list.children[active];
      input.setAttribute("aria-activedescendant", node.id);
      node.scrollIntoView?.({ block: "nearest" });
    } else if (event.key === "Enter" && !list.hidden) {
      event.preventDefault();
      if (active >= 0) select(rows[active]);
      else close();
    }
  });
  return { render, close };
}
function chooseCurrentMember() {
  const identity = member()
    ? $("schema").value + "::" + member().name
    : undefined;
  if (identity !== selectedMemberIdentity) {
    keys = [{}];
    selectedMemberIdentity = identity;
  }
  if (member())
    vscode.postMessage({
      command: "properties",
      schema: $("schema").value,
      member: member().name,
    });
  renderKeys();
  update();
}
const memberCombo = bindChoices(
  $("membership"),
  $("members"),
  () => schema()?.members || [],
  () => {
    memberOptions();
    chooseCurrentMember();
  },
);
function memberships() {
  if (!member()) $("membership").value = "";
  superclasses();
  memberOptions();
  renderKeys();
}
function superclasses() {
  const current = $("superclass").value,
    kind = $("kind").value,
    base = kind === "member" ? "MemberKeyDictionary" : "ExtKeyDictionary";
  if (!current || ["MemberKeyDictionary", "ExtKeyDictionary"].includes(current))
    $("superclass").value = base;
  $("superclasses").replaceChildren(
    ...JadeCollectionChoices.choices(
      [
        { name: base },
        ...(schema()?.members || []).filter((m) => m.dictionaryKind === kind),
      ],
      $("superclass").value === base ? "" : $("superclass").value,
    ).map((m) => option(m.name)),
  );
}
function renderKeys() {
  $("keys").replaceChildren();
  const external = $("kind").value === "external";
  keys.forEach((key, index) => {
    const row = document.createElement("div");
    row.className = "key";
    const badge = document.createElement("span");
    badge.className = "key-number";
    badge.textContent = "KEY " + String(index + 1).padStart(2, "0");
    row.append(badge);
    function field(title, control) {
      const l = document.createElement("label");
      l.append(document.createTextNode(title), control);
      row.append(l);
      return control;
    }
    let name, propertyChoices, propertyCombo;
    if (external) {
      name = document.createElement("input");
      name.className = "vscode-textfield";
      name.value = key.name || "";
    } else {
      name = document.createElement("input");
      name.className = "vscode-textfield";
      name.placeholder = "Search property or owner.name";
      name.autocomplete = "off";
      name.id = "key-property-" + index;
      const choices = document.createElement("div");
      choices.className = "choice-popup";
      choices.hidden = true;
      choices.setAttribute("role", "listbox");
      choices.id = "key-properties-" + index;
      propertyChoices = choices;
      name.value = key.name || "";
    }
    field(external ? "Key name" : "Property", name).addEventListener(
      "input",
      () => {
        key.name = name.value;
        propertyCombo?.render(name.value, true);
        refreshLocaleType();
        update();
      },
    );
    if (propertyChoices) {
      name.parentElement.classList.add("choice-field");
      name.parentElement.append(propertyChoices);
      propertyCombo = bindChoices(
        name,
        propertyChoices,
        () => member()?.properties || [],
        (property) => {
          key.name = property.name;
          refreshLocaleType();
          update();
        },
      );
      propertyCombo.render();
    }
    if (external) {
      const types = document.createElement("select");
      types.append(
        ...[
          "String",
          "StringUtf8",
          "Binary",
          "Integer",
          "Integer64",
          "Real",
          "Decimal",
          "Date",
          "Time",
          "TimeStamp",
          "Boolean",
          "Character",
        ].map((t) => option(t)),
      );
      types.value = key.type || "String";
      key.type = types.value;
      field("Type", types).onchange = () => {
        key.type = types.value;
        renderKeys();
        update();
      };
      if (["String", "StringUtf8", "Binary", "Decimal"].includes(key.type)) {
        const length = document.createElement("input");
        length.type = "number";
        length.min = "1";
        length.value = key.length ?? (key.type === "Decimal" ? 12 : 30);
        key.length = Number(length.value);
        field("Length", length).oninput = () => {
          key.length = Number(length.value);
          update();
        };
      }
      if (key.type === "Decimal") {
        const scale = document.createElement("input");
        scale.type = "number";
        scale.min = "0";
        scale.value = key.scale ?? 0;
        field("Scale", scale).oninput = () => {
          key.scale = Number(scale.value);
          update();
        };
      }
    }
    const direction = document.createElement("select");
    direction.append(option("asc", "Ascending"), option("desc", "Descending"));
    direction.value = key.descending ? "desc" : "asc";
    field("Direction", direction).onchange = () => {
      key.descending = direction.value === "desc";
      update();
    };
    const ci = document.createElement("input");
    ci.type = "checkbox";
    ci.checked = !!key.caseInsensitive;
    const ciLabel = field("Ignore case (text)", ci);
    ciLabel.parentElement.className = "check";
    ci.onchange = () => {
      key.caseInsensitive = ci.checked;
      update();
    };
    const locale = document.createElement("input"),
      locales = document.createElement("datalist");
    locale.id = "key-locale-" + index;
    locale.className = "vscode-textfield";
    locale.inputMode = "numeric";
    locale.autocomplete = "off";
    locales.id = "key-locales-" + index;
    locale.setAttribute("list", locales.id);
    const defaultLocale = schema()?.locales?.find(
      (value) => value.schemaDefault,
    );
    locale.placeholder =
      "Schema default" + (defaultLocale ? " (" + defaultLocale.id + ")" : "");
    locale.title =
      "Optional native locale identifier for String or StringUtf8 sorting. Leave empty for the schema default.";
    locale.value = key.locale ?? "";
    function localeOptions() {
      const query = locale.value.toLowerCase();
      locales.replaceChildren(
        ...(schema()?.locales || [])
          .filter(
            (value) =>
              String(value.id).includes(query) ||
              value.name.toLowerCase().includes(query),
          )
          .slice(0, 100)
          .map((value) =>
            option(String(value.id), value.name + " (" + value.id + ")"),
          ),
      );
    }
    function refreshLocaleType() {
      const type = external
        ? key.type
        : member()?.properties?.find((property) => property.name === key.name)
            ?.type;
      locale.disabled = Boolean(
        type && !["String", "StringUtf8"].includes(type),
      );
      if (locale.disabled) {
        delete key.locale;
        locale.value = "";
      }
    }
    field("Locale (text keys)", locale);
    row.append(locales);
    refreshLocaleType();
    localeOptions();
    locale.oninput = () => {
      if (locale.value.trim() === "") delete key.locale;
      else key.locale = Number(locale.value);
      localeOptions();
      update();
    };
    for (const [label, delta] of [
      ["Up", -1],
      ["Down", 1],
      ["Remove", 0],
    ]) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "vscode-button secondary";
      b.textContent = { Up: "↑", Down: "↓", Remove: "Remove" }[label];
      b.setAttribute("aria-label", label + " key " + (index + 1));
      b.title =
        label === "Remove"
          ? "Remove this key"
          : `Move key ${index + 1} ${label.toLowerCase()} in sort priority`;
      b.disabled =
        delta !== 0 && (index + delta < 0 || index + delta >= keys.length);
      b.onclick = () => {
        if (delta)
          [keys[index], keys[index + delta]] = [
            keys[index + delta],
            keys[index],
          ];
        else keys.splice(index, 1);
        renderKeys();
        update();
      };
      row.append(b);
    }
    $("keys").append(row);
  });
}
$("add").onclick = () => {
  keys.push({});
  renderKeys();
  update();
};
$("name").oninput = () => {
  manualName = true;
  update();
};
$("schema").onchange = () => {
  memberships();
  chooseCurrentMember();
};
$("membership").oninput = () => {
  memberOptions();
  memberCombo.render($("membership").value, true);
  chooseCurrentMember();
};
$("browse-members").onclick = () =>
  vscode.postMessage({
    command: "chooseMember",
    schema: $("schema").value,
    member: $("membership").value,
  });
$("kind").onchange = () => {
  $("superclass").value =
    $("kind").value === "member" ? "MemberKeyDictionary" : "ExtKeyDictionary";
  superclasses();
  keys = [{}];
  renderKeys();
  update();
};
$("lifetime").onchange = update;
$("load-factor").oninput = update;
$("superclass").oninput = () => {
  superclasses();
  update();
};
$("copy-source").onclick = () =>
  vscode.postMessage({ command: "copySource", sequence, request: request() });
$("duplicates").onchange = update;
$("designer").onsubmit = (e) => {
  e.preventDefault();
  $("create").disabled = true;
  vscode.postMessage({ command: "create", sequence, request: request() });
};
window.addEventListener("message", ({ data }) => {
  if (data.command === "memberSelected") {
    if (
      data.schema !== $("schema").value ||
      !schema()?.members.some((member) => member.name === data.member)
    )
      return;
    $("membership").value = data.member;
    memberOptions();
    memberCombo.close();
    chooseCurrentMember();
    return;
  }
  if (data.command === "catalog") {
    catalog = data.catalog;
    $("schema").replaceChildren(...catalog.schemas.map((s) => option(s.name)));
    if (
      data.initial &&
      catalog.schemas.some((s) => s.name === data.initial.schema)
    )
      $("schema").value = data.initial.schema;
    memberships();
    if (
      data.initial &&
      schema()?.members.some(
        (m) => m.name === data.initial.membership && m.name !== $("name").value,
      )
    ) {
      $("membership").value = data.initial.membership;
      memberOptions();
      chooseCurrentMember();
    }
    update();
    vscode.postMessage({ command: "rendered" });
    return;
  }
  if (data.command === "properties") {
    if (
      member() &&
      data.schema === $("schema").value &&
      data.member === $("membership").value
    ) {
      member().properties = data.properties;
      if (
        keys.length === 1 &&
        !keys[0].name &&
        data.properties.some((p) => p.name === "name")
      )
        keys[0].name = "name";
      renderKeys();
      update();
    }
    return;
  }
  if (data.sequence !== undefined && data.sequence !== sequence) return;
  if (data.command === "copied") {
    $("error").textContent = "Source copied to clipboard.";
    return;
  }
  if (data.command === "preview") {
    $("preview").textContent = data.text;
    $("error").textContent = "Ready to create " + $("name").value + ".cls";
    $("error").classList.remove("invalid");
    $("create").disabled = false;
    $("copy-source").disabled = false;
  }
  if (data.command === "error") {
    $("error").textContent = data.message;
    $("error").classList.add("invalid");
    $("create").disabled = true;
    $("copy-source").disabled = true;
    $("preview").textContent = "";
  }
});
vscode.postMessage({ command: "ready" });
