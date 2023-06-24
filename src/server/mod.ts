import { ServerContext } from "./context";
export { Status } from "./status";
import { StartOptions, Manifest } from "./types";
export type * from "./types";

export default function router(manifest: Manifest, opts: StartOptions = {}) {
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
