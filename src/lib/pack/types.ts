export interface PackManifest {
  id: string;
  version: string;
  name: string;
  publisher: string;
  requiresFramework: string;
  dependsOn: string[];
  provides: string[];
  contentHash: string;
  signature: string;
}

export interface PackModule {
  code: string;
  name: string;
  domain: string;
  kinds: string[];
  applicability: Record<string, unknown>;
  weight: number;
}

export interface PackNode {
  code: string;
  moduleCode: string;
  name: string;
  path: string;
  depth: number;
  isLeaf: boolean;
  weight: number;
  isCritical: boolean;
  description: string;
  regulatoryRef?: string;
}

export interface PackQuestion {
  code: string;
  moduleCode: string;
  text: string;
  rbiReference?: string;
  weight: number;
  isCritical: boolean;
}

export interface PackPopulationSchema {
  moduleCode: string;
  columnMapping: Record<string, string>;
}

export interface PackFiles {
  manifest: PackManifest;
  modules: PackModule[];
  nodes: PackNode[];
  questions: PackQuestion[];
  populationSchemas: PackPopulationSchema[];
}
