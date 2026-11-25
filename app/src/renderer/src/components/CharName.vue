<script setup lang="ts">
// A character of yours by name, with their class icon (the Characters page's record of them): every
// place a character's name is shown.
import { computed } from 'vue'
import ClassIcon from '@/components/ClassIcon.vue'
import { useApp } from '@/stores/app.ts'

const props = withDefaults(defineProps<{ name: string; size?: number; iconOnly?: boolean }>(), { size: 14, iconOnly: false })
const store = useApp()
const className = computed(() => Object.values(store.characters).find((c) => c.name === props.name)?.className ?? null)
</script>

<template>
  <span class="inline-flex min-w-0 items-center gap-1.5" :title="iconOnly ? name : undefined"><ClassIcon :class-name="className" :size="size" /><span v-if="!iconOnly" class="truncate">{{ name }}</span></span>
</template>
