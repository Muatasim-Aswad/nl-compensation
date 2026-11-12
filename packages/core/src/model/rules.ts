export interface RuleSource {
  readonly title: string;
  readonly url: string;
  readonly publicationDate?: string;
  readonly effectiveFrom: string;
  readonly effectiveTo?: string;
  readonly checkedAt: string;
  readonly contentHash: string;
}

export interface RuleDefinition<T> {
  readonly schemaVersion: "1";
  readonly id: string;
  readonly legalFrom: string;
  readonly legalTo?: string;
  readonly effectiveFrom: string;
  readonly effectiveTo?: string;
  readonly publishedAt?: string;
  readonly verifiedAt: string;
  readonly sources: readonly RuleSource[];
  readonly contentHash: string;
  readonly parameters: T;
}

export interface RuleSelection {
  readonly bundleId: string;
  readonly bundleContentHash: string;
  readonly ruleIds: readonly string[];
  readonly ruleContentHashes: Readonly<Record<string, string>>;
}
