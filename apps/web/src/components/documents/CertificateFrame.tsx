"use client";

import { useEffect, useRef, useState } from "react";
import { CertificateDocument, type CertificateView } from "./CertificateDocument";

const A4_WIDTH = 794;
const A4_HEIGHT = 1123;

/**
 * Shows the A4 certificate scaled to the space available (phones included). When printing, the scaling is removed and
 * only the certificate is printed, one A4 page (see the print rules in globals.css).
 */
export function CertificateFrame({ c }: { c: CertificateView }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setScale(Math.min(1, el.clientWidth / A4_WIDTH));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} className="certificate-print-area w-full">
      <div className="certificate-frame mx-auto overflow-hidden" style={{ width: A4_WIDTH * scale, height: A4_HEIGHT * scale }}>
        <div className="certificate-scale origin-top-left" style={{ transform: `scale(${scale})`, width: A4_WIDTH, height: A4_HEIGHT }}>
          <CertificateDocument c={c} />
        </div>
      </div>
    </div>
  );
}
