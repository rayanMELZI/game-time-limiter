import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import ToastView from "./components/ToastView";
import "./styles.css";

const isToast = getCurrentWindow().label === "toast";
document.documentElement.classList.toggle("toast-window", isToast);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{isToast ? <ToastView /> : <App />}</React.StrictMode>,
);
