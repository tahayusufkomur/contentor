import { pageMetadata } from "@/lib/seo";

// login/page.tsx is a client component, so its head lives here.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  return pageMetadata((await params).locale, "/login", "auth.login.meta");
}

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
