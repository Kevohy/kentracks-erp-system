import { permanentRedirect } from "next/navigation";

/** GPS platforms moved to Communication → GPS Platform; old links and bookmarks still work. */
export default function OldGpsPlatformsPage() {
  permanentRedirect("/communication/gps-platform");
}
