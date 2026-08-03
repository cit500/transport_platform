/**
 * Header 组件 - 顶部状态栏 (完整中文格式)
 */
export function initHeader() {
    updateClock();
    setInterval(updateClock, 1000);
    updateWeather();
}

function updateClock() {
    var el = document.getElementById('header-time');
    if (!el) return;
    var now = new Date();
    var weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    var y = now.getFullYear();
    var M = now.getMonth() + 1;
    var d = now.getDate();
    var w = weekdays[now.getDay()];
    var h = String(now.getHours()).padStart(2, '0');
    var m = String(now.getMinutes()).padStart(2, '0');
    var s = String(now.getSeconds()).padStart(2, '0');
    el.textContent = y + '年' + M + '月' + d + '日 ' + w + ' ' + h + ':' + m + ':' + s;
}

function updateWeather() {
    var el = document.getElementById('header-weather-text');
    if (!el) return;
    var weathers = ['☀️ 晴 26°C 东北风2级', '⛅ 多云 24°C 南风1级', '🌤️ 晴 28°C 微风', '🌦️ 小雨 22°C 东北风3级'];
    el.textContent = weathers[Math.floor(Math.random() * weathers.length)];
    setInterval(function () {
        el.textContent = weathers[Math.floor(Math.random() * weathers.length)];
    }, 300000);
}
