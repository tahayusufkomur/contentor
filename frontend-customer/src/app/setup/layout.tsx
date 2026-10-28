import { StudioSiteLocale, SurfaceIntl } from "@/i18n/surface-provider";

export default function SetupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SurfaceIntl>
      <StudioSiteLocale>{children}</StudioSiteLocale>
    </SurfaceIntl>
  );
}
