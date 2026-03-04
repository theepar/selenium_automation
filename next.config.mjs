/** @type {import('next').NextConfig} */
const nextConfig = {
    // Allow serving screenshots from public/screenshots
    async headers() {
        return [
            {
                source: '/screenshots/:path*',
                headers: [{ key: 'Cache-Control', value: 'no-cache' }],
            },
        ];
    },
    // Externalize selenium-webdriver from webpack — runs server-side only
    serverExternalPackages: ['selenium-webdriver', 'chromedriver'],
};

export default nextConfig;
