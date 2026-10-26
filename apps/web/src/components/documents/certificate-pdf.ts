"use client";

/** "KDW 236Z" → "KDW236Z-certificate.pdf". Only letters and numbers are kept, so the name is safe on every system. */
export function certificateFileName(vehicleReg: string): string {
  const plate = vehicleReg.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return `${plate || "certificate"}-certificate.pdf`;
}

/**
 * Saves the certificate on screen as an A4 PDF named after the vehicle's number plate. The page is captured at three
 * times screen resolution, so text stays sharp and the QR code scans. The libraries load only when this runs.
 */
export async function downloadCertificatePdf(article: HTMLElement, vehicleReg: string): Promise<void> {
  const [{ toCanvas }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);
  await document.fonts.ready;
  // Wait for the brand images and the QR code to finish loading.
  await Promise.all([...article.querySelectorAll("img")].map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))));
  const canvas = await toCanvas(article, { pixelRatio: 3, width: 794, height: 1123, backgroundColor: "#ffffff", cacheBust: true });
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  pdf.setProperties({ title: `Certificate of Installation ${vehicleReg}`, subject: "Vehicle tracking certificate", creator: "Kentracks ERP" });
  pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, 210, 297, undefined, "FAST");
  pdf.save(certificateFileName(vehicleReg));
}
