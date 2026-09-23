export function plural(count: number, forms: [string, string, string]) {
  const lastTwo = Math.abs(count) % 100, last = lastTwo % 10;
  return forms[lastTwo >= 11 && lastTwo <= 14 ? 2 : last === 1 ? 0 : last >= 2 && last <= 4 ? 1 : 2];
}
