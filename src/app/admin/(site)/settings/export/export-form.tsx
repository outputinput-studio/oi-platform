"use client";

import { useActionState } from "react";
import { requestExportAction, type ExportFormState } from "@/modules/export/actions";
import { Button, Notice } from "../../../ui";

/** "Start the download": the link goes to their email. */
export function StartExport() {
  const [state, act, pending] = useActionState<ExportFormState>(requestExportAction, {});
  return (
    <form action={act} className="space-y-3">
      <Button type="submit" disabled={pending}>
        {pending ? "One moment…" : "Start the download"}
      </Button>
      <Notice ok={state.ok} error={state.error} />
      {state.devLink && (
        <p className="text-[13px] text-muted">
          No email is set up here, so here&rsquo;s the link:{" "}
          <a href={state.devLink.replace(/^https?:\/\/[^/]+/, "")} data-testid="dev-export-link" className="break-all text-accent-text underline underline-offset-4">
            download
          </a>
        </p>
      )}
    </form>
  );
}
