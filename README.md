# @willbooster/tree-sitter-c

[![npm version](https://img.shields.io/npm/v/@willbooster/tree-sitter-c.svg)](https://www.npmjs.com/package/@willbooster/tree-sitter-c)
[![license](https://img.shields.io/npm/l/@willbooster/tree-sitter-c.svg)](https://www.npmjs.com/package/@willbooster/tree-sitter-c)
[![Test](https://github.com/WillBooster/tree-sitter-c/actions/workflows/test.yml/badge.svg)](https://github.com/WillBooster/tree-sitter-c/actions/workflows/test.yml)
[![Test rust](https://github.com/WillBooster/tree-sitter-c/actions/workflows/test-rust.yml/badge.svg)](https://github.com/WillBooster/tree-sitter-c/actions/workflows/test-rust.yml)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)
[![wbfy](https://img.shields.io/badge/wbfy-20.48.9-1e90ff.svg)](https://github.com/WillBooster/shared/tree/main/packages/wbfy)
[![crates.io](https://img.shields.io/crates/v/willbooster-tree-sitter-c.svg)](https://crates.io/crates/willbooster-tree-sitter-c)

C grammar for [tree-sitter](https://github.com/tree-sitter/tree-sitter), forked from
[tree-sitter/tree-sitter-c](https://github.com/tree-sitter/tree-sitter-c). We are grateful
to its authors and contributors. This is not an official release of that project.

This fork fixes parsing bugs and raises conformance with the ISO C standard
([C23 working draft N3220](https://www.open-std.org/jtc1/sc22/wg14/www/docs/n3220.pdf)).

## Usage

The npm package ships `tree-sitter-c.wasm` for
[@willbooster/web-tree-sitter](https://www.npmjs.com/package/@willbooster/web-tree-sitter) version 15.0.0 or later within 15.x, which runs in Node.js, Bun, browsers, and Cloudflare Workers. The parser carries the ABI number of the WillBooster/tree-sitter generator (`0x5742000b`), so it loads only with that runtime; upstream tree-sitter runtimes reject it. In Node.js and Bun, load the grammar from its path:

```js
import { fileURLToPath } from 'node:url';

import { Language, Parser } from '@willbooster/web-tree-sitter';

await Parser.init();
const parser = new Parser();
const wasmPath = fileURLToPath(import.meta.resolve('@willbooster/tree-sitter-c/tree-sitter-c.wasm'));
parser.setLanguage(await Language.load(wasmPath));
const tree = parser.parse('int main(void) { return 0; }\n');
```

In browsers, serve both `.wasm` files and load them by URL (the example uses Vite's `?url` imports):

```js
import cUrl from '@willbooster/tree-sitter-c/tree-sitter-c.wasm?url';
import { Language, Parser } from '@willbooster/web-tree-sitter';
import runtimeUrl from '@willbooster/web-tree-sitter/web-tree-sitter.wasm?url';

await Parser.init({ locateFile: () => runtimeUrl });
const parser = new Parser();
parser.setLanguage(await Language.load(cUrl));
```

Cloudflare Workers do not allow compiling Wasm at run time, so import both `.wasm` files as modules, with or without
Node.js compatibility:

```js
import c from '@willbooster/tree-sitter-c/tree-sitter-c.wasm';
import { Language, Parser } from '@willbooster/web-tree-sitter';
import runtime from '@willbooster/web-tree-sitter/web-tree-sitter.wasm';

await Parser.init({ wasmModule: runtime });
const parser = new Parser();
parser.setLanguage(await Language.load(c));
```

The package also ships `grammar.js`, scanner sources under `src/`, the queries in `queries/`,
and the node types in `src/node-types.json` for grammars extending C (such as C++).
The scanner sources include `scanner.c`, `pragma.h`, `identifier.h`, `keywords.h`, `functionMacro.h`, and
`conditionalMacro.h`.

Derived grammars must port the inherited external-token dispatch from `src/scanner.c`.
Keep preprocessor argument/newline handling ahead of annotation lookahead.
Port `_conditional_marker_ifdef`, `_conditional_marker_ifndef`, `_leading_conditional_marker_ifdef`, and
`_leading_conditional_marker_ifndef` with `scan_conditional_macro`. The leading pair checks a following type prefix;
when both contexts are valid, choose the leading role if its type proof succeeds, otherwise use the valid
post-type role. Each token consumes only its opening directive keyword; the directive body, closing directive and following prefix are lookahead. Keep this dispatch ahead of
the function-annotation guards and return immediately after a failed directive scan.
The hidden `_function_attribute_start`, `_post_type_function_attribute_start`,
`_post_type_function_attribute_suffix`, and `_braced_function_attribute_start` guards look ahead before the ordinary
identifier token. Keep them outside the name field so identifier leaves and ordinary C lexing retain their shape.
Port `scan_function_attribute_guard`, its `MacroAttributeSymbols` context, and the name-range handling in `pragma.h`.
Set `braced_start` to the inherited braced token and `allow_braced_start` from its valid-symbol entry.
Omitting these fields disables braced handoff in the current argument group and in prototype-tail lookahead.
Preserve the inherited external-token order before adding tokens specific to the derived grammar.

Port `_braced_macro_type_start` and `scan_braced_macro_type_start` before function-annotation lookahead.
This separate zero-width guard proves marker words followed by a braced macro-type argument; the grammar still
consumes each marker and validates its type. Keep `MacroName.preserve_end` in `pragma.h` so scanning subsequent words
does not move the guard's end. Its default is false for ordinary name scans. Derived grammars can supply reserved
starter words and the same `MacroAttributeSymbols` context to the guard helper; the C scanner supplies an empty table.
The helper shares pragma and scalar-object dispatch with annotation guards. Copy both `functionMacro.h` and `pragma.h`
when porting this dispatch. Later pragma lookahead must preserve the zero-width token end.

When overriding declarations or function definitions, retain both guarded ordinary-type/declarator alternatives and
annotation alternatives in ordinary, block, and for-declaration builders. Accept the matching passive guard after calling conventions and before ordinary, builtin,
and initialized declarators. Derived custom declaration builders also need `_guarded_type_specifiers` and
`_marked_macro_type_specifiers`; adapt their conflicts alongside these productions. Keep the marked-type rule's
ordinary type and annotation alternatives after the prefix guard, so typedef-return prototypes remain prototypes.
Guard-owned initialized declarators also need their `_declarator` supertype alias; accepting the syntax alone does not
preserve subtype queries. Keep ordinary initializers on their existing declarator family. Custom declaration builders
must admit `_bare_marker_initializer_declaration` where they need the published bare-name initializer preference.
If their ordinary function declarators reject C's opaque trailing identifiers, adapt that private initializer route
separately and retain its `_declarator` alias.
If a derived `type_specifier` omits C macro types, its anchored `_guarded_type_specifier` must explicitly retain them
to preserve braced macro-return function bodies. Its annotation type preguard must retain the derived grammar's
anchor policy as well, so unanchored recovery keeps the complete return prefix. These adaptations do not enable
unanchored macro types globally.
Without these adapters, braced parameters, default arguments, or direct initializers can become annotations and lose
their declaration boundaries. Copy the scanner headers from the same published C version
as the grammar, update its external-token enum, then regenerate the derived parser.
The `_trailing_object_declaration_start` guard checks an object prefix before declaration parsing;
`_trailing_macro_attribute_name` consumes only the annotation name and preserves its ordinary identifier leaf.
Keep the shared first-word dispatch so a failed lookahead never falls back from an advanced lexer cursor.
When both post-type guards are valid, prefer the continuation suffix so annotation chains remain on their existing path.
First prototype guards check the prototype tail; post-type continuation guards inspect only their own argument group.
Regenerate Unicode and keyword tables from the derived grammar's metadata.
The generation source is `script/generateIdentifierRanges.js` in this repository.
The primitive keyword data shared by grammar generation and object-prefix classification is in `src/grammarKeywords.cjs`.
The `_preproc_function_name` token ends before splices used to determine adjacency, so the `_preproc_lparen`
scanner must skip those splices again to reach `(`.

Annotation lookahead hands the first unquoted brace in an argument group to the grammar instead of scanning the
whole braced body. The argument grammar handles compound literals, inline types, aggregate initializers, and GNU
statement expressions. Proved braced arguments also accept named declarations such as `int a[sizeof(struct { int m; })]`.
Their `parameter_declaration` nodes retain public type and declarator subtype queries. Quoted punctuation and comments remain literal content. Semicolons and preprocessing directives
encountered before an unknown annotation's braced handoff reject that lookahead; directive-bearing arguments need
separate support. The marker proof balances recognized declaration-modifier groups, including inline types inside
attribute arguments, in one pass. Those recognized groups do not turn an attribute's internal brace into the following
macro type's handoff.
Balanced groups followed by a later braced annotation retain their original guard, so typed annotation chains remain
annotations. Guarded macro types require a first type descriptor; additional arguments are grammar-parsed only under
the current-group braced hint. A semicolon can terminate an anchored declaration macro without consuming the next
declaration.

Bare initialized names remain ambiguous without preprocessing or name binding: `Word ATTR(struct { int m; }) value = {0};`
can declare an integer when `Word` is a typedef and `ATTR` is empty, or a structure when `Word` is empty and `ATTR`
selects its argument. For a genuinely bare prefix with an initialized first declarator, the grammar preserves the
published first type-name preference, even though the remaining declarator can be approximate. Uninitialized marked
types and prefixes with recognized declaration attributes or known specifiers keep the concrete macro-type route.
This preference preserves query fields; it does not resolve both macro expansions semantically.

Annotation declarations use `_macro_modified_declaration`, `_macro_declaration_specifiers`,
`_macro_declaration_declarator`, and `_header_preproc_item`. Adapt these rules alongside public declaration/type
overrides when extending C. Keep `_macro_only_declaration` as a complete semicolon-terminated item and allow
`_macro_declaration_specifiers` in function definitions so their bodies stay attached. The annotation declarator uses
`function_declarator` to retain trailing macro calls.
The separate `_trailing_macro_modified_declaration` route uses public declaration specifiers and
`_trailing_macro_object_declarator` / `_trailing_macro_pointer_declarator`; adapt these header rules when
overriding declaration or declarator behavior.

Conditional declaration markers support an `#ifdef` or `#ifndef` block containing one marker identifier,
followed by `#endif` and a declaration prefix. Comments, blank lines and line splices in trivia are accepted.
Leading markers require a builtin type, or a type alias followed by another identifier or `*`; declaration
modifiers alone do not establish a type. Known grouped modifiers, pragma extras and bracket attributes are
checked once before the type. Groups with unquoted braces, semicolons or directives need separate support.
EOF, another directive and adjacent marker blocks retain ordinary preprocessor parsing. The scanner does not infer whether a conditional identifier expands to a type or annotation.

Normal and old-style pointer declarators and typedef type prefixes also accept conditional markers. Post-type
markers use `_conditional_declaration`, `_conditional_function_definition`, and
`_conditional_old_style_function_definition`; adapt these header rules when overriding declarations or function
definitions. The conditional remains a direct `preproc_ifdef` child of its annotated declaration or pointer,
with its physical directive range. Tag-only declarations retain their top-level tag node without inventing a
declarator. The marker identifier has the ordinary `macro_specifier.name` field. A containing function or field starts at its first annotation.
Other conditional forms, multiple-marker bodies, adjacent marker blocks, implicit-int prefixes and body-bearing
modifier groups need separate annotation support.

Trailing object annotations support one complete `primitive_type` token, plain pointer stars and an identifier,
for example `int *value ATTR((1));`. The first argument token after initial parentheses must be numeric,
a string/character quote or a comma. Comments and whitespace may separate the prefix tokens; the remaining
arguments use the structural annotation-argument grammar. Sized-only starts such as `unsigned` or `long`,
qualified/multiword/unknown-type prefixes,
arrays, parenthesized/function declarators, initializers and multiple declarators need separate support.

In Rust, depend on the [crate](https://crates.io/crates/willbooster-tree-sitter-c) and on
[willbooster-tree-sitter](https://crates.io/crates/willbooster-tree-sitter), the runtime this package is tested and
fuzzed with, at version 15.0.0 or later within 15.x. No other runtime loads the parser:

```toml
[dependencies]
tree-sitter = { package = "willbooster-tree-sitter", version = "15.0.0" }
tree-sitter-c = { package = "willbooster-tree-sitter-c", version = "18" }
```

```rust
let mut parser = tree_sitter::Parser::new();
parser.set_language(&tree_sitter_c::LANGUAGE.into())?;
```

## Development

```sh
mise install
bun install --frozen-lockfile
bun run test/ci-setup # installs Chromium for the browser test
bun run build/ci
bun run test
script/parse-examples
cargo test
```

The scripts and tests generate, build, test, and parse with `script/tree-sitter`, the tree-sitter CLI of the
WillBooster/tree-sitter runtime version locked in `Cargo.lock`, since the generator and the runtime of upstream's CLI are
not the ones this package ships with. Its first run downloads that CLI from the runtime's GitHub Release, or builds it
with `cargo` (whose build runs the CMake that `mise.toml` pins) when the download fails or the release has no binary that runs here. Run other CLI commands through it as
well (e.g. `script/tree-sitter parse file.c`).

`bun run generate` records a fresh generation profile from the applicable `test/corpus` cases and Git-tracked
files in `examples/`, then generates compact parser tables. The parser also embeds metadata from `tree-sitter.json`. After changing a grammar,
`tree-sitter.json`, a corpus case, or a tracked example,
regenerate and commit `src/`. Stage added or removed examples with `git add -A examples` before generation so the profile uses the intended file list.
Profiles in `.tmp/generation-profiles/` are temporary and must not be committed. `bun run build-wasm`, `bun run build/ci`,
and the release build regenerate the parsers before compiling them.

`bun run test` runs:

- the corpus in `test/corpus`, with the native build and with the Wasm build (the first run downloads the WASI SDK);
- an incremental-parsing check (`test/unit/incremental.test.ts`): `script/fuzz-corpus` runs `tree-sitter fuzz`, which
  edits each corpus case at random, reparses it, undoes the edits, and reparses again. `TREE_SITTER_SEED`,
  `TREE_SITTER_ITERATIONS`, and `TREE_SITTER_EDITS` run other or more edits;
- a check that the real-world C files in `examples/`, the checked-in ones and those of the cloned repositories, fail to
  parse exactly as listed in `script/known-failures.txt`. Many of the listed files use preprocessor conditionals or
  macros that tree-sitter parses without expanding them. The first run clones the repositories. The example
  repositories are pinned to commits in `script/parse-examples`. After a grammar change or a moved pin alters that
  list, `script/parse-examples` rewrites it; review its diff before committing;
- a performance check (`test/unit/performance.test.ts`) that recovering from an error on each line takes linear
  time, since consumers parse files while they are being edited. It loads the Wasm build through
  @willbooster/web-tree-sitter, which `bun run build/ci` rebuilds after regenerating the parser;
- a check (`test/unit/runtimeVersion.test.ts`) that `@willbooster/web-tree-sitter` in `package.json` and
  `willbooster-tree-sitter` in `Cargo.lock` are the same version, since the Wasm tests run on the former and the Rust
  tests, the fuzzer, and the CLI on the latter;
- tests that load the Wasm build with @willbooster/web-tree-sitter in Chromium (`test/e2e/browser.test.ts`) and in
  Cloudflare Workers with and without Node.js compatibility (`test/e2e/workers.test.ts`).

The tests and `script/parse-examples` compile the parser into `.tmp/tree-sitter-lib` rather than the CLI's cache shared
by every checkout; `script/fuzz-corpus` builds a parser of its own in `.tmp/fuzz` for each run and deletes it
afterwards.

CI also runs these tests on Linux arm64 and macOS, where the Rust binding compiles the parser natively, and fuzzes the
parser with libFuzzer and sanitizers (`.github/workflows/robustness.yml`).

### References

- The grammar was originally adapted from [this C99 grammar](http://slps.github.io/zoo/c/iso-9899-tc3.html).
- [C23 working draft N3220](https://www.open-std.org/jtc1/sc22/wg14/www/docs/n3220.pdf) and
  [C11 working draft N1570](https://www.open-std.org/jtc1/sc22/wg14/www/docs/n1570.pdf).
