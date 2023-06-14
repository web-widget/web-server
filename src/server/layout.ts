import { html, unsafeHTML, HTML, streamToHTML, htmlEscapeJsonString, unsafeAttributeName, unsafeAttributeValue } from "./html.js";
import { Meta, RenderResult } from "./types.js";

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
      return unsafeHTML(`<${tagName} ${Object.entries(metaProps)
        .map(
          ([attrName, attrValue]) =>
            `${unsafeAttributeName(attrName)}="${unsafeAttributeValue(String(attrValue))}"`
        )
        .join(' ')} />`);
    }

    if ("title" in metaProps) {
      return html`<title>${metaProps.title}</title>`;
    }

    if ("charset" in metaProps) {
      metaProps.charSet ??= metaProps.charset;
      delete metaProps.charset;
    }

    if ("charSet" in metaProps && metaProps.charSet != null) {
      return typeof metaProps.charSet === "string" ? (
        html`<meta charset="${metaProps.charSet}" />`
      ) : null;
    }

    if ("script:ld+json" in metaProps) {
      let json: string | null = null;
      try {
        json = JSON.stringify(metaProps["script:ld+json"]);
      } catch (err) { }
      return (
        json != null && (
          html`<script type="application/ld+json">
            ${unsafeHTML(JSON.stringify(metaProps["script:ld+json"]))}
          </script>`
        )
      );
    }

    return html
      `<meta ${unsafeHTML(Object.entries(metaProps)
        .map(
          ([attrName, attrValue]) =>
            `${unsafeAttributeName(attrName)}="${unsafeAttributeValue(String(attrValue))}"`
        )
        .join(' '))} />`;
  })
}

export interface TemplateOptions {
  outlet: RenderResult;
  clientEntry: string;
  esModulePolyfillUrl?: string;
  importmap: Record<string, any>;
  lang: string;
  meta: Meta[];
  moduleScripts: (readonly [string, string])[];
  styles: string[];
}

export function template(opts: TemplateOptions): HTML {
  return html`<!DOCTYPE html>
  <html lang="${opts.lang}">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      ${AppMeta(opts.meta)}
      <script type="importmap">
        ${unsafeHTML(htmlEscapeJsonString(JSON.stringify(opts.importmap)))}
      </script>
      ${opts.styles.map(style => html`<style>${style}</style>`)}
      ${opts.moduleScripts.map(([src, nonce]) => html`<script src="${src}" nonce=${nonce} type="module"></script>`)}
    </head>
    <body>
      ${streamToHTML(opts.outlet as ReadableStream<string>)}
      <script>
        /* Polyfill: Declarative Shadow DOM */
        (function attachShadowRoots(root) {
          root.querySelectorAll('template[shadowroot]').forEach(template => {
            const mode = template.getAttribute('shadowroot');
            const host = template.parentNode;
            const shadowRoot = template.parentNode.attachShadow({ mode });
            const attachInternals = host.attachInternals;
            const attachShadow = host.attachShadow;

            Object.assign(host, {
              attachShadow() {
                shadowRoot.innerHTML = '';
                return shadowRoot;
              },
              attachInternals() {
                const ei = attachInternals
                  ? attachInternals.call(this, arguments)
                  : {};
                return Object.create(ei, {
                  shadowRoot: { value: shadowRoot }
                });
              }
            });

            shadowRoot.appendChild(template.content);
            template.remove();
            attachShadowRoots(shadowRoot);
          });
        })(document);

        (function esmLoader(bootstrap, esModulePolyfill) {
          if (
            !HTMLScriptElement.supports ||
            !HTMLScriptElement.supports('importmap')
          ) {
            document.head.appendChild(
              Object.assign(document.createElement('script'), {
                src: esModulePolyfill,
                crossorigin: 'anonymous',
                async: true,
                onload() {
                  importShim(bootstrap);
                }
              })
            );
          } else {
            import(bootstrap);
          }
        })(
          ${unsafeHTML(JSON.stringify(opts.clientEntry))},
          ${unsafeHTML(JSON.stringify(opts.esModulePolyfillUrl))}
        );
      </script>
    </body>
  </html>`;
}