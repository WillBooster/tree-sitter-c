import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { Language, type Node, Parser } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

import { collectCaptures } from '../helpers/ast.ts';
import { type NativeNode, parseNativeFiles } from '../helpers/nativeParse.ts';

interface NativeCaptureSummary {
  name: string;
  start: [number, number];
  end: [number, number];
  text: string;
}

const root = path.resolve(import.meta.dirname, '../..');
const fixture = 'test/fixtures/fieldMacros.h';
const source = fs.readFileSync(path.join(root, fixture), 'utf8');
const conditionalFixture = 'test/fixtures/conditionalMarkers.c';
const conditionalSource = fs.readFileSync(path.join(root, conditionalFixture), 'utf8');

test('keeps Wasm header declarations after semicolonless field macros', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load(path.join(root, 'tree-sitter-c.wasm')));
  const tree = parser.parse(source)!;
  try {
    expect(
      tree.rootNode.descendantsOfType('struct_specifier').map((node) => node.childForFieldName('name')?.text)
    ).toEqual(['Item', 'Buffer', 'Other']);
    expect(tree.rootNode.descendantsOfType('type_definition').map((node) => node.text)).toEqual([
      'typedef struct Buffer {\n  char *data;\n  unsigned long size;\n} Buffer;',
      'typedef int File;',
    ]);
    const conditional = tree.rootNode.descendantsOfType('preproc_ifdef')[0]!;
    expect(conditional.text).toBe(source.trimEnd());
    expect(tree.rootNode.descendantsOfType('ERROR')).toHaveLength(0);
  } finally {
    tree.delete();
    parser.delete();
  }
});

test('keeps conditional marker boundaries and the following function', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load(path.join(root, 'tree-sitter-c.wasm')));
  const tree = parser.parse(conditionalSource)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    const conditional = tree.rootNode.descendantsOfType('preproc_ifdef')[0]!;
    expect(conditional.text).toBe('#ifdef ANNOTATE\nHEADER_MARKER\n#endif');
    const marker = conditional.descendantsOfType('macro_specifier')[0]!;
    expect(marker.text).toBe('HEADER_MARKER');
    expect(marker.childForFieldName('name')?.text).toBe('HEADER_MARKER');
    expect(marker.startPosition).toEqual({ row: 3, column: 0 });
    expect(marker.endPosition).toEqual({ row: 3, column: 13 });
    expect(tree.rootNode.descendantsOfType('preproc_if')[0]?.endPosition).toEqual({ row: 8, column: 6 });
    expect(tree.rootNode.descendantsOfType('function_definition').map((node) => node.text)).toEqual([
      '#ifdef ANNOTATE\nHEADER_MARKER\n#endif\nvoid timer(int code) {\n  (void)code;\n}',
      'int after(void) { return 0; }',
    ]);
  } finally {
    tree.delete();
    parser.delete();
  }
});

test('keeps an old-style function when its return type crosses a conditional marker', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load(path.join(root, 'tree-sitter-c.wasm')));
  const source = fs.readFileSync(path.join(root, 'test/fixtures/conditionalReturn.c'), 'utf8');
  const tree = parser.parse(source)!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    const definitions = tree.rootNode.descendantsOfType('function_definition');
    expect(definitions.map(definitionName)).toEqual(['lookup', 'after']);
    expect(definitions.map((node) => node.childForFieldName('type')?.text)).toEqual(['char', 'int']);
    expect(definitions[0]!.childForFieldName('body')?.text).toBe('{\n  (void)value;\n  return 0;\n}');
    const conditional = definitions[0]!.descendantsOfType('preproc_ifdef')[0]!;
    expect(conditional.startPosition).toEqual({ row: 2, column: 0 });
    expect(conditional.endPosition).toEqual({ row: 4, column: 6 });
    expect(conditional.parent?.type).toBe('pointer_declarator');
  } finally {
    tree.delete();
    parser.delete();
  }
});

test('keeps alias-return annotations and storage-qualified builtin returns', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load(path.join(root, 'tree-sitter-c.wasm')));
  const tree = parser.parse(fs.readFileSync(path.join(root, 'test/fixtures/conditionalAlias.c'), 'utf8'))!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    expect(tree.rootNode.descendantsOfType('function_definition').map(definitionName)).toEqual([
      'alias',
      'timer',
      'after',
      'postAlias',
      'followingAlias',
    ]);
    expect(
      tree.rootNode.descendantsOfType('function_definition').map((node) => node.childForFieldName('type')?.text)
    ).toEqual(['Result', 'void', 'int', 'Result', 'int']);
    const prototype = tree.rootNode
      .descendantsOfType('declaration')
      .find((node) => node.text.includes('aliasPrototype'));
    expect(prototype?.childForFieldName('type')?.text).toBe('Result');
    expect(prototype?.descendantsOfType('preproc_ifdef')[0]?.text).toBe('#ifndef B\nMARK\n#endif');
    const definition = tree.rootNode
      .descendantsOfType('function_definition')
      .find((node) => definitionName(node) === 'postAlias');
    expect(definition?.descendantsOfType('preproc_ifdef')[0]?.text).toBe('#ifdef A\nMARK\n#endif');
  } finally {
    tree.delete();
    parser.delete();
  }
});

test('keeps enclosing conditionals closed before following declarations', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load(path.join(root, 'tree-sitter-c.wasm')));
  for (const file of ['conditionalOuter.c', 'conditionalDirective.c']) {
    const tree = parser.parse(fs.readFileSync(path.join(root, 'test/fixtures', file), 'utf8'))!;
    try {
      const branch = tree.rootNode.descendantsOfType('preproc_if')[0]!;
      expect(branch.startPosition).toEqual({ row: 0, column: 0 });
      expect(branch.endPosition).toEqual({ row: 4, column: 6 });
      if (file === 'conditionalOuter.c') {
        const functions = tree.rootNode.descendantsOfType('function_definition');
        expect(functions.map(definitionName)).toEqual(['f', 'g']);
        expect(functions.map((node) => node.parent?.type)).toEqual(['translation_unit', 'translation_unit']);
      } else {
        expect(tree.rootNode.namedChildren.map((node) => node.type)).toEqual([
          'preproc_if',
          'declaration',
          'preproc_ifdef',
          'preproc_def',
        ]);
        expect(tree.rootNode.namedChildren[1]!.childForFieldName('declarator')?.text).toBe('a');
        expect(tree.rootNode.namedChildren[2]!.endPosition).toEqual({ row: 8, column: 6 });
      }
    } finally {
      tree.delete();
    }
  }
  parser.delete();
});

test('keeps native conditional return types and enclosing directive boundaries', { timeout: 300_000 }, () => {
  const captures = collectFieldMacroCaptures([
    'test/fixtures/conditionalType.c',
    'test/fixtures/conditionalOuter.c',
    'test/fixtures/conditionalDirective.c',
  ]);
  expect(captures).toContainEqual({ name: 'function', start: [4, 0], end: [4, 1], text: 'f' });
  expect(
    captures.filter(
      (capture) =>
        capture.name === 'branch' &&
        capture.start[0] === 0 &&
        capture.start[1] === 0 &&
        capture.end[0] === 4 &&
        capture.end[1] === 6
    )
  ).toHaveLength(2);
  expect(captures).toContainEqual({ name: 'function', start: [5, 4], end: [5, 5], text: 'f' });
  expect(captures).toContainEqual({ name: 'function', start: [6, 4], end: [6, 5], text: 'g' });
  expect(captures).toContainEqual(expect.objectContaining({ name: 'conditional', start: [6, 0], end: [8, 6] }));
});

test('keeps tag-only declarations free of phantom declarators', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load(path.join(root, 'tree-sitter-c.wasm')));
  const tree = parser.parse(fs.readFileSync(path.join(root, 'test/fixtures/conditionalTags.c'), 'utf8'))!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    expect(tree.rootNode.descendantsOfType('declaration')).toHaveLength(0);
    expect(tree.rootNode.namedChildren.map((node) => node.type)).toEqual([
      'preproc_def',
      'preproc_ifdef',
      'struct_specifier',
      'preproc_ifdef',
      'union_specifier',
      'preproc_ifdef',
      'enum_specifier',
      'preproc_ifdef',
      'struct_specifier',
      'function_definition',
    ]);
    expect(
      tree.rootNode
        .descendantsOfType(['struct_specifier', 'union_specifier', 'enum_specifier'])
        .map((node) => node.childForFieldName('name')?.text)
    ).toEqual(['Record', 'Number', 'Choice', 'Forward']);
    expect(tree.rootNode.descendantsOfType('function_definition').map(definitionName)).toEqual(['after']);
  } finally {
    tree.delete();
    parser.delete();
  }
});

test('keeps native conditional tag declarations free of missing names', { timeout: 300_000 }, () => {
  const result = spawnSync('script/tree-sitter', ['parse', '--grammar-path', '.', 'test/fixtures/conditionalTags.c'], {
    cwd: root,
    env: { ...process.env, TREE_SITTER_LIBDIR: path.join(root, '.tmp/field-macro-recovery-lib') },
    encoding: 'utf8',
    timeout: 300_000,
  });
  expect(result.error).toBeUndefined();
  expect(result.status, result.stdout + result.stderr).toBe(0);
  expect(result.stdout).not.toContain('(declaration ');
  expect(result.stdout).toContain('name: (type_identifier [4, 7] - [4, 13])');
  expect(result.stdout).toContain('name: (type_identifier [8, 6] - [8, 12])');
  expect(result.stdout).toContain('name: (type_identifier [12, 5] - [12, 11])');
});

test('retains conditional typedefs, grouped modifiers and following prototypes', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load(path.join(root, 'tree-sitter-c.wasm')));
  const tree = parser.parse(fs.readFileSync(path.join(root, 'test/fixtures/conditionalDeclarations.c'), 'utf8'))!;
  try {
    expect(tree.rootNode.hasError).toBe(false);
    expect(
      tree.rootNode.descendantsOfType('type_definition').map((node) => node.childForFieldName('declarator')?.text)
    ).toEqual(['Before', 'After']);
    const declarations = tree.rootNode.descendantsOfType('declaration');
    expect(declarations.map((node) => node.childForFieldName('declarator')?.text)).toEqual([
      'aligned',
      'f(void)',
      'g(void)',
      'h(int a)',
    ]);
    expect(declarations.every((node) => node.parent?.type === 'translation_unit')).toBe(true);
    expect(tree.rootNode.descendantsOfType('function_definition').map(definitionName)).toEqual([
      'marked',
      'square',
      'pragmatic',
      'i',
    ]);
    const markers = tree.rootNode.descendantsOfType('macro_specifier');
    expect(markers).toHaveLength(7);
    expect(markers.every((node) => node.childForFieldName('name')?.text === 'MARK')).toBe(true);
  } finally {
    tree.delete();
    parser.delete();
  }
});

test('retains native conditional typedefs and following prototypes', { timeout: 300_000 }, () => {
  const captures = collectFieldMacroCaptures(['test/fixtures/conditionalDeclarations.c']);
  expect(captures.filter((capture) => capture.name === 'error')).toHaveLength(0);
  expect(captures).toContainEqual({ name: 'type', start: [4, 12], end: [4, 18], text: 'Before' });
  expect(captures).toContainEqual({ name: 'type', start: [9, 4], end: [9, 9], text: 'After' });
  expect(captures).toContainEqual({ name: 'declarator', start: [31, 4], end: [31, 5], text: 'g' });
  expect(captures).toContainEqual({ name: 'declarator', start: [32, 4], end: [32, 5], text: 'h' });
  expect(captures).toContainEqual({ name: 'function', start: [33, 5], end: [33, 6], text: 'i' });
});

test('retains a following prototype after versioned annotation groups', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load(path.join(root, 'tree-sitter-c.wasm')));
  const tree = parser.parse(fs.readFileSync(path.join(root, 'test/fixtures/annotatedPrototypes.h'), 'utf8'))!;
  try {
    expect(tree.rootNode.type).toBe('translation_unit');
    const release = tree.rootNode
      .descendantsOfType('function_declarator')
      .find((node) => node.childForFieldName('declarator')?.text === 'release');
    expect(release?.text).toBe('release(void)');
    expect(release?.hasError).toBe(false);
  } finally {
    tree.delete();
    parser.delete();
  }
});

test.each([
  { label: 'marker', needle: 'HEADER_MARKER', original: 'HEADER_MARKER', replacement: 'int' },
  { label: 'following type', needle: 'void timer', original: 'void ', replacement: '' },
])('retains the following definition after a changed conditional $label', async ({ needle, original, replacement }) => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load(path.join(root, 'tree-sitter-c.wasm')));
  const at = conditionalSource.indexOf(needle, conditionalSource.indexOf('#ifdef'));
  const tree = parser.parse(
    conditionalSource.slice(0, at) + replacement + conditionalSource.slice(at + original.length)
  )!;
  try {
    expect(tree.rootNode.descendantsOfType('function_definition').map(definitionName)).toContain('after');
  } finally {
    tree.delete();
    parser.delete();
  }
});

test('keeps native header declarations after semicolonless field macros', { timeout: 300_000 }, () => {
  const captures = collectFieldMacroCaptures([
    fixture,
    conditionalFixture,
    'test/fixtures/conditionalReturn.c',
    'test/fixtures/conditionalAlias.c',
  ]);
  expect(captures).toContainEqual(expect.objectContaining({ name: 'structure', start: [2, 7], end: [2, 11] }));
  expect(captures).toContainEqual(expect.objectContaining({ name: 'structure', start: [6, 15], end: [6, 21] }));
  expect(captures).toContainEqual(expect.objectContaining({ name: 'structure', start: [12, 7], end: [12, 12] }));
  expect(captures).toContainEqual(expect.objectContaining({ name: 'type', start: [9, 2], end: [9, 8] }));
  expect(captures).toContainEqual(expect.objectContaining({ name: 'type', start: [10, 12], end: [10, 16] }));
  expect(captures).toContainEqual(expect.objectContaining({ name: 'conditional', start: [0, 0], end: [13, 6] }));
  expect(captures).toContainEqual(expect.objectContaining({ name: 'conditional', start: [2, 0], end: [4, 6] }));
  expect(captures).toContainEqual(expect.objectContaining({ name: 'branch', start: [1, 0], end: [8, 6] }));
  expect(captures).toContainEqual(expect.objectContaining({ name: 'marker', start: [3, 0], end: [3, 13] }));
  expect(captures).toContainEqual(expect.objectContaining({ name: 'function', start: [5, 5], end: [5, 10] }));
  expect(captures).toContainEqual(expect.objectContaining({ name: 'function', start: [9, 4], end: [9, 9] }));
  expect(captures).toContainEqual({ name: 'declarator', start: [5, 0], end: [5, 6], text: 'lookup' });
  const texts = captures.map((capture) => capture.text);
  expect(texts).toEqual(expect.arrayContaining(['alias', 'timer', 'postAlias', 'followingAlias']));
  expect(captures.filter((capture) => capture.name === 'error')).toHaveLength(0);
});

function collectFieldMacroCaptures(files: string[]): NativeCaptureSummary[] {
  const sources = parseNativeFiles(root, path.join(root, '.tmp/field-macro-recovery-lib'), files);
  return sources.flatMap(({ rootNode }) =>
    collectCaptures(rootNode, visitFieldMacroNode).map(({ name, node }) => ({
      name,
      start: [node.startPosition.row, node.startPosition.column] as [number, number],
      end: [node.endPosition.row, node.endPosition.column] as [number, number],
      text: node.text,
    }))
  );
}

function visitFieldMacroNode(node: NativeNode, emit: (name: string, target?: NativeNode) => void): void {
  if (node.type === 'struct_specifier') emitFieldIfType(node, 'name', 'type_identifier', 'structure', emit);
  else if (node.type === 'type_definition') emitFieldIfType(node, 'declarator', 'type_identifier', 'type', emit);
  else if (node.type === 'preproc_ifdef') emit('conditional');
  else if (node.type === 'preproc_if') emit('branch');
  else if (node.type === 'macro_specifier') emitFieldIfType(node, 'name', 'identifier', 'marker', emit);
  else if (node.type === 'ERROR') emit('error');
  else if (node.type === 'function_declarator') emitFieldIfType(node, 'declarator', 'identifier', 'declarator', emit);
  else if (node.type === 'function_definition') {
    const declarator = node.childForFieldName('declarator');
    if (declarator?.type === 'function_declarator') {
      emitFieldIfType(declarator, 'declarator', 'identifier', 'function', emit);
    }
  }
}

function emitFieldIfType(
  node: NativeNode,
  field: string,
  expectedType: string,
  captureName: string,
  emit: (name: string, target?: NativeNode) => void
): void {
  const child = node.childForFieldName(field);
  if (child?.type === expectedType) emit(captureName, child);
}

function definitionName(node: Node): string | undefined {
  let declarator = node.childForFieldName('declarator');
  while (declarator?.childForFieldName('declarator')) declarator = declarator.childForFieldName('declarator');
  return declarator?.text;
}
