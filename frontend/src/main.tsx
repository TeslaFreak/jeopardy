import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Amplify } from "aws-amplify";
import { Authenticator } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";
import App from "./App.tsx";
import { amplifyConfig } from "./amplify-config";
import "./index.css";

Amplify.configure(amplifyConfig);

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Authenticator.Provider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </Authenticator.Provider>
  </React.StrictMode>,
);
