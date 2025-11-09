import React from "react";

// Use image.png from public as the primary logo
// In Vite, files in /public are served at the root: /image.png
export default function Logo({ className = "nav-logo-img" }) {
  return (
    <img
      src="/image.png"
      alt="MatchA Dance logo"
      className={className}
      decoding="async"
      loading="eager"
    />
  );
}
