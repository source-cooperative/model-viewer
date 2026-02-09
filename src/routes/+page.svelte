<script lang="ts">
  import prettyBytes from "pretty-bytes";
  import { onMount } from "svelte";
  import { page } from "$app/state";

  import ModelViewer from "$lib/ModelViewer.svelte";

  const MAX_CONTENT_LENGTH_MB = 200;

  let searchParams: URLSearchParams = page.url.searchParams;
  let urlParam: string | null = $state(searchParams.get("url"));
  let errorMessage: string | null = $state(null);

  const validateModelUrl = async (url: string) => {
    const response = await fetch(url, { method: "HEAD" });
    if (!response.ok) {
      errorMessage = `Model file URL is not valid: ${url}. Status: ${response.status}.`;
      console.error(errorMessage);
      return false;
    }

    const contentLength = parseInt(response.headers.get("Content-Length") ?? "-1");
    const maxContentLength = MAX_CONTENT_LENGTH_MB * 1024 * 1024;
    if (contentLength > maxContentLength) {
      errorMessage = `Model file is too large to display (${prettyBytes(contentLength).toLocaleUpperCase()}).`;
      console.error(errorMessage);
      return false;
    }

    return true;
  };

  onMount(async () => {
    if (!urlParam) {
      urlParam = null;
    } else {
      const modelUrlIsValid = await validateModelUrl(urlParam);
      if (!modelUrlIsValid) {
        urlParam = null;
      }
    }
  });
</script>

<svelte:head>
  <title>Model Viewer</title>
</svelte:head>

{#if urlParam && !errorMessage}
  <div class="h-screen w-screen">
    <ModelViewer modelUrl={urlParam} />
  </div>
{:else}
  <div class="h-screen w-screen flex flex-col items-center justify-center">
    <div class="max-w-200 p-8">
      {#if errorMessage}
        <p class="text-3xl font-semibold mb-4">Error</p>
        <p class="text-xl">
          {errorMessage}
        </p>
      {:else}
        <p class="text-3xl font-semibold mb-4">Valid 3D model file URL required</p>
        <p class="text-xl">
          Please provide a valid 3D model file URL via query parameter <code
            class="bg-source-200 dark:bg-source-800 text-source-800 dark:text-source-200 p-1 rounded-sm"
          >
            url
          </code>. Supported model formats include GLB, GLTF, OBJ, and STL. Maximum allowed file
          size is {MAX_CONTENT_LENGTH_MB} MB.
        </p>
      {/if}
    </div>
  </div>
{/if}
