import { unsafeHTML, HTML, HTMLResponse } from '@worker-tools/html';
import { RenderContext, RenderResult, ComponentProps, UnknownComponentProps, ErrorComponentProps } from "./types.js";

export * from "@worker-tools/html";

export const streamToHTML = (stream: ReadableStream) => async function* () {
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

export const unsafeAttributeName = (value: string) => value.replace(/([A-Z])/g, '-$1').toLowerCase();
export const unsafeAttributeValue = (value: string) => value.replace(/"/g, '&quot;');

// function iteratorToStream(iterator) {
//   return new ReadableStream({
//     async pull(controller) {
//       const { value, done } = await iterator.next();
//       if (done) {
//         controller.close();
//       } else {
//         controller.enqueue(value);
//       }
//     },
//   });
// }

export async function render(opts: RenderContext<unknown>): Promise<RenderResult> {

  if (opts.component === undefined) {
    throw new Error("This page does not have a component to render.");
  }

  if (
    typeof opts.component === "function" &&
    opts.component.constructor.name === "AsyncFunction"
  ) {
    throw new Error(
      "Async components are not supported.",
    );
  }

  const props: ComponentProps<any> | UnknownComponentProps | ErrorComponentProps = {
    params: opts.params,
    url: opts.url,
    route: opts.route,
    data: opts.data,
    error: opts.error
  };

  const content: HTML = opts.component(props);
  const res = new HTMLResponse(content);

  return res.body || "";
}