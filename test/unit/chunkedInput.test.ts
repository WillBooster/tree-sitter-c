import path from 'node:path';

import { Language, Parser } from '@willbooster/web-tree-sitter';
import { beforeAll, expect, test } from 'vitest';

// Every kind of text that the scanner reads ahead for directive lines: words, numbers, literals with escapes, raw
// strings, comments, line splices, null directives, directive lines of each kind, and characters that are not ASCII.
const source = `/* lead */
#include <a//b.h>
#  /* null */ // directive
#if defined(A) && __has_include("x/*y.h") \\
    || B > 1'000
#define TEXT(x) #x "s\\"t" 'c' 1.5e+3 u8"é" /* c */ R"d(raw " \\ )d" // tail
int value = 0x1p-3 + '\\'' / 2; // comment \\
continued
char *text = "a // b /* c"; /* multi
#not a directive
line */ int next;
#
#else
_Pragma("once") int é = L'x';
#endif
\t#pragma pack(1)
#error "unterminated
const char *raw = u8R"q(raw " /*
#not a directive
)q";
#
/* after */ int last;
`;

// The lines that hold only `#`; those inside the comment and the raw string are text.
const NullDirectiveCount = 3;

let language: Language;

beforeAll(async () => {
  await Parser.init();
  language = await Language.load(path.join(import.meta.dirname, '../../tree-sitter-c.wasm'));
});

test.each([1, 2, 3, 5, 16, 61])('parses input delivered in chunks of %d characters as the whole input', (size) => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const text of [source, source.replaceAll('\n', '\r\n')]) {
      const whole = parser.parse(text)!;
      const chunked = parser.parse((index) => text.slice(index, index + size))!;
      try {
        expect(whole.rootNode.descendantsOfType('preproc_empty')).toHaveLength(NullDirectiveCount);
        expect(chunked.rootNode.toString()).toBe(whole.rootNode.toString());
        expect(chunked.rootNode.endPosition).toEqual(whole.rootNode.endPosition);
      } finally {
        whole.delete();
        chunked.delete();
      }
    }
  } finally {
    parser.delete();
  }
});
