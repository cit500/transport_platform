import { onBeforeUnmount, onMounted, ref } from 'vue';

export function useClock() {
    const time = ref('--:--:--');
    const date = ref('----年--月--日');
    let timer;
    const update = () => {
        const now = new Date();
        time.value = now.toLocaleTimeString('zh-CN', { hour12: false });
        date.value = now.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' });
    };
    onMounted(() => { update(); timer = window.setInterval(update, 1000); });
    onBeforeUnmount(() => window.clearInterval(timer));
    return { time, date };
}
