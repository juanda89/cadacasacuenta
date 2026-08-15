import { redirect } from "next/navigation";

// El listado dejó de ser público (2026-08-15): vive en el portal, tras login.
export default function CasosRedirige() {
  redirect("/portal/registro");
}
