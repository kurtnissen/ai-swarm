/** @type {import('next').NextConfig} */
const nextConfig = {
    experimental: {
        serverComponentsExternalPackages: ['@temporalio/client', '@ai-swarm/shared'],
        instrumentationHook: true,
    },
    output: 'standalone',
    async rewrites() {
        return [
            {
                source: '/temporal/:path*',
                destination: 'http://temporal-ui:8080/:path*',
            },
        ];
    },
};

module.exports = nextConfig;
