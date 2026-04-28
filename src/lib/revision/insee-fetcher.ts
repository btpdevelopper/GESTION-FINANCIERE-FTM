import { XMLParser } from "fast-xml-parser";

const INSEE_BASE = "https://bdm.insee.fr/series/sdmx/data/SERIES_BDM";

export type InseeObservation = {
  period: string; // "YYYY-MM"
  value: number;
};

/**
 * Fetches a single observation from the INSEE BDM open-data API (no auth required).
 *
 * Returns null when:
 *  - The HTTP request fails
 *  - The index is not yet published for the requested period (3-month publication delay)
 *  - The XML response cannot be parsed
 */
export async function fetchInseeIndex(
  idbank: string,
  period: string // "YYYY-MM"
): Promise<InseeObservation | null> {
  const url = `${INSEE_BASE}/${idbank}?startPeriod=${period}&endPeriod=${period}`;

  let xml: string;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/xml" },
      // Never cache — indices are published once and then final; we need the live value
      cache: "no-store",
    });
    if (!res.ok) return null;
    xml = await res.text();
  } catch {
    return null;
  }

  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      // Preserve array structure even for single-child elements
      isArray: (name) => name === "generic:Obs",
    });
    const doc = parser.parse(xml);

    // Path: message:GenericData → message:DataSet → generic:Series → generic:Obs[]
    const dataset =
      doc?.["message:GenericData"]?.["message:DataSet"] ??
      doc?.["GenericData"]?.["DataSet"];

    const series = dataset?.["generic:Series"] ?? dataset?.["Series"];
    const obsArray: unknown[] = series?.["generic:Obs"] ?? series?.["Obs"] ?? [];

    if (!Array.isArray(obsArray) || obsArray.length === 0) return null;

    const obs = obsArray[0] as Record<string, Record<string, string>>;
    const periodVal: string =
      obs["generic:ObsDimension"]?.["@_value"] ?? obs["ObsDimension"]?.["@_value"];
    const rawValue: string =
      obs["generic:ObsValue"]?.["@_value"] ?? obs["ObsValue"]?.["@_value"];

    if (!periodVal || !rawValue) return null;

    const value = parseFloat(rawValue);
    if (isNaN(value)) return null;

    return { period: periodVal, value };
  } catch {
    return null;
  }
}
