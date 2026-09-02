import { describe, expect, it } from "vitest";

import {
  assertOnlyInitialFixtureNavigation,
  unexpectedApplicationRequests,
  type RequestEvidence
} from "./request-policy";

const fixtureUrl = "http://127.0.0.1:4173/chatgpt-composer.html";
const initialNavigation: RequestEvidence = {
  url: fixtureUrl,
  method: "GET",
  resourceType: "document",
  isNavigationRequest: true
};

describe("privacy request policy", () => {
  it("allows exactly the initial GET document navigation", () => {
    expect(unexpectedApplicationRequests([initialNavigation], fixtureUrl)).toEqual([]);
    expect(() => assertOnlyInitialFixtureNavigation([initialNavigation], fixtureUrl)).not.toThrow();
  });

  it("negative control makes a later same-URL POST fail the real assertion", () => {
    const laterPost: RequestEvidence = {
      url: fixtureUrl,
      method: "POST",
      resourceType: "fetch",
      isNavigationRequest: false
    };
    const evidence = [initialNavigation, laterPost];

    expect(unexpectedApplicationRequests(evidence, fixtureUrl)).toEqual([laterPost]);
    expect(() => assertOnlyInitialFixtureNavigation(evidence, fixtureUrl)).toThrow(
      /Unexpected application request/u
    );
  });

  it("negative control makes empty request evidence fail the real assertion", () => {
    expect(() => assertOnlyInitialFixtureNavigation([], fixtureUrl)).toThrow(
      /Missing initial fixture navigation evidence/u
    );
  });
});
