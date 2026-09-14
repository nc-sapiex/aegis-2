/**
 * build-core-pack.ts
 * ---------------------------------------------------------------------------
 * Assembles packs/core/{modules,nodes,questions}.yaml from content this repo
 * already has: the 39-area / 568-statement IA Format checklist
 * (src/data/seed/examination-{areas,items}.json) plus the housing-loans
 * module (NODES from seed-rbia-housing.ts, HOUSING_LOAN_QUESTIONS from
 * seed-exam-questions.ts). Regenerate with `pnpm build-core-pack` whenever
 * that source content changes — do not hand-edit the generated YAML files.
 *
 * Usage: pnpm build-core-pack
 * ---------------------------------------------------------------------------
 */
import { readFile, writeFile } from "node:fs/promises";
import { stringify as toYaml, parse as parseYaml } from "yaml";
import { NODES as HOUSING_NODES } from "./seed-rbia-housing.js";
import { HOUSING_LOAN_QUESTIONS } from "./seed-exam-questions.js";
import type { PackModule, PackNode, PackQuestion } from "../src/lib/pack/types";

// Same heuristic as scripts/backfill/module-native.ts's guessDomain, kept
// standalone here rather than imported: that script's main() runs at import
// time against a live database, unsafe to pull into a build-time generator.
function guessDomain(code: string): string {
  const upper = code.toUpperCase();
  if (
    upper.includes("CRD") ||
    upper.includes("CREDIT") ||
    upper.includes("LOAN")
  )
    return "CREDIT";
  if (upper.includes("DEP")) return "DEPOSITS";
  if (upper.includes("FX") || upper.includes("FOREX")) return "FOREX";
  if (upper.includes("CASH")) return "CASH";
  if (upper.includes("KYC")) return "KYC";
  return "OTHER";
}

interface ExaminationArea {
  code: string;
  name: string;
  displayOrder: number;
  sectionNumber: number;
  itemCount: number;
}

interface ExaminationItem {
  areaCode: string; // matches ExaminationArea.sectionNumber, NOT .code — confirmed by reading both files
  areaName: string;
  itemNumber: string;
  particulars: string;
  riskCategory: string | null;
  regulatoryReference: string | null;
  displayOrder: number;
}

async function buildIaFormatContent(): Promise<{
  modules: PackModule[];
  nodes: PackNode[];
}> {
  const areas: ExaminationArea[] = JSON.parse(
    await readFile("src/data/seed/examination-areas.json", "utf8"),
  );
  const items: ExaminationItem[] = JSON.parse(
    await readFile("src/data/seed/examination-items.json", "utf8"),
  );

  const modules: PackModule[] = areas.map((area) => ({
    code: area.code,
    name: area.name,
    domain: guessDomain(area.code),
    kinds: ["CHECKLIST"],
    applicability: {},
    // No per-area weighting signal in the source data (spec §13: content
    // backlog). Uniform 1.0 until a real weighting scheme lands.
    weight: 1.0,
  }));

  const areaBySectionNumber = new Map(
    areas.map((a) => [String(a.sectionNumber), a]),
  );
  const nodes: PackNode[] = items.map((item) => {
    const area = areaBySectionNumber.get(item.areaCode);
    if (!area) {
      throw new Error(
        `examination-items.json references unknown areaCode "${item.areaCode}"`,
      );
    }
    // item.itemNumber is not unique within an area (real data has 3
    // collisions across the 568 statements); item.displayOrder is globally
    // unique across all items, so it's the safe disambiguator.
    const code = `${area.code}-${item.displayOrder}`;
    return {
      code,
      moduleCode: area.code,
      name: item.particulars.slice(0, 80),
      path: `${area.code}/${code}`,
      depth: 1,
      isLeaf: true,
      weight: 1.0, // no per-item weighting signal in the source data
      isCritical: false,
      description: item.particulars,
      regulatoryRef: item.regulatoryReference ?? undefined,
    };
  });

  return { modules, nodes };
}

function buildHousingLoanContent(): {
  modules: PackModule[];
  nodes: PackNode[];
  questions: PackQuestion[];
} {
  // depth 0 ("CRD") is an umbrella spanning multiple credit modules, not a
  // module itself (module-native.ts's own convention: depth 1 = module).
  // depth 1 ("CRD-HLN") is the Housing Loans module.
  const moduleNode = HOUSING_NODES.find((n) => n.depth === 1);
  if (!moduleNode) throw new Error("No depth-1 (module) node found in NODES");

  const modules: PackModule[] = [
    {
      code: moduleNode.code,
      name: moduleNode.name,
      domain: guessDomain(moduleNode.code),
      kinds: ["CHECKLIST"],
      applicability: {},
      weight: moduleNode.weight,
    },
  ];

  // Pack node paths are module-relative (spec's own example-forex pack uses
  // "FX/FX-01", not "ROOT/FX/FX-01") — so paths here start at the depth-1
  // module node, dropping the depth-0 "CRD" ancestor the live app's
  // ExaminationNode tree carries but the pack format has no place for.
  const byCode = new Map(HOUSING_NODES.map((n) => [n.code, n]));
  function moduleRelativePath(code: string): string {
    const chain: string[] = [];
    let current: string | null = code;
    while (current) {
      const node = byCode.get(current);
      if (!node || node.depth === 0) break;
      chain.unshift(node.code);
      current = node.parentCode;
    }
    return chain.join("/");
  }

  const nodes: PackNode[] = HOUSING_NODES.filter((n) => n.depth >= 1).map(
    (n) => ({
      code: n.code,
      moduleCode: moduleNode.code,
      name: n.name,
      path: moduleRelativePath(n.code),
      depth: n.depth,
      isLeaf: n.isLeaf,
      weight: n.weight,
      isCritical: n.isCritical,
      description: n.description ?? n.name,
      regulatoryRef: n.regulatoryRef ?? undefined,
    }),
  );

  // q.displayOrder resets per checklist category (1-5, then 1-4, ...) — it's
  // a display grouping, not a unique key (the real unique key is
  // tenantId_moduleId_text, per seed-exam-questions.ts). Array position is
  // globally unique per module and stable across regenerations.
  const questions: PackQuestion[] = HOUSING_LOAN_QUESTIONS.map((q, i) => ({
    code: `${q.moduleCode}-Q${i + 1}`,
    moduleCode: q.moduleCode,
    text: q.text,
    rbiReference: q.rbiReference ?? undefined,
    weight: q.weight,
    isCritical: q.isCritical,
  }));

  return { modules, nodes, questions };
}

async function reconcileManifestProvides(moduleCodes: string[]): Promise<void> {
  const manifestPath = "packs/core/manifest.yaml";
  const manifest = parseYaml(await readFile(manifestPath, "utf8")) as {
    provides: string[];
    [key: string]: unknown;
  };
  const sortedGenerated = [...moduleCodes].sort();
  const sortedExisting = [...(manifest.provides ?? [])].sort();

  if (manifest.provides && manifest.provides.length > 0) {
    const drifted =
      sortedExisting.length !== sortedGenerated.length ||
      sortedExisting.some((c, i) => c !== sortedGenerated[i]);
    if (drifted) {
      throw new Error(
        `packs/core/manifest.yaml's provides has drifted from the generated modules.\n` +
          `  manifest.yaml provides: ${JSON.stringify(sortedExisting)}\n` +
          `  generated module codes: ${JSON.stringify(sortedGenerated)}\n` +
          `Update manifest.yaml's provides by hand if this is intentional.`,
      );
    }
    return;
  }

  manifest.provides = sortedGenerated;
  await writeFile(manifestPath, toYaml(manifest));
  console.log(
    `  Filled in manifest.yaml's provides (${sortedGenerated.length} modules).`,
  );
}

async function main() {
  console.log(
    "Reading IA Format checklist (examination-areas.json, examination-items.json)...",
  );
  const iaFormat = await buildIaFormatContent();
  console.log(
    `  ${iaFormat.modules.length} areas, ${iaFormat.nodes.length} statements.`,
  );

  console.log(
    "Reading housing-loans module (NODES, HOUSING_LOAN_QUESTIONS)...",
  );
  const housing = buildHousingLoanContent();
  console.log(
    `  ${housing.modules.length} module, ${housing.nodes.length} nodes, ${housing.questions.length} questions.`,
  );

  const modules = [...iaFormat.modules, ...housing.modules];
  const nodes = [...iaFormat.nodes, ...housing.nodes];
  const questions = housing.questions;

  await writeFile("packs/core/modules.yaml", toYaml(modules));
  await writeFile("packs/core/nodes.yaml", toYaml(nodes));
  await writeFile("packs/core/questions.yaml", toYaml(questions));
  console.log(`\nWrote packs/core/{modules,nodes,questions}.yaml.`);

  await reconcileManifestProvides(modules.map((m) => m.code));
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
