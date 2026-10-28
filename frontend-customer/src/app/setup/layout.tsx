import { SurfaceIntl } from "@/i18n/surface-provider";

export default function SetupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SurfaceIntl>{children}</SurfaceIntl>;
}
