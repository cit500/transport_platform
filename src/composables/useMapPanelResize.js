import { onBeforeUnmount, onMounted, ref } from 'vue';

/** 地图与底栏共用的高度控制；拖动结束、页面卸载时均清理监听。 */
export function useMapPanelResize(container, mapRef, initialHeight = 230) {
    const bottomHeight = ref(initialHeight);
    const maxHeight = ref(500);
    let observer, activePointer = null, handle = null, frame;
    function update(value) {
        const height = container.value?.getBoundingClientRect().height || 500;
        maxHeight.value = Math.max(120, Math.min(height * .65, height - 180));
        bottomHeight.value = Math.min(maxHeight.value, Math.max(120, value));
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => mapRef.value?.resize());
    }
    function move(event) {
        if (event.pointerId !== activePointer || !container.value) return;
        update(container.value.getBoundingClientRect().bottom - event.clientY);
    }
    function stop(event) {
        if (event && event.pointerId !== activePointer) return;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', stop);
        window.removeEventListener('pointercancel', stop);
        if (handle?.hasPointerCapture?.(activePointer)) handle.releasePointerCapture(activePointer);
        activePointer = null; handle = null;
    }
    function startResize(event) {
        if (event.button !== 0) return;
        event.preventDefault(); stop();
        activePointer = event.pointerId; handle = event.currentTarget;
        handle.setPointerCapture?.(activePointer);
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', stop);
        window.addEventListener('pointercancel', stop);
    }
    onMounted(() => {
        observer = new ResizeObserver(() => update(bottomHeight.value));
        if (container.value) observer.observe(container.value);
        update(bottomHeight.value);
    });
    onBeforeUnmount(() => { stop(); observer?.disconnect(); cancelAnimationFrame(frame); });
    return { bottomHeight, maxHeight, startResize, resizeBottom: delta => update(bottomHeight.value + delta) };
}
