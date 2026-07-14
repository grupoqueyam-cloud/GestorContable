import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import EditorialApp from "../components/editorial-app";
import "../app/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode><EditorialApp /></StrictMode>,
);
