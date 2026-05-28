let counter = 0;

export function testId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter.toString().padStart(4, "0")}`;
}

export function resetTestIds(): void {
  counter = 0;
}
