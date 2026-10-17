// Erasable stand-in for a TypeScript `enum` (the app compiles with
// `erasableSyntaxOnly`). Declare the values as an `as const` object and pair it
// with a same-named type:
//
//   export const Color = { Red: 1, Blue: 2 } as const;
//   export type Color = Enum<typeof Color>; // 1 | 2
export type Enum<T extends Record<string, unknown>> = T[keyof T];
