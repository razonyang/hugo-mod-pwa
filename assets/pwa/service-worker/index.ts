import { default as params } from '@params'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { ExpirationPlugin } from 'workbox-expiration'
import { registerRoute, setCatchHandler } from 'workbox-routing'
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies'

self.__WB_DISABLE_DEV_LOGS = !params.debug

const debug = (...data: any[]): void => {
    if (self.__WB_DISABLE_DEV_LOGS) {
        return
    }

    console.debug('[pwa]', ...data);
}

const cachePrefix = 'hugo-pwa-'
const fallbacksCache = cachePrefix + 'fallbacks'
// Filter the invalid URLs, such as temporary URLs generated by Hugo PostProgress.
const precaches = params.precaches.filter((url) => url.indexOf('__h_pp_l1') !== 0)

// Register page route with NetworkFirst strategy.
// There will be a problem with CacheFirst or StaleWhileRevalidate strategy
// if the cached page loads no longer exist or expired assets, such as CSS and JS.
registerRoute(
    ({ request }) => {
        return request.mode === 'navigate';
    },
    new NetworkFirst({
        cacheName: cachePrefix + 'pages',
        plugins: [
            new CacheableResponsePlugin({
                statuses: [200],
            }),
        ],
    })
)

// Register assets routes.
const assets = ['font', 'image', 'script', 'style']
for (let i in assets) {
    const kind = assets[i]
    const cache = params.caches[kind]
    const cacheName = cachePrefix + kind + 's'
    let strategy = null
    let plugins = [
        new CacheableResponsePlugin({
            statuses: [200],
        }),
        new ExpirationPlugin({
            maxAgeSeconds: cache.max_age ?? 60 * 60 * 24 * 30,
        })
    ]
    switch (cache.strategy) {
        case 'network-first':
            strategy = new NetworkFirst({
                cacheName: cacheName,
                plugins: plugins,
            })
            break
        case 'cache-first':
            strategy = new CacheFirst({
                cacheName: cacheName,
                plugins: plugins,
            })
            break
        case 'stale-while-revalidate':
            strategy = new StaleWhileRevalidate({
                cacheName: cacheName,
                plugins: plugins,
            })
            break
        default:
            throw new Error(`invalid strategy for kind "${kind}": ` + cache.strategy)
    }
    registerRoute(
        ({ request }) => {
            return request.destination === kind;
        },
        strategy
    );
}

self.addEventListener('install', event => {
    event.waitUntil(
        self.caches
            .open(fallbacksCache)
            .then(cache => cache.addAll(precaches))
    );
});

const handler = async options => {
    debug('catch handler', options.request)
    const dest = options.request.destination
    const url = options.request.url
    const cache = await self.caches.open(fallbacksCache)

    if (dest === 'document') {
        const offline = '/offline.html'
        let lang = ''
        if (url.indexOf(params.baseURL) === 0) {
            const paths = url.replace(params.baseURL, '').split('/', 1)
            if (params.langs.includes(paths[0])) {
                lang = paths[0]
            }
        }

        debug('loading offline page', `/${lang}/offline.html`, offline)
        return (await cache.match(`/${lang}/offline.html`))
            || (await cache.match(offline))
            || Response.error()
    }

    // Load precached assets.
    return (await cache.match(url)) || Response.error()
};

setCatchHandler(handler)
