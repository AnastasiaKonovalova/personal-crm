"use client";

import { useEffect, useState } from "react";
import { CloseButton } from "@/components/close-button";

const VISIBLE_MS = 3000;

// Shown on the list after a delete (?deleted=1). The flag is dropped from the address right away
// without a server round trip, so the message stays now and a reload does not bring it back
export function DeletedToast() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("deleted");
    window.history.replaceState(null, "", url);
    const timer = setTimeout(() => setVisible(false), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <div
      role="status"
      className="fixed bottom-heading left-1/2 z-50 inline-flex -translate-x-1/2 items-center gap-cta rounded-pill border border-line bg-surface py-[5px] pr-[5px] pl-5 text-button font-semibold whitespace-nowrap text-ink before:size-[7px] before:rounded-round before:bg-teal before:content-['']"
    >
      Контакт удалён
      <CloseButton onClick={() => setVisible(false)} />
    </div>
  );
}
