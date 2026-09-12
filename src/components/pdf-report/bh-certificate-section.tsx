/**
 * BH Certificate Section for PDF Report (R26)
 *
 * Renders the Branch Head Certificate with signature details in the PDF report.
 */

import React from "react";
import { View, Text, StyleSheet } from "@react-pdf/renderer";

interface BhCertificateSectionProps {
  branchName: string;
  auditPeriod: string;
  signedBy: string | null;
  signedAt: Date | null;
  comments: string | null;
  countersignedBy: string | null;
  countersignedAt: Date | null;
}

const styles = StyleSheet.create({
  section: {
    marginTop: 20,
    marginBottom: 20,
  },
  title: {
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 12,
    color: "#1e3a8a",
    borderBottom: "2 solid #1e3a8a",
    paddingBottom: 6,
  },
  declarationBox: {
    padding: 12,
    backgroundColor: "#f8fafc",
    border: "1 solid #cbd5e1",
    borderRadius: 4,
    marginBottom: 12,
  },
  declarationText: {
    fontSize: 9,
    lineHeight: 1.5,
    color: "#334155",
  },
  signatureBlock: {
    marginTop: 16,
    padding: 12,
    backgroundColor: "#f0f9ff",
    border: "1 solid #3b82f6",
    borderRadius: 4,
  },
  signatureLine: {
    borderBottom: "1 solid #000",
    width: "60%",
    marginTop: 20,
    marginBottom: 4,
  },
  signatureLabel: {
    fontSize: 8,
    color: "#64748b",
    marginTop: 2,
  },
  signatureDetails: {
    fontSize: 9,
    marginTop: 8,
  },
  commentsBox: {
    marginTop: 10,
    padding: 10,
    backgroundColor: "#fffbeb",
    border: "1 solid #fbbf24",
    borderRadius: 4,
  },
  commentsLabel: {
    fontSize: 9,
    fontWeight: "bold",
    marginBottom: 4,
    color: "#92400e",
  },
  commentsText: {
    fontSize: 9,
    lineHeight: 1.4,
    color: "#451a03",
  },
  countersignBlock: {
    marginTop: 12,
    padding: 12,
    backgroundColor: "#ecfdf5",
    border: "1 solid #10b981",
    borderRadius: 4,
  },
  pendingText: {
    fontSize: 10,
    color: "#64748b",
    fontStyle: "italic",
    marginTop: 8,
  },
  row: {
    flexDirection: "row",
    marginBottom: 4,
  },
  label: {
    fontSize: 9,
    fontWeight: "bold",
    width: "30%",
  },
  value: {
    fontSize: 9,
    width: "70%",
  },
});

const DECLARATION_TEXT = `I, the undersigned Branch Head, hereby certify that I have reviewed the audit observations listed in this report. The information provided herein is true and correct to the best of my knowledge. I acknowledge the findings and commit to implementing the remedial actions as agreed.`;

export const BhCertificateSection: React.FC<BhCertificateSectionProps> = ({
  branchName,
  auditPeriod,
  signedBy,
  signedAt,
  comments,
  countersignedBy,
  countersignedAt,
}) => {
  return (
    <View style={styles.section}>
      <Text style={styles.title}>BRANCH HEAD CERTIFICATE</Text>

      {/* Branch & Period Info */}
      <View style={styles.row}>
        <Text style={styles.label}>Branch:</Text>
        <Text style={styles.value}>{branchName}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Audit Period:</Text>
        <Text style={styles.value}>{auditPeriod}</Text>
      </View>

      {/* Declaration Text */}
      <View style={styles.declarationBox}>
        <Text style={styles.declarationText}>{DECLARATION_TEXT}</Text>
      </View>

      {/* Signature Block */}
      {signedBy && signedAt ? (
        <View style={styles.signatureBlock}>
          <View style={styles.row}>
            <Text style={styles.label}>Signed By:</Text>
            <Text style={styles.value}>{signedBy}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Date & Time:</Text>
            <Text style={styles.value}>
              {new Date(signedAt).toLocaleString("en-IN", {
                dateStyle: "full",
                timeStyle: "short",
              })}
            </Text>
          </View>

          {/* Signature Line */}
          <View style={styles.signatureLine} />
          <Text style={styles.signatureLabel}>Digital Signature</Text>

          {/* Comments */}
          {comments && (
            <View style={styles.commentsBox}>
              <Text style={styles.commentsLabel}>Branch Head Comments:</Text>
              <Text style={styles.commentsText}>{comments}</Text>
            </View>
          )}
        </View>
      ) : (
        <Text style={styles.pendingText}>Certificate pending signature</Text>
      )}

      {/* Countersignature Block */}
      {countersignedBy && countersignedAt && (
        <View style={styles.countersignBlock}>
          <Text style={{ fontSize: 10, fontWeight: "bold", marginBottom: 6 }}>
            Lead Auditor Countersignature
          </Text>
          <View style={styles.row}>
            <Text style={styles.label}>Countersigned By:</Text>
            <Text style={styles.value}>{countersignedBy}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Date & Time:</Text>
            <Text style={styles.value}>
              {new Date(countersignedAt).toLocaleString("en-IN", {
                dateStyle: "full",
                timeStyle: "short",
              })}
            </Text>
          </View>

          {/* Signature Line */}
          <View style={styles.signatureLine} />
          <Text style={styles.signatureLabel}>Digital Signature</Text>
        </View>
      )}
    </View>
  );
};
