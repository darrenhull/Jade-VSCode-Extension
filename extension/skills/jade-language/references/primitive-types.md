# Complete primitive-type checklist

This checklist covers **all 18 primitive types** enumerated by the official Jade 2025 [Encyclopaedia of Primitive Types](https://secure.jadeworld.com/developer-centre/JADE2025/Docs/EncycloPrim.pdf). It is not the complete language grammar or a catalogue of every method. The live documentation can include 2025.0.03 features while a project runs 25.0.02; check the installed version and the exact signature before using a method.

`Duration` is **not** a primitive in that index. Use the documented `TimeStampInterval` when the intended value is an interval; do not invent a .NET-style type. `Object`, application classes and collection classes are references, not additional primitives. Pseudo types in signatures are a separate language category.

## Declaration and initialization matrix

Examples below are local declarations/assignments, not instructions to add descriptors to every parameter or return signature. Default observations are from the native **25.0.02 Scratch Pad** audit: they describe referenced local variables before explicit assignment, not every property, output parameter, or execution mode. Explicit initialization is preferable for deterministic examples.

| Primitive | Example local declaration / initialization | Default observed; bounds and conversion notes | Official type |
| --- | --- | --- | --- |
| `Any` | `value : Any;` then `value := 42;` | Unassigned: `hasValue__` is false. Assign before converting to the actual contained type; `value.Integer.String` is appropriate only when its value is Integer. Any cannot be a stored property. | [Any](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/encycloprim/any_type/any_type.htm) |
| `Binary` | `data : Binary[4];` then `data := #[41 42];` | Initially empty; bounded or unbounded locals are allowed. Bounds/indexing concern bytes. `.Binary` can expose a primitive's internal representation; it is not a generic text encoding operation. | [Binary](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/encycloprim/binary_type/binary_type.htm) |
| `Boolean` | `ready : Boolean;` then `ready := true;` | Initially false; use `true`/`false`, relational expressions and `and`/`or`/`not`. `.String` produces text, not a method call. | [Boolean](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/encycloprim/boolean_type/boolean_type.htm) |
| `Byte` | `value : Byte;` then `value := (7).Byte;` | Initially zero; range **0..255**. Assignment from Integer, Integer64, Decimal or Real (including numeric literals) requires an explicit conversion; Byte-to-Byte assignment does not. Arithmetic involving Byte produces Integer. `(#FF).Byte` is valid; bare `#FF` is not a typed Byte. | [Byte](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/encycloprim/byte_type/byte_type.htm) |
| `Character` | `initial : Character;` then `initial := "J";` | Initially null character. A one-character string is supported. Character meaning depends on the ANSI/Unicode environment; do not equate a character with an arbitrary byte or Unicode scalar. | [Character](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/encycloprim/character_type/character_type.htm) |
| `Date` | `day : Date;` then `day.setDate(7,11,2026);` | A referenced local starts at today's date. Stored Date attributes start null. Date arithmetic is in days; subtraction of two Dates produces Integer. Quoted date-shaped text requires conversion or parsing. | [Date](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/encycloprim/date_type/date_type.htm) |
| `Decimal` | `amount : Decimal[12,2];` then `amount := 12.50;` | Initially zero at the declared scale. A local descriptor is required: precision 1..23 total digits, scale 0..precision. Final assignment rounds to the destination scale; overflow is an error. Bare Decimal in a native signature is a separate rule. | [Decimal](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/encycloprim/decimal_type/decimal_type.htm) |
| `Integer` | `count : Integer;` then `count := 3;` | Initially zero. Documented range -2,147,483,648..2,147,483,647. Use `div` for truncated integer division and `.String` for text. | [Integer](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/encycloprim/integer_type/integer_type.htm) |
| `Integer64` | `large : Integer64;` then `large := 2147483648;` | Initially zero. Use for larger whole-number values. The linked reference documents -9,223,372,036,854,775,807..9,223,372,036,854,775,807; check the target version at edge values rather than importing another language's literal/overflow rules. This audit initializes 2,147,483,648; it is not an exhaustive limit test. | [Integer64](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/encycloprim/integer64_type/integer64_type.htm) |
| `MemoryAddress` | `address : MemoryAddress;` then `address := null;` | Initially null. Use null, **not integer zero**, for an empty address. A non-null pointer is meaningful only on its originating node; do not fabricate or dereference sample addresses. Ordinary arithmetic is not permitted. | [MemoryAddress](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/encycloprim/memoryaddress_type/memoryaddress_type.htm) |
| `Point` | `position : Point;` then `position.set(3,4);` | Initially `0,0`. Contains integer x/y coordinates; initialize with its native setter. GUI interpretation also depends on the relevant control's units. | [Point](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/encycloprim/point_type/point_type.htm) |
| `Real` | `temperature : Real;` then `temperature := 1.5;` | Initially zero; floating point with approximately 15 significant digits. Use Decimal/Integer when the application requires exact decimal/whole-number precision. `.String` is a conversion. | [Real](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/encycloprim/real_type/real_type.htm) |
| `String` | `text : String[20];` then `text := "hello";` | Initially empty. Bounded/unbounded locals are valid. Indices start at 1; `[start:length]` uses a length, not an end index. | [String](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/encycloprim/string_type/string_type.htm) |
| `StringUtf8` | `text : StringUtf8[20];` then `text := @"Jade";` | Initially empty. Bounded/unbounded locals are valid. Native literals use `@`; ordinary indexing/substrings count characters, while `size` concerns encoded bytes. Check the particular conversion's encoding semantics. | [StringUtf8](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/encycloprim/stringutf8_type/stringutf8_type.htm) |
| `Time` | `clock : Time;` then `clock.setTime(13,14,15,0);` | A referenced local starts at current time. Time arithmetic uses milliseconds and can wrap past midnight. It is not an interval or an Application timestamp result. | [Time](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/encycloprim/time_type/time_type.htm) |
| `TimeStamp` | `stamp : TimeStamp;` then set its Date and Time components | A referenced local starts at current date/time. Adding/subtracting intervals has documented semantics and does not automatically account for daylight-saving changes. | [TimeStamp](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/encycloprim/timestamp_type/timestamp_type.htm) |
| `TimeStampInterval` | `elapsed : TimeStampInterval;` then `elapsed := later - earlier;` | Initially a zero interval. Represents a difference between timestamps, not a clock reading. Use its native methods for duration components; do not assume .NET TimeSpan APIs. | [TimeStampInterval](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/encycloprim/timestampinterval_type/timestampinterval_type.htm) |
| `TimeStampOffset` | `offset : TimeStampOffset;` then `offset.setFromLocalTimeStamp(stamp,0);` | A referenced local starts at current date/time/offset. Represents a UTC instant plus offset; the explicit zero bias example is deterministic. Select presentation-client/application-server/server clock APIs intentionally. | [TimeStampOffset](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/encycloprim/timestampoffset_type/timestampoffset_type.htm) |

## Conversion and literal traps

Native conversion syntax is `expression.PrimitiveType`, without call parentheses. It is not permission to convert every pair of types: consult the [conversion tables](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/devref/ch1languageref/converting_primitive_types.htm). Parenthesize calculations first. Runtime overflow remains possible even when a conversion compiles.

The [hexadecimal literal rules](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/devref/ch1languageref/hexadecimal_literals.htm) distinguish `#FF` (numeric) from `#[41 42]` (Binary) and other forms. `byteValue := #FF;` failed native compilation with **6072**. `byteValue := (#FF).Byte;` passed and produced **255**. Converting variables containing 256 or -64 to Byte compiled but failed during execution with **4011**, without reaching the following output instruction. Bounds 0 and 255 passed.

Numeric primitive `.String` conversion is different from the legitimate [Any.asString](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/encycloprim/any_type/asstring.htm) method. Do not ban a method merely because its name resembles a mistake on another type. Resolve the actual receiver and signature.

Unassigned Any requires particular care: the tested runtime returned `hasValue__ = false`, `getType.name = "Any"` and empty `asString`. Do not assume `getType = null` on every version. Initialize the value and inspect it using supported Any methods. [hasValue__](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/encycloprim/any_type/hasvalue__.htm) is documented from 2022.0.04 onward.

## Current date/time: do not invent Application members

[Application.actualTime](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/encyclosys1/application_class/actualtime.htm) returns **TimeStamp**, not Time. The audited RootSchema Application did not supply `actualDate`; a project-defined method must be resolved from real source rather than assumed. The following fixture compiled and executed:

```jade
vars
    stamp : TimeStamp;
    day : Date;
    clock : Time;
begin
    stamp := app.actualTime;
    day := stamp.Date;
    clock := stamp.Time;
    write day.String & " " & clock.String;
end;
```

Choose `actualTime`, `actualTimeAppServer` or `actualTimeServer` according to the required node. Thin-client behavior and time zones differ. For reproducible data, use explicit Date/Time setters rather than the current clock.

## Verification boundaries

`test/fixtures/jade-primitive-matrix.jade` compiles, initializes and outputs all 18 types. `jade-primitive-defaults.jade` separately measures referenced local defaults. The Byte/clock fixtures preserve both expected compile failures and runtime failures; these are language checks, not extension defects or simulated AI successes. The sanitized native receipt is `docs/test-evidence/primitive-audit.json`.

The guide's rows cover declarations, initialization and high-risk conversions. They do **not** establish every possible type conversion, external-call ABI, property bound, overflow combination, locale, lifetime or method. Use the [full language topic index](https://secure.jadeworld.com/developer-centre/Jade2025/OnlineDocumentation/content/resources/devref/ch1languageref/chapter_1_-_jade_language_reference.htm), the linked type page and actual native compilation for the requested construct.
