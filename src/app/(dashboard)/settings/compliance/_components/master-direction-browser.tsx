"use client";

/**
 * Master Direction Browser Component
 *
 * Browse RBI Master Directions and their checklist items.
 * Read-only reference view for compliance officers.
 */

import { useState } from "react";
import {
  masterDirections,
  checklistItems,
  getItemsByDirection,
} from "@/data/rbi-master-directions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { BookOpen, Search, ShieldCheck } from "@/lib/icons";

export function MasterDirectionBrowser() {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredDirections = searchQuery.trim()
    ? masterDirections.filter(
        (d) =>
          d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          d.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
          d.shortId.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : masterDirections;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                RBI Master Directions
              </CardTitle>
              <CardDescription>
                {masterDirections.length} directions with{" "}
                {checklistItems.length} checklist items
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="relative mb-4">
            <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <Input
              placeholder="Search directions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {filteredDirections.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              No directions match your search.
            </p>
          ) : (
            <Accordion type="multiple" className="space-y-2">
              {filteredDirections.map((direction) => {
                const items = getItemsByDirection(direction.shortId);
                return (
                  <AccordionItem
                    key={direction.shortId}
                    value={direction.shortId}
                    className="rounded-lg border px-4"
                  >
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex flex-1 items-center gap-3 text-left">
                        <ShieldCheck className="h-4 w-4 flex-shrink-0 text-blue-600" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">
                            {direction.shortId}: {direction.title}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            {direction.category}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {items.length} items
                        </Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-2 pt-2">
                        {items.map((item) => (
                          <div
                            key={item.itemCode}
                            className="rounded-md border p-3"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium">
                                  {item.itemCode}
                                </p>
                                <p className="text-muted-foreground mt-0.5 text-xs">
                                  {item.title}
                                </p>
                                {item.description && (
                                  <p className="text-muted-foreground mt-1 text-xs">
                                    {item.description}
                                  </p>
                                )}
                              </div>
                              <div className="flex flex-shrink-0 gap-1">
                                <Badge
                                  variant="outline"
                                  className={
                                    item.priority === "critical"
                                      ? "border-red-200 text-red-700"
                                      : item.priority === "high"
                                        ? "border-orange-200 text-orange-700"
                                        : item.priority === "medium"
                                          ? "border-yellow-200 text-yellow-700"
                                          : "border-green-200 text-green-700"
                                  }
                                >
                                  {item.priority}
                                </Badge>
                                <Badge variant="secondary" className="text-xs">
                                  {item.frequency}
                                </Badge>
                              </div>
                            </div>
                            {item.tierApplicability &&
                              item.tierApplicability.length > 0 && (
                                <div className="mt-2 flex gap-1">
                                  {item.tierApplicability.map((tier) => (
                                    <Badge
                                      key={tier}
                                      variant="outline"
                                      className="text-[10px]"
                                    >
                                      {tier}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
