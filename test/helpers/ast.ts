import type { Language, Node } from '@willbooster/web-tree-sitter';

export interface AstCapture<T> {
  name: string;
  node: T;
}

interface TraversableNode {
  startIndex: number;
  namedChildren: this[];
}

const supertypeCache = new WeakMap<Language, Map<string, Set<number>>>();

export function hasSupertype(language: Language, node: Node | null | undefined, supertype: string): node is Node {
  if (!node) return false;
  return getSubtypeSet(language, supertype).has(node.typeId);
}

export function collectCaptures<T extends TraversableNode>(
  root: T,
  visit: (node: T, emit: (name: string, target?: T) => void) => void
): AstCapture<T>[] {
  const captures: AstCapture<T>[] = [];
  const emit = (current: T, name: string, target?: T): void => {
    captures.push({ name, node: target ?? current });
  };
  walk(root, visit, emit);
  return captures.toSorted((left, right) => left.node.startIndex - right.node.startIndex);
}

function getSubtypeSet(language: Language, supertype: string): Set<number> {
  let byName = supertypeCache.get(language);
  if (!byName) {
    byName = new Map();
    for (const id of language.supertypes) {
      const name = language.nodeTypeForId(id);
      if (name) byName.set(name, new Set(language.subtypes(id)));
    }
    supertypeCache.set(language, byName);
  }
  const subtypes = byName.get(supertype);
  if (!subtypes) throw new Error(`Unknown supertype: ${supertype}`);
  return subtypes;
}

function walk<T extends TraversableNode>(
  node: T,
  visit: (current: T, emit: (name: string, target?: T) => void) => void,
  emit: (current: T, name: string, target?: T) => void
): void {
  visit(node, (name, target) => emit(node, name, target));
  for (const child of node.namedChildren) walk(child, visit, emit);
}
