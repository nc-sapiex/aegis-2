"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Building2,
  Shield,
  Save,
  Loader2,
  CalendarRange,
  Info,
} from "@/lib/icons";
import { updateTenantSettings } from "@/actions/settings";
import { toast } from "sonner";
import type { TenantSettings } from "@/data-access";

interface BankProfileFormProps {
  settings: TenantSettings;
}

/**
 * Bank profile form with read-only and editable sections.
 *
 * Sections:
 * 1. Bank Identity — read-only after onboarding (DE11)
 * 2. Contact Information — editable
 * 3. Regulatory Information — read-only display (DE8, D21)
 * 4. Financial Year — hardcoded April-March (DE7)
 */
export function BankProfileForm({ settings }: BankProfileFormProps) {
  const [isPending, startTransition] = useTransition();

  // Editable fields state
  const [shortName, setShortName] = useState(settings.shortName);
  const [address, setAddress] = useState(settings.address ?? "");
  const [city, setCity] = useState(settings.city);
  const [pincode, setPincode] = useState(settings.pincode ?? "");
  const [phone, setPhone] = useState(settings.phone ?? "");
  const [email, setEmail] = useState(settings.email ?? "");
  const [website, setWebsite] = useState(settings.website ?? "");

  // Determine current quarter
  const currentMonth = new Date().getMonth(); // 0-indexed
  const currentQuarter =
    currentMonth >= 3 && currentMonth <= 5
      ? "Q1 (Apr-Jun)"
      : currentMonth >= 6 && currentMonth <= 8
        ? "Q2 (Jul-Sep)"
        : currentMonth >= 9 && currentMonth <= 11
          ? "Q3 (Oct-Dec)"
          : "Q4 (Jan-Mar)";

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      const result = await updateTenantSettings({
        shortName,
        address: address || null,
        city,
        pincode: pincode || null,
        phone: phone || null,
        email: email || null,
        website: website || null,
      });
      if (result.success) {
        toast.success("Bank profile has been updated successfully.");
      } else {
        toast.error(result.error ?? "Failed to save settings.");
      }
    });
  }

  // Format PCA status
  const pcaDisplay =
    settings.pcaStatus === "NONE" ? "Not under PCA" : settings.pcaStatus;

  // Format date helper
  function formatDateDisplay(date: Date | null): string {
    if (!date) return "Not recorded";
    return new Date(date).toLocaleDateString("en-IN", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Section 1: Bank Identity (read-only after onboarding, DE11) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4" />
            Bank Identity
            <Badge variant="secondary" className="ml-2 text-xs">
              Read-only
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-muted-foreground text-sm">
                Legal Bank Name
              </Label>
              <Input value={settings.name} disabled className="bg-muted" />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground text-sm">
                RBI License Number
              </Label>
              <Input
                value={settings.rbiLicenseNo}
                disabled
                className="bg-muted font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground text-sm">
                State of Registration
              </Label>
              <Input value={settings.state} disabled className="bg-muted" />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground text-sm">UCB Tier</Label>
              <Input
                value={settings.tier.replace("_", " ")}
                disabled
                className="bg-muted"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground text-sm">
                Incorporation Date
              </Label>
              <Input
                value={
                  settings.incorporationDate
                    ? formatDateDisplay(settings.incorporationDate)
                    : "Not available"
                }
                disabled
                className="bg-muted"
              />
            </div>
          </div>
          <p className="text-muted-foreground mt-3 flex items-center gap-1 text-xs">
            <Info className="h-3 w-3" />
            These fields are set during onboarding and cannot be modified.
          </p>
        </CardContent>
      </Card>

      {/* Section 2: Contact Information (editable) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4" />
            Contact Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="shortName">Short Name / Display Name</Label>
              <Input
                id="shortName"
                value={shortName}
                onChange={(e) => setShortName(e.target.value)}
                placeholder="e.g., Apex Bank"
                maxLength={50}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="City name"
                maxLength={100}
                required
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Street address"
                maxLength={500}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pincode">Pincode</Label>
              <Input
                id="pincode"
                value={pincode}
                onChange={(e) => setPincode(e.target.value)}
                placeholder="6-digit pincode"
                maxLength={6}
                pattern="[0-9]{6}"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 1234567890"
                maxLength={20}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contact@bank.com"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://www.bank.com"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Section 3: Regulatory Information (read-only display, DE8, D21) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4" />
            Regulatory Information
            <Badge variant="secondary" className="ml-2 text-xs">
              Read-only
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1">
              <p className="text-muted-foreground text-sm">
                RBI Supervisory Rating
              </p>
              <p className="text-base font-medium">
                {settings.rbiRiskRating ?? "Not yet assessed"}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-muted-foreground text-sm">PCA Status</p>
              <Badge
                variant={
                  settings.pcaStatus === "NONE" ? "secondary" : "destructive"
                }
              >
                {pcaDisplay}
              </Badge>
              {settings.pcaEffectiveDate && (
                <p className="text-muted-foreground text-xs">
                  effective {formatDateDisplay(settings.pcaEffectiveDate)}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <p className="text-muted-foreground text-sm">Scheduled Bank</p>
              <Badge
                variant={settings.scheduledBankStatus ? "default" : "secondary"}
              >
                {settings.scheduledBankStatus ? "Yes" : "No"}
              </Badge>
            </div>
            <div className="space-y-1">
              <p className="text-muted-foreground text-sm">
                Last RBI Inspection
              </p>
              <p className="text-base">
                {formatDateDisplay(settings.lastRbiInspectionDate)}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-muted-foreground text-sm">
                Multi-State License
              </p>
              <Badge
                variant={settings.multiStateLicense ? "default" : "secondary"}
              >
                {settings.multiStateLicense ? "Yes" : "No"}
              </Badge>
            </div>
          </div>
          <p className="text-muted-foreground mt-3 flex items-center gap-1 text-xs">
            <Info className="h-3 w-3" />
            Regulatory fields are updated following RBI inspection results.
          </p>
        </CardContent>
      </Card>

      {/* Section 4: Financial Year (hardcoded April-March, DE7) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarRange className="h-4 w-4" />
            Financial Year
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <p className="text-muted-foreground text-sm">Fiscal Year</p>
              <p className="text-base font-medium">April - March</p>
              <p className="text-muted-foreground text-xs">
                Standard Indian financial year (not configurable)
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-muted-foreground text-sm">Current Quarter</p>
              <Badge variant="outline">{currentQuarter}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Submit button */}
      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          {isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save Changes
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
