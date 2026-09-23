import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router/index.js';
import 'leaflet/dist/leaflet.css';
import './styles/dashboard.css';
import './styles/data-management.css';
import './styles/heavy.css';
import './styles/disaster.css';
import './styles/resilience.css';

createApp(App).use(createPinia()).use(router).mount('#app');
