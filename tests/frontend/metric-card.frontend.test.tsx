import { render, screen } from "@testing-library/react";
import { ShieldCheck } from "lucide-react";
import { describe, expect, it } from "vitest";
import { MetricCard } from "../../apps/web/src/components/dashboard/metric-card.js";

describe("MetricCard", () => {
  it("renders dashboard metric content", () => {
    render(
      <MetricCard
        label="Critical findings"
        value="3"
        detail="Requires immediate triage"
        icon={ShieldCheck}
        tone="red"
      />
    );

    expect(screen.getByText("Critical findings")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Requires immediate triage")).toBeInTheDocument();
  });
});
