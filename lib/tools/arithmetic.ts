/** Bounded recursive descent; accepts arithmetic only, never executable code. */
export function evaluateArithmetic(expression: string): number {
  if (expression.length > 500) throw new Error('Expression is too long.');
  const tokens: string[] = [];
  const pattern = /\s*(\d+(?:\.\d*)?|\.\d+|[+\-*/()%\^])/y;
  let position = 0;
  while (position < expression.length) {
    if (!expression.slice(position).trim()) break;
    pattern.lastIndex = position;
    const match = pattern.exec(expression);
    if (!match) throw new Error('Only valid arithmetic is allowed.');
    tokens.push(match[1]);
    position = pattern.lastIndex;
  }
  let index = 0;
  const peek = () => tokens[index];
  function atom(): number {
    const token = tokens[index++];
    if (token === '(') {
      const value = sum();
      if (tokens[index++] !== ')') throw new Error('Mismatched parentheses.');
      return value;
    }
    if (!token || !/^(?:\d|\.)/.test(token)) throw new Error('Expected a number.');
    return Number(token);
  }
  function power(): number {
    const left = atom();
    if (peek() !== '^') return left;
    index++;
    return left ** unary();
  }
  function unary(): number {
    if (peek() === '+' || peek() === '-') {
      const sign = tokens[index++];
      return (sign === '-' ? -1 : 1) * unary();
    }
    return power();
  }
  function product(): number {
    let value = unary();
    while (['*', '/', '%'].includes(peek())) {
      const op = tokens[index++];
      const right = unary();
      value = op === '*' ? value * right : op === '/' ? value / right : value % right;
    }
    return value;
  }
  function sum(): number {
    let value = product();
    while (peek() === '+' || peek() === '-') {
      const op = tokens[index++];
      const right = product();
      value = op === '+' ? value + right : value - right;
    }
    return value;
  }
  const result = sum();
  if (index !== tokens.length) throw new Error('Invalid expression.');
  if (!Number.isFinite(result)) throw new Error('Result is not finite.');
  return result;
}
