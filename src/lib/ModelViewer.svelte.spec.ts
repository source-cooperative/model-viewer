import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";

import ModelViewer from "./ModelViewer.svelte";

describe("ModelViewer", () => {
  it("should render model viewer canvas element", async () => {
    render(ModelViewer, {
      modelUrl:
        "https://data.source.coop/harvard-lil/smithsonian-open-access/3d/009463d3-6f58-4f5b-8e60-915805a876ee/USNM_91201-150k-1024-low.glb",
    });

    const canvas = page.getByClassName("model-viewer-canvas")
    await expect.element(canvas).toBeInTheDocument();
  });

  it("should render toolbar element", async () => {
    render(ModelViewer, {
      modelUrl:
        "https://data.source.coop/harvard-lil/smithsonian-open-access/3d/009463d3-6f58-4f5b-8e60-915805a876ee/USNM_91201-150k-1024-low.glb",
    });

    const toolbar = page.getById("toolbar");
    await expect.element(toolbar).toBeInTheDocument();
  });
});
