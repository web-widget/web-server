import {
  html,
  unsafeHTML,
  HTML,
  streamToHTML,
  htmlEscapeJsonString,
  unsafeAttributeName,
  unsafeAttributeValue,
} from "./html";
import { Meta, RenderResult, ComponentProps } from "./types";

export { render } from "./html";

function isValidMetaTag(tagName: unknown): tagName is "meta" | "link" {
  return typeof tagName === "string" && /^(meta|link)$/.test(tagName);
}

function AppMeta(meta: Meta[]) {
  return meta.flat().map((metaProps) => {
    if (!metaProps) {
      return null;
    }

    if ("tagName" in metaProps) {
      let tagName = metaProps.tagName;
      delete metaProps.tagName;
      if (!isValidMetaTag(tagName)) {
        console.warn(
          `A meta object uses an invalid tagName: ${tagName}. Expected either 'link' or 'meta'`
        );
        return null;
      }
      return unsafeHTML(
        `<${tagName} ${Object.entries(metaProps)
          .map(
            ([attrName, attrValue]) =>
              `${unsafeAttributeName(attrName)}="${unsafeAttributeValue(
                String(attrValue)
              )}"`
          )
          .join(" ")} />`
      );
    }

    if ("title" in metaProps) {
      return html`<title>${metaProps.title}</title>`;
    }

    if ("charset" in metaProps) {
      metaProps.charSet ??= metaProps.charset;
      delete metaProps.charset;
    }

    if ("charSet" in metaProps && metaProps.charSet != null) {
      return typeof metaProps.charSet === "string"
        ? html`<meta charset="${metaProps.charSet}" />`
        : null;
    }

    if ("script:ld+json" in metaProps) {
      let json: string | null = null;
      try {
        json = JSON.stringify(metaProps["script:ld+json"]);
      } catch (err) {}
      return (
        json != null &&
        html`<script type="application/ld+json">
          ${unsafeHTML(JSON.stringify(metaProps["script:ld+json"]))}
        </script>`
      );
    }

    return html`<meta
      ${unsafeHTML(
        Object.entries(metaProps)
          .map(
            ([attrName, attrValue]) =>
              `${unsafeAttributeName(attrName)}="${unsafeAttributeValue(
                String(attrValue)
              )}"`
          )
          .join(" ")
      )} />`;
  });
}

export interface LayoutData {
  outlet: RenderResult;
  clientEntry: string;
  esModulePolyfillUrl?: string;
  importmap: Record<string, any>;
  lang: string;
  meta: Meta[];
  moduleScripts: (readonly [string, string])[];
  styles: string[];
}

export default function Layout(props: ComponentProps<LayoutData>): HTML {
  const data = props.data;
  return html`<!DOCTYPE html>
    <html lang="${data.lang}">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        ${AppMeta(data.meta)}
        <script type="importmap">
          ${unsafeHTML(htmlEscapeJsonString(JSON.stringify(data.importmap)))}
        </script>
        ${data.styles.map(
          (style) =>
            html`<style>
              ${style}
            </style>`
        )}
        ${data.moduleScripts.map(
          ([src, nonce]) =>
            html`<script src="${src}" nonce=${nonce} type="module"></script>`
        )}
      </head>
      <body>
        ${typeof data.outlet === "string"
          ? data.outlet
          : streamToHTML(data.outlet as ReadableStream<string>)}
        <script>
          /* Polyfill: Declarative Shadow DOM */
          (function attachShadowRoots(root) {
            root
              .querySelectorAll("template[shadowroot]")
              .forEach((template) => {
                const mode = template.getAttribute("shadowroot");
                const host = template.parentNode;
                const shadowRoot = template.parentNode.attachShadow({ mode });
                const attachInternals = host.attachInternals;
                const attachShadow = host.attachShadow;

                Object.assign(host, {
                  attachShadow() {
                    shadowRoot.innerHTML = "";
                    return shadowRoot;
                  },
                  attachInternals() {
                    const ei = attachInternals
                      ? attachInternals.call(this, arguments)
                      : {};
                    return Object.create(ei, {
                      shadowRoot: { value: shadowRoot },
                    });
                  },
                });

                shadowRoot.appendChild(template.content);
                template.remove();
                attachShadowRoots(shadowRoot);
              });
          })(document);
        </script>
        <script>
          /* Polyfill: ES Module */
          if (
            !HTMLScriptElement.supports ||
            !HTMLScriptElement.supports("importmap")
          ) {
            window.importShim = (function (src) {
              const promise = new Promise((resolve, reject) => {
                document.head.appendChild(
                  Object.assign(document.createElement("script"), {
                    src,
                    crossorigin: "anonymous",
                    async: true,
                    onload() {
                      if (importShim !== importShimProxy) {
                        resolve(importShim);
                      } else {
                        reject(new Error("No self.importShim found:" + src));
                      }
                    },
                    onerror(error) {
                      reject(error);
                    },
                  })
                );
              });
              return function importShimProxy() {
                return promise.then((importShim) => importShim(...arguments));
              };
            })(${unsafeHTML(JSON.stringify(data.esModulePolyfillUrl))});
          }
        </script>
        ${data.clientEntry
          ? html`<script type="module">
              const loader = () =>
                import(${unsafeHTML(JSON.stringify(data.clientEntry))});
              typeof importShim === "function"
                ? importShim(
                    loader.toString().match(/\\bimport\\("([^"]*?)"\\)/)[1]
                  )
                : loader();
            </script>`
          : ``}
      </body>
    </html>`;
}
