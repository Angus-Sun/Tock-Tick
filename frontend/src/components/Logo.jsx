import React, { useState } from "react";
import fallbackSvg from "../assets/matcha-dance-logo.JPG";

// Tries to load your provided PNG from the public folder, falls back to SVG if missing
export default function Logo({ className = "nav-logo-img" }) {
  const [src, setSrc] = useState("/matcha-dance.png");
  return (
    <img
      src={src}
      alt="MatchA Dance logo"
      className={className}
      onError={() => setSrc(fallbackSvg)}
      decoding="async"
      loading="eager"
    />
  );
}
