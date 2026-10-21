# @willbooster/tree-sitter-c

[![npm version](https://img.shields.io/npm/v/@willbooster/tree-sitter-c.svg)](https://www.npmjs.com/package/@willbooster/tree-sitter-c)
[![license](https://img.shields.io/npm/l/@willbooster/tree-sitter-c.svg)](https://www.npmjs.com/package/@willbooster/tree-sitter-c)
[![Test](https://github.com/WillBooster/tree-sitter-c/actions/workflows/test.yml/badge.svg)](https://github.com/WillBooster/tree-sitter-c/actions/workflows/test.yml)
[![Test rust](https://github.com/WillBooster/tree-sitter-c/actions/workflows/test-rust.yml/badge.svg)](https://github.com/WillBooster/tree-sitter-c/actions/workflows/test-rust.yml)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)
[![wbfy](https://img.shields.io/badge/wbfy-20.41.8-1e90ff.svg)](https://github.com/WillBooster/shared/tree/main/packages/wbfy)
[![crates.io](https://img.shields.io/crates/v/willbooster-tree-sitter-c.svg)](https://crates.io/crates/willbooster-tree-sitter-c)

C grammar for [tree-sitter](https://github.com/tree-sitter/tree-sitter), forked from
[tree-sitter/tree-sitter-c](https://github.com/tree-sitter/tree-sitter-c). We are grateful
to its authors and contributors. This is not an official release of that project.

This fork fixes parsing bugs and raises conformance with the ISO C standard
([C23 working draft N3220](https://www.open-std.org/jtc1/sc22/wg14/www/docs/n3220.pdf)).

## Usage

The npm package ships `tree-sitter-c.wasm` for
[@willbooster/web-tree-sitter](https://www.npmjs.com/package/@willbooster/web-tree-sitter) version 7.0.5 or later, which runs in Node.js, Bun, browsers, and Cloudflare Workers. The parser carries the ABI number of the WillBooster/tree-sitter generator (`0x57420006`), so it loads only with that runtime; upstream tree-sitter runtimes reject it. In Node.js and Bun, load the grammar from its path:

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
import { Language, Parser } from '@willbooster/web-tree-sitter';
import runtimeUrl from '@willbooster/web-tree-sitter/web-tree-sitter.wasm?url';
import cUrl from '@willbooster/tree-sitter-c/tree-sitter-c.wasm?url';

await Parser.init({ locateFile: () => runtimeUrl });
const parser = new Parser();
parser.setLanguage(await Language.load(cUrl));
```

Cloudflare Workers do not allow compiling Wasm at run time, so import both `.wasm` files as modules, with or without
Node.js compatibility:

```js
import { Language, Parser } from '@willbooster/web-tree-sitter';
import runtime from '@willbooster/web-tree-sitter/web-tree-sitter.wasm';
import c from '@willbooster/tree-sitter-c/tree-sitter-c.wasm';

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
when both contexts are valid, use the stricter leading check. Each token consumes only its opening directive
keyword; the directive body, closing directive and following prefix are lookahead. Keep this dispatch ahead of
the function-annotation guards and return immediately after a failed directive scan.
The hidden `_function_attribute_start`, `_post_type_function_attribute_start`, and
`_post_type_function_attribute_suffix` guards look ahead before the ordinary identifier token;
keep them outside the name field so identifier leaves and ordinary C lexing retain their shape.
Port `scan_function_attribute_guard`, its `MacroAttributeSymbols` context, and the name-range handling in `pragma.h`.
The `_trailing_object_declaration_start` guard checks an object prefix before declaration parsing;
`_trailing_macro_attribute_name` consumes only the annotation name and preserves its ordinary identifier leaf.
Keep the shared first-word dispatch so a failed lookahead never falls back from an advanced lexer cursor.
First prototype guards check the prototype tail; post-type continuation guards inspect only their own argument group.
Regenerate Unicode and keyword tables from the derived grammar's metadata.
The generation source is `script/generateIdentifierRanges.js` in this repository.
The primitive keyword data shared by grammar generation and object-prefix classification is in `src/grammarKeywords.cjs`.
The `_preproc_function_name` token ends before splices used to determine adjacency, so the `_preproc_lparen`
scanner must skip those splices again to reach `(`.

Prototype annotation lookahead accepts argument/prototype groups without unquoted braces, semicolons or preprocessing directives.
Quoted punctuation remains literal content. GNU statement-expression, inline-tag, compound-literal
and directive-bearing annotation arguments need a separate grammar design to keep malformed-input recovery bounded.

Header annotation declarations use `_macro_modified_declaration`, `_macro_declaration_specifiers`,
`_macro_declaration_declarator`, and `_header_preproc_item`. Adapt these rules alongside public declaration/type
overrides when extending C. The annotation declarator uses `function_declarator` to retain trailing macro calls.
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
fuzzed with, at version 7.0.5 or later. No other runtime loads the parser:

```toml
[dependencies]
tree-sitter = { package = "willbooster-tree-sitter", version = "7.0.5" }
tree-sitter-c = { package = "willbooster-tree-sitter-c", version = "11" }
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
