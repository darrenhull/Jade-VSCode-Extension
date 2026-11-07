---
name: jade-language
description: Write, explain and correct native Jade class source, method bodies and Scratch Pad Workspace code, using Jade types, expressions, strings and native compiler diagnostics. Use for Jade application development, not Pug templates or jadelang.org.
---

# Jade language

Use the project's installed Jade version and native compiler as the authority. The references below target Jade 2025. Check the matching version before relying on newer features.

## Before writing code

- Resolve class names through their schema and the current project's source. Check existing method signatures, property declarations and package aliases instead of inventing APIs.
- Distinguish a signature-free Scratch Pad/Workspace body from a named method or a complete native CLS file. A method has a signature; a Workspace body starts with optional declarations and `begin`.
- Preserve native schema headers, identifiers, class/property numbers and meaningful file structure. Change the requested member rather than rewriting an extracted file.
- Use exact type names such as `Integer`, `String`, `Boolean`, `Decimal`, `Real`, `Date`, `Time` and `TimeStamp`. Language keywords such as `vars`, `begin`, `if`, `then` and `end` are lowercase.
- Primitive declaration syntax depends on context: local Decimal variables require a descriptor, for example `amount : Decimal[12,2];` (total digits, decimal places). Bare `amount : Decimal;` is invalid. Precision is 1..23 and scale is 0..precision; omitting scale means zero decimal places. Do not copy variable/property descriptors blindly into method parameter or return declarations. Look up the relevant declaration rule.
- Assignment uses `:=`; equality tests use `=`. Terminate declarations and instructions with semicolons. `write` accepts one expression, not a comma-separated argument list.
- Convert `Integer`, `Integer64`, `Real` and `Decimal` values to text with the native `.String` conversion: `firstFloat.String`, `firstInt.String` or `(x + y).String`. This is not a method call: do not generate `.asString()`, `.toString()` or `.String()` for these conversions. String variables already contain text and need no conversion.
- Construct dynamic strings with `&` and explicit primitive conversion such as `(x + y).String`. Do not assume C#, JavaScript or Python interpolation, or a `String::format` API. Verify any project-specific formatting helper before calling it.

For declaration, control flow, objects, transactions and exception rules, read [the syntax reference and official-document map](references/syntax-reference.md). It identifies context-dependent rules and routes less-common constructs to the authoritative documentation; this skill is not a complete replacement for the language manual.

For examples and type/syntax links, read [the language reference](references/language-reference.md). Its string section covers dynamic messages, primitive conversions, typed date/time formatting and parameterized translatable strings.

For native class files, read [CLS extract structure](references/cls-format.md) before changing sections, method declarations, completeness qualifiers or identity metadata.

## Check the result

Use available Jade Tools commands, the native CLI or the project's Jade MCP tools to compile and, when requested, execute the intended code. Report native error codes and source locations. A snippet or AI suggestion is not evidence of a successful compile.

Keep local saving, compilation and publication distinct. Build/test/Scratch Pad use Working; publishing changes Source and needs the user's publication instruction. Working can retain data committed by executed code; it is not an operating-system sandbox.

Scratch Pad currently prepares saved workspace definitions before executing its body. If preparation fails in another CLS file, identify that file and explain that the scratch code did not execute. Do not rewrite unrelated user source to hide the failure.

Copilot's agent can select this skill for authoring tasks. Inline ghost-text/Tab suggestions use a different context path; installing this skill does not guarantee their syntax.

## Official references

- [Complete language reference topic index](https://secure.jadeworld.com/developer-centre/Jade2025/OnlineDocumentation/content/resources/devref/ch1languageref/chapter_1_-_jade_language_reference.htm)

- [Jade language syntax](https://secure.jadeworld.com/developer-centre/Jade2025/OnlineDocumentation/content/resources/devref/ch1languageref/jade_language_syntax.htm)
- [Encyclopaedia of Primitive Types](https://secure.jadeworld.com/developer-centre/JADE2025/Docs/EncycloPrim.pdf)
- [String methods](https://secure.jadeworld.com/developer-centre/JADE2025/OnlineDocumentation/content/resources/encycloprim/string_type/string_methods.htm)

These are language references, not permission to publish, alter stored data or run unrelated application code.
