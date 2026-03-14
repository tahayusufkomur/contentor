import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contentor",
  description: "Multi-tenant content creator platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
