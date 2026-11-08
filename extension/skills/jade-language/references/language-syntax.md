# Native Jade language syntax: coverage and authoring index

This is an authoring index, not a replacement for the full language reference. The authority is the [complete Jade 2025 language chapter](https://secure.jadeworld.com/developer-centre/Jade2025/OnlineDocumentation/content/resources/devref/ch1languageref/chapter_1_-_jade_language_reference.htm), its linked grammar and the installed native compiler. The [2025 notation index](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/devref/ch1languageref/jade_language_notation.htm) is the version-matched successor to the [2022 notation page](https://secure.jadeworld.com/developer-centre/JADE2022/OnlineDocumentation/content/resources/devref/ch1languageref/jade_language_notation.htm). Similar index headings do not make every feature available in both releases.

Audited against the official online topics on 7 November 2026. Those pages include 2025.0.02, 2025.0.03 and release-specific additions. Check the page's availability note and installed release before using new syntax. Not every fragment below has been native-compiled; source-backed illustrations are not a claim of exhaustive compiler validation. Named methods, application classes, properties, handlers and global flags require the corresponding declarations. Use the compiler to check the actual complete source, not this index as a permissive grammar.

For **all primitive types**, their ranges, local descriptors and initialization, read [primitive-types.md](primitive-types.md). For native extract sections and class declarations, read [cls-format.md](cls-format.md). This file covers the language families and routes uncommon variants to their exact reference rather than inventing syntax from another language.

| Coverage family | Guide section |
| --- | --- |
| Method/Workspace shape and grammar notation | [Method shape](#method-shape) |
| Identifiers, case and comments | [Identifiers and comments](#identifiers-comments) |
| Local variables and constants | [Declarations](#declarations) |
| Parameter usage and return signatures | [Parameters and returns](#parameters-returns) |
| Method options, instance and type methods | [Method options](#method-options-type-methods) |
| Literal forms and constants | [Literals](#literals) |
| Operators, casts, guards and substrings | [Expressions](#expressions-operators) |
| Assignment compatibility and compound assignment | [Assignments](#assignments) |
| if, elseif, switch and executeWhen | [Conditionals](#conditionals) |
| while, foreach, numeric ranges and iterators | [Iteration](#iteration) |
| Calls, return, loop exits and external/imported calls | [Other control](#calls-control) |
| read and write | [Input/output](#io) |
| Handler arming/disarming and raise | [Exceptions](#exceptions) |
| Cleanup on method exit | [Epilog](#epilog) |
| Persistent/shared-transient transactions and read locks | [Transactions](#transactions-locks) |
| create, constructors, delete and object lifetimes | [Object lifetime](#creation-lifetimes) |
| Typed collections, interfaces and dictionary generics | [Collections/interfaces](#collections-interfaces-generics) |
| System variables, metadata and package scope | [Metadata](#metadata-system-variables) |
| Regex API and Unicode | [Regex/Unicode](#regex-unicode) |
| Features needing an explicit release check | [Version boundaries](#versioned-syntax) |
| Complete reserved-word and symbol inventories | [Vocabulary](#vocabulary) |

<a id="method-shape"></a>
## Method and Workspace shape

A named method has a signature, optional `constants`, optional `vars`, `begin`, statements, optional `epilog`, and `end;`. A signature-free Workspace body omits the method signature. Do not paste a complete CLS or several named methods into one executable cell. EBNF brackets in the manual mark optional grammar; they are not literal characters to paste.

```jade
sumValues(left : Integer; right : Integer) : Integer;
begin
    return left + right;
end;
```

[Method grammar](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/devref/ch1languageref/jade_language_syntax.htm). A call supplies arguments with commas: `total := sumValues(2, 3);`. Parameters in the declaration are separated by semicolons.

<a id="identifiers-comments"></a>
## Identifiers, case and comments

Keep exact native spelling and the declaration's case: `Integer`, `Byte`, `Boolean`, `String`, `beginTransaction`, `typeMethod`, `begin` and `end` are not interchangeable spellings. Local variable names start lowercase; local constants start uppercase. Do not use a reserved word as a new member name. Line and block comments are native:

```jade
// Explain one line.
/* Explain a block. */
```

[Comments](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/devref/ch1languageref/using_comments_in_your_methods.htm), [variable names](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/devref/ch1languageref/variable_declaration.htm), [constant names](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/devref/ch1languageref/constant_declaration.htm).

<a id="declarations"></a>
## Variables and constants

Declare locals before `begin`; do not substitute `let`, inferred `var` or C# declaration order. Constant expressions use literals and other constants. A compact standalone Workspace example:

```jade
constants
    SampleCount = 3;
vars
    amount : Decimal[12,2];
    octet : Byte;
    label : String;
begin
    amount := 12.50;
    octet := 65.Byte;
    label := "Count " & SampleCount.String;
    write label;
end;
```

[Local declarations](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/devref/ch1languageref/variable_declaration.htm) and [constants](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/devref/ch1languageref/constant_declaration.htm). Local `Decimal` needs its descriptor; `String`/`Binary` locals may be bounded or unbounded. Parameter and return-type rules are context-specific: see the primitive guide instead of applying local descriptors everywhere.

<a id="parameters-returns"></a>
## Parameters and returns

Usages are `constant` (default), `input`, `io`, and `output`. They constrain both assignment and modification; an `input` object reference permits updating the referenced object but cannot be reassigned, whereas a `constant` object parameter cannot be updated. Output and io values are copied back after the epilog. Use the documented type-compatibility rules, especially for object io parameters.

```jade
copyCount(value : Integer; destination : Integer output);
begin
    destination := value;
end;
```

[Parameter semantics](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/devref/ch1languageref/parameters.htm), [return type](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/devref/ch1languageref/return_type.htm), [variable parameter lists](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/devref/ch1languageref/passing_variable_parameters_to_methods.htm). A result method returns a compatible expression; a void method may use `return;`. Pseudo-type parameter lists are specialized native facilities, not unchecked general-purpose arguments.

<a id="method-options-type-methods"></a>
## Method options and type methods

Options follow the signature and use commas when combined, for example `recalculate() updating, protected;`. Check the option's owner/runtime restrictions rather than attaching every flag to every method. The official inventory includes `abstract`, `clientExecution`, `condition`, `conditionSafe`, `final`, `generated`, `lockReceiver`, `mapping`, `notImplemented`, `partitionMethod`, `protected`, `receiverByReference`, `serverExecution`, `subschemaCopyFinal`, `subschemaFinal`, `subschemaHidden`, `typeMethod`, `updating`, `webService`, `unitTest`, `unitTestBefore`, `unitTestBeforeAll`, `unitTestBeforeClass`, `unitTestAfter`, `unitTestAfterAll`, `unitTestAfterClass` and `unitTestIgnore`.

```jade
answer() : Integer typeMethod;
begin
    return 42;
end;
```

Given that declaration on `Calculator`, call `Calculator@answer()`. Imported package type methods can use `PackageAlias::Calculator@answer()`. Do not replace `@` with C# static-call syntax.

[Full method-option list](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/devref/ch1languageref/method_options.htm), [type-method calls](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/devref/ch1languageref/invoking_a_type_method.htm).

<a id="literals"></a>
## Literal forms

Strings use single or double quotes; a one-character string can represent `Character`. Native Boolean literals are `true` and `false`; `null` is interpreted according to the target type, not a universal nullable-object wrapper or a guarantee of default local initialization. A referenced Date local starts at the current date, while its null value is distinct; consult the primitive guide's measured local defaults. Numeric, hexadecimal and `StringUtf8` literal rules have their own tables. Example assignments, assuming compatible declarations:

```jade
caption := "Bubbles";
enabled := true;
owner := null;
```

[Literals](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/devref/ch1languageref/literals.htm) links numeric, hexadecimal and UTF-8 variants. Do not invent C#/Python interpolation, JavaScript template literals, or infer a primitive's bounds from the appearance of a literal. The primitive guide covers Byte and binary/hex distinctions.

<a id="expressions-operators"></a>
## Expressions, operators, casts and guards

Arithmetic includes `+`, `-`, `*`, `/`, `div`, `mod`, `^`; comparisons use `=`, `<>`, `<`, `>`, `<=`, `>=`; Boolean composition uses `not`, `and`, `or`. Use `&` for string/binary concatenation and explicit primitive conversions when joining numbers to text. Parenthesize a calculation before converting it: `"Total " & (first + second).String`. Primitive conversions and object type guards both use dot notation but have different compatibility/failure rules.

```jade
text := "Value " & amount.String;
part := text[1:5];
tail := text[3:end];
```

[Operator families](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/devref/ch1languageref/expressions_with_operators.htm), [precedence](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/devref/ch1languageref/operator_precedence.htm), [casts and guards](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/devref/ch1languageref/type_casts.htm). Substring indexing starts at 1; the second operand is a length or `end`. `.String` is a conversion, not a `.String()` method. New null-conditional forms have the release boundary below.

<a id="assignments"></a>
## Assignments and compound assignments

Assignment is `:=`; equality is `=`. Object assignment copies a reference, while primitive assignment copies a value. Both sides must be compatible. Compound assignment is native, not a license for arbitrary operator coercion:

```jade
count := 4;
count += 2;
message &= " complete";
```

[Assignments and side effects](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/devref/ch1languageref/assignments.htm), [compound operators](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/devref/ch1languageref/compoundassignments.htm). The documented compound set is `+=`, `-=`, `*=`, `/=`, `^=`, `%=`, `&=`. `/=` depends on the receiving type; do not assume real division for Integer. Compound assignments require 2020.0.02 or later.

<a id="conditionals"></a>
## Conditional instructions

```jade
if count = 0 then
    write "empty";
elseif count = 1 then
    write "one";
else
    write "many";
endif;
```

`switch count do ... case 1, 2: ... default: ... endswitch;` is available from **2025.0.01**. Cases are compatible compile-time constants with no fall-through; `Real`, `Decimal`, `Any`, `Point` and `MemoryAddress` switch expressions are unsupported. `executeWhen DebugFlag; ... endExecuteWhen;` instead uses a declared Boolean global execution flag, whose effective value comes from node settings/runtime flag control; it is not ordinary `if` or a source preprocessor.

[Conditional family](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/devref/ch1languageref/conditional_instructions.htm), [if](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/devref/ch1languageref/if_instruction.htm), [switch](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/devref/ch1languageref/switchinstruction.htm), [executeWhen](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/devref/ch1languageref/executewhen_instruction.htm).

<a id="iteration"></a>
## Iteration, collections and numeric ranges

```jade
foreach index in 1 to 3 do
    write index;
endforeach;
while remaining > 0 do
    remaining := remaining - 1;
endwhile;
```

These fragments require declared Integer variables. Native `foreach` also traverses collections and supported `JadeIterableIF` objects; numeric ranges support `step`. Collection variants include `where`, an `as` type clause, `reversed`, `discreteLock` and loop labels. These affect typing, ordering and locks: obtain the exact variant from the source instead of inventing a C# `for` loop. `while` re-evaluates its condition; numeric range bounds/step are evaluated before iteration. Boundaries and final increments can overflow a Byte loop variable.

[foreach and variants](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/devref/ch1languageref/foreach_instruction.htm), [numeric ranges](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/devref/ch1languageref/iterating_over_a_range_of_numeric_values.htm), [while](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/devref/ch1languageref/while_instruction.htm).

<a id="calls-control"></a>
## Calls and other control structures

```jade
if stopRequested then
    return;
endif;
```

`break` exits a loop; `continue` advances it; both support the documented loop labels. `return` exits the current method and must match its result signature. `inheritMethod` invokes the inherited implementation; use its actual signature. `terminate` has broader process/action effects and is not a substitute for `return`. External-library `call`, `importMethod`, package calls and application-context calls have specialized signatures/availability; preserve real external declarations and ABI types.

[Complete other-control inventory](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/devref/ch1languageref/other_control_structures.htm) links each instruction and Method Call. Do not replace these with `throw`, C# base-call syntax or a guessed import directive.

<a id="io"></a>
## Input and output

```jade
write "Count " & count.String;
```

`write` consumes one expression, not comma-separated arguments. Native `read count;` requires a supported interactive runtime; the current headless Scratch Pad reports interactive input unavailable. Language existence does not imply support in every host. Prefer supplied inputs in automated tests.

[read/write inventory](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/devref/ch1languageref/simple_input_and_output_instructions.htm).

<a id="exceptions"></a>
## Exception handlers and raise

With an appropriately declared Integer-returning handler method:

```jade
on Exception do handleFailure(exception);
// Run the guarded work here.
on Exception do null;
```

Handlers receive the exception object first. Their native return constants determine propagation/resumption; do not silently choose continue for every failure. `raise errorObject;` raises a user exception; the optional `internal`/`precondition` classification has defined contract semantics. Global handler arming uses the documented trailing `global` and requires deliberate disarming. Jade does not use a C#/JavaScript `try`/`catch`/`finally` block grammar.

[Exception instruction family](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/devref/ch1languageref/exception_handling_instructions.htm), [on exception and result codes](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/devref/ch1languageref/on_exception_instruction.htm), [raise](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/devref/ch1languageref/raise_exception_instruction.htm).

<a id="epilog"></a>
## Epilog cleanup

```jade
vars
    names : StringArray;
begin
    create names transient;
    names.add("Bubbles");
    write names.size;
epilog
    delete names;
end;
```

[Epilogs](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/devref/ch1languageref/epilogs.htm) run on normal exit and applicable exception unwinding, with the method's scope. They cannot guarantee cleanup after fatal runtime failure, and an exception inside cleanup can interrupt it. An epilog return can replace the body's return value. Avoid risky work in cleanup.

<a id="transactions-locks"></a>
## Transactions and read locking

Persistent updates require `beginTransaction` with `commitTransaction` or `abortTransaction`; shared-transient updates use `beginTransientTransaction`, `commitTransientTransaction`, `abortTransientTransaction`. These are distinct state machines. A method which updates its receiver may also require the `updating` option; that option alone does not begin a transaction.

```jade
beginTransaction;
    customer.balance := customer.balance + charge;
commitTransaction;
```

This fragment requires suitable declared objects, privileges and update context; executing it can commit real data. Do not run it merely to inspect source. `beginLoad`/`endLoad` and `beginLock`/`endLock` bound read transactions; automatic reference locking/latest-edition behavior differs. Review lock duration and explicit lock APIs for the actual operation rather than assuming a language-level transaction prevents every race.

[Transaction and concurrency inventory](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/devref/ch1languageref/transaction_and_concurrency_control_instructions.htm).

<a id="creation-lifetimes"></a>
## Creation, deletion and lifetime

```jade
create names transient;
delete names;
```

Assume `names : StringArray` is declared. The native create form can specify `as` with a class expression and `transient`, `persistent` or `sharedTransient`, subject to class lifetime permissions and transaction state. Extended construction, such as `reference := create MyClass(arguments) transient;`, requires a compatible declared constructor. Its class name is explicit; do not combine it with the other create form's dynamic `as` clause. Default creation lifetime depends on class metadata. Assigning an object reference does not clone the object; deleting an object is different from assigning `null` to one variable.

[create and version notes](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/devref/ch1languageref/create_instruction.htm), [creation/deletion family and restrictions](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/devref/ch1languageref/instructions_for_creating_and_deleting_objects.htm).

<a id="collections-interfaces-generics"></a>
## Collections, interfaces and native generics

Use actual Array, Set, Dictionary and user-defined collection types with their native membership/key metadata. For example, this is a **CLS section fragment**, requiring the matching declared collection and member class:

```text
membershipDefinitions
    PetDictionary of Pet;
```

Interfaces are declared contracts, not constructible classes; an interface-typed reference must point to an implementing object. Preserve extracted interface definitions/mappings (`interfaceDefinitions`, `implementInterfaces`) and package aliases. `JadeIterableIF` enables native foreach integration; it is not a license to assume arbitrary objects are iterable.

Native generic dictionary methods use `KeyType`/`MemberType` in the correct dictionary owner context. The other documented pseudo types are `InstanceType`, `SelfType`, `ParamListType`, and `PropertyListType`. They are compiler substitutions with specific contexts, not a C# `<T>` class declaration or a general `any` escape hatch. For a dictionary owner whose contract permits it, a method may declare `findEntry(keys : KeyType) : MemberType;`; resolve the owner's real key list before generating the implementation.

[Pseudo-type inventory](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/devref/ch1languageref/pseudo_types.htm), [generic dictionary methods](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/devref/ch1languageref/using_generic_jade_dictionary_methods.htm), [interface/collection concepts](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/userguide/appaglossary/appendix_a_-_glossary.htm). Read [CLS structure](cls-format.md) for metadata sections; collection methods and allowed keys remain native class APIs.

<a id="metadata-system-variables"></a>
## System variables, metadata and package scope

Resolve `self`, `selfType`, `app`, `appContext`, `currentSchema`, `currentSession`, `global`, `exception`, `method`, `node`, `process`, `rootSchema` and `system` in their actual execution context. Their members have declared native types: do not invent `app.actualDate` or assume every clock member returns Time.

For a declared `Pet` class with a `name` property, metadata access can use:

```jade
write Pet::name.name;
```

The `::` operator here selects metadata; `PackageAlias::ClassName` is package qualification in its own documented context. These are not a blanket C# namespace or arbitrary schema-qualified-name grammar. Use the actual imported alias and schema visibility.

[Metadata syntax](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/devref/ch1languageref/accessing_meta_data.htm), [specific meta-object access](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/devref/ch1languageref/accessing_a_property__constant__or_method_in_a_metaschema.htm), [system-variable index](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/devref/ch1languageref/system_variables.htm).

<a id="regex-unicode"></a>
## Regex and Unicode

Regex is a native class API, not JavaScript `/pattern/flags` literal syntax. Use `JadeRegex` type methods or a `JadeRegexPattern` with the declared signature and cleanup appropriate to that object. Unicode code points, surrogate pairs, String characters and UTF-8 bytes are distinct; obtain the operation's units from its type documentation instead of assuming every index counts bytes.

```jade
// A normal string may contain non-ASCII text.
label := "Māori";
```

[Regex family and version](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/devref/ch1languageref/regexpatternmatching.htm), [Unicode/surrogate-pair topic through the notation index](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/devref/ch1languageref/jade_language_notation.htm). Verify encoding and index semantics of the actual String/StringUtf8 method.

<a id="versioned-syntax"></a>
## Explicit version boundaries

Null-conditional access is **2025 R2 and higher**, not a feature to emit unconditionally for every 25.0 installation:

```jade
label := pet?.name;
```

The receiver must be an object reference. The related `collection?[key]` form guards a null collection receiver, not invalid keys/indexes. It cannot be an assignment target or an io/output argument and does not make an entire surrounding arithmetic expression nullable. Read all limitations before generating chained forms. On a runtime without this feature, use ordinary explicit null tests.

[Null-conditional syntax and release limit](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/devref/ch1languageref/nullconditionaloperator.htm). Other notable boundaries: `switch` is 2025.0.01+, compound assignments are 2020.0.02+, and foreach with `JadeIterableIF` is 2020.0.01+. The installed compiler decides availability; an online page's 2025 folder alone is insufficient.

<a id="vocabulary"></a>
## Complete vocabulary and extension points

Consult the full [reserved-word inventory](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/devref/ch1languageref/reserved_words.htm) and [special-symbol table](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/devref/ch1languageref/special_symbols.htm), including native extract-only words. Do not treat an editor's syntax colors or this guide's examples as the complete list of valid identifiers/instructions. Internal double-underscore names and system-name conventions have additional restrictions.

For every less-common feature, follow its entry in the [complete language chapter](https://secure.jadeworld.com/developer-centre/Jade2025/OnlineDocumentation/content/resources/devref/ch1languageref/chapter_1_-_jade_language_reference.htm), then the relevant native class or external-interface manual. Reflection, external calls, schema/package/interface declarations and UI methods are not interchangeable with signature-free Scratch Pad statements. This audit covers the chapter's topic families; it does not claim that every option combination, overload, class API or schema-file production has been implemented or compiled by this extension.
