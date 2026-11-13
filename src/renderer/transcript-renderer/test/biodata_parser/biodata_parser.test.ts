import { describe, it, expect } from "vitest";
import { buildPromise } from "../../data/promises";
import { logger } from "../../utils/logger";

// Real data URLs from the config
const GFF_URL =
  "https://data.rbrowser.org/datahub/rna_modification_sm/gencode_with_m6a.gff3.gz";
const GFF_INDEX =
  "https://data.rbrowser.org/datahub/rna_modification_sm/gencode_with_m6a.gff3.gz.tbi";
const BIGBED_URL =
  "https://data.rbrowser.org/datahub/qtls/GRCh38/bigbed/gtex_sqtls.bigBed";
const BED_URL =
  "https://data.rbrowser.org/datahub/rna_reference/Homo_sapiens/bed/LINE.bed.gz";
const BED_INDEX =
  "https://data.rbrowser.org/datahub/rna_reference/Homo_sapiens/bed/LINE.bed.gz.tbi";

// Using a known public bigwig if config doesn't have one, or check config later.
const BIGWIG_URL =
  "https://data.rbrowser.org/datahub/merip/caRNA_MeRIP-seq/Input/1..GM18499..caRNA_MeRIP_Input.bw";

// Region: chr11:66316918-66318628 (from config)
const TEST_REGION = {
  chr: "chr11",
  start: 66316918,
  end: 66318628,
};

describe("Data Fetching Integration Tests", () => {
  it("should fetch GFF data", async () => {
    try {
      const promise = buildPromise({
        url: GFF_URL,
        index: GFF_INDEX,
        method: "remote",
        format: "gff",
        region: TEST_REGION,
      });

      const data = await promise;
      expect(Array.isArray(data)).toBe(true);
    } catch (error) {
      logger.error("GFF Fetch Error:", error);
      throw error;
    }
  }, 10000); // 10s timeout

  it("should fetch BigBed data", async () => {
    try {
      const promise = buildPromise({
        url: BIGBED_URL,
        method: "remote",
        format: "bigbed",
        region: TEST_REGION,
      });

      const data = await promise;
      expect(Array.isArray(data)).toBe(true);
    } catch (error) {
      logger.error("BigBed Fetch Error:", error);
      throw error;
    }
  }, 10000); // 10s timeout

  it("should fetch BED (Tabix) data", async () => {
    try {
      const promise = buildPromise({
        url: BED_URL,
        index: BED_INDEX,
        method: "remote",
        format: "bed",
        region: TEST_REGION,
      });

      const data = await promise;
      expect(Array.isArray(data)).toBe(true);
    } catch (error) {
      logger.error("BED Fetch Error:", error);
      throw error;
    }
  }, 10000);

  it("should fetch BigWig data", async () => {
    try {
      const promise = buildPromise({
        url: BIGWIG_URL,
        method: "remote",
        format: "bigwig",
        region: TEST_REGION,
      });
      const data = await promise;
      expect(Array.isArray(data)).toBe(true);
    } catch (error) {
      logger.error("BigWig Fetch Error:", error);
      throw error;
    }
  }, 10000);
});
