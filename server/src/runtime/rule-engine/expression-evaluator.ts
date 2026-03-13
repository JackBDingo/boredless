/**
 * expression-evaluator.ts — Safe expression evaluator for the Rule Engine.
 *
 * Implements a recursive descent parser for a subset of JavaScript-like
 * expression syntax. NO eval() or new Function() — security is paramount
 * since game schemas may be user-authored.
 *
 * Supported syntax:
 *   Field access:       globals.score, player.health, phase.name
 *   Special prefixes:   $event.type, $players.count
 *   Comparisons:        ==, !=, >, <, >=, <=
 *   Boolean:            &&, ||, !
 *   Arithmetic:         +, -, *, /, %
 *   String methods:     .contains('x'), .startsWith('x'), .length
 *   Array methods:      .includes(x), .length
 *   Ternary:            condition ? valueA : valueB
 *   Parentheses:        (a + b) * 2
 *   Literals:           42, 3.14, "string", 'string', true, false, null
 */

import type { RuleContext } from './types.js';

// ---------------------------------------------------------------------------
// Token types
// ---------------------------------------------------------------------------

type TokenKind =
  | 'NUMBER'
  | 'STRING'
  | 'IDENT'
  | 'BOOL'
  | 'NULL'
  | 'DOT'
  | 'LPAREN'
  | 'RPAREN'
  | 'LBRACKET'
  | 'RBRACKET'
  | 'COMMA'
  | 'QUESTION'
  | 'COLON'
  | 'EQ'       // ==
  | 'NEQ'      // !=
  | 'LT'       // <
  | 'GT'       // >
  | 'LTE'      // <=
  | 'GTE'      // >=
  | 'AND'      // &&
  | 'OR'       // ||
  | 'BANG'     // !
  | 'PLUS'
  | 'MINUS'
  | 'STAR'
  | 'SLASH'
  | 'PERCENT'
  | 'EOF';

interface Token {
  kind: TokenKind;
  value: string;
  pos: number;
}

// ---------------------------------------------------------------------------
// Lexer
// ---------------------------------------------------------------------------

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    // Skip whitespace
    if (/\s/.test(input[i])) {
      i++;
      continue;
    }

    const pos = i;
    const ch = input[i];

    // Two-character operators
    if (ch === '=' && input[i + 1] === '=') {
      tokens.push({ kind: 'EQ', value: '==', pos });
      i += 2;
      continue;
    }
    if (ch === '!' && input[i + 1] === '=') {
      tokens.push({ kind: 'NEQ', value: '!=', pos });
      i += 2;
      continue;
    }
    if (ch === '<' && input[i + 1] === '=') {
      tokens.push({ kind: 'LTE', value: '<=', pos });
      i += 2;
      continue;
    }
    if (ch === '>' && input[i + 1] === '=') {
      tokens.push({ kind: 'GTE', value: '>=', pos });
      i += 2;
      continue;
    }
    if (ch === '&' && input[i + 1] === '&') {
      tokens.push({ kind: 'AND', value: '&&', pos });
      i += 2;
      continue;
    }
    if (ch === '|' && input[i + 1] === '|') {
      tokens.push({ kind: 'OR', value: '||', pos });
      i += 2;
      continue;
    }

    // Single-character operators / punctuation
    const singleMap: Record<string, TokenKind> = {
      '.': 'DOT',
      '(': 'LPAREN',
      ')': 'RPAREN',
      '[': 'LBRACKET',
      ']': 'RBRACKET',
      ',': 'COMMA',
      '?': 'QUESTION',
      ':': 'COLON',
      '<': 'LT',
      '>': 'GT',
      '!': 'BANG',
      '+': 'PLUS',
      '-': 'MINUS',
      '*': 'STAR',
      '/': 'SLASH',
      '%': 'PERCENT',
    };
    if (ch in singleMap) {
      tokens.push({ kind: singleMap[ch], value: ch, pos });
      i++;
      continue;
    }

    // Number literal
    if (/[0-9]/.test(ch) || (ch === '-' && /[0-9]/.test(input[i + 1] ?? ''))) {
      let num = '';
      if (ch === '-') { num = '-'; i++; }
      while (i < input.length && /[0-9.]/.test(input[i])) {
        num += input[i++];
      }
      tokens.push({ kind: 'NUMBER', value: num, pos });
      continue;
    }

    // String literal
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let str = '';
      i++; // skip opening quote
      while (i < input.length && input[i] !== quote) {
        if (input[i] === '\\' && i + 1 < input.length) {
          i++; // skip backslash
          str += input[i];
        } else {
          str += input[i];
        }
        i++;
      }
      i++; // skip closing quote
      tokens.push({ kind: 'STRING', value: str, pos });
      continue;
    }

    // Identifier / keyword (including $ prefix for special vars)
    if (/[a-zA-Z_$]/.test(ch)) {
      let ident = '';
      while (i < input.length && /[a-zA-Z0-9_$]/.test(input[i])) {
        ident += input[i++];
      }
      if (ident === 'true' || ident === 'false') {
        tokens.push({ kind: 'BOOL', value: ident, pos });
      } else if (ident === 'null') {
        tokens.push({ kind: 'NULL', value: 'null', pos });
      } else {
        tokens.push({ kind: 'IDENT', value: ident, pos });
      }
      continue;
    }

    throw new Error(`[rule-engine/expression-evaluator] Unexpected character '${ch}' at position ${i} in expression: "${input}"`);
  }

  tokens.push({ kind: 'EOF', value: '', pos: i });
  return tokens;
}

// ---------------------------------------------------------------------------
// Parser (Recursive Descent)
// ---------------------------------------------------------------------------

class Parser {
  private tokens: Token[];
  private pos: number = 0;
  private context: RuleContext;

  constructor(tokens: Token[], context: RuleContext) {
    this.tokens = tokens;
    this.context = context;
  }

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private consume(): Token {
    return this.tokens[this.pos++];
  }

  private expect(kind: TokenKind): Token {
    const tok = this.consume();
    if (tok.kind !== kind) {
      throw new Error(`[rule-engine/expression-evaluator] Expected ${kind} but got ${tok.kind} ('${tok.value}') at position ${tok.pos}`);
    }
    return tok;
  }

  private match(...kinds: TokenKind[]): boolean {
    return kinds.includes(this.peek().kind);
  }

  // ---------------------------------------------------------------------------
  // Grammar (lowest to highest precedence):
  //   expr       = ternary
  //   ternary    = or ('?' or ':' or)*
  //   or         = and ('||' and)*
  //   and        = equality ('&&' equality)*
  //   equality   = comparison (('==' | '!=') comparison)*
  //   comparison = addition (('<' | '>' | '<=' | '>=') addition)*
  //   addition   = multiplication (('+' | '-') multiplication)*
  //   multiplication = unary (('*' | '/' | '%') unary)*
  //   unary      = '!' unary | '-' unary | postfix
  //   postfix    = primary ('.' IDENT ('(' args? ')')? | '[' expr ']')*
  //   primary    = NUMBER | STRING | BOOL | NULL | IDENT | '(' expr ')'
  // ---------------------------------------------------------------------------

  parse(): unknown {
    const val = this.parseTernary();
    if (this.peek().kind !== 'EOF') {
      throw new Error(`[rule-engine/expression-evaluator] Unexpected token '${this.peek().value}' after expression`);
    }
    return val;
  }

  private parseTernary(): unknown {
    const condition = this.parseOr();
    if (this.match('QUESTION')) {
      this.consume(); // consume '?'
      const consequent = this.parseTernary();
      this.expect('COLON');
      const alternate = this.parseTernary();
      return condition ? consequent : alternate;
    }
    return condition;
  }

  private parseOr(): unknown {
    let left = this.parseAnd();
    while (this.match('OR')) {
      this.consume();
      const right = this.parseAnd();
      left = Boolean(left) || Boolean(right);
    }
    return left;
  }

  private parseAnd(): unknown {
    let left = this.parseEquality();
    while (this.match('AND')) {
      this.consume();
      const right = this.parseEquality();
      left = Boolean(left) && Boolean(right);
    }
    return left;
  }

  private parseEquality(): unknown {
    let left = this.parseComparison();
    while (this.match('EQ', 'NEQ')) {
      const op = this.consume();
      const right = this.parseComparison();
      if (op.kind === 'EQ') {
        // eslint-disable-next-line eqeqeq
        left = left == right;
      } else {
        // eslint-disable-next-line eqeqeq
        left = left != right;
      }
    }
    return left;
  }

  private parseComparison(): unknown {
    let left = this.parseAddition();
    while (this.match('LT', 'GT', 'LTE', 'GTE')) {
      const op = this.consume();
      const right = this.parseAddition();
      const l = left as number;
      const r = right as number;
      switch (op.kind) {
        case 'LT':  left = l < r; break;
        case 'GT':  left = l > r; break;
        case 'LTE': left = l <= r; break;
        case 'GTE': left = l >= r; break;
      }
    }
    return left;
  }

  private parseAddition(): unknown {
    let left = this.parseMultiplication();
    while (this.match('PLUS', 'MINUS')) {
      const op = this.consume();
      const right = this.parseMultiplication();
      if (op.kind === 'PLUS') {
        // Handle string concatenation
        if (typeof left === 'string' || typeof right === 'string') {
          left = String(left) + String(right);
        } else {
          left = (left as number) + (right as number);
        }
      } else {
        left = (left as number) - (right as number);
      }
    }
    return left;
  }

  private parseMultiplication(): unknown {
    let left = this.parseUnary();
    while (this.match('STAR', 'SLASH', 'PERCENT')) {
      const op = this.consume();
      const right = this.parseUnary();
      const l = left as number;
      const r = right as number;
      switch (op.kind) {
        case 'STAR':    left = l * r; break;
        case 'SLASH':   left = l / r; break;
        case 'PERCENT': left = l % r; break;
      }
    }
    return left;
  }

  private parseUnary(): unknown {
    if (this.match('BANG')) {
      this.consume();
      return !Boolean(this.parseUnary());
    }
    if (this.match('MINUS')) {
      this.consume();
      return -(this.parseUnary() as number);
    }
    return this.parsePostfix();
  }

  private parsePostfix(): unknown {
    let value = this.parsePrimary();

    while (this.match('DOT', 'LBRACKET')) {
      if (this.peek().kind === 'DOT') {
        this.consume(); // consume '.'
        const prop = this.expect('IDENT');

        // Check if this is a method call
        if (this.match('LPAREN')) {
          this.consume(); // consume '('
          const args = this.parseArgList();
          this.expect('RPAREN');

          // Handle built-in methods
          value = this.callMethod(value, prop.value, args, prop.pos);
        } else {
          // Property access
          value = this.getProperty(value, prop.value);
        }
      } else {
        // Bracket access: value[expr]
        this.consume(); // consume '['
        const index = this.parseTernary();
        this.expect('RBRACKET');
        if (value !== null && value !== undefined && typeof value === 'object') {
          value = (value as Record<string | number, unknown>)[index as string | number];
        } else {
          value = undefined;
        }
      }
    }

    return value;
  }

  private parseArgList(): unknown[] {
    const args: unknown[] = [];
    if (this.peek().kind === 'RPAREN') return args;
    args.push(this.parseTernary());
    while (this.match('COMMA')) {
      this.consume();
      args.push(this.parseTernary());
    }
    return args;
  }

  private getProperty(obj: unknown, key: string): unknown {
    if (obj === null || obj === undefined) return undefined;
    if (typeof obj === 'string') {
      if (key === 'length') return obj.length;
      return undefined;
    }
    if (Array.isArray(obj)) {
      if (key === 'length') return obj.length;
    }
    if (typeof obj === 'object') {
      return (obj as Record<string, unknown>)[key];
    }
    return undefined;
  }

  private callMethod(obj: unknown, method: string, args: unknown[], pos: number): unknown {
    if (typeof obj === 'string') {
      switch (method) {
        case 'contains':    return obj.includes(String(args[0] ?? ''));
        case 'startsWith':  return obj.startsWith(String(args[0] ?? ''));
        case 'endsWith':    return obj.endsWith(String(args[0] ?? ''));
        case 'includes':    return obj.includes(String(args[0] ?? ''));
        case 'toLowerCase': return obj.toLowerCase();
        case 'toUpperCase': return obj.toUpperCase();
        case 'trim':        return obj.trim();
        default:
          throw new Error(`[rule-engine/expression-evaluator] Unknown string method '${method}' at position ${pos}`);
      }
    }
    if (Array.isArray(obj)) {
      switch (method) {
        case 'includes': return obj.includes(args[0]);
        case 'indexOf':  return obj.indexOf(args[0]);
        case 'length':   return obj.length;
        default:
          throw new Error(`[rule-engine/expression-evaluator] Unknown array method '${method}' at position ${pos}`);
      }
    }
    throw new Error(`[rule-engine/expression-evaluator] Cannot call method '${method}' on ${typeof obj} at position ${pos}`);
  }

  private parsePrimary(): unknown {
    const tok = this.peek();

    switch (tok.kind) {
      case 'NUMBER':
        this.consume();
        return parseFloat(tok.value);

      case 'STRING':
        this.consume();
        return tok.value;

      case 'BOOL':
        this.consume();
        return tok.value === 'true';

      case 'NULL':
        this.consume();
        return null;

      case 'LPAREN': {
        this.consume(); // consume '('
        const val = this.parseTernary();
        this.expect('RPAREN');
        return val;
      }

      case 'IDENT': {
        // Resolve identifier (may be start of dotted path)
        return this.resolveIdent();
      }

      default:
        throw new Error(
          `[rule-engine/expression-evaluator] Unexpected token '${tok.value}' (${tok.kind}) at position ${tok.pos}`,
        );
    }
  }

  /**
   * Resolve a root identifier — may be a dotted path like globals.score.value
   * or a special prefix like $event, $players.
   */
  private resolveIdent(): unknown {
    const rootTok = this.consume(); // IDENT
    let path = rootTok.value;

    // Collect dotted path segments (but stop at method calls — handled in postfix)
    while (this.peek().kind === 'DOT') {
      // Peek ahead to see if next is IDENT and THEN not LPAREN
      // We need to collect the full path before method calls
      const nextPos = this.pos + 1;
      if (
        nextPos < this.tokens.length &&
        this.tokens[nextPos].kind === 'IDENT' &&
        (nextPos + 1 >= this.tokens.length || this.tokens[nextPos + 1].kind !== 'LPAREN')
      ) {
        this.consume(); // consume '.'
        const part = this.consume(); // IDENT
        path += '.' + part.value;
      } else {
        break;
      }
    }

    return resolveValue(path, this.context);
  }
}

// ---------------------------------------------------------------------------
// Value resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a dotted path against the RuleContext.
 *
 * Supported prefixes:
 *   globals.*          → context.state.globals.*
 *   per_player.*       → context.state.per_player.*
 *   $event.*           → context.event.*
 *   $players.count     → context.players.length
 *   phase.name         → context.phase
 *   round              → context.round
 *
 * For all other paths: traverse context.state using the path.
 */
export function resolveValue(path: string, context: RuleContext): unknown {
  // Special $event prefix
  if (path.startsWith('$event.')) {
    const sub = path.slice('$event.'.length);
    if (!context.event) return undefined;
    if (sub === 'type') return context.event.type;
    if (sub.startsWith('data.') && context.event.data) {
      return getDeep(context.event.data, sub.slice('data.'.length));
    }
    return getDeep(context.event as Record<string, unknown>, sub);
  }

  // $players.count or $players.length
  if (path === '$players.count' || path === '$players.length') {
    return context.players.length;
  }
  if (path === '$players') {
    return context.players;
  }

  // phase.name shorthand
  if (path === 'phase.name' || path === 'phase') {
    return context.phase ?? null;
  }

  // round shorthand
  if (path === 'round') {
    return context.round ?? null;
  }

  // Traverse context.state
  return getDeep(context.state, path);
}

/**
 * Deep-traverse an object using a dotted path.
 * Returns undefined if any segment is missing.
 */
function getDeep(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object' && !Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate an expression string against the given rule context.
 *
 * Uses a safe recursive descent parser — no eval() or new Function().
 *
 * @param expr - Expression string (e.g., "globals.score > 10 && phase.name == 'play'")
 * @param context - RuleContext providing state, event, players, phase, round
 * @returns The evaluated result (boolean, number, string, null, etc.)
 * @throws Error if the expression is malformed
 */
export function evaluateExpression(expr: string, context: RuleContext): unknown {
  const trimmed = expr.trim();
  if (!trimmed) {
    throw new Error('[rule-engine/expression-evaluator] Cannot evaluate empty expression');
  }

  const tokens = tokenize(trimmed);
  const parser = new Parser(tokens, context);
  return parser.parse();
}
