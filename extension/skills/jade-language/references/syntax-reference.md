# Jade syntax reference and authoritative lookup map

Use this guide before generating native methods, class declarations or Scratch Pad code. It records common cross-language mistakes and links the full official language reference. It is not an exhaustive grammar or a substitute for native compilation. Check the installed Jade version: the 2025 documentation site includes both 2025.0.02 and 2025.0.03 pages.

## Start with the correct language and execution context

Jade is not Pug, C#, JavaScript, Pascal or a generic pseudocode dialect. A Scratch Pad Workspace body has optional declarations followed by one top-level `begin`/`end;` body. A named method also has its signature. A CLS file additionally contains native schema/type declaration and source sections; see [CLS structure](cls-format.md).

Start from the [complete Jade Language Reference topic index](https://secure.jadeworld.com/developer-centre/Jade2025/OnlineDocumentation/content/resources/devref/ch1languageref/chapter_1_-_jade_language_reference.htm), then follow the exact construct's syntax and semantics. Do not infer syntax from a similarly named method in another language.

## Declarations and descriptors

| Context/type | Rule |
| --- | --- |
| Local `Integer`, `Integer64`, `Real`, `Boolean` | Use the exact native type name; do not invent a generic numeric type |
| Local `Decimal` | Descriptor required: `amount : Decimal[12,2];` |
| Decimal descriptor | First number is total precision (1..23), second is fractional scale (0..precision); omitted scale is zero |
| Local `String` | Both `text : String;` and `text : String[100];` are valid; choose bounds intentionally |
| Local `Binary` | May also be bounded or unbounded; a String's character indexing is not a Binary's byte interpretation |
| `StringUtf8` | A distinct native primitive with its own literal/encoding rules; do not assume it is interchangeable with String in every API |
| Object or collection local | Declares a reference, not a newly created instance |
| Stored class property | Preserve its native bounded/unbounded descriptor, identity metadata and declaration section |
| Method parameter/return type | Follow signature rules separately; native methods legitimately accept/return bare `Decimal`, so do not add local storage descriptors everywhere |

A bare local `amount : Decimal;` raises 7699. Choosing `Decimal[12,2]` is an example, not a universal precision policy. Use the application's actual range and scale. See the [native Decimal example](language-reference.md#decimal-descriptors-are-required-on-local-variables).

[Decimal](https://secure.jadeworld.com/developer-centre/Jade2025/OnlineDocumentation/content/resources/encycloprim/decimal_type/decimal_type.htm) · [String](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/encycloprim/string_type/string_type.htm) · [Binary](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/encycloprim/binary_type/binary_type.htm) · [StringUtf8](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/encycloprim/stringutf8_type/stringutf8_type.htm) · [Attribute properties](https://secure.jadeworld.com/developer-centre/Jade2025/OnlineDocumentation/content/resources/userguide/ch4methodfeaturedef/adding_an_attribute_property.htm)

## Methods, parameters and dispatch

Method declarations separate parameter declarations with semicolons; call arguments use commas. Keep declaration/source signatures consistent. Parameter usage defaults to `constant`: it is not automatically `input` or `io`. `input` can permit updating a referenced object while still preventing reassignment of the reference. `output`/`io` copy-back and compatible reference types have native rules; do not substitute C# ref/out assumptions.

Declare type methods with `typeMethod`; invoke them using the native `TypeName@methodName()` form. A type method has a type receiver and uses `selfType` rather than instance `self`. `Class::method` in a diagnostic is not a recipe for native call syntax. Resolve inherited methods and package aliases from real schema-qualified declarations. Preserve updating, visibility and execution options instead of adding modifiers to suppress errors.

[Parameters](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/devref/ch1languageref/parameters.htm) · [Method structure](https://secure.jadeworld.com/developer-centre/Jade2025/OnlineDocumentation/content/resources/devref/ch1languageref/jade_language_syntax.htm) · [Type methods](https://secure.jadeworld.com/developer-centre/Jade2025/OnlineDocumentation/content/resources/devref/ch1languageref/type_methods.htm)

## Numeric expressions, conversion and rounding

Convert numeric values to text with `.String` without parentheses; do not invent `.asString()`, `.toString()` or `.String()` for that conversion. Parenthesize arithmetic first: `(firstInt + secondInt).String`. Concatenate using `&`; `write` takes one expression.

Do not assume a literal containing a decimal point is already a fixed-precision Decimal: its implicit type depends on its significant digits. Assignment to Decimal rounds to its destination scale, and overflow is a native error. `/` performs real division, while `div` truncates integer division; `^` is exponentiation. Check numeric promotion, precision and locale-sensitive parsing against the relevant type's methods. Do not silently switch Decimal calculations to floating-point Real merely to compile.

[Numeric literals](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/devref/ch1languageref/types_of_numeric_literals.htm) · [Arithmetic operators](https://secure.jadeworld.com/developer-centre/Jade2025/OnlineDocumentation/content/resources/devref/ch1languageref/arithmetic_binary_operators.htm) · [Decimal rounding](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/encycloprim/decimal_type/roundedto.htm) · [String construction](language-reference.md#strings-and-interpolation-style-messages)

### Byte initialization and arithmetic

A `Byte` is an unsigned value in the range 0 through 255. An unconverted Integer literal is not assignment-compatible with a Byte local and can produce native error 6072 (Incompatible types). Convert the numeric expression explicitly using `.Byte`, without parentheses after the type name. Check the permitted range first when the input is not a known in-range constant; overflow raises an exception.

Byte operands are implicitly converted to Integer for arithmetic, so an arithmetic result assigned back to a Byte also needs an intentional conversion and range check. This example starts at 7, so its increment remains in range:

```jade
vars
    byteValue : Byte;
begin
    byteValue := (7).Byte;
    write byteValue.String;
    byteValue := (byteValue + 1).Byte;
    write byteValue.String;
end;
```

Compile examples with the target runtime before relying on them. A hexadecimal or Binary literal is not a substitute for checking the expression's actual type.

[Byte type and arithmetic](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/encycloprim/byte_type/byte_type.htm) · [Primitive conversion rules](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/devref/ch1languageref/converting_primitive_types.htm)

## Literals, indexing and substrings

Use `true`, `false` and `null` as native literals, not quoted stand-ins. A Character can be represented by a one-character string. Strings can use single or double quotation marks; use the official literal rules for embedded quotes, escapes and Unicode instead of importing C# or JavaScript interpolation syntax. Comments and documentation text have native roles; do not rewrite their contents as code.

String indexing starts at **1**. Substrings use `[start:length]`, not a zero-based half-open range or an end index. `text[2:3]` requests three characters starting at the second. StringUtf8 indexing counts characters; Binary semantics concern bytes. Choose explicit types and review boundary conditions.

[Literals](https://secure.jadeworld.com/developer-centre/Jade2025/OnlineDocumentation/content/resources/devref/ch1languageref/literals.htm) · [String indexing](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/encycloprim/string_type/string_type.htm) · [Reserved words](https://secure.jadeworld.com/developer-centre/Jade2025/OnlineDocumentation/content/resources/devref/ch1languageref/reserved_words.htm)

## Dates, times and initialization

A quoted date-shaped String is not automatically a Date literal. A documented inline conversion is `"2026:11:07".asDate`; check for invalid input and use four-digit years. Do not assume a local Date has the same default as a stored Date attribute: the documented defaults differ. Initialize dates explicitly when the task needs deterministic values.

Use each type's documented initialization, arithmetic and formatting methods. Date picture `MM` and Time picture `mm` have different meanings. TimeStamp, TimeStampOffset and intervals have distinct APIs; resolve their signatures instead of assuming a .NET DateTime or JavaScript Date constructor.

[String.asDate](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/encycloprim/string_type/asdate.htm) · [Date](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/encycloprim/date_type/date_type.htm) · [Typed formatting examples](language-reference.md#format-typed-datetime-values)

## Control flow and iteration

Use native delimiters: `if ... then ... elseif ... else ... endif;`, `while ... do ... endwhile;` and `foreach ... in ... do ... endforeach;`. Numeric range iteration is a form of native foreach; look up its `to`/`step` rules rather than inventing a C-style for loop or `endfor`.

A collection foreach may include a `where` condition. `reversed` and `discreteLock` have native ordering/locking semantics, not merely formatting effects. Jade 2025 includes `switch ... do`, `case ...:`, optional `default:` and `endswitch;`; supported switch expression types are restricted and cases do not fall through. In particular, do not assume Real or Decimal switch expressions are supported.

[Iteration and all control structures](https://secure.jadeworld.com/developer-centre/Jade2025/OnlineDocumentation/content/resources/devref/ch1languageref/chapter_1_-_jade_language_reference.htm) · [foreach](https://secure.jadeworld.com/developer-centre/Jade2025/OnlineDocumentation/content/resources/devref/ch1languageref/foreach_instruction.htm) · [switch](https://secure.jadeworld.com/developer-centre/Jade2025/OnlineDocumentation/content/resources/devref/ch1languageref/switchinstruction.htm)

## Object and collection lifetime

A variable referencing a class does not create an object. Use native `create`/`delete` and an intentional permitted lifetime. Omitting the create lifetime uses the class default; do not assume every new object is transient. Arrays, sets and dictionaries are objects with membership, key and ownership rules. An exclusive collection property has different creation semantics from a standalone local collection. Verify the actual class and signatures before generating add, lookup or iteration calls.

[create](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/devref/ch1languageref/create_instruction.htm) · [Collection](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/encyclosys1/collection_class/collection_class.htm)

## Transactions, exceptions and cleanup

Persistent object updates require the appropriate persistent transaction. Shared transient updates use a transient transaction; ordinary process-local transient objects are a different lifetime. Do not add commit/abort instructions casually, or assume every failure rolls back earlier commits. A Workspace executes in Working and can retain committed data between runs.

Native exception registration uses `on ExceptionClass do handler(exception);`; handlers and their Integer action results must match the native exception framework. Do not invent try/catch/finally syntax. An `epilog` is the native method cleanup section; use it for resources actually owned by the code. Its exception-exit behaviour does not guarantee cleanup after fatal process termination.

[Transactions and exception instructions](https://secure.jadeworld.com/developer-centre/Jade2025/OnlineDocumentation/content/resources/devref/ch1languageref/chapter_1_-_jade_language_reference.htm) · [Transient transactions](https://secure.jadeworld.com/developer-centre/Jade2025/OnlineDocumentation/content/resources/devref/ch1languageref/begintransienttransaction_instruction.htm) · [Exception registration](https://secure.jadeworld.com/developer-centre/Jade2025/OnlineDocumentation/content/resources/devref/ch1languageref/on_exception_instruction.htm) · [Epilogs](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/devref/ch1languageref/epilogs.htm)

## Beyond this guide

For interfaces, imports, overrides, dynamic types, regular expressions, external functions, event methods, system variables, locking and specialized collection APIs, follow the exact official topic and the project's declarations. Do not fill a gap with an Any type or a guessed API. Runtime/session globals are not arbitrary objects available in every execution context; Report Writer restrictions are also different from ordinary Workspace code.

Before presenting generated code as fixed, compile the exact code through available native Jade tools, and execute only when requested. If native validation is unavailable, say so. Skills and attachments improve context; they cannot guarantee that an AI proposal is syntactically or semantically correct.
