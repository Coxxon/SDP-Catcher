import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Bypass Tailwind v4 PostCSS which strips ::-webkit-scrollbar rules
// ?raw = zero PostCSS processing, raw string import
import scrollbarCSS from "./scrollbar.css?raw";
const scrollbarStyle = document.createElement("style");
scrollbarStyle.textContent = scrollbarCSS;
document.head.appendChild(scrollbarStyle);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
