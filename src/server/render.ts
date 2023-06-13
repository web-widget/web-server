import { HTML } from "./html.js";
import { template, TemplateOptions } from "./layout.js";
import type {
  ErrorPage,
  RenderPage,
  Route,
  UnknownPage,
  RenderResult,
  RenderContext,
} from "./types";
import { nonce, NONE, UNSAFE_INLINE, ContentSecurityPolicy } from "./csp.js";

export interface InnerRenderOptions<Data> {
  route: Route<Data> | UnknownPage | ErrorPage;
  imports: string[];
  url: URL;
  params: Record<string, string>;
  data?: Data;
  error?: unknown;
  lang?: string;
}

export type InnerRenderFunction = () => Promise<RenderResult>;

export class InnerRenderContext {
  #id: string;
  #state: Map<string, unknown> = new Map();
  #styles: string[] = [];
  #url: URL;
  #route: string;
  #lang: string;

  constructor(id: string, url: URL, route: string, lang: string) {
    this.#id = id;
    this.#url = url;
    this.#route = route;
    this.#lang = lang;
  }

  /** A unique ID for this logical JIT render. */
  get id(): string {
    return this.#id;
  }

  /**
   * State that is persisted between multiple renders with the same render
   * context. This is useful because one logical JIT render could have multiple
   * preact render passes due to suspense.
   */
  get state(): Map<string, unknown> {
    return this.#state;
  }

  /**
   * All of the CSS style rules that should be inlined into the document.
   * Adding to this list across multiple renders is supported (even across
   * suspense!). The CSS rules will always be inserted on the client in the
   * order specified here.
   */
  get styles(): string[] {
    return this.#styles;
  }

  /** The URL of the page being rendered. */
  get url(): URL {
    return this.#url;
  }

  /** The route matcher (e.g. /blog/:id) that the request matched for this page
   * to be rendered. */
  get route(): string {
    return this.#route;
  }

  /** The language of the page being rendered. Defaults to "en". */
  get lang(): string {
    return this.#lang;
  }
  set lang(lang: string) {
    this.#lang = lang;
  }
}

function defaultCsp() {
  return {
    directives: { defaultSrc: [NONE], styleSrc: [UNSAFE_INLINE] },
    reportOnly: false,
  };
}

/**
 * This function renders out a page. Rendering is synchronous and non streaming.
 * Suspense boundaries are not supported.
 */
export async function internalRender<Data>(
  opts: InnerRenderOptions<Data>,
  renderPage: RenderPage
): Promise<[HTML, ContentSecurityPolicy | undefined]> {
  const csp: ContentSecurityPolicy | undefined = opts.route.csp
    ? defaultCsp()
    : undefined;

  const ctx = new InnerRenderContext(
    crypto.randomUUID(),
    opts.url,
    opts.route.pathname,
    opts.lang ?? "en",
  );

  if (csp) {
    // Clear the csp
    const newCsp = defaultCsp();
    csp.directives = newCsp.directives;
    csp.reportOnly = newCsp.reportOnly;
  }

  let outlet: RenderResult | null = null;
  await renderPage(ctx, async () => {
    const renderContext: RenderContext<any> = {
      url: opts.url,
      route: opts.route.pathname,
      params: opts.params,
      data: opts.data,
      component: opts.route.component,
      error: opts.error,
    };
    outlet = await opts.route.render(renderContext);
    return outlet;
  });

  if (!outlet) {
    throw new Error(
      `The 'render' function was not called by route's render hook.`,
    );
  }

  const moduleScripts: [string, string][] = [];

  for (const url of opts.imports) {
    const randomNonce = crypto.randomUUID().replace(/-/g, "");
    if (csp) {
      csp.directives.scriptSrc = [
        ...csp.directives.scriptSrc ?? [],
        nonce(randomNonce),
      ];
    }
    moduleScripts.push([url, randomNonce]);
  }
  const html = template({
    outlet,
    // TODO
    clientEntry: "",
    // TODO
    meta: [],
    // TODO
    esModulePolyfillUrl: "",
    // TODO
    importmap: {},
    // TODO
    moduleScripts,
    lang: ctx.lang,
  });

  return [html, csp];
}

