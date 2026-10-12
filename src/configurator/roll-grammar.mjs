/* Safe dice grammar. A Roll formula is parsed and validated here before it is
   ever handed to Foundry: only numbers, dice terms with whitelisted modifiers,
   @data references, the four arithmetic operators, parentheses and a few math
   functions are accepted. Anything else (flavor text, arbitrary identifiers,
   quotes, brackets, statements) is rejected with the offending position.

   formula   := sum
   sum       := product (("+" | "-") product)*
   product   := unary (("*" | "/") unary)*
   unary     := ("+" | "-")? primary
   primary   := dice | number | reference | call | pool | "(" sum ")"
   dice      := count? "d" faces modifier* label?
   pool      := "{" sum ("," sum)* "}" poolModifier*      (the best of several dice: {1d8x,1d6x}kh)
   poolModifier := ("kh" | "kl" | "k" | "dh" | "dl" | "cs" | "cf") (comparator? integer)?
   label     := "[" identifier "]"                       (a named group of dice: 2d10[hunger])
   count     := integer | "(" sum ")" | reference
   faces     := integer | "%" | "F" | "(" sum ")" | reference
   modifier  := ("kh" | "kl" | "k" | "dh" | "dl" | "d" | "rr" | "r" | "xo" | "x"
                 | "cs" | "cf" | "min" | "max") (comparator? integer)?
   call      := ("floor" | "ceil" | "round" | "abs" | "min" | "max") "(" sum ("," sum)* ")"
   reference := "@" identifier ("." identifier)*                                  */

export const ROLL_FORMULA_MAX_LENGTH = 256;
export const ROLL_MAX_DICE = 1000;
export const ROLL_MAX_FACES = 10000;
export const ROLL_FUNCTIONS = Object.freeze(["floor", "ceil", "round", "abs", "min", "max"]);
export const ROLL_MODIFIERS = Object.freeze(["kh", "kl", "k", "dh", "dl", "d", "rr", "r", "xo", "x", "cs", "cf", "min", "max"]);

const MODIFIER_PATTERN = new RegExp(`^(?:${[...ROLL_MODIFIERS].sort((a, b) => b.length - a.length).join("|")})`);
const COMPARATOR_PATTERN = /^(?:<=|>=|=|<|>)/;
const INTEGER_PATTERN = /^\d+/;
const NUMBER_PATTERN = /^(?:\d+(?:\.\d+)?|\.\d+)/;
const REFERENCE_PATTERN = /^@[A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z_][A-Za-z0-9_-]*)*/;
const LABEL_PATTERN = /^\[[A-Za-z][A-Za-z0-9_-]*\]/;
export const ROLL_POOL_MODIFIERS = Object.freeze(["kh", "kl", "k", "dh", "dl", "cs", "cf"]);
const POOL_MODIFIER_PATTERN = new RegExp(`^(?:${[...ROLL_POOL_MODIFIERS].sort((a, b) => b.length - a.length).join("|")})`);
const FUNCTION_PATTERN = new RegExp(`^(?:${ROLL_FUNCTIONS.join("|")})(?=\\s*\\()`);

function rollError(message, formula, position) {
  const error = new Error(`Invalid Roll formula at ${position + 1}: ${message} (${formula}).`);
  error.code = "ROLL_FORMULA_INVALID";
  error.position = position;
  return error;
}

class RollParser {
  constructor(formula) { this.formula = formula; this.position = 0; this.references = new Set(); this.diceTerms = 0; this.dicePositions = []; this.groups = new Set(); }
  rest() { return this.formula.slice(this.position); }
  skipSpaces() { while (this.formula[this.position] === " ") this.position++; }
  match(pattern) {
    const found = this.rest().match(pattern);
    if (!found) return null;
    this.position += found[0].length;
    return found[0];
  }
  accept(char) { this.skipSpaces(); if (this.formula[this.position] !== char) return false; this.position++; return true; }
  expect(char) { if (!this.accept(char)) throw rollError(`expected "${char}"`, this.formula, this.position); }
  parse() {
    this.sum();
    this.skipSpaces();
    if (this.position < this.formula.length) throw rollError(`unexpected "${this.formula[this.position]}"`, this.formula, this.position);
  }
  sum() { this.product(); while (this.accept("+") || this.accept("-")) this.product(); }
  product() { this.unary(); while (this.accept("*") || this.accept("/")) this.unary(); }
  unary() { if (!this.accept("+")) this.accept("-"); this.primary(); }
  primary() {
    this.skipSpaces();
    const start = this.position;
    const fn = this.match(FUNCTION_PATTERN);
    if (fn) {
      this.expect("(");
      this.sum();
      while (this.accept(",")) this.sum();
      this.expect(")");
      return;
    }
    if (this.accept("(")) {
      this.sum();
      this.expect(")");
      return this.diceTail(start, null);
    }
    if (this.accept("{")) {
      this.sum();
      while (this.accept(",")) this.sum();
      this.expect("}");
      while (this.match(POOL_MODIFIER_PATTERN)) {
        const comparator = this.match(COMPARATOR_PATTERN);
        if (this.match(INTEGER_PATTERN) === null && comparator) throw rollError("modifier value expected", this.formula, this.position);
      }
      if (/^[A-Za-z]/.test(this.rest())) throw rollError(`unknown group modifier "${this.rest().match(/^[A-Za-z]+/)[0]}"`, this.formula, this.position);
      return;
    }
    const reference = this.match(REFERENCE_PATTERN);
    if (reference) { this.references.add(reference.slice(1)); return this.diceTail(start, null); }
    if (/^d/.test(this.rest())) return this.dice(start, 1);
    const number = this.match(NUMBER_PATTERN);
    if (number !== null) return this.diceTail(start, number.includes(".") ? null : Number(number), number.includes("."));
    throw rollError(this.position < this.formula.length ? `unexpected "${this.formula[this.position]}"` : "unexpected end", this.formula, this.position);
  }
  /** A count (number, reference or parenthesis) may be followed by a dice term. */
  diceTail(start, count, decimal = false) {
    if (this.formula[this.position] !== "d") return;
    if (decimal) throw rollError("dice count must be an integer", this.formula, start);
    this.dice(start, count);
  }
  dice(start, count) {
    this.dicePositions.push({start, d: this.position, count});
    this.position++; // "d"
    if (count !== null && (count < 1 || count > ROLL_MAX_DICE)) throw rollError(`dice count must be between 1 and ${ROLL_MAX_DICE}`, this.formula, start);
    if (this.formula[this.position] === "%" || this.formula[this.position] === "F") this.position++;
    else if (this.formula[this.position] === "(") { this.position++; this.sum(); this.expect(")"); }
    else if (this.match(REFERENCE_PATTERN)) { /* faces from data */ }
    else {
      const faces = this.match(INTEGER_PATTERN);
      if (faces === null) throw rollError("dice faces expected", this.formula, this.position);
      if (Number(faces) < 1 || Number(faces) > ROLL_MAX_FACES) throw rollError(`dice faces must be between 1 and ${ROLL_MAX_FACES}`, this.formula, this.position - faces.length);
    }
    while (this.match(MODIFIER_PATTERN)) {
      const comparator = this.match(COMPARATOR_PATTERN);
      const value = this.match(INTEGER_PATTERN);
      if (comparator && value === null) throw rollError("modifier value expected", this.formula, this.position);
    }
    if (/^[A-Za-z]/.test(this.rest())) throw rollError(`unknown dice modifier "${this.rest().match(/^[A-Za-z]+/)[0]}"`, this.formula, this.position);
    const label = this.match(LABEL_PATTERN);
    if (label) this.groups.add(label.slice(1, -1));
    else if (this.formula[this.position] === "[") throw rollError("a dice group name is letters, digits, - or _", this.formula, this.position);
    this.diceTerms++;
  }
}

/** Parse a Roll formula; returns its @data references or throws ROLL_FORMULA_INVALID. */
export function parseRollFormula(formula) {
  if (typeof formula !== "string" || !formula.trim()) throw rollError("formula is empty", String(formula ?? ""), 0);
  if (formula.length > ROLL_FORMULA_MAX_LENGTH) throw rollError(`formula longer than ${ROLL_FORMULA_MAX_LENGTH} characters`, formula.slice(0, 40), ROLL_FORMULA_MAX_LENGTH);
  const parser = new RollParser(formula.trim());
  parser.parse();
  return {formula: formula.trim(), references: [...parser.references], diceTerms: parser.diceTerms, groups: [...parser.groups]};
}

export function assertSafeRollFormula(formula) { return parseRollFormula(formula); }

/** The same formula with every dice count multiplied (a critical hit doubling its dice: 1d8+2 -> 2d8+2).
 * Only literal counts can be multiplied; a count computed from data or parentheses is refused. */
export function multiplyDice(formula, multiplier) {
  const factor = Number(multiplier);
  if (!Number.isInteger(factor) || factor < 1) throw new Error(`Dice multiplier must be a positive integer, not ${multiplier}.`);
  parseRollFormula(formula);
  const parser = new RollParser(formula.trim());
  parser.parse();
  let text = formula.trim();
  if (factor === 1) return text;
  for (const {start, d, count} of [...parser.dicePositions].reverse()) {
    if (count === null) throw new Error(`Cannot multiply the dice of ${text}: a dice count is computed.`);
    text = `${text.slice(0, start)}${count * factor}${text.slice(d)}`;
  }
  parseRollFormula(text);
  return text;
}

/** Replace the @data references a formula names by their values (a weapon's "@content.damage" becomes "1d8"),
 * so the dice can be multiplied; unknown references stay for Foundry. The result is parsed again. */
export function resolveRollData(formula, data = {}) {
  const text = String(formula ?? "").trim().replace(/@([A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z_][A-Za-z0-9_-]*)*)/g, (whole, path) => {
    let value = data;
    for (const part of path.split(".")) value = value?.[part];
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    if (typeof value === "string" && value.trim()) return `(${value.trim()})`.replace(/^\((\d*d\d+)\)$/, "$1");
    return whole;
  });
  parseRollFormula(text);
  return text;
}
