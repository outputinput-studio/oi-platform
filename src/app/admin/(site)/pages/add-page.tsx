"use client";

import { useState } from "react";
import { Button, Sheet } from "../../ui";
import { NewPageForm } from "./new-page-form";

/** "Add page" in the header opens a sheet with the title and address. */
export function AddPage({ suggestHome }: { suggestHome: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        Add page
      </Button>
      {open && (
        <Sheet title="Add a page" onClose={() => setOpen(false)}>
          <NewPageForm suggestHome={suggestHome} />
        </Sheet>
      )}
    </>
  );
}
