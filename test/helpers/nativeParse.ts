import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { expect } from 'vitest';

export interface NativePoint {
  row: number;
  column: number;
}

export interface NativeNode {
  type: string;
  field: string | undefined;
  startIndex: number;
  endIndex: number;
  startPosition: NativePoint;
  endPosition: NativePoint;
  text: string;
  namedChildren: NativeNode[];
  childForFieldName(name: string): NativeNode | undefined;
  descendantsOfType(types: string | string[]): NativeNode[];
}

export interface NativeSource {
  file: string;
  rootNode: NativeNode;
}

interface RawElement {
  type: string;
  field: string | undefined;
  startPosition: NativePoint;
  endPosition: NativePoint;
  children: RawElement[];
}

export function parseNativeFiles(root: string, libraryDirectory: string, files: string[]): NativeSource[] {
  fs.mkdirSync(libraryDirectory, { recursive: true });
  const configPath = path.join(libraryDirectory, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify({ 'parser-directories': [libraryDirectory] }));
  const result = spawnSync(
    'script/tree-sitter',
    ['parse', '-x', '--config-path', configPath, '--grammar-path', '.', ...files],
    {
      cwd: root,
      env: { ...process.env, TREE_SITTER_LIBDIR: libraryDirectory },
      encoding: 'utf8',
      timeout: 300_000,
    }
  );
  expect(result.error).toBeUndefined();
  expect(result.stderr).toBe('');
  expect([0, 1]).toContain(result.status);
  expect(result.stdout.startsWith('<?xml')).toBe(true);
  return parseXmlSources(root, result.stdout);
}

function parseXmlSources(root: string, xml: string): NativeSource[] {
  const sources: NativeSource[] = [];
  for (const match of xml.matchAll(/<source name="([^"]+)">([\s\S]*?)<\/source>/gu)) {
    const file = match[1]!;
    const buffer = fs.readFileSync(path.join(root, file));
    const lineOffsets = buildLineOffsets(buffer);
    sources.push({ file, rootNode: materializeNode(parseSourceElement(match[2]!), buffer, lineOffsets) });
  }
  return sources;
}

function parseSourceElement(body: string): RawElement {
  const stack: RawElement[] = [];
  let root: RawElement | undefined;
  for (const tag of body.matchAll(/<(\/?)([A-Za-z_][\w-]*)([^>]*?)(\/?)>/gu)) {
    const [, closing, name, rawAttributes, selfClosing] = tag;
    if (closing) {
      root = stack.pop();
      continue;
    }
    const element = createRawElement(name!, rawAttributes!);
    stack.at(-1)?.children.push(element);
    if (selfClosing) root = element;
    else stack.push(element);
  }
  if (!root) throw new Error('Missing root element in tree-sitter XML output');
  return root;
}

function createRawElement(type: string, rawAttributes: string): RawElement {
  const attributes = new Map<string, string>();
  for (const pair of rawAttributes.matchAll(/(\w+)="([^"]*)"/gu)) {
    attributes.set(pair[1]!, pair[2]!);
  }
  return {
    type,
    field: attributes.get('field'),
    startPosition: { row: Number(attributes.get('srow')), column: Number(attributes.get('scol')) },
    endPosition: { row: Number(attributes.get('erow')), column: Number(attributes.get('ecol')) },
    children: [],
  };
}

function materializeNode(raw: RawElement, buffer: Buffer, lineOffsets: number[]): NativeNode {
  const startIndex = byteOffsetAt(lineOffsets, buffer.length, raw.startPosition);
  const endIndex = byteOffsetAt(lineOffsets, buffer.length, raw.endPosition);
  const namedChildren = raw.children.map((child) => materializeNode(child, buffer, lineOffsets));
  const node: NativeNode = {
    type: raw.type,
    field: raw.field,
    startIndex,
    endIndex,
    startPosition: raw.startPosition,
    endPosition: raw.endPosition,
    text: buffer.subarray(startIndex, endIndex).toString('utf8'),
    namedChildren,
    childForFieldName: (name) => namedChildren.find((child) => child.field === name),
    descendantsOfType: (types) => collectDescendants(node, new Set(Array.isArray(types) ? types : [types])),
  };
  return node;
}

function buildLineOffsets(buffer: Buffer): number[] {
  const offsets = [0];
  for (let index = 0; index < buffer.length; index++) {
    if (buffer[index] === 0x0a) offsets.push(index + 1);
  }
  return offsets;
}

function byteOffsetAt(lineOffsets: number[], totalLength: number, point: NativePoint): number {
  const rowStart = lineOffsets[point.row] ?? totalLength;
  return Math.min(rowStart + point.column, totalLength);
}

function collectDescendants(root: NativeNode, types: Set<string>): NativeNode[] {
  const matches: NativeNode[] = [];
  if (types.has(root.type)) matches.push(root);
  for (const child of root.namedChildren) matches.push(...collectDescendants(child, types));
  return matches;
}
