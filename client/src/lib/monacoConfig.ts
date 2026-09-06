import type { Monaco } from '@monaco-editor/react';
import type { editor, languages, IRange, Position } from 'monaco-editor';
import {
  docString,
  lspAvailable,
  lspQuery,
  type LspCompletionItem,
  type LspCompletionList,
  type LspHover,
  type LspRange,
  type LspSignatureHelp,
} from './lsp';

// Autocomplete has two tiers:
// 1. Semantic (preferred): clangd runs server-side and knows real types —
//    `v.` completes vector members with exact signatures, including your own
//    structs. Used whenever the server reports it available and answers fast.
// 2. Curated (fallback, LeetCode-style): static lists with signatures in the
//    detail column — keywords, STL types/functions/constants, and member
//    suggestions after '.', '->' and '::' as the union of common STL members
//    with their owning containers named in the detail.

const SNIPPETS: { label: string; detail: string; insertText: string }[] = [
  {
    label: 'vec',
    detail: 'std::vector',
    insertText: 'vector<${1:int}> ${2:v};',
  },
  {
    label: 'umap',
    detail: 'std::unordered_map',
    insertText: 'unordered_map<${1:int}, ${2:int}> ${3:m};',
  },
  {
    label: 'pq',
    detail: 'std::priority_queue (max-heap)',
    insertText: 'priority_queue<${1:int}> ${2:pq};',
  },
  {
    label: 'pqmin',
    detail: 'std::priority_queue (min-heap)',
    insertText: 'priority_queue<${1:int}, vector<${1:int}>, greater<${1:int}>> ${2:pq};',
  },
  {
    label: 'forr',
    detail: 'range-for',
    insertText: 'for (const auto& ${1:x} : ${2:xs}) {\n\t$0\n}',
  },
  {
    label: 'fori',
    detail: 'index for loop',
    insertText: 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ++${1:i}) {\n\t$0\n}',
  },
  {
    label: 'lam',
    detail: 'lambda',
    insertText: 'auto ${1:f} = [&](${2:int x}) { return $0; };',
  },
  {
    label: 'cmpstruct',
    detail: 'struct with comparator',
    insertText: 'struct ${1:Cmp} {\n\tbool operator()(const ${2:T}& a, const ${2:T}& b) const {\n\t\treturn $0;\n\t}\n};',
  },
  {
    label: 'bsearch',
    detail: 'binary search template',
    insertText:
      'int lo = ${1:0}, hi = ${2:n};\nwhile (lo < hi) {\n\tint mid = lo + (hi - lo) / 2;\n\tif (${3:pred(mid)}) hi = mid;\n\telse lo = mid + 1;\n}$0',
  },
];

const KEYWORDS = [
  'alignas', 'alignof', 'auto', 'bool', 'break', 'case', 'catch', 'char', 'class', 'const',
  'constexpr', 'const_cast', 'continue', 'decltype', 'default', 'delete', 'do', 'double',
  'dynamic_cast', 'else', 'enum', 'explicit', 'extern', 'false', 'float', 'for', 'friend',
  'goto', 'if', 'inline', 'int', 'long', 'mutable', 'namespace', 'new', 'noexcept', 'nullptr',
  'operator', 'private', 'protected', 'public', 'reinterpret_cast', 'return', 'short', 'signed',
  'sizeof', 'static', 'static_cast', 'struct', 'switch', 'template', 'this', 'throw', 'true',
  'try', 'typedef', 'typename', 'union', 'unsigned', 'using', 'virtual', 'void', 'volatile',
  'while',
];

type EntryKind = 'type' | 'fn' | 'const' | 'var' | 'field';

interface Entry {
  label: string;
  detail: string;
  kind: EntryKind;
}

const GLOBALS: Entry[] = [
  // Containers & core types
  { label: 'vector', detail: 'vector<T>', kind: 'type' },
  { label: 'string', detail: 'std::string', kind: 'type' },
  { label: 'string_view', detail: 'std::string_view (C++17)', kind: 'type' },
  { label: 'array', detail: 'array<T, N>', kind: 'type' },
  { label: 'deque', detail: 'deque<T>', kind: 'type' },
  { label: 'list', detail: 'list<T> (doubly-linked)', kind: 'type' },
  { label: 'set', detail: 'set<T> (ordered, unique)', kind: 'type' },
  { label: 'multiset', detail: 'multiset<T> (ordered, duplicates)', kind: 'type' },
  { label: 'map', detail: 'map<K, V> (ordered)', kind: 'type' },
  { label: 'multimap', detail: 'multimap<K, V>', kind: 'type' },
  { label: 'unordered_set', detail: 'unordered_set<T> (hash)', kind: 'type' },
  { label: 'unordered_map', detail: 'unordered_map<K, V> (hash)', kind: 'type' },
  { label: 'unordered_multiset', detail: 'unordered_multiset<T>', kind: 'type' },
  { label: 'unordered_multimap', detail: 'unordered_multimap<K, V>', kind: 'type' },
  { label: 'stack', detail: 'stack<T>', kind: 'type' },
  { label: 'queue', detail: 'queue<T>', kind: 'type' },
  { label: 'priority_queue', detail: 'priority_queue<T> (max-heap by default)', kind: 'type' },
  { label: 'pair', detail: 'pair<A, B>', kind: 'type' },
  { label: 'tuple', detail: 'tuple<Ts...>', kind: 'type' },
  { label: 'bitset', detail: 'bitset<N>', kind: 'type' },
  { label: 'optional', detail: 'optional<T> (C++17)', kind: 'type' },
  { label: 'greater', detail: 'greater<T> — comparator for min-heaps / descending sort', kind: 'type' },
  { label: 'less', detail: 'less<T> — default ordering comparator', kind: 'type' },
  { label: 'numeric_limits', detail: 'numeric_limits<T>::max() / ::min() / ::lowest()', kind: 'type' },
  { label: 'size_t', detail: 'unsigned size type', kind: 'type' },
  { label: 'int64_t', detail: '64-bit signed integer', kind: 'type' },
  { label: 'uint64_t', detail: '64-bit unsigned integer', kind: 'type' },

  // <algorithm> / <numeric>
  { label: 'sort', detail: 'sort(first, last[, cmp]) — O(n log n)', kind: 'fn' },
  { label: 'stable_sort', detail: 'stable_sort(first, last[, cmp]) — keeps equal order', kind: 'fn' },
  { label: 'nth_element', detail: 'nth_element(first, nth, last) — partial ordering, O(n) avg', kind: 'fn' },
  { label: 'partial_sort', detail: 'partial_sort(first, middle, last)', kind: 'fn' },
  { label: 'reverse', detail: 'reverse(first, last)', kind: 'fn' },
  { label: 'rotate', detail: 'rotate(first, new_first, last)', kind: 'fn' },
  { label: 'unique', detail: 'unique(first, last) — dedups adjacent, returns new end', kind: 'fn' },
  { label: 'min', detail: 'min(a, b) / min({a, b, c})', kind: 'fn' },
  { label: 'max', detail: 'max(a, b) / max({a, b, c})', kind: 'fn' },
  { label: 'min_element', detail: 'min_element(first, last) → iterator', kind: 'fn' },
  { label: 'max_element', detail: 'max_element(first, last) → iterator', kind: 'fn' },
  { label: 'accumulate', detail: 'accumulate(first, last, init) — <numeric>', kind: 'fn' },
  { label: 'iota', detail: 'iota(first, last, start) — fills 0,1,2,… — <numeric>', kind: 'fn' },
  { label: 'fill', detail: 'fill(first, last, value)', kind: 'fn' },
  { label: 'find', detail: 'find(first, last, value) → iterator', kind: 'fn' },
  { label: 'find_if', detail: 'find_if(first, last, pred) → iterator', kind: 'fn' },
  { label: 'count', detail: 'count(first, last, value)', kind: 'fn' },
  { label: 'count_if', detail: 'count_if(first, last, pred)', kind: 'fn' },
  { label: 'all_of', detail: 'all_of(first, last, pred)', kind: 'fn' },
  { label: 'any_of', detail: 'any_of(first, last, pred)', kind: 'fn' },
  { label: 'none_of', detail: 'none_of(first, last, pred)', kind: 'fn' },
  { label: 'lower_bound', detail: 'lower_bound(first, last, value) — first elem ≥ value (sorted)', kind: 'fn' },
  { label: 'upper_bound', detail: 'upper_bound(first, last, value) — first elem > value (sorted)', kind: 'fn' },
  { label: 'binary_search', detail: 'binary_search(first, last, value) → bool (sorted)', kind: 'fn' },
  { label: 'next_permutation', detail: 'next_permutation(first, last) → bool', kind: 'fn' },
  { label: 'prev_permutation', detail: 'prev_permutation(first, last) → bool', kind: 'fn' },
  { label: 'swap', detail: 'swap(a, b)', kind: 'fn' },
  { label: 'distance', detail: 'distance(first, last) → count', kind: 'fn' },
  { label: 'back_inserter', detail: 'back_inserter(container) — output iterator', kind: 'fn' },
  { label: 'make_pair', detail: 'make_pair(a, b)', kind: 'fn' },
  { label: 'make_tuple', detail: 'make_tuple(args...)', kind: 'fn' },
  { label: 'tie', detail: 'tie(a, b) = pair/tuple — destructuring assignment', kind: 'fn' },
  { label: 'get', detail: 'get<I>(tuple)', kind: 'fn' },
  { label: 'move', detail: 'move(x) — cast to rvalue', kind: 'fn' },

  // <cmath> & friends
  { label: 'abs', detail: 'abs(x)', kind: 'fn' },
  { label: 'sqrt', detail: 'sqrt(x)', kind: 'fn' },
  { label: 'pow', detail: 'pow(base, exp) — returns double; prefer integer loops for exactness', kind: 'fn' },
  { label: 'floor', detail: 'floor(x)', kind: 'fn' },
  { label: 'ceil', detail: 'ceil(x)', kind: 'fn' },
  { label: 'round', detail: 'round(x)', kind: 'fn' },
  { label: 'log2', detail: 'log2(x)', kind: 'fn' },
  { label: 'gcd', detail: 'gcd(a, b) — <numeric>, C++17', kind: 'fn' },
  { label: 'lcm', detail: 'lcm(a, b) — <numeric>, C++17', kind: 'fn' },

  // strings & conversion
  { label: 'to_string', detail: 'to_string(number) → string', kind: 'fn' },
  { label: 'stoi', detail: 'stoi(s) → int', kind: 'fn' },
  { label: 'stol', detail: 'stol(s) → long', kind: 'fn' },
  { label: 'stoll', detail: 'stoll(s) → long long', kind: 'fn' },
  { label: 'stod', detail: 'stod(s) → double', kind: 'fn' },
  { label: 'getline', detail: 'getline(cin, s[, delim])', kind: 'fn' },
  { label: 'isdigit', detail: 'isdigit(c)', kind: 'fn' },
  { label: 'isalpha', detail: 'isalpha(c)', kind: 'fn' },
  { label: 'isalnum', detail: 'isalnum(c)', kind: 'fn' },
  { label: 'islower', detail: 'islower(c)', kind: 'fn' },
  { label: 'isupper', detail: 'isupper(c)', kind: 'fn' },
  { label: 'tolower', detail: 'tolower(c)', kind: 'fn' },
  { label: 'toupper', detail: 'toupper(c)', kind: 'fn' },
  { label: 'memset', detail: 'memset(ptr, byte, nbytes) — only safe for 0 / -1 on ints', kind: 'fn' },

  // GCC builtins (competitive staples)
  { label: '__builtin_popcount', detail: '__builtin_popcount(x) — set bits in unsigned int', kind: 'fn' },
  { label: '__builtin_popcountll', detail: '__builtin_popcountll(x) — set bits in unsigned long long', kind: 'fn' },
  { label: '__builtin_clz', detail: '__builtin_clz(x) — leading zeros (x must be non-zero)', kind: 'fn' },
  { label: '__builtin_ctz', detail: '__builtin_ctz(x) — trailing zeros (x must be non-zero)', kind: 'fn' },

  // constants & streams
  { label: 'INT_MAX', detail: '2147483647', kind: 'const' },
  { label: 'INT_MIN', detail: '-2147483648', kind: 'const' },
  { label: 'LLONG_MAX', detail: '9223372036854775807', kind: 'const' },
  { label: 'LLONG_MIN', detail: '-9223372036854775808', kind: 'const' },
  { label: 'UINT_MAX', detail: '4294967295', kind: 'const' },
  { label: 'SIZE_MAX', detail: 'maximum size_t', kind: 'const' },
  { label: 'cout', detail: 'std::cout', kind: 'var' },
  { label: 'cin', detail: 'std::cin', kind: 'var' },
  { label: 'cerr', detail: 'std::cerr', kind: 'var' },
  { label: 'endl', detail: 'flushes — plain "\\n" is faster', kind: 'var' },
];

// Union of common STL members, LeetCode-style: no type inference, the owning
// containers are named in the detail so the wrong ones are easy to skip.
const MEMBERS: Entry[] = [
  { label: 'size', detail: 'size() → size_t — all containers', kind: 'fn' },
  { label: 'empty', detail: 'empty() → bool — all containers', kind: 'fn' },
  { label: 'clear', detail: 'clear() — all containers', kind: 'fn' },
  { label: 'begin', detail: 'begin() → iterator', kind: 'fn' },
  { label: 'end', detail: 'end() → iterator', kind: 'fn' },
  { label: 'rbegin', detail: 'rbegin() → reverse iterator', kind: 'fn' },
  { label: 'rend', detail: 'rend() → reverse iterator', kind: 'fn' },
  { label: 'push_back', detail: 'push_back(value) — vector/deque/string', kind: 'fn' },
  { label: 'emplace_back', detail: 'emplace_back(args...) — vector/deque, constructs in place', kind: 'fn' },
  { label: 'pop_back', detail: 'pop_back() — vector/deque/string', kind: 'fn' },
  { label: 'push_front', detail: 'push_front(value) — deque/list', kind: 'fn' },
  { label: 'pop_front', detail: 'pop_front() — deque/list', kind: 'fn' },
  { label: 'front', detail: 'front() — vector/deque/queue/string', kind: 'fn' },
  { label: 'back', detail: 'back() — vector/deque/queue/string', kind: 'fn' },
  { label: 'at', detail: 'at(index/key) — bounds-checked — vector/map/string', kind: 'fn' },
  { label: 'resize', detail: 'resize(n[, value]) — vector/deque/string', kind: 'fn' },
  { label: 'reserve', detail: 'reserve(n) — vector/string/unordered_*', kind: 'fn' },
  { label: 'assign', detail: 'assign(n, value) / assign(first, last)', kind: 'fn' },
  { label: 'insert', detail: 'insert(value) — set/map; insert(pos, value) — vector/string', kind: 'fn' },
  { label: 'emplace', detail: 'emplace(args...) — set/map/stack/queue/pq, constructs in place', kind: 'fn' },
  { label: 'erase', detail: 'erase(key) — set/map; erase(iterator) — all', kind: 'fn' },
  { label: 'find', detail: 'find(key) → iterator (end() if absent) — set/map; find(str) → pos — string', kind: 'fn' },
  { label: 'count', detail: 'count(key) → 0/1 — set/map (multiset: n)', kind: 'fn' },
  { label: 'contains', detail: 'contains(key) → bool — set/map, C++20', kind: 'fn' },
  { label: 'lower_bound', detail: 'lower_bound(key) → first elem ≥ key — set/map (O(log n))', kind: 'fn' },
  { label: 'upper_bound', detail: 'upper_bound(key) → first elem > key — set/map (O(log n))', kind: 'fn' },
  { label: 'equal_range', detail: 'equal_range(key) → {lower, upper} — set/map', kind: 'fn' },
  { label: 'push', detail: 'push(value) — stack/queue/priority_queue', kind: 'fn' },
  { label: 'pop', detail: 'pop() — stack/queue/priority_queue (returns void!)', kind: 'fn' },
  { label: 'top', detail: 'top() — stack/priority_queue', kind: 'fn' },
  { label: 'swap', detail: 'swap(other) — all containers, O(1)', kind: 'fn' },
  { label: 'first', detail: 'pair.first', kind: 'field' },
  { label: 'second', detail: 'pair.second', kind: 'field' },
  { label: 'substr', detail: 'substr(pos[, len]) — string (copies!)', kind: 'fn' },
  { label: 'length', detail: 'length() → size_t — string', kind: 'fn' },
  { label: 'append', detail: 'append(str) — string', kind: 'fn' },
  { label: 'replace', detail: 'replace(pos, len, str) — string', kind: 'fn' },
  { label: 'compare', detail: 'compare(str) → <0 / 0 / >0 — string', kind: 'fn' },
  { label: 'rfind', detail: 'rfind(str) → last occurrence pos — string', kind: 'fn' },
  { label: 'find_first_of', detail: 'find_first_of(chars) → pos — string', kind: 'fn' },
  { label: 'find_last_of', detail: 'find_last_of(chars) → pos — string', kind: 'fn' },
  { label: 'starts_with', detail: 'starts_with(prefix) → bool — string, C++20', kind: 'fn' },
  { label: 'ends_with', detail: 'ends_with(suffix) → bool — string, C++20', kind: 'fn' },
  { label: 'c_str', detail: 'c_str() → const char* — string', kind: 'fn' },
  { label: 'data', detail: 'data() → pointer — vector/string/array', kind: 'fn' },
  { label: 'npos', detail: 'string::npos — "not found" sentinel from find()', kind: 'field' },
];

let registered = false;

// LSP CompletionItemKind (1-25) → Monaco's enum (same names, different values).
function lspKindTable(monaco: Monaco): Record<number, languages.CompletionItemKind> {
  const K = monaco.languages.CompletionItemKind;
  return {
    1: K.Text, 2: K.Method, 3: K.Function, 4: K.Constructor, 5: K.Field,
    6: K.Variable, 7: K.Class, 8: K.Interface, 9: K.Module, 10: K.Property,
    11: K.Unit, 12: K.Value, 13: K.Enum, 14: K.Keyword, 15: K.Snippet,
    16: K.Color, 17: K.File, 18: K.Reference, 19: K.Folder, 20: K.EnumMember,
    21: K.Constant, 22: K.Struct, 23: K.Event, 24: K.Operator, 25: K.TypeParameter,
  };
}

function toMonacoRange(r: LspRange): IRange {
  return {
    startLineNumber: r.start.line + 1,
    startColumn: r.start.character + 1,
    endLineNumber: r.end.line + 1,
    endColumn: r.end.character + 1,
  };
}

function mapLspCompletions(
  monaco: Monaco,
  result: unknown,
  fallbackRange: IRange,
): languages.CompletionList | null {
  if (!result) return null;
  const list = Array.isArray(result)
    ? { items: result as LspCompletionItem[] }
    : (result as LspCompletionList);
  if (!Array.isArray(list.items)) return null;
  const kinds = lspKindTable(monaco);
  const suggestions: languages.CompletionItem[] = list.items.map((item) => {
    const editRange = item.textEdit?.range ?? item.textEdit?.replace ?? item.textEdit?.insert;
    return {
      label: item.label.trim(), // clangd prefixes labels with a space
      kind: kinds[item.kind ?? 1] ?? monaco.languages.CompletionItemKind.Text,
      detail: item.detail,
      documentation: docString(item.documentation),
      insertText: item.textEdit?.newText ?? item.insertText ?? item.label,
      insertTextRules:
        item.insertTextFormat === 2
          ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
          : undefined,
      filterText: item.filterText,
      sortText: item.sortText,
      range: editRange ? toMonacoRange(editRange) : fallbackRange,
    };
  });
  return { suggestions, incomplete: list.isIncomplete === true };
}

export function setupMonaco(monaco: Monaco): void {
  if (registered) return;
  registered = true;

  const kindOf = (k: EntryKind): languages.CompletionItemKind => {
    const K = monaco.languages.CompletionItemKind;
    if (k === 'type') return K.Class;
    if (k === 'fn') return K.Function;
    if (k === 'const') return K.Constant;
    if (k === 'field') return K.Field;
    return K.Variable;
  };

  monaco.languages.registerCompletionItemProvider('cpp', {
    triggerCharacters: ['.', '>', ':'],
    async provideCompletionItems(
      model: editor.ITextModel,
      position: Position,
    ): Promise<languages.CompletionList> {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      // Semantic tier: real type-aware completions from clangd.
      if (lspAvailable()) {
        const result = await lspQuery('completion', model.getValue(), position.lineNumber, position.column);
        const mapped = mapLspCompletions(monaco, result, range);
        if (mapped && mapped.suggestions.length > 0) return mapped;
      }

      // Curated tier (clangd off, slow, or empty at this position).
      // Every curated return is marked `incomplete` so Monaco re-invokes this
      // provider on each subsequent character instead of locally filtering the
      // list it already has. Without it, one curated answer at 'std::' is
      // treated as exhaustive for the whole identifier, so the semantic tier
      // can never take over mid-word once clangd warms up — and any symbol
      // missing from the curated list (std::function among them) stays
      // unreachable until the user retypes the line.
      const before = model.getLineContent(position.lineNumber).slice(0, word.startColumn - 1);
      const entryItems = (entries: Entry[]): languages.CompletionItem[] =>
        entries.map((e) => ({
          label: e.label,
          detail: e.detail,
          kind: kindOf(e.kind),
          insertText: e.label,
          range,
        }));

      // Member access: '.' or '->' (but not a float literal like "3.").
      if (/(?<![0-9])\.\s*$/.test(before) || /->\s*$/.test(before)) {
        return { suggestions: entryItems(MEMBERS), incomplete: true };
      }
      // Scope access ('std::', 'string::', …): STL symbols fit here too.
      if (/::\s*$/.test(before)) {
        return {
          suggestions: entryItems(GLOBALS.concat(MEMBERS.filter((m) => m.label === 'npos'))),
          incomplete: true,
        };
      }

      const keywords: languages.CompletionItem[] = KEYWORDS.map((k) => ({
        label: k,
        kind: monaco.languages.CompletionItemKind.Keyword,
        insertText: k,
        range,
      }));
      const snippets: languages.CompletionItem[] = SNIPPETS.map((s) => ({
        label: s.label,
        detail: s.detail,
        kind: monaco.languages.CompletionItemKind.Snippet,
        insertText: s.insertText,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        range,
      }));
      return { suggestions: [...entryItems(GLOBALS), ...keywords, ...snippets], incomplete: true };
    },
  });

  // Parameter hints while typing a call — clangd only (no curated tier).
  monaco.languages.registerSignatureHelpProvider('cpp', {
    signatureHelpTriggerCharacters: ['(', ','],
    signatureHelpRetriggerCharacters: [')'],
    async provideSignatureHelp(model: editor.ITextModel, position: Position) {
      if (!lspAvailable()) return null;
      const result = (await lspQuery(
        'signature',
        model.getValue(),
        position.lineNumber,
        position.column,
      )) as LspSignatureHelp | null;
      if (!result || !Array.isArray(result.signatures) || result.signatures.length === 0) return null;
      return {
        value: {
          signatures: result.signatures.map((s) => ({
            label: s.label,
            documentation: docString(s.documentation),
            parameters: (s.parameters ?? []).map((p) => ({
              label: p.label,
              documentation: docString(p.documentation),
            })),
          })),
          activeSignature: result.activeSignature ?? 0,
          activeParameter: result.activeParameter ?? 0,
        },
        dispose() {},
      };
    },
  });

  // Hover types/docs — clangd only.
  monaco.languages.registerHoverProvider('cpp', {
    async provideHover(model: editor.ITextModel, position: Position) {
      if (!lspAvailable()) return null;
      const result = (await lspQuery(
        'hover',
        model.getValue(),
        position.lineNumber,
        position.column,
        1_000,
      )) as LspHover | null;
      if (!result || result.contents === undefined) return null;
      const parts = (Array.isArray(result.contents) ? result.contents : [result.contents])
        .map((c) => docString(c))
        .filter((v): v is string => Boolean(v));
      if (parts.length === 0) return null;
      return { contents: parts.map((value) => ({ value })) };
    },
  });
}

// LeetCode-like editor: curated STL/keyword/member autocomplete (above) plus
// identifiers already in the buffer — still no clangd-grade type analysis.
// Static object — a stable reference matters: @monaco-editor/react calls
// updateOptions when it changes.
export const EDITOR_OPTIONS: editor.IStandaloneEditorConstructionOptions = {
  fontSize: 14,
  tabSize: 4,
  fontLigatures: false,
  minimap: { enabled: false },
  wordBasedSuggestions: 'currentDocument',
  quickSuggestions: { other: true, comments: false, strings: false },
  suggestOnTriggerCharacters: true,
  autoClosingBrackets: 'always',
  autoClosingQuotes: 'always',
  bracketPairColorization: { enabled: true },
  scrollBeyondLastLine: false,
  automaticLayout: true,
  padding: { top: 8 },
};
