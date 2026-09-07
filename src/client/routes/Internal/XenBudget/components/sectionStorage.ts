// Which Settings section a book was last left on.
//
// Settings has seven sections behind one tab. Landing on "General" every time means
// re-navigating on every visit when the one you actually maintain is, say, Tagging.
// Mirrors periodStorage: one key per book, validated on read.

import { SETTINGS_SECTIONS } from "../navigation";

const key = (bookId: string) => `xenbudget_settings_section_${bookId}`;

const DEFAULT_SECTION = SETTINGS_SECTIONS[0].path;

/**
 * The stored section for a book, or the first one. Validated against the current list, so
 * a section that has since been renamed or removed falls back instead of routing nowhere.
 */
export function loadSection(bookId: string): string {
    try {
        const stored = localStorage.getItem(key(bookId));
        if (stored && SETTINGS_SECTIONS.some((s) => s.path === stored)) return stored;
    } catch {
        // Private mode, or storage disabled — fall through to the default.
    }
    return DEFAULT_SECTION;
}

export function saveSection(bookId: string, path: string): void {
    try {
        localStorage.setItem(key(bookId), path);
    } catch {
        // Nothing to do if the write fails; the section still applies for this visit.
    }
}
