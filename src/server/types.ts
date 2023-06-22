/// <reference types="urlpattern-polyfill" />

import * as router from "./router.js";
import { InnerRenderFunction, InnerRenderContext } from "./render.js";

// --- APPLICATION CONFIGURATION ---

export type StartOptions = WebServerOptions & {
  dev?: boolean
};

export interface WebServerOptions {
  render?: RenderPage;
}

export type RenderPage = (
  ctx: InnerRenderContext,
  render: InnerRenderFunction,
) => void | Promise<void>;

/// --- ROUTES ---

export interface ComponentProps<Data> {
  /** The URL of the request that resulted in this page being rendered. */
  url: URL;

  /** The route matcher (e.g. /blog/:id) that the request matched for this page
   * to be rendered. */
  route: string;

  /**
   * The parameters that were matched from the route.
   *
   * For the `/foo/:bar` route with url `/foo/123`, `params` would be
   * `{ bar: '123' }`. For a route with no matchers, `params` would be `{}`. For
   * a wildcard route, like `/foo/:path*` with url `/foo/bar/baz`, `params` would
   * be `{ path: 'bar/baz' }`.
   */
  params: Record<string, string>;

  /**
   * Additional data passed into `HandlerContext.render`. Defaults to
   * `undefined`.
   */
  data: Data;
}

export interface RouteConfig {
  /**
   * A route override for the page. This is useful for pages where the route
   * can not be expressed through the filesystem routing capabilities.
   *
   * The route override must be a path-to-regexp compatible route matcher.
   */
  routeOverride?: string;

  /**
   * If Content-Security-Policy should be enabled for this page.
   */
  csp?: boolean;
}

export interface HandlerContext<Data = unknown, State = Record<string, unknown>>
  extends ServerConnInfo {
  params: Record<string, string>;
  render: ({ data }: { data?: Data; }) => Response | Promise<Response>;
  renderNotFound: () => Response | Promise<Response>;
  state: State;
}

export type Handler<Data = any, State = Record<string, unknown>> = (
  req: Request,
  ctx: HandlerContext<Data, State>,
) => Response | Promise<Response>;

export type Handlers<Data = any, State = Record<string, unknown>> = {
  [K in router.KnownMethod]?: Handler<Data, State>;
}

export interface RouteRenderContext<Data = any> {
  /** The URL of the request that resulted in this page being rendered. */
  url: URL;

  /** The route matcher (e.g. /blog/:id) that the request matched for this page
   * to be rendered. */
  route: string;

  /**
   * The parameters that were matched from the route.
   *
   * For the `/foo/:bar` route with url `/foo/123`, `params` would be
   * `{ bar: '123' }`. For a route with no matchers, `params` would be `{}`. For
   * a wildcard route, like `/foo/:path*` with url `/foo/bar/baz`, `params` would
   * be `{ path: 'bar/baz' }`.
   */
  params: Record<string, string>;

  /**
   * Additional data passed into `HandlerContext.render`. Defaults to
   * `undefined`.
   */
  data: Data;

  /**
   * The error that caused the error page to be loaded.
   */
  error: unknown;

  /**
   * This is a component of the UI framework.
   */
  component?: any;
}

export interface IslandRenderContext<Data = any> {
  /**
   * Props of a component.
   */
  data: Data;

  /**
   * The error that caused the error page to be loaded.
   */
  error: unknown;

  /**
   * This is a component of the UI framework.
   */
  component?: any;

  /**
   * This is a render container element that exists only on the client side.
   */
  container?: Element;

  /**
   * This is the flag for client hydration mode.
   */
  recovering?: boolean;
}

export interface RenderContext<Data = any> extends RouteRenderContext<Data>, IslandRenderContext<Data> {};

export type Render<Data = unknown> = (renderContext: RenderContext<Data>) => Promise<RenderResult>;

export type RenderResult = string | ReadableStream | void;

export interface RouteModule {
  default?: any;
  handler?: Handler<unknown> | Handlers<unknown>;
  render: Render<unknown>;
  config?: RouteConfig;
}

export interface Route<Data = any> {
  pathname: string;
  name: string;
  component?: any;
  handler: Handler<Data> | Handlers<Data>;
  render: Render<Data>;
  csp: boolean;
}

export type Meta =
  | { charSet: "utf-8" }
  | { title: string }
  | { name: string; content: string }
  | { property: string; content: string }
  | { httpEquiv: string; content: string }
  | { "script:ld+json": LdJsonObject }
  | { tagName: "meta" | "link"; [name: string]: string }
  | { [name: string]: unknown };

type LdJsonObject = { [Key in string]: LdJsonValue } & {
  [Key in string]?: LdJsonValue | undefined;
};
type LdJsonArray = LdJsonValue[] | readonly LdJsonValue[]
type LdJsonPrimitive = string | number | boolean | null
type LdJsonValue = LdJsonPrimitive | LdJsonObject | LdJsonArray

// --- UNKNOWN PAGE ---

export interface UnknownComponentProps {
  /** The URL of the request that resulted in this page being rendered. */
  url: URL;

  /** The route matcher (e.g. /blog/:id) that the request matched for this page
   * to be rendered. */
  route: string;
}

export interface UnknownHandlerContext<State = Record<string, unknown>>
  extends ServerConnInfo {
  render: () => Response | Promise<Response>;
  state: State;
}

export type UnknownHandler = (
  req: Request,
  ctx: UnknownHandlerContext,
) => Response | Promise<Response>;

export interface UnknownPageModule {
  default?: any;
  handler?: UnknownHandler;
  render: Render;
  config?: RouteConfig;
}

export interface UnknownPage {
  pathname: string;
  name: string;
  component?: any;
  handler: UnknownHandler;
  render: Render;
  csp: boolean;
}

// --- ERROR PAGE ---

export interface ErrorComponentProps {
  /** The URL of the request that resulted in this page being rendered. */
  url: URL;

  /** The route matcher (e.g. /blog/:id) that the request matched for this page
   * to be rendered. */
  pathname: string;

  /** The error that caused the error page to be loaded. */
  error: unknown;
}

export interface ErrorHandlerContext<State = Record<string, unknown>>
  extends ServerConnInfo {
  error: unknown;
  render: () => Response | Promise<Response>;
  state: State;
}
export type ErrorHandler = (
  req: Request,
  ctx: ErrorHandlerContext,
) => Response | Promise<Response>;

export interface ErrorPageModule {
  default?: any;
  handler?: ErrorHandler;
  render: Render;
  config?: RouteConfig;
}

export interface ErrorPage {
  pathname: string;
  name: string;
  component?: any;
  handler: ErrorHandler;
  render: Render;
  csp: boolean;
}

// --- MIDDLEWARES ---

export interface MiddlewareHandlerContext<State = Record<string, unknown>>
  extends ServerConnInfo {
  next: () => Promise<Response>;
  state: State;
  destination: router.DestinationKind;
}

export interface MiddlewareRoute extends Middleware {
  /**
   * path-to-regexp style url path
   */
  pathname: string;
  /**
   * URLPattern of the route
   */
  compiledPattern: URLPattern;
}

export type MiddlewareHandler<State = Record<string, unknown>> = (
  req: Request,
  ctx: MiddlewareHandlerContext<State>,
) => Response | Promise<Response>;

export interface MiddlewareModule<State = any> {
  handler: MiddlewareHandler<State> | MiddlewareHandler<State>[];
}

export interface Middleware<State = Record<string, unknown>> {
  handler: MiddlewareHandler<State> | MiddlewareHandler<State>[];
}

// --- MANIFEST ---

export interface Manifest {
  routes: {
    file: string;
    name: string;
    pathname: string;
    module: RouteModule;
  }[];
  middlewares: {
    file: string;
    pathname: string;
    module: MiddlewareModule;
  }[];
  notFound?: {
    file: string;
    name: string;
    pathname: string;
    module: UnknownPageModule;
  };
  error?: {
    file: string;
    name: string;
    pathname: string;
    module: ErrorPageModule;
  };
}

// --- SERVERS ---

/**
 * A handler for HTTP requests. Consumes a request and connection information
 * and returns a response.
 *
 * If a handler throws, the server calling the handler will assume the impact
 * of the error is isolated to the individual request. It will catch the error
 * and close the underlying connection.
 * @see https://deno.land/std@0.178.0/http/server.ts?s=Handler
 */
export type ServerHandler = (
  request: Request,
  connInfo?: ServerConnInfo,
 ) => Response | Promise<Response>;

/**
 * Information about the connection a request arrived on.
 * @see https://deno.land/std@0.178.0/http/server.ts?s=ConnInfo
 */
export interface ServerConnInfo {
  /** The local address of the connection. */
  readonly localAddr?: unknown;
  /** The remote address of the connection. */
  readonly remoteAddr?: unknown;
}