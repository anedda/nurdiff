import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initConfigStore } from "./lib/configStore";
import "./App.css";

// The settings are in files (`~/.nurdiff`): they are read before the first frame, so there is no flash of the wrong theme.
void initConfigStore().finally(() => {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
