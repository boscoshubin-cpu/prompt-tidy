export interface RequestEvidence {
  url: string;
  method: string;
  resourceType: string;
  isNavigationRequest: boolean;
}

function isApplicationNetworkUrl(url: string): boolean {
  return /^(?:https?|wss?):\/\//u.test(url);
}

export function unexpectedApplicationRequests(
  requests: readonly RequestEvidence[],
  fixtureUrl: string
): RequestEvidence[] {
  const applicationRequests = requests.filter(({ url }) => isApplicationNetworkUrl(url));
  const [initialRequest, ...laterRequests] = applicationRequests;
  if (!initialRequest) return [];

  const isAllowedInitialNavigation = initialRequest.url === fixtureUrl
    && initialRequest.method === "GET"
    && initialRequest.resourceType === "document"
    && initialRequest.isNavigationRequest;

  return isAllowedInitialNavigation ? laterRequests : applicationRequests;
}

export function assertOnlyInitialFixtureNavigation(
  requests: readonly RequestEvidence[],
  fixtureUrl: string
): void {
  const unexpected = unexpectedApplicationRequests(requests, fixtureUrl);
  if (unexpected.length > 0) {
    throw new Error(`Unexpected application request(s): ${JSON.stringify(unexpected)}`);
  }
}
