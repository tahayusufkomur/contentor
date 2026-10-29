import { RootShell } from "@/components/shared/root-shell";
import "@/styles/globals.css";

export { generateMetadata } from "@/components/shared/root-shell";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RootShell>{children}</RootShell>;
}
