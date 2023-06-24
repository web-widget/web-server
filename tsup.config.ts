import type { Options } from "tsup";
export const tsup: Options = {
  entry: {
    server: "src/server/mod.ts",
    client: "src/client/mod.ts",
  },
  dts: true,
  target: "es2022",
  splitting: false,
  sourcemap: false,
  format: ["esm"],
  outDir: "dist",
  clean: true,
  external: [],
};
