import {
  dirname,
  extname,
  fromFileUrl,
  gte,
  join,
  toFileUrl,
  walk,
} from "./deps";
import { error } from "./error";

const MIN_DENO_VERSION = "1.25.0";

export function ensureMinDenoVersion() {
  // Check that the minimum supported Deno version is being used.
  if (!gte(Deno.version.deno, MIN_DENO_VERSION)) {
    let message =
      `Deno version ${MIN_DENO_VERSION} or higher is required. Please update Deno.\n\n`;

    if (Deno.execPath().includes("homebrew")) {
      message +=
        "You seem to have installed Deno via homebrew. To update, run: `brew upgrade deno`\n";
    } else {
      message += "To update, run: `deno upgrade`\n";
    }

    error(message);
  }
}

interface FileManifest {
  routes: string[];
  islands: string[];
}

export async function collect(directory: string): Promise<FileManifest> {
  const routesDir = join(directory, "./routes");
  const islandsDir = join(directory, "./islands");

  const routes = [];
  try {
    const routesUrl = toFileUrl(routesDir);
    // TODO(lucacasonato): remove the extranious Deno.readDir when
    // https://github.com/denoland/deno_std/issues/1310 is fixed.
    for await (const _ of Deno.readDir(routesDir)) {
      // do nothing
    }
    const routesFolder = walk(routesDir, {
      includeDirs: false,
      includeFiles: true,
      exts: ["tsx", "jsx", "ts", "js"],
    });
    for await (const entry of routesFolder) {
      if (entry.isFile) {
        const file = toFileUrl(entry.path).href.substring(
          routesUrl.href.length,
        );
        routes.push(file);
      }
    }
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      // Do nothing.
    } else {
      throw err;
    }
  }
  routes.sort();

  const islands = [];
  try {
    const islandsUrl = toFileUrl(islandsDir);
    for await (const entry of Deno.readDir(islandsDir)) {
      if (entry.isDirectory) {
        error(
          `Found subdirectory '${entry.name}' in islands/. The islands/ folder must not contain any subdirectories.`,
        );
      }
      if (entry.isFile) {
        const ext = extname(entry.name);
        if (![".tsx", ".jsx", ".ts", ".js"].includes(ext)) continue;
        const path = join(islandsDir, entry.name);
        const file = toFileUrl(path).href.substring(islandsUrl.href.length);
        islands.push(file);
      }
    }
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      // Do nothing.
    } else {
      throw err;
    }
  }
  islands.sort();

  return { routes, islands };
}

/**
 * Sort pages by their relative routing priority, based on the parts in the
 * route matcher
 */
function sortRoutes<T extends { pathname: string }>(routes: T[]) {
  routes.sort((a, b) => {
    const partsA = a.pathname.split("/");
    const partsB = b.pathname.split("/");
    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
      const partA = partsA[i];
      const partB = partsB[i];
      if (partA === undefined) return -1;
      if (partB === undefined) return 1;
      if (partA === partB) continue;
      const priorityA = partA.startsWith(":") ? partA.endsWith("*") ? 0 : 1 : 2;
      const priorityB = partB.startsWith(":") ? partB.endsWith("*") ? 0 : 1 : 2;
      return Math.max(Math.min(priorityB - priorityA, 1), -1);
    }
    return 0;
  });
}

/** Transform a filesystem URL path to a `path-to-regex` style matcher. */
export function pathToPathname(path: string): string {
  const parts = path.split("/");
  if (parts[parts.length - 1] === "index") {
    parts.pop();
  }
  const route = "/" + parts
    .map((part) => {
      if (part.startsWith("[...") && part.endsWith("]")) {
        return `:${part.slice(4, part.length - 1)}*`;
      }
      if (part.startsWith("[") && part.endsWith("]")) {
        return `:${part.slice(1, part.length - 1)}`;
      }
      return part;
    })
    .join("/");
  return route;
}

function toPascalCase(text: string): string {
  return text.replace(
    /(^\w|-\w)/g,
    (substring) => substring.replace(/-/, "").toUpperCase(),
  );
}

function sanitizeIslandName(name: string): string {
  const fileName = name.replace("/", "");
  return toPascalCase(fileName);
}


export async function generate(manifestPath: string, manifest: FileManifest) {
  const routes = [];
  const islands = [];
  const middlewares = [];
  let notFound;
  let error;
  const baseUrl = new URL("./", `file://${manifestPath}`).href;
  for (const filename of manifest.routes) {
    const file = `./routes${filename}`;
    const url = new URL(file, baseUrl).href;
    const path = url.substring(baseUrl.length).substring("routes".length);
    const baseRoute = path.substring(1, path.length - extname(path).length);
    const name = baseRoute.replace("/", "-");
    const isMiddleware = path.endsWith("/_middleware.tsx") ||
      path.endsWith("/_middleware.ts") || path.endsWith("/_middleware.jsx") ||
      path.endsWith("/_middleware.js");
    if (!path.startsWith("/_") && !isMiddleware) {
      const pathname = pathToPathname(baseRoute);
      routes.push({
        file,
        name,
        pathname,
      });
    } else if (isMiddleware) {
      let pathname = pathToPathname(baseRoute.slice(0, -"_middleware".length));
      if (pathname.endsWith("/")) {
        pathname = pathname.slice(0, -1) + "{/*}?";
      }
      middlewares.push({
        file,
        pathname,
      });
    } else if (
      path === "/_404.tsx" || path === "/_404.ts" ||
      path === "/_404.jsx" || path === "/_404.js"
    ) {
      notFound = {
        file,
        name,
        pathname: pathToPathname(baseRoute),
      };
    } else if (
      path === "/_500.tsx" || path === "/_500.ts" ||
      path === "/_500.jsx" || path === "/_500.js"
    ) {
      error = {
        file,
        name,
        pathname: pathToPathname(baseRoute),
      };
    }
  }

  sortRoutes(routes);
  sortRoutes(middlewares);

  for (const filename of manifest.islands) {
    const file = `./islands${filename}`;
    const url = new URL(file, baseUrl).href;
    const path = url.substring(baseUrl.length).substring("islands".length);
    const baseRoute = path.substring(1, path.length - extname(path).length);
    const name = sanitizeIslandName(baseRoute);
    const id = name.toLowerCase();
    islands.push({ id, name, file });
  }

  const removeExtname = (file: string) => file.replace(/\.[^\.]+$/, '');

  const output = `// DO NOT EDIT. This file is generated by @web-widget/web-server.
// This file SHOULD be checked into source version control.
// This file is automatically updated during development when running \`dev.ts\`.

${
  routes.map(({ file }, i) => `import * as $ROUTE${i} from "${removeExtname(file)}";`).join(
    "\n",
  )
}
${
  islands.map(({ file }, i) => `import * as $ISLAND${i} from "${removeExtname(file)}";`).join(
    "\n",
  )
}
${
  middlewares.map(({ file }, i) => `import * as $MIDDLEWARE${i} from "${removeExtname(file)}";`).join(
    "\n",
  )
}
${
  notFound ? `import * as $NOTFOUND from "${removeExtname(notFound.file)}";\n` : ''
}
${
  error ? `import * as $ERROR from "${removeExtname(error.file)}";\n` : ''
}

export const routes = [${routes.map(({ pathname, name, file }, i) => `
  {
    file: ${JSON.stringify(file)},
    name: ${JSON.stringify(name)},
    pathname: ${JSON.stringify(pathname)},
    module: $ROUTE${i},
  },`).join("")}
];

export const islands = [${islands.map(({ id, name, file }, i) => `
  {
    file: ${JSON.stringify(file)},
    id: ${JSON.stringify(id)},
    name: ${JSON.stringify(name)},
    module: $ISLAND${i},
  },`).join("")}
];

export const middlewares = [${middlewares.map(({ pathname, file }, i) => `
  {
    file: ${JSON.stringify(file)},
    pathname: ${JSON.stringify(pathname)},
    module: $MIDDLEWARE${i},
  },`).join("")}
];

${notFound ? `export const notFound = {
  file: ${JSON.stringify(notFound.file)},
  name: ${JSON.stringify(notFound.name)},
  pathname: ${JSON.stringify(notFound.pathname)},
  module: $NOTFOUND,
};` : ``}

${error ? `export const error = {
  file: ${JSON.stringify(error.file)},
  name: ${JSON.stringify(error.name)},
  pathname: ${JSON.stringify(error.pathname)},
  module: $ERROR,
};` : ``}

// export const clientEntryUrl = './entry-client.ts';

export const baseUrl = import.meta.url;
`;

  await Deno.writeTextFile(manifestPath, output);
  console.log(
    `%cThe manifest has been generated for ${routes.length} routes and ${islands.length} islands.`,
    "color: blue; font-weight: bold",
  );
}

export async function dev(base: string, entrypoint: string) {
  ensureMinDenoVersion();

  entrypoint = new URL(entrypoint, base).href;

  const dir = dirname(fromFileUrl(base));

  let currentManifest: FileManifest;
  const prevManifest = Deno.env.get("FRSH_DEV_PREVIOUS_MANIFEST");
  if (prevManifest) {
    currentManifest = JSON.parse(prevManifest);
  } else {
    currentManifest = { islands: [], routes: [] };
  }
  const newManifest = await collect(dir);
  Deno.env.set("FRSH_DEV_PREVIOUS_MANIFEST", JSON.stringify(newManifest));

  const manifestChanged =
    !arraysEqual(newManifest.routes, currentManifest.routes) ||
    !arraysEqual(newManifest.islands, currentManifest.islands);

  if (manifestChanged) await generate(join(dir, "./web-server.gen.ts"), newManifest);

  await import(entrypoint);
}

function arraysEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; ++i) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
