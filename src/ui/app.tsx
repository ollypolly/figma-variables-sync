import { PLUGIN } from "@common/networkSides";
import { UI_CHANNEL } from "@ui/app.network";
import { Button } from "@ui/components/Button";
import { useEffect, useState } from "react";

import "@ui/styles/main.css";

function App() {
  const [pingCount, setPingCount] = useState(0);

  useEffect(() => {
    UI_CHANNEL.subscribe("ping", () => {
      setPingCount((cnt) => cnt + 1);
    });
  }, []);

  return (
    <div className="container">
      <h1>Figma Variables Sync</h1>
      <p>
        A serverless sync plugin styled with Radix Primitives and native CSS.
      </p>

      <div className="button-group">
        <Button
          onClick={async () => {
            console.log("Pinging plugin side...");
            const response = await UI_CHANNEL.request(PLUGIN, "ping", []);
            console.log("Response:", response);
          }}
        >
          Ping Plugin Backend
        </Button>

        <Button
          onClick={() => {
            console.log("Creating a rectangle...");
            UI_CHANNEL.emit(PLUGIN, "createRect", [100, 100]);
          }}
        >
          Create Square
        </Button>
      </div>

      <p style={{ marginTop: 24, fontSize: "11px" }}>
        Backend pinged us <strong>{pingCount}</strong> times.
      </p>
    </div>
  );
}

export default App;
