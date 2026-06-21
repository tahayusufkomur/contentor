import type { Metadata } from "next";

import { InstallGuide } from "@/components/install/install-guide";

export const metadata: Metadata = {
  title: "Install the app",
  description: "Step-by-step guide to install this app on your phone.",
};

export default function InstallPage() {
  return <InstallGuide />;
}
