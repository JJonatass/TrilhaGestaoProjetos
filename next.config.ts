import type { NextConfig } from 'next'

// Exportação estática: o build gera HTML/JS puros em /out, sem servidor.
// Assim o app roda de graça no GitHub Pages, Netlify ou Vercel.
// No GitHub Pages em subpasta, defina NEXT_PUBLIC_BASE_PATH=/nome-do-repositorio.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''

const nextConfig: NextConfig = {
  output: 'export',
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  webpack: (config, { isServer }) => {
    // sql.js menciona módulos do Node que não existem no navegador.
    if (!isServer) config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false, crypto: false }
    return config
  },
}

export default nextConfig
