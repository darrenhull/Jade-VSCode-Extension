# Jade syntax and type reference

This is a compact authoring guide for native Jade 2025. Use the linked official documentation for full signatures and runtime/version details.

## Common types

| Type | Typical use |
| --- | --- |
| `Integer`, `Integer64` | Whole numbers; choose the range required by the application |
| `Decimal[p,s]` | Fixed-precision local variable; descriptor required, e.g. `Decimal[12,2]` |
| `Real` | Floating-point calculations; preserve the project's precision rules |
| `Boolean` | `true` or `false` |
| `Character`, `String` | Characters and text |
| `Date`, `Time`, `TimeStamp` | Date/time values; check each type's own initialization and formatting methods |
| `Binary` | Binary data |
| A schema-qualified application class | An object reference; respect schema visibility and native lifetime rules |

[Primitive types and their methods](https://secure.jadeworld.com/developer-centre/JADE2025/Docs/EncycloPrim.pdf). Do not substitute an untyped value to bypass a missing or incorrectly cased type.

## Decimal descriptors are required on local variables

Use `amount : Decimal[12,2];`, not `amount : Decimal;`. Precision counts total digits, not only digits before the decimal point. Scale counts fractional digits. Precision is 1..23; scale is 0..precision. `Decimal[12]` means scale zero. Choose values for the application rather than copying 12,2 universally.

```jade
vars
    amount : Decimal[12,2];
    isReady : Boolean;
begin
    amount := 12.50;
    isReady := true;
    write "Amount: " & amount.String & "; ready: " & isReady.String;
end;
```

Bare local Decimal causes native error 7699. Method parameter and return declarations have their own rules: do not mechanically add a storage descriptor everywhere a Decimal type appears. Decimal assignment rounds to the destination scale; preserve required precision and check native overflow/rounding behaviour.

[Decimal type](https://secure.jadeworld.com/developer-centre/Jade2025/OnlineDocumentation/content/resources/encycloprim/decimal_type/decimal_type.htm) · [Parameters](https://secure.jadeworld.com/developer-centre/Jade2025/OnlineDocumentation/content/resources/devref/ch1languageref/parameters.htm) · [Broader syntax rules](syntax-reference.md)

## Workspace body versus method

This signature-free Scratch Pad body was compiled and executed with native Jade 25.0.02:

```jade
vars
    x : Integer;
    y : Integer;
begin
    x := 10;
    y := 20;
    write "The sum of x and y is: " & (x + y).String;
end;
```

Output: `The sum of x and y is: 30`.

A named method includes its signature before declarations:

```jade
sumText(x : Integer; y : Integer) : String;
begin
    return "The sum is " & (x + y).String;
end;
```

Method parameters use semicolons between declarations; call arguments use commas. A complete CLS also needs the corresponding native method declaration and owner/source sections. A method body alone is not a complete import file.

[Language syntax](https://secure.jadeworld.com/developer-centre/Jade2025/OnlineDocumentation/content/resources/devref/ch1languageref/jade_language_syntax.htm) · [Language notation and parameters](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/devref/ch1languageref/jade_language_notation.htm)

## Strings and interpolation-style messages

### Compose values using native concatenation

```jade
vars
    petName : String;
    grams : Integer;
    message : String;
begin
    petName := "Bubbles";
    grams := 125;
    message := "Pet " & petName & " weighs " & grams.String & "g";
    write message;
end;
```

This gives the effect often requested as string interpolation. Parenthesize arithmetic before conversion: `(x + y).String`. Do not generate `$"{name}"`, JavaScript template literals or Python f-strings as native Jade syntax. The documented String method catalogue does not supply `String::format`; application-defined helpers must be checked in source.

[String concatenation](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/devref/ch1languageref/string_concatenation_operator.htm) · [Primitive conversions](https://secure.jadeworld.com/developer-centre/Jade2025/OnlineDocumentation/content/resources/devref/ch1languageref/type_casts.htm) · [Literals](https://secure.jadeworld.com/developer-centre/Jade2025/OnlineDocumentation/content/resources/devref/ch1languageref/literals.htm)

### Convert Real and Integer values to text

Use the native `.String` conversion without parentheses for both `Real` and `Integer`. Do not generate `.asString()`, `.toString()` or `.String()` for this purpose. Existing String values concatenate directly.

```jade
vars
    firstFloat : Real;
    secondFloat : Real;
    firstInt : Integer;
    secondInt : Integer;
    firstString : String;
    secondString : String;
begin
    firstFloat := 1.5;
    secondFloat := 2.5;
    firstInt := 3;
    secondInt := 4;
    firstString := "hello";
    secondString := "world";

    write "The floats are " & firstFloat.String & " and " & secondFloat.String &
        ", the integers are " & firstInt.String & " and " & secondInt.String &
        ", and the strings are " & firstString & " and " & secondString & ".";
end;
```

### Format typed date/time values

Given existing `born : Date` and `clock : Time` values:

```jade
dateText := born.format("dd.MM.yyyy");
timeText := clock.format("HH:mm:ss");
```

These are Date/Time methods, not String formatting. Their picture tokens and locale behavior differ: check the exact type's table, especially `MM` for a month and `mm` for minutes in these pictures. Declare the destination String variables and initialize the inputs in the surrounding code.

[Date.format](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/encycloprim/date_type/format.htm) · [Time.format](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/encycloprim/time_type/format.htm)

### Reuse localized parameterized messages

If the current schema already declares a parameterized translatable string named `PetSummary` with two parameters, a caller can use:

```jade
write $PetSummary(petName, grams.String);
```

The `$` here refers to a declared translatable string; it is not a general interpolation prefix. Resolve the real schema declaration, locale and parameters before using it. This example is conditional on that declaration and is not standalone Scratch Pad code.

[Adding translatable and parameterized strings](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/userguide/ch11localization/adding_strings.htm)

## Control flow and declarations

```jade
if x > y then
    write x;
else
    write y;
endif;
```

This assumes `x` and `y` are declared in the surrounding method. Source property declarations belong in their native sections, for example `species : String[30];` under `attributeDefinitions`. Reference declarations belong under `referenceDefinitions`. Keep extracted native metadata when editing an existing declaration.

[Language notation](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/devref/ch1languageref/jade_language_notation.htm) · [write instruction](https://secure.jadeworld.com/developer-centre/Jade2025/OnlineDocumentation/content/resources/devref/ch1languageref/write_instruction.htm)
