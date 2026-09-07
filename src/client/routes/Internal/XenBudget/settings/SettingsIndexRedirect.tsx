import { Navigate, useParams } from "react-router-dom";
import { loadSection } from "../components/sectionStorage";

/**
 * Bare /settings sends you to the section you were last on rather than always General.
 *
 * `replace` matters: without it the redirect becomes a history entry, and pressing Back
 * from a section bounces through /settings straight back into the same section.
 */
export default function SettingsIndexRedirect() {
    const { bookId = "" } = useParams();
    return <Navigate to={loadSection(bookId)} replace />;
}
