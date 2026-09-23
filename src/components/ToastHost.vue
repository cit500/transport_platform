<script setup>
import { storeToRefs } from 'pinia';
import { useUiStore } from '../stores/platform.js';
const ui = useUiStore();
const { toasts } = storeToRefs(ui);
</script>

<template>
    <div class="toast-host">
        <div v-for="item in toasts" :key="item.id" class="v2-toast" :class="`toast-${item.kind}`">{{ item.message }}</div>
    </div>
</template>
