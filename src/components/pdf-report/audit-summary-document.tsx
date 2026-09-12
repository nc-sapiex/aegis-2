/**
 * Audit Summary PDF Document (Phase 2 — R30)
 *
 * React-PDF component for generating professional audit summary reports.
 */

import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import { BhCertificateSection } from "./bh-certificate-section";

// Type for audit data
type AuditReportData = NonNullable<
  Awaited<ReturnType<typeof import("@/data-access/reports").getAuditReportData>>
>;

interface AuditSummaryDocumentProps {
  auditData: AuditReportData;
}

// PDF Styles
const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: "Helvetica",
  },
  header: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
    borderBottom: "2 solid #000",
    paddingBottom: 10,
  },
  section: {
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 8,
    color: "#1e3a8a",
    borderBottom: "1 solid #cbd5e1",
    paddingBottom: 4,
  },
  row: {
    flexDirection: "row",
    marginBottom: 4,
  },
  label: {
    width: "40%",
    fontWeight: "bold",
  },
  value: {
    width: "60%",
  },
  table: {
    marginTop: 10,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#e2e8f0",
    padding: 8,
    fontWeight: "bold",
    borderBottom: "1 solid #000",
  },
  tableRow: {
    flexDirection: "row",
    padding: 8,
    borderBottom: "1 solid #cbd5e1",
  },
  col1: { width: "10%" },
  col2: { width: "50%" },
  col3: { width: "20%" },
  col4: { width: "20%" },
  ratingBox: {
    marginTop: 10,
    padding: 15,
    backgroundColor: "#f0f9ff",
    border: "2 solid #3b82f6",
    borderRadius: 4,
  },
  ratingText: {
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
    color: "#1e3a8a",
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: "center",
    fontSize: 8,
    color: "#64748b",
    borderTop: "1 solid #cbd5e1",
    paddingTop: 10,
  },
});

export const AuditSummaryDocument: React.FC<AuditSummaryDocumentProps> = ({
  auditData,
}) => {
  const criticalObs =
    auditData.observations?.filter((o: any) => o.severity === "CRITICAL") || [];
  const highObs =
    auditData.observations?.filter((o: any) => o.severity === "HIGH") || [];
  const mediumObs =
    auditData.observations?.filter((o: any) => o.severity === "MEDIUM") || [];
  const lowObs =
    auditData.observations?.filter((o: any) => o.severity === "LOW") || [];

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <Text style={styles.header}>Internal Audit Report - Summary</Text>

        {/* Audit Metadata */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Audit Details</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Audit Number:</Text>
            <Text style={styles.value}>{auditData.auditNumber || "N/A"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Branch:</Text>
            <Text style={styles.value}>{auditData.branch?.name || "N/A"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Branch Code:</Text>
            <Text style={styles.value}>{auditData.branch?.code || "N/A"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>City:</Text>
            <Text style={styles.value}>{auditData.branch?.city || "N/A"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Audit Type:</Text>
            <Text style={styles.value}>{auditData.auditType || "RBIA"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Period:</Text>
            <Text style={styles.value}>
              {auditData.periodFrom
                ? new Date(auditData.periodFrom).toLocaleDateString()
                : "N/A"}{" "}
              to{" "}
              {auditData.periodTo
                ? new Date(auditData.periodTo).toLocaleDateString()
                : "N/A"}
            </Text>
          </View>
        </View>

        {/* Risk Rating */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Overall Risk Rating</Text>
          <View style={styles.ratingBox}>
            <Text style={styles.ratingText}>
              {auditData.overallRiskRating || "Not Computed"}
            </Text>
          </View>
        </View>

        {/* Executive Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Executive Summary</Text>
          <Text style={{ marginTop: 5, lineHeight: 1.5 }}>
            This audit was conducted at {auditData.branch?.name || "the branch"}{" "}
            covering the period from{" "}
            {auditData.periodFrom
              ? new Date(auditData.periodFrom).toLocaleDateString()
              : "N/A"}{" "}
            to{" "}
            {auditData.periodTo
              ? new Date(auditData.periodTo).toLocaleDateString()
              : "N/A"}
            . A total of {auditData.observations?.length || 0} observations were
            identified during the audit, comprising {criticalObs.length}{" "}
            critical, {highObs.length} high, {mediumObs.length} medium, and{" "}
            {lowObs.length} low severity findings.
          </Text>
        </View>

        {/* Severity Breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Observations by Severity</Text>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={{ width: "30%" }}>Severity</Text>
              <Text style={{ width: "20%" }}>Count</Text>
              <Text style={{ width: "50%" }}>Percentage</Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={{ width: "30%" }}>Critical</Text>
              <Text style={{ width: "20%" }}>{criticalObs.length}</Text>
              <Text style={{ width: "50%" }}>
                {auditData.observations?.length
                  ? (
                      (criticalObs.length / auditData.observations.length) *
                      100
                    ).toFixed(1)
                  : 0}
                %
              </Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={{ width: "30%" }}>High</Text>
              <Text style={{ width: "20%" }}>{highObs.length}</Text>
              <Text style={{ width: "50%" }}>
                {auditData.observations?.length
                  ? (
                      (highObs.length / auditData.observations.length) *
                      100
                    ).toFixed(1)
                  : 0}
                %
              </Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={{ width: "30%" }}>Medium</Text>
              <Text style={{ width: "20%" }}>{mediumObs.length}</Text>
              <Text style={{ width: "50%" }}>
                {auditData.observations?.length
                  ? (
                      (mediumObs.length / auditData.observations.length) *
                      100
                    ).toFixed(1)
                  : 0}
                %
              </Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={{ width: "30%" }}>Low</Text>
              <Text style={{ width: "20%" }}>{lowObs.length}</Text>
              <Text style={{ width: "50%" }}>
                {auditData.observations?.length
                  ? (
                      (lowObs.length / auditData.observations.length) *
                      100
                    ).toFixed(1)
                  : 0}
                %
              </Text>
            </View>
          </View>
        </View>

        {/* Footer */}
        <Text style={styles.footer}>
          Generated by AEGIS Audit System on {new Date().toLocaleString()}
        </Text>
      </Page>

      {/* Page 2: Key Findings */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.header}>Key Findings</Text>

        {/* Critical Findings */}
        {criticalObs.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Critical Severity Observations
            </Text>
            {criticalObs.slice(0, 5).map((obs: any, idx: number) => (
              <View key={obs.id} style={{ marginBottom: 10 }}>
                <Text style={{ fontWeight: "bold" }}>
                  {idx + 1}. {obs.title}
                </Text>
                <Text style={{ marginTop: 3, fontSize: 9 }}>
                  Condition: {obs.condition.substring(0, 200)}
                  {obs.condition.length > 200 ? "..." : ""}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* High Findings */}
        {highObs.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>High Severity Observations</Text>
            {highObs.slice(0, 3).map((obs: any, idx: number) => (
              <View key={obs.id} style={{ marginBottom: 10 }}>
                <Text style={{ fontWeight: "bold" }}>
                  {idx + 1}. {obs.title}
                </Text>
                <Text style={{ marginTop: 3, fontSize: 9 }}>
                  Condition: {obs.condition.substring(0, 150)}
                  {obs.condition.length > 150 ? "..." : ""}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* BH Certificate Section */}
        <BhCertificateSection
          branchName={auditData.branch?.name || "N/A"}
          auditPeriod={
            auditData.periodFrom && auditData.periodTo
              ? `${new Date(auditData.periodFrom).toLocaleDateString()} to ${new Date(auditData.periodTo).toLocaleDateString()}`
              : "N/A"
          }
          signedBy={auditData.bhCertSignedByName}
          signedAt={auditData.bhCertSignedAt}
          comments={auditData.bhCertComments}
          countersignedBy={auditData.bhCertCountersignedByName}
          countersignedAt={auditData.bhCertCountersignedAt}
        />

        <Text style={styles.footer}>
          Generated by AEGIS Audit System on {new Date().toLocaleString()} |
          Page 2 of 2
        </Text>
      </Page>
    </Document>
  );
};
