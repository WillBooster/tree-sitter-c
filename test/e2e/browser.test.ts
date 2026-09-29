import { Language, Parser } from '@willbooster/web-tree-sitter';
import runtimeUrl from '@willbooster/web-tree-sitter/web-tree-sitter.wasm?url';
import { expect, test } from 'vitest';

import cUrl from '../../tree-sitter-c.wasm?url';
import { Source, Tree } from '../fixtures/parse.js';

test('parses C in a browser, loading the Wasm files over HTTP', async () => {
  await Parser.init({ locateFile: () => runtimeUrl });
  const parser = new Parser();
  parser.setLanguage(await Language.load(cUrl));
  expect(parser.parse(Source)?.rootNode.toString()).toBe(Tree);
});
