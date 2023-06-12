
import { HTML, HTMLResponse } from "../../server/html.js";
import { RenderContext, RenderResult, ComponentProps, UnknownComponentProps, ErrorComponentProps } from "../../server/types.js";

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