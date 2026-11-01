import path from 'node:path';

import { Language, Parser } from '@willbooster/web-tree-sitter';
import { beforeAll, expect, test } from 'vitest';

const leading = ['', ' \t', '\\\n', '\\\r\n', '/**/', '/* first\nsecond */\\\n'];
const gaps = ['', ' \t\v\f', '/**/', '/* first\nsecond */', '// comment', '\\\r\n/**/'];
const contexts = [
  ['declarator', 'int\n#\nvalue;\n', 1, 'declaration'],
  ['return expression', 'int f(void) { return\n#\n1; }\n', 1, 'return_statement'],
  ['function', 'void f(void) {\n#\nint result;\n}\n', 1, 'function_definition'],
  ['structure', 'struct Fields {\n#\nint field;\n};\n', 1, 'field_declaration'],
  ['enumeration', 'enum Flags {\n#\nFIRST,\n#\nSECOND\n};\n', 2, 'enumerator'],
  ['initializer', 'int values[] = {\n#\n1,\n#\n2\n};\n', 2, 'number_literal'],
  ['conditional', '#if 1\n#\nint result;\n#endif\n', 1, 'preproc_if'],
] as const;

let language: Language;

beforeAll(async () => {
  await Parser.init();
  language = await Language.load(path.join(import.meta.dirname, '../../tree-sitter-c.wasm'));
});

test.each(gaps)('ends an empty directive after %j', (gap) => {
  checkSource(`#${gap}\nint result;\n`, 1, (tree) => {
    expect(tree.rootNode.descendantsOfType('declaration')[0]!.childForFieldName('declarator')?.text).toBe('result');
  });
});

test.each(leading)('recognizes an empty directive after leading trivia %j', (prefix) => {
  checkSource(`${prefix}#\nint value;\n`, 1, (tree) => {
    expect(tree.rootNode.descendantsOfType('declaration')[0]?.childForFieldName('declarator')?.text).toBe('value');
  });
});

test.each(contexts)('keeps an empty directive inside its %s', (_name, source, count, nodeType) => {
  checkSource(source, count, (tree) => {
    const nodes = tree.rootNode.descendantsOfType(nodeType);
    expect(nodes.length).toBeGreaterThan(0);
    if (nodeType === 'enumerator') {
      expect(nodes.map((node) => node.childForFieldName('name')?.text)).toEqual(['FIRST', 'SECOND']);
    } else if (nodeType === 'number_literal') {
      expect(nodes.map((node) => node.text)).toEqual(['1', '2']);
    } else if (nodeType === 'field_declaration') {
      expect(nodes[0]!.childForFieldName('declarator')?.text).toBe('field');
    } else if (nodeType === 'function_definition') {
      expect(nodes[0]!.childForFieldName('body')?.descendantsOfType('declaration')).toHaveLength(1);
    } else if (nodeType === 'declaration') {
      expect(nodes[0]!.childForFieldName('declarator')?.text).toBe('value');
    } else if (nodeType === 'return_statement') {
      expect(nodes[0]!.descendantsOfType('number_literal')[0]?.text).toBe('1');
    } else {
      expect(nodes[0]!.childForFieldName('condition')?.text).toBe('1');
    }
  });
});

test.each(['#\nMARKER\n', 'MARKER\n#\n', 'MARKER\n\n  #\n'])(
  'keeps conditional marker ownership around %j',
  (marker) => {
    const source = `#define ENABLED 1\n#define MARKER __attribute__((unused))\n#ifdef ENABLED\n${marker}#endif\n#\nint value;\n`;
    withTree(source, (tree) => {
      expect(tree.rootNode.hasError, source).toBe(false);
      expect(tree.rootNode.descendantsOfType('declaration').at(-1)?.childForFieldName('declarator')?.text).toBe(
        'value'
      );
      expect(tree.rootNode.descendantsOfType('macro_specifier').map((node) => node.text)).toContain('MARKER');
      const conditional = tree.rootNode.descendantsOfType('preproc_ifdef')[0]!;
      const directive = conditional.children.find((node) => node.type === '#ifdef')!;
      expect([conditional.startIndex, directive.startIndex, directive.text]).toEqual([
        source.indexOf('#ifdef'),
        source.indexOf('#ifdef'),
        '#ifdef',
      ]);
    });
  }
);

test.each(['\n', '\r', '\r\n', '\n\r'])('keeps adjacent directives across %j line endings', (newline) => {
  checkSource(`#${newline}# /* λ */${newline}int result;${newline}`, 2, (tree) => {
    expect(tree.rootNode.descendantsOfType('declaration')[0]?.childForFieldName('declarator')?.text).toBe('result');
  });
});

test.each(['#', '# /**/', '# // final comment'])('accepts an empty directive at EOF: %j', (source) => {
  withTree(source, (tree) => {
    expect(tree.rootNode.hasError).toBe(false);
    expect(tree.rootNode.descendantsOfType('preproc_empty')).toHaveLength(1);
  });
});

test.each([
  'const char *value = "#\\n";\n#\n',
  'const char *value = R"tag(first\n#\nlast)tag";\n#\n',
  'const char *value = u8R"tag(first\n#\nlast)tag";\n#\n',
  'const char *value = R"tag(first\\\n#\nlast)tag";\n#\n',
  '/* first\u0000 second */\n#\n',
  '// first\u0000 second\n#\n',
])('keeps literal and comment contents outside directive recognition: %j', (source) => {
  checkSource(source, 1, () => {});
});

test('rebuilds source context for consecutive full parses on one parser', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const source of ['   \n#\nint value;\n', 'int;#\nint value;\n', '   \n#\nint value;\n']) {
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(source.startsWith('int;'));
        expect(tree.rootNode.descendantsOfType('preproc_empty')).toHaveLength(source.startsWith('int;') ? 0 : 1);
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('retains every directive in a long declaration', () => {
  checkSource(`int\n${'# /* gap */\n'.repeat(4096)}value;\n`, 4096, (tree) => {
    expect(tree.rootNode.descendantsOfType('declaration')[0]?.childForFieldName('declarator')?.text).toBe('value');
  });
});

test.each([
  "#warning don't",
  '#warning "unfinished',
  '#warning R"(unfinished',
  "#define UNUSED '",
  "#pragma ignored don't",
])('recognizes the next directive after unmatched quotes in %j', (directive) => {
  checkSource(`${directive}\n#\nint value;\n`, 1, (tree) => {
    expect(tree.rootNode.descendantsOfType('declaration')[0]?.childForFieldName('declarator')?.text).toBe('value');
  });
});

test.each(['<missing/*>', '<missing//>', "<don't.h>", '"missing/*"'])(
  'keeps header-name contents literal in %j before a null directive',
  (header) => {
    checkSource(`#if __has_include(${header})\nint first;\n#endif\n#\nint value;\n`, 1, (tree) => {
      const conditional = tree.rootNode.descendantsOfType('preproc_if')[0];
      expect(conditional?.childForFieldName('condition')?.text).toBe(`__has_include(${header})`);
      expect(tree.rootNode.descendantsOfType('declaration').at(-2)?.childForFieldName('declarator')?.text).toBe(
        'value'
      );
    });
  }
);

test.each(['H', 'HEADER_PREDICATE_ALIAS'])(
  'keeps header-name contents literal through the object-like alias %s',
  (name) => {
    const source = `#define ${name} __has_include\n#if ${name}(<missing/*>)\nint first;\n#endif\n#\nint value;\n`;
    checkSource(source, 1, (tree) => {
      expect(tree.rootNode.descendantsOfType('preproc_if')[0]?.childForFieldName('condition')?.text).toBe(
        `${name}(<missing/*>)`
      );
    });
  }
);

test('retains a preprocessing expression after a pragma extra', () => {
  checkSource('#if _Pragma("once") 1\n#\nint value;\n#endif\n', 1, (tree) => {
    expect(tree.rootNode.descendantsOfType('preproc_if')[0]?.childForFieldName('condition')?.text).toBe('1');
  });
});

test.each([
  '#ifdef A\n  #\nint value;\n#endif\n',
  '#define VALUE 1\n  #\nint value = VALUE;\n',
  'struct Fields {\n#ifdef A\n  #\nint value;\n#endif\n};\n',
])('keeps incomplete pragma text in a macro replacement list local to that directive: %j', (body) => {
  checkSource(`#define A 1\n#define OPEN _Pragma(\n${body}`, 1, (tree) => {
    expect(tree.rootNode.descendantsOfType('preproc_def')[1]?.childForFieldName('value')?.text.trim()).toBe('_Pragma(');
  });
});

test.each(['ifdef', 'ifndef', 'elifdef', 'elifndef'])(
  'keeps a named %s directive complete before a null directive',
  (keyword) => {
    const opening = keyword.startsWith('elif') ? '#if 0\n' : '';
    const source = `#define ENABLED 1\n${opening}#${keyword} ENABLED\n#\nint value;\n#endif\n`;
    checkSource(source, 1, (tree) => {
      const conditional = tree.rootNode.descendantsOfType(['preproc_ifdef', 'preproc_elifdef'])[0];
      expect(conditional?.childForFieldName('name')?.text).toBe('ENABLED');
      expect(tree.rootNode.descendantsOfType('declaration')[0]?.childForFieldName('declarator')?.text).toBe('value');
    });
  }
);

test('keeps a complete macro definition before a null directive', () => {
  checkSource('#define VALUE 1\n#\nint value = VALUE;\n', 1, (tree) => {
    expect(tree.rootNode.descendantsOfType('preproc_def')[0]?.childForFieldName('name')?.text).toBe('VALUE');
    expect(tree.rootNode.descendantsOfType('declaration')[0]?.childForFieldName('declarator')?.text).toBe(
      'value = VALUE'
    );
  });
});

test.each(['define', 'ifdef', 'ifndef', 'elifdef', 'elifndef', 'include'])(
  'retains an error when a null directive follows a missing %s operand',
  (keyword) => {
    for (const gap of ['', ' /**/', ' /* first\nsecond */']) {
      const opening = keyword.startsWith('elif') ? '#if 0\n' : '';
      const closing = keyword.includes('if') ? '#endif\n' : '';
      const source = `${opening}#${keyword}${gap}\n#\nint value;\n${closing}`;
      withTree(source, (tree) => {
        expect(tree.rootNode.hasError, source).toBe(true);
      });
    }
  }
);

test.each(['ifdef', 'ifndef', 'elifdef', 'elifndef', 'include'])(
  'does not borrow a %s operand after only pragma extras',
  (keyword) => {
    for (const pragma of ['_Pragma("once")', '_Pragma("once") /**/ _Pragma("once")']) {
      const opening = keyword.startsWith('elif') ? '#if 0\n' : '';
      const closing = keyword.includes('if') ? '#endif\n' : '';
      withTree(`${opening}#${keyword} ${pragma}\n#\nint value;\n${closing}`, (tree) => {
        expect(tree.rootNode.hasError).toBe(true);
      });
    }
  }
);

test('retains a real macro operand before a pragma extra', () => {
  checkSource('#define VALUE _Pragma("once") 1\n#\nint value = VALUE;\n', 1, (tree) => {
    expect(tree.rootNode.descendantsOfType('preproc_def')[0]?.childForFieldName('name')?.text).toBe('VALUE');
  });
});

test.each(['', ' _Pragma("once")'])(
  'retains a bare _Pragma identifier before %j as the conditional operand',
  (suffix) => {
    checkSource(`#ifdef _Pragma${suffix}\n#\nint value;\n#endif\n`, 1, (tree) => {
      expect(tree.rootNode.descendantsOfType('preproc_ifdef')[0]?.childForFieldName('name')?.text).toBe('_Pragma');
    });
  }
);

test('does not complete a missing macro name after a pragma extra', () => {
  withTree('#define _Pragma("once")\n#\nint value;\n', (tree) => {
    expect(tree.rootNode.hasError).toBe(true);
  });
});

test.each([
  '#@\n',
  '##\n',
  '#/* unterminated',
  'int before; #\n',
  'int before;\\\n#\n',
  'int before;/*first\nsecond*/#\n',
])('reports an invalid empty-directive candidate %j', (source) => {
  withTree(`${source}\nint following;\n`, (tree) => {
    expect(tree.rootNode.hasError).toBe(true);
  });
});

function checkSource(
  source: string,
  count: number,
  check: (tree: NonNullable<ReturnType<Parser['parse']>>) => void
): void {
  withTree(`${source}int following;\n`, (tree) => {
    expect(tree.rootNode.hasError, source).toBe(false);
    const calls = tree.rootNode.descendantsOfType('preproc_empty');
    expect(calls).toHaveLength(count);
    for (const call of calls) {
      expect(call.text.startsWith('#')).toBe(true);
    }
    expect(tree.rootNode.namedChildren.at(-1)?.text).toBe('int following;');
    check(tree);
  });
}

function withTree(source: string, check: (tree: NonNullable<ReturnType<Parser['parse']>>) => void): void {
  const parser = new Parser().setLanguage(language);
  const tree = parser.parse(source)!;
  try {
    check(tree);
  } finally {
    tree.delete();
    parser.delete();
  }
}
