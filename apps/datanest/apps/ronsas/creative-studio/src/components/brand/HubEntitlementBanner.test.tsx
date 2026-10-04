import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HubEntitlementBanner } from "./HubEntitlementBanner";

describe("HubEntitlementBanner — sovereign local contract", () => {
  it("renders no hosted entitlement UI", () => {
    const { container } = render(<HubEntitlementBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("does not require hosted retry, admin, or cloud diagnostics controls", () => {
    const { queryByRole } = render(<HubEntitlementBanner />);
    expect(queryByRole("alert")).toBeNull();
    expect(queryByRole("button")).toBeNull();
  });
});
