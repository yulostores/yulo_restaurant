import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// No vitest globals, so Testing Library can't register its own auto-cleanup.
afterEach(() => cleanup());
