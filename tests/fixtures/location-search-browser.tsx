import React from "react";
import { createRoot } from "react-dom/client";
import { LocationPicker } from "../../components/location-picker";
createRoot(document.getElementById("fixture-root")!).render(
  <main style={{ padding: 20, maxWidth: 700 }}>
    <h1>Destination search fixture</h1>
    <form onSubmit={(event) => event.preventDefault()}>
      <LocationPicker
        label="First destination"
        name="first"
        scope="destination"
        required
      />
      <LocationPicker
        label="Second destination"
        name="second"
        scope="destination"
        required
      />
    </form>
  </main>,
);
