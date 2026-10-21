import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { Edit, Language, Parser, type Node } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

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
    ]);
    expect(
      tree.rootNode.descendantsOfType('function_definition').map((node) => node.childForFieldName('type')?.text)
    ).toEqual(['Result', 'void', 'int']);
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
  const result = spawnSync(
    'script/tree-sitter',
    [
      'query',
      '--grammar-path',
      '.',
      '--captures',
      'test/fixtures/fieldMacros.scm',
      'test/fixtures/conditionalType.c',
      'test/fixtures/conditionalOuter.c',
      'test/fixtures/conditionalDirective.c',
    ],
    {
      cwd: root,
      env: { ...process.env, TREE_SITTER_LIBDIR: path.join(root, '.tmp/field-macro-recovery-lib') },
      encoding: 'utf8',
      timeout: 300_000,
    }
  );
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain(' - function, start: (4, 0), end: (4, 1), text: `f`');
  expect(result.stdout.match(/ - branch, start: \(0, 0\), end: \(4, 6\)/gu)).toHaveLength(2);
  expect(result.stdout).toContain(' - function, start: (5, 4), end: (5, 5), text: `f`');
  expect(result.stdout).toContain(' - function, start: (6, 4), end: (6, 5), text: `g`');
  expect(result.stdout).toContain(' - conditional, start: (6, 0), end: (8, 6)');
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

test('invalidates conditional lookahead after a marker edit and undo', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load(path.join(root, 'tree-sitter-c.wasm')));
  const tree = parser.parse(conditionalSource)!;
  const at = conditionalSource.indexOf('HEADER_MARKER', conditionalSource.indexOf('#ifdef'));
  const replacement = 'int';
  const editedSource = conditionalSource.slice(0, at) + replacement + conditionalSource.slice(at + 13);
  tree.edit(
    new Edit({
      startIndex: at,
      oldEndIndex: at + 13,
      newEndIndex: at + replacement.length,
      startPosition: { row: 3, column: 0 },
      oldEndPosition: { row: 3, column: 13 },
      newEndPosition: { row: 3, column: replacement.length },
    })
  );
  const incremental = parser.parse(editedSource, tree)!;
  const fresh = parser.parse(editedSource)!;
  try {
    expect(treeMetadata(incremental.rootNode)).toEqual(treeMetadata(fresh.rootNode));
    expect(incremental.rootNode.descendantsOfType('function_definition').map(definitionName)).toContain('after');
    incremental.edit(
      new Edit({
        startIndex: at,
        oldEndIndex: at + replacement.length,
        newEndIndex: at + 13,
        startPosition: { row: 3, column: 0 },
        oldEndPosition: { row: 3, column: replacement.length },
        newEndPosition: { row: 3, column: 13 },
      })
    );
    const undone = parser.parse(conditionalSource, incremental)!;
    const restored = parser.parse(conditionalSource)!;
    try {
      expect(treeMetadata(undone.rootNode)).toEqual(treeMetadata(restored.rootNode));
      expect(undone.rootNode.hasError).toBe(false);
    } finally {
      undone.delete();
      restored.delete();
    }
  } finally {
    tree.delete();
    incremental.delete();
    fresh.delete();
    parser.delete();
  }
});

test('keeps native header declarations after semicolonless field macros', { timeout: 300_000 }, () => {
  const result = spawnSync(
    'script/tree-sitter',
    [
      'query',
      '--grammar-path',
      '.',
      '--captures',
      'test/fixtures/fieldMacros.scm',
      fixture,
      conditionalFixture,
      'test/fixtures/conditionalReturn.c',
      'test/fixtures/conditionalAlias.c',
    ],
    {
      cwd: root,
      env: { ...process.env, TREE_SITTER_LIBDIR: path.join(root, '.tmp/field-macro-recovery-lib') },
      encoding: 'utf8',
      timeout: 300_000,
    }
  );
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain(' - structure, start: (2, 7), end: (2, 11)');
  expect(result.stdout).toContain(' - structure, start: (6, 15), end: (6, 21)');
  expect(result.stdout).toContain(' - structure, start: (12, 7), end: (12, 12)');
  expect(result.stdout).toContain(' - type, start: (9, 2), end: (9, 8)');
  expect(result.stdout).toContain(' - type, start: (10, 12), end: (10, 16)');
  expect(result.stdout).toContain(' - conditional, start: (0, 0), end: (13, 6)');
  expect(result.stdout).toContain(' - conditional, start: (2, 0), end: (4, 6)');
  expect(result.stdout).toContain(' - branch, start: (1, 0), end: (8, 6)');
  expect(result.stdout).toContain(' - marker, start: (3, 0), end: (3, 13)');
  expect(result.stdout).toContain(' - function, start: (5, 5), end: (5, 10)');
  expect(result.stdout).toContain(' - function, start: (9, 4), end: (9, 9)');
  expect(result.stdout).toContain(' - declarator, start: (5, 0), end: (5, 6), text: `lookup`');
  expect(result.stdout).toContain('text: `alias`');
  expect(result.stdout).toContain('text: `timer`');
  expect(result.stdout).not.toContain(' - error,');
});

function definitionName(node: Node): string | undefined {
  let declarator = node.childForFieldName('declarator');
  while (declarator?.childForFieldName('declarator')) declarator = declarator.childForFieldName('declarator');
  return declarator?.text;
}

function treeMetadata(node: Node): unknown[] {
  return [
    node.type,
    node.isNamed,
    node.isMissing,
    node.hasError,
    node.isError,
    node.isExtra,
    node.startIndex,
    node.endIndex,
    node.startPosition,
    node.endPosition,
    ...node.children.map((child, index) => [node.fieldNameForChild(index), treeMetadata(child)]),
  ];
}
