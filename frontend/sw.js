/**
 * PWA Service Worker.
 * 정적 자산을 캐싱하여 오프라인에서도 기본 UI를 표시한다.
 * API 호출은 네트워크 우선(network-first) 전략으로 처리한다.
 */

const CACHE_NAME = 'aisg-v1';

// 프리캐시할 정적 자산 목록
const STATIC_ASSETS = [
    '/user/index.html',
    '/user/checkin.html',
    '/assets/css/common.css',
    '/assets/css/user.css',
    '/assets/js/api.js',
    '/assets/js/auth.js',
    '/assets/js/camera.js',
];

/**
 * install 이벤트 — 정적 자산을 캐시에 저장한다.
 */
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
    );
    // 대기 상태를 건너뛰고 즉시 활성화
    self.skipWaiting();
});

/**
 * activate 이벤트 — 이전 버전의 캐시를 삭제한다.
 */
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            )
        )
    );
    self.clients.claim();
});

/**
 * fetch 이벤트 — 요청 유형에 따라 캐시 전략을 적용한다.
 * - API 요청 (/auth, /user, /admin): 네트워크 우선
 * - 정적 자산: 캐시 우선, 없으면 네트워크
 */
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // API 요청은 항상 네트워크 우선
    if (url.pathname.startsWith('/auth') ||
        url.pathname.startsWith('/user/checkin') ||
        url.pathname.startsWith('/admin/')) {
        event.respondWith(
            fetch(event.request).catch(() =>
                new Response(JSON.stringify({ detail: '네트워크 연결을 확인해주세요' }), {
                    status: 503,
                    headers: { 'Content-Type': 'application/json' },
                })
            )
        );
        return;
    }

    // 정적 자산은 캐시 우선
    event.respondWith(
        caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
});
