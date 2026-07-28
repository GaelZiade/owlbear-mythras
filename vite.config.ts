import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// Root-relative so the config needs no Node typings to resolve it.
const mockSdk = "/src/dev/mockSdk.ts";

/**
 * Keeps the mock server out of Owlbear.
 *
 * Any Vite server happily serves `public/manifest.json`, so the mock one could
 * be installed as a real extension by pasting the wrong port. It would then run
 * against fake tokens while looking entirely legitimate, which is a genuinely
 * confusing failure. Refusing to serve a manifest makes the mistake impossible.
 */
function refuseManifestInMockMode(): Plugin {
  return {
    name: "mythras:refuse-manifest-in-mock-mode",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url?.split("?")[0] !== "/manifest.json") return next();
        response.statusCode = 404;
        response.setHeader("Content-Type", "text/plain; charset=utf-8");
        response.end(
          "This is the mock server: it deliberately serves no manifest.\n" +
            "Run `npm run dev` and install http://localhost:5173/manifest.json instead.\n",
        );
      });
    },
  };
}

/**
 * Rewrites the manifest's paths to match the deployment base.
 *
 * The manifest points at the icon and the popover with root-absolute paths,
 * which is right when the extension is served from a domain root and wrong on
 * GitHub Pages, where it lives under /<repo>/. Vite rebases the assets it
 * bundles, but `public/manifest.json` is copied verbatim, so Owlbear would ask
 * the domain root for files that are one directory down and get nothing.
 *
 * Rewriting at build time keeps one manifest in the repository: the source
 * stays correct for local development and the built copy is correct wherever it
 * is published.
 */
function rebaseManifest(): Plugin {
  let base = "/";
  let manifestPath = "";

  return {
    name: "mythras:rebase-manifest",
    apply: "build",
    configResolved(config) {
      base = config.base;
      manifestPath = resolve(config.root, config.build.outDir, "manifest.json");
    },
    async closeBundle() {
      if (base === "/") return;

      const prefix = base.replace(/\/$/, "");
      const rebase = (path: string) => (path.startsWith("/") ? `${prefix}${path}` : path);

      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
        icon: string;
        action: { icon: string; popover: string };
      };

      manifest.icon = rebase(manifest.icon);
      manifest.action.icon = rebase(manifest.action.icon);
      manifest.action.popover = rebase(manifest.action.popover);

      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    },
  };
}

export default defineConfig(({ mode }) => {
  const isMock = mode === "mock";

  return {
    plugins: isMock ? [react(), refuseManifestInMockMode()] : [react(), rebaseManifest()],
    resolve: {
      // `npm run dev:mock` swaps the SDK for a stub so the panel renders in a
      // plain browser tab. Without it the app waits forever on OBR.onReady and
      // shows nothing at all outside Owlbear.
      alias: isMock ? { "@owlbear-rodeo/sdk": mockSdk } : {},
    },
    server: {
      // The manifest URL is pasted into Owlbear by hand. If the port moved
      // because something else had claimed it, that URL would quietly stop
      // working.
      port: 5173,
      strictPort: true,
      // Owlbear fetches the manifest from its own domain, so this is a
      // cross-origin request. Since Vite 5.4.12 the dev server only allows
      // same-origin unless told otherwise.
      cors: {
        origin: ["https://www.owlbear.rodeo", "https://owlbear.rodeo"],
      },
    },
    // Owlbear loads each surface of an extension as its own iframe, and each one
    // needs its own HTML entry point.
    build: {
      rollupOptions: {
        input: {
          tracker: "index.html",
        },
      },
    },
  };
});
