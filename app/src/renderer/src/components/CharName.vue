<script setup lang="ts">
// A character by name with their class icon: yours looked up (the Characters page's record of them),
// another player's or one known already given (`className`); their server's tag after it when given
// (`server`; `hideOwnServer`: none for your own server's). Every place a character's or player's name
// is shown.
import { computed } from 'vue'
import ClassIcon from '@/components/ClassIcon.vue'
import { useApp } from '@/stores/app.ts'
import { serverTag } from '@shared/servers.ts'

const props = withDefaults(
  defineProps<{
    name: string
    size?: number
    iconOnly?: boolean
    className?: string | null
    /** The name's own classes (its weight, colour, width). */
    nameClass?: string | (string | false | undefined)[]
    server?: number | null
    hideOwnServer?: boolean
    serverClass?: string
  }>(),
  { size: 14, iconOnly: false, className: undefined, nameClass: undefined, server: null, hideOwnServer: false, serverClass: 'text-[11px] text-yellow' },
)
const store = useApp()
const className = computed(() => (props.className !== undefined ? props.className : (Object.values(store.characters).find((c) => c.name === props.name)?.className ?? null)))
const tag = computed(() => (props.server === null || (props.hideOwnServer && props.server === (store.status?.server ?? null)) ? null : serverTag(props.server)))
</script>

<template>
  <span class="inline-flex min-w-0 items-center gap-1.5" :title="iconOnly ? name : undefined">
    <ClassIcon class="shrink-0" :class-name="className" :size="size" />
    <span v-if="!iconOnly" :class="['truncate', nameClass]">{{ name }}</span>
    <span v-if="!iconOnly && tag" :class="['shrink-0 tabular-nums', serverClass]">[{{ tag }}]</span>
  </span>
</template>
