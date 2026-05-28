"use client";

import * as React from "react";

export function useChartReady() {
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    setReady(true);
  }, []);

  return ready;
}

export function ChartPlaceholder({ className }: { className: string }) {
  return (
    <div className={className}>
      <div className="h-full w-full rounded-md border border-dashed border-white/10 bg-white/5" />
    </div>
  );
}

