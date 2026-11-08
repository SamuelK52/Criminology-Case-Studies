import type { Role } from "@/lib/types";

// The role matrix from the brief, as in the prototype's ROLES. It only decides what the UI
// shows; the database enforces the same rules with RLS (db/migrations/0002_rls.sql).
export type Permission = "view" | "add" | "edit" | "del" | "ai" | "backup" | "manageClasses" | "manageUsers";

type RoleInfo = { name: string; colour: string; desc: string; perm: Record<Permission, boolean> };

export const ROLES: Record<Role, RoleInfo> = {
  student: {
    name: "Student",
    colour: "var(--signal)",
    desc: "Primary user · studies cases daily",
    perm: { view: true, add: true, edit: true, del: true, ai: true, backup: true, manageClasses: false, manageUsers: false },
  },
  lecturer: {
    name: "Lecturer",
    colour: "var(--cobalt)",
    desc: "Decision-maker · approves content",
    perm: { view: true, add: true, edit: true, del: false, ai: true, backup: false, manageClasses: true, manageUsers: false },
  },
  peer: {
    name: "Study group",
    colour: "var(--emerald)",
    desc: "Secondary user · reviews & quizzes",
    perm: { view: true, add: false, edit: false, del: false, ai: false, backup: false, manageClasses: false, manageUsers: false },
  },
  builder: {
    name: "Builder",
    colour: "var(--lemon)",
    desc: "You + Claude · builds and fixes",
    perm: { view: true, add: true, edit: true, del: true, ai: true, backup: true, manageClasses: true, manageUsers: true },
  },
};

/** Roles a visitor can choose at sign-up. Lecturer is a request the builder approves; Builder is never offered. */
export const SIGNUP_ROLES = ["student", "peer", "lecturer"] as const;
export type SignupRole = (typeof SIGNUP_ROLES)[number];

export const can = (role: Role | null | undefined, p: Permission) => !!role && ROLES[role].perm[p];

/** Plain-language list for the "Your access" card. */
export const PERMISSION_LABELS: Record<Permission, string> = {
  view: "Read case files",
  add: "Add your own cases, notes and resources",
  edit: "Edit cases, notes and resources",
  del: "Delete your own work",
  ai: "Use the AI tools",
  backup: "Export and import your data",
  manageClasses: "Create classes and correct cases",
  manageUsers: "Change user roles",
};
