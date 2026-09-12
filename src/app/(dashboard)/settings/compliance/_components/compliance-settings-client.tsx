"use client";

/**
 * Compliance Settings Client Component
 *
 * Tabbed interface with:
 * - Custom Requirements (CMPL-04): Add bank-specific compliance items
 * - Master Direction Browser: Browse RBI checklist items
 */

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, BookOpen } from "@/lib/icons";
import { AddCustomRequirement } from "./add-custom-requirement";
import { MasterDirectionBrowser } from "./master-direction-browser";

export function ComplianceSettingsClient() {
  const [activeTab, setActiveTab] = useState("custom");

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <TabsList>
        <TabsTrigger value="custom" className="gap-2">
          <Plus className="h-4 w-4" />
          Custom Requirements
        </TabsTrigger>
        <TabsTrigger value="browse" className="gap-2">
          <BookOpen className="h-4 w-4" />
          Master Directions
        </TabsTrigger>
      </TabsList>

      <TabsContent value="custom" className="mt-6">
        <AddCustomRequirement />
      </TabsContent>

      <TabsContent value="browse" className="mt-6">
        <MasterDirectionBrowser />
      </TabsContent>
    </Tabs>
  );
}
