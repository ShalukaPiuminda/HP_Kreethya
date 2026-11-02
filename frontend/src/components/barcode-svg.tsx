'use client';

import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Code 128 barcode drawn as SVG so it stays sharp when printed. The bars stretch to
 * the box given by className (uniform horizontal scaling keeps it scannable); the
 * human-readable text is left to the caller so it can be sized for the label.
 */
export function BarcodeSvg({ value, className }: { value: string; className?: string }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    try {
      JsBarcode(svg, value, {
        format: 'CODE128',
        displayValue: false,
        // Code 128 needs a quiet zone of ~10 modules each side to scan reliably.
        margin: 0,
        marginLeft: 20,
        marginRight: 20,
        width: 2,
        height: 60,
      });
      svg.setAttribute('preserveAspectRatio', 'none');
    } catch {
      // Value Code 128 cannot encode (e.g. non-ASCII): show it as plain text instead.
      svg.replaceChildren();
      svg.setAttribute('viewBox', '0 0 200 60');
      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('x', '100');
      text.setAttribute('y', '36');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-size', '16');
      text.textContent = value;
      svg.appendChild(text);
    }

    svg.removeAttribute('width');
    svg.removeAttribute('height');
  }, [value]);

  return <svg ref={svgRef} className={className} role="img" aria-label={`Barcode ${value}`} />;
}
