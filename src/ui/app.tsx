import React from "react";
import { GitHubProvider } from "@ui/services/GitHubProvider";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@ui/components/Tabs";
import { Updates } from "@ui/pages/Updates";
import { Proposals } from "@ui/pages/Proposals";
import { Settings } from "@ui/pages/Settings";
import "@ui/styles/main.css";

function App() {
  return (
    <GitHubProvider>
      <Tabs
        defaultValue="updates"
        style={{ display: "flex", flexDirection: "column", height: "100%" }}
      >
        <TabsList>
          <TabsTrigger value="updates">Updates</TabsTrigger>
          <TabsTrigger value="proposals">Proposals</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="updates">
          <Updates />
        </TabsContent>
        <TabsContent value="proposals">
          <Proposals />
        </TabsContent>
        <TabsContent value="settings">
          <Settings />
        </TabsContent>
      </Tabs>
    </GitHubProvider>
  );
}

export default App;
