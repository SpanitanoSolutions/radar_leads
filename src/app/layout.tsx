import type { Metadata } from "next";
import Script from "next/script";
import "@fontsource-variable/inter";
import "./globals.css";

export const metadata: Metadata = {
  title: "UNIQO · Tecnología aplicada a seguros",
  description: "Tecnología aplicada a seguros para productores asesores: asegurados, pólizas, vencimientos y tareas operativas.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" suppressHydrationWarning>
      <head>
        <Script id="uniqo-theme-init" strategy="beforeInteractive">
          {`try {
            var savedTheme = localStorage.getItem("uniqo-theme");
            var initialTheme = savedTheme === "dark" ? "dark" : "light";
            document.documentElement.dataset.theme = initialTheme;
            document.documentElement.style.colorScheme = initialTheme;
          } catch (_) {
            document.documentElement.dataset.theme = "light";
          }`}
        </Script>
      </head>
      <body>{children}</body>
    </html>
  );
}
