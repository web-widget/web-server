import { ServerContext } from "./context";
export { Status } from "./status";
import type { StartOptions, Manifest, ServerHandler } from "./types";
export type * from "./types";

export type Router = {
  handler: ServerHandler;
  handleEvent: (event: FetchEvent) => void;
};

export default function router(
  manifest: Manifest,
  opts: StartOptions = {}
): Router {
  const ctx = ServerContext.fromManifest(manifest, opts, !!opts.dev);
  const handler = ctx.handler();
  return {
    handler,
    /**
     * Implements the (ancient) event listener object interface to allow passing to fetch event directly,
     * e.g. `self.addEventListener('fetch', router(manifest))`.
     */
    handleEvent(event: FetchEvent) {
      event.respondWith(handler(event.request, {}));
    },
  };
}
