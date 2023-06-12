/// <reference types="urlpattern-polyfill" />

import { Status } from "./http_status.js";
import * as router from "./router.js";
import { Manifest, ServerHandler, ServerConnInfo } from "./types.js";
import { default as DefaultErrorComponent, render as DefaultRender  } from "./default_error_page.js";
import { HTMLResponse } from "./html.js";
import {
  ErrorPage,
  ErrorPageModule,
  WebServerOptions,
  Handler,
  Middleware,
  MiddlewareHandlerContext,
  MiddlewareModule,
  MiddlewareRoute,
  RenderPage,
  Route,
  RouteModule,
  UnknownPage,
  UnknownPageModule,
} from "./types.js";
import { internalRender } from "./render.js";
import { ContentSecurityPolicyDirectives, SELF } from "./csp.js";
interface RouterState {
  state: Record<string, unknown>;
}

export class ServerContext {
  #dev: boolean;
  #routes: Route[];
  #renderPage: RenderPage;
  #middlewares: MiddlewareRoute[];
  #notFound: UnknownPage;
  #error: ErrorPage;

  constructor(
    routes: Route[],
    renderPage: RenderPage,
    middlewares: MiddlewareRoute[],
    notFound: UnknownPage,
    error: ErrorPage,
    dev: boolean,
  ) {
    this.#routes = routes;
    this.#renderPage = renderPage;
    this.#middlewares = middlewares;
    this.#notFound = notFound;
    this.#error = error;
    this.#dev = dev;
  }

  /**
   * Process the manifest into individual components and pages.
   */
  static async fromManifest(
    manifest: Manifest,
    opts: WebServerOptions,
    dev: boolean
  ): Promise<ServerContext> {
    // Extract all routes, and prepare them into the `Page` structure.
    const routes: Route[] = [];
    const middlewares: MiddlewareRoute[] = [];
    let notFound: UnknownPage = DEFAULT_NOT_FOUND;
    let error: ErrorPage = DEFAULT_ERROR;
    for (const { pathname, file, name, module } of manifest.routes) {
      const { default: component, render, config } = module as RouteModule;
      let { handler } = module as RouteModule;
      handler ??= {};
      if (
        component &&
        typeof handler === "object" && handler.GET === undefined
      ) {
        handler.GET = (_req, { render }) => render({});
      }
      if (
        typeof handler === "object" && handler.GET !== undefined &&
        handler.HEAD === undefined
      ) {
        const GET = handler.GET;
        handler.HEAD = async (req, ctx) => {
          const resp = await GET(req, ctx);
          resp.body?.cancel();
          return new Response(null, {
            headers: resp.headers,
            status: resp.status,
            statusText: resp.statusText,
          });
        };
      }
      const route: Route = {
        pathname: config?.routeOverride ? String(config.routeOverride) : pathname,
        name,
        component,
        handler,
        render,
        csp: Boolean(config?.csp ?? false)
      };
      routes.push(route);
    }
    for (const { pathname, module } of manifest.middlewares) {
      middlewares.push({
        pathname,
        compiledPattern: new URLPattern({ pathname }),
        ...module as MiddlewareModule,
      });
    }
    if (manifest.notFound) {
      const { pathname, name, file, module } = manifest.notFound;
      const { default: component, render, config } = module as UnknownPageModule;
      let { handler } = module as UnknownPageModule;
      if (component && handler === undefined) {
        handler = (_req, { render }) => render();
      }

      notFound = {
        pathname,
        name,
        component,
        handler: handler ?? ((req) => router.defaultOtherHandler(req)),
        render,
        csp: Boolean(config?.csp ?? false),
      };
    }
    if (manifest.error) {
      const { pathname, name, file, module } = manifest.error;
      const { default: component, render, config } = module as ErrorPageModule;
      let { handler } = module as ErrorPageModule;
      if (component && handler === undefined) {
        handler = (_req, { render }) => render();
      }

      error = {
        pathname,
        name,
        component,
        handler: handler ??
          ((req, ctx) => router.defaultErrorHandler(req, ctx, ctx.error)),
        render,
        csp: Boolean(config?.csp ?? false),
      };
    }

    return new ServerContext(
      routes,
      opts.render ?? DEFAULT_RENDER_FN,
      middlewares,
      notFound,
      error,
      dev
    );
  }

  /**
   * This functions returns a request handler that handles all routes required
   * by web server.
   */
  handler(): ServerHandler {
    const handlers = this.#handlers();
    const inner = router.router<RouterState>(handlers);
    const withMiddlewares = this.#composeMiddlewares(
      this.#middlewares,
      handlers.errorHandler,
    );
    return async function handler(req: Request, connInfo: ServerConnInfo = {}): Promise<Response> {
      // Redirect requests that end with a trailing slash to their non-trailing
      // slash counterpart.
      // Ex: /about/ -> /about
      const url = new URL(req.url);
      if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
        // Remove trailing slashes
        const path = url.pathname.replace(/\/+$/, "");
        const location = `${path}${url.search}`;
        return new Response(null, {
          status: Status.TemporaryRedirect,
          headers: { location },
        });
      }

      return await withMiddlewares(req, connInfo, inner);
    };
  }

  /**
   * Identify which middlewares should be applied for a request,
   * chain them and return a handler response
   */
  #composeMiddlewares(
    middlewares: MiddlewareRoute[],
    errorHandler: router.ErrorHandler<RouterState>,
  ) {
    return (
      req: Request,
      connInfo: ServerConnInfo,
      inner: router.FinalHandler<RouterState>,
    ) => {
      // identify middlewares to apply, if any.
      // middlewares should be already sorted from deepest to shallow layer
      const mws = selectMiddlewares(req.url, middlewares);

      const handlers: (() => Response | Promise<Response>)[] = [];

      const middlewareCtx: MiddlewareHandlerContext = {
        next() {
          const handler = handlers.shift()!;
          return Promise.resolve(handler());
        },
        ...connInfo,
        state: {},
        destination: "route",
      };

      for (const mw of mws) {
        if (mw.handler instanceof Array) {
          for (const handler of mw.handler) {
            handlers.push(() => handler(req, middlewareCtx));
          }
        } else {
          const handler = mw.handler;
          handlers.push(() => handler(req, middlewareCtx));
        }
      }

      const ctx = {
        ...connInfo,
        state: middlewareCtx.state,
      };
      const { destination, handler } = inner(
        req,
        ctx,
      );
      handlers.push(handler);
      middlewareCtx.destination = destination;
      return middlewareCtx.next().catch((e) => errorHandler(req, ctx, e));
    };
  }

  /**
   * This function returns all routes required by web server as an extended
   * path-to-regex, to handler mapping.
   */
  #handlers(): {
    internalRoutes: router.Routes<RouterState>;
    routes: router.Routes<RouterState>;

    otherHandler: router.Handler<RouterState>;
    errorHandler: router.ErrorHandler<RouterState>;
  } {
    const internalRoutes: router.Routes<RouterState> = {};
    const routes: router.Routes<RouterState> = {};

    const genRender = <Data = undefined>(
      route: Route<Data> | UnknownPage | ErrorPage,
      status: number,
    ) => {
      const imports: string[] = [];
      return (
        req: Request,
        params: Record<string, string>,
        error?: unknown,
      ) => {
        return async ({ data }: { data?: any } = {}, options?: ResponseInit) => {
          // const preloads: string[] = [];

          const resp = await internalRender({
            route,
            imports,
            url: new URL(req.url),
            params,
            data,
            error,
          }, this.#renderPage);

          const headers: Record<string, string> = {
            "content-type": "text/html; charset=utf-8",
          };

          const [body, csp] = resp;
          if (csp) {
            if (this.#dev) {
              csp.directives.connectSrc = [
                ...(csp.directives.connectSrc ?? []),
                SELF,
              ];
            }
            const directive = serializeCSPDirectives(csp.directives);
            if (csp.reportOnly) {
              headers["content-security-policy-report-only"] = directive;
            } else {
              headers["content-security-policy"] = directive;
            }
          }
          // return new Response(body, { status, headers });
          return new HTMLResponse(body, {
            status: options?.status ?? status,
            statusText: options?.statusText,
            headers: options?.headers
              ? { ...headers, ...options.headers }
              : headers,
          });
        };
      };
    };

    const createUnknownRender = genRender(this.#notFound, Status.NotFound);

    for (const route of this.#routes) {
      const createRender = genRender(route, Status.OK);
      if (typeof route.handler === "function") {
        routes[route.pathname] = {
          default: (req, ctx, params) =>
            (route.handler as Handler)(req, {
              ...ctx,
              params,
              render: createRender(req, params),
              renderNotFound: createUnknownRender(req, {}),
            }),
        };
      } else {
        routes[route.pathname] = {};
        for (const [method, handler] of Object.entries(route.handler)) {
          routes[route.pathname][method as router.KnownMethod] = (
            req,
            ctx,
            params,
          ) =>
            handler(req, {
              ...ctx,
              params,
              render: createRender(req, params),
              renderNotFound: createUnknownRender(req, {}),
            });
        }
      }
    }

    const otherHandler: router.Handler<RouterState> = (
      req,
      ctx,
    ) =>
      this.#notFound.handler(
        req,
        {
          ...ctx,
          render: createUnknownRender(req, {}),
        },
      );

    const errorHandlerRender = genRender(
      this.#error,
      Status.InternalServerError,
    );
    const errorHandler: router.ErrorHandler<RouterState> = (
      req,
      ctx,
      error,
    ) => {
      console.error(
        "%cAn error occurred during route handling or page rendering.",
        "color:red",
        error,
      );
      return this.#error.handler(
        req,
        {
          ...ctx,
          error,
          render: errorHandlerRender(req, {}, error),
        },
      );
    };

    return { internalRoutes, routes, otherHandler, errorHandler };
  }
}

const DEFAULT_RENDER_FN: RenderPage = async (_ctx, render) => {
  await render();
};

const DEFAULT_NOT_FOUND: UnknownPage = {
  pathname: "",
  name: "_404",
  handler: (req) => router.defaultOtherHandler(req),
  render: DefaultRender,
  csp: false,
};

const DEFAULT_ERROR: ErrorPage = {
  pathname: "",
  name: "_500",
  component: DefaultErrorComponent,
  render: DefaultRender,
  handler: (_req, ctx) => ctx.render(),
  csp: false,
};

/**
 * Return a list of middlewares that needs to be applied for request url
 * @param url the request url
 * @param middlewares Array of middlewares handlers and their routes as path-to-regexp style
 */
export function selectMiddlewares(url: string, middlewares: MiddlewareRoute[]) {
  const selectedMws: Middleware[] = [];
  const reqURL = new URL(url);

  for (const { compiledPattern, handler } of middlewares) {
    const res = compiledPattern.exec(reqURL);
    if (res) {
      selectedMws.push({ handler });
    }
  }

  return selectedMws;
}

function serializeCSPDirectives(csp: ContentSecurityPolicyDirectives): string {
  return Object.entries(csp)
    .filter(([_key, value]) => value !== undefined)
    .map(([k, v]: [string, string | string[]]) => {
      // Turn camel case into snake case.
      const key = k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
      const value = Array.isArray(v) ? v.join(" ") : v;
      return `${key} ${value}`;
    })
    .join("; ");
}
