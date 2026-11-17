import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev only: lets a Cloudflare quick tunnel (HTTPS, needed by Mercado Pago's
  // back_urls / notification_url) load dev assets. `*` matches one label, so it
  // covers every new random tunnel hostname.
  allowedDevOrigins: ["*.trycloudflare.com"],
  experimental: {
    // Dos root layouts (storefront y admin): la 404 de URLs sin ruta vive en
    // `app/global-not-found.tsx`.
    globalNotFound: true,
    // Las subidas de imagen (hasta 5 MB, `MAX_IMAGE_BYTES`) viajan en la acción;
    // el límite por defecto de Next es 1 MB. Holgura para el multipart.
    serverActions: { bodySizeLimit: "6mb" },
  },
  // `/about-us` es la URL canónica (heredada del sitio Odoo al que reemplaza
  // esta tienda). `/nosotros` existió en el nav; 308 para que los enlaces ya
  // compartidos y los buscadores migren sin perder la ruta.
  async redirects() {
    return [{ source: "/nosotros", destination: "/about-us", permanent: true }];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "pbjwbozxpzqqtheatxsi.supabase.co",
        pathname: "/storage/v1/object/public/catalogo_nacergroup/**",
      },
    ],
  },
};

export default nextConfig;
