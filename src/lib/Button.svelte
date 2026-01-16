<script lang="ts">
  import type { Icon as IconType } from "lucide-svelte";

  let {
    icon = null,
    element = $bindable<HTMLButtonElement | undefined>(),
    hidden = false,
    onclick = $bindable<() => void>(),
    title = ""
  }: {
    icon?: typeof IconType | null;
    element?: HTMLButtonElement | undefined;
    hidden?: boolean;
    onclick?: () => void;
    title?: string;
  } = $props();

  const buttonClasses = hidden ? "hidden" :
    "bg-source-100 text-source-900 border-source-200 hover:bg-source-200 hover:border-source-300 dark:bg-source-900 dark:text-source-100 dark:border-source-800 dark:hover:bg-source-800 dark:hover:border-source-700 p-2 border";

  let Icon = $state<typeof IconType | null>(icon);
  $effect(() => {
    Icon = icon;
  });
</script>

<button
  bind:this={element}
  class={buttonClasses}
  disabled={hidden}
  aria-hidden={hidden}
  onclick={onclick}
  title={title}
>
  {#if icon && !hidden}
    <Icon size={24} strokeWidth={2} />
  {/if}
</button>
