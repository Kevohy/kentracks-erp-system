"use client";

import { useEffect, useRef, useState } from "react";
import { InvoiceDocument, type InvoiceView } from "./InvoiceDocument";

const A4_WIDTH = 794;
const A4_HEIGHT = 1123;

/** Shows the invoice scaled to the space available (phones included). It is one A4 page tall, taller with many lines. */
export function InvoiceFrame({ inv }: { inv: InvoiceView }) {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState(A4_HEIGHT);
  useEffect(() => {
    const el = box.current;
    const doc = inner.current;
    if (!el || !doc) return;
    const fit = () => {
      setScale(Math.min(1, el.clientWidth / A4_WIDTH));
      setHeight(Math.max(A4_HEIGHT, doc.offsetHeight));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    ro.observe(doc);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} className="invoice-print-area w-full">
      <div className="invoice-frame mx-auto overflow-hidden" style={{ width: A4_WIDTH * scale, height: height * scale }}>
        <div ref={inner} className="invoice-scale origin-top-left" style={{ transform: `scale(${scale})`, width: A4_WIDTH }}>
          <InvoiceDocument inv={inv} />
        </div>
      </div>
    </div>
  );
}
