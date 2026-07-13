import { buildQuoteBackedReportFallback } from "./project-report.ts";

const assert = (condition: unknown, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

const assertEquals = (actual: unknown, expected: unknown, message: string) => {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}`);
  }
};

const combinedText = (sections: ReturnType<typeof buildQuoteBackedReportFallback>) =>
  [
    ...sections.findings.map((finding) => `${finding.title} ${finding.summary}`),
    ...sections.themes.map((theme) => `${theme.title} ${theme.description}`),
    ...sections.recommendations.map((recommendation) => `${recommendation.title} ${recommendation.description}`),
  ].join(" ");

Deno.test("quote-backed report fallback stays empty without quotes", () => {
  const fallback = buildQuoteBackedReportFallback({
    quoteCatalog: [],
    questionRefSet: new Set(["question-1"]),
    sessionRefSet: new Set(["session-1"]),
  });

  assertEquals(fallback.findings.length, 0, "No quote should produce no fallback findings");
  assertEquals(fallback.themes.length, 0, "No quote should produce no fallback themes");
  assertEquals(fallback.recommendations.length, 0, "No quote should produce no fallback recommendations");
});

Deno.test("quote-backed report fallback creates directional sections from one quote", () => {
  const fallback = buildQuoteBackedReportFallback({
    quoteCatalog: [{
      quoteId: "quote-1",
      questionRef: "question-1",
      sessionRef: "session-1",
      section: "Onboarding",
    }],
    questionRefSet: new Set(["question-1"]),
    sessionRefSet: new Set(["session-1"]),
  });

  assertEquals(fallback.findings.length, 1, "One quote should produce one fallback finding");
  assertEquals(fallback.themes.length, 1, "One quote should produce one fallback theme");
  assertEquals(fallback.recommendations.length, 1, "One quote should produce one fallback recommendation");
  assertEquals(fallback.findings[0].quoteIds[0], "quote-1", "Fallback finding should reference the quote");
  assertEquals(fallback.themes[0].quoteIds[0], "quote-1", "Fallback theme should reference the quote");
  assertEquals(fallback.recommendations[0].quoteIds[0], "quote-1", "Fallback recommendation should reference the quote");

  const text = combinedText(fallback).toLocaleLowerCase("tr-TR");
  assert(!text.includes("yeterli"), "Fallback text should not mention sufficiency");
  assert(!text.includes("örneklem yetersiz"), "Fallback text should not mention insufficient sample");
  assert(!text.includes("sonuç yok"), "Fallback text should not say there are no results");
});
