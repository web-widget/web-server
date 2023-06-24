import { unsafeHTML, fallback, html, HTML, Fallback } from "@worker-tools/html";
import {
  asyncIterToStream,
  streamToAsyncIter,
} from "whatwg-stream-to-async-iter";
import {
  RenderContext,
  RenderResult,
  ComponentProps,
  UnknownComponentProps,
  ErrorComponentProps,
} from "./types.js";

export { unsafeHTML, fallback, html, HTML, Fallback };

export const streamToHTML = (stream: ReadableStream<string>) =>
  async function* () {
    // TODO 这样处理流是否正确？
    // @ts-ignore
    for await (const part of stream) {
      yield unsafeHTML(new TextDecoder().decode(part));
    }
  };

// This utility is based on https://github.com/zertosh/htmlescape
// License: https://github.com/zertosh/htmlescape/blob/0527ca7156a524d256101bb310a9f970f63078ad/LICENSE

const ESCAPE_LOOKUP: { [match: string]: string } = {
  ">": "\\u003e",
  "<": "\\u003c",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029",
};

const ESCAPE_REGEX = /[><\u2028\u2029]/g;

export function htmlEscapeJsonString(str: string): string {
  return str.replace(ESCAPE_REGEX, (match) => ESCAPE_LOOKUP[match]);
}

export const unsafeAttributeName = (value: string) =>
  value.replace(/([A-Z])/g, "-$1").toLowerCase();
export const unsafeAttributeValue = (value: string) =>
  value.replace(/"/g, "&quot;");

type ForAwaitable<T> = Iterable<T> | AsyncIterable<T>;
type Awaitable<T> = T | Promise<T>;

async function* aMap<A, B>(
  iterable: ForAwaitable<A>,
  f: (a: A) => Awaitable<B>
): AsyncIterableIterator<B> {
  for await (const x of iterable) yield f(x);
}

const maybeAsyncIterToStream = <T>(x: ForAwaitable<T> | ReadableStream<T>) =>
  x instanceof ReadableStream ? x : asyncIterToStream(x);

const maybeStreamToAsyncIter = <T>(x: ForAwaitable<T> | ReadableStream<T>) =>
  x instanceof ReadableStream ? streamToAsyncIter(x) : x;

const supportNonBinaryTransformStreams = async () => {
  try {
    await maybeAsyncIterToStream(html`<test />`);
    return true;
  } catch (e) {
    return false;
  }
};

export const stringStreamToByteStream: (
  body: HTML
) => ReadableStream<Uint8Array> = (await supportNonBinaryTransformStreams())
  ? (body) => {
      const encoder = new TextEncoder();
      return asyncIterToStream(
        aMap(maybeStreamToAsyncIter(body), (x: string) => encoder.encode(x))
      );
    }
  : (body) => maybeAsyncIterToStream(body).pipeThrough(new TextEncoderStream());

export async function render(
  opts: RenderContext<unknown>
): Promise<RenderResult> {
  if (opts.component === undefined) {
    throw new Error("This page does not have a component to render.");
  }

  if (
    typeof opts.component === "function" &&
    opts.component.constructor.name === "AsyncFunction"
  ) {
    throw new Error("Async components are not supported.");
  }

  if (Reflect.has(opts, "container") || Reflect.has(opts, "recovering")) {
    throw new Error("Client rendering is not supported.");
  }

  const isIsland = !opts.url;
  const props = isIsland
    ? opts.data
    : ({
        params: opts.params,
        url: opts.url,
        route: opts.route,
        data: opts.data,
        error: opts.error,
      } as ComponentProps<any> | UnknownComponentProps | ErrorComponentProps);

  return stringStreamToByteStream(opts.component(props));
}
