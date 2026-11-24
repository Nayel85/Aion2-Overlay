<script setup lang="ts">
// A card of Home: its icon (a path, or an emoji), its title, a line of what its page has now (or the
// default slot), and a chevron; a click goes to its page.
defineProps<{ icon?: string; emoji?: string; title: string; line?: string }>()
defineEmits<{ click: [] }>()
</script>

<template>
  <button type="button" class="group flex items-center gap-4 rounded-xl border border-card bg-card px-4 py-3.5 text-left transition hover:border-light hover:bg-dark" @click="$emit('click')">
    <span class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-dark text-accent group-hover:bg-light">
      <span v-if="emoji" class="text-xl leading-none" aria-hidden="true">{{ emoji }}</span>
      <svg v-else viewBox="0 0 16 16" class="size-5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path :d="icon" /></svg>
    </span>
    <span class="min-w-0 flex-1">
      <span class="block text-sm font-semibold">{{ title }}</span>
      <span class="block truncate text-xs text-darker"><slot>{{ line }}</slot></span>
    </span>
    <svg viewBox="0 0 16 16" class="size-4 shrink-0 text-darkest" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="m6 4 4 4-4 4" /></svg>
  </button>
</template>
