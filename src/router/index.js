import { createRouter, createWebHistory } from 'vue-router';

const HomeView = () => import('../views/HomeView.vue');
const HeavyView = () => import('../views/HeavyView.vue');
const DisasterView = () => import('../views/DisasterView.vue');
const ResilienceView = () => import('../views/ResilienceView.vue');

const routes = [
    { path: '/', name: 'home', component: HomeView, meta: { title: '交通网络多灾韧性评价可视化平台' } },
    { path: '/heavy', name: 'heavy', component: HeavyView, meta: { title: '重车通行评估 · 交通网络多灾韧性评价可视化平台' } },
    { path: '/disaster', name: 'disaster', component: DisasterView, meta: { title: '灾害风险评估 · 交通网络多灾韧性评价可视化平台' } },
    { path: '/resilience', name: 'resilience', component: ResilienceView, meta: { title: '路网韧性评估 · 交通网络多灾韧性评价可视化平台' } },
    { path: '/:pathMatch(.*)*', redirect: '/' }
];

const router = createRouter({ history: createWebHistory(), routes });
router.afterEach((to) => { document.title = to.meta.title || '交通网络多灾韧性评价可视化平台'; });

export default router;
